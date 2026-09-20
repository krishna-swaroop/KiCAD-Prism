"""TR-01: comments identity, revisions and tombstone persistence (F1, F8).

The PostgreSQL cases run the production store SQL against a disposable
schema in ``TEST_POSTGRES_URL`` and are skipped without it; that skip is an
unmet gate, not a pass. The projection cases need no database.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_revisions, comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import Editor, RevisionConflict  # noqa: E402
from app.services.comments_store_service import (  # noqa: E402
    COMMENTS_META,
    CommentsStoreService,
    _row_to_comment_dict,
    _row_to_reply_dict,
)

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - psycopg is part of the runtime lock
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def _identity(url: str):
    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL and APPLICATION_POSTGRES_URL and _identity(POSTGRES_URL) == _identity(APPLICATION_POSTGRES_URL)
)

PRIYA = Editor(user_id="u_priya", kind="user", display="Priya Raman")
ALEX1 = Editor(user_id="u_1", kind="user", display="Alex Chen")
ALEX2 = Editor(user_id="u_2", kind="user", display="Alex Chen")
ADMIN = Editor(user_id="u_admin", kind="user", display="Admin")


class ProjectionTests(unittest.TestCase):
    def test_legacy_row_projects_as_unowned_and_unpinned(self) -> None:  # F1.legacy_display_name_author
        row = {
            "id": "c_1", "author": "swaroop", "timestamp": "2026-07-18T00:00:00Z", "status": "OPEN",
            "context": "PCB", "location_x": 0, "location_y": 0, "location_layer": "", "location_page": "",
            "content": "legacy", "comment_class": "general", "severity": "info", "mentions": [],
        }
        comment = _row_to_comment_dict(row, [])
        self.assertEqual((comment["authorUserId"], comment["authorKind"], comment["revision"]), (None, "legacy", 1))
        self.assertEqual(comment["updatedAt"], comment["timestamp"])
        self.assertEqual(comment["anchor"]["state"], "unpinned")
        self.assertIsNone(comment["anchor"]["commit"])
        self.assertNotIn("deletedAt", comment)

    def test_reply_projection_exposes_its_id(self) -> None:
        reply = _row_to_reply_dict({
            "id": "r_1", "author": "Arjun", "timestamp": "2026-07-18T00:00:00Z", "content": "ok",
            "author_user_id": "u_7f2a", "author_kind": "user", "revision": 2, "updated_at": "2026-07-19T00:00:00Z",
            "deleted_at": None, "origin": "prism",
        })
        self.assertEqual(reply["id"], "r_1")
        self.assertEqual((reply["authorUserId"], reply["revision"], reply["origin"]), ("u_7f2a", 2, "prism"))

    def test_export_format_is_additive_1_1(self) -> None:  # F2.export_v1_1_and_import_v1_0
        self.assertEqual(COMMENTS_META["version"], "1.1")

    def test_migration_registry_is_ordered_and_unique(self) -> None:
        versions = [version for version, _, _ in comments_schema_migrations.MIGRATIONS]
        self.assertEqual(versions, sorted(versions))
        self.assertEqual(len(versions), len(set(versions)))


class DisposableSchemaStore(CommentsStoreService):
    """The production store, pointed at a throwaway schema in the test database."""

    def __init__(self, schema: str) -> None:
        super().__init__()
        self.schema = schema

    @contextmanager
    def _connect(self):
        dsn = POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)
        with psycopg.connect(dsn, row_factory=dict_row) as conn:
            conn.execute(f'SET search_path TO "{self.schema}", public')
            yield conn


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for comments persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for comments persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class CommentsPersistencePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"comments_tr01_{uuid.uuid4().hex[:12]}"
        self.store = DisposableSchemaStore(self.schema)
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.project_path = self.tempdir.name
        self.project_id = "prj_test"
        self.addCleanup(self._drop_schema)

    def _drop_schema(self) -> None:
        with self.store._connect() as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            conn.commit()

    def _raw(self, sql, params=()):
        with self.store._connect() as conn:
            return conn.execute(sql, params).fetchall()

    def _create_legacy_schema_with_rows(self) -> None:
        """A database as it looked before TR-01: base tables, no identity columns."""
        with self.store._connect() as conn:
            conn.execute(f'CREATE SCHEMA "{self.schema}"')
            conn.execute(f'SET search_path TO "{self.schema}", public')
            conn.execute(
                """
                CREATE TABLE comments (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, author TEXT NOT NULL,
                    timestamp TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, context TEXT NOT NULL,
                    location_x REAL NOT NULL, location_y REAL NOT NULL,
                    location_layer TEXT NOT NULL DEFAULT '', location_page TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL
                );
                CREATE TABLE comment_replies (
                    id TEXT PRIMARY KEY, comment_id TEXT NOT NULL, project_id TEXT NOT NULL,
                    author TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL, content TEXT NOT NULL,
                    FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE
                );
                CREATE TABLE project_comment_state (
                    project_id TEXT PRIMARY KEY, imported_from_json BOOLEAN NOT NULL DEFAULT FALSE,
                    imported_at TIMESTAMPTZ, last_exported_at TIMESTAMPTZ, last_export_commit TEXT
                );
                INSERT INTO project_comment_state(project_id, imported_from_json) VALUES ('prj_test', TRUE);
                INSERT INTO comments VALUES
                    ('c_old', 'prj_test', 'Alex Chen', '2026-01-01T00:00:00Z', 'OPEN', 'PCB', 1, 2, 'F.Cu', '', 'old root');
                INSERT INTO comment_replies VALUES
                    ('r_old', 'c_old', 'prj_test', 'swaroop', '2026-01-02T00:00:00Z', 'old reply');
                """
            )
            conn.commit()

    def test_existing_database_upgrades_twice_without_data_loss(self) -> None:  # acceptance 1
        self._create_legacy_schema_with_rows()
        self.store.initialize()
        self.store._initialized = False
        self.store.initialize()  # second start: ledger says nothing to do

        ledger = self._raw("SELECT version FROM comment_schema_migrations ORDER BY version")
        self.assertEqual([row["version"] for row in ledger], [1, 2, 3, 4, 5, 6])

        snapshot = self.store.get_comments_file(self.project_id, self.project_path)
        self.assertEqual(snapshot["meta"]["version"], "1.1")
        [root] = snapshot["comments"]
        self.assertEqual((root["id"], root["author"], root["authorKind"], root["authorUserId"]), ("c_old", "Alex Chen", "legacy", None))
        self.assertEqual(root["updatedAt"], root["timestamp"])
        self.assertEqual(root["anchor"]["state"], "unpinned")
        [reply] = root["replies"]
        self.assertEqual((reply["id"], reply["author"], reply["authorKind"]), ("r_old", "swaroop", "legacy"))
        history = self.store.get_history(self.project_id, comments_revisions.ROOT, "c_old")
        self.assertEqual([h["changeKind"] for h in history], ["create"])
        self.assertEqual(history[0]["content"], "old root")

        snapshot = self.store.get_comments_file(self.project_id, self.project_path)
        self.assertEqual(snapshot["meta"]["version"], "1.1")
        [root] = snapshot["comments"]
        self.assertEqual((root["id"], root["author"], root["authorKind"], root["authorUserId"]), ("c_old", "Alex Chen", "legacy", None))
        self.assertEqual(root["updatedAt"], root["timestamp"])
        self.assertEqual(root["anchor"]["state"], "unpinned")
        [reply] = root["replies"]
        self.assertEqual((reply["id"], reply["author"], reply["authorKind"]), ("r_old", "swaroop", "legacy"))

    def test_reply_ids_are_stable_across_reads_restart_and_export(self) -> None:  # acceptance 1
        self.store.initialize()
        root = self.store.create_comment(
            self.project_id, self.project_path, "PCB", {"x": 1, "y": 2, "layer": "F.Cu"}, "root",
            author="Priya Raman", author_user_id="u_priya",
        )
        _, reply = self.store.add_reply(self.project_id, self.project_path, root["id"], "first", "Arjun", author_user_id="u_7f2a")
        self.assertTrue(reply["id"].startswith("r_"))

        again = self.store.get_comments_file(self.project_id, self.project_path)
        self.assertEqual(again["comments"][0]["replies"][0]["id"], reply["id"])

        restarted = DisposableSchemaStore(self.schema)
        restarted.initialize()
        self.assertEqual(restarted.get_comments_file(self.project_id, self.project_path)["comments"][0]["replies"][0]["id"], reply["id"])

        path = self.store.export_comments_json(self.project_id, self.project_path)
        exported = json.loads(Path(path).read_text())
        self.assertEqual(exported["meta"]["version"], "1.1")
        self.assertEqual(exported["comments"][0]["replies"][0]["id"], reply["id"])
        self.assertEqual(exported["comments"][0]["authorUserId"], "u_priya")

    def test_duplicate_display_names_never_grant_ownership(self) -> None:  # acceptance 2, F1.duplicate_display_names
        self.store.initialize()
        root = self.store.create_comment(
            self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "mine", author="Alex Chen", author_user_id="u_1",
        )
        self.assertEqual((root["authorUserId"], root["authorKind"]), ("u_1", "user"))
        # The store records who edited; the permission layer (TR-02) compares
        # author_user_id, and the persisted key is what it compares against.
        rows = self._raw("SELECT author, author_user_id FROM comments WHERE id = %s", (root["id"],))
        self.assertEqual(rows[0], {"author": "Alex Chen", "author_user_id": "u_1"})
        legacy = self.store.create_comment(self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "old", author="Alex Chen")
        self.assertEqual((legacy["authorUserId"], legacy["authorKind"]), (None, "legacy"))

    def test_edits_advance_revision_and_append_history(self) -> None:  # F8 analogue, C1
        self.store.initialize()
        root = self.store.create_comment(
            self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "v1", author="Priya Raman",
            author_user_id="u_priya", severity="major",
        )
        edited = self.store.edit_comment(self.project_id, self.project_path, root["id"], PRIYA, expected_revision=1, content="v2", severity="critical")
        self.assertEqual((edited["revision"], edited["content"], edited["severity"]), (2, "v2", "critical"))
        self.assertNotEqual(edited["updatedAt"], edited["timestamp"])

        resolved = self.store.update_comment_status(self.project_id, self.project_path, root["id"], "RESOLVED", editor=ADMIN, expected_revision=2)
        self.assertEqual((resolved["revision"], resolved["status"]), (3, "RESOLVED"))

        history = self.store.get_history(self.project_id, comments_revisions.ROOT, root["id"])
        self.assertEqual([(h["revision"], h["changeKind"], h["editorUserId"]) for h in history],
                         [(1, "create", "u_priya"), (2, "edit", "u_priya"), (3, "status", "u_admin")])
        self.assertEqual(history[2]["status"], "RESOLVED")

    def test_stale_revision_is_a_conflict_that_writes_nothing(self) -> None:  # F2.stale_revision_conflict
        self.store.initialize()
        root = self.store.create_comment(self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "v1", author="P", author_user_id="u_priya")
        self.store.edit_comment(self.project_id, self.project_path, root["id"], PRIYA, expected_revision=1, content="v2")
        with self.assertRaises(RevisionConflict) as ctx:
            self.store.edit_comment(self.project_id, self.project_path, root["id"], PRIYA, expected_revision=1, content="v3-stale")
        self.assertEqual(ctx.exception.current_revision, 2)
        current = self.store.get_comments_file(self.project_id, self.project_path)["comments"][0]
        self.assertEqual((current["content"], current["revision"]), ("v2", 2))
        self.assertEqual(len(self.store.get_history(self.project_id, comments_revisions.ROOT, root["id"])), 2)

    def test_rollback_leaves_no_partial_revision_or_tombstone(self) -> None:  # acceptance 3
        self.store.initialize()
        root = self.store.create_comment(self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "v1", author="P", author_user_id="u_priya")
        _, reply = self.store.add_reply(self.project_id, self.project_path, root["id"], "r", "A", author_user_id="u_7f2a")

        # Simulate a caller whose transaction fails after the tombstone helpers ran.
        with self.store._connect() as conn:
            with self.assertRaises(RuntimeError):
                with conn.transaction():
                    comments_revisions.tombstone_root(conn, project_id=self.project_id, comment_id=root["id"], editor=PRIYA, expected_revision=1)
                    raise RuntimeError("caller failed after the tombstone")

        live = self.store.get_comments_file(self.project_id, self.project_path)["comments"]
        self.assertEqual([c["id"] for c in live], [root["id"]])
        self.assertEqual([r["id"] for r in live[0]["replies"]], [reply["id"]])
        self.assertEqual(live[0]["revision"], 1)
        rows = self._raw("SELECT change_kind FROM comment_revisions WHERE change_kind = 'delete'")
        self.assertEqual(rows, [])

    def test_delete_is_a_tombstone_that_cascades_and_keeps_history(self) -> None:  # F8.local_root_deleted analogue
        self.store.initialize()
        root = self.store.create_comment(self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "v1", author="P", author_user_id="u_priya")
        _, reply = self.store.add_reply(self.project_id, self.project_path, root["id"], "r", "A", author_user_id="u_7f2a")

        self.assertTrue(self.store.delete_comment(self.project_id, self.project_path, root["id"], editor=PRIYA, expected_revision=1))
        self.assertFalse(self.store.delete_comment(self.project_id, self.project_path, root["id"], editor=PRIYA))
        self.assertEqual(self.store.get_comments_file(self.project_id, self.project_path)["comments"], [])
        self.assertIsNone(self.store.get_reply(self.project_id, root["id"], reply["id"]))

        rows = self._raw("SELECT id, deleted_at IS NOT NULL AS gone, deleted_by FROM comments")
        self.assertEqual(rows, [{"id": root["id"], "gone": True, "deleted_by": "u_priya"}])
        rows = self._raw("SELECT deleted_at IS NOT NULL AS gone FROM comment_replies WHERE id = %s", (reply["id"],))
        self.assertEqual(rows, [{"gone": True}])
        kinds = [h["changeKind"] for h in self.store.get_history(self.project_id, comments_revisions.REPLY, reply["id"])]
        self.assertEqual(kinds, ["create", "delete"])

    def test_legacy_first_edit_preserves_original_content(self) -> None:
        self._create_legacy_schema_with_rows()
        self.store.initialize()
        self.store.edit_comment(
            self.project_id, self.project_path, "c_old", ADMIN, expected_revision=1, content="replacement",
        )
        hist = self.store.get_history(self.project_id, comments_revisions.ROOT, "c_old")
        self.assertIn("old root", [entry["content"] for entry in hist])
        self.assertEqual([(h["revision"], h["changeKind"]) for h in hist], [(1, "create"), (2, "edit")])
        self.assertEqual(hist[1]["content"], "replacement")

    def test_add_reply_after_tombstone_is_rejected(self) -> None:
        self.store.initialize()
        root = self.store.create_comment(
            self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "root",
            author="Author", author_user_id="u1",
        )
        self.assertTrue(self.store.delete_comment(self.project_id, self.project_path, root["id"], editor=PRIYA, expected_revision=1))
        self.assertIsNone(self.store.add_reply(self.project_id, self.project_path, root["id"], "late", "Author", author_user_id="u1"))
        rows = self._raw("SELECT id FROM comment_replies WHERE comment_id = %s AND deleted_at IS NULL", (root["id"],))
        self.assertEqual(rows, [])

    def test_concurrent_reply_and_tombstone_leaves_no_live_reply(self) -> None:
        import threading

        self.store.initialize()
        root = self.store.create_comment(
            self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "root",
            author="Author", author_user_id="u1",
        )
        errors: list[str] = []

        def writer():
            try:
                self.store.add_reply(
                    self.project_id, self.project_path, root["id"], "late reply", "Author", author_user_id="u1",
                )
            except Exception as exc:  # pragma: no cover - serialized outcomes should not error
                errors.append(type(exc).__name__)

        def deleter():
            try:
                self.store.delete_comment(self.project_id, self.project_path, root["id"], editor=PRIYA)
            except Exception as exc:  # pragma: no cover
                errors.append(type(exc).__name__)

        threads = [threading.Thread(target=writer), threading.Thread(target=deleter)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(10)
            self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        live = self._raw(
            "SELECT id FROM comment_replies WHERE comment_id = %s AND deleted_at IS NULL",
            (root["id"],),
        )
        self.assertEqual(live, [])

    def test_reply_edit_and_delete_are_id_addressed_and_version_checked(self) -> None:  # F8.local_reply_edit/_delete
        self.store.initialize()
        root = self.store.create_comment(self.project_id, self.project_path, "PCB", {"x": 0, "y": 0}, "v1", author="P", author_user_id="u_priya")
        _, reply = self.store.add_reply(self.project_id, self.project_path, root["id"], "first", "Arjun", author_user_id="u_7f2a")
        arjun = Editor(user_id="u_7f2a", kind="user", display="Arjun")

        updated = self.store.edit_reply(self.project_id, self.project_path, root["id"], reply["id"], "first (edited)", arjun, expected_revision=1)
        [projected] = updated["replies"]
        self.assertEqual((projected["content"], projected["revision"]), ("first (edited)", 2))
        with self.assertRaises(RevisionConflict):
            self.store.edit_reply(self.project_id, self.project_path, root["id"], reply["id"], "stale", arjun, expected_revision=1)
        self.assertIsNone(self.store.edit_reply(self.project_id, self.project_path, root["id"], "r_missing", "x", arjun, expected_revision=None))

        after_delete = self.store.delete_reply(self.project_id, self.project_path, root["id"], reply["id"], arjun, expected_revision=2)
        self.assertEqual(after_delete["replies"], [])
        self.assertEqual(after_delete["revision"], 1, "deleting a reply does not touch the root's revision")

    def test_legacy_json_import_yields_legacy_rows_with_stable_reply_ids(self) -> None:  # F2.export_v1_1_and_import_v1_0
        comments_dir = Path(self.project_path) / ".comments"
        comments_dir.mkdir()
        (comments_dir / "comments.json").write_text(json.dumps({
            "meta": {"version": "1.0"},
            "comments": [{
                "id": "c_file", "author": "swaroop", "timestamp": "2026-02-01T00:00:00Z", "status": "OPEN",
                "context": "SCH", "location": {"x": 1, "y": 1, "page": "root.kicad_sch"}, "content": "from file",
                "authorUserId": "u_forged",
                "replies": [{"id": "r_file", "author": "Mira", "timestamp": "2026-02-02T00:00:00Z", "content": "reply from file"}],
            }],
        }))
        self.store.initialize()
        [root] = self.store.get_comments_file(self.project_id, self.project_path)["comments"]
        self.assertEqual((root["id"], root["authorKind"], root["authorUserId"]), ("c_file", "legacy", None))
        self.assertEqual(root["anchor"]["state"], "unpinned")
        self.assertEqual((root["replies"][0]["id"], root["replies"][0]["authorKind"]), ("r_file", "legacy"))

    def test_pooled_schema_switch_survives_initialize(self) -> None:  # acceptance 3, schema switching
        self.store.initialize()
        with self.store._connect() as conn:
            row = conn.execute("SHOW search_path").fetchone()
            self.assertEqual(next(iter(row.values())), f'{self.schema}, public')


if __name__ == "__main__":
    unittest.main()
