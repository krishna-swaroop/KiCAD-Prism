"""Local inventory sources (decision D15): the InvenTree client, the sync into ``inventory_levels``, and the API.

The client tests need nothing. The sync and API tests need ``TEST_POSTGRES_URL``: stock lands on catalog components.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
import unittest.mock
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

AUTHOR = "author@example.com"
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)
HOST = "stock.example.com"


def _token() -> str:
    # Built at run time: no token-shaped literal in the repository.
    return "-".join(("test", uuid.uuid4().hex))


class FakeServer:
    """Answers InvenTree's list endpoints from tables, paging by limit and offset as InvenTree does."""

    def refused(self, path: str, query: dict) -> str:
        return ""

    def __init__(self, tables: dict[str, list[dict]], *, api: dict | None = None) -> None:
        self.tables = tables
        self.api = api if api is not None else {"server": "InvenTree", "apiVersion": 566, "instance": "Test"}
        self.sent: list[dict] = []

    def send(self, *, method, target, headers, body, timeout, max_bytes):
        from app.services.supply.http_client import HttpResponse

        url = urlsplit(target.url)
        query = dict(parse_qsl(url.query))
        self.sent.append({"method": method, "path": url.path, "query": query, "headers": dict(headers)})
        refused = self.refused(url.path.removeprefix("/api/"), query)
        if refused:
            return HttpResponse(400, {"content-type": "application/json"}, json.dumps({"detail": f"Unsupported filter: {refused}"}).encode())
        if url.path == "/api/":
            answer = self.api
        else:
            rows = self.tables[url.path.removeprefix("/api/")]
            offset, limit = int(query.get("offset", 0)), int(query.get("limit", 100))
            answer = {"count": len(rows), "next": None, "previous": None, "results": rows[offset:offset + limit]}
        return HttpResponse(200, {"content-type": "application/json"}, json.dumps(answer).encode())


class VisionServer(FakeServer):
    """Vision's subset of InvenTree (PRISM_API.md §3): any filter it does not list is answered with 400."""

    FILTERS = {
        "": set(),
        "part/category/": {"parent", "search"},
        "part/": {"category", "cascade", "IPN", "search", "active", "has_stock"},
        "company/part/manufacturer/": {"part", "MPN", "manufacturer", "search"},
        "stock/": {
            "category", "cascade", "part", "IPN", "in_stock", "available", "status", "location",
            "part_detail", "location_detail", "updated_after", "search",
        },
        "stock/location/": {"parent", "external", "search"},
    }

    def refused(self, path: str, query: dict) -> str:
        unknown = set(query) - self.FILTERS[path] - {"limit", "offset", "ordering"}
        return ", ".join(sorted(unknown))


def _client(server: FakeServer, token: str = "unused"):
    from app.services.supply.http_client import SafeHttpClient
    from app.services.supply.inventory.inventree import InvenTreeClient

    return InvenTreeClient(f"https://{HOST}", token, client=SafeHttpClient((HOST,), transport=server, resolve=lambda host: ["93.184.216.34"]))


class InvenTreeClientTests(unittest.TestCase):
    def test_it_sends_the_token_and_pages_by_offset(self) -> None:
        from app.services.supply.inventory import inventree

        token = _token()
        server = FakeServer({"stock/": [{"pk": n, "part": 1, "quantity": n, "status": 10} for n in range(1, 6)]})
        with unittest.mock.patch.object(inventree, "PAGE", 2):
            records = _client(server, token).stock(7)
        self.assertEqual([record.pk for record in records], [1, 2, 3, 4, 5])
        self.assertEqual([call["query"]["offset"] for call in server.sent], ["0", "2", "4"])
        self.assertEqual({call["headers"]["Authorization"] for call in server.sent}, {f"Token {token}"})
        self.assertEqual((server.sent[0]["query"]["category"], server.sent[0]["query"]["in_stock"]), ("7", "true"))

    def test_parts_carry_their_manufacturer_part_numbers(self) -> None:
        server = FakeServer({
            "part/": [{"pk": 1, "name": "RES 10K", "IPN": "13970", "units": ""}, {"pk": 2, "name": "CAP", "IPN": None}],
            "company/part/manufacturer/": [
                {"pk": 9, "part": 1, "MPN": "TNPW060310K0BEEA", "manufacturer_detail": {"pk": 3, "name": "Vishay"}},
                {"pk": 10, "part": 99, "MPN": "OUTSIDE"},
            ],
        })
        parts = _client(server).parts(7)
        self.assertEqual(parts[1].mpns, (("Vishay", "TNPW060310K0BEEA"),))
        self.assertEqual((parts[2].ipn, parts[2].mpns), ("", ()), "a part outside the category's list is ignored")

    def test_a_whole_read_sends_only_the_filters_vision_serves(self) -> None:
        from app.services.supply.inventory import sync

        server = VisionServer({
            "part/": [{"pk": 1, "name": "RES 10K", "IPN": "13970"}],
            "company/part/manufacturer/": [
                {"pk": 1, "part": 1, "MPN": "TNPW060310K0BEEA", "manufacturer": 1,
                 "manufacturer_detail": {"pk": 1, "name": "Unknown manufacturer"}},
            ],
            "stock/location/": [{"pk": 5, "name": "EXT4", "pathstring": "4200/EXT4", "external": True}],
            "stock/": [{"pk": 3, "part": 1, "quantity": 4.0, "allocated": 4.0, "status": 75, "status_custom_key": 1001,
                        "status_text": "On hold", "location": 5}],
        }, api={"server": "Vision", "apiVersion": 566, "instance": "Pixxel"})
        found = sync.read(_client(server), 1)
        self.assertEqual((found.server, found.parts[1].mpns), ("Vision", (("Unknown manufacturer", "TNPW060310K0BEEA"),)))
        self.assertEqual((found.stock[0].status_text, found.locations[5].external), ("On hold", True))

    def test_a_server_that_is_not_inventree_is_refused(self) -> None:
        from app.services.supply.inventory.inventree import InvenTreeError, base_url

        with self.assertRaises(InvenTreeError):
            _client(FakeServer({}, api={"hello": "world"})).server()
        with self.assertRaises(InvenTreeError):
            base_url(f"http://{HOST}")
        self.assertEqual(base_url(f"https://{HOST}/inventree/api/"), f"https://{HOST}/inventree")


@requires_scratch_postgres("inventory sources")
class InventorySyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_inventory
        from app.core.errors import install_error_handlers
        from app.core.security import AuthenticatedUser
        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.tempdir = tempfile.TemporaryDirectory()
        cls.catalog = ComponentCatalogPostgresService(store_root=Path(cls.tempdir.name) / "components", database_url=CATALOG_URL)
        cls.catalog.initialize()
        cls.store = type("CatalogSupplyStore", (SupplyStore,), {"url": CATALOG_URL})()
        cls.store._initialized = True
        cls.ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "designer", "qa", "admin")}
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_inventory.router)
        service = type("S", (), {"store": cls.store, "keyring": lambda self: cls.ring})()
        cls.service_patch = unittest.mock.patch.object(supply_connectors, "service", service)
        cls.service_patch.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.service_patch.stop()
        cls.tempdir.cleanup()

    def _component(self, *, mpn: str | None = None, sap_code: str = "") -> dict:
        token = uuid.uuid4().hex[:10]
        component = self.catalog.create_manual_component(
            value="10k", description="Inventory test", datasheet="https://example.com/r.pdf",
            manufacturer=f"Maker {token}", manufacturer_part_number=mpn or f"INV-{token}", sap_code=sap_code, actor=AUTHOR,
        )
        self.addCleanup(self.catalog.deactivate_component, str(component["id"]), actor=AUTHOR, reason="inventory test cleanup")
        return component

    def _source(self) -> str:
        from app.services.supply.inventory import sources

        with self.store.connection() as conn:
            row = sources.create(conn, self.ring, AUTHOR, display_name="Stock", url=f"https://{HOST}", token=_token(), category_id=7)
        self.addCleanup(self._drop_source, row["id"])
        return row["id"]

    def _drop_source(self, source_id: str) -> None:
        from app.services.supply.inventory import sources

        with self.store.connection() as conn:
            if conn.execute("SELECT 1 FROM inventory_sources WHERE id = %s", (source_id,)).fetchone():
                sources.delete(conn, source_id, AUTHOR)

    def _sync(self, source_id: str, server: FakeServer, now: datetime = NOW) -> dict:
        from app.services.supply.inventory import sync

        return sync.sync(self.store, self.ring, source_id, client_factory=lambda url, token: _client(server, token), now=now)

    def _levels(self, source_id: str) -> list[dict]:
        with self.store.connection() as conn:
            return [dict(row) for row in conn.execute(
                "SELECT component_id, source_record_id, quantity, allocated, inventory_status, fetch_status, location_path, external, batch "
                "FROM inventory_levels WHERE source_id = %s ORDER BY source_record_id", (source_id,)).fetchall()]

    def _unmatched(self, source_id: str) -> dict[str, str]:
        with self.store.connection() as conn:
            return {row["remote_part"]: row["reason"] for row in conn.execute(
                "SELECT remote_part, reason FROM inventory_unmatched WHERE source_id = %s", (source_id,)).fetchall()}

    def _server(self, sap: str, mpn: str, shared: str, stock: list[dict]) -> FakeServer:
        return FakeServer({
            "part/": [
                {"pk": 1, "name": "By SAP code", "IPN": sap}, {"pk": 2, "name": "By MPN", "IPN": ""},
                {"pk": 3, "name": "Shared MPN", "IPN": ""}, {"pk": 4, "name": "Unknown", "IPN": "99999999"},
            ],
            "company/part/manufacturer/": [
                {"pk": 11, "part": 2, "MPN": mpn, "manufacturer_detail": {"name": "Unknown manufacturer"}},
                {"pk": 12, "part": 3, "MPN": shared, "manufacturer_detail": {"name": "Unknown manufacturer"}},
            ],
            "stock/location/": [{"pk": 50, "pathstring": "4200/BS4/AVI4"}, {"pk": 51, "pathstring": "4200/EXT4/V1", "external": True}],
            "stock/": stock,
        })

    def test_stock_lands_on_components_matched_by_sap_code_then_mpn(self) -> None:
        sap = str(uuid.uuid4().int)[:9]
        by_sap = self._component(sap_code=sap)
        by_mpn = self._component()
        shared = f"SHARED-{uuid.uuid4().hex[:8]}"
        self._component(mpn=shared)
        self._component(mpn=shared)
        source_id = self._source()
        stock = [
            {"pk": 101, "part": 1, "quantity": 400, "allocated": 100, "status": 10, "location": 50, "batch": "L1"},
            {"pk": 102, "part": 1, "quantity": 50, "status": 75, "status_text": "On hold", "location": 51},
            {"pk": 103, "part": 2, "quantity": 7, "status": 10, "location": 50},
            {"pk": 104, "part": 3, "quantity": 9, "status": 10},
            {"pk": 105, "part": 4, "quantity": 3, "status": 10},
        ]
        result = self._sync(source_id, self._server(sap, by_mpn["mpn"], shared, stock))
        self.assertEqual((result["status"], result["matched"], result["unmatched"]), ("ok", 2, 2))
        levels = self._levels(source_id)
        self.assertEqual(
            [(row["component_id"], row["source_record_id"], row["quantity"], row["allocated"], row["inventory_status"], row["location_path"], row["external"]) for row in levels],
            [
                (str(by_sap["id"]), "101", 400.0, 100.0, "available", "4200/BS4/AVI4", False),
                (str(by_sap["id"]), "102", 50.0, 0.0, "on hold", "4200/EXT4/V1", True),
                (str(by_mpn["id"]), "103", 7.0, 0.0, "available", "4200/BS4/AVI4", False),
            ],
        )
        self.assertEqual(self._unmatched(source_id), {"3": "mpn_shared", "4": "no_component"})

    def test_a_read_replaces_the_stock_and_a_failed_read_keeps_it_stale(self) -> None:
        from app.services.supply.providers.base import Unavailable

        sap = str(uuid.uuid4().int)[:9]
        self._component(sap_code=sap)
        source_id = self._source()
        first = [{"pk": 201, "part": 1, "quantity": 5, "status": 10}, {"pk": 202, "part": 1, "quantity": 6, "status": 10}]
        self._sync(source_id, self._server(sap, "X", "Y", first))
        self._sync(source_id, self._server(sap, "X", "Y", first[:1]), NOW + timedelta(days=1))
        self.assertEqual([row["source_record_id"] for row in self._levels(source_id)], ["201"], "a record that left stock is gone")

        class Down(FakeServer):
            def send(self, **kwargs):
                raise Unavailable("down")

        result = self._sync(source_id, Down({}), NOW + timedelta(days=2))
        self.assertEqual(result["status"], "error")
        self.assertEqual([(row["source_record_id"], row["fetch_status"]) for row in self._levels(source_id)], [("201", "error")])

    def test_a_person_s_link_answers_an_unmatched_part(self) -> None:
        from app.services.supply.inventory import sync

        component = self._component()
        source_id = self._source()
        stock = [{"pk": 301, "part": 4, "quantity": 3, "status": 10}]
        self._sync(source_id, self._server("", "X", "Y", stock))
        self.assertEqual(self._unmatched(source_id), {"4": "no_component"})
        with self.store.connection() as conn:
            sync.link(conn, source_id, "4", str(component["id"]), AUTHOR)
        self._sync(source_id, self._server("", "X", "Y", stock))
        self.assertEqual((self._unmatched(source_id), [row["component_id"] for row in self._levels(source_id)]), ({}, [str(component["id"])]))

    def test_only_due_sources_are_read(self) -> None:
        from app.services.supply.inventory import sync

        source_id = self._source()
        with self.store.connection() as conn:
            self.assertIn(source_id, sync.due(conn, NOW))
            conn.execute("UPDATE inventory_sources SET last_sync_at = %s WHERE id = %s", (NOW - timedelta(hours=2), source_id))
            self.assertNotIn(source_id, sync.due(conn, NOW), "read two hours ago, every 24 hours")

    def test_admins_manage_sources_and_the_token_never_comes_back(self) -> None:
        body = {"display_name": "Vision", "base_url": f"https://{HOST}/", "token": _token(), "category_id": 7}
        self.assertEqual(_request(self.app, "POST", "/api/supply/inventory-sources", user=self.users["designer"], body=body).status, 403)
        made = _request(self.app, "POST", "/api/supply/inventory-sources", user=self.users["admin"], body=body)
        self.assertEqual(made.status, 201)
        self.addCleanup(self._drop_source, made.json["id"])
        self.assertNotIn(body["token"], json.dumps(made.json))
        self.assertEqual((made.json["base_url"], made.json["has_token"]), (f"https://{HOST}", True))
        listed = _request(self.app, "GET", "/api/supply/inventory-sources", user=self.users["designer"])
        self.assertIn(made.json["id"], [row["id"] for row in listed.json])
        cleared = _request(self.app, "PATCH", f"/api/supply/inventory-sources/{made.json['id']}", user=self.users["admin"], body={"token": ""})
        self.assertFalse(cleared.json["has_token"])
        bad = _request(self.app, "POST", "/api/supply/inventory-sources", user=self.users["admin"], body={**body, "base_url": f"http://{HOST}"})
        self.assertEqual((bad.status, bad.json["detail"]["code"]), (400, "invalid_source"))

    def test_a_server_that_cannot_be_reached_says_why(self) -> None:
        from app.api import supply_inventory
        from app.services.supply.providers.base import Unavailable

        source_id = self._source()

        class Down:
            def __init__(self, url, token):
                pass

            def server(self):
                raise Unavailable("connection refused")

            def close(self):
                pass

        with unittest.mock.patch.object(supply_inventory, "InvenTreeClient", Down):
            answer = _request(self.app, "POST", f"/api/supply/inventory-sources/{source_id}/check", user=self.users["admin"])
        self.assertEqual((answer.status, answer.json["code"], answer.json["detail"]), (502, "upstream_failure", "unavailable: connection refused"))

    def test_qa_links_an_unmatched_part_and_its_stock_lands_at_once(self) -> None:
        from app.services.supply.inventory import sync

        component = self._component()
        source_id = self._source()
        server = self._server("", "X", "Y", [{"pk": 401, "part": 4, "quantity": 8, "status": 10}])
        self._sync(source_id, server)
        path = f"/api/supply/inventory-sources/{source_id}/unmatched/4/link"
        self.assertEqual(_request(self.app, "POST", path, user=self.users["designer"], body={"component_id": str(component["id"])}).status, 403)
        missing = _request(self.app, "POST", path, user=self.users["qa"], body={"component_id": "no-such-component"})
        self.assertEqual((missing.status, missing.json["detail"]["code"]), (400, "invalid_source"))
        with unittest.mock.patch.object(sync, "InvenTreeClient", lambda url, token: _client(server, token)):
            linked = _request(self.app, "POST", path, user=self.users["qa"], body={"component_id": str(component["id"])})
        self.assertEqual((linked.status, linked.json["matched"], linked.json["unmatched"]), (200, 1, 0))
        self.assertEqual([row["component_id"] for row in self._levels(source_id)], [str(component["id"])])

    def test_local_stock_splits_available_held_and_at_vendor(self) -> None:
        from app.api import supply_component_parts

        sap = str(uuid.uuid4().int)[:9]
        component = self._component(sap_code=sap)
        source_id = self._source()
        stock = [
            {"pk": 501, "part": 1, "quantity": 400, "allocated": 100, "status": 10, "location": 50},
            {"pk": 502, "part": 1, "quantity": 50, "status": 75, "status_text": "On hold", "location": 50},
            {"pk": 503, "part": 1, "quantity": 30, "status": 10, "location": 51},
        ]
        self._sync(source_id, self._server(sap, "X", "Y", stock))
        app = type(self.app)()
        app.include_router(supply_component_parts.router)
        answer = _request(app, "GET", f"/api/supply/components/{component['id']}/local-stock", user=self.users["designer"])
        self.assertEqual(answer.status, 200)
        self.assertEqual((answer.json["available"], answer.json["held"], answer.json["at_vendor"]), (300.0, 50.0, 30.0))
        self.assertEqual([(row["location"], row["status"], row["external"]) for row in answer.json["rows"]], [
            ("4200/BS4/AVI4", "available", False), ("4200/BS4/AVI4", "on hold", False), ("4200/EXT4/V1", "available", True),
        ])
        self.assertEqual(_request(app, "GET", f"/api/supply/components/{component['id']}/local-stock", user=self.users["viewer"]).status, 403)
        from app.api import supply_bom
        from app.services.supply.inventory import levels

        with self.store.connection() as conn:
            self.assertEqual(levels.available_by_component(conn, [str(component["id"]), "no-stock"]), {str(component["id"]): 300.0})
        bom = type(self.app)()
        bom.include_router(supply_bom.router)
        body = {"components": [{"key": str(component["id"]), "manufacturer": component["manufacturer"], "mpn": component["mpn"], "quantity": 1}]}
        status = _request(bom, "POST", "/api/supply/bom/components-status", user=self.users["designer"], body=body).json["items"][str(component["id"])]
        self.assertEqual((status["local_available"], status["status"], status["watched"]), (300.0, "unknown", False), "local stock shows on an untracked component")


if __name__ == "__main__":
    unittest.main()
