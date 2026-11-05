"""OAuth for MCP clients: metadata, the code flow, refusals, and Settings.

The route tests drive the real app with a signed-in session cookie and need a
database. The client metadata document is injected, so no test reaches the
network.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import socket
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app.core import policy  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import AuthenticatedUser, _resolve_bearer_user  # noqa: E402
from app.services import (  # noqa: E402
    access_service,
    mcp_auth_service,
    mcp_clients,
    provider_auth_service,
)

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False

TEST_SECRET = "test-secret-at-least-32-characters-long-x"
BASE = "https://prism.test"
CLIENT_ID = "https://client.example.com/oauth/client.json"
REDIRECT = "http://127.0.0.1:53998/cb"
RESOURCE = f"{BASE}/mcp"
PUBLIC_ADDRESS = "93.184.216.34"


def unique_email(label: str) -> str:
    return f"mcp-{label}-{uuid.uuid4().hex[:10]}@example.com"


def use_user(email: str, role: str) -> None:
    access_service.upsert_user(email=email, name=email.split("@")[0])
    access_service.upsert_user_role(email, role, updated_by=email)


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def document() -> dict:
    return {
        "client_id": CLIENT_ID,
        "client_name": "Test MCP Client",
        "redirect_uris": [REDIRECT],
    }


def fake_fetch(url: str, address: str) -> tuple[int, str, bytes]:
    return 200, "application/json", json.dumps(document()).encode()


def fake_resolver(host: str, port: int, **kwargs) -> list:
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_ADDRESS, port))]


@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx2 or httpx")
class McpMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from starlette.testclient import TestClient

        cls._patchers = [
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", True),
            patch.object(settings, "PASSWORD_AUTH_ENABLED", True),
            patch.object(settings, "SESSION_SECRET", TEST_SECRET),
            patch.object(settings, "PUBLIC_BASE_URL", BASE),
            patch.object(settings, "PRISM_MCP_ENABLED", True),
        ]
        for patcher in cls._patchers:
            patcher.start()
        import app.main as main

        cls.main = main
        cls.TestClient = TestClient

    @classmethod
    def tearDownClass(cls) -> None:
        for patcher in getattr(cls, "_patchers", []):
            patcher.stop()

    def test_protected_resource_metadata(self) -> None:
        client = self.TestClient(self.main.app)
        expected = {
            "resource": RESOURCE,
            "authorization_servers": [f"{BASE}/oauth/mcp"],
            "scopes_supported": ["api:read", "comments:write", "design:write", "catalog:write", "supply:write"],
            "bearer_methods_supported": ["header"],
        }
        for path in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"):
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), expected)

    def test_authorization_server_metadata_at_both_spellings(self) -> None:
        client = self.TestClient(self.main.app)
        expected = {
            "issuer": f"{BASE}/oauth/mcp",
            "authorization_endpoint": f"{BASE}/oauth/mcp/authorize",
            "token_endpoint": f"{BASE}/oauth/mcp/token",
            "revocation_endpoint": f"{BASE}/oauth/mcp/revoke",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none"],
            "scopes_supported": ["api:read", "comments:write", "design:write", "catalog:write", "supply:write"],
            "client_id_metadata_document_supported": True,
            "authorization_response_iss_parameter_supported": True,
        }
        for path in (
            "/.well-known/oauth-authorization-server/oauth/mcp",
            "/oauth/mcp/.well-known/oauth-authorization-server",
        ):
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), expected)


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required for MCP OAuth tests")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx2 or httpx")
class McpOAuthFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from starlette.testclient import TestClient

        cls._patchers = [
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", True),
            patch.object(settings, "PASSWORD_AUTH_ENABLED", True),
            patch.object(settings, "SESSION_SECRET", TEST_SECRET),
            patch.object(settings, "PUBLIC_BASE_URL", BASE),
            patch.object(settings, "PRISM_MCP_ENABLED", True),
        ]
        for patcher in cls._patchers:
            patcher.start()

        import app.main as main
        from app.services import session_store_service

        session_store_service.initialize_session_store()
        cls.main = main
        cls.session_store_service = session_store_service
        cls.TestClient = TestClient

    @classmethod
    def tearDownClass(cls) -> None:
        for patcher in getattr(cls, "_patchers", []):
            patcher.stop()

    def setUp(self) -> None:
        mcp_clients.clear_cache()
        mcp_auth_service._grant_state.clear()
        mcp_auth_service._last_touched.clear()
        self._ttl = patch.object(mcp_auth_service, "GRANT_STATE_TTL_SECONDS", 0)
        self._ttl.start()
        self.addCleanup(self._ttl.stop)
        self.resolver = fake_resolver
        self._resolver = patch.object(mcp_clients, "_RESOLVER", lambda *a, **k: self.resolver(*a, **k))
        self._fetcher = patch.object(mcp_clients, "_FETCHER", fake_fetch)
        self._resolver.start()
        self._fetcher.start()
        self.addCleanup(self._resolver.stop)
        self.addCleanup(self._fetcher.stop)

    def _client_for(self, email: str, role: str):
        from app.core.session import SESSION_COOKIE_NAME, create_session_token

        use_user(email, role)
        session_id, _ = self.session_store_service.create_session(email=email, name="Tester", picture="")
        client = self.TestClient(self.main.app)
        client.cookies.set(SESSION_COOKIE_NAME, create_session_token(session_id))
        return client

    def _authorize_params(self, *, scope: str = "api:read", redirect_uri: str = REDIRECT) -> tuple[str, dict]:
        verifier, challenge = pkce()
        return verifier, {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": redirect_uri,
            "state": "state-xyz",
            "scope": scope,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": RESOURCE,
        }

    def _code(self, client, *, scope: str = "api:read") -> tuple[str, str, dict]:
        verifier, params = self._authorize_params(scope=scope)
        consent = client.get("/oauth/mcp/authorize", params=params)
        self.assertEqual(consent.status_code, 200, consent.text)
        submit = client.post(
            "/oauth/mcp/authorize",
            data={**params, "decision": "allow"},
            follow_redirects=False,
        )
        self.assertEqual(submit.status_code, 303, submit.text)
        location = submit.headers["location"]
        self.assertTrue(location.startswith(REDIRECT))
        query = parse_qs(urlparse(location).query)
        self.assertEqual(query["iss"], [f"{BASE}/oauth/mcp"])
        self.assertEqual(query["state"], ["state-xyz"])
        return query["code"][0], verifier, params

    def _tokens(self, code: str, verifier: str, params: dict) -> dict:
        response = self.TestClient(self.main.app).post(
            "/oauth/mcp/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": CLIENT_ID,
                "redirect_uri": params["redirect_uri"],
                "code_verifier": verifier,
                "resource": RESOURCE,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_consent_exchange_use_refresh_and_revoke(self) -> None:
        email = unique_email("flow")
        client = self._client_for(email, "designer")
        code, verifier, params = self._code(client)
        tokens = self._tokens(code, verifier, params)

        self.assertEqual(tokens["token_type"], "Bearer")
        self.assertEqual(tokens["expires_in"], 3600)
        self.assertEqual(tokens["scope"], "api:read")
        self.assertTrue(tokens["refresh_token"].startswith("prism_mcp_rt_"))
        self.assertEqual(len(tokens["refresh_token"]), len("prism_mcp_rt_") + 40)

        bearer = self.TestClient(self.main.app)
        events = bearer.get(
            "/api/v1/events",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        self.assertEqual(events.status_code, 200, events.text)

        rotated = bearer.post(
            "/oauth/mcp/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": tokens["refresh_token"],
                "client_id": CLIENT_ID,
            },
        )
        self.assertEqual(rotated.status_code, 200, rotated.text)
        rotated_body = rotated.json()
        self.assertNotEqual(rotated_body["refresh_token"], tokens["refresh_token"])

        reused = bearer.post(
            "/oauth/mcp/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": tokens["refresh_token"],
                "client_id": CLIENT_ID,
            },
        )
        self.assertEqual(reused.status_code, 400)
        self.assertEqual(reused.json()["error"], "invalid_grant")

        revoked = bearer.post(
            "/oauth/mcp/revoke",
            data={"token": rotated_body["access_token"], "client_id": CLIENT_ID},
        )
        self.assertEqual(revoked.status_code, 200)

        after = bearer.get(
            "/api/v1/events",
            headers={"Authorization": f"Bearer {rotated_body['access_token']}"},
        )
        self.assertEqual(after.status_code, 401)

    def test_the_consent_page_names_the_client_account_and_scopes(self) -> None:
        email = unique_email("consent")
        client = self._client_for(email, "designer")
        _verifier, params = self._authorize_params(scope="api:read comments:write")
        consent = client.get("/oauth/mcp/authorize", params=params)

        self.assertEqual(consent.status_code, 200)
        self.assertIn("Test MCP Client", consent.text)
        self.assertIn("client.example.com", consent.text)
        self.assertIn(email, consent.text)
        self.assertIn("api:read comments:write", consent.text)
        self.assertIn("Allow", consent.text)
        self.assertIn("Deny", consent.text)

    def test_a_human_only_scope_is_invalid_scope(self) -> None:
        client = self._client_for(unique_email("human"), "admin")
        for scope in ("admin", "release:approve", "catalog:qa", "api:write"):
            with self.subTest(scope=scope):
                _verifier, params = self._authorize_params(scope=scope)
                response = client.get("/oauth/mcp/authorize", params=params)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"], "invalid_scope")

    def test_an_mcp_client_may_ask_for_supply_writes(self) -> None:
        from app.services import mcp_auth_service

        self.assertEqual(mcp_auth_service.normalize_scope("supply:write api:read"), "api:read supply:write")

    def test_a_redirect_uri_outside_the_document_is_refused(self) -> None:
        client = self._client_for(unique_email("redirect"), "designer")
        _verifier, params = self._authorize_params(redirect_uri="http://127.0.0.1:53998/other")
        response = client.get("/oauth/mcp/authorize", params=params)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_request")

    def test_a_loopback_redirect_may_use_any_port(self) -> None:
        client = self._client_for(unique_email("loopback"), "designer")
        _verifier, params = self._authorize_params(redirect_uri="http://127.0.0.1:61000/cb")
        response = client.get("/oauth/mcp/authorize", params=params)
        self.assertEqual(response.status_code, 200, response.text)

    def test_a_client_document_on_a_private_address_is_refused(self) -> None:
        def private_resolver(host: str, port: int, **kwargs) -> list:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]

        self.resolver = private_resolver
        client = self._client_for(unique_email("private"), "designer")
        _verifier, params = self._authorize_params()
        response = client.get("/oauth/mcp/authorize", params=params)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_client")

    def test_only_globally_routable_addresses_are_fetched(self) -> None:
        for address in ("100.64.0.9", "10.1.2.3", "169.254.169.254", "::1", "fd00::1"):
            with self.subTest(address=address):
                with self.assertRaises(mcp_clients.McpClientError):
                    mcp_clients._ensure_public_host(
                        "client.example",
                        resolver=lambda host, port, **kwargs: [
                            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))
                        ],
                    )

    def test_the_fetch_connects_to_the_checked_address(self) -> None:
        seen: list[str] = []

        def recording_fetch(url: str, address: str) -> tuple[int, str, bytes]:
            seen.append(address)
            return fake_fetch(url, address)

        mcp_clients.fetch_document(CLIENT_ID, fetcher=recording_fetch)
        self.assertEqual(seen, [PUBLIC_ADDRESS])

    def test_a_token_for_another_audience_is_refused(self) -> None:
        email = unique_email("aud")
        use_user(email, "designer")
        now = provider_auth_service._now()
        token = provider_auth_service._encode_payload(
            {
                "type": "mcp",
                "email": email,
                "name": "Tester",
                "role": "designer",
                "client_id": CLIENT_ID,
                "scope": "api:read",
                "aud": "https://elsewhere.example/mcp",
                "jti": secrets.token_urlsafe(8),
                "grant": "mcpg_unknown",
                "iat": now,
                "exp": now + 3600,
            }
        )
        with self.assertRaises(HTTPException) as caught:
            _resolve_bearer_user(token)
        self.assertEqual(caught.exception.status_code, 401)

    def test_without_a_public_base_any_mcp_audience_is_accepted(self) -> None:
        with patch.object(settings, "PUBLIC_BASE_URL", ""):
            self.assertTrue(mcp_auth_service._audience_ok("http://10.0.0.5:8080/mcp"))
            self.assertFalse(mcp_auth_service._audience_ok("http://10.0.0.5:8080/api"))
            self.assertFalse(mcp_auth_service._audience_ok("mcp"))
        self.assertFalse(mcp_auth_service._audience_ok("http://10.0.0.5:8080/mcp"))

    def test_a_cross_origin_consent_is_refused(self) -> None:
        client = self._client_for(unique_email("xorigin"), "designer")
        _verifier, params = self._authorize_params()
        response = client.post(
            "/oauth/mcp/authorize",
            data={**params, "decision": "allow"},
            headers={"origin": "https://attacker.example"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 403)

    def test_deny_redirects_with_access_denied(self) -> None:
        client = self._client_for(unique_email("deny"), "designer")
        _verifier, params = self._authorize_params()
        response = client.post(
            "/oauth/mcp/authorize",
            data={**params, "decision": "deny"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 303)
        query = parse_qs(urlparse(response.headers["location"]).query)
        self.assertEqual(query["error"], ["access_denied"])
        self.assertEqual(query["state"], ["state-xyz"])
        self.assertEqual(query["iss"], [f"{BASE}/oauth/mcp"])

    def test_a_code_cannot_be_used_twice(self) -> None:
        client = self._client_for(unique_email("twice"), "designer")
        code, verifier, params = self._code(client)
        self._tokens(code, verifier, params)

        response = self.TestClient(self.main.app).post(
            "/oauth/mcp/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT,
                "code_verifier": verifier,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_grant")

    def test_settings_lists_and_revokes_the_callers_clients(self) -> None:
        email = unique_email("settings")
        client = self._client_for(email, "designer")
        code, verifier, params = self._code(client)
        self._tokens(code, verifier, params)

        listed = client.get("/api/auth/mcp-clients")
        self.assertEqual(listed.status_code, 200)
        rows = listed.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["client_name"], "Test MCP Client")
        self.assertEqual(rows[0]["host"], "client.example.com")
        self.assertEqual(rows[0]["scopes"], ["api:read"])
        self.assertNotIn("refresh_hash", rows[0])

        granted = client.delete(f"/api/auth/mcp-clients/{rows[0]['id']}")
        self.assertEqual(granted.status_code, 204)
        self.assertEqual(client.get("/api/auth/mcp-clients").json(), [])

        other = self._client_for(unique_email("settings-other"), "viewer")
        self.assertEqual(other.get("/api/auth/mcp-clients/all").status_code, 403)
        admin = self._client_for(unique_email("settings-admin"), "admin")
        self.assertEqual(admin.get("/api/auth/mcp-clients/all").status_code, 200)


class McpIncrementalConsentTests(unittest.TestCase):
    def _caller(self, *, auth_type: str, scopes: list[str], role: str = "designer") -> AuthenticatedUser:
        return AuthenticatedUser(
            email="mcp@example.com",
            name="MCP",
            role=role,
            auth_type=auth_type,
            scopes=scopes,
        )

    def test_an_mcp_caller_without_the_scope_gets_www_authenticate(self) -> None:
        user = self._caller(auth_type=policy.MCP_AUTH_TYPE, scopes=["api:read"])
        with patch.object(settings, "PUBLIC_BASE_URL", BASE):
            with self.assertRaises(HTTPException) as caught:
                policy.authorize(user, "design")
        self.assertEqual(caught.exception.status_code, 403)
        header = (caught.exception.headers or {}).get("WWW-Authenticate", "")
        self.assertIn('error="insufficient_scope"', header)
        self.assertIn('scope="design:write"', header)
        self.assertIn(
            f'resource_metadata="{BASE}/.well-known/oauth-protected-resource"', header
        )

    def test_a_human_only_refusal_carries_no_scope_header(self) -> None:
        user = self._caller(auth_type=policy.MCP_AUTH_TYPE, scopes=["api:read", "admin"])
        with self.assertRaises(HTTPException) as caught:
            policy.authorize(user, "release")
        self.assertEqual(caught.exception.status_code, 403)
        self.assertIsNone(caught.exception.headers)

    def test_a_human_session_refusal_carries_no_scope_header(self) -> None:
        user = self._caller(auth_type="session", scopes=[], role="viewer")
        with self.assertRaises(HTTPException) as caught:
            policy.authorize(user, "design")
        self.assertIsNone(caught.exception.headers)


if __name__ == "__main__":
    unittest.main()
