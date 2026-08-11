"""Branch selection at import, and importing further projects from a repository
that is already registered.

Before this, import always took the remote's default branch, and a repository
could only ever be imported once -- so picking three boards out of a twenty
board monorepo made the other seventeen unreachable.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import project_import_service


def _project(relative_path: str, name: str) -> project_import_service.DiscoveredProject:
    return project_import_service.DiscoveredProject(
        name=name,
        relative_path=relative_path,
        full_path="",
        has_schematic=True,
        has_pcb=True,
    )


class ImportRunner:
    """Drives the import handler with the filesystem and workspace stubbed out."""

    def __init__(self, discovered, existing_repo=None, existing_projects=()):
        self.discovered = discovered
        self.existing_repo = existing_repo
        self.existing_projects = list(existing_projects)
        self.clone_calls: list[dict] = []
        self.registered_projects: list[dict] = []
        self.register_repository = mock.Mock(return_value="repo-new")

    def run(self, payload: dict, projects_root: str):
        context = SimpleNamespace(
            payload=payload,
            check_cancelled=mock.Mock(),
            progress=lambda **values: None,
        )

        def clone(url, target, **kwargs):
            self.clone_calls.append({"url": url, "target": target, **kwargs})
            Path(target).mkdir(parents=True, exist_ok=True)
            return mock.Mock()

        def register_project(**kwargs):
            self.registered_projects.append(kwargs)
            return f"prj-{len(self.registered_projects)}"

        with (
            mock.patch.object(
                project_import_service.project_service, "PROJECTS_ROOT", projects_root
            ),
            mock.patch.object(
                project_import_service,
                "find_existing_repository",
                return_value=self.existing_repo,
            ),
            mock.patch.object(
                project_import_service,
                "discover_projects_from_repo",
                return_value=self.discovered,
            ),
            mock.patch.object(
                project_import_service.workspace,
                "get_projects_by_repo",
                return_value=self.existing_projects,
            ),
            mock.patch.object(
                project_import_service.workspace,
                "repository_clone_path",
                return_value=str(Path(projects_root) / "type2" / "boards"),
            ),
            mock.patch.object(
                project_import_service.workspace,
                "register_repository",
                self.register_repository,
            ),
            mock.patch.object(
                project_import_service.workspace,
                "register_project",
                side_effect=register_project,
            ),
            mock.patch.object(project_import_service.Repo, "clone_from", side_effect=clone),
            mock.patch.object(
                project_import_service, "generate_thumbnail_for_project", return_value=False
            ),
            mock.patch.object(
                project_import_service, "resolve_cached_paths", return_value={}
            ),
        ):
            return project_import_service.run_project_import_job_v3(context)


class ClonesTheRequestedBranch(unittest.TestCase):
    def test_ref_is_passed_to_git_clone(self) -> None:
        runner = ImportRunner([_project(".", "board")])
        with tempfile.TemporaryDirectory() as root:
            runner.run(
                {
                    "repo_url": "https://example.com/boards.git",
                    "import_type": "type1",
                    "selected_paths": [],
                    "ref": "release/v2",
                },
                root,
            )
        self.assertTrue(runner.clone_calls)
        for call in runner.clone_calls:
            self.assertEqual(call.get("branch"), "release/v2")

    def test_omitting_ref_leaves_git_on_the_default_branch(self) -> None:
        runner = ImportRunner([_project(".", "board")])
        with tempfile.TemporaryDirectory() as root:
            runner.run(
                {
                    "repo_url": "https://example.com/boards.git",
                    "import_type": "type1",
                    "selected_paths": [],
                },
                root,
            )
        for call in runner.clone_calls:
            self.assertNotIn("branch", call)

    def test_a_ref_that_looks_like_an_option_is_rejected(self) -> None:
        runner = ImportRunner([_project(".", "board")])
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                runner.run(
                    {
                        "repo_url": "https://example.com/boards.git",
                        "import_type": "type1",
                        "selected_paths": [],
                        "ref": "--upload-pack=id",
                    },
                    root,
                )


class AddsProjectsToAnAlreadyImportedRepository(unittest.TestCase):
    def setUp(self) -> None:
        self.discovered = [
            _project("hardware/board-a", "board-a"),
            _project("hardware/board-b", "board-b"),
            _project("hardware/board-c", "board-c"),
        ]
        self.existing_repo = {"id": "repo-1", "name": "boards"}

    def test_new_projects_are_added_without_recloning(self) -> None:
        runner = ImportRunner(
            self.discovered,
            existing_repo=self.existing_repo,
            existing_projects=[{"relative_path": "hardware/board-a"}],
        )
        with tempfile.TemporaryDirectory() as root:
            # The checkout already exists on disk, so it is adopted.
            checkout = Path(root) / "type2" / "boards"
            checkout.mkdir(parents=True)
            with mock.patch.object(
                project_import_service, "Repo", side_effect=self._adoptable_repo
            ):
                result = runner.run(
                    {
                        "repo_url": "https://example.com/boards.git",
                        "import_type": "type2",
                        "selected_paths": ["hardware/board-b", "hardware/board-c"],
                    },
                    root,
                )

        self.assertEqual(len(result.details["project_ids"]), 2)
        # The repository row is reused, not duplicated.
        runner.register_repository.assert_not_called()
        self.assertEqual(result.details["repo_id"], "repo-1")
        self.assertEqual(
            [p["relative_path"] for p in runner.registered_projects],
            ["hardware/board-b", "hardware/board-c"],
        )

    def test_already_registered_projects_are_skipped(self) -> None:
        runner = ImportRunner(
            self.discovered,
            existing_repo=self.existing_repo,
            existing_projects=[{"relative_path": "hardware/board-a"}],
        )
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / "type2" / "boards").mkdir(parents=True)
            with mock.patch.object(
                project_import_service, "Repo", side_effect=self._adoptable_repo
            ):
                result = runner.run(
                    {
                        "repo_url": "https://example.com/boards.git",
                        "import_type": "type2",
                        "selected_paths": ["hardware/board-a", "hardware/board-b"],
                    },
                    root,
                )
        self.assertEqual(
            [p["relative_path"] for p in runner.registered_projects],
            ["hardware/board-b"],
        )
        self.assertEqual(len(result.details["project_ids"]), 1)

    def test_reimporting_only_known_projects_is_a_clear_error(self) -> None:
        runner = ImportRunner(
            self.discovered,
            existing_repo=self.existing_repo,
            existing_projects=[{"relative_path": "hardware/board-a"}],
        )
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / "type2" / "boards").mkdir(parents=True)
            with mock.patch.object(
                project_import_service, "Repo", side_effect=self._adoptable_repo
            ):
                with self.assertRaises(ValueError) as caught:
                    runner.run(
                        {
                            "repo_url": "https://example.com/boards.git",
                            "import_type": "type2",
                            "selected_paths": ["hardware/board-a"],
                        },
                        root,
                    )
        self.assertIn("already imported", str(caught.exception))

    @staticmethod
    def _adoptable_repo(path):
        repo = mock.Mock()
        repo.remotes = [SimpleNamespace(url="https://example.com/boards.git")]
        repo.working_tree_dir = str(path)
        repo.git.ls_files.return_value = ""
        return repo


if __name__ == "__main__":
    unittest.main()
