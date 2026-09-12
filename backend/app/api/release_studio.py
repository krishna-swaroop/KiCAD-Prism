"""Release Studio API.

Mounted at ``/api/projects``; every path lives under
``/{project_id}/release-studio`` because ``/{project_id}/releases`` already
serves Git tags and must keep doing so.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import tarfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api._helpers import get_project_for_role_or_404
from app.core.security import (
    AuthenticatedUser,
    require_designer,
    require_project_release_actor,
    require_viewer,
)
from app.services import forge_publish_service as forge_publish
from app.services import release_studio_build_service as build_service
from app.services import release_studio_service as store
from app.services.job_service import jobs
from app.services.workspace_service import workspace

router = APIRouter(dependencies=[Depends(require_viewer)])
logger = logging.getLogger(__name__)


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


class PublishRequest(BaseModel):
    tag: str = Field(..., min_length=1, max_length=100)
    title: str = Field("", max_length=200)
    notes: str = Field("", max_length=8000)


class ReviewDecisionRequest(BaseModel):
    slot: str = Field(..., pattern="^(designer|qa)$")
    note: str = Field("", max_length=4000)


# ---------------------------------------------------------------------------
# Vendor profiles and source discovery
# ---------------------------------------------------------------------------
@router.get("/{project_id}/release-studio/vendor-profiles")
async def list_vendor_profiles(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    from app.release_studio.vendors import public_profile_payload

    return {"profiles": public_profile_payload()}


@router.get("/{project_id}/release-studio/source")
async def get_source(
    project_id: str,
    commit_sha: str = Query(..., min_length=40, max_length=40),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Discover KiCad files, variants, and BOM presets at an immutable commit."""

    get_project_for_role_or_404(project_id, user.role)
    if not _is_full_git_sha(commit_sha):
        raise HTTPException(status_code=400, detail="commit_sha must be a full 40-character hexadecimal Git SHA")
    project = workspace.get_project_by_id(project_id) or {}
    repo_root = Path(str(project.get("path") or project.get("clone_path") or ""))
    for _ in range(6):
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    from app.release_studio.ipc import public_ipc_payload
    from app.release_studio.source import apply_source_defaults, discover_source

    try:
        source = discover_source(
            repo_root, commit_sha, str(project.get("relative_path") or "")
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
    try:
        forge = forge_publish.describe_forge(str(project.get("repo_url") or "")).to_dict()
    except forge_publish.ForgePublishError as exc:
        forge = {
            "kind": "unsupported",
            "name": "",
            "host": "",
            "owner_repo": "",
            "token_configured": False,
            "token_hint": str(exc),
        }
    return {"source": source, "ipc": public_ipc_payload(), "forge": forge}


@router.put("/{project_id}/release-studio/source/defaults")
async def save_source_defaults(
    project_id: str,
    request: SourceDefaultsRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Remember Source picks for the next release of this project."""

    get_project_for_role_or_404(project_id, user.role)
    defaults = store.save_source_defaults(project_id, request.model_dump())
    return {"defaults": defaults}


@router.get("/{project_id}/release-studio/tags/{tag}")
async def check_release_tag(
    project_id: str,
    tag: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    project = workspace.get_project_by_id(project_id) or {}
    exists = forge_publish.tag_exists(str(project.get("repo_url") or ""), tag)
    return {"tag": tag, "exists": exists}


@router.get("/{project_id}/release-studio/impedance-template.csv")
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


@router.get("/{project_id}/release-studio/candidates")
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


@router.post("/{project_id}/release-studio/candidates")
async def create_candidate(
    project_id: str,
    request: CandidateRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Enqueue a build. Idempotent on ``build_key`` once the closure resolves."""

    get_project_for_role_or_404(project_id, user.role)
    project = workspace.get_project_by_id(project_id) or {}
    _require_enqueue_identity(request.identity, project)
    job = jobs.enqueue(
        "release_studio_build",
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
        project_id=project_id,
        requested_by=user.email,
        artifact_key=(
            f"release-studio:{project_id}:{request.commit_sha}:"
            f"{request.variant}:{request.identity.get('tag') or request.config_key}"
        ),
        # A build runs kicad-cli and a Cruncher board load; two of them on one
        # worker have been measured at 6.4 GiB peak RSS. Take the same slot
        # every other heavy job takes so they serialize instead of racing.
        resources={"prism_worker": 1},
    )
    _remember_source_defaults(
        project_id,
        board=request.board,
        schematic=request.schematic,
        variant=request.variant,
        bom_preset=request.bom_preset,
    )
    return {"job": job}


@router.get("/{project_id}/release-studio/candidates/{candidate_id}")
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


@router.get("/{project_id}/release-studio/builds/{build_id}")
async def get_build(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    candidate = store.get_candidate(str(build["candidate_id"])) or {}
    configuration = _candidate_configuration(project_id, candidate)
    project = workspace.get_project_by_id(project_id) or {}
    try:
        forge = forge_publish.describe_forge(str(project.get("repo_url") or "")).to_dict()
    except forge_publish.ForgePublishError as exc:
        forge = {
            "kind": "unsupported",
            "name": "",
            "host": "",
            "owner_repo": "",
            "token_configured": False,
            "token_hint": str(exc),
        }
    vendor_readiness = _vendor_readiness(build, configuration)
    approvals = _approval_state(project_id, build, candidate, configuration, vendor_readiness, user)
    tag = str(configuration.get("revision") or "").strip()
    forge_release = _live_forge_release(str(project.get("repo_url") or ""), tag, approvals.get("published"))
    return {
        "build": build,
        "candidate": candidate,
        "configuration": configuration,
        "members": store.build_members(build_id),
        "evidence": store.build_evidence(build_id),
        "fingerprints": store.build_fingerprints(build_id),
        "vendor_readiness": vendor_readiness,
        "forge": forge,
        "approvals": approvals,
        "forge_release": forge_release,
    }


def _is_full_git_sha(value: str) -> bool:
    return len(value) == 40 and all(char in "0123456789abcdefABCDEF" for char in value)


def _remember_source_defaults(project_id: str, **fields: str) -> None:
    """Best-effort persist of last Source picks. A miss must not fail the build."""

    try:
        store.save_source_defaults(project_id, fields)
    except Exception:
        logger.exception("Could not persist Release Studio source defaults for project %s", project_id)


@router.get("/{project_id}/release-studio/builds/{build_id}/dossier")
async def download_dossier(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    payload = _artifact_bytes(build["dossier_artifact_id"])
    return Response(
        content=payload,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="dossier-{build_id}.tar.gz"'},
    )


@router.get("/{project_id}/release-studio/builds/{build_id}/vendor-packs/{vendor_id}")
async def download_build_vendor_pack(
    project_id: str,
    build_id: str,
    vendor_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    return _vendor_pack_response(build, vendor_id)


@router.get("/{project_id}/release-studio/builds/{build_id}/sheets")
async def list_document_sheets(
    project_id: str,
    build_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """List composed sheets without making the client infer them from members."""

    get_project_for_role_or_404(project_id, user.role)
    _build_or_404(project_id, build_id)
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


@router.get("/{project_id}/release-studio/builds/{build_id}/sheets/{sheet_key}.pdf")
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


@router.get("/{project_id}/release-studio/builds/{build_id}/members/{member_path:path}")
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
    build = _build_or_404(project_id, build_id)

    return _released_member_response(
        build, member_path, disposition=disposition, build_id=build_id
    )


def _released_member_response(
    build: dict[str, Any],
    member_path: str,
    *,
    disposition: str = "inline",
    public_share: bool = False,
    build_id: str | None = None,
) -> Response:
    member = next(
        (
            item
            for item in store.build_members(build_id or build["id"])
            if item["path"] == member_path
        ),
        None,
    )
    # Resolving through the members table is also what keeps a crafted path from
    # reaching an arbitrary archive entry: only recorded members are addressable.
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found in this build")

    payload = _artifact_bytes(build["dossier_artifact_id"])
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
            extracted = archive.extractfile(member_path)
            if extracted is None:
                raise HTTPException(
                    status_code=404, detail="Member is absent from the stored dossier"
                )
            data = extracted.read()
    except tarfile.TarError as exc:
        logger.exception(
            "Could not read stored Release Studio dossier for build %s member %s",
            build_id or build["id"],
            member_path,
        )
        raise HTTPException(
            status_code=500, detail="The stored dossier could not be read."
        ) from exc

    actual = hashlib.sha256(data).hexdigest()
    if actual != member["released_digest"]:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Released digest mismatch for {member_path}: the manifest records "
                f"{member['released_digest']} but the stored dossier holds {actual}"
            ),
        )

    filename = member_path.rsplit("/", 1)[-1]
    return Response(
        content=data,
        media_type=member["media_type"] or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            # The bytes are immutable and named by their digest.
            "Cache-Control": (
                "private, no-store"
                if public_share
                else "private, max-age=31536000, immutable"
            ),
            "ETag": f'"{actual}"',
            # Released members are third-party bytes -- KiCad's SVG plots most
            # of all -- and SVG served inline from this origin is script.  The
            # sandbox and the sniffing block keep an inline view from becoming
            # a way to run code against a logged-in session.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        },
    )


@router.get("/{project_id}/release-studio/builds/{build_id}/logs")
async def list_build_logs(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """Which steps have a log, how long each took, and how it ended."""

    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    evidence_index = _evidence_json(build)
    steps = evidence_index.get("steps") or {}
    return {
        "timings": list(evidence_index.get("timings") or build.get("timings") or []),
        "steps": [
            {
                "step_id": step_id,
                "step_type": entry.get("step_type") or "",
                "returncode": entry.get("returncode"),
                "elapsed_ms": entry.get("elapsed_ms") or 0,
                "skipped_reason": entry.get("skipped_reason") or "",
                "argv": entry.get("normalized_argv") or [],
                # Failed/cancelled retained attempts carry this in their
                # canonical evidence index; consumers must not infer terminal
                # state from a missing process return code.
                "status": entry.get("status") or "",
            }
            for step_id, entry in sorted(steps.items())
        ],
    }


@router.get("/{project_id}/release-studio/builds/{build_id}/logs/{step_id}")
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

    if not step_id or any(
        ch not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for ch in step_id
    ):
        raise HTTPException(status_code=404, detail="Log not found")
    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    payload = _evidence_member(build, f"logs/{step_id}.log")
    if payload is None:
        raise HTTPException(status_code=404, detail="Log not found")
    return Response(content=payload, media_type="text/plain; charset=utf-8")


@router.get("/{project_id}/release-studio/builds/{build_id}/build-evidence")
async def download_build_evidence(
    project_id: str, build_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    payload = _artifact_bytes(build["evidence_artifact_id"])
    return Response(
        content=payload,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="evidence-{build_id}.tar.gz"'},
    )


# ---------------------------------------------------------------------------
# Publish to GitHub / GitLab
# ---------------------------------------------------------------------------


@router.post("/{project_id}/release-studio/builds/{build_id}/approvals")
async def approve_build(
    project_id: str,
    build_id: str,
    request: ReviewDecisionRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    get_project_for_role_or_404(project_id, user.role)
    return _record_decision(project_id, build_id, request.slot, "approved", request.note, user)


@router.post("/{project_id}/release-studio/builds/{build_id}/approvals/withdraw")
async def withdraw_build_approval(
    project_id: str,
    build_id: str,
    request: ReviewDecisionRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    get_project_for_role_or_404(project_id, user.role)
    return _record_decision(project_id, build_id, request.slot, "withdrawn", request.note, user)


@router.post("/{project_id}/release-studio/builds/{build_id}/publish")
async def publish_build(
    project_id: str,
    build_id: str,
    request: PublishRequest,
    user: AuthenticatedUser = Depends(require_project_release_actor),
):
    """Zip the dossier, attach ready selected vendor packs, and create the forge Release."""

    get_project_for_role_or_404(project_id, user.role)
    build = _build_or_404(project_id, build_id)
    if str(build.get("status") or "") != "succeeded":
        raise HTTPException(status_code=409, detail="Only a successful build can be published")
    candidate = store.get_candidate(str(build["candidate_id"])) or {}
    commit_sha = str(candidate.get("commit_sha") or "")
    if not _is_full_git_sha(commit_sha):
        raise HTTPException(status_code=409, detail="The build is not bound to a full Git commit")
    configuration = _candidate_configuration(project_id, candidate)
    tag, notes = _bound_release_identity(configuration, request)
    vendor_readiness = _vendor_readiness(build, configuration)
    approvals = _approval_state(project_id, build, candidate, configuration, vendor_readiness, user)
    if approvals.get("published"):
        raise HTTPException(status_code=409, detail="This build is already published")
    if not approvals.get("can_publish"):
        raise HTTPException(
            status_code=409,
            detail=approvals.get("blocked_reason") or "This build is not clear to publish",
        )
    project = workspace.get_project_by_id(project_id) or {}
    try:
        zip_bytes = forge_publish.dossier_tar_to_zip(_artifact_bytes(build.get("dossier_artifact_id")))
        filename = forge_publish.release_zip_filename(
            str(project.get("name") or project.get("parent_repo") or "release"),
            tag,
        )
        extra_assets, extra_names = _ready_vendor_pack_assets(build, configuration, filename)
        published = forge_publish.publish_release(
            repo_url=str(project.get("repo_url") or ""),
            commit_sha=commit_sha,
            tag=tag,
            title=tag,
            notes=notes,
            zip_bytes=zip_bytes,
            filename=filename,
            extra_assets=extra_assets,
        )
    except forge_publish.ForgePublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    try:
        record = store.record_publish(
            project_id=project_id,
            build_id=build_id,
            tag=tag,
            commit_sha=commit_sha,
            dossier_digest=str(build.get("dossier_digest") or ""),
            published_by=user.email,
            forge_url=str(published.get("url") or ""),
            asset_names=[filename, *extra_names],
            config_key=str(candidate.get("config_key") or ""),
        )
    except store.ReviewDecisionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {"release": published, "filename": filename, "publish": record}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_or_404(project_id: str, build_id: str) -> dict[str, Any]:
    build = store.get_build(build_id)
    if build is None:
        raise HTTPException(status_code=404, detail="Build not found")
    candidate = store.get_candidate(build["candidate_id"])
    if candidate is None or candidate["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Build not found")
    return build


def _candidate_configuration(project_id: str, candidate: dict[str, Any]) -> dict[str, Any]:
    try:
        return build_service.configuration_for_candidate(project_id, candidate)
    except build_service.BuildError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _bound_release_identity(
    configuration: dict[str, Any], request: PublishRequest
) -> tuple[str, str]:
    """Resolve the tag and notes from the build, refusing a browser's substitute.

    The build's configuration snapshot is authoritative: those are the values
    document composition printed. A request that names a different tag is a
    stale draft or a hand-rolled call, and publishing it would attach sheets
    that state one revision to a Release named another.
    """

    recorded_tag = str(configuration.get("revision") or "").strip()
    requested_tag = (request.tag or "").strip()
    if not recorded_tag:
        raise HTTPException(
            status_code=409,
            detail=(
                "This build recorded no tag, so there is no drawing revision to "
                "publish under. Start a new release and name the tag in Identity."
            ),
        )
    if requested_tag and requested_tag != recorded_tag:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This build was composed as {recorded_tag}; it cannot be published "
                f"as {requested_tag}. Publish is confirm-only -- start a new build "
                "to release under a different tag."
            ),
        )
    # Release notes reach the cover's revision-history table, so the published
    # description comes from the build too rather than from the browser.
    notes = str(configuration.get("release_notes") or "").strip() or request.notes
    return recorded_tag, notes


def _require_enqueue_identity(identity: dict[str, Any], project: dict[str, Any]) -> None:
    """Refuse a build that has no forge-legal Identity before KiCad runs."""

    tag = str(identity.get("tag") or "").strip()
    document = str(identity.get("document_name") or "").strip()
    date = str(identity.get("date") or "").strip()
    if not tag or not document or not date:
        raise HTTPException(
            status_code=400,
            detail="Tag, Document Name, and date are required before a build can start.",
        )
    try:
        forge_publish._require_tag(tag)
    except forge_publish.ForgePublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if forge_publish.tag_exists(str(project.get("repo_url") or ""), tag):
        raise HTTPException(
            status_code=409,
            detail=f"{tag} already exists on GitHub/GitLab.",
        )


def _approval_state(
    project_id: str,
    build: dict[str, Any],
    candidate: dict[str, Any],
    configuration: dict[str, Any],
    vendor_readiness: list[dict[str, Any]],
    user: AuthenticatedUser,
) -> dict[str, Any]:
    del project_id, configuration
    return store.build_approval_state(
        build=build,
        candidate=candidate,
        evidence=store.build_evidence(str(build["id"])),
        vendor_readiness=vendor_readiness,
        designer_row=store.latest_review_decision(str(build["id"]), "designer"),
        qa_row=store.latest_review_decision(str(build["id"]), "qa"),
        publish_row=store.get_publish_record(str(build["id"])),
        actor_email=user.email,
        actor_role=user.role,
    )


def _record_decision(
    project_id: str,
    build_id: str,
    slot: str,
    decision: str,
    note: str,
    user: AuthenticatedUser,
) -> dict[str, Any]:
    build = _build_or_404(project_id, build_id)
    candidate = store.get_candidate(str(build["candidate_id"])) or {}
    configuration = _candidate_configuration(project_id, candidate)
    vendor_readiness = _vendor_readiness(build, configuration)
    try:
        store.record_review_decision(
            project_id=project_id,
            build_id=build_id,
            slot=slot,
            actor=user.email,
            actor_role=user.role,
            decision=decision,
            note=note,
            dossier_digest=str(build.get("dossier_digest") or ""),
            author=str(candidate.get("created_by") or ""),
            published=store.get_publish_record(build_id) is not None,
            electrical_errors=store.electrical_error_kinds(store.build_evidence(build_id)),
            build_status=str(build.get("status") or ""),
            config_key=str(candidate.get("config_key") or ""),
        )
    except store.ReviewDecisionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    approvals = _approval_state(project_id, build, candidate, configuration, vendor_readiness, user)
    return {"approvals": approvals}


def _live_forge_release(
    repo_url: str, tag: str, published: dict[str, Any] | None
) -> dict[str, str] | None:
    """Join the public record by tag. A deleted forge Release looks unpublished."""

    if not tag:
        return None
    live = next(
        (row for row in forge_publish.list_releases(repo_url or None, limit=30) if row.get("tag") == tag),
        None,
    )
    if live is None:
        return None
    url = str(live.get("url") or (published or {}).get("forge_url") or "")
    return {"tag": tag, "url": url}


def _ready_vendor_pack_assets(
    build: dict[str, Any],
    configuration: dict[str, Any],
    zip_filename: str,
) -> tuple[list[tuple[str, bytes]], list[str]]:
    from app.release_studio.vendors import VendorPackError, build_vendor_pack, profile_by_id

    extras: list[tuple[str, bytes]] = []
    names: list[str] = []
    stem = zip_filename.removesuffix(".zip")
    for vendor_id in configuration.get("vendors") or []:
        try:
            profile = profile_by_id(str(vendor_id))
            pack = build_vendor_pack(
                str(vendor_id),
                dossier_bytes=_artifact_bytes(build.get("dossier_artifact_id")),
                evidence_bytes=_artifact_bytes(build.get("evidence_artifact_id"))
                if build.get("evidence_artifact_id")
                else b"",
            )
        except (KeyError, VendorPackError) as exc:
            raise HTTPException(
                status_code=409,
                detail=f"Selected vendor pack {vendor_id} is not ready: {exc}",
            ) from exc
        pack_name = f"{stem}-{profile.pack_filename}"
        extras.append((pack_name, pack))
        names.append(pack_name)
    return extras, names


def _vendor_readiness(build: dict[str, Any], configuration: dict[str, Any]) -> list[dict[str, Any]]:
    """Expose exact pack readiness; archive downloads use the same predicate."""

    return list(
        _cached_vendor_readiness(
            str(build.get("dossier_artifact_id") or ""),
            str(build.get("evidence_artifact_id") or ""),
            tuple(configuration.get("vendors") or []),
        )
    )


@lru_cache(maxsize=64)
def _cached_vendor_readiness(
    dossier_artifact_id: str,
    evidence_artifact_id: str,
    vendor_ids: tuple[str, ...],
) -> tuple[dict[str, Any], ...]:
    """Readiness for one immutable pair of archives.

    Build detail is polled every few seconds while Publish is open, and each
    uncached call read *and* re-hashed the whole dossier and evidence archives
    -- hundreds of megabytes a minute for a board with a large gerber set.
    Artifacts are content-addressed and never rewritten, so keying on their
    ids makes the repeat reads unnecessary rather than merely cheaper.
    """

    from app.release_studio.vendors import vendor_pack_readiness

    dossier = _artifact_bytes(dossier_artifact_id) if dossier_artifact_id else b""
    evidence = _artifact_bytes(evidence_artifact_id) if evidence_artifact_id else b""
    return tuple(
        vendor_pack_readiness(vendor_id, dossier_bytes=dossier, evidence_bytes=evidence)
        for vendor_id in vendor_ids
    )


def _vendor_pack_response(
    build: dict[str, Any],
    vendor_id: str,
    *,
    filename_stem: str | None = None,
) -> Response:
    from app.release_studio.vendors import VendorPackError, build_vendor_pack, profile_by_id

    try:
        profile = profile_by_id(vendor_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown vendor profile: {vendor_id}") from exc
    try:
        pack = build_vendor_pack(
            vendor_id,
            dossier_bytes=_artifact_bytes(build.get("dossier_artifact_id")),
            evidence_bytes=_artifact_bytes(build.get("evidence_artifact_id"))
            if build.get("evidence_artifact_id")
            else b"",
        )
    except VendorPackError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HTTPException:
        raise
    stem = filename_stem or f"build-{build['id']}"
    filename = f"{stem}-{profile.pack_filename}"
    return Response(
        content=pack,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _evidence_member(build: dict[str, Any], path: str) -> bytes | None:
    """One file out of build-evidence.tar.gz, or ``None`` when it is absent.

    Builds made before logs were archived have no ``logs/`` entries, so a miss
    is an ordinary 404 rather than a failure.
    """

    payload = _artifact_bytes(build.get("evidence_artifact_id"))
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        try:
            member = archive.extractfile(path)
        except KeyError:
            return None
        return member.read() if member is not None else None


def _evidence_json(build: dict[str, Any]) -> dict[str, Any]:
    """The build-evidence index, or an empty one when it cannot be read."""

    try:
        payload = _evidence_member(build, "build-evidence.json")
    except HTTPException:
        return {}
    if not payload:
        return {}
    try:
        return json.loads(payload)
    except ValueError:
        return {}


def _artifact_bytes(artifact_id: str | None) -> bytes:
    """Read a published artifact by its ``ws_artifacts`` row id.

    The build rows reference artifacts by id, not by digest -- the FK targets
    ``ws_artifacts(id)`` -- so the object location is resolved from the row
    rather than reconstructed from a digest.  The bytes are re-hashed against
    the recorded digest because a content-addressed store that hands back
    something else has failed at its one job.
    """

    if not artifact_id:
        raise HTTPException(status_code=404, detail="Artifact not available")
    artifact = store.get_artifact(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact metadata is no longer present")

    path = Path(str(artifact["object_path"]))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact object is no longer present")
    payload = path.read_bytes()

    digest = str(artifact["digest"] or "")
    actual = hashlib.sha256(payload).hexdigest()
    if digest and actual != digest:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Artifact {artifact_id} is corrupt: recorded digest {digest}, "
                f"stored object hashes to {actual}"
            ),
        )
    return payload
