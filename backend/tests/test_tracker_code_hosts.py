"""Code hosts beyond GitHub: account linking for GitLab and Gitea/Forgejo.

GitHub is the only host that publishes issues today. GitLab (gitlab.com and
self-managed) and Gitea/Forgejo hosts exist so people can link their accounts
under Settings → Connected accounts; every issue path must refuse them.
"""

from __future__ import annotations

import json
import unittest
import uuid
from contextlib import contextmanager
from urllib.parse import parse_qs, urlsplit

from app.api import tracker_identity as identity_api
from app.services import comments_schema_migrations
from app.services.trackers.connector_service import ConnectorService
from app.services.trackers.contracts import ForgeUser, IdentityToken
from app.services.trackers.errors import ProviderError
from app.services.trackers.gitea_identity import GiteaIdentityAdapter, GiteaOAuthApp
from app.services.trackers.github_identity import GitHubIdentityAdapter, GitHubOAuthApp
from app.services.trackers.gitlab_identity import GitLabIdentityAdapter, GitLabOAuthApp
from app.services.trackers.http import TrackerHttp
from app.services.trackers.identity_service import IdentityService, _provider_of
from app.services.trackers.migrations import (
    migrate_tracker_webhook_oauth_tables,
    migrate_workspace_tracker_tables,
)
from test_tracker_tr_21 import (
    POSTGRES_URL,
    SHARED_APPLICATION_DATABASE,
    _dsn,
    _request,
    _settings,
    psycopg,
    run,
    session,
)
from test_tracker_tr_47 import _Raw

try:
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    dict_row = None  # type: ignore[assignment]

CODEBERG = "https://codeberg.org"


class GiteaIdentityAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.calls: list[dict] = []
        self.routes: dict[tuple[str, str], _Raw] = {}

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append({"method": method, "url": url, "headers": dict(kwargs.get("headers") or {}),
                           "json": kwargs.get("json")})
        return self.routes.get((method.upper(), url), _Raw(404, content=b"{}", url=url))

    def _adapter(self, base_url: str = CODEBERG) -> GiteaIdentityAdapter:
        app = GiteaOAuthApp(client_id="gt_client", client_secret="gt_secret", base_url=base_url,
                            redirect_uri="https://prism.example/api/trackers/oauth/callback")
        return GiteaIdentityAdapter(app, http=TrackerHttp(extra_hosts=("codeberg.org",), sender=self._sender))

    def test_authorize_url_uses_instance_pkce_and_read_user(self) -> None:
        url = urlsplit(self._adapter().authorize_url("state-1", "challenge-1"))
        query = parse_qs(url.query)
        self.assertEqual((url.scheme, url.netloc, url.path), ("https", "codeberg.org", "/login/oauth/authorize"))
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["scope"], ["read:user"])
        self.assertEqual(query["redirect_uri"], ["https://prism.example/api/trackers/oauth/callback"])

    def test_exchange_and_whoami(self) -> None:
        self.routes[("POST", f"{CODEBERG}/login/oauth/access_token")] = _Raw(
            200, content=json.dumps({"access_token": "tok", "refresh_token": "ref", "expires_in": 3600}).encode(),
        )
        self.routes[("GET", f"{CODEBERG}/api/v1/user")] = _Raw(
            200, content=json.dumps({"id": 42, "login": "ana", "full_name": "Ana Ng"}).encode(),
        )
        adapter = self._adapter()
        token = adapter.exchange("code-1", "verifier-1")
        self.assertEqual(self.calls[0]["json"]["code_verifier"], "verifier-1")
        user = adapter.whoami(token)
        self.assertEqual((user.id, user.login, user.displayName), ("42", "ana", "Ana Ng"))
        self.assertEqual(self.calls[1]["headers"]["Authorization"], "Bearer tok")

    def test_revoked_grant_is_auth_lost(self) -> None:
        self.routes[("GET", f"{CODEBERG}/api/v1/user")] = _Raw(401, content=b"{}")
        with self.assertRaises(ProviderError) as raised:
            self._adapter().whoami(IdentityToken(accessToken="stale"))
        self.assertEqual(raised.exception.class_, "auth_lost")

    def test_base_url_must_be_https(self) -> None:
        with self.assertRaises(ProviderError):
            self._adapter("http://gitea.internal")


class IdentityDispatchTests(unittest.TestCase):
    def test_each_provider_gets_its_own_adapter(self) -> None:
        service = IdentityService(settings=_settings())
        cases = [
            (GitHubOAuthApp(client_id="a", client_secret="b"), GitHubIdentityAdapter, "github"),
            (GitLabOAuthApp(client_id="a", client_secret="b", instance_kind="self-hosted",
                            base_url="https://gitlab.acme.io"), GitLabIdentityAdapter, "gitlab"),
            (GiteaOAuthApp(client_id="a", client_secret="b", base_url=CODEBERG), GiteaIdentityAdapter, "gitea"),
        ]
        for app, adapter_type, provider in cases:
            self.assertIsInstance(service._adapter(app, "cn"), adapter_type)
            self.assertEqual(_provider_of(app), provider)


class _FakeGitLab:
    kind = "gitlab"

    def pkce_challenge_s256(self, verifier: str) -> str:
        return "challenge"

    def authorize_url(self, state: str, challenge: str) -> str:
        return f"https://gitlab.acme.io/oauth/authorize?state={state}"

    def exchange(self, code: str, verifier: str) -> IdentityToken:
        return IdentityToken(accessToken="gl-token", scopes=["read_user"])

    def whoami(self, token: IdentityToken) -> ForgeUser:
        return ForgeUser(id="7", login="ana", isBot=False, displayName="Ana")


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required")
@unittest.skipUnless(psycopg is not None, "psycopg is required")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class CodeHostPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"codehost_{uuid.uuid4().hex[:12]}"
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'CREATE SCHEMA "{self.schema}"')
        conn.execute(f'SET search_path TO "{self.schema}", public')
        conn.execute(
            """CREATE TABLE comments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, author TEXT NOT NULL DEFAULT '',
                   timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'OPEN',
                   context TEXT NOT NULL DEFAULT 'PCB', location_x REAL NOT NULL DEFAULT 0,
                   location_y REAL NOT NULL DEFAULT 0, location_layer TEXT NOT NULL DEFAULT '',
                   location_page TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '');
               CREATE TABLE comment_replies (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id),
                   project_id TEXT NOT NULL, author TEXT NOT NULL DEFAULT '',
                   timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), content TEXT NOT NULL DEFAULT '');""",
            prepare=False,
        )
        migrate_workspace_tracker_tables(conn)
        migrate_tracker_webhook_oauth_tables(conn)
        comments_schema_migrations.apply_comments_migrations(conn)
        conn.commit()
        conn.close()
        self.addCleanup(self._drop)
        self.settings = _settings()
        self.connectors = ConnectorService(connect=self._factory, settings=self.settings,
                                           comments_schema=self.schema, workspace_schema=self.schema)
        self.oauth_apps: list = []

        def adapter_factory(app):
            self.oauth_apps.append(app)
            return _FakeGitLab()

        self.identities = IdentityService(connect=self._factory, settings=self.settings,
                                          connector_service=self.connectors,
                                          adapter_factory=adapter_factory, workspace_schema=self.schema)
        identity_api.service = self.identities
        self.addCleanup(lambda: setattr(identity_api, "service", IdentityService()))

    def _drop(self) -> None:
        with psycopg.connect(_dsn()) as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')

    @contextmanager
    def _factory(self):
        conn = psycopg.connect(_dsn(), row_factory=dict_row)
        conn.execute(f'SET search_path TO "{self.schema}", public')
        try:
            yield conn
        finally:
            conn.close()

    def _gitlab(self, **overrides) -> dict:
        args = {"actor_user_id": "u_admin", "provider": "gitlab", "instance_kind": "self-hosted",
                "display_name": "Acme GitLab", "base_url": "https://gitlab.acme.io",
                "credentials": {"oauthClientId": "gl_app", "oauthClientSecret": "gl_secret"}}
        args.update(overrides)
        return self.connectors.create(**args)

    def test_gitlab_publishes_issues_and_gitea_only_links_accounts(self) -> None:
        gitlab = self._gitlab()
        gitea = self.connectors.create(actor_user_id="u_admin", provider="gitea", instance_kind="self-hosted",
                                       display_name="Codeberg", base_url=CODEBERG)
        self.assertEqual(gitlab["host"], "gitlab.acme.io")
        self.assertEqual(gitlab["capabilities"], {"issues": True, "accountLinking": True})
        self.assertEqual(gitea["capabilities"], {"issues": False, "accountLinking": False})
        # Without a bot token there is nothing to test yet.
        with self.assertRaises(ProviderError) as raised:
            self.connectors.test_connection(gitlab["id"], actor_user_id="u_admin")
        self.assertEqual(raised.exception.class_, "auth_lost")
        with self.assertRaises(ProviderError) as raised:
            self.connectors.test_connection(gitea["id"], actor_user_id="u_admin")
        self.assertEqual(raised.exception.class_, "capability_missing")

    def test_invalid_hosts_are_rejected(self) -> None:
        for bad in (
            {"instance_kind": "ghes"},
            {"base_url": "http://gitlab.acme.io"},
            {"base_url": "https://gitlab.com"},
        ):
            with self.subTest(bad=bad), self.assertRaises(ProviderError):
                self._gitlab(**bad)
        with self.assertRaises(ProviderError):
            self.connectors.create(actor_user_id="u_admin", provider="gitea", instance_kind="self-hosted")

    def test_linkable_hosts_list_only_what_people_can_connect(self) -> None:
        gitlab = self._gitlab()
        self.connectors.create(actor_user_id="u_admin", provider="gitea", instance_kind="self-hosted",
                               display_name="No OAuth app yet", base_url=CODEBERG)
        listed = run(identity_api.list_linkable_connectors(user=session("viewer")))
        self.assertEqual(listed, [{"id": gitlab["id"], "provider": "gitlab", "instanceKind": "self-hosted",
                                   "displayName": "Acme GitLab", "host": "gitlab.acme.io"}])
        self.assertNotIn("secret", json.dumps(listed))

    def test_linking_a_gitlab_account_records_gitlab(self) -> None:
        gitlab = self._gitlab()
        user = session("designer", user_id="u_1", session_id="sid_1")
        begun = run(identity_api.begin_oauth(gitlab["id"], request=_request(), returnTo="/?settings=accounts",
                                             user=user))
        state = parse_qs(urlsplit(begun.authorizeUrl).query)["state"][0]
        run(identity_api.oauth_callback(request=_request(), code="code", state=state, user=user))
        [identity] = run(identity_api.list_identities(user=user))
        self.assertEqual((identity["provider"], identity["forgeLogin"], identity["status"]), ("gitlab", "ana", "active"))
        # Authorize and token exchange must present the same redirect URI, taken
        # from the request origin rather than a PUBLIC_BASE_URL fallback.
        self.assertEqual(
            {app.redirect_uri for app in self.oauth_apps},
            {"https://prism.example/api/trackers/oauth/callback"},
        )
        self.assertTrue(all(isinstance(app, GitLabOAuthApp) for app in self.oauth_apps))


if __name__ == "__main__":
    unittest.main()
