"""Alternatives for a part, graded by what Prism can tell from what distributors list, from what Prism already holds.

A candidate is another part in the same distributor category with the same value. Four grades, best first, none of them a claim
that the parts are interchangeable:

* ``ratings_met``: the same package, and every rating the part lists is listed for the candidate and met: the same, more where
  more is better (voltage, power, current), tighter where less is better (tolerance).
* ``similar``: the same value and package as far as is listed, but some of the part's ratings (or the package) are not listed for
  the candidate, so they can't be judged. The grade says how many.
* ``other_package``: the same value in another package. The board has to change.
* ``fails``: a rating the candidate lists is worse (a lower voltage, a looser tolerance). Listed last, with what fails.

The manufacturer's own suggestion (a fact distributors give, such as Mouser's ``SuggestedReplacement``) is listed as it was
written, beside the graded ones. This compares what distributors say, nothing about the footprint, pins or operating conditions:
a person checks those before an alternate is approved. A candidate is proposed as an alternate of a catalog component the usual
way, and approving it stays with QA.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Mapping

from app.services.supply import alternates, facts, parts_view

MAX_CANDIDATES = 12
MAX_POOL = 300
EXACT_TOLERANCE = Decimal("0.001")
# The values that make a part what it is. Candidates must match every one the part lists.
CORE = ("resistance", "capacitance", "inductance", "output_voltage", "positions", "rows", "pitch", "core")
# More is at least as good.
AT_LEAST = ("voltage_rating", "power_rating", "input_voltage_max", "output_current", "clock", "flash", "ram", "io_count")
# Less is at least as good.
AT_MOST = ("tolerance",)
TEXT = ("dielectric", "regulator_type", "mounting")
IGNORED = ("temperature_range", "supply_voltage")
GRADES = ("ratings_met", "similar", "other_package", "fails")
GRADE_LABEL = {"ratings_met": "Ratings met", "similar": "Similar", "other_package": "Same value, other package", "fails": "Fails a rating"}
_CODE = re.compile(r"(?<!\d)(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)(?!\d)")


def package_key(raw: str) -> str:
    """The package as comparable text: the imperial size code when there is one, else the text lower case."""

    found = _CODE.search(raw)
    return found.group(1) if found else re.sub(r"\s+", " ", raw.strip().lower())


def _same(left: Decimal, right: Decimal) -> bool:
    return left == right or abs(left - right) / max(abs(left), abs(right)) <= EXACT_TOLERANCE


def grade(base: Mapping[str, Mapping[str, Any]], other: Mapping[str, Mapping[str, Any]]) -> dict[str, Any] | None:
    """How close ``other`` is to ``base``, or None when it is not an alternative. Both map a canonical key to ``{"value", "raw"}``."""

    core = [key for key in CORE if key in base]
    if not core:
        return None
    for key in core:
        mine, theirs = base[key].get("value"), other.get(key, {}).get("value")
        if key == "core":
            if base[key]["raw"].strip().lower() != other.get(key, {}).get("raw", "").strip().lower():
                return None
        elif mine is None or theirs is None or not _same(mine, theirs):
            return None
    same: list[str] = [key for key in core]
    differs: list[str] = []
    # A rating the part lists and the candidate doesn't can't be judged: it is never counted as met.
    unknown: list[str] = []
    for key in (*AT_LEAST, *AT_MOST, *TEXT):
        if key not in base:
            continue
        if key not in other:
            unknown.append(key)
            continue
        mine, theirs = base[key].get("value"), other[key].get("value")
        if key in TEXT or mine is None or theirs is None:
            ok = base[key]["raw"].strip().lower() == other[key]["raw"].strip().lower()
        elif key in AT_MOST:
            ok = theirs <= mine or _same(mine, theirs)
        else:
            ok = theirs >= mine or _same(mine, theirs)
        (same if ok else differs).append(key)
    package_same = "package" in base and "package" in other and package_key(base["package"]["raw"]) == package_key(other["package"]["raw"])
    if "package" in base and "package" not in other:
        unknown.append("package")
    if differs:
        found = "fails"
    elif "package" in base and "package" in other and not package_same:
        found = "other_package"
        differs = ["package"]
    elif unknown or not package_same or len(same) < len(core) + 1:
        # Nothing beyond the value itself was compared, or something could not be: similar, not met.
        found = "similar"
    else:
        found = "ratings_met"
    return {"grade": found, "same": [*same, *(["package"] if package_same else [])], "differs": differs, "unknown": unknown}


def grade_label(verdict: Mapping[str, Any]) -> str:
    """The grade in words, with how many ratings could not be judged."""

    if verdict["grade"] == "similar" and verdict["unknown"]:
        count = len(verdict["unknown"])
        return f"Similar · {count} {'rating' if count == 1 else 'ratings'} unknown"
    return GRADE_LABEL[verdict["grade"]]


def _signature(parameters: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        item["key"]: {"value": Decimal(item["value"]) if item["value"] is not None else None, "raw": item["raw"]}
        for item in parameters if item["key"]
    }


def _categories(conn, part_id: str) -> list[str]:
    return [
        row["value"].strip().lower() for row in conn.execute(
            "SELECT value FROM supply_part_facts WHERE part_id = %s AND name = 'category'", (part_id,)
        ).fetchall() if row["value"].strip()
    ]


def candidates(conn, part_id: str, limit: int = MAX_CANDIDATES) -> dict[str, Any]:
    """Graded alternatives to a part, and the manufacturer's own suggestion if a distributor gave one."""

    base = _signature(parts_view.parameters_of(conn, part_id))
    suggested = [
        source["value"] for fact in facts.for_part(conn, part_id) if fact["name"] == "suggested_replacement" for source in fact["sources"]
    ]
    found: list[dict[str, Any]] = []
    categories = _categories(conn, part_id)
    if categories and any(key in base for key in CORE):
        pool = conn.execute(
            """
            SELECT DISTINCT p.id FROM supply_parts p JOIN supply_part_facts f ON f.part_id = p.id
            WHERE f.name = 'category' AND lower(trim(f.value)) = ANY(%s) AND p.id <> %s LIMIT %s
            """,
            (categories, part_id, MAX_POOL),
        ).fetchall()
        pool_ids = [row["id"] for row in pool]
        standing = {item["id"]: item for item in parts_view.summaries_for(conn, pool_ids)}
        signatures = {
            candidate_id: _signature(items) for candidate_id, items in parts_view.parameters_of_parts(conn, pool_ids, with_facts=False).items()
        }
        for row in pool:
            verdict = grade(base, signatures.get(row["id"], {}))
            if verdict is None:
                continue
            item = standing[row["id"]]
            found.append({
                "part_id": row["id"], "manufacturer": item["manufacturer"], "mpn": item["mpn"], "grade": verdict["grade"],
                "grade_label": grade_label(verdict), "same": verdict["same"], "differs": verdict["differs"], "unknown": verdict["unknown"],
                "stock": item["stock"], "status": item["status"], "lifecycle": item["lifecycle"], "problem": item["problem"],
                "fetched_at": item["fetched_at"],
            })
    found.sort(key=lambda entry: (GRADES.index(entry["grade"]), -(entry["stock"] or 0), entry["mpn"]))
    return {
        "candidates": found[:limit], "suggested_by_distributors": sorted(set(suggested)), "judged_on": sorted(base),
        "suggestions": _suggestions(conn, part_id),
    }


def _suggestions(conn, part_id: str) -> list[dict[str, Any]]:
    """What distributors suggest in place of the part, with the stock and standing of those Prism already tracks."""

    found = alternates.for_part(conn, part_id)
    standing = {item["id"]: item for item in parts_view.summaries_for(conn, [entry["part_id"] for entry in found if entry["part_id"]])}
    for entry in found:
        item = standing.get(entry["part_id"] or "")
        entry["stock"] = item["stock"] if item else None
        entry["status"] = item["status"] if item else None
        entry["tracked"] = bool(item and (item["tracking"] or item["watch"]))
    return found
