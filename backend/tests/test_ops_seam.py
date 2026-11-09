"""The ops seam (ADR scripting-and-mcp §11, D20–D22).

Ops is off by default and for admins only: its routes 404 while off, its
scopes are advertised only while on and granted only to admins, ``api:write``
does not imply them, and its tools are listed only while on. One redactor
cleans everything an ops result carries.
"""

from __future__ import annotations

import asyncio
import base64
import os
import re
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
        # Credential-shaped samples are assembled at run time, so the source
        # holds nothing a secret scanner would report.
        def b64(raw: bytes) -> str:
            return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

        jwt = ".".join([b64(b'{"alg":"none"}'), b64(b'{"sub":"sample-user"}'), b64(b"sample-signature")])
        password = "sample-" + "password"
        pat = "prism_pat" + "_" + "SampleToken1"
        hook_secret = "whsec" + "_" + b64(b"sample-secret")
        text = (
            f"clone https://bot:{password}@git.example/x.git\n"
            "Authorization: Bearer sample.bearer.value\n"
            f"token=sample-value&x=1 {pat} {hook_secret} {jwt} "
            "https://h/cb?code=sample-code&state=ok"
        )
        out = redaction.redact_text(text)
        for secret in (password, "sample.bearer.value", "sample-value", "SampleToken1",
                       hook_secret[6:], jwt, "sample-code"):
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

    def test_every_ops_tool_is_listed_only_while_on(self) -> None:
        import app.services.mcp.tools  # noqa: F401

        ops_tools = [tool for tool in registry._TOOLS if tool.ops]
        self.assertIn(self.tool, ops_tools)
        self.assertGreater(len(ops_tools), 11)
        for tool in ops_tools:
            with self.subTest(tool=tool.name):
                with patch.object(settings, "PRISM_MCP_OPS_ENABLED", False):
                    self.assertIsNone(registry.tool_named(tool.name))
                with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
                    self.assertIs(registry.tool_named(tool.name), tool)

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

    def test_an_admin_token_with_ops_read_sees_the_status(self) -> None:
        with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
            response = self.client.get("/api/v1/ops/status", headers=self._token("admin", ["ops:read"]))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["scopes"], ["ops:read"])

    def _ops_routes(self) -> list[tuple[str, str]]:
        import app.main as main

        routes = [
            (method.upper(), re.sub(r"\{[^}]+\}", "1", path))
            for path, operations in main.app.openapi()["paths"].items()
            if path.startswith("/api/v1/ops/")
            for method in sorted(operations)
        ]
        self.assertGreater(len(routes), 15)
        return routes

    def test_every_ops_route_is_absent_while_off_and_gated_while_on(self) -> None:
        admin = self._token("admin", ["ops:act"])
        no_scope = self._token("admin", ["api:write"])
        not_admin = self._token("designer", ["ops:act"])
        for method, path in self._ops_routes():
            with self.subTest(route=f"{method} {path}"):
                with patch.object(settings, "PRISM_MCP_OPS_ENABLED", False):
                    self.assertEqual(self.client.request(method, path, headers=admin).status_code, 404)
                with patch.object(settings, "PRISM_MCP_OPS_ENABLED", True):
                    self.assertEqual(self.client.request(method, path, headers=no_scope).status_code, 403)
                    self.assertEqual(self.client.request(method, path, headers=not_admin).status_code, 403)


if __name__ == "__main__":
    unittest.main()
