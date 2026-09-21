"""Admin-managed tracker connector lifecycle (TR-19, C3/C7).

Create/update/pause/resume/revoke/test use encrypted envelopes. Responses never
include credential material. Bot writes use installation credentials from the
admin-managed record, never ``GITHUB_TOKEN`` from the process environment.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional
from uuid import uuid4

from app.core.config import settings as default_settings
from app.services.trackers.credential_sidecars import (
    clear_sidecars,
    oauth_client_configured,
    store_oauth_client,
    store_webhook_secret,
    webhook_configured,
)
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


def _qual(schema: str, table: str) -> str:
    if not schema.replace("_", "").isalnum():
        raise ValueError("invalid schema name")
    return f'"{schema}".{table}'


def _iso8601_duration(delta: timedelta) -> str:
    total = max(0, int(delta.total_seconds()))
    if total < 60:
        return f"PT{total}S"
    minutes, seconds = divmod(total, 60)
    if minutes < 60:
        return f"PT{minutes}M" if seconds == 0 else f"PT{minutes}M{seconds}S"
    hours, minutes = divmod(minutes, 60)
    if seconds == 0 and minutes == 0:
        return f"PT{hours}H"
    parts = f"{hours}H"
    if minutes:
        parts += f"{minutes}M"
    if seconds:
        parts += f"{seconds}S"
    return f"PT{parts}"


class ConnectorService:
    def __init__(
        self,
        *,
        connect: Callable[[], Any] | None = None,
        settings: Any | None = None,
        tester: Callable[..., dict] | None = None,
        container_observer: Callable[..., dict[str, Any]] | None = None,
        repository_lister: Callable[..., list[dict[str, Any]]] | None = None,
        comments_schema: str = "comments",
        workspace_schema: str = "workspace",
    ) -> None:
        self._connect = connect
        self.settings = settings or default_settings
        self._tester = tester
        self._container_observer = container_observer
        self._repository_lister = repository_lister
        self.comments_schema = comments_schema
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
        """Secret-free ConnectorHealth: op counts plus worker checkpoints (TR-34).

        The admin route used to answer from op counts alone, so the settings
        card showed "Never" for polls that had been running for hours (TR-46).
        """

        from app.services.trackers.health import aggregate_connector_health

        with self.connection() as conn:
            self._require(conn, connector_id)
            return aggregate_connector_health(
                conn,
                connector_id,
                comments_schema=self.comments_schema,
                workspace_schema=self.workspace_schema,
            )

    def _sync_op_metrics(self, conn: Any, connector_id: str) -> dict[str, Any]:
        ops = _qual(self.comments_schema, "sync_ops")
        threads = _qual(self.comments_schema, "tracked_threads")
        row = conn.execute(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE o.state = 'pending')::int AS pending_ops,
                COUNT(*) FILTER (WHERE o.state IN ('sent', 'recovering'))::int AS sent_ops,
                COUNT(*) FILTER (WHERE o.state = 'quarantine')::int AS quarantined_ops,
                COUNT(*) FILTER (WHERE o.state = 'failed')::int AS failed_ops,
                MIN(o.created_at) FILTER (WHERE o.state = 'pending') AS oldest_pending
            FROM {ops} o
            JOIN {threads} t ON t.id = o.tracked_thread_id
            WHERE t.connector_id = %s
            """,
            (connector_id,),
        ).fetchone()
        oldest_pending = (row or {}).get("oldest_pending")
        oldest_age = None
        if isinstance(oldest_pending, datetime):
            oldest_age = _iso8601_duration(datetime.now(timezone.utc) - oldest_pending.astimezone(timezone.utc))
        return {
            "pendingOps": int((row or {}).get("pending_ops") or 0),
            "sentOps": int((row or {}).get("sent_ops") or 0),
            "quarantinedOps": int((row or {}).get("quarantined_ops") or 0),
            "failedOps": int((row or {}).get("failed_ops") or 0),
            "oldestPendingOpAge": oldest_age,
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
        if credentials and self._has_app_fields(credentials):
            envelope = self._encrypt(cid, credentials)
        with self.connection() as conn:
            store = TrackerStore(conn)
            if connector_id:
                try:
                    store.get_connector(cid)
                except KeyError:
                    pass
                else:
                    raise ProviderError("invalid_request", "Connector id already exists.")
            store.upsert_connector(
                connector_id=cid,
                provider=provider,
                instance_kind=instance_kind,
                display_name=display_name,
                base_url=base_url,
                credential_envelope=envelope,
            )
            if credentials:
                self._apply_credential_sidecars(conn, cid, credentials)
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
                envelope = self._merge_app_envelope(connector_id, credentials, current)
            if credentials:
                self._apply_credential_sidecars(conn, connector_id, credentials)
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
            clear_sidecars(conn, connector_id)
            TrackerStore(conn).audit(
                action="connector.revoke",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"credentialErased": True},
            )
            conn.commit()
            return self._public(TrackerStore(conn).get_connector(connector_id), conn)

    def delete(self, connector_id: str, *, actor_user_id: str) -> dict[str, Any]:
        """Remove a connection outright.

        Refused while any project still targets it or any thread is still
        linked through it: those are the only durable references whose loss
        would be surprising. Credentials, webhook secret, OAuth client and
        member identities go with it; the audit trail keeps the connector id.
        """

        with self.connection() as conn:
            self._require(conn, connector_id)
            projects = conn.execute(
                "SELECT COUNT(*) AS n FROM project_trackers WHERE connector_id = %s",
                (connector_id,),
            ).fetchone()
            threads = _qual(self.comments_schema, "tracked_threads")
            linked = conn.execute(
                f"SELECT COUNT(*) AS n FROM {threads} WHERE connector_id = %s AND unlinked_at IS NULL",
                (connector_id,),
            ).fetchone()
            project_count = int((projects or {}).get("n") or 0)
            linked_count = int((linked or {}).get("n") or 0)
            if project_count or linked_count:
                raise ProviderError(
                    "invalid_request",
                    f"Connection is still in use by {project_count} project(s) and {linked_count} linked thread(s). "
                    "Point those projects elsewhere or unlink the threads first.",
                    retryable=False,
                )
            clear_sidecars(conn, connector_id)
            conn.execute("DELETE FROM user_identities WHERE connector_id = %s", (connector_id,))
            conn.execute("DELETE FROM destination_acks WHERE connector_id = %s", (connector_id,))
            # Inbound state keyed by the connector: without this the scheduler
            # keeps enqueuing dispatch for hints nothing can ever apply.
            for table in ("remote_hints", "remote_deliveries"):
                conn.execute(
                    f"DELETE FROM {_qual(self.comments_schema, table)} WHERE connector_id = %s",
                    (connector_id,),
                )
            conn.execute(
                f"DELETE FROM {_qual(self.comments_schema, 'sync_checkpoints')} WHERE scope_key LIKE %s",
                (f"{connector_id}:%",),
            )
            TrackerStore(conn).audit(
                action="connector.delete",
                actor_user_id=actor_user_id,
                connector_id=connector_id,
                detail={"deleted": True},
            )
            conn.execute("DELETE FROM tracker_connectors WHERE id = %s", (connector_id,))
            conn.commit()
            return {"deleted": connector_id}

    def observe_container(
        self,
        connector_id: str,
        *,
        container_kind: str,
        container_path: str,
        remote_container_id: str,
        generation: int = 1,
        visibility_hint: str | None = None,
    ) -> dict[str, Any]:
        """Resolve destination visibility via ``IssueTracker.get_container`` (D7)."""

        if self._container_observer is not None:
            return self._container_observer(
                connector_id,
                container_kind=container_kind,
                container_path=container_path,
                remote_container_id=remote_container_id,
                generation=generation,
                visibility_hint=visibility_hint,
            )
        with self.connection() as conn:
            row = self._require(conn, connector_id)
            envelope = conn.execute(
                "SELECT credential_envelope FROM tracker_connectors WHERE id = %s",
                (connector_id,),
            ).fetchone()
            blob = (envelope or {}).get("credential_envelope")
            if not blob:
                return {
                    "visibility": "unknown",
                    "containerPath": container_path,
                    "remoteContainerId": remote_container_id,
                }
            material = json.loads(
                decrypt_secret(blob, _context(connector_id), settings=self.settings).decode()
            )
        from app.services.trackers.contracts import Destination
        from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials
        from app.services.trackers.github_issues import GitHubIssueAdapter

        creds = GitHubAppCredentials(
            app_id=str(material.get("appId") or material.get("app_id") or ""),
            installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
            private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
            instance_kind=str(row.get("instance_kind") or "github.com"),
            base_url=str(row.get("base_url") or ""),
        )
        auth = GitHubAppAuth(creds)
        adapter = GitHubIssueAdapter(
            auth,
            http=auth.http,
            bot_user_id=str(row.get("bot_forge_user_id") or ""),
            bot_login=str(row.get("bot_login") or ""),
        )
        dest = Destination(
            connectorId=connector_id,
            containerKind=container_kind,  # type: ignore[arg-type]
            containerPath=container_path,
            remoteContainerId=remote_container_id,
            generation=max(1, int(generation)),
            visibility=visibility_hint if visibility_hint in {"public", "private", "unknown"} else None,
        )
        try:
            container = adapter.get_container(dest)
        except ProviderError:
            return {
                "visibility": "unknown",
                "containerPath": container_path,
                "remoteContainerId": remote_container_id,
            }
        return {
            "visibility": str(container.visibility),
            "containerPath": str(container.path),
            "remoteContainerId": str(container.remoteContainerId),
        }

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

    def list_repositories(self, connector_id: str) -> list[dict[str, Any]]:
        """Repositories the connector's installation can publish to (admin picker)."""

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
        if self._repository_lister is not None:
            return self._repository_lister(row, material)
        from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials

        creds = GitHubAppCredentials(
            app_id=str(material.get("appId") or material.get("app_id") or ""),
            installation_id=str(material.get("installationId") or material.get("installation_id") or ""),
            private_key_pem=str(material.get("privateKey") or material.get("private_key") or ""),
            instance_kind=str(row.get("instance_kind") or "github.com"),
            base_url=str(row.get("base_url") or ""),
        )
        return GitHubAppAuth(creds).list_repositories()

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

    def _app_payload(self, credentials: Mapping[str, str]) -> dict[str, str]:
        return {
            "appId": str(credentials.get("appId") or credentials.get("app_id") or ""),
            "installationId": str(credentials.get("installationId") or credentials.get("installation_id") or ""),
            "privateKey": str(credentials.get("privateKey") or credentials.get("private_key") or ""),
        }

    def _has_app_fields(self, credentials: Mapping[str, str]) -> bool:
        payload = self._app_payload(credentials)
        return any(payload.values())

    def _encrypt(self, connector_id: str, credentials: Mapping[str, str]) -> str:
        payload = self._app_payload(credentials)
        if not payload["appId"] or not payload["installationId"] or not payload["privateKey"]:
            raise ProviderError("invalid_request", "GitHub App id, installation id and private key are required.")
        if self._uses_env_bootstrap(payload):
            raise ProviderError("invalid_request", "Do not store process environment tokens as connector credentials.")
        try:
            return encrypt_secret(json.dumps(payload), _context(connector_id), settings=self.settings)
        except SecretStoreLocked:
            raise

    def _merge_app_envelope(
        self,
        connector_id: str,
        credentials: Mapping[str, str],
        current: Mapping[str, Any],
    ) -> str | None:
        if not self._has_app_fields(credentials):
            return None
        payload = self._app_payload(credentials)
        existing_blob = current.get("credential_envelope")
        if existing_blob:
            merged = json.loads(
                decrypt_secret(existing_blob, _context(connector_id), settings=self.settings).decode()
            )
            for key in ("appId", "installationId", "privateKey"):
                if payload[key]:
                    merged[key] = payload[key]
            payload = merged
        if not payload["appId"] or not payload["installationId"] or not payload["privateKey"]:
            raise ProviderError("invalid_request", "GitHub App id, installation id and private key are required.")
        return self._encrypt(connector_id, payload)

    def _apply_credential_sidecars(self, conn: Any, connector_id: str, credentials: Mapping[str, str]) -> None:
        webhook_secret = str(credentials.get("webhookSecret") or credentials.get("webhook_secret") or "").strip()
        if webhook_secret:
            store_webhook_secret(conn, connector_id, webhook_secret, settings=self.settings)
        oauth_client_id = str(credentials.get("oauthClientId") or credentials.get("oauth_client_id") or "").strip()
        oauth_client_secret = str(
            credentials.get("oauthClientSecret") or credentials.get("oauth_client_secret") or ""
        ).strip()
        if oauth_client_id or oauth_client_secret:
            store_oauth_client(
                conn,
                connector_id,
                client_id=oauth_client_id,
                client_secret=oauth_client_secret,
                settings=self.settings,
            )

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

    def webhook_url(self, connector_id: str, *, provider: str = "github") -> str | None:
        """Inbound webhook URL the forge must be given, derived from ``PUBLIC_BASE_URL``.

        ``None`` when no public origin is configured: the browser origin is not
        a substitute, because the forge — not the admin's browser — has to reach it.
        """

        base = str(getattr(self.settings, "PUBLIC_BASE_URL", "") or "").strip().rstrip("/")
        if not base:
            return None
        return f"{base}/api/trackers/webhooks/{provider}/{connector_id}"

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
            "webhookConfigured": webhook_configured(conn, str(row["id"])),
            "webhookUrl": self.webhook_url(str(row["id"]), provider=str(row["provider"])),
            "oauthClientConfigured": oauth_client_configured(conn, str(row["id"])),
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
