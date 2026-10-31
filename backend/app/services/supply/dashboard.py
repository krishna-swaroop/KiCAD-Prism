"""The Dashboard's figures and charts, in one read. Reads only, except ``snapshot_figures``.

Every chart is a count over the parts Prism tracks, from the same summaries the Parts list shows and the facts kept in
``part_insights``, so a bar and the list it opens agree.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services.supply import alerts, clock, component_parts, ending_parts, part_insights, parts_view, risk_views, usage
from app.services.supply.forecast import views
from app.services.supply.vocabulary import Status

FIGURE_DAYS = 30
ALERT_DAYS = 30
COST_DAYS = 90
FIGURES = ("watched", "at_risk", "out_of_stock", "lifecycle", "open_alerts", "waiting")
STATUS_ORDER = (Status.OK.value, Status.WARNING.value, Status.ERROR.value, Status.FATAL.value, Status.UNKNOWN.value)


def _figures_now(conn, now: datetime, states: list[dict[str, Any]] | None = None) -> dict[str, int]:
    """The tiles: every tracked part counted (``states`` from ``parts_view.tracked_states``), the open alerts and the queued parts."""

    states = parts_view.tracked_states(conn) if states is None else states
    waiting = conn.execute("SELECT COUNT(DISTINCT part_id) AS n FROM supply_admissions WHERE state = 'waiting'").fetchone()["n"]
    return {"watched": len(states), **{name: sum(1 for state in states if parts_view.FILTERS[name](state)) for name in ("at_risk", "out_of_stock", "lifecycle")},
            "open_alerts": int(alerts.count_attention(conn, now)), "waiting": int(waiting)}


def snapshot_figures(conn, now: datetime | None = None) -> int:
    """Store today's figures unless they were stored already. Returns how many were written."""

    now = now or clock.now()
    today = now.date()
    if conn.execute("SELECT 1 FROM supply_figure_history WHERE day = %s LIMIT 1", (today,)).fetchone():
        return 0
    figures = _figures_now(conn, now)
    for metric, value in figures.items():
        conn.execute("INSERT INTO supply_figure_history (day, metric, value) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (today, metric, value))
    return len(figures)


def _figure_series(conn, today: date) -> dict[str, list[int]]:
    """Each figure's stored values over the last 30 days, oldest first."""

    series: dict[str, list[int]] = {name: [] for name in FIGURES}
    for row in conn.execute(
        "SELECT day, metric, value FROM supply_figure_history WHERE day >= %s ORDER BY day", (today - timedelta(days=FIGURE_DAYS),)
    ).fetchall():
        if row["metric"] in series:
            series[row["metric"]].append(int(row["value"]))
    return series


def _alerts_by_day(conn, today: date) -> list[dict[str, Any]]:
    """Alerts opened each day of the last 30, by kind."""

    rows = conn.execute(
        """
        SELECT (opened_at AT TIME ZONE 'UTC')::date AS day, kind, COUNT(*) AS n FROM supply_attention
        WHERE part_id IS NOT NULL AND kind = ANY(%s) AND opened_at IS NOT NULL AND opened_at >= %s GROUP BY 1, 2 ORDER BY 1
        """,
        (list(alerts.KINDS), datetime.combine(today - timedelta(days=ALERT_DAYS - 1), datetime.min.time(), tzinfo=timezone.utc)),
    ).fetchall()
    by_day: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = by_day.setdefault(row["day"].isoformat(), {"day": row["day"].isoformat()})
        entry[row["kind"]] = int(row["n"])
    return list(by_day.values())


def _project_costs(conn, today: date, visible: set[str] | None) -> list[dict[str, Any]]:
    """The cost of one board a day for each tracked project ``visible`` names (the base design), 90 days."""

    from app.services.supply import cost_history

    projects = [project for project in conn.execute(
        "SELECT DISTINCT h.project_id, COALESCE(u.project_name, h.project_id) AS project_name FROM supply_bom_cost_history h "
        "LEFT JOIN supply_bom_usage_projects u ON u.project_id = h.project_id WHERE h.variant = '' AND h.day >= %s ORDER BY 1",
        (today - timedelta(days=COST_DAYS),),
    ).fetchall() if visible is None or project["project_id"] in visible]
    series = cost_history.series_of(conn, [(project["project_id"], "") for project in projects], COST_DAYS)
    found: list[dict[str, Any]] = []
    for project in projects:
        kept, _left_out = series.get((project["project_id"], ""), ([], []))
        if kept:
            found.append({
                "project_id": project["project_id"], "project_name": project["project_name"], "currency": kept[-1]["currency"],
                "points": [[row["day"].isoformat(), float(row["cost_per_board"])] for row in kept],
            })
    return found


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def failing_feeds(conn) -> list[dict[str, Any]]:
    """Every enabled feed whose last read failed: stores sources, then distributor connectors, each with its last good read.

    While one fails its figures can no longer be told from "nothing there", so the Dashboard says so above everything else."""

    found: list[dict[str, Any]] = []
    if component_parts.library_present(conn):
        for row in conn.execute(
            """
            SELECT s.display_name, COALESCE(MAX(l.fetched_at::timestamptz), s.last_sync_at::timestamptz) AS since FROM inventory_sources s
            LEFT JOIN inventory_levels l ON l.source_id = s.id
            WHERE s.enabled AND s.last_status = 'error' GROUP BY s.id ORDER BY lower(s.display_name)
            """
        ).fetchall():
            found.append({"kind": "stores", "name": row["display_name"], "since": _iso(row["since"])})
    for row in conn.execute(
        """
        SELECT display_name, last_ok_at FROM supply_connectors
        WHERE enabled AND (paused_reason <> '' OR (last_error_at IS NOT NULL AND (last_ok_at IS NULL OR last_error_at > last_ok_at)))
        ORDER BY lower(display_name)
        """
    ).fetchall():
        found.append({"kind": "connector", "name": row["display_name"], "since": _iso(row["last_ok_at"])})
    return found


def build(conn, now: datetime | None = None, role: str | None = None) -> dict[str, Any]:
    """Everything the Dashboard page draws."""

    now = now or clock.now()
    visible = usage.visible_project_ids(role)
    # Every tracked part, uncapped: the tiles, charts and project rows are counts over all of them, from the kept summaries.
    items = parts_view.tracked_states(conn)
    figures = _figures_now(conn, now, items)
    series = _figure_series(conn, now.date())
    kept = {row["part_id"]: row for row in part_insights.read_all(conn)}
    statuses = Counter(item["status"] for item in items)
    runway: Counter[str] = Counter()
    holders: Counter[str] = Counter()
    for item in items:
        facts = kept.get(item["id"])
        if item["stock"] == 0:
            runway["out_now"] += 1
        elif facts is None:
            runway["few_readings"] += 1
        else:
            bucket = next((name for name in ("runs_out_2w", "runs_out_8w", "runs_out_later", "steady", "few_readings") if part_insights.KINDS[name](facts)), "few_readings")
            runway[bucket] += 1
        if item["stock"] is not None:
            count = (facts or {}).get("holders") if facts else None
            holders["none" if item["stock"] == 0 else "one" if count == 1 else "two" if count == 2 else "three_plus" if count else "unknown"] += 1
    tracked_ids = [item["id"] for item in items]
    return {
        "risk_grid": risk_views.risk_grid(items, kept),
        "deadlines": risk_views.deadlines(conn, tracked_ids, now.date()),
        "projects": parts_view.tracked_project_rows(conn, items, kept, role, visible=visible),
        "figures": figures,
        "ending_components": ending_parts.undecided_count(conn, items),
        "forecast": views.dashboard(conn, now.date()),
        "figure_history": series,
        "statuses": [{"status": status, "count": statuses.get(status, 0)} for status in STATUS_ORDER],
        "runway": {name: runway.get(name, 0) for name in ("out_now", "runs_out_2w", "runs_out_8w", "runs_out_later", "steady", "few_readings")},
        "holders": {name: holders.get(name, 0) for name in ("none", "one", "two", "three_plus", "unknown")},
        "alerts_by_day": _alerts_by_day(conn, now.date()),
        "project_costs": _project_costs(conn, now.date(), visible),
        "insights_ready": len(kept),
        "failing_feeds": failing_feeds(conn),
        # What an empty alert list says depends on these: no distributor yet, nothing tracked, nothing read yet.
        "connectors": int(conn.execute("SELECT COUNT(*) AS n FROM supply_connectors WHERE enabled").fetchone()["n"]),
        "no_data": statuses.get("unknown", 0),
        "recent_changes": alerts.recent_changes(conn, now, role=role),
    }
