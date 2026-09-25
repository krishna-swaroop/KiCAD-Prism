"""TR-27: signed GitHub webhook ingestion into durable inbox (F3, F4, F5, F7)."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from pydantic import SecretStr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings  # noqa: E402
from app.api import tracker_webhooks as webhooks_api  # noqa: E402
from app.services.trackers.github_webhooks import (  # noqa: E402
    TrackerWebhookService,
    WebhookRejected,
    parse_github_event,
    verify_signature,
)
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.migrations import (  # noqa: E402
    migrate_tracker_webhook_oauth_tables,
    migrate_workspace_tracker_tables,
)

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
WEBHOOK_SECRET = "webhook-secret-fixture-tr27"
ROOT_KEY = "aa" * 32


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


def _settings(**overrides) -> Settings:
    base = {
        "SESSION_SECRET": "unit-test-session-secret-not-a-credential",
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(ROOT_KEY),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def run(coro):
    return asyncio.run(coro)


class RoutingContractTests(unittest.TestCase):
    def test_main_registers_webhook_route(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("tracker_webhooks_router", source)
        self.assertIn("initialize_tracker_webhook_service", source)
        app = FastAPI()
        app.include_router(webhooks_api.router)
        self.assertIn("/api/trackers/webhooks/{provider}/{connector_id}", set(app.openapi()["paths"]))

    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F7["cases"]}
        self.assertIn("F7.bad_signature", ids)
        self.assertIn("F7.duplicate_delivery", ids)
        self.assertIn("F7.hint_durable_before_2xx", ids)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class GitHubWebhookPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr27_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        migrate_workspace_tracker_tables(self.conn)
        migrate_tracker_webhook_oauth_tables(self.conn)
        apply_inbox_schema(self.conn)
        self.conn.execute(
            """
            INSERT INTO tracker_connectors (id, provider, instance_kind, display_name)
            VALUES ('cn_gh1', 'github', 'github.com', 'GitHub')
            """
        )
        self.conn.commit()
        self.settings = _settings()
        self.service = TrackerWebhookService(
            connect=self._factory,
            settings=self.settings,
            comments_schema=self.schema,
            workspace_schema=self.schema,
        )
        webhooks_api.service = self.service
        self.service.configure_secret("cn_gh1", WEBHOOK_SECRET)
        self.provider_calls = 0

    def _cleanup(self) -> None:
        webhooks_api.service = TrackerWebhookService()
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

    def _payload(self) -> bytes:
        body = {
            "action": "opened",
            "issue": {"id": 9001, "number": 412},
            "repository": {"id": 987654321, "full_name": "acme/openswitch"},
            "sender": {"id": 5550001, "login": "arjun-gh", "type": "User"},
        }
        return json.dumps(body).encode("utf-8")

    def _headers(self, body: bytes, delivery: str = "delivery-1", signature: str | None = None) -> dict[str, str]:
        return {
            "X-GitHub-Delivery": delivery,
            "X-GitHub-Event": "issues",
            "X-Hub-Signature-256": signature if signature is not None else _sign(body),
        }

    def test_bad_signature_rejected_without_persisting(self) -> None:
        body = self._payload()
        with self.assertRaises(WebhookRejected):
            self.service.ingest("cn_gh1", self._headers(body, signature="sha256=dead"), body)
        count = self.conn.execute("SELECT COUNT(*) AS n FROM remote_deliveries").fetchone()
        self.assertEqual(int(count["n"]), 0)

    def test_verify_uses_raw_bytes(self) -> None:
        body = self._payload()
        self.assertTrue(verify_signature(self._headers(body), body, WEBHOOK_SECRET))
        tampered = body + b" "
        self.assertFalse(verify_signature(self._headers(body), tampered, WEBHOOK_SECRET))

    def test_duplicate_delivery_is_idempotent(self) -> None:
        body = self._payload()
        headers = self._headers(body, delivery="dup-1")
        first = self.service.ingest("cn_gh1", headers, body)
        second = self.service.ingest("cn_gh1", headers, body)
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["hintCount"], second["hintCount"])
        hints = self.conn.execute("SELECT COUNT(*) AS n FROM remote_hints").fetchone()
        deliveries = self.conn.execute("SELECT COUNT(*) AS n FROM remote_deliveries").fetchone()
        self.assertEqual(int(hints["n"]), 1)
        self.assertEqual(int(deliveries["n"]), 1)

    def test_delivery_persisted_before_success_response(self) -> None:
        body = self._payload()
        headers = self._headers(body, delivery="durability-1")

        class _Request:
            def __init__(self, raw: bytes, hdrs: dict[str, str]) -> None:
                self._raw = raw
                self.headers = hdrs

            async def stream(self):
                yield self._raw

        response = run(webhooks_api.tracker_webhook("github", "cn_gh1", _Request(body, headers)))
        self.assertEqual(response.status_code, 200)
        row = self.conn.execute(
            "SELECT delivery_id FROM remote_deliveries WHERE connector_id = 'cn_gh1'"
        ).fetchone()
        self.assertEqual(row["delivery_id"], "durability-1")

    def test_unknown_event_acknowledged_without_hints(self) -> None:
        body = json.dumps({"zen": "non-parsing fixture"}).encode("utf-8")
        headers = {
            "X-GitHub-Delivery": "unknown-1",
            "X-GitHub-Event": "watch",
            "X-Hub-Signature-256": _sign(body),
        }
        result = self.service.ingest("cn_gh1", headers, body)
        self.assertEqual(result["hintCount"], 0)
        self.assertTrue(result["created"])
        hints = self.conn.execute("SELECT COUNT(*) AS n FROM remote_hints").fetchone()
        self.assertEqual(int(hints["n"]), 0)

    def test_oversize_payload_rejected(self) -> None:
        body = b"x" * (1024 * 1024 + 1)
        headers = self._headers(b"{}", delivery="big-1")
        with self.assertRaises(WebhookRejected):
            self.service.ingest("cn_gh1", headers, body)

    def test_issue_comment_parses_object_reference_only(self) -> None:
        payload = {
            "action": "created",
            "issue": {"id": 9001, "number": 412},
            "comment": {"id": 2211044},
            "repository": {"id": 987654321},
            "sender": {"id": 5550001, "login": "arjun-gh"},
        }
        hints = parse_github_event("issue_comment", payload, connector_id="cn_gh1", delivery_id="d1")
        self.assertEqual(len(hints), 1)
        self.assertEqual(hints[0]["objectKind"], "comment")
        self.assertEqual(hints[0]["externalCommentId"], "2211044")
        self.assertEqual(hints[0]["externalId"], "412")
        self.assertNotEqual(hints[0]["externalId"], str(payload["issue"]["id"]))
        self.assertNotIn("body", json.dumps(hints))

    def test_issue_webhook_hint_uses_number_not_immutable_id(self) -> None:
        payload = {
            "action": "opened",
            "issue": {"id": 9001, "number": 412},
            "repository": {"id": 987654321, "full_name": "acme/openswitch"},
            "sender": {"id": 5550001, "login": "arjun-gh", "type": "User"},
        }
        hints = parse_github_event("issues", payload, connector_id="cn_gh1", delivery_id="d2")
        self.assertEqual(len(hints), 1)
        self.assertEqual(hints[0]["externalId"], "412")
        self.assertNotEqual(hints[0]["externalId"], "9001")

    def test_http_invalid_signature_returns_401(self) -> None:
        body = self._payload()

        class _Request:
            def __init__(self, raw: bytes, hdrs: dict[str, str]) -> None:
                self._raw = raw
                self.headers = hdrs

            async def stream(self):
                yield self._raw

        with self.assertRaises(HTTPException) as caught:
            run(webhooks_api.tracker_webhook(
                "github",
                "cn_gh1",
                _Request(body, {
                    "X-GitHub-Delivery": "bad-1",
                    "X-GitHub-Event": "issues",
                    "X-Hub-Signature-256": "sha256=bad",
                }),
            ))
        self.assertEqual(caught.exception.status_code, 401)

    def test_http_unknown_provider_returns_404(self) -> None:
        body = self._payload()
        with self.assertRaises(HTTPException) as caught:
            run(webhooks_api.tracker_webhook("bitbucket", "cn_gh1", _StreamRequest(body, self._headers(body))))
        self.assertEqual(caught.exception.status_code, 404)

    def test_delivery_to_another_providers_path_is_refused(self) -> None:
        """A correctly signed GitHub body sent to another forge's path must not land."""

        from app.services.trackers import providers

        codec = providers.webhook_codec("github")
        providers._WEBHOOK_FACTORIES["otherforge"] = lambda: codec
        self.addCleanup(providers._WEBHOOK_FACTORIES.pop, "otherforge", None)
        body = self._payload()
        with self.assertRaises(HTTPException) as caught:
            run(webhooks_api.tracker_webhook("otherforge", "cn_gh1", _StreamRequest(body, self._headers(body))))
        self.assertEqual(caught.exception.status_code, 401)
        count = self.conn.execute("SELECT COUNT(*) AS n FROM remote_deliveries").fetchone()["n"]
        self.assertEqual(count, 0)


    def test_http_oversized_body_returns_413(self) -> None:
        from app.services.trackers.github_webhooks import MAX_BODY_BYTES

        body = b"x" * (MAX_BODY_BYTES + 1)

        class _Request:
            headers = {"X-GitHub-Delivery": "big-1", "X-GitHub-Event": "issues"}

            async def stream(self):
                yield body

        with self.assertRaises(HTTPException) as caught:
            run(webhooks_api.tracker_webhook("github", "cn_gh1", _Request()))
        self.assertEqual(caught.exception.status_code, 413)


class _StreamRequest:
    def __init__(self, raw: bytes, hdrs: dict[str, str]) -> None:
        self._raw = raw
        self.headers = hdrs

    async def stream(self):
        yield self._raw


if __name__ == "__main__":
    unittest.main()
