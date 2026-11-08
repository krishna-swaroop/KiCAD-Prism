"""The /api/agent routes: consent, code exchange, and token management.

Drives the real app with a signed-in session cookie, so it needs a database and
is skipped without PRISM_DATABASE_URL.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from unittest.mock import patch  # noqa: E402

DATABASE_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()

# Starlette's TestClient needs an HTTP client package (httpx2, or httpx) that the
# locked runtime does not ship, so CI cannot drive the app this way.
try:
    import starlette.testclient  # noqa: F401
    HAS_TEST_CLIENT = True
except RuntimeError:
    HAS_TEST_CLIENT = False

# Patched onto settings in setUpClass rather than read from the environment, so
# these run under CI's AUTH_ENABLED=false instead of silently skipping and going
# green without exercising the sign-in routes.
TEST_SECRET = "test-secret-at-least-32-characters-long-x"

from app.core.config import settings  # noqa: E402


def _path_of(url: str) -> str:
    """The path+query of an absolute URL, for driving TestClient."""
    parts = urlparse(url)
    return f"{parts.path}?{parts.query}" if parts.query else parts.path


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


@unittest.skipUnless(DATABASE_URL, "PRISM_DATABASE_URL is required for agent API tests")
@unittest.skipUnless(HAS_TEST_CLIENT, "starlette.testclient needs httpx2 or httpx")
class AgentApiTests(unittest.TestCase):
    REDIRECT = "http://127.0.0.1:53998/cb"

    @classmethod
    def setUpClass(cls) -> None:
        from starlette.testclient import TestClient

        # Auth on for the whole class: the sign-in routes require it, session
        # cookies need the secret, and the app reads both live. Patch before the
        # session store initialises so it sees the enabled posture.
        #
        # AUTH_ENABLED is a property over AUTH_ENABLED_OVERRIDE; patch the real field,
        # not the property (which cannot be cleanly unpatched on teardown).
        # Password login gives auth a login method, or the app refuses to start
        # (and exits the test run) when no OIDC is configured, as in CI.
        cls._patchers = [
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", True),
            patch.object(settings, "PASSWORD_AUTH_ENABLED", True),
            patch.object(settings, "SESSION_SECRET", TEST_SECRET),
        ]
        for patcher in cls._patchers:
            patcher.start()

        import app.main as main
        from app.services import access_service, session_store_service

        session_store_service.initialize_session_store()
        cls.main = main
        cls.access_service = access_service
        cls.session_store_service = session_store_service
        cls.TestClient = TestClient

    @classmethod
    def tearDownClass(cls) -> None:
        for patcher in getattr(cls, "_patchers", []):
            patcher.stop()

    def _client_for(self, email: str, role: str):
        from app.core.session import SESSION_COOKIE_NAME, create_session_token

        self.access_service.upsert_user(email=email, name=email.split("@")[0])
        self.access_service.upsert_user_role(email, role, updated_by=email)
        session_id, _ = self.session_store_service.create_session(email=email, name="Tester", picture="")
        client = self.TestClient(self.main.app)
        client.cookies.set(SESSION_COOKIE_NAME, create_session_token(session_id))
        return client

    def _obtain_token(self, client, *, email: str, label: str = "api-agent", scope: str = "api:read"):
        verifier, challenge = _pkce()
        form = {
            "redirect_uri": self.REDIRECT,
            "state": "state-xyz",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "label": label,
            "scope": scope,
        }
        consent = client.get("/api/agent/authorize", params=form)
        self.assertEqual(consent.status_code, 200)
        self.assertIn("Authorize", consent.text)

        submit = client.post("/api/agent/authorize", data=form, follow_redirects=False)
        self.assertEqual(submit.status_code, 303)
        location = submit.headers["location"]
        self.assertTrue(location.startswith(self.REDIRECT + "?code="))
        code = parse_qs(urlparse(location).query)["code"][0]

        exchange = self.TestClient(self.main.app).post(
            "/api/agent/token",
            data={"code": code, "redirect_uri": self.REDIRECT, "code_verifier": verifier},
        )
        self.assertEqual(exchange.status_code, 200)
        return exchange.json()["access_token"]

    def test_consent_to_token_to_use_to_revoke(self) -> None:
        client = self._client_for("api-owner@example.com", "designer")
        token = self._obtain_token(client, email="api-owner@example.com", label="my-laptop")

        bearer = self.TestClient(self.main.app)
        listed = bearer.get("/api/agent/tokens", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(listed.status_code, 200)
        self.assertIn("my-laptop", [row["label"] for row in listed.json()])
        jti = listed.json()[0]["jti"]

        revoked = client.delete(f"/api/agent/tokens/{jti}")
        self.assertEqual(revoked.status_code, 200)

        after = bearer.get("/api/agent/tokens", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(after.status_code, 401)

    def test_a_user_cannot_revoke_another_users_token(self) -> None:
        owner = self._client_for("owner2@example.com", "designer")
        token = self._obtain_token(owner, email="owner2@example.com")
        jti = (
            self.TestClient(self.main.app)
            .get("/api/agent/tokens", headers={"Authorization": f"Bearer {token}"})
            .json()[0]["jti"]
        )

        intruder = self._client_for("intruder@example.com", "designer")
        forbidden = intruder.delete(f"/api/agent/tokens/{jti}")
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_can_revoke_any_token_and_see_all(self) -> None:
        owner = self._client_for("owner3@example.com", "designer")
        token = self._obtain_token(owner, email="owner3@example.com")
        jti = (
            self.TestClient(self.main.app)
            .get("/api/agent/tokens", headers={"Authorization": f"Bearer {token}"})
            .json()[0]["jti"]
        )

        admin = self._client_for("admin@example.com", "admin")
        everyone = admin.get("/api/agent/tokens", params={"all_users": "true"})
        self.assertEqual(everyone.status_code, 200)
        self.assertIn(jti, {row["jti"] for row in everyone.json()})

        revoked = admin.delete(f"/api/agent/tokens/{jti}")
        self.assertEqual(revoked.status_code, 200)

    def test_non_loopback_redirect_is_rejected(self) -> None:
        client = self._client_for("api-owner4@example.com", "designer")
        _verifier, challenge = _pkce()
        response = client.get(
            "/api/agent/authorize",
            params={
                "redirect_uri": "https://evil.example.com/cb",
                "state": "s",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_a_guest_is_refused_at_the_consent_page(self) -> None:
        """Auth off serves every request as the implicit guest, so the flow is a no-op.

        The earlier "sign-in unavailable" guard already refuses when auth is off;
        keep it out of the way so the guest check itself is what answers.
        """
        from app.services import agent_auth_service

        _verifier, challenge = _pkce()
        form = {
            "redirect_uri": self.REDIRECT,
            "state": "state-xyz",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "label": "guest-agent",
            "scope": "api:read",
        }
        client = self.TestClient(self.main.app)
        with (
            patch.object(settings, "AUTH_ENABLED_OVERRIDE", False),
            patch.object(agent_auth_service, "agent_auth_enabled", lambda: True),
        ):
            consent = client.get("/api/agent/authorize", params=form)
            self.assertEqual(consent.status_code, 400)
            self.assertEqual(consent.json()["detail"], "Sign-in is not required on this server")

            submit = client.post("/api/agent/authorize", data=form, follow_redirects=False)
            self.assertEqual(submit.status_code, 400)
            self.assertEqual(submit.json()["detail"], "Sign-in is not required on this server")

    def test_revoking_an_unknown_token_is_404(self) -> None:
        client = self._client_for("api-owner5@example.com", "designer")
        self.assertEqual(client.delete("/api/agent/tokens/nope").status_code, 404)

    # -- signing the KiCad panel in with the agent's existing sign-in -----
    #
    # The panel is an embedded browser with its own cookie jar, so it asks for a login
    # the user already did in the plugin. These pin that the shortcut is a parallel
    # source of CREDENTIALS and not a parallel way of authenticating: the same session
    # machinery issues it, and the backend alone decides whether the agent's token is
    # still good.

    def _origin(self) -> str:
        """Whatever this deployment calls itself.

        Derived rather than hardcoded: PUBLIC_BASE_URL is commonly set (a reverse
        proxy, or a dev server in front of the API), and the origin check compares
        against that, not against the test client's host.
        """
        from app.core.config import settings

        return (settings.PUBLIC_BASE_URL or "http://testserver").rstrip("/")

    def _handoff(self, token: str, next_url: str | None = None):
        return self.TestClient(self.main.app).post(
            "/oauth/session/bootstrap-from-agent",
            json={
                "agent_token": token,
                "next_url": next_url or f"{self._origin()}/panel",
            },
        )

    def test_the_agents_sign_in_signs_the_panel_in_as_the_same_user(self) -> None:
        email = "panel-user@example.com"
        token = self._obtain_token(self._client_for(email, "designer"), email=email, scope="api:read api:write")

        response = self._handoff(token)
        self.assertEqual(response.status_code, 200)
        nonce_url = response.json()["nonce_url"]

        browser = self.TestClient(self.main.app)
        # Absolute to the configured origin; drive it by path against the test app.
        landed = browser.get(_path_of(nonce_url), follow_redirects=False)
        self.assertEqual(landed.status_code, 302)
        self.assertEqual(landed.headers["location"], f"{self._origin()}/panel")

        from app.core.session import SESSION_COOKIE_NAME

        self.assertIn(SESSION_COOKIE_NAME, landed.cookies)
        browser.cookies.set(SESSION_COOKIE_NAME, landed.cookies[SESSION_COOKIE_NAME])
        me = browser.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], email)

    def test_the_handoff_names_the_account_it_would_sign_in(self) -> None:
        """What the confirmation step shows, so nobody is signed in as a surprise.

        The email comes back with the URL rather than from a second call: the backend
        validated the token to mint the URL, so it already knows, and asking twice
        would only add a way for the two answers to disagree.
        """
        email = "panel-named@example.com"
        token = self._obtain_token(self._client_for(email, "designer"), email=email, scope="api:read api:write")

        body = self._handoff(token).json()
        self.assertEqual(body["email"], email)
        # Naming an account is not signing into it: that still takes the URL.
        self.assertTrue(body["nonce_url"])

    def test_the_handoff_is_single_use(self) -> None:
        email = "panel-once@example.com"
        token = self._obtain_token(self._client_for(email, "designer"), email=email, scope="api:read api:write")
        nonce_url = self._handoff(token).json()["nonce_url"]

        path = _path_of(nonce_url)
        self.assertEqual(
            self.TestClient(self.main.app).get(path, follow_redirects=False).status_code,
            302,
        )
        self.assertNotEqual(
            self.TestClient(self.main.app).get(path, follow_redirects=False).status_code,
            302,
        )

    def test_revoking_the_agents_token_revokes_this_too(self) -> None:
        """THE property that makes a second credential path safe to have."""
        email = "panel-revoked@example.com"
        client = self._client_for(email, "designer")
        token = self._obtain_token(client, email=email)

        jti = self.TestClient(self.main.app).get(
            "/api/agent/tokens", headers={"Authorization": f"Bearer {token}"}
        ).json()[0]["jti"]
        self.assertEqual(client.delete(f"/api/agent/tokens/{jti}").status_code, 200)

        self.assertNotEqual(self._handoff(token).status_code, 200)

    def test_a_forged_or_absent_token_buys_nothing(self) -> None:
        self.assertNotEqual(self._handoff("v1.not.a.real.token").status_code, 200)
        self.assertNotEqual(self._handoff("").status_code, 200)

    def test_the_handoff_cannot_be_aimed_off_this_origin(self) -> None:
        """Otherwise it is a redirector that hands out session cookies."""
        email = "panel-offsite@example.com"
        token = self._obtain_token(self._client_for(email, "designer"), email=email)
        self.assertEqual(
            self._handoff(token, next_url="https://evil.example.com/steal").status_code,
            400,
        )


if __name__ == "__main__":
    unittest.main()
