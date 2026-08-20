from __future__ import annotations

import asyncio
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException, Request, Response

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth as auth_api  # noqa: E402
from app.core import session  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.services.auth_service import PasswordAuthResult, ResolvedSessionUser  # noqa: E402

TEST_SECRET = "unit-test-session-secret-32-chars-min-abcdef"
# A synthetic, non-secret placeholder used wherever a test needs "some password".
VALID_PASSWORD = "x" * 12


def _fake_request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "headers": [(b"user-agent", b"pytest")],
        "client": ("127.0.0.1", 12345),
        "query_string": b"",
    }
    return Request(scope)


class RememberMeSessionTests(unittest.TestCase):
    """The remember-me lifetime must reach the token, the cookie, and the store
    consistently, since the store's expiry is what actually governs revocation."""

    def setUp(self) -> None:
        for attr, value in (("SESSION_SECRET", TEST_SECRET), ("SESSION_TTL_HOURS", 12), ("SESSION_REMEMBER_ME_DAYS", 30)):
            p = patch.object(settings, attr, value)
            p.start()
            self.addCleanup(p.stop)

    def test_remember_me_token_uses_long_ttl(self) -> None:
        remembered = session.create_session_token("sid", ttl_seconds=30 * 86400)
        normal = session.create_session_token("sid")
        remembered_exp = session.decode_session_token(remembered)["exp"]
        normal_exp = session.decode_session_token(normal)["exp"]
        # Remembered expiry is far past the 12h default.
        self.assertGreater(remembered_exp - normal_exp, 20 * 86400)

    def test_issue_session_threads_ttl_to_store_and_cookie(self) -> None:
        captured = {}

        def fake_create_session(**kwargs):
            captured.update(kwargs)
            return ("sid-123", MagicMock())

        user = ResolvedSessionUser(email="u@example.com", name="u", picture="", role="viewer")
        response = Response()
        with patch.object(auth_api.session_store_service, "create_session", side_effect=fake_create_session):
            auth_api._issue_session(user, _fake_request(), response, remember_me=True)

        # Store received the long TTL...
        self.assertEqual(captured["ttl_seconds"], 30 * 86400)
        # ...and the cookie max-age matches it.
        set_cookie = response.headers.get("set-cookie", "")
        self.assertIn(f"Max-Age={30 * 86400}", set_cookie)

    def test_normal_login_uses_default_ttl(self) -> None:
        captured = {}

        def fake_create_session(**kwargs):
            captured.update(kwargs)
            return ("sid-123", MagicMock())

        user = ResolvedSessionUser(email="u@example.com", name="u", picture="", role="viewer")
        response = Response()
        with patch.object(auth_api.session_store_service, "create_session", side_effect=fake_create_session):
            auth_api._issue_session(user, _fake_request(), response, remember_me=False)
        self.assertIsNone(captured["ttl_seconds"])


class PasswordLoginEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        p = patch.object(settings, "SESSION_SECRET", TEST_SECRET)
        p.start()
        self.addCleanup(p.stop)

    def _login(self, *, remember_me=False, must_change=False):
        req = auth_api.PasswordLoginRequest(
            email="u@example.com", password=VALID_PASSWORD, remember_me=remember_me
        )
        result = PasswordAuthResult(
            user=ResolvedSessionUser(email="u@example.com", name="u", picture="", role="designer"),
            must_change_password=must_change,
        )
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), \
             patch.object(settings, "PASSWORD_AUTH_ENABLED", True), \
             patch.object(auth_api, "authenticate_password", return_value=result), \
             patch.object(auth_api, "_enforce_login_rate_limit", return_value="bucket"), \
             patch.object(auth_api.rate_limit_service, "clear"), \
             patch.object(auth_api, "_issue_session"):
            return asyncio.run(auth_api.login_with_password(req, _fake_request(), Response()))

    def test_success_returns_role_and_no_must_change(self) -> None:
        out = self._login()
        self.assertEqual(out.role, "designer")
        self.assertFalse(out.must_change_password)

    def test_must_change_flag_surfaces(self) -> None:
        out = self._login(must_change=True)
        self.assertTrue(out.must_change_password)

    def test_password_disabled_is_400(self) -> None:
        req = auth_api.PasswordLoginRequest(email="u@example.com", password="pw")
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), \
             patch.object(settings, "PASSWORD_AUTH_ENABLED", False):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(auth_api.login_with_password(req, _fake_request(), Response()))
            self.assertEqual(ctx.exception.status_code, 400)

    def test_bad_credentials_do_not_clear_rate_limiter(self) -> None:
        # A failed attempt must leave the limiter counting, or brute force is free.
        req = auth_api.PasswordLoginRequest(email="u@example.com", password="wrong")
        clear = MagicMock()
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), \
             patch.object(settings, "PASSWORD_AUTH_ENABLED", True), \
             patch.object(auth_api, "_enforce_login_rate_limit", return_value="bucket"), \
             patch.object(auth_api.rate_limit_service, "clear", clear), \
             patch.object(auth_api, "authenticate_password", side_effect=HTTPException(status_code=401, detail="Invalid email or password.")):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(auth_api.login_with_password(req, _fake_request(), Response()))
        self.assertEqual(ctx.exception.status_code, 401)
        clear.assert_not_called()


class AuthConfigTests(unittest.TestCase):
    def test_config_reports_enabled_methods(self) -> None:
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), \
             patch.object(settings, "PASSWORD_AUTH_ENABLED", True), \
             patch.object(auth_api, "oidc_enabled", return_value=False):
            cfg = asyncio.run(auth_api.get_auth_config())
        self.assertTrue(cfg.password_auth_enabled)
        self.assertFalse(cfg.oidc_enabled)
        self.assertTrue(cfg.auth_enabled)


if __name__ == "__main__":
    unittest.main()
