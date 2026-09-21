"""R4-M1: supersede pending only; snapshot container_path for recovery (D2)."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import SecretStr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.create_executor import _load_execution_context  # noqa: E402
from app.services.trackers.link_lifecycle import (  # noqa: E402
    SUPERSEDEABLE_STATES,
    supersede_live_ops,
    unlink_thread_lifecycle,
)
from app.services.trackers.migrations import (  # noqa: E402
    migrate_tracker_webhook_oauth_tables,
    migrate_workspace_tracker_tables,
)
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.publication_policy import PublicationPolicyService  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
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
THREAD_ID = "tt_r4m1"
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


class ContractTests(unittest.TestCase):
    def test_supersedeable_states_are_pending_only(self) -> None:
        self.assertEqual(SUPERSEDEABLE_STATES, ("pending",))


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class R4M1PostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"r4m1_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.execute(
            """
            CREATE TABLE comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
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
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                author_kind TEXT NOT NULL DEFAULT 'user',
                author_user_id TEXT,
                anchor_state TEXT DEFAULT 'pinned',
                anchor_commit TEXT
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT '',
                author_kind TEXT NOT NULL DEFAULT 'user',
                origin TEXT NOT NULL DEFAULT 'prism',
                revision INTEGER NOT NULL DEFAULT 1,
                deleted_at TIMESTAMPTZ
            );
            """,
            prepare=False,
        )
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        migrate_tracker_webhook_oauth_tables(self.conn)
        apply_op_schema(self.conn)
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
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
            ack_id="ack_src",
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            visibility="private",
            acknowledged_by="admin",
        )
        self.conn.commit()
        self.settings = _settings()
        self._observed_visibility = {"222222222": "private", CONTAINER: "private"}

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    @contextmanager
    def _factory(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        try:
            yield conn
        finally:
            conn.close()

    def _observe_container(self, connector_id, *, container_kind, container_path, remote_container_id, generation=1, visibility_hint=None):
        visibility = self._observed_visibility.get(remote_container_id, visibility_hint or "unknown")
        return {
            "visibility": visibility,
            "containerPath": container_path,
            "remoteContainerId": remote_container_id,
        }

    def _seed_thread(self) -> None:
        self.conn.execute(
            """
            INSERT INTO comments(id, project_id, author, content, revision, author_kind, anchor_state, anchor_commit)
            VALUES (%s,%s,'Priya','root',1,'user','pinned','3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695')
            """,
            (COMMENT_ID, PROJECT),
        )
        self.store.insert_thread(
            thread_id=THREAD_ID,
            comment_id=COMMENT_ID,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=ISSUE_ID,
            external_number=ISSUE_NUMBER,
            link_state="linked",
            container_path="acme/openswitch",
        )

    def test_insert_thread_snapshots_container_path(self) -> None:
        self._seed_thread()
        self.conn.commit()
        row = self.conn.execute(
            "SELECT container_path FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertEqual(row["container_path"], "acme/openswitch")

    def test_supersede_live_ops_leaves_sent_for_recovery(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_pending",
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.ops.insert(
            op_id="op_sent",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.execute("UPDATE sync_ops SET state = 'sent', fence = 1 WHERE id = 'op_sent'")
        self.conn.commit()
        superseded = supersede_live_ops(self.conn, THREAD_ID, reason="destination_removed")
        self.conn.commit()
        self.assertEqual(superseded, ["op_pending"])
        self.assertEqual(self.ops.get("op_pending")["state"], "superseded")
        self.assertEqual(self.ops.get("op_sent")["state"], "sent")

    def test_destination_change_preserves_sent_ops(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_pending",
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.ops.insert(
            op_id="op_sent",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.execute("UPDATE sync_ops SET state = 'sent', fence = 1 WHERE id = 'op_sent'")
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
        service.update_settings(
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
        with self._factory() as conn:
            pending = conn.execute("SELECT state FROM sync_ops WHERE id = 'op_pending'").fetchone()
            sent = conn.execute("SELECT state FROM sync_ops WHERE id = 'op_sent'").fetchone()
            thread = conn.execute(
                "SELECT paused_reason, container_path FROM tracked_threads WHERE id = %s",
                (THREAD_ID,),
            ).fetchone()
            pt = conn.execute(
                "SELECT container_path FROM project_trackers WHERE project_id = %s",
                (PROJECT,),
            ).fetchone()
            self.assertEqual(pending["state"], "superseded")
            self.assertEqual(sent["state"], "sent")
            self.assertEqual(thread["paused_reason"], "destination_removed")
            self.assertEqual(thread["container_path"], "acme/openswitch")
            self.assertEqual(pt["container_path"], "acme/hardware-issues")

    def test_recovery_context_uses_thread_container_path(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_recover",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.execute("UPDATE sync_ops SET state = 'sent', fence = 1 WHERE id = 'op_recover'")
        # Project destination moved; thread keeps original path snapshot.
        self.conn.execute(
            """
            UPDATE project_trackers
            SET container_path = 'acme/hardware-issues',
                remote_container_id = '222222222',
                destination_generation = 3
            WHERE project_id = %s
            """,
            (PROJECT,),
        )
        self.conn.commit()
        ctx = _load_execution_context(self.conn, {"id": "op_recover"})
        self.assertEqual(ctx.destination.containerPath, "acme/openswitch")
        self.assertEqual(ctx.policy["container_path"], "acme/openswitch")
        self.assertEqual(ctx.destination.remoteContainerId, CONTAINER)

    def test_unlink_preserves_sent_ops(self) -> None:
        self._seed_thread()
        self.ops.insert(
            op_id="op_sent_unlink",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_designer",
        )
        self.conn.execute("UPDATE sync_ops SET state = 'sent', fence = 1 WHERE id = 'op_sent_unlink'")
        self.conn.commit()
        payload = unlink_thread_lifecycle(
            self.conn,
            THREAD_ID,
            reason="manual_unlink",
            actor_user_id="u_admin",
            project_id=PROJECT,
            connector_id=CONNECTOR,
        )
        self.conn.commit()
        self.assertNotIn("op_sent_unlink", payload["supersededOps"])
        self.assertEqual(self.ops.get("op_sent_unlink")["state"], "sent")


if __name__ == "__main__":
    unittest.main()
