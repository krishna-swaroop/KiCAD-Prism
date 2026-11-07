"""How a job's end settles the feature rows that track it.

Design comparisons and release builds keep their own state next to the job
row. These tests stage failures through the real runner
(``tests.in_memory_jobs``) and check that the feature rows end where the job
ended.
"""

from __future__ import annotations

import copy
import json
import os
import shutil
import tempfile
import unittest
import uuid
from pathlib import Path
from typing import Any
from unittest import mock

from app.services import release_studio_build_service as build_service
from app.services import event_log, release_build_attempts
from app.services.job_artifact_service import JobArtifactService
from app.services.kicad_tools import KicadTools
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from tests.in_memory_jobs import (
    InMemoryJobService,
    ProcessKilled,
    run_attempt,
    supervise_exit,
)
from tests.kicad_tool_fakes import FakeTool
from support.postgres import requires_scratch_postgres, scratch_schema
from tests.release_studio_support import (
    RECORDING_ROOT,
    documents_stub,
    fixture_root,
    synthetic_bundle_design,
)

RECORDING = RECORDING_ROOT / "synthetic-build" / "recording.json"
WORKER_A = "prism:host-a:1:aaaa"
WORKER_B = "prism:host-b:2:bbbb"


class InMemoryReleaseStore:
    """The build and candidate rows ``release_studio_service`` keeps, in memory."""

    def __init__(self, jobs: InMemoryJobService) -> None:
        self.jobs = jobs
        self.builds: dict[str, dict[str, Any]] = {}
        self.candidates: dict[str, str] = {}

    def start_build(self, candidate_id: str, *, job_id: str | None, fence: int) -> dict[str, Any]:
        attempt = 1 + sum(1 for row in self.builds.values() if row["candidate_id"] == candidate_id)
        build_id = f"build-{len(self.builds) + 1}"
        self.builds[build_id] = {
            "id": build_id,
            "candidate_id": candidate_id,
            "job_id": job_id,
            "fence": fence,
            "attempt": attempt,
            "status": "running",
            "error_code": "",
        }
        self.candidates[candidate_id] = "building"
        return dict(self.builds[build_id])

    def _terminal(self, build_id: str, status: str, candidate_status: str, **values: Any) -> None:
        build = self.builds[build_id]
        if build["status"] != "running":
            raise build_service.store.ReleaseStudioError(
                f"cannot settle terminal/non-running build with status {build['status']!r}"
            )
        build.update(status=status, **values)
        newer = any(
            row["candidate_id"] == build["candidate_id"] and row["attempt"] > build["attempt"]
            for row in self.builds.values()
        )
        if not newer:  # as release_studio_service: only the newest attempt moves the candidate
            self.candidates[build["candidate_id"]] = candidate_status

    def complete_build(self, *, build_id: str, **kwargs: Any) -> dict[str, Any]:
        self._terminal(build_id, "succeeded", "built")
        return {**self.builds[build_id], "manifest_digest": "m", "dossier_digest": "d"}

    def fail_build(self, build_id: str, *, error_code: str, error_message: str, **kwargs: Any) -> None:
        self._terminal(build_id, "failed", "failed", error_code=error_code)

    def cancel_build(self, build_id: str, *, message: str, **kwargs: Any) -> None:
        self._terminal(build_id, "cancelled", "draft", error_code="cancelled")

    def running_builds_for_job(self, job_id: str) -> list[dict[str, Any]]:
        return [
            dict(row)
            for row in self.builds.values()
            if row["job_id"] == job_id and row["status"] == "running"
        ]

    def orphaned_build_job_ids(self, limit: int = 100) -> list[str]:
        orphaned = []
        for row in self.builds.values():
            job = self.jobs.rows[row["job_id"]]
            live = job["status"] in {"running", "cancel_requested"} and job["fence"] == row["fence"]
            if row["status"] == "running" and not live:
                orphaned.append(row["job_id"])
        return sorted(set(orphaned))

    def patches(self) -> list[Any]:
        return [
            mock.patch.object(build_service.attempts, name, getattr(self, name), create=True)
            for name in (
                "start_build",
                "complete_build",
                "fail_build",
                "cancel_build",
                "running_builds_for_job",
                "orphaned_build_job_ids",
            )
        ]


class _Stack:
    def __init__(self, patches: list[Any]) -> None:
        self.patches = patches

    def __enter__(self) -> "_Stack":
        for patch in self.patches:
            patch.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        for patch in reversed(self.patches):
            patch.stop()


class ReleaseBuildOutcomeTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        # The document sheets render through prism-kicad (C3 chunk F3).
        documents = documents_stub()
        documents.__enter__()
        self.addCleanup(documents.__exit__, None, None, None)
        self.root = Path(tmp.name)
        self.closure = self.root / "closure"
        shutil.copytree(fixture_root("synthetic"), self.closure)
        self.jobs = InMemoryJobService()
        self.store = InMemoryReleaseStore(self.jobs)
        self.job_id = self.jobs.enqueue(
            "release_studio_build",
            {"project_id": "project-1", "commit_sha": "a" * 40, "author": "a@example.com"},
        )["job_id"]

    def _candidate(self) -> dict[str, Any]:
        return {
            "id": "candidate-1",
            "project_id": "project-1",
            "commit_sha": "a" * 40,
            "config_key": "default",
            "variant": "",
            "build_key": "b" * 64,
            "technical_config_digest": "c" * 64,
            "input_closure_digest": "d" * 64,
            "_closure_root": str(self.closure),
            "_config": {"board": "synthetic.kicad_pcb", "schematic": "synthetic.kicad_sch", "vendors": []},
            "_bundle_design": synthetic_bundle_design(self.closure),
        }

    def _attempt(self, worker_id: str, cli: Any) -> int:
        """Claim and run one attempt of the real build handler with ``cli``."""

        claimed = self.jobs.claim(worker_id, worker_pool="prism")
        assert claimed is not None and claimed["job_id"] == self.job_id
        staging = self.root / "jobs" / "staging" / self.job_id / str(claimed["fence"])
        tool = cli(staging) if callable(cli) and not isinstance(cli, FakeTool) else cli
        with _Stack(
            [
                *self.store.patches(),
                mock.patch(
                    "app.services.workspace_service.workspace.get_project_by_id",
                    return_value={"path": str(self.root), "repo_id": "repo-1", "relative_path": "."},
                ),
                mock.patch.object(build_service, "prepare_candidate", return_value=self._candidate()),
                mock.patch.object(
                    build_service.KicadTools, "resolve", return_value=KicadTools(cli=tool)
                ),
                mock.patch.object(
                    build_service, "executor_image", return_value="prism/kicad@sha256:" + "e" * 64
                ),
                mock.patch(
                    "app.services.job_artifact_service.job_state_root", return_value=self.root / "jobs"
                ),
            ]
        ):
            return run_attempt(
                self.jobs,
                self.job_id,
                worker_id,
                build_service.run_release_studio_build_job,
                state_root=self.root / "jobs",
            )

    def _build(self) -> dict[str, Any]:
        (build,) = self.store.builds.values()
        return build

    def test_a_cancel_that_kills_the_runner_settles_the_build_as_cancelled(self) -> None:
        def cancelled_mid_tool(*_args: Any, **_kwargs: Any) -> None:
            self.jobs.request_cancel(self.job_id)
            raise ProcessKilled()  # the supervisor's SIGTERM

        exit_code = self._attempt(WORKER_A, FakeTool(cancelled_mid_tool))
        with _Stack(self.store.patches()):
            supervise_exit(self.jobs, self.job_id, WORKER_A, exit_code)

        self.assertEqual(self.jobs.rows[self.job_id]["status"], "cancelled")
        self.assertEqual(self._build()["status"], "cancelled")
        self.assertEqual(self.store.candidates["candidate-1"], "draft")

    def test_a_crashed_runner_settles_the_build_as_failed(self) -> None:
        def killed(*_args: Any, **_kwargs: Any) -> None:
            raise ProcessKilled()  # OOM killer

        exit_code = self._attempt(WORKER_A, FakeTool(killed))
        with _Stack(self.store.patches()):
            supervise_exit(self.jobs, self.job_id, WORKER_A, exit_code)

        self.assertEqual(self.jobs.rows[self.job_id]["status"], "failed")
        build = self._build()
        self.assertEqual(build["status"], "failed")
        self.assertEqual(build["error_code"], "runner_exited")
        self.assertEqual(self.store.candidates["candidate-1"], "failed")

    def test_the_sweep_settles_a_lost_attempt_and_leaves_the_live_one(self) -> None:
        from app.services.job_handlers import sweep_job_ends

        def host_a_dies(*_args: Any, **_kwargs: Any) -> None:
            raise ProcessKilled()

        self._attempt(WORKER_A, FakeTool(host_a_dies))
        self.jobs.expire(self.job_id)  # host A is gone and stops heartbeating
        seen: dict[str, Any] = {}

        def sweep_mid_build(*_args: Any, **_kwargs: Any) -> None:
            with _Stack(self.store.patches()):
                sweep_job_ends(self.jobs)
            seen.update(copy.deepcopy(self.store.builds))
            seen["candidate"] = self.store.candidates["candidate-1"]
            raise ProcessKilled()

        self._attempt(WORKER_B, FakeTool(sweep_mid_build))

        self.assertEqual(seen["build-1"]["status"], "failed")
        self.assertEqual(seen["build-1"]["error_code"], "lease_lost")
        self.assertEqual(seen["build-2"]["status"], "running")
        self.assertEqual(seen["candidate"], "building")

    @unittest.skipUnless(RECORDING.is_file(), "the synthetic build recording is not checked out")
    def test_a_late_cancel_never_leaves_job_and_build_disagreeing(self) -> None:
        from app.services.kicad_tool_replay import ReplayTool

        real_complete = self.store.complete_build

        def complete_then_cancel(**kwargs: Any) -> dict[str, Any]:
            completed = real_complete(**kwargs)
            self.jobs.request_cancel(self.job_id)  # the user presses Cancel now
            return completed

        self.store.complete_build = complete_then_cancel  # type: ignore[method-assign]
        exit_code = self._attempt(
            WORKER_A,
            lambda staging: ReplayTool(RECORDING, {"closure": self.closure, "staging": staging}),
        )
        with _Stack(self.store.patches()):
            supervise_exit(self.jobs, self.job_id, WORKER_A, exit_code)

        job_status = self.jobs.rows[self.job_id]["status"]
        build_status = self._build()["status"]
        self.assertEqual(
            (job_status, build_status) in {("completed", "succeeded"), ("cancelled", "cancelled")},
            True,
            f"job {job_status} but build {build_status}",
        )


class ReleaseBuildRowFencingTests(unittest.TestCase):
    """A stale attempt must not move the candidate a newer attempt is building."""

    def setUp(self) -> None:
        from app.services import release_studio_service as store
        from app.services.job_service import jobs
        from app.services.postgres_database import database

        jobs.initialize()
        self.store = store
        from app.services import release_build_attempts

        self.attempts = release_build_attempts
        self.database = database
        suffix = uuid.uuid4().hex[:12]
        self.project_id = f"prj_{suffix}"
        self.repo_id = f"repo_{suffix}"
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                "INSERT INTO ws_repositories (id, name, url, clone_path, cloned_at)"
                " VALUES (%s, %s, %s, %s, NOW())",
                (self.repo_id, self.repo_id, f"https://example.invalid/{self.repo_id}.git", f"/nonexistent/{self.repo_id}"),
            )
            conn.execute(
                "INSERT INTO ws_projects (id, repo_id, name, registered_at, last_modified)"
                " VALUES (%s, %s, %s, NOW(), NOW())",
                (self.project_id, self.repo_id, self.project_id),
            )
            conn.commit()
        # Rows stay: the audit chain is append-only, and each xdist worker has its own database.

    def _candidate_status(self, candidate_id: str) -> str:
        return str(self.store.get_candidate(candidate_id)["status"])

    def _two_attempts(self) -> tuple[dict[str, Any], dict[str, Any]]:
        first = self.attempts.record_prepare_failure(
            project_id=self.project_id,
            repository_id=self.repo_id,
            config_key="release",
            commit_sha="a" * 40,
            variant="",
            job_id=None,
            fence=1,
            author="a@example.com",
            error="",
        )
        second = self.attempts.start_build(first["candidate_id"], job_id=None, fence=2)
        return first, second

    def test_a_stale_attempt_failing_leaves_the_candidate_building(self) -> None:
        first, second = self._two_attempts()
        self.attempts.fail_build(first["id"], error_code="build_failed", error_message="lease lost")
        self.assertEqual(self.store.get_build(first["id"])["status"], "failed")
        self.assertEqual(self._candidate_status(first["candidate_id"]), "building")

    def test_a_stale_attempt_cancelling_leaves_the_candidate_building(self) -> None:
        first, second = self._two_attempts()
        self.attempts.cancel_build(first["id"], message="Cancelled")
        self.assertEqual(self._candidate_status(first["candidate_id"]), "building")

    def test_the_latest_attempt_still_settles_the_candidate(self) -> None:
        first, second = self._two_attempts()
        self.attempts.fail_build(second["id"], error_code="build_failed", error_message="boom")
        self.assertEqual(self._candidate_status(first["candidate_id"]), "failed")


    def _claimed_job(self, payload: dict[str, Any] | None = None) -> tuple[Any, dict[str, Any]]:
        from app.services.job_service import JobService

        service = JobService()
        pool = f"test-{uuid.uuid4().hex[:8]}"
        service.enqueue("release_studio_build", payload or {}, worker_pool=pool)
        claimed = service.claim("worker-a", worker_pool=pool)
        return service, claimed

    def test_a_raise_in_settle_rolls_the_completion_back(self) -> None:
        service, job = self._claimed_job()

        def refuse(conn: Any) -> None:
            conn.execute("UPDATE ws_jobs SET message = 'touched' WHERE id = %s", (job["job_id"],))
            raise RuntimeError("build row is stale")

        with self.assertRaisesRegex(RuntimeError, "stale"):
            service.complete(job["job_id"], "worker-a", job["fence"], settle=refuse)
        current = service.get(job["job_id"])
        self.assertEqual(current["status"], "running")
        self.assertNotEqual(current["message"], "touched")
        self.assertTrue(
            service.complete(
                job["job_id"], "worker-a", job["fence"], settle=lambda conn: conn.execute("SELECT 1")
            )
        )
        self.assertEqual(service.get(job["job_id"])["status"], "completed")

    def test_an_attempt_left_by_an_ended_job_is_found_and_settled(self) -> None:
        from app.services import release_build_attempts

        service, job = self._claimed_job()
        first, _second = self._two_attempts()
        build = self.attempts.start_build(first["candidate_id"], job_id=job["job_id"], fence=job["fence"])
        self.assertNotIn(job["job_id"], self.attempts.orphaned_build_job_ids())

        service.fail(job["job_id"], "worker-a", job["fence"], error_code="runner_exited", error_message="gone")
        self.assertIn(job["job_id"], self.attempts.orphaned_build_job_ids(limit=10_000))
        self.assertEqual(release_build_attempts.settle_build_job(service.get(job["job_id"])), 1)
        settled = self.store.get_build(build["id"])
        self.assertEqual((settled["status"], settled["error_code"]), ("failed", "runner_exited"))
        self.assertEqual(self._candidate_status(first["candidate_id"]), "failed")
        self.assertEqual(release_build_attempts.settle_build_job(service.get(job["job_id"])), 0)

    def test_a_job_that_ends_without_success_settles_its_persisted_pipeline(self) -> None:
        from app.services import release_build_attempts

        def pipeline() -> dict[str, Any]:
            return {
                "jobs": [
                    {
                        "id": "checks",
                        "name": "Checks",
                        "status": "queued",
                        "steps": [
                            {"id": "drc", "name": "DRC", "status": "in_progress"},
                            {"id": "erc", "name": "ERC", "status": "queued"},
                            {"id": "bom", "name": "BOM", "status": "success"},
                        ],
                    }
                ]
            }

        for job_status, step_status in (("failed", "failure"), ("cancelled", "cancelled")):
            with self.subTest(status=job_status):
                service, job = self._claimed_job({"pipeline": pipeline()})
                if job_status == "failed":
                    service.fail(job["job_id"], "worker-a", job["fence"], error_code="runner_exited", error_message="gone")
                else:
                    service.finalize_cancel(job["job_id"], "worker-a", job["fence"])
                release_build_attempts.settle_build_job(service.get(job["job_id"]))
                settled = service.get(job["job_id"])["payload"]["pipeline"]["jobs"][0]
                # The running step takes the job's end; a step that never started is cancelled either way.
                self.assertEqual([step["status"] for step in settled["steps"]], [step_status, "cancelled", "success"])
                self.assertEqual(settled["status"], step_status)


@requires_scratch_postgres("the release.candidate_built producer")
class ReleaseCandidateBuiltEventTests(unittest.TestCase):
    def setUp(self) -> None:
        self.events = scratch_schema(self, "release_build_events", ledgers=(WORKSPACE_LEDGER,))
        self.enterContext(mock.patch.object(event_log, "connect", self.events.connection))
        self.enterContext(
            mock.patch.object(release_build_attempts, "running_builds_for_job", return_value=[])
        )

    def _events(self):
        with self.events.connect() as conn:
            return conn.execute("SELECT kind, project_id, payload FROM ws_events").fetchall()

    def test_a_completed_build_job_appends_release_candidate_built(self) -> None:
        job = {
            "job_id": "job-1",
            "id": "job-1",
            "status": "completed",
            "project_id": None,
            "result_metadata": {
                "build_id": "build-1",
                "commit": "c" * 40,
                "project_id": "p1",
            },
        }

        self.assertEqual(release_build_attempts.settle_build_job(job), 0)

        self.assertEqual(
            [(event["kind"], event["project_id"]) for event in self._events()],
            [("release.candidate_built", "p1")],
        )
        self.assertEqual(
            self._events()[0]["payload"],
            {"buildId": "build-1", "commit": "c" * 40},
        )

    def test_a_job_that_did_not_complete_appends_nothing(self) -> None:
        job = {
            "job_id": "job-1",
            "status": "failed",
            "project_id": "p1",
            "result_metadata": {"build_id": "build-1", "commit": "c" * 40},
        }
        self.assertEqual(release_build_attempts.settle_build_job(job), 0)
        self.assertEqual(self._events(), [])


class CatalogImportJobSettleTests(unittest.TestCase):
    """A catalog import session ends with its job, not with its process."""

    def setUp(self) -> None:
        from app.services import catalog_worker_tasks

        self.tasks = catalog_worker_tasks
        self.sessions = {"session-1": "scanning"}

    def _job(self, status: str = "failed") -> dict[str, Any]:
        return {
            "job_id": "job-1",
            "kind": "project_component_import",
            "status": status,
            "payload": {"session_id": "session-1"},
            "error_message": "The worker died",
        }

    def _patches(self) -> tuple[Any, ...]:
        def get_session(session_id: str) -> dict[str, Any] | None:
            status = self.sessions.get(session_id)
            return {"id": session_id, "status": status} if status else None

        def update_session(session_id: str, *, status: str, error_message: str = "") -> None:
            self.sessions[session_id] = status

        def running(session_ids: list[str]) -> set[str]:
            return {session_id for session_id in session_ids if self.sessions.get(session_id) in self.tasks.RUNNING_STATUSES}

        return (
            mock.patch.object(self.tasks.catalog_service, "get_project_import_session", side_effect=get_session),
            mock.patch.object(self.tasks.catalog_service, "update_project_import_session", side_effect=update_session),
            mock.patch.object(self.tasks, "_running_import_session_ids", side_effect=running),
            mock.patch("app.services.job_queries.newest_jobs", return_value=[self._job()]),
        )

    def test_a_failed_or_cancelled_job_fails_its_running_session(self) -> None:
        for status in ("failed", "cancelled"):
            with self.subTest(status=status):
                self.sessions = {"session-1": "scanning"}
                get_session, update_session, _running, _newest = self._patches()
                with get_session, update_session:
                    self.assertTrue(self.tasks.settle_import_job(self._job(status)))
                self.assertEqual(self.sessions["session-1"], "failed")

    def test_orphans_lists_the_job_only_until_its_session_is_settled(self) -> None:
        get_session, update_session, running, newest = self._patches()
        with get_session, update_session, running, newest:
            self.assertEqual(
                self.tasks._unsettled_import_job_ids("project_component_import"), ["job-1"]
            )
            self.assertTrue(self.tasks.settle_import_job(self._job()))
            self.assertEqual(self.tasks._unsettled_import_job_ids("project_component_import"), [])

    def test_a_staged_session_is_left_alone(self) -> None:
        self.sessions = {"session-1": "staged"}
        get_session, update_session, _running, _newest = self._patches()
        with get_session, update_session:
            self.assertFalse(self.tasks.settle_import_job(self._job()))


if __name__ == "__main__":
    unittest.main()
