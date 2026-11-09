"""Compliance API: RoHS and REACH standing of a part, declared substances, and the ECHA Candidate List.

Everyone who can read supply data sees a part's standing. Admin and designer declare substances. Only an
administrator loads the Candidate List.
"""

from __future__ import annotations

import base64
from functools import partial
from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api import supply_connectors
from app.api.supply_call import run_supply
from app.api.supply_compliance_models import Declaration, LoadList, SupplyCompliance, SupplySvhcList
from app.core.security import AuthenticatedUser, require_admin, require_supply_reader, require_supply_writer
from app.services.supply import compliance, facts, parts

router = APIRouter(prefix="/api/supply", tags=["supply"])
_run = partial(run_supply, invalid="invalid_compliance")


def _store():
    # Resolved per call so a replaced connector service (tests) brings its own store.
    return supply_connectors.service.store


@router.get("/compliance/svhc", response_model=SupplySvhcList)
async def svhc_list_info(_user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return compliance.list_info(conn)

    return await _run(read)


@router.post("/compliance/svhc", response_model=SupplySvhcList)
async def load_svhc_list(body: LoadList, admin: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    def run() -> dict[str, Any]:
        if bool(body.csv) == bool(body.xlsx_base64):
            raise ValueError("Send the list as CSV text or as an Excel file.")
        text = body.csv
        if body.xlsx_base64:
            try:
                data = base64.b64decode(body.xlsx_base64, validate=True)
            except ValueError:
                raise ValueError("The Excel file did not arrive intact.") from None
            text = compliance.csv_from_xlsx(data)
        with _store().connection() as conn:
            return compliance.load_list(conn, text, body.source_name, admin.email)

    return await _run(run)


@router.get("/parts/{part_id}/compliance", response_model=SupplyCompliance)
async def part_compliance(part_id: str, _user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            part = parts.get_part(conn, part_id)
            offers = compliance.rohs_flags(conn, [part.id])[part.id]
            substances = compliance.declared(conn, part.id)
            listed = [item["listed_as"] for item in substances if item["listed_as"]]
            return {
                "rohs": compliance.rohs_standing(offers, facts.rohs_stated(conn, [part.id]).get(part.id, [])),
                "reach": compliance.standing(offers, listed),
                "substances": substances,
                "exemptions": compliance.exemptions(conn, [part.id]).get(part.id, []),
                "list": compliance.list_info(conn),
                "facts": facts.for_part(conn, part.id, hide=facts.NOT_COMPLIANCE),
            }

    return await _run(read)


@router.post("/parts/{part_id}/substances", status_code=204)
async def declare_substance(part_id: str, body: Declaration, writer: AuthenticatedUser = Depends(require_supply_writer)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            compliance.declare(conn, part_id, body.cas, body.note, writer.email)

    await _run(run)
    return Response(status_code=204)


class Exemption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=24)
    note: str = Field(default="", max_length=200)


@router.post("/parts/{part_id}/exemptions", status_code=204)
async def add_exemption(part_id: str, body: Exemption, writer: AuthenticatedUser = Depends(require_supply_writer)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            compliance.add_exemption(conn, part_id, body.code, body.note, writer.email)

    await _run(run)
    return Response(status_code=204)


@router.delete("/parts/{part_id}/exemptions/{code}", status_code=204)
async def remove_exemption(part_id: str, code: str, writer: AuthenticatedUser = Depends(require_supply_writer)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            compliance.remove_exemption(conn, part_id, code, writer.email)

    await _run(run)
    return Response(status_code=204)


@router.delete("/parts/{part_id}/substances/{cas}", status_code=204)
async def undeclare_substance(part_id: str, cas: str, writer: AuthenticatedUser = Depends(require_supply_writer)) -> Response:
    def run() -> None:
        with _store().connection() as conn:
            parts.get_part(conn, part_id)
            compliance.remove_declaration(conn, part_id, cas, writer.email)

    await _run(run)
    return Response(status_code=204)
