"""Idempotency-Key replay for API writes (ADR scripting-and-mcp §3.4).

The middleware tests use a tiny app with a counter so a replay is visible as a
counter that did not move. The store-backed cases skip without
``PRISM_DATABASE_URL``, like the other PostgreSQL integration tests.
"""

from __future__ import annotations

import os
import unittest
import uuid
from unittest.mock import patch

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.core.idempotency import IdempotencyMiddleware, request_fingerprint
from app.services import idempotency_store
from app.services.postgres_database import database

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
OPERATION = "POST /api/write"


def _app(counter: dict[str, int]) -> FastAPI:
    app = FastAPI()

    @app.post("/api/write")
    async def write(request: Request) -> dict[str, int]:
        counter["count"] += 1
        body = await request.body()
        return {"count": counter["count"], "length": len(body)}

    @app.get("/api/write")
    async def read() -> dict[str, int]:
        counter["count"] += 1
        return {"count": counter["count"]}

    @app.post("/api/cookie")
    async def cookie(response: Response) -> dict[str, int]:
        counter["count"] += 1
        response.set_cookie("flavour", "oat")
        return {"count": counter["count"]}

    @app.post("/api/fail")
    async def fail() -> dict[str, int]:
        counter["count"] += 1
        raise HTTPException(status_code=500, detail="boom")

    app.add_middleware(IdempotencyMiddleware)
    return app


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required for idempotency tests")
class IdempotencyMiddlewareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.counter = {"count": 0}
        self.app = _app(self.counter)
        self.client = TestClient(self.app)
        self.prefix = f"test-{uuid.uuid4().hex}"
        self.keys: list[str] = []

    def tearDown(self) -> None:
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                "DELETE FROM ws_idempotency_keys WHERE key LIKE %s",
                (self.prefix + "%",),
            )
            connection.commit()

    def key(self, suffix: str = "") -> str:
        value = self.prefix + suffix
        self.keys.append(value)
        return value

    def insert_row(
        self,
        key: str,
        *,
        request_hash: str,
        state: str = "done",
        status_code: int | None = 200,
        headers: list[list[str]] | None = None,
        body: bytes = b"",
        age_hours: int = 0,
    ) -> None:
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                """
                INSERT INTO ws_idempotency_keys
                    (caller, operation, key, request_hash, state, status_code,
                     headers, body, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                        NOW() - make_interval(hours => %s))
                """,
                (
                    "anonymous",
                    OPERATION,
                    key,
                    request_hash,
                    state,
                    status_code,
                    Jsonb(headers) if headers is not None else None,
                    body,
                    age_hours,
                ),
            )
            connection.commit()

    def row(self, key: str) -> dict | None:
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            return connection.execute(
                "SELECT * FROM ws_idempotency_keys WHERE key = %s", (key,)
            ).fetchone()

    def fingerprint(self, body: bytes = b"") -> str:
        return request_fingerprint("POST", "/api/write", b"", body)

    def test_repeat_with_same_key_and_body_replays(self) -> None:
        key = self.key()

        first = self.client.post("/api/write", headers={"Idempotency-Key": key}, content=b"hello")
        second = self.client.post("/api/write", headers={"Idempotency-Key": key}, content=b"hello")

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(self.counter["count"], 1)
        self.assertEqual(second.headers["Idempotent-Replayed"], "true")

    def test_same_key_with_a_different_body_is_rejected(self) -> None:
        key = self.key()

        self.client.post("/api/write", headers={"Idempotency-Key": key}, content=b"first")
        response = self.client.post(
            "/api/write", headers={"Idempotency-Key": key}, content=b"second"
        )

        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["code"], "idempotency-key-reused")
        self.assertEqual(self.counter["count"], 1)

    def test_a_pending_claim_is_a_conflict(self) -> None:
        key = self.key()
        body = b"in flight"
        self.insert_row(
            key,
            request_hash=self.fingerprint(body),
            state=idempotency_store.STATE_PENDING,
            status_code=None,
        )

        response = self.client.post(
            "/api/write", headers={"Idempotency-Key": key}, content=body
        )

        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["code"], "idempotency-key-in-progress")
        self.assertEqual(self.counter["count"], 0)

    def test_a_pending_row_past_its_lease_is_reclaimed(self) -> None:
        key = self.key()
        body = b"left behind"
        self.insert_row(
            key,
            request_hash=self.fingerprint(body),
            state=idempotency_store.STATE_PENDING,
            status_code=None,
        )
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            connection.execute(
                """
                UPDATE ws_idempotency_keys
                SET created_at = NOW() - make_interval(secs => %s)
                WHERE key = %s
                """,
                (idempotency_store.PENDING_LEASE_SECONDS + 1, key),
            )
            connection.commit()

        self.assertIsNone(idempotency_store.read("anonymous", OPERATION, key))

        response = self.client.post(
            "/api/write", headers={"Idempotency-Key": key}, content=body
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["count"], 1)
        self.assertNotIn("Idempotent-Replayed", response.headers)
        self.assertEqual(self.row(key)["state"], idempotency_store.STATE_DONE)

    def test_a_vanished_claim_is_a_conflict_and_the_write_does_not_run(self) -> None:
        with (
            patch("app.core.idempotency.idempotency_store.claim", return_value=False),
            patch("app.core.idempotency.idempotency_store.read", return_value=None),
        ):
            response = self.client.post(
                "/api/write", headers={"Idempotency-Key": self.key()}, content=b"hello"
            )

        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["code"], "idempotency-key-in-progress")
        self.assertEqual(self.counter["count"], 0)

    def test_a_500_response_deletes_the_claim_and_a_retry_runs(self) -> None:
        key = self.key()
        headers = {"Idempotency-Key": key}

        first = self.client.post("/api/fail", headers=headers)
        second = self.client.post("/api/fail", headers=headers)

        self.assertEqual(first.status_code, 500)
        self.assertEqual(second.status_code, 500)
        self.assertEqual(self.counter["count"], 2)
        with database.connection() as connection:
            connection.execute("SET search_path TO workspace, public")
            remaining = connection.execute(
                "SELECT COUNT(*) AS count FROM ws_idempotency_keys WHERE key = %s",
                (key,),
            ).fetchone()
        self.assertEqual(remaining["count"], 0)

    def test_no_header_does_not_touch_the_store(self) -> None:
        with (
            patch("app.core.idempotency.idempotency_store.claim") as claim,
            patch("app.core.idempotency.idempotency_store.sweep_expired") as sweep,
        ):
            response = self.client.post("/api/write", content=b"hello")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.counter["count"], 1)
        claim.assert_not_called()
        sweep.assert_not_called()

    def test_a_get_with_the_header_passes_through(self) -> None:
        with (
            patch("app.core.idempotency.idempotency_store.claim") as claim,
            patch("app.core.idempotency.idempotency_store.sweep_expired") as sweep,
        ):
            response = self.client.get(
                "/api/write", headers={"Idempotency-Key": self.key()}
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.counter["count"], 1)
        claim.assert_not_called()
        sweep.assert_not_called()

    def test_an_invalid_key_is_refused(self) -> None:
        for invalid in ("", "x" * 256, b"caf\xe9"):
            with self.subTest(key=invalid):
                response = self.client.post(
                    "/api/write", headers={"Idempotency-Key": invalid}, content=b"hello"
                )
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json()["code"], "idempotency-key-invalid")
        self.assertEqual(self.counter["count"], 0)

    def test_a_body_over_one_mib_is_not_covered(self) -> None:
        key = self.key()
        body = b"x" * (1024 * 1024 + 1)
        headers = {"Idempotency-Key": key}

        first = self.client.post("/api/write", headers=headers, content=body)
        second = self.client.post("/api/write", headers=headers, content=body)

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.headers["Idempotency-Key-Status"], "skipped-large-body")
        self.assertEqual(first.json()["length"], len(body))
        self.assertEqual(second.json()["count"], 2)
        self.assertNotIn("Idempotent-Replayed", second.headers)
        self.assertIsNone(self.row(key))

    def test_a_row_past_retention_is_ignored_and_swept(self) -> None:
        key = self.key()
        body = b"fresh"
        self.insert_row(
            key,
            request_hash=self.fingerprint(body),
            headers=[["content-type", "application/json"]],
            body=b'{"stale": true}',
            age_hours=25,
        )

        response = self.client.post(
            "/api/write", headers={"Idempotency-Key": key}, content=body
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["count"], 1)
        self.assertNotIn("Idempotent-Replayed", response.headers)
        stored = self.row(key)
        self.assertEqual(stored["state"], "done")
        self.assertIn(b'"count":1', stored["body"])

        stale = self.key("-stale")
        self.insert_row(
            stale,
            request_hash=self.fingerprint(),
            headers=[],
            body=b"old",
            age_hours=25,
        )
        self.assertGreaterEqual(idempotency_store.sweep_expired(), 1)
        self.assertIsNone(self.row(stale))

    def test_set_cookie_is_not_stored_and_not_replayed(self) -> None:
        key = self.key()
        headers = {"Idempotency-Key": key}

        first = self.client.post("/api/cookie", headers=headers)
        second = self.client.post("/api/cookie", headers=headers)

        self.assertEqual(first.status_code, 200, first.text)
        self.assertIn("set-cookie", first.headers)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(self.counter["count"], 1)
        self.assertEqual(second.headers["Idempotent-Replayed"], "true")
        self.assertNotIn("set-cookie", second.headers)
        stored = self.row(key)
        self.assertNotIn("set-cookie", [name.lower() for name, _ in stored["headers"]])


class InstalledMiddlewareTests(unittest.TestCase):
    """The real app is built with the middleware inside the version rewrite."""

    @classmethod
    def setUpClass(cls) -> None:
        from app.core.config import settings

        cls.env = patch.dict(os.environ, {"AUTH_ENABLED": "false"})
        cls.auth = patch.object(settings, "AUTH_ENABLED_OVERRIDE", False)
        cls.env.start()
        cls.auth.start()
        cls.addClassCleanup(cls.auth.stop)
        cls.addClassCleanup(cls.env.stop)

        import app.main as main

        cls.client = TestClient(main.app)

    def test_an_invalid_key_on_an_unknown_versioned_write_is_refused(self) -> None:
        response = self.client.post(
            "/api/v1/does-not-exist",
            headers={"Idempotency-Key": "x" * 256},
        )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json()["code"], "idempotency-key-invalid")


if __name__ == "__main__":
    unittest.main()


class BodyBufferTests(unittest.TestCase):
    """A large upload is read only up to the limit; the rest streams on untouched."""

    def test_reading_stops_at_the_limit_and_the_rest_is_replayed_in_order(self) -> None:
        import asyncio

        from app.core import idempotency

        chunk = b"y" * (512 * 1024)
        messages = [{"type": "http.request", "body": chunk, "more_body": True} for _ in range(5)]
        messages[-1]["more_body"] = False
        reads = {"count": 0}

        async def receive():
            reads["count"] += 1
            return messages[reads["count"] - 1]

        async def run():
            buffered, complete = await idempotency._read_body(receive)
            self.assertFalse(complete)
            # 1 MiB + one chunk read, not the whole 2.5 MiB.
            self.assertEqual(reads["count"], 3)
            replay = idempotency._prefixed(buffered, receive)
            seen = b""
            while True:
                message = await replay()
                seen += message.get("body", b"")
                if not message.get("more_body", False):
                    return seen

        self.assertEqual(asyncio.run(run()), chunk * 5)
