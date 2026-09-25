"""Immutable project-import plans.

Selection, already-imported filtering and legacy-row adoption are decided
here. The worker clones and registers only what the plan names.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class PlannedImportProject:
    key: str
    name: str
    relative_path: str
    project_file: str
    adopt_project_id: str | None
    register_relative_path: str


@dataclass(frozen=True)
class ProjectImportPlan:
    repo_url: str
    repo_name: str
    import_type: str
    existing_repo_id: str | None
    existing_repo_name: str | None
    target_path: str
    selected: tuple[PlannedImportProject, ...]

    @property
    def selected_keys(self) -> frozenset[str]:
        return frozenset(item.key for item in self.selected)


def build_project_import_plan(
    *,
    repo_url: str,
    repo_name: str,
    import_type: str,
    discovered: Sequence[Any],
    requested_paths: Sequence[str],
    already_imported: set[str] | frozenset[str],
    existing_repo: Mapping[str, Any] | None,
    existing_rows: Sequence[Mapping[str, Any]],
    projects_root: str,
    existing_checkout_path: str | None = None,
) -> ProjectImportPlan:
    """Turn discovery and current registrations into one frozen worklist.

    Identical arguments produce an identical plan. The executor must not
    register a path that is absent from ``selected``.
    """
    from app.services.project_import_service import find_legacy_row_to_adopt

    if not discovered:
        raise ValueError(
            f"No KiCad projects found in '{repo_name}'. Prism looks for "
            "directories containing a .kicad_pro, .kicad_pcb or .kicad_sch file."
        )

    discovered_by_key = {project.project_key: project for project in discovered}
    projects_by_directory: dict[str, list[Any]] = {}
    for project in discovered:
        projects_by_directory.setdefault(project.relative_path, []).append(project)

    def is_already_imported(project: Any) -> bool:
        if project.project_key in already_imported:
            return True
        return (
            project.relative_path in already_imported
            and len(projects_by_directory[project.relative_path]) == 1
        )

    paths = list(requested_paths)
    if import_type == "type1":
        paths = [discovered[0].project_key]

    resolved_selection: list[str] = []
    unknown: list[str] = []
    for path in paths:
        if path in discovered_by_key:
            resolved_selection.append(path)
        elif path in projects_by_directory:
            resolved_selection.extend(
                project.project_key for project in projects_by_directory[path]
            )
        else:
            unknown.append(path)
    if unknown:
        raise ValueError(
            "Selected paths are not KiCad projects in this repository: "
            + ", ".join(sorted(set(unknown)))
        )

    selected_keys = list(dict.fromkeys(resolved_selection))
    selected_projects = [
        discovered_by_key[key]
        for key in selected_keys
        if not is_already_imported(discovered_by_key[key])
    ]
    if not selected_projects:
        if paths and already_imported:
            label = str((existing_repo or {}).get("name") or repo_name)
            raise ValueError(
                f"Every selected project is already imported from '{label}'."
            )
        raise ValueError("No projects selected for import")

    if existing_checkout_path:
        target_path = existing_checkout_path
    else:
        target_path = str(Path(projects_root) / import_type / repo_name)

    remaining_rows = [dict(row) for row in existing_rows]
    planned: list[PlannedImportProject] = []
    for project in selected_projects:
        if import_type == "type1":
            board_name = repo_name
            register_relative_path = "."
            adopt_id = None
        else:
            board_name = project.name or Path(project.relative_path).name
            register_relative_path = project.relative_path
            legacy = find_legacy_row_to_adopt(
                remaining_rows, project.relative_path, board_name
            )
            adopt_id = str(legacy["id"]) if legacy is not None else None
            if legacy is not None:
                remaining_rows = [
                    row for row in remaining_rows if row.get("id") != legacy["id"]
                ]
        planned.append(
            PlannedImportProject(
                key=project.project_key,
                name=board_name,
                relative_path=project.relative_path,
                project_file=str(getattr(project, "project_file", "") or ""),
                adopt_project_id=adopt_id,
                register_relative_path=register_relative_path,
            )
        )

    return ProjectImportPlan(
        repo_url=repo_url,
        repo_name=repo_name,
        import_type=import_type,
        existing_repo_id=(str(existing_repo["id"]) if existing_repo else None),
        existing_repo_name=(
            str(existing_repo.get("name") or "") if existing_repo else None
        ),
        target_path=target_path,
        selected=tuple(planned),
    )
