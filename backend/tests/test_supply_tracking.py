"""Tracking tiers: which parts are followed, at what rate, and why.

Needs ``PRISM_DATABASE_URL``. Uses a disposable schema.
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


def component(reference: str, maker: str, mpn: str) -> dict:
    return {
        "componentUid": f"cmp:{reference}", "reference": reference,
        "fields": {"Manufacturer": maker, "Manufacturer Part Number": mpn, "DNP": "No", "In BOM": "Yes"},
    }


class PureTests(unittest.TestCase):
    def test_tier_one_is_daily_and_tier_two_is_weekly_or_monthly(self) -> None:
        from app.services.supply import tracking

        self.assertEqual(tracking.check_tier(1, "weekly"), (1, "daily"))
        self.assertEqual(tracking.check_tier(2, "monthly"), (2, "monthly"))
        for tier, rate in ((2, "daily"), (3, "weekly"), (0, "daily"), ("1", "daily")):
            with self.assertRaises(tracking.TrackingError):
                tracking.check_tier(tier, rate)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class TrackingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import parts, tracking, usage, watches
        from app.services.supply.store import SupplyStore

        cls.database, cls.parts, cls.tracking, cls.usage, cls.watches = database, parts, tracking, usage, watches
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_track_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_bom_usage_projects", "supply_tracked_projects", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases",
                          "supply_manufacturers", "supply_component_watches", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")

    def project(self, project_id: str, base: list[dict], variants: dict[str, list[dict]] | None = None) -> None:
        lines = self.usage.lines_from_components(base)
        named = {name: self.usage.lines_from_components(items) for name, items in (variants or {}).items()}
        with self.store.connection() as conn:
            self.usage.store_project(conn, project_id, project_id, "r1", lines, NOW, variant_lines=named)

    def track(self, project_id: str, variants=("",), **kwargs):
        with self.store.connection() as conn:
            return self.tracking.track_project(conn, project_id, variants, ACTOR, **kwargs)

    def tier(self, maker: str, mpn: str):
        with self.store.connection() as conn:
            part = self.parts.find_part(conn, maker, mpn)
            return self.tracking.tier_of(conn, part.id) if part else None

    def test_tracking_a_project_puts_its_parts_in_tier_one_with_the_project_as_reason(self) -> None:
        self.project("p1", [component("R1", "Acme", "R-1"), component("C1", "Acme", "C-1")])
        result = self.track("p1")
        self.assertEqual((result["parts_created"], result["skipped"]), (2, []))
        got = self.tier("Acme", "R-1")
        self.assertEqual((got["tier"], got["rate"]), (1, "daily"))
        self.assertEqual(got["reasons"], [{"kind": "project", "ref": "p1", "variant": ""}])

    def test_a_line_that_several_makers_share_is_listed_with_the_parts_to_choose_from_and_a_choice_tracks_it(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Texas Instruments", ACTOR)
            self.parts.ensure_manufacturer(conn, "Onsemi", ACTOR)
            ti = self.parts.ensure_part(conn, "Texas Instruments", "LM358D", ACTOR)
            self.parts.ensure_part(conn, "Onsemi", "LM358D", ACTOR)
        self.project("p1", [component("U1", "Some Other Name", "LM358D"), component("R1", "Acme", "R-1")])
        first = self.track("p1")
        (waiting,) = first["skipped"]
        self.assertEqual((waiting["reason"], waiting["manufacturer"], sorted(c["manufacturer"] for c in waiting["candidates"])),
                         ("needs_choice", "Some Other Name", ["Onsemi", "Texas Instruments"]))
        with self.store.connection() as conn:
            self.tracking.choose_line(conn, ti.id, "Some Other Name", ACTOR)
        self.assertEqual(self.track("p1")["skipped"], [])
        self.assertEqual(self.tier("Texas Instruments", "LM358D")["tier"], 1)

    def test_progress_counts_the_projects_parts_and_how_many_have_been_searched_at_each_distributor(self) -> None:
        import os

        from app.services.supply.connectors import ConnectorService
        from app.services.trackers.secrets import CredentialKeyring

        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cid = ConnectorService(self.store, keyring_factory=lambda: ring, allow_dev=lambda: True).create(actor=ACTOR, provider="fake", daily_budget=1000)["id"]
        self.project("p1", [component("R1", "Acme", "R-1"), component("R2", "Acme", "R-2")])
        self.track("p1")
        with self.store.connection() as conn:
            before = self.tracking.project_progress(conn, "p1")
            part = self.parts.find_part(conn, "Acme", "R-1")
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, NOW(), 1)", (part.id, cid))
            after = self.tracking.project_progress(conn, "p1")
        self.assertEqual((before["parts"], before["state"], before["done"], before["total"]), (2, "running", 0, 2))
        self.assertEqual([(c["total"], c["done"]) for c in before["connectors"]], [(2, 0)])
        self.assertEqual([(c["total"], c["done"]) for c in after["connectors"]], [(2, 1)])

    def test_a_project_lists_what_it_waits_on_a_person_for(self) -> None:
        with self.store.connection() as conn:
            self.parts.ensure_manufacturer(conn, "Texas Instruments", ACTOR)
            self.parts.ensure_manufacturer(conn, "Onsemi", ACTOR)
            self.parts.ensure_part(conn, "Texas Instruments", "LM358D", ACTOR)
            self.parts.ensure_part(conn, "Onsemi", "LM358D", ACTOR)
        self.project("p1", [component("U1", "Some Other Name", "LM358D"), component("R1", "Acme", "R-1")])
        self.project("p2", [component("R1", "Acme", "R-1")])
        self.track("p1")
        with self.store.connection() as conn:
            waiting = self.tracking.project_open(conn, "p1")
            nothing = self.tracking.project_open(conn, "p2")
        self.assertEqual([line["mpn"] for line in waiting["lines"]], ["LM358D"])
        self.assertEqual((nothing["lines"], nothing["choices"]), ([], []))

    def test_only_the_chosen_variants_are_tracked(self) -> None:
        self.project(
            "p1", [component("R1", "Acme", "R-1")],
            {"Fit extra": [component("R1", "Acme", "R-1"), component("U9", "Acme", "U-9")]},
        )
        self.track("p1")
        self.assertIsNone(self.tier("Acme", "U-9"), "the variant was not chosen")
        self.track("p1", variants=("", "Fit extra"))
        self.assertEqual(self.tier("Acme", "U-9")["tier"], 1)
        self.track("p1", variants=("Fit extra",))
        self.assertEqual(self.tier("Acme", "R-1")["reasons"], [{"kind": "project", "ref": "p1", "variant": "Fit extra"}])

    def test_an_unknown_variant_or_unread_project_is_refused(self) -> None:
        self.project("p1", [component("R1", "Acme", "R-1")])
        with self.assertRaises(self.tracking.TrackingError):
            self.track("p1", variants=("nope",))
        with self.assertRaises(self.tracking.TrackingError):
            self.track("never-read")

    def test_untracking_drops_parts_nothing_else_follows_and_keeps_the_rest(self) -> None:
        self.project("p1", [component("R1", "Acme", "R-1"), component("C1", "Acme", "C-1")])
        self.track("p1")
        with self.store.connection() as conn:
            self.watches.add_watch(conn, "Acme", "C-1", ACTOR)
            self.assertTrue(self.tracking.untrack_project(conn, "p1", ACTOR))
        self.assertIsNone(self.tier("Acme", "R-1"))
        kept = self.tier("Acme", "C-1")
        self.assertEqual((kept["tier"], kept["rate"], [r["kind"] for r in kept["reasons"]]), (2, "weekly", ["person"]))

    def test_untracking_several_projects_at_once_works_out_the_tiers_once(self) -> None:
        from unittest import mock

        self.project("p1", [component("R1", "Acme", "R-1")])
        self.project("p2", [component("C1", "Acme", "C-1")])
        self.track("p1")
        self.track("p2")
        with self.store.connection() as conn:
            with mock.patch.object(self.tracking, "recompute", wraps=self.tracking.recompute) as recompute:
                self.assertEqual(self.tracking.untrack_projects(conn, ["p1", "p2", "never-tracked"], ACTOR), 2)
            removed = [row["subject_id"] for row in conn.execute(
                "SELECT subject_id FROM supply_audit_events WHERE action = 'tracking.project_removed' ORDER BY subject_id").fetchall()]
        self.assertEqual(recompute.call_count, 1)
        self.assertEqual(removed, ["p1", "p2"])
        self.assertIsNone(self.tier("Acme", "R-1"))
        self.assertIsNone(self.tier("Acme", "C-1"))

    def test_the_highest_tier_wins_and_every_source_is_a_reason(self) -> None:
        self.project("p1", [component("R1", "Acme", "R-1")])
        with self.store.connection() as conn:
            watch, _ = self.watches.add_watch(conn, "Acme", "R-1", ACTOR, tier=2, rate="monthly")
        self.assertEqual(self.tier("Acme", "R-1")["rate"], "monthly")
        self.track("p1")
        got = self.tier("Acme", "R-1")
        self.assertEqual((got["tier"], got["rate"]), (1, "daily"))
        self.assertEqual(sorted(r["kind"] for r in got["reasons"]), ["person", "project"])
        with self.store.connection() as conn:
            self.tracking.untrack_project(conn, "p1", ACTOR)
        self.assertEqual(self.tier("Acme", "R-1")["rate"], "monthly", "back to the person's choice")
        with self.store.connection() as conn:
            self.watches.update_watch(conn, watch.id, ACTOR, tier=1)
        self.assertEqual(self.tier("Acme", "R-1")["tier"], 1)

    def test_a_person_adding_a_watch_never_lowers_one_and_a_weekly_beats_a_monthly(self) -> None:
        with self.store.connection() as conn:
            self.watches.add_watch(conn, "Acme", "R-1", ACTOR, tier=1)
            self.watches.add_watch(conn, "Acme", "R-1", ACTOR, tier=2, rate="monthly")
            self.watches.add_watch(conn, "Acme", "R-2", ACTOR, tier=2, rate="monthly")
            self.watches.add_watch(conn, "Acme", "R-2", ACTOR, tier=2, rate="weekly")
        self.assertEqual(self.tier("Acme", "R-1")["tier"], 1)
        self.assertEqual(self.tier("Acme", "R-2")["rate"], "weekly")

    def test_removing_a_watch_leaves_tier_three(self) -> None:
        with self.store.connection() as conn:
            watch, _ = self.watches.add_watch(conn, "Acme", "R-1", ACTOR)
            self.watches.remove_watch(conn, watch.id, ACTOR)
        self.assertIsNone(self.tier("Acme", "R-1"))

    def test_a_part_raised_to_daily_is_due_a_day_after_its_last_read_not_when_its_old_rate_said(self) -> None:
        from datetime import timedelta

        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_connectors (id, provider, display_name) VALUES ('c1', 'fake', 'Sim')")
            record, _ = self.watches.add_watch(conn, "Acme", "R-1", ACTOR, tier=2, rate="weekly")
            conn.execute("INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES ('l1', 'c1', 'S1', %s, 'R-1', 'Acme', 'exact')", (record.part_id,))
            conn.execute(
                "INSERT INTO supply_poll_state (listing_id, tier, urgency, next_poll_at, last_polled_at, error_streak, missing_streak, last_error_code) "
                "VALUES ('l1', 'weekly', 0, %s, %s, 0, 0, '')", (NOW + timedelta(days=4), NOW - timedelta(days=3)),
            )
            self.watches.update_watch(conn, record.id, ACTOR, tier=1, rate="daily")
            row = conn.execute("SELECT tier, next_poll_at, last_polled_at FROM supply_poll_state WHERE listing_id = 'l1'").fetchone()
            self.assertEqual(row["tier"], "daily")
            self.assertEqual(row["next_poll_at"], row["last_polled_at"] + timedelta(days=1))
            # Lowered again, the plan is not pushed back: the listing is just read early.
            self.watches.update_watch(conn, record.id, ACTOR, tier=2, rate="weekly")
            self.assertEqual(conn.execute("SELECT next_poll_at FROM supply_poll_state WHERE listing_id = 'l1'").fetchone()["next_poll_at"], row["next_poll_at"])

    def test_recompute_writes_nothing_when_nothing_changed(self) -> None:
        self.project("p1", [component("R1", "Acme", "R-1")])
        self.track("p1")
        with self.store.connection() as conn:
            self.assertEqual(self.tracking.recompute(conn), {"added": 0, "changed": 0, "removed": 0})

    def test_a_new_revision_brings_its_new_parts_into_tier_one(self) -> None:
        self.project("p1", [component("R1", "Acme", "R-1")])
        self.track("p1")
        lines = self.usage.lines_from_components([component("R1", "Acme", "R-1"), component("R2", "Acme", "R-2")])
        with self.store.connection() as conn:
            self.usage.store_project(conn, "p1", "p1", "r2", lines, NOW)
            self.assertEqual(self.tracking.sync_projects(conn), {"parts_created": 1})
            self.assertEqual(self.tracking.sync_projects(conn), {"parts_created": 0})
        self.assertEqual(self.tier("Acme", "R-2")["tier"], 1)

    def test_a_part_without_a_manufacturer_is_tracked_and_its_maker_settled_later(self) -> None:
        self.project("p1", [component("R1", "", "R-1"), component("R2", "Acme", "R-2")])
        result = self.track("p1")
        self.assertEqual(result["skipped"], [])
        with self.store.connection() as conn:
            self.assertEqual(self.tracking.counts(conn), {"tier1": 2, "tier2": 0})


if __name__ == "__main__":
    unittest.main()
