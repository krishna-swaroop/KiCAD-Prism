"""The supply connector HTTP API: roles, token scopes, error mapping, redaction.

Needs ``PRISM_DATABASE_URL``. Requests go through the real router into a
``ConnectorService`` on a disposable schema.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class SupplyConnectorsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import CredentialField, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.module = supply_connectors
        cls.database = database
        cls.registry = registry
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.AuthenticatedUser = AuthenticatedUser

        schema = f"supply_api_test_{uuid.uuid4().hex[:8]}"
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": schema})()
        cls.store.initialize()
        cls.keyring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.allow_dev = True
        cls.locked = False

        def keyring():
            if cls.locked:
                from app.services.trackers.secrets import SecretStoreLocked

                raise SecretStoreLocked("locked")
            return cls.keyring

        registry.register(ProviderSpec(
            key="demo_keyed", label="Demo keyed", capabilities=frozenset({"search"}),
            max_batch=10, stock_pooling="separate",
            credential_fields=(CredentialField("api_key", "API key"),),
            factory=lambda config: FakeProvider(config),
        ), replace=True)

        cls.service = ConnectorService(cls.store, keyring_factory=keyring, allow_dev=lambda: cls.allow_dev)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_connectors.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.service)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        cls.registry.unregister("demo_keyed")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        type(self).allow_dev = True
        type(self).locked = False
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_connectors")
            conn.execute("DELETE FROM supply_audit_events")

    def call(self, method: str, path: str, *, role: str = "admin", body=None, user=None, **kwargs):
        return _request(self.app, method, path, user=user or self.users[role], body=body, **kwargs)

    def _create(self, **overrides):
        body = {"provider": "fake"}
        body.update(overrides)
        response = self.call("POST", "/api/supply/connectors", body=body)
        self.assertEqual(response.status, 201, response.text)
        return response.json

    # --- registration -----------------------------------------------------

    def test_main_registers_the_router_and_its_redaction(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("app.include_router(supply_connectors_router)", source)
        paths = set(self.app.openapi()["paths"])
        for path in ("/api/supply/providers", "/api/supply/connectors", "/api/supply/connectors/{connector_id}",
                     "/api/supply/connectors/{connector_id}/credentials"):
            self.assertIn(path, paths)

    # --- roles ------------------------------------------------------------

    def test_readers_are_admin_designer_and_qa_not_viewer(self) -> None:
        for path in ("/api/supply/providers", "/api/supply/connectors"):
            for role in ("admin", "designer", "qa"):
                self.assertEqual(self.call("GET", path, role=role).status, 200, f"{role} {path}")
            self.assertEqual(self.call("GET", path, role="viewer").status, 403, path)

    def test_only_admin_may_change_connectors(self) -> None:
        connector = self._create()
        cid = connector["id"]
        writes = [
            ("POST", "/api/supply/connectors", {"provider": "fake"}),
            ("PATCH", f"/api/supply/connectors/{cid}", {"enabled": False}),
            ("PUT", f"/api/supply/connectors/{cid}/credentials", {"credentials": {"api_key": "x"}}),
            ("POST", f"/api/supply/connectors/{cid}/pause", {"reason": "x"}),
            ("POST", f"/api/supply/connectors/{cid}/resume", None),
            ("DELETE", f"/api/supply/connectors/{cid}", None),
        ]
        for role in ("designer", "qa", "viewer"):
            for method, path, body in writes:
                self.assertEqual(self.call(method, path, role=role, body=body).status, 403, f"{role} {method} {path}")
        self.assertEqual(len(self.service.list()), 1, "nothing was changed by the forbidden calls")

    def test_token_scopes_and_provider_tokens(self) -> None:
        read_only = self.AuthenticatedUser(
            email="bot@example.com", name="bot", role="admin", auth_type="agent", scopes=["api:read"])
        self.assertEqual(self.call("GET", "/api/supply/connectors", user=read_only).status, 200)
        self.assertEqual(
            self.call("POST", "/api/supply/connectors", user=read_only, body={"provider": "fake"}).status, 403)
        no_scope = self.AuthenticatedUser(
            email="bot@example.com", name="bot", role="admin", auth_type="agent", scopes=["other"])
        self.assertEqual(self.call("GET", "/api/supply/connectors", user=no_scope).status, 403)
        kicad = self.AuthenticatedUser(
            email="kicad@example.com", name="kicad", role="admin", auth_type="kicad_provider",
            scopes=["remote_symbols.read"])
        self.assertEqual(self.call("GET", "/api/supply/connectors", user=kicad).status, 403)
        self.assertEqual(
            self.call("POST", "/api/supply/connectors", user=kicad, body={"provider": "fake"}).status, 403)

    # --- providers --------------------------------------------------------

    def test_providers_list_describes_the_setup_form(self) -> None:
        from app.core.config import settings

        providers = {item["key"]: item for item in self.call("GET", "/api/supply/providers").json["items"]}
        self.assertEqual(providers["demo_keyed"]["credential_fields"],
                         [{"name": "api_key", "label": "API key", "secret": True}])
        self.assertNotIn("fake", providers, "the simulated provider is hidden unless enabled")
        with mock.patch.object(settings, "SUPPLY_ENABLE_SIMULATED_PROVIDER", True):
            shown = {item["key"] for item in self.call("GET", "/api/supply/providers").json["items"]}
        self.assertIn("fake", shown)

    # --- lifecycle --------------------------------------------------------

    def test_create_then_readers_see_it_without_secrets(self) -> None:
        created = self._create(provider="demo_keyed", credentials={"api_key": "TOPSECRET-KEY"}, currency="eur")
        self.assertEqual(created["created_by"], "admin@example.com")
        self.assertEqual(created["credentials"], {"api_key": True})
        listed = self.call("GET", "/api/supply/connectors", role="qa")
        self.assertEqual(listed.status, 200)
        self.assertEqual([item["id"] for item in listed.json["items"]], [created["id"]])
        self.assertNotIn("TOPSECRET-KEY", listed.text)
        self.assertEqual(listed.json["items"][0]["usage_today"], {"spent": 0, "interactive_spent": 0})

    def test_update_pause_resume_credentials_delete(self) -> None:
        cid = self._create(provider="demo_keyed", credentials={"api_key": "one"})["id"]
        path = f"/api/supply/connectors/{cid}"
        patched = self.call("PATCH", path, body={"daily_budget": 250, "enabled": False, "currency": "gbp"})
        self.assertEqual((patched.status, patched.json["daily_budget"], patched.json["enabled"], patched.json["currency"]),
                         (200, 250, False, "GBP"))
        trusted = self.call("PATCH", path, body={"reset_time": "08:00", "reset_tz": "UTC", "reset_from_provider": True})
        self.assertEqual((trusted.status, trusted.json["reset_time"], trusted.json["reset_from_provider"]), (200, "08:00", True),
                         "applying the provider's reset time trusts its count")
        paused = self.call("POST", f"{path}/pause", body={"reason": "over budget"})
        self.assertEqual(paused.json["paused_reason"], "over budget")
        self.assertEqual(self.call("POST", f"{path}/resume").json["paused_reason"], "")
        replaced = self.call("PUT", f"{path}/credentials", body={"credentials": {"api_key": "two"}})
        self.assertEqual(replaced.status, 200)
        self.assertNotIn("two", replaced.text)
        self.assertEqual(self.call("DELETE", path).status, 204)
        self.assertEqual(self.call("GET", path.rsplit("/", 1)[0], role="admin").json, {"items": []})
        self.assertEqual(self.call("DELETE", path).status, 404)

    def test_usage_today_reflects_the_ledger(self) -> None:
        from datetime import datetime, timezone

        from app.services.supply import ledger

        cid = self._create(daily_budget=100)["id"]
        with self.store.connection() as conn:
            ledger.try_spend(conn, cid, 5, interactive=False, daily_budget=100, reserve_pct=10,
                             now=datetime.now(timezone.utc).replace(hour=23, minute=59))
        usage = self.call("GET", "/api/supply/connectors", role="designer").json["items"][0]["usage_today"]
        self.assertEqual(usage, {"spent": 5, "interactive_spent": 0})

    # --- errors -----------------------------------------------------------

    def test_error_mapping(self) -> None:
        self._create(provider="demo_keyed", credentials={"api_key": "k"})
        duplicate = self.call("POST", "/api/supply/connectors",
                              body={"provider": "demo_keyed", "credentials": {"api_key": "k"}})
        self.assertEqual((duplicate.status, duplicate.json["code"]), (409, "duplicate"))

        missing = self.call("POST", "/api/supply/connectors", body={"provider": "demo_keyed"})
        self.assertEqual((missing.status, missing.json["code"]), (400, "invalid_credentials"))

        unknown = self.call("POST", "/api/supply/connectors", body={"provider": "nope"})
        self.assertEqual((unknown.status, unknown.json["code"]), (400, "unknown_provider"))

        type(self).allow_dev = False
        disabled = self.call("POST", "/api/supply/connectors", body={"provider": "fake"})
        self.assertEqual((disabled.status, disabled.json["code"]), (403, "provider_disabled"))

        self.assertEqual(self.call("PATCH", "/api/supply/connectors/missing", body={"enabled": True}).status, 404)
        self.assertEqual(self.call("POST", "/api/supply/connectors/missing/resume").status, 404)

    def test_locked_keyring_is_a_503_without_detail(self) -> None:
        type(self).locked = True
        response = self.call("POST", "/api/supply/connectors",
                             body={"provider": "demo_keyed", "credentials": {"api_key": "k"}})
        self.assertEqual(response.status, 503)
        self.assertEqual(response.json["detail"], "Credential encryption is locked")

    def test_a_missing_root_key_is_told_apart_from_an_invalid_one(self) -> None:
        from app.api.supply_call import _keyring
        from app.services.trackers.secrets import SecretStoreLocked

        missing = _keyring(SecretStoreLocked("Tracker credential encryption is disabled: TRACKER_CREDENTIAL_ROOT_KEY is not set."))
        invalid = _keyring(SecretStoreLocked("Tracker credential encryption is locked: root key is invalid."))
        self.assertEqual((missing.status_code, invalid.status_code), (503, 503))
        self.assertIn("TRACKER_CREDENTIAL_ROOT_KEY is empty", missing.detail)
        self.assertEqual(invalid.detail, "Credential encryption is locked")

    def test_request_models_are_strict(self) -> None:
        cid = self._create()["id"]
        for method, path, body in (
            ("POST", "/api/supply/connectors", {"provider": "fake", "created_by": "mallory@example.com"}),
            ("PATCH", f"/api/supply/connectors/{cid}", {"provider": "other"}),
            ("POST", f"/api/supply/connectors/{cid}/pause", {"reason": ""}),
        ):
            self.assertEqual(self.call(method, path, body=body).status, 422, f"{method} {path} {body}")

    def test_validation_errors_do_not_echo_the_request(self) -> None:
        response = self.call("POST", "/api/supply/connectors",
                             body={"provider": "demo_keyed", "credentials": {"api_key": 987654321}})
        self.assertEqual(response.status, 422)
        self.assertNotIn("987654321", response.text)
        self.assertNotIn("input", json.dumps(response.json))

    def test_redaction_wraps_the_previous_handler_and_leaves_other_routes_alone(self) -> None:
        from fastapi import FastAPI
        from fastapi.exceptions import RequestValidationError
        from fastapi.responses import JSONResponse

        app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(app)

        async def other(request, exc):
            return JSONResponse(status_code=422, content={"handled_by": "previous"})

        app.add_exception_handler(RequestValidationError, other)
        self.module.register_validation_redaction(app)

        @app.get("/elsewhere/{number}")
        async def elsewhere(number: int):
            return number

        app.include_router(self.module.router)
        outside = _request(app, "GET", "/elsewhere/abc", user=self.users["admin"])
        self.assertEqual(outside.json, {"handled_by": "previous"})
        inside = _request(app, "POST", "/api/supply/connectors", user=self.users["admin"],
                          body={"provider": 5})
        self.assertEqual(inside.status, 422)
        self.assertNotIn("handled_by", inside.json)

    # --- offers file ------------------------------------------------------

    CSV_OK = "sku,mpn,manufacturer,stock,currency,price_1\nS1,M1,Acme,10,EUR,0.5\n"

    def _csv_connector(self, **overrides):
        return self._create(provider="csv", **overrides)

    def _upload(self, connector_id: str, content: bytes, *, role: str = "admin", query: str = ""):
        return self.call("POST", f"/api/supply/connectors/{connector_id}/csv", role=role, raw=content,
                         query=query, content_type="text/csv")

    def test_csv_fed_providers_are_listed_and_unmetered(self) -> None:
        providers = {item["key"]: item for item in self.call("GET", "/api/supply/providers").json["items"]}
        for key in ("csv", "lcsc", "jlcpcb"):
            self.assertFalse(providers[key]["metered"], key)
            self.assertTrue(providers[key]["csv_fed"], key)
            self.assertEqual(providers[key]["credential_fields"], [], key)
        self.assertTrue(providers["demo_keyed"]["metered"])
        self.assertFalse(providers["demo_keyed"]["csv_fed"])

    def test_template_is_a_downloadable_csv_for_readers_only(self) -> None:
        response = self.call("GET", "/api/supply/csv-template", role="qa")
        self.assertEqual(response.status, 200)
        self.assertTrue(response.text.startswith("sku,mpn,manufacturer,stock"))
        self.assertEqual(self.call("GET", "/api/supply/csv-template", role="viewer").status, 403)

    def test_admin_uploads_a_file_and_readers_see_the_result(self) -> None:
        cid = self._csv_connector()["id"]
        response = self._upload(cid, self.CSV_OK.encode(), query="filename=stock.csv")
        self.assertEqual(response.status, 200, response.text)
        self.assertEqual((response.json["row_count"], response.json["filename"], response.json["imported_by"]),
                         (1, "stock.csv", "admin@example.com"))
        self.assertEqual(response.json["ignored_columns"], [])
        shown = self.call("GET", "/api/supply/connectors", role="designer").json["items"][0]
        self.assertEqual(shown["csv_import"]["row_count"], 1)
        self.assertFalse(shown["metered"])
        self.assertTrue(shown["csv_fed"])

    def test_only_admin_may_upload_or_clear(self) -> None:
        cid = self._csv_connector()["id"]
        for role in ("designer", "qa", "viewer"):
            self.assertEqual(self._upload(cid, self.CSV_OK.encode(), role=role).status, 403, role)
            self.assertEqual(self.call("DELETE", f"/api/supply/connectors/{cid}/csv", role=role).status, 403, role)
        self.assertIsNone(self.call("GET", "/api/supply/connectors").json["items"][0]["csv_import"])

    def test_a_bad_file_is_rejected_with_line_and_column(self) -> None:
        cid = self._csv_connector()["id"]
        self._upload(cid, self.CSV_OK.encode(), query="filename=good.csv")
        bad = b"sku,mpn,manufacturer,stock,notes\nS1,M1,Acme,10,x\nS2,M2,Acme,oops,y\n"
        response = self._upload(cid, bad)
        self.assertEqual(response.status, 400)
        body = response.json
        self.assertEqual((body["code"], body["detail"]), ("csv_rejected", "The file was not imported. 1 problem(s) found."))
        self.assertEqual(body["error_count"], 1)
        self.assertEqual(body["errors"], [{"line": 3, "column": "stock", "message": "A whole number, digits only."}])
        self.assertEqual(body["ignored_columns"], ["notes"])
        kept = self.call("GET", "/api/supply/connectors").json["items"][0]["csv_import"]
        self.assertEqual(kept["filename"], "good.csv", "the earlier data is untouched")

    def test_upload_limits_and_targets(self) -> None:
        from app.services.supply.csv_format import MAX_BYTES

        cid = self._csv_connector()["id"]
        self.assertEqual(self._upload(cid, b"x" * (MAX_BYTES + 1)).status, 413)
        self.assertEqual(self._upload(cid, b"").status, 400)
        self.assertEqual(self._upload("missing", self.CSV_OK.encode()).status, 404)
        other = self._create(provider="demo_keyed", credentials={"api_key": "k"})["id"]
        refused = self._upload(other, self.CSV_OK.encode())
        self.assertEqual((refused.status, refused.json["code"]), (400, "not_csv"))
        for provider in ("lcsc", "jlcpcb"):
            target = self._create(provider=provider)["id"]
            self.assertEqual(self._upload(target, self.CSV_OK.encode()).status, 200, provider)

    def test_the_connector_currency_is_the_default(self) -> None:
        cid = self._csv_connector()["id"]
        priced = b"sku,mpn,manufacturer,stock,price_1\nS1,M1,Acme,1,0.5\n"
        refused = self._upload(cid, priced)
        self.assertEqual(refused.status, 400)
        self.assertEqual(refused.json["errors"][0]["column"], "currency")
        self.call("PATCH", f"/api/supply/connectors/{cid}", body={"currency": "gbp"})
        self.assertEqual(self._upload(cid, priced).status, 200)

    def test_clearing_removes_the_data(self) -> None:
        cid = self._csv_connector()["id"]
        self._upload(cid, self.CSV_OK.encode())
        self.assertEqual(self.call("DELETE", f"/api/supply/connectors/{cid}/csv").status, 204)
        self.assertIsNone(self.call("GET", "/api/supply/connectors").json["items"][0]["csv_import"])
        self.assertEqual(self.call("DELETE", "/api/supply/connectors/missing/csv").status, 404)


if __name__ == "__main__":
    unittest.main()
