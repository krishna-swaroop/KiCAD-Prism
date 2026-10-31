"""Exchange rates and what they do to a priced BOM. The parsing needs nothing; the rest needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import fx  # noqa: E402
from app.services.supply.providers.base import ProviderError  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 2, 12, 0, tzinfo=timezone.utc)
ECB = b"""<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
 <gesmes:subject>Reference rates</gesmes:subject>
 <Cube><Cube time="2026-03-02"><Cube currency="USD" rate="1.0800"/><Cube currency="GBP" rate="0.8500"/><Cube currency="JPY" rate="160.00"/></Cube></Cube>
</gesmes:Envelope>"""


class ParseAndConvertTests(unittest.TestCase):
    def test_the_ecb_file_gives_its_day_and_rates(self) -> None:
        day, rates = fx.parse_ecb(ECB)
        self.assertEqual((day, rates["USD"], rates["JPY"]), (date(2026, 3, 2), Decimal("1.0800"), Decimal("160.00")))

    def test_a_file_that_declares_entities_or_has_no_rates_is_refused(self) -> None:
        for body in (b'<!DOCTYPE x [<!ENTITY a "b">]><Cube/>', b"not xml", b"<Cube><Cube time='2026-03-02'/></Cube>"):
            with self.assertRaises(ProviderError):
                fx.parse_ecb(body)

    def test_amounts_convert_through_the_euro_and_unknown_currencies_do_not(self) -> None:
        rates = fx.Rates(date(2026, 3, 2), {"USD": Decimal("1.08"), "GBP": Decimal("0.85")})
        self.assertEqual(rates.convert(Decimal("10.80"), "USD", "EUR"), Decimal("10"))
        self.assertEqual(rates.convert(Decimal("10"), "EUR", "GBP"), Decimal("8.5"))
        self.assertEqual(rates.convert(Decimal("1.08"), "USD", "GBP").quantize(Decimal("0.01")), Decimal("0.85"))
        self.assertEqual(rates.convert(Decimal("5"), "SEK", "EUR"), None)
        self.assertEqual(rates.convert(Decimal("5"), "SEK", "SEK"), Decimal("5"))

    def test_rates_a_week_old_are_stale(self) -> None:
        self.assertTrue(fx.is_stale(fx.Rates(None, {}), date(2026, 3, 2)))
        self.assertTrue(fx.is_stale(fx.Rates(date(2026, 2, 20), {"USD": Decimal(1)}), date(2026, 3, 2)))
        self.assertFalse(fx.is_stale(fx.Rates(date(2026, 2, 28), {"USD": Decimal(1)}), date(2026, 3, 2)))


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class FxDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_bom, supply_connectors, supply_fx
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts = database, parts
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_fx_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_fx.router)
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
        with self.store.connection() as conn:
            for table in ("supply_fx_rates", "supply_settings", "supply_offers", "supply_listings", "supply_parts", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
            conn.execute("INSERT INTO supply_connectors (id, provider, storefront, display_name) VALUES ('c1', 'fake', 'EU', 'Eur shop'), ('c2', 'fake', 'US', 'Usd shop')")

    def call(self, method: str, path: str, *, role: str = "admin", body=None, query: str = ""):
        return _request(self.app, method, path, user=self.users[role], body=body, query=query)

    def test_a_fetch_stores_the_rates_and_a_second_one_within_a_day_does_nothing(self) -> None:
        client = SimpleNamespace(request=lambda method, url, **kw: SimpleNamespace(body=ECB))
        with self.store.connection() as conn:
            self.assertEqual(fx.refresh_from_ecb(conn, NOW, client), 3)
            self.assertEqual(fx.refresh_from_ecb(conn, NOW, client), 0, "fetched a moment ago")
            self.assertEqual(fx.latest(conn).per_eur["GBP"], Decimal("0.85000000"))

    def test_an_administrator_enters_rates_by_hand_and_others_may_not(self) -> None:
        body = {"day": "2026-03-01", "rates": {"usd": 1.1, "SEK": 11.2}}
        self.assertEqual(self.call("POST", "/api/supply/fx/rates", role="designer", body=body).status, 403)
        done = self.call("POST", "/api/supply/fx/rates", body=body)
        self.assertEqual((done.status, done.json["saved"], done.json["currencies"]), (200, 2, ["SEK", "USD"]))
        self.assertEqual(self.call("GET", "/api/supply/fx", role="qa").json["day"], "2026-03-01")
        self.assertEqual(self.call("POST", "/api/supply/fx/rates", body={"day": "2026-03-01", "rates": {"EUR": 1}}).status, 400)
        self.assertEqual(self.call("POST", "/api/supply/fx/rates", body={"day": "2099-01-01", "rates": {"USD": 1.1}}).status, 400)
        self.assertEqual(self.call("POST", "/api/supply/fx/rates", body={"day": "2026-03-01", "rates": {"USD": -1}}).status, 400)

    def offer(self, part_id: str, connector: str, sku: str, price: str, currency: str) -> None:
        listing_id = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')",
                (listing_id, connector, sku, part_id))
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, price_breaks, currency, moq) VALUES (%s, %s, 5000, %s::jsonb, %s, 1)",
                (listing_id, NOW, json.dumps([[1, price]]), currency))

    def lookup(self, lines):
        response = self.call("POST", "/api/supply/bom/lookup", body={"build_quantity": 10, "lines": lines})
        self.assertEqual(response.status, 200, response.text)
        return response.json

    def test_offers_in_two_currencies_are_compared_and_totalled_once_rates_are_known(self) -> None:
        with self.store.connection() as conn:
            one = self.parts.ensure_part(conn, "Acme", "P-1", "seed@example.com").id
            two = self.parts.ensure_part(conn, "Acme", "P-2", "seed@example.com").id
        self.offer(one, "c1", "A", "1.00", "EUR")
        self.offer(one, "c2", "B", "0.90", "USD")  # 0.90 USD is 0.8333 EUR at 1.08, so it wins
        self.offer(two, "c1", "C", "2.00", "EUR")
        lines = [{"key": "a", "manufacturer": "Acme", "mpn": "P-1", "quantity": 1}, {"key": "b", "manufacturer": "Acme", "mpn": "P-2", "quantity": 1}]

        before = self.lookup(lines)
        self.assertIsNone(before["lines"]["a"]["buy"], "no rates, so the two currencies cannot be compared")
        self.assertEqual((before["rollup"]["lines_priced"], before["rollup"]["cost_build"]), (1, "20.00"), "only the line with one currency is costed")

        with self.store.connection() as conn:
            fx.store(conn, date(2026, 3, 2), {"USD": Decimal("1.08")}, "manual")
        after = self.lookup(lines)
        self.assertEqual((after["lines"]["a"]["buy"]["sku"], after["lines"]["a"]["buy"]["currency"]), ("B", "USD"))
        rollup = after["rollup"]
        self.assertEqual((rollup["currency"], rollup["converted"], rollup["rates_day"]), ("EUR", True, "2026-03-02"))
        self.assertEqual(rollup["cost_build"], "28.33", "10 boards at 0.8333 + 2.00 each")
        self.assertEqual(rollup["original_costs"], {"EUR": "20.00", "USD": "9.00"}, "what the total was made of, before conversion")

    def test_one_currency_throughout_needs_no_rates(self) -> None:
        with self.store.connection() as conn:
            one = self.parts.ensure_part(conn, "Acme", "P-1", "seed@example.com").id
        self.offer(one, "c2", "B", "0.50", "USD")
        result = self.lookup([{"key": "a", "manufacturer": "Acme", "mpn": "P-1", "quantity": 2}])
        self.assertEqual((result["rollup"]["currency"], result["rollup"]["converted"], result["rollup"]["cost_build"]), ("USD", False, "10.00"))
        self.assertEqual((result["lines"]["a"]["buy"]["test_data"], result["rollup"]["test_data"]), (True, True), "the simulated market's price is test data")
        self.assertEqual(result["rollup"]["original_costs"], {})

    def test_a_rupee_workspace_totals_euro_offers_in_rupees(self) -> None:
        from app.services.supply import settings as supply_settings

        with self.store.connection() as conn:
            one = self.parts.ensure_part(conn, "Acme", "P-1", "seed@example.com").id
            supply_settings.save_form(conn, supply_settings.to_dto(supply_settings.DEFAULTS) | {"base_currency": "INR"}, "admin@example.com")
        self.offer(one, "c1", "A", "0.50", "EUR")
        lines = [{"key": "a", "manufacturer": "Acme", "mpn": "P-1", "quantity": 2}]
        self.assertEqual(self.lookup(lines)["rollup"]["currency"], "EUR", "no rupee rate yet: the euros stay euros")
        with self.store.connection() as conn:
            fx.store(conn, date(2026, 3, 2), {"INR": Decimal("106")}, "ecb")
        rollup = self.lookup(lines)["rollup"]
        self.assertEqual((rollup["currency"], rollup["converted"], rollup["cost_build"]), ("INR", True, "1060.00"))
        self.assertEqual(rollup["original_costs"], {"EUR": "10.00"})


if __name__ == "__main__":
    unittest.main()
