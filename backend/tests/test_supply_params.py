"""Part parameters: reading distributors' attribute text into SI values, and keeping what they list. Reading needs nothing; storage needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import params  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


class ReadingTests(unittest.TestCase):
    def test_numbers_with_prefixes_and_units_are_read_in_si(self) -> None:
        cases = [
            ("10 kOhms", "ohm", "10000"), ("10kΩ", "ohm", "10000"), ("4.7 MOhms", "ohm", "4700000"), ("0.47 Ohms", "ohm", "0.47"),
            ("100nF", "farad", "1E-7"), ("4.7 µF", "farad", "0.0000047"), ("22pF", "farad", "2.2E-11"), ("10 uH", "henry", "0.00001"),
            ("50V", "volt", "50"), ("6.3 V", "volt", "6.3"), ("0.1W", "watt", "0.1"), ("1/10W", "watt", "0.1"), ("125 mW", "watt", "0.125"),
            ("±1%", "percent", "1"), ("5 %", "percent", "5"),
        ]
        for raw, unit, expected in cases:
            self.assertEqual(params.parse_quantity(raw, unit), Decimal(expected), raw)

    def test_a_text_in_another_unit_or_no_number_is_not_guessed(self) -> None:
        for raw, unit in (("10 kOhms", "farad"), ("fast", "ohm"), ("±1", "percent"), ("1/10W", "volt"), ("", "ohm")):
            self.assertIsNone(params.parse_quantity(raw, unit), raw)

    def test_names_from_each_distributor_land_on_one_key(self) -> None:
        for name in ("Resistance", "resistance (ohms)", " RESISTANCE "):
            self.assertEqual(params.canonical_key(name), "resistance", name)
        self.assertEqual(params.canonical_key("Voltage - Rated"), "voltage_rating")
        self.assertEqual(params.canonical_key("Package / Case"), "package")
        self.assertIsNone(params.canonical_key("Series"))

    def test_normalise_puts_known_parameters_first_in_a_fixed_order_and_keeps_the_rest_raw(self) -> None:
        result = params.normalise([("Series", "Surface Mount"), ("Tolerance", "±1%"), ("Resistance", "10 kOhms"), ("Package / Case", "0603"), ("Series", "-")])
        self.assertEqual([item.key for item in result], ["resistance", "tolerance", "package", None])
        self.assertEqual((result[0].value, result[0].unit, result[0].raw), (Decimal("10000"), "ohm", "10 kOhms"))
        self.assertEqual((result[2].value, result[3].name), (None, "Series"))

    def test_the_first_spelling_of_a_key_wins(self) -> None:
        result = params.normalise([("Resistance", "10 kOhms"), ("Resistance (Ohms)", "10000")])
        self.assertEqual([(item.name, item.raw) for item in result], [("Resistance", "10 kOhms")])

    def test_two_values_differ_only_beyond_a_small_relative_margin_and_never_when_unknown(self) -> None:
        self.assertFalse(params.differs(Decimal("10000"), Decimal("10000")))
        self.assertFalse(params.differs(Decimal("10000"), Decimal("10005")))
        self.assertTrue(params.differs(Decimal("10000"), Decimal("12000")))
        self.assertFalse(params.differs(None, Decimal("5")))


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class StorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, parts, parts_view
        from app.services.supply.store import SupplyStore

        cls.database, cls.discovery, cls.parts, cls.parts_view = database, discovery, parts, parts_view
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_params_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_part_params", "supply_parts", "supply_manufacturers"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
            self.part = self.parts.ensure_part(conn, "Acme", "R-10K", "seed@example.com").id

    def test_attributes_are_kept_per_provider_and_the_part_shows_them_normalised_with_their_sources(self) -> None:
        with self.store.connection() as conn:
            self.discovery.remember_parameters(conn, self.part, "mouser", [("Resistance", "10 kOhms"), ("Series", "SMD")])
            self.discovery.remember_parameters(conn, self.part, "lcsc", [("Resistance", "10 kOhms"), ("Power(Watts)", "100mW")])
            self.discovery.remember_parameters(conn, self.part, "lcsc", [("Resistance", "10 kOhms")])
            shown = self.parts_view.parameters_of(conn, self.part)
        by_name = {item["name"]: item for item in shown}
        self.assertEqual((by_name["Resistance"]["key"], by_name["Resistance"]["value"], by_name["Resistance"]["unit"]), ("resistance", "10000", "ohm"))
        self.assertEqual(sorted(by_name["Resistance"]["sources"]), ["lcsc", "mouser"])
        self.assertIsNone(by_name["Series"]["key"])
        self.assertEqual(shown[0]["name"], "Resistance", "known parameters come first")

    def test_blank_names_and_values_are_not_kept(self) -> None:
        with self.store.connection() as conn:
            self.discovery.remember_parameters(conn, self.part, "mouser", [("", "x"), ("Tolerance", ""), ("Tolerance", "±5%")])
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_part_params").fetchone()["n"], 1)


if __name__ == "__main__":
    unittest.main()


class BeyondPassivesTests(unittest.TestCase):
    def read(self, name: str, raw: str):
        (found,) = params.normalise([(name, raw)])
        return found

    def test_regulator_voltages_and_currents_are_read_in_si(self) -> None:
        self.assertEqual(self.read("Voltage - Output (Min/Fixed)", "3.3V").value, Decimal("3.3"))
        self.assertEqual(self.read("Voltage - Input (Max)", "15V").key, "input_voltage_max")
        self.assertEqual(self.read("Current - Output", "500mA").value, Decimal("0.5"))
        self.assertEqual(self.read("Output Current", "1A").value, Decimal("1"))

    def test_connector_counts_and_pitch(self) -> None:
        self.assertEqual(self.read("Number of Positions", "20").value, Decimal("20"))
        self.assertIsNone(self.read("Number of Positions", "2 x 10").value, "not a whole number, so only the raw text")
        self.assertEqual(self.read("Pitch - Mating", '0.100" (2.54mm)').value, Decimal("0.00254"))
        self.assertEqual(self.read("Mounting Type", "Through Hole").key, "mounting")

    def test_microcontroller_memory_clock_and_pins(self) -> None:
        self.assertEqual(self.read("Program Memory Size", "64KB (32K x 16)").value, Decimal(64 * 1024))
        self.assertEqual(self.read("RAM Size", "8K x 8").value, None, "a layout, not a size: left raw")
        self.assertEqual(self.read("Speed", "48MHz").value, Decimal(48_000_000))
        self.assertEqual(self.read("Number of I/O", "37").key, "io_count")
        self.assertEqual(self.read("Core Processor", "ARM® Cortex®-M4").value, None)
        self.assertEqual(self.read("Operating Temperature", "-40°C ~ 85°C (TA)").key, "temperature_range")
