"""Connected-account OAuth lifecycle (TR-21, C3).

One-use OAuth state is bound to the authenticated user, session and connector.
User tokens are encrypted per identity; refresh is serialized per row. Bot
installation credentials on the connector are never used for user OAuth.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional
from uuid import uuid4

from app.core.config import Settings, settings as default_settings
from app.services.trackers.connector_service import ConnectorNotFound, ConnectorService
from app.services.trackers.errors import ProviderError
from app.services.trackers.gitea_identity import GiteaIdentityAdapter, GiteaOAuthApp
from app.services.trackers.github_identity import GitHubIdentityAdapter, GitHubOAuthApp
from app.services.trackers.gitlab_identity import GitLabIdentityAdapter, GitLabOAuthApp

OAuthApp = GitHubOAuthApp | GitLabOAuthApp | GiteaOAuthApp
IdentityAdapter = GitHubIdentityAdapter | GitLabIdentityAdapter | GiteaIdentityAdapter


def _provider_of(app: OAuthApp) -> str:
    if isinstance(app, GitLabOAuthApp):
        return "gitlab"
    if isinstance(app, GiteaOAuthApp):
        return "gitea"
    return "github"
from app.services.trackers.credential_sidecars import load_oauth_client, store_oauth_client
from app.services.trackers.secrets import SecretStoreLocked, decrypt_secret, encrypt_secret

STATE_TTL_SECONDS = 600
TOKEN_FIELD = "user_oauth"
_user_cache_versions: dict[str, int] = {}
_user_cache_lock = threading.Lock()


class IdentityNotFound(KeyError):
    """No linked identity for this user and connector."""


class OAuthStateError(ValueError):
    """Invalid, expired, replayed or cross-user OAuth state."""


def bump_user_cache(user_id: str) -> None:
    with _user_cache_lock:
        _user_cache_versions[user_id] = int(_user_cache_versions.get(user_id, 0)) + 1


def user_cache_version(user_id: str) -> int:
    with _user_cache_lock:
        return int(_user_cache_versions.get(user_id, 0))


def validate_relative_return_to(path: str) -> str:
    """Reject open redirects; only same-origin relative paths are allowed.

    Rejects scheme-relative URLs, absolute URLs, backslashes (Windows / open
    redirect tricks), and ASCII control characters.
    """

    candidate = (path or "/").strip()
    if not candidate.startswith("/") or candidate.startswith("//"):
        return "/"
    if "://" in candidate:
        return "/"
    if "\\" in candidate:
        return "/"
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in candidate):
        return "/"
    return candidate


def build_oauth_return_url(
    return_to: str, *, linked: bool, error_code: str | None = None, connector_id: str | None = None,
) -> str:
    from urllib.parse import parse_qsl, urlencode

    safe = validate_relative_return_to(return_to)
    if "?" in safe:
        base, query = safe.split("?", 1)
    else:
        base, query = safe, ""
    params = list(parse_qsl(query, keep_blank_values=True))
    params = [
        (key, value) for key, value in params
        if key not in {"tracker_oauth", "tracker_oauth_error", "tracker_oauth_connector", "connector_id"}
    ]
    if linked:
        params.append(("tracker_oauth", "linked"))
        if connector_id:
            # Lets Connected accounts name the host it just linked.
            params.append(("tracker_oauth_connector", connector_id))
    else:
        params.append(("tracker_oauth", "error"))
        if error_code:
            params.append(("tracker_oauth_error", error_code))
    encoded = urlencode(params)
    return f"{base}?{encoded}" if encoded else base


def _qual(schema: str, table: str) -> str:
    return f'"{schema}".{table}' if schema.replace("_", "").isalnum() else table


class IdentityService:
    def __init__(
        self,
        *,
        connect: Callable[[], Any] | None = None,
        settings: Settings | None = None,
        connector_service: ConnectorService | None = None,
        adapter_factory: Callable[[Any], Any] | None = None,
        workspace_schema: str = "workspace",
    ) -> None:
        self._connect = connect
        self.settings = settings or default_settings
        self.connector_service = connector_service or ConnectorService(settings=self.settings)
        self._adapter_factory = adapter_factory
        self.workspace_schema = workspace_schema

    @contextmanager
    def connection(self):
        if self._connect is not None:
            with self._connect() as conn:
                yield conn
            return
        from app.services.postgres_database import database

        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            yield conn

    def peek_oauth_return_to(self, state_token: str) -> str:
        """Best-effort ``return_to`` from OAuth state for callback error redirects."""

        try:
            state_id, _, _ = self._decode_state(state_token)
        except OAuthStateError:
            return "/"
        try:
            with self.connection() as conn:
                row = conn.execute(
                    "SELECT return_to FROM tracker_oauth_states WHERE state_id = %s",
                    (state_id,),
                ).fetchone()
        except Exception:
            return "/"
        if row is None:
            return "/"
        return validate_relative_return_to(str(row.get("return_to") or "/"))

    def begin_oauth(
        self,
        *,
        user_id: str,
        session_id: str,
        connector_id: str,
        callback_url: str,
        return_to: str = "/",
    ) -> dict[str, str]:
        if not (user_id or "").strip():
            raise OAuthStateError("identity_unresolved")
        self._require_connector(connector_id)
        safe_return_to = validate_relative_return_to(return_to)
        # The forge must redirect to the origin this request came through; the
        # token exchange later repeats the same value from the stored state.
        oauth_app = self._oauth_app(connector_id, redirect_uri=callback_url)
        verifier = secrets.token_urlsafe(64)
        adapter = self._adapter(oauth_app, connector_id)
        challenge = adapter.pkce_challenge_s256(verifier)
        state_id = f"tos_{uuid4().hex[:16]}"
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=STATE_TTL_SECONDS)
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO tracker_oauth_states (
                    state_id, user_id, session_id, connector_id,
                    pkce_verifier, callback_url, return_to, expires_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    state_id,
                    user_id,
                    session_id,
                    connector_id,
                    verifier,
                    callback_url,
                    safe_return_to,
                    expires_at,
                ),
            )
            conn.commit()
        state_token = self._encode_state(state_id, connector_id, user_id)
        authorize_url = adapter.authorize_url(state_token, challenge)
        return {"authorizeUrl": authorize_url, "state": state_token}

    def complete_oauth(
        self,
        *,
        code: str,
        state_token: str,
        session_id: str,
        actor_user_id: str,
    ) -> dict:
        state_id, connector_id, bound_user = self._decode_state(state_token)
        return_to = "/"
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT * FROM tracker_oauth_states
                WHERE state_id = %s AND consumed_at IS NULL
                FOR UPDATE
                """,
                (state_id,),
            ).fetchone()
            if row is None:
                raise OAuthStateError("unknown_or_reused_state")
            return_to = validate_relative_return_to(str(row.get("return_to") or "/"))
            if row["connector_id"] != connector_id:
                raise OAuthStateError("connector_mismatch")
            if row["user_id"] != bound_user:
                raise OAuthStateError("user_mismatch")
            expires_at = row["expires_at"]
            if isinstance(expires_at, datetime) and expires_at.astimezone(timezone.utc) <= datetime.now(timezone.utc):
                raise OAuthStateError("state_expired")
            if row["user_id"] != actor_user_id or bound_user != actor_user_id:
                raise OAuthStateError("cross_user_callback")
            if row["session_id"] != session_id:
                raise OAuthStateError("session_expired")
            conn.execute(
                "UPDATE tracker_oauth_states SET consumed_at = NOW() WHERE state_id = %s",
                (state_id,),
            )
            oauth_app = self._oauth_app(
                connector_id, conn=conn, redirect_uri=str(row.get("callback_url") or "") or None,
            )
            adapter = self._adapter(oauth_app, connector_id)
            token = adapter.exchange(code, str(row["pkce_verifier"]))
            forge_user = adapter.whoami(token)
            identity = self._upsert_identity(
                conn,
                user_id=actor_user_id,
                connector_id=connector_id,
                provider=_provider_of(oauth_app),
                forge_user_id=str(forge_user.id),
                forge_login=str(forge_user.login),
                token=token,
                scopes=token.scopes,
            )
            self._audit(
                conn,
                action="identity.link",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"forgeUserId": forge_user.id, "forgeLogin": forge_user.login},
            )
            conn.commit()
            bump_user_cache(actor_user_id)
            public = dict(identity)
            public["returnTo"] = return_to
            return public

    def list_identities(self, user_id: str) -> list[dict]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT ui.*, tc.provider
                FROM user_identities ui
                JOIN tracker_connectors tc ON tc.id = ui.connector_id
                WHERE ui.user_id = %s
                ORDER BY ui.linked_at ASC, ui.connector_id ASC
                """,
                (user_id,),
            ).fetchall()
            return [self._public_identity(row) for row in rows]

    def list_linkable(self) -> list[dict]:
        """Code hosts a signed-in person can link: an OAuth app is registered and the host is not revoked.

        Carries only what the Connected accounts screen shows; no credential
        or delivery detail reaches non-admin users.
        """
        from app.services.trackers.connector_service import connector_host

        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT tc.id, tc.provider, tc.instance_kind, tc.display_name, tc.base_url
                FROM tracker_connectors tc
                JOIN tracker_oauth_clients oc ON oc.connector_id = tc.id
                WHERE COALESCE(tc.paused_reason, '') <> 'revoked'
                ORDER BY tc.created_at ASC, tc.id ASC
                """,
            ).fetchall()
        return [
            {
                "id": str(row["id"]),
                "provider": str(row["provider"]),
                "instanceKind": str(row["instance_kind"]),
                "displayName": str(row.get("display_name") or ""),
                "host": connector_host(row),
            }
            for row in rows
        ]

    def unlink(self, user_id: str, connector_id: str) -> None:
        with self.connection() as conn:
            updated = self._revoke_row(conn, user_id=user_id, connector_id=connector_id)
            if updated is None:
                raise IdentityNotFound(connector_id)
            self._audit(
                conn,
                action="identity.unlink",
                actor_user_id=user_id,
                connector_id=connector_id,
                detail={"forgeUserId": updated.get("forge_user_id")},
            )
            conn.commit()
            bump_user_cache(user_id)

    def admin_revoke(self, *, actor_user_id: str, user_id: str, connector_id: str) -> dict:
        with self.connection() as conn:
            updated = self._revoke_row(conn, user_id=user_id, connector_id=connector_id)
            if updated is None:
                raise IdentityNotFound(connector_id)
            self._audit(
                conn,
                action="identity.admin_revoke",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"targetUserId": user_id, "forgeUserId": updated.get("forge_user_id")},
            )
            conn.commit()
            bump_user_cache(user_id)
            return self._public_identity(updated)

    def refresh_identity_token(self, user_id: str, connector_id: str) -> dict:
        """Serialize refresh on the identity row; re-encrypt and return public DTO."""

        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT ui.*, tc.provider, tc.instance_kind, tc.base_url
                FROM user_identities ui
                JOIN tracker_connectors tc ON tc.id = ui.connector_id
                WHERE ui.user_id = %s AND ui.connector_id = %s AND ui.status = 'active'
                FOR UPDATE
                """,
                (user_id, connector_id),
            ).fetchone()
            if row is None:
                raise IdentityNotFound(connector_id)
            envelope = row.get("token_envelope")
            if not envelope:
                raise ProviderError("auth_lost", "Linked identity has no stored token.")
            token_payload = json.loads(
                decrypt_secret(envelope, _token_context(str(row["id"])), settings=self.settings).decode()
            )
            from app.services.trackers.contracts import IdentityToken

            current = IdentityToken.model_validate(token_payload)
            oauth_app = self._oauth_app(connector_id, conn=conn)
            adapter = self._adapter(oauth_app, connector_id)
            refreshed = adapter.refresh(current)
            identity = self._upsert_identity(
                conn,
                user_id=user_id,
                connector_id=connector_id,
                provider=str(row["provider"]),
                forge_user_id=str(row["forge_user_id"]),
                forge_login=str(row["forge_login"]),
                token=refreshed,
                scopes=refreshed.scopes,
                identity_id=str(row["id"]),
            )
            conn.commit()
            bump_user_cache(user_id)
            return identity

    def _upsert_identity(
        self,
        conn: Any,
        *,
        user_id: str,
        connector_id: str,
        provider: str,
        forge_user_id: str,
        forge_login: str,
        token: Any,
        scopes: list[str],
        identity_id: str | None = None,
    ) -> dict:
        iid = identity_id or f"uid_{uuid4().hex[:12]}"
        envelope = encrypt_secret(
            json.dumps(token.model_dump()),
            _token_context(iid),
            settings=self.settings,
        )
        expires_at = None
        if token.expiresAt:
            try:
                expires_at = datetime.fromisoformat(str(token.expiresAt).replace("Z", "+00:00"))
            except ValueError:
                expires_at = None
        conn.execute(
            """
            INSERT INTO user_identities (
                id, user_id, connector_id, provider, forge_user_id, forge_login,
                token_envelope, scopes, status, expires_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, 'active', %s)
            ON CONFLICT (user_id, connector_id) DO UPDATE SET
                forge_user_id = EXCLUDED.forge_user_id,
                forge_login = EXCLUDED.forge_login,
                token_envelope = EXCLUDED.token_envelope,
                scopes = EXCLUDED.scopes,
                status = 'active',
                expires_at = EXCLUDED.expires_at,
                linked_at = NOW()
            """,
            (
                iid,
                user_id,
                connector_id,
                provider,
                forge_user_id,
                forge_login,
                envelope,
                json.dumps(scopes or []),
                expires_at,
            ),
        )
        row = conn.execute(
            """
            SELECT ui.*, tc.provider
            FROM user_identities ui
            JOIN tracker_connectors tc ON tc.id = ui.connector_id
            WHERE ui.user_id = %s AND ui.connector_id = %s
            """,
            (user_id, connector_id),
        ).fetchone()
        return self._public_identity(row)

    def _revoke_row(self, conn: Any, *, user_id: str, connector_id: str) -> Optional[dict]:
        row = conn.execute(
            """
            UPDATE user_identities
            SET status = 'revoked', token_envelope = NULL, expires_at = NULL
            WHERE user_id = %s AND connector_id = %s AND status = 'active'
            RETURNING *
            """,
            (user_id, connector_id),
        ).fetchone()
        return dict(row) if row else None

    def _public_identity(self, row: Mapping[str, Any]) -> dict:
        linked_at = row.get("linked_at")
        expires_at = row.get("expires_at")
        scopes = row.get("scopes") or []
        if isinstance(scopes, str):
            scopes = json.loads(scopes)
        payload = {
            "connectorId": row["connector_id"],
            "provider": row.get("provider") or row.get("provider"),
            "forgeUserId": str(row["forge_user_id"]),
            "forgeLogin": str(row["forge_login"]),
            "scopes": list(scopes),
            "linkedAt": linked_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if isinstance(linked_at, datetime)
            else str(linked_at or ""),
            "expiresAt": expires_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if isinstance(expires_at, datetime)
            else (str(expires_at) if expires_at else None),
            "status": str(row.get("status") or "active"),
        }
        dumped = json.dumps(payload, default=str).casefold()
        if "token_envelope" in dumped or "begin " in dumped or "accesstoken" in dumped:
            raise RuntimeError("identity public DTO leaked credential material")
        return payload

    def _require_connector(self, connector_id: str) -> dict:
        try:
            return self.connector_service.get(connector_id)
        except ConnectorNotFound as exc:
            raise OAuthStateError("connector_not_found") from exc

    def _oauth_app(
        self, connector_id: str, *, conn: Any | None = None, redirect_uri: str | None = None,
    ) -> OAuthApp:
        if conn is None:
            with self.connection() as owned:
                return self._oauth_app(connector_id, conn=owned, redirect_uri=redirect_uri)
        try:
            client_id, secret = load_oauth_client(conn, connector_id, settings=self.settings)
        except KeyError:
            raise OAuthStateError("oauth_client_not_configured") from None
        connector = conn.execute(
            "SELECT provider, instance_kind, base_url FROM tracker_connectors WHERE id = %s",
            (connector_id,),
        ).fetchone()
        if not connector:
            raise OAuthStateError("connector_not_found")
        callback = redirect_uri or self._callback_url(connector_id)
        provider = str(connector.get("provider") or "github")
        if provider == "gitlab":
            return GitLabOAuthApp(
                client_id=client_id,
                client_secret=secret,
                instance_kind=str(connector["instance_kind"]),
                base_url=str(connector.get("base_url") or ""),
                redirect_uri=callback,
            )
        if provider == "gitea":
            return GiteaOAuthApp(
                client_id=client_id,
                client_secret=secret,
                base_url=str(connector.get("base_url") or ""),
                redirect_uri=callback,
            )
        return GitHubOAuthApp(
            client_id=client_id,
            client_secret=secret,
            instance_kind=str(connector["instance_kind"]),
            base_url=str(connector.get("base_url") or ""),
            redirect_uri=callback,
        )

    def _callback_url(self, connector_id: str) -> str:
        base = (getattr(self.settings, "PUBLIC_BASE_URL", "") or "").strip().rstrip("/")
        if not base:
            base = "http://localhost:8000"
        return f"{base}/api/trackers/oauth/callback"

    def _adapter(self, app: OAuthApp, connector_id: str) -> IdentityAdapter:
        if self._adapter_factory is not None:
            return self._adapter_factory(app)
        hosts = str(getattr(self.settings, "PRISM_FORGE_HOSTS", "") or "")
        if isinstance(app, GitLabOAuthApp):
            return GitLabIdentityAdapter(app, forge_hosts_raw=hosts)
        if isinstance(app, GiteaOAuthApp):
            return GiteaIdentityAdapter(app, forge_hosts_raw=hosts)
        return GitHubIdentityAdapter(app, forge_hosts_raw=hosts)

    def _encode_state(self, state_id: str, connector_id: str, user_id: str) -> str:
        payload = {
            "sid": state_id,
            "cid": connector_id,
            "uid": user_id,
            "exp": int(time.time()) + STATE_TTL_SECONDS,
            "jti": secrets.token_urlsafe(8),
        }
        return _encode_payload(payload, self.settings)

    def _decode_state(self, token: str) -> tuple[str, str, str]:
        payload = _decode_payload(token, self.settings)
        return str(payload["sid"]), str(payload["cid"]), str(payload["uid"])

    def _audit(self, conn: Any, *, action: str, actor_user_id: str, connector_id: str, detail: Mapping[str, Any]) -> None:
        conn.execute(
            """
            INSERT INTO tracker_audit (actor_user_id, action, connector_id, detail)
            VALUES (%s, %s, %s, %s::jsonb)
            """,
            (actor_user_id, action, connector_id, json.dumps(dict(detail))),
        )

    def configure_oauth_client(self, connector_id: str, *, client_id: str, client_secret: str) -> None:
        """Test helper: persist per-connector OAuth app credentials."""

        with self.connection() as conn:
            store_oauth_client(
                conn,
                connector_id,
                client_id=client_id,
                client_secret=client_secret,
                settings=self.settings,
            )
            conn.commit()


def _token_context(identity_id: str) -> dict[str, str]:
    return {"record": identity_id, "field": TOKEN_FIELD}


def _b64_encode(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64_decode(value: str) -> bytes:
    import base64

    pad = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + pad).encode("ascii"))


def _sign(encoded: str, settings: Settings) -> str:
    secret = (settings.SESSION_SECRET or "").encode("utf-8")
    if not secret:
        raise OAuthStateError("session_secret_missing")
    digest = hmac.new(secret, encoded.encode("utf-8"), hashlib.sha256).digest()
    return _b64_encode(digest)


def _encode_payload(payload: Mapping[str, Any], settings: Settings) -> str:
    raw = json.dumps(dict(payload), separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = _b64_encode(raw)
    return f"v1.{encoded}.{_sign(encoded, settings)}"


def _decode_payload(token: str, settings: Settings) -> dict[str, Any]:
    parts = (token or "").split(".")
    if len(parts) != 3 or parts[0] != "v1":
        raise OAuthStateError("invalid_state")
    encoded, signature = parts[1], parts[2]
    if not hmac.compare_digest(signature, _sign(encoded, settings)):
        raise OAuthStateError("invalid_state_signature")
    try:
        payload = json.loads(_b64_decode(encoded).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise OAuthStateError("invalid_state_payload") from exc
    if int(payload.get("exp", 0)) <= int(time.time()):
        raise OAuthStateError("state_expired")
    return payload


def initialize_tracker_identity_service() -> None:
    from app.services.postgres_database import database
    from app.services.workspace_schema_migrations import apply_workspace_migrations

    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        apply_workspace_migrations(conn)
        conn.commit()


__all__ = [
    "IdentityNotFound",
    "IdentityService",
    "OAuthStateError",
    "build_oauth_return_url",
    "bump_user_cache",
    "initialize_tracker_identity_service",
    "user_cache_version",
    "validate_relative_return_to",
]
