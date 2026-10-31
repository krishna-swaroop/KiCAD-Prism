"""JLCPCB offers from the jlcparts catalogue (``jlc_catalogue``), against small files shaped like the published ones."""

from __future__ import annotations

import gzip
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import jlc_catalogue  # noqa: E402
from app.services.supply.identity import match_key  # noqa: E402
from app.services.supply.providers.base import ProviderError  # noqa: E402

SHARD = "components-timers__abc12345-001.jsonl.gz"
OTHER = "components-resistors__def67890-001.jsonl.gz"
HEADER = {"lcsc": 0, "mfr": 1, "joints": 2, "description": 3, "datasheet": 4, "price": 5, "img": 6, "url": 7, "attributes": 8, "stock": 9, "subcategory": 10}
LUT = [
    ["Manufacturer", {"primary": "identifier", "values": {"identifier": ["Texas Instruments", "identifier"]}}],
    ["Basic/Extended", {"primary": "catalog class 1", "values": {"catalog class 1": ["Preferred", "identifier"]}}],
    ["Status", {"primary": "default", "values": {"default": ["Discontinued", "string"]}}],
    ["Basic/Extended", {"primary": "catalog class 1", "values": {"catalog class 1": ["Basic", "identifier"]}}],
]


def gz(text: str) -> bytes:
    return gzip.compress(text.encode("utf-8"))


def files(version: int = 4) -> dict[str, bytes]:
    timer = ["C7593", "NE555DR", 8, "Timer SOIC-8 ROHS", "", [{"qFrom": 1, "qTo": 49, "price": 0.1204}, {"qFrom": 50, "qTo": None, "price": 0.0951}], None, None, [0, 1], 203811, 1]
    old = ["C1", "NE555P", 8, "Timer DIP-8", "", [], None, None, [0, 2], 0, 1]
    resistor = ["C25804", "0603WAF1002T5E", 2, "10k 0603 ROHS", "", [{"qFrom": 100, "qTo": None, "price": 0.0005}], None, None, [3], 1000000, 2]
    index = "\n".join([
        f"C7593\t{SHARD}\tc7593 ne555dr timer soic-8 rohs",
        f"C1\t{SHARD}\tc1 ne555p timer dip-8",
        f"C25804\t{OTHER}\tc25804 0603waf1002t5e 10k rohs",
    ])
    return {
        "manifest.json": json.dumps({"version": version, "created": "2026-10-29T10:26:45+00:00", "searchIndex": "search-index.tsv.gz",
                                     "attributesLut": "attributes-lut.json.gz"}).encode(),
        "search-index.tsv.gz": gz(index),
        "attributes-lut.json.gz": gz(json.dumps(LUT)),
        SHARD: gz("\n".join(json.dumps(line) for line in (HEADER, timer, old))),
        OTHER: gz("\n".join(json.dumps(line) for line in (HEADER, resistor))),
    }


class CatalogueTests(unittest.TestCase):
    def read(self, numbers, published=None):
        published = published or files()
        asked: list[str] = []

        def fetch(name: str) -> bytes:
            asked.append(name)
            return published[name]

        created, rows = jlc_catalogue.read(fetch, {match_key(number) for number in numbers})
        return created, rows, asked

    def test_only_the_shards_holding_a_known_number_are_downloaded_and_only_known_parts_kept(self) -> None:
        created, rows, asked = self.read(["NE555DR", "NE555P"])
        self.assertEqual(created, "2026-10-29T10:26:45+00:00")
        self.assertNotIn(OTHER, asked)
        self.assertEqual([row.sku for row in rows], ["C7593", "C1"])
        timer, old = rows
        self.assertEqual((timer.mpn, timer.manufacturer, timer.stock, timer.currency, timer.moq), ("NE555DR", "Texas Instruments", 203811, "USD", 1))
        self.assertEqual([(b.quantity, b.unit_price) for b in timer.price_breaks], [(1, Decimal("0.1204")), (50, Decimal("0.0951"))])
        self.assertEqual((timer.jlc_library, timer.jlc_preferred, timer.rohs, timer.discontinued), ("Extended", True, True, False))
        self.assertEqual(timer.product_url, "https://jlcpcb.com/partdetail/C7593")
        self.assertEqual((old.stock, old.currency, old.price_breaks, old.discontinued, old.rohs), (0, "", (), True, None))

    def test_nothing_known_downloads_nothing_past_the_index(self) -> None:
        _created, rows, asked = self.read(["LM358"])
        self.assertEqual((rows, asked), ([], ["manifest.json", "search-index.tsv.gz"]))

    def test_a_basic_part_is_basic(self) -> None:
        (row,) = self.read(["0603WAF1002T5E"])[1]
        self.assertEqual((row.jlc_library, row.jlc_preferred, row.moq), ("Basic", False, 100))

    def test_another_format_version_stops_the_import(self) -> None:
        with self.assertRaises(ProviderError):
            self.read(["NE555DR"], files(version=5))

    def test_an_import_is_due_after_twelve_hours(self) -> None:
        now = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)
        self.assertTrue(jlc_catalogue.due(None, now))
        self.assertFalse(jlc_catalogue.due(now - timedelta(hours=11), now))
        self.assertTrue(jlc_catalogue.due(now - timedelta(hours=12), now))


if __name__ == "__main__":
    unittest.main()
