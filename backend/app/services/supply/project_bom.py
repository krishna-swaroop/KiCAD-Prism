"""Keeping tracked projects' BOMs current, and saying what a new revision changed.

A project's BOM is read from the semantic index of what is on disk (``usage.refresh_one``). Nobody has to open the project:
every ``REFRESH_EVERY`` the poll job reads each tracked project's BOM again, and when the newest revision has no index yet
it queues the ordinary index job, which the worker runs one at a time. The next read after it lands compares the old lines
with the new ones: lines that came are tracked by ``tracking.sync_projects`` (tier 1, their first search from the pool),
lines that went lose the project's reason and leave tracking unless something else keeps them. One event per change says
which, for Recent changes.

An index job that fails is not queued again for ``REQUEUE_AFTER``, so a project that cannot be read costs one try every
few hours, not one a minute.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any, Callable, Iterable, Mapping, Sequence

from app.services.supply import tracking, usage

REFRESH_EVERY = 15 * 60
REQUEUE_AFTER = 6 * 3600
MAX_NAMED = 20
EVENT_KIND = "project_bom_changed"

_refreshed_at: float | None = None
_queued_at: dict[str, float] = {}

Projects = Callable[[Iterable[str]], list[tuple[Any, Sequence[str]]]]


def _workspace_projects(ids: Iterable[str]) -> list[tuple[Any, Sequence[str]]]:
    """The projects with these ids, each with the supply roles that may see it."""

    from app.services import project_service
    from app.services.workspace_service import workspace

    wanted = set(ids)
    found = []
    for row in workspace.get_all_projects(None):
        if str(row["id"]) in wanted:
            roles = [role for role in usage.ALL_ROLES if workspace._is_folder_visible(row, role)]  # noqa: SLF001
            found.append((project_service._workspace_row_to_project(row), roles))  # noqa: SLF001
    return found


def existing_index(project: Any, commit: str | None = None) -> Mapping[str, Any] | None:
    """The project's semantic index (a member of its design bundle), or None while it is not built or cannot be."""

    from app.services import semantic_index_service
    from app.services.design_bundle.errors import DesignDataFailed, DesignDataPending

    try:
        return semantic_index_service.get_index(project, commit)
    except (DesignDataPending, DesignDataFailed):
        return None


def queue_index(project_id: str, requested_by: str = "supply") -> None:
    """Queue the project's design bundle, which holds its semantic index."""

    from app.services import semantic_index_service

    semantic_index_service.start_generate_job(project_id, requested_by=requested_by)


def _identities():
    from app.services.supply import catalog_read

    return catalog_read.identities


def _lines(conn, project_id: str, variants: Sequence[str]) -> dict[str, tuple[str, str]]:
    rows = conn.execute(
        f"SELECT DISTINCT alias_key, match_key, manufacturer, mpn FROM {usage.ALL_USES} u WHERE u.project_id = %s AND u.variant = ANY(%s)",
        (project_id, list(variants)),
    ).fetchall()
    return {f"{row['alias_key']}|{row['match_key']}": (row["manufacturer"], row["mpn"]) for row in rows}


def read(
    conn, project: Any, roles: Sequence[str], now: datetime, *,
    existing: Callable[[Any], Mapping[str, Any] | None] = existing_index,
    queue: Callable[[str], None] = queue_index,
    identities: Any = None,
) -> str:
    """Read a project's BOM into usage. ``reading`` when its newest revision has no index yet and one was queued (or was
    queued lately); otherwise what ``usage.refresh_one`` says."""

    project_id = str(project.id)
    status = usage.refresh_one(conn, project, existing, now, roles, identities if identities is not None else _identities())
    if status != "without_index":
        _queued_at.pop(project_id, None)
        return status
    last = _queued_at.get(project_id)
    if last is None or time.monotonic() - last >= REQUEUE_AFTER:
        _queued_at[project_id] = time.monotonic()
        try:
            queue(project_id)
        except Exception:  # noqa: BLE001 - a project that cannot be queued is tried again later
            logging.getLogger(__name__).info("Index not queued for %s", project_id, exc_info=True)
    return "reading"


def _event(conn, project: Any, roles: Sequence[str], before: Mapping[str, tuple[str, str]], after: Mapping[str, tuple[str, str]], now: datetime) -> None:
    added = [after[key] for key in sorted(set(after) - set(before))]
    removed = [before[key] for key in sorted(set(before) - set(after))]
    if not added and not removed:
        return
    payload = {
        "project_id": str(project.id), "project_name": str(getattr(project, "display_name", None) or project.name),
        "added_count": len(added), "removed_count": len(removed),
        "added": [{"manufacturer": maker, "mpn": mpn} for maker, mpn in added[:MAX_NAMED]],
        "removed": [{"manufacturer": maker, "mpn": mpn} for maker, mpn in removed[:MAX_NAMED]],
        "visible_roles": list(roles),
    }
    conn.execute("INSERT INTO supply_events (at, kind, payload) VALUES (%s, %s, %s::jsonb)", (now, EVENT_KIND, json.dumps(payload)))


def refresh_tracked(
    conn, now: datetime, *, force: bool = False, projects: Projects = _workspace_projects,
    existing: Callable[[Any], Mapping[str, Any] | None] = existing_index,
    queue: Callable[[str], None] = queue_index, identities: Any = None,
) -> dict[str, int]:
    """Read every tracked project's BOM again, at most every ``REFRESH_EVERY``, and record what changed."""

    global _refreshed_at
    if not force and _refreshed_at is not None and time.monotonic() - _refreshed_at < REFRESH_EVERY:
        return {}
    _refreshed_at = time.monotonic()
    tracked = {item["project_id"]: item for item in tracking.list_tracked_projects(conn)}
    counts = {"updated": 0, "unchanged": 0, "reading": 0, "removed": 0}
    found = projects(tracked)
    # A project deleted from the workspace is no longer followed (the tiers are worked out once, however many went).
    counts["removed"] = tracking.untrack_projects(conn, sorted(set(tracked) - {str(project.id) for project, _roles in found}), "system")
    for project, roles in found:
        variants = list(tracked[str(project.id)]["variants"])
        before = _lines(conn, str(project.id), variants)
        status = read(conn, project, roles, now, existing=existing, queue=queue, identities=identities)
        counts[status] = counts.get(status, 0) + 1
        if status == "updated":
            _event(conn, project, roles, before, _lines(conn, str(project.id), variants), now)
        # A design the new revision added is followed from now on (its parts are not reported as added).
        tracking.follow_new_variants(conn, str(project.id))
    return counts
