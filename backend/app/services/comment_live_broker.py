"""Process-local wakeups for the durable comment change stream.

Each API process owns one PostgreSQL LISTEN connection, regardless of how many
viewers are connected. Notifications are hints only: subscribers always replay
the committed event table, including after listener failure or reconnection.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from collections import defaultdict

from app.services.comment_live_events import CHANNEL
from app.services import comment_live_events
from app.services.postgres_database import database
from app.services.postgres_database import connection_kwargs, postgres_dsn


logger = logging.getLogger(__name__)
_PROJECT_REPLAY_CHECK_SECONDS = 5.0


def _project_cursor(project_id: str) -> int:
    with database.connection() as conn:
        conn.execute('SET search_path TO "comments", public')
        return comment_live_events.current_cursor(conn, project_id)


class CommentLiveBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[None]]] = defaultdict(set)
        self._listener: asyncio.Task[None] | None = None
        self._project_checks: dict[str, asyncio.Task[None]] = {}
        self.ready = asyncio.Event()
        self._listener_reconnects = 0
        self._replay_failures = 0
        self._delivered = 0
        self._lag_total_ms = 0.0
        self._lag_max_ms = 0.0

    def metrics_snapshot(self) -> dict[str, float | int | bool]:
        return {
            "connections": sum(len(group) for group in self._subscribers.values()),
            "listenerConnected": self.ready.is_set(),
            "listenerReconnects": self._listener_reconnects,
            "replayFailures": self._replay_failures,
            "deliveredEvents": self._delivered,
            "eventLagMeanMs": self._lag_total_ms / self._delivered if self._delivered else 0.0,
            "eventLagMaxMs": self._lag_max_ms,
        }

    def record_delivery(self, created_at: str | None) -> None:
        if not created_at:
            return
        try:
            occurred = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            return
        lag_ms = max(0.0, (datetime.now(timezone.utc) - occurred).total_seconds() * 1000)
        self._delivered += 1
        self._lag_total_ms += lag_ms
        self._lag_max_ms = max(self._lag_max_ms, lag_ms)

    def record_replay_failure(self) -> None:
        self._replay_failures += 1

    def subscribe(self, project_id: str) -> asyncio.Queue[None]:
        # A full queue already means "read the durable log". Coalescing
        # additional NOTIFY messages cannot lose data.
        queue: asyncio.Queue[None] = asyncio.Queue(maxsize=1)
        self._subscribers[project_id].add(queue)
        if self._listener is not None:
            self._start_project_check(project_id)
        return queue

    def unsubscribe(self, project_id: str, queue: asyncio.Queue[None]) -> None:
        subscribers = self._subscribers.get(project_id)
        if subscribers is not None:
            subscribers.discard(queue)
            if not subscribers:
                self._subscribers.pop(project_id, None)
                check = self._project_checks.pop(project_id, None)
                if check is not None:
                    check.cancel()

    def wake(self, project_id: str) -> None:
        for queue in tuple(self._subscribers.get(project_id, ())):
            if not queue.full():
                queue.put_nowait(None)

    def start(self) -> None:
        if self._listener is None:
            self._listener = asyncio.create_task(self._listen(), name="comment-live-listener")
            for project_id in self._subscribers:
                self._start_project_check(project_id)

    def _start_project_check(self, project_id: str) -> None:
        if project_id not in self._project_checks:
            self._project_checks[project_id] = asyncio.create_task(
                self._check_project(project_id), name=f"comment-live-check-{project_id}",
            )

    async def _check_project(self, project_id: str) -> None:
        """One durable-log check per project and worker, regardless of tab count."""
        last_cursor: int | None = None
        while True:
            await asyncio.sleep(_PROJECT_REPLAY_CHECK_SECONDS)
            try:
                cursor = await asyncio.to_thread(_project_cursor, project_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                self.record_replay_failure()
                logger.exception("Comment project replay check failed for %s", project_id)
                continue
            if last_cursor is None or cursor != last_cursor:
                self.wake(project_id)
            last_cursor = cursor

    async def stop(self) -> None:
        listener = self._listener
        self._listener = None
        if listener is not None:
            listener.cancel()
            try:
                await listener
            except asyncio.CancelledError:
                pass
        checks = list(self._project_checks.values())
        self._project_checks.clear()
        for check in checks:
            check.cancel()
        if checks:
            await asyncio.gather(*checks, return_exceptions=True)
        self._subscribers.clear()
        self.ready.clear()

    async def _listen(self) -> None:
        import psycopg

        delay = 1.0
        connected_once = False
        while True:
            try:
                dsn = postgres_dsn()
                kwargs = connection_kwargs(dsn)
                kwargs["autocommit"] = True
                async with await psycopg.AsyncConnection.connect(dsn, **kwargs) as conn:
                    await conn.execute(f"LISTEN {CHANNEL}")
                    if connected_once:
                        self._listener_reconnects += 1
                    connected_once = True
                    self.ready.set()
                    delay = 1.0
                    async for notification in conn.notifies():
                        try:
                            payload = json.loads(notification.payload)
                            project_id = payload.get("projectId")
                            if isinstance(project_id, str):
                                self.wake(project_id)
                        except (TypeError, ValueError, AttributeError):
                            logger.warning("Discarded malformed comment-change notification")
            except asyncio.CancelledError:
                self.ready.clear()
                raise
            except Exception:
                logger.exception("Comment change listener disconnected; durable replay remains active")
            self.ready.clear()
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30.0)


broker = CommentLiveBroker()
