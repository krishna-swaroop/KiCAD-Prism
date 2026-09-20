"""TR-23: project publication settings and dispatch policy (F1, F3, F8)."""

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
from app.api import project_trackers as trackers_api  # noqa: E402
from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.connector_service import ConnectorService  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.publication_policy import (  # noqa: E402
    DispatchPause,
    PublicationDenied,
    PublicationPolicyService,
    _github_repo_path,
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
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
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
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
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
    def test_main_registers_project_tracker_routes(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn("project_trackers_router", source)
        app = FastAPI()
        app.include_router(trackers_api.router)
        paths = set(app.openapi()["paths"])
        self.assertIn("/api/projects/{project_id}/tracker", paths)
        self.assertIn("/api/projects/{project_id}/tracker/acknowledge", paths)

    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F3["cases"]}
        self.assertIn("F3.visibility_generations", ids)
        self.assertIn("F3.public_without_ack_pauses", ids)
        self.assertIn("F3.unknown_visibility_pauses", ids)

    def test_repo_path_resolution(self) -> None:
        self.assertEqual(_github_repo_path("https://github.com/acme/openswitch.git"), "acme/openswitch")
        self.assertEqual(_github_repo_path("git@github.com:acme/hardware-issues.git"), "acme/hardware-issues")
        self.assertIsNone(_github_repo_path("https://gitlab.com/acme/openswitch"))


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class PublicationPolicyPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"tr23_{uuid.uuid4().hex[:12]}"
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
        self.conn.commit()
        self.settings = _settings()
        self._observed_visibility: dict[str, str] = {}
        connector_service = ConnectorService(
            connect=self._factory,
            settings=self.settings,
            tester=lambda row, material: {"ok": True, "writesEnabled": True, "bot": {"id": "1", "login": "bot"}},
            container_observer=self._observe_container,
            workspace_schema=self.schema,
        )
        self.service = PublicationPolicyService(
            connect=self._factory,
            settings=self.settings,
            connector_service=connector_service,
            workspace_schema=self.schema,
        )
        trackers_api.service = self.service
        self.admin = session("admin")
        self.designer = session("designer", user_id="u_designer")
        self.viewer = session("viewer", user_id="u_viewer")
        self._seed_connector()

    def _cleanup(self) -> None:
        trackers_api.service = PublicationPolicyService()
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
        ConnectorService(connect=self._factory, settings=self.settings, workspace_schema=self.schema).create(
            actor_user_id="u_admin",
            provider="github",
            instance_kind="github.com",
            display_name="GitHub",
            credentials={"appId": "1", "installationId": "2", "privateKey": "fixture-key"},
            connector_id="cn_gh1",
        )

    def _observe_container(
        self,
        connector_id: str,
        *,
        container_kind: str,
        container_path: str,
        remote_container_id: str,
        generation: int = 1,
        visibility_hint: str | None = None,
    ) -> dict[str, str]:
        visibility = self._observed_visibility.get(
            remote_container_id,
            visibility_hint or "unknown",
        )
        return {
            "visibility": visibility,
            "containerPath": container_path,
            "remoteContainerId": remote_container_id,
        }

    def _set_observed_visibility(self, remote_container_id: str, visibility: str) -> None:
        self._observed_visibility[remote_container_id] = visibility

    def _update(self, **destination):
        return self.service.update_settings(
            "prj_a",
            actor_user_id="u_admin",
            connector_id="cn_gh1",
            destination={
                "containerKind": "repo",
                "containerPath": destination.get("containerPath", "acme/openswitch"),
                "remoteContainerId": destination.get("remoteContainerId", "111"),
                "visibility": destination.get("visibility", "private"),
            },
            promote_min_role="designer",
        )

    def test_visibility_generations_keep_existing_links(self) -> None:
        first = self._update(containerPath="acme/openswitch", remoteContainerId="111")
        self.assertEqual(first["destination"]["generation"], 1)
        self.conn.execute(
            """
            INSERT INTO comments(id, project_id, author, content)
            VALUES ('c_1', 'prj_a', 'Priya', 'stub')
            """
        )
        self.conn.execute(
            """
            INSERT INTO tracked_threads (
                id, comment_id, project_tracker_id, destination_generation,
                connector_id, remote_container_id, external_id, link_state
            ) VALUES (
                'tt_1', 'c_1', %s, 1, 'cn_gh1', '111', '42', 'linked'
            )
            """,
            (self.conn.execute("SELECT id FROM project_trackers WHERE project_id='prj_a'").fetchone()["id"],),
        )
        self.conn.execute(
            """
            INSERT INTO sync_ops (id, tracked_thread_id, op, state, destination_generation)
            VALUES ('op_old', 'tt_1', 'add_comment', 'pending', 1)
            """
        )
        self.conn.commit()
        second = self._update(containerPath="acme/hardware-issues", remoteContainerId="222")
        self.assertEqual(second["destination"]["generation"], 2)
        old_op = self.conn.execute(
            "SELECT destination_generation FROM sync_ops WHERE id = 'op_old'"
        ).fetchone()
        self.assertEqual(int(old_op["destination_generation"]), 1)
        self._set_observed_visibility("222", "private")
        self.service.acknowledge("prj_a", actor_user_id="u_admin", visibility="private")
        with self.assertRaises(DispatchPause) as caught:
            self.service.evaluate_dispatch("prj_a", actor_role="designer", destination_generation=1)
        self.assertEqual(caught.exception.reason, "destination_generation")
        self._set_observed_visibility("222", "public")
        self.conn.execute(
            "UPDATE project_trackers SET visibility = 'public' WHERE project_id = 'prj_a'"
        )
        self.conn.commit()
        with self.assertRaises(DispatchPause) as caught:
            self.service.evaluate_dispatch("prj_a", actor_role="designer", destination_generation=2)
        self.assertEqual(caught.exception.reason, "visibility")

    def test_self_declared_private_stores_observed_public(self) -> None:
        self._set_observed_visibility("111", "public")
        saved = self._update(visibility="private", remoteContainerId="111")
        self.assertEqual(saved["destination"]["visibility"], "public")
        with self.assertRaises(DispatchPause) as caught:
            self.service.evaluate_dispatch("prj_a", actor_role="designer")
        self.assertEqual(caught.exception.reason, "visibility")

    def test_public_without_ack_pauses_dispatch(self) -> None:
        self._set_observed_visibility("111", "public")
        self._update(visibility="public")
        with self.assertRaises(DispatchPause) as caught:
            self.service.evaluate_dispatch("prj_a", actor_role="designer")
        self.assertEqual(caught.exception.reason, "visibility")
        acked = self.service.acknowledge("prj_a", actor_user_id="u_admin", visibility="public")
        self.assertTrue(acked["acknowledgement"]["valid"])
        self.service.evaluate_dispatch("prj_a", actor_role="designer")

    def test_unknown_visibility_pauses_dispatch(self) -> None:
        self._set_observed_visibility("111", "unknown")
        self._update(visibility="unknown")
        with self.assertRaises(DispatchPause) as caught:
            self.service.evaluate_dispatch("prj_a", actor_role="designer")
        self.assertEqual(caught.exception.reason, "visibility_unknown")

    def test_viewer_cannot_publish_by_default(self) -> None:
        self._set_observed_visibility("111", "private")
        self._update()
        self.service.acknowledge("prj_a", actor_user_id="u_admin", visibility="private")
        with self.assertRaises(PublicationDenied) as caught:
            self.service.evaluate_dispatch("prj_a", actor_role="viewer")
        self.assertEqual(caught.exception.code, "publication_required")

    def test_designer_cannot_update_destination_via_api(self) -> None:
        from app.core.security import require_admin

        for role in ("viewer", "designer"):
            with self.assertRaises(HTTPException) as caught:
                run(require_admin(session(role, user_id=f"u_{role}")))
            self.assertEqual(caught.exception.status_code, 403)
        run(require_admin(self.admin))
