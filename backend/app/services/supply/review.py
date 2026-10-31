"""The review queue: what matching could not settle by itself.

Two kinds of item wait for a person. A spelling a distributor used that maps to
no manufacturer yet, and a listing that is a candidate for a part but is not
proven to be it. Deciding is done with ``parts.confirm_alias`` and
``discovery.pin_listing`` / ``reject_listing``. Functions here read.
"""

from __future__ import annotations

from typing import Any

from app.services.supply import component_parts, discovery, parts, settle
from app.services.supply.identity import alias_key, match_key

# Another maker's listing of a number (near) is kept on the part and shown there; only the legacy waiting state is queued.
_WAITING_STATES = (discovery.UNRESOLVED,)


def manufacturers(conn, *, limit: int = 1000) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT m.id, m.name, COUNT(p.id) AS part_count FROM supply_manufacturers m "
        "LEFT JOIN supply_parts p ON p.manufacturer_id = m.id GROUP BY m.id, m.name ORDER BY lower(m.name) LIMIT %s",
        (limit,),
    ).fetchall()
    return [{"id": row["id"], "name": row["name"], "part_count": int(row["part_count"])} for row in rows]


def other_number_pins(conn, *, limit: int = 2000) -> list[dict[str, Any]]:
    """Listings a person pinned as a part although their number is another one, grouped by part.

    A distributor's loose search returns look-alikes (ACAG0301-2450-T for TSR 1-2450); pinned, their stock counts as the
    part's. Taking them off is one decision per part.
    """

    rows = conn.execute(
        """
        SELECT l.id, l.sku, l.raw_mpn, c.display_name AS connector, p.id AS part_id, p.mpn, p.match_key, m.name AS manufacturer
        FROM supply_listings l JOIN supply_parts p ON p.id = l.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN supply_connectors c ON c.id = l.connector_id
        WHERE l.match_state = 'manual' ORDER BY lower(p.mpn), c.display_name, l.sku LIMIT %s
        """,
        (limit,),
    ).fetchall()
    others: dict[str, set[str]] = {}
    for item in conn.execute("SELECT part_id, match_key FROM supply_part_numbers").fetchall():
        others.setdefault(item["part_id"], set()).add(item["match_key"])
    groups: dict[str, dict[str, Any]] = {}
    for row in rows:
        number = match_key(row["raw_mpn"] or "")
        if not number or number == row["match_key"] or number in others.get(row["part_id"], ()):
            continue
        group = groups.setdefault(row["part_id"], {"part_id": row["part_id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "listings": []})
        group["listings"].append({"id": row["id"], "sku": row["sku"], "raw_mpn": row["raw_mpn"], "connector": row["connector"]})
    return list(groups.values())


def to_approve(conn, *, limit: int = 200) -> dict[str, list[dict[str, Any]]]:
    """What QA and administrators have been asked to approve: waivers proposed on a finding, alternates proposed for a component,
    ending components proposed for dismissal, and alerts someone asked to switch off on a part."""

    waivers = conn.execute(
        """
        SELECT d.id, d.part_id, p.mpn, m.name AS manufacturer, d.kind AS check_id, d.scope, d.reason, d.made_by AS proposed_by, d.made_at AS proposed_at
        FROM supply_attention_decisions d JOIN supply_parts p ON p.id = d.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE d.decision = 'waive' AND d.state = 'proposed' AND d.attention_id IS NULL ORDER BY d.made_at LIMIT %s
        """,
        (limit,),
    ).fetchall()
    mutes = conn.execute(
        """
        SELECT d.id, d.part_id, p.mpn, m.name AS manufacturer, d.kind, d.made_by AS proposed_by, d.made_at AS proposed_at
        FROM supply_attention_decisions d JOIN supply_parts p ON p.id = d.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE d.decision = 'mute' AND d.state = 'proposed' AND d.attention_id IS NULL ORDER BY d.made_at LIMIT %s
        """,
        (limit,),
    ).fetchall()
    dismissals = conn.execute(
        """
        SELECT d.id, d.component_id, r.name AS component_name, r.mpn AS component_mpn, d.scope AS reasons, d.made_by AS proposed_by,
               d.made_at AS proposed_at
        FROM supply_attention_decisions d JOIN components c ON c.id = d.component_id JOIN component_revisions r ON r.id = c.current_revision_id
        WHERE d.decision = 'dismiss' AND d.state = 'proposed' AND d.attention_id IS NULL AND c.is_active = 1 ORDER BY d.made_at LIMIT %s
        """,
        (limit,),
    ).fetchall() if component_parts.library_present(conn) else []
    alternates = conn.execute(
        """
        SELECT cp.component_id, r.name AS component_name, r.mpn AS component_mpn, cp.part_id, p.mpn, m.name AS manufacturer,
               cp.created_by AS proposed_by, cp.created_at AS proposed_at,
               COALESCE(main.part_id, '') AS main_part_id, COALESCE(mp.mpn, '') AS main_mpn
        FROM component_parts cp JOIN supply_parts p ON p.id = cp.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN components c ON c.id = cp.component_id JOIN component_revisions r ON r.id = c.current_revision_id
        LEFT JOIN component_parts main ON main.component_id = cp.component_id AND main.role = 'main'
        LEFT JOIN supply_parts mp ON mp.id = main.part_id
        WHERE cp.role = %s AND cp.approval = %s AND c.is_active = 1 ORDER BY cp.created_at LIMIT %s
        """,
        (component_parts.ALTERNATE, component_parts.PENDING, limit),
    ).fetchall() if component_parts.library_present(conn) else []
    return {
        "waivers": [{**dict(row), "proposed_at": row["proposed_at"].isoformat()} for row in waivers],
        "alternates": [{**dict(row), "component_id": str(row["component_id"]), "proposed_at": row["proposed_at"].isoformat()} for row in alternates],
        "dismissals": [{**dict(row), "component_id": str(row["component_id"]), "reasons": row["reasons"].split(","),
                        "proposed_at": row["proposed_at"].isoformat()} for row in dismissals],
        "mutes": [{**dict(row), "proposed_at": row["proposed_at"].isoformat()} for row in mutes],
    }


def matched_by_prism(conn, *, limit: int = 100) -> dict[str, Any]:
    """What Prism decided by itself and a person may undo: the spellings it learned for a maker, and the parts it settled."""

    learned = conn.execute(
        """
        SELECT a.alias_key, a.alias_text, m.name AS manufacturer, a.first_seen_at,
               (SELECT COUNT(*) FROM supply_part_spellings s WHERE s.alias_key = a.alias_key) AS parts
        FROM supply_manufacturer_aliases a JOIN supply_manufacturers m ON m.id = a.manufacturer_id
        WHERE a.source = 'learned' ORDER BY a.first_seen_at DESC LIMIT %s
        """,
        (limit,),
    ).fetchall()
    settled = conn.execute(
        """
        SELECT e.subject_id AS part_id, p.mpn, m.name AS manufacturer, e.at
        FROM supply_audit_events e JOIN supply_parts p ON p.id = e.subject_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE e.action = 'part.settle' AND e.actor = %s ORDER BY e.at DESC LIMIT %s
        """,
        (settle.SYSTEM, limit),
    ).fetchall()
    return {
        "aliases": [{**dict(row), "first_seen_at": row["first_seen_at"].isoformat(), "parts": int(row["parts"])} for row in learned],
        "parts": [{**dict(row), "at": row["at"].isoformat()} for row in settled],
    }


def review_queue(conn, *, limit: int = 200) -> dict[str, Any]:
    """Pending spellings and listings waiting for a decision, newest first."""

    rows = conn.execute(
        """
        SELECT l.id, l.connector_id, c.display_name AS connector_name, c.provider, l.sku, l.raw_mpn, l.raw_manufacturer,
               l.match_state, l.match_reason, l.first_seen_at, COALESCE(NULLIF(o.packaging, 'unknown'), l.packaging) AS packaging,
               o.reel_size, o.packaging_inferred,
               p.id AS part_id, p.mpn AS part_mpn, m.name AS part_manufacturer
        FROM supply_listings l
        JOIN supply_connectors c ON c.id = l.connector_id
        LEFT JOIN supply_offers o ON o.listing_id = l.id
        LEFT JOIN supply_parts p ON p.id = l.part_id
        LEFT JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE l.match_state = ANY(%s)
        ORDER BY l.first_seen_at DESC, l.sku
        LIMIT %s
        """,
        (list(_WAITING_STATES), limit),
    ).fetchall()
    counts = {
        row["match_state"]: int(row["n"])
        for row in conn.execute(
            "SELECT match_state, COUNT(*) AS n FROM supply_listings WHERE match_state = ANY(%s) GROUP BY match_state",
            (list(_WAITING_STATES),),
        ).fetchall()
    }
    waiting_by_alias: dict[str, int] = {}
    for row in conn.execute(
        "SELECT raw_manufacturer FROM supply_listings WHERE match_state = %s", (discovery.UNRESOLVED,)
    ).fetchall():
        key = alias_key(row["raw_manufacturer"])
        waiting_by_alias[key] = waiting_by_alias.get(key, 0) + 1

    # A spelling nothing waits on is not a question: it stays pending, and comes back if a listing uses it again.
    aliases = [
        {**alias, "first_seen_at": alias["first_seen_at"].isoformat(), "waiting_listings": waiting_by_alias[alias["alias_key"]]}
        for alias in parts.pending_aliases(conn)
        if waiting_by_alias.get(alias["alias_key"], 0) > 0
    ]
    return {
        "aliases": aliases,
        "listings": [
            {
                "id": row["id"],
                "connector_id": row["connector_id"],
                "connector_name": row["connector_name"],
                "provider": row["provider"],
                "sku": row["sku"],
                "raw_mpn": row["raw_mpn"],
                "raw_manufacturer": row["raw_manufacturer"],
                "match_state": row["match_state"],
                "match_reason": row["match_reason"],
                "packaging": row["packaging"], "reel_size": row["reel_size"], "packaging_inferred": bool(row["packaging_inferred"]),
                "first_seen_at": row["first_seen_at"].isoformat(),
                "part": (
                    {"id": row["part_id"], "mpn": row["part_mpn"], "manufacturer": row["part_manufacturer"]}
                    if row["part_id"] else None
                ),
            }
            for row in rows
        ],
        "other_numbers": other_number_pins(conn),
        "choices": settle.needs_choice(conn),
        "matched": matched_by_prism(conn),
        "to_approve": to_approve(conn),
        "counts": {"aliases": len(aliases), "unresolved": counts.get(discovery.UNRESOLVED, 0), "near": counts.get(discovery.NEAR, 0)},
        "manufacturers": manufacturers(conn),
    }
