"""The part number key and the CSV offers format. No database or network."""

from __future__ import annotations

import sys
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import csv_format  # noqa: E402
from app.services.supply.csv_format import parse_offers_csv  # noqa: E402
from app.services.supply.identity import match_key  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402

HEADER = "sku,mpn,manufacturer,stock"


def parse(text: str, **kwargs):
    return parse_offers_csv(text.encode("utf-8"), **kwargs)


def errors_of(text: str, **kwargs) -> list[tuple[int, str, str]]:
    return [(e.line, e.column, e.message) for e in parse(text, **kwargs).errors]


class MatchKeyTests(unittest.TestCase):
    def test_ignores_case_whitespace_and_dashes(self) -> None:
        for variant in ("LM358-D", "lm358d", " LM 358 D ", "LM358_D",
                        "LM358" + chr(0x2013) + "D", "LM358" + chr(0x2212) + "D", "LM358" + chr(0x2014) + "D"):
            self.assertEqual(match_key(variant), "LM358D", variant)

    def test_keeps_characters_that_carry_meaning(self) -> None:
        self.assertNotEqual(match_key("1.0UF"), match_key("10UF"))
        self.assertNotEqual(match_key("A/B"), match_key("AB"))
        self.assertEqual(match_key("0603B104K500CT"), "0603B104K500CT")

    def test_blank_input(self) -> None:
        self.assertEqual(match_key(""), "")
        self.assertEqual(match_key("  - _ "), "")
        self.assertEqual(match_key(None), "")  # type: ignore[arg-type]

    def test_full_width_forms_fold(self) -> None:
        self.assertEqual(match_key("ＡＢＣ１２３"), "ABC123")


class ParseHappyPathTests(unittest.TestCase):
    def test_the_template_parses_cleanly(self) -> None:
        parsed = parse(csv_format.TEMPLATE)
        self.assertEqual(parsed.error_count, 0)
        (row,) = parsed.rows
        self.assertEqual((row.sku, row.mpn, row.manufacturer, row.stock), ("EXAMPLE-1", "ABC123", "Acme", 1200))
        self.assertEqual(row.currency, "EUR")
        self.assertEqual(row.packaging, Packaging.CUT_TAPE)
        self.assertEqual(row.lifecycle, Lifecycle.ACTIVE)
        self.assertEqual([(b.quantity, b.unit_price) for b in row.price_breaks],
                         [(1, Decimal("0.52")), (10, Decimal("0.44")), (100, Decimal("0.31"))])

    def test_defaults(self) -> None:
        (row,) = parse(f"{HEADER}\nS1,M1,Acme,5").rows
        self.assertEqual((row.moq, row.order_multiple, row.lead_time_days), (1, 1, None))
        self.assertEqual((row.packaging, row.lifecycle), (Packaging.UNKNOWN, Lifecycle.UNKNOWN))
        self.assertEqual((row.discontinued, row.rohs, row.incoming, row.price_breaks), (False, None, None, ()))

    def test_semicolon_files_with_comma_decimals_and_a_bom(self) -> None:
        text = "﻿sku;mpn;manufacturer;stock;currency;price_1;price_10\nS1;M1;Acme;1200;eur;0,52;0,44\n"
        parsed = parse_offers_csv(text.encode("utf-8"))
        self.assertEqual(parsed.error_count, 0, parsed.errors)
        self.assertEqual([b.unit_price for b in parsed.rows[0].price_breaks], [Decimal("0.52"), Decimal("0.44")])
        self.assertEqual(parsed.rows[0].currency, "EUR")

    def test_tab_separated(self) -> None:
        (row,) = parse("sku\tmpn\tmanufacturer\tstock\nS1\tM1\tAcme\t9").rows
        self.assertEqual(row.stock, 9)

    def test_header_variants_and_aliases(self) -> None:
        text = ("Supplier Part Number,Manufacturer Part Number,Mfr,Qty,Price @ 10,Price 1,Min Order Qty\n"
                "S1,M1,Acme,7,0.4,0.5,10\n")
        parsed = parse(text, default_currency="gbp")
        self.assertEqual(parsed.error_count, 0, parsed.errors)
        row = parsed.rows[0]
        self.assertEqual((row.sku, row.mpn, row.manufacturer, row.stock, row.moq), ("S1", "M1", "Acme", 7, 10))
        self.assertEqual([b.quantity for b in row.price_breaks], [1, 10], "price breaks come out in ascending order")
        self.assertEqual(row.currency, "GBP")

    def test_quoted_fields_and_blank_lines(self) -> None:
        parsed = parse(f'{HEADER}\n\n"S,1","M ""1""",Acme,3\n\n')
        self.assertEqual((parsed.rows[0].sku, parsed.rows[0].mpn), ("S,1", 'M "1"'))

    def test_optional_fields(self) -> None:
        text = (f"{HEADER},packaging,lifecycle,discontinued,rohs,product_url,incoming_qty,incoming_date,lead_time_days\n"
                "S1,M1,Acme,0,Tape & Reel,NRND,yes,no,https://example.com/p,500,2026-04-01,84\n")
        (row,) = parse(text).rows
        self.assertEqual((row.packaging, row.lifecycle), (Packaging.TAPE_REEL, Lifecycle.NRND))
        self.assertEqual((row.discontinued, row.rohs, row.lead_time_days), (True, False, 84))
        self.assertEqual((row.incoming.quantity, row.incoming.expected), (500, date(2026, 4, 1)))

    def test_jlcpcb_library_class_and_preference(self) -> None:
        text = f"{HEADER},jlc_library,jlc_preferred\nS1,M1,Acme,1,Extended,yes\nS2,M2,Acme,1,basic,no\n"
        rows = parse(text).rows
        self.assertEqual([(row.jlc_library, row.jlc_preferred) for row in rows], [("Extended", True), ("Basic", False)])
        self.assertEqual(errors_of(f"{HEADER},jlc_library\nS1,M1,Acme,1,preferred"),
                         [(2, "jlc_library", "Unknown JLCPCB library. Use one of: Basic, Extended.")])

    def test_unknown_columns_are_reported_not_fatal(self) -> None:
        parsed = parse(f"{HEADER},notes,\nS1,M1,Acme,1,hello,x\n")
        self.assertEqual(parsed.error_count, 0)
        self.assertEqual(parsed.ignored_columns, ("notes", "(blank)"))


class ParseErrorTests(unittest.TestCase):
    def test_rejects_unreadable_files(self) -> None:
        self.assertEqual(parse_offers_csv(b"\xff\xfe\x00bad").errors[0].message,
                         "The file is not UTF-8. Save it as CSV UTF-8.")
        self.assertEqual(errors_of("   \n "), [(0, "", "The file is empty.")])
        self.assertEqual(errors_of(HEADER), [(1, "", "The file has a header but no rows.")])
        with mock.patch.object(csv_format, "MAX_BYTES", 10):
            self.assertIn("larger than", parse(f"{HEADER}\nS1,M1,Acme,1").errors[0].message)

    def test_missing_and_duplicate_columns(self) -> None:
        self.assertEqual(errors_of("sku,mpn\nS1,M1"), [(1, "", "Missing columns: manufacturer, stock.")])
        found = errors_of("sku,sku,mpn,manufacturer,stock\nS1,S1,M1,A,1")
        self.assertEqual(found[0], (1, "sku", "Duplicate column."))

    def test_a_bad_file_returns_no_rows(self) -> None:
        parsed = parse(f"{HEADER}\nS1,M1,Acme,1\nS2,M2,Acme,oops\n")
        self.assertEqual(parsed.rows, ())
        self.assertEqual(parsed.error_count, 1)

    def test_errors_name_the_line_and_column(self) -> None:
        found = errors_of(f"{HEADER}\nS1,M1,Acme,1\n\nS2,M2,Acme,12.5\n,M3,Acme,-1\n")
        self.assertIn((4, "stock", "A whole number, digits only."), found)
        self.assertIn((5, "sku", "Required."), found)
        self.assertIn((5, "stock", "A whole number, digits only."), found)

    def test_a_row_reports_every_bad_cell(self) -> None:
        text = (f"{HEADER},packaging,lifecycle,rohs,product_url,moq\n"
                "S1,M1,Acme,,wooden,dead,maybe,http://x.test,0\n")
        columns = [column for _, column, _ in errors_of(text)]
        self.assertEqual(sorted(columns), ["lifecycle", "moq", "packaging", "product_url", "rohs", "stock"])

    def test_prices_and_currency(self) -> None:
        self.assertEqual(errors_of(f"{HEADER},price_1\nS1,M1,Acme,1,0.5"),
                         [(2, "currency", "Set a currency here or on the connector.")])
        self.assertEqual(errors_of(f"{HEADER},price_1\nS1,M1,Acme,1,0.5", default_currency="EUR"), [])
        found = errors_of(f"{HEADER},currency,price_1,price_10\nS1,M1,Acme,1,EURO,abc,-2")
        self.assertIn((2, "currency", "A three letter code such as EUR."), found)
        self.assertIn((2, "price_1", "A price such as 0.52."), found)
        self.assertIn((2, "price_10", "A price of zero or more."), found)
        self.assertEqual(errors_of(f"{HEADER},price_0,currency\nS1,M1,Acme,1,0.5,EUR"),
                         [(2, "price_0", "Quantity must be at least 1.")])

    def test_incoming_needs_a_quantity_and_a_valid_date(self) -> None:
        self.assertEqual(errors_of(f"{HEADER},incoming_date\nS1,M1,Acme,1,2026-04-01"),
                         [(2, "incoming_qty", "Required.")])
        self.assertEqual(errors_of(f"{HEADER},incoming_qty,incoming_date\nS1,M1,Acme,1,5,01/04/2026"),
                         [(2, "incoming_date", "A date as YYYY-MM-DD.")])

    def test_duplicate_skus_ignore_case_and_point_at_the_first(self) -> None:
        found = errors_of(f"{HEADER}\nab-1,M1,Acme,1\nx,M2,Acme,1\nAB-1,M3,Acme,1\n")
        self.assertEqual(found, [(4, "sku", "Duplicate sku, first seen on line 2.")])

    def test_field_length_limits(self) -> None:
        self.assertEqual(errors_of(f"{HEADER}\n{'s' * 101},M1,Acme,1"), [(2, "sku", "At most 100 characters.")])

    def test_reported_errors_are_capped_but_counted(self) -> None:
        rows = "\n".join(f"S{i},M{i},Acme,x" for i in range(200))
        parsed = parse(f"{HEADER}\n{rows}")
        self.assertEqual(len(parsed.errors), csv_format.MAX_REPORTED_ERRORS)
        self.assertEqual(parsed.error_count, 200)

    def test_row_limit(self) -> None:
        with mock.patch.object(csv_format, "MAX_ROWS", 3):
            parsed = parse(HEADER + "\n" + "\n".join(f"S{i},M{i},A,1" for i in range(5)))
        self.assertTrue(any("More than 3 rows" in e.message for e in parsed.errors))
        self.assertEqual(parsed.rows, ())


if __name__ == "__main__":
    unittest.main()
