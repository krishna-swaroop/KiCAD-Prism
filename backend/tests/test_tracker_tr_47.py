"""TR-47: GitLab bot credentials and user OAuth identity (F3, F10)."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.contracts import IdentityToken  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.gitlab_auth import (  # noqa: E402
    AUTH_BOT,
    AUTH_SERVICE_ACCOUNT,
    GITLAB_COM_API,
    GROUP_ISSUE_HOST,
    BotToken,
    GitLabBotAuth,
    GitLabBotCredentials,
    api_root_for,
    gitlab_com_capabilities,
    self_hosted_capabilities,
)
from app.services.trackers.gitlab_identity import (  # noqa: E402
    AUTH_USER,
    DEFAULT_SCOPES,
    GitLabIdentityAdapter,
    GitLabOAuthApp,
)
from app.services.trackers.http import TrackerHttp  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
F10 = json.loads((DOCS / "fixtures" / "F10.json").read_text(encoding="utf-8"))

BOT_TOKEN_A = "glpat-bot-token-fixture-a-not-a-credential"
BOT_TOKEN_B = "glpat-bot-token-fixture-b-not-a-credential"
USER_TOKEN = "user-oauth-token-fixture"
USER_ACCESS_A = "user-access-token-fixture-a"
USER_ACCESS_B = "user-access-token-fixture-b"
USER_REFRESH_A = "user-refresh-token-fixture-a"
USER_REFRESH_B = "user-refresh-token-fixture-b"
CLIENT_SECRET = "gitlab-oauth-client-secret-fixture"


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
    def __init__(self, start: datetime | None = None) -> None:
        self.now = start or datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: int) -> None:
        self.now = self.now + timedelta(seconds=seconds)


class GitLabBotAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = _Clock()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = {}

    def _creds(
        self,
        *,
        token: str = BOT_TOKEN_A,
        kind: str = "gitlab.com",
        base_url: str = "",
        token_kind: str = AUTH_BOT,
        expires_at: datetime | None = None,
    ) -> GitLabBotCredentials:
        return GitLabBotCredentials(
            access_token=token,
            instance_kind=kind,
            base_url=base_url,
            token_kind=token_kind,
            expires_at=expires_at,
        )

    def _auth(self, **kwargs) -> GitLabBotAuth:
        creds = self._creds(**kwargs)
        http = TrackerHttp(extra_hosts=("git.example.com",), sender=self._sender)
        return GitLabBotAuth(creds, http=http, clock=self.clock)

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append({"method": method, "url": url, "headers": dict(kwargs.get("headers") or {})})
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method: str, url: str, status: int, payload: dict | list | None = None) -> None:
        content = json.dumps(payload if payload is not None else {}).encode()
        self._routes.setdefault((method.upper(), url), []).append(_Raw(status, content=content, url=url))

    def test_fixture_cases_are_present(self) -> None:
        f3 = {case["id"] for case in F3["cases"]}
        f10 = {case["id"] for case in F10["cases"]}
        self.assertIn("F3.bot_identity_captured", f3)
        self.assertIn("F3.installation_token_expiry", f3)
        self.assertIn("F10.gitlab_group_vs_project", f10)
        self.assertEqual(F10["owner"], "TR-47")

    def test_gitlab_com_uses_api_v4_not_web_host(self) -> None:
        self.assertEqual(api_root_for(instance_kind="gitlab.com"), GITLAB_COM_API)
        auth = self._auth()
        token = auth.token_for_write()
        self.assertEqual(token.token, BOT_TOKEN_A)
        self.assertNotIn(BOT_TOKEN_A, repr(auth.credentials))
        self.assertNotIn(BOT_TOKEN_A, repr(token))
        self.assertNotIn(USER_TOKEN, json.dumps(self.calls))

    def test_self_hosted_base_path_never_contacts_gitlab_com(self) -> None:
        base = "https://git.example.com"
        self.assertEqual(
            api_root_for(instance_kind="self_hosted", base_url=base),
            "https://git.example.com/api/v4",
        )
        self._enqueue(
            "GET",
            "https://git.example.com/api/v4/user",
            200,
            {"id": 42, "username": "prism-bot", "name": "Prism Bot"},
        )
        self._enqueue(
            "GET",
            "https://git.example.com/api/v4/personal_access_tokens/self",
            200,
            {"id": 9, "scopes": ["api"], "active": True, "revoked": False},
        )
        result = self._auth(kind="self_hosted", base_url=base).test_connection()
        self.assertTrue(result["writesEnabled"])
        self.assertTrue(all("gitlab.com" not in call["url"] for call in self.calls))
        with self.assertRaises(ProviderError):
            api_root_for(instance_kind="self_hosted", base_url="https://gitlab.com")

    def test_bot_writes_never_use_user_grant(self) -> None:
        auth = self._auth()
        with self.assertRaises(ProviderError) as caught:
            GitLabBotAuth(
                self._creds(token="user-oauth:stolen"),
                http=TrackerHttp(sender=self._sender),
                clock=self.clock,
            ).token_for_write()
        self.assertEqual(caught.exception.class_, "invalid_request")
        headers = auth.bot_headers()
        self.assertEqual(headers["PRIVATE-TOKEN"], BOT_TOKEN_A)
        self.assertNotIn("Authorization", headers)
        self.assertNotIn(USER_TOKEN, headers["PRIVATE-TOKEN"])

    def test_expired_declared_token_is_auth_lost(self) -> None:
        expired = self.clock.now - timedelta(minutes=1)
        auth = self._auth(expires_at=expired)
        with self.assertRaises(ProviderError) as caught:
            auth.token_for_write()
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertFalse(caught.exception.retryable)

    def test_revoked_token_self_is_auth_lost_without_user_fallback(self) -> None:
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 42, "username": "prism-bot"},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/personal_access_tokens/self",
            200,
            {"id": 9, "scopes": ["api"], "active": False, "revoked": True},
        )
        with self.assertRaises(ProviderError) as caught:
            self._auth().test_connection()
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertTrue(all(USER_TOKEN not in str(call["headers"]) for call in self.calls))
        self.assertTrue(all("/oauth/" not in call["url"] for call in self.calls))

    def test_f3_bot_identity_captured_and_permissions(self) -> None:
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 424242, "username": "prism-gitlab-bot", "name": "Prism Bot"},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/personal_access_tokens/self",
            200,
            {"id": 11, "scopes": ["api", "read_user"], "active": True, "revoked": False},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/projects/111?license=false&statistics=false",
            200,
            {
                "id": 111,
                "path_with_namespace": "acme/board",
                "visibility": "private",
                "permissions": {
                    "project_access": {"access_level": 40},
                    "group_access": None,
                },
            },
        )
        result = self._auth(token_kind=AUTH_SERVICE_ACCOUNT).test_connection(
            remote_container_id="111",
            container_kind="project",
        )
        self.assertTrue(result["writesEnabled"])
        self.assertEqual(result["bot"]["id"], "424242")
        self.assertEqual(result["bot"]["login"], "prism-gitlab-bot")
        self.assertEqual(result["visibility"], "private")
        self.assertEqual(result["permissions"]["issues"], "write")
        self.assertIn(AUTH_BOT, result["authKinds"])
        self.assertEqual(result["authCapabilities"]["groupIssueHost"], GROUP_ISSUE_HOST)
        self.assertNotIn(BOT_TOKEN_A, json.dumps(result))

    def test_insufficient_scopes_pause_writes(self) -> None:
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 7, "username": "reader-bot"},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/personal_access_tokens/self",
            200,
            {"id": 3, "scopes": ["read_api"], "active": True, "revoked": False},
        )
        result = self._auth().test_connection()
        self.assertFalse(result["writesEnabled"])
        self.assertEqual(result["pausedReason"], "permissions")

    def test_f10_group_vs_project_containers(self) -> None:
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/projects/55?license=false&statistics=false",
            200,
            {"id": 55, "path_with_namespace": "acme/board", "visibility": "private"},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/groups/9",
            200,
            {"id": 9, "full_path": "acme", "visibility": "public"},
        )
        auth = self._auth()
        project = auth.get_container(container_kind="project", remote_container_id="55")
        group = auth.get_container(container_kind="group", remote_container_id="9")
        self.assertEqual(project.remoteContainerId, "55")
        self.assertEqual(project.visibility, "private")
        self.assertEqual(group.remoteContainerId, "9")
        self.assertEqual(group.visibility, "public")
        self.assertEqual(group.path, "acme")
        self.assertEqual(GROUP_ISSUE_HOST, "project")

        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 1, "username": "prism-bot"},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/personal_access_tokens/self",
            200,
            {"id": 1, "scopes": ["api"], "active": True, "revoked": False},
        )
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/groups/9",
            200,
            {"id": 9, "full_path": "acme", "visibility": "public"},
        )
        group_probe = auth.test_connection(remote_container_id="9", container_kind="group")
        self.assertFalse(group_probe["writesEnabled"])
        self.assertEqual(group_probe["pausedReason"], "group_requires_project")
        self.assertEqual(group_probe["permissions"]["groupIssueHost"], "project")
        self.assertTrue(group_probe["authCapabilities"]["groupIssuesRequireProject"])

    def test_pat_self_missing_is_capability_not_assumed(self) -> None:
        root = "https://git.example.com/api/v4"
        self._enqueue("GET", f"{root}/user", 200, {"id": 3, "username": "legacy-bot"})
        self._enqueue("GET", f"{root}/personal_access_tokens/self", 404, {"message": "404"})
        self._enqueue(
            "GET",
            f"{root}/projects/12?license=false&statistics=false",
            200,
            {
                "id": 12,
                "path_with_namespace": "acme/x",
                "visibility": "private",
                "permissions": {"project_access": {"access_level": 30}},
            },
        )
        result = self._auth(kind="self_hosted", base_url="https://git.example.com").test_connection(
            remote_container_id="12",
            container_kind="project",
        )
        self.assertTrue(result["writesEnabled"])
        self.assertFalse(result["authCapabilities"]["supportsPersonalAccessTokenSelf"])
        # Verified live on GitLab CE 19.4: hook tokens and resource_state_events.
        self.assertTrue(result["authCapabilities"]["supportsWebhookTokenAuth"])
        caps = self_hosted_capabilities()
        self.assertTrue(caps.hasStateEvents)
        self.assertFalse(caps.hasTransferEvents)
        com = gitlab_com_capabilities()
        self.assertTrue(com.hasStateEvents)
        self.assertEqual(com.maxAssignees, 1)

    def test_user_401_is_auth_lost(self) -> None:
        self._enqueue("GET", f"{GITLAB_COM_API}/user", 401, {"message": "401 Unauthorized"})
        with self.assertRaises(ProviderError) as caught:
            self._auth().test_connection()
        self.assertEqual(caught.exception.class_, "auth_lost")

    def test_non_numeric_container_id_rejected(self) -> None:
        with self.assertRaises(ProviderError) as caught:
            self._auth().get_container(container_kind="project", remote_container_id="../api")
        self.assertEqual(caught.exception.class_, "invalid_request")

    def test_concurrent_token_materialize_once(self) -> None:
        auth = self._auth()
        results: list[str] = []
        barrier = threading.Barrier(2)

        def worker() -> None:
            barrier.wait(timeout=2)
            results.append(auth.token_for_write().token)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=2)
        self.assertEqual(results, [BOT_TOKEN_A, BOT_TOKEN_A])

    def test_bot_token_repr_hides_material(self) -> None:
        token = BotToken(token=BOT_TOKEN_A, scopes=["api"], token_kind=AUTH_BOT)
        self.assertNotIn(BOT_TOKEN_A, repr(token))
        self.assertNotIn(BOT_TOKEN_A, str(token))


class GitLabIdentityAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = _Clock()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = {}

    def _adapter(
        self, *, kind: str = "gitlab.com", base_url: str = "", web_url: str = ""
    ) -> GitLabIdentityAdapter:
        app = GitLabOAuthApp(
            client_id="gl_client_fixture",
            client_secret=CLIENT_SECRET,
            instance_kind=kind,
            base_url=base_url,
            web_url=web_url,
            redirect_uri="https://prism.example/oauth/callback",
        )
        extra = ("git.example.com",) if kind == "self_hosted" else ()
        http = TrackerHttp(extra_hosts=extra, sender=self._sender)
        return GitLabIdentityAdapter(app, http=http, clock=self.clock)

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        headers = dict(kwargs.get("headers") or {})
        self.calls.append({"method": method, "url": url, "headers": headers, "json": kwargs.get("json")})
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method, url, status, payload=None) -> None:
        content = b"" if payload is None else json.dumps(payload).encode()
        self._routes.setdefault((method.upper(), url), []).append(_Raw(status, content=content, url=url))

    def test_fixture_oauth_cases_are_present(self) -> None:
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
        self.assertEqual(parsed.netloc, "gitlab.com")
        self.assertEqual(parsed.path, "/oauth/authorize")
        query = parse_qs(parsed.query)
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["code_challenge"], [challenge])
        self.assertEqual(query["state"], ["state-one"])
        self.assertEqual(query["response_type"], ["code"])
        self.assertEqual(query["scope"], ["read_user"])
        self.assertEqual(adapter.granted_scopes(), list(DEFAULT_SCOPES))
        with self.assertRaises(ProviderError) as caught:
            adapter.authorize_url("state-one", "")
        self.assertEqual(caught.exception.class_, "invalid_request")

    def test_exchange_sends_verifier_and_redacts_tokens(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "POST",
            "https://gitlab.com/oauth/token",
            200,
            {
                "access_token": USER_ACCESS_A,
                "refresh_token": USER_REFRESH_A,
                "token_type": "bearer",
                "scope": "read_user",
                "expires_in": 7200,
            },
        )
        token = adapter.exchange("code-fixture", "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self.assertEqual(token.accessToken, USER_ACCESS_A)
        self.assertEqual(token.refreshToken, USER_REFRESH_A)
        self.assertEqual(token.scopes, ["read_user"])
        self.assertNotIn(USER_ACCESS_A, repr(token))
        self.assertNotIn(USER_ACCESS_A, str(token))
        posted = self.calls[0]["json"]
        self.assertEqual(posted["code_verifier"], "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self.assertEqual(posted["code"], "code-fixture")
        self.assertTrue(all(BOT_TOKEN_A not in str(call) for call in self.calls))
        self.assertTrue(all("PRIVATE-TOKEN" not in call["headers"] for call in self.calls))

    def test_refresh_rotates_tokens_and_failure_is_typed(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "POST",
            "https://gitlab.com/oauth/token",
            200,
            {
                "access_token": USER_ACCESS_B,
                "refresh_token": USER_REFRESH_B,
                "token_type": "bearer",
                "scope": "read_user",
            },
        )
        previous = IdentityToken(
            accessToken=USER_ACCESS_A,
            refreshToken=USER_REFRESH_A,
            scopes=["read_user"],
        )
        rotated = adapter.refresh(previous)
        self.assertEqual(rotated.accessToken, USER_ACCESS_B)
        self.assertNotEqual(rotated.accessToken, previous.accessToken)
        self._enqueue(
            "POST",
            "https://gitlab.com/oauth/token",
            200,
            {"error": "invalid_grant", "error_description": "expired"},
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.refresh(rotated)
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertNotIn(USER_REFRESH_B, caught.exception.message)

    def test_stable_id_survives_username_rename(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 5550001, "username": "arjun-gl", "name": "Arjun Mehta"},
        )
        first = adapter.whoami(IdentityToken(accessToken=USER_ACCESS_A, scopes=["read_user"]))
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 5550001, "username": "arjun-renamed", "name": "Arjun Mehta"},
        )
        second = adapter.whoami(IdentityToken(accessToken=USER_ACCESS_A, scopes=["read_user"]))
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.id, "5550001")
        self.assertNotEqual(first.login, second.login)
        self.assertEqual(second.login, "arjun-renamed")
        self.assertFalse(first.isBot)
        authz = self.calls[0]["headers"]["Authorization"]
        self.assertEqual(authz, f"Bearer {USER_ACCESS_A}")
        self.assertNotIn("PRIVATE-TOKEN", self.calls[0]["headers"])
        self.assertNotIn(BOT_TOKEN_A, json.dumps(self.calls))

    def test_expired_grant_forces_reauthentication(self) -> None:
        adapter = self._adapter()
        self._enqueue("GET", f"{GITLAB_COM_API}/user", 401, {"message": "Unauthorized"})
        with self.assertRaises(ProviderError) as caught:
            adapter.whoami(IdentityToken(accessToken=USER_ACCESS_A))
        self.assertEqual(caught.exception.class_, "auth_lost")
        self.assertFalse(caught.exception.retryable)

    def test_self_hosted_oauth_uses_instance_web_and_api_roots(self) -> None:
        base = "https://git.example.com"
        adapter = self._adapter(kind="self_hosted", base_url=base)
        url = adapter.authorize_url("st", adapter.pkce_challenge_s256("verifier-aaaaaaaa"))
        self.assertTrue(url.startswith("https://git.example.com/oauth/authorize?"))
        self.assertNotIn("gitlab.com", url)
        self._enqueue(
            "POST",
            "https://git.example.com/oauth/token",
            200,
            {"access_token": USER_ACCESS_A, "token_type": "bearer", "scope": "read_user"},
        )
        token = adapter.exchange("code-sh", "verifier-aaaaaaaa")
        self._enqueue(
            "GET",
            "https://git.example.com/api/v4/user",
            200,
            {"id": 9, "username": "ops-user", "name": "Ops"},
        )
        user = adapter.whoami(token)
        self.assertEqual(user.id, "9")
        self.assertTrue(all("gitlab.com" not in call["url"] for call in self.calls))
        self.assertEqual(AUTH_USER, "user")

    def test_pkce_and_token_errors_are_redacted(self) -> None:
        adapter = self._adapter()
        with self.assertRaises(ProviderError) as missing:
            adapter.exchange("code", "")
        self.assertEqual(missing.exception.class_, "invalid_request")
        self._enqueue(
            "POST",
            "https://gitlab.com/oauth/token",
            403,
            {"message": f"token {USER_ACCESS_A} rejected"},
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.exchange("code-fixture", "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self.assertNotIn(USER_ACCESS_A, caught.exception.message)
        self.assertNotIn(CLIENT_SECRET, repr(adapter.app))

    def test_connector_identity_ui_contract_shape(self) -> None:
        """Preserve TrackerConnector / UserIdentity public fields — no schema hacks."""

        adapter = self._adapter()
        self._enqueue(
            "POST",
            "https://gitlab.com/oauth/token",
            200,
            {
                "access_token": USER_ACCESS_A,
                "refresh_token": USER_REFRESH_A,
                "token_type": "bearer",
                "scope": "read_user",
                "expires_in": 7200,
            },
        )
        token = adapter.exchange("code-fixture", "pkce-verifier-fixture-aaaaaaaaaaaaaaaa")
        self._enqueue(
            "GET",
            f"{GITLAB_COM_API}/user",
            200,
            {"id": 5550001, "username": "arjun-gl", "name": "Arjun"},
        )
        user = adapter.whoami(token)
        identity_dto = {
            "provider": adapter.kind,
            "forgeUserId": user.id,
            "forgeLogin": user.login,
            "scopes": token.scopes,
            "status": "active",
        }
        self.assertEqual(identity_dto["provider"], "gitlab")
        self.assertEqual(set(identity_dto), {"provider", "forgeUserId", "forgeLogin", "scopes", "status"})


if __name__ == "__main__":
    unittest.main()
