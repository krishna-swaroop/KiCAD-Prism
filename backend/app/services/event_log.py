"""The append-only event log behind ``GET /api/v1/events`` (ADR §3.10).

One row is one thing that happened: a revision synced, a bundle built or failed,
job progress, a comparison finished, a comment changed, a release candidate built
or approved. Producers append with :func:`record`; readers poll with
:func:`list_after`. The table is the record, so a reader that reconnects replays
from its cursor. ``NOTIFY prism_events`` is only a wake-up hint for the live
socket (MCP-08b), never the delivery itself: workers write from other processes.

Every caller of :func:`record` owns the transaction it is recording about. Pass
its connection when the event must commit or roll back with the mutation; leave
``conn`` out to append in a transaction of its own. Producers record after their
mutation commits with :func:`record_quietly`, which logs and swallows a failure
instead of failing the work it describes. Writers take ids from one locked head
row, so ids become visible in order; keep that transaction short, because other
writers wait for it.
"""

from __future__ import annotations

import logging
from typing import Any

from psycopg.types.json import Jsonb

from app.core import policy, request_context
from app.core.roles import Role
from app.services.workspace_connection import connect

#: The closed set of event kinds. A new producer adds one here first.
EVENT_KINDS: tuple[str, ...] = (
    "revision.synced",
    "bundle.built",
    "bundle.failed",
    "job.progress",
    "job.finished",
    "comparison.done",
    "comment.changed",
    "release.candidate_built",
    "release.approved",
)

#: The channel the live socket listens on. Payload: the event id as text.
CHANNEL = "prism_events"

logger = logging.getLogger(__name__)

_MIN_LIMIT = 1
_MAX_LIMIT = 500


def record(
    kind: str,
    *,
    project_id: str | None,
    topic: str | None = None,
    payload: dict[str, Any] | None = None,
    conn: Any | None = None,
) -> int:
    """Append one event and wake the live socket; return its id.

    ``topic`` defaults to ``project:<project_id>``. An event with no project
    needs an explicit topic, because there is nothing to derive one from.
    With ``conn``, the row and its notification join the caller's transaction;
    that connection must already resolve ``ws_events`` (``workspace`` on its
    ``search_path``).
    """

    if kind not in EVENT_KINDS:
        raise ValueError(f"unknown event kind: {kind}")
    if not project_id and not topic:
        raise ValueError("an event with no project requires a topic")
    resolved_topic = topic or f"project:{project_id}"

    if conn is not None:
        return _insert(conn, kind, project_id, resolved_topic, payload or {})

    with connect() as own_conn:
        return _insert(own_conn, kind, project_id, resolved_topic, payload or {})


def record_quietly(
    kind: str,
    *,
    project_id: str | None,
    topic: str | None = None,
    payload: dict[str, Any] | None = None,
) -> int | None:
    """Append one event for a change that has already committed; never raise.

    Producers call this after their own transaction so the log's head-row lock
    cannot outlive a failed mutation. The event is a record of the work, not
    part of it: a database outage here loses the row and logs a warning rather
    than failing a sync, a build or a comment write. Returns ``None`` when the
    row could not be appended.
    """

    try:
        return record(kind, project_id=project_id, topic=topic, payload=payload)
    except Exception:
        logger.warning(
            "Could not record the %s event for project %s", kind, project_id, exc_info=True
        )
        return None


def _insert(conn: Any, kind: str, project_id: str | None, topic: str, payload: dict[str, Any]) -> int:
    # The head row stays locked until the caller's transaction ends, so ids
    # commit in order and a reader's cursor never passes a smaller id that is
    # still uncommitted. Record inside short transactions only.
    head = conn.execute(
        "UPDATE ws_event_head SET cursor = cursor + 1 WHERE singleton RETURNING cursor"
    ).fetchone()
    event_id = int(head["cursor"])
    conn.execute(
        """
        INSERT INTO ws_events (id, kind, project_id, topic, payload, request_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (event_id, kind, project_id, topic, Jsonb(payload), request_context.request_id()),
    )
    conn.execute("SELECT pg_notify(%s, %s)", (CHANNEL, str(event_id)))
    return event_id


def list_after(
    after: int,
    *,
    role: Role,
    is_admin: bool,
    topics: list[str] | None,
    limit: int = 200,
) -> tuple[list[dict[str, Any]], int]:
    """Events with ``id > after``, oldest first, and the cursor to read next.

    Visibility follows folder visibility: an event that names a project is
    returned only when that project exists and its folder admits ``role``. An
    event with no project is admin-only. ``topics`` filters to exact matches
    when it is not ``None``.
    """

    if after < 0:
        raise ValueError("after must not be negative")
    if not _MIN_LIMIT <= limit <= _MAX_LIMIT:
        raise ValueError(f"limit must be between {_MIN_LIMIT} and {_MAX_LIMIT}")

    params = {
        "after": after,
        "is_admin": is_admin,
        "topics": topics,
        "limit": limit,
        **policy.folder_visibility_params(role),
    }
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT e.id, e.kind, e.project_id, e.topic, e.payload, e.created_at
            FROM ws_events e
            LEFT JOIN ws_projects p ON p.id = e.project_id
            LEFT JOIN ws_folders f ON f.id = p.folder_id
            WHERE e.id > %(after)s
              AND (
                  (e.project_id IS NULL AND %(is_admin)s)
                  OR (
                      e.project_id IS NOT NULL
                      AND p.id IS NOT NULL
                      AND {policy.folder_visible_sql("f")}
                  )
              )
              AND (%(topics)s::text[] IS NULL OR e.topic = ANY(%(topics)s::text[]))
            ORDER BY e.id ASC
            LIMIT %(limit)s
            """,
            params,
        ).fetchall()

    events = [
        {
            "id": int(row["id"]),
            "kind": row["kind"],
            "projectId": row["project_id"],
            "topic": row["topic"],
            "createdAt": row["created_at"].isoformat().replace("+00:00", "Z"),
            "payload": row["payload"] or {},
        }
        for row in rows
    ]
    return events, (events[-1]["id"] if events else after)


def sweep_older_than(days: int) -> int:
    """Delete events older than ``days``; return how many rows went."""

    with connect() as conn:
        result = conn.execute(
            "DELETE FROM ws_events WHERE created_at < NOW() - (%s * INTERVAL '1 day')",
            (max(0, days),),
        )
        return int(result.rowcount or 0)
