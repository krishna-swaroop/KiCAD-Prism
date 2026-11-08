"""Simulation runs: submit gating, the sim_run handler's staging and relay, settling, and run routes."""

from __future__ import annotations

import hashlib
import json
import shutil
import stat
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.api import sim_studio as sim_api
from app.core.config import settings
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from app.sim_studio import board_source, runs as runs_module
from app.sim_studio.run_store import RunStore
from app.sim_studio.service import SimStudioService
from app.sim_studio.store import SetupStore
from app.services.design_bundle.manifest import Readiness
from app.services.job_runtime import JobCancelled
from support.postgres import requires_scratch_postgres, scratch_schema, seed_project, seed_repository
from test_sim_studio_api import PROJECT, SETUPS, _app, _visible
from test_sim_studio_setup import facts, single_net_setup
from support.asgi import request as _request

FAKE_WORKER = """#!/bin/sh
[ "$1" = engines ] && { echo '[{"schema":"prism.sim.engine","id":"dc-drop-synthetic","analyses":["dc-drop"]}]'; exit 0; }
dir=$(dirname "$2")
mkdir -p "$dir/out"
printf '{"values":[3.3]}' > "$dir/out/voltage_v.operation-values.json"
cat > "$dir/out/result.json" <<'JSON'
{"schema":"prism.sim.result","version":"a0","status":"succeeded","summary":{"kind":"dc-drop","loads":[],"sources":[],"probes":[]},
 "artifacts":[{"kind":"operation-values","path":"out/voltage_v.operation-values.json","media_type":"application/json","sha256":"x","quantity":"voltage_v"}]}
JSON
echo '{"event":"stage","stage":"solve"}'
echo '{"event":"progress","fraction":0.5,"message":"half"}'
echo '{"event":"completed","result_path":"out/result.json"}'
"""


class FakeContext:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.job_id = "job-1"
        self.updates: list[dict] = []

    def progress(self, **fields) -> None:
        self.updates.append(fields)

    def check_cancelled(self) -> None:
        pass


def _script(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


@requires_scratch_postgres("Simulation run tests")
class RunPipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = scratch_schema(self, "sim_runs", ledgers=(WORKSPACE_LEDGER,))
        seed_repository(scratch.conn, "repo_sim")
        seed_project(scratch.conn, PROJECT.id, "repo_sim")
        scratch.conn.commit()
        self.tmp = Path(tempfile.mkdtemp())
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        _script(bin_dir / "sim-worker", FAKE_WORKER)
        self.pack = b"PACK"

        def stage_board(run, inputs, log):
            (inputs / "board.kmpack").write_bytes(self.pack)
            return {"path": "input/board.kmpack", "sha256": hashlib.sha256(self.pack).hexdigest(), "commit": "c0ffee"}

        self.setups = SetupStore(scratch.connection)
        self.runs = RunStore(scratch.connection)
        self.service = SimStudioService(self.setups, facts=lambda project, commit: facts(), runs=self.runs)
        queued = mock.MagicMock(return_value={"job_id": "job-1"})
        self.board = board_source.BoardState("ready", cross_check="passed")

        for patcher in (
            mock.patch.object(settings, "PRISM_SIM_STUDIO_ENABLED", True),
            mock.patch.object(settings, "PRISM_SIM_BIN_DIR", str(bin_dir)),
            mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp / "projects")),
            mock.patch.object(runs_module, "SIM_RUN", SimpleNamespace(enqueue=queued)),
            mock.patch("app.sim_studio.board_source.board_state", lambda *a, **k: self.board),
            mock.patch("app.sim_studio.board_source.stage_board", stage_board),
            mock.patch("app.sim_studio.board_source.materialization", return_value=self.pack),
            mock.patch.object(sim_api, "sim_studio", self.service),
            mock.patch.object(sim_api, "get_project_for_role_or_404", _visible),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.enqueue = queued

    def _setup(self, document: dict) -> dict:
        row = self.setups.create(project_id=PROJECT.id, kind="dc-drop", name=document["name"], source_commit=None,
                                 project_path="board.kicad_pro", document=document, created_by="d@example.com")
        return row

    def test_submit_refuses_a_setup_that_fails_preflight(self) -> None:
        document = single_net_setup()
        document["sources"] = []
        row = self._setup(document)
        response = _request(_app(), "POST", f"{SETUPS}/{row['setup_id']}/submit", body={"analysis_id": "dc"},
                            headers={"If-Match": f'"simsetup:{row["setup_id"]}:1"'})
        self.assertEqual((response.status, response.json["code"]), (422, "sim_setup_not_ready"))
        self.assertIn("rail-without-source", json.dumps(response.json["report"]))
        self.enqueue.assert_not_called()

    def test_submit_run_and_read_back(self) -> None:
        row = self._setup(single_net_setup())
        submitted = _request(_app(), "POST", f"{SETUPS}/{row['setup_id']}/submit", body={"analysis_id": "dc"},
                             headers={"If-Match": f'"simsetup:{row["setup_id"]}:1"'})
        self.assertEqual(submitted.status, 202, submitted.text)
        run_id = submitted.json["run_id"]
        self.assertEqual((submitted.json["status"], submitted.json["setup_revision"]), ("queued", 1))

        context = FakeContext({"run_id": run_id})
        runs_module.run_sim_job(context, runs=self.runs)
        stored = self.runs.read(run_id)
        self.assertEqual(stored["status"], "succeeded")
        self.assertTrue(stored["bundle_sha256"])
        self.assertEqual(stored["solved_commit"], "c0ffee")
        workspace = runs_module.run_dir(run_id)
        job = json.loads((workspace / "job.json").read_text())
        setup = json.loads((workspace / "input" / "setup.json").read_text())
        self.assertEqual(setup["bundle"]["sha256"], job["bundle"]["sha256"])
        # The engine that runs the analysis's kind (the preferred one is not installed),
        # and the project's mesh cache for re-runs.
        self.assertEqual(job["engine"], {"id": "dc-drop-synthetic"})
        self.assertEqual(job["mesh_cache_dir"], str(runs_module.mesh_cache_dir(PROJECT.id)))
        self.assertIn({"percent": 40 + 55 * 0.5, "message": "half"}, context.updates)

        base = f"/api/projects/{PROJECT.id}/sim/a0/runs/{run_id}"
        read = _request(_app(), "GET", base, user="viewer").json
        self.assertEqual((read["status"], read["commit"]), ("succeeded", "c0ffee"))
        frozen = _request(_app(), "GET", base + "/setup", user="viewer").json
        self.assertEqual(frozen["name"], "3V3 single load")
        result = _request(_app(), "GET", base + "/result", user="viewer").json
        self.assertEqual(result["status"], "succeeded")
        values = _request(_app(), "GET", base + "/files/out/voltage_v.operation-values.json", user="viewer")
        self.assertEqual(values.status, 200)
        self.assertEqual(_request(_app(), "GET", base + "/files/job.json", user="viewer").status, 404)
        pack = _request(_app(), "GET", base + "/materialization", user="viewer")
        self.assertEqual((pack.status, pack.text), (200, "PACK"))

    def test_submit_refuses_a_board_that_is_not_ready_or_disagrees_with_its_schematic(self) -> None:
        row = self._setup(single_net_setup())
        submit = lambda: _request(_app(), "POST", f"{SETUPS}/{row['setup_id']}/submit", body={"analysis_id": "dc"},  # noqa: E731
                                  headers={"If-Match": f'"simsetup:{row["setup_id"]}:1"'})
        self.board = board_source.BoardState("pending")
        response = submit()
        self.assertEqual((response.status, response.json["code"]), (409, "sim_board_not_ready"))
        self.assertIn("still being prepared", response.json["detail"])
        self.board = board_source.BoardState("ready", cross_check="failed", first_error="net-mismatch: R1.1")
        response = submit()
        self.assertEqual((response.status, response.json["code"]), (409, "sim_board_cross_check_failed"))
        self.assertIn("net-mismatch: R1.1", response.json["detail"])
        self.enqueue.assert_not_called()

    def test_failed_engine_marks_the_run_failed_and_settle_ends_orphans(self) -> None:
        (Path(settings.PRISM_SIM_BIN_DIR) / "sim-worker").write_text(
            FAKE_WORKER.split("\n")[0] + "\n" + FAKE_WORKER.split("\n")[1]
            + "\necho '{\"event\":\"failed\",\"message\":\"no pads\"}'\nexit 1\n", encoding="utf-8")
        row = self._setup(single_net_setup())
        run = self.service.submit(PROJECT, row["setup_id"], 1, "dc", "d@example.com")
        with self.assertRaises(RuntimeError):
            runs_module.run_sim_job(FakeContext({"run_id": run["run_id"]}), runs=self.runs)
        self.assertEqual((self.runs.read(run["run_id"])["status"], self.runs.read(run["run_id"])["message"]),
                         ("failed", "no pads"))

        other = self.service.submit(PROJECT, row["setup_id"], 1, "dc", "d@example.com")
        self.assertIn("job-1", self.runs.unsettled_job_ids())
        with mock.patch.object(runs_module, "RunStore", return_value=self.runs):
            self.assertTrue(runs_module.settle_run({"job_id": "job-1", "status": "cancelled"}))
            self.assertFalse(runs_module.settle_run({"job_id": "job-1", "status": "running"}))
        self.assertEqual(self.runs.read(other["run_id"])["status"], "cancelled")

    def test_a_cancelled_run_is_recorded_cancelled_not_failed(self) -> None:
        row = self._setup(single_net_setup())
        run = self.service.submit(PROJECT, row["setup_id"], 1, "dc", "d@example.com")
        with mock.patch.object(runs_module, "_run_engine", side_effect=JobCancelled("Cancellation requested")), \
                self.assertRaises(JobCancelled):
            runs_module.run_sim_job(FakeContext({"run_id": run["run_id"]}), runs=self.runs)
        stored = self.runs.read(run["run_id"])
        self.assertEqual((stored["status"], stored["message"]), ("cancelled", "Cancelled"))
        self.assertNotIn("job-1", self.runs.unsettled_job_ids())

    def test_the_run_exists_before_its_job_can_be_claimed(self) -> None:
        row = self._setup(single_net_setup())

        def claimable(payload, **_):
            # A worker may claim the job the moment it is queued; its handler reads the run first.
            self.assertEqual(self.runs.read(payload["run_id"])["status"], "queued")
            return {"job_id": "job-9"}

        self.enqueue.side_effect = claimable
        run = self.service.submit(PROJECT, row["setup_id"], 1, "dc", "d@example.com")
        self.assertEqual(run["job_id"], "job-9")
        self.assertEqual(self.runs.read(run["run_id"])["job_id"], "job-9")

    def test_a_run_whose_job_cannot_be_queued_ends_failed(self) -> None:
        row = self._setup(single_net_setup())
        self.enqueue.side_effect = RuntimeError("queue down")
        with self.assertRaises(RuntimeError):
            self.service.submit(PROJECT, row["setup_id"], 1, "dc", "d@example.com")
        (stored,) = self.runs.list(PROJECT.id)
        self.assertEqual(stored["status"], "failed")
        self.assertNotIn("", self.runs.unsettled_job_ids())

    def test_a_quiet_engine_is_stopped_at_its_deadline(self) -> None:
        # Answers the engine list like the fake worker, then runs silent until killed.
        _script(Path(settings.PRISM_SIM_BIN_DIR) / "sim-worker",
                FAKE_WORKER.split("\n")[0] + "\n" + FAKE_WORKER.split("\n")[1] + "\nexec sleep 30\n")
        row = self._setup(single_net_setup())
        run = self.service.submit(PROJECT, row["setup_id"], 1, "dc", "d@example.com")
        started = time.monotonic()
        with mock.patch.object(settings, "PRISM_SIM_TIMEOUT_SECONDS", 1):
            with self.assertRaises(runs_module.EngineTimeout):
                runs_module.run_sim_job(FakeContext({"run_id": run["run_id"]}), runs=self.runs)
        self.assertLess(time.monotonic() - started, 10)
        stored = self.runs.read(run["run_id"])
        self.assertEqual(stored["status"], "failed")
        self.assertIn("ran past 1 s", stored["message"])

    def test_engines_come_from_the_installed_worker(self) -> None:
        self.assertEqual(runs_module.engine_descriptors()[0]["id"], "dc-drop-synthetic")
        with mock.patch.object(settings, "PRISM_SIM_BIN_DIR", str(self.tmp / "missing")):
            self.assertEqual(runs_module.engine_descriptors(), [])


class JobKindTest(unittest.TestCase):
    def test_sim_run_is_registered_on_its_own_slot(self) -> None:
        from app.services.job_handlers import load_builtin_job_handlers, registered_job_kinds

        load_builtin_job_handlers()
        self.assertIn("sim_run", registered_job_kinds())
        self.assertEqual(
            dict(runs_module.SIM_RUN.resources),
            {"prism_worker": 1, "sim": 1, "memory": 4},
        )

    def test_result_files_are_limited_to_listed_artifacts(self) -> None:
        run = {"run_id": "run_x", "result": {"artifacts": [{"path": "out/a.json"}]}}
        with self.assertRaises(Exception):
            runs_module.result_file(run, "../../etc/passwd")



class BoardSourceTest(unittest.TestCase):
    """A run solves on its commit's design bundle, linked in as stored."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.archive = self.tmp / "store" / "bundle.prism"
        self.archive.parent.mkdir()
        self.archive.write_bytes(b"PK design bundle")

    def opened(self, state: str, check: dict | None = None) -> SimpleNamespace:
        member = board_source.MATERIALIZATION
        board = {"status": "complete", **({"cross_check": check} if check else {})}
        return SimpleNamespace(
            project_id="prj", commit="abc", revision_key="rk", archive_revision_key=None, generator_digest="gd",
            bundle_key="bk", archive=SimpleNamespace(manifest={"stages": {"board": board}}),
            readiness=lambda paths: {member: Readiness(member, state, "board", "why" if state != "ready" else "")},
        )

    def test_the_stored_design_bundle_is_linked_into_the_run(self) -> None:
        inputs = self.tmp / "run" / "input"
        inputs.mkdir(parents=True)
        log: list[str] = []
        with mock.patch("app.sim_studio.board_source.reader.open_revision", return_value=self.opened("ready")), \
                mock.patch("app.sim_studio.board_source.store.archive_path", return_value=self.archive):
            board = board_source.stage_board({"project_id": "prj", "source_commit": "abc"}, inputs, log)
        self.assertEqual(board, {"path": "input/board.prism",
                                 "sha256": hashlib.sha256(b"PK design bundle").hexdigest(), "commit": "abc"})
        self.assertTrue(__import__("os").path.samefile(inputs / "board.prism", self.archive))
        self.assertIn("design bundle bk", log[0])

    def test_a_board_not_materialized_yet_is_refused_and_its_cross_check_reported(self) -> None:
        with mock.patch("app.sim_studio.board_source.reader.open_revision", return_value=self.opened("pending")):
            with self.assertRaises(board_source.BoardNotReady) as raised:
                board_source.stage_board({"project_id": "prj"}, self.tmp, [])
            self.assertIn("still being prepared", str(raised.exception))
            self.assertEqual(board_source.board_state("prj", None).state, "pending")
        check = {"status": "failed", "errors": [{"code": "net-mismatch", "message": "R1.1"}]}
        with mock.patch("app.sim_studio.board_source.reader.open_revision", return_value=self.opened("ready", check)):
            state = board_source.board_state("prj", "abc")
        self.assertEqual((state.state, state.cross_check, state.first_error), ("ready", "failed", "net-mismatch: R1.1"))

    def test_the_engine_is_the_one_that_runs_the_analysis_kind(self) -> None:
        engines = [{"id": "ac-pdn-peec", "analyses": ["ac-pdn"]}, {"id": "dc-drop-synthetic", "analyses": ["dc-drop"]},
                   {"id": "dc-drop-grid", "analyses": ["dc-drop"]}]
        self.assertEqual(runs_module.engine_for("dc-drop", engines), "dc-drop-grid")  # the preferred one
        self.assertEqual(runs_module.engine_for("ac-pdn", engines), "ac-pdn-peec")
        with mock.patch.object(settings, "PRISM_SIM_ENGINE", "missing"):
            self.assertEqual(runs_module.engine_for("dc-drop", engines), "dc-drop-synthetic")
        with self.assertRaises(RuntimeError):
            runs_module.engine_for("thermal", engines)

    def test_stage_writes_the_job_for_the_linked_bundle(self) -> None:
        pack = b"PK"

        def stage_board(run, inputs, log):
            (inputs / "board.prism").write_bytes(pack)
            return {"path": "input/board.prism", "sha256": hashlib.sha256(pack).hexdigest()}

        run = {"setup_document": {"analyses": [{"id": "dc", "kind": "dc-drop"}]}, "job_id": "job-1",
               "project_id": "prj", "analysis_id": "dc"}
        with mock.patch("app.sim_studio.board_source.stage_board", stage_board), \
                mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp)), \
                mock.patch.object(runs_module, "engine_descriptors", return_value=[{"id": "dc-drop-grid", "analyses": ["dc-drop"]}]):
            job, _board = runs_module._stage(run, self.tmp / "workspace", [])
        self.assertEqual(job["bundle"], {"path": "input/board.prism", "sha256": hashlib.sha256(pack).hexdigest()})
        self.assertEqual(job["engine"], {"id": "dc-drop-grid"})
        self.assertEqual(job["mesh_cache_dir"], str(self.tmp / ".kicad-prism" / "sim" / "meshes" / "prj"))


@requires_scratch_postgres("Simulation run retention tests")
class RunRetentionTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = scratch_schema(self, "sim_retention", ledgers=(WORKSPACE_LEDGER,))
        seed_repository(scratch.conn, "repo_sim")
        seed_project(scratch.conn, PROJECT.id, "repo_sim")
        scratch.conn.commit()
        self.conn = scratch.conn
        self.runs = RunStore(scratch.connection)
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        patcher = mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp))
        patcher.start()
        self.addCleanup(patcher.stop)

    def add_run(self, setup: str, status: str, age_days: float, bundle: bytes | None = None) -> str:
        run_id = RunStore.new_id()
        self.runs.create({
            "run_id": run_id, "project_id": PROJECT.id, "setup_id": setup, "setup_revision": 1,
            "setup_sha256": "x", "setup_document": {}, "analysis_id": "dc", "source_commit": None,
            "project_path": "board.kicad_pro", "job_id": f"job-{run_id}", "status": status,
            "created_by": "d@example.com",
            "bundle_sha256": __import__("hashlib").sha256(bundle).hexdigest() if bundle else None,
        })
        self.conn.execute(
            "UPDATE ws_sim_runs SET created_at = now() - (%s * INTERVAL '1 day') WHERE run_id = %s",
            (age_days, run_id),
        )
        self.conn.commit()
        (runs_module.run_dir(run_id) / "input").mkdir(parents=True)
        (runs_module.run_dir(run_id) / "input" / "board.prism").write_bytes(bundle or b"x")
        return run_id

    def test_keeps_the_newest_three_successes_and_only_a_latest_failure(self) -> None:
        from app.sim_studio import retention

        succeeded = [self.add_run("sup_a", "succeeded", 30 - day, b"same bundle") for day in range(5)]
        failed_between = self.add_run("sup_a", "failed", 27.5)  # between the successes
        failed_older = [self.add_run("sup_b", "failed", 400 - day) for day in range(2)]
        latest_failed = self.add_run("sup_b", "failed", 1)
        running = self.add_run("sup_c", "running", 400)
        orphan = runs_module.run_dir("run_orphaned")
        orphan.mkdir(parents=True)

        with mock.patch.object(settings, "PRISM_SIM_SUCCEEDED_RUNS_KEPT", 3):
            report = retention.prune_runs(self.runs)

        self.assertEqual(self.runs.ids(), set(succeeded[2:]) | {latest_failed, running})
        self.assertNotIn(failed_between, self.runs.ids())
        self.assertFalse(runs_module.run_dir(succeeded[0]).exists())
        self.assertFalse(orphan.exists())
        inputs = [runs_module.run_dir(run_id) / "input" / "board.prism" for run_id in succeeded[2:]]
        self.assertTrue(all(__import__("os").path.samefile(inputs[0], path) for path in inputs))
        self.assertEqual(report["sim_runs_pruned"], 5)
        self.assertEqual(report["sim_inputs_linked"], 2)


class MeshRetentionTest(unittest.TestCase):
    def test_each_project_keeps_its_newest_meshes_and_drops_crashed_writes(self) -> None:
        from app.sim_studio import retention

        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        with mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(tmp)):
            meshes = runs_module.mesh_cache_dir("prj")
            meshes.mkdir(parents=True)
            now = 1_000_000.0
            for age, name in enumerate(["a", "b", "c"]):
                path = meshes / f"{name}.dcmesh"
                path.write_bytes(b"m")
                __import__("os").utime(path, (now - age * 60, now - age * 60))
            for name, age in (("old.1.partial", 2 * 86400), ("new.1.partial", 60)):
                path = meshes / name
                path.write_bytes(b"p")
                __import__("os").utime(path, (now - age, now - age))
            self.assertEqual(retention.prune_meshes(keep=2, now=now), 2)
        self.assertEqual(sorted(p.name for p in meshes.iterdir()), ["a.dcmesh", "b.dcmesh", "new.1.partial"])


class MaintenanceScheduleTest(unittest.TestCase):
    """The daily artifact maintenance applies Simulation Studio's retention."""

    def setUp(self) -> None:
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        patcher = mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(tmp))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _sim_retention(self, *, enabled: bool) -> tuple[dict, mock.Mock]:
        from app.services import catalog_worker_tasks

        with mock.patch.object(settings, "PRISM_SIM_STUDIO_ENABLED", enabled), mock.patch(
            "app.sim_studio.retention.prune_runs", return_value={"sim_runs_pruned": 2}
        ) as prune:
            return catalog_worker_tasks._sim_studio_retention(), prune

    def test_an_installation_that_never_used_the_studio_is_untouched(self) -> None:
        report, prune = self._sim_retention(enabled=False)
        self.assertEqual(report, {})
        prune.assert_not_called()

    def test_runs_while_enabled(self) -> None:
        report, prune = self._sim_retention(enabled=True)
        self.assertEqual(report, {"sim_runs_pruned": 2})
        prune.assert_called_once_with()

    def test_runs_left_on_disk_are_pruned_after_the_studio_is_disabled(self) -> None:
        runs_module.sim_root().mkdir(parents=True)
        report, prune = self._sim_retention(enabled=False)
        self.assertEqual(report, {"sim_runs_pruned": 2})
        prune.assert_called_once_with()

    def test_artifact_maintenance_reports_the_studio_retention(self) -> None:
        from app.services import catalog_worker_tasks as tasks

        step = {"quarantined": 0, "expired": {"deleted": 0, "restored": 0}}
        with mock.patch.object(tasks, "_step"), mock.patch.object(
            tasks, "artifact_store", run_retention=mock.Mock(return_value={})
        ), mock.patch.object(
            tasks,
            "job_artifacts",
            reconcile_registered_artifacts=mock.Mock(return_value={}),
            collect_unreferenced_objects=mock.Mock(return_value={}),
            cleanup_stale_staging=mock.Mock(return_value={}),
        ), mock.patch.object(
            tasks, "context_jobs", prune_artifact_metadata=mock.Mock(return_value=0)
        ), mock.patch.object(tasks, "git_read_cache", prune=mock.Mock(return_value=0)), mock.patch(
            "app.services.job_retention.prune_jobs", return_value={}
        ), mock.patch.object(tasks, "purge_superseded_step_files", return_value=step), mock.patch.object(
            tasks, "catalog_service", cleanup_resolved_import_staging=mock.Mock(return_value={"removed": 0})
        ), mock.patch.object(tasks, "_sim_studio_retention", return_value={"sim_runs_pruned": 4}) as sim:
            result = tasks.run_artifact_maintenance(SimpleNamespace(job_id="job-1"))

        sim.assert_called_once_with()
        self.assertEqual(result["sim_runs_pruned"], 4)


if __name__ == "__main__":
    unittest.main()


class BoardFactsSourceTest(unittest.TestCase):
    """Setups infer from the design bundle's semantic index, which names each pin's role."""

    def test_facts_come_from_the_design_bundle_when_its_index_is_built(self) -> None:
        from app.services import semantic_index_bundle
        from app.sim_studio import service

        index = {"terminals": [], "components": [], "nets": [{"name": "GND"}]}
        member = semantic_index_bundle.MEMBER
        opened = SimpleNamespace(
            bundle_key="bk-facts", readiness=lambda paths: {member: Readiness(member, "ready", "parse")},
            read_json=mock.MagicMock(return_value=index),
        )
        with mock.patch("app.services.design_bundle.reader.open_revision", return_value=opened), \
                mock.patch("app.services.semantic_index_service.artifact_file") as legacy:
            facts = service.semantic_index_facts(SimpleNamespace(id="prj-facts"), None)
        self.assertIn("GND", facts.nets)
        legacy.assert_not_called()

    def test_facts_fall_back_to_the_index_file_while_the_bundle_is_not_ready(self) -> None:
        from app.services import semantic_index_bundle
        from app.sim_studio import service

        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        path = tmp / "index.json"
        path.write_text(json.dumps({"terminals": [], "components": [], "nets": [{"name": "VBUS"}]}), encoding="utf-8")
        member = semantic_index_bundle.MEMBER
        opened = SimpleNamespace(bundle_key="bk-pending", readiness=lambda paths: {member: Readiness(member, "pending", "parse")})
        with mock.patch("app.services.design_bundle.reader.open_revision", return_value=opened), \
                mock.patch("app.services.semantic_index_service.artifact_file", return_value=(path, "rk")):
            facts = service.semantic_index_facts(SimpleNamespace(id="prj-legacy"), None)
        self.assertIn("VBUS", facts.nets)
