"""Board renders run as their own jobs.

Rendering used to happen inline in the import job: one `kicad-cli` call per
project, sequentially, each with a two minute timeout, while the job held an
import slot and its reported progress sat at 80%. A twenty board monorepo could
occupy a worker for most of an hour before anything appeared in the workspace.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import project_import_service


class ThumbnailJobEnqueue(unittest.TestCase):
    def test_enqueue_takes_a_repository_read_lock(self) -> None:
        # A render reads the checkout, so it must not run while sync is
        # fast-forwarding it, but two renders may run together.
        with (
            mock.patch.object(
                project_import_service.workspace,
                "get_project_by_id",
                return_value={"id": "prj_1", "repo_id": "repo_1"},
            ),
            mock.patch.object(
                project_import_service.v3_jobs, "enqueue", return_value={"job_id": "job-1"}
            ) as enqueue,
        ):
            job_id = project_import_service.start_thumbnail_job("prj_1")

        self.assertEqual(job_id, "job-1")
        call = enqueue.call_args
        self.assertEqual(call.args[0], "project_thumbnail")
        self.assertEqual(call.kwargs["locks"][0]["mode"], "read")
        self.assertEqual(call.kwargs["locks"][0]["key"], "repository:repo_1")
        # It must not consume an import slot; those are for clones.
        self.assertNotIn("import", call.kwargs["resources"])

    def test_unknown_project_queues_nothing(self) -> None:
        with (
            mock.patch.object(
                project_import_service.workspace, "get_project_by_id", return_value=None
            ),
            mock.patch.object(project_import_service.v3_jobs, "enqueue") as enqueue,
        ):
            self.assertIsNone(project_import_service.start_thumbnail_job("missing"))
        enqueue.assert_not_called()

    def test_bulk_enqueue_validates_before_starting_each_job(self) -> None:
        with (
            mock.patch.object(
                project_import_service.workspace,
                "get_project_by_id",
                side_effect=lambda project_id: {"id": project_id},
            ),
            mock.patch.object(
                project_import_service,
                "start_thumbnail_job",
                side_effect=["job-1", "job-2"],
            ) as start,
        ):
            job_ids = project_import_service.start_thumbnail_jobs(
                ["prj_1", "prj_2", "prj_1"],
                requested_by="designer@example.com",
            )

        self.assertEqual(job_ids, ["job-1", "job-2"])
        self.assertEqual(
            start.call_args_list,
            [
                mock.call("prj_1", requested_by="designer@example.com"),
                mock.call("prj_2", requested_by="designer@example.com"),
            ],
        )

    def test_bulk_enqueue_rejects_missing_project_before_starting_jobs(self) -> None:
        with (
            mock.patch.object(
                project_import_service.workspace,
                "get_project_by_id",
                side_effect=lambda project_id: None if project_id == "missing" else {"id": project_id},
            ),
            mock.patch.object(project_import_service, "start_thumbnail_job") as start,
        ):
            with self.assertRaisesRegex(ValueError, "Project not found: missing"):
                project_import_service.start_thumbnail_jobs(["prj_1", "missing"])

        start.assert_not_called()


class ThumbnailJobHandler(unittest.TestCase):
    def test_handler_renders_and_records_the_result(self) -> None:
        with tempfile.TemporaryDirectory() as project_path:
            context = SimpleNamespace(
                payload={"project_id": "prj_1"},
                check_cancelled=mock.Mock(),
                progress=lambda **values: None,
            )
            with (
                mock.patch.object(
                    project_import_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "prj_1", "path": project_path},
                ),
                mock.patch.object(
                    project_import_service,
                    "generate_thumbnail_for_project",
                    return_value=True,
                ) as generate,
                mock.patch.object(
                    project_import_service,
                    "resolve_cached_paths",
                    return_value={"thumbnail_source": "generated"},
                ),
                mock.patch.object(
                    project_import_service.workspace, "update_project"
                ) as update_project,
            ):
                result = project_import_service.run_project_thumbnail_job_v3(context)

        generate.assert_called_once()
        update_project.assert_called_once_with(
            "prj_1", thumbnail_source="generated"
        )
        self.assertTrue(result.details["rendered"])

    def test_handler_fails_when_the_renderer_produces_no_thumbnail(self) -> None:
        with tempfile.TemporaryDirectory() as project_path:
            context = SimpleNamespace(
                payload={"project_id": "prj_1"},
                check_cancelled=mock.Mock(),
                progress=lambda **values: None,
            )

            def failed_render(_project_path, logs):
                logs.append("kicad-cli render failed (code 1): render error")
                return False

            with (
                mock.patch.object(
                    project_import_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "prj_1", "path": project_path},
                ),
                mock.patch.object(
                    project_import_service,
                    "generate_thumbnail_for_project",
                    side_effect=failed_render,
                ),
                mock.patch.object(
                    project_import_service, "refresh_project_assets"
                ) as refresh,
            ):
                with self.assertRaisesRegex(RuntimeError, "kicad-cli render failed"):
                    project_import_service.run_project_thumbnail_job_v3(context)

        refresh.assert_not_called()

    def test_handler_completes_as_not_applicable_when_project_has_no_board(self) -> None:
        with tempfile.TemporaryDirectory() as project_path:
            context = SimpleNamespace(
                payload={"project_id": "prj_1"},
                check_cancelled=mock.Mock(),
                progress=lambda **values: None,
            )

            def no_board(_project_path, logs):
                logs.append(f"No .kicad_pcb file found to generate thumbnail for {_project_path}")
                return False

            with (
                mock.patch.object(
                    project_import_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "prj_1", "path": project_path},
                ),
                mock.patch.object(
                    project_import_service,
                    "generate_thumbnail_for_project",
                    side_effect=no_board,
                ),
                mock.patch.object(
                    project_import_service, "refresh_project_assets", return_value={}
                ) as refresh,
            ):
                result = project_import_service.run_project_thumbnail_job_v3(context)

        refresh.assert_called_once_with("prj_1")
        self.assertEqual(result.message, "No board to render")
        self.assertFalse(result.details["rendered"])

    def test_handler_rejects_a_project_whose_checkout_is_gone(self) -> None:
        context = SimpleNamespace(
            payload={"project_id": "prj_1"},
            check_cancelled=mock.Mock(),
            progress=lambda **values: None,
        )
        with mock.patch.object(
            project_import_service.workspace,
            "get_project_by_id",
            return_value={"id": "prj_1", "path": "/nope/does-not-exist"},
        ):
            with self.assertRaises(ValueError):
                project_import_service.run_project_thumbnail_job_v3(context)


class ImportQueuesRendersRatherThanBlocking(unittest.TestCase):
    def test_import_does_not_render_inline(self) -> None:
        discovered = [
            project_import_service.DiscoveredProject(
                name="board", relative_path=".", full_path="", has_schematic=True, has_pcb=True
            )
        ]
        with tempfile.TemporaryDirectory() as root:
            context = SimpleNamespace(
                payload={
                    "repo_url": "https://example.com/boards.git",
                    "import_type": "type1",
                    "selected_paths": [],
                },
                check_cancelled=mock.Mock(),
                progress=lambda **values: None,
            )

            def clone(_url, target, **_kwargs):
                Path(target).mkdir(parents=True, exist_ok=True)
                return mock.Mock()

            with (
                mock.patch.object(
                    project_import_service.project_service, "PROJECTS_ROOT", root
                ),
                mock.patch.object(
                    project_import_service, "find_existing_repository", return_value=None
                ),
                mock.patch.object(
                    project_import_service,
                    "discover_projects_from_repo",
                    return_value=discovered,
                ),
                mock.patch.object(
                    project_import_service.Repo, "clone_from", side_effect=clone
                ),
                mock.patch.object(
                    project_import_service, "resolve_cached_paths", return_value={}
                ),
                mock.patch.object(
                    project_import_service.workspace,
                    "register_repository",
                    return_value="repo-1",
                ),
                mock.patch.object(
                    project_import_service.workspace,
                    "register_project",
                    return_value="prj-1",
                ),
                mock.patch.object(
                    project_import_service, "generate_thumbnail_for_project"
                ) as generate,
                mock.patch.object(
                    project_import_service, "start_thumbnail_job", return_value="job-t1"
                ) as start_thumbnail,
            ):
                result = project_import_service.run_project_import_job_v3(context)

        generate.assert_not_called()
        start_thumbnail.assert_called_once_with("prj-1", requested_by="project-import")
        self.assertEqual(result.details["thumbnail_job_ids"], ["job-t1"])

    def test_a_failure_to_queue_a_render_does_not_fail_the_import(self) -> None:
        # The projects are already registered at that point; a missing thumbnail
        # is cosmetic and must not roll back a completed import.
        discovered = [
            project_import_service.DiscoveredProject(
                name="board", relative_path=".", full_path="", has_schematic=True, has_pcb=True
            )
        ]
        with tempfile.TemporaryDirectory() as root:
            context = SimpleNamespace(
                payload={
                    "repo_url": "https://example.com/boards.git",
                    "import_type": "type1",
                    "selected_paths": [],
                },
                check_cancelled=mock.Mock(),
                progress=lambda **values: None,
            )

            def clone(_url, target, **_kwargs):
                Path(target).mkdir(parents=True, exist_ok=True)
                return mock.Mock()

            with (
                mock.patch.object(
                    project_import_service.project_service, "PROJECTS_ROOT", root
                ),
                mock.patch.object(
                    project_import_service, "find_existing_repository", return_value=None
                ),
                mock.patch.object(
                    project_import_service,
                    "discover_projects_from_repo",
                    return_value=discovered,
                ),
                mock.patch.object(
                    project_import_service.Repo, "clone_from", side_effect=clone
                ),
                mock.patch.object(
                    project_import_service, "resolve_cached_paths", return_value={}
                ),
                mock.patch.object(
                    project_import_service.workspace,
                    "register_repository",
                    return_value="repo-1",
                ),
                mock.patch.object(
                    project_import_service.workspace,
                    "register_project",
                    return_value="prj-1",
                ),
                mock.patch.object(
                    project_import_service,
                    "start_thumbnail_job",
                    side_effect=RuntimeError("queue unavailable"),
                ),
            ):
                result = project_import_service.run_project_import_job_v3(context)

        self.assertEqual(result.details["project_ids"], ["prj-1"])
        self.assertEqual(result.details["thumbnail_job_ids"], [])


if __name__ == "__main__":
    unittest.main()
