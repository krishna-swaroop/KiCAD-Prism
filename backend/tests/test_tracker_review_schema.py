"""Review probes: comments migration 4 creates sync tables (H1) and delete cascades (H4)."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_store_service import CommentsStoreService  # noqa: E402
from app.services.trackers.migrations import (  # noqa: E402
    cascade_comments_tracker_fks,
    cascade_workspace_tracker_fks,
    migrate_workspace_tracker_tables,
)
from app.services.trackers.store import TrackerStore  # noqa: E402

try:
    import psycopg
    from psycopg.errors import ForeignKeyViolation
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    ForeignKeyViolation = Exception  # type: ignore[misc, assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


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


class DisposableCommentsStore(CommentsStoreService):
    def __init__(self, schema: str) -> None:
        super().__init__()
        self.schema = schema

    @contextmanager
    def _connect(self):
        with psycopg.connect(_dsn(), row_factory=dict_row) as conn:
            conn.execute(f'SET search_path TO "{self.schema}", public')
            yield conn


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class CommentsMigrationReviewPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"trh14_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
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
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE project_comment_state (
                project_id TEXT PRIMARY KEY,
                imported_from_json BOOLEAN NOT NULL DEFAULT FALSE,
                imported_at TIMESTAMPTZ,
                last_exported_at TIMESTAMPTZ,
                last_export_commit TEXT
            );
            """,
            prepare=False,
        )
        self.conn.commit()

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def test_h1_comments_migrate_creates_sync_tables_without_test_apply_schema(self) -> None:
        comments_schema_migrations.apply_comments_migrations(self.conn)
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
            {
                "sync_ops",
                "remote_deliveries",
                "remote_hints",
                "sync_checkpoints",
                "tracked_threads",
                "tracked_replies",
            },
        )
        ledger = {
            int(row["version"])
            for row in self.conn.execute("SELECT version FROM comment_schema_migrations").fetchall()
        }
        self.assertIn(4, ledger)

    def test_h4_delete_project_comments_after_link_does_not_fk_violate(self) -> None:
        comments_schema_migrations.apply_comments_migrations(self.conn)
        self.conn.commit()
        store = DisposableCommentsStore(self.schema)
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            ("c_1", "prj_a", "Priya", "stub"),
        )
        self.conn.execute(
            "INSERT INTO comment_replies(id, comment_id, project_id, author, content) VALUES (%s,%s,%s,%s,%s)",
            ("r_1", "c_1", "prj_a", "Arjun", "ack"),
        )
        self.conn.execute(
            """
            INSERT INTO tracked_threads (
                id, comment_id, project_tracker_id, destination_generation,
                connector_id, remote_container_id, external_id, link_state
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            ("tt_1", "c_1", "pt_a", 2, "cn_gh1", "111", "412", "linked"),
        )
        self.conn.execute(
            """
            INSERT INTO tracked_replies (id, tracked_thread_id, reply_id, external_comment_id)
            VALUES (%s,%s,%s,%s)
            """,
            ("tr_1", "tt_1", "r_1", "2211003"),
        )
        self.conn.execute(
            """
            INSERT INTO sync_ops (id, tracked_thread_id, op, destination_generation)
            VALUES (%s,%s,%s,%s)
            """,
            ("op_1", "tt_1", "create_issue", 2),
        )
        self.conn.commit()
        store.delete_project_comments("prj_a")
        leftover = self.conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM comments WHERE project_id = 'prj_a') AS comments,
                (SELECT COUNT(*) FROM tracked_threads) AS threads,
                (SELECT COUNT(*) FROM tracked_replies) AS replies,
                (SELECT COUNT(*) FROM sync_ops) AS ops
            """
        ).fetchone()
        self.assertEqual(int(leftover["comments"]), 0)
        self.assertEqual(int(leftover["threads"]), 0)
        self.assertEqual(int(leftover["replies"]), 0)
        self.assertEqual(int(leftover["ops"]), 0)

    def test_h4_connector_delete_cascades_project_trackers(self) -> None:
        migrate_workspace_tracker_tables(self.conn)
        cascade_workspace_tracker_fks(self.conn)
        self.conn.commit()
        store = TrackerStore(self.conn)
        store.upsert_connector(connector_id="cn_gh1", provider="github", instance_kind="github.com")
        store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id="cn_gh1",
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id="111",
            generation=2,
        )
        self.conn.commit()
        self.conn.execute("DELETE FROM tracker_connectors WHERE id = 'cn_gh1'")
        self.conn.commit()
        leftover = self.conn.execute("SELECT COUNT(*) AS n FROM project_trackers").fetchone()
        self.assertEqual(int(leftover["n"]), 0)

    def test_h4_existing_non_cascade_fk_is_rewritten(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE tracked_threads (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_tracker_id TEXT NOT NULL,
                destination_generation INTEGER NOT NULL,
                connector_id TEXT NOT NULL,
                remote_container_id TEXT NOT NULL,
                external_id TEXT NOT NULL,
                link_state TEXT NOT NULL,
                lineage JSONB NOT NULL DEFAULT '[]'::jsonb
            );
            CREATE TABLE tracked_replies (
                id TEXT PRIMARY KEY,
                tracked_thread_id TEXT NOT NULL REFERENCES tracked_threads(id),
                reply_id TEXT NOT NULL REFERENCES comment_replies(id),
                external_comment_id TEXT NOT NULL
            );
            CREATE TABLE sync_ops (
                id TEXT PRIMARY KEY,
                tracked_thread_id TEXT NOT NULL REFERENCES tracked_threads(id),
                op TEXT NOT NULL,
                destination_generation INTEGER NOT NULL DEFAULT 1
            );
            """,
            prepare=False,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            ("c_old", "prj_a", "Priya", "stub"),
        )
        self.conn.execute(
            """
            INSERT INTO tracked_threads (
                id, comment_id, project_tracker_id, destination_generation,
                connector_id, remote_container_id, external_id, link_state
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            ("tt_old", "c_old", "pt_a", 1, "cn_gh1", "111", "412", "linked"),
        )
        self.conn.commit()
        with self.assertRaises(ForeignKeyViolation):
            self.conn.execute("DELETE FROM comments WHERE id = 'c_old'")
        self.conn.rollback()
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        cascade_comments_tracker_fks(self.conn)
        self.conn.commit()
        self.conn.execute("DELETE FROM comments WHERE id = 'c_old'")
        self.conn.commit()
        leftover = self.conn.execute("SELECT COUNT(*) AS n FROM tracked_threads").fetchone()
        self.assertEqual(int(leftover["n"]), 0)
