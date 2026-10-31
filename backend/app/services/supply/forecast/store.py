"""Forecasts as Prism keeps them: stored when made, checked when their day comes, and shown only while the model has earned it.

A forecast is a range (a low, a most likely and a high value, 10% to 90%) or a chance. Prism keeps every one it makes
(``forecasts``), and when the day it was about arrives it compares with what happened (``forecast_checks``). From the checks
each model (``forecast_models``) is in one of three states:

* ``learning``: fewer checks than it needs, or its ranges miss too often. Shown greyed and labelled, never in an alert.
* ``shown``: enough checks, and its 80% ranges hold the truth 72% to 88% of the time (a chance is off by no more than 10 points).
* ``paused``: it was shown, and its last 30 checks fell outside that.

Nothing here predicts demand: a fall in stock is not consumption, and build plans belong to the manufacturing branch.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Mapping, Sequence

from app.services.supply import clock

LEARNING, SHOWN, PAUSED = "learning", "shown", "paused"
RANGE, CHANCE = "range", "chance"
KEEP_DAYS = 365
RECENT_CHECKS = 200
PAUSE_WINDOW = 30
COVERAGE_BAND = (0.72, 0.88)
CALIBRATION_GAP = 0.10


@dataclass(frozen=True, slots=True)
class Target:
    kind: str
    min_checks: int
    label: str


# What is predicted, how it is scored, and how many checks it needs before it is shown.
TARGETS: dict[str, Target] = {
    "runout": Target(RANGE, 40, "Runout date"),
    "back_in": Target(RANGE, 30, "Back in stock"),
    "out_4w": Target(CHANCE, 60, "Out everywhere within 4 weeks"),
    "can_buy_4w": Target(CHANCE, 60, "Can be bought in 4 weeks"),
    "can_buy_8w": Target(CHANCE, 60, "Can be bought in 8 weeks"),
    "price_30": Target(RANGE, 40, "Price in 30 days"),
    "price_90": Target(RANGE, 40, "Price in 90 days"),
    "lead_90": Target(RANGE, 30, "Lead time in 3 months"),
    "eol_12": Target(CHANCE, 30, "End-of-life change within 12 months"),
}

_WORDS = ((0.9, "Almost certain"), (0.7, "Likely"), (0.4, "Uncertain"), (0.1, "Unlikely"))


def chance_word(probability: float) -> str:
    """The one scale of words every screen uses for a chance."""

    for floor, word in _WORDS:
        if probability >= floor:
            return word
    return "Very unlikely"


def chance_percent(probability: float) -> int:
    return int(round(probability * 100))


# --- storing ---------------------------------------------------------------


def store(
    conn, subject_kind: str, subject_id: str, target: str, made_on: date, horizon_days: int, *, model: str, scope: str = "",
    quantity: int | None = None, median: float | None = None, low: float | None = None, high: float | None = None,
    probability: float | None = None, inputs: Mapping[str, Any] | None = None, version: int = 1,
) -> int | None:
    """Keep one forecast. A second one for the same subject, target and day replaces the first (and its check, if any)."""

    if target not in TARGETS:
        raise ValueError(f"Unknown forecast target: {target}")
    row = conn.execute(
        """
        INSERT INTO supply_forecasts (subject_kind, subject_id, scope, target, made_on, horizon_days, quantity, median, low, high, probability, model, model_version, inputs)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (subject_kind, subject_id, scope, target, made_on) DO UPDATE SET
            horizon_days = EXCLUDED.horizon_days, quantity = EXCLUDED.quantity, median = EXCLUDED.median, low = EXCLUDED.low,
            high = EXCLUDED.high, probability = EXCLUDED.probability, model = EXCLUDED.model, model_version = EXCLUDED.model_version,
            inputs = EXCLUDED.inputs
        RETURNING id
        """,
        (subject_kind, subject_id, scope, target, made_on, horizon_days, quantity, median, low, high, probability, model, version, json.dumps(dict(inputs or {}))),
    ).fetchone()
    conn.execute("DELETE FROM supply_forecast_checks WHERE forecast_id = %s", (row["id"],))
    return int(row["id"])


def kept_part(conn, part_id: str, day: date, quantity: int) -> dict[str, Any] | None:
    """The part's forecast as kept for its sheet, while it is ``day``'s, at ``quantity``, and nothing it is made from has changed
    since (``freshness``). None otherwise: the caller works it out again."""

    from app.services.supply import freshness

    row = conn.execute(
        f"SELECT f.data FROM supply_part_forecasts f WHERE f.part_id = %s AND f.made_on = %s AND f.quantity = %s "
        f"AND NOT {freshness.stale_sql('forecast', 'ARRAY[f.part_id]', 'f')}",
        (part_id, day, quantity),
    ).fetchone()
    return row["data"] if row else None


def keep_part(conn, part_id: str, day: date, quantity: int, seen: tuple[str, int], data: Mapping[str, Any]) -> None:
    """Keep a part's forecast for its sheet, worked out from what was read after ``seen`` (``freshness.seen``). A reader that finds
    another keeping it leaves that one to finish rather than wait."""

    from app.services.supply import freshness

    if conn.execute(
        "SELECT 1 FROM supply_part_forecasts WHERE part_id = %s FOR UPDATE SKIP LOCKED", (part_id,)
    ).fetchone() is None and conn.execute("SELECT 1 FROM supply_part_forecasts WHERE part_id = %s", (part_id,)).fetchone():
        return
    conn.execute(
        f"""
        INSERT INTO supply_part_forecasts (part_id, made_on, quantity, data, computed_at, seen, snap, own)
        VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, {freshness.OWN_SQL})
        ON CONFLICT (part_id) DO UPDATE SET made_on = EXCLUDED.made_on, quantity = EXCLUDED.quantity, data = EXCLUDED.data,
            computed_at = EXCLUDED.computed_at, seen = EXCLUDED.seen, snap = EXCLUDED.snap, own = EXCLUDED.own
        """,
        (part_id, day, quantity, json.dumps(data), clock.now(), seen[0], seen[1]),
    )


def forget_old(conn, today: date) -> int:
    """Drop forecasts older than a year."""

    return conn.execute("DELETE FROM supply_forecasts WHERE made_on < %s", (today - timedelta(days=KEEP_DAYS),)).rowcount


# --- checking --------------------------------------------------------------


def due(conn, today: date, limit: int = 2000) -> list[dict[str, Any]]:
    """Forecasts whose day has come and that have no check yet, oldest first."""

    return [dict(row) for row in conn.execute(
        """
        SELECT f.* FROM supply_forecasts f LEFT JOIN supply_forecast_checks c ON c.forecast_id = f.id
        WHERE c.forecast_id IS NULL AND f.made_on + f.horizon_days <= %s ORDER BY f.made_on LIMIT %s
        """,
        (today, limit),
    ).fetchall()]


def record_check(conn, forecast_id: int, today: date, *, observed: float | None, inside: bool | None, void: bool = False) -> None:
    conn.execute(
        "INSERT INTO supply_forecast_checks (forecast_id, checked_on, observed, inside, void) VALUES (%s, %s, %s, %s, %s) "
        "ON CONFLICT (forecast_id) DO UPDATE SET checked_on = EXCLUDED.checked_on, observed = EXCLUDED.observed, inside = EXCLUDED.inside, void = EXCLUDED.void",
        (forecast_id, today, observed, inside, void),
    )


# --- the track record ------------------------------------------------------


def verdict(kind: str, rows: Sequence[Mapping[str, Any]]) -> tuple[bool, float | None]:
    """Whether these checks (newest first) say the model holds, and its score: coverage for a range, 1 less the calibration gap for a chance."""

    if not rows:
        return False, None
    if kind == RANGE:
        coverage = sum(1 for row in rows if row["inside"]) / len(rows)
        return COVERAGE_BAND[0] <= coverage <= COVERAGE_BAND[1], coverage
    gap = abs(statistics.fmean(float(row["probability"]) for row in rows) - statistics.fmean(float(row["observed"]) for row in rows))
    return gap <= CALIBRATION_GAP, 1 - gap


def _checks(conn, target: str) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(
        """
        SELECT f.probability, c.observed, c.inside FROM supply_forecast_checks c JOIN supply_forecasts f ON f.id = c.forecast_id
        WHERE f.target = %s AND NOT c.void ORDER BY f.made_on DESC, f.id DESC LIMIT %s
        """,
        (target, RECENT_CHECKS),
    ).fetchall()]


def update_models(conn, now: datetime | None = None) -> dict[str, str]:
    """Work each model's state out again from its checks. Returns the state of each target."""

    now = now or clock.now()
    states: dict[str, str] = {}
    for name, target in TARGETS.items():
        rows = _checks(conn, name)
        before = conn.execute("SELECT state, since FROM supply_forecast_models WHERE target = %s", (name,)).fetchone()
        was = before["state"] if before else LEARNING
        holds, score = verdict(target.kind, rows)
        if len(rows) < target.min_checks:
            state, reason = LEARNING, f"{len(rows)} of {target.min_checks} checks"
            if was == SHOWN:
                state, reason = SHOWN, "" if holds else reason
        elif holds:
            state, reason = SHOWN, ""
        elif was in (SHOWN, PAUSED):
            recent_holds, _ = verdict(target.kind, rows[:PAUSE_WINDOW])
            state = SHOWN if recent_holds and was == SHOWN else PAUSED
            reason = "" if state == SHOWN else _miss_text(target.kind, score)
        else:
            state, reason = LEARNING, _miss_text(target.kind, score)
        since = before["since"] if before and before["state"] == state and before["since"] else (now if state == SHOWN else None)
        conn.execute(
            """
            INSERT INTO supply_forecast_models (target, state, checks, coverage, since, reason, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (target) DO UPDATE SET state = EXCLUDED.state, checks = EXCLUDED.checks, coverage = EXCLUDED.coverage,
                since = EXCLUDED.since, reason = EXCLUDED.reason, updated_at = EXCLUDED.updated_at
            """,
            (name, state, len(rows), score, since, reason, now),
        )
        states[name] = state
    return states


def _miss_text(kind: str, score: float | None) -> str:
    if score is None:
        return ""
    if kind == RANGE:
        return f"Its 80% ranges held {chance_percent(score)}% of the time"
    return f"Its chances were off by {chance_percent(1 - score)} points"


def model_states(conn) -> dict[str, dict[str, Any]]:
    """Every target with its state, checks needed and score. A target never worked out is learning with zero checks."""

    found = {row["target"]: dict(row) for row in conn.execute("SELECT * FROM supply_forecast_models").fetchall()}
    result = {}
    for name, target in TARGETS.items():
        row = found.get(name) or {}
        result[name] = {
            "target": name, "label": target.label, "kind": target.kind, "state": row.get("state", LEARNING),
            "checks": int(row.get("checks", 0)), "needs": target.min_checks, "score": row.get("coverage"),
            "since": row["since"].isoformat() if row.get("since") else None, "reason": row.get("reason", ""),
        }
    return result


def reliability(conn, target: str, bins: int = 5) -> list[dict[str, Any]]:
    """For a chance target: what it said against what happened, in bins of said probability."""

    if TARGETS[target].kind != CHANCE:
        return []
    rows = _checks(conn, target)
    out = []
    for index in range(bins):
        low, high = index / bins, (index + 1) / bins
        inside = [row for row in rows if low <= float(row["probability"]) < high or (index == bins - 1 and float(row["probability"]) == 1.0)]
        if inside:
            out.append({
                "said": round(statistics.fmean(float(row["probability"]) for row in inside), 3),
                "happened": round(statistics.fmean(float(row["observed"]) for row in inside), 3), "cases": len(inside),
            })
    return out


def track_record(conn) -> dict[str, Any]:
    states = model_states(conn)
    return {"models": list(states.values()), "reliability": {name: reliability(conn, name) for name, target in TARGETS.items() if target.kind == CHANCE}}


def shown(states: Mapping[str, Mapping[str, Any]], target: str) -> bool:
    return states.get(target, {}).get("state") == SHOWN
