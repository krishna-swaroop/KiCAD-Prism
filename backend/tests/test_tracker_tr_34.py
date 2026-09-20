"""TR-34: transfer, unlink and re-promotion lineage (F7, F8)."""

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
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    IssueContainerRef,
    Moved,
    RemoteIssue,
    RemoteVersion,
)
from app.services.trackers.inbound import assert_inbound_suppresses_outbound  # noqa: E402
from app.services.trackers.link_lifecycle import (  # noqa: E402
    PAUSED_TRANSFER_REASON,
    apply_moved_issue,
    apply_verified_transfer,
    can_offer_repromote,
    can_repromote,
    pause_project_links_on_destination_removal,
    repromote_deleted_thread,
    supersede_live_ops,
    unlink_thread_lifecycle,
)
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import LIVE_STATES, OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.promotion import PromotionActor  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from test_tracker_tr_28 import (  # noqa: E402
    BOT_ID,
    BOT_LOGIN,
    COMMENT_ID,
    CONNECTOR,
    CONTAINER,
    ISSUE,
    ISSUE_ID,
    ISSUE_NUMBER,
    _forge_user,
    _remote_issue,
)

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

APPROVED_CONTAINER = "222222222"
UNAPPROVED_CONTAINER = "333333333"
APPROVED_PATH = "acme/hardware-issues"
UNAPPROVED_PATH = "acme/public-notes"


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


def _issue_in_container(
    *,
    container_id: str,
    path: str,
    external_id: str = ISSUE_ID,
    number: int = int(ISSUE_NUMBER),
) -> RemoteIssue:
    return RemoteIssue(
        externalId=external_id,
        url=f"https://github.com/{path}/issues/{number}",
        number=number,
        title="Transferred fixture",
        body="issue body",
        state="open",
        author=_forge_user(user_id=BOT_ID, login=BOT_LOGIN, is_bot=True),
        version=RemoteVersion(updatedAt="2026-09-20T17:00:00Z"),
        container=IssueContainerRef(remoteContainerId=container_id, path=path),
    )


class FixtureContractTests(unittest.TestCase):
    def test_tr34_fixture_cases_present(self) -> None:
        f7_ids = {case["id"] for case in F7["cases"]}
        for case_id in (
            "F7.transfer_to_approved_container",
            "F7.transfer_to_unapproved_container",
        ):
            self.assertIn(case_id, f7_ids)
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.remote_issue_deleted", f8_ids)
        self.assertIn("F8.no_repromote_from_inaccessible", f8_ids)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class LinkLifecyclePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr34_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
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
        self._seed_destination()
        self.conn.commit()

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
                revision INTEGER NOT NULL DEFAULT 1
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
            project_id="prj_a",
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
        self.store.acknowledge_destination(
            ack_id="ack_public_hw",
            connector_id=CONNECTOR,
            remote_container_id=APPROVED_CONTAINER,
            visibility="public",
            acknowledged_by="admin",
        )

    def _seed_comment(self) -> None:
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content, revision) VALUES (%s,%s,%s,%s,%s)",
            (COMMENT_ID, "prj_a", "Priya", "root content", 1),
        )

    def _seed_thread(
        self,
        *,
        thread_id: str = "tt_a",
        link_state: str = "linked",
        external_id: str = ISSUE_ID,
        external_number: str = ISSUE_NUMBER,
        container_id: str = CONTAINER,
        lineage: list | None = None,
    ) -> dict:
        self._seed_comment()
        self.store.insert_thread(
            thread_id=thread_id,
            comment_id=COMMENT_ID,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=container_id,
            external_id=external_id,
            external_number=external_number,
            external_url=f"https://github.com/acme/openswitch/issues/{external_number}",
            link_state=link_state,
            lineage=lineage or [],
        )
        row = self.conn.execute(
            "SELECT * FROM tracked_threads WHERE id = %s", (thread_id,)
        ).fetchone()
        return dict(row)

    def _thread(self, thread_id: str = "tt_a") -> dict:
        row = self.conn.execute(
            "SELECT * FROM tracked_threads WHERE id = %s", (thread_id,)
        ).fetchone()
        return dict(row)

    def _insert_pending_op(self, thread_id: str, op_id: str = "op_pending") -> None:
        self.ops.insert(
            op_id=op_id,
            tracked_thread_id=thread_id,
            op="add_comment",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_admin",
        )
        self.conn.execute(
            "UPDATE tracked_threads SET pending_op_id = %s WHERE id = %s",
            (op_id, thread_id),
        )

    def test_f7_transfer_to_approved_container_relinks_and_preserves_history(self) -> None:
        thread = self._seed_thread()
        self.ops.insert(
            op_id="op_create_old",
            tracked_thread_id="tt_a",
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_admin",
        )
        self.conn.execute(
            "UPDATE sync_ops SET state = 'confirmed', external_result_id = %s WHERE id = %s",
            (ISSUE_ID, "op_create_old"),
        )
        transferred = _issue_in_container(
            container_id=APPROVED_CONTAINER,
            path=APPROVED_PATH,
            external_id="900001",
            number=9,
        )
        before_ops = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        outcome = apply_verified_transfer(
            self.conn,
            thread,
            transferred,
            visibility="public",
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "relinked")
        refreshed = self._thread()
        self.assertEqual(refreshed["link_state"], "linked")
        self.assertEqual(refreshed["remote_container_id"], APPROVED_CONTAINER)
        self.assertEqual(refreshed["external_id"], "900001")
        self.assertEqual(refreshed["external_number"], "9")
        self.assertIn("transfer_relinked", json.dumps(refreshed["lineage"]))
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"],
            before_ops,
        )
        assert_inbound_suppresses_outbound(self.conn, before=before_ops)

    def test_f7_transfer_to_unapproved_container_pauses_and_supersedes_pending(self) -> None:
        thread = self._seed_thread()
        self._insert_pending_op("tt_a", "op_reply_pending")
        transferred = _issue_in_container(
            container_id=UNAPPROVED_CONTAINER,
            path=UNAPPROVED_PATH,
            external_id="910001",
            number=11,
        )
        outcome = apply_verified_transfer(
            self.conn,
            thread,
            transferred,
            visibility="public",
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "paused")
        self.assertEqual(outcome.link_state, "transferred")
        self.assertEqual(outcome.reason, PAUSED_TRANSFER_REASON)
        self.assertIn("op_reply_pending", outcome.superseded_ops)
        refreshed = self._thread()
        self.assertEqual(refreshed["link_state"], "transferred")
        self.assertEqual(refreshed["paused_reason"], PAUSED_TRANSFER_REASON)
        self.assertEqual(refreshed["remote_container_id"], CONTAINER)
        self.assertEqual(refreshed["external_id"], ISSUE_ID)
        op = self.ops.get("op_reply_pending")
        self.assertEqual(op["state"], "superseded")
        self.assertIsNone(refreshed["pending_op_id"])

    def test_f8_remote_issue_deleted_repromote_creates_lineage_op(self) -> None:
        thread = self._seed_thread(link_state="deleted")
        self.ops.insert(
            op_id="op_create_old",
            tracked_thread_id="tt_a",
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_admin",
        )
        self.conn.execute(
            "UPDATE sync_ops SET state = 'confirmed', external_result_id = %s WHERE id = %s",
            (ISSUE_ID, "op_create_old"),
        )
        self.conn.commit()
        actor = PromotionActor(user_id="u_admin", role="admin")
        comment = {"id": COMMENT_ID, "revision": 1}
        first = repromote_deleted_thread(
            self.conn,
            project_id="prj_a",
            comment=comment,
            actor=actor,
            workspace_schema=self.schema,
        )
        second = repromote_deleted_thread(
            self.conn,
            project_id="prj_a",
            comment=comment,
            actor=actor,
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(first.action, "enqueued")
        self.assertEqual(second.action, "existing")
        self.assertEqual(first.op_id, second.op_id)
        refreshed = self._thread()
        self.assertEqual(refreshed["external_id"], "pending")
        self.assertEqual(refreshed["link_state"], "linked")
        new_op = self.ops.get(str(first.op_id))
        self.assertEqual(new_op["lineage_of"], "op_create_old")
        self.assertEqual(new_op["state"], "pending")
        self.assertIn("re_promote", json.dumps(refreshed["lineage"]))

    def test_f8_no_repromote_from_inaccessible(self) -> None:
        self._seed_thread(link_state="inaccessible")
        self.conn.commit()
        self.assertFalse(can_repromote("inaccessible"))
        self.assertFalse(can_offer_repromote(self._thread()))
        actor = PromotionActor(user_id="u_admin", role="admin")
        result = repromote_deleted_thread(
            self.conn,
            project_id="prj_a",
            comment={"id": COMMENT_ID, "revision": 1},
            actor=actor,
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(result.action, "denied")
        self.assertEqual(result.code, "not_repromotable")

    def test_unlink_supersedes_live_ops_and_preserves_lineage(self) -> None:
        thread = self._seed_thread()
        self._insert_pending_op("tt_a", "op_live")
        self.conn.commit()
        payload = unlink_thread_lifecycle(
            self.conn,
            "tt_a",
            reason="local_root_deleted",
            actor_user_id="u_admin",
            project_id="prj_a",
            connector_id=CONNECTOR,
        )
        self.conn.commit()
        self.assertIn("op_live", payload["supersededOps"])
        refreshed = self._thread()
        self.assertIsNotNone(refreshed["unlinked_at"])
        self.assertTrue(refreshed["lineage"])
        self.assertEqual(self.ops.get("op_live")["state"], "superseded")
        audit = self.conn.execute(
            "SELECT action FROM tracker_audit WHERE action = 'thread.unlink'"
        ).fetchall()
        self.assertEqual(len(audit), 1)

    def test_project_destination_removal_retains_audit_and_supersedes_ops(self) -> None:
        self._seed_thread()
        self._insert_pending_op("tt_a", "op_project_pending")
        before_threads = self.conn.execute("SELECT COUNT(*) AS n FROM tracked_threads").fetchone()["n"]
        before_ops = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        self.conn.commit()
        payload = pause_project_links_on_destination_removal(self.conn, "prj_a")
        self.conn.commit()
        self.assertEqual(payload["threadCount"], 1)
        self.assertIn("op_project_pending", payload["supersededOps"])
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM tracked_threads").fetchone()["n"],
            before_threads,
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"],
            before_ops,
        )
        self.assertEqual(self.ops.get("op_project_pending")["state"], "superseded")
        audit = self.conn.execute(
            "SELECT action FROM tracker_audit WHERE action = 'project_tracker.destination_removed'"
        ).fetchall()
        self.assertEqual(len(audit), 1)

    def test_apply_moved_without_fetch_pauses_when_unapproved(self) -> None:
        thread = self._seed_thread()
        moved = Moved(new_ref=f"{UNAPPROVED_PATH}#11", new_container_id=UNAPPROVED_CONTAINER)
        outcome = apply_moved_issue(
            self.conn,
            thread,
            moved,
            visibility="public",
            workspace_schema=self.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "paused")
        self.assertEqual(self._thread()["link_state"], "transferred")

    def test_supersede_live_ops_only_targets_live_states(self) -> None:
        thread = self._seed_thread()
        self.ops.insert(
            op_id="op_confirmed",
            tracked_thread_id="tt_a",
            op="create_issue",
            destination_generation=2,
            local_revision=1,
        )
        self.conn.execute("UPDATE sync_ops SET state = 'confirmed' WHERE id = 'op_confirmed'")
        self._insert_pending_op("tt_a", "op_live_only")
        self.conn.commit()
        superseded = supersede_live_ops(self.conn, "tt_a", reason="test")
        self.conn.commit()
        self.assertEqual(superseded, ["op_live_only"])
        self.assertEqual(self.ops.get("op_confirmed")["state"], "confirmed")
        self.assertEqual(self.ops.get("op_live_only")["state"], "superseded")


if __name__ == "__main__":
    unittest.main()
