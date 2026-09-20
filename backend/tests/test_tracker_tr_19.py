"""TR-19: admin connector lifecycle and Test connection (F3, F7)."""

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
from app.api import tracker_connectors as connectors_api  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
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
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))
INSTALLATION_MATERIAL = "installation-private-key-fixture-text"
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
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "GITHUB_TOKEN": "env-github-token-fixture",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(ROOT_KEY),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def session(role: str, *, user_id: str = "u_admin") -> AuthenticatedUser:
    return AuthenticatedUser(
        email=f"{user_id}@example.com",
        name=role,
        role=role,  # type: ignore[arg-type]
        session_id="sid",
        user_id=user_id,
    )


def run(coro):
    return asyncio.run(coro)


class RoutingContractTests(unittest.TestCase):
    def test_main_registers_admin_connector_routes(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("tracker_connectors_router", source)
        self.assertIn("initialize_tracker_connector_service", source)
        app = FastAPI()
        app.include_router(connectors_api.router)
        paths = set(app.openapi()["paths"])
        self.assertIn("/api/admin/trackers/connectors/", paths)
        self.assertIn("/api/admin/trackers/connectors/{connector_id}/test", paths)
        self.assertIn("/api/admin/trackers/connectors/{connector_id}/revoke", paths)
        self.assertIn("/api/admin/trackers/connectors/{connector_id}/health", paths)

    def test_viewer_and_designer_fail_require_admin(self) -> None:
        from app.core.security import require_admin

        for role in ("viewer", "designer"):
            with self.assertRaises(HTTPException) as caught:
                run(require_admin(session(role, user_id=f"u_{role}")))
            self.assertEqual(caught.exception.status_code, 403)
        run(require_admin(session("admin")))

    def test_fixture_cases_are_present(self) -> None:
        self.assertIn("F3.bot_identity_captured", {case["id"] for case in F3["cases"]})
        self.assertIn("F7.unauthorized_401", {case["id"] for case in F7["cases"]})


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class ConnectorAdminApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr19_{uuid.uuid4().hex[:12]}"
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
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        self.conn.commit()
        self.settings = _settings()
        self.service = ConnectorService(connect=self._factory, settings=self.settings, tester=self._tester)
        self._probe = {
            "ok": True,
            "writesEnabled": True,
            "pausedReason": None,
            "bot": {"id": "199001", "login": "prism[bot]", "isBot": True},
            "permissions": {"issues": "write"},
            "visibility": "private",
        }
        connectors_api.service = self.service
        self.admin = session("admin")

    def _cleanup(self) -> None:
        connectors_api.service = ConnectorService()
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

    def _tester(self, row, material):  # noqa: ANN001
        del row
        if material.get("privateKey") == "env-github-token-fixture":
            raise ProviderError("invalid_request", "env bootstrap")
        return dict(self._probe)

    def _create(self):
        return run(
            connectors_api.create_connector(
                connectors_api.CreateConnectorRequest(
                    id="cn_gh1",
                    provider="github",
                    instanceKind="github.com",
                    displayName="GitHub",
                    credentials=connectors_api.ConnectorCredentials(
                        appId="772215",
                        installationId="88001122",
                        privateKey=INSTALLATION_MATERIAL,
                    ),
                ),
                self.admin,
            )
        )

    def test_create_read_hides_secrets_and_ignores_env_token(self) -> None:
        created = self._create()
        dumped = json.dumps(created)
        self.assertNotIn(INSTALLATION_MATERIAL, dumped)
        self.assertNotIn("env-github-token-fixture", dumped)
        self.assertNotIn("privateKey", dumped)
        self.assertTrue(created["credentialConfigured"])
        self.assertFalse(created["writesEnabled"])
        self.assertEqual(created["bot"]["id"], None)
        listed = run(connectors_api.list_connectors(self.admin))
        self.assertEqual(listed[0]["id"], "cn_gh1")
        self.assertIn("bot", listed[0])
        self.assertNotIn("botForgeUserId", created)
        envelope = self.conn.execute(
            "SELECT credential_envelope FROM tracker_connectors WHERE id = 'cn_gh1'"
        ).fetchone()["credential_envelope"]
        plain = json.loads(
            decrypt_secret(envelope, {"record": "cn_gh1", "field": "github_app"}, settings=self.settings).decode()
        )
        self.assertEqual(plain["privateKey"], INSTALLATION_MATERIAL)
        self.assertNotEqual(plain["privateKey"], self.settings.GITHUB_TOKEN)

    def test_test_connection_captures_bot_and_failed_test_cannot_publish(self) -> None:
        self._create()
        ok = run(connectors_api.test_connector("cn_gh1", self.admin))
        self.assertTrue(ok["test"]["writesEnabled"])
        self.assertEqual(ok["bot"]["id"], "199001")
        self.assertEqual(ok["bot"]["login"], "prism[bot]")
        self._probe = {
            "ok": False,
            "writesEnabled": False,
            "pausedReason": "auth_lost",
            "bot": {"id": "199001", "login": "prism[bot]"},
            "permissions": {},
            "visibility": "unknown",
        }
        failed = run(connectors_api.test_connector("cn_gh1", self.admin))
        self.assertFalse(failed["writesEnabled"])
        self.assertFalse(failed["test"]["writesEnabled"])
        self.assertTrue(failed["paused"])
        with self.assertRaises(HTTPException) as caught:
            run(connectors_api.resume_connector("cn_gh1", self.admin))
        self.assertEqual(caught.exception.status_code, 403)

    def test_revoke_pauses_and_erases_envelope(self) -> None:
        self._create()
        revoked = run(connectors_api.revoke_connector("cn_gh1", self.admin))
        self.assertTrue(revoked["paused"])
        self.assertEqual(revoked["pausedReason"], "revoked")
        self.assertFalse(revoked["credentialConfigured"])
        self.assertFalse(revoked["writesEnabled"])
        row = self.conn.execute(
            "SELECT credential_envelope, paused FROM tracker_connectors WHERE id = 'cn_gh1'"
        ).fetchone()
        self.assertIsNone(row["credential_envelope"])
        audit = self.conn.execute(
            "SELECT action, detail FROM tracker_audit WHERE connector_id = 'cn_gh1' ORDER BY id"
        ).fetchall()
        self.assertTrue(any(item["action"] == "connector.revoke" for item in audit))
        self.assertTrue(all(INSTALLATION_MATERIAL not in json.dumps(dict(item), default=str) for item in audit))

    def test_health_route_matches_frozen_connector_health(self) -> None:
        self._create()
        health = run(connectors_api.connector_health("cn_gh1", self.admin))
        self.assertEqual(health["connectorId"], "cn_gh1")
        self.assertFalse(health["paused"])
        self.assertEqual(health["pendingOps"], 0)
        dumped = json.dumps(health)
        self.assertNotIn(INSTALLATION_MATERIAL, dumped)
        self.assertNotIn("privateKey", dumped)


if __name__ == "__main__":
    unittest.main()
