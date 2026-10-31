"""The cost of following a part, and where parts are admitted or wait for room.

The cost table is the plan's (4.4) for the real providers. Database tests need ``PRISM_DATABASE_URL``.
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

# Listings per part at each metered provider, the dev data's averages (plan 4.4).
AVERAGE_LISTINGS = {"digikey": 2.9, "farnell": 2.2, "mouser": 1.0, "tme": 1.1}


class CostTests(unittest.TestCase):
    def cost(self, provider: str, tier: int, rate: str, listings: float) -> float:
        from app.services.supply import budget
        from app.services.supply.providers import registry

        return budget.cost(registry.get_spec(provider), tier, rate, listings)

    def test_tier_one_costs_match_the_plan_table(self) -> None:
        for provider, expected in (("digikey", 1.033), ("farnell", 0.25), ("mouser", 0.103), ("tme", 0.045)):
            self.assertAlmostEqual(self.cost(provider, 1, "daily", AVERAGE_LISTINGS[provider]), expected, delta=0.005, msg=provider)

    def test_a_packaging_pick_cuts_the_cost_of_a_provider_that_reads_each_listing(self) -> None:
        for provider, expected in (("digikey", 1.033), ("farnell", 0.13), ("mouser", 0.103), ("tme", 0.04)):
            self.assertAlmostEqual(self.cost(provider, 1, "daily", 1), expected, delta=0.005, msg=provider)

    def test_tier_two_weekly_costs_after_a_pick_match_the_plan_table(self) -> None:
        for provider, expected in (("digikey", 0.154), ("farnell", 0.03), ("mouser", 0.02), ("tme", 0.01)):
            self.assertAlmostEqual(self.cost(provider, 2, "weekly", 1), expected, delta=0.005, msg=provider)

    def test_how_many_tier_one_parts_900_committed_calls_hold(self) -> None:
        held = {provider: int(900 / self.cost(provider, 1, "daily", 1)) for provider in ("digikey", "farnell", "mouser", "tme")}
        self.assertAlmostEqual(held["digikey"], 870, delta=10)
        self.assertAlmostEqual(held["farnell"], 6800, delta=100)
        self.assertAlmostEqual(held["mouser"], 8700, delta=100, msg="substances come with the offer: no call of their own")

    def test_a_part_the_provider_does_not_carry_costs_only_its_search(self) -> None:
        self.assertAlmostEqual(self.cost("digikey", 1, "daily", 0), 1 / 14, places=4, msg="searched again every two weeks")

    def test_monthly_costs_less_than_weekly_and_a_free_provider_costs_nothing(self) -> None:
        from app.services.supply import budget
        from app.services.supply.providers import registry

        self.assertLess(self.cost("farnell", 2, "monthly", 2), self.cost("farnell", 2, "weekly", 2))
        for key in ("csv", "lcsc", "jlcpcb"):
            self.assertEqual(budget.cost(registry.get_spec(key), 1, "daily", 5), 0.0, key)

    def test_the_committed_share_is_at_most_ninety_percent(self) -> None:
        from app.services.supply import budget

        self.assertEqual(budget.committed_calls(1000, 10), 900)
        self.assertEqual(budget.committed_calls(1000, 0), 900)
        self.assertEqual(budget.committed_calls(1000, 50), 500)

    def test_the_saving_a_pick_brings(self) -> None:
        from app.services.supply import budget
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import ProviderSpec

        registry.register(ProviderSpec(
            key="pick_demo", label="Pick demo", capabilities=frozenset({"search", "offers"}), max_batch=1,
            stock_pooling="separate", credential_fields=(), factory=lambda config: None, default_daily_budget=100,
        ), replace=True)
        try:
            self.assertAlmostEqual(budget.pick_saving(registry.get_spec("pick_demo"), 1, "daily", 2), 1.0, places=4)
        finally:
            registry.unregister("pick_demo")
        self.assertEqual(budget.pick_saving(registry.get_spec("digikey"), 1, "daily", 3), 0.0, "DigiKey reads a part in one call")
        self.assertEqual(budget.pick_saving(registry.get_spec("farnell"), 1, "daily", 3), 0.0, "a listing costs a place in a batch, not a call")
        self.assertEqual(budget.pick_saving(registry.get_spec("lcsc"), 1, "daily", 3), 0.0, "a CSV-fed connector spends no calls")


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class AdmissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import admission, parts, tracking, usage, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import CredentialField, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.admission, cls.parts, cls.tracking, cls.usage, cls.watches = database, admission, parts, tracking, usage, watches
        cls.registry = registry
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_adm_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        for key, extra in (
            ("adm_demo", {"credential_fields": (CredentialField("api_key", "API key"),), "storefronts": ("uk", "de")}),
            ("adm_assembly", {"credential_fields": (), "assembly_only": True}),
        ):
            registry.register(ProviderSpec(
                key=key, label=key, capabilities=frozenset({"search", "offers"}), max_batch=10, stock_pooling="separate",
                factory=lambda config: FakeProvider(config), default_daily_budget=100, **{"credential_fields": (), **extra},
            ), replace=True)

    @classmethod
    def tearDownClass(cls) -> None:
        for key in ("adm_demo", "adm_assembly"):
            cls.registry.unregister(key)
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_bom_usage_projects", "supply_tracked_projects", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases",
                          "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")

    # A capacity of 2 calls a day holds fifteen tier-1 parts at 0.1333 each, and no more.
    def connector(self, provider="adm_demo", storefront="uk", key="K1", budget=4, reserve=50) -> str:
        credentials = {"api_key": key} if provider == "adm_demo" else None
        return self.connectors.create(
            actor=ACTOR, provider=provider, storefront=storefront if provider == "adm_demo" else "", credentials=credentials,
            daily_budget=budget, interactive_reserve_pct=reserve,
        )["id"]

    def watch(self, n: int, tier: int = 1) -> None:
        with self.store.connection() as conn:
            self.watches.add_watch(conn, "Acme", f"P-{n:03d}", ACTOR, tier=tier, rate="weekly")

    def counts(self, connector_id: str) -> dict[str, int]:
        with self.store.connection() as conn:
            rows = conn.execute("SELECT state, COUNT(*) AS n FROM supply_admissions WHERE connector_id = %s GROUP BY state", (connector_id,)).fetchall()
        got = {row["state"]: int(row["n"]) for row in rows}
        return {"admitted": got.get("admitted", 0), "waiting": got.get("waiting", 0)}

    def test_parts_are_admitted_while_the_committed_share_has_room_and_wait_after(self) -> None:
        cid = self.connector()
        for n in range(20):
            self.watch(n)
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 5})

    def test_runs_at_the_same_time_neither_fail_nor_overfill_the_account(self) -> None:
        from concurrent.futures import ThreadPoolExecutor

        cid = self.connector()
        for n in range(20):
            self.watch(n)

        def run(_n: int) -> None:
            with self.store.connection() as conn:
                self.tracking.recompute(conn)
                self.admission.sync(conn)

        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(run, range(12)))  # a failure in any run is raised here
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 5})

    def test_freeing_room_promotes_the_oldest_waiting_part(self) -> None:
        cid = self.connector()
        for n in range(17):
            self.watch(n)
        with self.store.connection() as conn:
            waiting = [r["part_id"] for r in conn.execute("SELECT part_id FROM supply_admissions WHERE state = 'waiting' ORDER BY since, part_id").fetchall()]
            admitted = conn.execute("SELECT part_id FROM supply_admissions WHERE state = 'admitted' ORDER BY part_id LIMIT 1").fetchone()["part_id"]
            watch_id = conn.execute("SELECT id FROM supply_watches WHERE part_id = %s", (admitted,)).fetchone()["id"]
            self.watches.remove_watch(conn, watch_id, ACTOR)
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 1}, "one waiting part took the freed room")
        with self.store.connection() as conn:
            states = {r["part_id"]: r["state"] for r in conn.execute("SELECT part_id, state FROM supply_admissions").fetchall()}
        self.assertEqual(sorted(states.values()).count("waiting"), 1)
        self.assertEqual(len([p for p in waiting if states.get(p) == "admitted"]), 1)

    def test_lowering_the_budget_moves_the_newest_to_waiting(self) -> None:
        cid = self.connector()
        for n in range(15):
            self.watch(n)
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 0})
        self.connectors.update(cid, actor=ACTOR, daily_budget=2)
        self.assertEqual(self.counts(cid), {"admitted": 7, "waiting": 8})
        self.connectors.update(cid, actor=ACTOR, daily_budget=4)
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 0}, "raising it takes them back")

    def test_a_new_connector_admits_the_parts_already_followed(self) -> None:
        for n in range(3):
            self.watch(n)
        cid = self.connector()
        self.assertEqual(self.counts(cid), {"admitted": 3, "waiting": 0})

    def test_a_free_connector_has_no_rows(self) -> None:
        self.watch(1)
        csv = self.connectors.create(actor=ACTOR, provider="csv")["id"]
        self.assertEqual(self.counts(csv), {"admitted": 0, "waiting": 0})

    def test_connectors_on_one_account_share_the_room(self) -> None:
        uk, de = self.connector(storefront="uk", key="SAME"), self.connector(storefront="de", key="SAME")
        for n in range(10):
            self.watch(n)
        total = self.counts(uk)["admitted"] + self.counts(de)["admitted"]
        self.assertEqual(total, 15, "two connectors, one budget")
        self.assertEqual(self.counts(uk)["waiting"] + self.counts(de)["waiting"], 5)

    def test_an_assembly_only_distributor_is_not_used_unless_a_project_names_it(self) -> None:
        plain, asm = self.connector(), self.connector("adm_assembly")
        self.watch(1)
        self.assertEqual((self.counts(plain)["admitted"], self.counts(asm)["admitted"]), (1, 0))

    def test_a_project_is_read_only_at_the_distributors_it_buys_from(self) -> None:
        uk, de = self.connector(storefront="uk", key="A"), self.connector(storefront="de", key="B")
        lines = self.usage.lines_from_components([
            {"componentUid": "c1", "reference": "R1", "fields": {"Manufacturer": "Acme", "Manufacturer Part Number": "R-1", "DNP": "No", "In BOM": "Yes"}},
        ])
        with self.store.connection() as conn:
            self.usage.store_project(conn, "p1", "p1", "r1", lines, NOW)
            self.tracking.track_project(conn, "p1", [""], ACTOR, connector_ids=[de])
        self.assertEqual((self.counts(uk)["admitted"], self.counts(de)["admitted"]), (0, 1))
        asm = self.connector("adm_assembly")
        with self.store.connection() as conn:
            self.tracking.track_project(conn, "p1", [""], ACTOR, connector_ids=[de, asm])
        self.assertEqual(self.counts(asm)["admitted"], 1)

    def test_a_distributor_added_after_a_project_was_tracked_is_used_for_it(self) -> None:
        uk, de = self.connector(storefront="uk", key="A"), self.connector(storefront="de", key="B")
        lines = self.usage.lines_from_components([
            {"componentUid": "c1", "reference": "R1", "fields": {"Manufacturer": "Acme", "Manufacturer Part Number": "R-1", "DNP": "No", "In BOM": "Yes"}},
        ])
        with self.store.connection() as conn:
            self.usage.store_project(conn, "p1", "p1", "r1", lines, NOW)
            self.tracking.track_project(conn, "p1", [""], ACTOR, connector_ids=[de])
        self.connectors.delete(uk, actor=ACTOR)
        later = self.connector(storefront="uk", key="C")
        self.assertEqual((self.counts(de)["admitted"], self.counts(later)["admitted"]), (1, 1), "only what was unticked stays out")
        asm = self.connector("adm_assembly")
        self.assertEqual(self.counts(asm)["admitted"], 0, "an assembly-only distributor still has to be named")
        with self.store.connection() as conn:
            shown = self.tracking.tracked_project(conn, "p1")["connector_ids"]
        self.assertEqual(sorted(shown), sorted([de, later]))

    def test_searching_replaces_the_estimate_with_what_was_found(self) -> None:
        cid = self.connector()
        for n in range(15):
            self.watch(n)
        with self.store.connection() as conn:
            part_id = conn.execute("SELECT part_id FROM supply_admissions ORDER BY part_id LIMIT 1").fetchone()["part_id"]
            conn.execute("INSERT INTO supply_discovery_runs (part_id, connector_id, last_run_at, found) VALUES (%s, %s, %s, 0)", (part_id, cid, NOW))
            self.admission.sync(conn)
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 0}, "a part the provider does not carry costs less")
        for index in range(3):
            with self.store.connection() as conn:
                conn.execute(
                    "INSERT INTO supply_listings (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, match_state) "
                    "VALUES (%s, %s, %s, %s, 'x', 'Acme', 'exact')", (f"l{index}", cid, f"S{index}", part_id))
        with self.store.connection() as conn:
            self.admission.sync(conn)
        counts = self.counts(cid)
        self.assertGreater(counts["waiting"], 0, "listings found beyond the estimate crowd parts out")
        self.assertEqual(counts["admitted"] + counts["waiting"], 15)

    def test_the_parts_list_can_be_narrowed_to_tiers_and_to_parts_waiting_for_room(self) -> None:
        from app.services.supply import parts_view

        self.connector()
        for n in range(16):
            self.watch(n)
        self.watch(99, tier=2)
        with self.store.connection() as conn:
            def mpns(scope):
                return sorted(item["mpn"] for item in parts_view.ranked_parts(conn, scope=scope)[0])

            self.assertEqual(len(mpns("tier1")), 16)
            self.assertEqual(mpns("tier2"), ["P-099"])
            self.assertEqual(len(mpns("waiting")), 2, "the sixteenth and the tier-2 part did not fit")
            self.assertEqual(len(mpns("watched")), 17)
            self.assertEqual(mpns("pick"), [], "none has several listings")

    def test_a_preview_changes_nothing_and_says_what_would_happen(self) -> None:
        cid = self.connector()
        lines = self.usage.lines_from_components([
            {"componentUid": f"c{n}", "reference": f"R{n}", "fields": {"Manufacturer": "Acme", "Manufacturer Part Number": f"R-{n}", "DNP": "No", "In BOM": "Yes"}}
            for n in range(20)
        ])
        with self.store.connection() as conn:
            self.usage.store_project(conn, "p1", "p1", "r1", lines, NOW)
            report = self.admission.preview(conn, lambda c: self.tracking.track_project(c, "p1", [""], ACTOR))
        (item,) = [c for c in report["connectors"] if c["connector_id"] == cid]
        self.assertEqual((item["admitted_new"], item["waiting_new"], item["capacity"]), (15, 5, 2))
        self.assertFalse(report["fits_nowhere"])
        self.assertEqual(self.counts(cid), {"admitted": 0, "waiting": 0})
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_parts").fetchone()["n"], 0, "no parts were made")
            self.assertIsNone(self.tracking.tracked_project(conn, "p1"))

    def test_tracking_is_refused_when_nothing_fits_anywhere_and_leaves_no_trace(self) -> None:
        cid = self.connector(budget=1, reserve=50)  # a capacity of 0
        lines = self.usage.lines_from_components([
            {"componentUid": "c1", "reference": "R1", "fields": {"Manufacturer": "Acme", "Manufacturer Part Number": "R-1", "DNP": "No", "In BOM": "Yes"}},
        ])
        with self.store.connection() as conn:
            self.usage.store_project(conn, "p1", "p1", "r1", lines, NOW)
            with self.assertRaises(self.admission.NoRoom) as raised:
                self.admission.apply(conn, lambda c: self.tracking.track_project(c, "p1", [""], ACTOR))
        self.assertIn("0 calls a day", str(raised.exception).replace("(0 of 0 calls a day committed)", "0 calls a day"))
        with self.store.connection() as conn:
            self.assertIsNone(self.tracking.tracked_project(conn, "p1"))
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_part_tiers").fetchone()["n"], 0)
        self.assertEqual(self.counts(cid), {"admitted": 0, "waiting": 0})

    def test_applying_tracks_where_there_is_room_and_the_rest_waits(self) -> None:
        cid = self.connector()
        lines = self.usage.lines_from_components([
            {"componentUid": f"c{n}", "reference": f"R{n}", "fields": {"Manufacturer": "Acme", "Manufacturer Part Number": f"R-{n}", "DNP": "No", "In BOM": "Yes"}}
            for n in range(20)
        ])
        with self.store.connection() as conn:
            self.usage.store_project(conn, "p1", "p1", "r1", lines, NOW)
            report = self.admission.apply(conn, lambda c: self.tracking.track_project(c, "p1", [""], ACTOR))
        self.assertFalse(report["fits_nowhere"])
        self.assertEqual(self.counts(cid), {"admitted": 15, "waiting": 5})


if __name__ == "__main__":
    unittest.main()
