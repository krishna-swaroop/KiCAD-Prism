"""A part's stock across distributors, counting only what should count.

Only ``exact`` and ``manual`` listings count. Marketplace stock is left out.
Within one connector, packaging variants of a part may share a single stock
pool (cut tape and reel drawn from the same shelf): the provider declares
whether its stock is ``pooled`` (take the largest of all its listings) or ``separate``.
Of a ``separate`` provider, cut tape, custom reel (Digi-Reel, MouseReel, a re-reel) and any packaging not known are one pile and
the largest counts, so a guess never doubles stock; a full reel, a tray or a tube is a pile of its own and adds.
Across connectors the figures add, because they are different warehouses, except connectors on one account (shared
credentials, such as two storefronts of one distributor): they are one stock pool, so a SKU both list counts once (``pool``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable, Mapping

from app.services.supply import component_parts, counted
from app.services.supply.providers import registry


# A watch can count only one packaging: cut tape for prototypes, reel for production. "any" counts all.
POLICIES = ("any", "cut_tape", "custom_reel", "tape_reel", "tray", "tube", "bulk")


# Packagings cut from the same stock, and those not known (counted with the largest, never added): of these only the largest figure counts.
ONE_PILE = frozenset({"cut_tape", "custom_reel", "unknown", "other", "several", None, ""})


def pool_sql(connector: str = "c") -> str:
    """SQL for a row's stock pool: the account its connector is on (connectors on one set of credentials are one account; a
    connector with none is an account of its own)."""

    return f"{connector}.account_id"


def connector_stock(provider: str, rows: Iterable[Mapping[str, Any]]) -> int:
    """The stock of one distributor's listings of a part: the largest figure where the provider pools its stock, else one figure for
    each pile (cut tape and custom reel together, every other packaging by itself)."""

    stocks = [(row.get("packaging"), int(row["stock"])) for row in rows]
    if not stocks:
        return 0
    try:
        pooled = registry.get_spec(provider).stock_pooling == "pooled"
    except registry.UnknownProvider:
        pooled = False  # a removed plugin: add up rather than hide stock
    if pooled:
        return max(stock for _packaging, stock in stocks)
    cut = [stock for packaging, stock in stocks if packaging in ONE_PILE]
    return (max(cut) if cut else 0) + sum(stock for packaging, stock in stocks if packaging not in ONE_PILE)


def counts(packaging: str | None, policy: str) -> bool:
    """Whether a listing of this packaging counts under the watch's policy. A listing of unknown packaging does not match a specific one."""

    return policy == "any" or packaging == policy


@dataclass(frozen=True, slots=True)
class PartStock:
    total: int
    by_connector: dict[str, int] = field(default_factory=dict)
    listings: int = 0
    newest_fetched_at: datetime | None = None
    # Stock per pool (an account, else a connector): connectors on one account are one holder.
    by_pool: dict[str, int] = field(default_factory=dict)
    # The oldest read the total rests on: of the counted rows that hold stock, or of every counted row when none does.
    as_of: datetime | None = None

    @property
    def holders(self) -> int:
        """How many hold stock: pools with stock (connectors on one account are one holder)."""

        return sum(1 for amount in self.by_pool.values() if amount > 0)


def holders(rows: Iterable[Mapping[str, Any]], policy: str = "any") -> int:
    """How many hold stock of a part, from its counted offer rows (``connector_id``, ``stock``, ``marketplace``, and ``pool`` and
    ``packaging`` where known): stock pools with stock, as ``aggregate`` counts them. The one rule for "held by one distributor"."""

    return len({row.get("pool") or row["connector_id"] for row in rows
                if int(row["stock"] or 0) > 0 and not row["marketplace"] and counts(row.get("packaging"), policy)})


def aggregate(rows: Iterable[Mapping[str, Any]], policy: str = "any") -> PartStock:
    """Combine offer rows of one part. Each row needs connector_id, provider, stock, marketplace, fetched_at,
    and ``packaging`` when ``policy`` names one: other packaging is left out of the total (but still dates it)."""

    pools: dict[str, list[Mapping[str, Any]]] = {}
    providers: dict[str, str] = {}
    counted = 0
    newest: datetime | None = None
    for row in rows:
        if newest is None or row["fetched_at"] > newest:
            newest = row["fetched_at"]
        if row["marketplace"] or not counts(row.get("packaging"), policy):
            continue
        counted += 1
        pools.setdefault(row["connector_id"], []).append(row)
        providers[row["connector_id"]] = row["provider"]

    by_connector = {connector_id: connector_stock(providers[connector_id], held) for connector_id, held in pools.items()}
    # The total counts each pool once: connectors on one account list the same shelf, a SKU by its largest figure.
    shared: dict[str, list[Mapping[str, Any]]] = {}
    for connector_id, held in pools.items():
        shared.setdefault(held[0].get("pool") or connector_id, []).extend(held)
    by_pool = {pool: connector_stock(str(held[0]["provider"]), _one_per_sku(held)) for pool, held in shared.items()}
    return PartStock(
        sum(by_pool.values()), by_connector, counted, newest, by_pool=by_pool, as_of=as_of(row for held in pools.values() for row in held),
    )


def _one_per_sku(rows: list[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """The rows of one pool with a SKU listed by several of its connectors kept once, at its largest figure."""

    if len({row["connector_id"] for row in rows}) < 2:
        return rows
    kept: dict[Any, Mapping[str, Any]] = {}
    for index, row in enumerate(rows):
        key = row.get("sku") or ("", index)
        if key not in kept or int(row["stock"]) > int(kept[key]["stock"]):
            kept[key] = row
    return list(kept.values())


def as_of(rows: Iterable[Mapping[str, Any]]) -> datetime | None:
    """When a total of these counted rows was true as a whole: the oldest read of a row holding stock, else the oldest of all."""

    rows = [row for row in rows if row.get("fetched_at") is not None]
    holding = [row["fetched_at"] for row in rows if int(row.get("stock") or 0) > 0]
    return min(holding or [row["fetched_at"] for row in rows], default=None)


def part_stock(conn, part_id: str) -> PartStock:
    rows = conn.execute(
        """
        SELECT l.connector_id, l.sku, c.provider, {pool} AS pool, o.stock, o.marketplace, o.fetched_at, o.packaging
        FROM supply_listings l
        JOIN supply_offers o ON o.listing_id = l.id
        JOIN supply_connectors c ON c.id = l.connector_id
        WHERE l.part_id = %s AND {counted}
        """.replace("{counted}", counted.listing_sql()).replace("{pool}", pool_sql()),
        (part_id,),
    ).fetchall()
    return aggregate(rows, packaging_of(conn, part_id))


def packaging_of(conn, part_id: str) -> str:
    """The packaging a part is followed in: its watch's, else that of a watched component whose main part it is, else any."""

    watch = conn.execute("SELECT packaging FROM supply_watches WHERE part_id = %s", (part_id,)).fetchone()
    if watch and watch["packaging"] != "any":
        return watch["packaging"]
    if component_parts.library_present(conn):
        row = conn.execute(
            """
            SELECT w.packaging FROM supply_component_watches w JOIN component_parts cp ON cp.component_id = w.component_id AND cp.role = 'main'
            WHERE cp.part_id = %s AND w.packaging <> 'any' ORDER BY w.created_at, w.component_id LIMIT 1
            """,
            (part_id,),
        ).fetchone()
        if row:
            return row["packaging"]
    return "any"
