"""TR-35: sync projections, retry, status/history and health (F1, F7, F8)."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import AuthenticatedUser  # noqa: E402
from app.api import tracker_sync as sync_api  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.comment_permissions import resolve_actor  # noqa: E402
from app.services.trackers.health import aggregate_connector_health, aggregate_project_health  # noqa: E402
from app.services.trackers.inbox_store import apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.projections import (  # noqa: E402
    attach_tracker_projection,
    can_retry_projection,
    list_thread_history,
    retry_thread_sync,
    wire_sync_op,
)
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402

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
CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
PROJECT = "prj_a"
COMMENT = "c_8f3a1b2c"
THREAD = "tt_tr35"
PINNED_ANCHOR = {"state": "pinned", "commit": "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"}


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


def session(role: str, *, user_id: str = "u_designer") -> AuthenticatedUser:
    return AuthenticatedUser(
        email=f"{user_id}@example.com",
        name=role,
        role=role,  # type: ignore[arg-type]
        session_id="sid",
        user_id=user_id,
    )


def run(coro):
    return asyncio.run(coro)


class RoutingContractTests(unittest.TestCase):
    def test_main_registers_tracker_sync_router(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("tracker_sync_router", source)
        app = FastAPI()
        app.include_router(sync_api.router)
        paths = set(app.openapi()["paths"])
        self.assertIn("/api/projects/{project_id}/tracker/health", paths)
        self.assertIn("/api/projects/{project_id}/comments/{comment_id}/tracker", paths)
        self.assertIn("/api/projects/{project_id}/comments/{comment_id}/tracker/history", paths)
        self.assertIn("/api/projects/{project_id}/comments/{comment_id}/tracker/retry", paths)

    def test_f7_quiet_repo_fixture_owned_by_tr35(self) -> None:
        owned = [case["id"] for case in F7["cases"] if case.get("owner") == "TR-35"]
        self.assertIn("F7.quiet_repo_not_broken", owned)

    def test_f8_no_repromote_fixture_present(self) -> None:
        ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.no_repromote_from_inaccessible", ids)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class TrackerTr35PostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr35_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self._create_comments_foundation()
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.conn.execute("CREATE SCHEMA IF NOT EXISTS workspace")
        self.conn.execute("SET search_path TO workspace, public")
        migrate_workspace_tracker_tables(self.conn)
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id="199001",
            bot_login="prism[bot]",
        )
        self.store.set_project_tracker(
            project_tracker_id="pt_tr35",
            project_id=PROJECT,
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path="acme/openswitch",
            remote_container_id=CONTAINER,
            generation=2,
            visibility="private",
        )
        self.store.acknowledge_destination(
            ack_id="ack_tr35",
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            visibility="private",
            acknowledged_by="u_admin",
        )
        self._mirror_workspace_tables()
        self.conn.execute(
            """
            INSERT INTO comments (id, project_id, author, author_user_id, author_kind, content, anchor_commit, anchor_state)
            VALUES (%s, %s, 'Priya', 'u_designer', 'user', 'fixture', %s, 'pinned')
            """,
            (COMMENT, PROJECT, PINNED_ANCHOR["commit"]),
        )
        self.store.insert_thread(
            thread_id=THREAD,
            comment_id=COMMENT,
            project_tracker_id="pt_tr35",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id="412",
            external_number="412",
            external_url="https://github.com/acme/openswitch/issues/412",
            link_state="linked",
        )
        self.conn.execute(
            """
            UPDATE tracked_threads
            SET remote_state = 'open',
                remote_version = %s::jsonb
            WHERE id = %s
            """,
            (json.dumps({"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"}), THREAD),
        )
        self.conn.commit()

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.execute("DROP SCHEMA IF EXISTS workspace CASCADE")
            self.conn.commit()
        finally:
            self.conn.close()

    def _mirror_workspace_tables(self) -> None:
        connector = self.conn.execute(
            "SELECT * FROM tracker_connectors WHERE id = %s",
            (CONNECTOR,),
        ).fetchone()
        if connector is not None:
            self.conn.execute(
                """
                INSERT INTO workspace.tracker_connectors (
                    id, provider, instance_kind, bot_forge_user_id, bot_login,
                    credential_envelope, paused, paused_reason
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    provider = EXCLUDED.provider,
                    instance_kind = EXCLUDED.instance_kind,
                    bot_forge_user_id = EXCLUDED.bot_forge_user_id,
                    bot_login = EXCLUDED.bot_login,
                    credential_envelope = EXCLUDED.credential_envelope,
                    paused = EXCLUDED.paused,
                    paused_reason = EXCLUDED.paused_reason
                """,
                (
                    connector["id"],
                    connector["provider"],
                    connector["instance_kind"],
                    connector.get("bot_forge_user_id"),
                    connector.get("bot_login"),
                    connector.get("credential_envelope"),
                    connector.get("paused", False),
                    connector.get("paused_reason"),
                ),
            )
        row = self.conn.execute(
            """
            SELECT id, project_id, connector_id, container_kind, container_path,
                   remote_container_id, destination_generation, visibility
            FROM project_trackers
            WHERE id = %s
            """,
            ("pt_tr35",),
        ).fetchone()
        if row is not None:
            self.conn.execute(
                """
                INSERT INTO workspace.project_trackers (
                    id, project_id, connector_id, container_kind, container_path,
                    remote_container_id, destination_generation, visibility
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (project_id) DO UPDATE SET
                    connector_id = EXCLUDED.connector_id,
                    container_kind = EXCLUDED.container_kind,
                    container_path = EXCLUDED.container_path,
                    remote_container_id = EXCLUDED.remote_container_id,
                    destination_generation = EXCLUDED.destination_generation,
                    visibility = EXCLUDED.visibility
                """,
                (
                    row["id"],
                    row["project_id"],
                    row["connector_id"],
                    row["container_kind"],
                    row["container_path"],
                    row["remote_container_id"],
                    row["destination_generation"],
                    row["visibility"],
                ),
            )
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
                revision INTEGER NOT NULL DEFAULT 1,
                author_user_id TEXT,
                author_kind TEXT NOT NULL DEFAULT 'user',
                anchor_commit TEXT
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

    def _comment(self) -> dict:
        return {"id": COMMENT, "replies": [], "anchor": dict(PINNED_ANCHOR)}

    def test_projection_distinguishes_link_and_sync_states(self) -> None:
        self.ops.insert(
            op_id="op_state",
            tracked_thread_id=THREAD,
            op="set_state",
            destination_generation=2,
            expected_remote_state="closed",
        )
        comment = self._comment()
        attach_tracker_projection(self.conn, PROJECT, comment)
        tracker = comment["tracker"]
        self.assertEqual(tracker["linkState"], "linked")
        self.assertEqual(tracker["remoteState"], "open")
        self.assertEqual(tracker["pendingIntent"], "set_state:closed")
        self.assertEqual(tracker["remoteUpdatedAt"], "2026-09-20T15:42:11Z")

    def test_inaccessible_deleted_transferred_remain_distinct(self) -> None:
        for state in ("inaccessible", "deleted", "transferred"):
            self.conn.execute(
                "UPDATE tracked_threads SET link_state = %s, paused_reason = %s WHERE id = %s",
                (state, f"reason_{state}", THREAD),
            )
            comment = self._comment()
            attach_tracker_projection(self.conn, PROJECT, comment)
            self.assertEqual(comment["tracker"]["linkState"], state)

    def test_failed_op_surfaces_sanitized_last_error(self) -> None:
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation, last_error
            ) VALUES (
                'op_failed', %s, 'update_issue', 'failed', 2,
                %s::jsonb
            )
            """,
            (
                THREAD,
                json.dumps(
                    {
                        "class": "rate_limited",
                        "message": "GitHub secondary rate limit",
                        "resumeAt": "2026-09-20T16:20:00Z",
                        "retryable": True,
                        "token": "gho_secret",
                    }
                ),
            ),
        )
        comment = self._comment()
        attach_tracker_projection(self.conn, PROJECT, comment)
        tracker = comment["tracker"]
        self.assertEqual(tracker["syncState"], "failed")
        self.assertNotIn("gho_secret", json.dumps(tracker))
        self.assertTrue(can_retry_projection(tracker))

    def test_retry_is_idempotent_and_revalidates_publication(self) -> None:
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation, last_error
            ) VALUES ('op_retry', %s, 'set_state', 'failed', 2, %s::jsonb)
            """,
            (THREAD, json.dumps({"class": "transient", "message": "timeout", "retryable": True})),
        )
        actor = resolve_actor(session("designer"))
        first = retry_thread_sync(
            self.conn,
            project_id=PROJECT,
            comment_id=COMMENT,
            actor=actor,
            promote_min_role="designer",
        )
        row = self.conn.execute("SELECT state FROM sync_ops WHERE id = 'op_retry'").fetchone()
        self.assertEqual(row["state"], "pending")
        second = retry_thread_sync(
            self.conn,
            project_id=PROJECT,
            comment_id=COMMENT,
            actor=actor,
            promote_min_role="designer",
        )
        self.assertEqual(first["syncState"], second["syncState"])

    def test_viewer_retry_denied(self) -> None:
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation
            ) VALUES ('op_viewer', %s, 'add_comment', 'failed', 2)
            """,
            (THREAD,),
        )
        actor = resolve_actor(session("viewer", user_id="u_viewer"))
        with self.assertRaises(Exception):
            retry_thread_sync(
                self.conn,
                project_id=PROJECT,
                comment_id=COMMENT,
                actor=actor,
                promote_min_role="designer",
            )

    def test_inaccessible_retry_refused(self) -> None:
        self.conn.execute("UPDATE tracked_threads SET link_state = 'inaccessible' WHERE id = %s", (THREAD,))
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation
            ) VALUES ('op_inacc', %s, 'add_comment', 'failed', 2)
            """,
            (THREAD,),
        )
        actor = resolve_actor(session("designer"))
        with self.assertRaises(PublicationDenied):
            retry_thread_sync(
                self.conn,
                project_id=PROJECT,
                comment_id=COMMENT,
                actor=actor,
                promote_min_role="designer",
            )

    def test_history_never_leaks_secrets(self) -> None:
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation,
                actor_user_id, last_error
            ) VALUES (
                'op_hist', %s, 'create_issue', 'confirmed', 2, 'u_designer',
                %s::jsonb
            )
            """,
            (THREAD, json.dumps({"class": "transient", "message": "ok", "privateKey": "pem"})),
        )
        history = list_thread_history(self.conn, THREAD)
        dumped = json.dumps(history)
        self.assertNotIn("privateKey", dumped)
        self.assertNotIn("pem", dumped)

    def test_health_quiet_repo_not_degraded(self) -> None:
        now = datetime.now(timezone.utc)
        self.conn.execute(
            """
            INSERT INTO sync_checkpoints (kind, scope_key, last_success_at)
            VALUES ('poll', %s, %s)
            ON CONFLICT (kind, scope_key) DO UPDATE SET last_success_at = EXCLUDED.last_success_at
            """,
            (f"{CONNECTOR}:{CONTAINER}", now - timedelta(minutes=5)),
        )
        health = aggregate_connector_health(self.conn, CONNECTOR, comments_schema=self.schema)
        self.assertFalse(health["degraded"])
        self.assertIsNone(health["lastWebhookAt"])
        self.assertIsNotNone(health["lastPollAt"])

    def test_project_health_scoped_to_project(self) -> None:
        self.conn.execute(
            "INSERT INTO comments (id, project_id, author, content) VALUES ('c_other', 'prj_other', 'Other', 'x')"
        )
        self.store.insert_thread(
            thread_id="tt_other",
            comment_id="c_other",
            project_tracker_id="pt_tr35",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id="999",
            external_number="999",
            external_url="https://github.com/acme/openswitch/issues/999",
            link_state="inaccessible",
        )
        health = aggregate_project_health(self.conn, PROJECT, comments_schema=self.schema)
        self.assertEqual(health["linkedThreads"], 1)
        self.assertEqual(health["inaccessibleThreads"], 0)

    def test_api_retry_route_returns_projection(self) -> None:
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation,
                expected_remote_state
            ) VALUES ('op_api', %s, 'set_state', 'failed', 2, 'closed')
            """,
            (THREAD,),
        )
        self.conn.commit()

        @contextmanager
        def connect_cm():
            yield self.conn

        project = type("Project", (), {"id": PROJECT, "path": "/tmp", "role": "designer"})()
        with patch("app.api.tracker_sync.get_project_for_role_or_404", return_value=project), patch(
            "app.api.tracker_sync.comments_store._connect", side_effect=connect_cm,
        ), patch("app.api.tracker_sync._promote_min_role", return_value="designer"):
            result = run(sync_api.retry_comment_sync(PROJECT, COMMENT, session("designer")))
        self.assertEqual(result["pendingIntent"], "set_state:closed")

    def test_api_retry_while_paused_returns_409(self) -> None:
        self.conn.execute(
            """
            INSERT INTO sync_ops (
                id, tracked_thread_id, op, state, destination_generation,
                expected_remote_state
            ) VALUES ('op_paused_retry', %s, 'set_state', 'failed', 2, 'closed')
            """,
            (THREAD,),
        )
        self.conn.execute(
            "UPDATE workspace.tracker_connectors SET paused = TRUE, paused_reason = 'ops' WHERE id = %s",
            (CONNECTOR,),
        )
        self.conn.commit()

        @contextmanager
        def connect_cm():
            yield self.conn

        project = type("Project", (), {"id": PROJECT, "path": "/tmp", "role": "designer"})()
        with patch("app.api.tracker_sync.get_project_for_role_or_404", return_value=project), patch(
            "app.api.tracker_sync.comments_store._connect", side_effect=connect_cm,
        ), patch("app.api.tracker_sync._promote_min_role", return_value="designer"):
            result = run(sync_api.retry_comment_sync(PROJECT, COMMENT, session("designer")))
        self.assertIsInstance(result, JSONResponse)
        self.assertEqual(result.status_code, 409)
        payload = json.loads(result.body)
        self.assertEqual(payload["code"], "paused")
        self.assertEqual(payload["pausedReason"], "paused")
        self.assertEqual(getattr(DispatchPause("paused", "x"), "reason"), "paused")
        self.assertFalse(hasattr(DispatchPause("paused", "x"), "code"))

    def test_api_history_requires_project_access(self) -> None:
        def deny(*_args, **_kwargs):
            raise HTTPException(status_code=404, detail="Project not found")

        with patch("app.api.tracker_sync.get_project_for_role_or_404", side_effect=deny):
            with self.assertRaises(HTTPException) as caught:
                run(sync_api.thread_sync_history("prj_missing", COMMENT, session("viewer")))
            self.assertEqual(caught.exception.status_code, 404)

    def test_wire_sync_op_matches_dto_examples(self) -> None:
        examples = json.loads((DOCS / "dto-examples.json").read_text(encoding="utf-8"))
        sample = examples["tracker"]["SyncOp"]
        wired = wire_sync_op(
            {
                "id": sample["opId"],
                "tracked_thread_id": sample["trackedThreadId"],
                "op": sample["op"],
                "state": sample["state"],
                "created_at": datetime.fromisoformat(sample["createdAt"].replace("Z", "+00:00")),
                "sent_at": datetime.fromisoformat(sample["sentAt"].replace("Z", "+00:00")),
                "local_revision": sample["localRevision"],
                "destination_generation": sample["destinationGeneration"],
                "actor_user_id": sample["actorUserId"],
                "expected_remote_state": sample["expectedRemoteState"],
                "attempts": sample["attempts"],
                "next_attempt_at": None,
                "external_result_id": sample["externalResultId"],
                "last_error": sample["lastError"],
            }
        )
        self.assertEqual(wired["opId"], sample["opId"])
        self.assertEqual(wired["state"], sample["state"])


if __name__ == "__main__":
    unittest.main()
