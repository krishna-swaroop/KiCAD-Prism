"""Event-log and webhook health for the ops diagnostics (ADR §11, OPS-04c).

The event log's head cursor and retention say whether producers are keeping up
and whether a consumer that fell behind can still replay; each webhook's lag is
the distance between that head and its own settled cursor. Delivery counts are
the last day's attempts.

A webhook's URL can carry a secret in its path or query, so a result names only
its host. The stored ``last_error`` is free text and passes through the one
redactor (D22), as does the whole result.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

from app.core.config import settings
from app.core.redaction import REDACTED, redact_text, redact_value
from app.services.ops.timefmt import iso_z as _iso
from app.services.workspace_connection import connect


def _host(url: object) -> str:
    """The URL's host only: never its scheme's userinfo, path or query."""

    try:
        host = urlsplit(str(url or "")).hostname
    except ValueError:
        return ""
    return (host or "").lower()


def _without_url_parts(text: str, url: object) -> str:
    """``text`` with this endpoint's own path and query removed before redaction.

    A delivery error often quotes the request it made. The endpoint's path and
    query may carry its secret, so neither may appear in the result even inside
    free text; the host may.
    """

    try:
        parts = urlsplit(str(url or ""))
    except ValueError:
        return text
    if parts.path and parts.path != "/":
        text = text.replace(parts.path, REDACTED)
    if parts.query:
        text = text.replace(parts.query, REDACTED)
    return text


def _deliveries(conn: Any) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT webhook_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE ok) AS ok_count,
               COUNT(*) FILTER (WHERE NOT ok) AS failed_count
        FROM ws_webhook_deliveries
        WHERE at >= NOW() - INTERVAL '24 hours'
        GROUP BY webhook_id
        """
    ).fetchall()
    by_webhook: dict[str, dict[str, Any]] = {}
    for row in rows:
        total = int(row["total"] or 0)
        failed = int(row["failed_count"] or 0)
        by_webhook[str(row["webhook_id"])] = {
            "deliveries": total,
            "ok": int(row["ok_count"] or 0),
            "failed": failed,
            "error_rate": (failed / total) if total else 0.0,
        }
    return by_webhook


def event_and_webhook_health() -> dict[str, Any]:
    """Event-log head, retention and per-webhook lag and delivery health."""

    with connect() as conn:
        head_row = conn.execute("SELECT cursor FROM ws_event_head").fetchone()
        head = int(head_row["cursor"]) if head_row is not None else 0
        oldest_row = conn.execute("SELECT MIN(created_at) AS oldest FROM ws_events").fetchone()
        oldest = oldest_row["oldest"] if oldest_row is not None else None
        by_kind = conn.execute(
            """
            SELECT kind, COUNT(*) AS count
            FROM ws_events
            WHERE created_at >= NOW() - INTERVAL '1 hour'
            GROUP BY kind
            ORDER BY kind
            """
        ).fetchall()
        webhooks = conn.execute(
            """
            SELECT id, url, status, event_kinds, cursor, failing_since, attempts,
                   next_attempt_at, last_status, last_error
            FROM ws_webhooks
            ORDER BY created_at, id
            """
        ).fetchall()
        deliveries = _deliveries(conn)

    result = {
        "head_cursor": head,
        "oldest_retained_at": _iso(oldest),
        "retention_days": int(settings.PRISM_EVENT_RETENTION_DAYS),
        "events_last_hour": [
            {"kind": str(row["kind"]), "count": int(row["count"])} for row in by_kind
        ],
        "webhooks": [
            {
                "id": str(row["id"]),
                "host": _host(row["url"]),
                "status": str(row["status"]),
                "event_kinds": [str(kind) for kind in (row["event_kinds"] or [])],
                "cursor": int(row["cursor"] or 0),
                "lag": max(0, head - int(row["cursor"] or 0)),
                "failing_since": _iso(row["failing_since"]),
                "attempts": int(row["attempts"] or 0),
                "next_attempt_at": _iso(row["next_attempt_at"]),
                "last_status": int(row["last_status"]) if row["last_status"] is not None else None,
                "last_error": redact_text(_without_url_parts(row["last_error"], row["url"]))
                if row["last_error"]
                else None,
                "deliveries_24h": deliveries.get(
                    str(row["id"]), {"deliveries": 0, "ok": 0, "failed": 0, "error_rate": 0.0}
                ),
            }
            for row in webhooks
        ],
    }
    return redact_value(result)


__all__ = ["connect", "event_and_webhook_health"]
