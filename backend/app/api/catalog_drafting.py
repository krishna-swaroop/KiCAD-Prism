"""Draft assets: stage a file, check it, attach it (ADR scripting-and-mcp §12).

These routes take a symbol, footprint or 3D model from a client that cannot
post multipart forms (an MCP tool, a script with only JSON) and hand it to the
same catalog imports the library workspace's upload buttons use. How the file
was made is the client's business; Prism checks and stores it.

* ``POST /uploads`` opens a slot and answers a signed ``PUT`` URL.
* ``PUT /uploads/{id}`` takes the bytes; the signature is its only credential.
* ``POST /drafts/check`` reads, KLC-checks and renders a symbol or footprint
  without storing it.
* ``POST /components/{id}/assets/{type}/attach`` attaches a staged or inline
  file to the component as a new revision.
* ``POST /components/{id}/assets/{type}/reuse`` links an asset the catalog
  already stores (an ``/assets/search`` hit) instead of uploading a copy.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import tempfile
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api import catalog_admin_models as models
from app.core import preconditions
from app.core.config import settings
from app.core.errors import value_errors_as
from app.core.security import AuthenticatedUser, require_catalog_writer
from app.services.catalog.asset_files import CatalogAssetFiles
from app.services.catalog.draft_checks import check_draft
from app.services.catalog.staged_uploads import UPLOAD_MAX_BYTES, StagedUploads
from app.services.component_catalog_service import catalog_service
from app.services.kicad_tools import kicad_cli

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

# Inline content is for text a client already holds; anything bigger goes
# through an upload slot.
MAX_INLINE_CHARS = 8 * 1024 * 1024
_DRAFT_SUFFIX = {"symbol": ".kicad_sym", "footprint": ".kicad_mod"}


def _uploads() -> StagedUploads:
    return StagedUploads(catalog_service.runtime.store_root.parent / "uploads")


class UploadSlotRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255, description="The file's name, with its extension.")


class UploadSlot(BaseModel):
    upload_id: str
    upload_path: str = Field(description="Where to PUT the bytes, relative to Prism's base URL.")
    upload_url: str | None = Field(default=None, description="The same, absolute, when Prism knows its public URL.")
    method: Literal["PUT"] = "PUT"
    expires_at: int
    max_bytes: int


class UploadReceipt(BaseModel):
    upload_id: str
    size_bytes: int
    sha256: str


class DraftSource(BaseModel):
    """A file given inline (text) or by a staged ``upload_id``; exactly one."""

    content: str | None = Field(default=None, max_length=MAX_INLINE_CHARS)
    upload_id: str | None = None
    file_name: str = ""


class DraftCheckRequest(DraftSource):
    asset_type: Literal["symbol", "footprint"]
    name: str = Field(default="", description="The symbol or footprint to check when the file holds several.")


class KlcFinding(BaseModel):
    model_config = ConfigDict(extra="allow")

    severity: str
    rule_code: str
    rule_url: str
    message: str
    details: list[str]
    object_name: str


class DraftKlcResult(BaseModel):
    status: str
    exit_code: int | None
    error_count: int
    warning_count: int
    findings: list[KlcFinding]
    findings_omitted: int = Field(default=0, description="Findings beyond the first 50, errors listed first.")
    message: str


class DraftPreview(BaseModel):
    unit: int
    png_base64: str


class DraftCheckResult(BaseModel):
    asset_type: str
    name: str
    names: list[str] = Field(description="The first 20 symbol or footprint names the file holds.")
    name_count: int
    sha256: str
    readable: bool
    kicad_message: str
    klc: DraftKlcResult | None
    previews: list[DraftPreview]


class DraftAttachRequest(DraftSource):
    name: str = Field(default="", description="The symbol or footprint to attach when the file holds several.")
    target_library: str = ""
    counterpart_asset_id: str = Field(
        default="", description="The symbol or footprint asset this one pairs with in a representation."
    )


class DraftAttachResult(BaseModel):
    mode: str
    discovered: list[str] | None = None
    selected: str | None = None
    component: models.CatalogComponent | None = None


def _source(payload: DraftSource, user: AuthenticatedUser, default_name: str) -> tuple[str, bytes, str]:
    """``(file_name, bytes, upload_id)`` for an inline or staged draft."""

    if (payload.content is None) == (payload.upload_id is None):
        raise HTTPException(status_code=400, detail="Give exactly one of content or upload_id")
    if payload.content is not None:
        data = payload.content.encode("utf-8")
        if not data:
            raise HTTPException(status_code=400, detail="content is empty")
        return payload.file_name or default_name, data, ""
    staged = _uploads().read(str(payload.upload_id), owner=user.email)
    return payload.file_name or staged.file_name, staged.payload, staged.upload_id


@router.post("/uploads", status_code=201, response_model=UploadSlot, summary="Open an upload slot")
def open_catalog_upload(
    payload: UploadSlotRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    slot = _uploads().open(owner=user.email, file_name=payload.file_name)
    path = f"/api/v1/catalog/uploads/{slot['upload_id']}?exp={slot['expires_at']}&sig={slot['signature']}"
    base = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if not base and request.scope.get("client", ("",))[0] != "mcp":
        base = str(request.base_url).rstrip("/")
    return UploadSlot(
        upload_id=slot["upload_id"],
        upload_path=path,
        upload_url=f"{base}{path}" if base else None,
        expires_at=slot["expires_at"],
        max_bytes=slot["max_bytes"],
    )


@router.put("/uploads/{upload_id}", response_model=UploadReceipt, summary="Write an upload slot's bytes")
async def write_catalog_upload(upload_id: str, request: Request, exp: int = Query(...), sig: str = Query(...)):
    # The body is spooled before the slot is touched, so a client that sends too
    # much is cut off without a partial write.
    with tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024) as spool:
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > UPLOAD_MAX_BYTES:
                raise HTTPException(status_code=413, detail=f"Upload is larger than {UPLOAD_MAX_BYTES} bytes")
            spool.write(chunk)
        spool.seek(0)
        receipt = await asyncio.to_thread(
            _uploads().write, upload_id, expires_at=exp, signature=sig, stream=spool
        )
    return receipt


@router.post("/drafts/check", response_model=DraftCheckResult, summary="Check a draft symbol or footprint")
async def check_catalog_draft(
    payload: DraftCheckRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    file_name, data, _ = _source(payload, user, f"draft{_DRAFT_SUFFIX[payload.asset_type]}")
    with value_errors_as(400):
        return await asyncio.to_thread(
            check_draft,
            kicad_cli(),
            asset_type=payload.asset_type,
            file_name=file_name,
            payload=data,
            name=payload.name,
        )


@router.post(
    "/components/{component_id}/assets/{asset_type}/attach",
    response_model=DraftAttachResult,
    response_model_exclude_unset=True,
    summary="Attach a staged or inline asset to a component",
)
async def attach_catalog_draft(
    component_id: str,
    asset_type: Literal["symbol", "footprint", "3dmodel", "spice"],
    payload: DraftAttachRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    file_name, data, upload_id = _source(payload, user, f"{component_id}{_DRAFT_SUFFIX.get(asset_type, '.bin')}")
    expected = preconditions.if_match(request, "component", component_id, required=False) or ""
    with value_errors_as(400, keep_typed=True):
        if asset_type == "symbol":
            result = await asyncio.to_thread(
                catalog_service.import_symbol_library,
                component_id,
                upload_name=file_name,
                payload=data,
                target_library=payload.target_library or component_id,
                selected_symbol=payload.name,
                counterpart_asset_id=payload.counterpart_asset_id,
                actor=user.email,
                expected_revision_id=expected,
            )
            shaped = {
                "mode": result.get("mode", "imported"),
                "discovered": result.get("discovered_symbols"),
                "selected": result.get("selected_symbol"),
                "component": result.get("component"),
            }
        elif asset_type == "footprint":
            result = await asyncio.to_thread(
                catalog_service.import_footprint,
                component_id,
                upload_name=file_name,
                payload=data,
                target_library=payload.target_library or "Prism_Footprints",
                selected_footprint=payload.name,
                counterpart_asset_id=payload.counterpart_asset_id,
                actor=user.email,
                expected_revision_id=expected,
            )
            shaped = {
                "mode": result.get("mode", "imported"),
                "discovered": result.get("discovered_footprints"),
                "selected": result.get("selected_footprint"),
                "component": result.get("component"),
            }
        else:
            result = await asyncio.to_thread(
                catalog_service.attach_auxiliary_asset,
                component_id,
                asset_type=asset_type,
                upload_name=file_name,
                payload=data,
                target_library=payload.target_library or "Prism_Assets",
                actor=user.email,
                expected_revision_id=expected,
            )
            shaped = {"mode": "imported", "component": result.get("component")}
    if upload_id and shaped["mode"] != "selection_required":
        _uploads().discard(upload_id)
    return {key: value for key, value in shaped.items() if value is not None}


class ReuseAssetRequest(BaseModel):
    asset_id: str = Field(min_length=1, description="An asset id from the asset search.")
    counterpart_asset_id: str = Field(
        default="", description="The symbol or footprint asset this one pairs with in a representation."
    )


@router.post(
    "/components/{component_id}/assets/{asset_type}/reuse",
    response_model=models.ComponentMutation,
    response_model_exclude_unset=True,
    summary="Reuse an existing catalog asset on a component",
)
async def reuse_catalog_asset(
    component_id: str,
    asset_type: Literal["symbol", "footprint", "3dmodel", "spice"],
    payload: ReuseAssetRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Link a stored asset by id: the component shares the file, nothing is copied."""

    asset = await asyncio.to_thread(catalog_service.get_asset_by_id, payload.asset_id)
    if not asset or str(asset.get("asset_type")) != asset_type:
        raise HTTPException(status_code=404, detail=f"No {asset_type} asset with that id")
    root = CatalogAssetFiles.asset_root(catalog_service.runtime, asset_type)
    expected = preconditions.if_match(request, "component", component_id, required=False) or ""
    with value_errors_as(400, keep_typed=True):
        relative = Path(str(asset["canonical_path"])).resolve().relative_to(root.resolve())
        return await asyncio.to_thread(
            catalog_service.link_library_asset,
            component_id,
            asset_type,
            relative.as_posix(),
            str(asset.get("target_library") or ""),
            str(asset.get("target_name") or ""),
            counterpart_asset_id=payload.counterpart_asset_id,
            actor=user.email,
            expected_revision_id=expected,
        )
