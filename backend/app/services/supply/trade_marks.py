"""Whether a part is export controlled: what distributors state, and a person's word that wins over it.

A tag on the part sheet reads "Export controlled 3A991" when a distributor gives an ECCN other than EAR99, "ECCN disputed" when
they differ, and nothing for EAR99 or no class. A person can mark a part controlled (with a class) or not controlled; the BOM's
trade classification and the Insights Trade section use the mark too. Functions on a connection; none commit.
"""

from __future__ import annotations

from typing import Any

from app.services.supply import clock, facts, parts, trade
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Refused

MAX_ECCN = 40


class TradeMarkError(Refused):
    """The mark cannot be set. The message is safe to show."""

    code = "invalid_trade_mark"


def state(conn, part_id: str) -> dict[str, Any]:
    """``control`` (controlled, none, disputed, unknown), the classes behind it and the person's mark when there is one."""

    mark = conn.execute("SELECT control, eccn, set_by, set_at FROM supply_part_trade_marks WHERE part_id = %s", (part_id,)).fetchone()
    entries = {fact["name"]: fact["sources"] for fact in facts.for_part(conn, part_id)}
    classes = list(dict.fromkeys(source["value"].strip() for source in entries.get("eccn", []) if source["value"].strip()))
    stated = trade.control_of(classes)
    if mark:
        return {
            "control": mark["control"], "eccn": [mark["eccn"]] if mark["eccn"] else [], "stated": stated, "stated_eccn": classes,
            "mark": {"control": mark["control"], "eccn": mark["eccn"], "set_by": mark["set_by"], "set_at": mark["set_at"].isoformat()},
        }
    return {"control": stated, "eccn": classes, "stated": stated, "stated_eccn": classes, "mark": None}


def set_mark(conn, part_id: str, control: str, eccn: str, actor: str) -> None:
    actor = actor_text(actor)
    parts.get_part(conn, part_id)
    if control not in ("controlled", "none"):
        raise TradeMarkError("A part is export controlled or not controlled.")
    code = " ".join(eccn.split()).upper()[:MAX_ECCN]
    if control == "controlled" and not code:
        raise TradeMarkError("Say which export control class applies, such as 3A991.")
    before = state(conn, part_id)["control"]
    conn.execute(
        """
        INSERT INTO supply_part_trade_marks (part_id, control, eccn, set_by, set_at) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (part_id) DO UPDATE SET control = EXCLUDED.control, eccn = EXCLUDED.eccn, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
        """,
        (part_id, control, code if control == "controlled" else "", actor, clock.now()),
    )
    write_audit(conn, actor, "part.trade_mark", part_id, {"before": before, "after": control, "eccn": code}, subject_kind="part")


def clear_mark(conn, part_id: str, actor: str) -> bool:
    actor = actor_text(actor)
    before = state(conn, part_id)["control"]
    removed = conn.execute("DELETE FROM supply_part_trade_marks WHERE part_id = %s", (part_id,)).rowcount
    if removed:
        write_audit(conn, actor, "part.trade_mark", part_id, {"before": before, "after": None}, subject_kind="part")
    return bool(removed)
