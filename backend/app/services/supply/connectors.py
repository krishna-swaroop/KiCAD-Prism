"""Distributor connectors: setup, credentials, pause and state.

One connector per provider and storefront, owned by the workspace. Credentials
are sealed with the credential keyring and never leave the backend: every read
returns which credentials are set, not their values. Audit identity is the
``actor`` the caller passes from the session.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Sequence
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from psycopg.errors import UniqueViolation

from app.services.supply import clock as supply_clock
from app.services.supply import accounts, admission, freshness, limits, pacing, quota
from app.services.supply import credentials as sealed
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.csv_offers import CsvImportInfo, CsvOfferStore
from app.services.supply.providers import registry
from app.services.supply.providers.base import ProviderConfig, ProviderSpec, SupplyProvider
from app.services.supply.store import SupplyStore, supply_store
from app.services.supply.errors import Missing
from app.services.supply.errors import Refused

_UPDATABLE = frozenset({
    "display_name", "currency", "enabled", "daily_budget", "interactive_reserve_pct", "retention_days", "keep_days", "keep_unused", "catalogue",
    "storefront", "reset_time", "reset_tz", "reset_from_provider",
})
_MAX_REASON = 200


#: Statuses other than 400, by code.
_CONNECTOR_STATUS = {"duplicate": 409, "provider_disabled": 403}


class ConnectorError(Refused):
    """A request the connector rules reject. ``code`` is stable; the message is safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message, code=code, status_code=_CONNECTOR_STATUS.get(code, 400))


class ConnectorNotFound(Missing):
    """No connector with this id."""

    default_detail = "Connector not found"


def _settings_allow_dev() -> bool:
    from app.core.config import settings

    return bool(settings.SUPPLY_ENABLE_SIMULATED_PROVIDER)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _clean_currency(value: Any) -> str:
    text = str(value or "").strip().upper()
    if text and (len(text) != 3 or not text.isalpha()):
        raise ConnectorError("invalid_currency", "Currency must be a three letter code.")
    return text


def _clean_budget(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ConnectorError("invalid_budget", "Daily budget must be a whole number, 0 or more.")
    return value


def _clean_reserve(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 50:
        raise ConnectorError("invalid_reserve", "Interactive reserve must be between 0 and 50 percent.")
    return value


def _clean_reset_time(value: Any) -> str:
    text = str(value or "").strip()
    try:
        hours, minutes = (int(part) for part in text.split(":"))
    except ValueError:
        hours = minutes = -1
    if not (0 <= hours <= 23 and 0 <= minutes <= 59) or len(text) != 5:
        raise ConnectorError("invalid_reset_time", "The reset time is hours and minutes, such as 00:00.")
    return text


def _clean_reset_tz(value: Any) -> str:
    text = str(value or "").strip()
    try:
        ZoneInfo(text)
    except (ZoneInfoNotFoundError, ValueError):
        raise ConnectorError("invalid_reset_tz", "The time zone is a name such as UTC or Europe/Rome.") from None
    return text


def _clean_retention(value: Any) -> int | None:
    """Days raw samples stay before they are rolled into daily rows; None means the default."""

    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 365:
        raise ConnectorError("invalid_retention", "Keep raw samples for 1 to 365 days, or leave it empty for the default.")
    return value


def _clean_keep(value: Any) -> int | None:
    """Days any history is kept, daily rows included; None means for good."""

    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 3650:
        raise ConnectorError("invalid_keep", "Keep history for 1 to 3650 days, or leave it empty to keep it.")
    return value


def _clean_credentials(spec: ProviderSpec, given: Mapping[str, Any] | None) -> dict[str, str]:
    cleaned = {str(name): str(value or "").strip() for name, value in (given or {}).items()}
    required = spec.required_credentials
    unknown = sorted(set(cleaned) - set(required))
    missing = [name for name in required if not cleaned.get(name)]
    if unknown or missing:
        parts = []
        if missing:
            parts.append("missing: " + ", ".join(missing))
        if unknown:
            parts.append("not used by this provider: " + ", ".join(unknown))
        raise ConnectorError("invalid_credentials", "Credentials " + "; ".join(parts) + ".")
    return {name: cleaned[name] for name in required}


def _fetch(conn, connector_id: str):
    row = conn.execute(accounts.CONNECTOR_SQL + " WHERE c.id = %s", (connector_id,)).fetchone()
    if row is None:
        raise ConnectorNotFound(connector_id)
    return row


class ConnectorService:
    def __init__(
        self,
        store: SupplyStore = supply_store,
        *,
        keyring_factory: sealed.KeyringFactory | None = None,
        allow_dev: Callable[[], bool] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._clock = clock or supply_clock.now
        self._offers = CsvOfferStore()
        self._store = store
        self._keyring = keyring_factory or sealed.default_keyring_factory
        self._allow_dev = allow_dev or _settings_allow_dev

    @property
    def store(self) -> SupplyStore:
        return self._store

    def list(self) -> list[dict[str, Any]]:
        with self._store.connection() as conn:
            rows = conn.execute(accounts.CONNECTOR_SQL + " ORDER BY c.created_at, c.id").fetchall()
            usage = self._usage_today(conn)
            imports = self._offers.import_infos(conn)
            guesses = limits.suggestions(conn, self._clock())
            rows = self._paced(conn, rows)
        return [self._dto(row, usage.get(row["id"]), imports.get(row["id"]), guesses.get(row["id"])) for row in rows]

    @staticmethod
    def _paced(conn, rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
        """The rows with ``slow_until``: when the pacing of the connector's account (or of its provider, with no credentials) goes
        back to normal, if it was slowed after a refusal."""

        slowed = {row["pace_key"]: row["slow_until"] for row in conn.execute("SELECT pace_key, slow_until FROM supply_pace_state WHERE slow_until IS NOT NULL").fetchall()}
        return [{**row, "slow_until": slowed.get(accounts.pace_key(row["account_key"], row["provider"]))} for row in rows]

    def get(self, connector_id: str) -> dict[str, Any]:
        with self._store.connection() as conn:
            return self._dto_from(conn, _fetch(conn, connector_id))

    def create(
        self,
        *,
        actor: str,
        provider: str,
        storefront: str = "",
        display_name: str = "",
        currency: str = "",
        credentials: Mapping[str, Any] | None = None,
        daily_budget: int | None = None,
        interactive_reserve_pct: int = 10,
    ) -> dict[str, Any]:
        actor = actor_text(actor)
        spec = self._spec(provider)
        if spec.dev_only and not self._allow_dev():
            raise ConnectorError("provider_disabled", f"{spec.label} is not enabled on this server.")
        storefront = (storefront or "").strip()
        if spec.storefronts and storefront not in spec.storefronts:
            raise ConnectorError("invalid_storefront", f"{spec.label} needs a storefront.")
        if not spec.storefronts and storefront:
            raise ConnectorError("invalid_storefront", f"{spec.label} has no storefronts.")
        cleaned = _clean_credentials(spec, credentials)
        budget = _clean_budget(spec.default_daily_budget if daily_budget is None else daily_budget)
        reserve = _clean_reserve(interactive_reserve_pct)
        currency = _clean_currency(currency)
        name = (display_name or "").strip() or (f"{spec.label} {storefront}".strip())

        connector_id = uuid.uuid4().hex
        envelope = sealed.seal(self._keyring(), connector_id, cleaned) if cleaned else None
        account_key = accounts.key_for(self._keyring(), spec.key, cleaned)
        try:
            with self._store.connection() as conn:
                # Credentials an account already holds join it, and its settings stand.
                account_id = accounts.create(
                    conn, spec.key, account_key, {"daily_budget": budget, "interactive_reserve_pct": reserve}, connector_id
                )
                conn.execute(
                    """
                    INSERT INTO supply_connectors (
                        id, provider, storefront, display_name, currency,
                        credential_envelope, credential_names, account_id, created_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                    """,
                    (
                        connector_id, spec.key, storefront, name, currency,
                        envelope, json.dumps(list(cleaned)), account_id, actor,
                    ),
                )
                write_audit(conn, actor, "connector.create", connector_id,
                       {"provider": spec.key, "storefront": storefront})
                admission.sync(conn)
                row = _fetch(conn, connector_id)
        except UniqueViolation:
            raise ConnectorError(
                "duplicate", "A connector for this provider and storefront already exists."
            ) from None
        return self._dto({**row, "slow_until": None})  # a new connector has spent nothing

    def update(self, connector_id: str, *, actor: str, **changes: Any) -> dict[str, Any]:
        actor = actor_text(actor)
        unknown = sorted(set(changes) - _UPDATABLE)
        if unknown:
            raise ConnectorError("invalid_field", "Cannot change: " + ", ".join(unknown) + ".")
        fields: dict[str, Any] = {}
        if "display_name" in changes:
            fields["display_name"] = str(changes["display_name"] or "").strip()
        if "currency" in changes:
            fields["currency"] = _clean_currency(changes["currency"])
        if "enabled" in changes:
            if not isinstance(changes["enabled"], bool):
                raise ConnectorError("invalid_field", "enabled must be true or false.")
            fields["enabled"] = changes["enabled"]
        if "daily_budget" in changes:
            fields["daily_budget"] = _clean_budget(changes["daily_budget"])
        if "interactive_reserve_pct" in changes:
            fields["interactive_reserve_pct"] = _clean_reserve(changes["interactive_reserve_pct"])
        if "reset_from_provider" in changes:
            if not isinstance(changes["reset_from_provider"], bool):
                raise ConnectorError("invalid_field", "reset_from_provider must be true or false.")
            fields["reset_from_provider"] = changes["reset_from_provider"]
        elif changes.keys() & {"reset_time", "reset_tz"}:
            # A reset typed by hand is not the provider's word.
            fields["reset_from_provider"] = False
        if "reset_time" in changes:
            fields["reset_time"] = _clean_reset_time(changes["reset_time"])
        if "reset_tz" in changes:
            fields["reset_tz"] = _clean_reset_tz(changes["reset_tz"])
        if "retention_days" in changes:
            fields["retention_days"] = _clean_retention(changes["retention_days"])
        if "keep_days" in changes:
            fields["keep_days"] = _clean_keep(changes["keep_days"])
        if "catalogue" in changes:
            if not isinstance(changes["catalogue"], bool):
                raise ConnectorError("invalid_field", "catalogue must be true or false.")
            with self._store.connection() as conn:
                if changes["catalogue"] and not self._spec(_fetch(conn, connector_id)["provider"]).catalogue_url:
                    raise ConnectorError("no_catalogue", "This provider has no catalogue to read.")
            fields["catalogue"] = changes["catalogue"]
        if "keep_unused" in changes:
            if not isinstance(changes["keep_unused"], bool):
                raise ConnectorError("invalid_field", "keep_unused must be true or false.")
            fields["keep_unused"] = changes["keep_unused"]
        if "storefront" in changes:
            with self._store.connection() as conn:
                spec = self._spec(_fetch(conn, connector_id)["provider"])
            storefront = str(changes["storefront"] or "").strip()
            if not spec.storefronts or storefront not in spec.storefronts:
                raise ConnectorError("invalid_storefront", f"{spec.label} needs one of its own storefronts.")
            fields["storefront"] = storefront
        if not fields:
            return self.get(connector_id)
        # Column names come from the whitelist above, never from the caller. The budget and the reset are the account's.
        shared = {name: value for name, value in fields.items() if name in accounts.SETTINGS}
        own = {name: value for name, value in fields.items() if name not in accounts.SETTINGS}
        try:
            with self._store.connection() as conn:
                result = conn.execute(
                    f"UPDATE supply_connectors SET {''.join(f'{column} = %s, ' for column in own)}updated_at = %s WHERE id = %s",
                    (*own.values(), self._clock(), connector_id),
                )
                if result.rowcount == 0:
                    raise ConnectorNotFound(connector_id)
                if shared:
                    conn.execute(
                        f"UPDATE supply_accounts SET {', '.join(f'{column} = %s' for column in shared)} "
                        "WHERE id = (SELECT account_id FROM supply_connectors WHERE id = %s)",
                        (*shared.values(), connector_id),
                    )
                write_audit(conn, actor, "connector.update", connector_id, {"fields": sorted(fields)})
                if fields.keys() & {"daily_budget", "interactive_reserve_pct", "enabled"}:
                    admission.sync(conn)
                if "enabled" in fields:
                    # A disabled connector's offers stop counting: the kept summaries of the parts it lists are stale.
                    freshness.mark_sql(conn, "summary", "SELECT part_id FROM supply_listings WHERE connector_id = %s", (connector_id,))
                return self._dto_from(conn, _fetch(conn, connector_id))
        except UniqueViolation:
            raise ConnectorError("duplicate", "A connector for this provider and storefront already exists.") from None

    def set_credentials(
        self, connector_id: str, *, actor: str, credentials: Mapping[str, Any]
    ) -> dict[str, Any]:
        """Replace the whole credential set."""

        actor = actor_text(actor)
        try:
            before = self.unsealed_credentials(connector_id).get("client_id", "")
        except Exception:  # noqa: BLE001 - unreadable or none: treat the app as changed
            before = None
        with self._store.connection() as conn:
            spec = self._spec(_fetch(conn, connector_id)["provider"])
            cleaned = _clean_credentials(spec, credentials)
            if not cleaned:
                raise ConnectorError("invalid_credentials", f"{spec.label} takes no credentials.")
            envelope = sealed.seal(self._keyring(), connector_id, cleaned)
            conn.execute(
                "UPDATE supply_connectors SET credential_envelope = %s, credential_names = %s::jsonb, updated_at = %s WHERE id = %s",
                (envelope, json.dumps(list(cleaned)), self._clock(), connector_id),
            )
            accounts.rekey(conn, connector_id, accounts.key_for(self._keyring(), spec.key, cleaned))
            detail: dict[str, Any] = {"names": list(cleaned)}
            if before != cleaned.get("client_id", ""):
                # A sign-in belongs to the app (client ID) it was made for.
                dropped = conn.execute("DELETE FROM supply_connector_grants WHERE connector_id = %s", (connector_id,)).rowcount
                if dropped:
                    detail["sign_in_dropped"] = True
            write_audit(conn, actor, "connector.credentials", connector_id, detail)
            admission.sync(conn)
            return self._dto_from(conn, _fetch(conn, connector_id))

    def pause(self, connector_id: str, *, actor: str, reason: str) -> dict[str, Any]:
        actor = actor_text(actor)
        reason = (reason or "").strip()
        if not reason or len(reason) > _MAX_REASON:
            raise ConnectorError("invalid_reason", f"Give a reason of up to {_MAX_REASON} characters.")
        return self._set_paused(connector_id, actor, reason, "connector.pause")

    def resume(self, connector_id: str, *, actor: str) -> dict[str, Any]:
        return self._set_paused(connector_id, actor_text(actor), "", "connector.resume")

    def delete(self, connector_id: str, *, actor: str) -> None:
        actor = actor_text(actor)
        with self._store.connection() as conn:
            row = _fetch(conn, connector_id)
            # The account stays while another connector is on it, with today's spending; the last one takes it along.
            conn.execute("DELETE FROM supply_push_tokens WHERE target_kind = 'connector' AND target_id = %s", (connector_id,))
            conn.execute("DELETE FROM supply_connectors WHERE id = %s", (connector_id,))
            write_audit(conn, actor, "connector.delete", connector_id,
                   {"provider": row["provider"], "storefront": row["storefront"]})
            admission.sync(conn)

    def record_result(self, connector_id: str, error_code: str | None = None) -> None:
        """Note the outcome of a call. Success clears the error; failure keeps its code."""

        with self._store.connection() as conn:
            if error_code is None:
                conn.execute(
                    "UPDATE supply_connectors SET last_ok_at = %s, last_error_code = '', error_streak = 0, block_streak = 0 WHERE id = %s",
                    (self._clock(), connector_id),
                )
                limits.note_ok(conn, connector_id, self._clock())
            else:
                conn.execute(
                    "UPDATE supply_connectors SET last_error_code = %s, last_error_at = %s, error_streak = error_streak + 1 "
                    "WHERE id = %s",
                    (error_code[:64], self._clock(), connector_id),
                )

    def keyring(self):
        """The credential keyring, for sealing what belongs to a connector (``oauth.py``)."""

        return self._keyring()

    def unsealed_credentials(self, connector_id: str) -> dict[str, str]:
        """A connector's credentials in the clear. Backend use only: never returned by an API."""

        with self._store.connection() as conn:
            row = _fetch(conn, connector_id)
        return sealed.unseal(self._keyring(), connector_id, row["credential_envelope"]) if row["credential_envelope"] else {}

    def refresh_account_keys(self) -> int:
        """Work every connector's account key out again. A key is a hash under the keyring's current key, so after the
        key rotates, connectors saved before and after would no longer look like one account. Returns how many changed."""

        changed = 0
        with self._store.connection() as conn:
            rows = conn.execute(accounts.CONNECTOR_SQL + " WHERE c.credential_envelope <> '' ORDER BY c.created_at, c.id").fetchall()
            for row in rows:
                try:
                    credentials = sealed.unseal(self._keyring(), row["id"], row["credential_envelope"])
                except Exception:  # noqa: BLE001 - one unreadable connector must not stop the rest
                    continue
                key = accounts.key_for(self._keyring(), row["provider"], credentials)
                if key != conn.execute("SELECT a.account_key FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id "
                                       "WHERE c.id = %s", (row["id"],)).fetchone()["account_key"]:
                    accounts.rekey(conn, row["id"], key)
                    changed += 1
            if changed:
                admission.sync(conn)
        return changed

    def load_provider(self, connector_id: str) -> SupplyProvider:
        """Build the adapter for an active connector, with its credentials."""

        with self._store.connection() as conn:
            row = _fetch(conn, connector_id)
        if not row["enabled"] or row["paused_reason"]:
            raise ConnectorError("connector_inactive", "The connector is disabled or paused.")
        spec = self._spec(row["provider"])
        creds: dict[str, str] = {}
        if row["credential_envelope"]:
            creds = sealed.unseal(self._keyring(), connector_id, row["credential_envelope"])
        pacing.use_store(self._store)
        provider = spec.factory(ProviderConfig(
            connector_id=connector_id,
            storefront=row["storefront"],
            currency=row["currency"],
            # Connectors on one account share their pacing; one with no credentials shares it with its provider's others.
            account=accounts.pace_key(row["account_key"], row["provider"]),
            credentials=creds,
            on_limits=lambda found, url: limits.note(self._store, connector_id, found, supply_clock.now(), url=url),
        ))
        return provider

    def _set_paused(self, connector_id: str, actor: str, reason: str, action: str) -> dict[str, Any]:
        with self._store.connection() as conn:
            result = conn.execute(
                "UPDATE supply_connectors SET paused_reason = %s, updated_at = %s WHERE id = %s",
                (reason, self._clock(), connector_id),
            )
            if result.rowcount == 0:
                raise ConnectorNotFound(connector_id)
            write_audit(conn, actor, action, connector_id, {"reason": reason} if reason else {})
            return self._dto_from(conn, _fetch(conn, connector_id))

    @staticmethod
    def _spec(provider: str) -> ProviderSpec:
        try:
            return registry.get_spec(provider)
        except registry.UnknownProvider:
            raise ConnectorError("unknown_provider", f"Unknown provider: {provider}.") from None

    def _dto_from(self, conn, row: Mapping[str, Any]) -> dict[str, Any]:
        guess = limits.suggestions(conn, self._clock()).get(row["id"])
        (row,) = self._paced(conn, [row])
        return self._dto(row, self._usage_today(conn).get(row["id"]), self._offers.import_info(conn, row["id"]), guess)

    def _usage_today(self, conn) -> dict[str, dict[str, Any]]:
        """Calls spent today per connector. A connector's figure is its account's, on the provider's day."""

        now = self._clock()
        ledger_rows = {
            (row["account_id"], row["day"]): row
            for row in conn.execute(
                "SELECT account_id, day, spent, interactive_spent FROM supply_quota_ledger WHERE day >= %s",
                (now.astimezone(timezone.utc).date() - timedelta(days=2),),
            ).fetchall()
        }
        usage: dict[str, dict[str, Any]] = {}
        for row in conn.execute(
            "SELECT c.id, c.account_id, a.reset_time, a.reset_tz FROM supply_connectors c JOIN supply_accounts a ON a.id = c.account_id"
        ).fetchall():
            found = ledger_rows.get((row["account_id"], quota.provider_day(now, row["reset_time"], row["reset_tz"])))
            if found:
                usage[row["id"]] = {"spent": int(found["spent"]), "interactive_spent": int(found["interactive_spent"])}
        return usage

    def _dto(
        self,
        row: Mapping[str, Any],
        usage: Mapping[str, Any] | None = None,
        csv_import: CsvImportInfo | None = None,
        reset_guess: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            spec: ProviderSpec | None = registry.get_spec(row["provider"])
        except registry.UnknownProvider:
            spec = None  # a plugin was removed; the row stays visible
        names = set(row["credential_names"] or [])
        return {
            "id": row["id"],
            "provider": row["provider"],
            "provider_label": spec.label if spec else row["provider"],
            "provider_available": spec is not None,
            "storefront": row["storefront"],
            "display_name": row["display_name"],
            "currency": row["currency"],
            "enabled": bool(row["enabled"]),
            "paused_reason": row["paused_reason"],
            "daily_budget": row["daily_budget"],
            "interactive_reserve_pct": row["interactive_reserve_pct"],
            "retention_days": row["retention_days"],
            "keep_days": row["keep_days"],
            "keep_unused": bool(row["keep_unused"]),
            "limits_storage": bool(spec and spec.limits_storage),
            "catalogue": bool(row["catalogue"]),
            "catalogue_available": bool(spec and spec.catalogue_url),
            "reset_time": row["reset_time"],
            "reset_tz": row["reset_tz"],
            "metered": spec.metered if spec else True,
            "csv_fed": bool(spec and spec.csv_fed),
            "assembly_only": bool(spec and spec.assembly_only),
            "usage_today": {"spent": 0, "interactive_spent": 0, **(usage or {})},
            "csv_import": csv_import.to_dto() if csv_import else None,
            "credentials": {name: name in names for name in (spec.required_credentials if spec else ())},
            "credentials_status": sealed.status(self._keyring, row["credential_envelope"]),
            "rate_limits": dict(row["rate_limits"] or {}),
            "reset_from_provider": bool(row["reset_from_provider"]),
            "reset_suggestion": dict(reset_guess) if reset_guess else None,
            "rate_limits_at": _iso(row["rate_limits_at"]),
            "last_ok_at": _iso(row["last_ok_at"]),
            "last_error_code": row["last_error_code"],
            "last_error_at": _iso(row["last_error_at"]),
            # Resting until this time after a refusal or a run of errors, and slowed until this time after a refusal.
            "cooldown_until": _iso(row["cooldown_until"]),
            "block_streak": int(row["block_streak"]),
            "slow_until": _iso(row.get("slow_until")),
            "created_by": row["created_by"],
            "created_at": _iso(row["created_at"]),
            "updated_at": _iso(row["updated_at"]),
        }
