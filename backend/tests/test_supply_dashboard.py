"""The Dashboard's figures and the Insights page's counts, from the facts kept for each tracked part (plan section 15)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import unittest.mock
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class DashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import attention, dashboard, insights_page, part_insights, parts_view, watches
        from app.services.supply.store import SupplyStore

        cls.database, cls.dashboard, cls.insights_page, cls.part_insights, cls.parts_view, cls.watches = (
            database, dashboard, insights_page, part_insights, parts_view, watches,
        )
        cls.attention = attention
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_dash_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        # Summaries are assessed at the time the fixtures read at, so their reads are not late.
        patcher = unittest.mock.patch("app.services.supply.parts_view._now", return_value=NOW)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.insights_page.forget()
        with self.store.connection() as conn:
            for table in ("supply_part_insights", "supply_figure_history", "supply_samples", "supply_offers", "supply_listings", "supply_watches", "supply_part_tiers", "supply_parts", "supply_manufacturers", "supply_connectors", "supply_attention_decisions", "supply_attention"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
            conn.execute("INSERT INTO supply_connectors (id, provider, storefront) VALUES ('c1', 'fake', 'a'), ('c2', 'fake', 'b')")

    def follow(self, mpn: str, stocks: list[int], holders: tuple[str, ...] = ("c1",)) -> str:
        """A tracked part with one reading a day for each stock figure, ending today, at each of the connectors."""

        with self.store.connection() as conn:
            record, _ = self.watches.add_watch(conn, "Acme", mpn, "seed@example.com")
            for connector in holders:
                listing = f"l-{mpn}-{connector}"
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'x', 'exact')",
                    (listing, connector, f"{mpn}-{connector}", record.part_id),
                )
                conn.execute("INSERT INTO supply_offers (listing_id, fetched_at, stock, lead_time_days) VALUES (%s, %s, %s, 30)", (listing, NOW, stocks[-1]))
                for offset, stock in enumerate(stocks):
                    day = NOW - timedelta(days=len(stocks) - 1 - offset)
                    conn.execute("INSERT INTO supply_samples (listing_id, sampled_at, stock) VALUES (%s, %s, %s)", (listing, day, stock))
            return record.part_id

    def test_the_kept_facts_say_when_stock_runs_out_and_who_holds_it(self) -> None:
        falling = self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        steady = self.follow("STEADY-1", [500] * 9, holders=("c1", "c2"))
        with self.store.connection() as conn:
            self.assertEqual(len(self.part_insights.renew(conn, NOW)), 2)
            self.assertEqual(len(self.part_insights.renew(conn, NOW)), 0, "fresh")
            kept = self.part_insights.of_parts(conn, [falling, steady])
            self.assertEqual((kept[falling]["trend"], kept[falling]["holders"], kept[falling]["lead_days"]), ("falling", 1, 30))
            self.assertEqual(kept[falling]["days_to_zero"], 2)
            self.assertEqual((kept[steady]["trend"], kept[steady]["holders"]), ("steady", 2))
            self.assertEqual(self.part_insights.matching(conn, "runs_out_2w"), {falling})
            self.assertEqual(self.part_insights.matching(conn, "one_distributor"), {falling})
            self.assertEqual(self.part_insights.matching(conn, "steady"), {steady})

    def test_new_exchange_rates_leave_the_kept_facts_readable_and_marked_first_to_be_renewed(self) -> None:
        from datetime import date
        from decimal import Decimal

        from app.services.supply import fx

        stale = self.follow("RATE-1", [500] * 3)
        later = self.follow("RATE-2", [500] * 3)
        with self.store.connection() as conn:
            self.part_insights.renew(conn, NOW)
        with self.store.connection() as conn:
            self.assertEqual(len(self.part_insights.renew(conn, NOW)), 0, "fresh")
            conn.execute("UPDATE supply_offers SET stock = 400 WHERE listing_id IN (SELECT id FROM supply_listings WHERE part_id = %s)", (stale,))
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_part_insights SET computed_at = %s WHERE part_id = %s", (NOW - timedelta(days=2), later))
        with self.store.connection() as conn, unittest.mock.patch.object(self.part_insights, "refresh", wraps=self.part_insights.refresh) as refresh:
            self.assertEqual(len(self.part_insights.renew(conn, NOW)), 2, "a marked part and one older than a day")
            self.assertEqual([call.args[1] for call in refresh.call_args_list], [stale, later], "marked first")
        with self.store.connection() as conn:
            fx.store(conn, date(2026, 3, 1), {"USD": Decimal("1.08")}, "manual")
        with self.store.connection() as conn:
            self.assertEqual(sorted(row["part_id"] for row in self.part_insights.read_all(conn)), sorted([stale, later]), "still readable")
            self.dashboard.build(conn)
            self.assertEqual(len(self.part_insights.renew(conn, NOW)), 2, "new rates mark every part")
            self.assertEqual(len(self.part_insights.renew(conn, NOW, seconds=0)), 0, "a run stops when its time is up")

    def test_the_parts_list_narrows_to_a_finding_and_carries_the_trend_line(self) -> None:
        falling = self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        self.follow("STEADY-1", [500] * 9, holders=("c1", "c2"))
        with self.store.connection() as conn:
            self.part_insights.renew(conn, NOW)
            found = self.parts_view.list_parts(conn, scope="watched", only="draining")
        self.assertEqual([item["id"] for item in found["items"]], [falling])
        self.assertEqual(len(found["items"][0]["spark"]), 9)
        self.assertEqual(found["items"][0]["runs_out_days"], 2)

    def test_the_list_sorts_by_a_column_in_the_database_and_a_part_with_no_figure_is_last_either_way(self) -> None:
        for mpn, stock, price in (("B", 50, "0.10"), ("C", 900, "12.5"), ("D", 0, "0.0125")):
            part_id = self.follow(mpn, [stock])
            with self.store.connection() as conn:
                conn.execute("UPDATE supply_offers SET price_breaks = %s::jsonb, currency = 'EUR' WHERE listing_id = %s", (f'[[1, {price}]]', f"l-{mpn}-c1"))
        with self.store.connection() as conn:
            self.watches.add_watch(conn, "Acme", "A", "seed@example.com")

            def order(sort: str) -> list[str]:
                return [item["mpn"] for item in self.parts_view.list_parts(conn, sort=sort)["items"]]

            self.assertEqual(order("price:desc"), ["C", "B", "D", "A"], "by value, not text")
            self.assertEqual(order("price:asc"), ["D", "B", "C", "A"])
            self.assertEqual(order("stock:desc"), ["C", "B", "D", "A"])
            self.assertEqual(order("stock:asc"), ["D", "B", "C", "A"])
            self.assertEqual(order("part:asc"), ["A", "B", "C", "D"])
            self.assertEqual(order("part:desc"), ["D", "C", "B", "A"])
            self.assertEqual(self.parts_view.list_parts(conn, sort="stock:desc", limit=2, offset=2)["items"][0]["mpn"], "D", "paged in the same order")

    def test_the_list_keeps_only_the_parts_named_and_puts_them_in_the_order_given(self) -> None:
        ids = {mpn: self.follow(mpn, [stock]) for mpn, stock in (("B", 50), ("C", 900), ("D", 0))}
        with self.store.connection() as conn:
            listed = self.parts_view.list_parts(conn, part_ids=[ids["B"], ids["D"]], order_ids=[ids["D"], ids["B"]])
            self.assertEqual(([item["mpn"] for item in listed["items"]], listed["total"]), (["D", "B"], 2))
            paged = self.parts_view.list_parts(conn, order_ids=[ids["C"]], limit=1, offset=1)
            self.assertNotEqual(paged["items"][0]["mpn"], "C", "the ordered part is first, the rest follow")

    def test_runout_puts_the_likeliest_to_be_out_in_four_weeks_first_then_the_fewest_days_to_zero(self) -> None:
        kept = {
            "none": {"days_to_zero": None, "forecast": {"available": False}},
            "slow": {"days_to_zero": 90, "forecast": {"available": True, "p_out_4w": 0.1}},
            "sure": {"days_to_zero": 20, "forecast": {"available": True, "p_out_4w": 0.9}},
            "out": {"days_to_zero": 0, "forecast": {"available": True, "out_now": True, "p_out_4w": 0.0}},
            "sooner": {"days_to_zero": 5, "forecast": {"available": True, "p_out_4w": 0.1}},
        }
        with self.store.connection() as conn:
            for mpn, data in kept.items():
                record, _ = self.watches.add_watch(conn, "Acme", mpn, "seed@example.com")
                conn.execute("INSERT INTO supply_part_insights (part_id, computed_at, data) VALUES (%s, %s, %s::jsonb)", (record.part_id, NOW, json.dumps({"spark": [], **data})))
            ordered = [item["mpn"] for item in self.parts_view.list_parts(conn, sort="runout")["items"]]
        self.assertEqual([mpn.lower() for mpn in ordered], ["out", "sure", "sooner", "slow", "none"])

    def test_what_waits_is_open_alerts_by_kind_at_their_worst(self) -> None:
        first, second = self.follow("A-1", [10, 0]), self.follow("B-1", [10, 5])
        with self.store.connection() as conn:
            for part_id, kind, severity, state in ((first, "out_of_stock", "error", "open"), (second, "out_of_stock", "warning", "open"),
                                                   (second, "price_up", "warning", "open"), (first, "price_up", "warning", "acknowledged")):
                row = conn.execute(
                    "INSERT INTO supply_attention (part_id, kind, severity, state, first_seen_at, last_event_at) VALUES (%s, %s, %s, 'open', %s, %s) RETURNING id",
                    (part_id, kind, severity, NOW, NOW),
                ).fetchone()
                if state == "acknowledged":
                    self.attention.decide_row(conn, row["id"], self.attention.ACKNOWLEDGE, "qa@example.com")
            found = self.attention.summary(conn, NOW)
        alerts = [(item["kind"], item["severity"], item["count"]) for item in found]
        self.assertEqual(alerts, [("out_of_stock", "error", 2), ("price_up", "warning", 1)], "acknowledged ones wait for nobody")

    def test_the_dashboard_counts_the_runway_the_holders_and_each_figure_once_a_day(self) -> None:
        self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        self.follow("STEADY-1", [500] * 9, holders=("c1", "c2"))
        self.follow("GONE-1", [0, 0, 0])
        with self.store.connection() as conn:
            self.part_insights.renew(conn, NOW)
            self.assertEqual(self.dashboard.snapshot_figures(conn, NOW), 6)
            self.assertEqual(self.dashboard.snapshot_figures(conn, NOW), 0, "stored once a day")
            result = self.dashboard.build(conn, NOW)
        self.assertEqual(result["figures"]["watched"], 3)
        self.assertEqual(result["figure_history"]["watched"], [3])
        self.assertEqual(result["runway"]["out_now"], 1)
        self.assertEqual(result["runway"]["runs_out_2w"], 1)
        self.assertEqual(result["runway"]["steady"], 1)
        self.assertEqual(result["holders"]["none"], 1)
        self.assertEqual(result["holders"]["one"], 1)
        self.assertEqual(result["holders"]["two"], 1)
        self.assertEqual(sum(item["count"] for item in result["statuses"]), 3)

    def test_the_dashboard_counts_every_tracked_part_not_only_the_first_page_of_a_list(self) -> None:
        self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        self.follow("STEADY-1", [500] * 9, holders=("c1", "c2"))
        self.follow("GONE-1", [0, 0, 0])
        with self.store.connection() as conn:
            self.part_insights.renew(conn, NOW)
            result = self.dashboard.build(conn, NOW)
            listed = self.parts_view.list_parts(conn, limit=1)
            out = self.parts_view.list_parts(conn, limit=1, only="out_of_stock")
        self.assertEqual((len(listed["items"]), listed["total"], out["total"]), (1, 3, 1), "the list pages and counts every part, as the Dashboard does")
        self.assertEqual(result["figures"]["watched"], 3)
        self.assertEqual(result["figures"]["out_of_stock"], 1)
        self.assertEqual(sum(item["count"] for item in result["statuses"]), 3)
        self.assertEqual(sum(result["runway"].values()), 3)

    def test_a_kept_status_follows_the_threshold_set_on_the_watch(self) -> None:
        part_id = self.follow("THR-1", [500] * 3)
        with self.store.connection() as conn:
            (state,) = [item for item in self.parts_view.tracked_states(conn) if item["id"] == part_id]
            self.assertEqual(state["status"], "ok")
            conn.execute("UPDATE supply_watches SET threshold = 600 WHERE part_id = %s", (part_id,))
        with self.store.connection() as conn:
            (state,) = [item for item in self.parts_view.tracked_states(conn) if item["id"] == part_id]
        self.assertEqual(state["status"], "warning", "at or below the threshold")

    def test_the_insights_page_counts_findings_and_draws_only_parts_with_a_rate_and_a_lead_time(self) -> None:
        falling = self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        self.follow("STEADY-1", [500] * 9)
        with self.store.connection() as conn:
            self.part_insights.renew(conn, NOW)
            page = self.insights_page.build(conn)
        self.assertEqual(page["tracked"], 2)
        self.assertEqual(page["counts"]["draining"], 1)
        self.assertEqual([(point["part_id"], point["days_to_zero"], point["lead_days"]) for point in page["scatter"]], [(falling, 2, 30)])
        self.assertEqual(page["scatter_missing"], {"no_rate": 1, "no_lead_time": 0})
        self.assertEqual(page["distributors"]["repricing"], [])

    def test_the_risk_export_has_a_row_a_part_with_its_findings_in_words(self) -> None:
        import csv
        import io

        self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        self.follow("STEADY-1", [500] * 9, holders=("c1", "c2"))
        self.follow("=CMD-1", [500] * 9)
        with self.store.connection() as conn:
            self.part_insights.renew(conn, NOW)
            rows = list(csv.DictReader(io.StringIO(self.insights_page.risk_csv(conn))))
        by_mpn = {row["MPN"]: row for row in rows}
        self.assertEqual(set(by_mpn), {"FALL-1", "STEADY-1", "'=CMD-1"})
        fall = by_mpn["FALL-1"]
        self.assertEqual((fall["Days to zero"], fall["Lead time (days)"], fall["Distributors holding"]), ("2", "30", "1"))
        self.assertIn("Runs out within 2 weeks", fall["Findings"])
        self.assertIn("One distributor", fall["Findings"])
        self.assertEqual(by_mpn["STEADY-1"]["Findings"], "")


    def test_the_risk_grid_puts_unknown_in_its_own_cells_and_deadlines_come_soonest_first(self) -> None:
        falling = self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        both = self.follow("BOTH-1", [500] * 9, holders=("c1", "c2"))
        gone = self.follow("GONE-1", [0, 0, 0])
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET lifecycle = 'nrnd' WHERE listing_id = %s", (f"l-FALL-1-c1",))
            conn.execute("INSERT INTO supply_pcns (id, title, kind, last_time_buy, state, created_by) VALUES ('n1', 'EOL', 'end_of_life', %s, 'open', 'x')", ((NOW + timedelta(days=40)).date(),))
            conn.execute("INSERT INTO supply_pcn_parts (pcn_id, part_id) VALUES ('n1', %s)", (falling,))
            conn.execute("INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'digikey', 'last_buy_date', %s, %s)",
                         (both, (NOW + timedelta(days=10)).date().isoformat(), NOW))
            self.part_insights.renew(conn, NOW)
            result = self.dashboard.build(conn, NOW)
            page = self.insights_page.build(conn)
        grid = {row["lifecycle"]: row for row in result["risk_grid"]}
        self.assertEqual((grid["nrnd"]["one"], grid["unknown"]["two_plus"], grid["unknown"]["out"]), (1, 1, 1))
        self.assertEqual([(item["mpn"], item["kind"]) for item in result["deadlines"]], [("BOTH-1", "last_buy_date"), ("FALL-1", "last_time_buy")])
        self.assertEqual(page["lifecycle"]["mix"]["nrnd"], 1)
        self.assertEqual(page["sourcing"]["resilience"]["two"], 1)
        coverage = {row["connector_id"]: row for row in page["sourcing"]["coverage"]}
        self.assertEqual((coverage["c1"]["listed"], coverage["c1"]["in_stock"], coverage["c2"]["listed"]), (3, 2, 1))
        self.assertEqual(sum(item["parts"] for item in page["lead_times"]), 3)
        self.assertIn("up", page["price_movers"])
        self.assertEqual(page["trade"]["control"]["unknown"], 3)
        self.assertTrue(gone)

    def test_every_cell_of_the_risk_grid_opens_exactly_the_parts_it_counts(self) -> None:
        falling = self.follow("FALL-1", [1000, 900, 800, 700, 600, 500, 400, 300, 200])
        self.follow("BOTH-1", [500] * 9, holders=("c1", "c2"))
        self.follow("GONE-1", [0, 0, 0])
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_offers SET lifecycle = 'nrnd' WHERE listing_id = %s", (f"l-FALL-1-c1",))
            self.part_insights.renew(conn, NOW)
            grid = self.dashboard.build(conn, NOW)["risk_grid"]
            for row in grid:
                for column in ("two_plus", "one", "out", "not_read"):
                    found = self.parts_view.list_parts(conn, scope="watched", only=f"risk:{row['lifecycle']}.{column}")["items"]
                    self.assertEqual(len(found), row[column], f"{row['lifecycle']} {column}")
            self.assertEqual([item["id"] for item in self.parts_view.list_parts(conn, scope="watched", only="risk:nrnd.one")["items"]], [falling])
            with self.assertRaises(ValueError):
                self.parts_view.list_parts(conn, scope="watched", only="risk:nrnd.many")

    def test_a_bar_of_the_compliance_trade_lead_time_and_outlook_charts_opens_the_parts_it_counts(self) -> None:
        bad = self.follow("BAD-1", [500] * 3)
        good = self.follow("GOOD-1", [500] * 3)
        quiet = self.follow("QUIET-1", [500] * 3)
        with self.store.connection() as conn:
            for part, rohs, reach, eccn in ((bad, "Non-compliant", "REACH Affected", "3A991"), (good, "Compliant", "Unaffected", "EAR99")):
                for name, value in (("rohs_status", rohs), ("reach_status", reach), ("eccn", eccn)):
                    conn.execute("INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'digikey', %s, %s, %s)", (part, name, value, NOW))
            self.part_insights.renew(conn, NOW)
            page = self.insights_page.build(conn)

            def ids(only: str) -> set[str]:
                return {item["id"] for item in self.parts_view.list_parts(conn, scope="watched", only=only)["items"]}

            self.assertEqual(ids("rohs_not_compliant"), {bad})
            self.assertEqual(ids("rohs_compliant"), {good})
            self.assertEqual(ids("rohs_unknown"), {quiet})
            self.assertEqual(ids("reach_affected"), {bad})
            self.assertEqual(ids("control_controlled"), {bad})
            self.assertEqual(ids("control_none"), {good})
            self.assertEqual(ids("control_unknown"), {quiet})
            self.assertEqual(ids("lead_2_to_8w"), {bad, good, quiet})
            self.assertEqual(ids("lead_none"), set())
            for band, count in page["lifecycle"]["outlook"].items():
                self.assertEqual(len(ids(f"outlook_{band}")), count)
            # Every list is as long as the count of its bar.
            for group, count in (("rohs_not_compliant", page["lifecycle"]["compliance"]["rohs"]["not_compliant"]), ("control_unknown", page["trade"]["control"]["unknown"])):
                self.assertEqual(len(ids(group)), count)

    def test_a_bar_per_country_or_distributor_opens_the_parts_it_counts(self) -> None:
        one = self.follow("ONE-1", [500] * 5)
        two = self.follow("TWO-1", [500] * 5, holders=("c1", "c2"))
        none = self.follow("NONE-1", [0] * 5)
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'mouser', 'origin_country', 'China', %s)", (one, NOW))
            conn.execute("UPDATE supply_connectors SET display_name = 'Alpha' WHERE id = 'c1'")
            conn.execute("UPDATE supply_connectors SET display_name = 'Beta' WHERE id = 'c2'")
            self.part_insights.renew(conn, NOW)
            page = self.insights_page.build(conn)

            def ids(only: str) -> set[str]:
                return {item["id"] for item in self.parts_view.list_parts(conn, scope="watched", only=only)["items"]}

            self.assertEqual(ids("origin:China"), {one})
            self.assertEqual(ids("origin:Unknown"), {two, none})
            self.assertEqual(ids("listed:Alpha"), {one, two, none})
            self.assertEqual(ids("listed:Beta"), {two})
            self.assertEqual(ids("stocked:Alpha"), {one, two})
            coverage = {row["name"]: row for row in page["sourcing"]["coverage"]}
            self.assertEqual((len(ids("listed:Alpha")), len(ids("stocked:Alpha"))), (coverage["Alpha"]["listed"], coverage["Alpha"]["in_stock"]))
            self.assertEqual(ids("leader:Alpha"), set())
            with self.assertRaises(ValueError):
                ids("nonsense")
            with self.assertRaises(ValueError):
                ids("country:China")

    def test_a_persons_export_control_mark_wins_over_what_distributors_state(self) -> None:
        from app.services.supply import trade_marks

        part = self.follow("CTRL-1", [500] * 3)
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'digikey', 'eccn', '3A991', %s)", (part, NOW))
            self.assertEqual(trade_marks.state(conn, part)["control"], "controlled")
            trade_marks.set_mark(conn, part, "none", "", "ana@example.com")
            self.assertEqual(trade_marks.state(conn, part)["control"], "none")
            self.assertEqual(self.insights_page.build(conn)["trade"]["control"]["none"], 1)
            with self.assertRaises(trade_marks.TradeMarkError):
                trade_marks.set_mark(conn, part, "controlled", "", "ana@example.com")
            self.assertTrue(trade_marks.clear_mark(conn, part, "ana@example.com"))
            self.assertEqual(trade_marks.state(conn, part)["control"], "controlled")


if __name__ == "__main__":
    unittest.main()
