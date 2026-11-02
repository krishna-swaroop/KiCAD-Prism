"""A draft RoHS and REACH declaration for a project's BOM, with the gaps listed.

It lists every distinct part on the BOM with what distributors and supplier declarations say, and says what is missing. It is a
working document for a person to complete and sign off, not a declaration: Prism cannot know what a manufacturer has not said.
A part nothing is known about is *unknown*, never compliant.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Mapping, Sequence

from app.services.supply import bom_lookup, compliance, facts, offer_rules

HEADER = (
    "Manufacturer", "Part number", "Per board", "References", "RoHS", "REACH", "Declared substances on the Candidate List",
    "RoHS as stated", "REACH as stated", "Substances of very high concern as stated", "RoHS exemptions", "Gaps",
)
_RISKY_START = ("=", "+", "-", "@", "\t", "\r")


def _reach_text(standing: Mapping[str, Any]) -> str:
    return {"affected": "affected", "clear": "not affected", "unknown": "unknown"}[standing["state"]]


def build(conn, rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """The draft for BOM lines (``key``, ``manufacturer``, ``mpn``, ``quantity``, optionally ``references``)."""

    lines = [bom_lookup.BomLine(row["key"], row["manufacturer"], row["mpn"], row["quantity"], lcsc=row.get("lcsc", "")) for row in rows]
    resolved = bom_lookup.resolve_lines(lines, conn)
    part_ids = sorted({part_id for state, part_id, _how in resolved.values() if state == bom_lookup.TRACKED and part_id})
    flags = compliance.rohs_flags(conn, part_ids)
    rohs_said = facts.rohs_stated(conn, part_ids)
    listed = compliance.listed_substances(conn, part_ids)
    stated = facts.summary(conn, part_ids)
    exempt = compliance.exemptions(conn, part_ids)
    list_loaded = compliance.list_info(conn)["loaded"]
    out: list[dict[str, Any]] = []
    for row in rows:
        state, part_id, _how = resolved[row["key"]]
        gaps: list[str] = []
        said: dict[str, str] = stated.get(part_id or "", {}) if state == bom_lookup.TRACKED else {}
        if not row["mpn"].strip():
            gaps.append("No part number on the BOM line.")
            rohs, reach, on_list = "unknown", "unknown", []
        elif state != bom_lookup.TRACKED or not part_id:
            gaps.append("Prism does not track this part, so nothing is known about it.")
            rohs, reach, on_list = "unknown", "unknown", []
        else:
            rohs = offer_rules.rohs_verdict(flags[part_id], rohs_said.get(part_id, ())).replace("_", " ")
            on_list = listed.get(part_id, [])
            standing = compliance.standing(flags[part_id], on_list)
            reach = _reach_text(standing)
            if rohs == "unknown":
                gaps.append("No RoHS statement from any distributor.")
            if rohs in ("not compliant", "disputed"):
                gaps.append(f"RoHS is {rohs}: check with the manufacturer.")
            if reach == "unknown":
                gaps.append("No REACH statement or substance declaration.")
            if reach == "affected":
                gaps.append("Affected by REACH: get the manufacturer's substance declaration.")
            if "exempt" in said.get("rohs", "").lower() and not exempt.get(part_id):
                gaps.append("RoHS compliant by exemption: name the exemption in the declaration.")
        out.append({
            "manufacturer": row["manufacturer"], "mpn": row["mpn"], "quantity": row["quantity"], "references": row.get("references", ""),
            "rohs": rohs, "reach": reach, "on_candidate_list": on_list, "gaps": gaps,
            "exemptions": [item["code"] for item in exempt.get(part_id or "", [])],
            "rohs_stated": said.get("rohs", ""), "reach_stated": said.get("reach", ""), "svhc_stated": said.get("svhc", ""),
        })
    gap_count = sum(1 for item in out if item["gaps"])
    return {
        "parts": out,
        "summary": {"parts": len(out), "with_gaps": gap_count, "rohs_unknown": sum(1 for i in out if i["rohs"] == "unknown"),
                    "reach_unknown": sum(1 for i in out if i["reach"] == "unknown"), "candidate_list_loaded": list_loaded,
                    "note": "" if list_loaded else LIST_NOT_LOADED},
    }


LIST_NOT_LOADED = "The REACH Candidate List is not loaded, so declared substances were not checked."


def _safe(cell: object) -> str:
    """A spreadsheet cell that cannot run as a formula."""

    text = str(cell)
    return "'" + text if text.startswith(_RISKY_START) else text


def to_csv(draft: Mapping[str, Any]) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(HEADER)
    note = draft.get("summary", {}).get("note", "")
    if note:
        writer.writerow([""] * (len(HEADER) - 1) + [note])
    for item in draft["parts"]:
        writer.writerow([
            _safe(item["manufacturer"]), _safe(item["mpn"]), item["quantity"], _safe(item["references"]), item["rohs"], item["reach"],
            _safe("; ".join(item["on_candidate_list"])), _safe(item["rohs_stated"]), _safe(item["reach_stated"]),
            _safe(item["svhc_stated"]), _safe("; ".join(item["exemptions"])), _safe(" ".join(item["gaps"])),
        ])
    return out.getvalue()
