"""The bill of materials a release build exported, read as BOM lines.

A release builds its own BOM (the project's variant, through the run's BOM preset), so what the supply check reads is
exactly what ships, whether or not anyone opened the Visualizer. The file is a CSV from ``kicad-cli``: one row per group
of identical parts, with the columns the preset chose. Columns are found by the same names the BOM table uses
(``bom_fields.py``) and a quantity column, or the references, gives how many go on a board. A row with no part number
says nothing and is left out; it is counted so the check can say so.

Nothing here calls a distributor.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Any, Mapping

from app.services.supply.bom_fields import identity_of, is_fitted, lcsc_of, prism_id_of
from app.services.supply.identity import alias_key, match_key
from app.services.supply.usage import MAX_REFERENCES_TEXT, Identities, UsageLine
from app.services.supply.errors import Refused

QUANTITY_FIELDS = ("qty", "quantity", "qnty", "count", "amount")
REFERENCE_FIELDS = ("reference", "references", "designator", "designators", "refs", "ref")
MAX_ROWS = 20_000
MAX_BYTES = 8 * 1024 * 1024


class BomReadError(Refused):
    """The file is not a BOM that can be read. The message is safe to show."""

    code = "bom_read_error"


@dataclass(frozen=True, slots=True)
class ReadBom:
    lines: list[UsageLine]
    rows: int
    without_number: int


def _table(text: str) -> list[dict[str, str]]:
    if len(text.encode("utf-8", "ignore")) > MAX_BYTES:
        raise BomReadError("The BOM file is larger than 8 MB.")
    text = text.lstrip("﻿")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    header: list[str] | None = None
    rows: list[dict[str, str]] = []
    data_rows = 0
    for row in reader:
        if not any(cell.strip() for cell in row):
            continue
        if header is None:
            header = [name.strip() for name in row]
            continue
        data_rows += 1
        if data_rows > MAX_ROWS:
            raise BomReadError(f"The BOM file has more than {MAX_ROWS:,} rows.")
        rows.append({header[index]: cell.strip() for index, cell in enumerate(row) if index < len(header) and header[index]})
    if data_rows == 0:
        raise BomReadError("The BOM file has no rows.")
    return rows


def _first(row: Mapping[str, str], names: tuple[str, ...]) -> str:
    by_name = {key.strip().lower(): value for key, value in row.items() if value.strip()}
    for name in names:
        if name in by_name:
            return by_name[name]
    return ""


def _quantity(row: Mapping[str, str]) -> int:
    given = _first(row, QUANTITY_FIELDS)
    if given:
        try:
            return max(1, int(float(given)))
        except ValueError:
            pass
    references = [ref for ref in re.split(r"[\s,;]+", _first(row, REFERENCE_FIELDS)) if ref]
    return max(1, len(references))


def lines_from_csv(text: str, identities: Identities | None = None) -> ReadBom:
    """The distinct parts in a BOM export, with how many go on a board. Rows marked not fitted are left out.

    The export is what was shipped, so its manufacturer and part number win: the library's identity of a row's Prism ID only fills a
    row that names no part number. A row keeps its Prism ID (and so its component's approved alternates) only while the shipped part is
    still that component's part; once the library has moved the component to another part, the row is the shipped part alone.
    """

    rows = _table(text)
    fitted = [row for row in rows if is_fitted(row)]
    library: Mapping[str, tuple[str, str]] = {}
    if identities is not None:
        library = identities({prism_id_of(row) for row in fitted} - {""})
    found: dict[str, dict[str, Any]] = {}
    without_number = 0
    for row in fitted:
        placed = library.get(prism_id_of(row))
        if placed and not placed[1].strip():
            placed = None
        shipped = identity_of(row)
        if match_key(shipped[1]):
            manufacturer, mpn = shipped
            # Still the component's part when the numbers agree; the Prism ID already names the component, so spellings of the maker may differ.
            if placed and match_key(placed[1]) != match_key(mpn):
                placed = None
        else:
            manufacturer, mpn = placed if placed else shipped
        number = match_key(mpn)
        if not number:
            without_number += 1
            continue
        key = f"{alias_key(manufacturer)}|{number}"
        line = found.setdefault(key, {"manufacturer": manufacturer, "mpn": mpn, "alias": alias_key(manufacturer), "number": number,
                                      "quantity": 0, "refs": [], "lcsc": "", "prism_id": "", "value": "", "footprint": ""})
        line["quantity"] += _quantity(row)
        line["refs"] += [ref for ref in re.split(r"[\s,;]+", _first(row, REFERENCE_FIELDS)) if ref]
        line["lcsc"] = line["lcsc"] or lcsc_of(row)
        line["prism_id"] = line["prism_id"] or (prism_id_of(row) if placed else "")
        line["value"] = line["value"] or _first(row, ("value",))[:200]
        line["footprint"] = line["footprint"] or _first(row, ("footprint",))[:200]
    return ReadBom(
        [
            UsageLine(key, line["manufacturer"], line["mpn"], line["alias"], line["number"], line["quantity"],
                      " ".join(sorted(line["refs"]))[:MAX_REFERENCES_TEXT], line["lcsc"], prism_id=line["prism_id"],
                      value=line["value"], footprint=line["footprint"])
            for key, line in found.items()
        ],
        rows=len(fitted),
        without_number=without_number,
    )
