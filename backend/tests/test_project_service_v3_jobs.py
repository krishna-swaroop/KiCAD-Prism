from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import project_service, semantic_visualizer_service
from app.services.job_runtime import PreparedArtifact


class ProjectServiceV3JobTests(unittest.TestCase):
    def test_job_status_preserves_authoritative_queue_status(self) -> None:
        with mock.patch.object(
            project_service.v3_jobs,
            "get",
            return_value={
                "job_id": "job-webgpu",
                "kind": "webgpu_3d",
                "status": "completed",
                "stage": "completed",
                "result_metadata": {
                    "schema": "prism.webgpu_3d_status_a0",
                    "status": "ready",
                    "available": True,
                },
                "error_message": "",
            },
        ):
            status = project_service.get_job_status("job-webgpu")

        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["stage"], "completed")
        self.assertEqual(status["schema"], "prism.webgpu_3d_status_a0")
        self.assertTrue(status["available"])

    def test_job_status_merges_staged_payload_for_pollers(self) -> None:
        with mock.patch.object(
            project_service.v3_jobs,
            "get",
            return_value={
                "job_id": "job-webgpu",
                "kind": "webgpu_3d",
                "status": "running",
                "stage": "compile-assets",
                "payload": {
                    "bundle_url": "/api/projects/p1/webgpu-3d/manifest/source/build",
                    "readiness_stage": "board-ready",
                    "readiness": {
                        "stage": "board-ready",
                        "progress": 35,
                        "revision": "rev-1",
                    },
                    "logs": ["Published staged bundle: board-ready (board)"],
                },
                "result_metadata": {},
                "error_message": "",
            },
        ):
            status = project_service.get_job_status("job-webgpu")

        self.assertEqual(status["status"], "running")
        self.assertEqual(status["readiness_stage"], "board-ready")
        self.assertIn("bundle_url", status)
        self.assertEqual(len(status["logs"]), 1)

    def test_thumbnail_url_is_content_versioned_when_digest_is_available(self) -> None:
        self.assertEqual(
            project_service.thumbnail_url_for_row(
                {
                    "id": "project 1",
                    "thumbnail_rel": "assets/thumbnail/thumb.webp",
                    "thumbnail_digest": "digest-a",
                }
            ),
            "/api/projects/project%201/thumbnail/digest-a",
        )
        self.assertEqual(
            project_service.thumbnail_url_for_row(
                {
                    "id": "project-1",
                    "thumbnail_rel": "assets/thumbnail/legacy.png",
                }
            ),
            "/api/projects/project-1/thumbnail",
        )

    def test_semantic_index_enqueue_uses_compile_slot_and_read_lock(self) -> None:
        with (
            mock.patch.object(
                project_service.workspace,
                "get_project_by_id",
                return_value={
                    "id": "project-1",
                    "repo_id": "repo-1",
                    "last_modified": "revision",
                },
            ),
            mock.patch.object(
                project_service.v3_jobs,
                "enqueue",
                return_value={"job_id": "job-semantic"},
            ) as enqueue,
        ):
            job_id = project_service.start_semantic_index_job(
                "project-1",
                commit="abc123",
                requested_by="designer@example.com",
            )

        self.assertEqual(job_id, "job-semantic")
        call = enqueue.call_args
        self.assertEqual(call.args[0], "semantic_index")
        self.assertEqual(call.kwargs["resources"]["semantic_compile"], 1)
        self.assertEqual(
            call.kwargs["locks"],
            [{"key": "repository:repo-1", "mode": "read"}],
        )

    def test_semantic_index_handler_publishes_immutable_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            context = SimpleNamespace(
                payload={
                    "project_id": "project-1",
                    "commit": "abc123",
                    "force": False,
                    "artifact_key": "semantic-key",
                },
                staging_dir=Path(temporary),
                check_cancelled=mock.Mock(),
                progress=mock.Mock(),
            )
            project = SimpleNamespace(id="project-1")
            prepared = PreparedArtifact(
                kind="semantic_index",
                artifact_key="semantic-key",
                digest="digest",
                object_path="/objects/digest",
                size_bytes=10,
            )
            with (
                mock.patch.object(
                    project_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "project-1"},
                ),
                mock.patch.object(
                    project_service,
                    "_workspace_row_to_project",
                    return_value=project,
                ),
                mock.patch.object(
                    project_service.semantic_index_service,
                    "generate",
                    return_value={
                        "schema": "semantic-a0",
                        "sourceRevisionKey": "source",
                        "generator": {"build": "build"},
                    },
                ),
                mock.patch.object(
                    project_service.job_artifacts,
                    "prepare_json",
                    return_value=prepared,
                ) as prepare,
            ):
                result = project_service.run_semantic_index_job_v3(context)

        self.assertEqual(result.artifact, prepared)
        self.assertTrue(result.details["available"])
        prepare.assert_called_once()

    def test_kicad_workflow_enqueue_uses_global_slot_and_repository_write_lock(
        self,
    ) -> None:
        with (
            mock.patch.object(
                project_service.workspace,
                "get_project_by_id",
                return_value={"id": "project-1", "repo_id": "repo-1"},
            ),
            mock.patch.object(
                project_service.v3_jobs,
                "enqueue",
                return_value={"job_id": "job-workflow"},
            ) as enqueue,
        ):
            job_id = project_service.start_workflow_job(
                "project-1",
                "manufacturing",
                "designer@example.com",
            )

        self.assertEqual(job_id, "job-workflow")
        call = enqueue.call_args
        self.assertEqual(call.args[0], "kicad_workflow")
        self.assertEqual(call.args[1]["workflow_type"], "manufacturing")
        self.assertEqual(call.kwargs["resources"]["workflow"], 1)
        self.assertEqual(
            call.kwargs["locks"],
            [{"key": "repository:repo-1", "mode": "write"}],
        )
        self.assertEqual(call.kwargs["max_attempts"], 1)

    def test_kicad_workflow_handler_executes_jobset_without_api_thread(self) -> None:
        progress_updates: list[dict[str, object]] = []
        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            (project_root / "board.kicad_pro").write_text("", encoding="utf-8")
            jobset = project_root / "Outputs.kicad_jobset"
            jobset.write_text("{}", encoding="utf-8")
            context = SimpleNamespace(
                payload={
                    "project_id": "project-1",
                    "workflow_type": "design",
                    "author": "designer@example.com",
                },
                check_cancelled=mock.Mock(),
                progress=lambda **values: progress_updates.append(values),
            )
            project = SimpleNamespace(path=str(project_root))
            process = mock.Mock()
            process.stdout = ["first line\n", "second line\n"]
            process.wait.return_value = 0
            repository = mock.Mock()
            repository.is_dirty.return_value = False

            with (
                mock.patch.object(
                    project_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "project-1"},
                ),
                mock.patch.object(
                    project_service,
                    "_workspace_row_to_project",
                    return_value=project,
                ),
                mock.patch.object(
                    project_service.path_config_service,
                    "get_path_config",
                    return_value=SimpleNamespace(jobset="Outputs.kicad_jobset"),
                ),
                mock.patch.object(
                    project_service.path_config_service,
                    "resolve_paths",
                    return_value=SimpleNamespace(jobset_path=str(jobset)),
                ),
                mock.patch.object(
                    project_service.subprocess,
                    "Popen",
                    return_value=process,
                ) as popen,
                mock.patch.object(project_service, "Repo", return_value=repository),
            ):
                result = project_service.run_kicad_workflow_job_v3(context)

        self.assertEqual(result.message, "Workflow completed successfully")
        self.assertEqual(result.details["workflow_type"], "design")
        self.assertEqual(progress_updates[-1]["stage"], "git-sync")
        command = popen.call_args.args[0]
        self.assertEqual(command[1:3], ["jobset", "run"])
        self.assertIn("28dab1d3-7bf2-4d8a-9723-bcdd14e1d814", command)
        repository.git.add.assert_not_called()

    def test_webgpu_adapter_uses_list_for_legacy_performance_events(self) -> None:
        progress_updates: list[dict[str, object]] = []
        with tempfile.TemporaryDirectory() as temporary:
            staging_dir = Path(temporary)
            context = SimpleNamespace(
                job_id="job-webgpu",
                fence=1,
                payload={
                    "project_id": "project-1",
                    "commit": "abc123",
                    "force": False,
                    "artifact_key": "artifact-key",
                },
                staging_dir=staging_dir,
                check_cancelled=mock.Mock(),
                progress=lambda **values: progress_updates.append(values),
            )
            project = SimpleNamespace(id="project-1")

            def build_for_commit(
                _project: object,
                _commit: str,
                state: dict[str, object],
                persist: object,
                *,
                force: bool,
            ) -> dict[str, object]:
                self.assertIsInstance(state["performance"], list)
                performance = state["performance"]
                assert isinstance(performance, list)
                performance.append({"stage": "compiler.subprocess", "elapsed_ms": 12.5})
                state["stage"] = "compile-assets"
                state["message"] = "Compiling"
                state["percent"] = 55
                state["bundle_url"] = "/api/projects/project-1/webgpu-3d/manifest/source/build"
                state["readiness"] = {
                    "schema": "prism.visualizer_readiness.a0",
                    "stage": "board-ready",
                    "progress": 35,
                    "available_assets": ["board"],
                    "revision": "rev-board",
                }
                state["readiness_stage"] = "board-ready"
                state["sourceRevisionKey"] = "source"
                state["source_fingerprint"] = "source"
                assert callable(persist)
                persist()
                return {
                    "source_fingerprint": "source",
                    "build_fingerprint": "build",
                    "schema": "schema-a0",
                }

            bundle_path = staging_dir / "source-bundle.json"
            bundle_path.write_text('{"schema":"bundle"}', encoding="utf-8")
            prepared = PreparedArtifact(
                kind="webgpu_3d",
                artifact_key="artifact-key",
                digest="digest",
                object_path="/objects/digest",
                size_bytes=bundle_path.stat().st_size,
            )

            with (
                mock.patch.object(
                    project_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "project-1", "last_modified": "rev-1"},
                ),
                mock.patch.object(
                    project_service,
                    "_workspace_row_to_project",
                    return_value=project,
                ),
                mock.patch.object(
                    semantic_visualizer_service,
                    "build_visualizer_bundle_for_commit",
                    side_effect=build_for_commit,
                ),
                mock.patch.object(
                    semantic_visualizer_service,
                    "bundle_path",
                    return_value=bundle_path,
                ),
                mock.patch.object(
                    project_service.job_artifacts,
                    "prepare_file",
                    return_value=prepared,
                ),
                mock.patch.object(
                    semantic_visualizer_service,
                    "sync_staged_webgpu_status",
                    mock.Mock(),
                ) as sync_staged,
            ):
                result = project_service.run_webgpu_3d_job_v3(context)

        sync_staged.assert_called()
        payload_update = progress_updates[-1].get("payload_updates") or {}
        self.assertIn("bundle_url", payload_update)
        self.assertEqual(payload_update.get("readiness_stage"), "board-ready")

        self.assertEqual(
            result.details["performance"],
            [{"stage": "compiler.subprocess", "elapsed_ms": 12.5}],
        )
        self.assertEqual(result.artifact, prepared)
        self.assertEqual(progress_updates[-1]["stage"], "compile-assets")
        self.assertEqual(progress_updates[-1]["percent"], 55.0)


if __name__ == "__main__":
    unittest.main()
