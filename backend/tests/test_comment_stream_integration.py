"""The HTTP comment store and replay stream must commit together."""

from __future__ import annotations

import os
import tempfile
import unittest
import uuid
from contextlib import contextmanager

from app.services import comment_live_events
from app.services.comments_revisions import Editor
from app.services.comments_store_service import CommentsStoreService


TEST_DSN = os.environ.get("TEST_POSTGRES_URL", "")


@unittest.skipUnless(TEST_DSN, "disposable TEST_POSTGRES_URL required")
class CommentStreamIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        import psycopg
        from psycopg.rows import dict_row

        self.psycopg = psycopg
        self.dict_row = dict_row
        self.schema = "test_comment_stream_" + uuid.uuid4().hex[:16]
        self.store = CommentsStoreService()
        self.store.schema = self.schema

        @contextmanager
        def connect():
            with psycopg.connect(TEST_DSN, row_factory=dict_row) as conn:
                conn.execute(f'SET search_path TO "{self.schema}", public')
                yield conn

        self.store._connect = connect
        self.project_id = "p_" + uuid.uuid4().hex[:12]
        self.path = tempfile.TemporaryDirectory()

    def tearDown(self) -> None:
        with self.psycopg.connect(TEST_DSN) as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
        self.path.cleanup()

    def test_create_reply_edit_delete_and_snapshot_cursor(self) -> None:
        created = self.store.create_comment(
            self.project_id, self.path.name, "PCB", {"x": 1, "y": 2}, "Original", "Author",
        )
        cid = created["id"]
        initial = self.store.get_comments_file(self.project_id, self.path.name)
        self.assertEqual(initial["cursor"], 1)
        self.assertEqual(initial["comments"][0]["id"], cid)

        editor = Editor("user:a", "user", "Author")
        self.store.add_reply(self.project_id, self.path.name, cid, "Reply", "Author")
        self.store.edit_comment(
            self.project_id, self.path.name, cid, editor, expected_revision=1, content="Edited",
        )
        self.store.delete_comment(self.project_id, self.path.name, cid, editor)

        with self.store._connect() as conn:
            events = comment_live_events.changes_after(conn, self.project_id, 0)
        self.assertEqual([event["cursor"] for event in events], [1, 2, 3, 4, 5])
        self.assertEqual([event["changeKind"] for event in events], ["upsert"] * 3 + ["delete", "upsert"])
        self.assertTrue(all(event["commentId"] == cid for event in events))
        final = self.store.get_comments_file(self.project_id, self.path.name)
        self.assertEqual(final["cursor"], 5)
        self.assertEqual(final["comments"], [])

    def test_thread_read_matches_listing_and_reports_deletion(self) -> None:
        created = self.store.create_comment(
            self.project_id, self.path.name, "PCB", {"x": 1, "y": 2}, "Original", "Author",
        )
        self.store.add_reply(self.project_id, self.path.name, created["id"], "Reply", "Author")
        thread, cursor = self.store.get_thread(self.project_id, self.path.name, created["id"])
        listing = self.store.get_comments_file(self.project_id, self.path.name)
        self.assertEqual(thread, listing["comments"][0])
        self.assertEqual(cursor, listing["cursor"])
        self.store.delete_comment(self.project_id, self.path.name, created["id"], Editor("user:a", "user", "Author"))
        gone, after = self.store.get_thread(self.project_id, self.path.name, created["id"])
        self.assertIsNone(gone)
        self.assertGreater(after, cursor)

    def test_reattach_preserves_origin_and_emits_anchor_event(self) -> None:
        origin = "a" * 40
        revision = "b" * 40
        created = self.store.create_comment(
            self.project_id, self.path.name, "PCB", {"x": 1, "y": 2}, "Original", "Author",
            anchor_commit=origin, anchor_source="client", element_id="old-uuid",
        )
        changed = self.store.reattach_comment(
            self.project_id, self.path.name, created["id"], commit=revision,
            location={"x": 3, "y": 4, "layer": "F.Cu"}, element_id="new-uuid",
            relative_point=[0.25, 0.75],
            file_path="board.kicad_pcb", editor=Editor("user:a", "user", "Author"),
            expected_revision=1,
        )
        self.assertEqual(changed["anchor"]["commit"], origin)
        self.assertEqual(changed["elementId"], "old-uuid")
        self.assertEqual(changed["revision"], 2)
        bindings = self.store.get_anchor_bindings(self.project_id, [created["id"]])
        self.assertEqual(bindings[created["id"]][0]["commit"], revision)
        self.assertEqual(bindings[created["id"]][0]["elementId"], "new-uuid")
        self.assertEqual(bindings[created["id"]][0]["relativePoint"], [0.25, 0.75])
        with self.store._connect() as conn:
            events = comment_live_events.changes_after(conn, self.project_id, 0)
        self.assertEqual([event["changeKind"] for event in events], ["upsert", "anchor"])

    def test_tracker_worker_projection_changes_are_transactional_and_live(self) -> None:
        created = self.store.create_comment(
            self.project_id, self.path.name, "PCB", {"x": 1, "y": 2}, "Original", "Author",
        )
        with self.store._connect() as conn:
            with conn.transaction():
                conn.execute(
                    """INSERT INTO tracked_threads
                       (id, comment_id, project_tracker_id, destination_generation,
                        connector_id, remote_container_id, external_id, link_state)
                       VALUES ('t1', %s, 'destination', 1, 'connector', 'repository', 'pending', 'linked')""",
                    (created["id"],),
                )
                conn.execute(
                    """INSERT INTO sync_ops
                       (id, tracked_thread_id, op, state, destination_generation)
                       VALUES ('op1', 't1', 'create_issue', 'pending', 1)"""
                )
                conn.execute("UPDATE tracked_threads SET external_id = 'node-id' WHERE id = 't1'")
                conn.execute("UPDATE tracked_threads SET last_verified_at = NOW() WHERE id = 't1'")
                # Backoff bookkeeping alone is not a viewer-visible change.
                conn.execute(
                    "UPDATE sync_ops SET attempts = attempts + 1, next_attempt_at = NOW() WHERE id = 'op1'"
                )
                conn.execute("UPDATE sync_ops SET state = 'confirmed' WHERE id = 'op1'")
            changes = comment_live_events.changes_after(conn, self.project_id, 0)
        self.assertEqual([event["changeKind"] for event in changes],
                         ["upsert", "projection", "projection", "projection", "projection"])
        self.assertTrue(all(event["commentId"] == created["id"] for event in changes))
        with self.assertRaises(RuntimeError), self.store._connect() as conn:
            with conn.transaction():
                conn.execute("UPDATE tracked_threads SET link_state = 'deleted' WHERE id = 't1'")
                raise RuntimeError("roll back worker transaction")
        with self.store._connect() as conn:
            self.assertEqual(len(comment_live_events.changes_after(conn, self.project_id, 0)), 5)


    def test_status_change_survives_deadlock_with_tracker_worker(self) -> None:
        """HTTP takes the stream head, then the tracker row; a worker's trigger
        takes them the other way round. PostgreSQL aborts one; the store's
        transaction must retry rather than surface a 500."""
        import threading
        from unittest.mock import patch

        from app.services import comments_store_service as css
        from app.services.trackers.promotion import PromotionActor

        created = self.store.create_comment(
            self.project_id, self.path.name, "PCB", {"x": 1, "y": 2}, "Original", "Author",
        )
        cid = created["id"]
        with self.store._connect() as conn, conn.transaction():
            conn.execute(
                """INSERT INTO tracked_threads
                   (id, comment_id, project_tracker_id, destination_generation,
                    connector_id, remote_container_id, external_id, link_state)
                   VALUES ('t1', %s, 'destination', 1, 'connector', 'repository', 'node-id', 'linked')""",
                (cid,),
            )

        http_holds_head = threading.Event()
        worker_holds_row = threading.Event()
        attempts: list[int] = []
        worker_errors: list[BaseException] = []

        def enqueue(conn, **_kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                http_holds_head.set()
                worker_holds_row.wait(5)
            conn.execute("UPDATE tracked_threads SET pending_op_id = 'op-http' WHERE id = 't1'")

        def worker() -> None:
            http_holds_head.wait(5)
            try:
                with self.store._connect() as conn, conn.transaction():
                    conn.execute("SELECT id FROM tracked_threads WHERE id = 't1' FOR UPDATE")
                    worker_holds_row.set()
                    # Let the HTTP update start waiting first so PostgreSQL
                    # picks the HTTP transaction as the deadlock victim.
                    threading.Event().wait(0.3)
                    conn.execute("UPDATE tracked_threads SET remote_state = 'closed' WHERE id = 't1'")
            except BaseException as exc:  # pragma: no cover - reported below
                worker_errors.append(exc)

        thread = threading.Thread(target=worker)
        thread.start()
        with patch.object(css, "enqueue_set_state", side_effect=enqueue), \
                patch.object(css, "evaluate_dispatch", return_value=None):
            updated = self.store.update_comment_status(
                self.project_id, self.path.name, cid, "RESOLVED",
                editor=Editor("user:a", "user", "Author"),
                promotion_actor=PromotionActor(user_id="user:a", role="designer", kind="user"),
            )
        thread.join(10)
        self.assertEqual(worker_errors, [])
        self.assertEqual(updated["status"], "RESOLVED")
        self.assertGreaterEqual(len(attempts), 2, "the HTTP transaction should have been retried")
        with self.store._connect() as conn:
            row = conn.execute("SELECT pending_op_id, remote_state FROM tracked_threads WHERE id = 't1'").fetchone()
            events = comment_live_events.changes_after(conn, self.project_id, 0)
        self.assertEqual((row["pending_op_id"], row["remote_state"]), ("op-http", "closed"))
        self.assertEqual([event["cursor"] for event in events], list(range(1, len(events) + 1)))


if __name__ == "__main__":
    unittest.main()
