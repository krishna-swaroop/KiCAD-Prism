"""System Builder HTTP API (``docs/system-builder/CONTRACTS.md`` §8).

SYS-04 covers systems, instances, port overrides, links, rows, history and
layout. Detection, reviews, validation, snapshots, ICD and CSV import follow
(SYS-06 to SYS-10).
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Callable, List, Literal, Optional, TypeVar

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.security import AuthenticatedUser, require_designer, require_viewer
from app.services.systems import csv_import
from app.services.systems import service as system_service
from app.services.systems.service import Caller, Result
from app.services.systems.store import MAX_ROWS, Conflict, Forbidden, Invalid, NotFound, StaleVersion
from app.services.systems.visibility import etag

router = APIRouter(dependencies=[Depends(require_viewer)])

T = TypeVar("T")
_IF_MATCH = re.compile(r'^"sys:([A-Za-z0-9_]+):([0-9]{1,18})"$')

Name = Field(min_length=1, max_length=200)


class CreateSystemRequest(BaseModel):
    name: str = Name
    description: str = Field(default="", max_length=4000)
    folderId: Optional[str] = None


class UpdateSystemRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    folderId: Optional[str] = None
    # Opt-in validation rules (CONTRACTS_P2 §8.4); the full list replaces the stored one.
    optionalRules: Optional[list[str]] = Field(default=None, max_length=8)


class CreateInstanceRequest(BaseModel):
    """A board (``projectId``) or, P2 §5.1, a catalog assembly (``componentId``)."""

    kind: Literal["board", "assembly"] = "board"
    projectId: Optional[str] = Field(default=None, min_length=1, max_length=200)
    label: str = Field(min_length=1, max_length=100)
    baselineCommit: Optional[str] = Field(default=None, max_length=40)
    trackedRef: Optional[str] = Field(default=None, max_length=200)
    pinned: bool = False
    componentId: Optional[str] = Field(default=None, min_length=1, max_length=200)
    revisionId: Optional[str] = Field(default=None, min_length=1, max_length=200)
    follow: Literal["pinned", "latest_released"] = "latest_released"


class UpdateInstanceRequest(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    pinned: Optional[bool] = None
    trackedRef: Optional[str] = Field(default=None, max_length=200)
    follow: Optional[Literal["pinned", "latest_released"]] = None


class OverrideRequest(BaseModel):
    state: Optional[Literal["hidden", "promoted"]]


class LinkEnd(BaseModel):
    """A board port (``portKey``) or a subsystem export (``exportId``, P2 §6.1)."""

    instanceId: str = Field(min_length=1, max_length=200)
    portKey: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    exportId: Optional[str] = Field(default=None, min_length=1, max_length=100)

    def key(self) -> str:
        return self.portKey or self.exportId or ""

    def as_end(self) -> dict:
        return {"instanceId": self.instanceId, "portKey": self.key()}


class CreateLinkRequest(BaseModel):
    a: LinkEnd
    b: LinkEnd
    name: str = Field(default="", max_length=200)
    harness: Optional[str] = Field(default=None, max_length=200)
    type: Literal["unspecified", "b2b"] = "unspecified"
    stackHeightMm: Optional[float] = Field(default=None, gt=0, lt=1000)


class UpdateLinkRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    harness: Optional[str] = Field(default=None, max_length=200)
    type: Optional[Literal["unspecified", "b2b"]] = None
    stackHeightMm: Optional[float] = Field(default=None, gt=0, lt=1000)


class CreateExportRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    instanceId: str = Field(min_length=1, max_length=200)
    portKey: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    childExportId: Optional[str] = Field(default=None, min_length=1, max_length=100)


class UpdateExportRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    instanceId: Optional[str] = Field(default=None, min_length=1, max_length=200)
    portKey: Optional[str] = Field(default=None, min_length=1, max_length=2000)


class RowRequest(BaseModel):
    id: Optional[str] = Field(default=None, max_length=100)
    pinA: str = Field(min_length=1, max_length=100)
    pinB: str = Field(min_length=1, max_length=100)
    signal: str = Field(default="", max_length=200)
    source: Literal["manual", "generator", "import"] = "manual"


class GenerateRequest(BaseModel):
    generator: Literal["identity", "reverse", "offset", "net_name"]
    options: dict[str, Any] = Field(default_factory=dict)


class DecisionRequest(BaseModel):
    decision: Literal["accept", "remap", "bind_candidate", "remove_rows"]
    payload: Optional[dict[str, Any]] = None


class RebaseRequest(BaseModel):
    """A board takes ``commit``; an assembly takes ``revisionId`` (P2 §7.1)."""

    commit: Optional[str] = Field(default=None, min_length=7, max_length=40)
    revisionId: Optional[str] = Field(default=None, min_length=1, max_length=200)


class SnapshotRequest(BaseModel):
    name: str = Name
    note: str = Field(default="", max_length=4000)


class PublishRequest(BaseModel):
    ipn: Optional[str] = Field(default=None, min_length=1, max_length=100)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    manufacturer: Optional[str] = Field(default=None, min_length=1, max_length=200)


class ImportMapRequest(BaseModel):
    columnMap: dict[str, str]
    boardMap: dict[str, str] = Field(default_factory=dict, max_length=500)
    delimiter: Optional[Literal[",", ";", "\t", "|"]] = None


class Position(BaseModel):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)


class LayoutRequest(BaseModel):
    positions: dict[str, Position]


def _caller(user: AuthenticatedUser) -> Caller:
    return Caller(role=user.role, email=user.email)


def _expected_version(request: Request, system_id: str) -> int:
    """§8: ``If-Match: "sys:<id>:<version>"``. Missing is 428; anything else stale is 412."""

    raw = request.headers.get("if-match")
    if not raw:
        raise HTTPException(status_code=428, detail="If-Match is required")
    match = _IF_MATCH.match(raw.strip())
    if not match or match.group(1) != system_id:
        return -1  # never current: the store answers 412 with the real version
    return int(match.group(2))


async def _run(system_id: Optional[str], call: Callable[[], T]) -> T:
    try:
        return await asyncio.to_thread(call)
    except StaleVersion as error:
        current = etag(system_id or "", error.current)
        raise HTTPException(
            status_code=412, detail="System has changed; reload it", headers={"ETag": current}
        ) from None
    except NotFound as error:
        message = str(error)
        raise HTTPException(
            status_code=404, detail=message if message.endswith("not found") else "Not found"
        ) from None
    except Conflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    except Invalid as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except Forbidden as error:
        raise HTTPException(status_code=403, detail=str(error)) from None


def _respond(result: Result, response: Response, status_code: int = 200) -> Any:
    response.headers["ETag"] = result.etag
    response.status_code = status_code
    return result.body


def _no_content(result: Result) -> Response:
    return Response(status_code=204, headers={"ETag": result.etag})


# ---------------------------------------------------------------------------
# Systems


@router.get("")
async def list_systems(user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(None, lambda: system_service.service.list_systems(_caller(user)))


@router.post("", dependencies=[Depends(require_designer)])
async def create_system(
    body: CreateSystemRequest, response: Response, user: AuthenticatedUser = Depends(require_viewer)
):
    result = await _run(None, lambda: system_service.service.create_system(
        _caller(user), name=body.name, description=body.description, folder_id=body.folderId,
    ))
    return _respond(result, response, 201)


@router.get("/{system_id}")
async def get_system(system_id: str, response: Response, user: AuthenticatedUser = Depends(require_viewer)):
    result = await _run(system_id, lambda: system_service.service.document(_caller(user), system_id))
    response.headers["Cache-Control"] = "private, no-cache"
    return _respond(result, response)


@router.patch("/{system_id}", dependencies=[Depends(require_designer)])
async def update_system(
    system_id: str, body: UpdateSystemRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    fields = {key: getattr(body, key) for key in body.model_fields_set}
    if fields.get("name", "") is None:
        raise HTTPException(status_code=422, detail="name cannot be null")
    if "description" in fields and fields["description"] is None:
        fields["description"] = ""
    if "optionalRules" in fields and fields["optionalRules"] is None:
        fields["optionalRules"] = []
    result = await _run(system_id, lambda: system_service.service.update_system(
        _caller(user), system_id, version, fields,
    ))
    return _respond(result, response)


@router.delete("/{system_id}", dependencies=[Depends(require_designer)])
async def delete_system(system_id: str, request: Request, user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    await _run(system_id, lambda: system_service.service.delete_system(_caller(user), system_id, version))
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Instances


@router.post("/{system_id}/instances", dependencies=[Depends(require_designer)])
async def add_instance(
    system_id: str, body: CreateInstanceRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    if body.kind == "assembly":
        if body.componentId is None or body.projectId is not None:
            raise HTTPException(status_code=422, detail="an assembly instance takes componentId, not projectId")
        result = await _run(system_id, lambda: system_service.service.add_catalog_instance(
            _caller(user), system_id, version, kind="assembly", label=body.label, component_id=body.componentId,
            revision_id=body.revisionId, follow=body.follow,
        ))
        return _respond(result, response, 201)
    if body.projectId is None:
        raise HTTPException(status_code=422, detail="a board instance takes projectId")
    result = await _run(system_id, lambda: system_service.service.add_instance(
        _caller(user), system_id, version, project_id=body.projectId, label=body.label,
        baseline_commit=body.baselineCommit, tracked_ref=body.trackedRef, pinned=body.pinned,
    ))
    return _respond(result, response, 201)


@router.patch("/{system_id}/instances/{instance_id}", dependencies=[Depends(require_designer)])
async def update_instance(
    system_id: str, instance_id: str, body: UpdateInstanceRequest, request: Request,
    response: Response, user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    fields = {key: getattr(body, key) for key in body.model_fields_set}
    for key in ("label", "pinned"):
        if key in fields and fields[key] is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
    result = await _run(system_id, lambda: system_service.service.update_instance(
        _caller(user), system_id, version, instance_id, fields,
    ))
    return _respond(result, response)


@router.delete("/{system_id}/instances/{instance_id}", dependencies=[Depends(require_designer)])
async def remove_instance(
    system_id: str, instance_id: str, request: Request,
    cascade: Optional[Literal["links"]] = Query(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.remove_instance(
        _caller(user), system_id, version, instance_id, cascade=cascade == "links",
    ))
    return _no_content(result)


@router.get("/{system_id}/nets")
async def list_nets(
    system_id: str, search: str = Query(default="", max_length=200),
    occurrence: Optional[str] = Query(default=None, max_length=2000),
    limit: int = Query(default=50, ge=1, le=500), user: AuthenticatedUser = Depends(require_viewer),
):
    """P2 §8.2: system nets matching ``search``, optionally on one board occurrence."""
    return await _run(system_id, lambda: system_service.service.nets(
        _caller(user), system_id, search=search, occurrence=occurrence, limit=limit,
    ))


@router.get("/{system_id}/nets/{group_id}")
async def get_net(system_id: str, group_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.net(_caller(user), system_id, group_id))


@router.get("/{system_id}/hierarchy")
async def get_hierarchy(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """P2 §11: the occurrence tree, redacted for the reader."""
    return await _run(system_id, lambda: system_service.service.hierarchy(_caller(user), system_id))


@router.get("/{system_id}/scene")
async def get_scene(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """P2 §20: every occurrence placed, with the board bundles that draw it."""
    return await _run(system_id, lambda: system_service.service.scene(_caller(user), system_id))


@router.get("/{system_id}/instances/{instance_id}/interface")
async def get_interface(
    system_id: str, instance_id: str, commit: Optional[str] = Query(default=None, max_length=40),
    user: AuthenticatedUser = Depends(require_viewer),
):
    state, body = await _run(system_id, lambda: system_service.service.interface(
        _caller(user), system_id, instance_id, commit,
    ))
    if state == "queued":
        return JSONResponse(status_code=202, content=body)
    return body


@router.post("/{system_id}/instances/{instance_id}/check", dependencies=[Depends(require_designer)])
async def check_instance(
    system_id: str, instance_id: str, user: AuthenticatedUser = Depends(require_viewer),
):
    body = await _run(system_id, lambda: system_service.service.check_now(
        _caller(user), system_id, instance_id,
    ))
    return JSONResponse(status_code=202, content=body)


@router.put(
    "/{system_id}/instances/{instance_id}/ports/{port_key:path}/override",
    dependencies=[Depends(require_designer)],
)
async def set_port_override(
    system_id: str, instance_id: str, port_key: str, body: OverrideRequest, request: Request,
    response: Response, user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.set_override(
        _caller(user), system_id, version, instance_id, port_key, body.state,
    ))
    return _respond(result, response)


# ---------------------------------------------------------------------------
# Mating frames (CONTRACTS_P2 §15.3)


class MatingRequest(BaseModel):
    mode: Literal["confirmed", "override"]
    axis: Optional[Literal["top", "bottom", "+x", "-x", "+y", "-y"]] = None
    quarterTurns: Optional[int] = Field(default=None, ge=0, le=3)


@router.get("/{system_id}/instances/{instance_id}/mating")
async def get_mating(system_id: str, instance_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.mating(_caller(user), system_id, instance_id))


@router.put("/{system_id}/instances/{instance_id}/mating/{port_key:path}", dependencies=[Depends(require_designer)])
async def set_mating(
    system_id: str, instance_id: str, port_key: str, body: MatingRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    fields = body.model_dump()
    result = await _run(system_id, lambda: system_service.service.set_mating(
        _caller(user), system_id, version, instance_id, port_key, fields,
    ))
    return _respond(result, response)


@router.delete("/{system_id}/instances/{instance_id}/mating/{port_key:path}", dependencies=[Depends(require_designer)])
async def clear_mating(
    system_id: str, instance_id: str, port_key: str, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.set_mating(
        _caller(user), system_id, version, instance_id, port_key, None,
    ))
    return _respond(result, response)


# ---------------------------------------------------------------------------
# Poses (CONTRACTS_P2 §14.3)


class PoseRequest(BaseModel):
    translationMm: list[float] = Field(min_length=3, max_length=3)
    rotation: list[float] = Field(min_length=4, max_length=4, description="quaternion x, y, z, w")


@router.get("/{system_id}/poses")
async def get_poses(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.poses(_caller(user), system_id))


@router.put("/{system_id}/poses/{instance_id}", dependencies=[Depends(require_designer)])
async def set_pose(
    system_id: str, instance_id: str, body: PoseRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    fields = body.model_dump()
    result = await _run(system_id, lambda: system_service.service.set_pose(
        _caller(user), system_id, version, instance_id, fields,
    ))
    return _respond(result, response)


@router.delete("/{system_id}/poses/{instance_id}", dependencies=[Depends(require_designer)])
async def clear_pose(
    system_id: str, instance_id: str, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.set_pose(
        _caller(user), system_id, version, instance_id, None,
    ))
    return _respond(result, response)


@router.delete("/{system_id}/poses", dependencies=[Depends(require_designer)])
async def reset_poses(
    system_id: str, request: Request, response: Response, user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.reset_poses(_caller(user), system_id, version))
    return _respond(result, response)


# ---------------------------------------------------------------------------
# Harnesses (CONTRACTS_P2 §17.3)


class HarnessEndRequest(BaseModel):
    instanceId: Optional[str] = Field(default=None, min_length=1, max_length=200)
    portKey: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    pinCount: Optional[int] = Field(default=None, ge=1, le=1000)


class CreateHarnessRequest(BaseModel):
    name: str = Field(default="Harness", min_length=1, max_length=200)
    label: Optional[str] = Field(default=None, max_length=200)
    ends: list[HarnessEndRequest] = Field(default_factory=lambda: [HarnessEndRequest()], min_length=1, max_length=32)
    identity: bool = False


class UpdateHarnessRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    label: Optional[str] = Field(default=None, max_length=200)
    cutLengthMm: Optional[float] = Field(default=None, gt=0)
    serviceAllowancePct: Optional[float] = Field(default=None, ge=0, le=100)


class MatesRequest(BaseModel):
    instanceId: str = Field(min_length=1, max_length=200)
    portKey: str = Field(min_length=1, max_length=2000)


class PartRequest(BaseModel):
    componentId: str = Field(min_length=1, max_length=200)


class UpdateHarnessEndRequest(BaseModel):
    mates: Optional[MatesRequest] = None
    pinMap: Optional[dict[str, str]] = None
    bootMm: Optional[float] = Field(default=None, ge=0)
    # A catalog part for the mating block, or null for Generic (CONTRACTS_P2 §17.2, SB2-18).
    part: Optional[PartRequest] = None


class WirePointRequest(BaseModel):
    end: str = Field(min_length=1, max_length=100)
    pin: str = Field(min_length=1, max_length=100)


class WireRequest(BaseModel):
    id: Optional[str] = Field(default=None, max_length=100)
    source: WirePointRequest = Field(alias="from")
    target: WirePointRequest = Field(alias="to")
    signal: str = Field(default="", max_length=200)
    gaugeAwg: Optional[int] = Field(default=None, ge=0, le=40)
    colour: Optional[str] = Field(default=None, max_length=40)
    label: Optional[str] = Field(default=None, max_length=100)

    model_config = ConfigDict(populate_by_name=True)

    def as_input(self) -> dict:
        return {"id": self.id, "from": self.source.model_dump(), "to": self.target.model_dump(), "signal": self.signal,
                "gaugeAwg": self.gaugeAwg, "colour": self.colour, "label": self.label}


class GenerateWiresRequest(BaseModel):
    fromEnd: str = Field(min_length=1, max_length=100)
    toEnd: str = Field(min_length=1, max_length=100)
    generator: Literal["identity", "reverse", "offset", "net_name"]
    options: dict[str, Any] = Field(default_factory=dict)


class HarnessFromLabelRequest(BaseModel):
    label: str = Field(min_length=1, max_length=200)


@router.get("/{system_id}/harnesses")
async def list_harnesses(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.list_harnesses(_caller(user), system_id))


@router.post("/{system_id}/harnesses", dependencies=[Depends(require_designer)])
async def create_harness(system_id: str, body: CreateHarnessRequest, request: Request, response: Response,
                         user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    fields = body.model_dump()
    result = await _run(system_id, lambda: system_service.service.create_harness(_caller(user), system_id, version, fields))
    return _respond(result, response, 201)


@router.post("/{system_id}/harnesses/from-label", dependencies=[Depends(require_designer)])
async def harness_from_label(system_id: str, body: HarnessFromLabelRequest, request: Request, response: Response,
                             user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.harness_from_label(
        _caller(user), system_id, version, body.label))
    return _respond(result, response, 201)


@router.patch("/{system_id}/harnesses/{harness_id}", dependencies=[Depends(require_designer)])
async def update_harness(system_id: str, harness_id: str, body: UpdateHarnessRequest, request: Request,
                         response: Response, user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    fields = {key: getattr(body, key) for key in body.model_fields_set}
    result = await _run(system_id, lambda: system_service.service.update_harness(
        _caller(user), system_id, version, harness_id, fields))
    return _respond(result, response)


@router.delete("/{system_id}/harnesses/{harness_id}", dependencies=[Depends(require_designer)])
async def delete_harness(system_id: str, harness_id: str, request: Request,
                         user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.delete_harness(_caller(user), system_id, version, harness_id))
    return _no_content(result)


@router.post("/{system_id}/harnesses/{harness_id}/ends", dependencies=[Depends(require_designer)])
async def add_harness_end(system_id: str, harness_id: str, body: HarnessEndRequest, request: Request,
                          response: Response, user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    fields = body.model_dump()
    result = await _run(system_id, lambda: system_service.service.add_harness_end(
        _caller(user), system_id, version, harness_id, fields))
    return _respond(result, response, 201)


@router.patch("/{system_id}/harnesses/{harness_id}/ends/{end_id}", dependencies=[Depends(require_designer)])
async def update_harness_end(system_id: str, harness_id: str, end_id: str, body: UpdateHarnessEndRequest,
                             request: Request, response: Response, user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    fields = {key: getattr(body, key) for key in body.model_fields_set}
    if "mates" in fields and fields["mates"] is not None:
        fields["mates"] = body.mates.model_dump()
    if "part" in fields and fields["part"] is not None:
        fields["part"] = body.part.model_dump()
    result = await _run(system_id, lambda: system_service.service.update_harness_end(
        _caller(user), system_id, version, harness_id, end_id, fields))
    return _respond(result, response)


@router.delete("/{system_id}/harnesses/{harness_id}/ends/{end_id}", dependencies=[Depends(require_designer)])
async def delete_harness_end(system_id: str, harness_id: str, end_id: str, request: Request, response: Response,
                             user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.delete_harness_end(
        _caller(user), system_id, version, harness_id, end_id))
    return _respond(result, response)


@router.get("/{system_id}/harnesses/{harness_id}/ends/{end_id}/suggestions")
async def end_suggestions(system_id: str, harness_id: str, end_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.end_suggestions(_caller(user), system_id, harness_id, end_id))


@router.put("/{system_id}/harnesses/{harness_id}/wires", dependencies=[Depends(require_designer)])
async def replace_wires(system_id: str, harness_id: str, body: list[WireRequest], request: Request,
                        response: Response, user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    wires = [wire.as_input() for wire in body]
    result = await _run(system_id, lambda: system_service.service.replace_wires(
        _caller(user), system_id, version, harness_id, wires))
    return _respond(result, response)


@router.post("/{system_id}/harnesses/{harness_id}/generate")
async def generate_wires(system_id: str, harness_id: str, body: GenerateWiresRequest,
                         user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.generate_wires(
        _caller(user), system_id, harness_id, body.fromEnd, body.toEnd, body.generator, body.options))


@router.post("/{system_id}/harnesses/{harness_id}/to-link", dependencies=[Depends(require_designer)])
async def harness_to_link(system_id: str, harness_id: str, request: Request, response: Response,
                          user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.harness_to_link(
        _caller(user), system_id, version, harness_id))
    return _respond(result, response, 201)


@router.post("/{system_id}/links/{link_id}/to-harness", dependencies=[Depends(require_designer)])
async def link_to_harness(system_id: str, link_id: str, request: Request, response: Response,
                          user: AuthenticatedUser = Depends(require_viewer)):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.link_to_harness(
        _caller(user), system_id, version, link_id))
    return _respond(result, response, 201)


# ---------------------------------------------------------------------------
# Exports (CONTRACTS_P2 §4)


@router.get("/{system_id}/exports")
async def list_exports(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.list_exports(_caller(user), system_id))


@router.post("/{system_id}/exports", dependencies=[Depends(require_designer)])
async def create_export(
    system_id: str, body: CreateExportRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    if (body.portKey is None) == (body.childExportId is None):
        raise HTTPException(status_code=422, detail="give exactly one of portKey or childExportId")
    result = await _run(system_id, lambda: system_service.service.create_export(
        _caller(user), system_id, version, name=body.name, description=body.description,
        instance_id=body.instanceId, port_key=body.portKey, child_export_id=body.childExportId,
    ))
    return _respond(result, response, 201)


@router.patch("/{system_id}/exports/{export_id}", dependencies=[Depends(require_designer)])
async def update_export(
    system_id: str, export_id: str, body: UpdateExportRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    fields = {key: getattr(body, key) for key in body.model_fields_set}
    if "instanceId" in fields and fields.get("portKey") is None:
        raise HTTPException(status_code=422, detail="retargeting needs portKey")
    result = await _run(system_id, lambda: system_service.service.update_export(
        _caller(user), system_id, version, export_id, fields,
    ))
    return _respond(result, response)


@router.delete("/{system_id}/exports/{export_id}", dependencies=[Depends(require_designer)])
async def delete_export(
    system_id: str, export_id: str, request: Request, user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.delete_export(
        _caller(user), system_id, version, export_id,
    ))
    return _no_content(result)


@router.get("/{system_id}/export-interface")
async def export_interface(
    system_id: str, snapshot: Optional[str] = Query(default=None, max_length=100),
    user: AuthenticatedUser = Depends(require_viewer),
):
    return await _run(system_id, lambda: system_service.service.export_interface(
        _caller(user), system_id, snapshot,
    ))


# ---------------------------------------------------------------------------
# Links and rows


@router.post("/{system_id}/links", dependencies=[Depends(require_designer)])
async def create_link(
    system_id: str, body: CreateLinkRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    for end in (body.a, body.b):
        if (end.portKey is None) == (end.exportId is None):
            raise HTTPException(status_code=422, detail="each link end takes exactly one of portKey or exportId")
    if body.a.instanceId == body.b.instanceId and body.a.key() == body.b.key():
        raise HTTPException(status_code=422, detail="both link ends are the same port")
    result = await _run(system_id, lambda: system_service.service.create_link(
        _caller(user), system_id, version, a=body.a.as_end(), b=body.b.as_end(),
        name=body.name, harness=body.harness, link_type=body.type, stack_height_mm=body.stackHeightMm,
    ))
    return _respond(result, response, 201)


@router.patch("/{system_id}/links/{link_id}", dependencies=[Depends(require_designer)])
async def update_link(
    system_id: str, link_id: str, body: UpdateLinkRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    fields = {key: getattr(body, key) for key in body.model_fields_set}
    if "name" in fields and fields["name"] is None:
        fields["name"] = ""
    if fields.get("type", "") is None:
        raise HTTPException(status_code=422, detail="type cannot be null")
    result = await _run(system_id, lambda: system_service.service.update_link(
        _caller(user), system_id, version, link_id, fields,
    ))
    return _respond(result, response)


@router.delete("/{system_id}/links/{link_id}", dependencies=[Depends(require_designer)])
async def delete_link(
    system_id: str, link_id: str, request: Request, user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.delete_link(
        _caller(user), system_id, version, link_id,
    ))
    return _no_content(result)


@router.put("/{system_id}/links/{link_id}/rows", dependencies=[Depends(require_designer)])
async def replace_rows(
    system_id: str, link_id: str, request: Request, response: Response,
    body: List[RowRequest] = Body(max_length=MAX_ROWS),
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    rows = [row.model_dump() for row in body]
    result = await _run(system_id, lambda: system_service.service.replace_rows(
        _caller(user), system_id, version, link_id, rows,
    ))
    return _respond(result, response)


@router.post("/{system_id}/links/{link_id}/generate")
async def generate_rows(
    system_id: str, link_id: str, body: GenerateRequest, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    result = await _run(system_id, lambda: system_service.service.generate_rows(
        _caller(user), system_id, link_id, body.generator, body.options,
    ))
    return _respond(result, response)


# ---------------------------------------------------------------------------
# Validation, reviews and rebase


@router.get("/{system_id}/validation")
async def get_validation(system_id: str, response: Response, user: AuthenticatedUser = Depends(require_viewer)):
    result = await _run(system_id, lambda: system_service.service.validation_report(_caller(user), system_id))
    return _respond(result, response)


@router.get("/{system_id}/reviews")
async def list_reviews(
    system_id: str,
    status: Optional[Literal["open", "applied", "kept_pinned", "superseded", "closed"]] = Query(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    return await _run(system_id, lambda: system_service.service.list_reviews(_caller(user), system_id, status))


@router.post(
    "/{system_id}/reviews/{review_id}/items/{item_id}/decision", dependencies=[Depends(require_designer)]
)
async def decide_review_item(
    system_id: str, review_id: str, item_id: str, body: DecisionRequest, request: Request,
    response: Response, user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.decide(
        _caller(user), system_id, version, review_id, item_id, body.decision, body.payload,
    ))
    return _respond(result, response)


@router.post("/{system_id}/reviews/{review_id}/keep-pinned", dependencies=[Depends(require_designer)])
async def keep_review_pinned(
    system_id: str, review_id: str, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.keep_pinned(
        _caller(user), system_id, version, review_id,
    ))
    return _respond(result, response)


@router.post("/{system_id}/instances/{instance_id}/rebase", dependencies=[Depends(require_designer)])
async def rebase_instance(
    system_id: str, instance_id: str, body: RebaseRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    if (body.commit is None) == (body.revisionId is None):
        raise HTTPException(status_code=422, detail="give exactly one of commit or revisionId")
    if body.revisionId is not None:
        result = await _run(system_id, lambda: system_service.service.rebase_child(
            _caller(user), system_id, version, instance_id, body.revisionId,
        ))
        return _respond(result, response)
    state, outcome = await _run(system_id, lambda: system_service.service.rebase(
        _caller(user), system_id, version, instance_id, body.commit,
    ))
    if state == "queued":
        return JSONResponse(status_code=202, content=outcome)
    return _respond(outcome, response)


# ---------------------------------------------------------------------------
# Snapshots and ICD (§9)

# The ICD is self-contained: inline styles and SVG, no scripts, no fetches.
ICD_CSP = ("default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; "
           "form-action 'none'; frame-ancestors 'self'")
_UNSAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def _icd_response(content: str, name: str, fmt: str, suffix: str, version: Optional[int], system_id: str):
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"}
    if version is not None:
        headers["ETag"] = etag(system_id, version)
    stem = _UNSAFE_FILENAME.sub("-", f"{name}-{suffix}").strip("-.") or "system"
    if fmt == "csv":
        headers["Content-Disposition"] = f'attachment; filename="{stem}-icd.csv"'
        return PlainTextResponse(content, media_type="text/csv; charset=utf-8", headers=headers)
    headers["Content-Security-Policy"] = ICD_CSP
    headers["Content-Disposition"] = f'inline; filename="{stem}-icd.html"'
    return PlainTextResponse(content, media_type="text/html; charset=utf-8", headers=headers)


@router.post("/{system_id}/snapshots", dependencies=[Depends(require_designer)], status_code=201)
async def create_snapshot(
    system_id: str, body: SnapshotRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.create_snapshot(
        _caller(user), system_id, version, body.name, body.note,
    ))
    return _respond(result, response, status_code=201)


@router.get("/{system_id}/snapshots")
async def list_snapshots(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.list_snapshots(_caller(user), system_id))


@router.get("/{system_id}/snapshots/{snapshot_id}")
async def get_snapshot(system_id: str, snapshot_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.get_snapshot(_caller(user), system_id, snapshot_id))


@router.post("/{system_id}/snapshots/{snapshot_id}/publish", dependencies=[Depends(require_designer)])
async def publish_snapshot(
    system_id: str, snapshot_id: str, body: PublishRequest, user: AuthenticatedUser = Depends(require_viewer),
):
    """P2 §3.3: publish as a catalog ``assembly`` revision. 201 when new, 200 when already published."""
    created, publication = await _run(system_id, lambda: system_service.service.publish_snapshot(
        _caller(user), system_id, snapshot_id, ipn=body.ipn, name=body.name,
        description=body.description, manufacturer=body.manufacturer,
    ))
    return JSONResponse(status_code=201 if created else 200, content=publication)


@router.get("/{system_id}/snapshots/{snapshot_id}/manifest")
async def snapshot_manifest(system_id: str, snapshot_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """P2 §11: the frozen ``prism.system_manifest.v1``, whole or 403."""
    return await _run(system_id, lambda: system_service.service.snapshot_manifest(
        _caller(user), system_id, snapshot_id,
    ))


@router.get("/{system_id}/snapshots/{snapshot_id}/diff")
async def diff_snapshot(
    system_id: str, snapshot_id: str,
    against: str = Query(default="live", min_length=1, max_length=100),
    user: AuthenticatedUser = Depends(require_viewer),
):
    return await _run(system_id, lambda: system_service.service.diff_snapshot(
        _caller(user), system_id, snapshot_id, against,
    ))


@router.get("/{system_id}/icd.{fmt}")
async def live_icd(
    system_id: str, fmt: Literal["csv", "html"], depth: Literal["own", "all"] = Query(default="own"),
    user: AuthenticatedUser = Depends(require_viewer),
):
    content, name, version = await _run(system_id, lambda: system_service.service.icd(
        _caller(user), system_id, fmt, None, depth,
    ))
    return _icd_response(content, name, fmt, "live", version, system_id)


@router.get("/{system_id}/snapshots/{snapshot_id}/icd.{fmt}")
async def snapshot_icd(
    system_id: str, snapshot_id: str, fmt: Literal["csv", "html"],
    depth: Literal["own", "all"] = Query(default="own"), user: AuthenticatedUser = Depends(require_viewer),
):
    content, name, _version = await _run(system_id, lambda: system_service.service.icd(
        _caller(user), system_id, fmt, snapshot_id, depth,
    ))
    return _icd_response(content, name, fmt, snapshot_id, None, system_id)


# ---------------------------------------------------------------------------
# CSV import (§9.3)


@router.post("/{system_id}/imports", dependencies=[Depends(require_designer)], status_code=201)
async def upload_import(
    system_id: str,
    file: UploadFile = File(...),
    delimiter: Optional[Literal[",", ";", "\t", "|"]] = Form(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    raw = await file.read(csv_import.MAX_UPLOAD_BYTES + 1)
    return await _run(system_id, lambda: system_service.service.upload_import(
        _caller(user), system_id, filename=file.filename or "", raw=raw, delimiter=delimiter,
    ))


@router.post("/{system_id}/imports/{import_id}/preview", dependencies=[Depends(require_designer)])
async def preview_import(
    system_id: str, import_id: str, body: ImportMapRequest, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    result = await _run(system_id, lambda: system_service.service.preview_import(
        _caller(user), system_id, import_id, body.columnMap, body.boardMap, body.delimiter,
    ))
    return _respond(result, response)


@router.post("/{system_id}/imports/{import_id}/commit", dependencies=[Depends(require_designer)])
async def commit_import(
    system_id: str, import_id: str, body: ImportMapRequest, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    version = _expected_version(request, system_id)
    result = await _run(system_id, lambda: system_service.service.commit_import(
        _caller(user), system_id, version, import_id, body.columnMap, body.boardMap, body.delimiter,
    ))
    return _respond(result, response)


# ---------------------------------------------------------------------------
# History and layout


@router.get("/{system_id}/history")
async def get_history(
    system_id: str,
    cursor: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_viewer),
):
    return await _run(system_id, lambda: system_service.service.history(
        _caller(user), system_id, cursor=cursor, limit=limit,
    ))


@router.get("/{system_id}/layout")
async def get_layout(system_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    return await _run(system_id, lambda: system_service.service.get_layout(_caller(user), system_id))


@router.put("/{system_id}/layout", dependencies=[Depends(require_designer)])
async def put_layout(
    system_id: str, body: LayoutRequest, user: AuthenticatedUser = Depends(require_viewer),
):
    positions = {key: value.model_dump() for key, value in body.positions.items()}
    return await _run(system_id, lambda: system_service.service.put_layout(
        _caller(user), system_id, positions,
    ))
