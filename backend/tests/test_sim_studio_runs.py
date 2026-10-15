"""Simulation runs: submit gating, the sim_run handler's staging and relay, settling, and run routes."""

from __future__ import annotations

import json
import stat
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.api import sim_studio as sim_api
from app.core.config import settings
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from app.sim_studio import runs as runs_module
from app.sim_studio.run_store import RunStore
from app.sim_studio.service import SimStudioService
from app.sim_studio.store import SetupStore
from support.postgres import requires_scratch_postgres, scratch_schema, seed_project, seed_repository
from test_sim_studio_api import PROJECT, SETUPS, _app, _visible
from test_sim_studio_setup import facts, single_net_setup
from test_system_api import _request

FAKE_BUNDLE = """#!/bin/sh
# prism-bundle build PROJECT -o OUT ...
out="$4"
python3 - "$out" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as z:
    z.writestr("bundle.json", "{}")
    z.writestr("materialization/board.kmpack", b"PACK")
PY
echo "built"
"""

FAKE_WORKER = """#!/bin/sh
[ "$1" = engines ] && { echo '[{"schema":"prism.sim.engine","id":"dc-drop-synthetic"}]'; exit 0; }
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
        _script(bin_dir / "prism-bundle", FAKE_BUNDLE)
        _script(bin_dir / "sim-worker", FAKE_WORKER)
        project_dir = self.tmp / "project"
        project_dir.mkdir()
        (project_dir / "board.kicad_pro").write_text("{}", encoding="utf-8")
        self.setups = SetupStore(scratch.connection)
        self.runs = RunStore(scratch.connection)
        self.service = SimStudioService(self.setups, facts=lambda project, commit: facts(), runs=self.runs)
        queued = mock.MagicMock(return_value={"job_id": "job-1"})

        @contextmanager
        def sources(run):
            yield project_dir

        for patcher in (
            mock.patch.object(settings, "PRISM_SIM_STUDIO_ENABLED", True),
            mock.patch.object(settings, "PRISM_SIM_BIN_DIR", str(bin_dir)),
            mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp / "projects")),
            mock.patch.object(runs_module, "SIM_RUN", SimpleNamespace(enqueue=queued)),
            mock.patch.object(runs_module, "_project_sources", sources),
            mock.patch("app.services.kicad_tools.locate_kicad_cli", return_value=None),
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
        workspace = runs_module.run_dir(run_id)
        job = json.loads((workspace / "job.json").read_text())
        setup = json.loads((workspace / "input" / "setup.json").read_text())
        self.assertEqual(setup["bundle"]["sha256"], job["bundle"]["sha256"])
        self.assertIn({"percent": 40 + 55 * 0.5, "message": "half"}, context.updates)

        base = f"/api/projects/{PROJECT.id}/sim/a0/runs/{run_id}"
        self.assertEqual(_request(_app(), "GET", base, user="viewer").json["status"], "succeeded")
        frozen = _request(_app(), "GET", base + "/setup", user="viewer").json
        self.assertEqual(frozen["name"], "3V3 single load")
        result = _request(_app(), "GET", base + "/result", user="viewer").json
        self.assertEqual(result["status"], "succeeded")
        values = _request(_app(), "GET", base + "/files/out/voltage_v.operation-values.json", user="viewer")
        self.assertEqual(values.status, 200)
        self.assertEqual(_request(_app(), "GET", base + "/files/job.json", user="viewer").status, 404)
        pack = _request(_app(), "GET", base + "/materialization", user="viewer")
        self.assertEqual((pack.status, pack.text), (200, "PACK"))

    def test_failed_engine_marks_the_run_failed_and_settle_ends_orphans(self) -> None:
        (Path(settings.PRISM_SIM_BIN_DIR) / "sim-worker").write_text(
            "#!/bin/sh\necho '{\"event\":\"failed\",\"message\":\"no pads\"}'\nexit 1\n", encoding="utf-8")
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

    def test_engines_come_from_the_installed_worker(self) -> None:
        self.assertEqual(runs_module.engine_descriptors()[0]["id"], "dc-drop-synthetic")
        with mock.patch.object(settings, "PRISM_SIM_BIN_DIR", str(self.tmp / "missing")):
            self.assertEqual(runs_module.engine_descriptors(), [])


class JobKindTest(unittest.TestCase):
    def test_sim_run_is_registered_on_its_own_slot(self) -> None:
        from app.services.job_handlers import load_builtin_job_handlers, registered_job_kinds

        load_builtin_job_handlers()
        self.assertIn("sim_run", registered_job_kinds())
        self.assertEqual(dict(runs_module.SIM_RUN.resources), {"prism_worker": 1, "sim": 1})

    def test_result_files_are_limited_to_listed_artifacts(self) -> None:
        run = {"run_id": "run_x", "result": {"artifacts": [{"path": "out/a.json"}]}}
        with self.assertRaises(Exception):
            runs_module.result_file(run, "../../etc/passwd")


if __name__ == "__main__":
    unittest.main()


class BundleCacheTest(unittest.TestCase):
    """Runs of one revision share a bundle: its build is mostly KiCad's zone refill."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        (bin_dir / "prism-bundle").write_bytes(b"tool v1")
        self.project = self.tmp / "board"
        (self.project / "sub").mkdir(parents=True)
        for name, text in (("b.kicad_pro", "{}"), ("b.kicad_pcb", "(kicad_pcb)"), ("b.kicad_sch", "(kicad_sch)"),
                           ("sub/power.kicad_sch", "(kicad_sch power)")):
            (self.project / name).write_text(text)
        self.builds: list[Path] = []

        def build(project_file: Path, target: Path, log: list[str]) -> None:
            self.builds.append(project_file)
            target.write_bytes(b"bundle " + project_file.read_bytes())

        for patcher in (
            mock.patch.object(settings, "PRISM_SIM_BIN_DIR", str(bin_dir)),
            mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp / "projects")),
            mock.patch("app.services.kicad_tools.locate_kicad_cli", return_value=None),
            mock.patch.object(runs_module, "_build_bundle", build),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        runs_module._tool_identity.cache_clear()
        self.addCleanup(runs_module._tool_identity.cache_clear)

    def stage(self, name: str) -> bytes:
        target = self.tmp / name
        runs_module._cached_bundle(self.project / "b.kicad_pro", target, [])
        return target.read_bytes()

    def test_same_sources_reuse_the_bundle_and_an_edit_rebuilds(self) -> None:
        first = self.stage("one.prism")
        self.assertEqual(self.stage("two.prism"), first)
        self.assertEqual(len(self.builds), 1)
        key = runs_module.bundle_key(self.project / "b.kicad_pro", None)
        (self.project / "sub" / "power.kicad_sch").write_text("(kicad_sch power edited)")
        self.assertNotEqual(runs_module.bundle_key(self.project / "b.kicad_pro", None), key)
        self.stage("three.prism")
        self.assertEqual(len(self.builds), 2)

    def test_a_new_tool_is_a_new_key(self) -> None:
        key = runs_module.bundle_key(self.project / "b.kicad_pro", None)
        (Path(settings.PRISM_SIM_BIN_DIR) / "prism-bundle").write_bytes(b"tool v2")
        runs_module._tool_identity.cache_clear()
        self.assertNotEqual(runs_module.bundle_key(self.project / "b.kicad_pro", None), key)
