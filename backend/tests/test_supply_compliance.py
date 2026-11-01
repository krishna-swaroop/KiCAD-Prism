"""REACH and RoHS: parsing the Candidate List, declarations, the finding, the API. Parsing needs nothing; the rest needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import compliance  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
# Lead(II) oxide-style CAS numbers with valid check digits: 7439-92-1 (lead), 7440-43-9 (cadmium), 1333-82-0 (chromium trioxide).
ECHA = (
    "Substance name,EC No.,CAS No.,Date of inclusion,Reason\n"
    "Lead,231-100-4,7439-92-1,2018-06-27,Toxic for reproduction\n"
    "Cadmium,231-152-8,7440-43-9,15/06/2010,Carcinogenic\n"
    "Chromium trioxide,215-607-8,1333-82-0,2010-01-01,Carcinogenic\n"
    "Broken row,000-000-0,12-3-4,2020-01-01,Bad CAS\n"
)


class ParseTests(unittest.TestCase):
    def test_cas_numbers_are_checked_by_their_check_digit(self) -> None:
        self.assertTrue(all(compliance.valid_cas(number) for number in ("7439-92-1", "7440-43-9", "1333-82-0")))
        self.assertFalse(any(compliance.valid_cas(number) for number in ("7439-92-2", "12-3-4", "", "abc")))

    def test_an_echa_export_gives_its_substances_and_skips_rows_without_a_valid_cas(self) -> None:
        items = compliance.parse_list(ECHA)
        self.assertEqual([(i["cas"], i["name"]) for i in items], [("7439-92-1", "Lead"), ("7440-43-9", "Cadmium"), ("1333-82-0", "Chromium trioxide")])
        self.assertEqual(items[1]["added_on"], date(2010, 6, 15))
        self.assertEqual(items[0]["ec"], "231-100-4")

    def test_semicolons_and_several_numbers_in_a_cell_are_read(self) -> None:
        items = compliance.parse_list("Name;CAS\nLead compounds;7439-92-1 / 7440-43-9\n")
        self.assertEqual([i["cas"] for i in items], ["7439-92-1", "7440-43-9"])

    def test_title_rows_above_the_header_are_skipped(self) -> None:
        text = 'Candidate List of substances\n\nExported 2026-01-01\n"Substance name","EC No.","CAS No."\n"Lead","231-100-4","7439-92-1"\n'
        self.assertEqual([i["cas"] for i in compliance.parse_list(text)], ["7439-92-1"])

    def test_an_excel_file_is_read_like_the_csv_with_title_rows_and_dates(self) -> None:
        import io
        from datetime import date

        from openpyxl import Workbook

        book = Workbook()
        sheet = book.active
        sheet.append(["Candidate List of substances"])
        sheet.append([])
        sheet.append(["Substance name", "EC No.", "CAS No.", "Date of inclusion"])
        sheet.append(["Lead", "231-100-4", "7439-92-1", date(2012, 12, 19)])
        buffer = io.BytesIO()
        book.save(buffer)
        items = compliance.parse_list(compliance.csv_from_xlsx(buffer.getvalue()))
        self.assertEqual([(i["cas"], i["name"], i["ec"], i["added_on"]) for i in items], [("7439-92-1", "Lead", "231-100-4", date(2012, 12, 19))])
        for junk in (b"", b"not a zip", b"PK\x03\x04 broken"):
            with self.assertRaises(compliance.ComplianceError):
                compliance.csv_from_xlsx(junk)

    def test_a_file_without_the_columns_or_without_substances_is_refused(self) -> None:
        for text in ("", "Foo,Bar\n1,2\n", "Name,CAS\nLead,not-a-cas\n"):
            with self.assertRaises(compliance.ComplianceError):
                compliance.parse_list(text)

    def test_standing_is_affected_clear_or_unknown_and_never_clear_by_silence(self) -> None:
        self.assertEqual(compliance.standing([], [])["state"], "unknown")
        self.assertEqual(compliance.standing([{"reach_affected": False}], [])["state"], "clear")
        self.assertEqual(compliance.standing([{"reach_affected": False}, {"reach_affected": True}], [])["state"], "affected")
        self.assertEqual(compliance.standing([{"reach_affected": False}], ["Lead"])["state"], "affected")


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class ComplianceApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_compliance, supply_connectors
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
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_comp_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_compliance.router)
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
            for table in ("supply_rohs_exemptions", "supply_part_facts", "supply_part_substances", "supply_svhc_list", "supply_svhc_substances", "supply_offers", "supply_listings", "supply_parts", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
            conn.execute("INSERT INTO supply_connectors (id, provider) VALUES ('c1', 'fake')")
            self.part = self.parts.ensure_part(conn, "Acme", "ABC-1", "seed@example.com").id

    def test_the_list_can_be_sent_as_an_excel_file(self) -> None:
        import base64
        import io

        from openpyxl import Workbook

        book = Workbook()
        book.active.append(["Substance name", "CAS No."])
        book.active.append(["Lead", "7439-92-1"])
        buffer = io.BytesIO()
        book.save(buffer)
        sent = base64.b64encode(buffer.getvalue()).decode()
        loaded = self.call("POST", "/api/supply/compliance/svhc", body={"xlsx_base64": sent, "source_name": "list.xlsx"})
        self.assertEqual((loaded.status, loaded.json["substances"]), (200, 1), loaded.text)
        for body in ({}, {"csv": ECHA, "xlsx_base64": sent}, {"xlsx_base64": "%%%"}, {"xlsx_base64": base64.b64encode(b"nope").decode()}):
            self.assertEqual(self.call("POST", "/api/supply/compliance/svhc", body=body).status, 400, body)

    def offer(self, *, rohs=None, reach=None) -> None:
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES ('l1', 'c1', 'A', %s, 'x', 'Acme', 'exact')",
                (self.part,))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, rohs, reach_affected) VALUES ('l1', %s, 100, %s, %s)", (NOW, rohs, reach))

    def call(self, method, path, *, role="admin", body=None):
        return _request(self.app, method, path, user=self.users[role], body=body)

    def findings(self) -> dict[str, str]:
        with self.store.connection() as conn:
            result = self.service.assess_parts(conn, [self.part], now=NOW)[self.part]
        return {f["check"]: f["scope"] for f in result["findings"]}

    def test_only_an_administrator_loads_the_list_and_it_replaces_the_one_before(self) -> None:
        self.assertEqual(self.call("POST", "/api/supply/compliance/svhc", role="designer", body={"csv": ECHA}).status, 403)
        loaded = self.call("POST", "/api/supply/compliance/svhc", body={"csv": ECHA, "source_name": "candidate-list.csv"})
        self.assertEqual((loaded.status, loaded.json["substances"], loaded.json["source_name"]), (200, 3, "candidate-list.csv"))
        again = self.call("POST", "/api/supply/compliance/svhc", body={"csv": "Name,CAS\nLead,7439-92-1\n"})
        self.assertEqual(again.json["substances"], 1)
        self.assertEqual(self.call("POST", "/api/supply/compliance/svhc", body={"csv": "Foo,Bar\n"}).status, 400)
        self.assertEqual(self.call("GET", "/api/supply/compliance/svhc", role="qa").json["substances"], 1)

    def test_a_declared_substance_on_the_list_is_a_finding_and_one_off_the_list_is_not(self) -> None:
        self.offer(rohs=True)
        self.call("POST", "/api/supply/compliance/svhc", body={"csv": ECHA})
        self.assertEqual(self.call("POST", f"/api/supply/parts/{self.part}/substances", role="qa", body={"cas": "7439-92-1"}).status, 403)
        self.assertEqual(self.call("POST", f"/api/supply/parts/{self.part}/substances", role="designer", body={"cas": "1234-56-7"}).status, 400)
        self.assertEqual(self.call("POST", f"/api/supply/parts/{self.part}/substances", role="designer", body={"cas": "64-17-5", "note": "ethanol"}).status, 204)
        self.assertNotIn("reach_svhc", self.findings())
        self.assertEqual(self.call("POST", f"/api/supply/parts/{self.part}/substances", role="designer", body={"cas": "7439-92-1", "note": "solder"}).status, 204)
        self.assertEqual(self.findings()["reach_svhc"], "svhc_declared")
        view = self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json
        self.assertEqual(view["reach"]["state"], "affected")
        self.assertEqual({item["cas"]: item["listed_as"] for item in view["substances"]}, {"64-17-5": None, "7439-92-1": "Lead"})
        self.assertEqual(self.call("DELETE", f"/api/supply/parts/{self.part}/substances/7439-92-1", role="designer").status, 204)
        self.assertNotIn("reach_svhc", self.findings())

    def test_a_rohs_exemption_is_named_by_a_person_and_goes_into_the_draft(self) -> None:
        from app.services.supply import compliance_draft, usage

        self.offer(rohs=True)
        path = f"/api/supply/parts/{self.part}/exemptions"
        self.assertEqual(self.call("POST", path, role="qa", body={"code": "7(a)"}).status, 403)
        self.assertEqual(self.call("POST", path, role="designer", body={"code": "!!"}).status, 400)
        self.assertEqual(self.call("POST", path, role="designer", body={"code": "7(a)", "note": "lead in high melting solder"}).status, 204)
        view = self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json
        self.assertEqual([item["code"] for item in view["exemptions"]], ["7(a)"])
        with self.store.connection() as conn:
            draft = compliance_draft.build(conn, [{"key": "k", "manufacturer": "Acme", "mpn": "ABC-1", "quantity": 1, "references": "U1"}])
        self.assertEqual(draft["parts"][0]["exemptions"], ["7(a)"])
        self.assertIn("RoHS exemptions", compliance_draft.to_csv(draft))
        self.assertEqual(self.call("DELETE", f"{path}/7(a)", role="designer").status, 204)
        self.assertEqual(self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json["exemptions"], [])

    def test_a_distributors_reach_flag_is_a_finding_and_rohs_is_reported(self) -> None:
        self.offer(rohs=True, reach=True)
        self.assertEqual(self.findings()["reach_svhc"], "reach_flag")
        view = self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json
        self.assertEqual((view["rohs"]["state"], view["reach"]["state"]), ("compliant", "affected"))

    def test_rohs_is_the_offers_and_the_stated_status_only_when_no_offer_says(self) -> None:
        self.offer()
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'digikey', 'rohs_status', 'Non-compliant', %s)",
                (self.part, NOW))
        view = self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json
        self.assertEqual(view["rohs"]["state"], "not_compliant")
        self.assertEqual(self.findings()["rohs_noncompliant"], "rohs_false")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET rohs = true")
        view = self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json
        self.assertEqual(view["rohs"]["state"], "compliant")
        self.assertNotIn("rohs_noncompliant", self.findings())

    def test_without_any_word_on_reach_it_is_unknown_and_there_is_no_finding(self) -> None:
        self.offer()
        view = self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="qa").json
        self.assertEqual((view["rohs"]["state"], view["reach"]["state"], view["list"]["loaded"]), ("unknown", "unknown", False))
        self.assertNotIn("reach_svhc", self.findings())
        self.assertEqual(self.call("GET", f"/api/supply/parts/{self.part}/compliance", role="viewer").status, 403)
        self.assertEqual(self.call("GET", "/api/supply/parts/nope/compliance").status, 404)


if __name__ == "__main__":
    unittest.main()
