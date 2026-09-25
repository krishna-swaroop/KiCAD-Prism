"""TR-13: durable sync_ops outbox and inbound hint inbox (F4, F5, F6)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import Editor, record_revision  # noqa: E402
from app.services.trackers.inbox_store import (  # noqa: E402
    CHECKPOINT_KINDS,
    HINT_STATES,
    InboxStore,
    StaleHintFence,
    apply_schema as apply_inbox_schema,
)
from app.services.trackers.migrations import (  # noqa: E402
    WORKSPACE_WEBHOOK_OAUTH_VERSION,
    migrate_workspace_tracker_tables,
)
from app.services.trackers.op_store import (  # noqa: E402
    EXECUTE_DISPATCH,
    OP_KINDS,
    OP_STATES,
    RECOVERY_DISPATCH,
    OpStore,
    StaleFence,
    apply_schema as apply_op_schema,
    sanitize_error,
)
from app.services.trackers.schema import FORBIDDEN_COLUMNS  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.workspace_schema_migrations import MIGRATIONS as WS_MIGRATIONS  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
EXAMPLES = json.loads((DOCS / "dto-examples.json").read_text(encoding="utf-8"))


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


class ContractSnapshotTests(unittest.TestCase):
    def test_op_kinds_and_states_match_frozen_dto(self) -> None:
        tracker = EXAMPLES["tracker"]
        self.assertEqual(list(OP_KINDS), tracker["SyncOp_kinds"])
        self.assertEqual(list(OP_STATES), tracker["SyncOp_states"])
        self.assertEqual(list(HINT_STATES), ["pending", "applied", "ignored", "failed"])
        self.assertEqual(list(CHECKPOINT_KINDS), ["poll", "sweep", "recovery"])
        versions = [version for version, _, _ in WS_MIGRATIONS]
        self.assertIn(23, versions)
        self.assertEqual(max(versions), WORKSPACE_WEBHOOK_OAUTH_VERSION)

    def test_sanitize_error_redacts_tokens_and_caps_length(self) -> None:
        payload = sanitize_error(
            "auth_lost",
            "Authorization: Bearer gho_thisIsNotARealTokenAndMustNeverBeStored " + ("x" * 400),
        )
        self.assertEqual(payload["class"], "auth_lost")
        self.assertNotIn("gho_", payload["message"])
        self.assertIn("<redacted>", payload["message"])
        self.assertLessEqual(len(payload["message"]), 300)
        self.assertFalse(payload["retryable"])


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class OpInboxPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr13_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.conn.commit()
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def _restore_path(self) -> None:
        self.conn.rollback()
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)

    def _connect(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        return conn

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
                forge_provider TEXT,
                forge_issue_id TEXT,
                forge_issue_url TEXT,
                forge_sync_state TEXT
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT ''
            );
            """,
            prepare=False,
        )

    def _seed_thread(self, *, comment_id: str = "c_1", thread_id: str = "tt_1") -> str:
        self.store.upsert_connector(
            connector_id="cn_gh1", provider="github", instance_kind="github.com"
        )
        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id="cn_gh1",
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id="111",
            generation=2,
        )
        self.conn.execute(
            """
            INSERT INTO comments(id, project_id, author, content)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (comment_id, "prj_a", "Priya", "stub on MGMT.D0_P"),
        )
        existing = self.conn.execute(
            "SELECT id FROM tracked_threads WHERE id = %s", (thread_id,)
        ).fetchone()
        if existing is None:
            self.store.insert_thread(
                thread_id=thread_id,
                comment_id=comment_id,
                project_tracker_id="pt_a",
                destination_generation=2,
                connector_id="cn_gh1",
                remote_container_id="111",
                external_id="pending",
            )
        return thread_id

    def test_restart_is_idempotent_and_has_no_owner_repo_columns(self) -> None:
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.conn.commit()
        tables = {
            row["table_name"]
            for row in self.conn.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = %s
                """,
                (self.schema,),
            ).fetchall()
        }
        self.assertGreaterEqual(
            tables,
            {"sync_ops", "remote_deliveries", "remote_hints", "sync_checkpoints", "tracked_threads"},
        )
        columns = {
            row["column_name"]
            for row in self.conn.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s
                """,
                (self.schema,),
            ).fetchall()
        }
        self.assertFalse(columns & FORBIDDEN_COLUMNS)

    def test_comment_revision_and_op_roll_back_together(self) -> None:
        thread_id = self._seed_thread()
        self.conn.commit()
        record_revision(
            self.conn,
            project_id="prj_a",
            target_kind="root",
            target_id="c_1",
            revision=1,
            change_kind="create",
            editor=Editor(user_id="u_1a2b", kind="user", display="Priya"),
            content="stub on MGMT.D0_P",
            status="OPEN",
        )
        inserted = self.ops.insert(
            op_id="op_91a4c0de",
            tracked_thread_id=thread_id,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_1a2b",
            expected_body_hash="sha256:4d1e-fixture",
        )
        self.assertEqual(inserted["state"], "pending")
        self.assertNotIn("credential_envelope", inserted)
        self.conn.rollback()
        self._restore_path()
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM comment_revisions").fetchone()["n"],
            0,
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"],
            0,
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM comments").fetchone()["n"],
            1,
        )

    def test_comment_revision_and_op_commit_atomically(self) -> None:
        thread_id = self._seed_thread()
        record_revision(
            self.conn,
            project_id="prj_a",
            target_kind="root",
            target_id="c_1",
            revision=1,
            change_kind="create",
            editor=Editor(user_id="u_1a2b", kind="user", display="Priya"),
            content="stub on MGMT.D0_P",
        )
        self.ops.insert(
            op_id="op_91a4c0de",
            tracked_thread_id=thread_id,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_1a2b",
        )
        self.conn.commit()
        other = self._connect()
        try:
            self.assertEqual(
                other.execute("SELECT COUNT(*) AS n FROM comment_revisions").fetchone()["n"],
                1,
            )
            self.assertEqual(
                other.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"],
                1,
            )
        finally:
            other.close()

    def test_two_workers_cannot_claim_the_same_live_op(self) -> None:
        thread_id = self._seed_thread()
        self.ops.insert(
            op_id="op_91a4c0de",
            tracked_thread_id=thread_id,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
        )
        self.conn.commit()
        worker_a = self._connect()
        worker_b = self._connect()
        try:
            claimed_a = OpStore(worker_a).claim("worker-a")
            claimed_b = OpStore(worker_b).claim("worker-b")
            self.assertIsNotNone(claimed_a)
            self.assertEqual(claimed_a["id"], "op_91a4c0de")
            self.assertEqual(claimed_a["dispatch"], EXECUTE_DISPATCH)
            self.assertIsNone(claimed_b)
            worker_a.commit()
            claimed_again = OpStore(worker_b).claim("worker-b")
            self.assertIsNone(claimed_again)
        finally:
            worker_a.close()
            worker_b.close()

    def test_stale_fence_cannot_confirm_after_reclaim(self) -> None:
        thread_id = self._seed_thread()
        self.ops.insert(
            op_id="op_91a4c0de",
            tracked_thread_id=thread_id,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
        )
        first = self.ops.claim("worker-a")
        sent = self.ops.mark_sent(first["id"], first["fence"])
        self.assertEqual(sent["state"], "sent")
        self.assertEqual(sent["dispatch"], RECOVERY_DISPATCH)
        self.conn.execute(
            "UPDATE sync_ops SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = %s",
            ("op_91a4c0de",),
        )
        self.conn.commit()
        recovered = self.ops.claim("worker-b")
        self.assertIsNotNone(recovered)
        self.assertEqual(recovered["dispatch"], RECOVERY_DISPATCH)
        self.assertGreater(int(recovered["fence"]), int(first["fence"]))
        with self.assertRaises(StaleFence):
            self.ops.confirm(first["id"], first["fence"], external_result_id="412")
        confirmed = self.ops.confirm(
            recovered["id"], recovered["fence"], external_result_id="412"
        )
        self.assertEqual(confirmed["state"], "confirmed")
        self.assertEqual(confirmed["external_result_id"], "412")

    def test_claim_of_sent_is_recovery_not_execute(self) -> None:
        thread_id = self._seed_thread()
        self.ops.insert(
            op_id="op_sent",
            tracked_thread_id=thread_id,
            op="create_issue",
            destination_generation=2,
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(claimed["id"], claimed["fence"])
        self.conn.execute(
            "UPDATE sync_ops SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = %s",
            ("op_sent",),
        )
        self.conn.commit()
        again = self.ops.claim("worker-b")
        self.assertEqual(again["state"], "sent")
        self.assertEqual(again["dispatch"], RECOVERY_DISPATCH)
        self.assertNotEqual(again["dispatch"], EXECUTE_DISPATCH)
        recovered = self.ops.enter_recovery(again["id"], again["fence"])
        self.assertEqual(recovered["state"], "recovering")
        self.assertEqual(recovered["dispatch"], RECOVERY_DISPATCH)

    def test_add_comment_waits_for_create_confirmation(self) -> None:
        thread_id = self._seed_thread()
        self.ops.insert(
            op_id="op_create",
            tracked_thread_id=thread_id,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
        )
        self.ops.insert(
            op_id="op_reply",
            tracked_thread_id=thread_id,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
        )
        first = self.ops.claim("worker-a")
        self.assertEqual(first["id"], "op_create")
        self.assertEqual(first["dispatch"], EXECUTE_DISPATCH)
        self.ops.mark_sent(first["id"], first["fence"])
        self.conn.commit()
        worker_b = self._connect()
        try:
            self.assertIsNone(OpStore(worker_b).claim("worker-b"))
        finally:
            worker_b.close()
        self.ops.confirm(first["id"], first["fence"], external_result_id="412")
        self.conn.commit()
        reply = self.ops.claim("worker-a")
        self.assertIsNotNone(reply)
        self.assertEqual(reply["id"], "op_reply")
        self.assertEqual(reply["op"], "add_comment")

    def test_supersede_and_fail_sanitize_and_reject_stale_fence(self) -> None:
        thread_id = self._seed_thread()
        self.ops.insert(
            op_id="op_close",
            tracked_thread_id=thread_id,
            op="set_state",
            destination_generation=2,
            expected_remote_state="open",
            expected_remote_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        claimed = self.ops.claim("worker-a")
        superseded = self.ops.supersede(
            claimed["id"], claimed["fence"], reason="preflight mismatch vs remote reopen"
        )
        self.assertEqual(superseded["state"], "superseded")
        with self.assertRaises(StaleFence):
            self.ops.fail(
                claimed["id"],
                claimed["fence"],
                error={"class": "transient", "message": "token gho_should_not_land"},
            )
        self.ops.insert(
            op_id="op_fail",
            tracked_thread_id=thread_id,
            op="set_state",
            destination_generation=2,
        )
        live = self.ops.claim("worker-a")
        failed = self.ops.fail(
            live["id"],
            live["fence"],
            error={
                "class": "transient",
                "message": "Authorization: Bearer gho_should_not_land raw body dump",
            },
        )
        self.assertEqual(failed["state"], "failed")
        self.assertNotIn("gho_", str(failed["last_error"]))

    def test_enqueue_and_dedupe_are_atomic_and_crash_safe(self) -> None:
        hints = [
            {
                "id": "hint_1",
                "objectKind": "issue",
                "remoteContainerId": "111",
                "externalId": "412",
                "event": "created",
                "actor": {"id": "5550001", "login": "arjun-gh"},
            }
        ]
        first = self.inbox.enqueue(
            connector_id="cn_gh1",
            delivery_id="72d3c0e0-9b1a-11ef-9c6a-0242ac120002",
            hints=hints,
        )
        self.assertTrue(first["created"])
        self.assertEqual(len(first["hints"]), 1)
        self.conn.rollback()
        self._restore_path()
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM remote_deliveries").fetchone()["n"],
            0,
        )
        committed = self.inbox.enqueue(
            connector_id="cn_gh1",
            delivery_id="72d3c0e0-9b1a-11ef-9c6a-0242ac120002",
            hints=hints,
        )
        self.assertTrue(committed["created"])
        self.conn.commit()
        replay = self.inbox.enqueue(
            connector_id="cn_gh1",
            delivery_id="72d3c0e0-9b1a-11ef-9c6a-0242ac120002",
            hints=[{**hints[0], "id": "hint_forged"}],
        )
        self.assertFalse(replay["created"])
        self.assertEqual([row["id"] for row in replay["hints"]], ["hint_1"])
        claimed = self.inbox.claim_hint("worker-a")
        self.assertEqual(claimed["id"], "hint_1")
        applied = self.inbox.finish_hint(claimed["id"], claimed["fence"], state="applied")
        self.assertEqual(applied["state"], "applied")
        with self.assertRaises(StaleHintFence):
            self.inbox.finish_hint(claimed["id"], claimed["fence"], state="ignored")

    def test_checkpoint_claim_uses_fence(self) -> None:
        saved = self.inbox.upsert_checkpoint(
            kind="poll",
            scope_key="cn_gh1:111",
            cursor={"since": "2026-09-20T15:00:00Z"},
        )
        self.assertEqual(saved["kind"], "poll")
        first = self.inbox.claim_checkpoint(
            kind="poll", scope_key="cn_gh1:111", worker_id="worker-a"
        )
        self.assertIsNotNone(first)
        self.conn.execute(
            """
            UPDATE sync_checkpoints
            SET lease_expires_at = NOW() - INTERVAL '1 second'
            WHERE kind = 'poll' AND scope_key = 'cn_gh1:111'
            """
        )
        self.conn.commit()
        second = self.inbox.claim_checkpoint(
            kind="poll", scope_key="cn_gh1:111", worker_id="worker-b"
        )
        self.assertIsNotNone(second)
        self.assertGreater(int(second["fence"]), int(first["fence"]))
        self.assertEqual(second["claimed_by"], "worker-b")


if __name__ == "__main__":
    unittest.main()
