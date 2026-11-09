"""The token-activity audit behind ``GET /api/admin/mcp-audit`` (ADR §3.11, D7/D19).

Every ``tools/call`` and ``resources/read`` appends one row after it finishes:
who called it, which project and revision the result names, and whether it
succeeded, failed or was refused. ``app.core.token_audit`` appends the same
shape for each HTTP write made with a bearer token, marked ``method = 'http'``.
:func:`record_quietly` owns a transaction of its own and logs a failure instead
of failing the call it describes — the audit is a record, not part of the read.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core import request_context
from app.services.mcp import registry
from app.services.workspace_connection import connect

logger = logging.getLogger(__name__)

_MIN_LIMIT = 1
_MAX_LIMIT = 500


def result_revision(
    structured: dict[str, Any] | None,
    arguments: dict[str, Any],
) -> str | None:
    """The commit a result names, or the revision the caller asked for."""

    if isinstance(structured, dict):
        revision = structured.get("revision")
        if isinstance(revision, dict):
            commit = revision.get("commit")
            if isinstance(commit, str) and commit:
                return commit
        commit = structured.get("commit")
        if isinstance(commit, str) and commit:
            return commit
        # A comment names the commit it is anchored to.
        anchor = structured.get("anchor")
        if isinstance(anchor, dict):
            commit = anchor.get("commit")
            if isinstance(commit, str) and commit:
                return commit
    for key in ("revision", "commit"):
        requested = arguments.get(key)
        if isinstance(requested, str) and requested:
            return requested
    return None


def record(
    *,
    user_email: str,
    auth_type: str,
    client_id: str,
    token_id: str,
    method: str,
    tool: str,
    project_id: str | None,
    revision: str | None,
    outcome: str,
    code: str | None,
    duration_ms: int,
) -> int:
    """Append one audit row in its own short transaction and return its id."""

    with connect() as conn:
        row = conn.execute(
            """
            INSERT INTO ws_mcp_audit
                (user_email, auth_type, client_id, token_id, method, tool,
                 project_id, revision, outcome, code, duration_ms, request_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                user_email,
                auth_type,
                client_id,
                token_id,
                method,
                tool,
                project_id,
                revision,
                outcome,
                code,
                max(0, int(duration_ms)),
                request_context.request_id(),
            ),
        ).fetchone()
    return int(row["id"])


def record_quietly(**values: Any) -> int | None:
    """Record one call that has already finished; never raise."""

    try:
        return record(**values)
    except Exception:
        logger.warning(
            "Could not record the audit row for %s %s",
            values.get("method"),
            values.get("tool"),
            exc_info=True,
        )
        return None


def write_tool_names() -> list[str]:
    """The registered tools that change Prism, and therefore count as writes."""

    return sorted(tool.name for tool in registry.tools() if tool.write)


def list_page(
    *,
    client_id: str | None = None,
    user_email: str | None = None,
    project_id: str | None = None,
    tool: str | None = None,
    token_id: str | None = None,
    kind: str | None = None,
    before: int | None = None,
    limit: int = 100,
) -> tuple[list[dict[str, Any]], int | None]:
    """Newest-first rows and the cursor to read the next page with.

    ``kind`` is ``"write"`` for an HTTP write and for a registered write tool's
    ``tools/call``; everything else (reads, tasks) is ``"read"``.
    """

    limit = max(_MIN_LIMIT, min(_MAX_LIMIT, int(limit)))
    params = {
        "client_id": client_id or None,
        "user_email": user_email or None,
        "project_id": project_id or None,
        "tool": tool or None,
        "token_id": token_id or None,
        "kind": kind if kind in ("read", "write") else None,
        "write_tools": write_tool_names(),
        "before": before,
        "limit": limit,
    }
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, at, user_email, auth_type, client_id, token_id, method, tool,
                   project_id, revision, outcome, code, duration_ms
            FROM ws_mcp_audit
            WHERE (%(client_id)s::text IS NULL OR client_id = %(client_id)s)
              AND (%(user_email)s::text IS NULL OR user_email = %(user_email)s)
              AND (%(project_id)s::text IS NULL OR project_id = %(project_id)s)
              AND (%(tool)s::text IS NULL OR tool = %(tool)s)
              AND (%(token_id)s::text IS NULL OR token_id = %(token_id)s)
              AND (
                  %(kind)s::text IS NULL
                  OR (
                      %(kind)s = 'write'
                      AND (method = 'http' OR tool = ANY(%(write_tools)s::text[]))
                  )
                  OR (
                      %(kind)s = 'read'
                      AND method <> 'http'
                      AND NOT (tool = ANY(%(write_tools)s::text[]))
                  )
              )
              AND (%(before)s::bigint IS NULL OR id < %(before)s)
            ORDER BY id DESC
            LIMIT %(limit)s
            """,
            params,
        ).fetchall()

    records = [
        {
            "id": int(row["id"]),
            "at": row["at"],
            "user_email": row["user_email"],
            "auth_type": row["auth_type"],
            "client_id": row["client_id"],
            "token_id": row["token_id"],
            "method": row["method"],
            "tool": row["tool"],
            "project_id": row["project_id"],
            "revision": row["revision"],
            "outcome": row["outcome"],
            "code": row["code"],
            "duration_ms": int(row["duration_ms"]),
        }
        for row in rows
    ]
    next_cursor = records[-1]["id"] if len(records) == limit else None
    return records, next_cursor


def sweep_older_than(days: int) -> int:
    """Delete audit rows older than ``days``; return how many rows went."""

    with connect() as conn:
        result = conn.execute(
            "DELETE FROM ws_mcp_audit WHERE at < NOW() - (%s * INTERVAL '1 day')",
            (max(0, days),),
        )
        return int(result.rowcount or 0)


__all__ = [
    "connect",
    "list_page",
    "record",
    "record_quietly",
    "result_revision",
    "sweep_older_than",
    "write_tool_names",
]
