"""Replay a write when the caller retries it with the same ``Idempotency-Key``.

ADR scripting-and-mcp §3.4. Pure ASGI so the request body can be buffered and
the response streamed unchanged. Only HTTP writes under ``/api/`` that carry the
header are involved; everything else passes through untouched.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import threading
import time
from collections.abc import Sequence
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import BadRequest, Conflict, Invalid, Unavailable, error_response
from app.core.session import SESSION_COOKIE_NAME
from app.services import idempotency_store

logger = logging.getLogger(__name__)

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
API_PATH_PREFIX = "/api/"
MAX_BODY_BYTES = 1024 * 1024
KEY_HEADER = b"idempotency-key"
REPLAYED_HEADER = (b"idempotent-replayed", b"true")
SKIPPED_HEADER = (b"idempotency-key-status", b"skipped-large-body")
SWEEP_INTERVAL_SECONDS = 60 * 60

_sweep_lock = threading.Lock()
_last_sweep = time.monotonic()


def request_fingerprint(method: str, path: str, query_string: bytes, body: bytes) -> str:
    """The request identity that makes reusing a key with another body a mistake."""

    digest = hashlib.sha256()
    digest.update(method.encode("utf-8"))
    digest.update(b"\n")
    digest.update(path.encode("utf-8"))
    digest.update(b"\n")
    digest.update(query_string)
    digest.update(b"\n")
    digest.update(body)
    return digest.hexdigest()


def caller_for(headers: Sequence[tuple[bytes, bytes]]) -> str:
    """Identify the caller without trusting anything the body says.

    The authorization header wins over the session cookie, and both are hashed
    so the store never holds a credential.
    """

    authorization = _header(headers, b"authorization")
    if authorization is not None:
        return hashlib.sha256(authorization).hexdigest()
    cookie = _header(headers, b"cookie")
    if cookie is not None:
        session = _session_cookie(cookie)
        if session is not None:
            return hashlib.sha256(session).hexdigest()
    return "anonymous"


def valid_key(value: bytes) -> bool:
    return 1 <= len(value) <= 255 and all(0x20 <= byte <= 0x7E for byte in value)


def _header(headers: Sequence[tuple[bytes, bytes]], name: bytes) -> bytes | None:
    for header_name, value in headers:
        if header_name.lower() == name:
            return value
    return None


def _session_cookie(cookie_header: bytes) -> bytes | None:
    prefix = SESSION_COOKIE_NAME.encode("latin-1") + b"="
    for part in cookie_header.split(b";"):
        part = part.strip()
        if part.startswith(prefix):
            return part[len(prefix) :]
    return None


async def _read_body(receive: Receive) -> tuple[list[Message], bool]:
    """Buffer the request up to ``MAX_BODY_BYTES``; report whether it all fit.

    A larger body stops being read at the limit, so an upload of gigabytes is
    never held in memory: the messages read so far are handed on first and the
    rest streams from ``receive`` (see ``_prefixed``).
    """

    messages: list[Message] = []
    size = 0
    while True:
        message = await receive()
        messages.append(message)
        if message["type"] != "http.request":
            return messages, True
        size += len(message.get("body", b""))
        if size > MAX_BODY_BYTES:
            return messages, False
        if not message.get("more_body", False):
            return messages, True


def _joined(messages: Sequence[Message]) -> bytes:
    return b"".join(message.get("body", b"") for message in messages if message["type"] == "http.request")


def _prefixed(messages: Sequence[Message], receive: Receive) -> Receive:
    """A receive callable that replays ``messages`` and then reads on from ``receive``."""

    pending = list(messages)

    async def replay() -> Message:
        if pending:
            return pending.pop(0)
        return await receive()

    return replay


def _body_replay(body: bytes) -> Receive:
    """A receive callable that hands the buffered body to the wrapped app once."""

    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


class _CapturedResponse:
    """Forward every message untouched while keeping what is needed to store it."""

    def __init__(self, send: Send) -> None:
        self._send = send
        self.status: int | None = None
        self.headers: list[tuple[bytes, bytes]] = []
        self.body = bytearray()
        self.oversize = False

    async def send(self, message: Message) -> None:
        if message["type"] == "http.response.start":
            self.status = int(message["status"])
            self.headers = [
                (bytes(name), bytes(value)) for name, value in message.get("headers", [])
            ]
        elif (
            message["type"] == "http.response.body"
            and self.status is not None
            and self.status < 500
        ):
            chunk = message.get("body", b"")
            if not self.oversize:
                if len(self.body) + len(chunk) > MAX_BODY_BYTES:
                    self.oversize = True
                    self.body.clear()
                else:
                    self.body.extend(chunk)
        await self._send(message)


def _stored_headers(headers: Sequence[tuple[bytes, bytes]]) -> list[list[str]]:
    return [
        [name.decode("latin-1"), value.decode("latin-1")]
        for name, value in headers
        if name.lower() != b"set-cookie"
    ]


async def _send_replay(send: Send, row: dict[str, Any]) -> None:
    headers = [
        (str(name).encode("latin-1"), str(value).encode("latin-1"))
        for name, value in (row.get("headers") or [])
    ]
    headers.append(REPLAYED_HEADER)
    await send(
        {
            "type": "http.response.start",
            "status": int(row["status_code"]),
            "headers": headers,
        }
    )
    await send({"type": "http.response.body", "body": bytes(row.get("body") or b"")})


class IdempotencyMiddleware:
    """Serve a repeated write from its first response instead of running it twice."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._applies(scope):
            await self.app(scope, receive, send)
            return

        key = _header(scope["headers"], KEY_HEADER)
        assert key is not None
        if not valid_key(key):
            await error_response(
                BadRequest(
                    "Idempotency-Key must be 1-255 printable ASCII characters",
                    code="idempotency-key-invalid",
                )
            )(scope, receive, send)
            return

        messages, complete = await _read_body(receive)
        if not complete:
            await self._pass_through_large_body(scope, _prefixed(messages, receive), send)
            return
        body = _joined(messages)

        await self._sweep_if_due()

        method = str(scope["method"])
        path = str(scope["path"])
        caller = caller_for(scope.get("headers", []))
        operation = f"{method} {path}"
        fingerprint = request_fingerprint(method, path, scope.get("query_string", b""), body)
        key_text = key.decode("latin-1")
        downstream_receive = _body_replay(body)

        try:
            won = await asyncio.to_thread(
                idempotency_store.claim, caller, operation, key_text, fingerprint
            )
        except Exception:
            logger.exception("Idempotency store unavailable while claiming a key")
            await error_response(
                Unavailable("The idempotency store is unavailable", code="idempotency-unavailable")
            )(scope, receive, send)
            return

        if not won:
            await self._answer_loser(
                scope,
                send,
                downstream_receive,
                caller,
                operation,
                key_text,
                fingerprint,
            )
            return

        capture = _CapturedResponse(send)
        try:
            await self.app(scope, downstream_receive, capture.send)
        except BaseException:
            await self._release(caller, operation, key_text)
            raise

        if capture.status is None or capture.status >= 500 or capture.oversize:
            await self._release(caller, operation, key_text)
            return

        try:
            await asyncio.to_thread(
                idempotency_store.complete,
                caller,
                operation,
                key_text,
                capture.status,
                _stored_headers(capture.headers),
                bytes(capture.body),
            )
        except Exception:
            logger.exception("Could not store an idempotent response")
            await self._release(caller, operation, key_text)

    @staticmethod
    def _applies(scope: Scope) -> bool:
        return (
            scope.get("type") == "http"
            and str(scope.get("method", "")).upper() in WRITE_METHODS
            and str(scope.get("path", "")).startswith(API_PATH_PREFIX)
            and _header(scope.get("headers", []), KEY_HEADER) is not None
        )

    async def _answer_loser(
        self,
        scope: Scope,
        send: Send,
        receive: Receive,
        caller: str,
        operation: str,
        key: str,
        fingerprint: str,
    ) -> None:
        try:
            row = await asyncio.to_thread(idempotency_store.read, caller, operation, key)
        except Exception:
            logger.exception("Idempotency store unavailable while reading a key")
            await error_response(
                Unavailable("The idempotency store is unavailable", code="idempotency-unavailable")
            )(scope, receive, send)
            return

        if row is None:
            # The claim vanished between the insert and this read, or its lease
            # expired. Answer as for any in-progress claim so the client retries
            # and claims the key normally rather than writing unclaimed.
            await error_response(
                Conflict(
                    "A request with this Idempotency-Key is still in progress",
                    code="idempotency-key-in-progress",
                )
            )(scope, receive, send)
            return

        if row["request_hash"] != fingerprint:
            await error_response(
                Invalid(
                    "This Idempotency-Key was used for a different request",
                    code="idempotency-key-reused",
                )
            )(scope, receive, send)
            return

        if row["state"] != idempotency_store.STATE_DONE:
            await error_response(
                Conflict(
                    "A request with this Idempotency-Key is still in progress",
                    code="idempotency-key-in-progress",
                )
            )(scope, receive, send)
            return

        await _send_replay(send, row)

    async def _pass_through_large_body(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_status(message: Message) -> None:
            if message["type"] == "http.response.start":
                message = dict(message)
                message["headers"] = [*(message.get("headers") or []), SKIPPED_HEADER]
            await send(message)

        await self.app(scope, receive, send_with_status)

    async def _sweep_if_due(self) -> None:
        global _last_sweep
        now = time.monotonic()
        with _sweep_lock:
            if now - _last_sweep < SWEEP_INTERVAL_SECONDS:
                return
            _last_sweep = now
        try:
            await asyncio.to_thread(idempotency_store.sweep_expired)
        except Exception:
            logger.exception("Could not sweep expired idempotency keys")

    @staticmethod
    async def _release(caller: str, operation: str, key: str) -> None:
        try:
            await asyncio.to_thread(idempotency_store.release, caller, operation, key)
        except Exception:
            logger.exception("Could not release an idempotency claim")
