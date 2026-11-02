"""A part's preferred distributor, chosen by a person.

The preferred distributor is shown first on the part sheet and marked in lists. It changes no figure: the stock total, the
cheapest price and the BOM cost stay across every distributor. One per part; a person sets or clears it at any time.
Functions on a connection; none commit.
"""

from __future__ import annotations

from app.services.supply import clock, counted, parts
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Refused



class PreferenceError(Refused):
    """The choice cannot be made. The message is safe to show."""

    code = "invalid_preference"


def get(conn, part_id: str) -> str | None:
    row = conn.execute("SELECT connector_id FROM supply_part_preferences WHERE part_id = %s", (part_id,)).fetchone()
    return row["connector_id"] if row else None


def of_parts(conn, part_ids: list[str]) -> dict[str, str]:
    if not part_ids:
        return {}
    return {
        row["part_id"]: row["connector_id"]
        for row in conn.execute("SELECT part_id, connector_id FROM supply_part_preferences WHERE part_id = ANY(%s)", (part_ids,)).fetchall()
    }


def set_preferred(conn, part_id: str, connector_id: str, actor: str) -> None:
    actor = actor_text(actor)
    parts.get_part(conn, part_id)
    listed = conn.execute(
        "SELECT 1 FROM supply_listings WHERE part_id = %s AND connector_id = %s AND match_state = ANY(%s) LIMIT 1", (part_id, connector_id, list(counted.STATES))
    ).fetchone()
    if listed is None:
        raise PreferenceError("This distributor does not list the part.")
    before = get(conn, part_id)
    conn.execute(
        """
        INSERT INTO supply_part_preferences (part_id, connector_id, set_by, set_at) VALUES (%s, %s, %s, %s)
        ON CONFLICT (part_id) DO UPDATE SET connector_id = EXCLUDED.connector_id, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
        """,
        (part_id, connector_id, actor, clock.now()),
    )
    write_audit(conn, actor, "part.prefer", part_id, {"before": before, "after": connector_id}, subject_kind="part")


def clear(conn, part_id: str, actor: str) -> bool:
    actor = actor_text(actor)
    before = get(conn, part_id)
    removed = conn.execute("DELETE FROM supply_part_preferences WHERE part_id = %s", (part_id,)).rowcount
    if removed:
        write_audit(conn, actor, "part.prefer", part_id, {"before": before, "after": None}, subject_kind="part")
    return bool(removed)
