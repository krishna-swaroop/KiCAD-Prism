"""TR-22: privacy-safe mentions and forge assignee resolution (F1, F3, F8)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import SecretStr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.mentions import (  # noqa: E402
    Mention,
    build_candidate_indexes,
    convert_legacy_email_mentions,
    format_mention_token,
    list_mention_candidates,
    normalize_incoming_mentions,
    parse_mention_tokens,
    resolve_mention_assignments,
)
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))
EXAMPLES = json.loads((DOCS / "dto-examples.json").read_text(encoding="utf-8"))
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
        "AUTH_ENABLED": True,
        "OIDC_ISSUER_URL": "https://idp.example.com",
        "OIDC_CLIENT_ID": "prism",
        "OIDC_CLIENT_SECRET": "shhh",
        "SESSION_SECRET": "unit-test-session-secret-not-a-credential",
        "PUBLIC_BASE_URL": "https://prism.example",
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(ROOT_KEY),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


class MentionUnitTests(unittest.TestCase):
    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F8["cases"]}
        self.assertIn("F8.mention_linked", ids)
        self.assertIn("F8.mention_unlinked", ids)
        self.assertIn("F8.mention_overflow", ids)

    def test_dto_example_matches_frozen_mention_candidate(self) -> None:
        example = EXAMPLES["comments"]["MentionCandidate"]
        self.assertEqual(example["userId"], "u_7f2a")
        self.assertEqual(example["displayName"], "Arjun")
        self.assertIn("github", example["linkedProviders"])

    def test_legacy_email_converts_without_leaking_in_tokens(self) -> None:
        content = "Please review @arjun@example.com"
        converted, mentions = convert_legacy_email_mentions(
            content,
            email_index={"arjun@example.com": ("u_7f2a", "Arjun")},
        )
        self.assertEqual(mentions, [Mention("u_7f2a", "Arjun")])
        self.assertIn("@[Arjun](user:u_7f2a)", converted)
        self.assertNotIn("arjun@example.com", converted)

    def test_f8_mention_linked_renders_login_and_assignee(self) -> None:
        content = "Please re-route — @[Arjun](user:u_7f2a) can you take this?"
        mentions = [Mention("u_7f2a", "Arjun")]
        result = resolve_mention_assignments(
            content=content,
            mentions=mentions,
            forge_logins={"u_7f2a": "arjun-gh"},
            can_assign=lambda login: login == "arjun-gh",
            max_assignees=10,
        )
        self.assertIn("@arjun-gh", result.prose_block)
        self.assertEqual(result.assignees, ["arjun-gh"])
        self.assertEqual(result.assignment_hints, [])
        self.assertNotRegex(json.dumps(result.__dict__), r"[\w.+-]+@[\w-]+\.[\w.]+")

    def test_f8_mention_unlinked_keeps_draft_viable(self) -> None:
        content = "Ping @[Mira](user:u_mira) on this."
        result = resolve_mention_assignments(
            content=content,
            mentions=[Mention("u_mira", "Mira")],
            forge_logins={},
            can_assign=lambda _login: True,
            max_assignees=10,
        )
        self.assertIn("**Mira**", result.prose_block)
        self.assertEqual(result.assignees, [])
        self.assertEqual(result.assignment_hints, ["Assignment hint: Mira (not linked)"])
        self.assertEqual(result.warnings, [])

    def test_f8_mention_overflow_moves_extra_to_hints(self) -> None:
        mentions = [Mention(f"u_{index}", f"User {index}") for index in range(11)]
        logins = {mention.user_id: f"login-{index}" for index, mention in enumerate(mentions)}
        content = " ".join(format_mention_token(mention.display_name, mention.user_id) for mention in mentions)
        result = resolve_mention_assignments(
            content=content,
            mentions=mentions,
            forge_logins=logins,
            can_assign=lambda _login: True,
            max_assignees=10,
        )
        self.assertEqual(len(result.assignees), 10)
        self.assertTrue(any("assignee limit reached" in hint for hint in result.assignment_hints))
        self.assertEqual(result.warnings, [])

    def test_renamed_forge_handle_uses_linked_identity(self) -> None:
        token = format_mention_token("Arjun", "u_7f2a")
        parsed = parse_mention_tokens(token)
        self.assertEqual(parsed, [Mention("u_7f2a", "Arjun")])
        result = resolve_mention_assignments(
            content=token,
            mentions=parsed,
            forge_logins={"u_7f2a": "renamed-handle"},
            can_assign=lambda login: login == "renamed-handle",
            max_assignees=10,
        )
        self.assertIn("@renamed-handle", result.prose_block)
        self.assertEqual(result.assignees, ["renamed-handle"])

    def test_unassignable_login_is_warning_not_failure(self) -> None:
        result = resolve_mention_assignments(
            content="@[Arjun](user:u_7f2a)",
            mentions=[Mention("u_7f2a", "Arjun")],
            forge_logins={"u_7f2a": "arjun-gh"},
            can_assign=lambda _login: False,
            max_assignees=10,
        )
        self.assertEqual(result.assignees, [])
        self.assertEqual(result.warnings, ["Cannot assign arjun-gh on this destination"])


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class MentionPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr22_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.execute(
            """
            CREATE TABLE comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'OPEN',
                context TEXT NOT NULL DEFAULT 'PCB',
                location_x REAL NOT NULL DEFAULT 0,
                location_y REAL NOT NULL DEFAULT 0,
                location_layer TEXT NOT NULL DEFAULT '',
                location_page TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT ''
            );
            """,
            prepare=False,
        )
        migrate_workspace_tracker_tables(self.conn)
        comments_schema_migrations.apply_comments_migrations(self.conn)
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT '',
                picture TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS user_roles (
                email TEXT PRIMARY KEY,
                role TEXT NOT NULL CHECK (role IN ('admin', 'designer', 'viewer', 'qa')),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_by TEXT NOT NULL,
                user_id TEXT NOT NULL
            );
            """,
            prepare=False,
        )
        self.conn.commit()
        self.settings = _settings()
        self._seed_users()
        self._seed_connector_and_identity()

    def _cleanup(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    def _seed_users(self) -> None:
        self.conn.execute(
            """
            INSERT INTO users (user_id, email, name) VALUES
                ('u_7f2a', 'arjun@example.com', 'Arjun'),
                ('u_mira', 'mira@example.com', 'Mira')
            ON CONFLICT DO NOTHING;
            INSERT INTO user_roles (email, role, updated_at, updated_by, user_id) VALUES
                ('arjun@example.com', 'designer', NOW(), 'system@local', 'u_7f2a'),
                ('mira@example.com', 'viewer', NOW(), 'system@local', 'u_mira')
            ON CONFLICT DO NOTHING;
            """,
            prepare=False,
        )
        self.conn.commit()

    def _seed_connector_and_identity(self) -> None:
        connector_service = ConnectorService(
            connect=self._factory,
            settings=self.settings,
            tester=lambda row, material: {"ok": True, "writesEnabled": True, "bot": {"id": "1", "login": "bot"}},
            comments_schema=self.schema,
            workspace_schema=self.schema,
        )
        connector_service.create(
            actor_user_id="u_admin",
            provider="github",
            instance_kind="github.com",
            display_name="GitHub",
            credentials={"appId": "1", "installationId": "2", "privateKey": "fixture-key"},
            connector_id="cn_gh1",
        )
        with self._factory() as conn:
            conn.execute(
                """
                INSERT INTO user_identities (
                    id, user_id, connector_id, provider, forge_user_id, forge_login,
                    token_envelope, scopes, status
                ) VALUES (%s, %s, %s, %s, %s, %s, NULL, '[]'::jsonb, 'active')
                """,
                ("uid_arjun", "u_7f2a", "cn_gh1", "github", "5550001", "arjun-gh"),
            )
            conn.commit()

    @contextmanager
    def _factory(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        try:
            yield conn
        finally:
            conn.close()

    def test_list_mention_candidates_are_privacy_safe(self) -> None:
        candidates = list_mention_candidates(self.conn)
        self.assertGreaterEqual(len(candidates), 2)
        dumped = json.dumps([candidate.to_wire() for candidate in candidates])
        self.assertNotIn("arjun@example.com", dumped)
        self.assertNotIn("mira@example.com", dumped)
        arjun = next(item for item in candidates if item.user_id == "u_7f2a")
        self.assertEqual(arjun.display_name, "Arjun")
        self.assertIn("github", arjun.linked_providers)
        mira = next(item for item in candidates if item.user_id == "u_mira")
        self.assertEqual(mira.linked_providers, ())

    def test_normalize_incoming_converts_legacy_email_and_preserves_unlinked(self) -> None:
        candidates = list_mention_candidates(self.conn)
        by_id, email_index = build_candidate_indexes(candidates, conn=self.conn)
        content, mentions = normalize_incoming_mentions(
            content="Please review @arjun@example.com and @mira@example.com",
            raw_mentions=None,
            candidates_by_id=by_id,
            email_index=email_index,
        )
        self.assertIn("@[Arjun](user:u_7f2a)", content)
        self.assertIn("@[Mira](user:u_mira)", content)
        self.assertNotIn("@example.com", content)
        self.assertEqual({mention.user_id for mention in mentions}, {"u_7f2a", "u_mira"})


if __name__ == "__main__":
    unittest.main()
