"""Encrypted webhook and OAuth-app credentials stored per connector (R2-H3).

GitHub App installation material lives in ``tracker_connectors.credential_envelope``.
Webhook signing secrets and user-OAuth app credentials live in dedicated tables
and are written through the admin connector API as well as test helpers.
"""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.services.trackers.errors import ProviderError
from app.services.trackers.secrets import decrypt_secret, encrypt_secret

WEBHOOK_SECRET_FIELD = "webhook_secret"
OAUTH_CLIENT_FIELD = "oauth_client"


def webhook_context(connector_id: str) -> dict[str, str]:
    return {"record": connector_id, "field": WEBHOOK_SECRET_FIELD}


def oauth_client_context(connector_id: str) -> dict[str, str]:
    return {"record": connector_id, "field": OAUTH_CLIENT_FIELD}


def webhook_configured(conn: Any, connector_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM tracker_webhook_secrets WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    return row is not None


def oauth_client_configured(conn: Any, connector_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM tracker_oauth_clients WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    return row is not None


def store_webhook_secret(
    conn: Any,
    connector_id: str,
    secret: str,
    *,
    settings: Settings,
) -> None:
    value = (secret or "").strip()
    if not value:
        raise ProviderError("invalid_request", "Webhook secret cannot be empty.")
    envelope = encrypt_secret(value, webhook_context(connector_id), settings=settings)
    conn.execute(
        """
        INSERT INTO tracker_webhook_secrets (connector_id, secret_envelope)
        VALUES (%s, %s)
        ON CONFLICT (connector_id) DO UPDATE SET secret_envelope = EXCLUDED.secret_envelope
        """,
        (connector_id, envelope),
    )


def load_webhook_secret(conn: Any, connector_id: str, *, settings: Settings) -> str:
    row = conn.execute(
        "SELECT secret_envelope FROM tracker_webhook_secrets WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    if not row:
        raise KeyError(connector_id)
    return decrypt_secret(row["secret_envelope"], webhook_context(connector_id), settings=settings).decode()


def store_oauth_client(
    conn: Any,
    connector_id: str,
    *,
    client_id: str = "",
    client_secret: str = "",
    settings: Settings,
) -> None:
    cid = (client_id or "").strip()
    secret = (client_secret or "").strip()
    existing = conn.execute(
        "SELECT client_id, client_secret_envelope FROM tracker_oauth_clients WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    resolved_id = cid or (str(existing["client_id"]) if existing else "")
    if not resolved_id:
        raise ProviderError("invalid_request", "OAuth client id is required.")
    if not secret:
        if existing:
            if cid and cid != str(existing["client_id"]):
                conn.execute(
                    "UPDATE tracker_oauth_clients SET client_id = %s WHERE connector_id = %s",
                    (resolved_id, connector_id),
                )
            return
        raise ProviderError("invalid_request", "OAuth client secret is required.")
    envelope = encrypt_secret(secret, oauth_client_context(connector_id), settings=settings)
    conn.execute(
        """
        INSERT INTO tracker_oauth_clients (connector_id, client_id, client_secret_envelope)
        VALUES (%s, %s, %s)
        ON CONFLICT (connector_id) DO UPDATE SET
            client_id = EXCLUDED.client_id,
            client_secret_envelope = EXCLUDED.client_secret_envelope
        """,
        (connector_id, resolved_id, envelope),
    )


def load_oauth_client(conn: Any, connector_id: str, *, settings: Settings) -> tuple[str, str]:
    row = conn.execute(
        "SELECT client_id, client_secret_envelope FROM tracker_oauth_clients WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    if not row:
        raise KeyError(connector_id)
    secret = decrypt_secret(
        row["client_secret_envelope"],
        oauth_client_context(connector_id),
        settings=settings,
    ).decode()
    return str(row["client_id"]), secret


def clear_sidecars(conn: Any, connector_id: str) -> None:
    conn.execute("DELETE FROM tracker_webhook_secrets WHERE connector_id = %s", (connector_id,))
    conn.execute("DELETE FROM tracker_oauth_clients WHERE connector_id = %s", (connector_id,))
