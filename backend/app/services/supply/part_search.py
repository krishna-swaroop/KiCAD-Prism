"""One search over library components and supply parts, with a part found once.

A library component and a supply part are often one physical part. The palette asks for "LM358" and should see one row, with a
library badge and a supply badge, not two. Identity is the one BOM lines use: the maker (through aliases) and the match key of the
part number. What stays separate on purpose: two components with the same number (two rows), an approved alternate (its own row,
named for the component it stands in for), and a supply part no component uses (a supply-only row).

A person sees what their role may: a reader of supply without the library gets supply rows, and the other way round.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable, Mapping, Sequence

from app.services.supply import catalog_read, parts, parts_view
from app.services.supply.identity import alias_key, match_key

RELEASED = ("released", "done")
MIN_QUERY = 2
MAX_LIMIT = 20


def _like(text: str) -> str:
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _rank(query: str, *numbers: str) -> int:
    """0 for an exact part number, 1 for one that starts with the query, 2 for the rest."""

    key = match_key(query)
    keys = [match_key(number) for number in numbers if number]
    if key and key in keys:
        return 0
    if key and any(found.startswith(key) for found in keys):
        return 1
    return 2


def supply_hits(conn, query: str, limit: int) -> list[dict[str, Any]]:
    """Supply parts whose number, other number, distributor SKU or maker contains the query, best match first."""

    text, key = query.strip(), match_key(query)
    if len(text) < MIN_QUERY:
        return []
    rows = conn.execute(
        """
        SELECT p.id, p.mpn, p.match_key, m.name AS manufacturer
        FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE p.mpn ILIKE %(like)s OR (%(key)s <> '' AND p.match_key LIKE %(keylike)s) OR m.name ILIKE %(like)s
           OR EXISTS (SELECT 1 FROM supply_part_numbers n WHERE n.part_id = p.id AND (n.mpn ILIKE %(like)s OR (%(key)s <> '' AND n.match_key LIKE %(keylike)s)))
           OR EXISTS (SELECT 1 FROM supply_listings l WHERE l.part_id = p.id AND l.match_state <> 'rejected' AND l.sku ILIKE %(like)s)
        ORDER BY (p.match_key = %(key)s) DESC, (p.match_key LIKE %(prefix)s) DESC, lower(p.mpn)
        LIMIT %(limit)s
        """,
        {"like": _like(text), "key": key, "keylike": "%" + key + "%", "prefix": key + "%", "limit": limit * 3},
    ).fetchall()
    hits = [{"part_id": row["id"], "mpn": row["mpn"], "manufacturer": row["manufacturer"], "rank": _rank(text, row["mpn"])} for row in rows]
    return sorted(hits, key=lambda hit: hit["rank"])[:limit]


def _library_rank(query: str, component: Mapping[str, Any]) -> int:
    return _rank(query, str(component.get("mpn") or ""), str(component.get("name") or ""))


def _stage(component: Mapping[str, Any]) -> str:
    return str(component.get("workflow_stage") or component.get("stage") or "")


def merge(
    query: str,
    library: Sequence[Mapping[str, Any]],
    supply: Sequence[Mapping[str, Any]],
    supply_of: Callable[[str, str], str | None],
    component_of: Callable[[str, str], str | None],
    info: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Rows for the palette.

    ``supply_of(maker, mpn)`` is the supply part id of a library component, ``component_of(maker, mpn)`` the library component
    id of a supply part (both None when there is none) and ``info`` the status and stock of each supply part.
    """

    rows: dict[str, dict[str, Any]] = {}
    by_part: dict[str, str] = {}
    # The supply part goes to the best component of those that share it: an exact number, then a released one.
    for component in sorted(library, key=lambda found: (_library_rank(query, found), 0 if _stage(found) in RELEASED else 1)):
        part_id = supply_of(str(component.get("manufacturer") or ""), str(component.get("mpn") or ""))
        row = {
            "key": f"component:{component['id']}",
            "label": str(component.get("mpn") or component.get("name") or component.get("value") or "Untitled component"),
            "manufacturer": str(component.get("manufacturer") or ""),
            "library": {"component_id": str(component["id"]), "name": str(component.get("name") or ""), "stage": _stage(component)},
            "supply": None, "rank": _library_rank(query, component),
        }
        rows[row["key"]] = row
        if part_id and part_id not in by_part:
            by_part[part_id] = row["key"]
            row["supply"] = dict(info.get(part_id) or {"part_id": part_id})
    for hit in supply:
        part_id = hit["part_id"]
        if part_id in by_part:
            row = rows[by_part[part_id]]
            row["rank"] = min(row["rank"], hit["rank"])
            continue
        component_id = component_of(hit["manufacturer"], hit["mpn"])
        if component_id and f"component:{component_id}" in rows:
            row = rows[f"component:{component_id}"]
            row["supply"] = dict(info.get(part_id) or {"part_id": part_id})
            by_part[part_id] = row["key"]
            row["rank"] = min(row["rank"], hit["rank"])
            continue
        rows[f"part:{part_id}"] = {
            "key": f"part:{part_id}", "label": hit["mpn"], "manufacturer": hit["manufacturer"], "library": None,
            "supply": dict(info.get(part_id) or {"part_id": part_id}), "rank": hit["rank"],
        }
    return sorted(rows.values(), key=_order)


def _order(row: Mapping[str, Any]) -> tuple[int, int, int, str]:
    """An exact number, then a prefix; then released before draft, then tracked before not; then by name."""

    released = 0 if row["library"] and row["library"]["stage"] in RELEASED else 1
    tracked = 0 if row["supply"] and row["supply"].get("tracked") else 1
    return row["rank"], released, tracked, row["label"].lower()


def _supply_info(conn, part_ids: Iterable[str]) -> dict[str, dict[str, Any]]:
    found = {}
    for item in parts_view.summaries_for(conn, list(part_ids)):
        found[item["id"]] = {
            "part_id": item["id"], "status": item["status"], "stock": item["stock"], "lifecycle": item["lifecycle"],
            "tracked": item["tracking"] is not None or item["watch"] is not None,
        }
    return found


def _with_claimed(components: list[dict[str, Any]], hits: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """The components, plus the component of any supply hit the first search did not return (asked for by its number alone)."""

    found = list(components)
    known = catalog_read.component_ids_by_part(iter(found))
    for hit in hits:
        wanted = (alias_key(hit["manufacturer"]), match_key(hit["mpn"]))
        if known.get(wanted) is not None:
            continue
        for candidate in catalog_read.search(hit["mpn"], 5):
            if catalog_read.component_ids_by_part(iter([candidate])).get(wanted) is not None:
                found.append(candidate)
                known = catalog_read.component_ids_by_part(iter(found))
                break
    return found


def search(conn, query: str, limit: int = 8, *, library: bool = True, supply: bool = True) -> list[dict[str, Any]]:
    """Library components and supply parts for a query, one row each part."""

    text = query.strip()
    limit = max(1, min(limit, MAX_LIMIT))
    if len(text) < MIN_QUERY or not (library or supply):
        return []
    components = catalog_read.search(text, limit) if library else []
    hits = supply_hits(conn, text, limit) if supply else []

    def supply_of(maker: str, mpn: str) -> str | None:
        found = parts.find_part(conn, maker, mpn) if supply and maker and mpn else None
        return found.id if found else None

    components = _with_claimed(components, hits) if library else []
    known = catalog_read.component_ids_by_part(iter(components))

    def component_of(maker: str, mpn: str) -> str | None:
        found = known.get((alias_key(maker), match_key(mpn)))
        return str(found) if found else None

    part_ids = {supply_of(str(c.get("manufacturer") or ""), str(c.get("mpn") or "")) for c in components} | {h["part_id"] for h in hits}
    part_ids.discard(None)
    info = _supply_info(conn, sorted(part_ids)) if supply else {}
    return merge(text, components, hits, supply_of, component_of, info)[:limit]
