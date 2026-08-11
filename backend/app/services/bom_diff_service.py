import csv
import io
from typing import List, Dict, Any

# kicad-cli default BOM export labels the designator column "Refs".
# Legacy Prism exports and --fields Reference,... use "Reference".
_REFERENCE_ALIASES = ("Reference", "Refs", "Ref", "references")


def _reference_value(row: Dict[str, str]) -> str:
    for key in _REFERENCE_ALIASES:
        value = (row.get(key) or "").strip()
        if value:
            return value
    return ""


def _normalize_bom_row(row: Dict[str, str]) -> List[Dict[str, str]]:
    """
    Normalize a CSV row so diffs always key on Reference.

    Default kicad-cli exports use `Refs` (and may group multiple designators
    as `R1, R5`). Expand grouped designators into one row per reference so
    value-only changes still appear as Modified instead of being dropped.
    """
    refs_raw = _reference_value(row)
    if not refs_raw:
        return []

    refs = [part.strip() for part in refs_raw.split(",") if part.strip()]
    if not refs:
        return []

    normalized: List[Dict[str, str]] = []
    for ref in refs:
        next_row = dict(row)
        next_row["Reference"] = ref
        # Keep Refs aligned for any UI/export that still reads that label.
        next_row["Refs"] = ref
        normalized.append(next_row)
    return normalized


def parse_bom_csv(csv_content: str) -> List[Dict[str, str]]:
    """Parse CSV content into a list of component dictionaries."""
    if not csv_content or not csv_content.strip():
        return []
    f = io.StringIO(csv_content)
    # KiCad export might have different delimiters or delimiters in quotes
    # kicad-cli sch export bom defaults to "," and """
    reader = csv.DictReader(f)
    rows: List[Dict[str, str]] = []
    for row in reader:
        cleaned = {
            (key or "").strip(): (value or "").strip()
            for key, value in row.items()
            if key is not None
        }
        rows.extend(_normalize_bom_row(cleaned))
    return rows


def diff_boms(
    old_bom: List[Dict[str, str]],
    new_bom: List[Dict[str, str]],
    fields: List[str],
    *,
    include_unchanged: bool = False,
) -> Dict[str, Any]:
    """
    Compare two BoMs and return a structured diff.
    Components are matched by 'Reference' (or kicad-cli 'Refs').
    """
    old_map = {
        ref: row
        for row in old_bom
        if (ref := _reference_value(row))
    }
    new_map = {
        ref: row
        for row in new_bom
        if (ref := _reference_value(row))
    }

    all_refs = sorted(list(set(old_map.keys()) | set(new_map.keys())))

    changes = []
    summary = {"added": 0, "removed": 0, "changed": 0}

    # Preserve configured ordering, then expose every detected engineering
    # field so the client can offer a column chooser without another export.
    # Prefer the canonical Reference label over CLI aliases like Refs.
    detected_fields = {
        key
        for row in old_bom + new_bom
        for key in row.keys()
        if key and key not in {"Refs", "Ref", "references"}
    }
    fields = list(dict.fromkeys(["Reference", *fields, *sorted(detected_fields)]))

    for ref in all_refs:
        old_item = old_map.get(ref)
        new_item = new_map.get(ref)

        if not old_item:
            # Added
            summary["added"] += 1
            changes.append({
                "ref": ref,
                "status": "added",
                "new": {f: new_item.get(f, '') for f in fields}
            })
        elif not new_item:
            # Removed
            summary["removed"] += 1
            changes.append({
                "ref": ref,
                "status": "removed",
                "old": {f: old_item.get(f, '') for f in fields}
            })
        else:
            # Check for changes in the specified fields
            diffs = {}
            is_changed = False
            for f in fields:
                old_val = old_item.get(f, '')
                new_val = new_item.get(f, '')
                if old_val != new_val:
                    is_changed = True
                    diffs[f] = {"old": old_val, "new": new_val}

            if is_changed:
                summary["changed"] += 1
                changes.append({
                    "ref": ref,
                    "status": "changed",
                    "old": {f: old_item.get(f, '') for f in fields},
                    "new": {f: new_item.get(f, '') for f in fields},
                    "diffs": diffs
                })
            else:
                if not include_unchanged:
                    continue
                changes.append({
                    "ref": ref,
                    "status": "unchanged",
                    "old": {f: old_item.get(f, '') for f in fields},
                    "new": {f: new_item.get(f, '') for f in fields}
                })

    return {
        "summary": summary,
        "changes": changes,
        "fields": fields,
        "include_unchanged": include_unchanged,
    }
