"""Asking DigiKey for substitutes of a part.

DigiKey's substitutions call names parts it offers in place of a product number, each with its word for how close
(Direct, Upgrade). It is one call for one product, so it is not made for every part. It is made

* automatically, once, for a tracked part that is ending (NRND, last time buy, obsolete, or dropped by a distributor), from
  the committed budget at tier 1, and again only after ``FRESH_DAYS``;
* when a person asks for a part ("Ask DigiKey for substitutes"), from the interactive reserve, at most once an hour.

What DigiKey names is kept as ``asked`` suggestions (``alternates``) and shown in the part sheet beside the free ones. Nothing is
tracked or approved from it: a person decides.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.services.supply import alternates, clock, ledger, parts, trouble
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import match_key
from app.services.supply.providers import registry
from app.services.supply.providers.base import CAP_SUBSTITUTES, AuthError, Blocked, ProviderError, RateLimited, Unavailable
from app.services.supply.vocabulary import ENDING_LIFECYCLES
from app.services.supply import errors

ACTION = "part.substitutes"
FRESH_DAYS = 30
ASK_COOLDOWN = timedelta(hours=1)
MAX_AUTO_PER_RUN = 5

_STOPPED_TEXT = {
    "budget": "has used today's allowance for asking",
    "rate_limited": "is limiting requests",
    "auth_failed": "rejected its credentials",
    "unavailable": "did not answer",
    "inactive": "is disabled or paused",
    "cooling_down": "is cooling down after an error",
}


class TooSoon(errors.TooSoon):
    """The part's substitutes were asked for a short while ago."""


@dataclass(frozen=True, slots=True)
class Asked:
    found: int = 0
    stopped: str | None = None


def _spend(service, connector, now: datetime, *, interactive: bool) -> bool:
    if not connector["metered"]:
        return True
    return ledger.spend_call(
        service.store, connector, now=now, interactive=interactive, kind=ledger.KIND_OFFERS, purpose=None if interactive else "tier1",
    )


def _ask_one(service, connector, part_id: str, sku: str, now: datetime, provider: Any | None, *, interactive: bool) -> Asked:
    """One call for one product number; keeps what DigiKey names. ``stopped`` says why nothing was asked."""

    if not connector["enabled"] or connector["paused_reason"]:
        return Asked(stopped="inactive")
    if trouble.cooling_down(service.store, connector["id"], now):
        return Asked(stopped="cooling_down")
    if not _spend(service, connector, now, interactive=interactive):
        return Asked(stopped="budget")
    provider = provider or service.load_provider(connector["id"])
    try:
        named = provider.substitutes(sku)
    except AuthError:
        return Asked(stopped="auth_failed")
    except (RateLimited, Unavailable, Blocked) as exc:
        trouble.react(service, service.store, connector["id"], exc, now)
        return Asked(stopped=exc.code)
    except ProviderError:
        return Asked(stopped="unavailable")
    with service.store.connection() as conn:
        alternates.replace(conn, part_id, connector["provider"], named, now, origin="asked")
        write_audit(conn, "prism" if not interactive else "person", ACTION, part_id, {"found": len(named), "sku": sku}, subject_kind="part")
    return Asked(found=len(named))


def _listing_for(conn, part_id: str, connector_id: str) -> str | None:
    row = conn.execute(
        """
        SELECT l.sku FROM supply_listings l LEFT JOIN supply_offers o ON o.listing_id = l.id
        WHERE l.part_id = %s AND l.connector_id = %s AND supply_counted(l.match_state)
        ORDER BY o.fetched_at DESC NULLS LAST, l.sku LIMIT 1
        """,
        (part_id, connector_id),
    ).fetchone()
    return row["sku"] if row else None


def ask_now(
    service, part_id: str, actor: str, *, now: datetime | None = None, provider: Any | None = None, mouser_provider: Any | None = None,
) -> dict[str, Any]:
    """Ask every distributor that can for its substitutes of the part, now. One call each, from the interactive reserve."""

    actor = actor_text(actor)
    now = now or clock.now()
    store = service.store
    with store.connection() as conn:
        parts.get_part(conn, part_id)
        last = conn.execute(
            "SELECT MAX(at) AS at FROM supply_audit_events WHERE action = %s AND subject_id = %s", (ACTION, part_id)
        ).fetchone()["at"]
        if last is not None and now - last < ASK_COOLDOWN:
            minutes = max(1, int((ASK_COOLDOWN - (now - last)).total_seconds() // 60) + 1)
            raise TooSoon(f"Substitutes were asked for a moment ago. You can ask again in {minutes} {'minute' if minutes == 1 else 'minutes'}.")
        connector_ids = [
            row["connector_id"] for row in conn.execute(
                "SELECT DISTINCT connector_id FROM supply_listings WHERE part_id = %s AND supply_counted(match_state)", (part_id,)
            ).fetchall()
        ]
    found = asked = 0
    problems: list[dict[str, str]] = []
    for connector_id in connector_ids:
        connector = service.get(connector_id)
        if CAP_SUBSTITUTES not in registry.get_spec(connector["provider"]).capabilities:
            continue
        with store.connection() as conn:
            sku = _listing_for(conn, part_id, connector_id)
        if sku is None:
            continue
        result = _ask_one(service, connector, part_id, sku, now, provider, interactive=True)
        if result.stopped:
            name = connector["display_name"]
            problems.append({"connector": name, "reason": f"{name} {_STOPPED_TEXT.get(result.stopped, 'could not be asked')}."})
            continue
        asked += 1
        found += result.found
    if asked:
        with store.connection() as conn:
            write_audit(conn, actor, ACTION + ".asked", part_id, {"found": found}, subject_kind="part")
    named, more = resolve_numbers(service, part_id, now=now, provider=mouser_provider)
    problems.extend(more)
    return {"asked": asked, "found": found, "resolved": named, "problems": problems}


def resolve_numbers(service, part_id: str, *, now: datetime, provider: Any | None = None) -> tuple[int, list[dict[str, str]]]:
    """Give a distributor's suggestion, named by its own number (Mouser's), the part number it stands for: one read of that number, from the
    interactive reserve. Returns how many were resolved and what stopped the rest."""

    resolved = 0
    problems: list[dict[str, str]] = []
    with service.store.connection() as conn:
        pending = {
            row["connector_id"]: (row["name"], alternates.unresolved(conn, part_id, row["provider"]))
            for row in conn.execute(
                "SELECT DISTINCT ON (l.connector_id) l.connector_id, c.provider, c.display_name AS name "
                "FROM supply_listings l JOIN supply_connectors c ON c.id = l.connector_id WHERE l.part_id = %s AND supply_counted(l.match_state) AND c.provider = 'mouser'",
                (part_id,),
            ).fetchall()
        }
    for connector_id, (name, skus) in pending.items():
        connector = service.get(connector_id)
        reader = provider or service.load_provider(connector_id)
        for sku in skus:
            if not _spend(service, connector, now, interactive=True):
                problems.append({"connector": name, "reason": f"{name} {_STOPPED_TEXT['budget']}."})
                break
            try:
                offers = reader.get_offers([sku])
            except (RateLimited, Unavailable, Blocked, AuthError, ProviderError):
                problems.append({"connector": name, "reason": f"{name} {_STOPPED_TEXT['unavailable']}."})
                break
            if offers and offers[0].mpn and match_key(offers[0].mpn) != match_key(sku):
                with service.store.connection() as conn:
                    resolved += 1 if alternates.resolve(conn, part_id, connector["provider"], sku, offers[0].manufacturer, offers[0].mpn) else 0
    return resolved, problems


def due(conn, connector_id: str, now: datetime, limit: int = MAX_AUTO_PER_RUN) -> list[dict[str, Any]]:
    """Tracked parts that are ending, listed at this connector, whose substitutes were not asked for in the last ``FRESH_DAYS``."""

    return [dict(row) for row in conn.execute(
        """
        SELECT DISTINCT ON (p.id) p.id AS part_id, l.sku
        FROM supply_part_tiers pt JOIN supply_parts p ON p.id = pt.part_id
        JOIN supply_listings l ON l.part_id = p.id AND l.connector_id = %(connector)s AND supply_counted(l.match_state)
        JOIN supply_offers o ON o.listing_id = l.id
        WHERE EXISTS (
                SELECT 1 FROM supply_listings l2 JOIN supply_offers o2 ON o2.listing_id = l2.id
                WHERE l2.part_id = p.id AND supply_counted(l2.match_state) AND (o2.lifecycle = ANY(%(ending)s) OR o2.discontinued))
          AND NOT EXISTS (SELECT 1 FROM supply_audit_events a WHERE a.action = %(action)s AND a.subject_id = p.id AND a.at > %(since)s)
        ORDER BY p.id, o.fetched_at DESC
        LIMIT %(limit)s
        """,
        {"connector": connector_id, "ending": list(ENDING_LIFECYCLES), "action": ACTION, "since": now - timedelta(days=FRESH_DAYS), "limit": limit},
    ).fetchall()]


def run_due(service, connector_id: str, *, now: datetime | None = None, provider: Any | None = None, limit: int = MAX_AUTO_PER_RUN) -> int:
    """Ask for the substitutes of ending parts, a few a run, from the committed budget. Returns how many were asked."""

    now = now or clock.now()
    connector = service.get(connector_id)
    if CAP_SUBSTITUTES not in registry.get_spec(connector["provider"]).capabilities:
        return 0
    with service.store.connection() as conn:
        rows = due(conn, connector_id, now, limit)
    asked = 0
    for row in rows:
        result = _ask_one(service, connector, row["part_id"], row["sku"], now, provider, interactive=False)
        if result.stopped:
            break
        asked += 1
    return asked
