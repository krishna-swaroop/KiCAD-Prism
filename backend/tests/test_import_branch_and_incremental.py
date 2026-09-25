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


def _project(
    relative_path: str, name: str, project_file: str = ""
) -> project_import_service.DiscoveredProject:
    return project_import_service.DiscoveredProject(
        name=name,
        relative_path=relative_path,
        full_path="",
        has_schematic=True,
        has_pcb=True,
        project_file=project_file,
    )


class ImportRunner:
    """Drives the import handler with the filesystem and workspace stubbed out."""

    def __init__(self, discovered, existing_repo=None, existing_projects=()):
        self.discovered = discovered
        self.existing_repo = existing_repo
        self.existing_projects = list(existing_projects)
        self.clone_calls: list[dict] = []
        self.registered_projects: list[dict] = []
        self.resolved_anchors: list[str | None] = []
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

        def resolve_cached_paths(project_path, *, current_source=None, anchor=None):
            self.resolved_anchors.append(anchor)
            return {"project_file_rel": anchor or ""}

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
                project_import_service,
                "resolve_cached_paths",
                side_effect=resolve_cached_paths,
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


class ImportsProjectsThatShareADirectory(unittest.TestCase):
    """Two KiCad projects in one directory are two projects, not one.

    A repository keeping a fixture's top and base plate side by side in its root
    imported as a single project: both were discovered, but both answered to the
    directory `"."`, so only one row was registered -- named after one board
    while the viewer rendered the other.
    """

    def setUp(self) -> None:
        self.discovered = [
            _project(".", "base", "base.kicad_pro"),
            _project(".", "top", "top.kicad_pro"),
        ]

    def _run(self, payload_paths, existing_projects=(), existing_repo=None):
        runner = ImportRunner(
            self.discovered,
            existing_repo=existing_repo,
            existing_projects=existing_projects,
        )
        with tempfile.TemporaryDirectory() as root:
            if existing_repo:
                (Path(root) / "type2" / "boards").mkdir(parents=True)
                with mock.patch.object(
                    project_import_service,
                    "Repo",
                    side_effect=AddsProjectsToAnAlreadyImportedRepository._adoptable_repo,
                ):
                    result = runner.run(self._payload(payload_paths), root)
            else:
                result = runner.run(self._payload(payload_paths), root)
        return runner, result

    @staticmethod
    def _payload(paths):
        return {
            "repo_url": "https://example.com/boards.git",
            "import_type": "type2",
            "selected_paths": paths,
        }

    def test_selecting_one_project_imports_only_that_project(self) -> None:
        runner, result = self._run([".::top.kicad_pro"])
        self.assertEqual(len(result.details["project_ids"]), 1)
        self.assertEqual([p["name"] for p in runner.registered_projects], ["top"])
        self.assertEqual(runner.resolved_anchors, ["top.kicad_pro"])

    def test_selecting_both_projects_registers_both(self) -> None:
        runner, result = self._run([".::base.kicad_pro", ".::top.kicad_pro"])
        self.assertEqual(len(result.details["project_ids"]), 2)
        self.assertEqual([p["name"] for p in runner.registered_projects], ["base", "top"])
        self.assertEqual(
            [p["relative_path"] for p in runner.registered_projects], [".", "."]
        )
        self.assertEqual(
            [p["project_file_rel"] for p in runner.registered_projects],
            ["base.kicad_pro", "top.kicad_pro"],
        )

    def test_naming_a_directory_still_means_every_project_in_it(self) -> None:
        # What every client sent before projects had keys.
        runner, _ = self._run(["."])
        self.assertEqual([p["name"] for p in runner.registered_projects], ["base", "top"])

    def test_a_sibling_is_still_importable_once_the_other_is_registered(self) -> None:
        runner, _ = self._run(
            [".::top.kicad_pro"],
            existing_projects=[{"relative_path": ".", "project_file_rel": "base.kicad_pro"}],
            existing_repo={"id": "repo-1", "name": "boards"},
        )
        self.assertEqual([p["name"] for p in runner.registered_projects], ["top"])

    def test_a_project_registered_twice_is_refused(self) -> None:
        with self.assertRaises(ValueError) as caught:
            self._run(
                [".::base.kicad_pro"],
                existing_projects=[
                    {"relative_path": ".", "project_file_rel": "base.kicad_pro"}
                ],
                existing_repo={"id": "repo-1", "name": "boards"},
            )
        self.assertIn("already imported", str(caught.exception))

    def test_an_unknown_project_key_is_rejected(self) -> None:
        with self.assertRaises(ValueError) as caught:
            self._run([".::missing.kicad_pro"])
        self.assertIn("not KiCad projects", str(caught.exception))


class ImportsFromAPlaintextSelfHostedServer(unittest.TestCase):
    """An internal Git server without TLS, once the operator has allowed one.

    `http://` is refused by default and enabled with `IMPORT_ALLOW_INSECURE_HTTP`.
    That switch only ever governed the URL the user types: the two places that
    read a remote back -- the deduplication scan and the checkout-adoption
    check -- parsed it under the default policy instead, so a workspace
    configured for a plaintext server could import a repository once and then
    failed every time it went back to the same checkout.
    """

    url = "http://git.internal.example/hw/boards.git"

    def setUp(self) -> None:
        self.discovered = [
            _project("hardware/board-a", "board-a"),
            _project("hardware/board-b", "board-b"),
        ]
        patcher = mock.patch.object(
            project_import_service,
            "remote_url_policy",
            return_value=project_import_service.RemoteUrlPolicy.build(
                allow_insecure_http=True
            ),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def _checkout_on_this_remote(self, path):
        repo = mock.Mock()
        repo.remotes = [SimpleNamespace(url=self.url)]
        repo.working_tree_dir = str(path)
        repo.git.ls_files.return_value = ""
        return repo

    def test_a_second_import_adopts_the_existing_checkout(self) -> None:
        runner = ImportRunner(
            self.discovered,
            existing_repo={"id": "repo-1", "name": "boards"},
            existing_projects=[{"relative_path": "hardware/board-a"}],
        )
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / "type2" / "boards").mkdir(parents=True)
            with mock.patch.object(
                project_import_service, "Repo", side_effect=self._checkout_on_this_remote
            ):
                result = runner.run(
                    {
                        "repo_url": self.url,
                        "import_type": "type2",
                        "selected_paths": ["hardware/board-b"],
                    },
                    root,
                )
        self.assertEqual(len(result.details["project_ids"]), 1)
        self.assertEqual(
            [p["relative_path"] for p in runner.registered_projects],
            ["hardware/board-b"],
        )

    def test_a_stored_plaintext_url_is_recognised_across_spellings(self) -> None:
        # Deduplication fell back to an exact string comparison, which a
        # trailing `.git` defeats -- so the same repository imported twice.
        stored = [{"id": "repo-1", "url": "http://git.internal.example/hw/boards"}]
        with mock.patch.object(
            project_import_service.workspace, "get_repositories", return_value=stored
        ):
            found = project_import_service.find_existing_repository(
                project_import_service.parse_remote_url(
                    self.url, project_import_service.remote_url_policy()
                )
            )
        self.assertEqual(found, stored[0])
