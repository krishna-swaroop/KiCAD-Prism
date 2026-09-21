"""TR-33: sweep linked issues and replies for missing changes (F7, F8)."""

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
from app.services.comments_revisions import history  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    GoneConfirmed,
    NotModified,
    PageCursor,
    RemoteComment,
    RemoteIssue,
    RemoteVersion,
    UncertainAbsence,
    ForbiddenRead,
)
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.inbox_store import apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.sweeper import (  # noqa: E402
    DELETION_CONFIRM_SECONDS,
    scope_key,
    sweep_destination_links,
)
from app.services.trackers.store import TrackerStore  # noqa: E402
from test_tracker_tr_28 import (  # noqa: E402
    BOT_ID,
    BOT_LOGIN,
    COMMENT_ID,
    CONNECTOR,
    CONTAINER,
    EXT_COMMENT,
    ISSUE,
    ISSUE_ID,
    ISSUE_NUMBER,
    REPLY_ID,
    _forge_user,
    _remote_comment,
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


class FixtureContractTests(unittest.TestCase):
    def test_tr33_fixture_cases_present(self) -> None:
        f7_ids = {case["id"] for case in F7["cases"]}
        for case_id in (
            "F7.conditional_304",
            "F7.unauthorized_401",
            "F7.private_404",
            "F7.deleted_after_two_listings",
            "F7.gone_410",
            "F7.throttling",
            "F7.lost_then_recovered_access",
        ):
            self.assertIn(case_id, f7_ids)
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.remote_reply_delete", f8_ids)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class SweepPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr33_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
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
        self.conn.commit()
        self.issue_reads: dict[tuple[str, str | None], object] = {}
        self.comment_pages: list[tuple[list[RemoteComment], PageCursor | None]] = []
        self.comment_reads: dict[str, object] = {}

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
                content TEXT NOT NULL DEFAULT ''
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

    def _seed_thread(
        self,
        *,
        thread_id: str = "tt_a",
        link_state: str = "linked",
        remote_version: dict | None = None,
        lineage: list | None = None,
    ) -> None:
        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id=CONTAINER,
            generation=2,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s, %s, %s, %s)",
            (COMMENT_ID, "prj_a", "Priya", "root content"),
        )
        self.store.insert_thread(
            thread_id=thread_id,
            comment_id=COMMENT_ID,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=ISSUE_ID,
            external_number=ISSUE_NUMBER,
            external_url=f"https://github.com/acme/openswitch/issues/{ISSUE_NUMBER}",
            link_state=link_state,
            lineage=lineage or [],
        )
        if remote_version is not None:
            self.conn.execute(
                "UPDATE tracked_threads SET remote_version = %s::jsonb WHERE id = %s",
                (json.dumps(remote_version), thread_id),
            )

    def _seed_reply(self, *, thread_id: str = "tt_a", body: str = "mirrored reply") -> None:
        self.conn.execute(
            """
            INSERT INTO comment_replies (
                id, comment_id, project_id, author, author_kind, origin, content, revision
            ) VALUES (%s, %s, %s, %s, 'user', 'prism', %s, 1)
            """,
            (REPLY_ID, COMMENT_ID, "prj_a", "Priya", body),
        )
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=thread_id,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
            remote_author_id=BOT_ID,
            remote_author_login=BOT_LOGIN,
        )

    def _queue_comment_pages(self, pages: list[tuple[list[RemoteComment], PageCursor | None]]) -> None:
        self.comment_pages = list(pages)

    def _get_issue(self, _dest, issue: str, etag: str | None):
        key = (issue, etag)
        if key in self.issue_reads:
            return self.issue_reads[key]
        fallback = self.issue_reads.get((issue, None))
        if fallback is not None:
            return fallback
        return _remote_issue(body="issue body")

    def _list_comments(self, _dest, _issue, cursor: PageCursor | None):
        if not self.comment_pages:
            return [], PageCursor(value="", exhausted=True)
        page, next_cursor = self.comment_pages.pop(0)
        return page, next_cursor

    def _get_comment(self, _dest, ext_id: str, _etag: str | None):
        if ext_id in self.comment_reads:
            return self.comment_reads[ext_id]
        return GoneConfirmed()

    def _sweep(self, **kwargs):
        return sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path="acme/openswitch",
            get_issue=self._get_issue,
            list_comments=self._list_comments,
            get_comment=self._get_comment,
            **kwargs,
        )

    def _thread(self, thread_id: str = "tt_a") -> dict:
        row = self.conn.execute(
            "SELECT * FROM tracked_threads WHERE id = %s", (thread_id,)
        ).fetchone()
        return dict(row)

    def _checkpoint(self) -> dict:
        row = self.conn.execute(
            "SELECT * FROM sync_checkpoints WHERE kind = 'sweep' AND scope_key = %s",
            (scope_key(CONNECTOR, CONTAINER),),
        ).fetchone()
        return dict(row) if row else {}

    def test_f7_conditional_304_still_enumerates_replies(self) -> None:
        self._seed_thread(remote_version={"etag": "issue-etag", "updatedAt": "2026-09-20T16:00:00Z"})
        self._seed_reply()
        self.conn.commit()
        self.issue_reads[(ISSUE, "issue-etag")] = NotModified(etag="issue-etag")
        self._queue_comment_pages(
            [
                (
                    [_remote_comment(body="still here")],
                    PageCursor(value="", exhausted=True),
                )
            ]
        )
        outcome = self._sweep()
        self.conn.commit()
        self.assertTrue(outcome.complete)
        self.assertEqual(outcome.threads_checked, 1)
        self.assertEqual(outcome.replies_checked, 1)
        self.assertEqual(outcome.replies_tombstoned, 0)
        self.assertIsNotNone(self._thread()["last_verified_at"])

    def test_sweep_hands_forge_comments_to_the_inbox_for_polling_only_import(self) -> None:
        """TR-46: with webhooks absent, a reply made on the forge must still reach Prism.

        The sweep already lists every remote comment; each one becomes a poll-style
        comment hint (deduped by comment id + version) for the inbound reducer.
        """

        self._seed_thread()
        self.conn.commit()
        comment = _remote_comment(body="reply typed on GitHub").model_copy(
            update={"externalCommentId": "ext_new_1"}
        )
        self._queue_comment_pages([([comment], PageCursor(value="", exhausted=True))])
        outcome = self._sweep()
        self.conn.commit()
        self.assertTrue(outcome.complete)
        self.assertEqual(outcome.reply_hints_enqueued, 1)
        hint = self.conn.execute(
            "SELECT * FROM remote_hints WHERE external_comment_id = 'ext_new_1'"
        ).fetchone()
        self.assertIsNotNone(hint)
        self.assertEqual(hint["object_kind"], "comment")
        self.assertEqual(hint["external_id"], self._thread()["external_id"])
        self.assertEqual(hint["state"], "pending")

        # Same comment, same version: the next sweep is a no-op for the inbox.
        self._queue_comment_pages([([comment], PageCursor(value="", exhausted=True))])
        self.conn.execute("UPDATE sync_checkpoints SET next_run_at = NOW() WHERE kind = 'sweep'")
        self.conn.commit()
        outcome = self._sweep()
        self.conn.commit()
        self.assertEqual(outcome.reply_hints_enqueued, 0)
        count = self.conn.execute(
            "SELECT COUNT(*) AS n FROM remote_hints WHERE external_comment_id = 'ext_new_1'"
        ).fetchone()["n"]
        self.assertEqual(count, 1)

    def test_f8_remote_reply_delete_tombstones_after_complete_listing(self) -> None:
        self._seed_thread()
        self._seed_reply()
        self.conn.commit()
        self._queue_comment_pages([( [], PageCursor(value="", exhausted=True) )])
        self.comment_reads[EXT_COMMENT] = GoneConfirmed()
        outcome = self._sweep()
        self.conn.commit()
        self.assertEqual(outcome.replies_tombstoned, 1)
        row = self.conn.execute(
            "SELECT deleted_at FROM comment_replies WHERE id = %s", (REPLY_ID,)
        ).fetchone()
        self.assertIsNotNone(row["deleted_at"])
        revisions = history(self.conn, project_id="prj_a", target_kind="reply", target_id=REPLY_ID)
        tombstones = [row for row in revisions if row["changeKind"] == "delete"]
        self.assertEqual(len(tombstones), 1)
        self.assertEqual(tombstones[0]["editorKind"], "remote_unknown")

    def test_f7_private_404_marks_inaccessible_not_deleted(self) -> None:
        self._seed_thread(link_state="linked")
        self.conn.commit()
        self.issue_reads[(ISSUE, None)] = UncertainAbsence(status=404)
        outcome = self._sweep()
        self.conn.commit()
        thread = self._thread()
        self.assertEqual(thread["link_state"], "inaccessible")
        self.assertEqual(outcome.issues_marked_deleted, 0)
        self.assertEqual(outcome.replies_checked, 0)

    def test_f7_gone_410_marks_deleted_immediately(self) -> None:
        self._seed_thread()
        self.conn.commit()
        self.issue_reads[(ISSUE, None)] = GoneConfirmed(status=410)
        outcome = self._sweep()
        self.conn.commit()
        self.assertEqual(self._thread()["link_state"], "deleted")
        self.assertEqual(outcome.issues_marked_deleted, 1)

    def test_f7_deleted_after_two_listings_requires_gap(self) -> None:
        self._seed_thread()
        self.conn.commit()
        self.issue_reads[(ISSUE, None)] = UncertainAbsence(status=404)
        first = self._sweep(now=__import__("datetime").datetime(2026, 9, 20, 16, 0, tzinfo=__import__("datetime").timezone.utc))
        self.conn.commit()
        self.assertEqual(self._thread()["link_state"], "inaccessible")
        second = self._sweep(
            now=__import__("datetime").datetime(
                2026, 9, 20, 16, 0, tzinfo=__import__("datetime").timezone.utc
            )
            + __import__("datetime").timedelta(seconds=DELETION_CONFIRM_SECONDS)
        )
        self.conn.commit()
        self.assertEqual(second.issues_marked_deleted, 1)
        self.assertEqual(self._thread()["link_state"], "deleted")

    def test_f7_unauthorized_401_pauses_connector_and_marks_inaccessible(self) -> None:
        self._seed_thread()
        self.conn.commit()

        def _auth_lost(*_args, **_kwargs):
            raise ProviderError("auth_lost", "installation revoked", status=401)

        outcome = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path="acme/openswitch",
            get_issue=_auth_lost,
            list_comments=self._list_comments,
            get_comment=self._get_comment,
        )
        self.conn.commit()
        self.assertIsNotNone(outcome.error)
        connector = self.conn.execute(
            "SELECT paused, paused_reason FROM tracker_connectors WHERE id = %s",
            (CONNECTOR,),
        ).fetchone()
        self.assertTrue(connector["paused"])
        self.assertEqual(connector["paused_reason"], "auth_lost")
        self.assertEqual(self._thread()["link_state"], "inaccessible")

    def test_f7_throttling_preserves_link_state(self) -> None:
        self._seed_thread(link_state="linked")
        self.conn.commit()

        def _limited(*_args, **_kwargs):
            raise ProviderError(
                "rate_limited",
                "secondary limit",
                resume_at="2026-09-20T17:00:00Z",
                retryable=False,
            )

        outcome = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path="acme/openswitch",
            get_issue=_limited,
            list_comments=self._list_comments,
            get_comment=self._get_comment,
        )
        self.conn.commit()
        self.assertFalse(outcome.complete)
        self.assertEqual(self._thread()["link_state"], "linked")
        checkpoint = self._checkpoint()
        self.assertIsNotNone(checkpoint.get("next_run_at"))
        self.assertIn("rate_limited", json.dumps(checkpoint.get("last_error") or {}))

    def test_f7_lost_then_recovered_access_restores_linked(self) -> None:
        self._seed_thread(link_state="linked", remote_version={"etag": "etag-1"})
        self.conn.commit()
        self.issue_reads[(ISSUE, "etag-1")] = ForbiddenRead(status=403)
        self._sweep()
        self.conn.commit()
        self.assertEqual(self._thread()["link_state"], "inaccessible")

        self.issue_reads[(ISSUE, "etag-1")] = _remote_issue(body="back again")
        recovered = self._sweep()
        self.conn.commit()
        self.assertEqual(recovered.issues_recovered, 1)
        self.assertEqual(self._thread()["link_state"], "linked")

    def test_partial_comment_page_never_tombstones_reply(self) -> None:
        self._seed_thread()
        self._seed_reply()
        self.conn.commit()
        self._queue_comment_pages(
            [
                (
                    [_remote_comment(body="page 1")],
                    PageCursor(value="page-2", exhausted=False),
                ),
            ]
        )

        def _failing_list(_dest, _issue, cursor: PageCursor | None):
            if cursor and cursor.value == "page-2":
                raise ProviderError("transient", "page 2 failed")
            return self._list_comments(_dest, _issue, cursor)

        first = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path="acme/openswitch",
            get_issue=self._get_issue,
            list_comments=_failing_list,
            get_comment=self._get_comment,
        )
        self.conn.commit()
        self.assertFalse(first.complete)
        self.assertEqual(first.replies_tombstoned, 0)
        self.assertEqual(first.error.get("class"), "transient")
        row = self.conn.execute(
            "SELECT deleted_at FROM comment_replies WHERE id = %s", (REPLY_ID,)
        ).fetchone()
        self.assertIsNone(row["deleted_at"])
        checkpoint = self._checkpoint()
        self.assertIn("transient", json.dumps(checkpoint.get("last_error") or {}))

    def test_private_comment_404_does_not_delete_reply(self) -> None:
        self._seed_thread()
        self._seed_reply()
        self.conn.commit()
        self._queue_comment_pages([( [], PageCursor(value="", exhausted=True) )])
        self.comment_reads[EXT_COMMENT] = ForbiddenRead(status=403)
        outcome = self._sweep()
        self.conn.commit()
        self.assertEqual(outcome.replies_tombstoned, 0)
        row = self.conn.execute(
            "SELECT deleted_at FROM comment_replies WHERE id = %s", (REPLY_ID,)
        ).fetchone()
        self.assertIsNone(row["deleted_at"])


if __name__ == "__main__":
    unittest.main()
