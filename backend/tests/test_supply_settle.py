"""Settling who makes a part from what distributors say about its number (plan section 11)."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"


class Stub:
    def __init__(self, *matches) -> None:
        self.matches = matches

    def lookup_mpn(self, mpn, manufacturer=None):
        return list(self.matches)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SettleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import discovery, parts, settle
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.models import PartMatch
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.discovery, cls.parts, cls.settle, cls.PartMatch = database, discovery, parts, settle, PartMatch
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_settle_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.shops = [self.connectors.create(actor=ACTOR, provider=provider)["id"] for provider in ("fake", "csv", "lcsc")]

    def part(self, maker: str, mpn: str):
        with self.store.connection() as conn:
            return self.parts.ensure_part(conn, maker, mpn, ACTOR)

    def search(self, part, shop: int, *answers: tuple[str, str]) -> None:
        matches = [self.PartMatch("fake", f"S{shop}-{n}", mpn, maker) for n, (mpn, maker) in enumerate(answers)]
        self.discovery.DiscoveryService(lambda _id: Stub(*matches), self.store).discover(part.id, self.shops[shop])

    def fresh(self, part):
        with self.store.connection() as conn:
            return self.parts.get_part(conn, part.id)

    def states(self) -> dict[str, str]:
        with self.store.connection() as conn:
            return {row["sku"]: row["match_state"] for row in conn.execute("SELECT sku, match_state FROM supply_listings").fetchall()}

    def test_the_written_name_is_confirmed_by_a_distributor_that_agrees(self) -> None:
        part = self.part("Brand New Maker", "BN-1")
        self.assertTrue(part.provisional)
        self.search(part, 0, ("BN-1", "BRAND NEW MAKER INC."))
        self.assertFalse(self.fresh(part).provisional)
        self.assertEqual(self.states(), {"S0-0": "exact"})

    def test_a_part_with_no_maker_takes_the_one_the_distributors_name_and_the_empty_maker_goes(self) -> None:
        part = self.part("", "ZZ-9")
        self.search(part, 0, ("ZZ-9", "Zeta Works"))
        now = self.fresh(part)
        self.assertEqual((now.manufacturer_name, now.provisional), ("Zeta Works", False))
        self.assertEqual(self.states(), {"S0-0": "exact"})
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_manufacturers WHERE name_key = %s", (self.parts.UNKNOWN_KEY,)).fetchone()["n"], 0)

    def test_the_maker_most_distributors_list_wins_over_a_clone(self) -> None:
        part = self.part("", "FDN308P")
        self.search(part, 0, ("FDN308P", "onsemi"))
        self.search(part, 1, ("FDN308P", "ONSEMI"))
        self.search(part, 2, ("FDN308P", "UMW"))
        self.assertEqual(self.fresh(part).manufacturer_name, "onsemi")
        self.assertEqual(self.states(), {"S0-0": "exact", "S1-0": "exact", "S2-0": "near"})

    def test_a_name_a_person_wrote_is_not_overruled_by_one_distributor(self) -> None:
        part = self.part("Texas Instruments", "LM358D")
        self.search(part, 0, ("LM358D", "UMW"))
        self.assertEqual(self.fresh(part).manufacturer_name, "Texas Instruments")
        self.assertEqual(self.states(), {"S0-0": "near"})
        with self.store.connection() as conn:
            (question,) = self.settle.needs_choice(conn)
        self.assertEqual((question["kind"], [option["spelling"] for option in question["options"]]), ("maker", ["UMW"]))

    def test_makers_nobody_leads_are_a_question_and_a_person_answers_it(self) -> None:
        part = self.part("", "AB-1")
        self.search(part, 0, ("AB-1", "Acme"), ("AB-1", "Bolt Co"))
        with self.store.connection() as conn:
            (question,) = self.settle.needs_choice(conn)
            self.assertEqual(sorted(option["spelling"] for option in question["options"]), ["Acme", "Bolt Co"])
            key = next(option["key"] for option in question["options"] if option["spelling"] == "Bolt Co")
            self.settle.choose(conn, part.id, key, ACTOR)
            self.assertEqual(self.settle.needs_choice(conn), [])
        self.assertEqual(self.fresh(part).manufacturer_name, "Bolt Co")
        self.assertEqual(self.states(), {"S0-0": "near", "S0-1": "exact"})

    def test_a_known_maker_nobody_lists_asks_whether_the_listed_maker_is_the_same_and_no_rejects_them(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Linear Technology", ACTOR)
        part = self.part("Linear Technology", "LT6655")
        self.assertTrue(self.fresh(part).provisional is False)
        self.search(part, 0, ("LT6655", "Analog Devices"))
        self.search(part, 1, ("LT6655", "Analog Devices Inc."))
        with self.store.connection() as conn:
            (question,) = self.settle.needs_choice(conn)
            self.assertEqual(question["kind"], "unlisted")
            self.settle.choose(conn, part.id, "analog devices", ACTOR)
            self.assertEqual(self.settle.needs_choice(conn), [])
        self.assertEqual(self.states(), {"S0-0": "exact", "S1-0": "exact"})

        other = self.part("Linear Technology", "LT6656")
        self.search(other, 2, ("LT6656", "Some Clone"))
        with self.store.connection() as conn:
            self.settle.not_this_maker(conn, other.id, "some clone", ACTOR)
            self.assertEqual(self.settle.needs_choice(conn), [])
        self.assertEqual(self.states()["S2-0"], "rejected")

    def test_a_spelling_two_parts_of_one_maker_carry_becomes_a_spelling_of_the_maker(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Acme Components", ACTOR)
        for n in (1, 2):
            part = self.part("Acme Components", f"AC-{n}")
            self.search(part, 0, (f"AC-{n}", "Acme Components"))
            with self.store.connection() as conn:
                self.parts.record_spelling(conn, part.id, "ACME Co Ltd Taiwan", "learned")
                self.settle.learn_aliases(conn)
        with self.store.connection() as conn:
            row = conn.execute("SELECT source FROM supply_manufacturer_aliases WHERE alias_key = 'acme co ltd taiwan'").fetchone()
        self.assertEqual(row["source"], "learned")

    def test_a_settled_maker_can_be_taken_back_and_the_part_is_asked_about_again(self) -> None:
        part = self.part("", "ZZ-9")
        self.search(part, 0, ("ZZ-9", "Zeta Works"))
        self.assertEqual(self.fresh(part).manufacturer_name, "Zeta Works")
        with self.store.connection() as conn:
            self.assertTrue(self.settle.undo_settled(conn, part.id, ACTOR))
            self.assertFalse(self.settle.undo_settled(conn, part.id, ACTOR), "already taken back")
            self.assertEqual(self.settle.settle_part(conn, part.id), "choice", "it does not settle by itself again")
            (question,) = self.settle.needs_choice(conn)
            self.settle.choose(conn, part.id, question["options"][0]["key"], ACTOR)
        self.assertEqual((self.fresh(part).manufacturer_name, self.states()["S0-0"]), ("Zeta Works", "exact"))

    def test_a_packaging_suffix_of_the_same_maker_is_the_same_part_and_added_by_itself(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Texas Instruments", ACTOR)
        part = self.part("Texas Instruments", "LM358D")
        self.search(part, 0, ("LM358DR", "Texas Instruments"), ("LM358DR", "TI"))
        self.assertEqual(self.states(), {"S0-0": "exact", "S0-1": "exact"})
        with self.store.connection() as conn:
            self.assertEqual([row["mpn"] for row in conn.execute("SELECT mpn FROM supply_part_numbers WHERE part_id = %s ORDER BY mpn", (part.id,)).fetchall()], ["LM358DR"])
            self.assertEqual(self.settle.needs_choice(conn), [])

    def test_a_clone_with_the_exact_number_does_not_hide_the_makers_packing_code_and_grade(self) -> None:
        """74AHC1G09GV: a second source lists the exact number, Nexperia lists ,125 (packing code) and -Q100H (grade)."""
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Nexperia", ACTOR)
        part = self.part("Nexperia", "74AHC1G09GV")
        self.search(
            part, 0,
            ("74AHC1G09GV", "MDD(Microdiode Semiconductor)"), ("74AHC1G09GV,125", "Nexperia USA Inc."), ("74AHC1G09GV-Q100H", "Nexperia USA Inc."),
        )
        self.assertEqual(self.states(), {"S0-0": "near", "S0-1": "exact", "S0-2": "near"})
        with self.store.connection() as conn:
            self.assertEqual([row["mpn"] for row in conn.execute("SELECT mpn FROM supply_part_numbers WHERE part_id = %s ORDER BY mpn", (part.id,)).fetchall()], ["74AHC1G09GV,125"])
            self.assertEqual([q for q in self.settle.needs_choice(conn) if q["kind"] == "unlisted"], [], "one unrelated maker is a second source")
            self.assertEqual(self.settle.use_numbers(conn, part.id, ["74AHC1G09GVQ100H"], ACTOR), 1)

    def test_the_rename_question_is_asked_for_a_similar_name_and_not_for_a_stranger(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Acme Works", ACTOR)
        stranger = self.part("Acme Works", "AW-1")
        self.search(stranger, 0, ("AW-1", "Zeta Foundry"))
        with self.store.connection() as conn:
            self.assertEqual(self.settle.needs_choice(conn), [])
        similar = self.part("Acme Works", "AW-2")
        self.search(similar, 1, ("AW-2", "Acme Works Europe"))
        # A name that starts with the part's is the same maker already; one shared word is only worth a question.
        self.search(self.part("Acme Works", "AW-3"), 2, ("AW-3", "Works Ltd Acme Group"))
        with self.store.connection() as conn:
            self.assertEqual([q["mpn"] for q in self.settle.needs_choice(conn)], ["AW-3"])

    def test_a_family_number_asks_which_numbers_it_is_sold_as_and_a_person_says_yes(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Murata", ACTOR)
        part = self.part("Murata", "GRM155R71C104KA88")
        self.search(part, 0, ("GRM155R71C104KA88D", "Murata"), ("GRM155R71C104KA88J", "Murata Electronics"))
        self.assertEqual(self.states(), {"S0-0": "near", "S0-1": "near"})
        with self.store.connection() as conn:
            (question,) = [q for q in self.settle.needs_choice(conn) if q["kind"] == "number"]
            self.assertEqual(sorted(option["spelling"] for option in question["options"]), ["GRM155R71C104KA88D", "GRM155R71C104KA88J"])
            self.assertEqual(self.settle.use_numbers(conn, part.id, [option["key"] for option in question["options"]], ACTOR), 2)
            self.assertEqual([q for q in self.settle.needs_choice(conn) if q["kind"] == "number"], [])
        self.assertEqual(self.states(), {"S0-0": "exact", "S0-1": "exact"})

    def test_a_bom_line_naming_another_number_of_the_part_finds_it(self) -> None:
        from app.services.supply import usage

        part = self.part("Texas Instruments", "LM358D")
        with self.store.connection() as conn:
            self.parts.add_number(conn, part.id, "LM358DR", ACTOR)
            conn.execute("INSERT INTO supply_bom_usage_projects (project_id, project_name, revision_key, line_count, updated_at) VALUES ('p1', 'Board', 'r1', 1, NOW())")
            conn.execute(
                "INSERT INTO supply_bom_usage (project_id, line_key, manufacturer, mpn, alias_key, match_key, quantity) VALUES ('p1', 'k', '', 'LM358DR', '', 'LM358DR', 2)"
            )
            found = usage.used_in(conn, part.id)
            self.assertEqual([row["project_id"] for row in found], ["p1"])
            conn.execute("DELETE FROM supply_part_numbers WHERE part_id = %s AND match_key = 'LM358DR'", (part.id,))
            self.assertEqual(usage.used_in(conn, part.id), [])

    def test_a_listing_is_settled_the_same_after_the_migration_sorts_old_waiting_ones(self) -> None:
        from app.services.supply import maker_backfill

        part = self.part("Texas Instruments", "LM358D")
        self.search(part, 0, ("LM358D", "TI"))
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET match_state = 'manufacturer_unresolved'")
            conn.execute("INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, status) VALUES ('ti', 'TI', 'pending')")
            done = maker_backfill.run(conn)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_manufacturer_aliases WHERE status = 'pending'").fetchone()["n"], 0)
        self.assertEqual(done["listings"], 1)
        self.assertEqual(self.states(), {"S0-0": "exact"})


if __name__ == "__main__":
    unittest.main()
