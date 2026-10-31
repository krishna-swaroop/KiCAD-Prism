"""Tracked projects' BOMs kept current: a new revision is read without anyone opening the project, its index is queued
when missing, what it added is tracked, what it removed leaves, and the change is said once."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
ACTOR = "ana@example.com"
NOW = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)


def component(ref: str, maker: str, mpn: str) -> dict:
    return {"componentUid": ref, "reference": ref, "fields": {"Manufacturer": maker, "Manufacturer Part Number": mpn, "DNP": "No", "In BOM": "Yes"}}


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class ProjectBomTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import alerts, parts, project_bom, tracking, usage
        from app.services.supply.store import SupplyStore

        cls.database, cls.alerts, cls.parts, cls.project_bom, cls.tracking, cls.usage = database, alerts, parts, project_bom, tracking, usage
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_pbom_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls) -> None:
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        self.project_bom._refreshed_at = None
        self.project_bom._queued_at.clear()
        with self.store.connection() as conn:
            for table in ("supply_events", "supply_tracked_projects", "supply_bom_usage_projects", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers"):
                conn.execute(f"DELETE FROM {table}")
            conn.execute("INSERT INTO supply_manufacturers (id, name, name_key) VALUES ('m1', 'Acme', 'acme')")
        self.project = SimpleNamespace(id="prj_1", name="power", display_name="Power board")
        self.index: dict | None = {"sourceRevisionKey": "r1", "components": [component("R1", "Acme", "A-1"), component("R2", "Acme", "A-2")]}
        self.queued: list[str] = []
        with self.store.connection() as conn:
            self.read(conn)
            self.tracking.track_project(conn, "prj_1", [""], ACTOR)

    def read(self, conn, *, force: bool = True) -> dict:
        return self.project_bom.refresh_tracked(
            conn, NOW, force=force, projects=lambda ids: [(self.project, ["admin", "designer"])] if "prj_1" in set(ids) else [],
            existing=lambda _project: self.index, queue=self.queued.append, identities=lambda ids: {},
        ) if self.tracked(conn) else self.project_bom.read(
            conn, self.project, ["admin", "designer"], NOW, existing=lambda _project: self.index, queue=self.queued.append, identities=lambda ids: {},
        )

    @staticmethod
    def tracked(conn) -> bool:
        return conn.execute("SELECT 1 FROM supply_tracked_projects").fetchone() is not None

    def tracked_mpns(self, conn) -> set[str]:
        return {row["mpn"] for row in conn.execute("SELECT p.mpn FROM supply_part_tiers t JOIN supply_parts p ON p.id = t.part_id").fetchall()}

    def test_a_new_revision_is_read_and_its_added_and_removed_parts_follow(self) -> None:
        with self.store.connection() as conn:
            self.assertEqual(self.tracked_mpns(conn), {"A-1", "A-2"})
            self.index = {"sourceRevisionKey": "r2", "components": [component("R1", "Acme", "A-1"), component("R3", "Acme", "A-3")]}
            self.assertEqual(self.read(conn)["updated"], 1)
            self.tracking.sync_projects(conn)
            self.assertEqual(self.tracked_mpns(conn), {"A-1", "A-3"})
            (event,) = conn.execute("SELECT payload FROM supply_events WHERE kind = 'project_bom_changed'").fetchall()
        detail = event["payload"]
        self.assertEqual((detail["added_count"], detail["removed_count"]), (1, 1))
        self.assertEqual((detail["added"][0]["mpn"], detail["removed"][0]["mpn"], detail["project_name"]), ("A-3", "A-2", "Power board"))

    def test_the_same_revision_says_nothing(self) -> None:
        with self.store.connection() as conn:
            self.assertEqual(self.read(conn)["unchanged"], 1)
            self.assertIsNone(conn.execute("SELECT 1 FROM supply_events").fetchone())

    def test_a_revision_with_no_index_queues_one_once(self) -> None:
        self.index = None
        with self.store.connection() as conn:
            self.assertEqual(self.read(conn)["reading"], 1)
            self.assertEqual(self.read(conn)["reading"], 1)
        self.assertEqual(self.queued, ["prj_1"], "queued once, not on every read")

    def test_reads_are_spaced_out(self) -> None:
        with self.store.connection() as conn:
            self.read(conn)
            self.assertEqual(self.read(conn, force=False), {}, "within the interval nothing is read")

    def test_an_unknown_spelling_on_a_new_revision_is_tracked_as_written_until_distributors_settle_it(self) -> None:
        with self.store.connection() as conn:
            self.index = {"sourceRevisionKey": "r2", "components": [component("R1", "Acme", "A-1"), component("U1", "Newco Ltd", "N-1")]}
            self.read(conn)
            self.tracking.sync_projects(conn)
            made = conn.execute("SELECT m.name, m.provisional FROM supply_parts p JOIN supply_manufacturers m ON m.id = p.manufacturer_id WHERE p.mpn = 'N-1'").fetchall()
        self.assertEqual([(row["name"], row["provisional"]) for row in made], [("Newco Ltd", True)])

    def test_a_project_deleted_from_the_workspace_is_no_longer_tracked(self) -> None:
        with self.store.connection() as conn:
            counts = self.project_bom.refresh_tracked(
                conn, NOW, force=True, projects=lambda ids: [], existing=lambda _p: self.index,
                queue=self.queued.append, identities=lambda ids: {},
            )
            self.assertEqual(counts["removed"], 1)
            self.assertFalse(self.tracked(conn))
            self.assertEqual(self.tracked_mpns(conn), set())

    def test_a_project_that_follows_every_design_takes_in_one_added_later(self) -> None:
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_bom_usage (project_id, variant, line_key, manufacturer, mpn, match_key, quantity) VALUES ('prj_1', 'lite', 'k1', 'Acme', 'A-9', '', 1)"
            )
            self.tracking.track_project(conn, "prj_1", [""], ACTOR, all_variants=True)
            self.assertEqual(self.tracking.tracked_project(conn, "prj_1")["variants"], ["", "lite"])
            conn.execute(
                "INSERT INTO supply_bom_usage (project_id, variant, line_key, manufacturer, mpn, match_key, quantity) VALUES ('prj_1', 'full', 'k2', 'Acme', 'A-8', '', 1)"
            )
            self.read(conn)
            self.assertEqual(self.tracking.tracked_project(conn, "prj_1")["variants"], ["", "full", "lite"])

    def test_only_roles_that_see_the_project_see_the_change(self) -> None:
        with self.store.connection() as conn:
            self.index = {"sourceRevisionKey": "r2", "components": [component("R1", "Acme", "A-1")]}
            self.read(conn)
            seen = [item["type"] for item in self.alerts.recent_changes(conn, NOW, role="designer")]
            hidden = [item["type"] for item in self.alerts.recent_changes(conn, NOW, role="qa")]
        self.assertIn("project_bom_changed", seen)
        self.assertNotIn("project_bom_changed", hidden)


if __name__ == "__main__":
    unittest.main()
