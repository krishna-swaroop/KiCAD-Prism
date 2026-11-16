import asyncio
import logging
import mimetypes
import os
import posixpath
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api._blocking import run_bounded_io
from app.api._helpers import (
    authorized_project,
    commit_file_response,
    get_project_for_role_or_404,
    _row_to_project,
    require_output_type,
    resolve_path_within_root,
    revision_cache_headers,
)
from app.api.projects_models import (
    CommitDistance,
    DetectedPaths,
    DocFileContent,
    ImportAccessHelp,
    JobStarted,
    MonorepoStructure,
    ProjectBranches,
    ProjectCommentsSourceUrls,
    ProjectCommitSummary,
    ProjectCommits,
    ProjectConfigSaved,
    ProjectDeleted,
    ProjectDescription,
    ProjectDescriptionUpdated,
    ProjectName,
    ProjectNameUpdated,
    ProjectPathConfig,
    ProjectReadme,
    ProjectReleases,
    ProjectSearchResults,
    SyncQueued,
    ThumbnailCleared,
    ThumbnailQueued,
    ThumbnailUploaded,
    ThumbnailsQueued,
    WorkflowQueued,
)
from app.core.errors import caller_errors, value_errors_as
from app.core.config import settings
from app.core import policy
from app.core.security import AuthenticatedUser, require_designer, require_viewer
from app.services import (
    derived_assets,
    file_service,
    git_access_service,
    git_remote_access,
    path_config_service,
    project_deletion,
    project_import_service,
    project_outputs,
    project_service,
    project_settings_service,
)
from app.services.workspace_service import ProjectHasSignedReleasesError, workspace
from app.services.comments_url_service import build_comments_source_urls, resolve_comments_base_url
from app.services.git_service import (
    get_branches,
    get_commit_distance,
    get_commit_file_summary,
    get_commits_list_filtered,
    get_head_commit,
    get_releases,
    get_releases_filtered,
)
from app.services.git_failures import GitAccessError
from app.services.git_remote_url import RemoteUrlError, parse_remote_url
from app.services.path_config_service import PathConfig

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_viewer)])

ARCHIVE_DIR_NAMES = {"archive", "archived", "old", "backup", "backups", "obsolete"}


class Monorepo(BaseModel):
    name: str
    path: str
    project_count: int
    last_synced: Optional[str] = None
    repo_url: Optional[str] = None


def _find_commit_ibom(
    project: project_service.Project,
    commit: str,
    config: PathConfig,
) -> file_service.CommitFile:
    design_dir = project_outputs.output_dir_in(config, "design")
    files = project_outputs.list_commit_files(project, commit, design_dir)
    selected = next(
        (
            item for item in files
            if not item.is_dir
            and "/" not in item.path
            and "ibom" in item.name.lower()
            and item.name.lower().endswith(".html")
        ),
        None,
    )
    if selected is None:
        raise HTTPException(status_code=404, detail="iBoM not found")

    return project_outputs.read_commit_file(
        project,
        commit,
        selected.path,
        relative_prefix=design_dir,
        not_found_detail="iBoM not found",
    )


def _read_utf8_file(file_path: str | Path, *, not_found_detail: str, read_error_prefix: str) -> str:
    path = Path(file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=not_found_detail)
    if path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot read directory")

    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        logger.exception("%s: %s", read_error_prefix, path)
        raise HTTPException(status_code=500, detail=read_error_prefix) from error


def _read_file_from_commit(
    project: project_service.Project,
    commit: str,
    file_path: str,
    *,
    relative_prefix: Optional[str] = None,
) -> str:
    """
    Read a file from commit for both standalone and Type-2 subproject contexts.

    - Standalone: uses project path directly.
    - Type-2: reads from parent repo and applies project sub-path prefix.
    """
    try:
        commit_file = project_outputs.read_commit_file(
            project,
            commit,
            file_path,
            relative_prefix=relative_prefix,
        )
        return commit_file.content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail="Binary file cannot be decoded") from error


def _filter_projects_for_user(
    projects: List[project_service.Project],
    user: AuthenticatedUser,
) -> List[project_service.Project]:
    return [p for p in projects if workspace.is_folder_visible_to_role(p.folder_id, user.role)]


def _load_project_readme_content(
    project: project_service.Project,
    commit: Optional[str] = None,
) -> Optional[str]:
    config = project_outputs.path_config_at(project, commit)
    readme_filename = config.readme or "README.md"

    if commit:
        try:
            return _read_file_from_commit(project, commit, readme_filename)
        except HTTPException as error:
            if error.status_code == 404:
                return None
            raise

    resolved = project_service.resolved_paths_for(project, config)
    readme_path = resolved.readme_path
    if not readme_path:
        return None

    try:
        return _read_utf8_file(
            readme_path,
            not_found_detail="README not found",
            read_error_prefix="Error reading README",
        )
    except HTTPException as error:
        if error.status_code == 404:
            return None
        raise

@router.get("/", response_model=List[project_service.Project])
async def list_projects(user: AuthenticatedUser = Depends(require_viewer)):
    """Return all registered projects (both Type-1 and Type-2)."""
    rows = await asyncio.to_thread(workspace.get_all_projects, user.role)
    return [_row_to_project(r) for r in rows]

@router.get("/monorepos", response_model=List[Monorepo])
async def list_monorepos(user: AuthenticatedUser = Depends(require_viewer)):
    """
    List all monorepos with their metadata.
    Uses workspace DB — no subprocess calls.
    """
    repos = await asyncio.to_thread(workspace.get_repositories, "multi")
    result = []
    for repo in repos:
        projects = await asyncio.to_thread(workspace.get_projects_by_repo, repo["id"])
        abs_path = workspace._abs_clone_path(repo["clone_path"])
        result.append(Monorepo(
            name=repo["name"],
            path=abs_path,
            project_count=len(projects),
            last_synced=repo.get("last_synced_at"),
            repo_url=repo.get("url"),
        ))
    return result

@router.get("/monorepos/{repo_name}/structure", response_model=MonorepoStructure, summary="Folders and projects under one monorepo path")
async def get_monorepo_structure(
    repo_name: str,
    subpath: str = "",
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get folder structure for a monorepo at a given subpath.
    Returns folders and projects at that level.
    """
    repo_path = os.path.join(project_service.MONOREPOS_ROOT, repo_name)
    if not os.path.exists(repo_path) or not os.path.isdir(repo_path):
        raise HTTPException(status_code=404, detail="Monorepo not found")
    
    current_path = resolve_path_within_root(repo_path, subpath, invalid_detail="Invalid path")
    if not current_path.exists() or not current_path.is_dir():
        raise HTTPException(status_code=404, detail="Path not found")
    
    folders = []
    projects = []
    
    all_rows = workspace.get_all_projects(user.role)
    all_registered = [_row_to_project(r) for r in all_rows]
    repo_projects = {p.sub_path: p for p in all_registered if p.parent_repo == repo_name}
    
    for item_path in current_path.iterdir():
        if not item_path.is_dir():
            continue

        item_name = item_path.name
        if item_name.startswith(".") or item_name.lower() in ARCHIVE_DIR_NAMES:
            continue

        relative_path = os.path.relpath(item_path, repo_path)

        # Count items in folder (for display)
        try:
            child_names = os.listdir(item_path)
            item_count = len(child_names)
        except OSError:
            child_names = []
            item_count = 0

        folders.append({
            "name": item_name,
            "path": relative_path,
            "item_count": item_count
        })

        if any(name.endswith(".kicad_pro") for name in child_names):
            project = repo_projects.get(relative_path)
            if project:
                custom_display_name = path_config_service.get_project_display_name(str(item_path))
                projects.append({
                    "id": project.id,
                    "name": project.name,
                    "display_name": custom_display_name,
                    "relative_path": relative_path,
                    "has_thumbnail": project_service.get_project_thumbnail_path(project.id) is not None,
                    "last_modified": project.last_modified
                })
    
    return {
        "repo_name": repo_name,
        "current_path": subpath,
        "folders": folders,
        "projects": projects
    }

@router.get("/search", response_model=ProjectSearchResults, summary="Search projects by name, description or repository")
async def search_projects(
    q: str = "",
    limit: int = Query(default=100, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Search across all projects (standalone and monorepo sub-projects).
    Uses SQL LIKE — no full hydration needed. An empty query lists every project
    the caller may see, by name, up to ``limit``.
    """
    query = q.strip()
    rows = await asyncio.to_thread(workspace.search_projects, query, limit, user.role)
    results = []
    for r in rows:
        results.append({
            "id": r["id"],
            "name": r["name"],
            "description": r.get("description", ""),
            "parent_repo": r.get("parent_repo"),
            "sub_path": r.get("relative_path") if r.get("relative_path") != "." else None,
            "last_modified": r.get("last_modified", ""),
            "last_synced_at": r.get("repo_last_synced"),
            "thumbnail_url": project_service.thumbnail_url_for_row(r),
        })
    return {"results": results}

class AnalyzeRequest(BaseModel):
    url: str
    # Branch to inspect. Defaults to the remote's HEAD.
    ref: Optional[str] = None

class ImportRequest(BaseModel):
    url: str
    import_type: str  # "type1" or "type2"
    selected_paths: Optional[List[str]] = None
    ref: Optional[str] = None


class RegenerateThumbnailsRequest(BaseModel):
    project_ids: List[str] = Field(min_length=1)

@router.post("/analyze", response_model=JobStarted, summary="Start analyzing a repository for import")
async def analyze_repository(
    request: AnalyzeRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """
    Analyze a repository to determine import type and discover KiCAD projects.
    Returns Type-1 or Type-2 classification and project list.
    """
    # A rejected URL or an access failure is something the caller can fix, and
    # the message says how, so it must not be flattened into a generic 500.
    with caller_errors(((RemoteUrlError, GitAccessError), 400), unexpected="Analysis failed"):
        job_id = await asyncio.to_thread(
            project_import_service.start_analyze_job,
            request.url,
            request.ref,
            requested_by=user.email,
        )
        return {"job_id": job_id, "status": "started"}


@router.post(
    "/access-help",
    dependencies=[Depends(require_designer)],
    response_model=ImportAccessHelp,
    summary="Where to register the key for a repository Prism cannot read",
)
async def import_access_help(request: AnalyzeRequest):
    """What to do about a repository Prism cannot read.

    The import dialog calls this after a permission failure so it can show the
    key to register and a link to the right page on the detected forge, instead
    of leaving the user with a message and nowhere to go.
    """
    parsed = parse_remote_url(request.url, git_remote_access.remote_url_policy())

    key = await asyncio.to_thread(git_access_service.describe_key)
    guidance = git_access_service.guidance_for(parsed)
    return {
        "forge": guidance.forge,
        "deploy_key_url": guidance.deploy_key_url,
        "account_key_url": guidance.account_key_url,
        "instructions": guidance.instructions,
        "public_key": key.public_key,
        "fingerprint": key.fingerprint,
        "key_exists": key.exists,
        "host": parsed.host,
        "host_trusted": git_access_service.is_host_trusted(parsed.host),
    }


@router.post("/import", response_model=JobStarted, summary="Start importing a repository")
async def import_project(
    request: ImportRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """
    Start an async project import job.
    For Type-1: imports single project at root.
    For Type-2: imports selected subprojects.
    """
    with caller_errors(((RemoteUrlError, GitAccessError, ValueError), 400), unexpected="Import failed"):
        job_id = await asyncio.to_thread(
            project_import_service.start_import_job,
            repo_url=request.url,
            import_type=request.import_type,
            selected_paths=request.selected_paths,
            ref=request.ref,
            requested_by=user.email,
        )
        return {"job_id": job_id, "status": "started"}

@router.post(
    "/{project_id}/sync",
    dependencies=[Depends(require_designer)],
    response_model=SyncQueued,
    summary="Queue a sync with the project's remote",
)
async def sync_project_endpoint(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Sync project repository with remote.
    Type-1: pulls the project repo.
    Type-2: pulls the parent repo.
    """
    _ = get_project_for_role_or_404(project_id, user.role)
    job_id = await asyncio.to_thread(
        project_import_service.start_sync_job,
        project_id,
        requested_by=user.email,
    )
    return {
        "job_id": job_id,
        "status": "started",
        "message": "Sync queued",
    }

class WorkflowRequest(BaseModel):
    type: str # design, manufacturing, render
    author: Optional[str] = "anonymous"
    force: bool = False

@router.post(
    "/{project_id}/workflows",
    dependencies=[Depends(require_designer)],
    response_model=WorkflowQueued,
    summary="Queue a KiCad workflow output job",
)
async def trigger_workflow(
    project_id: str,
    request: WorkflowRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Trigger a KiCAD workflow (jobset output).
    """
    valid_types = ["design", "manufacturing", "render"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid workflow type")
        
    with caller_errors((ValueError, 400), unexpected="Workflow failed to start"):
        _ = get_project_for_role_or_404(project_id, user.role)
        job_id = await asyncio.to_thread(
            project_service.start_workflow_job,
            project_id,
            request.type,
            request.author,
            force=request.force,
        )
        return {"job_id": job_id}


@router.get("/{project_id}/branches", response_model=ProjectBranches, summary="Branches that can be viewed for the project")
async def get_project_branches(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """List branch refs that can be viewed without switching the working checkout."""
    project = get_project_for_role_or_404(project_id, user.role)
    location = project_outputs.project_location(project)
    branch_path = location.repo_path(location.anchor) if location.anchor else location.sub_path
    return await asyncio.to_thread(
        get_branches, str(location.repo_root), branch_path, import_branch=project.import_branch
    )

def _resolve_thumbnail_file(project, row: Optional[dict]) -> Optional[Path]:
    """Locate a project's thumbnail, wherever it is kept.

    A thumbnail committed to the repository resolves inside the checkout. One
    Prism rendered itself, or one somebody uploaded, lives in the derived asset
    store outside every checkout, so that neither dirties the working tree.
    """
    if not row or not row.get("thumbnail_rel"):
        return None
    source = str(row.get("thumbnail_source") or "generated")
    if source in ("generated", "custom"):
        return derived_assets.find_thumbnail(
            project.path,
            kind=source,
            anchor=path_config_service.anchor_for_project(project),
        )
    abs_path = resolve_path_within_root(
        project.path,
        str(row["thumbnail_rel"]),
        invalid_detail="Invalid thumbnail path",
    )
    return abs_path if abs_path.is_file() else None


@router.get(
    "/{project_id}/thumbnail",
    responses={200: {"description": "The project's thumbnail image.", "content": {"image/*": {}}}},
    summary="The project's thumbnail image",
)
async def get_project_thumbnail(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    # Use cached thumbnail path from DB, fallback to filesystem detection
    row = authorized_project(user, project_id)
    project = _row_to_project(row)
    abs_path = _resolve_thumbnail_file(project, row)
    if abs_path is not None and abs_path.is_file():
        return _thumbnail_response(
            abs_path,
            digest=str((row or {}).get("thumbnail_digest") or ""),
            media_type=str((row or {}).get("thumbnail_media_type") or ""),
            immutable=False,
        )
    # Fallback: live filesystem detection
    path = project_service.get_project_thumbnail_path(project_id)
    if not path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return _thumbnail_response(Path(path), immutable=False)


@router.get(
    "/{project_id}/thumbnail/{thumbnail_digest}",
    responses={200: {"description": "The immutable thumbnail image for that digest.", "content": {"image/*": {}}}},
    summary="One immutable version of the project's thumbnail",
)
async def get_project_thumbnail_version(
    project_id: str,
    thumbnail_digest: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    row = await asyncio.to_thread(authorized_project, user, project_id)
    project = _row_to_project(row)
    if (
        not row
        or not row.get("thumbnail_rel")
        or str(row.get("thumbnail_digest") or "") != thumbnail_digest
    ):
        raise HTTPException(status_code=404, detail="Thumbnail version not found")
    path = _resolve_thumbnail_file(project, row)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return _thumbnail_response(
        path,
        digest=thumbnail_digest,
        media_type=str(row.get("thumbnail_media_type") or ""),
        immutable=True,
    )


def _thumbnail_response(
    path: Path,
    *,
    digest: str = "",
    media_type: str = "",
    immutable: bool,
) -> FileResponse:
    resolved = path.resolve()
    projects_root = Path(settings.KICAD_PROJECTS_ROOT).resolve()
    try:
        relative = resolved.relative_to(projects_root).as_posix()
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Thumbnail not found") from error
    headers = {
        "Cache-Control": (
            "private, max-age=31536000, immutable"
            if immutable
            else "private, max-age=300"
        ),
        "X-Accel-Redirect": f"/_protected_projects/{quote(relative, safe='/')}",
    }
    if digest:
        headers["ETag"] = f'"{digest}"'
    return FileResponse(
        resolved,
        media_type=media_type or mimetypes.guess_type(resolved.name)[0],
        headers=headers,
    )

@router.post(
    "/{project_id}/thumbnail/regenerate",
    dependencies=[Depends(require_designer)],
    response_model=ThumbnailQueued,
    summary="Queue a fresh board thumbnail render",
)
async def regenerate_project_thumbnail(project_id: str, user: AuthenticatedUser = Depends(require_designer)):
    """Queue a fresh board render for this project.

    This used to run `kicad-cli` inline, holding an API worker for up to two
    minutes per board while the browser waited on a request that could not
    report progress. Renders already have a job type; use it, and let the
    caller watch the job.
    """
    get_project_for_role_or_404(project_id, user.role)
    job_id = await asyncio.to_thread(
        project_import_service.start_thumbnail_job,
        project_id,
        requested_by=user.email,
    )
    if not job_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "status": "queued",
        "job_id": job_id,
        "message": "Rendering the board thumbnail",
    }


@router.post(
    "/thumbnails/regenerate",
    response_model=ThumbnailsQueued,
    summary="Queue board thumbnail renders for several projects",
)
async def regenerate_project_thumbnails(
    request: RegenerateThumbnailsRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Queue board renders for all selected visible projects."""
    project_ids = list(dict.fromkeys(project_id.strip() for project_id in request.project_ids if project_id.strip()))
    if not project_ids:
        raise HTTPException(status_code=400, detail="At least one project is required")

    # Apply the same role-aware visibility check used by the single-project
    # endpoint before any jobs are enqueued.
    for project_id in project_ids:
        get_project_for_role_or_404(project_id, user.role)

    with value_errors_as(404):
        job_ids = await asyncio.to_thread(
            project_import_service.start_thumbnail_jobs,
            project_ids,
            requested_by=user.email,
        )

    count = len(job_ids)
    return {
        "status": "queued",
        "job_ids": job_ids,
        "count": count,
        "message": f"Rendering {count} board thumbnail{'s' if count != 1 else ''}",
    }


@router.put(
    "/{project_id}/thumbnail",
    dependencies=[Depends(require_designer)],
    response_model=ThumbnailUploaded,
    summary="Replace the project's thumbnail with an uploaded image",
)
async def upload_project_thumbnail(
    project_id: str,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_designer),
):
    """Replace this project's thumbnail with an uploaded image.

    Stored alongside the render rather than instead of it, so reverting is
    immediate and does not need kicad-cli to run again.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    # Read one byte past the cap so an oversized upload is refused on its size
    # rather than after the whole thing is in memory.
    data = await file.read(derived_assets.MAX_UPLOAD_BYTES + 1)
    with caller_errors((derived_assets.ThumbnailImageError, 400)):
        stored, digest, size = await asyncio.to_thread(
            derived_assets.store_uploaded_thumbnail,
            project.path,
            data,
            anchor=path_config_service.anchor_for_project(project),
        )

    await asyncio.to_thread(
        workspace.update_project,
        project_id,
        thumbnail_rel=stored.name,
        thumbnail_source="custom",
        thumbnail_digest=digest,
        thumbnail_media_type=derived_assets.THUMBNAIL_MEDIA_TYPE,
        thumbnail_size_bytes=size,
    )
    return {
        "status": "success",
        "thumbnail_source": "custom",
        "message": "Thumbnail updated",
    }


@router.delete(
    "/{project_id}/thumbnail",
    dependencies=[Depends(require_designer)],
    response_model=ThumbnailCleared,
    summary="Drop an uploaded thumbnail and fall back to the rendered board",
)
async def clear_project_thumbnail(
    project_id: str,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Drop an uploaded thumbnail and go back to the rendered board."""
    project = get_project_for_role_or_404(project_id, user.role)
    await asyncio.to_thread(
        derived_assets.discard_thumbnail,
        project.path,
        kind="custom",
        anchor=path_config_service.anchor_for_project(project),
    )
    cached = await asyncio.to_thread(project_import_service.refresh_project_assets, project_id)

    job_id = None
    if str(cached.get("thumbnail_source") or "") != "generated":
        # Nothing has been rendered for this project yet, so reverting would
        # leave it blank. Queue the render the user is asking to fall back to.
        job_id = await asyncio.to_thread(
            project_import_service.start_thumbnail_job,
            project_id,
            requested_by=user.email,
        )
    return {
        "status": "success",
        "thumbnail_source": cached.get("thumbnail_source") or "generated",
        "job_id": job_id,
        "message": "Rendering the board thumbnail" if job_id else "Using the rendered board image",
    }

@router.get("/{project_id}", response_model=project_service.Project)
async def get_project_detail(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """Get detailed project information."""
    return get_project_for_role_or_404(project_id, user.role)


@router.get(
    "/{project_id}/comments/source-urls",
    response_model=ProjectCommentsSourceUrls,
    response_model_exclude_unset=True,
    summary="List comment source URLs for a KiCad comments source",
)
async def get_project_comments_source_urls(
    request: Request,
    project_id: str,
    base_url: Optional[str] = Query(
        default=None,
        description="Optional override base URL (e.g. http://localhost:8000).",
    ),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get helper URLs to configure KiCad comments REST source for this project.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    resolved_base_url = resolve_comments_base_url(request, explicit_base_url=base_url)
    urls = build_comments_source_urls(project.id, resolved_base_url)

    return {
        "project_id": project.id,
        "project_name": project.display_name or project.name,
        "base_url": urls["base_url"],
        "list_url": urls["absolute"]["list_url"],
        "patch_url_template": urls["absolute"]["patch_url_template"],
        "reply_url_template": urls["absolute"]["reply_url_template"],
        "delete_url_template": urls["absolute"]["delete_url_template"],
        "relative": urls["relative"],
    }

@router.delete(
    "/{project_id}",
    dependencies=[Depends(require_designer)],
    response_model=ProjectDeleted,
    response_model_exclude_unset=True,
    summary="Delete a project and, where Prism owns them, its files",
)
async def delete_project_endpoint(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Delete a project from the registry.
    For standalone projects, this also deletes the project files.
    For monorepo sub-projects, only removes the registry entry.
    Admins always cascade associated workspace and release-studio listings.
    Designers can delete a project that has no signed release records.
    """
    authorized_project(user, project_id, "design")
    force = policy.role_allows(user.role, "admin")
    with caller_errors((ProjectHasSignedReleasesError, 409)):
        deletion = await asyncio.to_thread(project_deletion.delete_project, project_id, force=force)
    if deletion is None:
        raise HTTPException(status_code=404, detail="Project not found")

    response = {"message": "Project deleted successfully", "removed_files": deletion.removed_files}
    if deletion.warnings:
        response["warning"] = " ".join(deletion.warnings)
    response["repository_deleted"] = deletion.repository_deleted
    return response

@router.get("/{project_id}/files", response_model=List[file_service.FileItem])
async def get_project_files(
    project_id: str,
    type: str = "design",
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    List files in Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_id: Project identifier
        type: 'design' or 'manufacturing'
    """
    output_type = require_output_type(type)
    return await asyncio.to_thread(_project_files_response, project_id, output_type, commit, user)


def _project_files_response(
    project_id: str, output_type: str, commit: Optional[str], user: AuthenticatedUser
):
    project = get_project_for_role_or_404(project_id, user.role)
    if commit:
        config = project_outputs.path_config_at(project, commit)
        return project_outputs.list_commit_files(project, commit, project_outputs.output_dir_in(config, output_type))
    return file_service.get_project_files(project.path, output_type)

@router.get(
    "/{project_id}/download",
    responses={200: {"description": "The requested output file.", "content": {"*/*": {}}}},
    summary="Download one file from the project's output folders",
)
async def download_file(
    project_id: str,
    path: str,
    type: str = "design",
    inline: bool = False,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Download a specific file from Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_id: Project identifier
        path: Relative path to file within output folder
        type: 'design' or 'manufacturing'
        inline: If True, serve as inline content (view in browser)
    """
    output_type = require_output_type(type)
    return await run_bounded_io(_download_file_response, project_id, path, output_type, inline, commit, user)


def _download_file_response(
    project_id: str,
    path: str,
    output_type: str,
    inline: bool,
    commit: Optional[str],
    user: AuthenticatedUser,
):
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = project_outputs.path_config_at(project, commit)
        commit_file = project_outputs.read_commit_file(
            project,
            commit,
            path,
            relative_prefix=project_outputs.output_dir_in(config, output_type),
            not_found_detail="File not found",
        )
        return commit_file_response(commit_file, inline=inline)

    output_dir = project_outputs.output_dir(project, output_type)

    file_path = resolve_path_within_root(output_dir, path, invalid_detail="Invalid file path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot download directory")

    disposition = "inline" if inline else "attachment"
    return FileResponse(file_path, filename=file_path.name, content_disposition_type=disposition)

@router.get("/{project_id}/readme", response_model=ProjectReadme, summary="The project README text")
async def get_project_readme(
    project_id: str,
    commit: str = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get README content from project root.
    If commit is provided, fetch from that commit; otherwise use working directory.
    For Type-2 projects, uses parent repo with relative path prefix.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    content = await asyncio.to_thread(_load_project_readme_content, project, commit)
    if content is None:
        raise HTTPException(status_code=404, detail="README not found")
    return {"content": content}

@router.get(
    "/{project_id}/asset/{asset_path:path}",
    responses={200: {"description": "The requested project file.", "content": {"*/*": {}}}},
    summary="Serve an asset from the project checkout",
)
async def get_project_asset(
    project_id: str,
    asset_path: str,
    request: Request,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Serve assets (images, etc.) from project directory.
    Typically used for README image references.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    return await run_bounded_io(_asset_response, project, asset_path, commit, request)


def _asset_response(
    project: project_service.Project, asset_path: str, commit: Optional[str], request: Request
):
    if commit:
        commit_file = project_outputs.read_commit_file(
            project,
            commit,
            asset_path,
            not_found_detail="Asset not found",
        )
        return commit_file_response(
            commit_file, inline=True, headers=revision_cache_headers(commit), request=request
        )

    file_path = resolve_path_within_root(project.path, asset_path, invalid_detail="Invalid asset path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot serve directory")

    return FileResponse(file_path)

@router.get("/{project_id}/docs", response_model=List[file_service.FileItem], summary="List the documentation folder")
async def get_docs_files(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    List all files in the documentation folder.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    return await asyncio.to_thread(_docs_files_response, project, commit)


def _docs_files_response(project: project_service.Project, commit: Optional[str]):
    if commit:
        config = project_outputs.path_config_at(project, commit)
        docs_path = config.documentation or "docs"
        return project_outputs.list_commit_files(project, commit, docs_path)

    resolved = project_service.resolved_paths_for(project)
    docs_dir = resolved.documentation_dir

    if not docs_dir or not os.path.exists(docs_dir):
        return []  # Return empty list if docs not configured/found

    return file_service.get_files_recursive(docs_dir)

@router.get("/{project_id}/docs/content", response_model=DocFileContent, summary="Read one documentation file")
async def get_doc_file_content(
    project_id: str,
    path: str,
    commit: str = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get markdown file content from documentation folder.
    If commit is provided, fetch from that commit; otherwise use working directory.
    For Type-2 projects, uses parent repo with relative path prefix.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    return await run_bounded_io(_doc_file_content_response, project, path, commit)


def _doc_file_content_response(project: project_service.Project, path: str, commit: Optional[str]):
    # Get documentation path from config
    config = project_outputs.path_config_at(project, commit)
    docs_path = config.documentation or "docs"

    # If viewing a specific commit, use Git
    if commit:
        try:
            content = _read_file_from_commit(project, commit, path, relative_prefix=docs_path)
            return {"content": content, "path": path}
        except HTTPException:
            raise

    # Otherwise read from filesystem
    resolved = project_service.resolved_paths_for(project)
    docs_dir = resolved.documentation_dir

    if not docs_dir or not os.path.exists(docs_dir):
        raise HTTPException(status_code=404, detail="Documentation folder not found")

    file_path = resolve_path_within_root(docs_dir, path, invalid_detail="Invalid file path")
    return {
        "content": _read_utf8_file(
            file_path,
            not_found_detail="File not found",
            read_error_prefix="Error reading file",
        ),
        "path": path,
    }

@router.get(
    "/{project_id}/releases",
    response_model=ProjectReleases,
    response_model_exclude_unset=True,
    summary="Paginated Git tags of the project's repository",
)
async def get_project_releases(
    project_id: str,
    ref: Optional[str] = None,
    limit: int = Query(default=9, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    include_total: bool = Query(default=True),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get paginated Git releases/tags for a project.
    For Type-2 projects, uses parent repo with subproject file tracking.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    repo_path, relative_path = project_outputs.repo_context(project)
    if relative_path:
        page = await asyncio.to_thread(
            get_releases_filtered,
            repo_path,
            relative_path,
            ref,
            limit,
            offset,
            include_total,
        )
    else:
        page = await asyncio.to_thread(
            get_releases,
            project.path,
            ref,
            limit,
            offset,
            include_total,
        )
    
    if isinstance(page, dict):
        return page
    return {
        "releases": page,
        "total": len(page) if include_total else None,
        "has_more": False,
        "limit": limit,
        "offset": offset,
    }

@router.get("/{project_id}/commits/distance", response_model=CommitDistance, summary="How many commits behind a revision is")
async def get_project_commit_distance(
    project_id: str,
    commit: str,
    ref: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Count how many commits behind HEAD the requested commit is.
    For Type-2 projects, only commits affecting the subproject path are counted.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    repo_path, relative_path = project_outputs.repo_context(project)
    commits_behind = await asyncio.to_thread(
        get_commit_distance,
        repo_path,
        commit,
        relative_path,
        ref,
    )
    return {"commits_behind": commits_behind}

@router.get("/{project_id}/commits", response_model=ProjectCommits, summary="Paginated commit history of the project")
async def get_project_commits(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    ref: Optional[str] = None,
    include_total: bool = Query(default=True),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get paginated commits for a project.
    For Type-2 projects, shows only commits affecting the subproject.
    ``head`` is the checkout's HEAD, which a filtered or ``ref`` page may not list.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    repo_path, history = await asyncio.to_thread(project_outputs.history_context, project)
    head = await asyncio.to_thread(get_head_commit, repo_path)
    page = await asyncio.to_thread(
        get_commits_list_filtered, repo_path, None, limit, ref, offset, include_total, history
    )
    return {**page, "head": head}


@router.get(
    "/{project_id}/commits/{commit_hash}/summary",
    response_model=ProjectCommitSummary,
    summary="Files changed in one commit",
)
async def get_project_commit_summary(
    project_id: str,
    commit_hash: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return files changed in a commit using Git's exact line statistics and
    explicit first-parent semantics.
    For Type-2 projects, the file list is scoped to the subproject path.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    repo_path, relative_path = project_outputs.repo_context(project)
    return await asyncio.to_thread(
        get_commit_file_summary,
        repo_path,
        commit_hash,
        relative_path,
    )


@router.get(
    "/{project_id}/commits/{commit_hash}/file",
    responses={200: {"description": "The file's bytes at that commit.", "content": {"*/*": {}}}},
    summary="Serve one file from a commit",
)
async def get_project_commit_file(
    project_id: str,
    commit_hash: str,
    path: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Serve one file from a commit as inline content, keyed by the repo-relative
    path the commit summary returns. Used to open non-CAD files (PDFs, images)
    in the browser's own viewer rather than routing them to the visualizer.

    The mime type is guessed from the name, so a PDF is served as
    application/pdf and the browser opens it inline. History only opens this
    endpoint for PDF, CSV, text, and markdown; CAD files go to the visualizer.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    return await run_bounded_io(_commit_file_response_for_project, project, commit_hash, path)


def _commit_file_response_for_project(
    project: project_service.Project, commit_hash: str, path: str
):
    repo_path, relative_path = project_outputs.repo_context(project)

    # The summary path is already repo-relative (it includes the subproject
    # prefix for Type-2 projects), so read it against the repo root with no
    # extra prefix. Confine it to the project's own subtree so one subproject
    # cannot read a sibling's files out of the shared parent repo.
    normalized = posixpath.normpath(path).lstrip("/")
    if normalized.startswith("..") or normalized == ".":
        raise HTTPException(status_code=400, detail="Invalid file path")
    if relative_path:
        prefix = f"{posixpath.normpath(relative_path).strip('/')}/"
        if not (normalized + "/").startswith(prefix):
            raise HTTPException(status_code=404, detail="File not found")

    commit_file = file_service.read_file_from_commit(
        repo_path,
        commit_hash,
        normalized,
        not_found_detail="File not found",
    )
    return commit_file_response(commit_file, inline=True)


@router.get(
    "/{project_id}/ibom",
    responses={200: {"description": "The interactive BOM page.", "content": {"text/html": {}}}},
    summary="The project's interactive BOM",
)
async def get_project_ibom(
    project_id: str,
    request: Request,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    return await run_bounded_io(_ibom_response, project, commit, request)


def _ibom_response(project: project_service.Project, commit: Optional[str], request: Request):
    if commit:
        config = project_outputs.path_config_at(project, commit)
        commit_file = _find_commit_ibom(project, commit, config)
        return commit_file_response(
            commit_file,
            inline=True,
            headers=revision_cache_headers(commit),
            request=request,
        )

    path = project_service.find_ibom_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="iBoM not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=60"})


# Path Configuration Endpoints

@router.get("/{project_id}/config", response_model=ProjectPathConfig, summary="The project's path configuration and resolved paths")
async def get_project_config(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Get path configuration for a project.
    Returns the current path configuration (from .prism.json or auto-detected).
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    anchor = project_service.project_anchor(project)
    config = project_service.path_config_for(project)
    resolved = project_service.resolved_paths_for(project, config)
    explicit_config = path_config_service._load_prism_config(
        project.path, anchor
    ) or project_settings_service.stored_settings(project.path, anchor)
    effective_config = config.model_copy(deep=True)
    if not effective_config.project_name:
        effective_config.project_name = project.display_name
    if not effective_config.description:
        effective_config.description = project.description
    
    return {
        "config": effective_config.model_dump(),
        "resolved": resolved.model_dump(),
        "source": "explicit" if explicit_config else "auto-detected"
    }


@router.post(
    "/{project_id}/detect-paths",
    dependencies=[Depends(require_designer)],
    response_model=DetectedPaths,
    summary="Auto-detect a project's paths without saving them",
)
async def detect_project_paths(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Run auto-detection on project paths.
    Returns detected paths without saving them.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    detected = path_config_service.detect_paths(
        project.path, anchor=project_service.project_anchor(project)
    )
    
    return {
        "detected": detected.model_dump(),
        "validation": path_config_service.validate_config(project.path, detected)
    }


@router.put(
    "/{project_id}/config",
    dependencies=[Depends(require_designer)],
    response_model=ProjectConfigSaved,
    summary="Save a project's path configuration",
)
async def update_project_config(
    project_id: str,
    config: PathConfig,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Update path configuration for a project.
    Stores it in the workspace database; the checkout is never written.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    if config.project_name is not None:
        normalized_name = config.project_name.strip()
        config.project_name = normalized_name or None

    if config.description is not None:
        normalized_description = config.description.strip()
        config.description = normalized_description or f"Project {project.name}"
    
    # Validate the config before saving
    validation = path_config_service.validate_config(project.path, config)
    
    # Save the configuration
    project_service.save_path_config_for(project, config)

    # Clear cache to ensure fresh resolution
    path_config_service.clear_config_cache(project.path)
    file_service.invalidate_file_listing_cache()

    # Get resolved paths
    resolved = project_service.resolved_paths_for(project, config)
    
    return {
        "config": config.model_dump(),
        "resolved": resolved.model_dump(),
        "validation": validation
    }


class ProjectNameRequest(BaseModel):
    display_name: str


class ProjectDescriptionRequest(BaseModel):
    description: str


@router.get("/{project_id}/name", response_model=ProjectName, summary="The project's display name and fallback name")
async def get_project_name(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Get the display name for a project.
    Returns custom name from .prism.json or fallback name.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    return {
        "display_name": project.display_name,
        "fallback_name": project.name
    }


@router.put(
    "/{project_id}/name",
    dependencies=[Depends(require_designer)],
    response_model=ProjectNameUpdated,
    summary="Rename the project's display name",
)
async def update_project_name(
    project_id: str,
    request: ProjectNameRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Update the display name for a project (stored in Prism, not the checkout).
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    display_name = request.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Display name cannot be empty")

    # Get current config
    config = project_service.path_config_for(project)

    # Update project name
    config.project_name = display_name
    
    # Stored in Prism; the checkout's .prism.json is never written.
    project_service.save_path_config_for(project, config)
    await asyncio.to_thread(workspace.update_project, project_id, display_name=display_name)
    
    return {
        "display_name": display_name,
        "message": "Project name updated successfully"
    }


@router.get("/{project_id}/description", response_model=ProjectDescription, summary="The project description")
async def get_project_description(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Get project description from project registry.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    return {
        "description": project.description
    }


@router.put(
    "/{project_id}/description",
    dependencies=[Depends(require_designer)],
    response_model=ProjectDescriptionUpdated,
    summary="Update the project's description",
)
async def update_project_description(
    project_id: str,
    request: ProjectDescriptionRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Update project description in project registry.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    next_description = request.description.strip()
    if not next_description:
        next_description = f"Project {project.name}"

    updated = await asyncio.to_thread(workspace.update_project, project_id, description=next_description)
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")

    # Keep the stored path configuration's description in step.
    config = project_service.path_config_for(project)
    config.description = next_description
    project_service.save_path_config_for(project, config)

    return {
        "description": next_description,
        "message": "Project description updated successfully"
    }
