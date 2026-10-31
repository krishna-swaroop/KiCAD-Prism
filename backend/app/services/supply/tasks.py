"""Periodic work that needs no distributor call: exchange rates, catalogues, snapshots, learned spellings, component
main parts, tracked projects' BOMs, tracking, packaging picks, insights, forecasts, rollups, retention, inventory sources,
account keys and finished jobs.

Each task is a row of ``supply_task_runs`` with when it last ran, last worked and last failed, and when it is due next. The
scanner queues one ``supply_tasks`` job when any is due (``jobs.py``); the job runs the due ones in order, each in its own
transaction, so one that fails (the ECB unreachable, the catalog down) is recorded and logged and the rest go on, and no
task holds another's rows. A task is claimed by moving its next run forward before it starts, so two workers never run it
twice.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable

from app.services.supply import clock
from app.services.supply.store import SupplyStore

logger = logging.getLogger(__name__)
MAX_ERROR = 500


@dataclass(frozen=True, slots=True)
class Task:
    name: str
    every: timedelta
    run: Callable[[Any, datetime, SupplyStore], None]


def _rates(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import fx

    fx.refresh_from_ecb(conn)


def _catalogues(conn, now: datetime, store: SupplyStore) -> None:
    """Published catalogues standing in for offers files (``jlc_catalogue``)."""

    from app.services.supply import csv_import_service

    csv_import_service.refresh_catalogues(conn, now)


def _market(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import market

    market.snapshot(conn)


def _costs(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import project_supply

    project_supply.snapshot_costs(conn, now)


def _figures(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import dashboard

    dashboard.snapshot_figures(conn)


def _aliases(conn, now: datetime, store: SupplyStore) -> None:
    """A spelling two or more parts of one maker carry becomes that maker's (``settle.learn_aliases``): one pass over every
    spelling, so it runs here rather than after each search."""

    from app.services.supply import settle

    settle.learn_aliases(conn)


def _component_mains(conn, now: datetime, store: SupplyStore) -> None:
    """Keep each component's main part on its current revision, so a watched component whose maker or number changed follows
    its new part (``component_watches``). Setting a component watch syncs its component at once too."""

    from app.services.supply import component_parts, tracking

    if component_parts.sync_main(conn)["changed"]:
        tracking.recompute(conn)


def _project_boms(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import project_bom

    project_bom.refresh_tracked(conn, now)


def _tracking(conn, now: datetime, store: SupplyStore) -> None:
    """Add the parts a tracked project's newest BOM brought, and keep the tiers in line."""

    from app.services.supply import tracking

    tracking.sync_projects(conn)


def _packagings(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import packaging_auto

    packaging_auto.auto_pick(conn)


def _insights(conn, now: datetime, store: SupplyStore) -> None:
    """Renew the facts the Dashboard and Insights list, then say what the alerts that read them say now."""

    from app.services.supply import alerts, part_insights

    alerts.evaluate_parts(conn, part_insights.renew(conn), now)


def _forecast_checks(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply.forecast import run as forecast_run

    forecast_run.run_checks(conn)


def _rollups(conn, now: datetime, store: SupplyStore) -> None:
    """The tracked parts' summaries and tracked projects' rollups a change made stale."""

    from app.services.supply import parts_view, project_supply

    parts_view.tracked_states(conn)
    project_supply.refresh_rollups(conn)


def _retention(conn, now: datetime, store: SupplyStore) -> None:
    from app.services.supply import oneoff, retention

    retention.compact_samples(conn, now)
    retention.drop_expired(conn, now)
    retention.drop_unused(conn, now)
    retention.trim_summaries(conn, now)
    oneoff.expire(conn, now)


def _inventory(conn, now: datetime, store: SupplyStore) -> None:
    """The local inventory sources that are due. A source that fails keeps its stock, marked stale (``inventory.sync``)."""

    from app.services.supply import credentials
    from app.services.supply.inventory import sync as inventory_sync

    inventory_sync.sync_due(store, credentials.default_keyring_factory())


def _account_keys(conn, now: datetime, store: SupplyStore) -> None:
    """Account keys are hashes under the credential keyring's current key: after it rotates, work them out again so an account
    does not split (``ConnectorService.refresh_account_keys``)."""

    from app.services.supply.connectors import ConnectorService

    ConnectorService(store).refresh_account_keys()


def _finished_jobs(conn, now: datetime, store: SupplyStore) -> None:
    """The scanner queues jobs many times a day; finished ones older than a week go."""

    from app.services.job_service import jobs as job_service
    from app.services.supply import jobs

    for kind in (jobs.POLL_JOB_KIND, jobs.TASKS_JOB_KIND):
        job_service.prune_finished(kind, older_than_seconds=7 * 24 * 60 * 60)


_TEN_MINUTES = timedelta(minutes=10)
# In the order they run: each one's change marks are seen by what the next one keeps (``freshness``).
TASKS: tuple[Task, ...] = (
    Task("rates", _TEN_MINUTES, _rates),
    Task("catalogues", _TEN_MINUTES, _catalogues),
    Task("market", _TEN_MINUTES, _market),
    Task("costs", _TEN_MINUTES, _costs),
    Task("figures", _TEN_MINUTES, _figures),
    Task("aliases", _TEN_MINUTES, _aliases),
    Task("component_mains", timedelta(hours=1), _component_mains),
    Task("project_boms", _TEN_MINUTES, _project_boms),
    Task("tracking", _TEN_MINUTES, _tracking),
    Task("packagings", _TEN_MINUTES, _packagings),
    Task("insights", _TEN_MINUTES, _insights),
    Task("forecast_checks", _TEN_MINUTES, _forecast_checks),
    Task("rollups", _TEN_MINUTES, _rollups),
    Task("retention", _TEN_MINUTES, _retention),
    Task("inventory", timedelta(minutes=1), _inventory),
    Task("account_keys", _TEN_MINUTES, _account_keys),
    Task("finished_jobs", _TEN_MINUTES, _finished_jobs),
)
BY_NAME = {task.name: task for task in TASKS}


def due(conn, now: datetime) -> list[str]:
    """The tasks due now, in order. A task that never ran is due."""

    upcoming = {row["name"]: row["next_at"] for row in conn.execute("SELECT name, next_at FROM supply_task_runs").fetchall()}
    return [task.name for task in TASKS if upcoming.get(task.name) is None or upcoming[task.name] <= now]


def _claim(store: SupplyStore, task: Task, now: datetime, force: bool) -> bool:
    with store.connection() as conn:
        conn.execute("INSERT INTO supply_task_runs (name) VALUES (%s) ON CONFLICT DO NOTHING", (task.name,))
        claimed = conn.execute(
            "UPDATE supply_task_runs SET started_at = %s, next_at = %s WHERE name = %s AND (%s OR next_at IS NULL OR next_at <= %s) RETURNING name",
            (now, now + task.every, task.name, force, now),
        ).fetchone()
    return claimed is not None


def run_one(store: SupplyStore, name: str, now: datetime | None = None, *, force: bool = False) -> bool:
    """Run one task if it is due (or ``force``), in its own transaction. Returns whether it ran and worked."""

    task = BY_NAME[name]
    now = now or clock.now()
    if not _claim(store, task, now, force):
        return False
    try:
        with store.connection() as conn:
            task.run(conn, now, store)
    except Exception as exc:  # noqa: BLE001 - one task failing never stops the others; it is recorded and tried again when next due
        logger.warning("Supply task %s failed", name, exc_info=True)
        with store.connection() as conn:
            conn.execute(
                "UPDATE supply_task_runs SET last_error = %s, last_error_at = %s WHERE name = %s",
                (f"{type(exc).__name__}: {exc}"[:MAX_ERROR], clock.now(), name),
            )
        return False
    with store.connection() as conn:
        conn.execute("UPDATE supply_task_runs SET last_ok_at = %s, last_error = '' WHERE name = %s", (clock.now(), name))
    return True


def run_due(store: SupplyStore, now: datetime | None = None, *, force: bool = False) -> dict[str, bool]:
    """Run the tasks due now (every task with ``force``), in order. Returns each one's outcome."""

    now = now or clock.now()
    with store.connection() as conn:
        names = [task.name for task in TASKS] if force else due(conn, now)
    return {name: run_one(store, name, now, force=force) for name in names}


def state(conn) -> list[dict[str, Any]]:
    """Each task's last run, last success and last error, for the health view."""

    rows = {row["name"]: row for row in conn.execute("SELECT * FROM supply_task_runs").fetchall()}
    return [
        {
            "name": task.name,
            "every_seconds": int(task.every.total_seconds()),
            **{key: (rows[task.name][key].isoformat() if rows.get(task.name) and rows[task.name][key] else None)
               for key in ("started_at", "last_ok_at", "last_error_at", "next_at")},
            "last_error": rows[task.name]["last_error"] if rows.get(task.name) else "",
        }
        for task in TASKS
    ]
