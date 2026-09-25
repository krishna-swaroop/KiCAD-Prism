"""Controlled-impedance CSV template and parser."""

from __future__ import annotations

import csv
import io
from typing import Any, Mapping, Sequence

COLUMNS: tuple[str, ...] = (
    "Type",
    "Name",
    "Layer pair",
    "Target Z (Ω)",
    "Tolerance (Ω)",
    "Width (mm)",
    "Spacing (mm)",
    "Notes",
)

TEMPLATE_CSV = (
    ",".join(COLUMNS)
    + "\n"
    + "SE,CLK,F.Cu-In1.Cu,50,10,0.15,,clock\n"
    + "DIFF,USB,F.Cu-In1.Cu,90,10,0.12,0.15,USB 2.0\n"
)


def parse_impedance_csv(text: str) -> list[dict[str, str]]:
    """Parse a filled template into table rows. Unknown extra columns are ignored."""

    reader = csv.DictReader(io.StringIO(text or ""))
    if reader.fieldnames is None:
        return []
    rows: list[dict[str, str]] = []
    for raw in reader:
        name = str(raw.get("Name") or "").strip()
        target = str(raw.get("Target Z (Ω)") or raw.get("Target Z (ohm)") or "").strip()
        if not name and not target:
            continue
        rows.append({column: str(raw.get(column) or "").strip() for column in COLUMNS})
    return rows


def impedance_table_rows(rows: Sequence[Mapping[str, Any]]) -> tuple[tuple[str, ...], ...]:
    out: list[tuple[str, ...]] = []
    for row in rows:
        out.append(
            (
                str(row.get("Type") or ""),
                str(row.get("Name") or ""),
                str(row.get("Layer pair") or ""),
                str(row.get("Target Z (Ω)") or ""),
                str(row.get("Tolerance (Ω)") or ""),
                str(row.get("Width (mm)") or ""),
                str(row.get("Spacing (mm)") or ""),
                str(row.get("Notes") or ""),
            )
        )
    return tuple(out)
