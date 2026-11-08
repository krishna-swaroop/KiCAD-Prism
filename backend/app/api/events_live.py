"""Authenticated live event socket, ``GET /api/events/live`` (ADR §3.10).

One socket per signed-in client streams the append-only event log. The table is
the record: the client's cursor is the only state, and a reconnecting client
replays from it. ``NOTIFY`` is a hint from the broker; every read here goes
through :func:`event_log.list_after` in a worker thread, so the policy table and
folder visibility apply per event delivered.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.api._helpers import get_project_for_role_or_404
from app.api.comment_live import _origin_allowed
from app.api.events import EventOut
from app.core import policy
from app.core.security import AuthenticatedUser, get_current_user
from app.services import event_log
from app.services.event_live_broker import broker


router = APIRouter(prefix="/api/events", tags=["events-live"])
logger = logging.getLogger(__name__)

_BATCH_SIZE = 200
_HEARTBEAT_SECONDS = 25.0
_ACCESS_RECHECK_SECONDS = 60.0
_SEND_TIMEOUT_SECONDS = 10.0
_PROJECT_PREFIX = "project:"


class BadSubscribe(ValueError):
    """A client frame that is not a usable subscribe message."""


def _read(after: int, user: AuthenticatedUser, topics: list[str] | None) -> tuple[list[dict[str, Any]], int]:
    return event_log.list_after(
        after,
        role=user.role,
        is_admin=policy.role_allows(user.role, "admin"),
        topics=topics,
        limit=_BATCH_SIZE,
    )


async def _check_socket_access(websocket: WebSocket) -> AuthenticatedUser | None:
    """The caller, or None when this socket must be refused before accepting."""
    try:
        user = await get_current_user(websocket)
        policy.authorize(user, "read")
        if not _origin_allowed(websocket, user):
            return None
        return user
    except HTTPException:
        return None
    except Exception:
        logger.exception("Event live access check failed")
        return None


async def _visible_topics(raw: Any, user: AuthenticatedUser) -> tuple[list[str] | None, list[str]]:
    """The topics to read, and the project topics the caller may not see.

    An absent or empty list means everything the caller may see (``None``).
    When every requested topic is refused the result is an empty list, which
    matches no event rather than silently widening to everything.
    """
    if raw is None:
        return None, []
    if not isinstance(raw, list) or any(not isinstance(topic, str) for topic in raw):
        raise BadSubscribe("topics must be a list of strings")
    if not raw:
        return None, []

    allowed: list[str] = []
    forbidden: list[str] = []
    for topic in dict.fromkeys(raw):
        if not topic.startswith(_PROJECT_PREFIX):
            allowed.append(topic)
            continue
        try:
            await asyncio.to_thread(
                get_project_for_role_or_404, topic[len(_PROJECT_PREFIX):], user.role
            )
        except HTTPException:
            forbidden.append(topic)
            continue
        allowed.append(topic)
    return allowed, forbidden


async def _send_events(websocket: WebSocket, events: list[dict[str, Any]], cursor: int) -> None:
    frame = {
        "type": "events",
        "events": [EventOut.model_validate(event).model_dump() for event in events],
        "next": cursor,
    }
    await asyncio.wait_for(websocket.send_json(frame), timeout=_SEND_TIMEOUT_SECONDS)


async def _send_error(websocket: WebSocket, code: str, **extra: Any) -> None:
    await asyncio.wait_for(
        websocket.send_json({"type": "error", "code": code, **extra}),
        timeout=_SEND_TIMEOUT_SECONDS,
    )


async def _deliver(
    websocket: WebSocket,
    cursor: int,
    user: AuthenticatedUser,
    topics: list[str] | None,
    *,
    send_empty: bool = False,
) -> tuple[int, bool]:
    """Send every visible event after ``cursor``; return the new cursor and whether any went out.

    A read that returns no event does not move the cursor, because a hidden
    event must not make the client skip a later visible one.
    """
    delivered = False
    while True:
        events, next_cursor = await asyncio.to_thread(_read, cursor, user, topics)
        if events:
            await _send_events(websocket, events, next_cursor)
            delivered = True
        elif send_empty and not delivered:
            await _send_events(websocket, [], next_cursor)
            send_empty = False
        cursor = next_cursor
        if len(events) < _BATCH_SIZE:
            return cursor, delivered


def _subscribe_cursor(frame: dict[str, Any], current: int) -> int:
    if "after" not in frame:
        return current
    after = frame["after"]
    if isinstance(after, bool) or not isinstance(after, int) or after < 0:
        raise BadSubscribe("after must be a non-negative integer")
    return after


async def _subscribe(
    websocket: WebSocket,
    frame: dict[str, Any],
    user: AuthenticatedUser,
    cursor: int,
) -> tuple[int, list[str] | None]:
    """Apply one subscribe frame; return its cursor and the topics to read next."""
    if frame.get("type") != "subscribe":
        raise BadSubscribe("expected a subscribe frame")
    topics, forbidden = await _visible_topics(frame.get("topics"), user)
    for topic in forbidden:
        await _send_error(websocket, "topic-forbidden", topic=topic)
    cursor, _delivered = await _deliver(
        websocket, _subscribe_cursor(frame, cursor), user, topics, send_empty=True
    )
    return cursor, topics


@router.websocket("/live")
async def live_events(websocket: WebSocket) -> None:
    user = await _check_socket_access(websocket)
    if user is None:
        await websocket.close(code=1008)
        return

    queue = broker.subscribe()
    await websocket.accept()
    topics: list[str] | None = None
    raw_topics: Any = None
    cursor = 0
    # Nothing is delivered before the first subscribe frame: it carries the
    # client's cursor, and reading from 0 would replay the whole retained log.
    subscribed = False
    access_checked_at = time.monotonic()

    async def refresh_access() -> bool:
        """False when this socket must close because access was revoked."""
        nonlocal user, topics, access_checked_at
        now = time.monotonic()
        if now - access_checked_at < _ACCESS_RECHECK_SECONDS:
            return True
        fresh = await _check_socket_access(websocket)
        if fresh is None:
            return False
        user = fresh
        if raw_topics is not None:
            previous = set(topics or [])
            topics, forbidden = await _visible_topics(raw_topics, user)
            for topic in forbidden:
                if topic in previous:
                    await _send_error(websocket, "topic-forbidden", topic=topic)
        access_checked_at = now
        return True

    try:
        heartbeat_at = time.monotonic() + _HEARTBEAT_SECONDS
        while True:
            wake = asyncio.create_task(queue.get())
            incoming = asyncio.create_task(websocket.receive())
            try:
                done, _ = await asyncio.wait(
                    {wake, incoming},
                    timeout=max(0.0, heartbeat_at - time.monotonic()),
                    return_when=asyncio.FIRST_COMPLETED,
                )
            finally:
                for task in (wake, incoming):
                    if not task.done():
                        task.cancel()
                await asyncio.gather(wake, incoming, return_exceptions=True)

            if incoming in done:
                message = incoming.result()
                if message.get("type") == "websocket.disconnect":
                    return
                if message.get("type") != "websocket.receive":
                    continue
                if message.get("text") is None:
                    await websocket.close(code=1003)
                    return
                try:
                    frame = json.loads(message["text"])
                    if not isinstance(frame, dict):
                        raise BadSubscribe("a frame must be a JSON object")
                    if not await refresh_access():
                        await websocket.close(code=1008)
                        return
                    cursor, topics = await _subscribe(websocket, frame, user, cursor)
                    raw_topics = frame.get("topics")
                    subscribed = True
                except (BadSubscribe, json.JSONDecodeError):
                    await _send_error(websocket, "invalid-subscribe")
                heartbeat_at = time.monotonic() + _HEARTBEAT_SECONDS
                continue

            if wake in done:
                # Coalesced hints: one durable read covers every notification
                # that arrived while this socket was busy.
                while not queue.empty():
                    queue.get_nowait()
                if subscribed:
                    if not await refresh_access():
                        await websocket.close(code=1008)
                        return
                    cursor, _delivered = await _deliver(websocket, cursor, user, topics)
            else:
                # Idle. Read anyway so a lost NOTIFY cannot stall the stream,
                # and send the heartbeat when the read found nothing.
                delivered = False
                if subscribed:
                    if not await refresh_access():
                        await websocket.close(code=1008)
                        return
                    cursor, delivered = await _deliver(websocket, cursor, user, topics)
                if not delivered:
                    await asyncio.wait_for(
                        websocket.send_json({"type": "heartbeat", "next": cursor}),
                        timeout=_SEND_TIMEOUT_SECONDS,
                    )
            heartbeat_at = time.monotonic() + _HEARTBEAT_SECONDS
    except (WebSocketDisconnect, asyncio.TimeoutError, OSError):
        return
    except Exception:
        logger.exception("Event live socket failed")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        broker.unsubscribe(queue)
