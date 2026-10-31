"""The push API: offers pushed to a file-fed connector and stock levels pushed by an inventory source, each with a token of
its own, through the same write paths as a poll and an inventory read.

Needs ``PRISM_DATABASE_URL`` (offers, in a disposable schema) and the scratch catalog database (levels).
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"


def _users():
    from app.core.security import AuthenticatedUser

    return {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("designer", "admin")}


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _offer(sku: str, stock: int = 40, **over) -> dict:
    return {"sku": sku, "mpn": "ABC123", "manufacturer": "Acme", "stock": stock, "currency": "EUR",
            "prices": [{"quantity": 1, "unit_price": "0.50"}, {"quantity": 100, "unit_price": "0.30"}]} | over


class RecordsTests(unittest.TestCase):
    def test_pushed_records_are_checked_as_a_file_s_rows(self) -> None:
        from app.services.supply.csv_format import parse_offer_records
        from app.services.supply.vocabulary import Lifecycle

        parsed = parse_offer_records([_offer("A", lifecycle="nrnd", rohs=True, discontinued=False)], default_currency="")
        (row,) = parsed.rows
        self.assertEqual((row.lifecycle, row.rohs, [b.quantity for b in row.price_breaks]), (Lifecycle.NRND, True, [1, 100]))
        bad = parse_offer_records([_offer("A"), _offer("A"), _offer("B", lifecycle="sometimes", currency="")])
        self.assertEqual(bad.rows, ())
        self.assertEqual([(e.line, e.column) for e in bad.errors], [(2, "sku"), (3, "lifecycle"), (3, "currency")])

    def test_pushed_levels_gather_a_part_s_numbers_and_its_locations(self) -> None:
        from app.services.supply import push

        found = push.levels_read([
            {"part": "P1", "mpn": "ABC123", "manufacturer": "Acme", "location": "WH/A", "quantity": 5},
            {"part": "P1", "sku": "296-1-ND", "supplier": "DigiKey", "location": "CM", "external": True, "quantity": 2, "status": "On hold"},
        ])
        self.assertEqual((found.parts["P1"].mpns, found.parts["P1"].skus), ((("Acme", "ABC123"),), (("DigiKey", "296-1-ND"),)))
        self.assertEqual(sorted(found.locations), ["CM", "WH/A"])
        self.assertTrue(found.locations["CM"].external)
        self.assertEqual([(r.status, r.status_text) for r in found.stock], [(push.STATUS_OK, ""), (0, "On hold")])


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class PushOffersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_push
        from app.core.errors import install_error_handlers
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.supply_push = supply_push
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_push_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_push.router)
        cls.patch = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patch.start()
        cls.users = _users()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patch.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_connectors", "supply_push_tokens", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")

    def _connector(self, provider: str = "csv") -> str:
        return self.connectors.create(actor=ACTOR, provider=provider, currency="EUR")["id"]

    def _listing(self, connector_id: str, sku: str) -> str:
        from app.services.supply import watches

        with self.store.connection() as conn:
            part_id = watches.add_watch(conn, "Acme", "ABC123", ACTOR, tier=1)[0].part_id
            listing_id = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'ABC123', 'Acme', 'exact')",
                (listing_id, connector_id, sku, part_id),
            )
        return listing_id

    def _push(self, connector_id: str, offers: list[dict], *, replace: bool = False, headers=None, user=None):
        # A push resolves its caller itself (a push token, else the signed-in administrator), not through the overridable dependency.
        user = user or self.users["admin"]
        with mock.patch.object(self.supply_push, "get_current_user", mock.AsyncMock(return_value=user)):
            return _request(self.app, "POST", f"/api/supply/connectors/{connector_id}/offers", user=user,
                            body={"offers": offers, "replace": replace}, headers=headers)

    def _rows(self, sql: str, *params):
        with self.store.connection() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def test_pushed_offers_are_kept_and_the_known_listings_recorded_at_once(self) -> None:
        cid = self._connector()
        listing = self._listing(cid, "SKU-1")
        answer = self._push(cid, [_offer("SKU-1", 40), _offer("SKU-2", 7)])
        self.assertEqual(answer.status, 200, answer.text)
        self.assertEqual((answer.json["received"], answer.json["kept"], answer.json["recorded"]), (2, 2, 1))
        (kept,) = self._rows("SELECT stock, currency FROM supply_offers WHERE listing_id = %s", listing)
        self.assertEqual((kept["stock"], kept["currency"]), (40, "EUR"), "recorded through the write path, not on the next poll")
        self.assertEqual(self._rows("SELECT action, actor FROM supply_audit_events WHERE action = 'connector.push'"), [{"action": "connector.push", "actor": "admin@example.com"}])

        again = self._push(cid, [_offer("SKU-1", 12)])
        self.assertEqual((again.json["kept"], again.json["recorded"]), (2, 1), "a push without replace keeps the other rows")
        self.assertEqual(self._rows("SELECT stock FROM supply_offers WHERE listing_id = %s", listing), [{"stock": 12}])
        replaced = self._push(cid, [_offer("SKU-2", 3)], replace=True)
        self.assertEqual((replaced.json["kept"], replaced.json["recorded"]), (1, 0))
        self.assertEqual([row["sku"] for row in self._rows("SELECT sku FROM supply_csv_offers WHERE connector_id = %s", cid)], ["SKU-2"])

    def test_a_connector_token_pushes_there_and_nowhere_else(self) -> None:
        cid, other = self._connector(), self._connector("lcsc")
        designer = self.users["designer"]
        self.assertEqual(self._push(cid, [_offer("SKU-1")], user=designer).status, 403, "only an administrator, or the token")
        issued = _request(self.app, "POST", f"/api/supply/connectors/{cid}/push-token", user=self.users["admin"])
        token = issued.json["token"]
        self.assertTrue(token.startswith("prism_push_"))
        self.assertEqual(self._push(cid, [_offer("SKU-1")], headers=_bearer(token)).status, 200)
        self.assertEqual(self._rows("SELECT actor FROM supply_audit_events WHERE action = 'connector.push'"), [{"actor": f"push:{issued.json['prefix']}"}])
        self.assertEqual(self._push(other, [_offer("SKU-1")], headers=_bearer(token)).status, 401)
        shown = _request(self.app, "GET", f"/api/supply/connectors/{cid}/push-token", user=self.users["admin"])
        self.assertEqual(shown.json["prefix"], issued.json["prefix"])
        self.assertIsNotNone(shown.json["last_used_at"])
        self.assertNotIn(token, shown.text)
        self.assertEqual(_request(self.app, "DELETE", f"/api/supply/connectors/{cid}/push-token", user=self.users["admin"]).status, 204)
        self.assertEqual(self._push(cid, [_offer("SKU-1")], headers=_bearer(token)).status, 401)

    def test_bad_rows_take_nothing_and_say_where(self) -> None:
        cid = self._connector()
        answer = self._push(cid, [_offer("SKU-1"), _offer("SKU-2", lifecycle="sometimes")])
        self.assertEqual((answer.status, answer.json["code"]), (400, "offers_rejected"))
        self.assertEqual(answer.json["errors"], [{"row": 2, "field": "lifecycle", "message": answer.json["errors"][0]["message"]}])
        self.assertEqual(self._rows("SELECT sku FROM supply_csv_offers"), [])

    def test_only_a_file_fed_connector_takes_offers_or_a_token(self) -> None:
        cid = self._connector("fake")
        self.assertEqual(self._push(cid, [_offer("SKU-1")]).json["code"], "not_csv")
        self.assertEqual(_request(self.app, "POST", f"/api/supply/connectors/{cid}/push-token", user=self.users["admin"]).status, 400)
        self.assertEqual(self._push("nope", [_offer("SKU-1")]).status, 404)

    def test_an_uploaded_file_is_a_push_that_replaces_every_row(self) -> None:
        from app.services.supply.csv_import_service import CsvImportService

        cid = self._connector()
        listing = self._listing(cid, "SKU-1")
        self._push(cid, [_offer("SKU-9")])
        CsvImportService(self.connectors, self.store).import_file(cid, b"sku,mpn,manufacturer,stock\nSKU-1,ABC123,Acme,55\n", actor=ACTOR)
        self.assertEqual(self._rows("SELECT stock FROM supply_offers WHERE listing_id = %s", listing), [{"stock": 55}])
        self.assertEqual([row["sku"] for row in self._rows("SELECT sku FROM supply_csv_offers WHERE connector_id = %s", cid)], ["SKU-1"])


@requires_scratch_postgres("push levels")
class PushLevelsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_inventory, supply_push
        from app.core.errors import install_error_handlers
        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.tempdir = tempfile.TemporaryDirectory()
        cls.catalog = ComponentCatalogPostgresService(store_root=Path(cls.tempdir.name) / "components", database_url=CATALOG_URL)
        cls.catalog.initialize()
        cls.store = type("CatalogSupplyStore", (SupplyStore,), {"url": CATALOG_URL})()
        cls.store._initialized = True
        cls.ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_inventory.router)
        cls.app.include_router(supply_push.router)
        service = type("S", (), {"store": cls.store, "keyring": lambda self: cls.ring})()
        cls.patch = mock.patch.object(supply_connectors, "service", service)
        cls.patch.start()
        cls.users = _users()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patch.stop()
        cls.tempdir.cleanup()

    def _component(self) -> dict:
        token = uuid.uuid4().hex[:10]
        component = self.catalog.create_manual_component(
            value="10k", description="Push test", datasheet="https://example.com/r.pdf",
            manufacturer=f"Maker {token}", manufacturer_part_number=f"PUSH-{token}", sap_code="", actor=ACTOR,
        )
        self.addCleanup(self.catalog.deactivate_component, str(component["id"]), actor=ACTOR, reason="push test cleanup")
        return component

    def _source(self, kind: str = "push") -> str:
        body = {"kind": kind, "display_name": "Stores"} | ({"base_url": "https://stock.example.com", "token": "unused"} if kind == "inventree" else {})
        made = _request(self.app, "POST", "/api/supply/inventory-sources", user=self.users["admin"], body=body)
        self.assertEqual(made.status, 201, made.text)
        self.addCleanup(self._drop, made.json["id"])
        return made.json["id"]

    def _drop(self, source_id: str) -> None:
        from app.services.supply.inventory import sources

        with self.store.connection() as conn:
            if conn.execute("SELECT 1 FROM inventory_sources WHERE id = %s", (source_id,)).fetchone():
                sources.delete(conn, source_id, ACTOR)

    def _levels(self, source_id: str) -> list[tuple]:
        with self.store.connection() as conn:
            return [(row["component_id"], row["quantity"], row["inventory_status"], row["location_path"], row["source"]) for row in conn.execute(
                "SELECT component_id, quantity, inventory_status, location_path, source FROM inventory_levels WHERE source_id = %s ORDER BY quantity",
                (source_id,)).fetchall()]

    def test_a_push_source_s_token_replaces_its_stock_matched_as_a_read_is(self) -> None:
        component = self._component()
        source_id = self._source()
        made = _request(self.app, "GET", "/api/supply/inventory-sources", user=self.users["admin"])
        (shown,) = [row for row in made.json if row["id"] == source_id]
        self.assertEqual((shown["kind"], shown["base_url"]), ("push", ""))
        token = _request(self.app, "POST", f"/api/supply/inventory-sources/{source_id}/push-token", user=self.users["admin"]).json["token"]
        path = f"/api/supply/inventory-sources/{source_id}/levels"
        items = [
            {"part": "A-1", "mpn": component["mpn"], "manufacturer": component["manufacturer"], "location": "WH/A", "quantity": 9},
            {"part": "A-1", "location": "WH/B", "quantity": 3, "status": "On hold"},
            {"part": "Z-9", "mpn": "NOT-IN-LIBRARY", "quantity": 2},
        ]
        pushed = _request(self.app, "POST", path, user=self.users["admin"], body={"items": items}, headers=_bearer(token))
        self.assertEqual((pushed.status, pushed.json), (200, {"matched": 1, "unmatched": 1, "records": 3}))
        cid = str(component["id"])
        self.assertEqual(self._levels(source_id), [(cid, 3.0, "on hold", "WH/B", "push"), (cid, 9.0, "available", "WH/A", "push")])
        unmatched = _request(self.app, "GET", f"/api/supply/inventory-sources/{source_id}/unmatched", user=self.users["admin"])
        self.assertEqual([row["remote_part"] for row in unmatched.json], ["Z-9"])
        again = _request(self.app, "POST", path, user=self.users["admin"], body={"items": items[:1]}, headers=_bearer(token))
        self.assertEqual(again.json["records"], 1)
        self.assertEqual(self._levels(source_id), [(cid, 9.0, "available", "WH/A", "push")], "a push is the whole stock")
        self.assertEqual(_request(self.app, "POST", path, user=self.users["admin"], body={"items": items}, headers=_bearer("prism_push_" + "x" * 40)).status, 401)

    def test_a_source_prism_reads_takes_no_push(self) -> None:
        source_id = self._source("inventree")
        pushed = _request(self.app, "POST", f"/api/supply/inventory-sources/{source_id}/levels", user=self.users["admin"], body={"items": []})
        self.assertEqual((pushed.status, pushed.json["code"]), (400, "not_push"))
        self.assertEqual(_request(self.app, "POST", f"/api/supply/inventory-sources/{source_id}/push-token", user=self.users["admin"]).status, 400)


if __name__ == "__main__":
    unittest.main()
