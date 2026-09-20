"""TR-21: connected-account OAuth and revocation APIs (F3)."""

from __future__ import annotations

import asyncio
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
from app.core.security import AuthenticatedUser  # noqa: E402
from app.api import tracker_identity as identity_api  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.contracts import ForgeUser, IdentityToken  # noqa: E402
from app.services.trackers.github_identity import GitHubIdentityAdapter, GitHubOAuthApp  # noqa: E402
from app.services.trackers.identity_service import (  # noqa: E402
    IdentityService,
    OAuthStateError,
    bump_user_cache,
    user_cache_version,
)
from app.services.trackers.identity_service import build_oauth_return_url  # noqa: E402
from app.services.trackers.migrations import (  # noqa: E402
    migrate_tracker_webhook_oauth_tables,
    migrate_workspace_tracker_tables,
)
from app.services.trackers.secrets import decrypt_secret  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
CLIENT_SECRET = "oauth-client-secret-fixture-tr21"
TEST_SESSION_SECRET = "unit-test-session-secret-not-a-credential"
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
        "SESSION_SECRET": TEST_SESSION_SECRET,
        "PUBLIC_BASE_URL": "https://prism.example",
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(ROOT_KEY),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def session(role: str, *, user_id: str = "u_1", session_id: str = "sid_1") -> AuthenticatedUser:
    return AuthenticatedUser(
        email=f"{user_id}@example.com",
        name=role,
        role=role,  # type: ignore[arg-type]
        session_id=session_id,
        user_id=user_id,
    )


def run(coro):
    return asyncio.run(coro)


class _FakeAdapter(GitHubIdentityAdapter):
    def __init__(self) -> None:
        self.app = GitHubOAuthApp(
            client_id="ov_client_fixture",
            client_secret=CLIENT_SECRET,
            redirect_uri="https://prism.example/api/trackers/oauth/callback",
        )
        self.calls: list[str] = []

    def authorize_url(self, state: str, pkce_challenge: str) -> str:
        self.calls.append("authorize")
        return f"https://github.com/login/oauth/authorize?state={state}&challenge={pkce_challenge}"

    def exchange(self, code: str, pkce_verifier: str) -> IdentityToken:
        self.calls.append("exchange")
        if code != "good-code" or not pkce_verifier:
            raise OAuthStateError("bad_code")
        return IdentityToken(
            accessToken="user-access-token-fixture",
            refreshToken="user-refresh-token-fixture",
            scopes=["read:user"],
            expiresAt="2026-09-20T19:20:00Z",
        )

    def refresh(self, token: IdentityToken) -> IdentityToken:
        self.calls.append("refresh")
        return IdentityToken(
            accessToken="user-access-token-refreshed",
            refreshToken=token.refreshToken,
            scopes=token.scopes,
            expiresAt="2026-09-20T20:20:00Z",
        )

    def whoami(self, token: IdentityToken) -> ForgeUser:
        self.calls.append("whoami")
        return ForgeUser(id="5550001", login="arjun-gh", displayName="Arjun")


class RoutingContractTests(unittest.TestCase):
    def test_main_registers_identity_routes(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("tracker_identity_router", source)
        self.assertIn("initialize_tracker_identity_service", source)
        app = FastAPI()
        app.include_router(identity_api.router)
        app.include_router(identity_api.admin_router)
        paths = set(app.openapi()["paths"])
        self.assertIn("/api/trackers/identities", paths)
        self.assertIn("/api/trackers/connectors/{connector_id}/oauth/begin", paths)
        self.assertIn("/api/trackers/oauth/callback", paths)
        self.assertIn("/api/trackers/identities/{connector_id}", paths)

    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F3["cases"]}
        self.assertIn("F3.oauth_revoke", ids)
        self.assertIn("F3.identity_bound_to_user_and_connector", ids)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class IdentityOAuthPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr21_{uuid.uuid4().hex[:12]}"
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
        migrate_tracker_webhook_oauth_tables(self.conn)
        comments_schema_migrations.apply_comments_migrations(self.conn)
        self.conn.commit()
        self.settings = _settings()
        self.fake = _FakeAdapter()
        connector_service = ConnectorService(
            connect=self._factory,
            settings=self.settings,
            tester=lambda row, material: {"ok": True, "writesEnabled": True, "bot": {"id": "1", "login": "bot"}},
            comments_schema=self.schema,
            workspace_schema=self.schema,
        )
        self.service = IdentityService(
            connect=self._factory,
            settings=self.settings,
            connector_service=connector_service,
            adapter_factory=lambda app: self.fake,
            workspace_schema=self.schema,
        )
        identity_api.service = self.service
        self.user = session("designer", user_id="u_1", session_id="sid_alpha")
        self.other = session("designer", user_id="u_2", session_id="sid_beta")
        self.admin = session("admin", user_id="u_admin", session_id="sid_admin")
        self._seed_connector()

    def _cleanup(self) -> None:
        identity_api.service = IdentityService()
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

    def _seed_connector(self) -> None:
        connector_service = ConnectorService(connect=self._factory, settings=self.settings, workspace_schema=self.schema)
        connector_service.create(
            actor_user_id="u_admin",
            provider="github",
            instance_kind="github.com",
            display_name="GitHub",
            credentials={"appId": "1", "installationId": "2", "privateKey": "fixture-key"},
            connector_id="cn_gh1",
        )
        self.service.configure_oauth_client("cn_gh1", client_id="ov_client_fixture", client_secret=CLIENT_SECRET)

    def test_begin_callback_list_and_unlink(self) -> None:
        begin = run(
            identity_api.begin_oauth(
                "cn_gh1",
                request=_request(),
                returnTo="/workspace?tab=accounts",
                user=self.user,
            )
        )
        self.assertIn("github.com/login/oauth/authorize", begin.authorizeUrl)
        state = begin.authorizeUrl.split("state=")[1].split("&")[0]
        linked = run(
            identity_api.oauth_callback(
                request=_request(),
                code="good-code",
                state=state,
                user=self.user,
            )
        )
        self.assertEqual(linked.status_code, 302)
        self.assertEqual(
            linked.headers["location"],
            build_oauth_return_url("/workspace?tab=accounts", linked=True),
        )
        listed = run(identity_api.list_identities(self.user))
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["forgeLogin"], "arjun-gh")
        self.assertEqual(listed[0]["status"], "active")
        dumped = json.dumps(listed)
        self.assertNotIn("user-access-token", dumped)
        self.assertNotIn("tokenEnvelope", dumped)
        run(identity_api.unlink_identity("cn_gh1", self.user))
        after = run(identity_api.list_identities(self.user))
        self.assertEqual(after[0]["status"], "revoked")
        row = self.conn.execute(
            "SELECT status, token_envelope FROM user_identities WHERE user_id = 'u_1'"
        ).fetchone()
        self.assertEqual(row["status"], "revoked")
        self.assertIsNone(row["token_envelope"])
        audit = self.conn.execute(
            "SELECT action FROM tracker_audit WHERE connector_id = 'cn_gh1' ORDER BY id"
        ).fetchall()
        self.assertIn("identity.link", [item["action"] for item in audit])
        self.assertIn("identity.unlink", [item["action"] for item in audit])

    def test_replayed_state_and_cross_user_callback_denied(self) -> None:
        begin = run(identity_api.begin_oauth("cn_gh1", request=_request(), user=self.user))
        state = begin.authorizeUrl.split("state=")[1].split("&")[0]
        run(
            identity_api.oauth_callback(
                request=_request(),
                code="good-code",
                state=state,
                user=self.user,
            )
        )
        with self.assertRaises(HTTPException) as replay:
            run(
                identity_api.oauth_callback(
                    request=_request(),
                    code="good-code",
                    state=state,
                    user=self.user,
                )
            )
        self.assertEqual(replay.exception.status_code, 400)
        begin2 = run(identity_api.begin_oauth("cn_gh1", request=_request(), user=self.user))
        state2 = begin2.authorizeUrl.split("state=")[1].split("&")[0]
        with self.assertRaises(HTTPException) as cross:
            run(
                identity_api.oauth_callback(
                    request=_request(),
                    code="good-code",
                    state=state2,
                    user=self.other,
                )
            )
        self.assertEqual(cross.exception.status_code, 403)

    def test_expired_session_has_explicit_recovery(self) -> None:
        begin = run(identity_api.begin_oauth("cn_gh1", request=_request(), user=self.user))
        state = begin.authorizeUrl.split("state=")[1].split("&")[0]
        expired = session("designer", user_id="u_1", session_id="sid_changed")
        with self.assertRaises(HTTPException) as caught:
            run(
                identity_api.oauth_callback(
                    request=_request(),
                    code="good-code",
                    state=state,
                    user=expired,
                )
            )
        self.assertEqual(caught.exception.status_code, 409)
        detail = caught.exception.detail
        if isinstance(detail, dict):
            self.assertEqual(detail.get("code"), "session_expired")
        rows = self.conn.execute("SELECT COUNT(*) AS n FROM user_identities").fetchone()
        self.assertEqual(int(rows["n"]), 0)

    def test_identity_uniqueness_per_user_and_connector(self) -> None:
        begin = run(identity_api.begin_oauth("cn_gh1", request=_request(), user=self.user))
        state = begin.authorizeUrl.split("state=")[1].split("&")[0]
        run(
            identity_api.oauth_callback(
                request=_request(),
                code="good-code",
                state=state,
                user=self.user,
            )
        )
        listed_other = run(identity_api.list_identities(self.other))
        self.assertEqual(listed_other, [])
        with self.assertRaises(HTTPException) as unlink_other:
            run(identity_api.unlink_identity("cn_gh1", self.other))
        self.assertEqual(unlink_other.exception.status_code, 404)

    def test_admin_revoke_erases_tokens_and_bumps_cache(self) -> None:
        before = user_cache_version("u_1")
        begin = run(identity_api.begin_oauth("cn_gh1", request=_request(), user=self.user))
        state = begin.authorizeUrl.split("state=")[1].split("&")[0]
        run(
            identity_api.oauth_callback(
                request=_request(),
                code="good-code",
                state=state,
                user=self.user,
            )
        )
        bump_user_cache("u_1")
        revoked = run(identity_api.admin_revoke_identity("cn_gh1", "u_1", self.admin))
        self.assertEqual(revoked["status"], "revoked")
        self.assertGreater(user_cache_version("u_1"), before)
        row = self.conn.execute(
            "SELECT token_envelope FROM user_identities WHERE user_id = 'u_1'"
        ).fetchone()
        self.assertIsNone(row["token_envelope"])

    def test_refresh_reencrypts_token(self) -> None:
        begin = run(identity_api.begin_oauth("cn_gh1", request=_request(), user=self.user))
        state = begin.authorizeUrl.split("state=")[1].split("&")[0]
        run(
            identity_api.oauth_callback(
                request=_request(),
                code="good-code",
                state=state,
                user=self.user,
            )
        )
        before = self.conn.execute(
            "SELECT token_envelope FROM user_identities WHERE user_id = 'u_1'"
        ).fetchone()["token_envelope"]
        refreshed = self.service.refresh_identity_token("u_1", "cn_gh1")
        after = self.conn.execute(
            "SELECT token_envelope FROM user_identities WHERE user_id = 'u_1'"
        ).fetchone()["token_envelope"]
        self.assertNotEqual(before, after)
        self.assertEqual(refreshed["status"], "active")
        self.assertIn("refresh", self.fake.calls)


class _Request:
    headers: dict[str, str] = {}

    @property
    def base_url(self) -> str:
        return "https://prism.example/"


def _request() -> _Request:
    return _Request()


if __name__ == "__main__":
    unittest.main()
