"""Local inventory sources: the servers whose stock Prism reads (decision D15), of a kind in ``registry``.

Administrators add, change and remove them. The token is sealed with the connector keyring under its own field, so an
envelope copied onto a distributor connector will not decrypt. Functions on a connection; none commit.
"""

from __future__ import annotations

import uuid
from typing import Any, Mapping

from app.services.supply import credentials as sealed
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.inventory import registry
from app.services.supply.inventory.inventree import InvenTreeError, base_url
from app.services.supply.errors import Missing, Refused

KIND_INVENTREE = "inventree"
TOKEN_FIELD = "inventory_token"
MAX_NAME = 120


class SourceError(Refused):
    """The change is not valid. The message is safe to show."""

    code = "invalid_source"


class SourceNotFound(Missing):
    """No inventory source with this id."""


def _name(value: Any) -> str:
    text = str(value or "").strip()
    if not text or len(text) > MAX_NAME:
        raise SourceError(f"A name is 1 to {MAX_NAME} characters.")
    return text


def _url(value: Any) -> str:
    try:
        return base_url(str(value or ""))
    except InvenTreeError as exc:
        raise SourceError(str(exc)) from exc


def _interval(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 168:
        raise SourceError("Read every 1 to 168 hours.")
    return value


def _kind(value: Any) -> str:
    try:
        spec = registry.get_spec(str(value or ""))
    except registry.UnknownKind:
        raise SourceError("Prism does not know that kind of inventory source.") from None
    if not (spec.pulled or spec.pushed):
        raise SourceError(f"{spec.label} is not a source Prism reads or takes pushes from.")
    return spec.kind


def _category(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise SourceError("The category is a category id from the server.")
    return value


def dto(row: Mapping[str, Any]) -> dict[str, Any]:
    """A source as the API shows it: never the token, only whether one is set."""

    return {
        "id": row["id"], "kind": row["kind"], "display_name": row["display_name"], "base_url": row["base_url"],
        "category_id": row["category_id"], "enabled": row["enabled"], "interval_hours": row["interval_hours"],
        "has_token": bool(row["credential_envelope"]), "server": row["server"], "api_version": row["api_version"],
        "last_sync_at": row["last_sync_at"].isoformat() if row["last_sync_at"] else None, "last_status": row["last_status"],
        "last_error": row["last_error"], "matched": row["matched"], "unmatched": row["unmatched"],
    }


def get(conn, source_id: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM inventory_sources WHERE id = %s", (source_id,)).fetchone()
    if row is None:
        raise SourceNotFound(source_id)
    return dict(row)


def list_sources(conn) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute("SELECT * FROM inventory_sources ORDER BY lower(display_name), id").fetchall()]


def create(
    conn, keyring: sealed.CredentialKeyring, actor: str, *, display_name: str, url: str, token: str,
    category_id: int | None = None, interval_hours: int = 24, kind: str = KIND_INVENTREE,
) -> dict[str, Any]:
    """A new source. Without a category it reads the whole inventory. A push source has no server, token or schedule."""

    actor = actor_text(actor)
    source_id = uuid.uuid4().hex
    kind = _kind(kind)
    pushed = registry.get_spec(kind).pushed
    envelope = sealed.seal(keyring, source_id, {"token": token.strip()}, TOKEN_FIELD) if token.strip() and not pushed else ""
    conn.execute(
        "INSERT INTO inventory_sources (id, kind, display_name, base_url, category_id, credential_envelope, interval_hours, created_by) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (source_id, kind, _name(display_name), "" if pushed else _url(url), None if pushed else _category(category_id), envelope,
         _interval(interval_hours), actor),
    )
    write_audit(conn, actor, "inventory_source.create", source_id, {"kind": kind, "base_url": "" if pushed else _url(url)}, subject_kind="inventory_source")
    return get(conn, source_id)


def update(conn, keyring: sealed.CredentialKeyring, source_id: str, actor: str, **changes: Any) -> dict[str, Any]:
    """Change a source. A new URL or token clears what the server said about itself until the next read. A new URL, token or category
    makes the source due now, and the stock it holds (read under the old settings) shows as stale until that read replaces it."""

    actor = actor_text(actor)
    get(conn, source_id)
    clean: dict[str, Any] = {}
    if "display_name" in changes:
        clean["display_name"] = _name(changes["display_name"])
    if "url" in changes:
        clean["base_url"] = _url(changes["url"])
    if "category_id" in changes:
        clean["category_id"] = _category(changes["category_id"])
    if "interval_hours" in changes:
        clean["interval_hours"] = _interval(changes["interval_hours"])
    if "enabled" in changes:
        clean["enabled"] = bool(changes["enabled"])
    if "token" in changes:
        token = str(changes["token"] or "").strip()
        clean["credential_envelope"] = sealed.seal(keyring, source_id, {"token": token}, TOKEN_FIELD) if token else ""
    if "base_url" in clean or "credential_envelope" in clean:
        clean |= {"server": "", "api_version": None}
    if {"base_url", "credential_envelope", "category_id"} & set(clean):
        clean["last_sync_at"] = None
        conn.execute("UPDATE inventory_levels SET fetch_status = 'error' WHERE source_id = %s", (source_id,))
    if clean:
        assignments = ", ".join(f"{column} = %s" for column in clean)
        conn.execute(f"UPDATE inventory_sources SET {assignments} WHERE id = %s", (*clean.values(), source_id))
        write_audit(conn, actor, "inventory_source.update", source_id, {"fields": sorted(clean)}, subject_kind="inventory_source")
    return get(conn, source_id)


def delete(conn, source_id: str, actor: str) -> None:
    """Remove a source, its stock rows and what waits for review."""

    actor = actor_text(actor)
    get(conn, source_id)
    conn.execute("DELETE FROM supply_push_tokens WHERE target_kind = 'inventory_source' AND target_id = %s", (source_id,))
    conn.execute("DELETE FROM inventory_levels WHERE source_id = %s", (source_id,))
    conn.execute("DELETE FROM inventory_sources WHERE id = %s", (source_id,))
    write_audit(conn, actor, "inventory_source.delete", source_id, subject_kind="inventory_source")


def token_of(keyring: sealed.CredentialKeyring, row: Mapping[str, Any]) -> str:
    if not row["credential_envelope"]:
        raise SourceError("The source has no API token.")
    return sealed.unseal(keyring, row["id"], row["credential_envelope"], TOKEN_FIELD).get("token", "")
