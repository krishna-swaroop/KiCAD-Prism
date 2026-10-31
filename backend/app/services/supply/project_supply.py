"""How one product stands in supply: its parts, releases and line notes.

Reads the lines stored when the project's BOM was read (``usage``), never a checked-out commit, and calls no
distributor. A release is judged again against today's data so the page can say what changed since.
"""

from __future__ import annotations

import json

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Sequence, cast

from app.services.supply import attention, bom_comments, clock, bom_lookup, cost_history, freshness, tracking, usage
from app.services.supply import settings as supply_settings

_WORST_FIRST = {"fatal": 0, "error": 1, "warning": 2, "unknown": 3, "ok": 4}
MAX_RELEASES = 20
COST_HISTORY_DAYS = 180
# Build sizes the page's cost curve is worked out for, and the chosen one.
CURVE_SIZES = (1, 10, 100, 1_000, 10_000)
# Lines the "where the money goes" list names before it says "other".
TOP_LINES = 10
# What changed since a release is told for parts that were fine then and are not now.
_GOOD = ("ok", "warning", None)
_BAD = ("error", "fatal")


# "Spares as the workspace has them set", until the request names its own.
DEFAULT = "default"


def attrition_of(spares: str) -> float | None | str:
    """The spares a request asks for: "auto" is by package (None), a number is that percent for every part, empty is the workspace's
    setting (``DEFAULT``)."""

    text = (spares or "").strip().lower()
    if text == "auto":
        return None
    if not text:
        return DEFAULT
    try:
        percent = float(text)
    except ValueError as exc:
        raise ValueError("Spares are \"auto\" or a percent from 0 to 100.") from exc
    if not 0 <= percent <= 100:
        raise ValueError("Spares are \"auto\" or a percent from 0 to 100.")
    return percent


def bom_line(row: dict[str, Any]) -> bom_lookup.BomLine:
    """A stored BOM row as a line to look up, with the component its symbol places."""

    return bom_lookup.BomLine(
        row["key"], row["manufacturer"], row["mpn"], row["quantity"], prism_id=row.get("prism_id") or "", lcsc=row["lcsc"],
        value=row.get("value") or "", footprint=row.get("footprint") or "",
    )


def _parts(
    conn, rows: list[dict[str, Any]], build_quantity: int, notes: dict[str, int], attrition_percent: float | None = 0,
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    """The BOM lines as the page and the MCP tool read them, the rollup for the build, and the cost curve."""

    lines = [bom_line(row) for row in rows]
    # What is read does not depend on the build size: it is read once, and priced for the chosen size and for the curve.
    loaded = bom_lookup.load(conn, lines, **bom_lookup.library_readers(conn))
    result = bom_lookup.price(conn, loaded, build_quantity, attrition_percent)
    sizes = sorted({*CURVE_SIZES, build_quantity})
    curve = bom_lookup.cost_curve(loaded, sizes, attrition_percent)
    part_ids = sorted({entry["part_id"] for entry in result["lines"].values() if entry.get("part_id")})
    alerts = attention.open_counts(conn, clock.now(), attention.PART, part_ids) if part_ids else {}
    converted = bool(result["rollup"]["converted"])
    parts = []
    for row in rows:
        entry = result["lines"][row["key"]]
        part_id = entry.get("part_id")
        buy = entry.get("buy") or {}
        parts.append({
            "key": row["key"], "manufacturer": row["manufacturer"], "mpn": row["mpn"], "quantity": row["quantity"],
            "references": row["references"], "part_id": part_id, "state": entry["state"], "status": entry.get("status"),
            "stock": entry.get("stock"), "lifecycle": entry.get("lifecycle"), "short": bool(entry.get("short")),
            # The unit price in its offer's currency, and in the total's currency (what the line cost is made of) when converted.
            "unit_price": buy.get("unit_price"), "unit_currency": buy.get("currency"),
            "unit_price_in_total": _unit_in_total(buy) if converted else buy.get("unit_price"), "buy_quantity": buy.get("quantity"), "test_data": bool(buy.get("test_data")), "notes": notes.get(row["key"], 0), "need": entry.get("need"),
            # The line's cost for the build, in the total's currency; none for a line bought with another line or not priced.
            "line_cost": None if entry.get("bought_with") or not buy else (buy.get("in_base") if converted else buy.get("extended")),
            "alerts": alerts.get(part_id, 0),
            "prism_id": row.get("prism_id") or "", "in_library": entry.get("in_library"),
            "alternates": entry.get("alternates") or [], "status_from": entry.get("status_from"),
            "stores": entry.get("stores"),
        })
    parts.sort(key=lambda part: (_WORST_FIRST.get(part["status"] or "unknown", 3), part["mpn"]))
    return parts, result["rollup"], curve


def _unit_in_total(buy: dict[str, Any]) -> str | None:
    """A purchase's unit price in the total's currency: its converted cost over the pieces bought."""

    if not buy.get("in_base") or not buy.get("quantity"):
        return None
    return format((Decimal(buy["in_base"]) / int(buy["quantity"])).quantize(Decimal("0.0001")).normalize(), "f")


def _releases(conn, project_id: str, now_status: dict[str, str | None]) -> list[dict[str, Any]]:
    """Each release's frozen snapshot, with the parts that were fine then and are not today."""

    rows = conn.execute(
        "SELECT build_id, tag, created_at, health, status, assessment FROM supply_release_snapshots WHERE project_id = %s "
        "ORDER BY created_at DESC LIMIT %s",
        (project_id, MAX_RELEASES),
    ).fetchall()
    releases = []
    for row in rows:
        changed = []
        for line in row["assessment"].get("lines", []):
            part_id = line.get("part_id")
            if part_id and line.get("status") in _GOOD and now_status.get(part_id) in _BAD:
                changed.append({"part_id": part_id, "manufacturer": line["manufacturer"], "mpn": line["mpn"], "was": line.get("status"), "now": now_status[part_id]})
        releases.append({
            "build_id": row["build_id"], "tag": row["tag"], "created_at": row["created_at"].isoformat(),
            "health": float(row["health"]) if row["health"] is not None else None, "status": row["status"],
            "parts": row["assessment"].get("parts", 0), "needing_a_look": row["assessment"].get("needing_a_look", 0),
            "changed_since": changed,
        })
    return releases


# What of the day's rollup is kept with its cost: the boards the stock covers, the money out and what is left over.
KEPT_ROLLUP = ("can_build", "cost_build", "waste_cost", "at_risk", "needs_a_look", "short", "tracked", "lines")


def snapshot_costs(conn, now: datetime) -> int:
    """Write today's cost per board of every tracked project and variant that has a cost, worked out for the project's usual build.
    Once a day; returns rows written."""

    today = now.astimezone(timezone.utc).date()
    written = 0
    for project in tracking.list_tracked_projects(conn):
        for variant in project["variants"]:
            boards = int(project["build_quantity"])
            kept = conn.execute(
                "SELECT build_quantity FROM supply_bom_cost_history WHERE project_id = %s AND variant = %s AND day = %s", (project["project_id"], variant, today)
            ).fetchone()
            if kept and kept["build_quantity"] == boards:
                continue
            if kept:
                # The usual build changed since today's row was written: the row is for another size, so it is worked out again.
                conn.execute("DELETE FROM supply_bom_cost_history WHERE project_id = %s AND variant = %s AND day = %s", (project["project_id"], variant, today))
            rollup = usual_rollup(conn, project, variant)
            if rollup is None or rollup["cost_per_board"] is None or not rollup["currency"]:
                continue
            conn.execute(
                "INSERT INTO supply_bom_cost_history (project_id, variant, day, cost_per_board, currency, lines, lines_priced, rollup, build_quantity) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s) ON CONFLICT DO NOTHING",
                (project["project_id"], variant, today, rollup["cost_per_board"], rollup["currency"], rollup["lines"], rollup["lines_priced"],
                 json.dumps({key: rollup.get(key) for key in KEPT_ROLLUP}), boards),
            )
            written += 1
    return written


def _cost_history(conn, project_id: str, variant: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The days to draw, and the days left out as one price read wrong (see ``cost_history``)."""

    kept, left_out = cost_history.series(conn, project_id, variant, COST_HISTORY_DAYS)

    def shown(row: dict[str, Any]) -> dict[str, Any]:
        return {"day": row["day"].isoformat(), "cost_per_board": format(row["cost_per_board"], "f"), "currency": row["currency"], "boards": row["build_quantity"]}

    return [shown(row) for row in kept], [shown(row) for row in left_out]


def _where_the_money_goes(parts: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The lines that cost the most for the build, with their share, then what all the other lines cost. None when nothing is priced."""

    priced = sorted(
        ((float(part["line_cost"]), part) for part in parts if part.get("line_cost") not in (None, "")), key=lambda pair: -pair[0],
    )
    total = sum(cost for cost, _part in priced)
    if not priced or total <= 0:
        return None
    top = [
        {"key": part["key"], "part_id": part["part_id"], "mpn": part["mpn"], "manufacturer": part["manufacturer"], "cost": format(cost, ".2f"), "share": round(cost / total, 4)}
        for cost, part in priced[:TOP_LINES]
    ]
    rest = priced[TOP_LINES:]
    return {
        "lines": top, "other": {"count": len(rest), "cost": format(sum(cost for cost, _part in rest), ".2f"), "share": round(sum(cost for cost, _part in rest) / total, 4)},
        "total": format(total, ".2f"),
    }


def usual_attrition(conn, tracked: dict[str, Any] | None) -> float | None:
    """The spares a project is costed with when nothing asks for others: its own when it is tracked and has them, else the workspace's."""

    chosen = attrition_of((tracked or {}).get("spares") or "")
    return supply_settings.load(conn).spares.default_attrition() if chosen == DEFAULT else chosen


# A kept rollup older than this is worked out again even with no mark: "read is late" and other findings move with the clock.
ROLLUP_MAX_AGE = timedelta(hours=1)


def _kept_rollup(conn, project_id: str, variant: str) -> tuple[bool, dict[str, Any] | None]:
    """(found, rollup) for a kept rollup no mark has made stale since it was worked out."""

    kept = _kept_rollups(conn, [(project_id, variant)])
    return ((project_id, variant) in kept, kept.get((project_id, variant)))


def _kept_rollups(conn, wanted: Sequence[tuple[str, str]]) -> dict[tuple[str, str], dict[str, Any] | None]:
    """The kept rollups no mark has made stale since they were worked out, by (project, variant); stale or missing ones are left out."""

    rows = conn.execute(
        """
        SELECT r.project_id, r.variant, r.data FROM supply_project_rollups r
        JOIN unnest(%s::text[], %s::text[]) AS w(project_id, variant) ON r.project_id = w.project_id AND r.variant = w.variant
        WHERE r.computed_at > %s
          AND NOT {stale}
        """.replace("{stale}", freshness.stale_sql("rollup", "(ARRAY[r.project_id] || r.part_ids)", "r")),
        ([project_id for project_id, _ in wanted], [variant for _, variant in wanted], clock.now() - ROLLUP_MAX_AGE),
    ).fetchall()
    return {(row["project_id"], row["variant"]): row["data"].get("rollup") for row in rows}


def _keep_rollup(conn, project_id: str, variant: str, seen: str, rollup: dict[str, Any] | None, part_ids: list[str]) -> None:
    # Keeping it is a favour to the next reader: never wait for a row another transaction holds.
    if conn.execute(
        "SELECT 1 FROM supply_project_rollups WHERE project_id = %s AND variant = %s FOR UPDATE SKIP LOCKED", (project_id, variant)
    ).fetchone() is None and conn.execute(
        "SELECT 1 FROM supply_project_rollups WHERE project_id = %s AND variant = %s", (project_id, variant)
    ).fetchone():
        return
    conn.execute(
        """
        INSERT INTO supply_project_rollups (project_id, variant, data, part_ids, seen, snap, own, computed_at)
        VALUES (%s, %s, %s::jsonb, %s, %s, pg_snapshot_xmin(%s::pg_snapshot)::text::bigint, {own}, %s)
        ON CONFLICT (project_id, variant) DO UPDATE SET data = EXCLUDED.data, part_ids = EXCLUDED.part_ids, seen = EXCLUDED.seen,
            snap = EXCLUDED.snap, own = EXCLUDED.own, computed_at = EXCLUDED.computed_at
        """.replace("{own}", freshness.OWN_SQL),
        (project_id, variant, json.dumps({"rollup": rollup}), sorted(set(part_ids)), seen, seen, clock.now()),
    )


def usual_rollup(conn, project: dict[str, Any], variant: str) -> dict[str, Any] | None:
    """A tracked project's rollup at its usual build and spares, as its page shows it when nothing else is asked for. None without a BOM.

    Kept per project and design: worked out again only after something it is made from changed (``schema.derived.SOURCES``, ``freshness``).
    """

    project_id = project["project_id"]
    found, rollup = _kept_rollup(conn, project_id, variant)
    if found:
        return rollup
    seen = freshness.seen(conn)[0]
    rows = usage.project_rows(conn, project_id, variant)
    part_ids: list[str] = []
    if rows:
        loaded = bom_lookup.load(conn, [bom_line(row) for row in rows], **bom_lookup.library_readers(conn))
        # As it comes back from being kept (numbers as JSON gives them), so a kept and a fresh rollup read the same.
        rollup = json.loads(json.dumps(bom_lookup.price(conn, loaded, int(project["build_quantity"]), usual_attrition(conn, project))["rollup"], default=str))
        part_ids = [*loaded.per_board, *(other for others in loaded.alternates.values() for other in others)]
    _keep_rollup(conn, project_id, variant, seen, rollup, part_ids)
    return rollup


def usual_rollups(conn, wanted: Sequence[tuple[dict[str, Any], str]]) -> dict[str, dict[str, Any] | None]:
    """``usual_rollup`` for several tracked projects, by project id: the kept ones in one read, only stale ones worked out."""

    kept = _kept_rollups(conn, [(project["project_id"], variant) for project, variant in wanted])
    return {
        project["project_id"]: kept[(project["project_id"], variant)] if (project["project_id"], variant) in kept else usual_rollup(conn, project, variant)
        for project, variant in wanted
    }


def refresh_rollups(conn) -> int:
    """Work out every tracked project's stale rollup now, so the next reader finds it kept. Returns how many were worked out."""

    worked = 0
    for project in tracking.list_tracked_projects(conn):
        variant = (project["variants"] or [""])[0]
        if not _kept_rollup(conn, project["project_id"], variant)[0]:
            usual_rollup(conn, project, variant)
            worked += 1
    return worked


def build_of(
    conn, project_id: str, build_quantity: int | None, attrition_percent: float | None | str, fallback_build: int = 100,
) -> tuple[dict[str, Any] | None, int, float | None]:
    """The tracked project, and the build and spares a page prices for: as asked, else the project's usual ones, else
    ``fallback_build`` boards with the workspace's spares. An empty ``project_id`` is no project."""

    tracked = tracking.tracked_project(conn, project_id) if project_id else None
    spares = usual_attrition(conn, tracked) if attrition_percent == DEFAULT else cast(float | None, attrition_percent)
    if build_quantity is None:
        build_quantity = (int(tracked["build_quantity"]) if tracked else None) or fallback_build
    return tracked, build_quantity, spares


def _notes_by_line(notes: list[dict[str, Any]]) -> dict[str, int]:
    counted: dict[str, int] = {}
    for note in notes:
        counted[note["line_key"]] = counted.get(note["line_key"], 0) + 1
    return counted


def project_lines(
    conn, project_id: str, variant: str = "", build_quantity: int | None = None, attrition_percent: float | None | str = DEFAULT,
) -> list[dict[str, Any]]:
    """The project's BOM lines priced for a build, as the overview's ``parts`` has them; empty when the BOM has not been read."""

    _tracked, build_quantity, attrition_percent = build_of(conn, project_id, build_quantity, attrition_percent)
    rows = usage.project_rows(conn, project_id, variant)
    if not rows:
        return []
    return _parts(conn, rows, build_quantity, _notes_by_line(bom_comments.for_project(conn, project_id)), attrition_percent)[0]


def overview(conn, project_id: str, variant: str = "", build_quantity: int | None = None, attrition_percent: float | None | str = DEFAULT) -> dict[str, Any]:
    """``build_quantity`` None is the tracked project's usual build, else 100; ``attrition_percent`` ``DEFAULT`` is the project's own
    spares when it is tracked and has them, else the workspace's."""

    tracked, build_quantity, attrition_percent = build_of(conn, project_id, build_quantity, attrition_percent)
    usual = int(tracked["build_quantity"]) if tracked else None
    rows = usage.project_rows(conn, project_id, variant)
    notes = bom_comments.for_project(conn, project_id)
    notes_by_line = _notes_by_line(notes)
    if not rows:
        return {"available": False, "variants": usage.project_variants(conn, project_id), "variant": variant, "releases": [], "notes": notes}
    parts, rollup, curve = _parts(conn, rows, build_quantity, notes_by_line, attrition_percent)
    history, left_out = _cost_history(conn, project_id, variant)
    status_now = {part["part_id"]: part["status"] for part in parts if part["part_id"]}
    return {
        "available": True, "variant": variant, "build_quantity": build_quantity, "usual_build": usual, "attrition_percent": attrition_percent, "usual_spares": (tracked or {}).get("spares"),
        "variants": usage.project_variants(conn, project_id), "rollup": rollup,
        "parts": parts, "cost_curve": curve, "money": _where_the_money_goes(parts), "cost_history": history, "cost_history_left_out": left_out, "releases": _releases(conn, project_id, status_now), "notes": notes,
    }


COST_HEADER = (
    "Manufacturer", "Part number", "References", "Per board", "For the build", "Status", "In stock", "Lead time (days)",
    "Distributor", "Distributor part number", "Unit price", "Currency", "Cost for the build",
)
NO_VENDOR = "No distributor"


def _costed(conn, project_id: str, variant: str, build_quantity: int, attrition_percent: float | None | str) -> tuple[list[dict[str, Any]], dict[str, Any]] | None:
    """The stored BOM rows and what pricing them for a build says. None when the BOM has not been read."""

    if attrition_percent == DEFAULT:
        attrition_percent = usual_attrition(conn, tracking.tracked_project(conn, project_id))
    rows = usage.project_rows(conn, project_id, variant)
    if not rows:
        return None
    lines = [bom_line(row) for row in rows]
    return rows, bom_lookup.lookup(conn, lines, build_quantity, attrition_percent, **bom_lookup.library_readers(conn))


def _cost_line(row: dict[str, Any], entry: dict[str, Any]) -> list[Any]:
    from app.services.supply.compliance_draft import _safe

    buy = entry.get("buy") or {}
    return [
        _safe(row["manufacturer"]), _safe(row["mpn"]), _safe(row["references"]), row["quantity"], entry["need"],
        entry.get("status") or "not tracked", "" if entry.get("stock") is None else entry["stock"], entry.get("lead_time_days") or "",
        _safe(buy.get("connector_name", "")), _safe(buy.get("sku", "")), buy.get("unit_price", ""), buy.get("currency", ""),
        buy.get("extended", "") if not entry.get("bought_with") else "with another line",
    ]


def _csv_text(rows: list[list[Any]], footer: list[list[Any]] | None = None) -> str:
    import csv
    import io

    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(COST_HEADER)
    writer.writerows(rows)
    if footer:
        writer.writerow([])
        writer.writerows(footer)
    return out.getvalue()


def _whole_csv(rows: list[dict[str, Any]], result: dict[str, Any]) -> str:
    """The BOM costed at a build size, as a CSV. Each line names the distributor its price comes from and that distributor's part
    number; there is no link or cart, so it is still a costing and not an order."""

    rollup = result["rollup"]
    footer: list[list[Any]] = []
    if rollup["cost_build"] is not None:
        blank = [""] * 10
        footer = [
            ["Total", *blank, rollup["currency"], rollup["cost_build"]],
            ["Per board", *blank, rollup["currency"], rollup["cost_per_board"]],
            ["Prices are list prices without VAT or shipping." + (" Converted at the rates of %s." % rollup["rates_day"] if rollup["converted"] else "")],
        ]
    return _csv_text([_cost_line(row, result["lines"][row["key"]]) for row in rows], footer)


def _vendor_csvs(rows: list[dict[str, Any]], result: dict[str, Any]) -> dict[str, str]:
    """The same costing split by the distributor each line is priced at, one CSV a distributor, each with what it adds up to. A line
    bought with another line goes with that line; lines with no price are together under ``NO_VENDOR``."""

    groups: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = {}
    for row in rows:
        entry = result["lines"][row["key"]]
        priced_by = result["lines"][entry["bought_with"]] if entry.get("bought_with") else entry
        groups.setdefault((priced_by.get("buy") or {}).get("connector_name") or NO_VENDOR, []).append((row, entry))
    files = {}
    for vendor, pairs in sorted(groups.items(), key=lambda item: (item[0] == NO_VENDOR, item[0].lower())):
        totals: dict[str, Decimal] = {}
        for _row, entry in pairs:
            buy = entry.get("buy")
            if buy and not entry.get("bought_with"):
                totals[buy["currency"]] = totals.get(buy["currency"], Decimal(0)) + Decimal(buy["extended"])
        blank = [""] * 10
        footer = [["Total", *blank, currency, format(total.normalize(), "f")] for currency, total in sorted(totals.items())]
        files[vendor] = _csv_text([_cost_line(row, entry) for row, entry in pairs], footer)
    return files


def _file_name(text: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_ ." else "_" for ch in text).strip(" .")[:60] or "file"


def costing_zip(conn, project_id: str, variant: str = "", build_quantity: int = 1, attrition_percent: float | None | str = DEFAULT) -> bytes | None:
    """The project's costing as one zip: the whole costing, the costing by distributor, the draft RoHS and REACH declaration and the trade
    classification, each a CSV. None when the BOM has not been read."""

    import io
    import zipfile

    from app.services.supply import compliance_draft, trade

    costed = _costed(conn, project_id, variant, build_quantity, attrition_percent)
    if costed is None:
        return None
    rows, result = costed
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("costing.csv", _whole_csv(rows, result))
        for vendor, text in _vendor_csvs(rows, result).items():
            archive.writestr(f"costing-by-distributor/{_file_name(vendor)}.csv", text)
        archive.writestr("compliance.csv", compliance_draft.to_csv(compliance_draft.build(conn, rows)))
        archive.writestr("trade-classification.csv", trade.to_csv(trade.build(conn, rows)))
    return out.getvalue()
