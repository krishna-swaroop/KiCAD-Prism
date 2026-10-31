"""Notes on a project's BOM lines. Needs ``PRISM_DATABASE_URL``."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply tests")
class BomCommentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_bom_comments, supply_connectors
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database = database
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role.title(), role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_comments_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_bom_comments.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_bom_comments")
            conn.execute("DELETE FROM supply_audit_events")

    def call(self, method, path, *, role="designer", body=None):
        project = SimpleNamespace(id="prj_1")
        with mock.patch("app.api.supply_bom_comments.get_project_for_role_or_404", return_value=project):
            return _request(self.app, method, f"/api/supply/projects/prj_1/bom-comments{path}", user=self.users[role], body=body)

    def test_a_token_that_may_only_read_cannot_write_notes(self) -> None:
        user_class = type(self.users["admin"])
        reader = user_class(email="bot@example.com", name="bot", role="admin", auth_type="agent", scopes=["api:read"])
        writer = user_class(email="bot@example.com", name="bot", role="qa", auth_type="agent", scopes=["api:write"])
        project = SimpleNamespace(id="prj_1")
        path = "/api/supply/projects/prj_1/bom-comments"
        with mock.patch("app.api.supply_bom_comments.get_project_for_role_or_404", return_value=project):
            body = {"line_key": "acme | r1", "body": "Note"}
            self.assertEqual(_request(self.app, "GET", path, user=reader).status, 200)
            self.assertEqual(_request(self.app, "POST", path, user=reader, body=body).status, 403)
            self.assertEqual(_request(self.app, "DELETE", path + "/c1", user=reader).status, 403)
            self.assertEqual(_request(self.app, "POST", path, user=writer, body=body).status, 201)

    def test_readers_write_and_everyone_who_can_open_the_project_reads(self) -> None:
        posted = self.call("POST", "", role="qa", body={"line_key": "acme | r1", "body": " Check the 0402 alternative "})
        self.assertEqual((posted.status, posted.json["body"], posted.json["author"], posted.json["author_name"]), (201, "Check the 0402 alternative", "qa@example.com", "Qa"))
        self.call("POST", "", role="designer", body={"line_key": "acme | r2", "body": "Fine"})
        listed = self.call("GET", "", role="qa").json["items"]
        self.assertEqual([(item["line_key"], item["author"]) for item in listed], [("acme | r1", "qa@example.com"), ("acme | r2", "designer@example.com")])
        self.assertEqual(self.call("GET", "", role="viewer").status, 403)
        self.assertEqual(self.call("POST", "", role="viewer", body={"line_key": "k", "body": "x"}).status, 403)

    def test_what_is_refused_says_why(self) -> None:
        self.assertEqual(self.call("POST", "", body={"line_key": "k", "body": "   "}).status, 400)
        self.assertEqual(self.call("POST", "", body={"line_key": "k", "body": "x" * 1001}).status, 422)
        self.assertEqual(self.call("POST", "", body={"line_key": "", "body": "x"}).status, 422)

    def test_only_the_author_or_an_administrator_removes_a_comment(self) -> None:
        mine = self.call("POST", "", role="designer", body={"line_key": "k", "body": "mine"}).json["id"]
        self.assertEqual(self.call("DELETE", f"/{mine}", role="qa").status, 400)
        self.assertEqual(self.call("DELETE", f"/{mine}", role="designer").status, 204)
        theirs = self.call("POST", "", role="designer", body={"line_key": "k", "body": "again"}).json["id"]
        self.assertEqual(self.call("DELETE", f"/{theirs}", role="admin").status, 204)
        self.assertEqual(self.call("DELETE", f"/{theirs}", role="admin").status, 404)
        self.assertEqual(self.call("GET", "", role="qa").json["items"], [])
        with self.store.connection() as conn:
            actions = [r["action"] for r in conn.execute("SELECT action FROM supply_audit_events ORDER BY id").fetchall()]
        self.assertEqual(actions, ["bom_comment.add", "bom_comment.remove", "bom_comment.add", "bom_comment.remove"])


if __name__ == "__main__":
    unittest.main()
