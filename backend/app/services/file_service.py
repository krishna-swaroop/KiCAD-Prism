import fnmatch
import os
import posixpath
import time
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException
from git import Repo
from git.exc import BadName
from pydantic import BaseModel

from app.services import path_config_service


class FileItem(BaseModel):
    name: str
    path: str  # relative to output folder
    size: int
    modified_date: str
    type: str  # file extension or 'folder'
    is_dir: bool


@dataclass(frozen=True)
class CommitFile:
    name: str
    path: str
    content: bytes


FILE_LISTING_CACHE_TTL = 2.0
_file_listing_cache: dict[str, dict[str, object]] = {}


def _normalize_git_path(
    path: str | None, *, invalid_detail: str = "Invalid file path"
) -> str:
    if path is None:
        return ""

    normalized = posixpath.normpath(str(path).replace("\\", "/"))
    if normalized in ("", "."):
        return ""

    if normalized.startswith("/") or normalized == ".." or normalized.startswith("../"):
        raise HTTPException(status_code=400, detail=invalid_detail)

    return normalized


def _join_git_paths(
    *parts: str | None, invalid_detail: str = "Invalid file path"
) -> str:
    cleaned = [
        _normalize_git_path(part, invalid_detail=invalid_detail)
        for part in parts
        if part not in (None, "")
    ]
    if not cleaned:
        return ""
    return posixpath.join(*cleaned)


def _commit_for_repo(repo_path: str, commit_hash: str):
    try:
        return Repo(repo_path).commit(commit_hash)
    except BadName as error:
        raise HTTPException(
            status_code=404, detail=f"Commit not found: {commit_hash}"
        ) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Git error: {error}") from error


def _entry_at_path(commit, tree_path: str, *, not_found_detail: str):
    try:
        return commit.tree / tree_path if tree_path else commit.tree
    except KeyError as error:
        raise HTTPException(status_code=404, detail=not_found_detail) from error


def _scan_commit_tree(tree, *, base_path: str, modified_date: str) -> list[FileItem]:
    items: list[FileItem] = []
    for entry in sorted(tree, key=lambda item: item.name.casefold()):
        if entry.name.startswith("."):
            continue

        rel_path = posixpath.join(base_path, entry.name) if base_path else entry.name
        if entry.type == "tree":
            items.append(
                FileItem(
                    name=entry.name,
                    path=rel_path,
                    size=0,
                    modified_date=modified_date,
                    type="folder",
                    is_dir=True,
                )
            )
            items.extend(
                _scan_commit_tree(
                    entry, base_path=rel_path, modified_date=modified_date
                )
            )
        elif entry.type == "blob":
            ext = posixpath.splitext(entry.name)[1].lstrip(".")
            items.append(
                FileItem(
                    name=entry.name,
                    path=rel_path,
                    size=entry.size,
                    modified_date=modified_date,
                    type=ext or "file",
                    is_dir=False,
                )
            )

    return items


def get_files_from_commit(
    repo_path: str,
    commit_hash: str,
    directory_path: str,
    *,
    relative_prefix: str | None = None,
) -> list[FileItem]:
    commit = _commit_for_repo(repo_path, commit_hash)
    tree_path = _join_git_paths(relative_prefix, directory_path)

    try:
        entry = _entry_at_path(commit, tree_path, not_found_detail="Folder not found")
    except HTTPException as error:
        if error.status_code == 404:
            return []
        raise

    if entry.type != "tree":
        return []

    modified_date = datetime.fromtimestamp(commit.committed_date).isoformat()
    return _scan_commit_tree(entry, base_path="", modified_date=modified_date)


def read_file_from_commit(
    repo_path: str,
    commit_hash: str,
    file_path: str,
    *,
    relative_prefix: str | None = None,
    not_found_detail: str = "File not found",
    invalid_detail: str = "Invalid file path",
) -> CommitFile:
    commit = _commit_for_repo(repo_path, commit_hash)
    normalized_file_path = _normalize_git_path(file_path, invalid_detail=invalid_detail)
    tree_path = _join_git_paths(
        relative_prefix, normalized_file_path, invalid_detail=invalid_detail
    )
    entry = _entry_at_path(commit, tree_path, not_found_detail=not_found_detail)

    if entry.type == "tree":
        raise HTTPException(status_code=400, detail="Cannot read directory")
    if entry.type != "blob":
        raise HTTPException(status_code=404, detail=not_found_detail)

    return CommitFile(
        name=posixpath.basename(normalized_file_path),
        path=normalized_file_path,
        content=entry.data_stream.read(),
    )


def _list_blob_paths(tree, *, base_path: str = "") -> list[str]:
    paths: list[str] = []
    for entry in sorted(tree, key=lambda item: item.name.casefold()):
        if entry.name.startswith("."):
            continue

        rel_path = posixpath.join(base_path, entry.name) if base_path else entry.name
        if entry.type == "tree":
            paths.extend(_list_blob_paths(entry, base_path=rel_path))
        elif entry.type == "blob":
            paths.append(rel_path)
    return paths


def find_files_in_commit(
    repo_path: str,
    commit_hash: str,
    pattern: str,
    *,
    relative_prefix: str | None = None,
) -> list[str]:
    commit = _commit_for_repo(repo_path, commit_hash)
    prefix = _normalize_git_path(relative_prefix)

    try:
        root = _entry_at_path(commit, prefix, not_found_detail="Folder not found")
    except HTTPException as error:
        if error.status_code == 404:
            return []
        raise

    if root.type != "tree":
        return []

    normalized_pattern = _normalize_git_path(pattern)
    blob_paths = _list_blob_paths(root)

    if "/" not in normalized_pattern:
        root_matches = [
            path
            for path in blob_paths
            if "/" not in path
            and fnmatch.fnmatchcase(posixpath.basename(path), normalized_pattern)
        ]
        if root_matches:
            return sorted(root_matches, key=str.casefold)

    return sorted(
        [path for path in blob_paths if fnmatch.fnmatchcase(path, normalized_pattern)],
        key=str.casefold,
    )


def invalidate_file_listing_cache(directory: str | None = None) -> None:
    if directory is None:
        _file_listing_cache.clear()
        return
    _file_listing_cache.pop(os.path.abspath(directory), None)


def _scan_files_recursive(directory: str, base_path: str = "") -> list[FileItem]:
    """
    Recursively list all files in a directory.

    Args:
        directory: Absolute path to directory
        base_path: Relative path from output folder root (for recursion)
    """
    items = []

    if not os.path.exists(directory):
        return items

    try:
        for entry in os.scandir(directory):
            # Skip hidden files and .DS_Store
            if entry.name.startswith("."):
                continue

            rel_path = os.path.join(base_path, entry.name) if base_path else entry.name

            if entry.is_dir():
                items.append(
                    FileItem(
                        name=entry.name,
                        path=rel_path,
                        size=0,
                        modified_date=datetime.fromtimestamp(
                            entry.stat().st_mtime
                        ).isoformat(),
                        type="folder",
                        is_dir=True,
                    )
                )
                # Recursively add subdirectory contents
                items.extend(_scan_files_recursive(entry.path, rel_path))
            else:
                # Get file extension
                ext = os.path.splitext(entry.name)[1].lstrip(".")
                items.append(
                    FileItem(
                        name=entry.name,
                        path=rel_path,
                        size=entry.stat().st_size,
                        modified_date=datetime.fromtimestamp(
                            entry.stat().st_mtime
                        ).isoformat(),
                        type=ext or "file",
                        is_dir=False,
                    )
                )
    except PermissionError:
        pass

    return items


def get_files_recursive(directory: str) -> list[FileItem]:
    directory_path = os.path.abspath(directory)
    if not os.path.exists(directory_path):
        return []

    try:
        directory_mtime = os.path.getmtime(directory_path)
    except OSError:
        return []

    now = time.time()
    cached = _file_listing_cache.get(directory_path)
    if (
        cached
        and cached.get("mtime") == directory_mtime
        and (now - float(cached.get("cached_at", 0))) < FILE_LISTING_CACHE_TTL
    ):
        return cached["items"]  # type: ignore[return-value]

    items = _scan_files_recursive(directory_path)
    _file_listing_cache[directory_path] = {
        "items": items,
        "mtime": directory_mtime,
        "cached_at": now,
    }
    return items


def get_project_files(project_path: str, output_type: str) -> list[FileItem]:
    """
    Get files from Design-Outputs or Manufacturing-Outputs.

    Args:
        project_path: Absolute path to project root
        output_type: 'design' or 'manufacturing'
    """
    resolved = path_config_service.resolve_paths(project_path)

    if output_type == "design":
        output_dir = resolved.design_outputs_dir
    elif output_type == "manufacturing":
        output_dir = resolved.manufacturing_outputs_dir
    else:
        return []

    if not output_dir or not os.path.exists(output_dir):
        return []

    return get_files_recursive(output_dir)
