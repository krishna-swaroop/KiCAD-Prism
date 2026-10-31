"""Reading the first sheet of an Excel file: uploaded BOMs and the ECHA candidate list. No database."""

from __future__ import annotations

import base64
import io
import sys
import unittest
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import compliance, spreadsheet  # noqa: E402


def _workbook(*rows: list[object]) -> bytes:
    from openpyxl import Workbook

    book = Workbook()
    sheet = book.active
    for row in rows:
        sheet.append(row)
    book.create_sheet("Second").append(["never read"])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


LIMITS = {"max_bytes": 2 * 1024 * 1024, "max_unpacked": 40 * 1024 * 1024}


class FirstSheetTests(unittest.TestCase):
    def test_reads_the_first_sheet_as_text(self) -> None:
        data = _workbook(["Manufacturer", "MPN", "Qty"], ["Acme", "R-10K", 2], ["Globex", "LM358", 4.0], ["Initech", "C1", 0.5])
        self.assertEqual(
            spreadsheet.first_sheet_rows(data, **LIMITS),
            [["Manufacturer", "MPN", "Qty"], ["Acme", "R-10K", "2"], ["Globex", "LM358", "4"], ["Initech", "C1", "0.5"]],
        )

    def test_dates_read_as_iso_days_and_blank_rows_are_left_out(self) -> None:
        data = _workbook(["Added"], [None], [datetime(2026, 1, 15, 9, 30)])
        self.assertEqual(spreadsheet.first_sheet_rows(data, **LIMITS), [["Added"], ["2026-01-15"]])

    def test_a_file_over_the_byte_limit_is_refused(self) -> None:
        with self.assertRaisesRegex(spreadsheet.SpreadsheetError, "larger than 1 MB"):
            spreadsheet.first_sheet_rows(b"x" * (1024 * 1024 + 1), max_bytes=1024 * 1024, max_unpacked=LIMITS["max_unpacked"])

    def test_an_archive_that_unpacks_too_large_is_refused_before_opening(self) -> None:
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/big.xml", b"0" * 200_000)
        with self.assertRaisesRegex(spreadsheet.SpreadsheetError, "too large once unpacked"):
            spreadsheet.first_sheet_rows(out.getvalue(), max_bytes=LIMITS["max_bytes"], max_unpacked=100_000)

    def test_a_file_that_is_not_a_spreadsheet_is_refused(self) -> None:
        with self.assertRaisesRegex(spreadsheet.SpreadsheetError, "not a readable Excel spreadsheet"):
            spreadsheet.first_sheet_rows(b"Manufacturer,MPN\nAcme,R-10K\n", **LIMITS)

    def test_the_candidate_list_reads_through_the_same_reader(self) -> None:
        data = _workbook(["Substance name", "CAS number"], ["Lead", "7439-92-1"])
        self.assertEqual(compliance.csv_from_xlsx(data).splitlines(), ["Substance name,CAS number", "Lead,7439-92-1"])


class SheetEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_bom
        from app.core.security import AuthenticatedUser

        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_bom.router)
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "designer")}

    def _post(self, role: str, body: dict) -> tuple[int, object]:
        response = _request(self.app, "POST", "/api/supply/bom/sheet", user=self.users[role], body=body)
        return response.status, response.json

    def test_returns_the_rows_of_an_uploaded_bom(self) -> None:
        encoded = base64.b64encode(_workbook(["MPN", "Qty"], ["LM358", 3])).decode()
        self.assertEqual(self._post("designer", {"xlsx_base64": encoded}), (200, {"rows": [["MPN", "Qty"], ["LM358", "3"]]}))

    def test_a_damaged_upload_is_a_bad_request(self) -> None:
        status, body = self._post("designer", {"xlsx_base64": "not base64!"})
        self.assertEqual(status, 400)
        self.assertEqual(body["detail"], "The Excel file did not arrive intact.")

    def test_roles_that_cannot_read_supply_are_refused(self) -> None:
        encoded = base64.b64encode(_workbook(["MPN"])).decode()
        self.assertEqual(self._post("viewer", {"xlsx_base64": encoded})[0], 403)


if __name__ == "__main__":
    unittest.main()
