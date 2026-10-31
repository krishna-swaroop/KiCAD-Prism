"""Tracking: which projects, parts and library components Prism follows, at what tier, and what that costs the call budget. The one
way to follow something: a project, a part (by id, or by manufacturer and number when Prism has no part for it yet), or a component.

Anyone who reads supply data sees it, and the same people (administrators, designers and QA) change it. Every change can be previewed first:
a preview does exactly what the change would and rolls it back, so the figures shown are the figures that follow.
"""

from __future__ import annotations

from functools import partial
from typing import Any, Callable

from fastapi import APIRouter, Depends, Response

from app.api import supply_connectors
from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_admin, require_supply_reader, require_supply_tracker
from app.api.supply_access import is_approver
from app.api.supply_call import run_supply
from app.api.supply_models import Items
from app.api.supply_tracking_models import (
    BomRead, BudgetConnector, BuildIn, ComponentFollow, ComponentFollowIn, FollowIn, FollowNumberIn, LineChoiceIn, NumberFollowed, PartFollowed,
    PartTrackingState, ProjectIn, ProjectOpen, ProjectTrackingPreview, ProjectTrackingState, ScheduleIn, ScheduleSettings, TrackingPreview,
    TrackingRoom, TrackProgress, UsualBuild,
)
from app.services.supply import admission, budget_view, clock, component_watches, parts, project_bom, room, tracking, usage, watches
from app.services.supply import settings as supply_settings
from app.services.supply.progress import job_progress

router = APIRouter(prefix="/api/supply/tracking", tags=["supply"])
_run = partial(run_supply, invalid="invalid_request")
budget_router = APIRouter(prefix="/api/supply", tags=["supply"])


def _store():
    return supply_connectors.service.store


def _read_project_bom(conn, project_id: str) -> str:
    """Read the project's BOM into usage from its semantic index, when it is not there or has changed."""

    from app.services import project_service
    from app.services.supply import catalog_read
    from app.services.workspace_service import workspace

    row = next((item for item in workspace.get_all_projects(None) if str(item["id"]) == project_id), None)
    if row is None:
        raise ValueError("This project does not exist.")
    visible = [role for role in usage.ALL_ROLES if workspace._is_folder_visible(row, role)]
    return usage.refresh_one(
        conn, project_service._workspace_row_to_project(row), project_bom.existing_index,
        clock.now(), visible, catalog_read.identities,
    )


def _track(project_id: str, body: ProjectIn, actor: str) -> Callable[[Any], Any]:
    def change(conn) -> dict[str, Any]:
        _read_project_bom(conn, project_id)
        return tracking.track_project(conn, project_id, body.variants, actor, connector_ids=body.connector_ids, all_variants=body.all_variants, packaging=body.packaging, build_quantity=body.build_quantity, spares=body.spares)

    return change


@router.get("/projects/{project_id}/open", response_model=ProjectOpen)
async def project_open(project_id: str, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """What the project waits on a person for."""

    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return tracking.project_open(conn, project_id)

    return await _run(read)


@router.get("/projects/{project_id}/progress", response_model=TrackProgress)
async def project_progress(project_id: str, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """How far the first searches of the project's parts have got, per distributor."""

    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return tracking.project_progress(conn, project_id)

    return await _run(read)


@router.post("/projects/{project_id}/lines/choose", status_code=204)
async def choose_line(project_id: str, body: LineChoiceIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    """Say which of several parts a BOM line's maker spelling names."""

    get_project_for_role_or_404(project_id, user.role)

    def run() -> None:
        with _store().connection() as conn:
            tracking.choose_line(conn, body.part_id, body.manufacturer, user.email)

    await _run(run)


@router.get("/projects/{project_id}", response_model=ProjectTrackingState)
async def project_state(project_id: str, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            tracked = tracking.tracked_project(conn, project_id)
            has_usage = conn.execute("SELECT 1 FROM supply_bom_usage_projects WHERE project_id = %s", (project_id,)).fetchone() is not None
            return {
                "tracked": {**tracked, "tracked_at": tracked["tracked_at"].isoformat()} if tracked else None,
                "has_usage": has_usage,
                "variants": usage.project_variants(conn, project_id) if has_usage else [],
            }

    return await _run(read)


@router.post("/projects/{project_id}/read", response_model=BomRead, response_model_exclude_unset=True)
async def read_project_bom(project_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Read the project's BOM now, as a job's progress: ``running`` while its newest revision has no index yet (one is
    queued and read later), else ``done`` with ``changed`` when the parts differ."""

    get_project_for_role_or_404(project_id, user.role)

    def run() -> dict[str, Any]:
        found = project_bom._workspace_projects([project_id])  # noqa: SLF001 - the same lookup the poll job uses
        if not found:
            raise ValueError("This project does not exist.")
        project, roles = found[0]
        with _store().connection() as conn:
            status = project_bom.read(conn, project, roles, clock.now())
        if status == "reading":
            return job_progress("running", total=1)
        return job_progress("done", done=1, total=1, changed=status == "updated")

    return await _run(run)


@router.put("/projects/{project_id}/build", response_model=UsualBuild)
async def keep_usual_build(project_id: str, body: BuildIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Keep a build size as the tracked project's usual build."""

    get_project_for_role_or_404(project_id, user.role)

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return tracking.set_usual_build(conn, project_id, body.build_quantity, user.email)

    return await _run(run)


@router.post("/projects/{project_id}/preview", response_model=ProjectTrackingPreview, response_model_exclude_unset=True)
async def preview_project(project_id: str, body: ProjectIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            report = admission.preview(conn, _track(project_id, body, user.email))
        return {key: value for key, value in report.items() if key != "result"} | {"tracked": report["result"]}

    return await _run(run)


@router.put("/projects/{project_id}", response_model=ProjectTrackingPreview, response_model_exclude_unset=True)
async def track_project(project_id: str, body: ProjectIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            report = admission.apply(conn, _track(project_id, body, user.email))
        return {key: value for key, value in report.items() if key != "result"} | {"tracked": report["result"]}

    return await _run(run)


@router.delete("/projects/{project_id}", status_code=204)
async def untrack_project(project_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    get_project_for_role_or_404(project_id, user.role)

    def run() -> None:
        with _store().connection() as conn:
            tracking.untrack_project(conn, project_id, user.email)

    await _run(run)


def _watch_dto(record: watches.WatchRecord | None) -> dict[str, Any] | None:
    if record is None:
        return None
    return {
        "part_id": record.part_id, "manufacturer": record.manufacturer_name, "mpn": record.mpn, "tier": record.tier, "rate": record.rate,
        "threshold": record.threshold, "pinned": record.pinned, "packaging": record.packaging, "owner": record.owner,
    }


@router.get("/parts/{part_id}", response_model=PartTrackingState)
async def part_state(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            waiting = [
                row["connector_id"] for row in conn.execute(
                    "SELECT connector_id FROM supply_admissions WHERE part_id = %s AND state = 'waiting' ORDER BY connector_id", (part_id,)
                ).fetchall()
            ]
            return {"tier": tracking.tier_of(conn, part_id), "waiting_at": waiting, "watch": _watch_dto(watches.watch_of(conn, part_id))}

    return await _run(read)


@router.post("/parts", response_model=NumberFollowed)
async def follow_number(body: FollowNumberIn, response: Response, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Follow a library part by its manufacturer and number, for a number Prism has no part for yet. Following one already followed
    keeps that and applies what was sent on top; a tier sent here only raises. 201 when the part was not followed."""

    changes = body.changes()

    def run() -> tuple[dict[str, Any], bool]:
        with _store().connection() as conn:
            record, created = watches.add_watch(
                conn, body.manufacturer, body.mpn, user.email, threshold=changes.get("threshold"), pinned=bool(changes.get("pinned", False)),
                packaging=changes.get("packaging", "any"), tier=changes.get("tier"), rate=changes.get("rate"),
                may_create_manufacturer=is_approver(user),
            )
            return {"watch": _watch_dto(record), "tier": tracking.tier_of(conn, record.part_id)}, created

    result, created = await _run(run)
    response.status_code = 201 if created else 200
    return result


@router.post("/parts/{part_id}/preview", response_model=TrackingPreview, response_model_exclude_unset=True)
async def preview_part(part_id: str, body: FollowIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            report = admission.preview(conn, lambda c: watches.follow(c, part_id, user.email, **body.changes()))
        return {key: value for key, value in report.items() if key != "result"}

    return await _run(run)


@router.put("/parts/{part_id}", response_model=PartFollowed, response_model_exclude_unset=True)
async def follow_part(part_id: str, body: FollowIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Follow a part, or change how: its tier and rate, stock threshold, pin and packaging. Only the fields sent change."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            report = admission.apply(conn, lambda c: watches.follow(c, part_id, user.email, **body.changes()))
            return {
                **{key: value for key, value in report.items() if key != "result"},
                "tier": tracking.tier_of(conn, part_id), "watch": _watch_dto(watches.watch_of(conn, part_id)),
            }

    return await _run(run)


@router.delete("/parts/{part_id}", status_code=204)
async def stop_tracking_part(part_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> None:
    def run() -> None:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            watches.stop_tracking(conn, part_id, user.email)

    await _run(run)


@router.get("/components/{component_id}", response_model=ComponentFollow)
async def component_state(component_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Whether a library component is followed: Prism then follows whichever part is its main part."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"watch": component_watches.get(conn, component_id)}

    return await _run(read)


@router.put("/components/{component_id}", response_model=ComponentFollow)
async def follow_component(component_id: str, body: ComponentFollowIn, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Follow a library component's main part, now and after its revision names another. Sending it again changes the options."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"watch": component_watches.set_watch(conn, component_id, user.email, packaging=body.packaging, tier=body.tier, rate=body.rate)}

    return await _run(run)


@router.delete("/components/{component_id}", status_code=204)
async def stop_following_component(component_id: str, user: AuthenticatedUser = Depends(require_supply_tracker)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            component_watches.remove_watch(conn, component_id, user.email)

    await _run(run)
    return Response(status_code=204)


@budget_router.get("/budget", response_model=Items[BudgetConnector])
async def budget(user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Where each connector's call budget goes, today and over two weeks, and what tracking costs. Everyone who reads supply may see it;
    projects the caller may not see are not named."""

    visible = await _run(lambda: usage.visible_project_ids(user.role))

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": budget_view.view(conn, clock.now(), visible)}

    return await _run(read)


@budget_router.get("/room", response_model=TrackingRoom)
async def tracking_room(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """How many more typical parts tracking has room for, per distributor and overall (``room.py``)."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return room.view(conn, clock.now())

    return await _run(read)


@budget_router.get("/schedule", response_model=ScheduleSettings)
async def get_schedule(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Which spare work is on. Spare budget is the calls nothing else needs, at any hour."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return supply_settings.to_dto(supply_settings.load(conn), ("schedule",))

    return await _run(read)


@budget_router.put("/schedule", response_model=ScheduleSettings)
async def put_schedule(body: ScheduleIn, user: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return supply_settings.to_dto(supply_settings.save(conn, {"schedule": body.model_dump()}, user.email), ("schedule",))

    return await _run(run)
