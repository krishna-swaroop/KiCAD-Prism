"""A person's sign-in at DigiKey, for the calls that need one (change notices).

DigiKey's change notice API accepts only the authorization-code flow ("3-legged" OAuth). An administrator starts
a sign-in from the DigiKey connector; DigiKey sends the browser back to ``CALLBACK_PATH`` with a code and the state
Prism issued; Prism trades the code for an access token (about 30 minutes) and a refresh token (about 90 days) and
keeps both sealed with the connector's keyring, apart from its client credentials.

Each refresh returns a new refresh token and voids the old one, so a refresh runs under a row lock and stores the
new pair before it is used. A refused refresh marks the grant as needing a new sign-in; nothing else about the
connector changes (stock and prices keep their own client-credentials token).

The DigiKey app must list ``redirect_uri()`` as its callback address, which must be HTTPS. It is built from
``SUPPLY_OAUTH_BASE_URL`` when set (an address registered with DigiKey, such as https://localhost), else ``PUBLIC_BASE_URL``.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from app.services.supply import clock
from app.core.config import settings
from app.services.supply import credentials as sealed
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.http_client import SafeHttpClient
from app.services.supply.providers import digikey
from app.services.supply.providers.base import EgressBlocked, ProviderError, RateLimited, ResponseTooLarge, Unavailable

CALLBACK_PATH = "/api/supply/oauth/digikey/callback"
STATE_TTL = timedelta(minutes=10)
EARLY = timedelta(seconds=60)
SUPPORTED = ("digikey",)


class SignInError(ValueError):
    """The sign-in cannot go on. The message is safe to show; ``reason`` is the short code the callback hands the browser."""

    def __init__(self, message: str, reason: str = "failed") -> None:
        super().__init__(message)
        self.reason = reason


class NotSignedIn(Exception):
    """No usable grant: nobody signed in, or the sign-in ran out or was refused."""


def base_url() -> str:
    """Where the browser comes back to: ``SUPPLY_OAUTH_BASE_URL`` when set, else ``PUBLIC_BASE_URL``."""

    return (settings.SUPPLY_OAUTH_BASE_URL.strip() or settings.PUBLIC_BASE_URL.strip()).rstrip("/")


def redirect_uri() -> str:
    return base_url() + CALLBACK_PATH


def _client() -> SafeHttpClient:
    return SafeHttpClient(digikey.ALLOWED_HOSTS)


def start(service, connector_id: str, actor: str, now: datetime | None = None) -> str:
    """The DigiKey address to send the browser to. Records a one-time state bound to the connector and the person."""

    actor = actor_text(actor)
    now = now or clock.now()
    connector = service.get(connector_id)
    if connector["provider"] not in SUPPORTED:
        raise SignInError("Only DigiKey connectors take a sign-in.")
    if not base_url().lower().startswith("https://"):
        raise SignInError("A sign-in needs an HTTPS address DigiKey can send the browser back to (PUBLIC_BASE_URL or SUPPLY_OAUTH_BASE_URL).")
    client_id = service.unsealed_credentials(connector_id).get("client_id", "")
    if not client_id:
        raise SignInError("Set the connector's client ID and secret first.")
    state = secrets.token_urlsafe(32)
    with service.store.connection() as conn:
        conn.execute("DELETE FROM supply_oauth_states WHERE created_at < %s", (now - STATE_TTL,))
        conn.execute("INSERT INTO supply_oauth_states (state, connector_id, actor, created_at) VALUES (%s, %s, %s, %s)",
                     (state, connector_id, actor, now))
    query = urlencode({"response_type": "code", "client_id": client_id, "redirect_uri": redirect_uri(), "state": state})
    return f"{digikey.AUTHORIZE_URL}?{query}"


def _keep(conn, service, connector_id: str, answer: Any, now: datetime, granted_by: str | None) -> None:
    if not isinstance(answer, dict) or not answer.get("access_token") or not answer.get("refresh_token"):
        raise SignInError("DigiKey did not issue the tokens.", "no_tokens")
    access_for = timedelta(seconds=max(int(answer.get("expires_in") or 1800), 60))
    refresh_for = timedelta(seconds=max(int(answer.get("refresh_token_expires_in") or 90 * 86400), 60))
    envelope = sealed.seal(
        service.keyring(), connector_id,
        {"access_token": str(answer["access_token"]), "refresh_token": str(answer["refresh_token"])},
        field=sealed.GRANT_FIELD,
    )
    if granted_by is None:
        conn.execute(
            "UPDATE supply_connector_grants SET envelope = %s, access_expires_at = %s, refresh_expires_at = %s, last_error = '' "
            "WHERE connector_id = %s",
            (envelope, now + access_for, now + refresh_for, connector_id),
        )
        return
    conn.execute(
        """
        INSERT INTO supply_connector_grants (connector_id, envelope, access_expires_at, refresh_expires_at, granted_by, granted_at, last_error)
        VALUES (%s, %s, %s, %s, %s, %s, '')
        ON CONFLICT (connector_id) DO UPDATE SET envelope = EXCLUDED.envelope, access_expires_at = EXCLUDED.access_expires_at,
            refresh_expires_at = EXCLUDED.refresh_expires_at, granted_by = EXCLUDED.granted_by,
            granted_at = EXCLUDED.granted_at, last_error = ''
        """,
        (connector_id, envelope, now + access_for, now + refresh_for, granted_by, now),
    )


def finish(
    service, state: str, code: str, actor: str, now: datetime | None = None, client: Any | None = None,
) -> str:
    """Trade the code DigiKey sent back for tokens and keep them. Returns the connector id."""

    actor = actor_text(actor)
    now = now or clock.now()
    if not state or not code:
        raise SignInError("DigiKey did not send a code back.", "no_code")
    with service.store.connection() as conn:
        row = conn.execute(
            "DELETE FROM supply_oauth_states WHERE state = %s RETURNING connector_id, actor, created_at", (state,)
        ).fetchone()
    if row is None or now - row["created_at"] > STATE_TTL:
        raise SignInError("This sign-in expired or was already used. Start it again from the connector.", "expired")
    if row["actor"] != actor:
        raise SignInError("Finish the sign-in as the person who started it.", "wrong_person")
    connector_id = row["connector_id"]
    creds = service.unsealed_credentials(connector_id)
    try:
        answer = (client or _client()).request_json("POST", digikey.TOKEN_URL, form={
            "code": code, "client_id": creds.get("client_id", ""), "client_secret": creds.get("client_secret", ""),
            "redirect_uri": redirect_uri(), "grant_type": "authorization_code",
        })
    except ProviderError as exc:
        raise SignInError(f"DigiKey refused the sign-in ({exc.code}).", "refused") from None
    with service.store.connection() as conn:
        _keep(conn, service, connector_id, answer, now, granted_by=actor)
        write_audit(conn, actor, "connector.signin", connector_id, {"provider": "digikey"})
    return connector_id


def access_token(service, connector_id: str, now: datetime | None = None, client: Any | None = None) -> str:
    """A current access token for the connector's grant, refreshed when it is about to run out."""

    now = now or clock.now()
    # The mark is written after the locked transaction ends: raising inside it would roll the mark back.
    failure = ""
    with service.store.connection() as conn:
        row = conn.execute("SELECT * FROM supply_connector_grants WHERE connector_id = %s FOR UPDATE", (connector_id,)).fetchone()
        if row is None:
            raise NotSignedIn("nobody signed in")
        if row["last_error"]:
            raise NotSignedIn(row["last_error"])
        grant = sealed.unseal(service.keyring(), connector_id, row["envelope"], field=sealed.GRANT_FIELD)
        if row["access_expires_at"] and row["access_expires_at"] - EARLY > now:
            return grant["access_token"]
        if row["refresh_expires_at"] and row["refresh_expires_at"] <= now:
            failure = "expired"
        else:
            creds = service.unsealed_credentials(connector_id)
            try:
                answer = (client or _client()).request_json("POST", digikey.TOKEN_URL, form={
                    "refresh_token": grant["refresh_token"], "client_id": creds.get("client_id", ""),
                    "client_secret": creds.get("client_secret", ""), "grant_type": "refresh_token",
                })
            except (Unavailable, RateLimited, EgressBlocked, ResponseTooLarge):
                raise  # DigiKey did not answer: the grant may be fine, so keep it
            except ProviderError:
                failure = "refused"  # 401 and 403, and the 400 ``invalid_grant`` of OAuth
            else:
                try:
                    _keep(conn, service, connector_id, answer, now, granted_by=None)
                except SignInError:
                    failure = "refused"  # an answer without tokens is no renewal
                else:
                    return str(answer["access_token"])
    _mark(service.store, connector_id, failure)
    raise NotSignedIn(failure)


def _mark(store, connector_id: str, failure: str) -> None:
    with store.connection() as conn:
        conn.execute("UPDATE supply_connector_grants SET last_error = %s WHERE connector_id = %s", (failure, connector_id))


def mark_refused(store, connector_id: str) -> None:
    """DigiKey refused a call made with the grant: a new sign-in is needed."""

    _mark(store, connector_id, "refused")


def status(conn, connector_id: str, now: datetime | None = None) -> dict[str, Any]:
    """Whether someone is signed in for the connector, who, and until when. Never the tokens."""

    now = now or clock.now()
    row = conn.execute(
        "SELECT granted_by, granted_at, refresh_expires_at, last_error FROM supply_connector_grants WHERE connector_id = %s",
        (connector_id,),
    ).fetchone()
    if row is None:
        return {"signed_in": False, "state": "none", "granted_by": "", "granted_at": None, "expires_at": None}
    expired = bool(row["refresh_expires_at"] and row["refresh_expires_at"] <= now)
    state = row["last_error"] or ("expired" if expired else "ok")
    return {
        "signed_in": state == "ok",
        "state": state,
        "granted_by": row["granted_by"],
        "granted_at": row["granted_at"].isoformat(),
        "expires_at": row["refresh_expires_at"].isoformat() if row["refresh_expires_at"] else None,
    }


def forget(service, connector_id: str, actor: str) -> None:
    actor = actor_text(actor)
    with service.store.connection() as conn:
        conn.execute("DELETE FROM supply_connector_grants WHERE connector_id = %s", (connector_id,))
        write_audit(conn, actor, "connector.signout", connector_id, {})

