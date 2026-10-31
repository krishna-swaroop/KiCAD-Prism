"""Trade classification of a project's BOM: the export control class (ECCN) and tariff codes distributors give for each part.

Distributors state these; Prism shows what they say, where they disagree, and what is missing. It does not classify anything
itself and it is not a customs declaration: a person who ships or exports checks it against the manufacturer's own statement.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Mapping, Sequence

from app.services.supply import bom_lookup, facts

HEADER = ("Manufacturer", "Part number", "Per board", "References", "ECCN", "Export control", "Tariff code US", "Tariff code EU", "Other tariff codes", "Gaps")
_RISKY_START = ("=", "+", "-", "@", "\t", "\r")
_TARIFFS = ("hts_us", "hts_eu")
_OTHER_TARIFFS = ("hts_cn", "hts_ca", "hts_jp", "hts_kr", "hts_mx", "hts_br")
# What a distributor writes for "no specific control": EAR99 is the catch-all class for items not on the Commerce Control List.
NO_CONTROL = "EAR99"


def _values(entries: Mapping[str, list[dict[str, Any]]], name: str) -> list[str]:
    return list(dict.fromkeys(source["value"] for source in entries.get(name, [])))


def control_of(eccn: Sequence[str]) -> str:
    """``none`` for EAR99, ``controlled`` for any other class, ``disputed`` when distributors differ, ``unknown`` without one."""

    classes = {value.strip().upper() for value in eccn if value.strip()}
    if not classes:
        return "unknown"
    if len(classes) > 1:
        return "disputed"
    return "none" if classes == {NO_CONTROL} else "controlled"


def build(conn, rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Classification for BOM lines (``key``, ``manufacturer``, ``mpn``, ``quantity``, optionally ``references``)."""

    lines = [bom_lookup.BomLine(row["key"], row["manufacturer"], row["mpn"], row["quantity"], lcsc=row.get("lcsc", "")) for row in rows]
    resolved = bom_lookup.resolve_lines(lines, conn)
    out: list[dict[str, Any]] = []
    for row in rows:
        state, part_id, _how = resolved[row["key"]]
        gaps: list[str] = []
        entries: dict[str, list[dict[str, Any]]] = {}
        if not row["mpn"].strip():
            gaps.append("No part number on the BOM line.")
        elif state != bom_lookup.TRACKED or not part_id:
            gaps.append("Prism does not follow this part, so no distributor has been asked.")
        else:
            entries = {fact["name"]: fact["sources"] for fact in facts.for_part(conn, part_id)}
        eccn = _values(entries, "eccn")
        control = control_of(eccn)
        mark = conn.execute("SELECT control, eccn FROM supply_part_trade_marks WHERE part_id = %s", (part_id,)).fetchone() if part_id else None
        if mark:
            # A person's word wins over what distributors state.
            eccn = [mark["eccn"]] if mark["eccn"] else []
            control = "controlled" if mark["control"] == "controlled" else "none"
        if control == "unknown" and part_id and state == bom_lookup.TRACKED:
            gaps.append("No distributor gives an export control class.")
        if control == "disputed":
            gaps.append("Distributors give different export control classes.")
        for name in _TARIFFS:
            if len(_values(entries, name)) > 1:
                gaps.append(f"Distributors give different {facts.LABELS[name].lower()}.")
        if part_id and state == bom_lookup.TRACKED and not _values(entries, "hts_us") and not _values(entries, "hts_eu"):
            gaps.append("No tariff code for the US or the EU.")
        out.append({
            "key": row["key"], "manufacturer": row["manufacturer"], "mpn": row["mpn"], "quantity": row["quantity"],
            "references": row.get("references", ""), "part_id": part_id if state == bom_lookup.TRACKED else None,
            "eccn": eccn, "control": control,
            "hts_us": _values(entries, "hts_us"), "hts_eu": _values(entries, "hts_eu"),
            "other": {name: _values(entries, name) for name in _OTHER_TARIFFS if _values(entries, name)},
            "gaps": gaps,
        })
    return {
        "parts": out,
        "summary": {
            "parts": len(out),
            "controlled": sum(1 for item in out if item["control"] == "controlled"),
            "unknown": sum(1 for item in out if item["control"] == "unknown"),
            "disputed": sum(1 for item in out if item["control"] == "disputed"),
            "with_gaps": sum(1 for item in out if item["gaps"]),
            "note": "What distributors state, not a classification. Check it against the manufacturer's own statement before you ship or export.",
        },
    }


def _safe(cell: object) -> str:
    text = str(cell)
    return "'" + text if text.startswith(_RISKY_START) else text


_CONTROL_TEXT = {"none": "No specific control (EAR99)", "controlled": "Controlled", "disputed": "Disputed", "unknown": "Unknown"}


def to_csv(report: Mapping[str, Any]) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(HEADER)
    writer.writerow([""] * (len(HEADER) - 1) + [report["summary"]["note"]])
    for item in report["parts"]:
        other = "; ".join(f"{name.replace('hts_', '').upper()} {', '.join(values)}" for name, values in item["other"].items())
        writer.writerow([
            _safe(item["manufacturer"]), _safe(item["mpn"]), item["quantity"], _safe(item["references"]), _safe(", ".join(item["eccn"])),
            _CONTROL_TEXT[item["control"]], _safe(", ".join(item["hts_us"])), _safe(", ".join(item["hts_eu"])), _safe(other), _safe(" ".join(item["gaps"])),
        ])
    return out.getvalue()
