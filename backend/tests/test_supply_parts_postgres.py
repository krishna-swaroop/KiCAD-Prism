"""Manufacturer aliases, parts, and discovery with its match states.

The alias key tests need nothing. The rest need ``PRISM_DATABASE_URL`` and use a
disposable schema.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.identity import alias_key  # noqa: E402
from app.services.supply.models import PartMatch  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
HEADER = "sku,mpn,manufacturer,stock"
ACTOR = "ana@example.com"


class AliasKeyTests(unittest.TestCase):
    def test_spellings_of_one_manufacturer_share_a_key(self) -> None:
        same = ["Texas Instruments", "TEXAS INSTRUMENTS", "Texas Instruments Inc.", " texas   instruments, inc ",
                "Texas Instruments Incorporated"]
        self.assertEqual({alias_key(name) for name in same}, {"texas instruments"})
        self.assertEqual(alias_key("Analog Devices, Inc."), alias_key("ANALOG DEVICES"))
        self.assertEqual(alias_key("Murata Manufacturing Co., Ltd."), "murata manufacturing")

    def test_abbreviations_are_not_guessed(self) -> None:
        self.assertNotEqual(alias_key("TI"), alias_key("Texas Instruments"))
        self.assertNotEqual(alias_key("ST"), alias_key("STMicroelectronics"))

    def test_punctuation_and_ampersands(self) -> None:
        self.assertEqual(alias_key("A&B Corp"), "a and b")
        self.assertEqual(alias_key("Wurth-Elektronik"), "wurth elektronik")
        self.assertEqual(alias_key("Tyco Electronics"), "tyco electronics")

    def test_a_name_that_is_only_a_legal_form_is_kept(self) -> None:
        self.assertEqual(alias_key("Inc"), "inc")
        self.assertEqual(alias_key("Co Ltd"), "co")

    def test_blank_input(self) -> None:
        self.assertEqual(alias_key(""), "")
        self.assertEqual(alias_key("  . "), "")
        self.assertEqual(alias_key(None), "")  # type: ignore[arg-type]


class StubProvider:
    """Returns whatever matches it is given."""

    def __init__(self, *matches: PartMatch) -> None:
        self.matches = list(matches)
        self.calls: list[tuple[str, str | None]] = []

    def lookup_mpn(self, mpn, manufacturer=None):
        self.calls.append((mpn, manufacturer))
        return list(self.matches)

    def get_offers(self, skus):
        return []

    def get_part_data(self, match):
        raise NotImplementedError


def match(sku: str, mpn: str, manufacturer: str) -> PartMatch:
    return PartMatch("stub", sku, mpn, manufacturer)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class PartsAndDiscoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, parts
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.csv_import_service import CsvImportService
        from app.services.supply.providers.base import ProviderConfig
        from app.services.supply.providers.csv_provider import CsvProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.discovery, cls.parts = database, discovery, parts
        cls.ProviderConfig, cls.CsvProvider = ProviderConfig, CsvProvider
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_parts_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.imports = CsvImportService(cls.connectors, cls.store)

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_listings")
            conn.execute("DELETE FROM supply_parts")
            conn.execute("DELETE FROM supply_manufacturer_aliases")
            conn.execute("DELETE FROM supply_manufacturers")
            conn.execute("DELETE FROM supply_connectors")
            conn.execute("DELETE FROM supply_audit_events")
        self.connector_id = self.connectors.create(actor=ACTOR, provider="fake")["id"]

    # --- helpers ----------------------------------------------------------

    def part(self, manufacturer: str = "Texas Instruments", mpn: str = "LM358D"):
        with self.store.connection() as conn:
            return self.parts.ensure_part(conn, manufacturer, mpn, ACTOR)

    def discover(self, part, *matches: PartMatch):
        service = self.discovery.DiscoveryService(lambda _id: StubProvider(*matches), self.store)
        return service.discover(part.id, self.connector_id)

    def listings(self) -> dict[str, dict]:
        with self.store.connection() as conn:
            rows = conn.execute("SELECT * FROM supply_listings ORDER BY sku").fetchall()
        return {row["sku"]: dict(row) for row in rows}

    def wait_on_spelling(self, key: str) -> None:
        """The state the listings of an earlier version were left in: waiting on a spelling nobody had mapped."""

        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET match_state = 'manufacturer_unresolved' WHERE lower(raw_manufacturer) = %s", (key,))
            conn.execute(
                "INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, status) VALUES (%s, %s, 'pending') ON CONFLICT DO NOTHING", (key, key.upper())
            )

    def audit(self, action: str) -> int:
        with self.store.connection() as conn:
            return conn.execute("SELECT COUNT(*) AS n FROM supply_audit_events WHERE action = %s", (action,)).fetchone()["n"]

    # --- parts ------------------------------------------------------------

    def test_spellings_and_formats_of_one_part_are_one_part(self) -> None:
        first = self.part("Texas Instruments", "LM358-D")
        second = self.part("TEXAS INSTRUMENTS INC.", "lm358d")
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.mpn, "LM358-D", "the first spelling is kept for display")
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_manufacturers").fetchone()["n"], 1)
        self.assertEqual(self.audit("part.create"), 1)

    def test_the_same_number_from_two_known_manufacturers_is_two_parts(self) -> None:
        first = self.part("Texas Instruments", "LM358D")
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Onsemi", ACTOR)
        self.assertNotEqual(first.id, self.part("Onsemi", "LM358D").id)

    def test_an_unknown_spelling_of_a_number_one_part_has_is_that_part_and_two_makers_need_a_choice(self) -> None:
        first = self.part("Texas Instruments", "LM358D")
        again = self.part("Some Unlisted Name", "LM358D")
        self.assertEqual(first.id, again.id)
        with self.store.connection() as conn:
            self.assertIn("some unlisted name", self.parts.part_spelling_keys(conn, first.id))
            self.parts.ensure_manufacturer(conn, "Onsemi", ACTOR)
            self.parts.ensure_part(conn, "Onsemi", "LM358D", ACTOR)
            with self.assertRaises(self.parts.AmbiguousNumber):
                self.parts.ensure_part(conn, "Another Name", "LM358D", ACTOR)

    def test_a_line_with_no_maker_makes_a_part_nobody_has_settled(self) -> None:
        made = self.part("", "ZZ-9")
        self.assertTrue(made.provisional)
        self.assertEqual(made.manufacturer_name, "Not known yet")
        self.assertEqual(self.part("", "ZZ9").id, made.id)
        named = self.part("Brand New Maker", "QQ-1")
        self.assertTrue(named.provisional)

    def test_a_part_needs_a_manufacturer_a_number_and_an_actor(self) -> None:
        with self.store.connection() as conn:
            for call in (
                lambda: self.parts.ensure_part(conn, "Acme", " - ", ACTOR),
                lambda: self.parts.ensure_part(conn, "Acme", "X1", " "),
            ):
                with self.assertRaises(ValueError):
                    call()
            with self.assertRaises(self.parts.PartNotFound):
                self.parts.get_part(conn, "missing")

    def test_spellings_are_placed_by_maker_and_nothing_is_queued(self) -> None:
        self.part()
        with self.store.connection() as conn:
            known = self.parts.resolve_manufacturer(conn, "texas instruments inc")
            same = self.parts.resolve_manufacturer(conn, "TI", provider="mouser")
            other = self.parts.resolve_manufacturer(conn, "UMW", provider="digikey")
            blank = self.parts.resolve_manufacturer(conn, " . ")
            pending = self.parts.pending_aliases(conn)
        self.assertEqual((known.status, same.status, other.status, blank.status), ("confirmed", "confirmed", "pending", "blank"))
        self.assertEqual(pending, [], "a spelling Prism cannot place is not stored; the part it appears for decides")

    # --- discovery --------------------------------------------------------

    def test_matching_number_and_manufacturer_is_exact(self) -> None:
        part = self.part()
        result = self.discover(part, match("S1", "lm358-d", "Texas Instruments Inc."))
        self.assertEqual((result.exact, result.unresolved, result.near, result.total), (1, 0, 0, 1))
        listing = self.listings()["S1"]
        self.assertEqual((listing["match_state"], listing["part_id"]), ("exact", part.id))

    def test_the_provider_is_asked_with_the_parts_own_spelling(self) -> None:
        part = self.part("Texas Instruments", "LM358-D")
        stub = StubProvider()
        self.discovery.DiscoveryService(lambda _id: stub, self.store).discover(part.id, self.connector_id)
        self.assertEqual(stub.calls, [("LM358-D", "Texas Instruments")])

    def test_another_makers_listing_of_the_number_is_kept_but_does_not_count(self) -> None:
        part = self.part()
        result = self.discover(part, match("S1", "LM358D", "UMW"))
        self.assertEqual((result.exact, result.near), (0, 1))
        self.assertEqual(self.listings()["S1"]["match_state"], "near")

    def test_a_spelling_of_the_same_maker_counts_at_once_and_the_part_remembers_it(self) -> None:
        part = self.part()
        result = self.discover(part, match("S1", "LM358D", "TI"), match("S2", "LM358D", "ti"))
        self.assertEqual((result.exact, result.near), (2, 0))
        self.assertEqual({sku: row["match_state"] for sku, row in self.listings().items()}, {"S1": "exact", "S2": "exact"})
        with self.store.connection() as conn:
            self.assertIn("ti", self.parts.part_spelling_keys(conn, part.id))

    def test_confirming_the_spelling_promotes_waiting_listings(self) -> None:
        part = self.part()
        self.discover(part, match("S1", "LM358D", "UMW"), match("S2", "LM358D", "umw"))
        self.wait_on_spelling("umw")
        with self.store.connection() as conn:
            moved = self.parts.confirm_alias(conn, "umw", part.manufacturer_id, "ben@example.com")
            self.assertEqual(self.parts.pending_aliases(conn), [])
        self.assertEqual(moved, 2)
        self.assertEqual({sku: row["match_state"] for sku, row in self.listings().items()}, {"S1": "exact", "S2": "exact"}, "both count now")
        self.assertEqual(self.listings()["S1"]["matched_by"], "ben@example.com")
        self.assertEqual(self.audit("alias.confirm"), 1)

    def test_confirming_to_another_manufacturer_makes_the_listing_near(self) -> None:
        part = self.part("Texas Instruments", "LM358D")
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Onsemi", ACTOR)
        other = self.part("Onsemi", "XYZ1")
        self.discover(part, match("S1", "LM358D", "UMW"))
        self.wait_on_spelling("umw")
        with self.store.connection() as conn:
            self.parts.confirm_alias(conn, "umw", other.manufacturer_id, ACTOR)
        listing = self.listings()["S1"]
        self.assertEqual(listing["match_state"], "near")
        self.assertEqual(listing["match_reason"], "same part number, different manufacturer")

    def test_alias_errors(self) -> None:
        part = self.part()
        self.wait_on_spelling("ti")
        with self.store.connection() as conn:
            for key, manufacturer in (("nope", part.manufacturer_id), ("ti", "missing"), ("texas instruments", part.manufacturer_id)):
                with self.assertRaises(self.parts.AliasError, msg=key):
                    self.parts.confirm_alias(conn, key, manufacturer, ACTOR)

    def test_a_different_part_number_or_manufacturer_is_near(self) -> None:
        part = self.part()
        self.part("Onsemi", "XYZ1")  # a manufacturer Prism already knows
        result = self.discover(part, match("S1", "LM358DR", "Texas Instruments"), match("S2", "LM358D", "Onsemi"))
        self.assertEqual((result.exact, result.near), (0, 2))
        found = self.listings()
        self.assertEqual(found["S1"]["match_reason"], "longer number")
        self.assertEqual(found["S2"]["match_reason"], "same part number, different manufacturer")

    def test_rediscovery_is_idempotent_and_upgrades_waiting_listings(self) -> None:
        part = self.part()
        self.discover(part, match("S1", "LM358D", "TI"))
        before = self.listings()["S1"]
        self.discover(part, match("S1", "LM358D", "TI"))
        self.assertEqual(len(self.listings()), 1)
        self.assertGreater(self.listings()["S1"]["last_seen_at"], before["last_seen_at"])
        # The spelling is now known by being typed as a part's manufacturer.
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "TI", ACTOR)
        self.discover(part, match("S1", "LM358D", "Texas Instruments"))
        self.assertEqual(self.listings()["S1"]["match_state"], "exact")

    def test_exact_is_not_downgraded_by_a_search_for_another_part(self) -> None:
        a = self.part("Texas Instruments", "LM358D")
        b = self.part("Texas Instruments", "LM358DR")
        self.discover(a, match("S1", "LM358D", "Texas Instruments"))
        self.discover(b, match("S1", "LM358D", "Texas Instruments"))
        listing = self.listings()["S1"]
        self.assertEqual((listing["match_state"], listing["part_id"]), ("exact", a.id))

    def test_a_listing_that_reappears_is_matched_again(self) -> None:
        part = self.part()
        self.discover(part, match("S1", "LM358D", "Texas Instruments"))
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET match_state = 'gone' WHERE sku = 'S1'")
        self.discover(part, match("S1", "LM358D", "Texas Instruments"))
        self.assertEqual(self.listings()["S1"]["match_state"], "exact")

    # --- review actions ---------------------------------------------------

    def test_a_pinned_listing_counts_and_discovery_leaves_it_alone(self) -> None:
        part = self.part()
        self.discover(part, match("S1", "LM358DR", "Texas Instruments"))
        listing_id = self.listings()["S1"]["id"]
        with self.store.connection() as conn:
            self.discovery.pin_listing(conn, listing_id, part.id, "ben@example.com")
        self.discover(part, match("S1", "LM358DR", "Texas Instruments"))
        self.assertEqual(self.listings()["S1"]["match_state"], "manual")
        self.assertEqual(self.audit("listing.pin"), 1)

    def test_a_rejected_listing_stays_rejected(self) -> None:
        part = self.part()
        self.discover(part, match("S1", "LM358D", "Texas Instruments"))
        with self.store.connection() as conn:
            self.discovery.reject_listing(conn, self.listings()["S1"]["id"], "ben@example.com")
        self.discover(part, match("S1", "LM358D", "Texas Instruments"))
        listing = self.listings()["S1"]
        self.assertEqual((listing["match_state"], listing["matched_by"]), ("rejected", "ben@example.com"))

    def test_review_actions_check_their_targets(self) -> None:
        part = self.part()
        with self.store.connection() as conn:
            with self.assertRaises(self.discovery.ListingNotFound):
                self.discovery.pin_listing(conn, "missing", part.id, ACTOR)
            with self.assertRaises(self.discovery.ListingNotFound):
                self.discovery.reject_listing(conn, "missing", ACTOR)
            self.discover(part, match("S1", "LM358D", "Texas Instruments"))
            with self.assertRaises(self.parts.PartNotFound):
                self.discovery.pin_listing(conn, self.listings()["S1"]["id"], "missing", ACTOR)
            with self.assertRaises(ValueError):
                self.discovery.reject_listing(conn, self.listings()["S1"]["id"], "")

    # --- with a real provider ---------------------------------------------

    def test_discovery_against_an_uploaded_file(self) -> None:
        csv_id = self.connectors.create(actor=ACTOR, provider="csv")["id"]
        text = (f"{HEADER}\nA1,LM358-D,Texas Instruments Inc.,10\nB1,LM358D,TI,5\nC1,LM358D,Onsemi,7\nD1,LM358DR,Texas Instruments,9\n")
        self.imports.import_file(csv_id, text.encode(), actor=ACTOR, filename="list.csv")
        part = self.part("Texas Instruments", "LM358D")
        self.part("Onsemi", "XYZ1")
        provider = self.CsvProvider(self.ProviderConfig(connector_id=csv_id), store=self.store)
        result = self.discovery.DiscoveryService(lambda _id: provider, self.store).discover(part.id, csv_id)
        # The file lookup is by part number key: LM358DR is a different number and is never returned.
        self.assertEqual((result.exact, result.unresolved, result.near), (2, 0, 1))
        states = {sku: row["match_state"] for sku, row in self.listings().items()}
        self.assertEqual(states, {"A1": "exact", "B1": "exact", "C1": "near"})

    def test_deleting_a_connector_removes_its_listings_but_not_the_part(self) -> None:
        part = self.part()
        self.discover(part, match("S1", "LM358D", "Texas Instruments"))
        self.connectors.delete(self.connector_id, actor=ACTOR)
        self.assertEqual(self.listings(), {})
        with self.store.connection() as conn:
            self.assertEqual(self.parts.get_part(conn, part.id).id, part.id)


if __name__ == "__main__":
    unittest.main()
