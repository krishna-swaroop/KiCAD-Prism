"""How the supply readers are doing: calls against budget, errors, and how late reads are running.

Reads only. For an operator who wants to know whether polling keeps up, not for a person choosing parts.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.supply import clock
from app.services.supply.providers import registry

# A listing is late when it was due more than this long ago.
LATE_AFTER = timedelta(hours=1)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def connector_health(conn, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or clock.now()
    rows = conn.execute(
        """
        SELECT c.id, c.display_name, c.provider, c.enabled, c.paused_reason, a.daily_budget, c.last_ok_at,
               c.last_error_code, c.last_error_at, COALESCE(q.spent, 0) AS spent, COALESCE(q.interactive_spent, 0) AS interactive_spent
        FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id
        LEFT JOIN supply_quota_ledger q ON q.account_id = c.account_id AND q.day = %s
        ORDER BY lower(c.display_name), c.id
        """,
        (now.astimezone(timezone.utc).date(),),
    ).fetchall()
    polling = {
        row["connector_id"]: row
        for row in conn.execute(
            """
            SELECT l.connector_id, COUNT(*) AS listings,
                   COUNT(*) FILTER (WHERE ps.next_poll_at < %s) AS late,
                   MIN(ps.next_poll_at) FILTER (WHERE ps.next_poll_at < %s) AS most_overdue_since,
                   MIN(ps.last_polled_at) AS oldest_read,
                   COUNT(*) FILTER (WHERE ps.error_streak > 0) AS failing
            FROM supply_listings l LEFT JOIN supply_poll_state ps ON ps.listing_id = l.id
            WHERE supply_counted(l.match_state)
            GROUP BY l.connector_id
            """,
            (now - LATE_AFTER, now - LATE_AFTER),
        ).fetchall()
    }
    result = []
    for row in rows:
        try:
            metered = registry.get_spec(row["provider"]).metered
        except registry.UnknownProvider:
            metered = True
        stats = polling.get(row["id"])
        result.append({
            "connector_id": row["id"],
            "name": row["display_name"],
            "provider": row["provider"],
            "enabled": bool(row["enabled"]),
            "paused_reason": row["paused_reason"],
            "calls_today": int(row["spent"]),
            "interactive_calls_today": int(row["interactive_spent"]),
            "budget": int(row["daily_budget"]) if metered else None,
            "last_ok_at": _iso(row["last_ok_at"]),
            "last_error_code": row["last_error_code"],
            "last_error_at": _iso(row["last_error_at"]),
            "listings": int(stats["listings"]) if stats else 0,
            "late": int(stats["late"]) if stats else 0,
            "failing": int(stats["failing"]) if stats else 0,
            "late_by_hours": round((now - stats["most_overdue_since"]).total_seconds() / 3600, 1) if stats and stats["most_overdue_since"] else 0,
            "oldest_read": _iso(stats["oldest_read"]) if stats else None,
        })
    return result
