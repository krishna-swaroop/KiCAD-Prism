"""The ops seam (ADR scripting-and-mcp §11, D20–D22).

Ops is off by default and for admins only: its routes 404 while off, its
scopes are advertised only while on and granted only to admins, ``api:write``
does not imply them, and its tools are listed only while on. One redactor
cleans everything an ops result carries.
"""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import errors, policy, redaction  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from app.services import access_service, mcp_auth_service, personal_tokens  # noqa: E402
from app.services.mcp import registry  # noqa: E402

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False


def caller(role: str, auth_type: str, scopes: list[str]) -> AuthenticatedUser:
    return AuthenticatedUser(email="a@example.test", name="A", role=role, auth_type=auth_type, scopes=scopes)


class RedactionTests(unittest.TestCase):
    def test_credentials_in_every_shape_are_removed(self) -> None:
        text = (
            "clone https://bot:hunter2@git.example/x.git\n"
            "Authorization: Bearer abc.def\n"
            "token=s3cret&x=1 prism_pat_AbC123 whsec_Zm9vYmFy "
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlc2ln "
            "https://h/cb?code=xyz&state=ok"
        )
        out = redaction.redact_text(text)
        for secret in ("hunter2", "abc.def", "s3cret", "AbC123", "Zm9vYmFy", "eyJzdWIi", "code=xyz"):
            self.assertNotIn(secret, out)
        self.assertIn("state=ok", out)
        self.assertIn("git.example/x.git", out)

    def test_values_are_redacted_recursively(self) -> None:
        out = redaction.redact_value({"api_key": "k", "nested": [{"url": "https://u:p@h/"}], "n": 3})
        self.assertEqual(out["api_key"], redaction.REDACTED)
        self.assertNotIn("u:p@", out["nested"][0]["url"])
        self.assertEqual(out["n"], 3)


class PolicyTests(unittest.TestCase):
    def test_ops_is_admin_only_and_not_implied_by_api_write(self) -> None:
        self.assertIsNone(policy.refusal(caller("admin", "pat", ["ops:read"]), "ops_read"))
        self.assertIsNotNone(policy.refusal(caller("designer", "pat", ["ops:read"]), "ops_read"))
        self.assertIsNotNone(policy.refusal(caller("admin", "pat", ["api:write"]), "ops_read"))
        self.assertIsNone(policy.refusal(caller("admin", "pat", ["ops:act"]), "ops_read"))
        self.assertIsNotNone(policy.refusal(caller("admin", "pat", ["ops:read"]), "ops_act"))

    def test_an_admin_mcp_client_may_use_ops(self) -> None:
        self.assertIsNone(policy.refusal(caller("admin", policy.MCP_AUTH_TYPE, ["ops:act"]), "ops_act"))
        self.assertIsNotNone(policy.refusal(caller("admin", policy.MCP_AUTH_TYPE, ["admin"]), "admin"))

    def test_a_missing_ops_scope_gets_a_consent_challenge(self) -> None:
        challenge = policy.scope_challenge(caller("admin", policy.MCP_AUTH_TYPE, ["api:read"]), "ops_read")
        self.assertIn('scope="ops:read"', challenge or "")


class ScopeTests(unittest.TestCase):
    def test_ops_scopes_are_advertised_only_while_on(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", False):
            self.assertNotIn("ops:read", mcp_auth_service.scopes_supported())
            with self.assertRaises(mcp_auth_service.OAuthError):
                mcp_auth_service.normalize_scope("api:read ops:read")
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            self.assertIn("ops:act", mcp_auth_service.scopes_supported())
            self.assertEqual(mcp_auth_service.normalize_scope("ops:read api:read"), "api:read ops:read")

    def test_only_an_admin_can_grant_ops_scopes(self) -> None:
        self.assertEqual(
            mcp_auth_service.scope_for_user("api:read ops:read ops:act", "designer"),
            ("api:read", ["ops:read", "ops:act"]),
        )
        self.assertEqual(
            mcp_auth_service.scope_for_user("api:read ops:read", "admin"), ("api:read ops:read", [])
        )
        self.assertEqual(mcp_auth_service.scope_for_user("ops:read", "viewer"), ("api:read", ["ops:read"]))


class RegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        tool = registry.Tool(
            name=f"ops_probe_{uuid.uuid4().hex[:6]}",
            title="Probe",
            description="Test ops tool.",
            input_schema={"type": "object", "properties": {}},
            route=("get", "/api/v1/ops/status"),
            args=lambda arguments: ({}, {}),
            annotations=dict(registry.READ_ONLY_ANNOTATIONS),
            action="ops_read",
        )
        registry.register(tool)
        self.tool = tool
        self.addCleanup(registry._TOOLS.remove, tool)

    def test_ops_tools_are_listed_only_while_on(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", False):
            self.assertIsNone(registry.tool_named(self.tool.name))
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            self.assertIs(registry.tool_named(self.tool.name), self.tool)

    def test_an_ops_read_is_not_a_write(self) -> None:
        self.assertTrue(self.tool.ops)
        self.assertFalse(self.tool.write)
        self.assertNotIn("idempotencyKey", self.tool.advertised_input_schema().get("properties", {}))


class PersonalTokenRouteTests(unittest.TestCase):
    def test_a_non_admin_cannot_create_an_ops_token(self) -> None:
        from app.api import personal_tokens as api

        body = api.CreatePersonalTokenRequest(name="x", scopes=["api:read", "ops:read"], expiresInDays=30)
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), patch.object(personal_tokens, "create") as create:
            with self.assertRaises(errors.Forbidden) as raised:
                asyncio.run(api.create_personal_token(body, caller("designer", "session", [])))
        self.assertEqual(raised.exception.code, "ops-admin-only")
        create.assert_not_called()


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx")
class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from starlette.testclient import TestClient

        cls._patchers = [
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", True),
            patch.object(settings, "PASSWORD_AUTH_ENABLED", True),
            patch.object(settings, "SESSION_SECRET", "test-secret-at-least-32-characters-long-x"),
            patch.object(settings, "PUBLIC_BASE_URL", "https://prism.test"),
        ]
        for patcher in cls._patchers:
            patcher.start()
        import app.main as main

        cls.client = TestClient(main.app)

    @classmethod
    def tearDownClass(cls) -> None:
        for patcher in cls._patchers:
            patcher.stop()

    def _token(self, role: str, scopes: list[str]) -> dict:
        email = f"ops-{uuid.uuid4().hex[:8]}@example.test"
        access_service.upsert_user(email=email, name="ops")
        access_service.upsert_user_role(email, role, updated_by=email)
        _, token = personal_tokens.create(email, "ops", scopes, 30)
        return {"Authorization": f"Bearer {token}"}

    def test_ops_routes_do_not_exist_while_off(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", False):
            response = self.client.get("/api/v1/ops/status", headers=self._token("admin", ["ops:read"]))
        self.assertEqual(response.status_code, 404)

    def test_an_admin_token_with_ops_read_sees_the_status(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.get("/api/v1/ops/status", headers=self._token("admin", ["ops:read"]))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["scopes"], ["ops:read"])

    def test_scope_and_role_are_both_required(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            no_scope = self.client.get("/api/v1/ops/status", headers=self._token("admin", ["api:write"]))
            not_admin = self.client.get("/api/v1/ops/status", headers=self._token("designer", ["ops:read"]))
        self.assertEqual(no_scope.status_code, 403)
        self.assertEqual(not_admin.status_code, 403)


if __name__ == "__main__":
    unittest.main()
