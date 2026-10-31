"""Reading a local inventory source into the catalog's ``inventory_levels`` (decision D15).

A sync reads the whole inventory (or the one category a source follows), then, in one transaction, replaces the source's
stock rows and its list of unmatched parts. The source's kind (``registry``) says how it is read. Nothing is read inside a transaction, and a failed read changes no stock: the source's rows are
marked ``fetch_status = error`` so they show as stale, and the error is kept on the source.

Each server part is matched to one active catalog component, first hit wins:

1. a person's link (``inventory_links``);
2. the part's IPN is a component's Prism id;
3. the part's IPN equals one component's SAP code;
4. one of its MPNs is one component's part number. Several components with the number are told apart by the maker,
   which is otherwise only a hint (some servers list every part under "Unknown manufacturer");
5. one of its supplier part numbers is a distributor listing (SKU) of exactly one component's approved parts.

A part with stock that matches nothing waits in ``inventory_unmatched`` with the reason.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable, Mapping

from app.services.supply import clock
from app.services.supply import credentials as sealed
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import alias_key, match_key
from app.services.supply.inventory import registry, sources
from app.services.supply.inventory.base import InventoryRead, InventoryReader, Part, StockRecord
from app.services.supply.inventory.inventree import STATUS_NAMES, STATUS_OK
from app.services.supply.providers.base import ProviderError
from app.services.supply.store import SupplyStore

NO_MATCH, SAP_SHARED, MPN_SHARED = "no_component", "sap_code_shared", "mpn_shared"

ReaderFactory = Callable[[str, str], InventoryReader]


class _Library:
    """The active components, indexed by SAP code, by part number and by the distributor numbers (SKUs) of their parts."""

    def __init__(self, conn) -> None:
        self._conn = conn
        self._makers: dict[str, str] = {}
        rows = conn.execute(
            """
            SELECT c.id, r.sap_code, r.manufacturer, r.mpn
            FROM components c JOIN component_revisions r ON r.id = c.current_revision_id
            WHERE c.is_active = 1
            """
        ).fetchall()
        self.active = {row["id"] for row in rows}
        self.by_sap: dict[str, list[str]] = {}
        self.by_mpn: dict[str, list[tuple[str, str]]] = {}
        for row in rows:
            if (row["sap_code"] or "").strip():
                self.by_sap.setdefault(row["sap_code"].strip(), []).append(row["id"])
            if match_key(row["mpn"] or ""):
                self.by_mpn.setdefault(match_key(row["mpn"]), []).append((row["id"], row["manufacturer"] or ""))
        self.by_sku: dict[str, set[str]] = {}
        listed = conn.execute("SELECT to_regclass('supply_listings') IS NOT NULL AND to_regclass('component_parts') IS NOT NULL AS ok").fetchone()
        if listed and listed["ok"]:
            for row in conn.execute(
                """
                SELECT DISTINCT l.sku, cp.component_id FROM supply_listings l
                JOIN component_parts cp ON cp.part_id = l.part_id AND cp.approval = 'approved'
                WHERE l.match_state IN ('exact', 'manual')
                """
            ).fetchall():
                if row["component_id"] in self.active:
                    self.by_sku.setdefault(_sku_key(row["sku"]), set()).add(row["component_id"])

    def match(self, part: Part, linked: str | None) -> tuple[str | None, str]:
        """The component and how it matched ("link", "sap_code", "mpn"), or None and why not."""

        if linked in self.active:
            return linked, "link"
        if part.ipn in self.active:
            return part.ipn, "component_id"
        found = self.by_sap.get(part.ipn, []) if part.ipn else []
        if len(found) == 1:
            return found[0], "sap_code"
        reason = SAP_SHARED if found else NO_MATCH
        for maker, mpn in part.mpns:
            holders = self.by_mpn.get(match_key(mpn), [])
            if len(holders) > 1 and alias_key(maker):
                holders = [holder for holder in holders if self._maker(holder[1]) == self._maker(maker)] or holders
            if len(holders) == 1:
                return holders[0][0], "mpn"
            if holders:
                reason = MPN_SHARED
        for _supplier, sku in part.skus:  # the supplier's name is not needed: a SKU names one listing
            holders_of_sku = self.by_sku.get(_sku_key(sku), set())
            if len(holders_of_sku) == 1:
                return next(iter(holders_of_sku)), "sku"
        return None, reason

    def _maker(self, name: str) -> str:
        """Who a spelling names, through supply's spellings of makers (TI is Texas Instruments); the spelling itself when Prism
        can't place it."""

        key = alias_key(name)
        if key not in self._makers:
            from app.services.supply import parts

            found = parts.resolve_manufacturer(self._conn, name).manufacturer_id
            self._makers[key] = f"id:{found}" if found else f"key:{key}"
        return self._makers[key]


def _sku_key(sku: str) -> str:
    return "".join(str(sku or "").split()).upper()


def _status(record: StockRecord) -> str:
    if record.status == STATUS_OK:
        return "available"
    return (record.status_text or STATUS_NAMES.get(record.status, str(record.status))).strip().casefold()


def apply(conn, source_id: str, found: InventoryRead, now: datetime, *, level_source: str = "inventree") -> dict[str, int]:
    """Replace the source's stock rows and unmatched parts with what was read. Returns the counts."""

    library = _Library(conn)
    links = {row["remote_part"]: row["component_id"] for row in conn.execute(
        "SELECT remote_part, component_id FROM inventory_links WHERE source_id = %s", (source_id,)).fetchall()}
    by_part: dict[int, list[StockRecord]] = {}
    for record in found.stock:
        by_part.setdefault(record.part, []).append(record)
    ignored = {row["remote_part"] for row in conn.execute("SELECT remote_part FROM inventory_ignored WHERE source_id = %s", (source_id,)).fetchall()}
    stamp = now.isoformat()
    conn.execute("DELETE FROM inventory_levels WHERE source_id = %s", (source_id,))
    conn.execute("DELETE FROM inventory_unmatched WHERE source_id = %s", (source_id,))
    matched = unmatched = 0
    for part_pk, records in sorted(by_part.items()):
        part = found.parts.get(part_pk) or Part(pk=part_pk, name="", ipn="", units="")
        component_id, how = library.match(part, links.get(str(part_pk)))
        if component_id is None:
            # A part set aside is still listed (under Ignored) but waits for nobody.
            unmatched += 0 if str(part_pk) in ignored else 1
            first = part.mpns[0] if part.mpns else ("", "")
            conn.execute(
                "INSERT INTO inventory_unmatched (source_id, remote_part, ipn, mpn, manufacturer, name, quantity, records, reason, seen_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (source_id, str(part_pk), part.ipn, first[1], first[0], part.name, sum(r.quantity for r in records), len(records), how, now),
            )
            continue
        matched += 1
        for record in records:
            location = found.locations.get(record.location) if record.location is not None else None
            conn.execute(
                """
                INSERT INTO inventory_levels (source, component_id, location_key, source_record_id, quantity, uom, inventory_status,
                    fetch_status, fetched_at, updated_at, source_id, allocated, location_path, external, batch, source_updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ok', %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (level_source, component_id, f"{source_id}/{record.pk}", str(record.pk), record.quantity, part.units, _status(record),
                 stamp, stamp, source_id, record.allocated, location.pathstring if location else "", bool(location and location.external),
                 record.batch, record.updated),
            )
    conn.execute(
        "UPDATE inventory_sources SET server = %s, api_version = %s, last_sync_at = %s, last_status = 'ok', last_error = '', matched = %s, unmatched = %s WHERE id = %s",
        (found.server, found.api_version, now, matched, unmatched, source_id),
    )
    return {"matched": matched, "unmatched": unmatched, "records": len(found.stock)}


def fail(conn, source_id: str, error: str, now: datetime) -> None:
    """Keep the source's stock, marked stale, and say why the read failed."""

    conn.execute("UPDATE inventory_levels SET fetch_status = 'error' WHERE source_id = %s", (source_id,))
    conn.execute(
        "UPDATE inventory_sources SET last_sync_at = %s, last_status = 'error', last_error = %s WHERE id = %s", (now, error[:300], source_id)
    )


def sync(
    store: SupplyStore, keyring: sealed.CredentialKeyring, source_id: str, *,
    client_factory: ReaderFactory | None = None, now: datetime | None = None,
) -> dict[str, Any]:
    """Read one source and store what it holds. Returns the counts, or the error the source now shows."""

    moment = now or clock.now()
    with store.connection() as conn:
        row = sources.get(conn, source_id)
    read_as = _settings(row)
    spec = registry.get_spec(row["kind"])
    try:
        factory = client_factory or spec.factory
        if factory is None:
            raise sources.SourceError("Prism does not read this kind of source.")
        client = factory(row["base_url"], sources.token_of(keyring, row))
        try:
            found = client.read(row["category_id"] if spec.categories else None)
        finally:
            client.close()
    except (ProviderError, sources.SourceError) as exc:
        message = f"{getattr(exc, 'code', 'invalid')}: {exc}"
        with store.connection() as conn:
            if not _still(conn, source_id, read_as):
                return SUPERSEDED
            fail(conn, source_id, message, moment)
        return {"status": "error", "error": message}
    with store.connection() as conn:
        if not _still(conn, source_id, read_as):
            return SUPERSEDED
        return {"status": "ok", **apply(conn, source_id, found, moment, level_source=spec.level_source)}


# What a read depends on: a change to any of them (``sources.update``) makes stock read under the old ones stale.
READ_SETTINGS = ("base_url", "credential_envelope", "category_id")
SUPERSEDED = {"status": "error", "error": "superseded: the source changed while it was read; it is read again with its new settings."}


def _settings(row: Mapping[str, Any]) -> tuple[Any, ...]:
    return tuple(row[column] for column in READ_SETTINGS)


def _still(conn, source_id: str, read_as: tuple[Any, ...]) -> bool:
    """Whether the source still has the settings it was read with, holding its row until the read is stored.

    A read that took the old URL, token or category stores nothing, failure included: the edit already made the source due."""

    row = conn.execute(f"SELECT {', '.join(READ_SETTINGS)} FROM inventory_sources WHERE id = %s FOR UPDATE", (source_id,)).fetchone()
    return row is not None and _settings(row) == read_as


def due(conn, now: datetime) -> list[str]:
    """Enabled sources Prism reads, with a token, whose last read is older than their interval."""

    rows = conn.execute(
        "SELECT id, interval_hours, last_sync_at FROM inventory_sources WHERE enabled AND credential_envelope <> '' AND kind = ANY(%s) ORDER BY id",
        ([spec.kind for spec in registry.list_specs() if spec.pulled],),
    ).fetchall()
    return [row["id"] for row in rows if row["last_sync_at"] is None or row["last_sync_at"] <= now - timedelta(hours=row["interval_hours"])]


def sync_due(store: SupplyStore, keyring: sealed.CredentialKeyring, now: datetime | None = None) -> list[dict[str, Any]]:
    moment = now or clock.now()
    with store.connection() as conn:
        ids = due(conn, moment)
    return [sync(store, keyring, source_id, now=moment) for source_id in ids]


def link(conn, source_id: str, remote_part: str, component_id: str, actor: str) -> None:
    """A person's answer to an unmatched part: it is this component from the next read on."""

    actor = actor_text(actor)
    sources.get(conn, source_id)
    active = conn.execute("SELECT is_active FROM components WHERE id = %s", (component_id,)).fetchone()
    if not active or not active["is_active"]:
        raise sources.SourceError("There is no such component in the library.")
    waiting = conn.execute("SELECT 1 FROM inventory_unmatched WHERE source_id = %s AND remote_part = %s", (source_id, remote_part)).fetchone()
    relinked = conn.execute("SELECT 1 FROM inventory_links WHERE source_id = %s AND remote_part = %s", (source_id, remote_part)).fetchone()
    conn.execute(
        "INSERT INTO inventory_links (source_id, remote_part, component_id, linked_by, linked_at) VALUES (%s, %s, %s, %s, %s) "
        "ON CONFLICT (source_id, remote_part) DO UPDATE SET component_id = EXCLUDED.component_id, linked_by = EXCLUDED.linked_by, linked_at = EXCLUDED.linked_at",
        (source_id, remote_part, component_id, actor, clock.now()),
    )
    # Answered: it no longer needs a person, but stays listed as linked until a read lands its stock on the component (UX-04).
    if waiting and not relinked:
        conn.execute("UPDATE inventory_sources SET unmatched = %s WHERE id = %s", (unmatched_counts(conn, source_id)["waiting"], source_id))
    write_audit(conn, actor, "inventory_source.link", source_id, {"remote_part": remote_part, "component_id": component_id}, subject_kind="inventory_source")


GROUPS = ("waiting", "no_component", "sap_code_shared", "mpn_shared", "linked", "ignored")


def unmatched(
    conn, source_id: str, *, query: str = "", limit: int | None = None, offset: int = 0, group: str = "",
) -> list[dict[str, Any]]:
    """The source's unmatched parts with stock, those waiting for a person first and largest first. A part a person has linked since
    the last read stays, with the component it was linked to, until a read lands its stock there. ``query`` narrows to parts whose
    IPN, MPN, maker or name contains it; ``limit`` and ``offset`` page the list. ``group`` narrows to one of ``GROUPS``: those waiting,
    those waiting for one reason, those linked, or those set aside. Without it, every part except those set aside."""

    if group and group not in GROUPS:
        raise sources.SourceError("That group is not one Prism knows.")
    like = f"%{query.strip()}%" if query.strip() else None

    return [dict(row) for row in conn.execute(
        """
        SELECT u.remote_part, u.ipn, u.mpn, u.manufacturer, u.name, u.quantity, u.records, u.reason, u.seen_at,
               l.component_id AS linked_component_id, COALESCE(r.mpn, '') AS linked_mpn, COALESCE(r.name, '') AS linked_name, l.linked_at
        FROM inventory_unmatched u
        LEFT JOIN inventory_links l ON l.source_id = u.source_id AND l.remote_part = u.remote_part
        LEFT JOIN components c ON c.id = l.component_id
        LEFT JOIN component_revisions r ON r.id = c.current_revision_id
        LEFT JOIN inventory_ignored g ON g.source_id = u.source_id AND g.remote_part = u.remote_part
        WHERE u.source_id = %s
          AND (%s::text IS NULL OR u.ipn ILIKE %s OR u.mpn ILIKE %s OR u.manufacturer ILIKE %s OR u.name ILIKE %s)
          AND CASE %s
                WHEN 'ignored' THEN g.remote_part IS NOT NULL
                WHEN 'linked' THEN g.remote_part IS NULL AND l.component_id IS NOT NULL
                WHEN 'waiting' THEN g.remote_part IS NULL AND l.component_id IS NULL
                WHEN '' THEN g.remote_part IS NULL
                ELSE g.remote_part IS NULL AND l.component_id IS NULL AND u.reason = %s
              END
        ORDER BY (l.component_id IS NOT NULL), u.quantity DESC, u.remote_part
        LIMIT %s OFFSET %s
        """, (source_id, like, like, like, like, like, group, group, limit, max(offset, 0))).fetchall()]


def unmatched_counts(conn, source_id: str) -> dict[str, int]:
    """How many of the source's unmatched parts are in each of ``GROUPS``."""

    row = conn.execute(
        """
        SELECT COUNT(*) FILTER (WHERE g.remote_part IS NULL AND l.remote_part IS NULL) AS waiting,
               COUNT(*) FILTER (WHERE g.remote_part IS NULL AND l.remote_part IS NULL AND u.reason = 'no_component') AS no_component,
               COUNT(*) FILTER (WHERE g.remote_part IS NULL AND l.remote_part IS NULL AND u.reason = 'sap_code_shared') AS sap_code_shared,
               COUNT(*) FILTER (WHERE g.remote_part IS NULL AND l.remote_part IS NULL AND u.reason = 'mpn_shared') AS mpn_shared,
               COUNT(*) FILTER (WHERE g.remote_part IS NULL AND l.remote_part IS NOT NULL) AS linked,
               COUNT(*) FILTER (WHERE g.remote_part IS NOT NULL) AS ignored
        FROM inventory_unmatched u
        LEFT JOIN inventory_links l ON l.source_id = u.source_id AND l.remote_part = u.remote_part
        LEFT JOIN inventory_ignored g ON g.source_id = u.source_id AND g.remote_part = u.remote_part
        WHERE u.source_id = %s
        """,
        (source_id,),
    ).fetchone()
    return {name: int(row[name]) for name in GROUPS}


MAX_AT_ONCE = 500


def set_ignored(conn, source_id: str, remote_parts: list[str], ignore: bool, actor: str) -> int:
    """Set unmatched parts aside, or bring them back. Only parts the source lists unmatched now are touched, so a stale selection
    changes nothing it should not. Returns how many changed; the source's waiting count follows."""

    actor = actor_text(actor)
    sources.get(conn, source_id)
    wanted = list(dict.fromkeys(str(part) for part in remote_parts))[:MAX_AT_ONCE]
    if ignore:
        changed = conn.execute(
            "INSERT INTO inventory_ignored (source_id, remote_part, ignored_by) "
            "SELECT u.source_id, u.remote_part, %s FROM inventory_unmatched u WHERE u.source_id = %s AND u.remote_part = ANY(%s) "
            "ON CONFLICT DO NOTHING",
            (actor, source_id, wanted),
        ).rowcount
    else:
        changed = conn.execute(
            "DELETE FROM inventory_ignored WHERE source_id = %s AND remote_part = ANY(%s)", (source_id, wanted),
        ).rowcount
    conn.execute(
        "UPDATE inventory_sources SET unmatched = %s WHERE id = %s", (unmatched_counts(conn, source_id)["waiting"], source_id),
    )
    if changed:
        write_audit(conn, actor, "inventory_source.ignore" if ignore else "inventory_source.restore", source_id,
                    {"remote_parts": wanted[:50], "count": int(changed)}, subject_kind="inventory_source")
    return int(changed or 0)
