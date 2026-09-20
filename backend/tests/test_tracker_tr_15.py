"""TR-15: GitHub App JWT and installation credentials (F3, F7)."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_auth import (  # noqa: E402
    AUTH_APP,
    AUTH_INSTALLATION,
    GITHUB_COM_API,
    GitHubAppAuth,
    GitHubAppCredentials,
    InstallationToken,
    api_root_for,
)
from app.services.trackers.http import TrackerHttp  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))

INSTALLATION_TOKEN_A = "installation-token-fixture-a-not-a-credential"
INSTALLATION_TOKEN_B = "installation-token-fixture-b-not-a-credential"
USER_TOKEN = "user-oauth-token-fixture"


def _rsa_pem() -> tuple[str, object]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return pem, key.public_key()


class _Raw:
    def __init__(self, status: int, *, headers=None, content=b"", reason="error", url="") -> None:
        self.status_code = status
        self.headers = headers or {}
        self.content = content
        self.reason = reason
        self.url = url
        self.text = content.decode("utf-8", "replace")

    def json(self):
        return json.loads(self.content.decode("utf-8") or "{}")


class _Clock:
    def __init__(self, start: datetime | None = None) -> None:
        self.now = start or datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: int) -> None:
        self.now = self.now + timedelta(seconds=seconds)


def _credentials(*, pem: str, kind: str = "github.com", base_url: str = "") -> GitHubAppCredentials:
    return GitHubAppCredentials(
        app_id="772215",
        installation_id="88001122",
        private_key_pem=pem,
        instance_kind=kind,
        base_url=base_url,
    )


class GitHubAppAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pem, self.public = _rsa_pem()
        self.clock = _Clock()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = {}

    def _auth(self, *, kind: str = "github.com", base_url: str = "", extra_hosts=()) -> GitHubAppAuth:
        creds = _credentials(pem=self.pem, kind=kind, base_url=base_url)
        http = TrackerHttp(
            extra_hosts=extra_hosts or (),
            sender=self._sender,
        )
        return GitHubAppAuth(creds, http=http, clock=self.clock)

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append({"method": method, "url": url, "headers": dict(kwargs.get("headers") or {})})
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method: str, url: str, status: int, payload: dict | None = None) -> None:
        content = json.dumps(payload or {}).encode()
        self._routes.setdefault((method.upper(), url), []).append(
            _Raw(status, content=content, url=url)
        )

    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F3["cases"]}
        self.assertIn("F3.installation_token_expiry", ids)
        self.assertIn("F3.ghes_base_url", ids)
        self.assertIn("F7.unauthorized_401", {case["id"] for case in F7["cases"]})

    def test_jwt_is_rs256_and_shorter_than_ten_minutes(self) -> None:
        auth = self._auth()
        token = auth.mint_jwt()
        claims = jwt.decode(
            token,
            self.public,
            algorithms=["RS256"],
            options={"verify_exp": False, "verify_iat": False},
        )
        self.assertEqual(str(claims["iss"]), "772215")
        self.assertLessEqual(int(claims["exp"]) - int(claims["iat"]), 600)
        self.assertNotIn(self.pem, token)
        self.assertNotIn("BEGIN", repr(auth.credentials))
        self.assertNotIn(self.pem.splitlines()[1], repr(auth.credentials))

    def test_github_com_uses_api_github_not_web_host(self) -> None:
        self.assertEqual(api_root_for(instance_kind="github.com"), GITHUB_COM_API)
        self._enqueue(
            "POST",
            "https://api.github.com/app/installations/88001122/access_tokens",
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "write", "metadata": "read"},
                "repository_selection": "all",
            },
        )
        token = self._auth().installation_token()
        self.assertEqual(token.token, INSTALLATION_TOKEN_A)
        self.assertEqual(self.calls[0]["url"], "https://api.github.com/app/installations/88001122/access_tokens")
        self.assertTrue(self.calls[0]["headers"]["Authorization"].startswith("Bearer "))
        self.assertNotIn(USER_TOKEN, json.dumps(self.calls))

    def test_f3_ghes_base_url_never_contacts_github_com(self) -> None:
        ghes = "https://ghe.example.com/api/v3"
        self.assertEqual(api_root_for(instance_kind="ghes", base_url=ghes), ghes)
        token_url = f"{ghes}/app/installations/88001122/access_tokens"
        self._enqueue(
            "POST",
            token_url,
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "write"},
            },
        )
        auth = GitHubAppAuth(
            _credentials(pem=self.pem, kind="ghes", base_url=ghes),
            clock=self.clock,
            sender=self._sender,
        )
        minted = auth.installation_token()
        self.assertEqual(minted.token, INSTALLATION_TOKEN_A)
        self.assertTrue(all("github.com" not in call["url"] for call in self.calls))
        self.assertEqual(self.calls[0]["url"], token_url)
        with self.assertRaises(ProviderError):
            api_root_for(instance_kind="ghes", base_url="https://api.github.com")

    def test_f3_installation_token_refresh_before_expiry(self) -> None:
        post = "https://api.github.com/app/installations/88001122/access_tokens"
        self._enqueue(
            "POST",
            post,
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T15:10:00Z",
                "permissions": {"issues": "write"},
            },
        )
        self._enqueue(
            "POST",
            post,
            201,
            {
                "token": INSTALLATION_TOKEN_B,
                "expires_at": "2026-09-20T16:10:00Z",
                "permissions": {"issues": "write"},
            },
        )
        auth = self._auth()
        first = auth.token_for_write()
        self.assertEqual(first.token, INSTALLATION_TOKEN_A)
        self.clock.advance(9 * 60)
        second = auth.token_for_write()
        self.assertEqual(second.token, INSTALLATION_TOKEN_B)
        self.assertEqual(len(self.calls), 2)
        self.assertNotEqual(INSTALLATION_TOKEN_A, second.token)
        stale_header = f"Bearer {INSTALLATION_TOKEN_A}"
        self.assertNotEqual(auth.installation_headers()["Authorization"], stale_header)

    def test_refresh_failure_is_auth_lost_and_never_uses_user_token(self) -> None:
        post = "https://api.github.com/app/installations/88001122/access_tokens"
        self._enqueue(
            "POST",
            post,
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T15:10:00Z",
                "permissions": {"issues": "write"},
            },
        )
        self._enqueue("POST", post, 401, {"message": "Bad credentials"})
        auth = self._auth()
        auth.token_for_write()
        self.clock.advance(9 * 60)
        with self.assertRaises(ProviderError) as caught:
            auth.token_for_write()
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertFalse(caught.exception.retryable)
        self.assertNotIn(USER_TOKEN, json.dumps(self.calls))
        self.assertTrue(all(USER_TOKEN not in str(call["headers"]) for call in self.calls))

    def test_revoked_installation_does_not_fall_back_to_user_tokens(self) -> None:
        post = "https://api.github.com/app/installations/88001122/access_tokens"
        self._enqueue("POST", post, 404, {"message": "Not Found"})
        auth = self._auth()
        with self.assertRaises(ProviderError) as caught:
            auth.token_for_write()
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertEqual(len(self.calls), 1)
        self.assertIn("access_tokens", self.calls[0]["url"])
        self.assertNotIn("login/oauth", self.calls[0]["url"])

    def test_concurrent_refresh_mints_once(self) -> None:
        post = "https://api.github.com/app/installations/88001122/access_tokens"
        started = threading.Event()
        release = threading.Event()

        def sender(method, url, **kwargs):  # noqa: ANN001
            self.calls.append({"method": method, "url": url})
            started.set()
            release.wait(timeout=2)
            return _Raw(
                201,
                content=json.dumps(
                    {
                        "token": INSTALLATION_TOKEN_A,
                        "expires_at": "2026-09-20T16:00:00Z",
                        "permissions": {"issues": "write"},
                    }
                ).encode(),
                url=url,
            )

        auth = GitHubAppAuth(
            _credentials(pem=self.pem),
            clock=self.clock,
            sender=sender,
        )
        results: list[str] = []

        def worker() -> None:
            results.append(auth.token_for_write().token)

        first = threading.Thread(target=worker)
        second = threading.Thread(target=worker)
        first.start()
        self.assertTrue(started.wait(timeout=2))
        second.start()
        release.set()
        first.join(timeout=2)
        second.join(timeout=2)
        self.assertEqual(results, [INSTALLATION_TOKEN_A, INSTALLATION_TOKEN_A])
        self.assertEqual(len(self.calls), 1)

    def test_test_connection_requires_issue_write_and_resolves_bot(self) -> None:
        root = GITHUB_COM_API
        self._enqueue("GET", f"{root}/app", 200, {"id": 772215, "slug": "prism-tracker"})
        self._enqueue(
            "GET",
            f"{root}/app/installations/88001122",
            200,
            {"id": 88001122, "suspended_at": None, "permissions": {"issues": "write"}},
        )
        self._enqueue(
            "GET",
            f"{root}/users/prism-tracker[bot]",
            200,
            {"id": 424242, "login": "prism-tracker[bot]"},
        )
        self._enqueue(
            "POST",
            f"{root}/app/installations/88001122/access_tokens",
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "write", "metadata": "read"},
                "repository_selection": "selected",
            },
        )
        self._enqueue(
            "GET",
            f"{root}/repositories/111",
            200,
            {"id": 111, "private": True},
        )
        result = self._auth().test_connection(remote_container_id="111")
        self.assertTrue(result["writesEnabled"])
        self.assertEqual(result["bot"]["id"], "424242")
        self.assertEqual(result["bot"]["login"], "prism-tracker[bot]")
        self.assertEqual(result["visibility"], "private")
        self.assertEqual(result["authKinds"], (AUTH_APP, AUTH_INSTALLATION))
        urls = [call["url"] for call in self.calls]
        self.assertIn(f"{root}/app", urls)
        self.assertIn(f"{root}/users/prism-tracker[bot]", urls)
        self.assertIn(f"{root}/repositories/111", urls)
        repo_auth = next(call["headers"]["Authorization"] for call in self.calls if call["url"].endswith("/repositories/111"))
        self.assertEqual(repo_auth, f"Bearer {INSTALLATION_TOKEN_A}")
        app_auth = next(call["headers"]["Authorization"] for call in self.calls if call["url"].endswith("/app"))
        self.assertNotEqual(app_auth, repo_auth)
        self.assertNotIn(USER_TOKEN, repo_auth)

    def test_non_numeric_remote_container_id_is_rejected(self) -> None:
        root = GITHUB_COM_API
        self._enqueue("GET", f"{root}/app", 200, {"id": 772215, "slug": "prism-tracker"})
        self._enqueue(
            "GET",
            f"{root}/app/installations/88001122",
            200,
            {"id": 88001122, "permissions": {"issues": "write"}},
        )
        self._enqueue(
            "GET",
            f"{root}/users/prism-tracker[bot]",
            200,
            {"id": 424242, "login": "prism-tracker[bot]"},
        )
        self._enqueue(
            "POST",
            f"{root}/app/installations/88001122/access_tokens",
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "write"},
            },
        )
        with self.assertRaises(ProviderError) as caught:
            self._auth().test_connection(remote_container_id="../app")
        self.assertEqual(caught.exception.class_, "invalid_request")
        self.assertFalse(any("/repositories/" in call["url"] for call in self.calls))

    def test_insufficient_permissions_pause_writes(self) -> None:
        root = GITHUB_COM_API
        self._enqueue("GET", f"{root}/app", 200, {"id": 772215, "slug": "prism-tracker"})
        self._enqueue(
            "GET",
            f"{root}/app/installations/88001122",
            200,
            {"id": 88001122, "permissions": {"issues": "read"}},
        )
        self._enqueue(
            "GET",
            f"{root}/users/prism-tracker[bot]",
            200,
            {"id": 424242, "login": "prism-tracker[bot]"},
        )
        self._enqueue(
            "POST",
            f"{root}/app/installations/88001122/access_tokens",
            201,
            {
                "token": INSTALLATION_TOKEN_A,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "read"},
            },
        )
        result = self._auth().test_connection()
        self.assertFalse(result["writesEnabled"])
        self.assertEqual(result["pausedReason"], "permissions")

    def test_installation_token_repr_hides_material(self) -> None:
        token = InstallationToken(
            token=INSTALLATION_TOKEN_A,
            expires_at=self.clock.now,
            permissions={"issues": "write"},
        )
        self.assertNotIn(INSTALLATION_TOKEN_A, repr(token))
        self.assertNotIn(INSTALLATION_TOKEN_A, str(token))


if __name__ == "__main__":
    unittest.main()
