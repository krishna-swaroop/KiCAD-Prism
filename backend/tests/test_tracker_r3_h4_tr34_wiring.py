"""R3-H4: wire TR-34 link lifecycle into sweeper, sync routes and settings."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI
from pydantic import SecretStr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import tracker_sync as sync_api  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.comment_permissions import ActorIdentity  # noqa: E402
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.contracts import Moved  # noqa: E402
from app.services.trackers.inbox_store import apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.migrations import (  # noqa: E402
    migrate_tracker_webhook_oauth_tables,
    migrate_workspace_tracker_tables,
)
from app.services.trackers.op_store import LIVE_STATES, OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.projections import (  # noqa: E402
    repromote_thread_sync,
    unlink_thread_sync,
)
from app.services.trackers.publication_policy import (  # noqa: E402
    PublicationDenied,
    PublicationPolicyService,
)
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.trackers.sweeper import sweep_destination_links  # noqa: E402
from test_tracker_tr_28 import (  # noqa: E402
    BOT_ID,
    BOT_LOGIN,
    COMMENT_ID,
    CONNECTOR,
    CONTAINER,
    ISSUE_ID,
    ISSUE_NUMBER,
)

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
UNAPPROVED_CONTAINER = "333333333"
UNAPPROVED_PATH = "acme/public-notes"
THREAD_ID = "tt_r3h4"
PROJECT = "prj_a"
ROOT_KEY = "aa" * 32


def _identity(url: str):
    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _identity(POSTGRES_URL) == _identity(APPLICATION_POSTGRES_URL)
)


def _dsn() -> str:
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def _settings(**overrides) -> Settings:
    base = {
        "AUTH_ENABLED": True,
        "OIDC_ISSUER_URL": "https://idp.example.com",
        "OIDC_CLIENT_ID": "prism",
        "OIDC_CLIENT_SECRET": "shhh",
        "SESSION_SECRET": "unit-test-session-secret-not-a-credential",
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(ROOT_KEY),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


class RoutingContractTests(unittest.TestCase):
    def test_unlink_and_repromote_routes_registered(self) -> None:
        app = FastAPI()
        app.include_router(sync_api.router)
        paths = set(app.openapi()["paths"])
        self.assertIn("/api/projects/{project_id}/comments/{comment_id}/tracker/unlink", paths)
        self.assertIn("/api/projects/{project_id}/comments/{comment_id}/tracker/repromote", paths)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class Tr34WiringPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"r3h4_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        migrate_tracker_webhook_oauth_tables(self.conn)
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self._seed_destination()
        self.conn.commit()
        self.settings = _settings()
        self._observed_visibility: dict[str, str] = {"222222222": "private", CONTAINER: "private"}

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def _create_comments_foundation(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'OPEN',
                context TEXT NOT NULL DEFAULT 'PCB',
                location_x REAL NOT NULL DEFAULT 0,
                location_y REAL NOT NULL DEFAULT 0,
                location_layer TEXT NOT NULL DEFAULT '',
                location_page TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                revision INTEGER NOT NULL DEFAULT 1,
                deleted_at TIMESTAMPTZ,
                anchor_state TEXT DEFAULT 'pinned',
                anchor_commit TEXT DEFAULT '3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695'
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT '',
                author_kind TEXT NOT NULL DEFAULT 'user',
                origin TEXT NOT NULL DEFAULT 'prism',
                revision INTEGER NOT NULL DEFAULT 1,
                deleted_at TIMESTAMPTZ,
                deleted_by TEXT
            );
            """,
            prepare=False,
        )

    def _seed_destination(self) -> None:
        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id=PROJECT,
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id=CONTAINER,
            generation=2,
            visibility="private",
        )
        self.store.acknowledge_destination(
            ack_id="ack_private_src",
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            visibility="private",
            acknowledged_by="admin",
        )

    def _seed_comment(self) -> None:
        self.conn.execute(
            """
            INSERT INTO comments(id, project_id, author, content, revision, anchor_state, anchor_commit)
            VALUES (%s,%s,%s,%s,%s,'pinned','3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695')
            """,
            (COMMENT_ID, PROJECT, "Priya", "root content", 1),
        )

    def _seed_thread(self, *, link_state: str = "linked", external_id: str = ISSUE_ID) -> None:
        self._seed_comment()
        pt_id = self.conn.execute(
            "SELECT id FROM project_trackers WHERE project_id = %s",
            (PROJECT,),
        ).fetchone()["id"]
        self.conn.execute(
            """
            INSERT INTO tracked_threads (
                id, comment_id, project_tracker_id, destination_generation,
                connector_id, remote_container_id, external_id, external_number,
                link_state, remote_state
            ) VALUES (
                %s, %s, %s, 2, %s, %s, %s, %s, %s, 'open'
            )
            """,
            (
                THREAD_ID,
                COMMENT_ID,
                pt_id,
                CONNECTOR,
                CONTAINER,
                external_id,
                ISSUE_NUMBER,
                link_state,
            ),
        )

    def _actor(self) -> ActorIdentity:
        return ActorIdentity(
            actor_id="u_designer",
            actor_kind="user",
            display_name="Priya",
            role="designer",
            auth_type="session",
        )

    @contextmanager
    def _factory(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        try:
            yield conn
        finally:
            conn.close()

    def _observe_container(
        self,
        connector_id: str,
        *,
        container_kind: str,
        container_path: str,
        remote_container_id: str,
        generation: int = 1,
        visibility_hint: str | None = None,
    ) -> dict[str, str]:
        visibility = self._observed_visibility.get(
            remote_container_id,
            visibility_hint or "unknown",
        )
        return {
            "visibility": visibility,
            "containerPath": container_path,
            "remoteContainerId": remote_container_id,
        }

    def test_sweeper_moved_pauses_unapproved_transfer(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_live",
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.commit()

        def get_issue(*_args, **_kwargs):
            return Moved(new_ref=f"{UNAPPROVED_PATH}#11", new_container_id=UNAPPROVED_CONTAINER)

        def list_comments(*_args, **_kwargs):
            return [], None

        def get_comment(*_args, **_kwargs):
            raise AssertionError("get_comment should not run after Moved")

        outcome = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path="acme/openswitch",
            get_issue=get_issue,
            list_comments=list_comments,
            get_comment=get_comment,
        )
        self.conn.commit()
        self.assertEqual(outcome.issues_moved, 1)
        thread = self.conn.execute(
            "SELECT link_state, paused_reason FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertEqual(thread["link_state"], "transferred")
        self.assertEqual(thread["paused_reason"], "transfer_unapproved")
        op = self.conn.execute("SELECT state FROM sync_ops WHERE id = 'op_live'").fetchone()
        self.assertEqual(op["state"], "superseded")
        moved = (outcome.details.get("movedThreads") or [])[0]
        self.assertEqual(moved["action"], "paused")

    def test_unlink_thread_sync_supersedes_and_unlinks(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_unlink",
            tracked_thread_id=THREAD_ID,
            op="update_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.commit()
        projection = unlink_thread_sync(
            self.conn,
            project_id=PROJECT,
            comment_id=COMMENT_ID,
            actor=self._actor(),
            promote_min_role="designer",
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertIsNone(projection.get("linkState"))
        thread = self.conn.execute(
            "SELECT unlinked_at FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertIsNotNone(thread["unlinked_at"])
        op = self.conn.execute("SELECT state FROM sync_ops WHERE id = 'op_unlink'").fetchone()
        self.assertEqual(op["state"], "superseded")
        audit = self.conn.execute(
            "SELECT action FROM tracker_audit WHERE action = 'thread.unlink'"
        ).fetchone()
        self.assertIsNotNone(audit)

    def test_repromote_thread_sync_from_deleted(self) -> None:
        self._seed_thread(link_state="deleted")
        self.ops.insert(
            op_id="op_old_create",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.execute(
            "UPDATE sync_ops SET state = 'confirmed' WHERE id = 'op_old_create'"
        )
        self.conn.commit()
        first = repromote_thread_sync(
            self.conn,
            project_id=PROJECT,
            comment_id=COMMENT_ID,
            actor=self._actor(),
            promote_min_role="designer",
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(first.get("linkState"), "linked")
        self.assertEqual(first.get("syncState"), "pending")
        live = self.conn.execute(
            """
            SELECT id, lineage_of, state FROM sync_ops
            WHERE tracked_thread_id = %s AND op = 'create_issue' AND state = ANY(%s)
            """,
            (THREAD_ID, list(LIVE_STATES)),
        ).fetchone()
        self.assertIsNotNone(live)
        self.assertEqual(live["lineage_of"], "op_old_create")

        second = repromote_thread_sync(
            self.conn,
            project_id=PROJECT,
            comment_id=COMMENT_ID,
            actor=self._actor(),
            promote_min_role="designer",
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(second.get("syncState"), "pending")
        live_count = self.conn.execute(
            """
            SELECT COUNT(*) AS n FROM sync_ops
            WHERE tracked_thread_id = %s AND op = 'create_issue' AND state = ANY(%s)
            """,
            (THREAD_ID, list(LIVE_STATES)),
        ).fetchone()["n"]
        self.assertEqual(int(live_count), 1)

    def test_repromote_refuses_inaccessible(self) -> None:
        self._seed_thread(link_state="inaccessible")
        self.conn.commit()
        with self.assertRaises(PublicationDenied) as caught:
            repromote_thread_sync(
                self.conn,
                project_id=PROJECT,
                comment_id=COMMENT_ID,
                actor=self._actor(),
                promote_min_role="designer",
                workspace_schema=self.schema,
            )
        self.assertEqual(caught.exception.code, "not_repromotable")

    def test_update_settings_pauses_links_on_destination_change(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_dest",
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.commit()

        connector_service = ConnectorService(
            connect=self._factory,
            settings=self.settings,
            tester=lambda row, material: {"ok": True, "writesEnabled": True, "bot": {"id": "1", "login": "bot"}},
            container_observer=self._observe_container,
            workspace_schema=self.schema,
        )
        service = PublicationPolicyService(
            connect=self._factory,
            settings=self.settings,
            connector_service=connector_service,
            workspace_schema=self.schema,
        )
        result = service.update_settings(
            PROJECT,
            actor_user_id="u_admin",
            connector_id=CONNECTOR,
            destination={
                "containerKind": "repo",
                "containerPath": "acme/hardware-issues",
                "remoteContainerId": "222222222",
                "visibility": "private",
            },
        )
        self.assertEqual(result["destination"]["generation"], 3)
        # Re-open a connection on the test schema to observe side effects.
        with self._factory() as conn:
            thread = conn.execute(
                "SELECT paused_reason FROM tracked_threads WHERE id = %s",
                (THREAD_ID,),
            ).fetchone()
            self.assertEqual(thread["paused_reason"], "destination_removed")
            op = conn.execute("SELECT state FROM sync_ops WHERE id = 'op_dest'").fetchone()
            self.assertEqual(op["state"], "superseded")
            audit = conn.execute(
                "SELECT action FROM tracker_audit WHERE action = 'project_tracker.destination_removed'"
            ).fetchone()
            self.assertIsNotNone(audit)


if __name__ == "__main__":
    unittest.main()
