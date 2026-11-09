"""Assessment settings: what is accepted, who may change them, and that the assessment follows them."""

from __future__ import annotations

import copy
import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import settings as workspace  # noqa: E402
from app.services.supply.assessment import settings as rules  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


class ValidationTests(unittest.TestCase):
    def good(self) -> dict:
        return copy.deepcopy(workspace.to_dto(workspace.DEFAULTS))

    def test_the_defaults_are_valid_and_round_trip(self) -> None:
        stored = workspace.validate_form(self.good())
        self.assertEqual(set(stored), set(workspace.FORM))
        loaded = workspace.Settings(**{name: workspace.SECTIONS[name].from_dto(value) for name, value in stored.items()})
        self.assertEqual(workspace.to_dto(loaded), self.good())
        schedule = workspace.SECTIONS["schedule"]
        self.assertEqual(schedule.to_dto(schedule.from_dto(schedule.check({"spare": {"library": False}}))), {"spare": {
            "waiting": True, "tier2_early": True, "notices": True, "library": False}})
        self.assertEqual(schedule.from_dto(schedule.check({"spare": {"notices": False}})).kinds(), ["waiting", "tier2_early", "library"])

    def test_a_deployment_chooses_the_currency_a_workspace_starts_in(self) -> None:
        from pydantic import ValidationError

        from app.core.supply_config import SupplySettings

        self.assertEqual(SupplySettings(_env_file=None).SUPPLY_BASE_CURRENCY, "EUR")
        self.assertEqual(SupplySettings(_env_file=None, SUPPLY_BASE_CURRENCY=" inr ").SUPPLY_BASE_CURRENCY, "INR")
        for bad in ("rupees", "IN", "₹"):
            with self.assertRaises(ValidationError, msg=bad):
                SupplySettings(_env_file=None, SUPPLY_BASE_CURRENCY=bad)

    def test_spares_and_alert_defaults_are_kept_and_the_spares_become_a_table_or_a_percent(self) -> None:
        def spares(change: dict) -> workspace.Spares:
            return workspace.SECTIONS["spares"].from_dto(workspace.validate_form({**self.good(), **change})["spares"])

        flat = spares({"spares_percent": 5})
        self.assertEqual((flat.default_attrition(), flat.table()), (5.0, {"small_passive": 2.0, "other": 0.0}))
        package = spares({"spares_mode": "package", "spares_small_passives": 3, "spares_others": 1})
        self.assertEqual((package.default_attrition(), package.table()), (None, {"small_passive": 3.0, "other": 1.0}))
        for bad, message in (
            ({"spares_mode": "lots"}, "one percent for every part or by kind of part"),
            ({"spares_percent": 101}, "spares must be a percent"),
            ({"alert_price_rise_percent": 0}, "price rise that raises an alert must be a whole number from 1 to 500"),
            ({"alert_likely_out_percent": 49}, "chance of running out that raises an alert must be a whole number from 50 to 99"),
            ({"spare": {"waiting": "yes"}}, None),
        ):
            if message is None:
                with self.assertRaises(workspace.SettingsError):
                    workspace.SECTIONS["schedule"].check(bad)
                continue
            with self.assertRaises(workspace.SettingsError) as caught:
                workspace.validate_form({**self.good(), **bad})
            self.assertIn(message, str(caught.exception).replace("The spares", "spares"), bad)

    def test_every_check_is_listed_under_one_area(self) -> None:
        self.assertEqual(set(rules.CHECK_AREA), set(rules.CHECK_LABELS))
        self.assertTrue(set(rules.CHECK_AREA.values()) <= set(rules.AREAS))

    def test_missing_parts_fall_back_to_the_defaults(self) -> None:
        self.assertEqual(rules.validate({"lead_time_days": 30})["late_hours"], rules.DEFAULTS.late_hours)

    def test_what_is_refused_says_why(self) -> None:
        cases = [
            ({"lead_time_days": 0}, "lead time limit must be a whole number from 1 to 730"),
            ({"lead_time_days": "84"}, "lead time limit must be a whole number"),
            ({"late_hours": 100000}, "late read limit must be a whole number from 1 to 720"),
            ({"severity": {"nrnd": "loud"}}, "severity of nrnd must be one of"),
            ({"severity": {"made_up": "error"}}, "Unknown check: made_up"),
        ]
        for payload, message in cases:
            with self.assertRaises(ValueError) as caught:
                rules.validate(payload)
            self.assertIn(message, str(caught.exception), payload)
        with self.assertRaises(workspace.SettingsError) as caught:
            workspace.validate_form({"base_currency": "euro"})
        self.assertIn("base currency must be a three letter code", str(caught.exception))


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class SettingsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_settings
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts
        from app.services.supply.assessment import service
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts, cls.service = database, parts, service
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_settings_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_settings.router)
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
            for table in ("supply_settings", "supply_fx_rates", "supply_listings", "supply_parts", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")

    def call(self, method: str, body=None, role: str = "admin"):
        return _request(self.app, method, "/api/supply/settings/assessment", user=self.users[role], body=body)

    def payload(self, **change) -> dict:
        return workspace.to_dto(workspace.DEFAULTS) | change

    def test_readers_see_the_settings_and_the_defaults(self) -> None:
        response = self.call("GET", role="qa")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.json["settings"], response.json["defaults"])
        self.assertEqual(len(response.json["checks"]), 26)
        self.assertEqual(response.json["currencies"], ["EUR"], "no rates yet: the euro, which needs none")
        self.assertEqual(self.call("GET", role="viewer").status, 403)

    def test_the_known_spellings_of_makers_are_listed_and_an_administrator_changes_them(self) -> None:
        from app.services.supply import makers

        def maker_call(method, body=None, role="admin", path="/api/supply/settings/makers"):
            return _request(self.app, method, path, user=self.users[role], body=body)

        listed = maker_call("GET", role="designer").json["items"]
        ti = next(group for group in listed if group["group_key"] == "texas instruments")
        self.assertIn("ti", [item["alias_key"] for item in ti["spellings"]])
        self.assertTrue(makers.same_maker("TI", "Texas Instruments"))
        self.assertEqual(maker_call("POST", {"spelling": "TXN", "group_key": "texas instruments"}, role="designer").status, 403)
        self.assertEqual(maker_call("POST", {"spelling": "TXN", "group_key": "texas instruments"}).status, 201)
        self.assertTrue(makers.same_maker("TXN", "TI"))
        self.assertEqual(maker_call("POST", {"spelling": "TXN", "group_key": "texas instruments"}).status, 400, "already in a group")
        self.assertEqual(maker_call("DELETE", path="/api/supply/settings/makers/txn").status, 204)
        self.assertFalse(makers.same_maker("TXN", "TI"))
        self.assertEqual(maker_call("POST", {"spelling": "Brand Co", "group_key": "no such group"}).status, 400)

    def test_an_administrator_changes_them_and_it_is_audited(self) -> None:
        severity = self.payload()["severity"] | {"nrnd": "error"}
        response = self.call("PUT", self.payload(lead_time_days=30, severity=severity))
        self.assertEqual(response.status, 200, response.text)
        self.assertEqual((response.json["settings"]["lead_time_days"], response.json["settings"]["severity"]["nrnd"]), (30, "error"))
        self.assertEqual(self.call("GET", role="designer").json["settings"]["lead_time_days"], 30)
        with self.store.connection() as conn:
            row = conn.execute("SELECT actor, detail FROM supply_audit_events WHERE action = 'settings.assessment'").fetchone()
            keys = {item["key"]: item["value"] for item in conn.execute("SELECT key, value FROM supply_settings").fetchall()}
            unchanged = conn.execute("SELECT count(*) AS n FROM supply_audit_events WHERE action = 'settings.pricing'").fetchone()["n"]
        self.assertEqual(row["actor"], "admin@example.com")
        self.assertEqual(row["detail"]["before"]["lead_time_days"], 84)
        self.assertEqual(set(keys), set(workspace.FORM), "one row per section")
        self.assertEqual(keys["assessment"]["lead_time_days"], 30)
        self.assertNotIn("base_currency", keys["assessment"])
        self.assertEqual(unchanged, 0, "a section that did not change is not audited")

    def test_a_stored_section_that_no_longer_fits_is_its_default_and_the_others_still_load(self) -> None:
        self.call("PUT", self.payload(lead_time_days=30, alert_price_rise_percent=40))
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_settings SET value = '{\"alert_price_rise_percent\": \"lots\"}'::jsonb WHERE key = 'alerts'")
            loaded = workspace.load(conn)
        self.assertEqual((loaded.assessment.lead_time_days, loaded.alerts.price_rise_percent), (30, 20))

    def test_a_workspace_costs_in_rupees_once_there_is_a_rate(self) -> None:
        from decimal import Decimal

        from app.services.supply import fx

        with self.store.connection() as conn:
            fx.store(conn, datetime(2026, 10, 27, tzinfo=timezone.utc).date(), {"INR": Decimal("106.0635"), "USD": Decimal("1.08")}, "ecb")
        self.assertEqual(self.call("GET", role="qa").json["currencies"], ["EUR", "INR", "USD"])
        response = self.call("PUT", self.payload(base_currency="INR"))
        self.assertEqual((response.status, response.json["settings"]["base_currency"]), (200, "INR"), response.text)
        with self.store.connection() as conn:
            self.assertEqual(fx.latest(conn).convert(Decimal("2"), "EUR", "INR"), Decimal("212.1270"))

    def test_nobody_else_may_change_them_and_bad_values_are_refused(self) -> None:
        for role in ("qa", "designer", "viewer"):
            self.assertEqual(self.call("PUT", self.payload(), role=role).status, 403, role)
        bad = self.call("PUT", self.payload(lead_time_days=0))
        self.assertEqual((bad.status, bad.json["code"]), (400, "invalid_settings"))

    def test_reset_returns_to_the_defaults(self) -> None:
        from app.services.supply import settings as supply_settings

        self.call("PUT", self.payload(lead_time_days=30))
        with self.store.connection() as conn:
            self.assertEqual(supply_settings.reset(conn, "admin@example.com").assessment.lead_time_days, 84)
        self.assertEqual(self.call("GET").json["settings"]["lead_time_days"], 84)

    def test_the_assessment_follows_the_settings(self) -> None:
        with self.store.connection() as conn:
            part = self.parts.ensure_part(conn, "Acme", "ABC-1", "seed@example.com")
            connector = self.connectors.create(actor="seed@example.com", provider="fake", currency="EUR", display_name="Sim", interactive_reserve_pct=0)["id"]
            listing = uuid.uuid4().hex
            conn.execute("INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, 'A', %s, 'x', 'Acme', 'exact')", (listing, connector, part.id))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, lifecycle, lead_time_days) VALUES (%s, %s, 10, 'nrnd', 100)", (listing, datetime.now(timezone.utc)))

        def findings():
            with self.store.connection() as conn:
                return {f["check"]: f["severity"] for f in self.service.assess_parts(conn, [part.id])[part.id]["findings"]}

        self.assertEqual(findings(), {"nrnd": "warning", "lead_time_over_threshold": "warning"})
        severity = self.payload()["severity"] | {"nrnd": "fatal", "lead_time_over_threshold": "ok"}
        self.call("PUT", self.payload(lead_time_days=60, severity=severity))
        self.assertEqual(findings(), {"nrnd": "fatal", "lead_time_over_threshold": "ok"})
        self.call("PUT", self.payload(lead_time_days=200))
        self.assertEqual(findings(), {"nrnd": "warning"}, "100 days is inside a 200 day limit")


if __name__ == "__main__":
    unittest.main()
