"""Release Studio API.

Mounted at ``/api/projects``; every path lives under
``/{project_id}/release-studio`` because ``/{project_id}/releases`` already
serves Git tags and must keep doing so.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api import release_studio_models as models
from app.api._helpers import (
    SANDBOXED_CONTENT_HEADERS,
    authorized_project,
    get_project_for_role_or_404,
)
from app.core.security import (
    AuthenticatedUser,
    require_designer,
    require_project_release_actor,
    require_viewer,
)
from app.services import release_studio_service as store
from app.services.release_studio_publish_service import (
    BuildArchives,
    ReleasePublisher,
    forge_summary,
)
from app.services.job_kinds import JobSubject
from app.services.release_studio_build_service import RELEASE_BUILD
from app.services.supply.publish_hook import queue_snapshot

router = APIRouter(dependencies=[Depends(require_viewer)])
logger = logging.getLogger(__name__)

#: Reads a build's stored archives; the publisher shares it (and its readiness cache).
ARCHIVES = BuildArchives()
#: Approve -> package -> forge -> record. Blocking: routes call it via ``asyncio.to_thread``.
PUBLISHER = ReleasePublisher(archives=ARCHIVES)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CandidateRequest(BaseModel):
    config_key: str = Field("release", max_length=200)
    commit_sha: str = Field(..., pattern=r"^[0-9a-fA-F]{40}$")
    variant: str = Field("", max_length=200)
    board: str = Field("", max_length=500)
    schematic: str = Field("", max_length=500)
    bom_preset: str = Field("", max_length=200)
    identity: dict[str, Any] = Field(default_factory=dict)
    manufacturing: dict[str, Any] = Field(default_factory=dict)
    impedance_csv: str = Field("", max_length=200_000)
    stackup_pdf_b64: str = Field("", max_length=20_000_000)


class SourceDefaultsRequest(BaseModel):
    board: str = Field("", max_length=500)
    schematic: str = Field("", max_length=500)
    variant: str = Field("", max_length=200)
    bom_preset: str = Field("", max_length=200)


#: One acknowledged model key (``source_path::reference``), bounded like a path.
ModelKey = Annotated[str, Field(max_length=4096)]


class PublishRequest(BaseModel):
    tag: str = Field(..., min_length=1, max_length=100)
    title: str = Field("", max_length=200)
    notes: str = Field("", max_length=8000)
    # Attach the compliance draft (a working document, not a declaration) to the forge release.
    attach_compliance_draft: bool = False
    # Keys of the unpinned 3D models (``approvals.unpinned_models``) acknowledged.
    acknowledged_models: list[ModelKey] = Field(default_factory=list, max_length=5000)


class ReviewDecisionRequest(BaseModel):
    slot: str = Field(..., pattern="^(designer|qa)$")
    note: str = Field("", max_length=4000)
    acknowledged_models: list[ModelKey] = Field(default_factory=list, max_length=5000)


# ---------------------------------------------------------------------------
# Vendor profiles and source discovery
# ---------------------------------------------------------------------------
@router.get(
    "/{project_id}/release-studio/vendor-profiles",
    response_model=models.VendorProfileList,
    summary="List the vendor pack profiles Release Studio offers",
)
async def list_vendor_profiles(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    from app.release_studio.vendors import public_profile_payload

    return {"profiles": public_profile_payload()}


@router.get(
    "/{project_id}/release-studio/source",
    response_model=models.SourceResponse,
    summary="Discover KiCad sources, variants and BOM presets at a commit",
)
async def get_source(
    project_id: str,
    commit_sha: str = Query(..., min_length=40, max_length=40),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Discover KiCad files, variants, and BOM presets at an immutable commit."""

    project = authorized_project(user, project_id)
    if not _is_full_git_sha(commit_sha):
        raise HTTPException(status_code=400, detail="commit_sha must be a full 40-character hexadecimal Git SHA")
    repo_root = Path(str(project.get("path") or project.get("clone_path") or ""))
    for _ in range(6):
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    from app.release_studio.ipc import public_ipc_payload
    from app.release_studio.source import apply_source_defaults, discover_source

    try:
        source = discover_source(
            repo_root,
            commit_sha,
            str(project.get("relative_path") or ""),
            project_id=project_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Could not discover Release Studio source for project %s at %s",
            project_id,
            commit_sha,
        )
        raise HTTPException(
            status_code=400,
            detail="Could not inspect this revision's Release Studio source.",
        ) from exc
    try:
        source = apply_source_defaults(source, store.get_source_defaults(project_id))
    except Exception:
        logger.exception("Could not apply saved Source picks for project %s", project_id)
    return {"source": source, "ipc": public_ipc_payload(), "forge": forge_summary(project.get("repo_url"))}


@router.put(
    "/{project_id}/release-studio/source/defaults",
    response_model=models.SourceDefaultsResponse,
    summary="Remember the Source picks for the next release",
)
async def save_source_defaults(
    project_id: str,
    request: SourceDefaultsRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Remember Source picks for the next release of this project."""

    get_project_for_role_or_404(project_id, user.role)
    defaults = store.save_source_defaults(project_id, request.model_dump())
    return {"defaults": defaults}


@router.get(
    "/{project_id}/release-studio/tags/{tag}",
    response_model=models.ReleaseTagCheck,
    summary="Whether the forge already has a release tag",
)
async def check_release_tag(
    project_id: str,
    tag: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    def check() -> dict[str, Any]:
        project = authorized_project(user, project_id)
        return {"tag": tag, "exists": PUBLISHER.tag_taken(project, tag)}

    # Forge calls block for up to a minute; keep them off the event loop.
    return await asyncio.to_thread(check)


@router.get(
    "/{project_id}/release-studio/impedance-template.csv",
    response_class=Response,
    summary="Download the controlled-impedance template",
    responses={200: {"content": {"text/csv": {}}, "description": "The template CSV."}},
)
async def impedance_template(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    from app.release_studio.impedance import TEMPLATE_CSV

    return Response(
        content=TEMPLATE_CSV.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="controlled-impedance.csv"'},
    )


# ---------------------------------------------------------------------------
# Candidates and builds
# ---------------------------------------------------------------------------


@router.get(
    "/{project_id}/release-studio/candidates",
    response_model=models.CandidateList,
    summary="List release candidates with their build attempts",
)
async def list_candidates(
    project_id: str,
    config_key: str | None = Query(None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    candidates = store.list_candidates(project_id, config_key)
    for candidate in candidates:
        candidate["builds"] = store.list_builds(candidate["id"])
        candidate["latest_build"] = candidate["builds"][0] if candidate["builds"] else None
    return {"candidates": candidates}


@router.post(
    "/{project_id}/release-studio/candidates",
    response_model=models.CandidateCreated,
    summary="Queue a release build (idempotent on the candidate's build key)",
)
async def create_candidate(
    project_id: str,
    request: CandidateRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Enqueue a build. Idempotent on ``build_key`` once the closure resolves."""

    return await asyncio.to_thread(_create_candidate, project_id, request, user)


def _create_candidate(
    project_id: str, request: CandidateRequest, user: AuthenticatedUser
) -> dict[str, Any]:
    project = authorized_project(user, project_id, "design")
    PUBLISHER.require_new_tag(project, request.identity)
    job = RELEASE_BUILD.enqueue(
        {
            "project_id": project_id,
            "config_key": request.config_key,
            "commit_sha": request.commit_sha,
            "variant": request.variant,
            "board": request.board,
            "schematic": request.schematic,
            "bom_preset": request.bom_preset,
            "identity": request.identity,
            "manufacturing": request.manufacturing,
            "impedance_csv": request.impedance_csv,
            "stackup_pdf_b64": request.stackup_pdf_b64,
            "author": user.email,
        },
        subject=JobSubject(project_id=project_id),
        requested_by=user.email,
        artifact_key=(
            f"release-studio:{project_id}:{request.commit_sha}:"
            f"{request.variant}:{request.identity.get('tag') or request.config_key}"
        ),
    )
    _remember_source_defaults(
        project_id,
        board=request.board,
        schematic=request.schematic,
        variant=request.variant,
        bom_preset=request.bom_preset,
    )
    return {"job": job}


@router.get(
    "/{project_id}/release-studio/candidates/{candidate_id}",
    response_model=models.CandidateWithBuilds,
    summary="Read one release candidate with its build attempts",
)
async def get_candidate(
    project_id: str, candidate_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    candidate = store.get_candidate(candidate_id)
    if candidate is None or candidate["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate["builds"] = store.list_builds(candidate_id)
    candidate["latest_build"] = candidate["builds"][0] if candidate["builds"] else None
    return candidate


@router.get(
    "/{project_id}/release-studio/builds/{build_id}",
    response_model=models.BuildDetail,
    summary="A build with its configuration, readiness and sign-offs",
)
async def get_build(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    # Polled every few seconds while Publish is open; the forge lookup blocks.
    return await asyncio.to_thread(_build_detail, project_id, build_id, user)


def _build_detail(project_id: str, build_id: str, user: AuthenticatedUser) -> dict[str, Any]:
    return PUBLISHER.detail(project_id, authorized_project(user, project_id), build_id, user)


def _is_full_git_sha(value: str) -> bool:
    return len(value) == 40 and all(char in "0123456789abcdefABCDEF" for char in value)


def _remember_source_defaults(project_id: str, **fields: str) -> None:
    """Best-effort persist of last Source picks. A miss must not fail the build."""

    try:
        store.save_source_defaults(project_id, fields)
    except Exception:
        logger.exception("Could not persist Release Studio source defaults for project %s", project_id)


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/dossier",
    response_class=Response,
    summary="Download a build's dossier archive",
    responses={200: {"content": {"application/gzip": {}}, "description": "The dossier tarball."}},
)
async def download_dossier(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    build = ARCHIVES.build(project_id, build_id)
    payload = ARCHIVES.artifact_bytes(build["dossier_artifact_id"])
    return Response(
        content=payload,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="dossier-{build_id}.tar.gz"'},
    )


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/vendor-packs/{vendor_id}",
    response_class=Response,
    summary="Download one vendor pack for a build",
    responses={200: {"content": {"application/zip": {}}, "description": "The vendor pack zip."}},
)
async def download_build_vendor_pack(
    project_id: str,
    build_id: str,
    vendor_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    build = ARCHIVES.build(project_id, build_id)
    pack, pack_filename = ARCHIVES.vendor_pack(build, vendor_id)
    return Response(
        content=pack,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="build-{build["id"]}-{pack_filename}"'},
    )


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/sheets",
    response_model=models.DocumentSheetList,
    summary="List the composed documentation sheets of a build",
)
async def list_document_sheets(
    project_id: str,
    build_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """List composed sheets without making the client infer them from members."""

    get_project_for_role_or_404(project_id, user.role)
    ARCHIVES.build(project_id, build_id)
    by_key: dict[str, dict[str, Any]] = {}
    for member in store.build_members(build_id):
        path = str(member.get("path") or "")
        if not path.startswith("documentation/"):
            continue
        filename = path.removeprefix("documentation/")
        if filename.endswith(".pdf"):
            key = filename.removesuffix(".pdf")
            by_key.setdefault(key, {"key": key})["pdf"] = {
                "path": path,
                "released_digest": member["released_digest"],
                "media_type": member.get("media_type") or "application/pdf",
            }
    return {"sheets": [by_key[key] for key in sorted(by_key)]}


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/sheets/{sheet_key}.pdf",
    response_class=Response,
    summary="Preview one composed documentation sheet",
    responses={200: {"content": {"application/pdf": {}}, "description": "The sheet PDF."}},
)
async def preview_document_sheet(
    project_id: str,
    build_id: str,
    sheet_key: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Serve the immutable PDF preview for one composed documentation document."""

    if not sheet_key or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in sheet_key):
        raise HTTPException(status_code=404, detail="Sheet not found")
    return await download_member(
        project_id,
        build_id,
        f"documentation/{sheet_key}.pdf",
        disposition="inline",
        user=user,
    )


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/members/{member_path:path}",
    response_class=Response,
    summary="Serve one released member out of the dossier, digest-checked",
    responses={
        200: {
            "content": {
                "application/octet-stream": {},
                "application/pdf": {},
                "image/svg+xml": {},
                "text/plain": {},
            },
            "description": "The released member bytes.",
        }
    },
)
async def download_member(
    project_id: str,
    build_id: str,
    member_path: str,
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Serve one released member out of the dossier, digest-checked.

    Viewing an output is only meaningful if what you are shown is the released
    bytes, so the extracted member is hashed and compared with the manifest's
    ``released_digest`` before it is returned.  A mismatch means the stored
    dossier no longer matches the record and is a hard error, never a silent
    best effort.
    """

    get_project_for_role_or_404(project_id, user.role)
    build = ARCHIVES.build(project_id, build_id)
    member = next(
        (
            item
            for item in store.build_members(build_id)
            if item["path"] == member_path
        ),
        None,
    )
    # Resolving through the members table is also what keeps a crafted path from
    # reaching an arbitrary archive entry: only recorded members are addressable.
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found in this build")

    data = ARCHIVES.released_members(build, [member]).get(member_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Member is absent from the stored dossier")

    digest = member["released_digest"]
    filename = member_path.rsplit("/", 1)[-1]
    return Response(
        content=data,
        media_type=member["media_type"] or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            # The bytes are immutable and named by their digest.
            "Cache-Control": "private, max-age=31536000, immutable",
            "ETag": f'"{digest}"',
            **SANDBOXED_CONTENT_HEADERS,
        },
    )


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/logs",
    response_model=models.BuildLogs,
    summary="Which steps have a log, how long each took, and how it ended",
)
async def list_build_logs(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """Which steps have a log, how long each took, and how it ended."""

    get_project_for_role_or_404(project_id, user.role)
    return ARCHIVES.logs(project_id, build_id)


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/logs/{step_id}",
    response_class=Response,
    summary="Serve one build step's full log",
    responses={200: {"content": {"text/plain": {}}, "description": "The step's full log."}},
)
async def download_build_log(
    project_id: str,
    build_id: str,
    step_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Serve one step's full log out of build-evidence.

    The job row keeps a 4000-character tail and is pruned on the job retention
    schedule; this is the copy that lives as long as the release does.
    """

    get_project_for_role_or_404(project_id, user.role)
    payload = ARCHIVES.log(project_id, build_id, step_id)
    return Response(content=payload, media_type="text/plain; charset=utf-8")


@router.get(
    "/{project_id}/release-studio/builds/{build_id}/build-evidence",
    response_class=Response,
    summary="Download a build's captured evidence archive",
    responses={200: {"content": {"application/gzip": {}}, "description": "The evidence tarball."}},
)
async def download_build_evidence(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    build = ARCHIVES.build(project_id, build_id)
    payload = ARCHIVES.artifact_bytes(build["evidence_artifact_id"])
    return Response(
        content=payload,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="evidence-{build_id}.tar.gz"'},
    )


# ---------------------------------------------------------------------------
# Publish to GitHub / GitLab
# ---------------------------------------------------------------------------


@router.post(
    "/{project_id}/release-studio/builds/{build_id}/approvals",
    response_model=models.ApprovalDecision,
    summary="Record a designer or QA approval on a build",
)
async def approve_build(
    project_id: str,
    build_id: str,
    request: ReviewDecisionRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    get_project_for_role_or_404(project_id, user.role)
    return await asyncio.to_thread(
        PUBLISHER.decide,
        project_id,
        build_id,
        slot=request.slot,
        decision="approved",
        note=request.note,
        actor=user,
        acknowledged_models=request.acknowledged_models,
    )


@router.post(
    "/{project_id}/release-studio/builds/{build_id}/approvals/withdraw",
    response_model=models.ApprovalDecision,
    summary="Withdraw a previously recorded approval",
)
async def withdraw_build_approval(
    project_id: str,
    build_id: str,
    request: ReviewDecisionRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    get_project_for_role_or_404(project_id, user.role)
    return await asyncio.to_thread(
        PUBLISHER.decide,
        project_id,
        build_id,
        slot=request.slot,
        decision="withdrawn",
        note=request.note,
        actor=user,
    )


@router.post(
    "/{project_id}/release-studio/builds/{build_id}/publish",
    response_model=models.PublishResult,
    summary="Zip the dossier, attach selected vendor packs, and publish the forge release",
)
async def publish_build(
    project_id: str,
    build_id: str,
    request: PublishRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    """Zip the dossier, attach ready selected vendor packs, and create the forge Release."""

    return await asyncio.to_thread(_publish_build, project_id, build_id, request, user)


def _publish_build(
    project_id: str, build_id: str, request: PublishRequest, user: AuthenticatedUser
) -> dict[str, Any]:
    project = authorized_project(user, project_id, "release")
    return PUBLISHER.publish(
        project_id,
        project,
        build_id,
        tag=request.tag,
        notes=request.notes,
        actor=user,
        acknowledged_models=request.acknowledged_models,
        # The compliance draft (a working document, not a declaration) goes to the forge release when asked for.
        attach=(lambda filename: _compliance_draft_assets(build_id, filename)) if request.attach_compliance_draft else None,
        # What supply data said at publish is taken by a worker job and kept beside the record. Evidence only; never part of a digest.
        after=lambda tag, commit_sha: queue_snapshot(project_id, build_id, tag, commit_sha, user.email),
    )


def _compliance_draft_assets(build_id: str, zip_filename: str) -> list[tuple[str, bytes]]:
    """The RoHS and REACH draft for the build's BOM as a CSV named for the release; none when it cannot be made."""

    try:
        from app.services.supply import catalog_read, compliance_draft, release_bom, release_source
        from app.services.supply.store import supply_store

        read = release_bom.lines_from_csv(release_source.build_bom_text(build_id), catalog_read.identities)
        with supply_store.connection() as conn:
            draft = compliance_draft.build(conn, [
                {"key": line.key, "manufacturer": line.manufacturer, "mpn": line.mpn, "quantity": line.quantity,
                 "references": line.references, "lcsc": line.lcsc}
                for line in read.lines
            ])
        return [(f"{zip_filename.removesuffix('.zip')}-compliance-draft.csv", compliance_draft.to_csv(draft).encode("utf-8"))]
    except Exception:  # noqa: BLE001 - an attachment that cannot be made must not stop the release
        logger.warning("Compliance draft not attached to build %s", build_id, exc_info=True)
        return []
