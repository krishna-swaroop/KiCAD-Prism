"""Validate and record the displayed design revision a comment is about.

Callers pass the revision the user was looking at. This module never reads
HEAD, never invents a commit for a worktree or a legacy row, and never
fabricates sheet/net/variant identity. Persistence still happens in the
comments store; this is only the check-and-shape step (contract C1 / D6).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from app.services import project_source_snapshot, semantic_visualizer_service

ANCHOR_PINNED = "pinned"
ANCHOR_UNPINNED = "unpinned"
SOURCE_CLIENT = "client"
SOURCE_MANUAL = "manual"
NOT_PROMOTABLE_UNPINNED = "unpinned_anchor"


class AnchorValidationError(Exception):
    """A displayed revision the server will not store (HTTP 422)."""

    def __init__(self, detail: str, *, code: str = "unknown_revision"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


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


def _project_relative_path(project: Any) -> Optional[str]:
    project_path = Path(getattr(project, "path", "") or "")
    if not project_path:
        return None
    try:
        repo_root = semantic_visualizer_service._repo_root(project_path)
        rel = semantic_visualizer_service._project_relative_path(
            repo_root, project_path, getattr(project, "project_file", None),
        )
        return rel
    except (ValueError, OSError):
        anchor = getattr(project, "project_file", None)
        return str(anchor).replace("\\", "/") if anchor else None


def _source_file(project: Any, commit: Optional[str], context: str) -> Optional[str]:
    """The project's own PCB or SCH file at ``commit``, if it exists.

    Absence is left blank. We do not pick a sibling document or HEAD.
    """
    if not commit:
        return None
    try:
        with project_source_snapshot.project_source_snapshot(project, commit) as snapshot:
            pcb, sch = project_source_snapshot.source_files(snapshot)
            chosen = pcb if context.upper() == "PCB" else sch
            if chosen is None:
                return None
            try:
                return chosen.relative_to(snapshot.root).as_posix()
            except ValueError:
                return chosen.name
    except (ValueError, OSError):
        return None


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
    side = (selected_side or "").strip().lower() or None
    if side not in (None, "base", "compare"):
        raise AnchorValidationError("selectedSide must be 'base' or 'compare'", code="invalid_commit")

    base_key, base_sha = _identity(project, base)
    _, compare_sha = _identity(project, compare)
    displayed = compare_sha if side == "compare" else base_sha if side == "base" else None
    source_key = base_key
    stored_file = file_path or (_source_file(project, displayed or compare_sha, context) if displayed or compare_sha else file_path)
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
    )
