import asyncio
import json
import mimetypes
import os
import posixpath
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.api._helpers import get_project_for_role_or_404, _row_to_project, require_output_type, resolve_path_within_root
from app.core.config import settings
from app.core.security import AuthenticatedUser, require_designer, require_viewer
from app.services import (
    derived_assets,
    file_service,
    git_access_service,
    path_config_service,
    project_import_service,
    project_properties_service,
    project_service,
    semantic_index_service,
    semantic_visualizer_service,
)
from app.services.workspace_service import workspace
from app.services.comments_url_service import build_comments_source_urls, resolve_comments_base_url
from app.services.git_service import (
    get_branches,
    get_commit_distance,
    get_commit_file_summary,
    get_commits_list,
    get_commits_list_filtered,
    get_releases,
    get_releases_filtered,
)
from app.services.git_failures import GitAccessError
from app.services.git_remote_url import RemoteUrlError, parse_remote_url
from app.services.path_config_service import PathConfig
from app.services.job_service import jobs as v3_jobs

router = APIRouter(dependencies=[Depends(require_viewer)])

ARCHIVE_DIR_NAMES = {"archive", "archived", "old", "backup", "backups", "obsolete"}


def _worksheet_path_key(path: str | Path) -> tuple[int, int, str]:
    normalized = str(path).replace("\\", "/")
    parts = [part.casefold() for part in normalized.split("/")]
    archived = int(any(part in ARCHIVE_DIR_NAMES for part in parts))
    return archived, len(parts), normalized.casefold()

class Monorepo(BaseModel):
    name: str
    path: str
    project_count: int
    last_synced: Optional[str] = None
    repo_url: Optional[str] = None


class ProjectPropertiesTitleBlock(BaseModel):
    title: str = ""
    date: str = ""
    rev: str = ""
    company: str = ""
    comments: Dict[str, str] = Field(default_factory=dict)


class ProjectPropertiesSchematicFile(BaseModel):
    path: str
    filename: str
    version: Optional[int] = None
    generator: Optional[str] = None
    generator_version: Optional[str] = None
    paper: Optional[str] = None
    uuid: Optional[str] = None
    title_block: Optional[ProjectPropertiesTitleBlock] = None


class ProjectPropertiesPcbFile(BaseModel):
    path: str
    filename: str
    version: Optional[int] = None
    generator: Optional[str] = None
    generator_version: Optional[str] = None
    paper: Optional[str] = None
    dimensions_mm: Optional[Dict[str, float]] = None
    thickness_mm: Optional[float] = None
    title_block: Optional[ProjectPropertiesTitleBlock] = None


class ProjectPropertiesLatestCommit(BaseModel):
    hash: str
    full_hash: str
    author: str
    email: str
    date: str
    message: str


class ProjectPropertiesTag(BaseModel):
    tag: str
    commit_hash: str
    date: str
    message: str


class ProjectPropertiesRepository(BaseModel):
    latest_commit: Optional[ProjectPropertiesLatestCommit] = None
    latest_tag: Optional[ProjectPropertiesTag] = None


class ProjectPropertiesFiles(BaseModel):
    schematic: Optional[ProjectPropertiesSchematicFile] = None
    pcb: Optional[ProjectPropertiesPcbFile] = None


class ProjectPropertiesResponse(BaseModel):
    project: project_service.Project
    repository: ProjectPropertiesRepository
    files: ProjectPropertiesFiles


def _repo_context(project: project_service.Project) -> tuple[str, Optional[str]]:
    """Return repository path and optional subproject relative path for project-scoped git operations."""
    if project.parent_repo_path and project.sub_path:
        return project.parent_repo_path, project.sub_path
    if project.import_type == "type2_subproject":
        return project.parent_repo_path or os.path.dirname(project.path), project.sub_path
    return project.path, None


def _resolve_output_dir(project_path: str, output_type: str) -> str:
    resolved = path_config_service.resolve_paths(project_path)
    output_dir = (
        resolved.design_outputs_dir
        if output_type == "design"
        else resolved.manufacturing_outputs_dir
    )
    if not output_dir:
        raise HTTPException(status_code=404, detail=f"{output_type} outputs folder not configured")
    return output_dir


def _join_relative_paths(*parts: Optional[str]) -> str:
    cleaned = []
    for part in parts:
        if not part:
            continue
        normalized = posixpath.normpath(str(part).replace("\\", "/"))
        if normalized in ("", "."):
            continue
        if normalized.startswith("/") or normalized == ".." or normalized.startswith("../"):
            raise HTTPException(status_code=400, detail="Invalid file path")
        cleaned.append(normalized)
    return posixpath.join(*cleaned) if cleaned else ""


def _default_commit_path_config() -> PathConfig:
    return PathConfig(**path_config_service.DEFAULT_PATHS)


def _path_config_from_commit(project: project_service.Project, commit: Optional[str]) -> PathConfig:
    if not commit:
        return path_config_service.get_path_config(project.path)

    repo_path, sub_path = _repo_context(project)
    try:
        prism_file = file_service.read_file_from_commit(
            repo_path,
            commit,
            ".prism.json",
            relative_prefix=sub_path,
            not_found_detail=".prism.json not found",
        )
    except HTTPException as error:
        if error.status_code == 404:
            return _default_commit_path_config()
        raise

    try:
        raw_config = json.loads(prism_file.content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Invalid .prism.json in commit: {error}") from error

    if not isinstance(raw_config, dict):
        return _default_commit_path_config()

    merged: Dict[str, object] = {}
    if isinstance(raw_config.get("paths"), dict):
        merged.update(raw_config["paths"])
    for key, value in raw_config.items():
        if key != "paths":
            merged[key] = value

    for key, default_value in path_config_service.DEFAULT_PATHS.items():
        if not str(merged.get(key) or "").strip():
            merged[key] = default_value

    return PathConfig(**merged)


def _output_dir_from_config(config: PathConfig, output_type: str) -> str:
    output_dir = (
        config.designOutputs
        if output_type == "design"
        else config.manufacturingOutputs
    )
    if not output_dir:
        raise HTTPException(status_code=404, detail=f"{output_type} outputs folder not configured")
    return output_dir


def _read_commit_file(
    project: project_service.Project,
    commit: str,
    file_path: str,
    *,
    relative_prefix: Optional[str] = None,
    not_found_detail: str = "File not found",
) -> file_service.CommitFile:
    repo_path, sub_path = _repo_context(project)
    prefix = sub_path
    if relative_prefix:
        prefix = _join_relative_paths(prefix, relative_prefix)

    return file_service.read_file_from_commit(
        repo_path,
        commit,
        file_path,
        relative_prefix=prefix,
        not_found_detail=not_found_detail,
    )


def _read_configured_commit_file(
    project: project_service.Project,
    commit: str,
    configured_path: Optional[str],
    *,
    not_found_detail: str,
) -> file_service.CommitFile:
    path = configured_path or ""
    if not path:
        raise HTTPException(status_code=404, detail=not_found_detail)

    if "*" not in path:
        return _read_commit_file(project, commit, path, not_found_detail=not_found_detail)

    repo_path, sub_path = _repo_context(project)
    matches = file_service.find_files_in_commit(repo_path, commit, path, relative_prefix=sub_path)
    if not matches:
        raise HTTPException(status_code=404, detail=not_found_detail)
    return _read_commit_file(project, commit, matches[0], not_found_detail=not_found_detail)


def _commit_file_response(
    commit_file: file_service.CommitFile,
    *,
    inline: bool = True,
    headers: Optional[Dict[str, str]] = None,
) -> Response:
    media_type = mimetypes.guess_type(commit_file.name)[0] or "application/octet-stream"
    response_headers = dict(headers or {})
    disposition = "inline" if inline else "attachment"
    safe_name = commit_file.name.replace('"', "")
    response_headers["Content-Disposition"] = (
        f'{disposition}; filename="{safe_name}"; filename*=UTF-8\'\'{quote(commit_file.name)}'
    )
    return Response(content=commit_file.content, media_type=media_type, headers=response_headers)


def _files_from_commit(
    project: project_service.Project,
    commit: str,
    directory_path: str,
) -> List[file_service.FileItem]:
    repo_path, sub_path = _repo_context(project)
    return file_service.get_files_from_commit(
        repo_path,
        commit,
        directory_path,
        relative_prefix=sub_path,
    )


def _find_commit_3d_model(
    project: project_service.Project,
    commit: str,
    config: PathConfig,
) -> file_service.CommitFile:
    design_dir = _output_dir_from_config(config, "design")
    files = _files_from_commit(project, commit, design_dir)

    model_files = [
        item for item in files
        if not item.is_dir and item.name.lower().endswith((".glb", ".step", ".stp"))
    ]
    selected = next((item for item in model_files if item.path.lower().startswith("3dmodel/")), None)
    if selected is None:
        selected = next((item for item in model_files if "/" not in item.path), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="3D model not found")

    return _read_commit_file(
        project,
        commit,
        selected.path,
        relative_prefix=design_dir,
        not_found_detail="3D model not found",
    )


def _find_commit_ibom(
    project: project_service.Project,
    commit: str,
    config: PathConfig,
) -> file_service.CommitFile:
    design_dir = _output_dir_from_config(config, "design")
    files = _files_from_commit(project, commit, design_dir)
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

    return _read_commit_file(
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
        raise HTTPException(status_code=500, detail=f"{read_error_prefix}: {error}") from error


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
        commit_file = _read_commit_file(
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
    config = _path_config_from_commit(project, commit)
    readme_filename = config.readme or "README.md"

    if commit:
        try:
            return _read_file_from_commit(project, commit, readme_filename)
        except HTTPException as error:
            if error.status_code == 404:
                return None
            raise

    resolved = path_config_service.resolve_paths(project.path, config)
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

@router.get("/monorepos/{repo_name}/structure")
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

@router.get("/search")
async def search_projects(
    q: str = "",
    limit: int = Query(default=100, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Search across all projects (standalone and monorepo sub-projects).
    Uses SQL LIKE — no full hydration needed.
    """
    query = q.strip()
    if not query:
        return {"results": []}

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

@router.post("/analyze")
async def analyze_repository(
    request: AnalyzeRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """
    Analyze a repository to determine import type and discover KiCAD projects.
    Returns Type-1 or Type-2 classification and project list.
    """
    try:
        job_id = await asyncio.to_thread(
            project_import_service.start_analyze_job,
            request.url,
            request.ref,
            requested_by=user.email,
        )
        return {"job_id": job_id, "status": "started"}

    except (RemoteUrlError, GitAccessError) as e:
        # A rejected URL or an access failure is something the caller can fix, and
        # the message says how, so it must not be flattened into a generic 500.
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/access-help", dependencies=[Depends(require_designer)])
async def import_access_help(request: AnalyzeRequest):
    """What to do about a repository Prism cannot read.

    The import dialog calls this after a permission failure so it can show the
    key to register and a link to the right page on the detected forge, instead
    of leaving the user with a message and nowhere to go.
    """
    try:
        parsed = parse_remote_url(request.url, project_import_service.remote_url_policy())
    except RemoteUrlError as error:
        raise HTTPException(status_code=400, detail=str(error))

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


@router.post("/import")
async def import_project(
    request: ImportRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """
    Start an async project import job.
    For Type-1: imports single project at root.
    For Type-2: imports selected subprojects.
    """
    try:
        job_id = await asyncio.to_thread(
            project_import_service.start_import_job,
            repo_url=request.url,
            import_type=request.import_type,
            selected_paths=request.selected_paths,
            ref=request.ref,
            requested_by=user.email,
        )
        return {"job_id": job_id, "status": "started"}
    except (RemoteUrlError, GitAccessError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """
    Get the status of an import job.
    """
    status = await asyncio.to_thread(project_service.get_job_status, job_id)
    if not status:
        status = await asyncio.to_thread(project_import_service.get_job_status, job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status

@router.post("/{project_id}/sync", dependencies=[Depends(require_designer)])
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
    type: str # design, manufacturing, render, webgpu_3d
    author: Optional[str] = "anonymous"
    force: bool = False
    commit: Optional[str] = None

@router.post("/{project_id}/workflows", dependencies=[Depends(require_designer)])
async def trigger_workflow(
    project_id: str,
    request: WorkflowRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Trigger a KiCAD workflow (jobset output).
    """
    valid_types = ["design", "manufacturing", "render", "webgpu_3d"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid workflow type")
        
    try:
        _ = get_project_for_role_or_404(project_id, user.role)
        job_id = await asyncio.to_thread(
            project_service.start_workflow_job,
            project_id,
            request.type,
            request.author,
            force=request.force,
            commit=request.commit if request.type == "webgpu_3d" else None,
        )
        return {"job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/semantic-index/status")
async def get_semantic_index_status(
    project_id: str,
    commit: Optional[str] = Query(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    try:
        return await asyncio.to_thread(semantic_index_service.get_status, project, commit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


class SemanticIndexGenerateRequest(BaseModel):
    commit: Optional[str] = None
    force: bool = False


@router.post("/{project_id}/semantic-index/generate", dependencies=[Depends(require_designer)])
async def generate_semantic_index(
    project_id: str,
    request: SemanticIndexGenerateRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    _ = get_project_for_role_or_404(project_id, user.role)
    try:
        job_id = await asyncio.to_thread(
            project_service.start_semantic_index_job,
            project_id,
            commit=request.commit,
            force=request.force,
            requested_by=user.email,
        )
        return {"job_id": job_id, "status": "started"}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/{project_id}/semantic-index/identity")
async def get_semantic_index_identity(
    project_id: str,
    commit: Optional[str] = Query(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    try:
        payload = await asyncio.to_thread(
            semantic_index_service.get_or_build,
            project,
            commit,
        )
        return Response(
            content=json.dumps(payload),
            media_type="application/json",
            headers={
                "Cache-Control": "private, max-age=300",
                "ETag": f'"{payload.get("sourceRevisionKey", "")}-{semantic_index_service.generator_cache_tag()}"',
            },
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/{project_id}/webgpu-3d/status")
async def get_webgpu_3d_status(
    project_id: str,
    commit: Optional[str] = Query(default=None),
    diagnostic: bool = Query(
        default=False,
        description="Perform full bundle validation instead of metadata-only readiness.",
    ),
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    try:
        status_reader = (
            semantic_visualizer_service.get_status
            if diagnostic
            else semantic_visualizer_service.get_status_fast
        )
        return await asyncio.to_thread(status_reader, project, commit)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


class WebGpu3dGenerateRequest(BaseModel):
    commit: Optional[str] = None
    force: bool = False


@router.post("/{project_id}/webgpu-3d/generate", dependencies=[Depends(require_designer)])
async def generate_webgpu_3d(
    project_id: str,
    request: WebGpu3dGenerateRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    _ = get_project_for_role_or_404(project_id, user.role)
    job_id = await asyncio.to_thread(
        project_service.start_workflow_job,
        project_id,
        "webgpu_3d",
        user.email,
        force=request.force,
        commit=request.commit,
    )
    return {"job_id": job_id}


@router.get("/{project_id}/webgpu-3d/manifest")
async def get_webgpu_3d_manifest(
    project_id: str,
    commit: Optional[str] = Query(default=None),
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    status = await asyncio.to_thread(
        semantic_visualizer_service.get_status_fast,
        project,
        commit,
    )
    if not status.get("available"):
        raise HTTPException(status_code=404, detail="WebGPU 3D assets are not available for this revision")
    path = semantic_visualizer_service.bundle_path(
        project_id,
        status["source_fingerprint"],
        status["build_fingerprint"],
    )
    if not path.is_file():
        selector = str(status.get("status_selector") or "")
        if selector:
            await asyncio.to_thread(
                v3_jobs.invalidate_webgpu_ready,
                project_id,
                selector,
                str(status["build_fingerprint"]),
            )
        raise HTTPException(status_code=404, detail="WebGPU 3D assets are not available for this revision")
    return FileResponse(path, media_type="application/json", headers={"Cache-Control": "private, max-age=300"})


@router.get("/{project_id}/webgpu-3d/assets/{source_revision_key}/{generator_build}/{asset_path:path}")
async def get_webgpu_3d_asset(
    project_id: str,
    source_revision_key: str,
    generator_build: str,
    asset_path: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    _ = get_project_for_role_or_404(project_id, user.role)
    try:
        root = semantic_visualizer_service.bundle_dir(
            project_id,
            source_revision_key,
            generator_build,
        ).resolve()
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    candidate = (root / asset_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid WebGPU asset path")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="WebGPU asset not found")
    media_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    return FileResponse(candidate, media_type=media_type, headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.get("/{project_id}/branches")
async def get_project_branches(
    project_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """List branch refs that can be viewed without switching the working checkout."""
    project = get_project_for_role_or_404(project_id, user.role)
    repo_path, relative_path = _repo_context(project)
    return await asyncio.to_thread(get_branches, repo_path, relative_path)

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
        return derived_assets.find_thumbnail(project.path, kind=source)
    abs_path = resolve_path_within_root(
        project.path,
        str(row["thumbnail_rel"]),
        invalid_detail="Invalid thumbnail path",
    )
    return abs_path if abs_path.is_file() else None


@router.get("/{project_id}/thumbnail")
async def get_project_thumbnail(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    project = get_project_for_role_or_404(project_id, user.role)
    # Use cached thumbnail path from DB, fallback to filesystem detection
    row = workspace.get_project_by_id(project_id)
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


@router.get("/{project_id}/thumbnail/{thumbnail_digest}")
async def get_project_thumbnail_version(
    project_id: str,
    thumbnail_digest: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    row = await asyncio.to_thread(workspace.get_project_by_id, project_id)
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

@router.post("/{project_id}/thumbnail/regenerate", dependencies=[Depends(require_designer)])
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


@router.post("/thumbnails/regenerate")
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

    try:
        job_ids = await asyncio.to_thread(
            project_import_service.start_thumbnail_jobs,
            project_ids,
            requested_by=user.email,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    count = len(job_ids)
    return {
        "status": "queued",
        "job_ids": job_ids,
        "count": count,
        "message": f"Rendering {count} board thumbnail{'s' if count != 1 else ''}",
    }


@router.put("/{project_id}/thumbnail", dependencies=[Depends(require_designer)])
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
    try:
        stored, digest, size = await asyncio.to_thread(
            derived_assets.store_uploaded_thumbnail, project.path, data
        )
    except derived_assets.ThumbnailImageError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

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


@router.delete("/{project_id}/thumbnail", dependencies=[Depends(require_designer)])
async def clear_project_thumbnail(
    project_id: str,
    user: AuthenticatedUser = Depends(require_designer),
):
    """Drop an uploaded thumbnail and go back to the rendered board."""
    project = get_project_for_role_or_404(project_id, user.role)
    await asyncio.to_thread(
        derived_assets.discard_thumbnail, project.path, kind="custom"
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


@router.get("/{project_id}/properties", response_model=ProjectPropertiesResponse)
async def get_project_properties(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    project = get_project_for_role_or_404(project_id, user.role)
    return await asyncio.to_thread(_build_project_properties, project)


def _build_project_properties(project: project_service.Project) -> ProjectPropertiesResponse:
    repo_path, relative_path = _repo_context(project)
    if relative_path:
        releases = get_releases_filtered(repo_path, relative_path)
        latest_page = get_commits_list_filtered(repo_path, relative_path, 1)
    else:
        releases = get_releases(repo_path)
        latest_page = get_commits_list(repo_path, 1)

    latest_commits = latest_page["commits"] if isinstance(latest_page, dict) else latest_page
    latest_commit = latest_commits[0] if latest_commits else None
    latest_tag = releases[0] if releases else None

    schematic_path = project_service.find_schematic_file(project.path)
    pcb_path = project_service.find_pcb_file(project.path)
    schematic_metadata = project_properties_service.extract_schematic_metadata(project.path, schematic_path)
    pcb_metadata = project_properties_service.extract_pcb_metadata(project.path, pcb_path)

    return ProjectPropertiesResponse(
        project=project,
        repository=ProjectPropertiesRepository(
            latest_commit=(
                ProjectPropertiesLatestCommit(**latest_commit)
                if latest_commit
                else None
            ),
            latest_tag=(
                ProjectPropertiesTag(**latest_tag)
                if latest_tag
                else None
            ),
        ),
        files=ProjectPropertiesFiles(
            schematic=(
                ProjectPropertiesSchematicFile(**schematic_metadata)
                if schematic_metadata
                else None
            ),
            pcb=(
                ProjectPropertiesPcbFile(**pcb_metadata)
                if pcb_metadata
                else None
            ),
        ),
    )


@router.get("/{project_id}/overview")
async def get_project_overview(
    project_id: str,
    commit: str = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return project detail and README content in one payload for the overview page.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    return {
        "project": project.model_dump(),
        "readme": _load_project_readme_content(project, commit),
    }


@router.get("/{project_id}/comments/source-urls")
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

@router.delete("/{project_id}", dependencies=[Depends(require_designer)])
async def delete_project_endpoint(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Delete a project from the registry.
    For standalone projects, this also deletes the project files.
    For monorepo sub-projects, only removes the registry entry.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    repo_id = row.get("repo_id")
    import_type = row.get("import_type") or "single"
    clone_path = row.get("parent_repo_path") or project.path
    success = await asyncio.to_thread(workspace.delete_project, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")

    remaining_projects = await asyncio.to_thread(workspace.get_projects_by_repo, repo_id) if repo_id else []
    should_delete_repo = import_type == "single" or not remaining_projects
    removed_files = False
    file_warning = None

    if should_delete_repo and repo_id:
        await asyncio.to_thread(workspace.delete_repository, repo_id)
        try:
            projects_root = Path(project_service.PROJECTS_ROOT).resolve()
            target = Path(clone_path).resolve()
            if target != projects_root and projects_root in target.parents and target.exists():
                await asyncio.to_thread(shutil.rmtree, target)
                removed_files = True
        except Exception as exc:
            file_warning = f"Project was removed from the workspace, but files could not be deleted: {exc}"

    response = {"message": "Project deleted successfully", "removed_files": removed_files}
    if file_warning:
        response["warning"] = file_warning
    response["repository_deleted"] = should_delete_repo
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
    project = get_project_for_role_or_404(project_id, user.role)
    if commit:
        config = _path_config_from_commit(project, commit)
        return _files_from_commit(project, commit, _output_dir_from_config(config, output_type))
    return file_service.get_project_files(project.path, output_type)

@router.get("/{project_id}/download")
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
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        commit_file = _read_commit_file(
            project,
            commit,
            path,
            relative_prefix=_output_dir_from_config(config, output_type),
            not_found_detail="File not found",
        )
        return _commit_file_response(commit_file, inline=inline)

    output_dir = _resolve_output_dir(project.path, output_type)

    file_path = resolve_path_within_root(output_dir, path, invalid_detail="Invalid file path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot download directory")

    disposition = "inline" if inline else "attachment"
    return FileResponse(file_path, filename=file_path.name, content_disposition_type=disposition)

@router.get("/{project_id}/readme")
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
    content = _load_project_readme_content(project, commit)
    if content is None:
        raise HTTPException(status_code=404, detail="README not found")
    return {"content": content}

@router.get("/{project_id}/asset/{asset_path:path}")
async def get_project_asset(
    project_id: str,
    asset_path: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Serve assets (images, etc.) from project directory.
    Typically used for README image references.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    if commit:
        commit_file = _read_commit_file(
            project,
            commit,
            asset_path,
            not_found_detail="Asset not found",
        )
        return _commit_file_response(commit_file, inline=True)

    file_path = resolve_path_within_root(project.path, asset_path, invalid_detail="Invalid asset path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot serve directory")

    return FileResponse(file_path)

@router.get("/{project_id}/docs")
async def get_docs_files(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    List all files in the documentation folder.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        docs_path = config.documentation or "docs"
        return _files_from_commit(project, commit, docs_path)
    
    resolved = path_config_service.resolve_paths(project.path)
    docs_dir = resolved.documentation_dir
    
    if not docs_dir or not os.path.exists(docs_dir):
        return []  # Return empty list if docs not configured/found
    
    return file_service.get_files_recursive(docs_dir)

@router.get("/{project_id}/docs/content")
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
    
    # Get documentation path from config
    config = _path_config_from_commit(project, commit)
    docs_path = config.documentation or "docs"
    
    # If viewing a specific commit, use Git
    if commit:
        try:
            content = _read_file_from_commit(project, commit, path, relative_prefix=docs_path)
            return {"content": content, "path": path}
        except HTTPException:
            raise
    
    # Otherwise read from filesystem
    resolved = path_config_service.resolve_paths(project.path)
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

@router.get("/{project_id}/releases")
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
    
    repo_path, relative_path = _repo_context(project)
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

@router.get("/{project_id}/commits/distance")
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

    repo_path, relative_path = _repo_context(project)
    commits_behind = await asyncio.to_thread(
        get_commit_distance,
        repo_path,
        commit,
        relative_path,
        ref,
    )
    return {"commits_behind": commits_behind}

@router.get("/{project_id}/commits")
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
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    repo_path, relative_path = _repo_context(project)
    if relative_path:
        page = await asyncio.to_thread(
            get_commits_list_filtered,
            repo_path,
            relative_path,
            limit,
            ref,
            offset,
            include_total,
        )
    else:
        page = await asyncio.to_thread(
            get_commits_list,
            project.path,
            limit,
            ref,
            offset,
            include_total,
        )
    
    return page


@router.get("/{project_id}/commits/{commit_hash}/summary")
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
    repo_path, relative_path = _repo_context(project)
    return await asyncio.to_thread(
        get_commit_file_summary,
        repo_path,
        commit_hash,
        relative_path,
    )


@router.get("/{project_id}/schematic")
async def get_project_schematic(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        commit_file = _read_configured_commit_file(
            project,
            commit,
            config.schematic or "*.kicad_sch",
            not_found_detail="Schematic not found",
        )
        return _commit_file_response(commit_file, inline=True)
    
    path = project_service.find_schematic_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="Schematic not found")
    return FileResponse(path)

@router.get("/{project_id}/schematic/subsheets")
async def get_project_subsheets(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        main_schematic = _read_configured_commit_file(
            project,
            commit,
            config.schematic or "*.kicad_sch",
            not_found_detail="Schematic not found",
        )
        repo_path, sub_path = _repo_context(project)
        root_sheets = [
            path for path in file_service.find_files_in_commit(
                repo_path,
                commit,
                "*.kicad_sch",
                relative_prefix=sub_path,
            )
            if path != main_schematic.path
        ]
        subsheets_dir = config.subsheets or "Subsheets"
        nested_sheets = [
            _join_relative_paths(subsheets_dir, item.path)
            for item in _files_from_commit(project, commit, subsheets_dir)
            if not item.is_dir and item.name.endswith(".kicad_sch")
        ]
        subsheets = sorted({*root_sheets, *nested_sheets})
        subsheet_urls = [
            {
                "name": sheet,
                "url": f"/api/projects/{quote(project_id, safe='')}/asset/{quote(sheet, safe='/')}?commit={quote(commit, safe='')}",
            }
            for sheet in subsheets
        ]
        return {"files": subsheet_urls}
    
    main_path = project_service.find_schematic_file(project.path)
    if not main_path:
        raise HTTPException(status_code=404, detail="Schematic not found")
        
    subsheets = sorted(project_service.get_subsheets(project.path, main_path))
    # Convert filenames to URLs
    subsheet_urls = [{"name": s, "url": f"/api/projects/{project_id}/asset/{s}"} for s in subsheets]
    return {"files": subsheet_urls}


@router.get("/{project_id}/viewer/support-files")
async def get_project_viewer_support_files(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """Return the small project/worksheet sources required by ecad-viewer.

    These are identity and presentation inputs, not generated semantic assets.
    Keeping them separate from the schematic endpoint lets the root sheet paint
    immediately while the host appends project settings and the custom page
    layout without remounting the viewer.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        repo_path, sub_path = _repo_context(project)
        pro_paths = file_service.find_files_in_commit(
            repo_path, commit, "*.kicad_pro", relative_prefix=sub_path
        )
        if not pro_paths:
            return {"files": []}
        config = _path_config_from_commit(project, commit)
        expected_stem = Path(config.schematic or "").stem
        pro_path = next(
            (path for path in pro_paths if Path(path).stem == expected_stem),
            pro_paths[0],
        )
        pro_file = _read_commit_file(project, commit, pro_path)
        files = [
            {
                "filename": Path(pro_path).name,
                "content": pro_file.content.decode("utf-8"),
            }
        ]
        try:
            settings = json.loads(pro_file.content.decode("utf-8"))
            configured = str(
                settings.get("schematic", {}).get("page_layout_descr_file", "")
                or settings.get("pcbnew", {}).get("page_layout_descr_file", "")
            )
        except (UnicodeDecodeError, json.JSONDecodeError):
            configured = ""
        worksheet_name = Path(configured.replace("kicad-embed://", "")).name
        if worksheet_name:
            worksheet_paths = file_service.find_files_in_commit(
                repo_path, commit, "*.kicad_wks", relative_prefix=sub_path
            )
            worksheet_path = next(
                iter(
                    sorted(
                        (
                            path
                            for path in worksheet_paths
                            if Path(path).name == worksheet_name
                        ),
                        key=_worksheet_path_key,
                    )
                ),
                None,
            )
            if worksheet_path:
                worksheet = _read_commit_file(project, commit, worksheet_path)
                files.append(
                    {
                        "filename": worksheet_path,
                        "content": worksheet.content.decode("utf-8"),
                    }
                )
        return {"files": files}

    project_file = semantic_visualizer_service.find_kicad_project(project.path)
    files = [
        {
            "filename": project_file.name,
            "content": project_file.read_text(encoding="utf-8"),
        }
    ]
    try:
        settings = json.loads(files[0]["content"])
        configured = str(
            settings.get("schematic", {}).get("page_layout_descr_file", "")
            or settings.get("pcbnew", {}).get("page_layout_descr_file", "")
        )
    except json.JSONDecodeError:
        configured = ""
    worksheet_name = Path(configured.replace("kicad-embed://", "")).name
    if worksheet_name:
        worksheet = next(
            iter(
                sorted(
                    (
                        path
                        for path in Path(project.path).rglob(worksheet_name)
                        if path.is_file()
                    ),
                    key=_worksheet_path_key,
                )
            ),
            None,
        )
        if worksheet:
            files.append(
                {
                    "filename": worksheet.relative_to(project.path).as_posix(),
                    "content": worksheet.read_text(encoding="utf-8"),
                }
            )
    return {"files": files}

@router.get("/{project_id}/pcb")
async def get_project_pcb(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        commit_file = _read_configured_commit_file(
            project,
            commit,
            config.pcb or "*.kicad_pcb",
            not_found_detail="PCB not found",
        )
        return _commit_file_response(commit_file, inline=True)
    
    path = project_service.find_pcb_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="PCB not found")
    return FileResponse(path)

@router.get("/{project_id}/3d-model")
async def get_project_3d_model(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        commit_file = _find_commit_3d_model(project, commit, config)
        return _commit_file_response(
            commit_file,
            inline=True,
            headers={"Cache-Control": "public, max-age=300"},
        )
    
    path = project_service.find_3d_model(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="3D model not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=300"})

@router.get("/{project_id}/ibom")
async def get_project_ibom(
    project_id: str,
    commit: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)

    if commit:
        config = _path_config_from_commit(project, commit)
        commit_file = _find_commit_ibom(project, commit, config)
        return _commit_file_response(
            commit_file,
            inline=True,
            headers={"Cache-Control": "public, max-age=60"},
        )
    
    path = project_service.find_ibom_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="iBoM not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=60"})


# Path Configuration Endpoints

@router.get("/{project_id}/config")
async def get_project_config(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Get path configuration for a project.
    Returns the current path configuration (from .prism.json or auto-detected).
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    config = path_config_service.get_path_config(project.path)
    resolved = path_config_service.resolve_paths(project.path, config)
    explicit_config = path_config_service._load_prism_config(project.path)
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


@router.post("/{project_id}/detect-paths", dependencies=[Depends(require_designer)])
async def detect_project_paths(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Run auto-detection on project paths.
    Returns detected paths without saving them.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    detected = path_config_service.detect_paths(project.path)
    
    return {
        "detected": detected.model_dump(),
        "validation": path_config_service.validate_config(project.path, detected)
    }


@router.put("/{project_id}/config", dependencies=[Depends(require_designer)])
async def update_project_config(
    project_id: str,
    config: PathConfig,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Update path configuration for a project.
    Saves configuration to .prism.json file.
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
    path_config_service.save_path_config(project.path, config)
    
    # Clear cache to ensure fresh resolution
    path_config_service.clear_config_cache(project.path)
    file_service.invalidate_file_listing_cache()
    
    # Get resolved paths
    resolved = path_config_service.resolve_paths(project.path, config)
    
    return {
        "config": config.model_dump(),
        "resolved": resolved.model_dump(),
        "validation": validation
    }


class ProjectNameRequest(BaseModel):
    display_name: str


class ProjectDescriptionRequest(BaseModel):
    description: str


@router.get("/{project_id}/name")
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


@router.put("/{project_id}/name", dependencies=[Depends(require_designer)])
async def update_project_name(
    project_id: str,
    request: ProjectNameRequest,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Update the display name for a project in .prism.json.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    
    display_name = request.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Display name cannot be empty")

    # Get current config
    config = path_config_service.get_path_config(project.path)
    
    # Update project name
    config.project_name = display_name
    
    # Save to .prism.json
    path_config_service.save_path_config(project.path, config)
    await asyncio.to_thread(workspace.update_project, project_id, display_name=display_name)
    
    return {
        "display_name": display_name,
        "message": "Project name updated successfully"
    }


@router.get("/{project_id}/description")
async def get_project_description(project_id: str, user: AuthenticatedUser = Depends(require_viewer)):
    """
    Get project description from project registry.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    return {
        "description": project.description
    }


@router.put("/{project_id}/description", dependencies=[Depends(require_designer)])
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

    # Also persist to .prism.json for compatibility
    config = path_config_service.get_path_config(project.path)
    config.description = next_description
    path_config_service.save_path_config(project.path, config)

    return {
        "description": next_description,
        "message": "Project description updated successfully"
    }
