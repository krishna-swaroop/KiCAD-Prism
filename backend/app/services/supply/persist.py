"""Storing a distributor's answer for a batch of listings: the one write path for a poll, a search that brought offers and
offers pushed by a source of their own.

A batch is written in four steps:
- **normalise**: a packaging guessed from the numbers when the answer gives none, and the price at the reference quantity;
- **persist**: the kept offer, its price breaks, a sample when something changed or the last is a day old, promised
  arrivals, stock events, facts, substances and alternates, and the events a change makes;
- **derive**: how urgent each listing is, once per part, after the whole batch's offers are written;
- **schedule**: when each listing is read next.
What the batch reads first (the previous offers, the links, the parts' rates and watches, what each distributor said of
normal stocking) is loaded once per batch, and the offers, samples, listings and read states are sent as pipelined
statements.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Protocol, Sequence

from app.services.supply import alternates, compliance, facts, insights, parts_view, price_breaks, pricing, promises, stock, stock_events, tiers
from app.services.supply.discovery import remember_datasheet
from app.services.supply.identity import match_key
from app.services.supply.models import Offer
from app.services.supply.providers import packaging_hints
from app.services.supply.vocabulary import Lifecycle, Packaging

MISSES_BEFORE_GONE = 3
# A re-read of an unchanged listing keeps a sample at most this often.
SAMPLE_EVERY = timedelta(days=1)


class Listing(Protocol):
    id: str
    sku: str
    part_id: str
    missing_streak: int
    last_change_at: datetime | None


def _price_of(kept) -> Decimal | None:
    """A kept offer's price at the reference quantity, worked out as a sample's is."""

    return pricing.unit_price_at(
        [(int(quantity), Decimal(str(unit_price))) for quantity, unit_price in kept["price_breaks"] or []],
        moq=kept["moq"], order_multiple=kept["order_multiple"], up_to=kept["price_up_to"],
    )


def normalise(offer: Offer) -> tuple[Offer, Decimal | None]:
    """The offer with a packaging guessed from its numbers when it gives none, and its price at the reference quantity."""

    if offer.packaging is Packaging.UNKNOWN and packaging_hints.guesses(offer.provider):
        guess = packaging_hints.infer(offer.sku, offer.moq, offer.order_multiple, offer.price_breaks[0].quantity if offer.price_breaks else None)
        if guess is not Packaging.UNKNOWN:
            offer = replace(offer, packaging=guess, packaging_inferred=True)
    price = pricing.unit_price_at(
        [(item.quantity, item.unit_price) for item in offer.price_breaks],
        moq=offer.moq, order_multiple=offer.order_multiple, up_to=offer.price_up_to,
    )
    return offer, price


@dataclass
class _Batch:
    """What a batch reads before it writes, loaded once."""

    previous: dict[str, Any]
    links: dict[str, Any]
    rates: dict[str, str]
    watches: dict[str, Any]
    stocking: dict[tuple[str, str], str | None]
    states: dict[str, Any]
    offers: list[tuple] = field(default_factory=list)
    samples: list[tuple] = field(default_factory=list)
    seen: list[tuple] = field(default_factory=list)
    # (listing, lifecycle, last change) for the listings read, and (listing, schedule, urgency, misses) for those missing.
    read: list[tuple[Listing, Lifecycle, datetime | None]] = field(default_factory=list)
    missing: list[tuple[Listing, str, tiers.Urgency, int]] = field(default_factory=list)


def _load(conn, batch: Sequence[Listing]) -> _Batch:
    ids = [row.id for row in batch]
    part_ids = sorted({row.part_id for row in batch})

    def keyed(sql: str, params: tuple, key: str) -> dict[str, Any]:
        return {row[key]: row for row in conn.execute(sql, params).fetchall()}

    return _Batch(
        # The reading before this one is the kept offer, not the newest sample: samples are thinned and deleted by age, and a
        # listing read less often than they are kept would lose every stock-out, restock and lifecycle change.
        previous=keyed(
            "SELECT o.listing_id, o.stock, o.price_breaks, o.price_up_to, o.lifecycle, o.discontinued, o.moq, o.order_multiple, "
            "(SELECT MAX(s.sampled_at) FROM supply_samples s WHERE s.listing_id = o.listing_id) AS sampled_at "
            "FROM supply_offers o WHERE o.listing_id = ANY(%s)", (ids,), "listing_id",
        ),
        links=keyed(
            "SELECT l.id, l.match_state, l.matched_by, l.packaging, p.match_key FROM supply_listings l JOIN supply_parts p ON p.id = l.part_id "
            "WHERE l.id = ANY(%s)", (ids,), "id",
        ),
        rates={row["part_id"]: row["rate"] for row in conn.execute(
            "SELECT part_id, rate FROM supply_part_tiers WHERE part_id = ANY(%s)", (part_ids,)).fetchall()},
        watches=keyed("SELECT DISTINCT ON (part_id) part_id, threshold, pinned FROM supply_watches WHERE part_id = ANY(%s) ORDER BY part_id",
                      (part_ids,), "part_id"),
        stocking={(row["part_id"], row["provider"]): row["value"] for row in conn.execute(
            "SELECT part_id, provider, value FROM supply_part_facts WHERE part_id = ANY(%s) AND name = 'normally_stocking'", (part_ids,)).fetchall()},
        states=keyed("SELECT listing_id, tier, urgency FROM supply_poll_state WHERE listing_id = ANY(%s)", (ids,), "listing_id"),
    )


class Writer:
    """Writes answers for one connector's account (its pacing key ``account`` and provider reset ``reset`` place the next reads)."""

    def __init__(self, *, account: str, reset: tuple[str, str]) -> None:
        self._account = account
        self._reset = reset
        # A part's expected run-out, worked out once per poll.
        self._rupture: dict[str, int | None] = {}

    def record(self, conn, batch: Sequence[Listing], offers: Sequence[Offer], now: datetime) -> int:
        """Store one answer for a batch: an offer for each listing it names, a miss for each it leaves out. Returns how many
        listings it marked gone."""

        loaded = _load(conn, batch)
        by_sku = {offer.sku: offer for offer in offers}
        gone = 0
        for row in batch:
            offer = by_sku.get(row.sku)
            if offer is None:
                gone += self._missing(conn, loaded, row)
            else:
                self._offer(conn, loaded, row, offer, now)
        self._flush(conn, loaded, now)
        return gone

    # --- persist ----------------------------------------------------------

    @staticmethod
    def _bom_link_is_wrong(conn, loaded: _Batch, row: Listing, offer: Offer) -> bool:
        """A number taken from a BOM field is trusted until the distributor names the product. If the product is another
        part (not the same number, nor one that extends it, as with a packaging suffix), the link is only a near match
        and its figures are not kept. True when the link was demoted."""

        link = loaded.links.get(row.id)
        if link is None or link["match_state"] != "manual" or link["matched_by"] != "bom" or not offer.mpn.strip():
            return False
        wanted, found = link["match_key"], match_key(offer.mpn)
        if not found or wanted == found or found.startswith(wanted) or wanted.startswith(found):
            return False
        conn.execute(
            "UPDATE supply_listings SET match_state = 'near', match_reason = %s WHERE id = %s",
            (f"The BOM gave this number, but the distributor lists it as {offer.mpn.strip()[:80]}.", row.id),
        )
        return True

    def _offer(self, conn, loaded: _Batch, row: Listing, offer: Offer, now: datetime) -> None:
        if self._bom_link_is_wrong(conn, loaded, row, offer):
            return
        offer, price = normalise(offer)
        previous = loaded.previous.get(row.id)
        changed = previous is None or (
            previous["stock"] != offer.stock
            or _price_of(previous) != price
            or previous["lifecycle"] != offer.lifecycle.value
            or previous["discontinued"] != offer.discontinued
            or previous["moq"] != offer.moq
            or previous["order_multiple"] != offer.order_multiple
        )
        loaded.offers.append((
            row.id, offer.fetched_at, offer.stock,
            json.dumps([[item.quantity, item.expected.isoformat() if item.expected else None] for item in offer.incoming]),
            offer.moq, offer.order_multiple, offer.packaging.value,
            json.dumps([[item.quantity, str(item.unit_price)] for item in offer.price_breaks]),
            offer.currency, offer.lead_time_days, offer.lifecycle.value, offer.discontinued, offer.rohs,
            offer.marketplace, offer.product_url, offer.reach_affected, offer.reel_size, offer.packaging_inferred, offer.price_up_to,
        ))
        price_breaks.record(
            conn, row.id, offer.fetched_at, [(item.quantity, item.unit_price) for item in offer.price_breaks],
            offer.currency, offer.moq, offer.order_multiple, up_to=offer.price_up_to,
        )
        # A reading is kept when something changed since the last, or the last is a day old; a re-read of an unchanged
        # listing the same day adds nothing.
        if changed or previous["sampled_at"] is None or previous["sampled_at"] <= offer.fetched_at - SAMPLE_EVERY:
            loaded.samples.append((
                row.id, offer.fetched_at, offer.stock, sum(item.quantity for item in offer.incoming),
                offer.lead_time_days, offer.lifecycle.value, offer.discontinued, offer.marketplace,
                offer.moq, offer.order_multiple,
            ))
        before = previous["stock"] if previous is not None else None
        promises.record(conn, row.id, offer.incoming, before, offer.stock, now)
        stock_events.record(conn, row.id, before, offer.stock, offer.lead_time_days, offer.marketplace, now)
        loaded.seen.append((offer.packaging.value, now, row.id))
        # Compliance and trade facts come with the answer; keeping them costs no call.
        stocked_before = loaded.stocking.get((row.part_id, offer.provider))
        facts.replace(conn, row.part_id, offer.provider, offer.facts, now)
        loaded.stocking[(row.part_id, offer.provider)] = dict(offer.facts).get("normally_stocking")
        if offer.substances is not None:
            compliance.record_distributor(conn, row.part_id, offer.provider, offer.substances, now)
        if offer.alternates is not None:
            alternates.replace(conn, row.part_id, offer.provider, offer.alternates, now)
        _note_changes(conn, row, offer, previous, stocked_before)
        if offer.datasheet_url:
            remember_datasheet(conn, row.part_id, offer.datasheet_url)
        loaded.read.append((row, offer.lifecycle, now if changed else row.last_change_at))

    def _missing(self, conn, loaded: _Batch, row: Listing) -> int:
        misses = row.missing_streak + 1
        if misses >= MISSES_BEFORE_GONE:
            conn.execute(
                "UPDATE supply_listings SET match_state = 'gone', match_reason = 'not returned by the provider' WHERE id = %s",
                (row.id,),
            )
            conn.execute("DELETE FROM supply_poll_state WHERE listing_id = %s", (row.id,))
            # A part with nothing counted left at this distributor is "not found" there: it is searched again on the shorter cadence.
            conn.execute(
                """
                UPDATE supply_discovery_runs d SET found = 0 FROM supply_listings l
                WHERE l.id = %s AND d.part_id = l.part_id AND d.connector_id = l.connector_id
                  AND NOT EXISTS (SELECT 1 FROM supply_listings o WHERE o.part_id = l.part_id AND o.connector_id = l.connector_id
                                  AND o.id <> l.id AND supply_counted(o.match_state))
                """,
                (row.id,),
            )
            packaging = loaded.links[row.id]["packaging"] if row.id in loaded.links else "unknown"
            conn.execute(
                "INSERT INTO supply_events (kind, part_id, listing_id, payload) VALUES ('listing_gone', %s, %s, %s::jsonb)",
                (row.part_id, row.id, json.dumps({"sku": row.sku, "packaging": packaging})),
            )
            return 1
        # Asking again soon does not change how urgent the listing is or how often it is read.
        current = loaded.states.get(row.id)
        schedule = current["tier"] if current else loaded.rates.get(row.part_id, "monthly")
        urgency = tiers.Urgency(current["urgency"]) if current else tiers.Urgency.NORMAL
        loaded.missing.append((row, schedule, urgency, misses))
        return 0

    def _flush(self, conn, loaded: _Batch, now: datetime) -> None:
        with conn.cursor() as cursor:
            if loaded.offers:
                cursor.executemany(
                    """
                    INSERT INTO supply_offers (listing_id, fetched_at, stock, incoming, moq, order_multiple, packaging, price_breaks,
                                        currency, lead_time_days, lifecycle, discontinued, rohs, marketplace, product_url, reach_affected,
                                        reel_size, packaging_inferred, price_up_to)
                    VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (listing_id) DO UPDATE SET
                        fetched_at = EXCLUDED.fetched_at, stock = EXCLUDED.stock, incoming = EXCLUDED.incoming,
                        moq = EXCLUDED.moq, order_multiple = EXCLUDED.order_multiple, packaging = EXCLUDED.packaging,
                        price_breaks = EXCLUDED.price_breaks, currency = EXCLUDED.currency,
                        lead_time_days = EXCLUDED.lead_time_days, lifecycle = EXCLUDED.lifecycle,
                        discontinued = EXCLUDED.discontinued, rohs = EXCLUDED.rohs, marketplace = EXCLUDED.marketplace,
                        product_url = EXCLUDED.product_url, reach_affected = EXCLUDED.reach_affected,
                        reel_size = EXCLUDED.reel_size, packaging_inferred = EXCLUDED.packaging_inferred,
                        price_up_to = EXCLUDED.price_up_to
                    """,
                    loaded.offers,
                )
            if loaded.samples:
                cursor.executemany(
                    """
                    INSERT INTO supply_samples (listing_id, sampled_at, stock, incoming_qty, lead_time_days,
                                         lifecycle, discontinued, marketplace, moq, order_multiple)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (listing_id, sampled_at) DO NOTHING
                    """,
                    loaded.samples,
                )
            if loaded.seen:
                cursor.executemany("UPDATE supply_listings SET packaging = %s, last_seen_at = %s WHERE id = %s", loaded.seen)
        # --- derive: urgency once per part, from the batch's offers as written ---
        stock_of: dict[str, int] = {}
        states = []
        for row, lifecycle, last_change in loaded.read:
            if row.part_id not in stock_of:
                stock_of[row.part_id] = stock.part_stock(conn, row.part_id).total
            urgency = self._urgency(conn, loaded, row, lifecycle, last_change, stock_of[row.part_id], now)
            states.append(self._state(row, loaded.rates.get(row.part_id, "monthly"), urgency, now, last_change, 0))
        states += [self._state(row, schedule, urgency, now, row.last_change_at, misses) for row, schedule, urgency, misses in loaded.missing]
        # --- schedule ---
        if states:
            with conn.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO supply_poll_state (listing_id, tier, urgency, next_poll_at, last_polled_at, last_change_at,
                                            error_streak, missing_streak, last_error_code)
                    VALUES (%s, %s, %s, %s, %s, %s, 0, %s, '')
                    ON CONFLICT (listing_id) DO UPDATE SET
                        tier = EXCLUDED.tier, urgency = EXCLUDED.urgency, next_poll_at = EXCLUDED.next_poll_at,
                        last_polled_at = EXCLUDED.last_polled_at, last_change_at = EXCLUDED.last_change_at, error_streak = 0,
                        missing_streak = EXCLUDED.missing_streak, last_error_code = ''
                    """,
                    states,
                )

    # --- derive and schedule ----------------------------------------------

    def _urgency(self, conn, loaded: _Batch, row: Listing, lifecycle: Lifecycle, last_change: datetime | None, total: int,
                 now: datetime) -> tiers.Urgency:
        watch = loaded.watches.get(row.part_id)
        rupture = None
        if watch is not None:
            if row.part_id not in self._rupture:
                insight = parts_view.insight_from(parts_view.history(conn, row.part_id, now), watch["threshold"], now)
                self._rupture[row.part_id] = insights.rupture_expected_within(insight)
            rupture = self._rupture[row.part_id]
        return tiers.urgency(tiers.UrgencyInputs(
            now=now,
            pinned=bool(watch and watch["pinned"]),
            lifecycle=lifecycle,
            total_stock=total,
            threshold=watch["threshold"] if watch else None,
            last_change_at=last_change,
            rupture_days=rupture,
        ))

    def _state(self, row: Listing, schedule: str, urgency: tiers.Urgency, now: datetime, last_change: datetime | None, missing: int) -> tuple:
        # A listing that is merely missing is asked again within the hour, not on its schedule; a calm one waits longer (``tiers.stretch``).
        when = (
            now + min(tiers.interval(schedule), timedelta(hours=1)) if missing
            else tiers.next_poll_at(
                now, schedule, part_key=row.part_id, account_key=self._account, reset_time=self._reset[0], tz=self._reset[1],
                stretch=tiers.stretch(schedule, urgency, last_change, now),
            )
        )
        return (row.id, schedule, int(urgency), when, now, last_change, missing)


def _note_changes(conn, row: Listing, offer: Offer, previous, stocked_before: str | None) -> None:
    """Write an event for what a reading shows that the one before did not: a lifecycle change, a distributor that stops
    stocking the part normally, a jump in the smallest order. Nothing is written for a first reading."""

    def event(kind: str, payload: dict) -> None:
        conn.execute(
            "INSERT INTO supply_events (kind, part_id, listing_id, payload) VALUES (%s, %s, %s, %s::jsonb)",
            (kind, row.part_id, row.id, json.dumps({"sku": row.sku, **payload})),
        )

    if previous is not None and previous["lifecycle"] != offer.lifecycle.value and "unknown" not in (previous["lifecycle"], offer.lifecycle.value):
        event("lifecycle_changed", {"from": previous["lifecycle"], "to": offer.lifecycle.value})
    now_stocked = dict(offer.facts).get("normally_stocking")
    if stocked_before == "Yes" and now_stocked == "No":
        event("normally_stocking_lost", {})
    if previous is not None and previous["moq"] >= 1 and offer.moq >= 2 * previous["moq"]:
        event("moq_jump", {"from": previous["moq"], "to": offer.moq})
