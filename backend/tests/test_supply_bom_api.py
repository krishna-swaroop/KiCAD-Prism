"""Looking a BOM up in the supply data: resolution, status, purchase, rollup, and watching its parts.

Needs ``PRISM_DATABASE_URL``. Requests go through the real router into a disposable schema.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import reading as _reading  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
SEED = "seed@example.com"
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class BomLookupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_bom, supply_connectors
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts, cls.watches = database, parts, watches
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_bom_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_bom.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        # Summaries are assessed at the time the fixtures read at, so their reads are not late.
        patcher = mock.patch("app.services.supply.parts_view._now", return_value=NOW)
        patcher.start()
        self.addCleanup(patcher.stop)
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(actor=SEED, provider="fake", currency="EUR", display_name="Sim", interactive_reserve_pct=0)["id"]

    # --- helpers ----------------------------------------------------------

    def call(self, path: str, body, *, role: str = "admin"):
        return _request(self.app, "POST", path, user=self.users[role], body=body)

    def lookup(self, lines, build: int = 1, role: str = "admin", attrition: float | None = None) -> dict:
        body = {"build_quantity": build, "lines": lines} | ({} if attrition is None else {"attrition_percent": attrition})
        response = self.call("/api/supply/bom/lookup", body, role=role)
        self.assertEqual(response.status, 200, response.text)
        return response.json

    def part(self, maker: str, mpn: str, *, watch: bool = False) -> str:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, maker, SEED)  # a known maker, so the same number under another maker is another part
            record = self.parts.ensure_part(conn, maker, mpn, SEED)
            if watch:
                self.watches.add_watch(conn, maker, mpn, SEED)
        return record.id

    def offer(self, part_id: str, sku: str, *, stock: int, price="0.50", moq: int = 1, multiple: int = 1, currency="EUR",
              lead: int | None = None, marketplace: bool = False, lifecycle: str = "active", breaks=None) -> None:
        listing_id = uuid.uuid4().hex
        tiers = breaks if breaks is not None else [[1, price]]
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                "VALUES (%s, %s, %s, %s, 'x', 'x', 'exact')", (listing_id, self.cid, sku, part_id, ))
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, moq, order_multiple, price_breaks, currency, lead_time_days, "
                "marketplace, lifecycle, product_url) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)",
                (listing_id, NOW, stock, moq, multiple, json.dumps(tiers), currency, lead, marketplace, lifecycle, f"https://shop.example/{sku}"))

    # --- resolution -------------------------------------------------------

    def test_a_line_resolves_through_spelling_and_part_number_variants(self) -> None:
        part_id = self.part("Texas Instruments", "LM358-D")
        self.offer(part_id, "A", stock=100)
        lines = [
            {"key": "a", "manufacturer": "Texas Instruments", "mpn": "LM358-D"},
            {"key": "b", "manufacturer": "texas instruments inc.", "mpn": "lm358d"},
            {"key": "c", "manufacturer": "TEXAS INSTRUMENTS", "mpn": "LM358 D"},
        ]
        for key, entry in self.lookup(lines)["lines"].items():
            self.assertEqual((entry["state"], entry["part_id"], entry["manufacturer_match"]), ("tracked", part_id, "exact"), key)

    def test_a_prism_id_the_library_knows_decides_the_line(self) -> None:
        from app.services.supply import catalog_read

        part_id = self.part("Texas Instruments", "LM358DR")
        lines = [
            {"key": "placed", "manufacturer": "Wrong Co", "mpn": "stale-text", "prism_id": "c1"},
            {"key": "unknown-id", "manufacturer": "Wrong Co", "mpn": "stale-text", "prism_id": "gone"},
            {"key": "plain", "manufacturer": "Texas Instruments", "mpn": "LM358DR"},
        ]
        with mock.patch.object(catalog_read, "identities", lambda ids: {"c1": ("Texas Instruments", "LM358DR")}):
            result = self.lookup(lines)["lines"]
        self.assertEqual((result["placed"]["state"], result["placed"]["part_id"], result["placed"]["manufacturer_match"]), ("tracked", part_id, "exact"))
        self.assertEqual(result["unknown-id"]["state"], "unknown", "an id the library does not know falls back to the symbol's text")
        self.assertEqual(result["plain"]["part_id"], part_id)

    def test_lines_that_name_their_part_badly_say_so(self) -> None:
        from app.services.supply import bom_lookup

        self.part("Acme", "R-1")
        self.part("Acme", "R-2")
        lines = [bom_lookup.BomLine("blank", "", "R-1", 1), bom_lookup.BomLine("named", "Acme", "R-2", 1)]
        with self.store.connection() as conn:
            plain = bom_lookup.lookup(conn, lines, 1)["lines"]
            checked = bom_lookup.lookup(conn, lines, 1, in_library=lambda pairs: {("acme", "r-2")})["lines"]
        self.assertEqual(plain["blank"]["assessment"]["checks"], ["manufacturer_missing"])
        self.assertEqual(plain["named"]["assessment"]["checks"], [], "the library is only asked when a check is given")
        self.assertEqual(sorted(checked["blank"]["assessment"]["checks"]), ["manufacturer_missing", "not_in_library"])
        self.assertEqual(checked["named"]["assessment"]["checks"], [], "the library has Acme R-2")

    def test_every_line_says_whether_the_library_has_it(self) -> None:
        from app.services.supply import bom_lookup

        lines = [
            bom_lookup.BomLine("placed", "Wrong Co", "stale", 1, prism_id="c1"),
            bom_lookup.BomLine("named", "Acme", "R-2", 1),
            bom_lookup.BomLine("loose", "Nobody", "LOOSE-1", 1),
            bom_lookup.BomLine("blank", "", "", 1),
        ]
        with self.store.connection() as conn:
            plain = bom_lookup.lookup(conn, lines, 1)["lines"]
            checked = bom_lookup.lookup(
                conn, lines, 1, identities=lambda ids: {"c1": ("Texas Instruments", "LM358DR")},
                in_library=lambda pairs: {("acme", "r-2")},
            )["lines"]
        self.assertEqual({key: line["in_library"] for key, line in plain.items()}, dict.fromkeys(plain), "unknown when the library was not asked")
        self.assertEqual(
            {key: line["in_library"] for key, line in checked.items()},
            {"placed": True, "named": True, "loose": False, "blank": None},
        )

    def test_a_value_or_footprint_that_disagrees_with_the_distributor_is_a_finding(self) -> None:
        from app.services.supply import bom_lookup, discovery

        part = self.part("Acme", "R-10K")
        with self.store.connection() as conn:
            discovery.remember_parameters(conn, part, "mouser", [("Resistance", "4.7 kOhms"), ("Package / Case", "0805 (2012 Metric)")])
        lines = [
            bom_lookup.BomLine("a", "Acme", "R-10K", 1, value="10k", footprint="Resistor_SMD:R_0603_1608Metric"),
            bom_lookup.BomLine("b", "Acme", "R-10K", 1, value="4k7", footprint="Resistor_SMD:R_0805_2012Metric"),
        ]
        with self.store.connection() as conn:
            first = bom_lookup.lookup(conn, lines[:1], 1)["lines"]["a"]["assessment"]["checks"]
            second = bom_lookup.lookup(conn, lines[1:], 1)["lines"]["b"]["assessment"]["checks"]
        self.assertEqual(sorted(first), ["package_mismatch", "parameter_mismatch"])
        self.assertEqual(second, [], "4k7 does not parse, so it says nothing, and 0805 matches")

    def test_the_library_is_asked_once_and_a_component_without_a_number_changes_nothing(self) -> None:
        part_id = self.part("Texas Instruments", "LM358DR")
        asked = []

        def library(ids):
            asked.append(set(ids))
            return {"blank": ("Wrong Co", " "), "full": ("Texas Instruments", "LM358DR")}

        lines = [
            {"key": "a", "manufacturer": "Texas Instruments", "mpn": "LM358DR", "prism_id": "blank"},
            {"key": "b", "manufacturer": "", "mpn": "", "prism_id": "full"},
        ]
        from app.services.supply import catalog_read

        with mock.patch.object(catalog_read, "identities", library):
            result = self.lookup(lines)["lines"]
        self.assertEqual(len(asked), 1)
        self.assertEqual((result["a"]["part_id"], result["b"]["part_id"]), (part_id, part_id))

    def test_only_distinct_providers_count_as_distributors(self) -> None:
        from app.services.supply.assessment import service

        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_connectors")
            for index, (provider, store, enabled) in enumerate((
                ("tme", "IT", True), ("tme", "DE", True), ("mouser", "", True), ("csv", "", True), ("fake", "", True), ("digikey", "", False),
            )):
                conn.execute("INSERT INTO supply_connectors (id, provider, storefront, enabled) VALUES (%s, %s, %s, %s)", (f"x{index}", provider, store, enabled))
            self.assertEqual(service.distributor_count(conn), 2)

    def test_the_catalog_table_asks_where_components_stand_and_untracked_ones_are_left_out(self) -> None:
        part_id = self.part("Texas Instruments", "LM358DR", watch=True)
        self.offer(part_id, "A", stock=0)
        body = {"components": [
            {"key": "cmp-1", "manufacturer": "Texas Instruments", "mpn": "LM358DR"},
            {"key": "cmp-2", "manufacturer": "Acme", "mpn": "NOBODY"},
            {"key": "cmp-3", "manufacturer": "", "mpn": ""},
        ]}
        response = self.call("/api/supply/bom/components-status", body)
        self.assertEqual(response.status, 200, response.text)
        self.assertEqual(response.json["items"], {"cmp-1": {"status": "error", "stock": 0, "watched": True, "unit_price": "0.5", "currency": "EUR", "test_data": True, "restriction": None}})
        self.assertEqual(self.call("/api/supply/bom/components-status", body, role="viewer").status, 403)
        with self.store.connection() as conn:
            from app.services.supply import ending_parts

            ending_parts.set_restriction(conn, "cmp-2", "not_for_new_designs", "", "", "qa@example.com")

        def unmark() -> None:
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_component_restrictions")

        self.addCleanup(unmark)
        marked = self.call("/api/supply/bom/components-status", body).json["items"]
        self.assertEqual(marked["cmp-2"], {"status": "unknown", "stock": None, "watched": False, "unit_price": None, "currency": "", "restriction": "not_for_new_designs"},
                         "a marked component shows its mark though Prism does not track its part")
        self.assertEqual(self.call("/api/supply/bom/components-status", {"components": []}).json, {"items": {}})

    def test_the_other_resolutions(self) -> None:
        only = self.part("Texas Instruments", "UNIQUE1")
        self.part("Texas Instruments", "TWIN1")
        self.part("Onsemi", "TWIN1")
        lines = [
            {"key": "missing", "manufacturer": "", "mpn": "UNIQUE1"},
            {"key": "unmatched", "manufacturer": "T.I. Corp", "mpn": "UNIQUE1"},
            {"key": "ambiguous", "manufacturer": "", "mpn": "TWIN1"},
            {"key": "wrong-maker", "manufacturer": "Acme", "mpn": "TWIN1"},
            {"key": "unknown", "manufacturer": "Acme", "mpn": "NOBODY-HAS-THIS"},
            {"key": "none", "manufacturer": "Acme", "mpn": ""},
            {"key": "blank", "manufacturer": "Acme", "mpn": "  -- "},
        ]
        result = self.lookup(lines)["lines"]
        self.assertEqual((result["missing"]["state"], result["missing"]["part_id"], result["missing"]["manufacturer_match"]), ("tracked", only, "missing"))
        self.assertEqual((result["unmatched"]["part_id"], result["unmatched"]["manufacturer_match"]), (only, "unmatched"))
        self.assertEqual((result["ambiguous"]["state"], result["wrong-maker"]["state"]), ("ambiguous", "ambiguous"))
        self.assertEqual((result["unknown"]["state"], result["none"]["state"], result["blank"]["state"]), ("unknown", "no_mpn", "no_mpn"))

    # --- what a tracked line reports ---------------------------------------

    def test_stock_status_need_and_shortage(self) -> None:
        part_id = self.part("Acme", "R1", watch=True)
        self.offer(part_id, "A", stock=500, lead=30)
        self.offer(part_id, "B", stock=0, lead=7)
        low = self.part("Acme", "R2")
        self.offer(low, "C", stock=40, lifecycle="nrnd")
        result = self.lookup([
            {"key": "r1", "manufacturer": "Acme", "mpn": "R1", "quantity": 4},
            {"key": "r2", "manufacturer": "Acme", "mpn": "R2", "quantity": 5},
        ], build=10)["lines"]
        r1, r2 = result["r1"], result["r2"]
        self.assertEqual((r1["need"], r1["stock"], r1["short"], r1["watched"], r1["status"]), (40, 500, False, True, "ok"))
        self.assertEqual(r1["lead_time_days"], 30, "the lead time of an offer that has stock, not of an empty one")
        self.assertEqual((r2["need"], r2["stock"], r2["short"], r2["watched"], r2["status"], r2["lifecycle"]), (50, 40, True, False, "warning", "nrnd"))

    def test_a_part_never_read_is_tracked_but_has_no_numbers(self) -> None:
        self.part("Acme", "UNREAD", watch=True)
        entry = self.lookup([{"key": "u", "manufacturer": "Acme", "mpn": "UNREAD"}])["lines"]["u"]
        self.assertEqual((entry["state"], entry["stock"], entry["short"], entry["buy"], entry["status"]), ("tracked", None, False, None, "unknown"))

    # --- buying -----------------------------------------------------------

    def test_the_cheapest_offer_that_covers_the_need_wins_over_a_cheaper_one_that_does_not(self) -> None:
        part_id = self.part("Acme", "R1")
        self.offer(part_id, "CHEAP-SHORT", stock=10, price="0.10")
        self.offer(part_id, "DEAR-ENOUGH", stock=1000, price="0.30")
        self.offer(part_id, "MIDDLE-ENOUGH", stock=1000, price="0.20")
        buy = self.lookup([{"key": "r", "manufacturer": "Acme", "mpn": "R1", "quantity": 10}], build=10)["lines"]["r"]["buy"]
        self.assertEqual((buy["sku"], buy["unit_price"], buy["quantity"], buy["extended"], buy["covers"]), ("MIDDLE-ENOUGH", "0.2", 100, "20", True))
        self.assertEqual((buy["connector_name"], buy["product_url"]), ("Sim", "https://shop.example/MIDDLE-ENOUGH"))

    def test_a_watched_packaging_is_the_only_one_the_purchase_and_the_checks_use(self) -> None:
        part_id = self.part("Acme", "TAPED", watch=True)
        self.offer(part_id, "REEL", stock=50000, price="0.01", moq=1)
        self.offer(part_id, "CUT", stock=500, price="0.05")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET packaging = 'tape_reel' WHERE listing_id IN (SELECT id FROM supply_listings WHERE sku = 'REEL')")
            conn.execute("UPDATE supply_offers SET packaging = 'cut_tape' WHERE listing_id IN (SELECT id FROM supply_listings WHERE sku = 'CUT')")
        line = [{"key": "r", "manufacturer": "Acme", "mpn": "TAPED", "quantity": 1}]
        self.assertEqual(self.lookup(line, build=100)["lines"]["r"]["buy"]["sku"], "REEL", "any packaging: the cheapest that covers")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_watches SET packaging = 'cut_tape'")
        entry = self.lookup(line, build=100)["lines"]["r"]
        self.assertEqual((entry["buy"]["sku"], entry["stock"]), ("CUT", 500), "cut tape only: the reel is not suggested")
        self.assertEqual(self.lookup(line, build=1000)["lines"]["r"]["short"], True, "and its stock is what is checked")

    def test_minimum_order_and_multiples_set_what_is_bought_and_what_it_costs(self) -> None:
        part_id = self.part("Acme", "REELED")
        self.offer(part_id, "REEL", stock=50000, moq=3000, multiple=3000, breaks=[[3000, "0.0500"]])
        buy = self.lookup([{"key": "r", "manufacturer": "Acme", "mpn": "REELED", "quantity": 2}], build=100)["lines"]["r"]["buy"]
        self.assertEqual((buy["quantity"], buy["unit_price"], buy["extended"]), (3000, "0.05", "150"), "200 needed, a reel of 3,000 bought")

    def test_rounding_to_a_reel_is_counted_as_waste_and_the_next_break_is_shown(self) -> None:
        part_id = self.part("Acme", "WASTED")
        self.offer(part_id, "REEL", stock=50000, moq=1, multiple=1, breaks=[[1, "0.1000"], [100, "0.0800"], [1000, "0.0500"]])
        result = self.lookup([{"key": "w", "manufacturer": "Acme", "mpn": "WASTED", "quantity": 1}], build=150)
        buy = result["lines"]["w"]["buy"]
        self.assertEqual((buy["quantity"], buy["waste"], buy["waste_cost"]), (150, 0, "0"), "no minimum, nothing wasted")
        self.assertEqual(buy["next_break"], {"quantity": 1000, "unit_price": "0.05", "extra": "38"}, "1000 at 0.05 is 50 against 150 at 0.08 = 12")
        self.assertEqual(result["rollup"]["waste_cost"], "0.00")
        reeled = self.part("Acme", "REELED2")
        self.offer(reeled, "REEL2", stock=50000, moq=3000, multiple=3000, breaks=[[3000, "0.0500"]])
        rolled = self.lookup([{"key": "r", "manufacturer": "Acme", "mpn": "REELED2", "quantity": 2}], build=100)
        self.assertEqual((rolled["lines"]["r"]["buy"]["waste"], rolled["lines"]["r"]["buy"]["waste_cost"]), (2800, "140"))
        self.assertEqual(rolled["rollup"]["waste_cost"], "140.00")

    def test_spares_by_package_give_small_passives_a_margin_and_nothing_to_the_rest(self) -> None:
        small, chip = self.part("Acme", "RSMALL"), self.part("Acme", "ICBIG")
        self.offer(small, "S", stock=100000)
        self.offer(chip, "C", stock=100000)
        lines = [
            {"key": "r", "manufacturer": "Acme", "mpn": "RSMALL", "quantity": 10, "footprint": "Resistor_SMD:R_0603_1608Metric"},
            {"key": "u", "manufacturer": "Acme", "mpn": "ICBIG", "quantity": 1, "footprint": "Package_QFP:LQFP-48_7x7mm_P0.5mm"},
        ]
        body = {"build_quantity": 100, "lines": lines, "attrition_percent": None}
        response = self.call("/api/supply/bom/lookup", body)
        self.assertEqual(response.status, 200, response.text)
        result = response.json
        self.assertEqual((result["lines"]["r"]["need"], result["lines"]["u"]["need"]), (1020, 100), "10 x 100 plus 2%; the IC has none")
        self.assertEqual(sorted(result["attrition_by_part"].values()), [0.0, 2.0])
        flat = self.lookup(lines, build=100, attrition=0)
        self.assertEqual(flat["lines"]["r"]["need"], 1000)
        self.assertIsNone(flat["attrition_by_part"])

    def test_when_nothing_covers_the_cheapest_is_still_shown_and_says_so(self) -> None:
        part_id = self.part("Acme", "SCARCE")
        self.offer(part_id, "A", stock=5, price="0.40")
        buy = self.lookup([{"key": "s", "manufacturer": "Acme", "mpn": "SCARCE", "quantity": 10}], build=10)["lines"]["s"]["buy"]
        self.assertEqual((buy["sku"], buy["covers"]), ("A", False))

    def test_marketplace_offers_and_mixed_currencies_give_no_price(self) -> None:
        part_id = self.part("Acme", "ODD")
        self.offer(part_id, "GREY", stock=1000, price="0.01", marketplace=True)
        self.assertIsNone(self.lookup([{"key": "o", "manufacturer": "Acme", "mpn": "ODD"}])["lines"]["o"]["buy"])
        self.offer(part_id, "EUR", stock=1000, price="0.30")
        self.offer(part_id, "USD", stock=1000, price="0.20", currency="USD")
        self.assertIsNone(self.lookup([{"key": "o", "manufacturer": "Acme", "mpn": "ODD"}])["lines"]["o"]["buy"],
                          "nothing here converts euros to dollars")

    # --- the rollup -------------------------------------------------------

    def test_the_rollup_costs_the_build_and_says_how_many_boards_the_stock_allows(self) -> None:
        a, b = self.part("Acme", "A1", watch=True), self.part("Acme", "B1")
        self.offer(a, "A", stock=1000, price="0.10")
        self.offer(b, "B", stock=30, price="1.00", lifecycle="obsolete")
        self.part("Acme", "UNREADPART")
        lines = [
            {"key": "a", "manufacturer": "Acme", "mpn": "A1", "quantity": 4},
            {"key": "b", "manufacturer": "Acme", "mpn": "B1", "quantity": 2},
            {"key": "u", "manufacturer": "Acme", "mpn": "UNREADPART", "quantity": 1},
            {"key": "x", "manufacturer": "Acme", "mpn": "NOT-KNOWN", "quantity": 1},
            {"key": "n", "manufacturer": "", "mpn": "", "quantity": 1},
        ]
        data = self.lookup(lines, build=10)
        rollup = data["rollup"]
        self.assertEqual((rollup["lines"], rollup["tracked"], rollup["not_tracked"], rollup["watched"]), (5, 3, 2, 1))
        self.assertEqual((rollup["at_risk"], rollup["short"], rollup["priced"], rollup["without_stock_data"]), (1, 0, 2, 1))
        self.assertEqual((rollup["lines_priced"], rollup["lines"]), (2, 5), "the cost covers two of five lines")
        self.assertEqual((rollup["currency"], rollup["cost_build"], rollup["cost_per_board"]), ("EUR", "24.00", "2.4000"))
        self.assertEqual((rollup["can_build"], rollup["limited_by"]), (15, "b"), "30 pieces at 2 a board: 15 boards")

    def test_cost_per_board_leaves_out_what_a_minimum_order_buys_beyond_the_need(self) -> None:
        part_id = self.part("Acme", "CELL")
        self.offer(part_id, "PACK", stock=50000, price="1.476", moq=1000, multiple=1000)
        rollup = self.lookup([{"key": "c", "manufacturer": "Acme", "mpn": "CELL", "quantity": 1}], build=1)["rollup"]
        self.assertEqual(rollup["cost_build"], "1476.00", "to buy for one board: the whole pack")
        self.assertEqual(rollup["cost_per_board"], "1.4760", "what one board uses")
        self.assertEqual(rollup["waste_cost"], "1474.52", "left over")

    def test_price_history_follows_the_pick_and_leaves_out_reels_above_the_reference_quantity(self) -> None:
        from app.services.supply import prices

        part_id = self.part("Acme", "CHART")
        self.offer(part_id, "CT", stock=500, price="5.00")
        self.offer(part_id, "PICKED-OUT", stock=500, price="4.00")
        self.offer(part_id, "REEL", stock=5000, price="3.00", moq=1500)
        with self.store.connection() as conn:
            rows = conn.execute("SELECT id, sku FROM supply_listings WHERE part_id = %s", (part_id,)).fetchall()
            ids = {row["sku"]: row["id"] for row in rows}
            for sku, price, moq in (("CT", "5.00", 1), ("PICKED-OUT", "4.00", 1), ("REEL", "3.00", 1500)):
                _reading(conn, ids[sku], NOW, 10, price=price, moq=moq)
            conn.execute("INSERT INTO supply_packaging_picks (part_id, connector_id, listing_id, picked_by) VALUES (%s, %s, %s, 'person')", (part_id, self.cid, ids["CT"]))
            history = prices.daily_cheapest(conn, part_id, NOW)
        self.assertEqual([float(price) for _, price, _ in history], [5.0], "the picked cut tape, not the reel or the other pack")

    def test_the_history_has_a_line_per_distributor_carried_to_its_last_read(self) -> None:
        from app.services.supply import part_history

        part_id = self.part("Acme", "LINES")
        self.offer(part_id, "A", stock=40, price="0.50")
        other = self.connectors.create(actor=SEED, provider="lcsc", display_name="Other", daily_budget=1000)["id"]
        listing = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, 'B', %s, 'x', 'x', 'exact')",
                         (listing, other, part_id))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, currency, price_breaks) VALUES (%s, %s, 10, 'EUR', '[[1, \"0.70\"]]'::jsonb)", (listing, NOW))
            for moment, stock_a, stock_b in ((datetime(2026, 2, 27, 8, tzinfo=timezone.utc), 50, 12), (NOW, 40, 10)):
                for sku_listing, amount, price in ((self.listing_of(conn, "A"), stock_a, "0.50"), (listing, stock_b, "0.70")):
                    _reading(conn, sku_listing, moment, amount, price=price)
            data = part_history.build(conn, part_id, NOW, 30)
        self.assertEqual(data["currency"], "EUR")
        names = [line["name"] for line in data["connectors"]]
        self.assertEqual(names, ["Other", "Sim"])
        sim = next(line for line in data["connectors"] if line["name"] == "Sim")
        self.assertEqual([point[1] for point in sim["stock"]], [50, 50, 40], "stepped from reading to reading, one point a day")
        self.assertEqual(sim["price"][-1][1], 0.5)
        self.assertEqual(data["total"][-1][1], 50, "what counts across both")
        self.assertEqual(data["events"], [], "no restock and no notice in this history")

    def test_the_history_marks_a_restock_and_a_notice(self) -> None:
        from app.services.supply import part_history

        part_id = self.part("Acme", "MARKS")
        self.offer(part_id, "M", stock=900, price="0.5")
        with self.store.connection() as conn:
            listing = self.listing_of(conn, "M")
            for day, amount in ((27, 100), (28, 100), (1, 900)):
                moment = datetime(2026, 2 if day > 1 else 3, day, 8, tzinfo=timezone.utc)
                _reading(conn, listing, moment, amount, price="0.5")
            conn.execute("INSERT INTO supply_pcns (id, title, kind, published_on, state, created_by) VALUES ('n1', 'EOL', 'end_of_life', %s, 'open', 'x')", (datetime(2026, 2, 28).date(),))
            conn.execute("INSERT INTO supply_pcn_parts (pcn_id, part_id) VALUES ('n1', %s)", (part_id,))
            events = part_history.build(conn, part_id, NOW, 30)["events"]
        self.assertEqual([(item["day"], item["kind"]) for item in events], [("2026-02-28", "notice"), ("2026-03-01", "restock")])

    def listing_of(self, conn, sku: str) -> str:
        return conn.execute("SELECT id FROM supply_listings WHERE sku = %s", (sku,)).fetchone()["id"]

    def test_the_preferred_distributor_prices_the_bom_only_when_the_option_is_on_and_it_holds_enough(self) -> None:
        from app.services.supply import preferences
        from app.services.supply import settings as supply_settings

        part_id = self.part("Acme", "PREF")
        other = self.connectors.create(actor=SEED, provider="lcsc", display_name="Other", daily_budget=1000)["id"]
        self.offer(part_id, "CHEAP", stock=1000, price="0.10")
        listing = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, 'DEAR', %s, 'x', 'x', 'exact')", (listing, other, part_id))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, moq, order_multiple, price_breaks, currency, product_url) VALUES (%s, %s, 500, 1, 1, '[[1, \"0.30\"]]'::jsonb, 'EUR', '')", (listing, NOW))
            preferences.set_preferred(conn, part_id, other, SEED)
        line = [{"key": "p", "manufacturer": "Acme", "mpn": "PREF", "quantity": 1}]
        self.assertEqual(self.lookup(line, build=10)["lines"]["p"]["buy"]["sku"], "CHEAP", "off by default: the cheapest")
        with self.store.connection() as conn:
            supply_settings.save_form(conn, {"prefer_distributors": True}, SEED)
        self.assertEqual(self.lookup(line, build=10)["lines"]["p"]["buy"]["sku"], "DEAR", "the preferred one has enough stock")
        self.assertEqual(self.lookup(line, build=600)["lines"]["p"]["buy"]["sku"], "CHEAP", "not enough there for 600: the cheapest")
        with self.store.connection() as conn:
            preferences.clear(conn, part_id, SEED)
            supply_settings.save_form(conn, {"prefer_distributors": True, "distributor_order": [other]}, SEED)
        self.assertEqual(self.lookup(line, build=10)["lines"]["p"]["buy"]["sku"], "DEAR", "the workspace order applies without a part's own choice")

    def test_attrition_adds_spares_to_the_need_and_takes_them_off_what_can_be_built(self) -> None:
        part_id = self.part("Acme", "R1")
        self.offer(part_id, "A", stock=105)
        lines = [{"key": "r", "manufacturer": "Acme", "mpn": "R1", "quantity": 5}]
        plain = self.lookup(lines, build=20)
        self.assertEqual((plain["lines"]["r"]["need"], plain["rollup"]["short"], plain["rollup"]["can_build"]), (100, 0, 21))
        spare = self.lookup(lines, build=20, attrition=10)
        self.assertEqual(spare["attrition_percent"], 10)
        self.assertEqual((spare["lines"]["r"]["need"], spare["lines"]["r"]["part_need"], spare["rollup"]["short"]), (110, 110, 0 if 105 >= 110 else 1))
        self.assertEqual(spare["rollup"]["can_build"], 19, "105 pieces at 5.5 a board")
        self.assertEqual(self.lookup(lines, build=3, attrition=10)["lines"]["r"]["need"], 17, "16.5 rounds up")
        bad = self.call("/api/supply/bom/lookup", {"build_quantity": 1, "attrition_percent": 150, "lines": lines})
        self.assertEqual(bad.status, 422)

    def test_a_shortage_is_counted_and_nothing_to_build_with_says_none(self) -> None:
        part_id = self.part("Acme", "R1")
        self.offer(part_id, "A", stock=20)
        rollup = self.lookup([{"key": "r", "manufacturer": "Acme", "mpn": "R1", "quantity": 5}], build=10)["rollup"]
        self.assertEqual((rollup["short"], rollup["can_build"]), (1, 4))
        empty = self.lookup([{"key": "x", "manufacturer": "Acme", "mpn": "NOPE"}])["rollup"]
        self.assertEqual((empty["can_build"], empty["limited_by"], empty["cost_build"], empty["currency"]), (None, None, None, None))

    def test_one_part_on_two_lines_is_checked_and_bought_once(self) -> None:
        part_id = self.part("Kemet", "C0402-100N", watch=True)
        self.offer(part_id, "MOUSER-1", stock=500, price="0.05")
        lines = [
            {"key": "named", "manufacturer": "Kemet", "mpn": "C0402-100N", "quantity": 44},
            {"key": "blank", "manufacturer": "", "mpn": "C0402-100N", "quantity": 4},
        ]
        data = self.lookup(lines, build=10)
        named, blank = data["lines"]["named"], data["lines"]["blank"]
        self.assertEqual((named["need"], blank["need"], named["part_need"], blank["part_need"]), (440, 40, 480, 480))
        self.assertEqual((named["short"], blank["short"]), (False, False), "480 needed, 500 in stock")
        self.assertEqual((named["buy"]["quantity"], named["buy"]["extended"]), (480, "24"), "bought once, for both lines")
        self.assertEqual((blank["buy"], blank["bought_with"], named["bought_with"]), (None, "named", None))
        rollup = data["rollup"]
        self.assertEqual((rollup["lines"], rollup["tracked"], rollup["parts"], rollup["priced"], rollup["lines_priced"]), (2, 2, 1, 1, 2))
        self.assertEqual((rollup["cost_build"], rollup["can_build"], rollup["limited_by"]), ("24.00", 10, "named"),
                         "500 pieces at 48 a board: ten boards, not eleven")

    def test_two_lines_that_together_exceed_the_stock_are_short_though_each_alone_is_not(self) -> None:
        part_id = self.part("Kemet", "C0402-100N")
        self.offer(part_id, "A", stock=450)
        lines = [
            {"key": "named", "manufacturer": "Kemet", "mpn": "C0402-100N", "quantity": 44},
            {"key": "blank", "manufacturer": "", "mpn": "C0402-100N", "quantity": 4},
        ]
        data = self.lookup(lines, build=10)
        self.assertEqual((data["lines"]["named"]["short"], data["lines"]["blank"]["short"], data["rollup"]["short"]), (True, True, 1))

    def test_a_projects_bom_is_priced_for_its_usual_build_and_spares_unless_asked_otherwise(self) -> None:
        part_id = self.part("Acme", "BUILD-1", watch=True)
        self.offer(part_id, "B1", stock=5000)
        line = [{"key": "k", "manufacturer": "Acme", "mpn": "BUILD-1", "quantity": 2}]
        usual = {"build_quantity": 10, "spares": "5"}
        with mock.patch("app.api.supply_bom.get_project_for_role_or_404"), \
                mock.patch("app.services.supply.project_supply.tracking.tracked_project", return_value=usual):
            found = self.call("/api/supply/bom/lookup", {"project_id": "prj_1", "lines": line}).json
            asked = self.call("/api/supply/bom/lookup", {"project_id": "prj_1", "lines": line, "build_quantity": 3, "attrition_percent": 0}).json
        self.assertEqual((found["build_quantity"], found["attrition_percent"]), (10, 5.0))
        self.assertEqual((asked["build_quantity"], asked["attrition_percent"]), (3, 0))
        alone = self.call("/api/supply/bom/lookup", {"lines": line}).json
        self.assertEqual((alone["build_quantity"], alone["attrition_percent"]), (1, 0.0), "no project: one board, the workspace's spares")

    def test_requests_are_checked(self) -> None:
        for body in ({"lines": [], "build_quantity": 0}, {"lines": [{"key": "a", "quantity": 0}]},
                     {"lines": [{"key": "", "mpn": "x"}]}, {"lines": [{"key": "a", "owner": "mallory"}]}):
            self.assertEqual(self.call("/api/supply/bom/lookup", body).status, 422, body)
        too_many = [{"key": str(index), "mpn": "x"} for index in range(2001)]
        self.assertEqual(self.call("/api/supply/bom/lookup", {"lines": too_many}).status, 422)
        self.assertEqual(self.lookup([])["rollup"]["lines"], 0)

    def test_who_may_look_up(self) -> None:
        for role in ("admin", "designer", "qa"):
            self.assertEqual(self.call("/api/supply/bom/lookup", {"lines": []}, role=role).status, 200, role)
        self.assertEqual(self.call("/api/supply/bom/lookup", {"lines": []}, role="viewer").status, 403)

    # --- watching the lines -----------------------------------------------

    def test_watching_the_lines_adds_each_distinct_part_once_and_says_what_it_skipped(self) -> None:
        self.part("Acme", "ALREADY", watch=True)
        lines = [
            {"key": "1", "manufacturer": "Acme", "mpn": "NEW-1"},
            {"key": "2", "manufacturer": "acme", "mpn": "new1"},
            {"key": "3", "manufacturer": "Acme", "mpn": "ALREADY"},
            {"key": "4", "manufacturer": "", "mpn": "NO-MAKER"},
            {"key": "5", "manufacturer": "Acme", "mpn": ""},
        ]
        data = self.call("/api/supply/bom/watch", {"lines": lines}).json
        self.assertEqual((data["watched"], data["already_watched"]), (2, 1), "a line with no maker is watched too: its maker is settled later")
        self.assertEqual(data["skipped"], [{"key": "5", "reason": "no_mpn"}])
        self.assertEqual(self.rows("SELECT COUNT(*) AS n FROM supply_watches")[0]["n"], 3)
        again = self.call("/api/supply/bom/watch", {"lines": lines}).json
        self.assertEqual((again["watched"], again["already_watched"]), (0, 3))

    def test_an_lcsc_number_on_the_line_is_linked_when_watched_and_then_resolves_the_line(self) -> None:
        lcsc = self.connectors.create(actor=SEED, provider="lcsc", currency="USD", display_name="LCSC")["id"]
        self.part("Texas Instruments", "LM358DR")
        data = self.call("/api/supply/bom/watch", {"lines": [
            {"key": "1", "manufacturer": "Texas Instruments", "mpn": "LM358DR", "lcsc": "C5423"},
        ]}).json
        self.assertEqual((data["watched"], data["lcsc_linked"]), (1, 1))
        (listing,) = self.rows("SELECT connector_id, sku, match_state, matched_by FROM supply_listings")
        self.assertEqual(dict(listing), {"connector_id": lcsc, "sku": "C5423", "match_state": "manual", "matched_by": "bom"})
        again = self.call("/api/supply/bom/watch", {"lines": [{"key": "1", "manufacturer": "Texas Instruments", "mpn": "LM358DR", "lcsc": "C5423"}]}).json
        self.assertEqual(again["lcsc_linked"], 0, "a number already linked is left alone")
        # A line with only the LCSC number, or a part number nobody knows, is still that part.
        result = self.lookup([
            {"key": "only", "manufacturer": "", "mpn": "", "lcsc": "C5423"},
            {"key": "odd", "manufacturer": "TI", "mpn": "LM358DR-ODD", "lcsc": "C5423"},
            {"key": "other", "manufacturer": "", "mpn": "", "lcsc": "C1"},
        ])["lines"]
        self.assertEqual((result["only"]["state"], result["only"]["manufacturer_match"]), ("tracked", "lcsc"))
        self.assertEqual(result["odd"]["state"], "tracked")
        self.assertEqual(result["other"]["state"], "no_mpn")

    def test_an_lcsc_number_must_look_like_one(self) -> None:
        response = self.call("/api/supply/bom/lookup", {"lines": [{"key": "1", "mpn": "X", "lcsc": "7950"}]})
        self.assertEqual(response.status, 422)

    def rows(self, sql: str, *params):
        with self.store.connection() as conn:
            return conn.execute(sql, params).fetchall()

    def test_a_designer_can_watch_a_maker_prism_does_not_know_yet_and_it_starts_provisional(self) -> None:
        lines = [{"key": "1", "manufacturer": "Brand New Maker", "mpn": "BN-1"}]
        done = self.call("/api/supply/bom/watch", {"lines": lines}, role="designer").json
        self.assertEqual((done["watched"], done["skipped"]), (1, []))
        self.assertEqual(self.rows("SELECT provisional FROM supply_manufacturers WHERE name = 'Brand New Maker'"), [{"provisional": True}])
        again = self.call("/api/supply/bom/watch", {"lines": [{"key": "1", "manufacturer": "brand new maker", "mpn": "BN-1"},
                                                              {"key": "2", "manufacturer": "Brand New Maker", "mpn": "BN-2"}]}, role="designer").json
        self.assertEqual((again["watched"], again["already_watched"]), (1, 1))

    def test_who_may_watch_and_how_many_at_once(self) -> None:
        self.assertEqual(self.call("/api/supply/bom/watch", {"lines": []}, role="viewer").status, 403)
        for role in ("qa", "designer", "admin"):
            self.assertEqual(self.call("/api/supply/bom/watch", {"lines": []}, role=role).status, 200, role)
        self.assertEqual(self.call("/api/supply/bom/watch", {"lines": [{"key": str(i), "mpn": "x"} for i in range(201)]}).status, 422)

    def test_lines_are_tracked_at_the_tier_asked_after_a_preview_that_changes_nothing(self) -> None:
        lines = [{"key": "a", "manufacturer": "Acme", "mpn": "T-1"}]
        preview = self.call("/api/supply/bom/watch/preview", {"lines": lines, "tier": 1})
        self.assertEqual(preview.status, 200, preview.text)
        self.assertEqual(preview.json["watched"]["watched"], 1)
        self.assertEqual(self.rows("SELECT 1 FROM supply_watches"), [])
        done = self.call("/api/supply/bom/watch", {"lines": lines, "tier": 1})
        self.assertEqual((done.status, done.json["watched"]), (200, 1))
        self.assertEqual([(r["tier"], r["rate"]) for r in self.rows("SELECT tier, rate FROM supply_watches")], [(1, "daily")])
        self.assertEqual(self.call("/api/supply/bom/watch", {"lines": lines, "tier": 3}).status, 422)
        self.assertEqual(self.call("/api/supply/bom/watch", {"lines": lines, "tier": 2, "rate": "daily"}).status, 422)


if __name__ == "__main__":
    unittest.main()
