"""Watching a catalog component: a reason to follow its main part, like a tracked project.

A component watch is a standing request. ``tracking`` reads it as a ``component`` reason for the component's main part
(``component_parts``), at the watch's tier and rate, so the poller, alerts and the Parts list work as they do for any followed
part. When the component's maker or number changes, ``component_parts.sync_main`` moves the main part and the reason moves
with it. Stopping a component watch takes the reason away: the part drops a tier unless something else follows it. The watch's
packaging counts when no person's watch on the part chose one (``stock.packaging_of``).

Only in a schema with the catalog: the table refers to catalog components.
"""

from __future__ import annotations

from typing import Any

from app.services.supply import component_parts, stock, tracking
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Refused


class ComponentWatchError(Refused):
    """The request is not valid. The message is safe to show."""

    code = "component_watch_error"


def get(conn, component_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT component_id, packaging, tier, rate, owner FROM supply_component_watches WHERE component_id = %s", (component_id,)
    ).fetchone()
    return dict(row) if row else None


def _main_part(conn, component_id: str) -> str | None:
    row = conn.execute("SELECT part_id FROM component_parts WHERE component_id = %s AND role = 'main'", (component_id,)).fetchone()
    return row["part_id"] if row else None


def set_watch(conn, component_id: str, actor: str, *, packaging: str = "any", tier: int = 2, rate: str = "weekly") -> dict[str, Any]:
    actor = actor_text(actor)
    if packaging not in stock.POLICIES:
        raise ComponentWatchError("Packaging is any, cut_tape, tape_reel, tray, tube or bulk.")
    try:
        tier, rate = tracking.check_tier(tier, rate)
    except tracking.TrackingError as exc:
        raise ComponentWatchError(str(exc)) from exc
    named = conn.execute(
        """
        SELECT r.manufacturer, r.mpn FROM components c JOIN component_revisions r ON r.id = c.current_revision_id
        WHERE c.id = %s AND c.is_active = 1
        """,
        (component_id,),
    ).fetchone() if component_parts.library_present(conn) else None
    if named is None or not (named["manufacturer"] or "").strip() or not (named["mpn"] or "").strip():
        raise ComponentWatchError("The component needs a manufacturer and a part number before it can be watched.")
    before = _main_part(conn, component_id)
    conn.execute(
        """
        INSERT INTO supply_component_watches (component_id, packaging, tier, rate, owner, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (component_id) DO UPDATE SET packaging = EXCLUDED.packaging, tier = EXCLUDED.tier, rate = EXCLUDED.rate
        """,
        (component_id, packaging, tier, rate, actor, actor),
    )
    write_audit(conn, actor, "component_watch.set", component_id, {"packaging": packaging, "tier": tier, "rate": rate}, subject_kind="component")
    # The main part follows the revision now rather than at the next housekeeping. A number several makers share waits for a person;
    # the reason counts once the main part is settled.
    component_parts.sync_main(conn, [component_id], actor=actor)
    tracking.recompute(conn, [part for part in (before, _main_part(conn, component_id)) if part])
    return get(conn, component_id) or {}


def remove_watch(conn, component_id: str, actor: str) -> None:
    actor = actor_text(actor)
    if conn.execute("DELETE FROM supply_component_watches WHERE component_id = %s RETURNING component_id", (component_id,)).fetchone() is None:
        return
    write_audit(conn, actor, "component_watch.remove", component_id, {}, subject_kind="component")
    part_id = _main_part(conn, component_id)
    if part_id:
        tracking.recompute(conn, [part_id])


def remove_for_part(conn, part_id: str, actor: str) -> list[str]:
    """Stop the watches of the components whose main part this is (a person stopped following the part). Returns their ids."""

    if not component_parts.library_present(conn):
        return []
    actor = actor_text(actor)
    gone = [
        row["component_id"]
        for row in conn.execute(
            """
            DELETE FROM supply_component_watches w USING component_parts cp
            WHERE cp.component_id = w.component_id AND cp.role = 'main' AND cp.part_id = %s
            RETURNING w.component_id
            """,
            (part_id,),
        ).fetchall()
    ]
    for component_id in gone:
        write_audit(conn, actor, "component_watch.remove", component_id, {"part_id": part_id}, subject_kind="component")
    return gone
