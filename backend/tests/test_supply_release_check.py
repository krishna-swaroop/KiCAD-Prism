"""The supply check before a release, and the snapshot frozen at publish. Needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime.now(timezone.utc)


def lines(components):
    from app.services.supply import usage

    return usage.lines_from_components(components)


def component(reference, maker="", mpn="", **fields):
    values = {"Manufacturer": maker, "Manufacturer Part Number": mpn, "DNP": "No", "In BOM": "Yes", **fields}
    return {"reference": reference, "fields": values}


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply tests")
class ReleaseCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_release
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts, release_check
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts, cls.release_check = database, parts, release_check
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_release_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_release.router)
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
            for table in ("supply_attention_decisions", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
        self.cid = self.connectors.create(actor="seed@example.com", provider="fake", currency="EUR", display_name="Sim", interactive_reserve_pct=0)["id"]

    def part(self, mpn: str, *, stock: int, lifecycle: str = "active") -> str:
        with self.store.connection() as conn:
            part = self.parts.ensure_part(conn, "Acme", mpn, "seed@example.com")
            listing_id = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')",
                (listing_id, self.cid, f"S-{mpn}", part.id))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, lifecycle) VALUES (%s, %s, %s, %s)", (listing_id, NOW, stock, lifecycle))
        return part.id

    def bom(self):
        return [
            component("R1", "Acme", "GOOD-1"), component("R2", "Acme", "GOOD-1"),
            component("U1", "Acme", "OBS-1"),
            component("C1", "Acme", "UNKNOWN-9"),
            component("J1"),
        ]

    def test_the_check_reports_health_the_parts_that_need_a_look_and_what_is_not_tracked(self) -> None:
        self.part("GOOD-1", stock=5000)
        self.part("OBS-1", stock=0, lifecycle="obsolete")
        with self.store.connection() as conn:
            result = self.release_check.check(conn, lines(self.bom()), NOW)
        self.assertEqual((result["parts"], result["tracked"], result["not_tracked"]), (4, 2, 2), "a line with no number is a line, and not tracked")
        self.assertEqual(result["status"], "fatal")
        self.assertEqual(result["needing_a_look"], 1)
        (attention,) = result["attention"]
        self.assertEqual((attention["mpn"], attention["status"]), ("OBS-1", "fatal"))
        self.assertIn("obsolete", {f["check"] for f in attention["findings"]})
        good = next(row for row in result["lines"] if row["mpn"] == "GOOD-1")
        self.assertEqual((good["quantity"], good["status"]), (2, "ok"))
        self.assertLessEqual(result["health"], 4.0, "a fatal line caps the BOM")

    def test_a_waived_finding_no_longer_needs_a_look(self) -> None:
        self.part("OBS-1", stock=500, lifecycle="obsolete")
        from app.services.supply.assessment import waivers
        from app.services.supply.assessment.checks import Finding
        from app.services.supply.vocabulary import Status

        with self.store.connection() as conn:
            part_id = conn.execute("SELECT id FROM supply_parts").fetchone()["id"]
            waivers.propose(conn, part_id, Finding("obsolete", Status.FATAL, "x", "obsolete"), "Last-time stock bought", "qa@example.com", approver=True)
            result = self.release_check.check(conn, lines([component("U1", "Acme", "OBS-1")]), NOW)
        self.assertEqual((result["needing_a_look"], result["status"]), (0, "ok"))
        self.assertEqual(result["lines"][0]["waived"], 1)

    def test_a_draft_that_cannot_be_built_does_not_cost_the_snapshot(self) -> None:
        self.part("GOOD-1", stock=5000)
        with self.store.connection() as conn, mock.patch.object(self.release_check.compliance_draft, "build", side_effect=RuntimeError("boom")):
            made = self.release_check.freeze(conn, "prj_1", "bld_nodraft", "vx", "c" * 40, "qa@example.com", lines([component("R1", "Acme", "GOOD-1")]), NOW)
            snapshot = self.release_check.get_snapshot(conn, "prj_1", "bld_nodraft")
        self.assertIsNotNone(made)
        self.assertEqual((snapshot["status"], snapshot["compliance"]), ("ok", None))

    def test_the_snapshot_keeps_the_check_and_can_never_change(self) -> None:
        self.part("GOOD-1", stock=5000)
        with self.store.connection() as conn:
            first = self.release_check.freeze(conn, "prj_1", "bld_1", "v1", "a" * 40, "qa@example.com", lines([component("R1", "Acme", "GOOD-1")]), NOW)
            again = self.release_check.freeze(conn, "prj_1", "bld_1", "v1", "a" * 40, "qa@example.com", [], NOW)
            snapshot = self.release_check.get_snapshot(conn, "prj_1", "bld_1")
        self.assertIsNotNone(first)
        self.assertIsNone(again, "a build is frozen once")
        self.assertEqual((snapshot["tag"], snapshot["status"], snapshot["assessment"]["parts"]), ("v1", "ok", 1))
        draft = snapshot["compliance"]
        self.assertEqual([(item["mpn"], item["quantity"]) for item in draft["parts"]], [("GOOD-1", 1)])
        project = SimpleNamespace(id="prj_1", name="One")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            frozen = _request(self.app, "GET", "/api/supply/projects/prj_1/releases/bld_1/compliance", user=self.users["qa"])
            as_csv = _request(self.app, "GET", "/api/supply/projects/prj_1/releases/bld_1/compliance", user=self.users["qa"], query="format=csv")
            missing = _request(self.app, "GET", "/api/supply/projects/prj_1/releases/nope/compliance", user=self.users["qa"])
            with self.store.connection() as conn:
                conn.execute("ALTER TABLE supply_release_snapshots DISABLE TRIGGER trg_supply_release_snapshots_frozen")
                conn.execute("UPDATE supply_release_snapshots SET compliance = NULL")
                conn.execute("ALTER TABLE supply_release_snapshots ENABLE TRIGGER trg_supply_release_snapshots_frozen")
            old = _request(self.app, "GET", "/api/supply/projects/prj_1/releases/bld_1/compliance", user=self.users["qa"])
        self.assertEqual((frozen.status, frozen.json["tag"], len(frozen.json["draft"]["parts"])), (200, "v1", 1))
        self.assertEqual((as_csv.status, as_csv.headers["content-type"].startswith("text/csv")), (200, True))
        self.assertIn("GOOD-1", as_csv.text)
        self.assertEqual((missing.status, old.status), (404, 404))
        with self.store.connection() as conn, self.assertRaises(Exception) as caught:
            conn.execute("UPDATE supply_release_snapshots SET tag = 'v2'")
        self.assertIn("cannot be changed", str(caught.exception))
        with self.assertRaises(self.release_check.SnapshotNotFound), self.store.connection() as conn:
            self.release_check.get_snapshot(conn, "prj_1", "missing")

    def request(self, path: str, role: str = "designer", query: str = ""):
        return _request(self.app, "GET", f"/api/supply/projects/{path}", user=self.users[role], query=query)

    BOM_CSV = "Reference,Qty,Manufacturer,MPN\nR1 R2,2,Acme,GOOD-1\nU1,1,Acme,OBS-1\nJ1,1,,\n"

    def test_the_endpoint_checks_the_bom_the_release_build_exported(self) -> None:
        self.part("GOOD-1", stock=5000)
        self.part("OBS-1", stock=0, lifecycle="obsolete")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=SimpleNamespace(id="prj_1")), \
                mock.patch("app.api.supply_release._build_of_project"), \
                mock.patch("app.api.supply_release.release_source.build_bom_text", return_value=self.BOM_CSV):
            response = self.request("prj_1/release-builds/b1/check")
        self.assertEqual(response.status, 200, response.text)
        self.assertEqual((response.json["available"], response.json["status"], response.json["parts"]), (True, "fatal", 2))
        self.assertEqual((response.json["without_number"], response.json["needing_a_look"]), (1, 1))

    def test_a_build_with_no_bom_says_so(self) -> None:
        from app.services.supply import release_source

        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=SimpleNamespace(id="p")), \
                mock.patch("app.api.supply_release._build_of_project"), \
                mock.patch("app.api.supply_release.release_source.build_bom_text", side_effect=release_source.NoBuildBom("This build exported no BOM file.")):
            response = self.request("p/release-builds/b/check")
        self.assertEqual(response.json, {"available": False, "reason": "This build exported no BOM file."})

    def test_reading_the_release_bom_keeps_its_lines_without_tracking_anything(self) -> None:
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=SimpleNamespace(id="prj_5", name="Five")), \
                mock.patch("app.api.supply_release._build_of_project"), \
                mock.patch("app.api.supply_release.release_source.build_bom_text", return_value=self.BOM_CSV):
            response = _request(self.app, "POST", "/api/supply/projects/prj_5/release-builds/b1/read-bom", user=self.users["qa"])
        self.assertEqual((response.status, response.json["parts"], response.json["without_number"]), (200, 2, 1))
        with self.store.connection() as conn:
            kept = conn.execute("SELECT mpn, quantity FROM supply_bom_usage WHERE project_id = 'prj_5' ORDER BY mpn").fetchall()
            self.assertEqual([(r["mpn"], r["quantity"]) for r in kept], [("GOOD-1", 2), ("OBS-1", 1)])
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_tracked_projects").fetchone()["n"], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_part_tiers").fetchone()["n"], 0)
        viewer = _request(self.app, "POST", "/api/supply/projects/prj_5/release-builds/b1/read-bom", user=self.users["viewer"])
        self.assertEqual(viewer.status, 403)

    def test_the_project_page_rolls_up_the_stored_bom_lines(self) -> None:
        from app.services.supply import usage

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_9")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            self.assertFalse(self.request("prj_9/supply").json["available"])
            with self.store.connection() as conn:
                usage.store_project(conn, "prj_9", "Nine", "rev1", usage.lines_from_components([
                    component("R1", "Acme", "GOOD-1"), component("R2", "Acme", "GOOD-1"), component("C1", "Acme", "UNKNOWN-9"),
                ]), NOW)
            response = self.request("prj_9/supply", query="build_quantity=10")
        self.assertEqual(response.status, 200, response.text)
        rollup = response.json["rollup"]
        self.assertEqual((response.json["available"], rollup["lines"], rollup["tracked"], rollup["not_tracked"], rollup["can_build"]), (True, 2, 1, 1, 2500))
        self.assertEqual(rollup["health_status"], "ok")
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_bom_usage (project_id, variant, line_key, manufacturer, mpn, match_key, quantity) VALUES ('prj_9', 'Lite', 'k', 'Acme', 'GOOD-1', '', 1)")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            lite = self.request("prj_9/supply", query="variant=Lite").json
            nothing = self.request("prj_9/supply", query="variant=Nope").json
        self.assertEqual((lite["available"], lite["variant"], lite["variants"], lite["rollup"]["lines"]), (True, "Lite", ["Lite"], 1))
        self.assertFalse(nothing["available"])

    def test_the_project_page_lists_parts_releases_and_what_changed_since(self) -> None:
        from app.services.supply import usage

        self.part("GOOD-1", stock=5000)
        flaky = self.part("FLAKY-1", stock=900)
        project = SimpleNamespace(id="prj_8")
        with self.store.connection() as conn:
            usage.store_project(conn, "prj_8", "Eight", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("U1", "Acme", "FLAKY-1"), component("C1", "Acme", "UNKNOWN-9"),
            ]), NOW)
            conn.execute(
                "INSERT INTO supply_release_snapshots (id, project_id, build_id, tag, commit_sha, created_by, health, status, assessment) "
                "VALUES ('s1', 'prj_8', 'b1', 'v1', 'abc', 'a@example.com', 9.0, 'ok', %s::jsonb)",
                ('{"parts": 2, "needing_a_look": 0, "lines": [{"part_id": "%s", "manufacturer": "Acme", "mpn": "FLAKY-1", "status": "ok"}]}' % flaky,),
            )
            conn.execute("UPDATE supply_offers SET lifecycle = 'obsolete', stock = 0 WHERE listing_id IN (SELECT id FROM supply_listings WHERE part_id = %s)", (flaky,))
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            body = self.request("prj_8/supply").json
        self.assertTrue(body["available"])
        self.assertEqual(body["parts"][0]["mpn"], "FLAKY-1", "the worst part comes first")
        self.assertEqual({part["mpn"] for part in body["parts"]}, {"GOOD-1", "FLAKY-1", "UNKNOWN-9"})
        self.assertNotIn("builds", body)
        (release,) = body["releases"]
        self.assertEqual(release["tag"], "v1")
        self.assertEqual([item["mpn"] for item in release["changed_since"]], ["FLAKY-1"])
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=SimpleNamespace(id="prj_0")):
            self.assertFalse(self.request("prj_0/supply").json["available"])

    def test_the_page_costs_the_boards_and_spares_it_is_given_and_counts_at_risk_as_error_or_fatal(self) -> None:
        from app.services.supply import usage

        self.part("GOOD-1", stock=5000)
        self.part("WARN-1", stock=900, lifecycle="nrnd")
        self.part("OBS-1", stock=0, lifecycle="obsolete")
        project = SimpleNamespace(id="prj_55", name="Fifty five")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"]]'::jsonb")
            usage.store_project(conn, "prj_55", "Fifty five", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("R2", "Acme", "GOOD-1"), component("U1", "Acme", "WARN-1"), component("U2", "Acme", "OBS-1"),
            ]), NOW)
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            plain = self.request("prj_55/supply", query="build_quantity=10").json
            spared = self.request("prj_55/supply", query="build_quantity=10&spares=10").json
            by_package = self.request("prj_55/supply", query="build_quantity=10&spares=auto").json
            bad = self.request("prj_55/supply", query="spares=lots")
        self.assertEqual(bad.status, 422)
        good = next(part for part in plain["parts"] if part["mpn"] == "GOOD-1")
        self.assertEqual((plain["build_quantity"], good["need"]), (10, 20))
        self.assertEqual(next(part for part in spared["parts"] if part["mpn"] == "GOOD-1")["need"], 22, "20 and 10% spares")
        self.assertGreater(float(spared["rollup"]["cost_build"]), float(plain["rollup"]["cost_build"]), "the spares are bought")
        self.assertEqual(next(part for part in by_package["parts"] if part["mpn"] == "GOOD-1")["need"], 20, "not a small passive: no spares by package")
        self.assertEqual((plain["rollup"]["at_risk"], plain["rollup"]["needs_a_look"]), (1, 2), "a warning needs a look and is not at risk")
        self.assertEqual(float(good["line_cost"]), 10.0, "20 pieces at 0.50")
        self.assertEqual(good["alerts"], 0)

    def test_a_line_bought_in_another_currency_gives_its_unit_price_in_both(self) -> None:
        from app.services.supply import usage

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_56", name="Fifty six")

        def clear() -> None:
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_fx_rates")

        self.addCleanup(clear)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'USD', price_breaks = '[[1, \"0.5\"]]'::jsonb")
            conn.execute("INSERT INTO supply_fx_rates (day, currency, per_eur, source) VALUES (CURRENT_DATE, 'USD', 1.25, 'manual')")
            usage.store_project(conn, "prj_56", "Fifty six", "rev1", usage.lines_from_components([component("R1", "Acme", "GOOD-1")]), NOW)
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            page = self.request("prj_56/supply", query="build_quantity=20").json
        (line,) = page["parts"]
        self.assertEqual(page["rollup"]["currency"], "EUR")
        self.assertEqual((line["unit_price"], line["unit_currency"]), ("0.5", "USD"), "as the distributor quotes it")
        self.assertEqual((float(line["unit_price_in_total"]), float(line["line_cost"])), (0.4, 8.0), "20 at 0.40 EUR")

    def test_a_tracked_projects_cost_is_stored_once_a_day_and_shown_on_its_page(self) -> None:
        from app.services.supply import project_supply, usage

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_7")

        def clear() -> None:
            with self.store.connection() as conn:
                for table in ("supply_tracked_projects", "supply_bom_cost_history", "supply_bom_usage_projects"):
                    conn.execute(f"DELETE FROM {table}")

        clear()
        self.addCleanup(clear)
        with self.store.connection() as conn:
            usage.store_project(conn, "prj_7", "Seven", "rev1", usage.lines_from_components([component("R1", "Acme", "GOOD-1")]), NOW)
            self.assertEqual(project_supply.snapshot_costs(conn, NOW), 0, "a project nobody tracks has no history")
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"]]'::jsonb")
            conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, tracked_by) VALUES ('prj_7', '{\"\"}', 'a@example.com')")
            self.assertEqual(project_supply.snapshot_costs(conn, NOW), 1)
            self.assertEqual(project_supply.snapshot_costs(conn, NOW), 0, "once a day")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            history = self.request("prj_7/supply").json["cost_history"]
        self.assertEqual([(point["cost_per_board"], point["boards"]) for point in history], [("0.5000", 100)])

    def test_the_workspaces_spares_are_the_pages_unless_it_names_its_own(self) -> None:
        from app.services.supply import usage
        from app.services.supply import settings as supply_settings

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_56", name="Fifty six")
        with self.store.connection() as conn:
            usage.store_project(conn, "prj_56", "Fifty six", "rev1", usage.lines_from_components([component("R1", "Acme", "GOOD-1")]), NOW)
            supply_settings.save_form(conn, {"spares_mode": "flat", "spares_percent": 10}, "admin@example.com")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            page = self.request("prj_56/supply", query="build_quantity=10").json
            own = self.request("prj_56/supply", query="build_quantity=10&spares=0").json
        self.assertEqual((page["attrition_percent"], page["parts"][0]["need"]), (10.0, 11), "10 pieces and 10%")
        self.assertEqual((own["attrition_percent"], own["parts"][0]["need"]), (0.0, 10))
        with self.store.connection() as conn:
            supply_settings.save_form(conn, {"spares_mode": "package"}, "admin@example.com")
            self.assertIsNone(supply_settings.load(conn).spares.default_attrition())

    def test_the_cost_curve_equals_single_lookups_and_the_money_goes_to_the_biggest_lines(self) -> None:
        from app.services.supply import bom_lookup, usage

        self.part("GOOD-1", stock=5000)
        self.part("WARN-1", stock=50)
        project = SimpleNamespace(id="prj_57", name="Fifty seven")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"], [100, \"0.4\"], [1000, \"0.2\"]]'::jsonb")
            usage.store_project(conn, "prj_57", "Fifty seven", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("U1", "Acme", "WARN-1"),
            ]), NOW)
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            page = self.request("prj_57/supply", query="build_quantity=250").json
        curve = {point["boards"]: point for point in page["cost_curve"]}
        self.assertEqual(sorted(curve), [1, 10, 100, 250, 1000, 10000], "the usual sizes and the chosen one")
        lines = [bom_lookup.BomLine(row["key"], row["manufacturer"], row["mpn"], row["quantity"], lcsc=row["lcsc"]) for row in self.rows_of("prj_57")]
        with self.store.connection() as conn:
            for boards, point in curve.items():
                single = bom_lookup.lookup(conn, lines, boards, 0)["rollup"]
                self.assertEqual((point["cost_per_board"], point["cost_build"], point["short"]), (single["cost_per_board"], single["cost_build"], single["short"]), boards)
        money = page["money"]
        self.assertEqual(len(money["lines"]), 2)
        self.assertEqual(money["other"]["count"], 0)
        self.assertAlmostEqual(sum(item["share"] for item in money["lines"]) + money["other"]["share"], 1.0, places=3)

    def rows_of(self, project_id: str):
        from app.services.supply import usage

        with self.store.connection() as conn:
            return usage.project_rows(conn, project_id, "")

    def test_the_cost_history_leaves_out_a_day_that_priced_fewer_lines_and_one_price_read_wrong(self) -> None:
        from datetime import date, timedelta

        from app.services.supply import cost_history

        project = SimpleNamespace(id="prj_58", name="Fifty eight")

        def clear() -> None:
            with self.store.connection() as conn:
                for table in ("supply_tracked_projects", "supply_bom_cost_history", "supply_bom_usage_projects"):
                    conn.execute(f"DELETE FROM {table}")

        clear()
        self.addCleanup(clear)
        today = date(2026, 3, 1)
        rows = [(0, "130.0600", 24), (1, "1476446.1400", 147), (2, "300.0000", 147), (3, "310.0000", 147), (4, "305.0000", 147)]
        with self.store.connection() as conn:
            from app.services.supply import usage

            usage.store_project(conn, "prj_58", "Fifty eight", "rev1", usage.lines_from_components([component("R1", "Acme", "GOOD-1")]), NOW)
            for back, cost, priced in rows:
                conn.execute(
                    "INSERT INTO supply_bom_cost_history (project_id, variant, day, cost_per_board, currency, lines, lines_priced, rollup, build_quantity) "
                    "VALUES ('prj_58', '', %s, %s, 'EUR', 150, %s, '{}'::jsonb, 100)", (today - timedelta(days=4 - back), cost, priced))
            kept, left_out = cost_history.series(conn, "prj_58", "", 30)
        self.assertEqual([float(row["cost_per_board"]) for row in kept], [300.0, 310.0, 305.0], "the 24-line day and the day that read one price wrong are out")
        self.assertEqual([(row["day"], float(row["cost_per_board"])) for row in left_out], [(today - timedelta(days=3), 1476446.14)])
        self.assertIsNone(cost_history.change_percent(kept), "no kept day is 30 days before the latest")

    def test_a_changed_currency_starts_a_new_cost_series(self) -> None:
        from datetime import date, timedelta

        from app.services.supply import cost_history

        def clear() -> None:
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_bom_cost_history")

        clear()
        self.addCleanup(clear)
        today = date(2026, 3, 1)
        with self.store.connection() as conn:
            for back, cost, currency in ((40, "12.0000", "EUR"), (35, "12.5000", "EUR"), (0, "18.0000", "USD")):
                conn.execute(
                    "INSERT INTO supply_bom_cost_history (project_id, variant, day, cost_per_board, currency, lines, lines_priced, rollup, build_quantity) "
                    "VALUES ('prj_59', '', %s, %s, %s, 1, 1, '{}'::jsonb, 100)", (today - timedelta(days=back), cost, currency))
            kept, _left_out = cost_history.series(conn, "prj_59", "", 90)
        self.assertEqual([(row["currency"], float(row["cost_per_board"])) for row in kept], [("USD", 18.0)], "the EUR days are another series")
        self.assertIsNone(cost_history.change_percent(kept), "18 USD is not compared with 12 EUR")

    def test_a_tracked_project_is_costed_for_its_usual_build_and_a_changed_one_starts_a_new_series(self) -> None:
        from datetime import timedelta

        from app.services.supply import project_supply, tracking, usage

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_44")

        def clear() -> None:
            with self.store.connection() as conn:
                for table in ("supply_tracked_projects", "supply_bom_cost_history", "supply_bom_usage_projects"):
                    conn.execute(f"DELETE FROM {table}")

        clear()
        self.addCleanup(clear)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"], [100, \"0.25\"]]'::jsonb")
            usage.store_project(conn, "prj_44", "Forty four", "rev1", usage.lines_from_components([component("R1", "Acme", "GOOD-1")]), NOW)
            conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, tracked_by) VALUES ('prj_44', '{\"\"}', 'a@example.com')")
            self.assertEqual(conn.execute("SELECT build_quantity FROM supply_tracked_projects").fetchone()["build_quantity"], 100, "100 boards unless said")
            project_supply.snapshot_costs(conn, NOW - timedelta(days=2))
            tracking.set_usual_build(conn, "prj_44", 1, "a@example.com")
            project_supply.snapshot_costs(conn, NOW - timedelta(days=1))
            project_supply.snapshot_costs(conn, NOW)
            with self.assertRaises(tracking.TrackingError):
                tracking.set_usual_build(conn, "prj_44", 0, "a@example.com")
            rows = conn.execute("SELECT build_quantity, cost_per_board FROM supply_bom_cost_history ORDER BY day").fetchall()
        self.assertEqual([(row["build_quantity"], float(row["cost_per_board"])) for row in rows], [(100, 0.25), (1, 0.5), (1, 0.5)])
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            page = self.request("prj_44/supply").json
        self.assertEqual((page["build_quantity"], page["usual_build"]), (1, 1), "without a size the page opens at the usual build")
        self.assertEqual([point["cost_per_board"] for point in page["cost_history"]], ["0.5000", "0.5000"], "the 100-board days are another series")

    def test_a_tracked_project_row_shows_the_figures_its_page_shows_now(self) -> None:
        from app.services.supply import parts_view, project_supply, tracking, usage

        self.part("GOOD-1", stock=5000)

        def clear() -> None:
            with self.store.connection() as conn:
                for table in ("supply_tracked_projects", "supply_bom_cost_history", "supply_bom_usage_projects"):
                    conn.execute(f"DELETE FROM {table}")

        clear()
        self.addCleanup(clear)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"], [100, \"0.25\"]]'::jsonb")
            lines = usage.lines_from_components([component("R1", "Acme", "GOOD-1"), component("J1", "", "")])
            usage.store_project(conn, "prj_46", "Forty six", "rev1", lines, NOW)
            conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, tracked_by, build_quantity) VALUES ('prj_46', '{\"\"}', 'a@example.com', 1)")

            def row() -> dict:
                groups = parts_view.part_groups(conn, scope="all")["groups"]
                return next(group["stats"] for group in groups if group["project_id"] == "prj_46")

            page = project_supply.overview(conn, "prj_46")["rollup"]
            stats = row()
            self.assertEqual((stats["cost_per_board"], stats["boards"], stats["unchecked"]), (page["cost_per_board"], page["can_build"], 1), "no day was stored")
            tracking.set_usual_build(conn, "prj_46", 100, "a@example.com")
            self.assertEqual((row()["cost_per_board"], row()["build_quantity"]), ("0.2500", 100), "a new usual build shows at once")

    def test_a_changed_usual_build_works_today_out_again_and_a_project_keeps_its_own_spares(self) -> None:
        from app.services.supply import project_supply, tracking, usage

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_45")

        def clear() -> None:
            with self.store.connection() as conn:
                for table in ("supply_tracked_projects", "supply_bom_cost_history", "supply_bom_usage_projects"):
                    conn.execute(f"DELETE FROM {table}")

        clear()
        self.addCleanup(clear)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"], [100, \"0.25\"]]'::jsonb")
            usage.store_project(conn, "prj_45", "Forty five", "rev1", usage.lines_from_components([component("R1", "Acme", "GOOD-1")]), NOW)
            conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, tracked_by, build_quantity) VALUES ('prj_45', '{\"\"}', 'a@example.com', 1)")
            project_supply.snapshot_costs(conn, NOW)
            tracking.set_usual_build(conn, "prj_45", 100, "a@example.com")
            project_supply.snapshot_costs(conn, NOW)
            rows = conn.execute("SELECT build_quantity, cost_per_board FROM supply_bom_cost_history").fetchall()
            self.assertEqual([(row["build_quantity"], float(row["cost_per_board"])) for row in rows], [(100, 0.25)], "today's row is for the new size")
            for bad in ("-1", "101", "lots"):
                with self.assertRaises(tracking.TrackingError):
                    tracking._spares_text(bad)
            self.assertEqual((tracking._spares_text(""), tracking._spares_text("AUTO"), tracking._spares_text("10")), (None, "auto", "10"))
            conn.execute("UPDATE supply_tracked_projects SET spares = '10' WHERE project_id = 'prj_45'")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            own = self.request("prj_45/supply").json
            asked = self.request("prj_45/supply", query="spares=0").json
        self.assertEqual((own["attrition_percent"], own["usual_spares"]), (10.0, "10"), "the page opens on the project's own spares")
        self.assertEqual(asked["attrition_percent"], 0.0, "and a request can still name others")
        self.assertEqual(own["parts"][0]["need"], 110, "10% spares on 100 boards")

    def test_the_costing_prices_the_bom_and_names_the_distributor_and_its_part_number_but_no_link(self) -> None:
        import io
        import zipfile

        from app.services.supply import project_supply, usage

        self.part("GOOD-1", stock=5000)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"]]'::jsonb")
            usage.store_project(conn, "prj_6", "Six", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("R2", "Acme", "GOOD-1"), component("C1", "Acme", "UNKNOWN-9"),
            ]), NOW)
            archive = zipfile.ZipFile(io.BytesIO(project_supply.costing_zip(conn, "prj_6", "", 10)))
        text = archive.read("costing.csv").decode()
        self.assertIn("GOOD-1", text)
        self.assertIn("Total", text)
        self.assertIn("10.00", text, "2 per board x 10 boards x 0.50")
        header = text.splitlines()[0]
        self.assertIn("Distributor,Distributor part number", header)
        self.assertIn("S-GOOD", text, "the distributor's part number for the line")
        self.assertNotIn("http", text.lower())
        by_vendor = {name: archive.read(name).decode() for name in archive.namelist() if name.startswith("costing-by-distributor/")}
        unpriced = by_vendor.pop("costing-by-distributor/No distributor.csv")
        self.assertNotIn("GOOD-1", unpriced, "the second line of a priced part goes with the line that carries its price")
        self.assertIn("UNKNOWN-9", unpriced)
        (priced,) = by_vendor.values()
        self.assertEqual(priced.count("GOOD-1"), 2)

    def test_the_trade_classification_lists_what_distributors_state_and_what_is_missing(self) -> None:
        from app.services.supply import facts, trade, usage

        good = self.part("GOOD-1", stock=5000)
        self.part("OTHER-1", stock=5000)
        with self.store.connection() as conn:
            facts.replace(conn, good, "digikey", [("eccn", "EAR99"), ("hts_us", "8542.33.0001")], NOW)
            facts.replace(conn, good, "mouser", [("eccn", "3A001"), ("hts_eu", "8542339000")], NOW)
            usage.store_project(conn, "prj_5", "Five", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("R2", "Acme", "OTHER-1"), component("C1", "Acme", "UNKNOWN-9"),
            ]), NOW)
            report = trade.build(conn, usage.project_rows(conn, "prj_5", ""))
        csv_text = trade.to_csv(report)
        by_mpn = {item["mpn"]: item for item in report["parts"]}
        self.assertEqual(by_mpn["GOOD-1"]["control"], "disputed")
        self.assertEqual(sorted(by_mpn["GOOD-1"]["eccn"]), ["3A001", "EAR99"])
        self.assertEqual((by_mpn["GOOD-1"]["hts_us"], by_mpn["GOOD-1"]["hts_eu"]), (["8542.33.0001"], ["8542339000"]))
        self.assertEqual(by_mpn["OTHER-1"]["control"], "unknown")
        self.assertIn("No distributor gives an export control class.", by_mpn["OTHER-1"]["gaps"])
        self.assertTrue(by_mpn["UNKNOWN-9"]["gaps"])
        self.assertEqual((report["summary"]["disputed"], report["summary"]["unknown"]), (1, 2))
        self.assertIn("Disputed", csv_text)

    def test_the_costing_zip_holds_the_whole_costing_the_costing_by_distributor_the_compliance_draft_and_the_trade_classification(self) -> None:
        import io
        import zipfile

        from app.services.supply import project_supply, usage

        self.part("GOOD-1", stock=5000)
        project = SimpleNamespace(id="prj_7", name="Seven")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"]]'::jsonb")
            usage.store_project(conn, "prj_7", "Seven", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("C1", "Acme", "UNKNOWN-9"),
            ]), NOW)
            content = project_supply.costing_zip(conn, "prj_7", "", 10)
            self.assertIsNone(project_supply.costing_zip(conn, "prj_none", "", 10))
        names = zipfile.ZipFile(io.BytesIO(content)).namelist()
        self.assertEqual(sorted(name for name in names if "/" not in name), ["compliance.csv", "costing.csv", "trade-classification.csv"])
        vendor_files = [name for name in names if name.startswith("costing-by-distributor/")]
        self.assertEqual(len(vendor_files), 2, "the distributor that prices GOOD-1, and the line that is priced nowhere")
        archive = zipfile.ZipFile(io.BytesIO(content))
        self.assertIn("GOOD-1", archive.read("costing.csv").decode())
        self.assertIn("costing-by-distributor/No distributor.csv", names)
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=project):
            response = self.request("prj_7/costing.zip", query="build_quantity=10")
            missing = self.request("prj_0/costing.zip")
        self.assertEqual((response.status, missing.status), (200, 404))

    def test_one_class_is_none_controlled_or_unknown(self) -> None:
        from app.services.supply import trade

        self.assertEqual([trade.control_of(item) for item in ([], ["EAR99"], ["ear99 "], ["5A992.c"], ["EAR99", "3A001"])],
                         ["unknown", "none", "none", "controlled", "disputed"])

    def test_the_compliance_draft_lists_each_part_with_what_is_known_and_what_is_missing(self) -> None:
        from app.services.supply import compliance_draft, usage

        from app.services.supply import facts

        known = self.part("GOOD-1", stock=10)
        self.part("PLAIN-1", stock=10)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET rohs = TRUE, reach_affected = FALSE WHERE listing_id IN (SELECT id FROM supply_listings WHERE part_id = %s)", (known,))
            facts.replace(conn, known, "digikey", [("rohs_status", "RoHS Compliant By Exemption"), ("reach_status", "REACH Unaffected")], NOW)
            usage.store_project(conn, "prj_7", "Seven", "rev1", usage.lines_from_components([
                component("R1", "Acme", "GOOD-1"), component("R2", "Acme", "GOOD-1"), component("U1", "Acme", "PLAIN-1"),
                component("C1", "Acme", "=EVIL()"), component("J1", "Acme", ""),
            ]), NOW)
            draft = compliance_draft.build(conn, usage.project_rows(conn, "prj_7", ""))
        csv_text = compliance_draft.to_csv(draft)
        by_mpn = {item["mpn"]: item for item in draft["parts"]}
        self.assertEqual((by_mpn["GOOD-1"]["rohs"], by_mpn["GOOD-1"]["reach"], by_mpn["GOOD-1"]["quantity"], by_mpn["GOOD-1"]["references"]), ("compliant", "not affected", 2, "R1 R2"))
        self.assertEqual((by_mpn["GOOD-1"]["rohs_stated"], by_mpn["GOOD-1"]["reach_stated"]),
                         ("RoHS Compliant By Exemption (DigiKey)", "REACH Unaffected (DigiKey)"))
        self.assertIn("RoHS compliant by exemption: name the exemption in the declaration.", by_mpn["GOOD-1"]["gaps"])
        self.assertEqual(by_mpn["PLAIN-1"]["rohs_stated"], "")
        self.assertIn("No RoHS statement from any distributor.", by_mpn["PLAIN-1"]["gaps"])
        self.assertIn("Prism does not track this part, so nothing is known about it.", by_mpn["=EVIL()"]["gaps"])
        self.assertEqual(draft["summary"]["parts"], 4, "the line without a part number is listed, with nothing known about it")
        self.assertIn("No part number on the BOM line.", by_mpn[""]["gaps"])
        self.assertIn("'=EVIL()", csv_text)
        self.assertNotIn(",=EVIL()", csv_text)
        self.assertEqual(compliance_draft.to_csv({"parts": []}).strip(), ",".join(compliance_draft.HEADER))
        summary = draft["summary"]
        self.assertEqual((summary["candidate_list_loaded"], summary["note"]), (False, compliance_draft.LIST_NOT_LOADED))
        self.assertFalse(any(compliance_draft.LIST_NOT_LOADED in gap for item in by_mpn.values() for gap in item["gaps"]), "said once, not per part")
        self.assertIn(compliance_draft.LIST_NOT_LOADED, csv_text)

    def test_who_may_look_and_a_project_the_caller_cannot_open_is_not_found(self) -> None:
        self.assertEqual(self.request("p/release-builds/b/check", role="viewer").status, 403)
        from fastapi import HTTPException

        with mock.patch("app.api.supply_release.get_project_for_role_or_404", side_effect=HTTPException(status_code=404, detail="Project not found")):
            self.assertEqual(self.request("p/release-check").status, 404)
            self.assertEqual(self.request("p/releases/b/supply").status, 404)

    def test_the_snapshot_job_freezes_the_release_bom_and_the_status_follows(self) -> None:
        from app.services.supply import release_snapshot

        self.part("GOOD-1", stock=5000)
        with mock.patch("app.services.supply.release_snapshot.supply_store", self.store), \
                mock.patch("app.services.supply.release_snapshot.release_source.build_bom_text", return_value=self.BOM_CSV), \
                mock.patch("app.services.supply.release_snapshot.catalog_read.component_ids_by_part", return_value={}):
            queue = mock.Mock()
            self.assertTrue(release_snapshot.queue("prj_1", "bld_9", "v9", "b" * 40, "qa@example.com", job_service=queue))
            self.assertEqual(self.status_of("prj_1", "bld_9")["state"], "running")
            self.assertEqual(queue.enqueue.call_args.kwargs["artifact_key"], "supply-snapshot:bld_9")
            self.assertEqual(release_snapshot.take("prj_1", "bld_9", "v9", "b" * 40, "qa@example.com"), "taken")
            self.assertEqual(self.status_of("prj_1", "bld_9")["state"], "done")
            self.assertEqual(release_snapshot.take("prj_1", "bld_9", "v9", "b" * 40, "qa@example.com"), "taken", "asking twice is harmless")
        with mock.patch("app.api.supply_release.get_project_for_role_or_404", return_value=SimpleNamespace(id="prj_1")):
            response = self.request("prj_1/releases/bld_9/supply")
            status = self.request("prj_1/releases/bld_9/supply-status")
        self.assertEqual((response.status, response.json["tag"], status.json["state"]), (200, "v9", "done"))

    def test_a_build_without_a_bom_records_why_there_is_no_snapshot(self) -> None:
        from app.services.supply import release_snapshot, release_source

        with mock.patch("app.services.supply.release_snapshot.supply_store", self.store), \
                mock.patch("app.services.supply.release_snapshot.release_source.build_bom_text", side_effect=release_source.NoBuildBom("This build exported no BOM file.")):
            self.assertEqual(release_snapshot.take("prj_1", "bld_x", "vx", "c" * 40, "qa@example.com"), "failed")
            self.assertEqual(self.status_of("prj_1", "bld_x"), {"state": "failed", "done": 0, "total": 1, "failed": 1, "reason": "This build exported no BOM file."})
        self.assertEqual(self.status_of("prj_1", "never"), {"state": "none", "done": 0, "total": 0, "failed": 0, "reason": ""})

    def test_queueing_never_raises_and_says_when_it_could_not(self) -> None:
        from app.services.supply import release_snapshot

        with mock.patch("app.services.supply.release_snapshot.supply_store", self.store):
            broken = mock.Mock()
            broken.enqueue.side_effect = RuntimeError("down")
            self.assertFalse(release_snapshot.queue("prj_1", "bld_q", "vq", "d" * 40, "qa@example.com", job_service=broken))
            self.assertEqual(self.status_of("prj_1", "bld_q")["state"], "failed")

    def status_of(self, project_id: str, build_id: str) -> dict:
        from app.services.supply import release_snapshot

        # Closed before returning: a connection left in a transaction blocks dropping the test schema.
        with self.store.connection() as conn:
            return release_snapshot.status_of(conn, project_id, build_id)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply tests")
class KeptRollupTests(unittest.TestCase):
    """A tracked project's usual-build rollup is kept, and worked out again only after something it is made from changed."""

    setUpClass = ReleaseCheckTests.__dict__["setUpClass"]
    tearDownClass = ReleaseCheckTests.__dict__["tearDownClass"]
    setUp = ReleaseCheckTests.setUp
    part = ReleaseCheckTests.part

    def track(self, project_id: str, bom) -> dict:
        from app.services.supply import tracking, usage

        def clear() -> None:
            with self.store.connection() as conn:
                for table in ("supply_tracked_projects", "supply_bom_usage_projects", "supply_project_rollups"):
                    conn.execute(f"DELETE FROM {table}")

        clear()
        self.addCleanup(clear)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET currency = 'EUR', price_breaks = '[[1, \"0.5\"], [100, \"0.25\"]]'::jsonb")
            usage.store_project(conn, project_id, project_id, "rev1", lines(bom), NOW)
            conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, tracked_by, build_quantity) VALUES (%s, '{\"\"}', 'a@example.com', 10)", (project_id,))
            return tracking.tracked_project(conn, project_id)

    def rollup(self, project: dict, *, fresh: bool):
        """The rollup, asserting whether it was worked out (``fresh``) or read as kept."""

        from app.services.supply import bom_lookup, project_supply

        with mock.patch.object(bom_lookup, "load", wraps=bom_lookup.load) as load, self.store.connection() as conn:
            found = project_supply.usual_rollup(conn, project, "")
        self.assertEqual(load.called, fresh, "worked out" if fresh else "read as kept")
        return found

    def test_a_kept_rollup_is_read_until_one_of_its_parts_changes(self) -> None:
        part_id = self.part("GOOD-1", stock=5000)
        project = self.track("prj_k1", [component("R1", "Acme", "GOOD-1"), component("J1")])
        first = self.rollup(project, fresh=True)
        self.assertEqual(self.rollup(project, fresh=False), first, "nothing changed")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET stock = 3 WHERE listing_id IN (SELECT id FROM supply_listings WHERE part_id = %s)", (part_id,))
        changed = self.rollup(project, fresh=True)
        self.assertEqual((first["can_build"], changed["can_build"]), (5000, 3))
        self.assertEqual(changed["not_tracked"], 1, "the line with no number")

    def test_a_new_usual_build_or_a_workspace_setting_makes_it_stale(self) -> None:
        from app.services.supply import tracking

        self.part("GOOD-1", stock=5000)
        project = self.track("prj_k2", [component("R1", "Acme", "GOOD-1")])
        self.rollup(project, fresh=True)
        with self.store.connection() as conn:
            tracking.set_usual_build(conn, "prj_k2", 20, "a@example.com")
            project = tracking.tracked_project(conn, "prj_k2")
        self.rollup(project, fresh=True)
        self.rollup(project, fresh=False)
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_dirty (kind, key) VALUES ('rollup', '*')")
        self.rollup(project, fresh=True)

    def test_a_kept_rollup_reads_as_a_fresh_one_and_the_dashboard_row_matches_it(self) -> None:
        from app.services.supply import parts_view

        self.part("GOOD-1", stock=5000)
        project = self.track("prj_k3", [component("R1", "Acme", "GOOD-1")])
        fresh = self.rollup(project, fresh=True)
        self.assertEqual(self.rollup(project, fresh=False), fresh)
        from app.services.supply import dashboard

        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_part_tiers (part_id, tier, rate) SELECT id, 1, 'daily' FROM supply_parts ON CONFLICT DO NOTHING")
            (row,) = [group for group in parts_view.part_groups(conn, scope="watched")["groups"] if group["project_id"] == "prj_k3"]
            (dash,) = [item for item in dashboard.build(conn, NOW)["projects"] if item["project_id"] == "prj_k3"]
        self.assertEqual((row["stats"]["boards"], row["stats"]["cost_per_board"]), (fresh["can_build"], format(Decimal(fresh["cost_per_board"]), "f")))
        self.assertEqual((dash["count"], dash["statuses"], dash["stats"]), (row["count"], row["statuses"], row["stats"]), "the Dashboard row is the Projects row")

    def test_a_project_the_caller_may_not_see_is_left_out_of_the_dashboard(self) -> None:
        import json

        from app.services.supply import dashboard, usage

        self.part("GOOD-1", stock=5000)
        self.track("prj_seen", [component("R1", "Acme", "GOOD-1")])

        def clear() -> None:
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_bom_cost_history WHERE project_id IN ('prj_seen', 'prj_hidden')")

        self.addCleanup(clear)
        with self.store.connection() as conn:
            usage.store_project(conn, "prj_hidden", "Private customer board", "rev1", lines([component("R1", "Acme", "GOOD-1")]), NOW)
            conn.execute("INSERT INTO supply_tracked_projects (project_id, variants, tracked_by, build_quantity) VALUES ('prj_hidden', '{\"\"}', 'a@example.com', 10)")
            for project_id in ("prj_seen", "prj_hidden"):
                conn.execute(
                    "INSERT INTO supply_bom_cost_history (project_id, variant, day, cost_per_board, currency, lines, lines_priced, build_quantity) "
                    "VALUES (%s, '', %s, 1, 'EUR', 1, 1, 10)", (project_id, NOW.date()),
                )
            with mock.patch.object(usage, "visible_project_ids", return_value={"prj_seen"}):
                built = dashboard.build(conn, NOW, role="designer")
            everyone = dashboard.build(conn, NOW)
        self.assertEqual([row["project_id"] for row in built["projects"]], ["prj_seen"])
        self.assertEqual([row["project_id"] for row in built["project_costs"]], ["prj_seen"])
        self.assertNotIn("Private customer board", json.dumps(built, default=str))
        self.assertEqual(sorted(row["project_id"] for row in everyone["projects"]), ["prj_hidden", "prj_seen"], "internal callers see all")

    def test_trimming_keeps_the_marks_a_kept_rollup_still_depends_on(self) -> None:
        from app.services.supply import retention

        part_id = self.part("GOOD-1", stock=5000)
        project = self.track("prj_k4", [component("R1", "Acme", "GOOD-1")])
        self.rollup(project, fresh=True)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET stock = 7 WHERE listing_id IN (SELECT id FROM supply_listings WHERE part_id = %s)", (part_id,))
        with self.store.connection() as conn:
            retention.trim_summaries(conn)
        self.assertEqual(self.rollup(project, fresh=True)["can_build"], 7)
