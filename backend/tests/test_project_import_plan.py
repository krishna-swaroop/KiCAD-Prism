from __future__ import annotations

import unittest
from pathlib import Path

from app.services.project_import_plan import build_project_import_plan
from app.services.project_import_service import DiscoveredProject


def _project(
    name: str, relative_path: str, project_file: str = ""
) -> DiscoveredProject:
    return DiscoveredProject(
        name=name,
        relative_path=relative_path,
        full_path="",
        has_schematic=True,
        has_pcb=True,
        project_file=project_file,
    )


class ProjectImportPlanTests(unittest.TestCase):
    def test_single_root_project_uses_the_repository_name(self) -> None:
        board = _project("ignored", ".", "board.kicad_pro")
        first = build_project_import_plan(
            repo_url="https://example.com/boards.git",
            repo_name="boards",
            import_type="type1",
            discovered=[board],
            requested_paths=[],
            already_imported=set(),
            existing_repo=None,
            existing_rows=[],
            projects_root="/srv/projects",
        )
        second = build_project_import_plan(
            repo_url="https://example.com/boards.git",
            repo_name="boards",
            import_type="type1",
            discovered=[board],
            requested_paths=["client-hint-ignored"],
            already_imported=set(),
            existing_repo=None,
            existing_rows=[],
            projects_root="/srv/projects",
        )
        self.assertEqual(first, second)
        self.assertEqual(first.target_path, "/srv/projects/type1/boards")
        self.assertEqual(first.selected[0].name, "boards")
        self.assertEqual(first.selected[0].register_relative_path, ".")

    def test_monorepo_subset_keeps_requested_order_and_drops_the_rest(self) -> None:
        alpha = _project("alpha", "hw/alpha", "alpha.kicad_pro")
        beta = _project("beta", "hw/beta", "beta.kicad_pro")
        gamma = _project("gamma", "hw/gamma", "gamma.kicad_pro")
        plan = build_project_import_plan(
            repo_url="https://example.com/mono.git",
            repo_name="mono",
            import_type="type2",
            discovered=[alpha, beta, gamma],
            requested_paths=[beta.project_key, alpha.project_key],
            already_imported=set(),
            existing_repo=None,
            existing_rows=[],
            projects_root="/srv/projects",
        )
        self.assertEqual([item.key for item in plan.selected], [beta.project_key, alpha.project_key])
        self.assertNotIn(gamma.project_key, plan.selected_keys)

    def test_shared_directory_expands_to_every_project_inside_it(self) -> None:
        top = _project("top", ".", "top.kicad_pro")
        base = _project("base", ".", "base.kicad_pro")
        plan = build_project_import_plan(
            repo_url="https://example.com/fixture.git",
            repo_name="fixture",
            import_type="type2",
            discovered=[top, base],
            requested_paths=["."],
            already_imported=set(),
            existing_repo=None,
            existing_rows=[],
            projects_root="/srv/projects",
        )
        self.assertEqual([item.key for item in plan.selected], [top.project_key, base.project_key])

    def test_already_imported_keys_are_omitted_from_the_plan(self) -> None:
        kept = _project("kept", "hw/kept", "kept.kicad_pro")
        skip = _project("skip", "hw/skip", "skip.kicad_pro")
        plan = build_project_import_plan(
            repo_url="https://example.com/mono.git",
            repo_name="mono",
            import_type="type2",
            discovered=[kept, skip],
            requested_paths=[kept.project_key, skip.project_key],
            already_imported={skip.project_key},
            existing_repo={"id": "repo-1", "name": "mono"},
            existing_rows=[],
            projects_root="/srv/projects",
            existing_checkout_path="/srv/projects/type2/mono",
        )
        self.assertEqual([item.key for item in plan.selected], [kept.project_key])
        self.assertEqual(plan.existing_repo_id, "repo-1")
        self.assertEqual(plan.target_path, "/srv/projects/type2/mono")

    def test_already_imported_selection_fails_closed(self) -> None:
        board = _project("board", "hw/board", "board.kicad_pro")
        with self.assertRaisesRegex(ValueError, "already imported"):
            build_project_import_plan(
                repo_url="https://example.com/mono.git",
                repo_name="mono",
                import_type="type2",
                discovered=[board],
                requested_paths=[board.project_key],
                already_imported={board.project_key},
                existing_repo={"id": "repo-1", "name": "mono"},
                existing_rows=[],
                projects_root="/srv/projects",
            )

    def test_legacy_directory_row_is_adopted_once(self) -> None:
        board = _project("board", "hw/board", "board.kicad_pro")
        plan = build_project_import_plan(
            repo_url="https://example.com/mono.git",
            repo_name="mono",
            import_type="type2",
            discovered=[board],
            requested_paths=[board.project_key],
            already_imported=set(),
            existing_repo={"id": "repo-1", "name": "mono"},
            existing_rows=[
                {
                    "id": "legacy-1",
                    "relative_path": "hw/board",
                    "project_file_rel": "",
                    "name": "board",
                }
            ],
            projects_root="/srv/projects",
            existing_checkout_path="/checkout",
        )
        self.assertEqual(plan.selected[0].adopt_project_id, "legacy-1")
        again = build_project_import_plan(
            repo_url="https://example.com/mono.git",
            repo_name="mono",
            import_type="type2",
            discovered=[board],
            requested_paths=[board.project_key],
            already_imported=set(),
            existing_repo={"id": "repo-1", "name": "mono"},
            existing_rows=[
                {
                    "id": "legacy-1",
                    "relative_path": "hw/board",
                    "project_file_rel": "",
                    "name": "board",
                }
            ],
            projects_root="/srv/projects",
            existing_checkout_path="/checkout",
        )
        self.assertEqual(plan, again)

    def test_unknown_paths_never_enter_the_plan(self) -> None:
        board = _project("board", "hw/board", "board.kicad_pro")
        with self.assertRaisesRegex(ValueError, "not KiCad projects"):
            build_project_import_plan(
                repo_url="https://example.com/mono.git",
                repo_name="mono",
                import_type="type2",
                discovered=[board],
                requested_paths=["../../../etc"],
                already_imported=set(),
                existing_repo=None,
                existing_rows=[],
                projects_root="/srv/projects",
            )


class RegisterPlannedProjectsTests(unittest.TestCase):
    def test_executor_registers_only_planned_projects(self) -> None:
        from unittest import mock
        from types import SimpleNamespace

        from app.services.project_import_service import _register_planned_projects

        alpha = _project("alpha", "hw/alpha", "alpha.kicad_pro")
        plan = build_project_import_plan(
            repo_url="https://example.com/mono.git",
            repo_name="mono",
            import_type="type2",
            discovered=[alpha, _project("beta", "hw/beta", "beta.kicad_pro")],
            requested_paths=[alpha.project_key],
            already_imported=set(),
            existing_repo=None,
            existing_rows=[],
            projects_root="/tmp",
        )
        registered: list[str] = []
        with (
            mock.patch(
                "app.services.project_import_service.resolve_cached_paths",
                return_value={},
            ),
            mock.patch(
                "app.services.project_import_service.workspace.register_project",
                side_effect=lambda **kwargs: registered.append(kwargs["relative_path"])
                or f"id-{kwargs['relative_path']}",
            ),
        ):
            ids = _register_planned_projects(
                plan,
                Path("/tmp/type2/mono"),
                "repo-1",
                SimpleNamespace(check_cancelled=mock.Mock(), progress=mock.Mock()),
            )
        self.assertEqual(registered, ["hw/alpha"])
        self.assertEqual(ids, ["id-hw/alpha"])
        self.assertNotIn("hw/beta", registered)


if __name__ == "__main__":
    unittest.main()
