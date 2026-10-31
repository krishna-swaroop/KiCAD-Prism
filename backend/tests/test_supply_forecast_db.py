"""Forecasts end to end: made from kept readings, stored, checked when their day comes, and shown only once the model has earned it.

Needs ``PRISM_DATABASE_URL``. Readings are written by hand; no distributor is called.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import reading as _reading  # noqa: E402
from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
START = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
ADMIN = "admin@example.com"


def _load_backtest():
    """The backtest lives under ``backend/scripts``, outside the app package."""

    path = Path(__file__).resolve().parents[1] / "scripts" / "forecast_backtest.py"
    spec = importlib.util.spec_from_file_location("prism_forecast_backtest", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class ForecastDbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_forecast
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database = database
        cls.user = AuthenticatedUser(email=ADMIN, name="admin", role="admin")
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_forecast_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_forecast.router)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        from app.services.supply.forecast import inputs, models
        from app.services.supply import parts, watches

        inputs.forget_outage_pool()
        inputs.forget_price_pool()
        inputs.forget_lifecycle_rates()
        with self.store.connection() as conn:
            for table in ("supply_forecast_checks", "supply_forecasts", "supply_forecast_models", "supply_events", "supply_stock_events", "supply_samples", "supply_offers", "supply_listings", "supply_watches", "supply_part_tiers",
                          "supply_part_forecasts", "supply_part_insights", "supply_part_summaries", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_bom_usage", "supply_bom_usage_projects"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(actor=ADMIN, provider="mouser", currency="EUR", display_name="Mouser", credentials={"api_key": "k"})["id"]
        self.other = self.connectors.create(actor=ADMIN, provider="digikey", storefront="IT", currency="EUR", display_name="DigiKey",
                                            credentials={"client_id": "c", "client_secret": "s"})["id"]
        with self.store.connection() as conn:
            self.part_id = parts.ensure_part(conn, "Acme", "FALL-1", ADMIN).id
            watches.add_watch(conn, "Acme", "FALL-1", ADMIN, tier=1)

    # --- helpers ----------------------------------------------------------

    def listing(self, connector_id, sku, part_id=None):
        listing_id = uuid.uuid4().hex
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')",
                (listing_id, connector_id, sku, part_id or self.part_id),
            )
        return listing_id

    def readings(self, listing_id, values, first_day, *, fetched_at, price="0.50"):
        with self.store.connection() as conn:
            for index, stock in enumerate(values):
                _reading(conn, listing_id, first_day + timedelta(days=index), stock, price=price)
            conn.execute(
                "INSERT INTO supply_offers (listing_id, fetched_at, stock, currency, price_breaks) VALUES (%s, %s, %s, 'EUR', '[[1, \"0.50\"]]'::jsonb) "
                "ON CONFLICT (listing_id) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, stock = EXCLUDED.stock",
                (listing_id, fetched_at, values[-1]),
            )

    def falling(self, listing_id, end=START):
        """3,000 falling by 100 a day for 20 days, the last reading on ``end``: 1,000 left, 10 days to go."""

        self.readings(listing_id, [3000 - 100 * i for i in range(21)], end - timedelta(days=20), fetched_at=end)

    def rows(self, sql, *params):
        with self.store.connection() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    # --- price moves ------------------------------------------------------

    def test_a_cheaper_listing_joining_is_not_a_repricing_but_a_listing_changing_its_price_is(self) -> None:
        import math

        from app.services.supply.forecast import inputs, models

        first, joined = self.listing(self.cid, "A"), self.listing(self.other, "B")
        self.readings(first, [100] * 10, START - timedelta(days=19), fetched_at=START, price="0.50")
        self.readings(first, [100] * 10, START - timedelta(days=9), fetched_at=START, price="0.60")
        self.readings(joined, [100] * 6, START - timedelta(days=5), fetched_at=START, price="0.05")
        with self.store.connection() as conn:
            own = inputs.own_moves(conn, self.part_id, START)
            cheapest = models.moves_of(inputs.series_of(conn, self.part_id, START))
        self.assertEqual(own.count, 1, "only the listing that changed its price moved")
        self.assertAlmostEqual(own.sizes[0], math.log(0.60 / 0.50), places=6)
        self.assertEqual(cheapest.count, 0, "the cheaper listing counts from the start, so the cheapest price does not jump when it is found")
        self.assertLessEqual(max(abs(size) for size in own.sizes), models.MAX_MOVE)

    def test_a_reel_repricing_does_not_set_the_moves_of_a_cut_tape_part(self) -> None:
        from app.services.supply.forecast import inputs

        cut, reel = self.listing(self.cid, "A"), self.listing(self.other, "B")
        self.readings(cut, [100] * 20, START - timedelta(days=19), fetched_at=START, price="0.50")
        self.readings(reel, [100] * 20, START - timedelta(days=19), fetched_at=START, price="0.30")
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_price_breaks_history SET moq = 3000 WHERE listing_id = %s", (reel,))
            conn.execute("UPDATE supply_price_breaks_history SET breaks = '[[1, \"0.40\"]]'::jsonb WHERE listing_id = %s AND since > %s", (reel, START - timedelta(days=9)))
            self.assertEqual(inputs.own_moves(conn, self.part_id, START).count, 0, "the reel changed its price, the cut tape did not")
            conn.execute("DELETE FROM supply_samples WHERE listing_id = %s", (cut,))
            self.assertEqual(inputs.own_moves(conn, self.part_id, START).count, 1, "with nothing else pricing the part the reel counts")

    def test_the_pooled_moves_read_every_part_at_once_and_add_up_to_each_parts_own(self) -> None:
        from app.services.supply.forecast import inputs
        from app.services.supply import parts, prices

        with self.store.connection() as conn:
            other = parts.ensure_part(conn, "Acme", "RISE-1", ADMIN).id
        mine, theirs, quiet = self.listing(self.cid, "A"), self.listing(self.other, "B", part_id=other), self.listing(self.other, "C")
        self.readings(mine, [100] * 10, START - timedelta(days=19), fetched_at=START, price="0.50")
        self.readings(mine, [100] * 10, START - timedelta(days=9), fetched_at=START, price="0.60")
        self.readings(theirs, [100] * 10, START - timedelta(days=19), fetched_at=START, price="1.00")
        self.readings(theirs, [100] * 10, START - timedelta(days=9), fetched_at=START, price="0.80")
        self.readings(quiet, [100] * 20, START - timedelta(days=19), fetched_at=START, price="0.55")
        with self.store.connection() as conn:
            together = prices.listing_series_of(conn, [self.part_id, other, "no-such-part"], START)
            self.assertEqual(together[self.part_id], prices.listing_series(conn, self.part_id, START))
            self.assertEqual(together[other], prices.listing_series(conn, other, START))
            self.assertEqual(together["no-such-part"], {})
            pooled = inputs.pooled_moves(conn, [self.part_id, other], START)
            each = [inputs.own_moves(conn, part_id, START) for part_id in (self.part_id, other)]
        self.assertEqual((pooled.count, sorted(pooled.sizes)), (2, sorted(size for moves in each for size in moves.sizes)))
        self.assertAlmostEqual(pooled.span, sum(moves.span for moves in each))

    # --- making and keeping -------------------------------------------------

    def test_a_falling_part_gets_its_forecasts_kept_and_the_little_a_list_needs(self) -> None:
        from app.services.supply.forecast import models, run

        self.falling(self.listing(self.cid, "FALL-SKU"))
        with self.store.connection() as conn, mock.patch.dict(models.MIN_SPAN_DAYS, {30: 7, 90: 7}):  # the fall is 20 days of readings
            summary = run.run_part(conn, self.part_id, START)
        self.assertTrue(summary["available"])
        self.assertEqual(summary["runout"]["median_date"], (START + timedelta(days=10)).date().isoformat())
        self.assertEqual(summary["p_out_4w"], 1.0)
        kept = {row["target"]: row for row in self.rows("SELECT * FROM supply_forecasts WHERE subject_id = %s", self.part_id)}
        self.assertTrue({"runout", "can_buy_4w", "can_buy_8w", "out_4w", "price_30", "price_90"} <= set(kept))
        self.assertEqual(kept["runout"]["horizon_days"], 10)
        self.assertEqual(kept["can_buy_4w"]["horizon_days"], 28)

    def test_asking_again_the_same_day_replaces_the_forecast_instead_of_adding_one(self) -> None:
        from app.services.supply.forecast import run

        self.falling(self.listing(self.cid, "FALL-SKU"))
        with self.store.connection() as conn:
            run.run_part(conn, self.part_id, START)
            run.run_part(conn, self.part_id, START)
        self.assertEqual(len(self.rows("SELECT id FROM supply_forecasts WHERE target = 'runout'")), 1)

    def test_a_part_with_a_week_of_readings_or_less_has_none(self) -> None:
        from app.services.supply.forecast import run

        self.readings(self.listing(self.cid, "SHORT"), [900, 800, 700], START - timedelta(days=2), fetched_at=START)
        with self.store.connection() as conn:
            summary = run.run_part(conn, self.part_id, START)
        self.assertFalse(summary["available"])
        self.assertEqual(self.rows("SELECT id FROM supply_forecasts WHERE target = 'runout'"), [])

    # --- checking ----------------------------------------------------------

    def test_a_forecast_is_checked_when_its_day_comes_and_the_model_learns_from_it(self) -> None:
        from app.services.supply.forecast import run, store

        listing = self.listing(self.cid, "FALL-SKU")
        self.falling(listing)
        with self.store.connection() as conn:
            run.run_part(conn, self.part_id, START)
            self.assertEqual(run.check_due(conn, START + timedelta(days=3)), 0, "its day has not come")
        # What happened: stock fell to nothing on day 10, as said.
        self.readings(listing, [1000 - 100 * i for i in range(1, 16) if 1000 - 100 * i > 0] + [0] * 6, START + timedelta(days=1), fetched_at=START + timedelta(days=16))
        later = START + timedelta(days=16)
        with self.store.connection() as conn:
            checked = run.check_due(conn, later)
            states = store.update_models(conn, later)
        self.assertEqual(checked, 1, "only the runout is due; the four-week ones are not")
        check = self.rows("SELECT c.observed, c.inside, c.void FROM supply_forecast_checks c JOIN supply_forecasts f ON f.id = c.forecast_id WHERE f.target = 'runout'")[0]
        self.assertEqual((check["observed"], check["inside"], check["void"]), (10.0, True, False))
        self.assertEqual(states["runout"], "learning", "one check is not enough to be shown")
        with self.store.connection() as conn:
            model = store.model_states(conn)["runout"]
        self.assertEqual((model["checks"], model["needs"]), (1, 40))

    def test_a_forecast_about_a_day_nobody_read_is_voided_not_judged(self) -> None:
        from app.services.supply.forecast import run

        listing = self.listing(self.cid, "FALL-SKU")
        self.falling(listing)
        with self.store.connection() as conn:
            run.run_part(conn, self.part_id, START)
            run.check_due(conn, START + timedelta(days=40))
        voided = self.rows("SELECT c.void FROM supply_forecast_checks c JOIN supply_forecasts f ON f.id = c.forecast_id WHERE f.target = 'runout'")
        self.assertEqual([row["void"] for row in voided], [True])

    def test_a_restock_before_the_runout_voids_that_check(self) -> None:
        from app.services.supply.forecast import run

        listing = self.listing(self.cid, "FALL-SKU")
        self.falling(listing)
        with self.store.connection() as conn:
            run.run_part(conn, self.part_id, START)
        self.readings(listing, [1000 - 100 * i for i in range(1, 5)] + [5000] * 14, START + timedelta(days=1), fetched_at=START + timedelta(days=16))
        with self.store.connection() as conn:
            run.check_due(conn, START + timedelta(days=16))
        row = self.rows("SELECT c.void FROM supply_forecast_checks c JOIN supply_forecasts f ON f.id = c.forecast_id WHERE f.target = 'runout'")[0]
        self.assertTrue(row["void"])

    # --- states ------------------------------------------------------------

    def seed_checks(self, target, rows):
        """Checks written straight in: (made_on offset, probability, inside, observed)."""

        from app.services.supply.forecast import store

        with self.store.connection() as conn:
            for index, (probability, inside, observed) in enumerate(rows):
                made = (START - timedelta(days=400 - index)).date()
                fid = store.store(conn, "part", self.part_id, target, made, 10, model="t", scope=str(index), low=1, high=2, median=1.5, probability=probability)
                store.record_check(conn, fid, made, observed=observed, inside=inside)

    def test_a_model_is_shown_when_enough_checks_say_it_holds_and_paused_when_the_latest_say_it_does_not(self) -> None:
        from app.services.supply.forecast import store

        self.seed_checks("runout", [(None, i % 5 != 0, 5.0) for i in range(45)])
        with self.store.connection() as conn:
            self.assertEqual(store.update_models(conn, START)["runout"], "shown")
            first = store.model_states(conn)["runout"]
        self.assertEqual((first["checks"], first["score"]), (45, 0.8))
        self.seed_checks("price_30", [(None, False, 1.0) for _ in range(45)])
        with self.store.connection() as conn:
            states = store.update_models(conn, START)
            miss = store.model_states(conn)["price_30"]
        self.assertEqual(states["price_30"], "learning", "never shown, so it is still learning, with its record said")
        self.assertIn("held 0%", miss["reason"])
        # The shown model starts missing: the last thirty checks all fall outside.
        with self.store.connection() as conn:
            for index in range(30):
                made = (START - timedelta(days=100 - index)).date()
                fid = store.store(conn, "part", self.part_id, "runout", made, 10, model="t", scope=f"late{index}", low=1, high=2, median=1.5)
                store.record_check(conn, fid, made, observed=9.0, inside=False)
            self.assertEqual(store.update_models(conn, START)["runout"], "paused")

    def test_chances_are_judged_on_calibration(self) -> None:
        from app.services.supply.forecast import store

        self.seed_checks("can_buy_4w", [(0.7, None, 1.0 if i % 10 < 7 else 0.0) for i in range(70)])
        with self.store.connection() as conn:
            self.assertEqual(store.update_models(conn, START)["can_buy_4w"], "shown")
            curve = store.reliability(conn, "can_buy_4w")
        self.assertEqual([(round(b["said"], 1), round(b["happened"], 1)) for b in curve], [(0.7, 0.7)])

    def test_a_backtest_replays_past_days_from_the_readings_up_to_each_and_checks_them(self) -> None:
        backtest = _load_backtest()

        listing = self.listing(self.cid, "FALL-SKU")
        # 60 days: falling 100 a day to zero on day 30, then a restock of 5,000 and falling again.
        values = [3000 - 100 * i for i in range(31)] + [5000 - 100 * i for i in range(1, 30)]
        self.readings(listing, values, START - timedelta(days=59), fetched_at=START)
        with self.store.connection() as conn:
            result = backtest.run(conn, (START - timedelta(days=50)).date(), START + timedelta(days=1))
        checks = self.rows("SELECT COUNT(*) AS n FROM supply_forecast_checks c JOIN supply_forecasts f ON f.id = c.forecast_id WHERE f.target = 'runout' AND NOT c.void")
        self.assertGreater(result["kept"], 20)
        self.assertGreater(checks[0]["n"], 3, "the runouts made in the first falling run were judged")
        first = self.rows("SELECT made_on FROM supply_forecasts WHERE target = 'can_buy_4w' ORDER BY made_on LIMIT 1")[0]["made_on"]
        self.assertEqual(first, (START - timedelta(days=50)).date())

    # --- the API ------------------------------------------------------------

    def get(self, path, query=""):
        return _request(self.app, "GET", path, user=self.user, query=query)

    def test_the_part_forecast_comes_as_dates_and_words_with_each_models_state(self) -> None:
        from app.services.supply.forecast import models, views

        self.falling(self.listing(self.cid, "FALL-SKU"))
        with self.store.connection() as conn, mock.patch.dict(models.MIN_SPAN_DAYS, {30: 7, 90: 7}):
            found = views.part(conn, self.part_id, START, quantity=100)
        self.assertTrue(found["available"])
        self.assertEqual(found["runout"]["median"], (START + timedelta(days=10)).date().isoformat())
        self.assertEqual(found["runout"]["state"]["state"], "learning")
        self.assertEqual(found["runout"]["state"]["needs"], 40)
        self.assertEqual(found["weeks"][0]["word"], "Almost certain", "100 can be bought next week")
        self.assertEqual(found["weeks"][3]["word"], "Very unlikely", "and not in a month")
        self.assertEqual(found["quantity"], 100)
        self.assertTrue(found["price"]["h90"]["flat"])
        self.assertEqual(found["path"][0]["day"], START.date().isoformat())
        self.assertNotIn("end_of_life", found, "the lifecycle chance waits for the changes it needs; until then it is the prior's")
        from app.services.supply.forecast import inputs

        with self.store.connection() as conn, mock.patch.dict(models.MIN_SPAN_DAYS, {30: 7, 90: 7}), \
                mock.patch.object(models, "MIN_CHANGES_TO_SHOW", 0):
            shown = views.part(conn, self.part_id, START, quantity=100)
        self.assertIn("p12", shown["end_of_life"], "and is shown once it rests on data")

    def test_the_sheet_reads_the_kept_forecast_until_a_reading_changes_or_the_day_turns(self) -> None:
        from app.services.supply.forecast import models, run, views

        listing = self.listing(self.cid, "FALL-SKU")
        self.falling(listing)
        with mock.patch.dict(models.MIN_SPAN_DAYS, {30: 7, 90: 7}):
            with self.store.connection() as conn:
                run.run_part(conn, self.part_id, START)
            with self.store.connection() as conn, mock.patch.object(run, "part_forecast", side_effect=AssertionError("worked out again")):
                kept = views.part(conn, self.part_id, START)
            self.assertTrue(kept["available"])
            self.assertEqual(kept["runout"]["median"], (START + timedelta(days=10)).date().isoformat())

            with self.store.connection() as conn, mock.patch.object(run, "part_forecast", wraps=run.part_forecast) as made:
                self.assertEqual(views.part(conn, self.part_id, START, quantity=7)["quantity"], 7)
                self.assertEqual(made.call_count, 1, "another quantity is worked out")
                views.part(conn, self.part_id, START)
                self.assertEqual(made.call_count, 1, "and leaves the kept one as it was")

            self.readings(listing, [900], START, fetched_at=START)
            with self.store.connection() as conn, mock.patch.object(run, "part_forecast", wraps=run.part_forecast) as made:
                views.part(conn, self.part_id, START)
                views.part(conn, self.part_id, START)
            self.assertEqual(made.call_count, 1, "a new reading makes it stale; the one worked out then is kept")

            with self.store.connection() as conn, mock.patch.object(run, "part_forecast", wraps=run.part_forecast) as made:
                views.part(conn, self.part_id, START + timedelta(days=1))
            self.assertEqual(made.call_count, 1, "a new day works it out again")

    def test_the_pooled_outage_model_is_worked_out_again_once_a_stock_out_is_recorded(self) -> None:
        from app.services.supply.forecast import inputs

        listing = self.listing(self.cid, "OUT-SKU")
        day = START.date()
        with self.store.connection() as conn:
            first = inputs.pooled(conn, day)
            self.assertIs(inputs.pooled(conn, day), first, "kept while nothing changed")
            conn.execute(
                "INSERT INTO supply_stock_events (listing_id, day, kind, stock_before, stock_after) VALUES (%s, %s, 'stock_out', 10, 0)",
                (listing, day - timedelta(days=3)),
            )
            self.assertIsNot(inputs.pooled(conn, day), first)

    def test_a_part_with_an_open_notice_and_distributors_dropping_it_is_likelier_to_end_but_never_certain(self) -> None:
        from app.services.supply.forecast import inputs

        listing = self.listing(self.cid, "EOL-SKU")
        self.readings(listing, [100] * 10, START - timedelta(days=9), fetched_at=START)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_parts SET created_at = %s", (START - timedelta(days=1080),))  # three years watched: a small pooled rate
            plain = inputs.part_chance(conn, self.part_id, "active", START.date())
            conn.execute("INSERT INTO supply_pcns (id, title, kind, state, created_by) VALUES ('n1', 'EOL', 'end_of_life', 'open', 'a')")
            conn.execute("INSERT INTO supply_pcn_parts (pcn_id, part_id) VALUES ('n1', %s)", (self.part_id,))
            noticed = inputs.part_chance(conn, self.part_id, "active", START.date())
            conn.execute("UPDATE supply_offers SET discontinued = TRUE WHERE listing_id = %s", (listing,))
            dropped = inputs.part_chance(conn, self.part_id, "active", START.date())
            self.assertEqual(plain["signs"], {"notice": False, "dropped_share": 0.0})
            self.assertEqual(dropped["signs"], {"notice": True, "dropped_share": 1.0})
            self.assertAlmostEqual(noticed["rate"] / plain["rate"], 3.0, places=6)
            self.assertAlmostEqual(dropped["rate"] / plain["rate"], 6.0, places=6, msg="the notice x3 and every distributor dropping it x2")
            self.assertLess(dropped["p12"], 0.95)
            self.assertGreater(dropped["p12"], noticed["p12"])
            conn.execute("UPDATE supply_pcns SET state = 'closed'")
            self.assertFalse(inputs.signs(conn, self.part_id)["notice"], "a closed notice is no sign")

    def test_a_part_with_few_readings_since_its_restock_borrows_the_drain_of_five_similar_parts(self) -> None:
        from app.services.supply.forecast import inputs, models
        from app.services.supply import parts, watches

        category = "INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'mouser', 'category', 'Op Amps', %s)"
        with self.store.connection() as conn:
            conn.execute(category, (self.part_id, START))
            twins = []
            for index in range(5):
                twin = parts.ensure_part(conn, "Acme", f"TWIN-{index}", ADMIN).id
                watches.add_watch(conn, "Acme", f"TWIN-{index}", ADMIN, tier=1)
                conn.execute(category, (twin, START))
                twins.append(twin)
        for twin in twins:
            self.falling(self.listing(self.cid, f"TWIN-SKU-{twin[:6]}", twin))  # 100 a day from 3,000: 3.3% to 10% of stock a day
        # This part: a restock to 3,000 two days ago and three readings since.
        self.readings(self.listing(self.cid, "NEW-SKU"), [200] * 12 + [3000, 2950, 2900], START - timedelta(days=14), fetched_at=START)
        with self.store.connection() as conn:
            shares = inputs.similar_shares(conn, self.part_id, START)
            found = inputs.holders(conn, self.part_id, START)
            alone = inputs.holders(conn, self.part_id, START, borrow=False)
        self.assertIsNotNone(shares)
        self.assertEqual(len(shares), 5)
        self.assertTrue(all(0.0 < share < 0.2 for share in shares), shares)
        self.assertIsNotNone(found[0].similar)
        self.assertIsNone(alone[0].similar)
        self.assertLess(len(models.run_since_restock(found[0].series)), models.FEW_READINGS)

    def test_four_similar_parts_are_too_few_to_borrow_from(self) -> None:
        from app.services.supply.forecast import inputs
        from app.services.supply import parts, watches

        category = "INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'mouser', 'category', 'Op Amps', %s)"
        with self.store.connection() as conn:
            conn.execute(category, (self.part_id, START))
            twins = []
            for index in range(4):
                twin = parts.ensure_part(conn, "Acme", f"TWIN-{index}", ADMIN).id
                watches.add_watch(conn, "Acme", f"TWIN-{index}", ADMIN, tier=1)
                conn.execute(category, (twin, START))
                twins.append(twin)
        for index, twin in enumerate(twins):
            self.falling(self.listing(self.cid, f"SKU-{index}", twin))
        with self.store.connection() as conn:
            self.assertIsNone(inputs.similar_shares(conn, self.part_id, START))

    def test_the_forecast_endpoint_and_the_track_record_on_the_insights_read(self) -> None:
        self.falling(self.listing(self.cid, "FALL-SKU"), end=datetime.now(timezone.utc))
        reply = self.get(f"/api/supply/parts/{self.part_id}/forecast", "quantity=50")
        self.assertEqual(reply.status, 200, reply.text)
        self.assertEqual(reply.json["quantity"], 50)
        self.assertEqual(self.get("/api/supply/parts/nope/forecast").status, 404)
        record = self.get("/api/supply/forecasts/insights").json["track_record"]
        self.assertEqual({m["target"] for m in record["models"]}, {"runout", "back_in", "out_4w", "can_buy_4w", "can_buy_8w", "price_30", "price_90", "lead_90", "eol_12"})
        self.assertTrue(all(m["state"] == "learning" for m in record["models"]))
        self.assertEqual(self.get(f"/api/supply/parts/{self.part_id}/forecast", "quantity=0").status, 422)

    # --- the alert ----------------------------------------------------------

    def test_likely_out_waits_for_a_shown_model_and_reads_the_newest_run(self) -> None:
        import json

        from app.services.supply.assessment import service as assessment

        listing = self.listing(self.cid, "A")
        self.readings(listing, [500], START, fetched_at=START)

        def likely(chance: float) -> bool:
            with self.store.connection() as conn:
                data = {"forecast": {"available": True, "out_now": False, "p_out_4w": chance}}
                conn.execute(
                    "INSERT INTO supply_part_insights (part_id, computed_at, data) VALUES (%s, %s, %s::jsonb) "
                    "ON CONFLICT (part_id) DO UPDATE SET data = EXCLUDED.data", (self.part_id, START, json.dumps(data)))
                found = assessment.assess_parts(conn, [self.part_id], now=START)[self.part_id]["findings"]
            return "likely_out" in {f["check"] for f in found}

        self.assertFalse(likely(0.9), "the model is still learning")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_forecast_models (target, state) VALUES ('out_4w', 'shown') ON CONFLICT (target) DO UPDATE SET state = 'shown'")
        self.assertTrue(likely(0.9), "over the workspace's 70%")
        self.assertFalse(likely(0.2), "one calm run clears it")


if __name__ == "__main__":
    unittest.main()
