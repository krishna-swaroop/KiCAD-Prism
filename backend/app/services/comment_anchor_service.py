"""Validate and record the displayed design revision a comment is about.

Callers pass the revision the user was looking at. This module never reads
HEAD, never invents a commit for a worktree or a legacy row, and never
fabricates sheet/net/variant identity. Persistence still happens in the
comments store; this is only the check-and-shape step (contract C1 / D6).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Optional

from git import Repo
from git.exc import GitCommandError

from app.core import errors
from app.services import (
    comment_anchor_bindings,
    path_config_service,
    project_revision,
    project_source_snapshot,
    semantic_index_service,
)
from app.services.design_bundle import design_keys

ANCHOR_PINNED = "pinned"
ANCHOR_UNPINNED = "unpinned"
SOURCE_CLIENT = "client"
SOURCE_MANUAL = "manual"
NOT_PROMOTABLE_UNPINNED = "unpinned_anchor"


class AnchorValidationError(errors.Invalid):
    """A displayed revision the server will not store (HTTP 422)."""

    def __init__(self, detail: str, *, code: str = "unknown_revision"):
        super().__init__(detail, code=code)


@dataclass(frozen=True)
class ResolvedAnchor:
    state: str
    source: Optional[str]
    commit: Optional[str]
    source_revision_key: Optional[str]
    base_commit: Optional[str] = None
    compare_commit: Optional[str] = None
    selected_side: Optional[str] = None
    file_path: Optional[str] = None
    project_relative_path: Optional[str] = None
    not_promotable_reason: Optional[str] = None
    #: The displayed commit's design key (ADR amendment K2 §3.6), when a bundle serves it.
    design_key: Optional[str] = None


def _full_sha(value: Optional[str], field: str) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if len(normalized) != 40 or any(ch not in "0123456789abcdef" for ch in normalized):
        raise AnchorValidationError(f"{field} must be a full 40-character SHA", code="invalid_commit")
    return normalized


def _identity(project: Any, commit: str) -> tuple[str, str]:
    """Resolve ``commit`` inside the project's repository only.

    ``project_revision_identity`` still talks to git; wrapping it here is
    what keeps every comments caller from falling through to HEAD.
    """
    try:
        key, resolved = project_source_snapshot.project_revision_identity(project, commit)
    except ValueError as exc:
        raise AnchorValidationError("unknown revision", code="unknown_revision") from exc
    if not resolved:
        raise AnchorValidationError("unknown revision", code="unknown_revision")
    resolved_sha = resolved.strip().lower()
    if resolved_sha != commit:
        # A 40-hex string that git treated as a prefix/alias is not the
        # displayed object. Never silently accept a different commit.
        raise AnchorValidationError("unknown revision", code="unknown_revision")
    return key, resolved_sha


def _design_key(project: Any, commit: Optional[str]) -> Optional[str]:
    """The commit's design key, or ``None`` while no bundle serves it (never builds one)."""
    if not commit:
        return None
    return design_keys.of_commit(str(project.id), commit)


def _project_relative_path(project: Any) -> Optional[str]:
    project_path = Path(getattr(project, "path", "") or "")
    if not project_path:
        return None
    try:
        return project_revision.project_file_rel(project_revision.locate(project))
    except (ValueError, OSError):
        anchor = getattr(project, "project_file", None)
        return str(anchor).replace("\\", "/") if anchor else None


def _project_dir_in_repo(project: Any) -> tuple[Path, str]:
    location = project_revision.locate(project)
    repo_root = location.repo_root
    anchor_source = project_source_snapshot._anchor_source(project, require_file=True)
    if anchor_source is not None:
        project_rel = anchor_source.relative_to(repo_root).as_posix()
    else:
        project_rel = project_revision.project_file_rel(location)
    project_dir = PurePosixPath(project_rel).parent.as_posix()
    if project_dir == ".":
        project_dir = ""
    return repo_root, project_dir


def _source_file(project: Any, commit: Optional[str], context: str) -> Optional[str]:
    """The project's own PCB or SCH file at ``commit``, if it exists.

    Uses ``git ls-tree`` for one revision listing instead of checking out the
    whole commit tree. Absence is left blank; we do not pick a sibling or HEAD.
    """
    if not commit:
        return None
    try:
        repo_root, project_dir = _project_dir_in_repo(project)
        entries = semantic_index_service._source_entries_in_commit(
            repo_root, commit, project_dir
        )
        return _pick_source_file(project, [path for path, _ in entries], context)
    except (ValueError, OSError):
        return None


def _pick_source_file(project: Any, paths: list[str], context: str) -> Optional[str]:
    """The board, or the root sheet, among a revision's project-relative paths."""
    suffix = ".kicad_pcb" if context.upper() == "PCB" else ".kicad_sch"
    candidates = sorted(path for path in paths if path.endswith(suffix))
    if not candidates:
        return None
    anchor = path_config_service.anchor_for_project(project) or ""
    stem = PurePosixPath(anchor).stem if anchor else ""
    if stem:
        for path in candidates:
            if PurePosixPath(path).stem == stem:
                return path
    return candidates[0]


def _drawn_on(project: Any, binding: dict, context: str, paths: list[str]) -> Optional[str]:
    """The one file an area was drawn on: its schematic page, else the board or root sheet.

    A schematic page id is the sheet's project-relative path, followed by
    ``:<instance path>`` for a sheet placed more than once.
    """
    page = str((binding.get("location") or {}).get("page") or "")
    page = page.split(":", 1)[0].replace("\\", "/")
    if page and context.upper() != "PCB":
        return page
    return _pick_source_file(project, paths, context)


def resolve_canvas_anchor(
    project: Any,
    *,
    revision: Optional[dict],
    context: str,
    file_path: Optional[str] = None,
) -> ResolvedAnchor:
    """Shape the displayed canvas revision. Omitted revision → unpinned, not HEAD."""
    project_rel = _project_relative_path(project)
    if not revision:
        return ResolvedAnchor(
            state=ANCHOR_UNPINNED,
            source=None,
            commit=None,
            source_revision_key=None,
            file_path=file_path,
            project_relative_path=project_rel,
            not_promotable_reason=NOT_PROMOTABLE_UNPINNED,
        )

    worktree = bool(revision.get("worktree"))
    commit = _full_sha(revision.get("commit"), "revision.commit")
    key = (revision.get("sourceRevisionKey") or "").strip() or None

    if worktree and commit:
        raise AnchorValidationError(
            "revision cannot be both a commit and a worktree",
            code="invalid_commit",
        )
    if worktree:
        return ResolvedAnchor(
            state=ANCHOR_UNPINNED,
            source=SOURCE_CLIENT,
            commit=None,
            source_revision_key=key,
            file_path=file_path,
            project_relative_path=project_rel,
            not_promotable_reason=NOT_PROMOTABLE_UNPINNED,
        )
    if not commit:
        return ResolvedAnchor(
            state=ANCHOR_UNPINNED,
            source=None,
            commit=None,
            source_revision_key=key,
            file_path=file_path,
            project_relative_path=project_rel,
            not_promotable_reason=NOT_PROMOTABLE_UNPINNED,
        )

    source_key, resolved = _identity(project, commit)
    stored_file = file_path or _source_file(project, resolved, context)
    return ResolvedAnchor(
        state=ANCHOR_PINNED,
        source=SOURCE_CLIENT,
        commit=resolved,
        source_revision_key=key or source_key,
        file_path=stored_file,
        project_relative_path=project_rel,
        design_key=_design_key(project, resolved),
    )


def resolve_comparison_anchor(
    project: Any,
    *,
    base_commit: str,
    compare_commit: str,
    selected_side: Optional[str],
    file_path: Optional[str] = None,
    context: str = "PCB",
) -> ResolvedAnchor:
    """Keep the ordered pair the client displayed; never swap or fill from HEAD."""
    base = _full_sha(base_commit, "baseCommit")
    compare = _full_sha(compare_commit, "compareCommit")
    if not base or not compare:
        raise AnchorValidationError("comparison requires baseCommit and compareCommit", code="invalid_commit")
    side = (selected_side or "").strip().lower() or "compare"
    if side not in {"base", "compare"}:
        raise AnchorValidationError("selectedSide must be 'base' or 'compare'", code="invalid_commit")

    base_key, base_sha = _identity(project, base)
    compare_key, compare_sha = _identity(project, compare)
    displayed = compare_sha if side == "compare" else base_sha
    source_key = compare_key if side == "compare" else base_key
    stored_file = file_path or _source_file(project, displayed, context)
    return ResolvedAnchor(
        state=ANCHOR_PINNED,
        source=SOURCE_CLIENT,
        commit=displayed,
        source_revision_key=source_key,
        base_commit=base_sha,
        compare_commit=compare_sha,
        selected_side=side,
        file_path=stored_file,
        project_relative_path=_project_relative_path(project),
        design_key=_design_key(project, displayed),
    )


def resolve_manual_pin(project: Any, *, commit: str, context: str = "PCB") -> ResolvedAnchor:
    """Admin-chosen pin for a previously unpinned row. Still never uses HEAD."""
    sha = _full_sha(commit, "commit")
    if not sha:
        raise AnchorValidationError("commit must be a full 40-character SHA", code="invalid_commit")
    key, resolved = _identity(project, sha)
    return ResolvedAnchor(
        state=ANCHOR_PINNED,
        source=SOURCE_MANUAL,
        commit=resolved,
        source_revision_key=key,
        file_path=_source_file(project, resolved, context),
        project_relative_path=_project_relative_path(project),
        design_key=_design_key(project, resolved),
    )


def resolve_displayed_bindings(
    project: Any,
    comments: list[dict],
    displayed_commit: str,
    manual_bindings: dict[str, list[dict]],
    record_design_keys: Optional[Callable[[dict[str, str]], None]] = None,
) -> list[dict]:
    """Add ancestry selection to rail comments without hiding any thread.

    ``candidate`` is deliberately not ``resolved``: only the loaded viewer can
    prove that a source UUID and schematic instance still exist at this commit.

    A freehand area follows to a commit with the same design key. The
    comment's stored ``designKey`` wins; an anchor without one is looked up
    through the bundles once and handed to ``record_design_keys`` (comment id
    to key) to be stored, so it survives its bundle's retention (K2 §3.6).
    """
    sha = _full_sha(displayed_commit, "revision")
    if not sha:
        raise AnchorValidationError("revision is required", code="invalid_commit")
    _identity(project, sha)
    repo_root, project_dir = _project_dir_in_repo(project)
    repo = Repo(repo_root)
    ancestry: dict[tuple[str, str], bool] = {}

    def is_ancestor(older: str, newer: str) -> bool:
        key = (older, newer)
        if key not in ancestry:
            try:
                repo.git.merge_base("--is-ancestor", older, newer)
                ancestry[key] = True
            except GitCommandError:
                ancestry[key] = False
        return ancestry[key]

    stored = {
        (comment.get("anchor") or {}).get("commit"): (comment.get("anchor") or {}).get("designKey")
        for comment in comments
        if (comment.get("anchor") or {}).get("designKey")
    }
    keys: dict[str, Optional[str]] = {}

    def design_key(commit: str) -> Optional[str]:
        if commit not in keys:
            keys[commit] = stored.get(commit) or _design_key(project, commit)
        return keys[commit]

    def same_design(older: str, newer: str) -> bool:
        older_key = design_key(older)
        return older_key is not None and older_key == design_key(newer)

    blobs: dict[str, dict[str, str]] = {}

    def blobs_at(commit: str) -> dict[str, str]:
        if commit not in blobs:
            try:
                blobs[commit] = dict(
                    semantic_index_service._source_entries_in_commit(repo_root, commit, project_dir)
                )
            except ValueError:
                blobs[commit] = {}
        return blobs[commit]

    def same_file_for(context: str) -> Callable[[dict, str], bool]:
        def same_file(binding: dict, newer: str) -> bool:
            older = blobs_at(binding["commit"])
            path = _drawn_on(project, binding, context, list(older))
            return path is not None and path in older and older[path] == blobs_at(newer).get(path)
        return same_file

    result: list[dict] = []
    for comment in comments:
        resolved = dict(comment)
        origin = comment.get("anchor") or {}
        original_commit = origin.get("commit")
        bindings = list(manual_bindings.get(comment["id"], []))
        if original_commit:
            bindings.insert(0, {
                "sequence": 0, "commit": original_commit,
                "elementId": comment.get("elementId"), "filePath": comment.get("filePath"),
                "location": comment["location"],
                "relativePoint": (comment.get("metadata") or {}).get("anchorRelativePoint"),
            })
        if not bindings:
            resolved["anchorResolution"] = {"state": "unresolved", "reason": "unpinned"}
        else:
            resolved["anchorResolution"] = comment_anchor_bindings.select_binding(
                bindings, sha, is_ancestor, same_design, same_file_for(str(comment.get("context") or "")),
            )
        result.append(resolved)
    found = {
        comment["id"]: key
        for comment in comments
        if (origin := comment.get("anchor") or {}).get("commit") and not origin.get("designKey")
        and (key := design_key(origin["commit"]))
    }
    if found and record_design_keys is not None:
        record_design_keys(found)
    return result
