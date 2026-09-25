from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import project_import_service


class ImportFollowUpSchedulingTests(unittest.TestCase):
    def test_one_enqueue_failure_names_the_project_and_operation(self) -> None:
        discovered = [
            project_import_service.DiscoveredProject(
                name="board",
                relative_path=".",
                full_path="",
                has_schematic=True,
                has_pcb=True,
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
                ) as register_project,
                mock.patch.object(
                    project_import_service,
                    "start_project_metadata_job",
                    return_value="job-meta",
                ),
                mock.patch.object(
                    project_import_service,
                    "start_thumbnail_job",
                    side_effect=RuntimeError("queue unavailable"),
                ),
            ):
                result = project_import_service.run_project_import_job_v3(context)

        self.assertEqual(result.details["project_ids"], ["prj-1"])
        register_project.assert_called_once()
        self.assertEqual(
            result.details["follow_ups"],
            [
                {
                    "project_id": "prj-1",
                    "operation": "metadata",
                    "status": "queued",
                    "job_id": "job-meta",
                },
                {
                    "project_id": "prj-1",
                    "operation": "thumbnail",
                    "status": "failed",
                    "error": "queue unavailable",
                },
            ],
        )

    def test_retry_reuses_an_active_job_and_leaves_the_project(self) -> None:
        seen: dict[tuple[str, str], dict[str, str]] = {}

        def enqueue(kind, payload, **kwargs):
            key = (str(kind), str(kwargs.get("artifact_key") or ""))
            existing = seen.get(key)
            if existing:
                return {**existing, "deduplicated": True}
            created = {"job_id": f"job-{len(seen) + 1}"}
            seen[key] = created
            return created

        with (
            mock.patch.object(
                project_import_service.workspace,
                "get_project_by_id",
                return_value={"id": "prj-1", "repo_id": "repo-1"},
            ),
            mock.patch.object(project_import_service.v3_jobs, "enqueue", side_effect=enqueue),
            mock.patch.object(
                project_import_service.workspace,
                "delete_project",
                side_effect=AssertionError("retry must not delete imported projects"),
            ),
        ):
            first = project_import_service.retry_import_follow_ups("prj-1")
            second = project_import_service.retry_import_follow_ups("prj-1")

        self.assertEqual([item["job_id"] for item in first], ["job-1", "job-2"])
        self.assertEqual([item["job_id"] for item in second], ["job-1", "job-2"])
        self.assertEqual(len(seen), 2)
        self.assertTrue(all(item["status"] == "queued" for item in second))


if __name__ == "__main__":
    unittest.main()
