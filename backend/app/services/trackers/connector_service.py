"""Admin-managed tracker connector lifecycle (TR-19, C3/C7).

Create/update/pause/resume/revoke/test use encrypted envelopes. Responses never
include credential material. Bot writes use installation credentials from the
admin-managed record, never ``GITHUB_TOKEN`` from the process environment.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Callable, Mapping, Optional
from uuid import uuid4

from app.core.config import settings as default_settings
from app.services.trackers.errors import ProviderError
from app.services.trackers.secrets import (
    SecretStoreLocked,
    decrypt_secret,
    encrypt_secret,
)
from app.services.trackers.store import TrackerStore

CREDENTIAL_FIELD = "github_app"
BOOTSTRAP_ENV_FIELDS = ("GITHUB_TOKEN",)
ALLOWED_PROVIDERS = {"github"}
ALLOWED_INSTANCE_KINDS = {"github.com", "ghes"}


class ConnectorNotFound(KeyError):
    """No connector row for this id."""


class ConnectorService:
    def __init__(
        self,
        *,
        connect: Callable[[], Any] | None = None,
        settings: Any | None = None,
        tester: Callable[..., dict] | None = None,
    ) -> None:
        self._connect = connect
        self.settings = settings or default_settings
        self._tester = tester

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

    def list_connectors(self) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT id FROM tracker_connectors ORDER BY created_at ASC, id ASC"
            ).fetchall()
            store = TrackerStore(conn)
            return [self._public(store.get_connector(str(row["id"])), conn) for row in rows]

    def get(self, connector_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            try:
                row = TrackerStore(conn).get_connector(connector_id)
            except KeyError as exc:
                raise ConnectorNotFound(connector_id) from exc
            return self._public(row, conn)

    def health(self, connector_id: str) -> dict[str, Any]:
        """Secret-free ConnectorHealth. Metric fill is a later ticket; paused is live."""

        with self.connection() as conn:
            row = self._require(conn, connector_id)
            return {
                "connectorId": connector_id,
                "paused": bool(row.get("paused")),
                "lastWebhookAt": None,
                "lastPollAt": None,
                "lastSweepAt": None,
                "pendingOps": 0,
                "sentOps": 0,
                "quarantinedOps": 0,
                "failedOps": 0,
                "oldestPendingOpAge": None,
                "oldestUnappliedHintAge": None,
                "rateLimitResumeAt": None,
                "degraded": False,
                "lastError": None,
            }

    def create(
        self,
        *,
        actor_user_id: str,
        provider: str,
        instance_kind: str,
        display_name: str = "",
        base_url: str = "",
        credentials: Mapping[str, str] | None = None,
        connector_id: str | None = None,
    ) -> dict[str, Any]:
        self._validate_identity(provider, instance_kind, base_url)
        cid = (connector_id or f"cn_{uuid4().hex[:12]}").strip()
        envelope = None
        if credentials:
            envelope = self._encrypt(cid, credentials)
        with self.connection() as conn:
            store = TrackerStore(conn)
            store.upsert_connector(
                connector_id=cid,
                provider=provider,
                instance_kind=instance_kind,
                display_name=display_name,
                base_url=base_url,
                credential_envelope=envelope,
            )
            store.audit(
                action="connector.create",
                actor_user_id=actor_user_id,
                connector_id=cid,
                detail={"provider": provider, "instanceKind": instance_kind, "credentialConfigured": bool(envelope)},
            )
            conn.commit()
            return self._public(store.get_connector(cid), conn)

    def update(
        self,
        connector_id: str,
        *,
        actor_user_id: str,
        display_name: str | None = None,
        base_url: str | None = None,
        credentials: Mapping[str, str] | None = None,
        instance_kind: str | None = None,
    ) -> dict[str, Any]:
        with self.connection() as conn:
            store = TrackerStore(conn)
            try:
                current = store.get_connector(connector_id)
            except KeyError as exc:
                raise ConnectorNotFound(connector_id) from exc
            kind = instance_kind if instance_kind is not None else str(current["instance_kind"])
            url = base_url if base_url is not None else str(current.get("base_url") or "")
            self._validate_identity(str(current["provider"]), kind, url)
            envelope = None
            if credentials:
                envelope = self._encrypt(connector_id, credentials)
            store.upsert_connector(
                connector_id=connector_id,
                provider=str(current["provider"]),
                instance_kind=kind,
                display_name=display_name if display_name is not None else str(current.get("display_name") or ""),
                base_url=url,
                credential_envelope=envelope,
            )
            store.audit(
                action="connector.update",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"rotatedCredentials": bool(credentials)},
            )
            conn.commit()
            return self._public(store.get_connector(connector_id), conn)

    def pause(self, connector_id: str, *, actor_user_id: str, reason: str = "admin") -> dict[str, Any]:
        return self._set_paused(connector_id, actor_user_id, paused=True, reason=reason, action="connector.pause")

    def resume(self, connector_id: str, *, actor_user_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            row = self._require(conn, connector_id)
            reason = str(row.get("paused_reason") or "")
            if reason in {"revoked", "test_failed", "auth_lost", "permissions", "visibility_unknown"}:
                raise ProviderError(
                    "forbidden",
                    "Test connection must succeed before this connector can publish.",
                )
            conn.execute(
                """
                UPDATE tracker_connectors
                SET paused = FALSE, paused_reason = NULL, updated_at = NOW()
                WHERE id = %s
                """,
                (connector_id,),
            )
            TrackerStore(conn).audit(
                action="connector.resume",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={},
            )
            conn.commit()
            return self._public(TrackerStore(conn).get_connector(connector_id), conn)

    def revoke(self, connector_id: str, *, actor_user_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            self._require(conn, connector_id)
            conn.execute(
                """
                UPDATE tracker_connectors
                SET credential_envelope = NULL,
                    paused = TRUE,
                    paused_reason = 'revoked',
                    updated_at = NOW()
                WHERE id = %s
                """,
                (connector_id,),
            )
            TrackerStore(conn).audit(
                action="connector.revoke",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"credentialErased": True},
            )
            conn.commit()
            return self._public(TrackerStore(conn).get_connector(connector_id), conn)

    def test_connection(self, connector_id: str, *, actor_user_id: str) -> dict[str, Any]:
        with self.connection() as conn:
            row = self._require(conn, connector_id)
            envelope = conn.execute(
                "SELECT credential_envelope FROM tracker_connectors WHERE id = %s",
                (connector_id,),
            ).fetchone()
            blob = (envelope or {}).get("credential_envelope")
            if not blob:
                raise ProviderError("auth_lost", "Connector has no installation credentials.")
            material = json.loads(decrypt_secret(blob, _context(connector_id), settings=self.settings).decode())
            if self._uses_env_bootstrap(material):
                raise ProviderError("invalid_request", "Admin-managed connectors cannot use process environment tokens.")
            probe = self._run_test(row, material)
            writes = bool(probe.get("writesEnabled") or probe.get("ok"))
            bot = probe.get("bot") or {}
            paused_reason = probe.get("pausedReason")
            if not writes:
                conn.execute(
                    """
                    UPDATE tracker_connectors
                    SET paused = TRUE,
                        paused_reason = COALESCE(%s, paused_reason, 'test_failed'),
                        bot_forge_user_id = COALESCE(%s, bot_forge_user_id),
                        bot_login = COALESCE(%s, bot_login),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        paused_reason,
                        str(bot.get("id") or "") or None,
                        str(bot.get("login") or "") or None,
                        connector_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    UPDATE tracker_connectors
                    SET bot_forge_user_id = %s,
                        bot_login = %s,
                        paused_reason = CASE WHEN paused THEN paused_reason ELSE NULL END,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (str(bot.get("id") or "") or None, str(bot.get("login") or "") or None, connector_id),
                )
            TrackerStore(conn).audit(
                action="connector.test",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"ok": writes, "pausedReason": paused_reason, "writesEnabled": writes},
            )
            conn.commit()
            public = self._public(TrackerStore(conn).get_connector(connector_id), conn)
            public["writesEnabled"] = writes
            public["test"] = {
                "ok": writes,
                "writesEnabled": writes,
                "pausedReason": paused_reason,
                "visibility": probe.get("visibility"),
                "permissions": probe.get("permissions") or {},
            }
            return public

    def _run_test(self, row: Mapping[str, Any], material: Mapping[str, str]) -> dict[str, Any]:
        if self._tester is not None:
            return self._tester(row, material)
        from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials

        creds = GitHubAppCredentials(
            app_id=str(material.get("appId") or material.get("app_id") or ""),
            installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
            private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
            instance_kind=str(row.get("instance_kind") or "github.com"),
            base_url=str(row.get("base_url") or ""),
        )
        return GitHubAppAuth(creds).test_connection()

    def _encrypt(self, connector_id: str, credentials: Mapping[str, str]) -> str:
        payload = {
            "appId": str(credentials.get("appId") or credentials.get("app_id") or ""),
            "installationId": str(credentials.get("installationId") or credentials.get("installation_id") or ""),
            "privateKey": str(credentials.get("privateKey") or credentials.get("private_key") or ""),
        }
        if not payload["appId"] or not payload["installationId"] or not payload["privateKey"]:
            raise ProviderError("invalid_request", "GitHub App id, installation id and private key are required.")
        if self._uses_env_bootstrap(payload):
            raise ProviderError("invalid_request", "Do not store process environment tokens as connector credentials.")
        try:
            return encrypt_secret(json.dumps(payload), _context(connector_id), settings=self.settings)
        except SecretStoreLocked:
            raise

    def _uses_env_bootstrap(self, material: Mapping[str, str]) -> bool:
        token = str(getattr(self.settings, "GITHUB_TOKEN", "") or "")
        secret = material.get("privateKey") or material.get("private_key") or ""
        return bool(token) and secret == token

    def _validate_identity(self, provider: str, instance_kind: str, base_url: str) -> None:
        if provider not in ALLOWED_PROVIDERS:
            raise ProviderError("invalid_request", "Unsupported tracker provider.")
        if instance_kind not in ALLOWED_INSTANCE_KINDS:
            raise ProviderError("invalid_request", "Unsupported GitHub instance kind.")
        if instance_kind == "ghes" and not (base_url or "").strip():
            raise ProviderError("invalid_request", "GHES connectors require a base URL.")

    def _require(self, conn: Any, connector_id: str) -> dict[str, Any]:
        try:
            return TrackerStore(conn).get_connector(connector_id)
        except KeyError as exc:
            raise ConnectorNotFound(connector_id) from exc

    def _set_paused(
        self,
        connector_id: str,
        actor_user_id: str,
        *,
        paused: bool,
        reason: str,
        action: str,
    ) -> dict[str, Any]:
        with self.connection() as conn:
            self._require(conn, connector_id)
            conn.execute(
                """
                UPDATE tracker_connectors
                SET paused = %s, paused_reason = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (paused, reason if paused else None, connector_id),
            )
            TrackerStore(conn).audit(
                action=action,
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"reason": reason} if paused else {},
            )
            conn.commit()
            return self._public(TrackerStore(conn).get_connector(connector_id), conn)

    def _public(self, row: Mapping[str, Any], conn: Any) -> dict[str, Any]:
        dumped = json.dumps(dict(row), default=str)
        lowered = dumped.casefold()
        if "begin " in lowered or "privatekey" in lowered or "credential_envelope" in lowered:
            raise RuntimeError("connector public DTO leaked credential material")
        audit_count = conn.execute(
            "SELECT COUNT(*) AS n FROM tracker_audit WHERE connector_id = %s",
            (row["id"],),
        ).fetchone()
        writes_enabled = (
            not bool(row.get("paused"))
            and bool(row.get("credentialConfigured"))
            and bool(row.get("bot_forge_user_id"))
            and str(row.get("paused_reason") or "") not in {"revoked", "permissions", "test_failed", "auth_lost"}
        )
        return {
            "id": row["id"],
            "provider": row["provider"],
            "displayName": row.get("display_name") or "",
            "instanceKind": row["instance_kind"],
            "baseUrl": row.get("base_url") or "",
            "paused": bool(row.get("paused")),
            "pausedReason": row.get("paused_reason"),
            "bot": {
                "id": row.get("bot_forge_user_id"),
                "login": row.get("bot_login"),
            },
            "credentialConfigured": bool(row.get("credentialConfigured")),
            "writesEnabled": writes_enabled,
            "auditCount": int((audit_count or {}).get("n") or 0),
        }


def _context(connector_id: str) -> dict[str, str]:
    return {"record": connector_id, "field": CREDENTIAL_FIELD}


def initialize_tracker_connector_service() -> None:
    """Ensure workspace tracker tables exist. Credentials stay in admin records."""

    from app.services.postgres_database import database
    from app.services.trackers.migrations import migrate_workspace_tracker_tables

    with database.connection() as conn:
        conn.execute("SET search_path TO workspace, public")
        migrate_workspace_tracker_tables(conn)
        conn.commit()
