"""The workspace's supply settings: one typed section each, kept in ``supply_settings`` one row per section. Absent means the defaults.

- ``assessment``: what the checks weigh (``assessment/settings.py`` holds its rules, labels and ranges).
- ``pricing``: the base currency, the quantity lists price at, and the preferred distributors.
- ``alerts``: the price rise and the chance of running out that raise an alert.
- ``spares``: what a costing orders on top of the boards' need.
- ``schedule``: which spare work is on (spare budget is the calls nothing else needs, see ``quota.free_allowance``).

Every reader takes what it needs from ``load`` (one query). The settings page edits assessment, pricing, alerts and spares as one
flat form (``to_dto``, ``save_form``); the budget page edits the schedule. Changes are audited per section.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Callable, Mapping

from app.services.supply import clock
from app.core.config import settings as deployment
from app.services.supply.assessment import settings as assessment_rules
from app.services.supply.assessment.settings import AssessmentSettings
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Refused

PRICE_QUANTITY_RANGE = (1, 1_000_000)
SPARES_RANGE = (0, 100)
ALERT_PRICE_RISE_RANGE = (1, 500)
ALERT_LIKELY_OUT_RANGE = (50, 99)
SPARES_MODES = ("flat", "package")
# In the order spare budget is spent: parts waiting for room, then tier-2 parts ahead of their time, then notices of untracked parts,
# then matching the library's parts nothing follows (``library_match``).
SPARE_KINDS = ("waiting", "tier2_early", "notices", "library")


@dataclass(frozen=True, slots=True)
class Pricing:
    # Prices in other currencies are converted to this one to be compared and totalled. The deployment chooses the one a workspace
    # starts in (SUPPLY_BASE_CURRENCY).
    base_currency: str = "EUR"
    # The quantity lists and price history price at, unless a part has its own (``price_quantity``).
    quantity: int = 100
    # Price the BOM at the preferred distributor when it holds enough stock for the build, else at the cheapest (Altium's preferred suppliers).
    prefer_distributors: bool = False
    # Connector ids, most preferred first. A part's own preferred distributor comes before them.
    distributor_order: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Alerts:
    # The cheapest price rising by this many percent is the ``price_up`` finding, and the forecast's chance of running out within four
    # weeks the ``likely_out`` one (and the Insights list of parts likely out); a part's own rule wins (``alert_rules``).
    price_rise_percent: int = 20
    likely_out_percent: int = 70


@dataclass(frozen=True, slots=True)
class Spares:
    # "flat" is ``percent`` for every part; "package" is by kind of part (``attrition.py``: ``small_passives`` for 01005 to 0603
    # passives, ``others`` for the rest).
    mode: str = "flat"
    percent: float = 0.0
    small_passives: float = 2.0
    others: float = 0.0

    def default_attrition(self) -> float | None:
        """The spares a costing asks for unless told otherwise, as ``bom_lookup.lookup`` takes them: a percent, or None for by package."""

        return None if self.mode == "package" else self.percent

    def table(self) -> Mapping[str, float]:
        """Spares by kind of part, for a costing by package."""

        return {"small_passive": self.small_passives, "other": self.others}


@dataclass(frozen=True, slots=True)
class Schedule:
    spare: Mapping[str, bool] = field(default_factory=lambda: MappingProxyType({kind: True for kind in SPARE_KINDS}))

    def kinds(self) -> list[str]:
        """The spare work that is on, in the order spare budget is spent."""

        return [kind for kind in SPARE_KINDS if self.spare.get(kind, True)]


@dataclass(frozen=True, slots=True)
class Settings:
    assessment: AssessmentSettings = assessment_rules.DEFAULTS
    pricing: Pricing = Pricing()
    alerts: Alerts = Alerts()
    spares: Spares = Spares()
    schedule: Schedule = Schedule()


DEFAULTS = Settings(pricing=Pricing(base_currency=deployment.SUPPLY_BASE_CURRENCY))


class SettingsError(Refused):
    """The settings are not valid. The message is safe to show."""

    code = "invalid_settings"


def _whole(payload: Mapping, name: str, default: int, label: str, low: int, high: int) -> int:
    value = payload.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise SettingsError(f"{label} must be a whole number from {low} to {high}.")
    return value


def _percent(payload: Mapping, name: str, default: float, label: str) -> float:
    value = payload.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not SPARES_RANGE[0] <= value <= SPARES_RANGE[1]:
        raise SettingsError(f"{label} must be a percent from {SPARES_RANGE[0]} to {SPARES_RANGE[1]}.")
    return float(value)


# Each section in its stored (and form) shape: to it, from it, and checking a payload. The stored names are the form's.

def _pricing_dto(value: Pricing) -> dict:
    return {"base_currency": value.base_currency, "price_quantity": value.quantity, "prefer_distributors": value.prefer_distributors,
            "distributor_order": list(value.distributor_order)}


def _pricing_from(payload: Mapping) -> Pricing:
    base = DEFAULTS.pricing
    return Pricing(
        base_currency=str(payload.get("base_currency", base.base_currency)), quantity=int(payload.get("price_quantity", base.quantity)),
        prefer_distributors=bool(payload.get("prefer_distributors", base.prefer_distributors)),
        distributor_order=tuple(str(item) for item in payload.get("distributor_order", base.distributor_order)),
    )


def _pricing_check(payload: Mapping) -> dict:
    base = DEFAULTS.pricing
    currency = payload.get("base_currency", base.base_currency)
    if not isinstance(currency, str) or len(currency) != 3 or not currency.isalpha() or not currency.isupper():
        raise SettingsError("The base currency must be a three letter code in capitals, such as EUR.")
    prefer = payload.get("prefer_distributors", base.prefer_distributors)
    if not isinstance(prefer, bool):
        raise SettingsError("Preferring distributors is on or off.")
    order = payload.get("distributor_order", list(base.distributor_order))
    if not isinstance(order, list) or len(order) > 30 or any(not isinstance(item, str) or not item or len(item) > 64 for item in order) or len(set(order)) != len(order):
        raise SettingsError("The preferred distributors are a list of distributors, each once.")
    quantity = _whole(payload, "price_quantity", base.quantity, "The price quantity", *PRICE_QUANTITY_RANGE)
    return {"base_currency": currency, "price_quantity": quantity, "prefer_distributors": prefer, "distributor_order": order}


def _alerts_dto(value: Alerts) -> dict:
    return {"alert_price_rise_percent": value.price_rise_percent, "alert_likely_out_percent": value.likely_out_percent}


def _alerts_from(payload: Mapping) -> Alerts:
    base = DEFAULTS.alerts
    return Alerts(price_rise_percent=int(payload.get("alert_price_rise_percent", base.price_rise_percent)),
                  likely_out_percent=int(payload.get("alert_likely_out_percent", base.likely_out_percent)))


def _alerts_check(payload: Mapping) -> dict:
    base = DEFAULTS.alerts
    return {
        "alert_price_rise_percent": _whole(payload, "alert_price_rise_percent", base.price_rise_percent, "The price rise that raises an alert", *ALERT_PRICE_RISE_RANGE),
        "alert_likely_out_percent": _whole(payload, "alert_likely_out_percent", base.likely_out_percent, "The chance of running out that raises an alert", *ALERT_LIKELY_OUT_RANGE),
    }


def _spares_dto(value: Spares) -> dict:
    return {"spares_mode": value.mode, "spares_percent": value.percent, "spares_small_passives": value.small_passives, "spares_others": value.others}


def _spares_from(payload: Mapping) -> Spares:
    base = DEFAULTS.spares
    return Spares(
        mode=str(payload.get("spares_mode", base.mode)), percent=float(payload.get("spares_percent", base.percent)),
        small_passives=float(payload.get("spares_small_passives", base.small_passives)), others=float(payload.get("spares_others", base.others)),
    )


def _spares_check(payload: Mapping) -> dict:
    base = DEFAULTS.spares
    mode = payload.get("spares_mode", base.mode)
    if mode not in SPARES_MODES:
        raise SettingsError("Spares are one percent for every part or by kind of part.")
    return {
        "spares_mode": mode,
        "spares_percent": _percent(payload, "spares_percent", base.percent, "The spares"),
        "spares_small_passives": _percent(payload, "spares_small_passives", base.small_passives, "The spares for small passives"),
        "spares_others": _percent(payload, "spares_others", base.others, "The spares for other parts"),
    }


def _schedule_dto(value: Schedule) -> dict:
    return {"spare": {kind: bool(value.spare.get(kind, True)) for kind in SPARE_KINDS}}


def _schedule_from(payload: Mapping) -> Schedule:
    return Schedule(spare=MappingProxyType({kind: bool(payload["spare"].get(kind, True)) for kind in SPARE_KINDS}))


def _schedule_check(payload: Mapping) -> dict:
    spare = payload.get("spare")
    if not isinstance(spare, Mapping) or set(spare) - set(SPARE_KINDS) or any(not isinstance(spare.get(kind, True), bool) for kind in SPARE_KINDS):
        raise SettingsError("Spare work is on or off for each kind.")
    return {"spare": {kind: bool(spare.get(kind, True)) for kind in SPARE_KINDS}}


def _assessment_check(payload: Mapping) -> dict:
    try:
        return assessment_rules.validate(payload)
    except ValueError as exc:
        raise SettingsError(str(exc)) from exc


@dataclass(frozen=True, slots=True)
class Section:
    to_dto: Callable[[Any], dict]
    from_dto: Callable[[Mapping], Any]
    check: Callable[[Mapping], dict]


SECTIONS: Mapping[str, Section] = MappingProxyType({
    "assessment": Section(assessment_rules.to_dto, assessment_rules.from_dto, _assessment_check),
    "pricing": Section(_pricing_dto, _pricing_from, _pricing_check),
    "alerts": Section(_alerts_dto, _alerts_from, _alerts_check),
    "spares": Section(_spares_dto, _spares_from, _spares_check),
    "schedule": Section(_schedule_dto, _schedule_from, _schedule_check),
})
# The sections the settings page edits as one form.
FORM = ("assessment", "pricing", "alerts", "spares")


def load(conn) -> Settings:
    rows = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM supply_settings WHERE key = ANY(%s)", (list(SECTIONS),)).fetchall()}
    values = {}
    for name, section in SECTIONS.items():
        if name not in rows:
            continue
        try:
            values[name] = section.from_dto(section.check(rows[name]))
        except (ValueError, KeyError, TypeError, AttributeError):
            # A stored value that no longer fits must not stop every assessment, costing or budget: that section is the default.
            pass
    return Settings(**{name: values.get(name, getattr(DEFAULTS, name)) for name in SECTIONS})


def base_currency(conn) -> str:
    return load(conn).pricing.base_currency


def to_dto(value: Settings, names: tuple[str, ...] = FORM) -> dict:
    """The sections in their form shape, merged (the form's names are distinct across sections)."""

    merged: dict = {}
    for name in names:
        merged |= SECTIONS[name].to_dto(getattr(value, name))
    return merged


def validate_form(payload: Mapping) -> dict[str, dict]:
    """Each form section in its stored shape, or a SettingsError with a sentence a person can act on."""

    return {name: SECTIONS[name].check(payload) for name in FORM}


def _write(conn, name: str, value: dict, actor: str) -> None:
    conn.execute(
        """
        INSERT INTO supply_settings (key, value, updated_by, updated_at) VALUES (%s, %s::jsonb, %s, %s)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
        """,
        (name, json.dumps(value), actor, clock.now()),
    )


def _after_change(conn, before: Settings, after: Settings) -> None:
    """Prices kept in lists were worked out at the old quantity and base currency."""

    if (before.pricing.quantity, before.pricing.base_currency) != (after.pricing.quantity, after.pricing.base_currency):
        from app.services.supply import price_quantity  # it reads the default quantity from here

        price_quantity.forget(conn)


def save(conn, values: Mapping[str, Mapping], actor: str) -> Settings:
    """Store the given sections (each in its stored shape, checked again here); the others stay as they are."""

    actor = actor_text(actor)
    before = load(conn)
    for name, payload in values.items():
        section = SECTIONS[name]
        value = section.check(payload)
        old = section.to_dto(getattr(before, name))
        _write(conn, name, value, actor)
        if old != value:
            write_audit(conn, actor, f"settings.{name}", name, {"before": old, "after": value}, subject_kind="settings")
    after = load(conn)
    _after_change(conn, before, after)
    return after


def save_form(conn, payload: Mapping, actor: str) -> Settings:
    return save(conn, validate_form(payload), actor)


def reset(conn, actor: str, names: tuple[str, ...] = FORM) -> Settings:
    actor = actor_text(actor)
    before = load(conn)
    conn.execute("DELETE FROM supply_settings WHERE key = ANY(%s)", (list(names),))
    for name in names:
        write_audit(conn, actor, f"settings.{name}.reset", name, {}, subject_kind="settings")
    after = load(conn)
    _after_change(conn, before, after)
    return after
