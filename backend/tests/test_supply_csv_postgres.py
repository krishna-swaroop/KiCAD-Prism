"""Uploaded offers: import, replace, reject, clear, and the provider that reads them.

Needs ``PRISM_DATABASE_URL``. Uses a disposable schema.
"""

from __future__ import annotations

import os
import sys
import time
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

HEADER = "sku,mpn,manufacturer,stock"


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SupplyCsvDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import csv_format
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.csv_import_service import CsvImportService
        from app.services.supply.providers.base import ProviderConfig
        from app.services.supply.providers.csv_provider import CsvProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database = database
        cls.csv_format = csv_format
        cls.ProviderConfig = ProviderConfig
        cls.CsvProvider = CsvProvider
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_csv_test_{uuid.uuid4().hex[:8]}"})()
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
            conn.execute("DELETE FROM supply_connectors")
            conn.execute("DELETE FROM supply_audit_events")

    def _connector(self, **overrides):
        values = dict(actor="ana@example.com", provider="csv")
        values.update(overrides)
        return self.connectors.create(**values)

    def _provider(self, connector_id: str, *, provider_key: str = "csv", marketplace: bool = False):
        return self.CsvProvider(
            self.ProviderConfig(connector_id=connector_id), store=self.store, provider_key=provider_key, marketplace=marketplace,
        )

    def _import(self, connector_id: str, text: str, **kwargs):
        return self.imports.import_file(connector_id, text.encode("utf-8"), actor="ana@example.com", **kwargs)

    def _audit_actions(self) -> list[str]:
        with self.store.connection() as conn:
            return [r["action"] for r in conn.execute("SELECT action FROM supply_audit_events ORDER BY id").fetchall()]

    # --- import and read back --------------------------------------------

    def test_import_then_the_provider_returns_what_the_file_said(self) -> None:
        connector = self._connector()
        info, _ = self._import(connector["id"], self.csv_format.TEMPLATE, filename="stock.csv")
        self.assertEqual((info.filename, info.imported_by, info.row_count), ("stock.csv", "ana@example.com", 1))

        provider = self._provider(connector["id"])
        (match,) = provider.lookup_mpn("abc 123")
        self.assertEqual((match.provider, match.sku, match.mpn, match.manufacturer), ("csv", "EXAMPLE-1", "ABC123", "Acme"))
        (offer,) = provider.get_offers(["EXAMPLE-1", "missing"])
        self.assertEqual((offer.stock, offer.currency, offer.moq), (1200, "EUR", 1))
        self.assertEqual([(b.quantity, b.unit_price) for b in offer.price_breaks],
                         [(1, Decimal("0.52")), (10, Decimal("0.44")), (100, Decimal("0.31"))])
        self.assertEqual(offer.fetched_at, info.imported_at, "the data is as old as the upload")
        self.assertEqual(provider.get_part_data(match).match, match)

    def test_connector_response_reports_the_import(self) -> None:
        connector = self._connector()
        self.assertIsNone(connector["csv_import"])
        self.assertFalse(connector["metered"])
        self.assertTrue(connector["csv_fed"])
        self._import(connector["id"], self.csv_format.TEMPLATE, filename="stock.csv")
        shown = self.connectors.get(connector["id"])["csv_import"]
        self.assertEqual((shown["filename"], shown["row_count"], shown["imported_by"]), ("stock.csv", 1, "ana@example.com"))
        listed = self.connectors.list()[0]["csv_import"]
        self.assertEqual(listed["filename"], "stock.csv")
        self.assertEqual(self.connectors.get(connector["id"])["last_error_code"], "")

    def test_an_import_replaces_the_previous_one(self) -> None:
        connector = self._connector()
        self._import(connector["id"], f"{HEADER}\nOLD-1,M1,Acme,5\nOLD-2,M2,Acme,6")
        self._import(connector["id"], f"{HEADER}\nNEW-1,M3,Acme,7")
        provider = self._provider(connector["id"])
        self.assertEqual(provider.get_offers(["OLD-1", "OLD-2"]), [])
        self.assertEqual([o.sku for o in provider.get_offers(["NEW-1"])], ["NEW-1"])
        self.assertEqual(self.connectors.get(connector["id"])["csv_import"]["row_count"], 1)

    def test_a_new_file_or_a_cleared_one_makes_the_connectors_listings_due_now(self) -> None:
        connector = self._connector()
        self._import(connector["id"], f"{HEADER}\nOLD-1,M1,Acme,5")
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, raw_mpn, raw_manufacturer, match_state) VALUES ('lst-csv', %s, 'OLD-1', 'M1', 'Acme', 'exact')",
                (connector["id"],),
            )
            conn.execute("INSERT INTO supply_poll_state (listing_id, tier, next_poll_at) VALUES ('lst-csv', 'monthly', NOW() + INTERVAL '30 days')")

        def due() -> bool:
            with self.store.connection() as conn:
                # On the app's clock, the one supply writes with (``clock.py``), not the database's.
                return conn.execute("SELECT next_poll_at <= %s AS due FROM supply_poll_state WHERE listing_id = 'lst-csv'",
                                    (datetime.now(timezone.utc),)).fetchone()["due"]

        self.assertFalse(due())
        self._import(connector["id"], f"{HEADER}\nOLD-1,M1,Acme,9")
        self.assertTrue(due(), "the old offer is read again from the new file, not a month later")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_poll_state SET next_poll_at = NOW() + INTERVAL '30 days' WHERE listing_id = 'lst-csv'")
        self.imports.clear(connector["id"], actor="ana@example.com")
        self.assertTrue(due(), "and when the file is removed")

    def test_a_rejected_file_changes_nothing(self) -> None:
        from app.services.supply.csv_import_service import CsvRejected

        connector = self._connector()
        self._import(connector["id"], f"{HEADER}\nKEEP-1,M1,Acme,5")
        before = self._audit_actions()
        with self.assertRaises(CsvRejected) as raised:
            self._import(connector["id"], f"{HEADER}\nBAD-1,M2,Acme,oops")
        self.assertEqual(raised.exception.parsed.errors[0].column, "stock")
        self.assertEqual([o.sku for o in self._provider(connector["id"]).get_offers(["KEEP-1", "BAD-1"])], ["KEEP-1"])
        self.assertEqual(self._audit_actions(), before)

    def test_the_connector_currency_fills_a_missing_column(self) -> None:
        connector = self._connector(currency="gbp")
        self._import(connector["id"], f"{HEADER},price_1\nS1,M1,Acme,5,0.50")
        (offer,) = self._provider(connector["id"]).get_offers(["S1"])
        self.assertEqual((offer.currency, offer.price_breaks[0].unit_price), ("GBP", Decimal("0.50")))

    def test_lookup_ignores_case_and_dashes_and_only_ranks_by_manufacturer(self) -> None:
        connector = self._connector()
        self._import(connector["id"], f"{HEADER}\nA,LM358-D,TI,1\nB,LM358D,Onsemi,1\nC,LM358DR,TI,1")
        provider = self._provider(connector["id"])
        self.assertEqual([m.sku for m in provider.lookup_mpn("lm358d")], ["A", "B"])
        self.assertEqual([m.sku for m in provider.lookup_mpn("LM358-D", "ti")], ["A", "B"])
        self.assertEqual([m.sku for m in provider.lookup_mpn("LM358-D", "ON Semi")], ["A", "B"], "unknown hint ranks nothing")
        self.assertEqual([m.sku for m in provider.lookup_mpn("LM358-D", "onsemi")], ["B", "A"])
        self.assertEqual([m.sku for m in provider.lookup_mpn("LM358-D", "Other")], ["A", "B"], "never excludes")
        self.assertEqual(provider.lookup_mpn("  "), [])

    def test_optional_fields_round_trip(self) -> None:
        from app.services.supply.vocabulary import Lifecycle, Packaging

        connector = self._connector()
        text = (f"{HEADER},packaging,lifecycle,discontinued,rohs,product_url,incoming_qty,incoming_date,lead_time_days,"
                "moq,order_multiple\nS1,M1,Acme,0,reel,nrnd,yes,no,https://example.com/p,500,2026-04-01,84,1000,1000")
        self._import(connector["id"], text)
        (offer,) = self._provider(connector["id"]).get_offers(["S1"])
        self.assertEqual((offer.packaging, offer.lifecycle, offer.discontinued, offer.rohs),
                         (Packaging.TAPE_REEL, Lifecycle.NRND, True, False))
        self.assertEqual((offer.lead_time_days, offer.moq, offer.order_multiple, offer.product_url),
                         (84, 1000, 1000, "https://example.com/p"))
        self.assertEqual((offer.incoming[0].quantity, str(offer.incoming[0].expected)), (500, "2026-04-01"))

    # --- guards -----------------------------------------------------------

    def test_a_csv_fed_distributor_takes_its_own_offers_file(self) -> None:
        for provider in ("lcsc", "jlcpcb"):
            connector = self._connector(provider=provider)
            info, _ = self._import(connector["id"], f"{HEADER}\nS1,M1,Acme,5")
            self.assertEqual(info.row_count, 1, provider)
            self.assertTrue(self.connectors.get(connector["id"])["csv_fed"], provider)

    def test_an_lcsc_upload_keeps_lcsc_as_the_provider(self) -> None:
        connector = self._connector(provider="lcsc")
        self._import(connector["id"], f"{HEADER}\nC1,M1,Acme,5")
        provider = self._provider(connector["id"], provider_key="lcsc")
        (match,) = provider.lookup_mpn("M1")
        self.assertEqual(match.provider, "lcsc")
        (offer,) = provider.get_offers(["C1"])
        self.assertEqual(offer.provider, "lcsc")
        self.assertFalse(offer.marketplace)

    def test_a_jlcpcb_upload_is_marketplace_with_its_library_class_as_facts(self) -> None:
        connector = self._connector(provider="jlcpcb")
        text = f"{HEADER},jlc_library,jlc_preferred\nC1,M1,Acme,5,Extended,yes\nC2,M2,Acme,9,Basic,no\n"
        self._import(connector["id"], text)
        provider = self._provider(connector["id"], provider_key="jlcpcb", marketplace=True)
        offers = {offer.sku: offer for offer in provider.get_offers(["C1", "C2"])}
        self.assertTrue(all(offer.marketplace for offer in offers.values()))
        self.assertEqual(offers["C1"].facts, (("jlc_library", "Extended"), ("jlc_preferred", "Preferred")))
        self.assertEqual(offers["C2"].facts, (("jlc_library", "Basic"),))

    def test_only_csv_fed_connectors_take_a_file(self) -> None:
        from app.services.supply.connectors import ConnectorError, ConnectorNotFound

        fake = self.connectors.create(actor="ana@example.com", provider="fake")
        with self.assertRaises(ConnectorError) as raised:
            self._import(fake["id"], self.csv_format.TEMPLATE)
        self.assertEqual(raised.exception.code, "not_csv")
        with self.assertRaises(ConnectorNotFound):
            self._import("missing", self.csv_format.TEMPLATE)
        with self.assertRaises(ValueError):
            self.imports.import_file(fake["id"], b"", actor=" ")

    def test_clear_removes_offers_and_the_import_record(self) -> None:
        connector = self._connector()
        self._import(connector["id"], self.csv_format.TEMPLATE)
        self.imports.clear(connector["id"], actor="ben@example.com")
        self.assertEqual(self._provider(connector["id"]).get_offers(["EXAMPLE-1"]), [])
        self.assertIsNone(self.connectors.get(connector["id"])["csv_import"])
        self.assertEqual(self._audit_actions()[-2:], ["connector.csv_import", "connector.csv_clear"])

    def test_deleting_the_connector_removes_its_data(self) -> None:
        connector = self._connector()
        self._import(connector["id"], self.csv_format.TEMPLATE)
        self.connectors.delete(connector["id"], actor="ana@example.com")
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_csv_offers").fetchone()["n"], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_csv_imports").fetchone()["n"], 0)

    def test_a_provider_only_sees_its_own_connectors_data(self) -> None:
        connector = self._connector()
        self._import(connector["id"], f"{HEADER}\nS1,M1,Acme,5")
        self.assertEqual([o.sku for o in self._provider(connector["id"]).get_offers(["S1"])], ["S1"])
        self.assertEqual(self._provider("another-connector").get_offers(["S1"]), [])
        self.assertEqual(self._provider("another-connector").lookup_mpn("M1"), [])

    def test_a_large_file_imports_quickly(self) -> None:
        connector = self._connector()
        rows = "\n".join(f"SKU-{i},PART-{i},Acme,{i}" for i in range(5000))
        started = time.perf_counter()
        info, _ = self._import(connector["id"], f"{HEADER}\n{rows}")
        elapsed = time.perf_counter() - started
        self.assertEqual(info.row_count, 5000)
        self.assertLess(elapsed, 10, f"5,000 rows took {elapsed:.1f}s")
        provider = self._provider(connector["id"])
        self.assertEqual([m.sku for m in provider.lookup_mpn("part-4999")], ["SKU-4999"])


if __name__ == "__main__":
    unittest.main()
