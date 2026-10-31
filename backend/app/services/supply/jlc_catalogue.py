"""JLCPCB offers from the jlcparts catalogue, in place of an uploaded file.

jlcparts (github.com/yaqwsx/jlcparts) rebuilds JLCPCB's assembly parts library three times a day and publishes it as static
files: ``manifest.json``, a search index (one line per part: LCSC number, the shard that holds it, then lower-case text that
starts with the LCSC number and the manufacturer part number), the shards (``components-*.jsonl.gz``: a header naming the
columns, then one list per part) and an attribute table the parts point into (manufacturer, package, library class, status).

It is someone else's scrape, so a connector reads it only when an administrator turns it on (``catalogue`` on the connector,
for a provider whose spec names ``catalogue_url``). Only the parts Prism knows are kept: the index is read whole, and only
the shards holding a known part number are downloaded. The rows replace the connector's offers file, through the same store an
upload uses, so matching and reading work as for a file.

The format is jlcparts' own and has changed before: a manifest version other than ``VERSION`` stops the import with an error
the connector card shows, rather than reading the files wrongly.
"""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, Iterable

from app.services.supply.csv_format import CsvOfferRow
from app.services.supply.identity import match_key
from app.services.supply.models import PriceBreak
from app.services.supply.providers.base import ProviderError
from app.services.supply.vocabulary import Lifecycle, Packaging

VERSION = 4
# How long an import stands before the next; jlcparts is rebuilt every eight hours.
EVERY = timedelta(hours=12)
MAX_BYTES = 32 * 1024 * 1024
CURRENCY = "USD"

Fetch = Callable[[str], bytes]


def _json(data: bytes) -> Any:
    return json.loads(gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data)


def _lines(data: bytes) -> list[str]:
    return gzip.decompress(data).decode("utf-8").splitlines()


def _attribute(lut: list, ids: Iterable[int], name: str) -> str:
    """The primary value of the attribute called ``name`` among a part's attribute ids, as text."""

    for index in ids:
        if not isinstance(index, int) or not 0 <= index < len(lut):
            continue
        entry = lut[index]
        if isinstance(entry, list) and len(entry) == 2 and entry[0] == name and isinstance(entry[1], dict):
            value = (entry[1].get("values") or {}).get(entry[1].get("primary"))
            return str(value[0]).strip() if isinstance(value, list) and value else ""
    return ""


def _breaks(price: Any) -> tuple[PriceBreak, ...]:
    found: dict[int, Decimal] = {}
    for tier in price if isinstance(price, list) else []:
        if not isinstance(tier, dict):
            continue
        quantity, unit = tier.get("qFrom"), tier.get("price")
        if isinstance(quantity, int) and quantity >= 1 and isinstance(unit, (int, float)) and unit > 0:
            found.setdefault(quantity, Decimal(str(unit)))
    return tuple(PriceBreak(quantity, found[quantity]) for quantity in sorted(found))


def _row(values: list, columns: dict[str, int], lut: list) -> CsvOfferRow | None:
    def cell(name: str) -> Any:
        index = columns.get(name)
        return values[index] if index is not None and index < len(values) else None

    sku, mpn, stock = str(cell("lcsc") or "").strip(), str(cell("mfr") or "").strip(), cell("stock")
    if not sku or not mpn or not isinstance(stock, int) or stock < 0:
        return None
    ids = cell("attributes") or []
    breaks = _breaks(cell("price"))
    library = _attribute(lut, ids, "Basic/Extended").lower()
    status = _attribute(lut, ids, "Status").lower()
    description = str(cell("description") or "")
    return CsvOfferRow(
        sku=sku, mpn=mpn, manufacturer=_attribute(lut, ids, "Manufacturer"), stock=stock,
        currency=CURRENCY if breaks else "", moq=breaks[0].quantity if breaks else 1, order_multiple=1,
        packaging=Packaging.UNKNOWN, lead_time_days=None, lifecycle=Lifecycle.UNKNOWN,
        discontinued="discontinued" in status,
        rohs=True if description.upper().endswith("ROHS") else None,
        product_url=f"https://jlcpcb.com/partdetail/{sku}", incoming=None, price_breaks=breaks,
        jlc_library="Basic" if library == "basic" else "Extended" if library in ("extended", "preferred") else "",
        jlc_preferred=library == "preferred",
    )


def read(fetch: Fetch, wanted: set[str]) -> tuple[str, list[CsvOfferRow]]:
    """The catalogue's build time and the offers of the parts whose number's ``match_key`` is in ``wanted``. ``fetch`` returns a
    published file's bytes by name."""

    manifest = _json(fetch("manifest.json"))
    if not isinstance(manifest, dict) or manifest.get("version") != VERSION:
        raise ProviderError(f"the jlcparts catalogue format changed (version {manifest.get('version') if isinstance(manifest, dict) else '?'})")
    shards: dict[str, set[str]] = {}
    for line in _lines(fetch(str(manifest.get("searchIndex") or "search-index.tsv.gz"))):
        cells = line.split("\t")
        if len(cells) < 3:
            continue
        words = cells[2].split(" ", 2)
        if len(words) >= 2 and match_key(words[1]) in wanted:
            shards.setdefault(cells[1], set()).add(cells[0])
    if not shards:
        return str(manifest.get("created") or ""), []
    lut = _json(fetch(str(manifest.get("attributesLut") or "attributes-lut.json.gz")))
    rows: list[CsvOfferRow] = []
    for shard in sorted(shards):
        lines = _lines(fetch(shard))
        columns = json.loads(lines[0]) if lines else {}
        for line in lines[1:]:
            values = json.loads(line)
            if isinstance(values, list) and values and values[columns.get("lcsc", 0)] in shards[shard]:
                row = _row(values, columns, lut if isinstance(lut, list) else [])
                if row is not None and match_key(row.mpn) in wanted:
                    rows.append(row)
    return str(manifest.get("created") or ""), rows


def due(imported_at: datetime | None, now: datetime) -> bool:
    return imported_at is None or now - imported_at >= EVERY
