"""Two independent PostgreSQL listeners see one committed comment event."""

from __future__ import annotations

import asyncio
import os
import time
import unittest
import uuid
from unittest.mock import patch

from app.services import comment_live_events
from app.services import comment_live_broker as broker_module
from app.services.comment_live_broker import CommentLiveBroker


TEST_DSN = os.environ.get("TEST_POSTGRES_URL", "")


@unittest.skipUnless(TEST_DSN and TEST_DSN != os.environ.get("PRISM_DATABASE_URL"),
                     "disposable TEST_POSTGRES_URL required")
class CrossWorkerCommentNotificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_both_listeners_wake_from_one_committed_event(self) -> None:
        import psycopg
        from psycopg.rows import dict_row

        schema = "test_comment_notify_" + uuid.uuid4().hex[:16]
        project_id = "p_" + uuid.uuid4().hex[:12]
        with psycopg.connect(TEST_DSN, row_factory=dict_row) as conn:
            conn.execute(f'CREATE SCHEMA "{schema}"')
            conn.execute(f'SET search_path TO "{schema}", public')
            comment_live_events.apply_schema(conn)

        first = CommentLiveBroker()
        second = CommentLiveBroker()
        first_queue = first.subscribe(project_id)
        second_queue = second.subscribe(project_id)
        try:
            with patch.object(broker_module, "postgres_dsn", return_value=TEST_DSN):
                first.start()
                second.start()
                await asyncio.wait_for(asyncio.gather(first.ready.wait(), second.ready.wait()), 5)
                started = time.perf_counter()
                with psycopg.connect(TEST_DSN, row_factory=dict_row) as conn:
                    conn.execute(f'SET search_path TO "{schema}", public')
                    with conn.transaction():
                        comment_live_events.record_change(
                            conn, project_id=project_id, comment_id="c1",
                            scope="canvas", change_kind="upsert",
                        )
                await asyncio.wait_for(asyncio.gather(first_queue.get(), second_queue.get()), 2)
                self.assertLess(time.perf_counter() - started, 2)
                with psycopg.connect(TEST_DSN, row_factory=dict_row) as conn:
                    conn.execute(f'SET search_path TO "{schema}", public')
                    self.assertEqual(comment_live_events.changes_after(conn, project_id, 0)[0]["cursor"], 1)
        finally:
            await first.stop()
            await second.stop()
            with psycopg.connect(TEST_DSN) as conn:
                conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


if __name__ == "__main__":
    unittest.main()
