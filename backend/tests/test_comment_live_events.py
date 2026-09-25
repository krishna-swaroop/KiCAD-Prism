from __future__ import annotations

import os
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor

from app.services import comment_live_events


TEST_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APP_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


@unittest.skipUnless(TEST_URL and TEST_URL != APP_URL, "disposable TEST_POSTGRES_URL required")
class CommentLiveEventsPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        import psycopg
        from psycopg import sql
        from psycopg.rows import dict_row

        self.psycopg = psycopg
        self.sql = sql
        self.dict_row = dict_row
        self.schema = f"comment_live_test_{uuid.uuid4().hex}"
        with self._connect(select_schema=False) as conn:
            conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        with self._connect() as conn:
            comment_live_events.apply_schema(conn)

    def tearDown(self) -> None:
        with self._connect(select_schema=False) as conn:
            conn.execute(
                self.sql.SQL("DROP SCHEMA {} CASCADE").format(self.sql.Identifier(self.schema))
            )

    def _connect(self, *, select_schema: bool = True):
        conn = self.psycopg.connect(TEST_URL, autocommit=True, row_factory=self.dict_row)
        if select_schema:
            conn.execute(
                self.sql.SQL("SET search_path TO {}, public").format(self.sql.Identifier(self.schema))
            )
        return conn

    def test_rollback_does_not_advance_replay_cursor(self) -> None:
        with self._connect() as conn:
            with self.assertRaises(RuntimeError), conn.transaction():
                comment_live_events.record_change(
                    conn, project_id="p1", comment_id="c1", scope="canvas", change_kind="upsert"
                )
                raise RuntimeError("abort comment mutation")

            self.assertEqual(comment_live_events.current_cursor(conn, "p1"), 0)
            self.assertEqual(comment_live_events.changes_after(conn, "p1", 0), [])

            with conn.transaction():
                cursor = comment_live_events.record_change(
                    conn, project_id="p1", comment_id="c1", scope="canvas", change_kind="upsert"
                )
            self.assertEqual(cursor, 1)
            self.assertEqual(comment_live_events.current_cursor(conn, "p1"), 1)

    def test_concurrent_writers_commit_in_cursor_order(self) -> None:
        first_recorded = threading.Event()
        release_first = threading.Event()

        def first_writer() -> int:
            with self._connect() as conn, conn.transaction():
                cursor = comment_live_events.record_change(
                    conn, project_id="p1", comment_id="c1", scope="canvas", change_kind="upsert"
                )
                first_recorded.set()
                if not release_first.wait(5):
                    raise TimeoutError("first writer was not released")
                return cursor

        def second_writer() -> int:
            with self._connect() as conn, conn.transaction():
                return comment_live_events.record_change(
                    conn, project_id="p1", comment_id="c2", scope="canvas", change_kind="delete"
                )

        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(first_writer)
            self.assertTrue(first_recorded.wait(5))
            second = pool.submit(second_writer)
            release_first.set()
            self.assertEqual(first.result(timeout=5), 1)
            self.assertEqual(second.result(timeout=5), 2)

        with self._connect() as conn:
            self.assertEqual(
                [(row["cursor"], row["commentId"]) for row in comment_live_events.changes_after(conn, "p1", 0)],
                [(1, "c1"), (2, "c2")],
            )
            self.assertEqual(
                [row["commentId"] for row in comment_live_events.changes_after(conn, "p1", 1)],
                ["c2"],
            )


if __name__ == "__main__":
    unittest.main()
