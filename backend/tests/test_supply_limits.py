"""What a provider reports about its limits, and the reset time Prism works out from it."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import limits  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def at(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, day, hour, minute, tzinfo=timezone.utc)


def remaining(moment: datetime, left: int) -> dict:
    return {"at": moment, "kind": "remaining", "remaining": left}


class ParseTests(unittest.TestCase):
    def test_both_numbers_are_needed(self) -> None:
        self.assertEqual(limits.parse({"x-ratelimit-limit": "1000", "x-ratelimit-remaining": "465"}), (1000, 465))
        self.assertIsNone(limits.parse({"x-ratelimit-limit": "1000"}))
        self.assertIsNone(limits.parse({"x-ratelimit-limit": "many", "x-ratelimit-remaining": "465"}))
        self.assertEqual(limits.parse({"x-ratelimit-limit": "100", "x-ratelimit-remaining": "900"}), (100, 100))


class SuggestTests(unittest.TestCase):
    def test_remaining_that_rises_brackets_the_reset_and_two_days_narrow_it(self) -> None:
        marks = [
            remaining(at(1, 21, 50), 40), remaining(at(1, 23, 10), 1000),
            remaining(at(2, 22, 20), 35), remaining(at(2, 22, 55), 998),
            remaining(at(3, 12), 600),
        ]
        guess = limits.suggest(marks)
        self.assertEqual((guess["from"], guess["to"], guess["tz"], guess["windows"]), ("22:20", "22:55", "UTC", 2))
        self.assertEqual(guess["suggested"], "22:55")

    def test_one_day_is_not_enough_and_brackets_that_disagree_give_nothing(self) -> None:
        one_day = [remaining(at(1, 21, 50), 40), remaining(at(1, 23, 10), 1000)]
        self.assertIsNone(limits.suggest(one_day))
        disagree = one_day + [remaining(at(2, 8), 40), remaining(at(2, 9), 1000)]
        self.assertIsNone(limits.suggest(disagree), "a rolling quota rises at any hour")

    def test_a_bracket_across_midnight_still_agrees(self) -> None:
        marks = [
            remaining(at(1, 23, 30), 20), remaining(at(2, 0, 20), 1000),
            remaining(at(2, 23, 40), 25), remaining(at(3, 0, 10), 1000),
        ]
        guess = limits.suggest(marks)
        self.assertEqual((guess["from"], guess["to"]), ("23:40", "00:10"))

    def test_a_refusal_that_lasted_hours_then_a_working_call_is_a_bracket(self) -> None:
        def refusal_day(day: int):
            return [
                {"at": at(day, 22, 0), "kind": "refused"}, {"at": at(day, 22, 15), "kind": "refused"},
                {"at": at(day, 22, 30), "kind": "refused"}, {"at": at(day, 23, 0), "kind": "refused"},
                {"at": at(day, 23, 15), "kind": "ok"},
            ]

        guess = limits.suggest(refusal_day(1) + refusal_day(2))
        self.assertEqual((guess["from"], guess["to"]), ("23:00", "23:15"))

    def test_a_short_burst_refusal_says_nothing_about_the_day(self) -> None:
        marks = [{"at": at(1, 10, 0), "kind": "refused"}, {"at": at(1, 10, 20), "kind": "ok"}]
        self.assertEqual(limits.windows(marks), [])

    def test_a_bracket_wider_than_six_hours_is_ignored(self) -> None:
        self.assertEqual(limits.windows([remaining(at(1, 1), 10), remaining(at(1, 10), 1000)]), [])


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import base, registry
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.registry = database, registry
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_limits_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        registry.register(base.ProviderSpec(
            key="demo_limits", label="Limits", capabilities=frozenset({"search", "offers"}), max_batch=2,
            stock_pooling="separate", credential_fields=(), factory=lambda config: FakeProvider(config),
            default_daily_budget=1000, calls_per_offers_batch=1,
        ), replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.registry.unregister("demo_limits")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        limits._last.clear()
        with self.store.connection() as conn:
            for table in ("supply_limit_marks", "supply_quota_ledger", "supply_call_counts", "supply_connectors"):
                conn.execute(f"DELETE FROM {table}")
        self.cid = self.connectors.create(actor="ana@example.com", provider="demo_limits", currency="EUR", daily_budget=1000)["id"]

    def spent(self, now: datetime) -> int:
        from app.services.supply import ledger

        with self.store.connection() as conn:
            return ledger.get_state(conn, self.cid, daily_budget=1000, reserve_pct=10, now=now).spent_today

    def test_readings_are_kept_and_an_unchanged_one_writes_nothing(self) -> None:
        reading = {"x-ratelimit-limit": "1000", "x-ratelimit-remaining": "465"}
        limits.note(self.store, self.cid, reading, at(1, 10))
        limits.note(self.store, self.cid, reading, at(1, 10, 5))
        limits.note(self.store, self.cid, {**reading, "x-ratelimit-remaining": "464"}, at(1, 10, 6))
        with self.store.connection() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM supply_limit_marks").fetchone()["n"]
        self.assertEqual(count, 2)
        self.assertEqual(self.connectors.get(self.cid)["rate_limits"]["api"]["x-ratelimit-remaining"], "464")

    def test_the_providers_count_enters_the_ledger_only_after_its_reset_was_applied(self) -> None:
        reading = {"x-ratelimit-limit": "1000", "x-ratelimit-remaining": "465"}
        now = at(1, 10)
        limits.note(self.store, self.cid, reading, now)
        self.assertEqual(self.spent(now), 0, "its day is not known yet, so its count says nothing about ours")
        self.connectors.update(self.cid, actor="ana@example.com", reset_time="08:00", reset_tz="UTC", reset_from_provider=True)
        limits.note(self.store, self.cid, {**reading, "x-ratelimit-remaining": "460"}, now + timedelta(minutes=1))
        self.assertEqual(self.spent(now), 540)
        limits.note(self.store, self.cid, {**reading, "x-ratelimit-remaining": "470"}, now + timedelta(minutes=2))
        self.assertEqual(self.spent(now), 540, "the ledger never goes down")

    def test_each_api_keeps_its_own_readings_and_only_the_largest_quota_suggests(self) -> None:
        products, notices = "https://api.digikey.com/products/v4/search", "https://api.digikey.com/ChangeNotifications/v3/Products/X"
        limits.note(self.store, self.cid, {"x-ratelimit-limit": "1000", "x-ratelimit-remaining": "465"}, at(1, 10), url=products)
        limits.note(self.store, self.cid, {"x-ratelimit-limit": "50", "x-ratelimit-remaining": "0"}, at(1, 10, 1), url=notices)
        limits.note(self.store, self.cid, {"x-ratelimit-limit": "1000", "x-ratelimit-remaining": "464"}, at(1, 10, 2), url=products)
        shown = self.connectors.get(self.cid)["rate_limits"]
        self.assertEqual(shown["products"]["x-ratelimit-remaining"], "464")
        self.assertEqual(shown["changenotifications"]["x-ratelimit-limit"], "50")
        with self.store.connection() as conn:
            self.assertEqual(limits.suggestions(conn, at(3, 12)), {}, "50 then 464 is two APIs, not a reset")

    def test_a_reset_typed_by_hand_is_no_longer_the_providers(self) -> None:
        self.connectors.update(self.cid, actor="ana@example.com", reset_time="08:00", reset_from_provider=True)
        self.assertTrue(self.connectors.get(self.cid)["reset_from_provider"])
        self.connectors.update(self.cid, actor="ana@example.com", reset_time="09:00")
        self.assertFalse(self.connectors.get(self.cid)["reset_from_provider"])

    def test_the_card_gets_the_suggestion(self) -> None:
        with self.store.connection() as conn:
            for day, before, after in ((1, (21, 50), (23, 10)), (2, (22, 20), (22, 55))):
                for moment, left in ((at(day, *before), 40), (at(day, *after), 1000)):
                    conn.execute(
                        "INSERT INTO supply_limit_marks (connector_id, at, kind, remaining, quota) VALUES (%s, %s, 'remaining', %s, 1000)",
                        (self.cid, moment, left),
                    )
        self.connectors._clock = lambda: at(3, 12)
        self.assertEqual(self.connectors.get(self.cid)["reset_suggestion"]["suggested"], "22:55")

    def test_a_refusal_only_counts_when_most_of_the_day_was_spent(self) -> None:
        from app.services.supply import ledger

        now = at(1, 12)
        limits.note_refused(self.store, self.cid, now)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_limit_marks").fetchone()["n"], 0)
        ledger.record_calls(self.store, self.cid, 900, now=now)
        limits.note_refused(self.store, self.cid, now)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT kind FROM supply_limit_marks").fetchone()["kind"], "refused")
            limits.note_ok(conn, self.cid, now + timedelta(hours=2))
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_limit_marks WHERE kind = 'ok'").fetchone()["n"], 1)
            limits.note_ok(conn, self.cid, now + timedelta(hours=3))
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_limit_marks WHERE kind = 'ok'").fetchone()["n"], 1, "only after a refusal")


if __name__ == "__main__":
    unittest.main()
