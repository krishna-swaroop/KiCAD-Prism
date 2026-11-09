"""Talks to the Prism FastAPI backend.

This is the "HTTP later" seam: the shape is real and the calls work, but the agent
is useful without a backend configured (project detection and git status are
purely local). Everything here degrades to `None`/`[]` when the backend is
unreachable or unconfigured, so the UI can always render something.

stdlib-only (urllib) so the same module could be imported from KiCad's Python if
we ever want the plugin to talk to Prism directly.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from . import identity
from .identity import git_origin as _git_origin, normalise_url as _normalise_url

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 5
# After a request gets no answer, how long the backend counts as down. Calls in that
# window return None at once instead of each waiting out TIMEOUT. A proxy in front of
# a stopped backend (Caddy) accepts the connection and then hangs, so without this
# every call the plugin makes stacked up another full timeout.
DOWN_FOR = 30

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


class PrismRefused(Exception):
    """The backend answered with an HTTP error status."""

    def __init__(self, status: int, body: bytes = b""):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.body = body

    def detail(self) -> str:
        """The backend's own `detail` message, when its body carried one."""
        try:
            parsed = json.loads(self.body or b"{}")
        except ValueError:
            return ""
        return str(parsed.get("detail") or "") if isinstance(parsed, dict) else ""


class PrismUnreachable(Exception):
    """Nothing answered: refused, timed out, or cut off."""


@dataclass
class PrismConfig:
    base_url: str = DEFAULT_BASE_URL
    token: str = ""  # bearer token, if the backend requires auth

    @property
    def configured(self) -> bool:
        return bool(self.base_url)


class PrismClient:
    def __init__(self, config: PrismConfig):
        self.config = config
        self._down_until = 0.0

    @property
    def known_down(self) -> bool:
        """A recent request got no answer, so don't wait on another one yet."""
        return time.monotonic() < self._down_until

    # -- plumbing ---------------------------------------------------------

    def _opener(self) -> urllib.request.OpenerDirector:
        """An opener that trusts a redirect's PATH but never its HOST.

        A dev setup routes the agent through Vite's proxy (changeOrigin: true), which
        rewrites the Host header to its own target (127.0.0.1:8000) before forwarding
        to the backend. When the backend then 307s a trailing-slash mismatch, it builds
        Location from the request it actually received, so the redirect points at
        127.0.0.1:8000, meaningless to anyone but the machine running the backend. A
        remote agent (this machine's own PC, a laptop on the LAN) follows that and gets
        "connection refused" against its own loopback, and the request silently fails,
        the caller only ever sees an unreachable backend and cannot tell why.

        So a redirect to a loopback address we did not ask for is re-pointed at the
        configured base_url before being followed. Only that case: any other redirect
        is the server's real answer and is followed as given. Rewriting those too broke
        the http -> https upgrade a TLS proxy (Caddy) answers a plain-HTTP URL with:
        forcing the scheme back to http looped until urllib gave up.
        """
        base = urllib.parse.urlsplit(self.config.base_url)

        class _RewriteHost(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                parts = urllib.parse.urlsplit(newurl)
                leaked = (
                    (parts.hostname or "").lower() in _LOOPBACK_HOSTS
                    and parts.netloc.lower() != base.netloc.lower()
                )
                if leaked:
                    parts = parts._replace(scheme=base.scheme, netloc=base.netloc)
                return super().redirect_request(
                    req, fp, code, msg, headers, urllib.parse.urlunsplit(parts)
                )

        return urllib.request.build_opener(_RewriteHost)

    def _send(
        self,
        method: str,
        path: str,
        *,
        data: bytes | None = None,
        content_type: str = "",
        token: str | None = None,
        timeout: float = TIMEOUT,
    ) -> tuple[int, bytes]:
        """One request to the backend, every failure raised rather than swallowed.

        Returns (status, body). Raises PrismRefused when the backend answered with an
        HTTP error (its status and body come with it), PrismUnreachable when nothing
        answered. `token` overrides the configured bearer token; "" sends none.
        """
        url = self.config.base_url.rstrip("/") + path
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/json")
        if content_type:
            req.add_header("Content-Type", content_type)
        bearer = self.config.token if token is None else token
        if bearer:
            req.add_header("Authorization", f"Bearer {bearer}")
        try:
            with self._opener().open(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            try:
                body = exc.read()
            except OSError:
                body = b""
            raise PrismRefused(exc.code, body) from exc
        except (urllib.error.URLError, OSError) as exc:
            raise PrismUnreachable(str(exc)) from exc

    def _request(
        self, method: str, path: str, body: dict | None = None
    ) -> dict | list | None:
        if not self.config.configured or self.known_down:
            return None
        data = json.dumps(body).encode() if body is not None else None
        try:
            _status, raw = self._send(
                method,
                path,
                data=data,
                content_type="application/json" if data is not None else "",
            )
            return json.loads(raw) if raw else None
        except (PrismRefused, ValueError):
            # It answered, just not with what we wanted. Not "down".
            return None
        except PrismUnreachable:
            # No answer: refused, timed out, or cut off. The backend being down is a
            # normal state, not an error worth raising: the agent's local features
            # must keep working regardless.
            self._down_until = time.monotonic() + DOWN_FOR
            return None

    # -- API --------------------------------------------------------------

    def health(self) -> bool:
        """Is the backend reachable (and are we authenticated)?"""
        return self._request("GET", "/api/projects") is not None

    def plugin_version(self) -> dict | None:
        """The plugin version this server expects, and where to get it.

        The plugin follows the server it talks to, rather than updating on its own
        schedule. Unauthenticated on purpose: a plugin too old to authenticate is the
        one that most needs telling.
        """
        return self._request("GET", "/api/plugin/version")

    def agent_handoff_url(self, agent_token: str, next_url: str) -> tuple[str, str]:
        """Trade the agent's token for a one-shot URL that signs a browser in.

        Returns the URL and the email it belongs to, or ("", "") whenever the backend
        declines, which covers a revoked or expired token, auth being off, and a server
        too old to offer this. Every one of those means the browser should just ask for
        a login as it always did.
        """
        result = self._request(
            "POST",
            "/oauth/session/bootstrap-from-agent",
            {"agent_token": agent_token, "next_url": next_url},
        )
        result = result or {}
        return str(result.get("nonce_url") or ""), str(result.get("email") or "")

    def auth_config(self) -> dict | None:
        """Whether the server wants anyone to log in, and via which provider.

        Prism authenticates with OIDC authorization-code, you sign in at an
        identity provider in a *browser*, which redirects back with a code. There
        is no username/password endpoint to call, so a desktop client can't collect
        credentials itself; it has to hand off to the browser. When `auth_enabled`
        is false (the current default) every request is a guest and no token is
        needed at all.
        """
        return self._request("GET", "/api/auth/config")

    def me(self) -> dict | None:
        """Who the backend thinks we are, or None if we're not authenticated."""
        return self._request("GET", "/api/auth/me")

    def agent_config(self) -> dict | None:
        """Whether this server wants the agent to sign in.

        Returns ``{"sign_in_required": bool}`` from ``/api/agent/config``. None
        when the server is unreachable or too old to have the endpoint, in which
        case the caller falls back to the general auth config: an old server has
        no agent sign-in to offer anyway.
        """
        return self._request("GET", "/api/agent/config")

    def exchange_agent_code(
        self, *, code: str, redirect_uri: str, verifier: str, timeout: float = 30
    ) -> dict:
        """Trade a one-time sign-in code plus its PKCE verifier for an agent token.

        A direct POST to Prism, never through the browser, so the verifier and the
        token never touch a URL. Unlike the calls above this one raises: sign-in has
        to say why it failed. PrismRefused carries the server's reason, and a body
        that is not JSON raises ValueError.
        """
        data = urllib.parse.urlencode(
            {"code": code, "redirect_uri": redirect_uri, "code_verifier": verifier}
        ).encode("utf-8")
        _status, raw = self._send(
            "POST",
            "/api/agent/token",
            data=data,
            content_type="application/x-www-form-urlencoded",
            token="",
            timeout=timeout,
        )
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("not a JSON object")
        return payload

    def revoke_agent_token(self, jti: str, *, timeout: float = 15) -> bool:
        """Revoke the agent token with this registry id, authenticated as that token.

        Best-effort and never raises: whether the server confirmed.
        """
        try:
            status, _raw = self._send(
                "DELETE",
                f"/api/agent/tokens/{urllib.parse.quote(jti)}",
                timeout=timeout,
            )
        except (PrismRefused, PrismUnreachable):
            return False
        return 200 <= status < 300

    def identity(self) -> dict:
        """A summary the settings UI can render without knowing about OIDC."""
        cfg = self.auth_config()
        if cfg is None:
            return {
                "reachable": False,
                "auth_enabled": False,
                "user": None,
                "sign_in_required": False,
                "signed_in": False,
            }

        if not cfg.get("auth_enabled"):
            return {
                "reachable": True,
                "auth_enabled": False,
                "user": None,
                "provider": "",
                "sign_in_required": False,
                "signed_in": False,
                # Say why there's nothing to sign into, so the UI isn't just blank.
                "note": "This server has authentication disabled, every request is a guest.",
            }

        # Whether the agent needs its own token here. The dedicated endpoint is
        # authoritative; a server too old to have it still authenticates over the
        # general auth config, so auth_enabled is the fallback answer.
        agent_cfg = self.agent_config()
        sign_in_required = (
            bool(agent_cfg.get("sign_in_required"))
            if isinstance(agent_cfg, dict)
            else True
        )
        user = self.me()
        return {
            "reachable": True,
            "auth_enabled": True,
            "provider": cfg.get("oidc_provider_name", ""),
            "user": user,
            # The agent has a working token exactly when the server both wants one
            # and accepts the one we sent (me() is None when the token is missing,
            # wrong, expired, or revoked).
            "sign_in_required": sign_in_required,
            "signed_in": bool(user),
        }

    def find_project(self, path: str) -> dict | None:
        """Which Prism project is this local directory?

        Two ways, in order, and neither compares filesystem paths any more. The server
        no longer sends its own `path` (it was meaningless off-machine), so the old
        string match is gone.

        1. **The marker.** The checkout's `.prism.json` carries the project id. Direct
           lookup, works from anywhere.
        2. **The git origin.** For a checkout that predates the marker, ask git for its
           `origin` and match that against the project's `origin_url`. Also machine
           independent: two clones of the same repo agree on their remote no matter
           where they sit on disk.

        Both are identities. Neither is a guess about co-location.
        """
        rows = self._request("GET", "/api/projects")
        if not isinstance(rows, list):
            return None

        marker_id = identity.project_id(path)
        if marker_id:
            for row in rows:
                if isinstance(row, dict) and row.get("id") == marker_id:
                    return row
            # The checkout names a project this server does not have. Say nothing
            # rather than fall back: a loose match could report the *wrong* project,
            # and a wrong answer about which board you are looking at is worse than
            # no answer.
            return None

        return self._find_by_origin(rows, path)

    def _find_by_origin(self, rows: list, path: str) -> dict | None:
        """Match a checkout to a project by the git remote they share.

        For projects imported before the marker existed. A project with no origin at
        all (`origin_owner == "none"`) can never match this way, which is correct:
        there is nothing to match on, and guessing would be worse than saying no.
        """
        origin = _git_origin(path)
        if not origin:
            return None
        target = _normalise_url(origin)
        for row in rows:
            if not isinstance(row, dict):
                continue
            candidate = row.get("origin_url")
            if candidate and _normalise_url(candidate) == target:
                return row
        return None

    def project_url(self, project_id: str) -> str:
        """Deep link into the web app for this project.

        The route is `/project/<id>`, singular. Pluralising it (the natural typo,
        and what this used to do) matches no route, so the app's catch-all bounces
        you to the home page: "Open in Prism" appeared to work but just opened the
        web UI. Keep this in step with the Route in frontend/src/App.tsx.
        """
        return f"{self.config.base_url.rstrip('/')}/project/{project_id}"


# _normalise(path) used to live here: it canonicalised a filesystem path so the
# agent could compare its own against the one the server reported. The server no
# longer reports one, so there is nothing left to compare and the function is gone.
# Identity now travels in the repo (the marker) or in git (the origin).
