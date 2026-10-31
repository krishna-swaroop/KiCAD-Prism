"""Read order (urgency), when a listing is next due, and backoff. Pure rules, no database."""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import tiers  # noqa: E402
from app.services.supply.tiers import Urgency, UrgencyInputs  # noqa: E402
from app.services.supply.vocabulary import Lifecycle  # noqa: E402

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


def pick(**kwargs) -> Urgency:
    return tiers.urgency(UrgencyInputs(now=NOW, **kwargs))


class UrgencyTests(unittest.TestCase):
    def test_a_quiet_part_is_normal(self) -> None:
        self.assertEqual(pick(total_stock=5000), Urgency.NORMAL)
        self.assertEqual(pick(), Urgency.NORMAL, "no stock known yet")

    def test_a_pin_goes_first(self) -> None:
        self.assertEqual(pick(pinned=True, total_stock=100000), Urgency.HOT)

    def test_no_stock_at_all_is_hot(self) -> None:
        self.assertEqual(pick(total_stock=0), Urgency.HOT)

    def test_a_threshold_makes_a_part_urgent_as_stock_nears_it(self) -> None:
        self.assertEqual(pick(total_stock=100, threshold=100), Urgency.HOT, "at the threshold")
        self.assertEqual(pick(total_stock=40, threshold=100), Urgency.HOT, "below it")
        self.assertEqual(pick(total_stock=250, threshold=100), Urgency.WARM, "within three times")
        self.assertEqual(pick(total_stock=300, threshold=100), Urgency.NORMAL, "comfortably above")
        self.assertEqual(pick(total_stock=5, threshold=0), Urgency.NORMAL, "a zero threshold only matters at zero")

    def test_a_part_going_out_of_production_is_at_least_warm(self) -> None:
        for lifecycle in (Lifecycle.NRND, Lifecycle.LAST_TIME_BUY, Lifecycle.OBSOLETE):
            self.assertEqual(pick(lifecycle=lifecycle, total_stock=5000), Urgency.WARM, lifecycle)
        self.assertEqual(pick(lifecycle=Lifecycle.ACTIVE, total_stock=5000), Urgency.NORMAL)

    def test_a_projected_rupture_matters_by_how_near_it_is(self) -> None:
        self.assertEqual(pick(total_stock=5000, rupture_days=10), Urgency.HOT)
        self.assertEqual(pick(total_stock=5000, rupture_days=14), Urgency.HOT)
        self.assertEqual(pick(total_stock=5000, rupture_days=40), Urgency.WARM)
        self.assertEqual(pick(total_stock=5000, rupture_days=None), Urgency.NORMAL)

    def test_recent_movement_is_warm_and_old_movement_is_not(self) -> None:
        self.assertEqual(pick(last_change_at=NOW - timedelta(hours=3)), Urgency.WARM)
        self.assertEqual(pick(last_change_at=NOW - timedelta(days=2)), Urgency.NORMAL)

    def test_the_most_urgent_rule_wins(self) -> None:
        self.assertEqual(pick(lifecycle=Lifecycle.NRND, total_stock=0), Urgency.HOT)
        self.assertEqual(pick(last_change_at=NOW - timedelta(hours=1), pinned=True), Urgency.HOT)

    def test_lower_is_first(self) -> None:
        self.assertLess(Urgency.HOT, Urgency.WARM)
        self.assertLess(Urgency.WARM, Urgency.NORMAL)


class ScheduleTests(unittest.TestCase):
    def test_backoff_doubles_and_is_capped(self) -> None:
        self.assertEqual(tiers.backoff(0), timedelta(0))
        self.assertEqual([tiers.backoff(n) for n in (1, 2, 3)],
                         [timedelta(minutes=5), timedelta(minutes=10), timedelta(minutes=20)])
        self.assertEqual(tiers.backoff(30), timedelta(hours=24))

    def test_a_daily_listing_is_next_due_as_the_providers_next_day_opens_after_the_accounts_start_delay(self) -> None:
        midnight = datetime(2026, 3, 2, 0, 0, tzinfo=timezone.utc)
        for part in ("a", "b", "part-42", ""):
            when = tiers.next_poll_at(NOW, "daily", part_key=part, account_key="acct")
            self.assertGreaterEqual(when, midnight + timedelta(minutes=5), part)
            self.assertLessEqual(when, midnight + timedelta(minutes=30), part)
        self.assertEqual(tiers.next_poll_at(NOW, "daily", part_key="a", account_key="acct"), tiers.next_poll_at(NOW, "daily", part_key="b", account_key="acct"),
                         "an account's daily reads are due together")

    def test_a_daily_listing_follows_the_providers_reset(self) -> None:
        when = tiers.next_poll_at(NOW, "daily", part_key="x", account_key="acct", reset_time="18:00", tz="UTC")
        self.assertGreaterEqual(when, datetime(2026, 3, 1, 18, 5, tzinfo=timezone.utc))
        self.assertLessEqual(when, datetime(2026, 3, 1, 18, 30, tzinfo=timezone.utc))

    def test_the_time_of_a_daily_read_changes_from_day_to_day_and_between_accounts(self) -> None:
        offsets = set()
        for day in range(1, 29):
            moment = datetime(2026, 3, day, 12, 0, tzinfo=timezone.utc)
            when = tiers.next_poll_at(moment, "daily", account_key="acct")
            offsets.add(when - datetime(when.year, when.month, when.day, tzinfo=timezone.utc))
        self.assertGreater(len(offsets), 15, "never at the same moment every day")
        across = {tiers.next_poll_at(NOW, "daily", account_key=f"acct-{i}") for i in range(50)}
        self.assertGreater(len(across), 30)

    def test_weekly_and_monthly_listings_are_due_on_their_parts_day_slot_and_a_slot_is_due_together(self) -> None:
        for schedule in ("weekly", "monthly"):
            slots, least = tiers.SLOTS[schedule], tiers.MIN_WAIT_DAYS[schedule]
            whens = {f"p{i}": tiers.next_poll_at(NOW, schedule, part_key=f"p{i}", account_key="acct") for i in range(200)}
            waits = [(when - NOW).total_seconds() / 86400 for when in whens.values()]
            self.assertGreaterEqual(min(waits), least - 1, schedule)
            self.assertLess(max(waits), least + slots + 1, schedule)
            self.assertLessEqual(len(set(whens.values())), slots, "one moment for each slot")
            self.assertGreater(len(set(whens.values())), slots // 2, "parts spread over the slots")
            self.assertEqual(tiers.next_poll_at(NOW, schedule, part_key="p1", account_key="acct"), whens["p1"], "stable for a part")

    def test_a_calm_listing_is_read_at_half_its_rate_until_it_changes_or_turns_urgent(self) -> None:
        calm, recent = NOW - timedelta(days=8), NOW - timedelta(days=3)
        self.assertEqual(tiers.stretch("daily", Urgency.NORMAL, calm, NOW), 2, "no change for a week of daily reads")
        self.assertEqual(tiers.stretch("daily", Urgency.NORMAL, recent, NOW), 1, "changed three days ago")
        self.assertEqual(tiers.stretch("daily", Urgency.WARM, calm, NOW), 1, "near its threshold, or ending")
        self.assertEqual(tiers.stretch("daily", Urgency.NORMAL, None, NOW), 1)
        self.assertEqual(tiers.stretch("weekly", Urgency.NORMAL, calm, NOW), 1, "a week is one weekly read, not seven")
        self.assertEqual(tiers.stretch("weekly", Urgency.NORMAL, NOW - timedelta(days=50), NOW), 2)
        daily = tiers.next_poll_at(NOW, "daily", account_key="acct")
        self.assertEqual((tiers.next_poll_at(NOW, "daily", account_key="acct", stretch=2) - daily).days, 1, "every second provider day")
        for schedule in ("weekly", "monthly"):
            slots, least = tiers.SLOTS[schedule], tiers.MIN_WAIT_DAYS[schedule]
            waits = [(tiers.next_poll_at(NOW, schedule, part_key=f"p{i}", account_key="acct", stretch=2) - NOW).total_seconds() / 86400 for i in range(200)]
            self.assertGreaterEqual(min(waits), 2 * least - 1, schedule)
            self.assertLess(max(waits), 2 * least + slots + 1, schedule)

    def test_a_retry_follows_the_backoff_and_ignores_the_schedule(self) -> None:
        for streak in (1, 2, 3, 6, 12):
            wait = tiers.retry_at(NOW, streak, key="x") - NOW
            self.assertGreaterEqual(wait, tiers.backoff(streak), streak)
            self.assertLessEqual(wait, tiers.backoff(streak) * 1.1, streak)
        self.assertLess(tiers.retry_at(NOW, 1, key="x") - NOW, tiers.interval("daily"),
                        "a first failure is retried long before the next day")

    def test_retries_wait_longer_each_time_up_to_a_day(self) -> None:
        waits = [tiers.retry_at(NOW, streak, key="x") - NOW for streak in range(1, 12)]
        self.assertEqual(waits, sorted(waits))
        self.assertLessEqual(waits[-1], timedelta(hours=24) * 1.1)

    def test_a_retry_with_no_streak_still_waits(self) -> None:
        self.assertGreaterEqual(tiers.retry_at(NOW, 0, key="x") - NOW, tiers.backoff(1))


if __name__ == "__main__":
    unittest.main()
