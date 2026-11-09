"""The design_bundle job end to end with the stub CLI and fake KiCad tools, on a scratch workspace schema.

Covers ADR §4.4 staged readiness, cli-spec.md §9 (argv, refill, saved fills,
upgrade, models), the commit index, project absence, LFS and dedup on the
bundle key.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from psycopg.types.json import Jsonb

from app.core.config import settings
from app.services import event_log
from app.services.design_bundle import cli, jobs, manifest, reader, rows, store
from app.services.design_bundle.archive import open_archive
from app.services.job_runtime import PermanentJobError, RetryableJobError
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from app.services.workspace_service import workspace
from in_memory_jobs import InMemoryJobService, claimed_context
from support.design_bundle_fixtures import PROJECT_FILES, install_fake_kicad, install_stub, project_repo, set_modes
from support.postgres import requires_scratch_postgres, scratch_schema, seed_project, seed_repository
from support.repo import git


class _Workspace:
    """A scratch workspace schema the bundle code and WorkspaceService both read."""

    def setUp(self) -> None:  # type: ignore[misc]
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.scratch = scratch_schema(self, "design_bundle", ledgers=(WORKSPACE_LEDGER,))
        self.enterContext(mock.patch.object(rows, "default_connect", self.scratch.connection))
        self.enterContext(mock.patch.object(event_log, "connect", self.scratch.connection))
        self.enterContext(mock.patch.object(workspace, "_connect", self.scratch.connection))
        self.enterContext(mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp / "projects")))
        self.enterContext(mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_ROOT", ""))
        self.queue = InMemoryJobService()
        self.seen: dict[str, dict] = {}
        self.enterContext(mock.patch("app.services.job_service.jobs", self.queue))
        self.stub_log = install_stub(self)
        self.kicad_log = install_fake_kicad(self)

    def add_project(self, project_id: str = "p1", repo_id: str = "r1", *, files=None, **columns) -> Path:
        repo = project_repo(self.tmp / "projects" / "clones" / repo_id, files)
        with self.scratch.connection() as conn:
            seed_repository(conn, repo_id, clone_path=f"clones/{repo_id}")
            seed_project(conn, project_id, repo_id, relative_path="board", project_file_rel="demo.kicad_pro", **columns)
        return repo

    def run_job(self, job_id: str):
        """Run (or re-run, as a retried attempt) the queued job ``job_id``."""

        if job_id not in self.seen:
            self.seen[job_id] = self.queue.rows.pop(job_id)
        row = self.seen[job_id]
        context = claimed_context(
            self.queue, row["kind"], row["payload"], state_root=self.tmp / "state"
        )
        return jobs.run_design_bundle_job(context)

    def invocations(self) -> list[list[str]]:
        return [json.loads(line)["argv"] for line in self.stub_log.read_text().splitlines()]

    def builds(self) -> list[list[str]]:
        return [argv for argv in self.invocations() if argv[:2] == ["bundle", "build"]]

    def events(self) -> list[dict]:
        with self.scratch.connect() as conn:
            return conn.execute("SELECT * FROM ws_events ORDER BY id").fetchall()


@requires_scratch_postgres("the design_bundle job")
class DesignBundleJobTests(_Workspace, unittest.TestCase):
    def test_all_stages_build_one_archive_with_the_specified_argv(self) -> None:
        repo = self.add_project()
        job_id = jobs.start_design_bundle_job("p1", requested_by="test")
        payload = self.queue.rows[job_id]["payload"]
        self.assertEqual(payload["commit"], git(repo, "rev-parse", "HEAD"))
        self.assertEqual(self.queue.rows[job_id]["artifact_key"], f"p1:{payload['bundle_key']}")  # dedup on the bundle key
        self.assertEqual(
            self.queue.rows[job_id]["resource_requirements"],
            {"prism_worker": 1, "design_bundle": 1, "semantic_compile": 1, "memory": 9},
        )
        result = self.run_job(job_id)
        self.assertEqual(result.details["stages"], {"parse": "complete", "board": "complete", "models": "complete"})

        parse, board, models = self.builds()
        options = dict(zip(parse[3::2], parse[4::2]))
        self.assertEqual(options["--stage"], "parse")
        self.assertEqual(options["--revision-key"], payload["revision_key"])
        self.assertTrue(parse[2].endswith("/src/board/demo.kicad_pro"))
        config = json.loads(Path(options["--config"]).read_text())
        self.assertEqual(config["board"], "board/demo.kicad_pcb")
        self.assertEqual(config["excluded_dirs"], ["board/Design-Outputs", "board/Manufacturing-Outputs"])
        self.assertIn("max-memory-bytes=4294967296", parse)
        self.assertEqual(board[board.index("--refill-tool") + 1], "10.0.7")  # the worker KiCad, a later patch release
        self.assertEqual(Path(board[board.index("--in") + 1]), Path(board[board.index("-o") + 1]))
        self.assertIn("--models-glb", models)
        self.assertEqual(models[models.index("--models-tool") + 1], "10.0.7")
        self.assertIn("refill", self.kicad_log.read_text())

        row = rows.get_bundle("p1", payload["bundle_key"])
        self.assertEqual((row["state"], row["stages"]["models"]), ("complete", "complete"))
        self.assertEqual(rows.lookup_key("p1", payload["commit"], result.details["config_digest"]), payload["revision_key"])
        archive = open_archive(store.archive_path("p1", payload["revision_key"], row["generator_digest"]))
        self.assertEqual(manifest.violations(archive.manifest), [])
        refilled = archive.read("refilled/demo.kicad_pcb").decode()
        self.assertTrue(refilled.endswith("(refilled)\n"))
        self.assertEqual(result.details["invocations"][0]["stage"], "parse")
        # A complete bundle is not queued again; the stub saw three builds and one version probe.
        self.assertIsNone(jobs.start_design_bundle_job("p1"))
        self.assertEqual(len(self.builds()), 3)

    def test_a_completed_build_appends_bundle_built(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        payload = self.queue.rows[job_id]["payload"]

        self.run_job(job_id)

        events = [event for event in self.events() if event["kind"] == "bundle.built"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["project_id"], "p1")
        self.assertEqual(
            events[0]["payload"],
            {"commit": payload["commit"], "revisionKey": payload["revision_key"]},
        )

    def test_a_complete_row_whose_archive_is_gone_is_rebuilt(self) -> None:
        self.add_project()
        built = self.run_job(jobs.start_design_bundle_job("p1")).details
        store.delete("p1", built["revision_key"], built["generator_digest"])  # lost, or rejected on open
        self.assertFalse(jobs.bundle_ready("p1", built["bundle_key"]))
        job_id = jobs.start_design_bundle_job("p1")  # what a reader's queue=True calls
        self.assertIsNotNone(job_id)
        self.run_job(job_id)
        self.assertTrue(jobs.bundle_ready("p1", built["bundle_key"]))

    def test_a_failed_bundle_is_not_requeued_by_reads_until_a_retry_is_due(self) -> None:
        self.add_project()
        first = jobs.start_design_bundle_job("p1")
        payload = self.queue.rows[first]["payload"]
        rows.upsert_bundle(
            bundle_key=payload["bundle_key"], project_id="p1", revision_key=payload["revision_key"],
            generator_digest=cli.generator().digest, commit=payload["commit"], state="failed", error="prism-kicad stage parse: exit 3",
        )
        with mock.patch.object(rows, "job_status", return_value="failed"):
            opened = reader.open_revision("p1", queue=True)
            self.assertFalse(opened.job_active)
            self.assertEqual(opened.failure, "prism-kicad stage parse: exit 3")
            self.assertIsNone(jobs.start_design_bundle_job("p1"))
            # A deliberate Generate retries at once.
            self.assertIsNotNone(jobs.start_design_bundle_job("p1", retry_failed=True))
        rows.upsert_bundle(
            bundle_key=payload["bundle_key"], project_id="p1", revision_key=payload["revision_key"],
            generator_digest=cli.generator().digest, commit=payload["commit"], state="failed", error="again",
        )
        with rows.default_connect() as conn:
            conn.execute("UPDATE ws_design_bundles SET updated_at = NOW() - INTERVAL '2 hours' WHERE bundle_key = %s", (payload["bundle_key"],))
        with mock.patch.object(rows, "job_status", return_value="failed"):
            self.assertIsNotNone(jobs.start_design_bundle_job("p1"))  # past PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS
            with mock.patch.object(jobs.settings, "PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS", 0):
                rows.upsert_bundle(
                    bundle_key=payload["bundle_key"], project_id="p1", revision_key=payload["revision_key"],
                    generator_digest=cli.generator().digest, commit=payload["commit"], state="failed", error="again",
                )
                with rows.default_connect() as conn:
                    conn.execute("UPDATE ws_design_bundles SET updated_at = NOW() - INTERVAL '2 days' WHERE bundle_key = %s", (payload["bundle_key"],))
                self.assertIsNone(jobs.start_design_bundle_job("p1"))  # 0: only a deliberate retry

    def test_staged_readiness_parse_members_are_readable_while_the_board_stage_retries(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        with mock.patch.dict("os.environ", {"FAKE_KICAD_FAIL": "1"}):
            with self.assertRaises(RetryableJobError) as caught:
                self.run_job(job_id)
        self.assertEqual(caught.exception.code, "zone-refill-failed")
        payload = self.seen[job_id]["payload"]
        bundle = rows.get_bundle("p1", payload["bundle_key"])
        self.assertEqual((bundle["state"], bundle["stages"]), ("building", {"parse": "complete", "board": "pending", "models": "pending"}))
        # A consumer of parse members proceeds; one of board members waits.
        with mock.patch.object(rows, "job_status", return_value="retry_wait"):
            opened = reader.open_revision("p1")
        states = reader.member_states(opened, ["projections/semantic-index.json", "materialization/board.kmpack", "design.json"])
        self.assertEqual(states, {"projections/semantic-index.json": "ready", "materialization/board.kmpack": "pending", "design.json": "ready"})
        self.assertEqual(opened.read_json("projections/stackup.json")["schema"], "prism.stackup.a0")
        extracted = opened.extract(["sources/board/demo.kicad_sch"])
        self.assertTrue((extracted / "sources/board/demo.kicad_sch").is_file())
        # The retried attempt resumes from the stored archive: no second parse.
        result = self.run_job(job_id)
        self.assertEqual(result.details["stages"]["models"], "complete")
        self.assertEqual([argv[argv.index("--stage") + 1] for argv in self.builds()], ["parse", "board", "models"])

    def test_saved_zone_fills_skip_the_refill(self) -> None:
        self.add_project(path_settings=Jsonb({"zone_fills": "saved"}))
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        self.assertEqual(result.details["stages"]["board"], "complete")
        board = self.builds()[1]
        self.assertNotIn("--refilled-board", board)
        self.assertNotIn("refill", self.kicad_log.read_text())
        bundle = rows.get_bundle("p1", result.details["bundle_key"])
        archive = open_archive(store.archive_path("p1", bundle["revision_key"], bundle["generator_digest"]))
        self.assertEqual(archive.manifest["stages"]["board"]["fill_provenance"], "saved")
        self.assertEqual(archive.manifest["config"]["zone_fills"], "saved")

    def test_a_recorded_parse_failure_ends_the_job_with_later_stages_skipped(self) -> None:
        self.add_project()
        set_modes("bundle build:parse=failed")
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        self.assertEqual(result.details["stages"], {"parse": "failed", "board": "skipped", "models": "skipped"})
        self.assertEqual(len(self.builds()), 1)
        self.assertEqual(rows.get_bundle("p1", result.details["bundle_key"])["state"], "complete")
        # The job completes, but its message and details name the failed stage.
        self.assertEqual(result.message, "Design bundle incomplete: parse failed, board skipped, models skipped")
        self.assertEqual((result.details["failed_stages"], result.details["partial_stages"]), (["parse"], []))
        # The stage's recorded error is kept on the row, for Project settings to show.
        self.assertRegex(rows.get_bundle("p1", result.details["bundle_key"])["error"], r"^parse: \S")

    def test_a_partial_parse_is_reported_as_incomplete(self) -> None:
        self.add_project()
        set_modes("bundle build:parse=partial")
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        self.assertEqual(result.details["stages"]["parse"], "partial")
        self.assertTrue(result.message.startswith("Design bundle incomplete: parse partial"))
        self.assertEqual(result.details["partial_stages"], ["parse"])

    def test_a_whole_bundle_is_reported_ready(self) -> None:
        self.add_project()
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        self.assertEqual(result.message, "Design bundle ready: parse complete, board complete, models complete")
        self.assertEqual((result.details["failed_stages"], result.details["partial_stages"]), ([], []))
        self.assertEqual(rows.get_bundle("p1", result.details["bundle_key"])["error"], "")
        # The KiCad steps that ran report their cost beside prism-kicad's invocations.
        steps = {step["step"]: step for step in result.details.get("kicad_steps", [])}
        self.assertTrue(steps, "no KiCad step was recorded")
        for step in steps.values():
            self.assertEqual(set(step), {"step", "runs", "exit", "elapsed_ms", "peak_rss_bytes"})
            self.assertGreaterEqual(step["runs"], 1)

    def test_the_output_directory_is_recreated_when_removed_before_parse(self) -> None:
        # The worker's first retention pass removes empty revision directories
        # while the first job materializes its sources.
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        payload = self.queue.rows[job_id]["payload"]
        prepare_sources = jobs.prepare_sources

        def swept(*args, **kwargs):
            prepared = prepare_sources(*args, **kwargs)
            revision = store.revision_dir("p1", payload["revision_key"])
            self.assertTrue(revision.is_dir())
            revision.rmdir()
            revision.parent.rmdir()
            return prepared

        with mock.patch.object(jobs, "prepare_sources", side_effect=swept):
            result = self.run_job(job_id)
        self.assertEqual(result.details["stages"], {"parse": "complete", "board": "complete", "models": "complete"})

    def test_cli_failures_are_retryable_or_permanent_by_exit_code(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        set_modes("bundle build:parse=exit:5")
        with self.assertRaises(RetryableJobError):
            self.run_job(job_id)
        set_modes("bundle build:parse=exit:3")
        with self.assertRaises(PermanentJobError):
            self.run_job(job_id)
        self.assertFalse(any(store.root().rglob("*.prism")))

    def test_an_internal_failure_after_parse_rebuilds_the_archive_on_retry(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        set_modes("bundle build:models=exit:1")
        with self.assertRaises(RetryableJobError):
            self.run_job(job_id)
        # The archive parse and board wrote is gone, not resumed from.
        self.assertFalse(any(store.root().rglob("*.prism")))
        set_modes("")
        builds_before = len(self.builds())
        result = self.run_job(job_id)
        self.assertEqual(result.details["stages"], {"parse": "complete", "board": "complete", "models": "complete"})
        stages = [build[build.index("--stage") + 1] for build in self.builds()[builds_before:]]
        self.assertEqual(stages, ["parse", "board", "models"])

    def test_a_timeout_after_parse_resumes_from_the_archive(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        set_modes("bundle build:models=exit:5")
        with self.assertRaises(RetryableJobError):
            self.run_job(job_id)
        self.assertTrue(any(store.root().rglob("*.prism")))

    def test_an_absent_project_has_no_key_and_no_bundle(self) -> None:
        repo = self.add_project()
        git(repo, "rm", "-q", "board/demo.kicad_pro")
        git(repo, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "gone")
        self.assertIsNone(jobs.start_design_bundle_job("p1"))
        head = git(repo, "rev-parse", "HEAD")
        self.assertTrue(rows.is_absent("p1", head, "board/demo.kicad_pro"))
        self.assertEqual(self.queue.rows, {})

    def test_older_boards_are_upgraded_before_parse(self) -> None:
        files = {**PROJECT_FILES, "board/demo.kicad_pcb": "(kicad_pcb (version 20241229) (generator \"pcbnew\"))\n",
                 "board/Subsheets/power.kicad_sch": "(kicad_sch (version 20230121))\n",
                 "board/demo.kicad_sch": '(kicad_sch (version 20260306)\n  (property "Sheetfile" "Subsheets/power.kicad_sch")\n)\n'}
        self.add_project(files=files)
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        self.assertEqual(
            result.details["upgraded"],
            [{"path": "board/demo.kicad_pcb", "upgraded_from_version": 20241229},
             {"path": "board/Subsheets/power.kicad_sch", "upgraded_from_version": 20230121}],
        )
        bundle = rows.get_bundle("p1", result.details["bundle_key"])
        archive = open_archive(store.archive_path("p1", bundle["revision_key"], bundle["generator_digest"]))
        self.assertIn(b"(version 20260206)", archive.read("sources/board/demo.kicad_pcb"))
        member = archive.member("sources/board/demo.kicad_pcb")
        self.assertEqual(member["source"]["upgraded_from_version"], 20241229)
        parse = self.builds()[0]
        self.assertEqual([parse[i + 1] for i, a in enumerate(parse) if a == "--upgraded"],
                         ["board/demo.kicad_pcb=20241229", "board/Subsheets/power.kicad_sch=20230121"])
        self.assertEqual(member["source"]["object_id"], next(
            e["object_id"] for e in json.loads(Path(self.builds()[0][self.builds()[0].index("--key-record") + 1]).read_text())["entries"]
            if e["path"] == "board/demo.kicad_pcb"))  # the committed blob's key entry

    def test_lfs_models_are_left_out_when_unavailable_but_design_sources_are_not(self) -> None:
        pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:%s\nsize 12\n" % ("0" * 64)
        self.add_project(files={**PROJECT_FILES, "lib/models/part.step": pointer})
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        self.assertEqual(result.details["unavailable_models"], ["lib/models/part.step"])
        self.assertEqual(result.details["stages"]["parse"], "complete")

    def test_an_lfs_design_source_without_its_object_fails_the_attempt(self) -> None:
        content = b"(kicad_sch (version 20260306))\n"
        pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:%s\nsize %d\n" % (hashlib.sha256(content).hexdigest(), len(content))
        repo = self.add_project(files={**PROJECT_FILES, "board/Subsheets/power.kicad_sch": pointer})
        job_id = jobs.start_design_bundle_job("p1")
        with self.assertRaises(RetryableJobError) as caught:
            self.run_job(job_id)
        self.assertEqual(caught.exception.code, "sources-unavailable")
        # Hydrated from the local LFS store, the same commit builds.
        common = repo / ".git" / "lfs" / "objects" / pointer.split("sha256:")[1][:2] / pointer.split("sha256:")[1][2:4]
        common.mkdir(parents=True)
        (common / hashlib.sha256(content).hexdigest()).write_bytes(content)
        self.assertEqual(self.run_job(job_id).details["lfs_hydrated"], ["board/Subsheets/power.kicad_sch"])

    def test_the_end_hook_marks_a_failed_job_s_bundle(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        payload = self.queue.rows[job_id]["payload"]
        ended = {"id": job_id, "status": "failed", "payload": payload, "error_message": "pcbnew kept failing"}
        self.assertTrue(jobs.settle_design_bundle_end(ended))
        self.assertEqual(rows.get_bundle("p1", payload["bundle_key"])["state"], "failed")
        self.assertFalse(jobs.settle_design_bundle_end(ended))  # idempotent
        failed = [event for event in self.events() if event["kind"] == "bundle.failed"]
        self.assertEqual(len(failed), 1)
        self.assertEqual(failed[0]["project_id"], "p1")
        self.assertEqual(
            set(failed[0]["payload"]),
            {"commit", "revisionKey", "reason"},
        )
        self.assertEqual(failed[0]["payload"]["revisionKey"], payload["revision_key"])
        self.assertEqual(failed[0]["payload"]["reason"], "pcbnew kept failing")

    def _two_commits(self) -> tuple[str, str]:
        repo = self.add_project()
        old = git(repo, "rev-parse", "HEAD")
        (repo / "board/demo.kicad_sch").write_text("(kicad_sch (version 20260306) (v2))\n", encoding="utf-8")
        git(repo, "-c", "commit.gpgsign=false", "commit", "-qam", "v2")
        return old, git(repo, "rev-parse", "HEAD")

    def test_an_interactive_enqueue_preempts_a_running_backfill_job(self) -> None:
        old, head = self._two_commits()
        backfill_job = jobs.start_design_bundle_job(
            "p1", commit=old, requested_by=jobs.BACKFILL_REQUESTED_BY, priority=jobs.BACKFILL_PRIORITY
        )
        self.queue.claim("test-worker", worker_pool="prism")
        backfill_payload = self.queue.rows[backfill_job]["payload"]
        interactive_job = jobs.start_design_bundle_job("p1", commit=head, requested_by="user")
        self.assertEqual(self.queue.rows[backfill_job]["status"], "cancel_requested")
        self.assertEqual(self.queue.rows[interactive_job]["status"], "queued")
        # The job's cancel path ends it; a preempted backfill leaves no failed row behind.
        self.assertIsNotNone(rows.get_bundle("p1", backfill_payload["bundle_key"]))
        ended = {**self.queue.get(backfill_job), "status": "cancelled"}
        self.assertTrue(jobs.settle_design_bundle_end(ended))
        self.assertIsNone(rows.get_bundle("p1", backfill_payload["bundle_key"]))
        self.assertEqual(rows.get_bundle("p1", self.queue.rows[interactive_job]["payload"]["bundle_key"])["state"], "queued")

    def _refresh(self, **kwargs) -> tuple[dict, str | None]:
        built = self.run_job(jobs.start_design_bundle_job("p1")).details
        job_id = jobs.start_design_bundle_job(
            "p1", requested_by=jobs.BACKFILL_REQUESTED_BY, priority=jobs.BACKFILL_PRIORITY, refresh_models=True, **kwargs
        )
        return built, job_id

    def test_a_models_refresh_keeps_the_served_bundle_complete_and_names_its_job(self) -> None:
        self.add_project()
        built, job_id = self._refresh()
        row = rows.get_bundle("p1", built["bundle_key"])
        self.assertEqual((row["state"], row["job_id"]), ("complete", job_id))

    def test_a_preempted_models_refresh_leaves_the_served_bundle(self) -> None:
        self.add_project()
        built, job_id = self._refresh()
        ended = {**self.queue.get(job_id), "status": "cancelled"}
        self.assertFalse(jobs.settle_design_bundle_end(ended))
        self.assertTrue(jobs.bundle_ready("p1", built["bundle_key"]))

    def test_a_failed_models_refresh_keeps_serving_and_waits_for_the_retry_delay(self) -> None:
        self.add_project()
        built, job_id = self._refresh()
        ended = {**self.queue.get(job_id), "status": "failed", "error_message": "models failed"}
        self.assertFalse(jobs.settle_design_bundle_end(ended))
        self.assertTrue(jobs.bundle_ready("p1", built["bundle_key"]))
        self.queue.rows.pop(job_id)
        now = jobs.datetime.now(jobs.timezone.utc)
        refresh = {"refresh_models": True, "requested_by": jobs.BACKFILL_REQUESTED_BY}
        with mock.patch.object(rows, "job_end", return_value=("failed", now)):
            self.assertIsNone(jobs.start_design_bundle_job("p1", **refresh))
            self.assertIsNotNone(jobs.start_design_bundle_job("p1", retry_failed=True, **refresh))
        self.queue.rows.clear()
        with mock.patch.object(rows, "job_end", return_value=("failed", now - timedelta(days=2))):
            self.assertIsNotNone(jobs.start_design_bundle_job("p1", **refresh))

    def test_an_interactive_enqueue_leaves_another_interactive_job_alone(self) -> None:
        old, head = self._two_commits()
        first = jobs.start_design_bundle_job("p1", commit=old, requested_by="user")
        self.queue.claim("test-worker", worker_pool="prism")
        jobs.start_design_bundle_job("p1", commit=head, requested_by="user")
        self.assertEqual(self.queue.rows[first]["status"], "running")

    def test_a_backfill_enqueue_cancels_nothing(self) -> None:
        old, head = self._two_commits()
        first = jobs.start_design_bundle_job(
            "p1", commit=old, requested_by=jobs.BACKFILL_REQUESTED_BY, priority=jobs.BACKFILL_PRIORITY
        )
        self.queue.claim("test-worker", worker_pool="prism")
        jobs.start_design_bundle_job(
            "p1", commit=head, requested_by=jobs.BACKFILL_REQUESTED_BY, priority=jobs.BACKFILL_PRIORITY
        )
        self.assertEqual(self.queue.rows[first]["status"], "running")

    def test_a_cancelled_interactive_job_still_settles_its_bundle_as_failed(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1", requested_by="user")
        payload = self.queue.rows[job_id]["payload"]
        ended = {**self.queue.get(job_id), "status": "cancelled"}
        self.assertTrue(jobs.settle_design_bundle_end(ended))
        self.assertEqual(rows.get_bundle("p1", payload["bundle_key"])["state"], "failed")

    def test_bundle_verify_runs_once_per_stored_archive_and_writes_the_marker(self) -> None:
        self.add_project()
        result = self.run_job(jobs.start_design_bundle_job("p1"))
        revision_key, digest = result.details["revision_key"], result.details["generator_digest"]
        archive = open_archive(store.archive_path("p1", revision_key, digest))
        marker = store.marker_path("p1", revision_key, digest)
        self.assertEqual(marker.read_text(), archive.manifest_sha256 + "\n")
        verifies = [argv for argv in self.invocations() if argv[:2] == ["bundle", "verify"]]
        self.assertEqual(len(verifies), 3)  # one after each stage's new archive version
        self.assertEqual(verifies[0][2], str(store.archive_path("p1", revision_key, digest)))

    def test_a_reopened_archive_whose_marker_matches_is_not_verified_again(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        self.run_job(job_id)
        before = len([argv for argv in self.invocations() if argv[:2] == ["bundle", "verify"]])
        self.run_job(job_id)  # every stage is final: the archive is reopened, not rebuilt
        after = len([argv for argv in self.invocations() if argv[:2] == ["bundle", "verify"]])
        self.assertEqual(before, 3)
        self.assertEqual(after, before)

    def test_an_archive_that_fails_its_own_verify_is_deleted_and_retried(self) -> None:
        self.add_project()
        job_id = jobs.start_design_bundle_job("p1")
        payload = self.queue.rows[job_id]["payload"]
        digest = rows.get_bundle("p1", payload["bundle_key"])["generator_digest"]
        real_run, verify_calls = jobs.cli.run, []

        def run(args, **kwargs):
            if list(args[:2]) == ["bundle", "verify"]:
                verify_calls.append(list(args))
                if len(verify_calls) == 2:  # parse verified; the board version fails its own verify
                    return jobs.cli.CliRun(
                        argv=("prism-kicad", *map(str, args)), exit_code=8,
                        document={"schema": "prism.cli.verify_report.a0", "status": "invalid",
                                  "stages": [], "members_checked": 0,
                                  "findings": [{"code": "member-digest-mismatch",
                                                "message": "projections/board-objects.json differs"}]},
                    )
            return real_run(args, **kwargs)

        with mock.patch.object(jobs.cli, "run", side_effect=run):
            with self.assertRaises(RetryableJobError) as caught:
                self.run_job(job_id)
        self.assertEqual(caught.exception.code, "bundle-verify-failed")
        self.assertIn("projections/board-objects.json differs", str(caught.exception))
        self.assertFalse(store.archive_path("p1", payload["revision_key"], digest).exists())
        self.assertFalse(store.marker_path("p1", payload["revision_key"], digest).exists())

    def test_import_and_sync_queue_only_with_auto_build(self) -> None:
        self.add_project()
        with mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_AUTO_BUILD", False):
            self.assertIsNone(jobs.queue_for_head("p1"))
        with mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_AUTO_BUILD", True):
            self.assertTrue(jobs.queue_for_head("p1"))
            from app.services import project_import_followups

            with mock.patch("app.services.project_import_service.start_project_metadata_job", return_value="m"), \
                 mock.patch("app.services.project_import_service.start_thumbnail_job", return_value="t"):
                outcomes = project_import_followups.schedule_import_follow_ups(["p1"])
        operations = {item["operation"]: item for item in outcomes}
        self.assertEqual(operations["design_bundle"]["status"], "queued")  # deduplicated on the bundle key


class FailureReasonTests(unittest.TestCase):
    """``manifest.failure_reasons``: what Project settings shows for a failed stage."""

    def test_each_failed_stage_names_its_code_message_and_source(self) -> None:
        from app.services.design_bundle import manifest as manifest_rules

        manifest = {"stages": {
            "parse": {"status": "failed", "error": {
                "code": "source-unparseable", "message": "expected ')'",
                "location": {"path": "sources/board/main.kicad_sch", "line": 12, "column": 3},
            }},
            "board": {"status": "failed", "error": {"code": "board-unreadable", "message": "no outline"}},
            "models": {"status": "skipped"},
        }}
        self.assertEqual(
            manifest_rules.failure_reasons(manifest),
            "parse: source-unparseable: expected ')' (board/main.kicad_sch:12); board: board-unreadable: no outline",
        )

    def test_no_failed_stage_gives_no_reason(self) -> None:
        from app.services.design_bundle import manifest as manifest_rules

        manifest = {"stages": {stage: {"status": "complete"} for stage in ("parse", "board", "models")}}
        manifest["stages"]["board"] = {"status": "partial"}
        self.assertEqual(manifest_rules.failure_reasons(manifest), "")


if __name__ == "__main__":
    unittest.main()
