"""Replay the stock forecasts on past days, so a model has a track record before it is shown and a change to a model is measured first.

For each tracked part and each past day from ``--since``, the readings up to that day (and no later one) are given to the same code
that makes live forecasts, and the forecast is kept as if made that day. The checks then run as usual, against what really happened.
Stock-outs recorded later are not used (the outage models are left out), so a backtest is harder on the model than the live run.

    cd backend
    python scripts/forecast_backtest.py --since 2026-10-11
"""

from __future__ import annotations

import argparse
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.forecast import inputs, models, store  # noqa: E402
from app.services.supply.forecast import run as forecast_run  # noqa: E402

MIN_DAYS = 8


def _slice(holders: list[models.Holder], until: date) -> list[models.Holder]:
    cut = []
    for holder in holders:
        series = [(day, stock) for day, stock in holder.series if day <= until]
        if series:
            cut.append(models.Holder(holder.connector_id, holder.name, holder.provider, series, holder.quote_days, holder.weekly))
    return cut


def part(conn, part_id: str, since: date, now: datetime) -> int:
    """Make the stock forecasts of one part for every day from ``since`` to yesterday. Returns how many forecasts were kept."""

    holders = inputs.holders(conn, part_id, now, 200)
    if not holders:
        return 0
    quantity = inputs.default_quantity(conn, part_id)
    weekly = inputs.is_weekly(conn, part_id)
    kept = 0
    day = since
    yesterday = now.astimezone(timezone.utc).date() - timedelta(days=1)
    while day <= yesterday:
        cut = _slice(holders, day)
        found = models.stock_forecast(cut, {}, {}, quantity, weekly=weekly)
        if found.get("available"):
            run = found["runout"]
            if run:
                store.store(conn, "part", part_id, "runout", day, max(math.ceil(run["high"]), 1), model="backtest", median=run["median"],
                            low=run["low"], high=run["high"], probability=run["probability"], inputs={"backtest": True})
                kept += 1
            store.store(conn, "part", part_id, "out_4w", day, 28, model="backtest", probability=found["out_everywhere"][4], inputs={"backtest": True})
            for target, weeks in (("can_buy_4w", 4), ("can_buy_8w", 8)):
                store.store(conn, "part", part_id, target, day, weeks * 7, model="backtest", quantity=quantity,
                            probability=found["weeks"][weeks - 1], inputs={"backtest": True})
            kept += 3
        day += timedelta(days=1)
    return kept


def run(conn, since: date, now: datetime | None = None) -> dict[str, Any]:
    """Replay every tracked part from ``since``, check what is due and work the states out."""

    now = now or datetime.now(timezone.utc)
    kept = 0
    for row in conn.execute("SELECT part_id FROM supply_part_tiers").fetchall():
        kept += part(conn, row["part_id"], since, now)
    return {"kept": kept} | forecast_run.run_checks(conn, now)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--since", required=True, type=date.fromisoformat, help="first day to replay, YYYY-MM-DD")
    args = parser.parse_args()
    from app.services.supply.store import supply_store

    with supply_store.connection() as conn:
        print(run(conn, args.since))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
