"""Focused coverage for R3-M5 / M7 / M8 / M10 hygiene fixes."""

from __future__ import annotations

import logging
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.drafts import (  # noqa: E402
    guard_generated_text_no_email,
    generated_text_contains_email,
)
from app.services.trackers.identity_service import validate_relative_return_to  # noqa: E402
from app.services.trackers.publication_policy import PublicationPolicyService  # noqa: E402
from app.services.trackers.reply_executor import _reply_attribution  # noqa: E402
from app.services.trackers.store import issue_number_for_api  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()


def _identity(url: str):
    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


def _dsn() -> str:
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


class DraftEmailGuardTests(unittest.TestCase):
    def test_guard_rejects_email(self) -> None:
        self.assertTrue(generated_text_contains_email("ops@example.com"))
        with self.assertRaisesRegex(ValueError, "email"):
            guard_generated_text_no_email("hello ops@example.com", what="reply attribution")

    def test_reply_attribution_omits_email_authors(self) -> None:
        with self.assertLogs("app.services.trackers.reply_executor", level="WARNING") as captured:
            line = _reply_attribution({"id": "r1", "author": "ops@example.com"})
        self.assertIsNone(line)
        self.assertTrue(any("email" in message.lower() for message in captured.output))

    def test_reply_attribution_escapes_safe_authors(self) -> None:
        line = _reply_attribution({"id": "r1", "author": "Priya <ops>"})
        self.assertEqual(line, "*Priya &lt;ops&gt;* (via Prism)")


class IssueNumberFallbackTests(unittest.TestCase):
    def test_fallback_logs_when_external_number_missing(self) -> None:
        with self.assertLogs("app.services.trackers.store", level="WARNING") as captured:
            value = issue_number_for_api({"id": "tt_1", "external_id": "412", "external_number": None})
        self.assertEqual(value, "412")
        self.assertTrue(any("missing external_number" in message for message in captured.output))

    def test_prefers_external_number_without_warning(self) -> None:
        with self.assertNoLogs("app.services.trackers.store", level="WARNING"):
            value = issue_number_for_api({"id": "tt_1", "external_id": "node", "external_number": "9"})
        self.assertEqual(value, "9")


class ReturnToValidationTests(unittest.TestCase):
    def test_rejects_backslash_and_control_chars(self) -> None:
        self.assertEqual(validate_relative_return_to("/ok/path"), "/ok/path")
        self.assertEqual(validate_relative_return_to("/evil\\windows"), "/")
        self.assertEqual(validate_relative_return_to("/has\nnewline"), "/")
        self.assertEqual(validate_relative_return_to("/has\x00null"), "/")
        self.assertEqual(validate_relative_return_to("//evil.example"), "/")
        self.assertEqual(validate_relative_return_to("https://evil.example/"), "/")


@unittest.skipUnless(POSTGRES_URL and psycopg is not None, "TEST_POSTGRES_URL required")
class ObserveBeforeWriteTxnTests(unittest.TestCase):
    """R3-M10: observe_container must run before the settings write transaction."""

    def setUp(self) -> None:
        self.schema = f"r3m10_{uuid.uuid4().hex[:10]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row, autocommit=True)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.execute(
            """
            CREATE TABLE tracker_connectors (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                instance_kind TEXT NOT NULL DEFAULT 'github.com',
                display_name TEXT NOT NULL DEFAULT '',
                base_url TEXT NOT NULL DEFAULT '',
                credential_envelope TEXT,
                bot_forge_user_id TEXT,
                bot_login TEXT,
                paused BOOLEAN NOT NULL DEFAULT FALSE,
                paused_reason TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE project_trackers (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL UNIQUE,
                connector_id TEXT NOT NULL REFERENCES tracker_connectors(id),
                container_kind TEXT NOT NULL DEFAULT 'repo',
                container_path TEXT NOT NULL DEFAULT '',
                remote_container_id TEXT NOT NULL DEFAULT '',
                destination_generation INTEGER NOT NULL DEFAULT 1,
                visibility TEXT NOT NULL DEFAULT 'unknown',
                auto_min_severity TEXT NOT NULL DEFAULT 'minor',
                auto_task_class BOOLEAN NOT NULL DEFAULT TRUE,
                promote_min_role TEXT NOT NULL DEFAULT 'designer',
                labels JSONB NOT NULL DEFAULT '{}'::jsonb
            );
            CREATE TABLE destination_acks (
                id TEXT PRIMARY KEY,
                connector_id TEXT NOT NULL,
                remote_container_id TEXT NOT NULL,
                observed_visibility TEXT NOT NULL,
                acknowledged_by TEXT NOT NULL,
                acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (connector_id, remote_container_id, observed_visibility)
            );
            CREATE TABLE tracker_audit (
                id BIGSERIAL PRIMARY KEY,
                actor_user_id TEXT,
                action TEXT NOT NULL,
                project_id TEXT,
                connector_id TEXT,
                detail JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tracker_connectors (id, provider) VALUES ('cn_1', 'github');
            """
        )
        self.events: list[str] = []

        @contextmanager
        def connect():
            with psycopg.connect(_dsn(), row_factory=dict_row) as conn:
                conn.execute(f'SET search_path TO "{self.schema}", public')
                self.events.append("conn_open")
                try:
                    yield conn
                finally:
                    self.events.append("conn_close")

        def observe(connector_id, **kwargs):
            self.events.append("observe")
            open_count = self.events.count("conn_open") - self.events.count("conn_close")
            self.assertEqual(open_count, 0, "observe_container must run outside the write txn")
            return {
                "visibility": "private",
                "containerPath": kwargs.get("container_path") or "acme/repo",
                "remoteContainerId": kwargs.get("remote_container_id") or "42",
            }

        connectors = MagicMock()
        connectors.observe_container.side_effect = observe
        connectors.get.return_value = {"id": "cn_1", "paused": False, "pausedReason": None}
        self.service = PublicationPolicyService(connect=connect, connector_service=connectors)

    def tearDown(self) -> None:
        self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
        self.conn.close()

    def test_observe_runs_between_read_and_write_connections(self) -> None:
        self.service.update_settings(
            "prj_1",
            actor_user_id="u_1",
            connector_id="cn_1",
            destination={
                "containerKind": "repo",
                "containerPath": "acme/repo",
                "remoteContainerId": "42",
                "visibility": "private",
            },
        )
        self.assertEqual(
            self.events,
            ["conn_open", "conn_close", "observe", "conn_open", "conn_close"],
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    unittest.main()
