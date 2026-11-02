from __future__ import annotations

import asyncio
import csv
import hashlib
import io
from itertools import chain
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from app.api import catalog_admin_models as models
from app.api._helpers import preview_file_response
from app.core.errors import caller_errors, value_errors_as
from app.core.config import settings
from app.core import policy, preconditions
from app.core.policy import require_owner_or_admin
from app.core.security import (
    AuthenticatedUser,
    require_catalog_admin,
    require_catalog_browser,
    require_catalog_reader,
    require_catalog_writer,
)
from app.services.component_catalog_service import catalog_service
from app.services.catalog import workflow_policy
from app.services.catalog_job_service import catalog_jobs
from app.services.local_artifact_store import artifact_store
from app.services.library_folder_import_service import configured_import_roots, resolve_server_import_path
from app.services.kicad_library_discovery import discover_library
from app.services import project_revision
from app.services.workspace_service import workspace

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

def _normalize_workflow_stage(value: str) -> str:
    return workflow_policy.normalize_workflow_stage(value)


def _can_transition_workflow(user: AuthenticatedUser, current_stage: str, next_stage: str) -> bool:
    return workflow_policy.can_transition(user.role, current_stage, next_stage)


def _enqueue_catalog_job(
    job_type: str,
    payload: dict[str, Any],
    *,
    actor: str,
    idempotency_key: str = "",
) -> dict[str, Any]:
    return catalog_jobs.enqueue(
        job_type,
        payload,
        created_by=actor,
        idempotency_key=idempotency_key,
    )


class CreateManualComponentRequest(BaseModel):
    value: str
    description: str
    datasheet: str
    manufacturer: str
    manufacturer_part_number: str
    category: str = ""
    package_name: str = ""
    vendor: str = ""
    vendor_part_number: str = ""
    mass_g: str = ""
    rqjc_c_w: str = ""
    rqjc_top_c_w: str = ""
    temp_max_c: str = ""
    temp_min_c: str = ""
    power_dissipation_w: str = ""
    rate: str = ""
    sap_code: str = ""
    change_summary: str = "Create component"
    extra_fields: dict[str, str] = Field(default_factory=dict)


class UpdateComponentMetadataRequest(BaseModel):
    value: str | None = None
    description: str | None = None
    datasheet_url: str | None = None
    manufacturer: str | None = None
    mpn: str | None = None
    category: str | None = None
    package_name: str | None = None
    vendor: str | None = None
    vendor_part_number: str | None = None
    mass_g: str | None = None
    rqjc_c_w: str | None = None
    rqjc_top_c_w: str | None = None
    temp_max_c: str | None = None
    temp_min_c: str | None = None
    power_dissipation_w: str | None = None
    rate: str | None = None
    sap_code: str | None = None
    change_summary: str = "Update component metadata"
    extra_fields: dict[str, str] | None = None


class CreateRepresentationRequest(BaseModel):
    label: str = "Representation"
    symbol_asset_id: str = ""
    footprint_asset_id: str = ""
    display_order: int = 0
    is_default: bool = False
    source_internal_part_number: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)
    change_summary: str = "Add component representation"


class UpdateRepresentationRequest(BaseModel):
    label: str | None = None
    symbol_asset_id: str | None = None
    footprint_asset_id: str | None = None
    display_order: int | None = None
    is_default: bool | None = None
    change_summary: str = "Update component representation"


class MetadataFieldRequest(BaseModel):
    key: str = ""
    label: str = ""
    description: str = ""
    type: str = "text"
    unit: str = ""
    enum_values: list[str] = Field(default_factory=list)
    required: bool = False
    display_order: int | None = None


class MetadataGridPreferencesRequest(BaseModel):
    visible: list[str] = Field(default_factory=list)
    order: list[str] = Field(default_factory=list)
    widths: dict[str, int] = Field(default_factory=dict)
    pinned: list[str] = Field(default_factory=list)


class MetadataBatchItemRequest(BaseModel):
    component_id: str
    expected_revision_id: str  # per row, not If-Match: one header cannot name many rows (D38)
    patch: dict[str, str] = Field(default_factory=dict)


class CreateMetadataBatchRequest(BaseModel):
    items: list[MetadataBatchItemRequest] = Field(min_length=1, max_length=10000)
    change_summary: str = Field(default="Bulk update component metadata", min_length=1, max_length=500)


class ApplyMetadataBatchRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list, max_length=10000)


class ReleaseStatusRequest(BaseModel):
    release_status: str = ""
    workflow_stage: str = ""
    self_approval_override_reason: str = ""
    review_note: str = ""
    expected_manifest_hash: str = ""  # beside the component If-Match, 409 manifest_conflict (D39)


class ProjectComponentSelectionRequest(BaseModel):
    component_uid: str = ""
    reference: str = ""
    schematic_uuid: str = ""
    pcb_footprint_uuid: str = ""


class ProjectImportRequest(BaseModel):
    scope: str
    project_id: str = ""
    source_revision: str = ""
    selection: ProjectComponentSelectionRequest | None = None


class FolderSnapshotRequest(BaseModel):
    display_name: str = "KiCad libraries"


class FolderInventoryFile(BaseModel):
    relative_path: str
    size_bytes: int = Field(default=0, ge=0)


class FolderDiscoveryRequest(BaseModel):
    files: list[FolderInventoryFile] = Field(default_factory=list, max_length=100000)
    footprint_resolutions: dict[str, str] = Field(default_factory=dict)


class FolderApprovalRequest(BaseModel):
    approved_component_ids: list[str] = Field(default_factory=list, max_length=100000)
    footprint_resolutions: dict[str, str] = Field(default_factory=dict)


class ServerFolderImportRequest(BaseModel):
    root_name: str
    subpath: str = ""
    display_name: str = ""


class AcceptProjectImportProposalRequest(BaseModel):
    metadata_overrides: dict[str, Any] = Field(default_factory=dict)
    asset_selections: dict[str, list[str]] = Field(default_factory=dict)
    # asset_type -> existing catalog asset id. Linking reuses that asset rather than
    # importing a duplicate copy of the project's own file.
    asset_links: dict[str, str] = Field(default_factory=dict)
    change_summary: str = "Import component from project"


class BulkAcceptItem(AcceptProjectImportProposalRequest):
    proposal_id: str = Field(min_length=1)


class BulkAcceptRequest(BaseModel):
    items: list[BulkAcceptItem] = Field(default_factory=list, max_length=500)


class SaveImportDraftsRequest(BaseModel):
    # proposal_id -> {metadata_overrides, asset_selections, asset_links}
    drafts: dict[str, dict[str, Any]] = Field(default_factory=dict)


@router.get("/components", response_model=models.CatalogComponentPage, response_model_exclude_unset=True,
            summary="List catalog components")
def list_catalog_components(
    q: str = Query(default=""),
    source: str | None = Query(default=None),
    availability_state: str | None = Query(default=None),
    workflow_stage: str | None = Query(default=None),
    validation_status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    sort_by: str = Query(default=""),
    sort_dir: str = Query(default="asc"),
    lightweight: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    with value_errors_as(400):
        return catalog_service.list_components(
            query=q,
            source=source,
            availability_state=availability_state,
            workflow_stage=workflow_stage,
            validation_status=validation_status,
            category=category,
            include_inactive=include_inactive,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
            lightweight=lightweight,
        )


@router.get("/categories", response_model=models.CatalogCategories, response_model_exclude_unset=True,
            summary="List released catalog categories")
def list_catalog_categories(user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    return {"categories": catalog_service.list_categories()}


@router.get("/workflow/summary", response_model=models.WorkflowSummary, response_model_exclude_unset=True,
            summary="Count components by workflow stage")
def workflow_summary(user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    return catalog_service.workflow_summary()


@router.get("/release-queue", response_model=models.ReleaseQueuePage, response_model_exclude_unset=True,
            summary="List the release queue")
def release_queue(
    q: str = Query(default=""),
    workflow_stage: str = Query(default="all", pattern="^(all|qa_review|done)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    stages = "qa_review,done" if workflow_stage == "all" else workflow_stage
    with value_errors_as(400):
        result = catalog_service.list_components(
            query=q,
            workflow_stage=stages,
            include_inactive=False,
            page=page,
            page_size=page_size,
            sort_by="updated_at",
            sort_dir="desc",
            lightweight=True,
        )
        return {**result, "summary": catalog_service.release_queue_summary()}


@router.get("/health", response_model=models.CatalogHealth, response_model_exclude_unset=True,
            summary="Report catalog health")
def catalog_health(
    check_files: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    # The per-file disk check stats every released asset; only admins may ask for it.
    if check_files:
        policy.authorize(user, "catalog_admin")
    return catalog_service.catalog_health(check_released_files=check_files)


@router.post("/import-sessions/projects", status_code=202, response_model=models.ImportSessionCreated,
             response_model_exclude_unset=True, summary="Start a project component import")
def create_project_import_session(
    payload: ProjectImportRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    visible_projects = {str(project["id"]): project for project in workspace.get_all_projects(user.role)}
    if payload.scope in {"component", "project"} and payload.project_id not in visible_projects:
        raise HTTPException(status_code=404, detail="Project not found")
    with value_errors_as(400):
        selected_project_ids = sorted(visible_projects) if payload.scope == "all-projects" else [payload.project_id]
        project_revisions: dict[str, str] = {}
        for project_id in selected_project_ids:
            project = visible_projects[project_id]
            location = project_revision.locate(project)
            requested_ref = payload.source_revision if project_id == payload.project_id and payload.source_revision else "HEAD"
            project_revisions[project_id] = project_revision.resolve_commit(location, requested_ref)
        session = catalog_service.create_project_import_session(
            scope=payload.scope,
            project_id=payload.project_id,
            project_ids=selected_project_ids,
            project_revisions=project_revisions,
            source_revision=project_revisions.get(payload.project_id, payload.source_revision),
            selection=payload.selection.model_dump(exclude_none=True) if payload.selection else None,
            actor=user.email,
        )
        job = _enqueue_catalog_job(
            "project_component_import",
            {"session_id": str(session["id"])},
            actor=user.email,
            idempotency_key=f"project-import:{session['id']}",
        )
        return {**session, "job_id": job["id"]}


def _folder_snapshot_for_user(snapshot_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    snapshot = artifact_store.get_snapshot(snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Folder snapshot not found")
    require_owner_or_admin(user, snapshot.get("created_by"), detail="Folder snapshot access denied")
    return snapshot


@router.get("/import-sources/folder-roots", response_model=models.FolderImportRootPage,
            response_model_exclude_unset=True, summary="List server import roots")
def list_folder_import_roots(user: AuthenticatedUser = Depends(require_catalog_writer)):
    _ = user
    return {
        "items": [
            {"name": name, "path_hint": path.name}
            for name, path in configured_import_roots().items()
        ]
    }


@router.post("/import-snapshots/folders", status_code=201, response_model=models.FolderSnapshot,
             response_model_exclude_unset=True, summary="Create a folder import snapshot")
def create_folder_snapshot(
    payload: FolderSnapshotRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    return artifact_store.create_snapshot(
        source_type="browser",
        display_name=payload.display_name,
        created_by=user.email,
    )


@router.post("/import-snapshots/folders/{snapshot_id}/files", status_code=201,
             response_model=models.FolderSnapshotFile, response_model_exclude_unset=True,
             summary="Upload a file into a folder snapshot")
async def upload_folder_snapshot_file(
    snapshot_id: str,
    relative_path: str = Form(...),
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _folder_snapshot_for_user(snapshot_id, user)

    def store() -> dict[str, Any]:
        artifact = artifact_store.put_stream(
            file.file,
            media_type=file.content_type or "application/octet-stream",
            artifact_kind="source",
            max_bytes=settings.CATALOG_IMPORT_MAX_FILE_BYTES,
        )
        artifact_store.add_snapshot_file(snapshot_id, relative_path, artifact)
        return {"relative_path": relative_path, "sha256": artifact.sha256, "size_bytes": artifact.size_bytes}

    try:
        with value_errors_as(400):
            return await asyncio.to_thread(store)
    finally:
        await file.close()


@router.post("/import-snapshots/folders/{snapshot_id}/discover", response_model=models.FolderDiscovery,
             response_model_exclude_unset=True, summary="Discover components in a folder snapshot")
def discover_folder_snapshot(
    snapshot_id: str,
    payload: FolderDiscoveryRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    snapshot = _folder_snapshot_for_user(snapshot_id, user)
    if snapshot.get("status") != "uploading":
        raise HTTPException(status_code=409, detail="Folder snapshot is already immutable")
    with value_errors_as(400):
        source_files = artifact_store.snapshot_files(snapshot_id)
        discovery = discover_library(
            source_files,
            [item.model_dump() for item in payload.files],
            payload.footprint_resolutions,
        )
        identities = [
            {
                "manufacturer": str(component["metadata"].get("manufacturer") or ""),
                "mpn": str(component["metadata"].get("manufacturer_part_number") or ""),
            }
            for component in discovery["components"]
        ]
        existing = catalog_service.match_component_identities(identities)
        for component, match in zip(discovery["components"], existing):
            component["existing_component"] = match
        discovery["existing_component_count"] = sum(
            1 for component in discovery["components"] if component.get("existing_component")
        )
        return discovery


@router.post("/import-snapshots/folders/{snapshot_id}/complete", status_code=202,
             response_model=models.ImportSessionCreated, response_model_exclude_unset=True,
             summary="Complete a folder snapshot and start its import")
def complete_folder_snapshot(
    snapshot_id: str,
    payload: FolderApprovalRequest | None = None,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _folder_snapshot_for_user(snapshot_id, user)
    with value_errors_as(400):
        snapshot = artifact_store.complete_snapshot(snapshot_id)
        session = catalog_service.create_project_import_session(
            scope="folder",
            selection={"snapshot_id": snapshot_id, "display_name": snapshot.get("display_name")},
            actor=user.email,
        )
        job = _enqueue_catalog_job(
            "folder_library_import",
            {
                "session_id": session["id"],
                "snapshot_id": snapshot_id,
                "approved_component_ids": list((payload or FolderApprovalRequest()).approved_component_ids),
                "footprint_resolutions": dict((payload or FolderApprovalRequest()).footprint_resolutions),
            },
            actor=user.email,
            idempotency_key=f"folder-import:{snapshot_id}",
        )
        return {**session, "job_id": job["id"]}


@router.post("/import-snapshots/folders/server", status_code=202,
             response_model=models.ImportSessionCreated, response_model_exclude_unset=True,
             summary="Import a server folder")
def create_server_folder_snapshot(
    payload: ServerFolderImportRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    with value_errors_as(400):
        source = resolve_server_import_path(payload.root_name, payload.subpath)
        snapshot = artifact_store.create_snapshot(
            source_type="server",
            display_name=payload.display_name.strip() or source.name,
            source_locator=f"{payload.root_name}:{payload.subpath}",
            created_by=user.email,
        )
        session = catalog_service.create_project_import_session(
            scope="folder",
            selection={"snapshot_id": snapshot["id"], "display_name": snapshot["display_name"]},
            actor=user.email,
        )
        job = _enqueue_catalog_job(
            "folder_library_import",
            {
                "session_id": session["id"],
                "snapshot_id": snapshot["id"],
                "server_source": {"root_name": payload.root_name, "subpath": payload.subpath},
            },
            actor=user.email,
            idempotency_key=f"server-folder-import:{snapshot['id']}",
        )
        return {**session, "job_id": job["id"]}


@router.get("/import-sessions/{session_id}", response_model=models.ImportSession,
            response_model_exclude_unset=True, summary="Read an import session")
def get_project_import_session(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    session = catalog_service.get_project_import_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    require_owner_or_admin(user, session.get("created_by"), detail="Import session access denied")
    return session


@router.delete("/import-sessions/{session_id}", status_code=204)
def delete_project_import_session(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _import_session_for_user(session_id, user)
    catalog_service.delete_project_import_session(session_id)


@router.get("/jobs/{job_id}", response_model=models.CatalogJobWithEvents, response_model_exclude_unset=True,
            summary="Read a catalog job")
def get_catalog_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    job = catalog_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Catalog job not found")
    require_owner_or_admin(user, job.get("created_by"), detail="Catalog job access denied")
    return {**job, "events": catalog_jobs.events(job_id)}


@router.get("/import-sessions", response_model=models.ImportSessionPage, response_model_exclude_unset=True,
            summary="List import sessions")
def list_project_import_sessions(user: AuthenticatedUser = Depends(require_catalog_reader)):
    return {
        "items": catalog_service.list_project_import_sessions(
            created_by=user.email,
            include_all=policy.role_allows(user.role, "admin"),
        )
    }


def _import_session_for_user(session_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    session = catalog_service.get_project_import_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    require_owner_or_admin(user, session.get("created_by"), detail="Import session access denied")
    return session


@router.get("/import-sessions/{session_id}/proposals", response_model=models.ImportProposalPage,
            response_model_exclude_unset=True, summary="List import proposals")
def list_project_import_proposals(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    _import_session_for_user(session_id, user)
    return {"items": catalog_service.list_project_import_proposals(session_id)}


def _project_import_proposal_for_user(proposal_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    proposal = catalog_service.get_project_import_proposal(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Import proposal not found")
    session = catalog_service.get_project_import_session(str(proposal["session_id"]))
    if not session:
        raise HTTPException(status_code=404, detail="Import session not found")
    require_owner_or_admin(user, session.get("created_by"), detail="Import proposal access denied")
    return proposal


@router.post("/import-proposals/{proposal_id}/accept", response_model=models.ImportProposalAcceptance,
             response_model_exclude_unset=True, summary="Accept an import proposal")
def accept_project_import_proposal(
    proposal_id: str,
    payload: AcceptProjectImportProposalRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _project_import_proposal_for_user(proposal_id, user)
    with value_errors_as(400, keep_typed=True):
        return catalog_service.accept_project_import_proposal(
            proposal_id,
            metadata_overrides=payload.metadata_overrides,
            asset_selections=payload.asset_selections,
            asset_links=payload.asset_links,
            actor=user.email,
            change_summary=payload.change_summary,
        )


@router.post("/import-sessions/{session_id}/proposals/bulk-accept",
             response_model=models.BulkImportAcceptance, response_model_exclude_unset=True,
             summary="Accept several import proposals")
def bulk_accept_project_import_proposals(
    session_id: str,
    payload: BulkAcceptRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Accept many remediated rows in one request.

    Rows are independent: one failure reports against that row and the rest still
    import. Resolving a 400-part board should not be an all-or-nothing action.
    """
    _import_session_for_user(session_id, user)

    results: list[dict[str, Any]] = []
    for item in payload.items:
        proposal = catalog_service.get_project_import_proposal(item.proposal_id)
        if not proposal or str(proposal.get("session_id") or "") != session_id:
            results.append(
                {"proposal_id": item.proposal_id, "status": "failed", "error": "Import proposal not found"}
            )
            continue
        try:
            accepted = catalog_service.accept_project_import_proposal(
                item.proposal_id,
                metadata_overrides=item.metadata_overrides,
                asset_selections=item.asset_selections,
                asset_links=item.asset_links,
                actor=user.email,
                change_summary=item.change_summary,
            )
        except ValueError as exc:
            results.append({"proposal_id": item.proposal_id, "status": "failed", "error": str(exc)})
            continue
        component = accepted.get("component") or {}
        results.append(
            {
                "proposal_id": item.proposal_id,
                "status": "accepted",
                "component_id": str(component.get("id") or ""),
            }
        )

    accepted_count = sum(1 for result in results if result["status"] == "accepted")
    return {
        "accepted": accepted_count,
        "failed": len(results) - accepted_count,
        "results": results,
    }


@router.put("/import-sessions/{session_id}/proposals/drafts", response_model=models.SavedImportDrafts,
             response_model_exclude_unset=True, summary="Save import proposal drafts")
def save_import_proposal_drafts(
    session_id: str,
    payload: SaveImportDraftsRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Persist in-progress remediation so a long import survives a reload."""
    _import_session_for_user(session_id, user)
    saved = catalog_service.save_project_import_drafts(session_id, payload.drafts)
    return {"saved": saved}


IMPORT_CSV_COLUMNS = (
    "proposal_id",
    "reference",
    "value",
    "manufacturer",
    "manufacturer_part_number",
    "description",
    "datasheet",
    "package_name",
    "footprint_asset_id",
    "status",
    "blocking_findings",
)


def _import_csv_row(proposal: dict[str, Any]) -> dict[str, str]:
    metadata = dict(proposal.get("metadata") or {})
    draft = dict(proposal.get("draft") or {})
    overrides = dict(draft.get("metadata_overrides") or {})
    links = dict(draft.get("asset_links") or {})

    def value_for(key: str, *, fallback_key: str = "") -> str:
        if key in overrides:
            return str(overrides[key] or "")
        return str(metadata.get(fallback_key or key) or "")

    blocking = [
        str(finding.get("code") or "")
        for finding in proposal.get("findings") or []
        if finding.get("severity") == "error"
    ]
    return {
        "proposal_id": str(proposal.get("id") or ""),
        "reference": str(proposal.get("reference") or ""),
        "value": value_for("value"),
        "manufacturer": value_for("manufacturer"),
        "manufacturer_part_number": value_for("manufacturer_part_number"),
        "description": value_for("description"),
        "datasheet": value_for("datasheet"),
        "package_name": value_for("package_name", fallback_key="footprint"),
        "footprint_asset_id": str(links.get("footprint") or ""),
        "status": str(proposal.get("status") or ""),
        "blocking_findings": " ".join(sorted(set(blocking))),
    }


@router.get("/import-sessions/{session_id}/proposals.csv", response_class=Response,
            summary="Export import proposals as CSV",
            responses={200: {"content": {"text/csv": {}}, "description": "The import remediation CSV"}})
def export_import_proposals_csv(
    session_id: str,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    """Export the remediation grid so it can be completed in a spreadsheet."""
    _import_session_for_user(session_id, user)
    proposals = catalog_service.list_project_import_proposals(session_id)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(IMPORT_CSV_COLUMNS), lineterminator="\n")
    writer.writeheader()
    for proposal in proposals:
        writer.writerow(_import_csv_row(proposal))

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="prism-import-{session_id}.csv"',
        },
    )


@router.post("/import-sessions/{session_id}/proposals.csv", response_model=models.ImportedProposalCsv,
             response_model_exclude_unset=True, summary="Apply an edited import CSV")
async def import_proposals_csv(
    session_id: str,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    """Apply an edited CSV back onto the session's drafts.

    Rows are matched by proposal_id and nothing is accepted here: the reviewer still
    sees the result in the grid and decides what to import.
    """
    _import_session_for_user(session_id, user)

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "proposal_id" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a proposal_id column")

    known_ids = {
        str(proposal["id"]) for proposal in catalog_service.list_project_import_proposals(session_id)
    }
    metadata_columns = (
        "value",
        "manufacturer",
        "manufacturer_part_number",
        "description",
        "datasheet",
        "package_name",
    )

    drafts: dict[str, dict[str, Any]] = {}
    unknown_rows = 0
    for row in reader:
        proposal_id = str(row.get("proposal_id") or "").strip()
        if not proposal_id:
            continue
        if proposal_id not in known_ids:
            unknown_rows += 1
            continue
        overrides = {
            column: str(row.get(column) or "").strip()
            for column in metadata_columns
            if row.get(column) is not None
        }
        draft: dict[str, Any] = {"metadata_overrides": overrides}
        footprint_asset_id = str(row.get("footprint_asset_id") or "").strip()
        if footprint_asset_id:
            draft["asset_links"] = {"footprint": footprint_asset_id}
        drafts[proposal_id] = draft

    saved = catalog_service.save_project_import_drafts(session_id, drafts)
    return {"saved": saved, "skipped_unknown_rows": unknown_rows}


@router.get("/assets/search", response_model=models.AssetSearchPage, response_model_exclude_unset=True,
            summary="Search catalog assets")
def search_catalog_assets(
    asset_type: str = Query(default="footprint"),
    q: str = Query(default=""),
    limit: int = Query(default=25, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    """Search existing catalog assets so an import can reference one instead of copying it."""
    with value_errors_as(400):
        return {"items": catalog_service.search_assets(asset_type=asset_type, query=q, limit=limit)}


@router.post("/import-proposals/{proposal_id}/reject", response_model=models.ImportProposal,
             response_model_exclude_unset=True, summary="Reject an import proposal")
def reject_project_import_proposal(
    proposal_id: str,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _project_import_proposal_for_user(proposal_id, user)
    with value_errors_as(400):
        return catalog_service.reject_project_import_proposal(proposal_id)


@router.post("/components", response_model=models.CatalogComponent, response_model_exclude_unset=True,
             summary="Create a catalog component")
def create_catalog_component(
    payload: CreateManualComponentRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    with value_errors_as(400):
        data = payload.model_dump()
        change_summary = str(data.pop("change_summary"))
        return catalog_service.create_manual_component(actor=user.email, change_summary=change_summary, **data)


@router.get("/components/{component_id}", response_model=models.CatalogComponent,
            response_model_exclude_unset=True, summary="Read a catalog component")
def get_catalog_component(
    component_id: str,
    representation: str = Query(default=""),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    with value_errors_as(400):
        component = catalog_service.get_component(
            component_id, representation_id=representation
        )
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.get("/components/{component_id}/revisions", response_model=models.ComponentRevisionPage,
            response_model_exclude_unset=True, summary="List component revisions")
def list_component_revisions(component_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    with value_errors_as(404):
        return {"items": catalog_service.list_component_revisions(component_id)}


@router.get("/components/{component_id}/revisions/compare", response_model=models.RevisionComparison,
            response_model_exclude_unset=True, summary="Compare component revisions")
def compare_component_revisions(
    component_id: str,
    before: str = Query(...),
    after: str = Query(...),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    with value_errors_as(404):
        return catalog_service.compare_component_revisions(component_id, before, after)


@router.get("/components/{component_id}/revisions/{revision_id}", response_model=models.CatalogComponent,
            response_model_exclude_unset=True, summary="Read a component revision")
def get_component_revision(
    component_id: str,
    revision_id: str,
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    revision = catalog_service.get_component_revision(component_id, revision_id)
    if not revision:
        raise HTTPException(status_code=404, detail="Component revision not found")
    return revision


@router.get("/components/{component_id}/audit", response_model=models.AuditEventPage,
            response_model_exclude_unset=True, summary="List component audit events")
def list_component_audit(component_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    with value_errors_as(404):
        return {"items": catalog_service.list_component_audit_events(component_id)}


@router.get("/components/{component_id}/audit/verify", response_model=models.AuditVerification,
            response_model_exclude_unset=True, summary="Verify the component audit chain")
def verify_component_audit(component_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    with value_errors_as(404):
        return catalog_service.verify_component_audit_chain(component_id)


@router.get("/components/{component_id}/usage", response_model=models.ComponentUsagePage,
            response_model_exclude_unset=True, summary="List where a component is used")
def list_component_usage(
    component_id: str,
    mode: str = Query(default="current", pattern="^(current|history)$"),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    with value_errors_as(404):
        visible_projects = {str(project["id"]) for project in workspace.get_all_projects(user.role)}
        items = catalog_service.list_component_usage(component_id, include_history=mode == "history")
        return {"items": [item for item in items if str(item.get("project_id") or "") in visible_projects]}


@router.get("/components/{component_id}/reviews", response_model=models.ComponentReviewDecisionPage,
            response_model_exclude_unset=True, summary="List component review decisions")
def list_component_reviews(component_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    with value_errors_as(404):
        return {"items": catalog_service.list_component_review_decisions(component_id)}


@router.get("/components/{component_id}/releases", response_model=models.ComponentReleaseRecordPage,
            response_model_exclude_unset=True, summary="List component release records")
def list_component_releases(component_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    with value_errors_as(404):
        return {"items": catalog_service.list_component_release_records(component_id)}


@router.get("/previews/{preview_id}", response_class=Response, summary="Read a catalog preview",
            responses={200: {"content": {"image/svg+xml": {}}, "description": "The stored preview image"}})
def get_catalog_preview(
    preview_id: str, request: Request, user: AuthenticatedUser = Depends(require_catalog_browser)
):
    _ = user
    preview = catalog_service.catalog_preview_path(preview_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Preview not found")
    path, content_type = preview
    return preview_file_response(request, path, content_type, {"Cache-Control": "private, max-age=300"})


@router.get("/assets/{asset_id}/content", response_class=FileResponse, summary="Read a catalog asset file",
            responses={200: {"content": {
                "application/x-kicad-symbol": {}, "application/x-kicad-footprint": {},
                "model/step": {}, "application/x-spice": {}, "application/octet-stream": {},
            }, "description": "The stored asset bytes"}})
def get_catalog_asset_content(asset_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    """Serve an asset's stored bytes so the browser can render it.

    Deliberately not the placement payload from the remote-provider download:
    that one rewrites a symbol's footprint reference and a footprint's
    3D-model paths for KiCad. A renderer wants the library file itself.
    """
    _ = user
    asset = catalog_service.catalog_asset_source(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    path, content_type, filename = asset
    return FileResponse(
        path,
        media_type=content_type,
        # Assets are immutable once written -- a change produces a new asset
        # row -- but they are catalog content, so keep the cache private.
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


def _revision(request: Request, component_id: str, *, required: bool = True) -> str:
    """The component revision ``If-Match`` names (``"component:<id>:<revision id>"``); "" when optional and absent."""
    return preconditions.if_match(request, "component", component_id, required=required) or ""


@router.patch("/components/{component_id}", response_model=models.CatalogComponent,
              response_model_exclude_unset=True, summary="Update a catalog component")
def update_catalog_component(
    component_id: str,
    payload: UpdateComponentMetadataRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    request_data = payload.model_dump()
    expected_revision_id = _revision(request, component_id)
    change_summary = str(request_data.pop("change_summary") or "Update component metadata")
    updates: dict[str, Any] = {
        key: value
        for key, value in request_data.items()
        if value is not None
    }
    with value_errors_as(400, keep_typed=True):
        component = catalog_service.update_component_metadata(
            component_id,
            updates,
            actor=user.email,
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/representations", status_code=201,
             response_model=models.CatalogComponent, response_model_exclude_unset=True,
             summary="Add a component representation")
def create_component_representation(
    component_id: str,
    payload: CreateRepresentationRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    with value_errors_as(400, keep_typed=True):
        return catalog_service.create_representation(
            component_id,
            label=payload.label,
            symbol_asset_id=payload.symbol_asset_id,
            footprint_asset_id=payload.footprint_asset_id,
            display_order=payload.display_order,
            make_default=payload.is_default,
            source_internal_part_number=payload.source_internal_part_number,
            provenance=payload.provenance,
            expected_revision_id=_revision(request, component_id),
            actor=user.email,
            change_summary=payload.change_summary,
        )


@router.patch("/components/{component_id}/representations/{representation_id}",
              response_model=models.CatalogComponent, response_model_exclude_unset=True,
              summary="Update a component representation")
def update_component_representation(
    component_id: str,
    representation_id: str,
    payload: UpdateRepresentationRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    updates = {
        key: value
        for key, value in payload.model_dump(exclude={"change_summary"}).items()
        if value is not None
    }
    with value_errors_as(400, keep_typed=True):
        return catalog_service.update_representation(
            component_id,
            representation_id,
            updates=updates,
            expected_revision_id=_revision(request, component_id),
            actor=user.email,
            change_summary=payload.change_summary,
        )


@router.delete("/components/{component_id}/representations/{representation_id}",
               response_model=models.CatalogComponent, response_model_exclude_unset=True,
               summary="Delete a component representation")
def delete_component_representation(
    component_id: str,
    representation_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    with value_errors_as(400, keep_typed=True):
        return catalog_service.delete_representation(
            component_id,
            representation_id,
            expected_revision_id=_revision(request, component_id),
            actor=user.email,
        )


@router.post("/components/{component_id}/symbol-import", response_model=models.SymbolImportResult,
             response_model_exclude_unset=True, summary="Import a symbol for a component")
async def import_symbol_library(
    component_id: str,
    file: UploadFile = File(...),
    target_library: str = Form(default=""),
    selected_symbol: str = Form(default=""),
    counterpart_asset_id: str = Form(default=""), *, request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded symbol library was empty")

    # Runs kicad-cli; a slow upgrade must not stall the event loop.
    with value_errors_as(400, keep_typed=True):
        return await asyncio.to_thread(
            catalog_service.import_symbol_library,
            component_id,
            upload_name=file.filename or "uploaded.kicad_sym",
            payload=payload,
            target_library=target_library or component_id,
            selected_symbol=selected_symbol,
            counterpart_asset_id=counterpart_asset_id,
            actor=user.email, expected_revision_id=_revision(request, component_id, required=False),
        )


@router.post("/components/{component_id}/footprint-import", response_model=models.FootprintImportResult,
             response_model_exclude_unset=True, summary="Import a footprint for a component")
async def import_footprint(
    component_id: str,
    file: UploadFile = File(...),
    target_library: str = Form(default=""),
    selected_footprint: str = Form(default=""),
    counterpart_asset_id: str = Form(default=""), *, request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded footprint payload was empty")

    with value_errors_as(400, keep_typed=True):
        return await asyncio.to_thread(
            catalog_service.import_footprint,
            component_id,
            upload_name=file.filename or "uploaded.kicad_mod",
            payload=payload,
            target_library=target_library or "Prism_Footprints",
            selected_footprint=selected_footprint,
            counterpart_asset_id=counterpart_asset_id,
            actor=user.email, expected_revision_id=_revision(request, component_id, required=False),
        )


@router.post("/components/{component_id}/assets/{asset_type}", response_model=models.ComponentMutation,
             response_model_exclude_unset=True, summary="Attach an auxiliary asset to a component")
async def import_auxiliary_asset(
    component_id: str,
    asset_type: str,
    file: UploadFile = File(...),
    target_library: str = Form(default=""), *, request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded asset payload was empty")

    with value_errors_as(400, keep_typed=True):
        return await asyncio.to_thread(
            catalog_service.attach_auxiliary_asset,
            component_id,
            asset_type=asset_type,
            upload_name=file.filename or f"{asset_type}.bin",
            payload=payload,
            target_library=target_library or "Prism_Assets",
            actor=user.email, expected_revision_id=_revision(request, component_id, required=False),
        )


@router.delete("/components/{component_id}/assets/{asset_type}", response_model=models.ComponentMutation,
               response_model_exclude_unset=True, summary="Detach an auxiliary asset from a component")
def detach_component_asset(
    component_id: str,
    asset_type: str,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    with value_errors_as(400):
        return catalog_service.detach_asset(component_id, asset_type, actor=user.email)


@router.delete("/components/{component_id}/assets/id/{asset_id}", response_model=models.ComponentMutation,
               response_model_exclude_unset=True, summary="Detach an asset from a component by id")
def detach_component_asset_by_id(
    component_id: str,
    asset_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    with value_errors_as(400, keep_typed=True):
        return catalog_service.detach_asset_by_id(
            component_id,
            asset_id,
            expected_revision_id=_revision(request, component_id),
            actor=user.email,
        )


@router.delete("/components/{component_id}", response_model=models.ComponentDeleteResult,
               response_model_exclude_unset=True, summary="Delete a catalog component")
def delete_catalog_component(component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    if not catalog_service.delete_component(component_id, actor=user.email):
        raise HTTPException(status_code=404, detail="Component not found")
    return {"ok": True}


@router.post("/components/{component_id}/release", response_model=models.CatalogComponent,
             response_model_exclude_unset=True, summary="Transition a component's release status")
def transition_release_status(
    component_id: str,
    payload: ReleaseStatusRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_reader),
):
    with value_errors_as(400, keep_typed=True):
        stage = payload.workflow_stage or payload.release_status
        next_stage = _normalize_workflow_stage(stage)
        component_before = catalog_service.get_component(component_id)
        if not component_before:
            raise HTTPException(status_code=404, detail="Component not found")
        current_stage = _normalize_workflow_stage(
            str(component_before.get("workflow_stage") or component_before.get("release_status") or "")
        )
        if not _can_transition_workflow(user, current_stage, next_stage):
            raise HTTPException(status_code=403, detail="Catalog workflow transition not allowed for this role")
        policy.authorize(user, workflow_policy.transition_action(next_stage), check_role=False)
        override_reason = payload.self_approval_override_reason.strip()
        if override_reason and not policy.role_allows(user.role, "catalog_admin"):
            raise HTTPException(status_code=403, detail="Only administrators may override two-person approval")
        component = catalog_service.set_release_status(
            component_id,
            stage,
            actor=user.email,
            self_approval_override_reason=override_reason,
            review_note=payload.review_note,
            actor_role=user.role,
            expected_revision_id=_revision(request, component_id, required=False),
            expected_manifest_hash=payload.expected_manifest_hash,
        )
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/previews/regenerate", response_model=models.CatalogComponent,
             response_model_exclude_unset=True, summary="Regenerate a component's previews")
def regenerate_component_previews(component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    with value_errors_as(400):
        component = catalog_service.regenerate_component_previews(component_id, actor=user.email)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/components/{component_id}/validate", response_model=models.CatalogJobQueued,
             response_model_exclude_unset=True, summary="Validate a component with KLC")
def validate_component_klc(component_id: str, user: AuthenticatedUser = Depends(require_catalog_writer)):
    job = _enqueue_catalog_job(
        "catalog_validation",
        {"component_ids": [component_id]},
        actor=user.email,
    )
    return {"job_id": job["id"], "status": job["status"]}


@router.get("/components/{component_id}/validation", response_model=models.ComponentValidation,
            response_model_exclude_unset=True, summary="Read a component's validation")
def get_component_validation(component_id: str, user: AuthenticatedUser = Depends(require_catalog_browser)):
    _ = user
    with value_errors_as(404):
        return catalog_service.get_component_validation(component_id)


@router.post("/validation/run", response_model=models.CatalogJobQueued, response_model_exclude_unset=True,
             summary="Validate the catalog")
def validate_catalog(user: AuthenticatedUser = Depends(require_catalog_writer)):
    job = _enqueue_catalog_job("catalog_validation", {"component_ids": None}, actor=user.email)
    return {"job_id": job["id"], "status": job["status"]}


@router.get("/validation/jobs/{job_id}", response_model=models.CatalogJob, response_model_exclude_unset=True,
            summary="Read a validation job")
def get_validation_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    job = catalog_jobs.get(job_id, "catalog_validation")
    if not job:
        raise HTTPException(status_code=404, detail="Validation job not found")
    return job


@router.get("/validation/runs/{run_id}", response_model=models.ValidationRun,
            response_model_exclude_unset=True, summary="Read a validation run")
def get_validation_run(run_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    run = catalog_service.get_validation_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Validation run not found")
    return run


@router.get("/validation/runs/{run_id}/{report_name}", response_class=FileResponse,
            summary="Read a validation report",
            responses={200: {"content": {
                "application/json": {}, "application/xml": {}, "text/plain": {},
            }, "description": "The stored validation report"}})
def get_validation_report(run_id: str, report_name: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    path = catalog_service.validation_report_path(run_id, report_name)
    if not path:
        raise HTTPException(status_code=404, detail="Validation report not found")
    media_type = "application/json" if report_name.endswith(".json") else "application/xml" if report_name.endswith(".xml") else "text/plain"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.post("/previews/generate-missing", response_model=models.CatalogJobQueued,
             response_model_exclude_unset=True, summary="Generate missing component previews")
def generate_missing_previews(user: AuthenticatedUser = Depends(require_catalog_writer)):
    job = _enqueue_catalog_job("catalog_preview_generation", {}, actor=user.email)
    return {"job_id": job["id"], "status": job["status"]}


@router.get("/previews/jobs/{job_id}", response_model=models.CatalogJob, response_model_exclude_unset=True,
            summary="Read a preview generation job")
def get_preview_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    job = catalog_jobs.get(job_id, "catalog_preview_generation")
    if not job:
        raise HTTPException(status_code=404, detail="Preview generation job not found")
    return job


@router.post("/artifacts/maintenance", status_code=202, response_model=models.CatalogJobQueued,
             response_model_exclude_unset=True, summary="Run artifact maintenance")
def run_artifact_maintenance(user: AuthenticatedUser = Depends(require_catalog_admin)):
    job = _enqueue_catalog_job("artifact_maintenance", {}, actor=user.email)
    return {"job_id": job["id"], "status": job["status"]}


# ─── Component metadata field registry and bulk editing ────────────────────

def _metadata_batch_for_user(batch_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    batch = catalog_service.get_metadata_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Metadata batch not found")
    require_owner_or_admin(user, batch.get("created_by"), detail="Metadata batch access denied")
    return batch


@router.get("/metadata/fields", response_model=models.MetadataFieldPage, response_model_exclude_unset=True,
            summary="List metadata fields")
def list_metadata_fields(
    include_archived: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    return {"schema": "prism.component_metadata_a1", "items": catalog_service.list_metadata_fields(include_archived=include_archived)}


@router.post("/metadata/fields", status_code=201, response_model=models.MetadataField,
             response_model_exclude_unset=True, summary="Create a metadata field")
def create_metadata_field(payload: MetadataFieldRequest, user: AuthenticatedUser = Depends(require_catalog_admin)):
    with value_errors_as(400):
        return catalog_service.create_metadata_field(payload.model_dump(), actor=user.email)


@router.patch("/metadata/fields/{field_id}", response_model=models.MetadataField,
              response_model_exclude_unset=True, summary="Update a metadata field")
def update_metadata_field(field_id: str, payload: MetadataFieldRequest, user: AuthenticatedUser = Depends(require_catalog_admin)):
    with value_errors_as(400):
        return catalog_service.update_metadata_field(field_id, payload.model_dump(exclude_unset=True), actor=user.email)


@router.post("/metadata/fields/{field_id}/archive", response_model=models.MetadataField,
             response_model_exclude_unset=True, summary="Archive a metadata field")
def archive_metadata_field(field_id: str, user: AuthenticatedUser = Depends(require_catalog_admin)):
    with value_errors_as(400):
        return catalog_service.set_metadata_field_archived(field_id, True, actor=user.email)


@router.post("/metadata/fields/{field_id}/restore", response_model=models.MetadataField,
             response_model_exclude_unset=True, summary="Restore a metadata field")
def restore_metadata_field(field_id: str, user: AuthenticatedUser = Depends(require_catalog_admin)):
    with value_errors_as(400):
        return catalog_service.set_metadata_field_archived(field_id, False, actor=user.email)


@router.get("/metadata/grid-preferences", response_model=models.MetadataGridPreferences,
            response_model_exclude_unset=True, summary="Read metadata grid preferences")
def get_metadata_grid_preferences(user: AuthenticatedUser = Depends(require_catalog_browser)):
    return catalog_service.get_metadata_grid_preferences(user.email)


@router.put("/metadata/grid-preferences", response_model=models.MetadataGridPreferences,
            response_model_exclude_unset=True, summary="Save metadata grid preferences")
def save_metadata_grid_preferences(
    payload: MetadataGridPreferencesRequest,
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    return catalog_service.save_metadata_grid_preferences(user.email, payload.model_dump())


@router.get("/metadata/grid", response_model=models.MetadataGridPage, response_model_exclude_unset=True,
            summary="Read the metadata grid")
def metadata_grid(
    q: str = Query(default=""),
    availability_state: str | None = Query(default=None),
    workflow_stage: str | None = Query(default=None),
    validation_status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=200),
    sort_by: str = Query(default="updated_at"),
    sort_dir: str = Query(default="desc"),
    field: list[str] | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    _ = user
    with value_errors_as(400):
        return catalog_service.metadata_grid(
            query=q, availability_state=availability_state, workflow_stage=workflow_stage,
            validation_status=validation_status, category=category, page=page,
            page_size=page_size, sort_by=sort_by, sort_dir=sort_dir, field_keys=field,
        )


@router.post("/metadata/batches", status_code=201, response_model=models.MetadataBatch,
             response_model_exclude_unset=True, summary="Stage a metadata batch")
def create_metadata_batch(payload: CreateMetadataBatchRequest, user: AuthenticatedUser = Depends(require_catalog_writer)):
    with value_errors_as(400):
        return catalog_service.stage_metadata_batch(
            [item.model_dump() for item in payload.items], source="grid", actor=user.email,
            change_summary=payload.change_summary,
        )


@router.get("/metadata/batches/{batch_id}", response_model=models.MetadataBatch,
            response_model_exclude_unset=True, summary="Read a metadata batch")
def get_metadata_batch(batch_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    return _metadata_batch_for_user(batch_id, user)


@router.post("/metadata/batches/{batch_id}/approve-fields", response_model=models.MetadataBatch,
             response_model_exclude_unset=True, summary="Approve a batch's proposed fields")
def approve_metadata_batch_fields(batch_id: str, user: AuthenticatedUser = Depends(require_catalog_admin)):
    _metadata_batch_for_user(batch_id, user)
    with value_errors_as(400):
        return catalog_service.approve_metadata_batch_fields(batch_id, actor=user.email)


@router.post("/metadata/batches/{batch_id}/apply", status_code=202, response_model=models.MetadataBatchStarted,
             response_model_exclude_unset=True, summary="Apply a metadata batch")
def apply_metadata_batch(
    batch_id: str,
    payload: ApplyMetadataBatchRequest,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _metadata_batch_for_user(batch_id, user)
    selection_key = hashlib.sha256(
        "\n".join(sorted(payload.item_ids)).encode("utf-8")
    ).hexdigest()[:16] if payload.item_ids else "all"
    job = _enqueue_catalog_job(
        "catalog_metadata_batch",
        {"batch_id": batch_id, "item_ids": payload.item_ids, "actor": user.email},
        actor=user.email,
        idempotency_key=f"metadata-batch:{batch_id}:{selection_key}",
    )
    return {"batch_id": batch_id, "job_id": job["id"], "status": job["status"]}


@router.get("/metadata/jobs/{job_id}", response_model=models.CatalogJob, response_model_exclude_unset=True,
            summary="Read a metadata job")
def get_metadata_job(job_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    job = catalog_jobs.get(job_id, "catalog_metadata_batch")
    if not job:
        raise HTTPException(status_code=404, detail="Metadata job not found")
    require_owner_or_admin(user, job.get("created_by"), detail="Metadata job access denied")
    return job


@router.get("/metadata/export.csv", response_class=StreamingResponse, summary="Export component metadata as CSV",
            responses={200: {"content": {"text/csv": {}}, "description": "The metadata CSV export"}})
def export_metadata_csv(
    field: list[str] | None = Query(default=None),
    user: AuthenticatedUser = Depends(require_catalog_browser),
):
    selected_fields = field
    if selected_fields is None:
        preferences = catalog_service.get_metadata_grid_preferences(user.email)
        if "visible" in preferences:
            selected_fields = [str(key) for key in preferences.get("visible") or []]
    with value_errors_as(400):
        return StreamingResponse(
            chain(("\ufeff",), catalog_service.iter_metadata_csv(field_keys=selected_fields)),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="prism-component-metadata.csv"'},
        )


@router.post("/metadata/import-csv/preview", status_code=201, response_model=models.MetadataCsvPreview,
             response_model_exclude_unset=True, summary="Preview a metadata CSV import")
async def preview_metadata_csv(
    file: UploadFile = File(...),
    change_summary: str = Form(default="Import component metadata from CSV"),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    try:
        with value_errors_as(400):
            return catalog_service.preview_metadata_csv(content.decode("utf-8-sig"), actor=user.email, change_summary=change_summary)
    finally:
        await file.close()


@router.get("/metadata/batches/{batch_id}/report.csv", response_class=Response,
            summary="Export a metadata batch report",
            responses={200: {"content": {"text/csv": {}}, "description": "The batch result CSV"}})
def metadata_batch_report(batch_id: str, user: AuthenticatedUser = Depends(require_catalog_reader)):
    batch = _metadata_batch_for_user(batch_id, user)
    output = ["component_id,mpn,status,error"]
    for item in batch["items"]:
        values = [item["component_id"], item["mpn"], item["validation_status"], item["error_message"]]
        output.append(",".join('"' + str(value).replace('"', '""') + '"' for value in values))
    return Response(
        content="\n".join(output) + "\n", media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="metadata-batch-{batch_id}.csv"'},
    )


@router.post("/exports/kicad-dbl", response_model=models.KicadDblBundle, response_model_exclude_unset=True,
             summary="Export a KiCad database library bundle")
def export_kicad_dbl_bundle(user: AuthenticatedUser = Depends(require_catalog_writer)):
    _ = user
    with value_errors_as(400):
        return catalog_service.export_kicad_dbl_bundle()


# ─── Phase 2: CSV Import Routes ──────────────────────────────────────────────

@router.get("/inventory/export.csv", response_class=Response, summary="Export the component inventory as CSV",
            responses={200: {"content": {"text/csv": {}}, "description": "The inventory CSV export"}})
def export_inventory_csv(user: AuthenticatedUser = Depends(require_catalog_reader)):
    _ = user
    return Response(
        content="\ufeff" + catalog_service.export_inventory_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="component-inventory.csv"'},
    )


@router.post("/inventory/sync-csv", response_model=models.InventoryImportResult,
             response_model_exclude_unset=True, summary="Import inventory from CSV")
async def import_inventory_csv(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    content = await file.read()
    with caller_errors((ValueError, 400), unexpected="Inventory import failed", unexpected_status=400):
        csv_str = content.decode("utf-8")
        return catalog_service.import_inventory_csv(csv_str)


# ─── Phase 2: Asset Browsing/Linking Routes ──────────────────────────────────

@router.get("/assets/browse", response_model=models.AssetBrowseResult, response_model_exclude_unset=True,
            summary="Browse stored library assets")
def browse_library_assets(
    asset_type: str = Query(...),
    q: str = Query("", max_length=200),
    limit: int = Query(50, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    with caller_errors((ValueError, 400), unexpected="Library assets could not be listed", unexpected_status=400):
        result = catalog_service.browse_library_assets(asset_type, q=q, limit=limit)
        return {"files": result["files"], "total": result["total"]}


class LinkAssetRequest(BaseModel):
    file_path: str
    target_library: str = ""
    target_name: str = ""
    counterpart_asset_id: str = ""

@router.post("/components/{component_id}/assets/{asset_type}/link", response_model=models.ComponentMutation,
             response_model_exclude_unset=True, summary="Link a stored library asset to a component")
def link_library_asset(
    component_id: str,
    asset_type: str,
    payload: LinkAssetRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_catalog_writer),
):
    _ = user
    with value_errors_as(400, keep_typed=True):
        return catalog_service.link_library_asset(
            component_id,
            asset_type,
            file_path_rel=payload.file_path,
            target_library=payload.target_library,
            target_name=payload.target_name,
            counterpart_asset_id=payload.counterpart_asset_id,
            actor=user.email, expected_revision_id=_revision(request, component_id, required=False),
        )
