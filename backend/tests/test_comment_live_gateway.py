"""Comment live gateway security and replay contract tests."""

from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.api import comment_live as api
from app.core.security import AuthenticatedUser
from app.services.comment_live_broker import CommentLiveBroker
from app.services import comment_live_broker as broker_module


def user(*, role: str = "viewer", auth_type: str = "session", scopes: list[str] | None = None):
    return AuthenticatedUser(
        email="reader@example.test", name="Reader", role=role,
        auth_type=auth_type, scopes=scopes or [],
    )


class FakeWebSocket:
    def __init__(self, *, origin: str | None = "https://prism.example.test") -> None:
        self.headers = {"host": "prism.example.test", "x-forwarded-proto": "https"}
        if origin is not None:
            self.headers["origin"] = origin
        self.url = SimpleNamespace(scheme="wss")
        self.accepted = False
        self.closed: int | None = None
        self.frames: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int) -> None:
        self.closed = code

    async def send_json(self, frame: dict) -> None:
        self.frames.append(frame)

    async def receive(self) -> dict:
        return {"type": "websocket.disconnect"}


class CommentLiveGatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_cursor_never_skips_an_event_committed_after_the_event_query(self) -> None:
        class Connection:
            def execute(self, _statement):
                return None

        class Pool:
            def __enter__(self):
                return Connection()

            def __exit__(self, *_args):
                return False

        with patch.object(api.database, "connection", return_value=Pool()), patch.object(
            api.comment_live_events, "current_cursor", return_value=7
        ), patch.object(api.comment_live_events, "changes_after", return_value=[]) as changes:
            payload = api._read_batch("project-a", 7)
        self.assertEqual(payload, {"cursor": 7, "changes": [], "hasMore": False})
        changes.assert_called_once_with(unittest.mock.ANY, "project-a", 7, limit=201)

    async def test_http_changes_are_role_scoped_and_metadata_only(self) -> None:
        event = {
            "cursor": 2, "commentId": "c1", "scope": "canvas",
            "baseCommit": None, "compareCommit": None, "changeKind": "upsert",
        }
        with patch.object(api, "get_project_for_role_or_404") as lookup, patch.object(
            api, "_read_batch", return_value={"cursor": 2, "changes": [event], "hasMore": False}
        ) as read:
            payload = await api.get_comment_changes("project-a", 1, user(role="qa"))
        lookup.assert_called_once_with("project-a", "qa")
        read.assert_called_once_with("project-a", 1)
        self.assertEqual(payload["changes"], [event])
        self.assertNotIn("content", payload["changes"][0])

    async def test_http_hidden_project_and_provider_token_are_denied(self) -> None:
        with patch.object(api, "get_project_for_role_or_404", side_effect=HTTPException(404)):
            with self.assertRaises(HTTPException) as error:
                await api.get_comment_changes("hidden", 0, user())
        self.assertEqual(error.exception.status_code, 404)
        with self.assertRaises(HTTPException) as error:
            await api.get_comment_changes("project-a", 0, user(auth_type="kicad_provider"))
        self.assertEqual(error.exception.status_code, 403)

    async def test_socket_rejects_cross_origin_and_cookie_without_origin(self) -> None:
        for origin in ("https://evil.example.test", None):
            socket = FakeWebSocket(origin=origin)
            with self.subTest(origin=origin), patch.object(api, "get_current_user", return_value=user()):
                self.assertFalse(await api._check_socket_access(socket, "project-a"))

    async def test_cookie_socket_does_not_trust_host_header_as_origin_allowlist(self) -> None:
        socket = FakeWebSocket(origin="https://attacker.example.test")
        socket.headers["host"] = "attacker.example.test"
        with patch.object(api, "get_current_user", return_value=user()):
            self.assertFalse(await api._check_socket_access(socket, "project-a"))

    async def test_socket_accepts_scoped_bearer_without_origin_but_checks_role(self) -> None:
        socket = FakeWebSocket(origin=None)
        with patch.object(api, "get_current_user", return_value=user(auth_type="service", scopes=["api:read"])), patch.object(
            api, "get_project_for_role_or_404"
        ) as lookup:
            self.assertTrue(await api._check_socket_access(socket, "project-a"))
        lookup.assert_called_once_with("project-a", "viewer")

    async def test_socket_replays_durable_events_without_comment_bodies(self) -> None:
        event = {
            "cursor": 1, "commentId": "c1", "scope": "comparison",
            "baseCommit": "a" * 40, "compareCommit": "b" * 40,
            "changeKind": "upsert",
        }
        socket = FakeWebSocket()
        with patch.object(api, "_check_socket_access", return_value=True), patch.object(
            api, "_read_batch", return_value={"cursor": 1, "changes": [event], "hasMore": False}
        ):
            await api.live_comments(socket, "project-a", 0)
        self.assertTrue(socket.accepted)
        self.assertEqual(socket.frames, [{"type": "change", **event}])
        self.assertNotIn("content", socket.frames[0])
        self.assertNotIn("project-a", api.broker._subscribers)

    async def test_socket_rejects_before_accept_and_resyncs_invalid_cursor(self) -> None:
        denied = FakeWebSocket()
        with patch.object(api, "_check_socket_access", return_value=False):
            await api.live_comments(denied, "project-a", 0)
        self.assertFalse(denied.accepted)
        self.assertEqual(denied.closed, 1008)

        stale = FakeWebSocket()
        with patch.object(api, "_check_socket_access", return_value=True), patch.object(
            api, "_read_batch", side_effect=ValueError("invalid cursor")
        ):
            await api.live_comments(stale, "project-a", 20)
        self.assertEqual(stale.frames, [{"type": "resync"}])

    async def test_broker_coalesces_wakeups_and_is_project_scoped(self) -> None:
        broker = CommentLiveBroker()
        first = broker.subscribe("project-a")
        second = broker.subscribe("project-b")
        broker.wake("project-a")
        broker.wake("project-a")
        self.assertEqual(first.qsize(), 1)
        self.assertTrue(second.empty())
        broker.unsubscribe("project-a", first)
        self.assertNotIn("project-a", broker._subscribers)

    async def test_replay_fallback_checks_once_for_two_viewers_on_one_project(self) -> None:
        broker = CommentLiveBroker()

        async def idle_listener() -> None:
            await asyncio.Event().wait()

        with patch.object(broker, "_listen", new=idle_listener), patch.object(
            broker_module, "_project_cursor", return_value=3,
        ) as read_cursor, patch.object(broker_module, "_PROJECT_REPLAY_CHECK_SECONDS", 0.01):
            broker.start()
            first = broker.subscribe("project-a")
            second = broker.subscribe("project-a")
            try:
                await asyncio.wait_for(asyncio.gather(first.get(), second.get()), 1)
                self.assertEqual(read_cursor.call_count, 1)
                self.assertEqual(len(broker._project_checks), 1)
            finally:
                await broker.stop()



class RuntimeServesWebSocketsTests(unittest.TestCase):
    def test_uvicorn_has_a_websocket_protocol_library(self) -> None:
        # Starlette's TestClient passes without one, but plain uvicorn then
        # answers every upgrade as HTTP (405) and live comments never connect.
        import importlib.util

        self.assertTrue(
            importlib.util.find_spec("websockets") or importlib.util.find_spec("wsproto"),
            "requirements/runtime.lock must include websockets (or wsproto) for uvicorn",
        )


if __name__ == "__main__":
    unittest.main()
