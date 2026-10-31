"""Read one part now, or the parts someone is looking at.

A person asks for a fresh reading of a part instead of waiting for its turn. It reads that part's
counted listings at each distributor that holds one, and spends the interactive reserve, never the
polling budget. One person may ask for the same part once every fifteen minutes.

``read_on_view`` is the same read without asking: opening parts nothing follows reads, in one batch per distributor, the
listings whose prices are older than the read window (``retention.READ_WINDOW``, after which a distributor that limits
storage has them deleted). A part is tried once every fifteen minutes, whoever looks.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable

from app.services.supply import clock as supply_clock
from app.services.supply import poller, parts, retention, trouble
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.connectors import ConnectorService
from app.services.supply import errors

COOLDOWN = timedelta(minutes=15)
ACTION = "part.refresh"
VIEW_ACTION = "part.view_read"
VIEW_MAX_PARTS = 50

_STOPPED_TEXT = {
    poller.STOPPED_INACTIVE: "is disabled or paused",
    poller.STOPPED_COOLING_DOWN: "is cooling down after an error",
    poller.STOPPED_BUDGET: "has used today's allowance for asking",
    "auth_failed": "rejected its credentials",
    "rate_limited": "is limiting requests",
    "blocked": "was refused",
    "error": "did not answer",
}


class TooSoon(errors.TooSoon):
    """The same person asked for this part a short while ago. The message says how long to wait."""

    code = "read_too_soon"


def _wait_text(remaining: timedelta) -> str:
    minutes = max(1, int(remaining.total_seconds() // 60) + 1)
    return f"You read this part a moment ago. You can read it again in {minutes} {'minute' if minutes == 1 else 'minutes'}."


def read_now(
    connectors: ConnectorService,
    part_id: str,
    actor: str,
    *,
    clock: Callable[[], datetime] | None = None,
    reader: poller.Poller | None = None,
) -> dict[str, Any]:
    actor = actor_text(actor)
    now = (clock or supply_clock.now)()
    store = connectors.store
    with store.connection() as conn:
        parts.get_part(conn, part_id)
        last = conn.execute(
            "SELECT MAX(at) AS at FROM supply_audit_events WHERE action = %s AND subject_id = %s AND actor = %s",
            (ACTION, part_id, actor),
        ).fetchone()["at"]
        if last is not None and now - last < COOLDOWN:
            raise TooSoon(_wait_text(COOLDOWN - (now - last)))
        connector_ids = [
            row["connector_id"]
            for row in conn.execute(
                "SELECT DISTINCT connector_id FROM supply_listings WHERE part_id = %s AND supply_counted(match_state) "
                "ORDER BY connector_id",
                (part_id,),
            ).fetchall()
        ]
        if connector_ids:
            # Asking about a part nothing lists is not a reading, so it does not start the wait.
            write_audit(conn, actor, ACTION, part_id, {"connectors": len(connector_ids)}, subject_kind="part")

    reader = reader or poller.Poller(connectors, store=store, clock=clock)
    read = 0
    problems: list[dict[str, str]] = []
    for connector_id in connector_ids:
        summary = reader.poll_connector(connector_id, interactive=True, only_part=part_id)
        read += summary.polled
        if summary.stopped and summary.stopped != poller.STOPPED_NOTHING_DUE:
            name = connectors.get(connector_id)["display_name"]
            problems.append({
                "connector": name,
                "reason": trouble.stopped_text(store, connector_id, name, summary.stopped, now, _STOPPED_TEXT.get(summary.stopped, "could not be read")),
            })
    return {"read": read, "connectors": len(connector_ids), "problems": problems}


def read_on_view(
    connectors: ConnectorService,
    part_ids: list[str],
    actor: str,
    *,
    clock: Callable[[], datetime] | None = None,
    reader: poller.Poller | None = None,
) -> dict[str, Any]:
    """Read the parts someone opened that nothing follows and whose prices have aged past the read window, from the interactive
    reserve. Returns how many listings were read."""

    now = (clock or supply_clock.now)()
    stale = now - retention.READ_WINDOW
    store = connectors.store
    wanted = list(dict.fromkeys(str(part_id) for part_id in part_ids if part_id))[:VIEW_MAX_PARTS]
    with store.connection() as conn:
        used = retention.in_use(conn, wanted)
        tried = {row["subject_id"] for row in conn.execute(
            "SELECT DISTINCT subject_id FROM supply_audit_events WHERE action = %s AND subject_id = ANY(%s) AND at > %s",
            (VIEW_ACTION, wanted, now - COOLDOWN),
        ).fetchall()}
        todo = [part_id for part_id in wanted if part_id not in used and part_id not in tried]
        rows = conn.execute(
            "SELECT l.connector_id, l.part_id FROM supply_listings l LEFT JOIN supply_offers o ON o.listing_id = l.id "
            "WHERE l.part_id = ANY(%s) AND supply_counted(l.match_state) AND (o.fetched_at IS NULL OR o.fetched_at < %s) "
            "ORDER BY l.connector_id, l.part_id",
            (todo, stale),
        ).fetchall() if todo else []
        by_connector: dict[str, list[str]] = {}
        for row in rows:
            by_connector.setdefault(row["connector_id"], [])
            if row["part_id"] not in by_connector[row["connector_id"]]:
                by_connector[row["connector_id"]].append(row["part_id"])
        for part_id in sorted({row["part_id"] for row in rows}):
            write_audit(conn, actor_text(actor), VIEW_ACTION, part_id, {}, subject_kind="part")
    reader = reader or poller.Poller(connectors, store=store, clock=clock)
    read = 0
    for connector_id, ids in by_connector.items():
        read += reader.poll_connector(connector_id, interactive=True, only_part=ids, fresh_since=stale).polled
    return {"read": read}
