"""TR-25: enqueue promotion atomically with comment mutations (F1, F5, F8)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import comments as comments_api  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.comments_revisions import Editor, record_revision  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore  # noqa: E402
from app.services.trackers.promotion import (  # noqa: E402
    PromotionActor,
    enqueue_create_issue,
    maybe_auto_promote_root,
)
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.publication_policy import PublicationPolicyService  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from tests.test_tracker_tr_01 import DisposableSchemaStore, POSTGRES_URL, SHARED_APPLICATION_DATABASE, psycopg  # noqa: E402
from tests.test_tracker_tr_03 import body, run, session  # noqa: E402
from tests.test_tracker_tr_05 import TwoCommitPcb  # noqa: E402
from tests.test_tracker_tr_23 import _settings  # noqa: E402

try:
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    dict_row = None  # type: ignore[assignment]

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F1 = json.loads((DOCS / "fixtures" / "F01.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))
COMMIT = "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"


def _dsn() -> str:
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


class RoutingContractTests(unittest.TestCase):
    def test_fixture_cases_are_present(self) -> None:
        f8_ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.viewer_task_not_auto_promoted", f8_ids)
        self.assertIn("F8.viewer_reply_on_linked", f8_ids)
        self.assertIn("F8.share_to_github", f8_ids)

    def test_promote_and_share_routes_registered(self) -> None:
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(comments_api.router)
        paths = set(app.openapi()["paths"])
        self.assertIn("/{project_id}/comments/{comment_id}/promote", paths)
        self.assertIn("/{project_id}/comments/{comment_id}/replies/{reply_id}/share", paths)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class PromotionPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr25_{uuid.uuid4().hex[:12]}"
        self.store = DisposableSchemaStore(self.schema)
        self.store.workspace_schema = self.schema
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        self.conn.commit()
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.fixture = TwoCommitPcb(Path(self.tempdir.name))
        self.project = SimpleNamespace(id="prj_a", path=self.fixture.project.path)
        self.tracker_store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self._seed_destination()
        patches = [
            patch.object(comments_api, "comments_store", self.store),
            patch.object(comments_api, "get_project_for_role_or_404", return_value=self.project),
            patch.object(comments_api, "_load_mention_indexes", return_value=({}, {})),
            patch.object(comments_api, "_promote_min_role", return_value="designer"),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    @contextmanager
    def _factory(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        try:
            yield conn
        finally:
            conn.close()

    def _create_comments_foundation(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'OPEN',
                context TEXT NOT NULL DEFAULT 'PCB',
                location_x REAL NOT NULL DEFAULT 0,
                location_y REAL NOT NULL DEFAULT 0,
                location_layer TEXT NOT NULL DEFAULT '',
                location_page TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                comment_class TEXT NOT NULL DEFAULT 'general',
                severity TEXT NOT NULL DEFAULT 'info',
                mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                scope TEXT NOT NULL DEFAULT 'canvas',
                anchor_commit TEXT,
                anchor_state TEXT NOT NULL DEFAULT 'unpinned',
                anchor_source TEXT,
                anchor_revision_key TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT '',
                author_user_id TEXT,
                author_kind TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ,
                origin TEXT NOT NULL DEFAULT 'prism'
            );
            """,
            prepare=False,
        )

    def _observe_container(
        self,
        connector_id: str,
        *,
        container_kind: str,
        container_path: str,
        remote_container_id: str,
        generation: int = 1,
        visibility_hint: str | None = None,
    ) -> dict[str, str]:
        return {
            "visibility": visibility_hint or "private",
            "containerPath": container_path,
            "remoteContainerId": remote_container_id,
        }

    def _seed_destination(self) -> None:
        self.tracker_store.upsert_connector(
            connector_id="cn_gh1", provider="github", instance_kind="github.com",
        )
        self.tracker_store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id="cn_gh1",
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id="111",
            generation=2,
            visibility="private",
        )
        self.tracker_store.acknowledge_destination(
            ack_id="ack_1",
            connector_id="cn_gh1",
            remote_container_id="111",
            visibility="private",
            acknowledged_by="u_admin",
        )
        self.conn.commit()
        settings = _settings()
        PublicationPolicyService(
            connect=self._factory,
            settings=settings,
            workspace_schema=self.schema,
            connector_service=ConnectorService(
                connect=self._factory,
                settings=settings,
                container_observer=self._observe_container,
                workspace_schema=self.schema,
            ),
        ).update_settings(
            "prj_a",
            actor_user_id="u_admin",
            connector_id="cn_gh1",
            destination={
                "containerKind": "repo",
                "containerPath": "acme/openswitch",
                "remoteContainerId": "111",
                "visibility": "private",
            },
            promote_min_role="designer",
        )

    def _create_pinned(self, user, **overrides):
        payload = {
            "context": "PCB",
            "location": {"x": 1.0, "y": 2.0, "layer": "F.Cu"},
            "content": "promote me",
            "severity": "major",
            "revision": {"commit": self.fixture.sha_a},
        }
        payload.update(overrides)
        return run(comments_api.create_comment("prj_a", comments_api.CreateCommentRequest(**payload), user))

    def _seed_linked_thread(self, comment_id: str = "c_linked") -> str:
        created = self.store.create_comment(
            project_id="prj_a",
            project_path=self.project.path,
            context="PCB",
            location={"x": 1.0, "y": 2.0, "layer": "F.Cu"},
            content="linked root",
            author="Priya",
            author_user_id="u_designer",
            author_kind="user",
            severity="major",
            comment_class="observation",
            anchor_commit=self.fixture.sha_a,
            anchor_source="client",
        )
        comment_id = created["id"]
        self.tracker_store.insert_thread(
            thread_id=f"tt_{comment_id}",
            comment_id=comment_id,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id="cn_gh1",
            remote_container_id="111",
            external_id="412",
            external_url="https://github.com/acme/openswitch/issues/412",
            link_state="linked",
        )
        self.conn.commit()
        return str(comment_id)

    def test_comment_revision_and_op_roll_back_together(self) -> None:
        self.conn.execute(
            """
            INSERT INTO comments(
                id, project_id, author, content, severity, anchor_commit, anchor_state, revision
            ) VALUES ('c_rb', 'prj_a', 'Priya', 'rollback', 'major', %s, 'pinned', 1)
            """,
            (self.fixture.sha_a,),
        )
        self.conn.commit()
        comment = self.store.get_comment("prj_a", self.project.path, "c_rb")
        try:
            with self.store._connect() as conn:
                with conn.transaction():
                    record_revision(
                        conn,
                        project_id="prj_a",
                        target_kind="root",
                        target_id="c_rb",
                        revision=1,
                        change_kind="create",
                        editor=Editor(user_id="u_designer", kind="user", display="Designer"),
                        content="rollback",
                    )
                    enqueue_create_issue(
                        conn,
                        project_id="prj_a",
                        comment=comment,
                        actor=PromotionActor(user_id="u_designer", role="designer"),
                        workspace_schema=self.schema,
                    )
                    raise RuntimeError("inject failure")
        except RuntimeError:
            pass
        with self.store._connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"], 0)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM comment_revisions").fetchone()["n"], 0)

    def test_designer_auto_promote_enqueues_one_create_issue(self) -> None:
        designer = session("designer", user_id="u_designer")
        created = self._create_pinned(designer)
        self.assertEqual(created["tracker"]["syncState"], "pending")
        self.assertEqual(created["tracker"]["pendingIntent"], "create_issue")
        with self.store._connect() as conn:
            ops = conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'create_issue'").fetchone()["n"]
            threads = conn.execute("SELECT COUNT(*) AS n FROM tracked_threads").fetchone()["n"]
        self.assertEqual((ops, threads), (1, 1))

    def test_viewer_task_not_auto_promoted(self) -> None:  # F8.viewer_task_not_auto_promoted
        viewer = session("viewer", user_id="u_viewer")
        created = self._create_pinned(
            viewer,
            commentClass="task",
            severity="info",
            content="viewer task",
        )
        self.assertIsNone(created["tracker"].get("linkState"))
        self.assertIn("notPromotableReason", created["tracker"])
        with self.store._connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"], 0)

    def test_manual_promote_is_idempotent(self) -> None:
        viewer = session("viewer", user_id="u_viewer")
        created = self._create_pinned(viewer, commentClass="task", severity="info")
        designer = session("designer", user_id="u_designer")
        first = run(comments_api.promote_comment("prj_a", created["id"], designer))
        second = run(comments_api.promote_comment("prj_a", created["id"], designer))
        self.assertEqual(first["tracker"]["pendingIntent"], "create_issue")
        self.assertEqual(second["tracker"]["pendingIntent"], "create_issue")
        with self.store._connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"], 1)

    def test_concurrent_promotion_creates_one_op(self) -> None:
        self.conn.execute(
            """
            INSERT INTO comments(
                id, project_id, author, content, severity, anchor_commit, anchor_state, revision
            ) VALUES ('c_race', 'prj_a', 'Priya', 'race', 'major', %s, 'pinned', 1)
            """,
            (self.fixture.sha_a,),
        )
        self.conn.commit()
        comment = self.store.get_comment("prj_a", self.project.path, "c_race")
        errors: list[Exception] = []

        def worker():
            try:
                with self.store._connect() as conn:
                    with conn.transaction():
                        maybe_auto_promote_root(
                            conn,
                            project_id="prj_a",
                            comment=comment,
                            actor=PromotionActor(user_id="u_designer", role="designer"),
                            workspace_schema=self.schema,
                        )
            except Exception as exc:  # pragma: no cover - surfaced below
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        with self.store._connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"], 1)

    def test_committed_op_discoverable_without_jobs_enqueue(self) -> None:
        designer = session("designer", user_id="u_designer")
        created = self._create_pinned(designer)
        with self.store._connect() as conn:
            claimed = OpStore(conn).claim("worker-test")
            thread = conn.execute(
                "SELECT id FROM tracked_threads WHERE comment_id = %s",
                (created["id"],),
            ).fetchone()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["op"], "create_issue")
        self.assertEqual(claimed["tracked_thread_id"], thread["id"])

    def test_viewer_reply_on_linked_is_unsynced_local(self) -> None:  # F8.viewer_reply_on_linked
        comment_id = self._seed_linked_thread()
        viewer = session("viewer", user_id="u_viewer")
        result = run(comments_api.add_reply(
            "prj_a",
            comment_id,
            comments_api.CreateReplyRequest(content="viewer reply"),
            viewer,
        ))
        self.assertEqual(result["reply"]["sync"]["state"], "unsynced_local")
        with self.store._connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'add_comment'").fetchone()["n"], 0)

    def test_viewer_reply_unsynced_survives_listing(self) -> None:
        comment_id = self._seed_linked_thread()
        viewer = session("viewer", user_id="u_viewer")
        posted = run(comments_api.add_reply(
            "prj_a",
            comment_id,
            comments_api.CreateReplyRequest(content="viewer reply"),
            viewer,
        ))
        reply_id = posted["reply"]["id"]
        listing = run(comments_api.get_comments("prj_a", viewer))
        thread = next(item for item in listing["comments"] if item["id"] == comment_id)
        reply = next(item for item in thread["replies"] if item["id"] == reply_id)
        self.assertEqual(reply["sync"]["state"], "unsynced_local")
        with self.store._connect() as conn:
            row = conn.execute(
                "SELECT sync_state FROM comment_replies WHERE id = %s",
                (reply_id,),
            ).fetchone()
        self.assertEqual(row["sync_state"], "unsynced_local")

    def test_designer_share_enqueues_add_comment(self) -> None:  # F8.share_to_github
        comment_id = self._seed_linked_thread()
        viewer = session("viewer", user_id="u_viewer")
        posted = run(comments_api.add_reply(
            "prj_a",
            comment_id,
            comments_api.CreateReplyRequest(content="needs share"),
            viewer,
        ))
        reply_id = posted["reply"]["id"]
        designer = session("designer", user_id="u_designer")
        shared = run(comments_api.share_reply_to_tracker("prj_a", comment_id, reply_id, designer))
        self.assertIsNotNone(shared)
        with self.store._connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'add_comment'").fetchone()["n"], 1)

    def test_downgrade_on_linked_thread_enqueues_update_not_unlink(self) -> None:
        comment_id = self._seed_linked_thread()
        designer = session("designer", user_id="u_designer")
        updated = run(comments_api.update_comment(
            "prj_a",
            comment_id,
            comments_api.UpdateCommentRequest(severity="info", expectedRevision=1),
            designer,
        ))
        self.assertEqual(updated["tracker"]["linkState"], "linked")
        with self.store._connect() as conn:
            row = conn.execute(
                "SELECT op, state FROM sync_ops WHERE op = 'update_issue'"
            ).fetchone()
            unlink = conn.execute(
                "SELECT unlinked_at FROM tracked_threads WHERE comment_id = %s",
                (comment_id,),
            ).fetchone()
        self.assertEqual(row["op"], "update_issue")
        self.assertIsNone(unlink["unlinked_at"])

    def test_viewer_promote_is_denied(self) -> None:
        viewer = session("viewer", user_id="u_viewer")
        created = self._create_pinned(viewer, commentClass="task", severity="info")
        response = run(comments_api.promote_comment("prj_a", created["id"], viewer))
        self.assertIsInstance(response, JSONResponse)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(body(response)["code"], "publication_required")
