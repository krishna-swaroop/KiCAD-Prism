"""
Folder service for workspace organization.

Folders are persisted separately from projects, while project assignment uses
`project.folder_id` in the project registry as the single source of truth.
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import time
import uuid

from pydantic import BaseModel, Field

from app.core.roles import Role, normalize_role, role_matches_allowed_role
from app.services import project_service
from app.services.workspace_service import workspace


class Folder(BaseModel):
    id: str
    name: str
    parent_id: str | None = None
    created_at: str
    updated_at: str
    visibility_mode: str | None = None
    allowed_roles: list[str] = Field(default_factory=list)


class FolderTreeItem(BaseModel):
    id: str
    name: str
    parent_id: str | None = None
    depth: int = 0
    has_children: bool = False
    direct_project_count: int = 0
    total_project_count: int = 0
    visibility_mode: str | None = None
    allowed_roles: list[str] = Field(default_factory=list)


FOLDERS_FILE = os.path.join(project_service.PROJECTS_ROOT, ".folders.json")
os.makedirs(os.path.dirname(FOLDERS_FILE), exist_ok=True)

FOLDERS_CACHE_TTL = 5.0
_folders_cache: dict[str, Folder] = {}
_folders_cache_time: float = 0
_folders_cache_mtime: float | None = None


def _legacy_folders_files() -> list[str]:
    """Known legacy locations used by older backend builds."""
    return [
        # Historical relative path used by folder_service (can resolve to /data/projects in Docker).
        os.path.abspath(
            os.path.join(
                os.path.dirname(__file__), "../../../data/projects/.folders.json"
            )
        ),
        # Early Docker mapping workaround path.
        "/app/data/projects/.folders.json",
        # Legacy absolute path in some container layouts.
        "/data/projects/.folders.json",
    ]


def _existing_folders_file_candidates() -> list[str]:
    """
    Return existing folder metadata files ordered by preference.

    Canonical location is always first. Legacy locations are used only as fallback.
    """
    candidates = [FOLDERS_FILE, *_legacy_folders_files()]
    existing: list[str] = []
    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if os.path.exists(candidate):
            existing.append(candidate)
    return existing


def _ensure_canonical_folders_file() -> None:
    """
    Self-heal folder metadata placement.

    If canonical file is missing but a legacy file exists, copy it into canonical path
    so folder and project metadata share the same root consistently.
    """
    if os.path.exists(FOLDERS_FILE):
        return

    for legacy_path in _legacy_folders_files():
        if not os.path.exists(legacy_path):
            continue
        try:
            os.makedirs(os.path.dirname(FOLDERS_FILE), exist_ok=True)
            shutil.copy2(legacy_path, FOLDERS_FILE)
            return
        except OSError:
            # If migration fails, load path fallbacks still cover runtime behavior.
            return


UNSET = object()


def _now_iso() -> str:
    return datetime.datetime.now().isoformat()


def _normalize_name(name: str) -> str:
    normalized = (name or "").strip()
    if not normalized:
        raise ValueError("Folder name cannot be empty")
    return normalized


def _normalize_allowed_roles(roles: list[str] | None) -> list[str]:
    if not roles:
        return []
    normalized: list[str] = []
    for value in roles:
        role = normalize_role(value)
        if role and role not in normalized:
            normalized.append(role)
    return normalized


def _is_folder_visible_to_role(folder: Folder, user_role: Role | None) -> bool:
    if user_role is None:
        return True
    if folder.visibility_mode != "roles":
        return True
    if not folder.allowed_roles:
        return True
    return role_matches_allowed_role(user_role, folder.allowed_roles)


def _load_folders() -> dict[str, Folder]:
    global _folders_cache, _folders_cache_time, _folders_cache_mtime
    _ensure_canonical_folders_file()

    current_time = time.time()
    try:
        current_mtime = os.path.getmtime(FOLDERS_FILE)
    except OSError:
        current_mtime = None

    if (
        _folders_cache
        and (current_time - _folders_cache_time) < FOLDERS_CACHE_TTL
        and _folders_cache_mtime == current_mtime
    ):
        return _folders_cache

    for path in _existing_folders_file_candidates():
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
            folders: dict[str, Folder] = {}
            for folder_id, payload in raw.items():
                folder = Folder(**payload)
                folder.allowed_roles = _normalize_allowed_roles(folder.allowed_roles)
                if folder.visibility_mode not in {None, "roles"}:
                    folder.visibility_mode = None
                folders[folder_id] = folder

            # If loaded from a legacy location, persist into canonical path once.
            if path != FOLDERS_FILE and not os.path.exists(FOLDERS_FILE):
                _save_folders(folders)

            _folders_cache = folders
            _folders_cache_time = current_time
            try:
                _folders_cache_mtime = os.path.getmtime(FOLDERS_FILE)
            except OSError:
                _folders_cache_mtime = current_mtime
            return folders
        except (OSError, json.JSONDecodeError):
            continue

    _folders_cache = {}
    _folders_cache_time = current_time
    _folders_cache_mtime = current_mtime
    return {}


def invalidate_folder_cache() -> None:
    global _folders_cache, _folders_cache_time, _folders_cache_mtime
    _folders_cache = {}
    _folders_cache_time = 0
    _folders_cache_mtime = None


def _save_folders(folders: dict[str, Folder]) -> None:
    with open(FOLDERS_FILE, "w", encoding="utf-8") as f:
        json.dump({k: v.dict() for k, v in folders.items()}, f, indent=2)
    invalidate_folder_cache()


def _children_map(folders: dict[str, Folder]) -> dict[str | None, list[str]]:
    children: dict[str | None, list[str]] = {}
    for folder in folders.values():
        children.setdefault(folder.parent_id, []).append(folder.id)
    for folder_ids in children.values():
        folder_ids.sort(key=lambda folder_id: folders[folder_id].name.lower())
    return children


def _descendant_ids(
    root_folder_id: str, children: dict[str | None, list[str]]
) -> list[str]:
    stack = [root_folder_id]
    visited = set()
    descendants: list[str] = []
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        descendants.append(current)
        stack.extend(children.get(current, []))
    return descendants


def _project_ids_by_folder(folders: dict[str, Folder]) -> dict[str, list[str]]:
    by_folder: dict[str, list[str]] = {folder_id: [] for folder_id in folders.keys()}
    for project in project_service.get_registered_project_records():
        if project.folder_id and project.folder_id in by_folder:
            by_folder[project.folder_id].append(project.id)
    return by_folder


def is_folder_visible_to_role(folder_id: str | None, user_role: Role | None) -> bool:
    if folder_id is None:
        return True
    folders = _load_folders()
    folder = folders.get(folder_id)
    if not folder:
        return False
    return _is_folder_visible_to_role(folder, user_role)


def filter_projects_for_role(
    projects: list[project_service.Project],
    user_role: Role | None,
) -> list[project_service.Project]:
    if user_role is None:
        return projects

    folders = _load_folders()

    def project_visible(project: project_service.Project) -> bool:
        if project.folder_id is None:
            return True
        folder = folders.get(project.folder_id)
        if not folder:
            return False
        return _is_folder_visible_to_role(folder, user_role)

    return [project for project in projects if project_visible(project)]


def get_folder_tree(user_role: Role | None = None) -> list[FolderTreeItem]:
    folders = _load_folders()
    if not folders:
        return []

    children = _children_map(folders)
    direct_project_ids = _project_ids_by_folder(folders)
    total_cache: dict[str, int] = {}

    def total_count(folder_id: str, visiting: set | None = None) -> int:
        active_stack = visiting or set()
        if folder_id in active_stack:
            # Malformed data guard: break recursion on cycles.
            return len(direct_project_ids.get(folder_id, []))
        if folder_id in total_cache:
            return total_cache[folder_id]
        count = len(direct_project_ids.get(folder_id, []))
        active_stack.add(folder_id)
        for child_id in children.get(folder_id, []):
            child = folders.get(child_id)
            if not child or not _is_folder_visible_to_role(child, user_role):
                continue
            count += total_count(child_id, active_stack)
        active_stack.remove(folder_id)
        total_cache[folder_id] = count
        return count

    tree_items: list[FolderTreeItem] = []

    def walk(parent_id: str | None, depth: int, visiting: set | None = None) -> None:
        active_stack = visiting or set()
        for folder_id in children.get(parent_id, []):
            if folder_id in active_stack:
                continue
            folder = folders[folder_id]
            if not _is_folder_visible_to_role(folder, user_role):
                continue
            active_stack.add(folder_id)
            tree_items.append(
                FolderTreeItem(
                    id=folder.id,
                    name=folder.name,
                    parent_id=folder.parent_id,
                    depth=depth,
                    has_children=any(
                        (child := folders.get(child_id)) is not None
                        and _is_folder_visible_to_role(child, user_role)
                        for child_id in children.get(folder_id, [])
                    ),
                    direct_project_count=len(direct_project_ids.get(folder_id, [])),
                    total_project_count=total_count(folder_id),
                    visibility_mode=folder.visibility_mode,
                    allowed_roles=folder.allowed_roles,
                )
            )
            walk(folder_id, depth + 1, active_stack)
            active_stack.remove(folder_id)

    walk(None, 0)
    return tree_items


def get_folder(folder_id: str) -> Folder | None:
    return _load_folders().get(folder_id)


def create_folder(name: str, parent_id: str | None = None) -> Folder:
    folders = _load_folders()
    normalized_name = _normalize_name(name)

    if parent_id is not None and parent_id not in folders:
        raise ValueError("Parent folder not found")

    for folder in folders.values():
        if (
            folder.parent_id == parent_id
            and folder.name.lower() == normalized_name.lower()
        ):
            raise ValueError("A folder with this name already exists in this location")

    now = _now_iso()
    folder_id = f"fld_{uuid.uuid4().hex[:10]}"
    while folder_id in folders:
        folder_id = f"fld_{uuid.uuid4().hex[:10]}"

    folder = Folder(
        id=folder_id,
        name=normalized_name,
        parent_id=parent_id,
        created_at=now,
        updated_at=now,
        visibility_mode=None,
        allowed_roles=[],
    )
    folders[folder.id] = folder
    _save_folders(folders)
    return folder


def update_folder(folder_id: str, name: str | None = None, parent_id=UNSET) -> Folder:
    folders = _load_folders()
    folder = folders.get(folder_id)
    if not folder:
        raise ValueError("Folder not found")

    target_parent_id = folder.parent_id if parent_id is UNSET else parent_id
    target_name = folder.name if name is None else _normalize_name(name)

    if target_parent_id is not None and target_parent_id not in folders:
        raise ValueError("Parent folder not found")
    if target_parent_id == folder_id:
        raise ValueError("Folder cannot be its own parent")

    children = _children_map(folders)
    if target_parent_id is not None and target_parent_id in _descendant_ids(
        folder_id, children
    ):
        raise ValueError("Cannot move a folder into itself or its descendants")

    for other in folders.values():
        if other.id == folder_id:
            continue
        if (
            other.parent_id == target_parent_id
            and other.name.lower() == target_name.lower()
        ):
            raise ValueError("A folder with this name already exists in this location")

    folder.name = target_name
    folder.parent_id = target_parent_id
    folder.updated_at = _now_iso()
    folders[folder.id] = folder
    _save_folders(folders)
    return folder


def delete_folder(folder_id: str, cascade: bool = True) -> bool:
    folders = _load_folders()
    if folder_id not in folders:
        return False

    children = _children_map(folders)
    delete_ids = _descendant_ids(folder_id, children) if cascade else [folder_id]

    if not cascade and folder_id in children:
        raise ValueError(
            "Folder has subfolders. Use cascade delete or move subfolders first."
        )

    # Move all projects under deleted folders back to root.
    for project in project_service.get_registered_project_records():
        if project.folder_id in delete_ids:
            project_service.update_project_folder_id(project.id, None)

    for delete_id in delete_ids:
        folders.pop(delete_id, None)

    _save_folders(folders)
    return True


def move_project_to_folder(project_id: str, folder_id: str | None) -> None:
    if folder_id is not None and folder_id not in _load_folders():
        raise ValueError("Folder not found")
    if not project_service.update_project_folder_id(project_id, folder_id):
        raise ValueError("Project not found")


def get_folder_contents(folder_id: str | None, user_role: Role | None = None) -> dict:
    folders = _load_folders()
    if folder_id is not None:
        folder = folders.get(folder_id)
        if folder is None or not _is_folder_visible_to_role(folder, user_role):
            raise ValueError("Folder not found")

    children = sorted(
        [
            folder
            for folder in folders.values()
            if folder.parent_id == folder_id
            and _is_folder_visible_to_role(folder, user_role)
        ],
        key=lambda folder: folder.name.lower(),
    )
    projects = sorted(
        [
            project
            for project in [
                project_service.Project(
                    id=r["id"],
                    name=r["name"],
                    display_name=r.get("display_name"),
                    description=r.get("description", ""),
                    path=r.get("path", ""),
                    last_modified=r.get("last_modified", ""),
                    folder_id=r.get("folder_id"),
                )
                for r in workspace.get_all_projects()
            ]
            if project.folder_id == folder_id
            and (
                folder_id is None
                or (
                    (folder := folders.get(project.folder_id)) is not None
                    and _is_folder_visible_to_role(folder, user_role)
                )
            )
        ],
        key=lambda project: (project.display_name or project.name).lower(),
    )

    return {
        "folders": [folder.dict() for folder in children],
        "projects": [project.dict() for project in projects],
    }
