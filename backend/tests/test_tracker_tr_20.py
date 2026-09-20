"""TR-20: GitHub user OAuth identity adapter (F3)."""

from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.contracts import IdentityToken  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_identity import (  # noqa: E402
    AUTH_USER,
    DEFAULT_SCOPES,
    GHES_DEFAULT_SCOPES,
    GitHubIdentityAdapter,
    GitHubOAuthApp,
)
from app.services.trackers.http import TrackerHttp  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))

USER_ACCESS_A = "user-access-token-fixture-a"
USER_ACCESS_B = "user-access-token-fixture-b"
USER_REFRESH_A = "user-refresh-token-fixture-a"
USER_REFRESH_B = "user-refresh-token-fixture-b"
INSTALLATION_TOKEN = "installation-token-must-never-be-sent"
CLIENT_SECRET = "oauth-client-secret-fixture"


class _Raw:
    def __init__(self, status: int, *, headers=None, content=b"", reason="error", url="") -> None:
        self.status_code = status
        self.headers = headers or {}
        self.content = content
        self.reason = reason
        self.url = url
        self.text = content.decode("utf-8", "replace")

    def json(self):
        if not self.content:
            return {}
        return json.loads(self.content.decode("utf-8"))


class _Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now


class GitHubIdentityAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = _Clock()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = {}

    def _adapter(self, *, kind: str = "github.com", base_url: str = "", web_url: str = "") -> GitHubIdentityAdapter:
        app = GitHubOAuthApp(
            client_id="ov_client_fixture",
            client_secret=CLIENT_SECRET,
            instance_kind=kind,
            base_url=base_url,
            web_url=web_url,
            redirect_uri="https://prism.example/oauth/callback",
        )
        extra = ("ghe.example.com",) if kind == "ghes" else ()
        http = TrackerHttp(extra_hosts=extra, sender=self._sender)
        return GitHubIdentityAdapter(app, http=http, clock=self.clock)

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        headers = dict(kwargs.get("headers") or {})
        self.calls.append({"method": method, "url": url, "headers": headers, "json": kwargs.get("json")})
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method, url, status, payload=None, *, headers=None) -> None:
        content = b"" if payload is None else json.dumps(payload).encode()
        self._routes.setdefault((method.upper(), url), []).append(
            _Raw(status, content=content, url=url, headers=headers or {})
        )

    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F3["cases"]}
        self.assertIn("F3.oauth_pkce_required", ids)
        self.assertIn("F3.oauth_refresh", ids)
        self.assertIn("F3.oauth_state_mismatch", ids)

    def test_authorize_url_requires_pkce_s256(self) -> None:
        adapter = self._adapter()
        verifier = "pkce-verifier-fixture-aaaaaaaaaaaaaaaa"
        challenge = adapter.pkce_challenge_s256(verifier)
        url = adapter.authorize_url("state-one", challenge)
        parsed = urlsplit(url)
        self.assertEqual(parsed.netloc, "github.com")
        self.assertEqual(parsed.path, "/login/oauth/authorize")
        query = parse_qs(parsed.query)
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["code_challenge"], [challenge])
        self.assertEqual(query["state"], ["state-one"])
        self.assertEqual(query["scope"], ["read:user"])
        self.assertEqual(adapter.granted_scopes(), list(DEFAULT_SCOPES))
        with self.assertRaises(ProviderError) as caught:
            adapter.authorize_url("state-one", "")
        self.assertEqual(caught.exception.class_, "invalid_request")

    def test_exchange_sends_verifier_and_redacts_tokens(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "POST",
            "https://github.com/login/oauth/access_token",
            200,
            {
                "access_token": USER_ACCESS_A,
                "refresh_token": USER_REFRESH_A,
                "token_type": "bearer",
                "scope": "read:user",
                "expires_in": 28800,
            },
        )
        token = adapter.exchange("code-fixture", "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self.assertEqual(token.accessToken, USER_ACCESS_A)
        self.assertEqual(token.refreshToken, USER_REFRESH_A)
        self.assertEqual(token.scopes, ["read:user"])
        self.assertNotIn(USER_ACCESS_A, repr(token))
        self.assertNotIn(USER_ACCESS_A, str(token))
        posted = self.calls[0]["json"]
        self.assertEqual(posted["code_verifier"], "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self.assertEqual(posted["code"], "code-fixture")
        self.assertNotIn("installation", json.dumps(self.calls))
        self.assertTrue(all(INSTALLATION_TOKEN not in str(call) for call in self.calls))

    def test_refresh_rotates_tokens_and_failure_is_typed(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "POST",
            "https://github.com/login/oauth/access_token",
            200,
            {
                "access_token": USER_ACCESS_B,
                "refresh_token": USER_REFRESH_B,
                "token_type": "bearer",
                "scope": "read:user",
            },
        )
        previous = IdentityToken(
            accessToken=USER_ACCESS_A,
            refreshToken=USER_REFRESH_A,
            scopes=["read:user"],
        )
        rotated = adapter.refresh(previous)
        self.assertEqual(rotated.accessToken, USER_ACCESS_B)
        self.assertNotEqual(rotated.accessToken, previous.accessToken)
        self._enqueue(
            "POST",
            "https://github.com/login/oauth/access_token",
            200,
            {"error": "bad_verification_code", "error_description": "expired"},
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.refresh(rotated)
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertNotIn(USER_REFRESH_B, caught.exception.message)

    def test_stable_id_survives_login_rename(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            "https://api.github.com/user",
            200,
            {"id": 5550001, "login": "arjun-gh", "name": "Arjun Mehta"},
        )
        first = adapter.whoami(IdentityToken(accessToken=USER_ACCESS_A, scopes=["read:user"]))
        self._enqueue(
            "GET",
            "https://api.github.com/user",
            200,
            {"id": 5550001, "login": "arjun-renamed", "name": "Arjun Mehta"},
        )
        second = adapter.whoami(IdentityToken(accessToken=USER_ACCESS_A, scopes=["read:user"]))
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.id, "5550001")
        self.assertNotEqual(first.login, second.login)
        self.assertEqual(second.login, "arjun-renamed")
        self.assertFalse(first.isBot)
        authz = self.calls[0]["headers"]["Authorization"]
        self.assertEqual(authz, f"Bearer {USER_ACCESS_A}")
        self.assertNotIn(INSTALLATION_TOKEN, json.dumps(self.calls))

    def test_expired_grant_forces_reauthentication(self) -> None:
        adapter = self._adapter()
        self._enqueue("GET", "https://api.github.com/user", 401, {"message": "Bad credentials"})
        with self.assertRaises(ProviderError) as caught:
            adapter.whoami(IdentityToken(accessToken=USER_ACCESS_A))
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertFalse(caught.exception.retryable)

    def test_ghes_oauth_uses_instance_web_and_api_roots(self) -> None:
        ghes = "https://ghe.example.com/api/v3"
        adapter = self._adapter(kind="ghes", base_url=ghes)
        self.assertEqual(adapter.granted_scopes(), list(GHES_DEFAULT_SCOPES))
        url = adapter.authorize_url("st", adapter.pkce_challenge_s256("verifier-aaaaaaaa"))
        self.assertTrue(url.startswith("https://ghe.example.com/login/oauth/authorize?"))
        self.assertNotIn("github.com", url)
        self._enqueue(
            "POST",
            "https://ghe.example.com/login/oauth/access_token",
            200,
            {"access_token": USER_ACCESS_A, "token_type": "bearer", "scope": "read:user"},
        )
        token = adapter.exchange("code-ghes", "verifier-aaaaaaaa")
        self._enqueue(
            "GET",
            "https://ghe.example.com/api/v3/user",
            200,
            {"id": 9, "login": "ops-bot-user", "name": "Ops"},
        )
        user = adapter.whoami(token)
        self.assertEqual(user.id, "9")
        self.assertTrue(all("github.com" not in call["url"] for call in self.calls))
        self.assertEqual(AUTH_USER, "user")

    def test_pkce_and_token_errors_are_redacted(self) -> None:
        adapter = self._adapter()
        with self.assertRaises(ProviderError) as missing:
            adapter.exchange("code", "")
        self.assertEqual(missing.exception.class_, "invalid_request")
        self._enqueue(
            "POST",
            "https://github.com/login/oauth/access_token",
            403,
            {"message": f"token {USER_ACCESS_A} rejected"},
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.exchange("code-fixture", "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self.assertNotIn(USER_ACCESS_A, caught.exception.message)
        self.assertNotIn(CLIENT_SECRET, repr(adapter.app))


if __name__ == "__main__":
    unittest.main()
