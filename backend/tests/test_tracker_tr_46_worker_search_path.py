"""TR-46: policy lookups must find workspace tables on the worker's real search path.

The worker connects with ``SET search_path TO comments, workspace, public``.
Taking the first entry resolved ``comments.project_trackers`` (absent) and
reported every configured destination as unconfigured, parking every outbound
op with ``forbidden``. Unit tests never saw it because the disposable schema
mirrors workspace tables into a single schema.
"""

from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.create_executor import _comment_dict_from_row, _encrypt_context  # noqa: E402
from app.services.trackers.connector_service import _context as connector_context  # noqa: E402
from app.services.trackers.drafts import board_name_from_comment, render_context_block_lines  # noqa: E402
from app.services.trackers.executor_support import workspace_schema  # noqa: E402
from app.services.trackers.promotion import load_policy_row  # noqa: E402
from tracker_fault_harness import POSTGRES_URL, SHARED_APPLICATION_DATABASE  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class WorkerSearchPathPolicyTests(unittest.TestCase):
    """Two real schemas, worker search_path order, workspace tables only in the second."""

    def setUp(self) -> None:
        tag = uuid.uuid4().hex[:10]
        self.comments_schema = f"c46_{tag}"
        self.workspace_schema = f"w46_{tag}"
        self.conn = psycopg.connect(POSTGRES_URL, row_factory=dict_row)
        self.conn.execute(f'CREATE SCHEMA "{self.comments_schema}"')
        self.conn.execute(f'CREATE SCHEMA "{self.workspace_schema}"')
        self.conn.execute(
            f"""
            CREATE TABLE "{self.workspace_schema}".tracker_connectors (
                id TEXT PRIMARY KEY, paused BOOLEAN NOT NULL DEFAULT FALSE, provider TEXT NOT NULL DEFAULT 'github'
            );
            CREATE TABLE "{self.workspace_schema}".project_trackers (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, connector_id TEXT NOT NULL,
                promote_min_role TEXT NOT NULL DEFAULT 'designer', visibility TEXT NOT NULL DEFAULT 'private'
            );
            INSERT INTO "{self.workspace_schema}".tracker_connectors (id) VALUES ('cn_a');
            INSERT INTO "{self.workspace_schema}".project_trackers (id, project_id, connector_id)
            VALUES ('pt_a', 'prj_a', 'cn_a');
            """
        )
        # The worker's order: comments first, workspace second.
        self.conn.execute(f'SET search_path TO "{self.comments_schema}", "{self.workspace_schema}", public')
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.rollback()
        self.conn.execute(f'DROP SCHEMA "{self.comments_schema}" CASCADE')
        self.conn.execute(f'DROP SCHEMA "{self.workspace_schema}" CASCADE')
        self.conn.commit()
        self.conn.close()

    def test_resolves_schema_that_holds_project_trackers(self) -> None:
        self.assertEqual(workspace_schema(self.conn), self.workspace_schema)

    def test_policy_row_is_found_on_worker_search_path(self) -> None:
        row = load_policy_row(self.conn, "prj_a", workspace_schema=workspace_schema(self.conn))
        self.assertIsNotNone(row, "configured destination must not read as unconfigured")
        self.assertEqual(row["connector_id"], "cn_a")
        self.assertEqual(row["connector_provider"], "github")

    def test_single_mirrored_schema_still_resolves(self) -> None:
        # Disposable test layout: everything in one schema, listed first.
        self.conn.execute(f'SET search_path TO "{self.workspace_schema}", public')
        self.assertEqual(workspace_schema(self.conn), self.workspace_schema)


if __name__ == "__main__":
    unittest.main()


class ExecutorRowMappingTests(unittest.TestCase):
    """Defects only visible with a real row: AAD context, board name, URL escaping."""

    def test_executor_decrypt_context_matches_admin_api(self) -> None:
        # The admin API wrote the envelope with {"record", "field"}; a bytes
        # context crashed decrypt_secret (`'bytes' object has no attribute 'items'`).
        self.assertEqual(_encrypt_context("cn_x"), connector_context("cn_x"))

    def test_board_name_comes_from_project_relative_path(self) -> None:
        row = {
            "id": "c_1",
            "anchor_state": "pinned",
            "anchor_source": "client",
            "anchor_commit": "0" * 40,
            "project_relative_path": "USB-PD-Trigger-Board.kicad_pro",
            "file_path": "USB-PD-Trigger-Board.kicad_sch",
        }
        comment = _comment_dict_from_row(row)
        self.assertEqual(board_name_from_comment(comment), "USB-PD-Trigger-Board")
        self.assertEqual(comment["anchor"]["source"], "client")

    def test_prism_url_is_not_html_escaped(self) -> None:
        url = "https://prism.example/projects/prj_a?commit=abc&view=sch&comment=c_1"
        lines = render_context_block_lines(
            comment={"context": "SCH", "location": {}, "anchor": {}},
            prism_url=url,
            requested_by="Requested by: someone",
            assignment_hints=[],
        )
        self.assertIn(f"Prism: {url}", lines)
        self.assertFalse(any("&amp;" in line for line in lines))


class StatusChangeEnqueuesSetStateTests(unittest.TestCase):
    """TR-46 live finding: PATCH status never handed the actor to the store,
    so a Prism resolve/reopen on a linked thread enqueued no ``set_state`` op
    and the forge issue stayed put."""

    def _run_patch(self, store, *, status="OPEN", role="admin"):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import patch

        from app.api import comments as comments_api
        from app.core.security import AuthenticatedUser

        user = AuthenticatedUser(email="a@x", name="Admin", role=role, session_id="sid", user_id="u_a")
        with patch.object(comments_api, "comments_store", store), \
                patch.object(comments_api, "get_project_for_role_or_404", return_value=SimpleNamespace(id="prj", path="")), \
                patch.object(comments_api, "_load_mention_indexes", return_value=comments_api._EMPTY_MENTION_INDEXES), \
                patch.object(comments_api, "_with_permissions", side_effect=lambda comment, *a, **k: comment):
            return asyncio.run(comments_api.update_comment(
                "prj", "c_1", comments_api.UpdateCommentRequest(status=status, expectedRevision=4), user,
            ))

    def test_status_patch_passes_promotion_actor(self) -> None:
        calls: list[dict] = []

        class Store:
            def get_comment(self, *_a, **_k):
                return {"id": "c_1", "status": "RESOLVED", "revision": 4, "replies": []}

            def update_comment_status(self, *_a, **kwargs):
                calls.append(kwargs)
                return {"id": "c_1", "status": "OPEN", "revision": 5, "replies": []}

        updated = self._run_patch(Store())
        self.assertEqual(updated["status"], "OPEN")
        self.assertEqual(len(calls), 1)
        actor = calls[0].get("promotion_actor")
        self.assertIsNotNone(actor, "status change must carry the actor so enqueue_set_state runs")
        self.assertEqual((actor.user_id, actor.role), ("u_a", "admin"))
        self.assertEqual(calls[0].get("expected_revision"), 4)

    def test_publication_denied_on_status_is_a_403_not_a_500(self) -> None:
        import json

        from fastapi.responses import JSONResponse

        from app.services.trackers.publication_policy import PublicationDenied

        class Store:
            def get_comment(self, *_a, **_k):
                return {"id": "c_1", "status": "RESOLVED", "revision": 4, "replies": []}

            def update_comment_status(self, *_a, **_k):
                raise PublicationDenied("status_role_required", "designer role required to move a linked thread")

        response = self._run_patch(Store(), role="designer")
        self.assertIsInstance(response, JSONResponse)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(json.loads(response.body)["code"], "status_role_required")


class SetStateReconciliationTests(unittest.TestCase):
    """TR-46 live findings on the first Prism reopen of a GitHub-closed issue."""

    def test_version_match_uses_updated_at_over_etag(self) -> None:
        # Two reads of an unchanged issue under different identities disagreed
        # on ETag alone, so every set_state preflight reported a mismatch.
        from app.services.trackers.state_mutations import versions_match

        stored = {"updatedAt": "2026-09-21T10:18:29Z", "etag": 'W/"a511"'}
        self.assertTrue(versions_match(stored, {"updatedAt": "2026-09-21T10:18:29Z", "etag": 'W/"89fb"'}))
        self.assertFalse(versions_match(stored, {"updatedAt": "2026-09-21T10:40:00Z", "etag": 'W/"a511"'}))
        # ETag is still the fallback when a side has no timestamp.
        self.assertTrue(versions_match({"etag": "W/1"}, {"etag": "W/1"}))
        self.assertFalse(versions_match({"etag": "W/1"}, {"etag": "W/2"}))
        self.assertFalse(versions_match({}, {"updatedAt": "x"}))

    def test_postflight_ignores_human_state_events_already_reflected(self) -> None:
        from app.services.trackers.contracts import ForgeUser, RemoteEvent
        from app.services.trackers.state_mutations import analyze_state_events

        def event(event_id, name, at, *, bot):
            return RemoteEvent(
                externalId="5525291464",
                eventId=event_id,
                event=name,
                createdAt=at,
                actor=ForgeUser(id="331962685" if bot else "38141608", login="bot[bot]" if bot else "human", isBot=bot),
            )

        # Human closed at 10:03; poll observed it (snapshot 10:18:29); Prism
        # reopened; the bot's reopen lands after. The older close must not win.
        events = [
            event("e1", "closed", "2026-09-21T10:03:58Z", bot=False),
            event("e2", "reopened", "2026-09-21T10:45:00Z", bot=True),
        ]
        outcome, _editor, human_state = analyze_state_events(
            events, bot_user_id="331962685", bot_login="bot[bot]", observed_updated_at="2026-09-21T10:18:29Z",
        )
        self.assertEqual((outcome, human_state), ("confirmed", None))

        # Without the snapshot the legacy positional rule still applies.
        outcome, _editor, human_state = analyze_state_events(events, bot_user_id="331962685", bot_login="bot[bot]")
        self.assertEqual((outcome, human_state), ("human_precedes", "closed"))

        # A human event after the snapshot is the race the postflight exists for.
        raced = [
            event("e1", "closed", "2026-09-21T10:03:58Z", bot=False),
            event("e4", "closed", "2026-09-21T10:30:05Z", bot=False),
            event("e2", "reopened", "2026-09-21T10:45:00Z", bot=True),
        ]
        outcome, _editor, human_state = analyze_state_events(
            raced, bot_user_id="331962685", bot_login="bot[bot]", observed_updated_at="2026-09-21T10:18:29Z",
        )
        self.assertEqual((outcome, human_state), ("human_precedes", "closed"))


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class SystemNoteProductionSchemaTests(unittest.TestCase):
    """The production comment_replies table has NOT NULL timestamp; disposable
    tracker schemas defaulted it, so the note insert only failed live."""

    def setUp(self) -> None:
        import tempfile

        from tests.test_tracker_tr_01 import DisposableSchemaStore

        self.schema = f"c46note_{uuid.uuid4().hex[:10]}"
        self.store = DisposableSchemaStore(self.schema)
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.addCleanup(self._drop_schema)
        self.store.initialize()

    def _drop_schema(self) -> None:
        with self.store._connect() as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            conn.commit()

    def test_append_system_note_satisfies_production_constraints(self) -> None:
        from app.services.trackers.state_mutations import append_system_note

        root = self.store.create_comment(
            "prj_a", self.tempdir.name, "SCH", {"x": 1, "y": 2}, "root", author="Priya", author_user_id="u_p",
        )
        with self.store._connect() as conn:
            with conn.transaction():
                reply_id = append_system_note(
                    conn, project_id="prj_a", comment_id=root["id"], content="Closed on GitHub after reopen",
                )
            row = conn.execute(
                "SELECT author_kind, origin, timestamp, updated_at FROM comment_replies WHERE id = %s", (reply_id,),
            ).fetchone()
        self.assertEqual((row["author_kind"], row["origin"]), ("system", "prism"))
        self.assertIsNotNone(row["timestamp"])
        self.assertIsNotNone(row["updated_at"])
        listed = self.store.get_comment("prj_a", self.tempdir.name, root["id"])
        self.assertEqual([r["content"] for r in listed["replies"]], ["Closed on GitHub after reopen"])
