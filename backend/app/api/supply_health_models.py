"""Response models for supply health (``supply_health``)."""

from __future__ import annotations

from typing import Optional, Union

from app.api.supply_models import SupplyModel


class ConnectorHealth(SupplyModel):
    connector_id: str
    name: str
    provider: str
    enabled: bool
    paused_reason: str
    calls_today: int
    interactive_calls_today: int
    budget: Optional[int]
    last_ok_at: Optional[str]
    last_error_code: str
    last_error_at: Optional[str]
    listings: int
    late: int
    failing: int
    late_by_hours: Union[int, float]
    oldest_read: Optional[str]


class TaskRun(SupplyModel):
    name: str
    every_seconds: int
    started_at: Optional[str]
    last_ok_at: Optional[str]
    last_error_at: Optional[str]
    next_at: Optional[str]
    last_error: str


class SupplyHealth(SupplyModel):
    """Calls against budget, errors and late reads per connector, and the periodic tasks' runs."""

    connectors: list[ConnectorHealth]
    tasks: list[TaskRun]
