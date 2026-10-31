"""Kept offer summaries: used when current, recomputed when anything they are made from changes. Needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
ACTOR = "ana@example.com"


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SummaryCacheTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import parts_view, watches
        from app.services.supply.store import SupplyStore

        cls.database, cls.parts_view, cls.watches = database, parts_view, watches
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_sum_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_watches", "supply_parts", "supply_manufacturers", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_connectors (id, provider, display_name) VALUES ('c1', 'fake', 'Sim')")
            self.watch, _ = self.watches.add_watch(conn, "Acme", "P-1", ACTOR, tier=1)
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state, packaging) "
                "VALUES ('l1', 'c1', 'S1', %s, 'x', 'Acme', 'exact', 'cut_tape')", (self.watch.part_id,))
            conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock) VALUES ('l1', %s, 100)", (NOW,))

    def stock(self) -> int | None:
        with self.store.connection() as conn:
            (item,) = self.parts_view.summaries_for(conn, [self.watch.part_id])
        return item["stock"]

    def test_a_summary_is_kept_and_not_worked_out_again(self) -> None:
        # A summary is trusted while the log has no entry for its part from a transaction that was still open when it was worked out.
        # Which transactions are open anywhere on the server (other test workers, the dev app) is not this test's to decide, so it
        # starts from a log with no entry for the part.
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_dirty WHERE key = %s", (self.watch.part_id,))
        with mock.patch.object(self.parts_view, "offers_by_part", side_effect=AssertionError("worked out again")):
            self.assertEqual(self.stock(), 100)

    def test_new_exchange_rates_work_the_summary_out_again(self) -> None:
        # Rates change every converted price at once, so they mark no part: a kept summary names the rates it was priced with.
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_fx_rates")
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_dirty WHERE key = %s", (self.watch.part_id,))
        with mock.patch.object(self.parts_view, "offers_by_part", side_effect=AssertionError("worked out again")):
            self.assertEqual(self.stock(), 100, "kept while the rates stay")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_fx_rates (day, currency, per_eur, source) VALUES (CURRENT_DATE, 'USD', 1.08, 'manual')")
        try:
            with mock.patch.object(self.parts_view, "offers_by_part", side_effect=AssertionError("worked out again")):
                with self.assertRaisesRegex(AssertionError, "worked out again"):
                    self.stock()
        finally:
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_fx_rates")

    def test_the_jlc_class_rides_on_the_row_without_being_kept_in_the_summary(self) -> None:
        from app.services.supply import facts

        with self.store.connection() as conn:
            (item,) = self.parts_view.summaries_for(conn, [self.watch.part_id])
            self.assertIsNone(item["jlc"])
            facts.replace(conn, self.watch.part_id, "jlcpcb", [("jlc_library", "Basic"), ("jlc_preferred", "Preferred")], NOW)
            (item,) = self.parts_view.summaries_for(conn, [self.watch.part_id])
        self.assertEqual(item["jlc"], {"library": "Basic", "preferred": True})

    def test_a_lead_time_that_moved_over_three_months_is_a_trend_and_a_small_move_is_not(self) -> None:
        from datetime import timedelta

        def sample(days_ago: int, lead: int) -> None:
            with self.store.connection() as conn:
                conn.execute(
                    "INSERT INTO supply_samples (listing_id, sampled_at, stock, lead_time_days) VALUES ('l1', %s, 100, %s)",
                    (NOW - timedelta(days=days_ago), lead),
                )

        with self.store.connection() as conn:
            self.assertIsNone(self.parts_view.lead_time_trend(conn, self.watch.part_id, NOW), "no readings")
        for days_ago, lead in ((80, 28), (75, 28), (5, 70), (1, 70)):
            sample(days_ago, lead)
        with self.store.connection() as conn:
            self.assertEqual(self.parts_view.lead_time_trend(conn, self.watch.part_id, NOW), {"before": 28, "after": 70, "since": (NOW - timedelta(days=80)).date().isoformat()})
            conn.execute("DELETE FROM supply_samples")
        for days_ago, lead in ((80, 28), (5, 30)):
            sample(days_ago, lead)
        with self.store.connection() as conn:
            self.assertIsNone(self.parts_view.lead_time_trend(conn, self.watch.part_id, NOW), "two days is not a trend")

    def test_a_lead_time_trend_reads_readings_older_than_the_raw_samples_kept(self) -> None:
        from datetime import timedelta

        with self.store.connection() as conn:
            # Compacted: only the daily rows remain past 60 days.
            for days_ago in (80, 75):
                conn.execute("INSERT INTO supply_samples_daily (listing_id, day, stock, lead_time_days) VALUES ('l1', %s, 100, 28)",
                             ((NOW - timedelta(days=days_ago)).date(),))
            for days_ago in (5, 1):
                conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock, lead_time_days) VALUES ('l1', %s, 100, 70)",
                             (NOW - timedelta(days=days_ago),))
            self.assertEqual(self.parts_view.lead_time_trend(conn, self.watch.part_id, NOW)["before"], 28)

    def test_a_new_reading_makes_it_stale(self) -> None:
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET stock = 7 WHERE listing_id = 'l1'")
        self.assertEqual(self.stock(), 7)

    def test_a_listing_leaving_the_count_a_packaging_policy_and_a_search_make_it_stale(self) -> None:
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_watches SET packaging = 'tape_reel' WHERE id = %s", (self.watch.id,))
        self.assertIsNone(self.stock(), "the watch counts reels, and there is none")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_watches SET packaging = 'any' WHERE id = %s", (self.watch.id,))
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET match_state = 'rejected' WHERE id = 'l1'")
        self.assertIsNone(self.stock())

    def test_a_picked_packaging_and_a_deleted_listing_are_noticed(self) -> None:
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_listings WHERE id = 'l1'")
        self.assertIsNone(self.stock())

    def test_a_disabled_connectors_offers_stop_counting(self) -> None:
        import os

        from app.services.supply.connectors import ConnectorService
        from app.services.trackers.secrets import CredentialKeyring

        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        connectors = ConnectorService(self.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        self.assertEqual(self.stock(), 100)
        connectors.update("c1", actor=ACTOR, enabled=False)
        self.assertIsNone(self.stock(), "kept summary worked out again without it")
        connectors.update("c1", actor=ACTOR, enabled=True)
        self.assertEqual(self.stock(), 100)

    def test_a_threshold_is_not_kept_so_it_needs_no_invalidation(self) -> None:
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            self.watches.update_watch(conn, self.watch.id, ACTOR, threshold=500)
            (item,) = self.parts_view.summaries_for(conn, [self.watch.part_id])
        self.assertEqual(item["status"], "warning")

    def test_trimming_forgets_old_summaries_and_the_log_nothing_depends_on(self) -> None:
        from app.services.supply import retention

        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_part_summaries SET computed_at = NOW() - INTERVAL '8 days'")
            retention.trim_summaries(conn)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_part_summaries").fetchone()["n"], 0)
        # The log keeps what a transaction still open anywhere in the cluster may depend on, so what a run can trim depends on what
        # else is running (other test workers, the dev app). Rows with made-up transaction ids say the rule without that: one older
        # than any open transaction goes, one from the far future stays.
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_part_summaries")
            conn.execute("INSERT INTO supply_dirty (kind, key, xid) VALUES ('summary', 'old', 1), ('summary', 'future', 9000000000000000000)")
            retention.trim_summaries(conn)
            kept = [row["key"] for row in conn.execute("SELECT key FROM supply_dirty WHERE key IN ('old', 'future')").fetchall()]
            conn.execute("DELETE FROM supply_dirty WHERE key IN ('old', 'future')")
        self.assertEqual(kept, ["future"])
        self.assertEqual(self.stock(), 100, "worked out again when asked")

    def test_one_old_summary_does_not_hold_back_the_marks_of_other_parts(self) -> None:
        from app.services.supply import retention

        self.assertEqual(self.stock(), 100)
        part_id = self.watch.part_id
        # Made-up transaction ids, all older than anything open: the part's summary was worked out at 3 and a rollup reading
        # 'rolled' at 30. Only marks those two were worked out before still matter.
        marks = [(part_id, 2), (part_id, 4), ("other", 4), ("rolled", 20), ("rolled", 40)]
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_part_summaries SET snap = 3 WHERE part_id = %s", (part_id,))
            conn.execute(
                "INSERT INTO supply_project_rollups (project_id, variant, data, part_ids, seen, snap, computed_at) "
                "VALUES ('prj_trim', '', '{}'::jsonb, ARRAY['rolled'], '30:30:', 30, NOW()), "
                "('prj_old', '', '{}'::jsonb, ARRAY['rolled'], '1:1:', 1, NOW() - INTERVAL '2 hours')"
            )
            for scope, xid in marks:
                conn.execute("INSERT INTO supply_dirty (kind, key, xid) VALUES ('summary', %s, %s)", (scope, xid))
            conn.execute("INSERT INTO supply_dirty (kind, key, xid) VALUES ('rollup', 'prj_trim', 20), ('rollup', 'prj_trim', 40), ('rollup', '*', 20), ('rollup', '*', 40)")
            retention.trim_summaries(conn)
            summary = conn.execute(
                "SELECT key AS part_id, xid FROM supply_dirty WHERE kind = 'summary' AND xid < 1000 ORDER BY key, xid"
            ).fetchall()
            rollup = conn.execute("SELECT key AS scope, xid FROM supply_dirty WHERE kind = 'rollup' AND xid < 1000 ORDER BY key, xid").fetchall()
            projects = [row["project_id"] for row in conn.execute("SELECT project_id FROM supply_project_rollups WHERE project_id LIKE 'prj_%'").fetchall()]
            conn.execute("DELETE FROM supply_project_rollups WHERE project_id LIKE 'prj_%'")
            conn.execute("DELETE FROM supply_dirty WHERE xid < 1000")
        self.assertEqual([(row["part_id"], row["xid"]) for row in summary], [(part_id, 4), ("rolled", 40)])
        self.assertEqual([(row["scope"], row["xid"]) for row in rollup], [("*", 40), ("prj_trim", 40)])
        self.assertEqual(projects, ["prj_trim"], "a rollup older than a reader accepts is dropped")

    def test_removing_a_part_does_not_trip_the_triggers(self) -> None:
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_parts")
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_part_summaries").fetchone()["n"], 0)


    def marks(self, conn) -> set[tuple[str, str]]:
        """The marks this transaction wrote."""

        return {(row["kind"], row["key"]) for row in conn.execute(
            "SELECT kind, key FROM supply_dirty WHERE xid = pg_current_xact_id()::text::bigint").fetchall()}

    def test_every_source_has_its_triggers_and_a_write_that_changes_nothing_marks_nothing(self) -> None:
        from app.services.supply import freshness
        from app.services.supply.schema import derived

        with self.store.connection() as conn:
            made = {row["tgname"] for row in conn.execute(
                "SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = current_schema() AND NOT t.tgisinternal").fetchall()}
        for source in derived.SOURCES:
            self.assertIn(f"trg_supply_mark_{source.kind}_{source.table.removeprefix('supply_')}", made, source)
            self.assertIn(source.kind, {kind for reads in freshness.READS.values() for kind in reads}, "every kind marked is read")
        part = self.watch.part_id
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_parts SET mpn = mpn WHERE id = %s", (part,))
            conn.execute("UPDATE supply_parts SET mpn = mpn WHERE id = 'none'")
            conn.execute("UPDATE supply_poll_state SET next_poll_at = NOW()")
            self.assertEqual(self.marks(conn), set(), "the same values, no row or a column the summary does not read: no mark")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_parts SET mpn = 'P-1B' WHERE id = %s", (part,))
            conn.execute("UPDATE supply_offers SET stock = 90 WHERE listing_id = 'l1'")
            self.assertEqual(self.marks(conn), {("rollup", part), ("summary", part)}, "a part's own key, never every project's")

    def test_a_long_transaction_does_not_make_what_was_worked_out_meanwhile_stale(self) -> None:
        self.assertEqual(self.stock(), 100)
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_dirty WHERE key = %s", (self.watch.part_id,))
        with self.store.connection() as long:
            long.execute("INSERT INTO supply_dirty (kind, key) VALUES ('summary', 'another part')")  # it now holds a transaction id
            with self.store.connection() as conn:
                conn.execute("UPDATE supply_offers SET stock = 80 WHERE listing_id = 'l1'")
            self.assertEqual(self.stock(), 80, "worked out while the long one runs")
            with mock.patch.object(self.parts_view, "offers_by_part", side_effect=AssertionError("worked out again")):
                self.assertEqual(self.stock(), 80, "and kept: the long transaction's marks are for another part")
            long.execute("UPDATE supply_offers SET stock = 70 WHERE listing_id = 'l1'")
        self.assertEqual(self.stock(), 70, "a change the summary did not see makes it stale, however old its transaction")


    def status(self) -> str:
        with self.store.connection() as conn:
            (item,) = self.parts_view.summaries_for(conn, [self.watch.part_id])
        return item["status"]

    def test_the_kept_status_is_the_assessments_and_a_waiver_changes_it(self) -> None:
        part = self.watch.part_id
        with mock.patch.object(self.parts_view, "_now", return_value=NOW):
            with self.store.connection() as conn:
                conn.execute("UPDATE supply_offers SET stock = 0 WHERE listing_id = 'l1'")
            self.assertEqual(self.status(), "error", "no distributor has it")
            with self.store.connection() as conn:
                conn.execute(
                    "INSERT INTO supply_attention_decisions (id, part_id, kind, scope, reason, decision, state, made_by) "
                    "VALUES ('w1', %s, 'no_distributor_stock', 'no_stock', 'stocked by hand', 'waive', 'approved', %s)", (part, ACTOR))
            self.assertEqual(self.status(), "ok", "the approved waiver marks the summary and the status follows")

    def test_a_kept_status_holds_until_the_clock_makes_the_read_late(self) -> None:
        from datetime import timedelta

        with mock.patch.object(self.parts_view, "_now", return_value=NOW):
            self.assertEqual(self.status(), "ok")
        with self.store.connection() as conn:
            (changes,) = [row["changes_at"] for row in conn.execute("SELECT changes_at FROM supply_part_summaries").fetchall()]
            conn.execute("DELETE FROM supply_dirty WHERE key = %s", (self.watch.part_id,))
        self.assertEqual(changes, NOW + timedelta(hours=24 + 48, seconds=1), "read daily, late 48 hours after the day it was due")
        with mock.patch.object(self.parts_view, "_now", return_value=changes):
            self.assertEqual(self.status(), "warning", "past it, the kept row is worked out again: the read is late")


if __name__ == "__main__":
    unittest.main()
