"""Authenticated, project-scoped replay and WebSocket hints for comments."""

from __future__ import annotations

import asyncio
import logging
import time
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.api._helpers import get_project_for_role_or_404
from app.core.config import settings
from app.core.security import AuthenticatedUser, get_current_user, require_viewer
from app.services import comment_live_events
from app.services.comment_live_broker import broker
from app.services.postgres_database import database


router = APIRouter()
logger = logging.getLogger(__name__)
_BATCH_SIZE = 200
_MAX_SOCKET_REPLAY = 1000
_ACCESS_RECHECK_SECONDS = 30.0
_SEND_TIMEOUT_SECONDS = 10.0


def _read_batch(project_id: str, after: int, limit: int = _BATCH_SIZE) -> dict:
    with database.connection() as conn:
        conn.execute('SET search_path TO "comments", public')
        head = comment_live_events.current_cursor(conn, project_id)
        changes = comment_live_events.changes_after(conn, project_id, after, limit=limit + 1)
    if after > head:
        raise ValueError("cursor is newer than project stream")
    has_more = len(changes) > limit
    changes = changes[:limit]
    # Never advance past the last delivered event. A writer can commit between
    # these two reads, and the client must still be able to replay it.
    cursor = changes[-1]["cursor"] if changes else after
    return {"cursor": cursor, "changes": changes, "hasMore": has_more}


def _can_read_live(user: AuthenticatedUser) -> bool:
    # Remote-symbol provider credentials are not project API credentials.
    if user.auth_type == "kicad_provider":
        return False
    if user.auth_type == "session":
        return True
    return bool({"api:read", "*"}.intersection(user.scopes))


def _origin_allowed(websocket: WebSocket, user: AuthenticatedUser) -> bool:
    origin = websocket.headers.get("origin")
    if not origin:
        # Non-browser clients may authenticate with an Authorization header;
        # cookie-bearing browser connections must send a verifiable Origin.
        return user.auth_type != "session"
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"}:
        return False
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        return False
    normalized = f"{parsed.scheme}://{parsed.netloc}".lower()
    configured = {value.lower() for value in settings.CORS_ORIGINS}
    public = settings.PUBLIC_BASE_URL.strip().rstrip("/").lower()
    if public:
        configured.add(public)
    # The request Host/forwarded headers are attacker-controlled unless every
    # proxy in front of us validates them. Cookie sockets must match an origin
    # configured by the deployment, never one derived from those headers.
    return normalized in configured


@router.get("/{project_id}/comments/changes")
async def get_comment_changes(
    project_id: str,
    after: int = Query(0, ge=0),
    user: AuthenticatedUser = Depends(require_viewer),
):
    if not _can_read_live(user):
        raise HTTPException(status_code=403, detail="Comment read access required")
    await asyncio.to_thread(get_project_for_role_or_404, project_id, user.role)
    try:
        return await asyncio.to_thread(_read_batch, project_id, after)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Comment cursor is invalid; reload comments") from exc


async def _check_socket_access(websocket: WebSocket, project_id: str) -> bool:
    if not settings.PRISM_COMMENT_LIVE_ENABLED:
        return False
    try:
        user = await get_current_user(websocket)
        if not _can_read_live(user) or not _origin_allowed(websocket, user):
            return False
        await asyncio.to_thread(get_project_for_role_or_404, project_id, user.role)
        return True
    except HTTPException:
        return False
    except Exception:
        logger.exception("Comment live access check failed")
        return False


async def _send_change(websocket: WebSocket, change: dict) -> None:
    await asyncio.wait_for(
        websocket.send_json({"type": "change", **change}),
        timeout=_SEND_TIMEOUT_SECONDS,
    )
    broker.record_delivery(change.get("createdAt"))


@router.websocket("/{project_id}/comments/live")
async def live_comments(websocket: WebSocket, project_id: str, after: int = 0) -> None:
    if after < 0 or not await _check_socket_access(websocket, project_id):
        await websocket.close(code=1008)
        return

    queue = broker.subscribe(project_id)
    await websocket.accept()
    cursor = after
    next_access_check = time.monotonic() + _ACCESS_RECHECK_SECONDS
    try:
        while True:
            # A notification can be lost or coalesced. The broker checks the
            # durable cursor once per project and worker and wakes subscribers.
            replayed = 0
            while True:
                try:
                    batch = await asyncio.to_thread(_read_batch, project_id, cursor)
                except ValueError:
                    broker.record_replay_failure()
                    await websocket.send_json({"type": "resync"})
                    return
                for change in batch["changes"]:
                    if change["cursor"] != cursor + 1:
                        broker.record_replay_failure()
                        await websocket.send_json({"type": "resync"})
                        return
                    await _send_change(websocket, change)
                    cursor = change["cursor"]
                    replayed += 1
                if not batch["hasMore"]:
                    cursor = max(cursor, batch["cursor"])
                    break
                if replayed >= _MAX_SOCKET_REPLAY:
                    broker.record_replay_failure()
                    await websocket.send_json({"type": "resync"})
                    return

            now = time.monotonic()
            if now >= next_access_check:
                if not await _check_socket_access(websocket, project_id):
                    await websocket.close(code=1008)
                    return
                next_access_check = now + _ACCESS_RECHECK_SECONDS

            wake = asyncio.create_task(queue.get())
            incoming = asyncio.create_task(websocket.receive())
            try:
                done, _ = await asyncio.wait(
                    {wake, incoming}, timeout=max(0.0, next_access_check - time.monotonic()),
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if incoming in done:
                    message = incoming.result()
                    if message["type"] == "websocket.disconnect":
                        return
                    # This is a read-only socket, not a mutation channel.
                    await websocket.close(code=1003)
                    return
            finally:
                for task in (wake, incoming):
                    if not task.done():
                        task.cancel()
                await asyncio.gather(wake, incoming, return_exceptions=True)
    except (WebSocketDisconnect, asyncio.TimeoutError, OSError):
        return
    except Exception:
        logger.exception("Comment live socket failed")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        broker.unsubscribe(project_id, queue)
