"""Data a source pushes to Prism, for anything that is not a pull adapter: a scraper, an ERP export, a script in any language.

Two targets take a push, each with a token of its own that can push there and nowhere else:

- a **file-fed connector** (CSV, LCSC, JLCPCB) takes offers. They are kept like an uploaded file's rows (``csv_offers``), so
  the connector's own reads serve them too, and the listings Prism already has for those SKUs are recorded at once through
  the one write path (``Poller.record_search_offers`` and ``persist``). New SKUs are matched to parts by the next discovery,
  as an upload's are. Uploading a CSV file is a push that replaces every row.
- a **push inventory source** takes stock levels: the whole stock it holds, which replaces what it pushed before. The
  levels are matched and stored as an InvenTree read is (``inventory.sync.apply``).

A token is ``prism_push_`` and 40 random characters, shown once; only its hash is kept. A new token replaces the old one.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime
from typing import Any, Mapping, Sequence

from app.services.supply import clock
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.csv_format import CsvOfferRow
from app.services.supply.csv_offers import CsvOfferStore
from app.services.supply.inventory import registry as inventory_registry
from app.services.supply.inventory import sources, sync
from app.services.supply.inventory.base import InventoryRead, Location, Part, StockRecord
from app.services.supply.inventory.inventree import STATUS_OK
from app.services.supply.providers import registry
from app.services.supply.providers.base import ProviderSpec
from app.services.supply.store import SupplyStore
from app.services.supply.errors import Refused

TOKEN_PREFIX = "prism_push_"
TOKEN_RANDOM_LENGTH = 40
DISPLAY_PREFIX_LENGTH = 14
CONNECTOR, INVENTORY_SOURCE = "connector", "inventory_source"
TARGETS = frozenset({CONNECTOR, INVENTORY_SOURCE})
MAX_LEVELS = 50_000
# Status words that mean usable stock; any other is held (``levels.py``).
_AVAILABLE = frozenset({"", "ok", "available"})
_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


class PushError(Refused):
    """The push was not taken. ``code`` and the message are safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message, code=code)


# --- tokens -----------------------------------------------------------------


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(conn, target_kind: str, target_id: str, actor: str) -> str:
    """A new token for the target, replacing any it had. Returned once; only its hash is kept."""

    if target_kind not in TARGETS:
        raise ValueError(target_kind)
    token = TOKEN_PREFIX + "".join(secrets.choice(_BASE62) for _ in range(TOKEN_RANDOM_LENGTH))
    conn.execute(
        """
        INSERT INTO supply_push_tokens (target_kind, target_id, token_hash, prefix, created_by, created_at) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (target_kind, target_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, prefix = EXCLUDED.prefix,
            created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, last_used_at = NULL
        """,
        (target_kind, target_id, _hash(token), token[:DISPLAY_PREFIX_LENGTH], actor_text(actor), clock.now()),
    )
    write_audit(conn, actor, "push_token.issue", target_id, {"prefix": token[:DISPLAY_PREFIX_LENGTH]}, subject_kind=target_kind)
    return token


def revoke_token(conn, target_kind: str, target_id: str, actor: str) -> bool:
    gone = conn.execute("DELETE FROM supply_push_tokens WHERE target_kind = %s AND target_id = %s", (target_kind, target_id)).rowcount
    if gone:
        write_audit(conn, actor, "push_token.revoke", target_id, subject_kind=target_kind)
    return bool(gone)


def token_info(conn, target_kind: str, target_id: str) -> dict[str, Any] | None:
    """The token's prefix and when it was made and last used, never the token."""

    row = conn.execute(
        "SELECT prefix, created_by, created_at, last_used_at FROM supply_push_tokens WHERE target_kind = %s AND target_id = %s",
        (target_kind, target_id),
    ).fetchone()
    return dict(row) if row else None


def check_token(conn, target_kind: str, target_id: str, token: str) -> str | None:
    """The token's prefix when it is the target's token (and its use is noted), else None."""

    if not token.startswith(TOKEN_PREFIX):
        return None
    row = conn.execute(
        "SELECT token_hash, prefix FROM supply_push_tokens WHERE target_kind = %s AND target_id = %s", (target_kind, target_id),
    ).fetchone()
    if row is None or not hmac.compare_digest(row["token_hash"], _hash(token)):
        return None
    conn.execute(
        "UPDATE supply_push_tokens SET last_used_at = %s WHERE target_kind = %s AND target_id = %s", (clock.now(), target_kind, target_id),
    )
    return str(row["prefix"])


def forget_tokens(conn, target_kind: str, target_id: str) -> None:
    """Drop the target's token with the target."""

    conn.execute("DELETE FROM supply_push_tokens WHERE target_kind = %s AND target_id = %s", (target_kind, target_id))


# --- offers -----------------------------------------------------------------


def require_file_fed(connector: Mapping[str, Any]) -> ProviderSpec:
    try:
        spec = registry.get_spec(connector["provider"])
    except registry.UnknownProvider:
        spec = None  # a plugin was removed; its connector cannot be fed
    if spec is None or not spec.csv_fed:
        raise PushError("not_csv", "Only a file-fed connector (CSV, LCSC, JLCPCB) takes offers.")
    return spec


def read_again(conn, connector_id: str, now: datetime | None = None) -> None:
    """Make every listing of the connector due now, so a listing the new rows no longer hold is found missing on the next
    scan instead of standing until its own next read. Its last read was stamped by the poller's clock, so it is due whatever
    clock the poller runs on."""

    conn.execute(
        """
        UPDATE supply_poll_state SET next_poll_at = LEAST(next_poll_at, COALESCE(last_polled_at, next_poll_at), %s)
        WHERE listing_id IN (SELECT id FROM supply_listings WHERE connector_id = %s)
        """,
        (now or clock.now(), connector_id),
    )


def push_offers(
    store: SupplyStore, connectors, connector_id: str, rows: Sequence[CsvOfferRow], *, actor: str, replace: bool,
    filename: str = "", poller=None,
) -> dict[str, Any]:
    """Keep ``rows`` as the connector's offers (all of them when ``replace``, else those SKUs) and record the listings Prism
    already has for them through the write path. Returns the import info and how many listings were recorded."""

    from app.services.supply.poller import Poller

    actor = actor_text(actor)
    connector = connectors.get(connector_id)
    spec = require_file_fed(connector)
    offers = CsvOfferStore(provider_key=spec.key, marketplace=spec.assembly_only)
    skus = list(dict.fromkeys(row.sku for row in rows))
    with store.connection() as conn:
        keep = offers.replace_all if replace else offers.upsert
        info = keep(conn, connector_id, rows, filename=filename.strip()[:200], actor=actor)
        conn.execute("UPDATE supply_connectors SET last_ok_at = %s, last_error_code = '' WHERE id = %s", (clock.now(), connector_id))
        # New rows may carry parts Prism has not matched here yet, and listings marked gone can come back: searched afresh.
        conn.execute("DELETE FROM supply_discovery_runs WHERE connector_id = %s", (connector_id,))
        if replace:
            read_again(conn, connector_id)
        listings = conn.execute(
            "SELECT id, sku FROM supply_listings WHERE connector_id = %s AND sku = ANY(%s) AND part_id IS NOT NULL AND supply_counted(match_state)",
            (connector_id, skus),
        ).fetchall()
        by_sku = {offer.sku: offer for offer in offers.offers_for_skus(conn, connector_id, [row["sku"] for row in listings])}
        write_audit(conn, actor, "connector.csv_import" if replace else "connector.push", connector_id,
                    {"filename": info.filename, "rows": len(rows), "kept": info.row_count})
    items = [(row["id"], by_sku[row["sku"]]) for row in listings if row["sku"] in by_sku]
    if items:
        (poller or Poller(connectors, store=store)).record_search_offers(connector_id, items)
    return {"info": info, "recorded": len(items)}


# --- inventory levels -------------------------------------------------------


def levels_read(items: Sequence[Mapping[str, Any]]) -> InventoryRead:
    """Pushed stock rows as a read: one part per ``part`` (its numbers gathered from every row), one location per path."""

    if len(items) > MAX_LEVELS:
        raise PushError("too_many", f"At most {MAX_LEVELS:,} rows in one push.")
    names: dict[str, dict[str, Any]] = {}
    locations: dict[str, Location] = {}
    stock: list[StockRecord] = []
    for index, item in enumerate(items, start=1):
        part = str(item["part"]).strip()
        if not part:
            raise PushError("invalid_levels", f"Row {index} names no part.")
        known = names.setdefault(part, {"name": "", "ipn": "", "units": "", "mpns": [], "skus": []})
        for field in ("name", "ipn", "units"):
            known[field] = known[field] or str(item.get(field) or "").strip()
        if str(item.get("mpn") or "").strip():
            pair = (str(item.get("manufacturer") or "").strip(), str(item["mpn"]).strip())
            if pair not in known["mpns"]:
                known["mpns"].append(pair)
        if str(item.get("sku") or "").strip():
            pair = (str(item.get("supplier") or "").strip(), str(item["sku"]).strip())
            if pair not in known["skus"]:
                known["skus"].append(pair)
        path = str(item.get("location") or "").strip()
        if path and path not in locations:
            locations[path] = Location(pk=path, pathstring=path, external=bool(item.get("external")))
        status = str(item.get("status") or "").strip()
        stock.append(StockRecord(
            pk=index, part=part, quantity=float(item.get("quantity") or 0), allocated=float(item.get("allocated") or 0),
            status=STATUS_OK if status.casefold() in _AVAILABLE else 0, status_text=status,
            location=path or None, batch=str(item.get("batch") or "").strip(), updated=str(item.get("updated") or "").strip(),
        ))
    parts = {
        key: Part(pk=key, name=value["name"], ipn=value["ipn"], units=value["units"], mpns=tuple(value["mpns"]), skus=tuple(value["skus"]))
        for key, value in names.items()
    }
    return InventoryRead(server="", api_version=None, parts=parts, locations=locations, stock=stock)


def push_levels(store: SupplyStore, source_id: str, items: Sequence[Mapping[str, Any]], *, actor: str, now: datetime | None = None) -> dict[str, int]:
    """Replace the push source's stock with ``items``, matched to components as a read is. Returns the counts."""

    found = levels_read(items)
    moment = now or clock.now()
    with store.connection() as conn:
        row = sources.get(conn, source_id)
        spec = inventory_registry.get_spec(row["kind"])
        if not spec.pushed:
            raise PushError("not_push", "Only a push inventory source takes stock levels.")
        counts = sync.apply(conn, source_id, found, moment, level_source=spec.level_source)
        write_audit(conn, actor, "inventory_source.push", source_id, counts, subject_kind=INVENTORY_SOURCE)
    return counts
