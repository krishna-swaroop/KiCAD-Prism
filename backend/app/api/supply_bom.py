"""Looking a bill of materials up in the supply data, and watching its parts.

Readers (admin, designer, qa) look lines up; nothing here calls a distributor. Watching the
parts on a BOM needs write access (admin, designer). Only admin and qa can name a manufacturer
Prism does not know yet, so a designer's lines with an unknown manufacturer are skipped and
reported, not created.
"""

from __future__ import annotations

import base64
from functools import partial
from typing import Any

from fastapi import APIRouter, Depends

from app.api import supply_connectors
from app.api._helpers import get_project_for_role_or_404
from app.api.supply_access import is_approver
from app.api.supply_bom_models import (
    SHEET_MAX_BYTES,
    BomWatched,
    BomWatchPreview,
    ComponentStandings,
    LineIn,
    LookupRequest,
    SheetRequest,
    SheetRows,
    StatusRequest,
    SupplyBomLookup,
    UsageBuild,
    UsageRefreshed,
    WatchRequest,
)
from app.api.supply_call import run_supply
from app.core.security import AuthenticatedUser, require_supply_reader, require_supply_tracker, require_supply_writer
from app.services.supply import admission, bom_lookup, catalog_read, clock, project_bom, project_supply, spreadsheet, usage
from app.services.supply.inventory import levels

router = APIRouter(prefix="/api/supply/bom", tags=["supply"])
_run = partial(run_supply, invalid="invalid_request")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


def _lines(items: list[LineIn]) -> list[bom_lookup.BomLine]:
    return [bom_lookup.BomLine(item.key, item.manufacturer, item.mpn, item.quantity, item.prism_id, item.lcsc, item.value, item.footprint) for item in items]


def _lcsc_connector() -> str | None:
    """The one usable LCSC connector, or None when there is none or there are several."""

    found = [
        connector["id"] for connector in supply_connectors.service.list()
        if connector["provider"] == bom_lookup.LCSC_PROVIDER and connector["enabled"] and not connector["paused_reason"]
    ]
    return found[0] if len(found) == 1 else None


@router.post("/usage/refresh", response_model=UsageRefreshed)
async def refresh_usage(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, int]:
    """Read where parts are used from the projects' existing semantic indexes. Builds none, so it is cheap."""

    def run() -> dict[str, int]:
        # Imported here so the supply API loads without the project services in tests that do not need them.
        from app.services import project_service
        from app.services.workspace_service import workspace

        # Every project, whatever its folder allows: usage is a cache, and reads filter by the caller's role.
        rows = workspace.get_all_projects(None)
        projects = [project_service._workspace_row_to_project(row) for row in rows]
        visible = {
            row["id"]: [role for role in usage.ALL_ROLES if workspace._is_folder_visible(row, role)]
            for row in rows
        }
        with _store().connection() as conn:
            return usage.refresh(
                conn, projects, project_bom.existing_index, clock.now(), visible, catalog_read.identities,
            )

    return await _run(run)


# One request queues at most this many projects, so a large workspace is read over a few clicks, not all at once.
MAX_BUILDS_PER_REQUEST = 25


@router.post("/usage/build", response_model=UsageBuild)
async def build_usage(writer: AuthenticatedUser = Depends(require_supply_writer)) -> dict[str, int]:
    """Queue the semantic index of projects that have none, so their BOMs can be read.

    Each is an ordinary index job: the worker does them one at a time, and one already queued or
    running is not queued again. Reading usage afterwards picks the finished ones up.
    """

    def run() -> dict[str, int]:
        from app.services import project_service
        from app.services.workspace_service import workspace

        rows = workspace.get_all_projects(None)
        missing = []
        for row in rows:
            if project_bom.existing_index(project_service._workspace_row_to_project(row)) is None:
                missing.append(str(row["id"]))
        queued = 0
        for project_id in missing[:MAX_BUILDS_PER_REQUEST]:
            project_bom.queue_index(project_id, requested_by=writer.email)
            queued += 1
        return {"projects": len(rows), "missing": len(missing), "queued": queued}

    return await _run(run)


@router.post("/components-status", response_model=ComponentStandings, response_model_exclude_unset=True)
async def components_status(body: StatusRequest, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Where each catalog component stands, for the catalog table: distributor status, stock and price, and its stores state
    (``stores``; ``local_available`` is its available figure). Without stores data, components with no distributor data are left out."""

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            items = bom_lookup.standing_of(conn, _lines(body.components))
            stores = levels.stores_state(conn, [line.key for line in body.components])
        for key, state in stores.items():
            items.setdefault(key, {"status": "unknown", "stock": None, "watched": False, "unit_price": None, "currency": "", "restriction": None})
            items[key]["local_available"] = state["available"]
            items[key]["stores"] = state
        return {"items": items}

    return await _run(read)


@router.post("/lookup", response_model=SupplyBomLookup, response_model_exclude_unset=True)
async def lookup(body: LookupRequest, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    """Stock, price and status of the BOM's lines for a build, with the build and spares it was priced for."""

    if body.project_id:
        get_project_for_role_or_404(body.project_id, user.role)
    spares = body.attrition_percent if "attrition_percent" in body.model_fields_set else project_supply.DEFAULT

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            _tracked, build_quantity, attrition_percent = project_supply.build_of(conn, body.project_id, body.build_quantity, spares, fallback_build=1)
            found = bom_lookup.lookup(
                conn, _lines(body.lines), build_quantity, attrition_percent, identities=catalog_read.identities,
                in_library=catalog_read.in_library,
            )
        return {**found, "build_quantity": build_quantity, "attrition_percent": attrition_percent}

    return await _run(read)


def _watching(body: WatchRequest, actor: str, approver: bool):
    lcsc = _lcsc_connector() if any(line.lcsc for line in body.lines) else None

    def change(conn) -> dict[str, Any]:
        return bom_lookup.watch_lines(
            conn, _lines(body.lines), actor, may_create_manufacturer=approver,
            identities=catalog_read.identities, lcsc_connector=lcsc, tier=body.tier, rate=body.rate,
        )

    return change


@router.post("/watch/preview", response_model=BomWatchPreview, response_model_exclude_unset=True)
async def preview_watch(body: WatchRequest, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """What tracking these lines at a tier would cost each distributor's budget. Changes nothing."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            report = admission.preview(conn, _watching(body, user.email, is_approver(user)))
        return {key: value for key, value in report.items() if key != "result"} | {"watched": report["result"]}

    return await _run(run)


@router.post("/watch", response_model=BomWatched, response_model_exclude_unset=True)
async def watch(body: WatchRequest, user: AuthenticatedUser = Depends(require_supply_tracker)) -> dict[str, Any]:
    """Track these lines where there is room. Refused when nothing fits at any distributor."""

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            report = admission.apply(conn, _watching(body, user.email, is_approver(user)))
        return {**report["result"], "connectors": report["connectors"], "fits_nowhere": report["fits_nowhere"]}

    return await _run(run)


SHEET_MAX_UNPACKED = 40 * 1024 * 1024


@router.post("/sheet", response_model=SheetRows)
async def read_sheet(body: SheetRequest, _user: AuthenticatedUser = Depends(require_supply_reader)) -> SheetRows:
    """The first sheet of an uploaded Excel BOM as rows of text. Nothing is stored."""

    def run() -> SheetRows:
        try:
            data = base64.b64decode(body.xlsx_base64, validate=True)
        except ValueError:
            raise ValueError("The Excel file did not arrive intact.") from None
        return SheetRows(rows=spreadsheet.first_sheet_rows(data, max_bytes=SHEET_MAX_BYTES, max_unpacked=SHEET_MAX_UNPACKED))

    return await _run(run)
