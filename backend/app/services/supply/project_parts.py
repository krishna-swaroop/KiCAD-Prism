"""A project's parts list, one page at a time: each part with its BOM lines (pieces per board, pieces the build needs, the line's
cost), the "needs a look" chips counted over every line, and the lines no part matches.

The chips, the reference search and the project's own sort columns are worked out here over all of the project's lines, so the
counts and the list always agree, however many parts the project has.
"""

from __future__ import annotations

from typing import Any

from app.services.supply import parts_view, project_supply

CHIPS = ("unchecked", "out", "short", "limiting", "not_priced", "end_of_life", "alerts")
# The columns only a project has, by what each sorts on.
PROJECT_COLUMNS = ("per_board", "need", "cost")


def by_part(lines: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Each part as one row: a part on two lines adds their pieces, needs, notes and references, and its cost is the one line that
    carries it (the other is bought with it)."""

    merged: dict[str, dict[str, Any]] = {}
    for line in lines:
        part_id = line["part_id"]
        if not part_id:
            continue
        kept = merged.get(part_id)
        if kept is None:
            merged[part_id] = dict(line)
            continue
        kept["quantity"] += line["quantity"]
        kept["need"] = kept["need"] + line["need"] if kept["need"] is not None and line["need"] is not None else (kept["need"] if kept["need"] is not None else line["need"])
        kept["notes"] += line["notes"]
        kept["references"] = " ".join(text for text in (kept["references"], line["references"]) if text)
        kept["line_cost"] = kept["line_cost"] if kept["line_cost"] is not None else line["line_cost"]
        kept["short"] = kept["short"] or line["short"]
    return merged


def limiting_keys(lines: list[dict[str, Any]]) -> set[str]:
    """The lines whose part's stock covers the fewest builds: what decides how many can be built. A part on two lines is judged on what
    both need. Parts with no stock figure or no need are left out."""

    ratios = {part_id: line["stock"] / line["need"] for part_id, line in by_part(lines).items() if line["stock"] is not None and line["need"]}
    if not ratios:
        return set()
    lowest = min(ratios.values())
    return {line["key"] for line in lines if line["part_id"] and ratios.get(line["part_id"]) == lowest}


def matches(line: dict[str, Any], chip: str, limiting: set[str]) -> bool:
    if chip == "unchecked":
        return line["state"] != "tracked"
    if chip == "out":
        return line["part_id"] is not None and line["stock"] == 0
    if chip == "short":
        return bool(line["short"])
    if chip == "limiting":
        return line["key"] in limiting
    if chip == "end_of_life":
        return bool(line["lifecycle"]) and line["lifecycle"] not in ("active", "unknown")
    if chip == "alerts":
        return (line["alerts"] or 0) > 0
    if chip == "not_priced":
        return line["part_id"] is not None and line["status"] is not None and line["unit_price"] is None
    raise ValueError("That filter is not one Prism knows.")


def _has_reference(line: dict[str, Any], wanted: str) -> bool:
    """Whether a line carries this reference (C80, R14), whatever the case; "C8" is not "C80"."""

    return wanted != "" and wanted in (line["references"] or "").lower().replace(",", " ").replace(";", " ").split()


def _figure(line: dict[str, Any] | None, column: str) -> float | None:
    if line is None:
        return None
    value = line["quantity"] if column == "per_board" else line["need"] if column == "need" else line["line_cost"]
    return None if value is None else float(value)


def page(
    conn, project_id: str, *, variant: str = "", build_quantity: int | None = None, attrition_percent: float | None | str = project_supply.DEFAULT,
    chip: str = "", query: str = "", only: str = "", vendor: str = "", sort: str = "", offset: int = 0, limit: int = 100, role: str | None = None,
) -> dict[str, Any]:
    """One page of the project's parts, as ``parts_view.list_parts`` lists them, each with its ``line``; ``chips`` count parts (a part on
    two lines is one) over the whole project; ``unmatched`` are the lines no part matches, which only show while nothing but a reference
    search or the Unchecked chip narrows the list. A ``query`` that is a reference on the board finds the lines carrying it."""

    if chip and chip not in CHIPS:
        raise ValueError("That filter is not one Prism knows.")
    lines = project_supply.project_lines(conn, project_id, variant, build_quantity, attrition_percent)
    limiting = limiting_keys(lines)
    chips = []
    for key in CHIPS:
        count = len({line["part_id"] or line["key"] for line in lines if matches(line, key, limiting)})
        if count:
            chips.append({"key": key, "count": count})
    wanted = query.strip().lower()
    by_reference = [line for line in lines if _has_reference(line, wanted)]
    keep: set[str] | None = None
    if by_reference:
        keep, query = {line["part_id"] for line in by_reference if line["part_id"]}, ""
    if chip:
        chosen = {line["part_id"] for line in lines if line["part_id"] and matches(line, chip, limiting)}
        keep = chosen if keep is None else keep & chosen
    merged = by_part(lines)
    column, _, direction = sort.partition(":")
    order = None
    if column in PROJECT_COLUMNS:
        figures = [(part_id, _figure(line, column)) for part_id, line in merged.items()]
        known = sorted((item for item in figures if item[1] is not None), key=lambda item: item[1], reverse=direction == "desc")
        order, sort = [part_id for part_id, _ in known], ""
    listed = parts_view.list_parts(
        conn, scope="all", query=query, limit=limit, role=role, only=only, offset=offset, project_id=project_id, vendor=vendor, sort=sort,
        part_ids=sorted(keep) if keep is not None else None, order_ids=order,
    )
    listed["items"] = [item | {"line": merged.get(item["id"])} for item in listed["items"]]
    narrowed = (chip not in ("", "unchecked")) or bool(only) or bool(vendor)
    listed["unmatched"] = [] if narrowed or offset else [
        line for line in lines if not line["part_id"] and (not wanted or _has_reference(line, wanted))
    ]
    listed["chips"] = chips
    return listed
