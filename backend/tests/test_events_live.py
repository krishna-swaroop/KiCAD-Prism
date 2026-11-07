"""The live event socket: replay, live delivery, visibility and auth (ADR §3.10).

The route and the real broker run against the application database, so a
committed ``event_log.record`` travels through PostgreSQL ``NOTIFY`` to an open
socket. The deployment check at the bottom fails when ``websockets`` disappears
from ``requirements/runtime.lock``: Starlette's test client hides that, plain
uvicorn would answer the upgrade with 405.
"""

from __future__ import annotations

import os
import unittest
import uuid
from concurrent.futures import CancelledError as SessionCancelledError
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row

from app.services import event_log
from support.postgres import seed_folder, seed_project, seed_repository

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

try:
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False

ORIGIN = "http://127.0.0.1:5173"


def _user(*, role: str = "viewer", auth_type: str = "session", scopes: list[str] | None = None):
    from app.core.security import AuthenticatedUser

    return AuthenticatedUser(
        email="events-reader@example.test",
        name="Events reader",
        role=role,
        auth_type=auth_type,
        scopes=scopes or [],
    )


class _ApplicationDatabase:
    """Direct rows in the application database, separate from the app's pool."""

    def __init__(self) -> None:
        self.conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        self.conn.execute("SET search_path TO workspace, public")

    def __enter__(self):
        return self.conn

    def __exit__(self, *exc_info):
        if exc_info[0] is None:
            self.conn.commit()
        else:
            self.conn.rollback()
        self.conn.close()
        return False


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required for the live event socket test")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx2 or httpx")
class EventLiveSocketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import app.main as main
        from app.api import events_live
        from app.services.event_live_broker import broker

        cls.events_live = events_live
        cls.broker = broker
        # The lifespan starts the broker on the client's own event loop, which is
        # the loop notifications are delivered to for the life of the class.
        cls.client_context = TestClient(main.app)
        cls.client = cls.client_context.__enter__()
        if not broker.ready.wait(10.0):
            raise RuntimeError("event live listener did not connect to PostgreSQL")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_context.__exit__(None, None, None)

    def setUp(self) -> None:
        suffix = uuid.uuid4().hex[:8]
        self.repository = f"repo-{suffix}"
        self.project = f"project-{suffix}"
        self._projects = [self.project]
        self._folders: list[str] = []
        self.addCleanup(self._cleanup)
        with _ApplicationDatabase() as conn:
            seed_repository(conn, self.repository)
            seed_project(conn, self.project, self.repository)

    def _cleanup(self) -> None:
        with _ApplicationDatabase() as conn:
            conn.execute(
                "DELETE FROM ws_events WHERE project_id = ANY(%s)", (self._projects,)
            )
            conn.execute(
                "DELETE FROM ws_projects WHERE id = ANY(%s)", (self._projects,)
            )
            conn.execute("DELETE FROM ws_repositories WHERE id = %s", (self.repository,))
            for folder in self._folders:
                conn.execute("DELETE FROM ws_folders WHERE id = %s", (folder,))

    def _hidden_project(self) -> str:
        suffix = uuid.uuid4().hex[:8]
        folder = f"folder-{suffix}"
        project = f"project-hidden-{suffix}"
        with _ApplicationDatabase() as conn:
            seed_folder(
                conn,
                folder,
                visibility_mode="roles",
                allowed_roles=["designer", "admin"],
            )
            seed_project(conn, project, self.repository, folder_id=folder)
        self._folders.append(folder)
        self._projects.append(project)
        return project

    def _head(self) -> int:
        with _ApplicationDatabase() as conn:
            row = conn.execute(
                "SELECT cursor FROM ws_event_head WHERE singleton"
            ).fetchone()
            return int(row["cursor"])

    @contextmanager
    def _socket(self, user=None):
        patcher = patch.object(self.events_live, "get_current_user", return_value=user or _user())
        patcher.start()
        self.addCleanup(patcher.stop)
        session = self.client.websocket_connect(
            "/api/v1/events/live", headers={"origin": ORIGIN}
        )
        try:
            with session as socket:
                yield socket
        except SessionCancelledError:
            # The test client sends its disconnect and cancels the ASGI task.
            # A route parked in asyncio.wait (waiting on the wake queue and the
            # receive task) is cancelled before it can observe the disconnect;
            # every frame this test asserts on has already been sent.
            pass

    def test_subscribe_replays_visible_events_from_the_cursor(self) -> None:
        after = self._head()
        first = event_log.record("job.progress", project_id=self.project, payload={"step": 1})
        second = event_log.record("bundle.built", project_id=self.project)

        with self._socket() as socket:
            socket.send_json(
                {"type": "subscribe", "topics": [f"project:{self.project}"], "after": after}
            )
            frame = socket.receive_json()

        self.assertEqual(frame["type"], "events")
        self.assertEqual([event["id"] for event in frame["events"]], [first, second])
        self.assertEqual(frame["next"], second)
        self.assertEqual(frame["events"][0]["payload"], {"step": 1})

    def test_a_new_record_arrives_live(self) -> None:
        after = self._head()
        with self._socket() as socket:
            socket.send_json({"type": "subscribe", "after": after})
            replay = socket.receive_json()
            self.assertEqual(replay, {"type": "events", "events": [], "next": after})

            event_id = event_log.record("job.finished", project_id=self.project)
            frame = socket.receive_json()

        self.assertEqual(frame["type"], "events")
        self.assertEqual([event["id"] for event in frame["events"]], [event_id])
        self.assertEqual(frame["next"], event_id)

    def test_a_hidden_project_topic_is_refused(self) -> None:
        hidden = self._hidden_project()
        topic = f"project:{hidden}"

        with self._socket() as socket:
            socket.send_json({"type": "subscribe", "topics": [topic], "after": 0})
            frame = socket.receive_json()

        self.assertEqual(
            frame, {"type": "error", "code": "topic-forbidden", "topic": topic}
        )

    def test_an_event_in_a_hidden_folder_is_never_delivered(self) -> None:
        hidden = self._hidden_project()
        after = self._head()
        hidden_event = event_log.record("revision.synced", project_id=hidden)
        visible_event = event_log.record("revision.synced", project_id=self.project)

        with self._socket() as socket:
            socket.send_json({"type": "subscribe", "topics": [], "after": after})
            frame = socket.receive_json()

        delivered = [event["id"] for event in frame["events"]]
        self.assertNotIn(hidden_event, delivered)
        self.assertEqual(delivered, [visible_event])

    def test_an_idle_socket_heartbeats(self) -> None:
        after = self._head()
        with patch.object(self.events_live, "_HEARTBEAT_SECONDS", 0.1):
            with self._socket() as socket:
                socket.send_json({"type": "subscribe", "after": after})
                replay = socket.receive_json()
                self.assertEqual(replay["type"], "events")
                frame = socket.receive_json()

        self.assertEqual(frame, {"type": "heartbeat", "next": after})

    def test_nothing_is_delivered_before_the_first_subscribe(self) -> None:
        event_log.record("job.finished", project_id=self.project)
        with patch.object(self.events_live, "_HEARTBEAT_SECONDS", 0.1):
            with self._socket() as socket:
                frame = socket.receive_json()

        # The idle read waits for the client's cursor instead of replaying the log from 0.
        self.assertEqual(frame, {"type": "heartbeat", "next": 0})

    def test_a_provider_token_is_refused_before_accept(self) -> None:
        user = _user(auth_type="kicad_provider", scopes=["api:read"])
        with self.assertRaises(WebSocketDisconnect) as refused:
            with self._socket(user):
                pass
        self.assertEqual(refused.exception.code, 1008)

    def test_access_revoked_after_connect_closes_the_socket(self) -> None:
        after = self._head()
        user = _user()
        revoked = False

        async def check_socket_access(_websocket):
            return None if revoked else user

        with (
            patch.object(self.events_live, "_ACCESS_RECHECK_SECONDS", 0.0),
            patch.object(self.events_live, "_check_socket_access", check_socket_access),
            self._socket() as socket,
        ):
            socket.send_json({"type": "subscribe", "after": after})
            self.assertEqual(socket.receive_json()["type"], "events")
            revoked = True
            event_log.record("job.finished", project_id=self.project)
            with self.assertRaises(WebSocketDisconnect) as closed:
                socket.receive_json()

        self.assertEqual(closed.exception.code, 1008)


class EventLiveRuntimeTests(unittest.TestCase):
    def test_websockets_is_a_runtime_dependency(self) -> None:
        lock = Path(__file__).resolve().parents[2] / "requirements" / "runtime.lock"
        self.assertTrue(lock.is_file(), f"{lock} is missing")
        packages = {
            line.strip().split("==", 1)[0]
            for line in lock.read_text().splitlines()
            if "==" in line
        }
        # TestClient passes without a WebSocket protocol library, but plain
        # uvicorn then answers every upgrade as HTTP (405).
        self.assertIn("websockets", packages, "requirements/runtime.lock must include websockets")


if __name__ == "__main__":
    unittest.main()
