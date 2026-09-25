"""TR-12: connector, identity, policy and link storage (F1, F3, F4, F8)."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.schema import FORBIDDEN_COLUMNS, WORKSPACE_TABLES  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.workspace_schema_migrations import MIGRATIONS as WS_MIGRATIONS  # noqa: E402
from app.services.trackers.migrations import (  # noqa: E402
    WORKSPACE_FK_CASCADE_NAME,
    WORKSPACE_FK_CASCADE_VERSION,
    WORKSPACE_MIGRATION_NAME,
    WORKSPACE_MIGRATION_VERSION,
    WORKSPACE_WEBHOOK_OAUTH_NAME,
    WORKSPACE_WEBHOOK_OAUTH_VERSION,
    migrate_comments_tracked_links,
    migrate_workspace_tracker_tables,
)

try:
    import psycopg
    from psycopg.errors import UniqueViolation
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    UniqueViolation = Exception  # type: ignore[misc, assignment]
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


class RegistryTests(unittest.TestCase):
    def test_workspace_23_is_registered_once_after_22(self) -> None:
        versions = [version for version, _, _ in WS_MIGRATIONS]
        names = {version: name for version, name, _ in WS_MIGRATIONS}
        self.assertEqual(versions, sorted(versions))
        self.assertEqual(len(versions), len(set(versions)))
        self.assertIn(WORKSPACE_MIGRATION_VERSION, versions)
        self.assertEqual(names[WORKSPACE_MIGRATION_VERSION], WORKSPACE_MIGRATION_NAME)
        self.assertEqual(max(versions), WORKSPACE_WEBHOOK_OAUTH_VERSION)
        self.assertIn(WORKSPACE_FK_CASCADE_VERSION, versions)
        self.assertEqual(names[WORKSPACE_FK_CASCADE_VERSION], WORKSPACE_FK_CASCADE_NAME)
        self.assertEqual(WS_MIGRATIONS[-1][0], WORKSPACE_WEBHOOK_OAUTH_VERSION)
        self.assertEqual(WS_MIGRATIONS[-1][1], WORKSPACE_WEBHOOK_OAUTH_NAME)

    def test_comments_migration_3_is_tracked_links(self) -> None:
        versions = [version for version, name, _ in comments_schema_migrations.MIGRATIONS]
        self.assertIn(3, versions)
        names = {name for _, name, _ in comments_schema_migrations.MIGRATIONS}
        self.assertIn("tracked_threads_and_replies", names)
        self.assertIn(4, versions)
        self.assertIn("sync_ops_inbox_and_delete_cascade", names)
        self.assertIn(5, versions)
        self.assertIn("tracked_threads_external_number", names)
        self.assertIn(7, versions)
        self.assertIn("tracked_threads_container_path", names)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class TrackerStoragePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr12_{uuid.uuid4().hex[:12]}"
        dsn = POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)
        self.conn = psycopg.connect(dsn, row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        self.conn.commit()
        self.store = TrackerStore(self.conn)

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

    def test_restart_is_idempotent_and_keeps_forge_projection_columns(self) -> None:
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
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
        for name in WORKSPACE_TABLES:
            self.assertIn(name, tables)
        self.assertIn("tracked_threads", tables)
        columns = {
            row["column_name"]
            for row in self.conn.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s AND table_name = 'comments'
                """,
                (self.schema,),
            ).fetchall()
        }
        self.assertGreaterEqual(
            columns,
            {"forge_provider", "forge_issue_id", "forge_issue_url", "forge_sync_state"},
        )
        tracker_cols = {
            row["column_name"]
            for row in self.conn.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s
                """,
                (self.schema,),
            ).fetchall()
        }
        self.assertFalse(tracker_cols & FORBIDDEN_COLUMNS)

    def test_same_issue_number_on_different_containers_is_distinct(self) -> None:
        self.store.upsert_connector(
            connector_id="cn_gh1",
            provider="github",
            instance_kind="github.com",
            credential_envelope="envelope-ciphertext-fixture",
        )
        shown = self.store.get_connector("cn_gh1")
        self.assertTrue(shown["credentialConfigured"])
        self.assertNotIn("credential_envelope", shown)
        self.assertNotIn("envelope-ciphertext-fixture", str(shown))

        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id="cn_gh1",
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id="111",
            generation=1,
        )
        self.store.set_project_tracker(
            project_tracker_id="pt_b",
            project_id="prj_b",
            connector_id="cn_gh1",
            container_kind="repo",
            container_path="acme/hardware-issues",
            remote_container_id="222",
            generation=1,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s), (%s,%s,%s,%s)",
            ("c_a", "prj_a", "Priya", "a", "c_b", "prj_b", "Priya", "b"),
        )
        self.store.insert_thread(
            thread_id="tt_a",
            comment_id="c_a",
            project_tracker_id="pt_a",
            destination_generation=1,
            connector_id="cn_gh1",
            remote_container_id="111",
            external_id="412",
        )
        self.store.insert_thread(
            thread_id="tt_b",
            comment_id="c_b",
            project_tracker_id="pt_b",
            destination_generation=1,
            connector_id="cn_gh1",
            remote_container_id="222",
            external_id="412",
        )
        rows = self.conn.execute("SELECT id FROM tracked_threads ORDER BY id").fetchall()
        self.assertEqual([row["id"] for row in rows], ["tt_a", "tt_b"])

    def test_duplicate_live_link_and_identity_are_rejected(self) -> None:
        self.store.upsert_connector(
            connector_id="cn_gh1", provider="github", instance_kind="github.com"
        )
        self.store.link_identity(
            identity_id="id_1",
            user_id="u_1",
            connector_id="cn_gh1",
            provider="github",
            forge_user_id="5550001",
            forge_login="arjun-gh",
            token_envelope="token-envelope-fixture",
        )
        self.conn.commit()
        with self.assertRaises(UniqueViolation):
            self.store.link_identity(
                identity_id="id_2",
                user_id="u_1",
                connector_id="cn_gh1",
                provider="github",
                forge_user_id="999",
                forge_login="other",
            )
        self._restore_path()
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            ("c_1", "prj_a", "Priya", "x"),
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
        self.store.insert_thread(
            thread_id="tt_1",
            comment_id="c_1",
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id="cn_gh1",
            remote_container_id="111",
            external_id="412",
        )
        self.conn.commit()
        with self.assertRaises(UniqueViolation):
            self.store.insert_thread(
                thread_id="tt_dup",
                comment_id="c_1",
                project_tracker_id="pt_a",
                destination_generation=2,
                connector_id="cn_gh1",
                remote_container_id="111",
                external_id="999",
            )
        self._restore_path()
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            ("c_2", "prj_a", "Priya", "y"),
        )
        with self.assertRaises(UniqueViolation):
            self.store.insert_thread(
                thread_id="tt_same_issue",
                comment_id="c_2",
                project_tracker_id="pt_a",
                destination_generation=2,
                connector_id="cn_gh1",
                remote_container_id="111",
                external_id="412",
            )
        self._restore_path()

    def test_unlink_preserves_history_and_allows_repromotion_lineage(self) -> None:
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
            generation=1,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            ("c_1", "prj_a", "Priya", "x"),
        )
        self.conn.execute(
            """
            INSERT INTO comment_replies(id, comment_id, project_id, author, content)
            VALUES (%s,%s,%s,%s,%s)
            """,
            ("r_1", "c_1", "prj_a", "Arjun", "ok"),
        )
        self.store.insert_thread(
            thread_id="tt_old",
            comment_id="c_1",
            project_tracker_id="pt_a",
            destination_generation=1,
            connector_id="cn_gh1",
            remote_container_id="111",
            external_id="412",
            lineage=[{"opId": "op_1", "reason": "created"}],
        )
        self.store.insert_reply_link(
            link_id="tr_1",
            tracked_thread_id="tt_old",
            reply_id="r_1",
            external_comment_id="2211044",
            remote_author_login="arjun-gh",
        )
        unlinked = self.store.unlink_thread("tt_old", reason="local_root_deleted")
        self.assertIsNotNone(unlinked["unlinked_at"])
        self.assertEqual(unlinked["link_state"], "linked")
        self.assertTrue(unlinked["lineage"])
        promoted = self.store.insert_thread(
            thread_id="tt_new",
            comment_id="c_1",
            project_tracker_id="pt_a",
            destination_generation=1,
            connector_id="cn_gh1",
            remote_container_id="111",
            external_id="900",
            lineage=[{"opId": "op_2", "reason": "re-promote", "lineageOf": "op_1"}],
        )
        self.assertEqual(promoted["id"], "tt_new")
        remaining = self.conn.execute("SELECT id FROM tracked_threads ORDER BY id").fetchall()
        self.assertEqual([row["id"] for row in remaining], ["tt_new", "tt_old"])
        replies = self.conn.execute("SELECT id FROM tracked_replies").fetchall()
        self.assertEqual(replies[0]["id"], "tr_1")


if __name__ == "__main__":
    unittest.main()
