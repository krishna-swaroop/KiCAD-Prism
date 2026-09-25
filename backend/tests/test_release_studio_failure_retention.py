"""Regression coverage for durable Release Studio failure diagnostics."""

from __future__ import annotations

import io
import json
import asyncio
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.api import release_studio as api
from app.services import release_studio_build_service as build_service
from app.services.job_artifact_service import JobArtifactService
from app.services.job_runtime import JobCancelled, JobContext


class _FencedJobService:
    """Small fenced service fake that retains the artifact publication record."""

    def __init__(self) -> None:
        self.artifacts: list[dict[str, object]] = []
        self.status = "running"
        self.register_kwargs: dict[str, object] = {}

    def get(self, job_id: str) -> dict[str, object]:
        return {"job_id": job_id, "fence": 1, "status": self.status}

    def progress(self, *args, **kwargs) -> bool:  # noqa: ANN002,ANN003 - JobService seam
        return True

    def register_fenced_artifacts(self, job_id, worker_id, fence, artifacts, **kwargs):  # noqa: ANN001
        self.register_kwargs = dict(kwargs)
        self.artifacts.extend(dict(item) for item in artifacts)
        return [f"artifact-{len(self.artifacts)}"]


def _read_failure_archive(artifact: dict[str, object]) -> tuple[dict[str, object], str]:
    with tarfile.open(fileobj=io.BytesIO(Path(str(artifact["object_path"])).read_bytes()), mode="r:gz") as archive:
        failure = json.loads(archive.extractfile("failure.json").read())  # type: ignore[union-attr]
        log = archive.extractfile("logs/build-failure.log").read().decode("utf-8")  # type: ignore[union-attr]
    return failure, log


def _archive_bytes(artifact: dict[str, object]) -> bytes:
    return Path(str(artifact["object_path"])).read_bytes()


class ReleaseStudioFailureRetentionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.service = _FencedJobService()

    def _context(self, *, payload: dict[str, object]) -> JobContext:
        with patch("app.services.job_runtime.job_state_root", return_value=self.root):
            return JobContext(
                {"job_id": "release-failure-test", "fence": 1, "status": "running", "payload": payload},
                worker_id="test-worker",
                service=self.service,  # type: ignore[arg-type]
            )

    def test_cancellation_registration_uses_authoritative_lease_claim_not_worker_id(self) -> None:
        """ws_jobs owns lease_owner; a made-up worker_id column is unsafe."""

        source = (
            Path(__file__).resolve().parents[1]
            / "app"
            / "services"
            / "job_service.py"
        ).read_text(encoding="utf-8")
        method = source[source.index("def register_fenced_artifacts"):source.index("def complete_artifact")]
        self.assertIn("self._authoritative_claim(", method)
        self.assertIn("statuses=allowed_statuses", method)
        self.assertNotIn("SELECT status, fence, worker_id FROM ws_jobs", method)

    def test_prepare_failure_retains_attempt_and_publishes_diagnostic_evidence(self) -> None:
        context = self._context(
            payload={
                "project_id": "project-1",
                "config_key": "production",
                "commit_sha": "a" * 40,
                "variant": "rev-a",
                "author": "operator-1",
            }
        )
        retained = {
            "id": "build-prepare-failed",
            "candidate_id": "candidate-prepare-failed",
            "status": "running",
        }
        terminal: list[dict[str, object]] = []

        with (
            patch(
                "app.services.workspace_service.workspace.get_project_by_id",
                return_value={"path": str(self.root), "repo_id": "repo-1", "relative_path": "."},
            ),
            patch.object(
                build_service,
                "prepare_candidate",
                side_effect=RuntimeError("closure token=super-secret unavailable"),
            ),
            patch.object(build_service.store, "record_prepare_failure", return_value=retained) as record,
            patch.object(
                build_service.store,
                "fail_build",
                side_effect=lambda build_id, **kwargs: terminal.append(
                    {"build_id": build_id, **kwargs}
                ),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "closure token"):
                build_service.run_release_studio_build_job(context)

        self.assertEqual(record.call_count, 1)
        self.assertEqual(len(terminal), 1)
        self.assertEqual(terminal[0]["build_id"], retained["id"])
        self.assertEqual(terminal[0]["evidence_artifact_id"], "artifact-1")
        self.assertEqual(len(self.service.artifacts), 1)
        failure, log = _read_failure_archive(self.service.artifacts[0])
        self.assertEqual(failure["failure"]["code"], "prepare_failed")
        self.assertIn("[REDACTED]", failure["failure"]["message"])
        self.assertNotIn("super-secret", log)
        self.assertEqual(failure["pipeline"]["jobs"][0]["steps"][0]["status"], "failure")
        self._assert_failure_log_api(retained, self.service.artifacts[0])

    def test_prepare_failure_configuration_is_a_captured_build_detail_snapshot(self) -> None:
        """Reopening a retained prepare failure must not touch Git or mutable HEAD."""

        captured = {
            "configuration_snapshot_captured": True,
            "configuration_document": {
                "schema": "prism.release-studio.configuration/1",
                "title": "Preparation failure: production",
                "board": "", "schematic": "", "default_variant": "",
                "fields": {}, "notes": {"failure_context": "preparation did not complete"}, "variants": [], "typography": "inter",
                "vendors": [], "document_number": "", "revision": "",
            },
        }
        from app.release_studio.config import technical_config_digest

        candidate = {
            **captured,
            "id": "candidate-prepare-failed",
            "project_id": "project-1",
            "config_key": "production",
            "technical_config_digest": technical_config_digest(captured["configuration_document"]),
        }
        build = {
            "id": "build-prepare-failed", "candidate_id": candidate["id"],
            "status": "failed", "evidence_artifact_id": "artifact-1",
        }
        user = SimpleNamespace(role="viewer", email="viewer@example.com")
        with (
            patch.object(api, "get_project_for_role_or_404"),
            patch.object(api, "_build_or_404", return_value=build),
            patch.object(api.store, "get_candidate", return_value=candidate),
            patch.object(api.workspace, "get_project_by_id", return_value={"repo_url": ""}),
            patch.object(api.store, "build_members", return_value=[]),
            patch.object(api.store, "build_evidence", return_value=[]),
            patch.object(api.store, "build_fingerprints", return_value={}),
            patch.object(api.store, "latest_review_decision", return_value=None),
            patch.object(api.store, "get_publish_record", return_value=None),
            patch.object(api, "_vendor_readiness", return_value=[]),
            patch.object(api.forge_publish, "list_releases", return_value=[]),
        ):
            detail = asyncio.run(api.get_build("project-1", build["id"], user))
        self.assertEqual(
            detail["configuration"]["notes"]["failure_context"],
            "preparation did not complete",
        )
        self.assertEqual(detail["build"]["status"], "failed")

    def test_post_start_failure_marks_attempt_and_publishes_diagnostic_evidence(self) -> None:
        context = self._context(payload={"author": "operator-1"})
        closure = self.root / "closure"
        closure.mkdir()
        build = {"id": "build-post-start", "candidate_id": "candidate-post-start", "status": "running"}
        failed: list[dict[str, object]] = []
        candidate = {
            "id": "candidate-post-start",
            "commit_sha": "b" * 40,
            "config_key": "production",
            "variant": "rev-b",
            "build_key": "c" * 64,
            "technical_config_digest": "d" * 64,
            "input_closure_digest": "e" * 64,
        }

        def fail_build(build_id, **kwargs):  # noqa: ANN001 - service seam
            failed.append({"id": build_id, "status": "failed", **kwargs})

        with (
            patch.object(build_service.store, "start_build", return_value=build),
            patch.object(build_service.store, "fail_build", side_effect=fail_build),
            patch.object(
                build_service,
                "run_step_catalogue",
                side_effect=RuntimeError("tool token=post-start-secret failed"),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "post-start-secret"):
                build_service.execute_build(
                    context,
                    candidate=candidate,
                    closure_root=closure,
                    config={"board": "hardware/board.kicad_pcb"},
                    artifacts=JobArtifactService(root=self.root),
                )

        self.assertEqual(len(failed), 1)
        self.assertEqual(failed[0]["id"], build["id"])
        self.assertEqual(failed[0]["status"], "failed")
        self.assertEqual(failed[0]["error_code"], "build_failed")
        self.assertEqual(failed[0]["evidence_artifact_id"], "artifact-1")
        self.assertEqual(len(self.service.artifacts), 1)
        failure, log = _read_failure_archive(self.service.artifacts[0])
        self.assertEqual(failure["failure"]["code"], "build_failed")
        self.assertIn("[REDACTED]", failure["failure"]["message"])
        self.assertNotIn("post-start-secret", log)
        self.assertEqual(failure["pipeline"]["jobs"][0]["steps"][0]["status"], "success")
        self._assert_failure_log_api(build, self.service.artifacts[0])

    def test_cancellation_marks_build_cancelled_and_retains_log_evidence(self) -> None:
        context = self._context(payload={"author": "operator-1"})
        closure = self.root / "closure-cancelled"
        closure.mkdir()
        build = {"id": "build-cancelled", "candidate_id": "candidate-cancelled", "status": "running"}
        cancelled: list[dict[str, object]] = []
        candidate = {
            "id": "candidate-cancelled", "commit_sha": "c" * 40,
            "config_key": "production", "variant": "", "build_key": "d" * 64,
            "technical_config_digest": "e" * 64, "input_closure_digest": "f" * 64,
        }
        self.service.status = "cancel_requested"

        with (
            patch.object(build_service.store, "start_build", return_value=build),
            patch.object(
                build_service.store, "cancel_build",
                side_effect=lambda build_id, **kwargs: cancelled.append(
                    {"id": build_id, "status": "cancelled", **kwargs}
                ),
            ),
            patch.object(
                build_service, "run_step_catalogue",
                side_effect=JobCancelled("Cancellation requested"),
            ),
        ):
            with self.assertRaises(JobCancelled):
                build_service.execute_build(
                    context, candidate=candidate, closure_root=closure,
                    config={"board": "hardware/board.kicad_pcb"},
                    artifacts=JobArtifactService(root=self.root),
                )

        self.assertEqual(cancelled[0]["status"], "cancelled")
        self.assertEqual(cancelled[0]["evidence_artifact_id"], "artifact-1")
        self.assertEqual(
            self.service.register_kwargs["allowed_statuses"],
            ("running", "cancel_requested"),
        )
        failure, log = _read_failure_archive(self.service.artifacts[0])
        self.assertEqual(failure["failure"]["code"], "cancelled")
        self.assertIn("Cancellation requested", log)
        self._assert_failure_log_api(build, self.service.artifacts[0])

    def test_success_evidence_log_api_exposes_explicit_success_status(self) -> None:
        from app.release_studio.canonical import write_deterministic_archive
        from app.release_studio.canonical.json import canonical_json_bytes

        archive = write_deterministic_archive(
            {
                "build-evidence.json": canonical_json_bytes(
                    {
                        "steps": {
                            "drc": {
                                "step_type": "drc", "returncode": 0,
                                "elapsed_ms": 5, "skipped_reason": "", "status": "success",
                            }
                        },
                        "timings": [],
                    }
                ),
                "logs/drc.log": b"DRC clean\n",
            }
        )
        build = {"id": "build-success", "evidence_artifact_id": "artifact-success"}
        user = SimpleNamespace(role="viewer")
        with (
            patch.object(api, "get_project_for_role_or_404"),
            patch.object(api, "_build_or_404", return_value=build),
            patch.object(api, "_artifact_bytes", return_value=archive),
        ):
            listed = asyncio.run(api.list_build_logs("project-1", build["id"], user))
            response = asyncio.run(api.download_build_log("project-1", build["id"], "drc", user))
        self.assertEqual(listed["steps"][0]["status"], "success")
        self.assertEqual(response.body, b"DRC clean\n")

    def _assert_failure_log_api(
        self, build: dict[str, object], artifact: dict[str, object]
    ) -> None:
        """The normal list/read endpoints must serve reopened failed attempts."""

        build = {**build, "evidence_artifact_id": "artifact-1"}
        user = SimpleNamespace(role="viewer")
        with (
            patch.object(api, "get_project_for_role_or_404"),
            patch.object(api, "_build_or_404", return_value=build),
            patch.object(api, "_artifact_bytes", return_value=_archive_bytes(artifact)),
        ):
            listed = asyncio.run(api.list_build_logs("project-1", str(build["id"]), user))
            response = asyncio.run(
                api.download_build_log("project-1", str(build["id"]), "build-failure", user)
            )
        self.assertIn("build-failure", {step["step_id"] for step in listed["steps"]})
        self.assertTrue(response.body.decode("utf-8").strip())


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
