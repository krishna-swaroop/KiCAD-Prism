"""One request id across the diagnostics it left behind (ADR §11, D24, OPS-04b).

``ws_ops_requests`` holds the slow, write and failed requests; the jobs, events
and MCP audit rows a request created carry the same ``request_id`` (migration
139). ``recent_requests`` is how an agent finds an id in the first place:
newest first, optionally narrowed by duration, status or route prefix.

Only identifiers, timings and counts leave this module. Event payloads are
never read, and no job payload, message or result is selected (D22).
"""

from __future__ import annotations

from typing import Any

from app.services.ops.timefmt import iso_z as _iso
from app.services.postgres_database import database

DEFAULT_LIMIT = 50
MAX_LIMIT = 500


def _nested(details: Any) -> bool:
    return bool(details.get("nested")) if isinstance(details, dict) else False


def _clamp(value: int, low: int, high: int) -> int:
    return min(max(int(value), low), high)


def _request_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "requestId": str(row["request_id"]),
        "at": _iso(row["at"]),
        "method": str(row["method"]),
        "route": str(row["route"]),
        "status": int(row["status"]),
        "durationMs": int(row["duration_ms"]),
        "dbMs": int(row["db_ms"] or 0),
        "authType": str(row["auth_type"] or ""),
        "clientId": str(row["client_id"] or ""),
        "nested": _nested(row["details"]),
    }


def recent_requests(
    limit: int = DEFAULT_LIMIT,
    min_duration_ms: int | None = None,
    status_min: int | None = None,
    route_prefix: str | None = None,
) -> list[dict[str, Any]]:
    """The newest request-log rows, most recent first, for finding an id to trace."""

    filters: list[str] = []
    params: list[Any] = []
    if min_duration_ms is not None:
        filters.append("duration_ms >= %s")
        params.append(max(0, int(min_duration_ms)))
    if status_min is not None:
        filters.append("status >= %s")
        params.append(max(100, int(status_min)))
    prefix = (route_prefix or "").strip()
    if prefix:
        filters.append("LEFT(route, %s) = %s")
        params.extend([len(prefix), prefix])
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    params.append(_clamp(limit, 1, MAX_LIMIT))

    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        rows = conn.execute(
            f"""
            SELECT request_id, at, method, route, status, duration_ms, db_ms,
                   auth_type, client_id, details
            FROM ws_ops_requests
            {where}
            ORDER BY at DESC, id DESC
            LIMIT %s
            """,
            tuple(params),
        ).fetchall()

    return [_request_row(row) for row in rows]


def trace_request(request_id: str) -> dict[str, Any] | None:
    """Every diagnostic row carrying ``request_id``, or ``None`` if none does."""

    request_id = str(request_id or "").strip()
    if not request_id:
        return None

    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        request_rows = conn.execute(
            """
            SELECT request_id, at, method, route, status, duration_ms, db_ms,
                   auth_type, client_id, details
            FROM ws_ops_requests
            WHERE request_id = %s
            ORDER BY at ASC, id ASC
            """,
            (request_id,),
        ).fetchall()
        job_rows = conn.execute(
            """
            SELECT id, kind, status, created_at, updated_at, started_at, completed_at
            FROM ws_jobs
            WHERE request_id = %s
            ORDER BY created_at ASC, id ASC
            """,
            (request_id,),
        ).fetchall()
        event_rows = conn.execute(
            """
            SELECT id, kind, project_id, topic, created_at
            FROM ws_events
            WHERE request_id = %s
            ORDER BY id ASC
            """,
            (request_id,),
        ).fetchall()
        audit_rows = conn.execute(
            """
            SELECT tool, outcome, code, duration_ms
            FROM ws_mcp_audit
            WHERE request_id = %s
            ORDER BY at ASC, id ASC
            """,
            (request_id,),
        ).fetchall()

    if not (request_rows or job_rows or event_rows or audit_rows):
        return None

    return {
        "requestId": request_id,
        "requests": [_request_row(row) for row in request_rows],
        "jobs": [
            {
                "id": str(row["id"]),
                "kind": str(row["kind"]),
                "status": str(row["status"]),
                "createdAt": _iso(row["created_at"]),
                "updatedAt": _iso(row["updated_at"]),
                "startedAt": _iso(row["started_at"]),
                "completedAt": _iso(row["completed_at"]),
            }
            for row in job_rows
        ],
        "events": [
            {
                "id": int(row["id"]),
                "kind": str(row["kind"]),
                "projectId": row["project_id"],
                "topic": str(row["topic"]),
                "createdAt": _iso(row["created_at"]),
            }
            for row in event_rows
        ],
        "audit": [
            {
                "tool": str(row["tool"]),
                "outcome": str(row["outcome"]),
                "code": row["code"],
                "durationMs": int(row["duration_ms"] or 0),
            }
            for row in audit_rows
        ],
    }


__all__ = ["DEFAULT_LIMIT", "MAX_LIMIT", "recent_requests", "trace_request"]
