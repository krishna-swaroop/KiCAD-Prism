"""Alternatives graded by how close they are."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply import cross_reference  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def sig(**fields):
    return {key: {"value": Decimal(str(value)) if isinstance(value, (int, float)) else None, "raw": str(value)} for key, value in fields.items()}


class GradeTests(unittest.TestCase):
    BASE = sig(resistance=10000, tolerance=1, voltage_rating=75, power_rating=0.1, package="0603 (1608 Metric)")

    def test_every_listed_rating_known_and_met_in_the_same_package_is_ratings_met(self) -> None:
        other = sig(resistance=10000, tolerance=0.5, voltage_rating=100, power_rating=0.1, package="0603")
        verdict = cross_reference.grade(self.BASE, other)
        self.assertEqual((verdict["grade"], verdict["unknown"]), ("ratings_met", []))
        self.assertEqual(cross_reference.grade_label(verdict), "Ratings met")

    def test_a_worse_rating_fails_whatever_else_matches(self) -> None:
        verdict = cross_reference.grade(self.BASE, sig(resistance=10000, tolerance=1, voltage_rating=1, power_rating=0.1, package="0603"))
        self.assertEqual((verdict["grade"], verdict["differs"]), ("fails", ["voltage_rating"]), "rated 1 V against 75 V")
        self.assertEqual(cross_reference.grade_label(verdict), "Fails a rating")
        looser = cross_reference.grade(self.BASE, sig(resistance=10000, tolerance=5, voltage_rating=50, power_rating=0.1, package="0603"))
        self.assertEqual(sorted(looser["differs"]), ["tolerance", "voltage_rating"])

    def test_ratings_the_candidate_does_not_list_are_unknown_not_met(self) -> None:
        # 10k, 1% and 0603 alone: the 75 V and 0.1 W ratings can't be judged.
        verdict = cross_reference.grade(self.BASE, sig(resistance=10000, tolerance=1, package="0603"))
        self.assertEqual((verdict["grade"], sorted(verdict["unknown"])), ("similar", ["power_rating", "voltage_rating"]))
        self.assertEqual(cross_reference.grade_label(verdict), "Similar · 2 ratings unknown")

    def test_another_package_is_other_package_and_another_value_is_not_an_alternative(self) -> None:
        self.assertEqual(cross_reference.grade(self.BASE, sig(resistance=10000, package="0805"))["grade"], "other_package")
        self.assertIsNone(cross_reference.grade(self.BASE, sig(resistance=22000, package="0603")))
        self.assertIsNone(cross_reference.grade(self.BASE, sig(package="0603")), "no value to compare")
        self.assertIsNone(cross_reference.grade(sig(package="0603"), sig(package="0603")), "a part with no core value cannot be judged")

    def test_nothing_beyond_the_value_compared_is_only_similar(self) -> None:
        verdict = cross_reference.grade(sig(resistance=10000, package="0603"), sig(resistance=10000, package="0603"))
        self.assertEqual(verdict["grade"], "similar")

    def test_packages_compare_by_their_size_code(self) -> None:
        self.assertEqual(cross_reference.package_key("0603 (1608 Metric)"), cross_reference.package_key("R_0603"))
        self.assertNotEqual(cross_reference.package_key("SOT-23-5"), cross_reference.package_key("SOT-23-6"))


class ParametersOfPartsTests(unittest.TestCase):
    class Conn:
        def __init__(self, rows) -> None:
            self.rows = rows
            self.queries: list[tuple[str, tuple]] = []

        def execute(self, sql, params=()):
            self.queries.append((sql, params))
            wanted = params[0]
            chosen = [row for row in self.rows if row["part_id"] in wanted] if isinstance(wanted, list) else [row for row in self.rows if row["part_id"] == wanted]
            return type("Rows", (), {"fetchall": lambda _self: chosen})()

    def test_the_bulk_read_matches_the_one_part_read_from_one_parameter_query(self) -> None:
        from unittest import mock

        from app.services.supply import parts_view

        rows = [
            {"part_id": "p1", "provider": "digikey", "name": "Resistance", "raw": "10 kOhms"},
            {"part_id": "p1", "provider": "mouser", "name": "Series", "raw": "X"},
            {"part_id": "p2", "provider": "digikey", "name": "Capacitance", "raw": "100nF"},
        ]
        with mock.patch.object(parts_view.facts, "for_part", return_value=[]):
            together = parts_view.parameters_of_parts(self.Conn(rows), ["p1", "p2"])
            alone = {part_id: parts_view.parameters_of(self.Conn(rows), part_id) for part_id in ("p1", "p2")}
        self.assertEqual(together, alone)
        conn = self.Conn(rows)
        with mock.patch.object(parts_view.facts, "for_part", return_value=[]):
            parts_view.parameters_of_parts(conn, ["p1", "p2"])
        self.assertEqual(len(conn.queries), 1)
        self.assertIn("ANY(%s)", conn.queries[0][0])


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class CandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, facts, parts
        from app.services.supply.store import SupplyStore

        cls.database, cls.discovery, cls.facts, cls.parts = database, discovery, facts, parts
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_xref_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_part_params", "supply_part_facts", "supply_parts", "supply_manufacturers"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme'), ('m2', 'Globex', 'globex')")

    def part(self, maker: str, mpn: str, attributes, category: str = "Chip Resistor - Surface Mount") -> str:
        from datetime import datetime, timezone

        with self.store.connection() as conn:
            record = self.parts.ensure_part(conn, maker, mpn, "seed@example.com")
            self.discovery.remember_parameters(conn, record.id, "digikey", attributes)
            self.facts.replace(conn, record.id, "digikey", [("category", category)], datetime.now(timezone.utc))
        return record.id

    def test_candidates_are_graded_and_ordered_and_the_manufacturers_suggestion_is_listed(self) -> None:
        from datetime import datetime, timezone

        base = self.part("Acme", "R-10K", [("Resistance", "10 kOhms"), ("Tolerance", "±1%"), ("Package / Case", "0603"), ("Power (Watts)", "0.1W")])
        direct = self.part("Globex", "G-10K", [("Resistance", "10 kOhms"), ("Tolerance", "±0.5%"), ("Package / Case", "0603 (1608 Metric)"), ("Power (Watts)", "0.125W")])
        other_package = self.part("Globex", "G-10K-0805", [("Resistance", "10 kOhms"), ("Package / Case", "0805")])
        self.part("Globex", "G-22K", [("Resistance", "22 kOhms"), ("Package / Case", "0603")])
        self.part("Globex", "G-OTHER-KIND", [("Resistance", "10 kOhms"), ("Package / Case", "0603")], category="Something Else")
        with self.store.connection() as conn:
            self.facts.replace(conn, base, "mouser", [("suggested_replacement", "R-10K-NEW")], datetime.now(timezone.utc))
            found = cross_reference.candidates(conn, base)
        self.assertEqual([(item["mpn"], item["grade"]) for item in found["candidates"]], [("G-10K", "ratings_met"), ("G-10K-0805", "other_package")])
        self.assertEqual(found["candidates"][0]["part_id"], direct)
        self.assertEqual(found["candidates"][1]["part_id"], other_package)
        self.assertEqual(found["suggested_by_distributors"], ["R-10K-NEW"])
        self.assertIn("resistance", found["judged_on"])

    def test_a_part_with_nothing_to_compare_has_no_candidates(self) -> None:
        lone = self.part("Acme", "ODD-1", [("Series", "x")])
        with self.store.connection() as conn:
            self.assertEqual(cross_reference.candidates(conn, lone)["candidates"], [])

    def test_parameters_read_for_the_pool_match_reading_each_part_alone(self) -> None:
        from app.services.supply import parts_view

        first = self.part("Acme", "R-10K", [("Resistance", "10 kOhms"), ("Package / Case", "0603")])
        second = self.part("Globex", "G-10K", [("Resistance", "10 kOhms"), ("Package / Case", "0603")])
        with self.store.connection() as conn:
            together = parts_view.parameters_of_parts(conn, [first, second])
            self.assertEqual(together[first], parts_view.parameters_of(conn, first))
            self.assertEqual(together[second], parts_view.parameters_of(conn, second))


if __name__ == "__main__":
    unittest.main()
