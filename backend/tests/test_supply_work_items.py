"""Work items: an engineering decision about a part, with its owner, evidence, projects, QA's disposition and recheck date."""

from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402
import test_supply_release_check as release_check  # noqa: E402
from test_supply_release_check import NOW, POSTGRES_URL, component, lines  # noqa: E402


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply tests")
class WorkItemTests(unittest.TestCase):
    # The release-check tests' schema, connector and part helper; imported as a module so pytest doesn't collect them twice.
    setUpClass = release_check.ReleaseCheckTests.__dict__["setUpClass"]
    tearDownClass = release_check.ReleaseCheckTests.__dict__["tearDownClass"]
    setUp = release_check.ReleaseCheckTests.setUp
    part = release_check.ReleaseCheckTests.part

    @classmethod
    def _app(cls):
        from fastapi import FastAPI

        from app.api import supply_work_items

        app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(app)
        app.include_router(supply_work_items.router)
        return app

    def call(self, method: str, path: str, role: str, body=None, query: str = ""):
        return _request(self._app(), method, f"/api/supply/work-items{path}", user=self.users[role], body=body, query=query)

    def make(self):
        from app.services.supply import usage

        def clear() -> None:
            with self.store.connection() as conn:
                conn.execute("DELETE FROM supply_attention WHERE kind = 'work'")
                conn.execute("DELETE FROM supply_bom_usage_projects")

        self.addCleanup(clear)
        part_id = self.part("OLD-1", stock=0, lifecycle="obsolete")
        with self.store.connection() as conn:
            usage.store_project(conn, "prj_w", "Power board", "rev1", lines([component("U1", "Acme", "OLD-1")]), NOW)
        return part_id

    def test_an_item_keeps_its_projects_owner_evidence_and_moves_through_qa(self) -> None:
        part_id = self.make()
        made = self.call("POST", "", "designer", {
            "subject_kind": "part", "subject_id": part_id, "title": "Find a second source for OLD-1", "action": "alternate",
            "owner": "designer@example.com", "note": "Obsolete since March", "recheck_on": (date.today() - timedelta(days=1)).isoformat(),
        })
        self.assertEqual(made.status, 201)
        item = made.json
        self.assertEqual((item["subject_name"], item["state"], [p["name"] for p in item["projects"]]), ("OLD-1, Acme", "open", ["Power board"]))
        self.assertEqual([note["text"] for note in item["evidence"]], ["Obsolete since March"])

        self.assertEqual(self.call("POST", f"/{item['id']}/state", "designer", {"state": "accepted"}).status, 403, "QA accepts")
        accepted = self.call("POST", f"/{item['id']}/state", "qa", {"state": "accepted", "note": "Agreed"}).json
        self.assertEqual((accepted["state"], len(accepted["evidence"])), ("accepted", 2))
        self.assertEqual(self.call("PATCH", f"/{item['id']}", "viewer", {"note": "x"}).status, 403, "viewers have no Supply")

        mine = self.call("GET", "", "designer", query="state=mine").json["items"]
        due = self.call("GET", "", "qa", query="state=due").json["items"]
        self.assertEqual(([row["id"] for row in mine], [row["id"] for row in due]), ([item["id"]], [item["id"]]))

        done = self.call("POST", f"/{item['id']}/state", "designer", {"state": "done"}).json
        self.assertEqual(done["state"], "done", "its owner closes it")
        self.assertEqual(self.call("GET", "", "designer", query="state=live").json["items"], [])
        history = self.call("GET", f"/{item['id']}/history", "qa").json["items"]
        self.assertEqual([entry["action"] for entry in history], ["create", "update", "accepted", "done"])

    def test_an_item_is_an_attention_row_that_rejection_or_done_closes_and_reopening_opens(self) -> None:
        from app.services.supply import attention

        part_id = self.make()
        item = self.call("POST", "", "qa", {"subject_kind": "part", "subject_id": part_id, "title": "Retire OLD-1", "action": "retire"}).json
        with self.store.connection() as conn:
            row = conn.execute("SELECT kind, state, part_id, title FROM supply_attention WHERE id = %s", (int(item["id"]),)).fetchone()
            self.assertEqual(dict(row), {"kind": "work", "state": "open", "part_id": part_id, "title": "Retire OLD-1"})
            self.assertEqual(attention.summary(conn, datetime.now(timezone.utc)), [], "a work item is not an alert to count")
        rejected = self.call("POST", f"/{item['id']}/state", "qa", {"state": "rejected"}).json
        self.assertEqual(rejected["state"], "rejected")
        self.assertEqual([row["id"] for row in self.call("GET", "", "qa", query="state=rejected").json["items"]], [item["id"]])
        self.assertEqual(self.call("POST", f"/{item['id']}/state", "qa", {"state": "open"}).json["state"], "open", "QA opens it again")
        self.assertEqual(self.call("POST", f"/{item['id']}/state", "qa", {"state": "done"}).json["state"], "done")
        self.assertEqual(self.call("GET", "/not-a-number/history", "qa").status, 404)

    def test_someone_who_is_neither_owner_nor_maker_nor_qa_may_not_change_it(self) -> None:
        part_id = self.make()
        item = self.call("POST", "", "qa", {"subject_kind": "part", "subject_id": part_id, "title": "Retire OLD-1", "action": "retire"}).json
        self.assertEqual(self.call("PATCH", f"/{item['id']}", "designer", {"owner": "designer@example.com"}).status, 403)
        self.assertEqual(self.call("POST", f"/{item['id']}/state", "designer", {"state": "done"}).status, 403)
        changed = self.call("PATCH", f"/{item['id']}", "qa", {"owner": "designer@example.com", "clear_recheck": True}).json
        self.assertEqual((changed["owner"], changed["recheck_on"]), ("designer@example.com", None))
        self.assertEqual(self.call("POST", "", "designer", {"subject_kind": "part", "subject_id": part_id, "title": " ", "action": "retire"}).status, 400)
        self.assertEqual(self.call("GET", "", "qa", query="state=everything").status, 400)
