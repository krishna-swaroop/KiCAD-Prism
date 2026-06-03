import asyncio
import json
import mimetypes
import os
import posixpath
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.api._helpers import (
    _row_to_project,
    get_project_for_role_or_404,
    require_output_type,
    resolve_path_within_root,
)
from app.core.config import settings
from app.core.security import AuthenticatedUser, require_designer, require_viewer
from app.services import (
    file_service,
    path_config_service,
    pcb_diff_service,
    project_import_service,
    project_properties_service,
    project_service,
    sch_diff_service,
)
from app.services.comments_url_service import (
    build_comments_source_urls,
    resolve_comments_base_url,
)
from app.services.git_service import (
    get_commit_distance,
    get_commit_file_summary,
    get_commits_list,
    get_commits_list_filtered,
    get_releases,
    get_releases_filtered,
)
from app.services.path_config_service import PathConfig
from app.services.workspace_service import workspace

router = APIRouter(dependencies=[Depends(require_viewer)])

ARCHIVE_DIR_NAMES = {"archive", "archived", "old", "backup", "backups", "obsolete"}


class Monorepo(BaseModel):
    name: str
    path: str
    project_count: int
    last_synced: str | None = None
    repo_url: str | None = None


class ProjectPropertiesTitleBlock(BaseModel):
    title: str = ""
    date: str = ""
    rev: str = ""
    company: str = ""
    comments: dict[str, str] = Field(default_factory=dict)


class ProjectPropertiesSchematicFile(BaseModel):
    path: str
    filename: str
    version: int | None = None
    generator: str | None = None
    generator_version: str | None = None
    paper: str | None = None
    uuid: str | None = None
    title_block: ProjectPropertiesTitleBlock | None = None


class ProjectPropertiesPcbFile(BaseModel):
    path: str
    filename: str
    version: int | None = None
    generator: str | None = None
    generator_version: str | None = None
    paper: str | None = None
    dimensions_mm: dict[str, float] | None = None
    thickness_mm: float | None = None
    title_block: ProjectPropertiesTitleBlock | None = None


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
    latest_commit: ProjectPropertiesLatestCommit | None = None
    latest_tag: ProjectPropertiesTag | None = None


class ProjectPropertiesFiles(BaseModel):
    schematic: ProjectPropertiesSchematicFile | None = None
    pcb: ProjectPropertiesPcbFile | None = None


class ProjectPropertiesResponse(BaseModel):
    project: project_service.Project
    repository: ProjectPropertiesRepository
    files: ProjectPropertiesFiles


def _repo_context(project: project_service.Project) -> tuple[str, str | None]:
    """Return repository path and optional subproject relative path for project-scoped git operations."""
    if project.parent_repo_path and project.sub_path:
        return project.parent_repo_path, project.sub_path
    if project.import_type == "type2_subproject":
        return project.parent_repo_path or os.path.dirname(
            project.path
        ), project.sub_path
    return project.path, None


def _resolve_output_dir(project_path: str, output_type: str) -> str:
    resolved = path_config_service.resolve_paths(project_path)
    output_dir = (
        resolved.design_outputs_dir
        if output_type == "design"
        else resolved.manufacturing_outputs_dir
    )
    if not output_dir:
        raise HTTPException(
            status_code=404, detail=f"{output_type} outputs folder not configured"
        )
    return output_dir


def _join_relative_paths(*parts: str | None) -> str:
    cleaned = []
    for part in parts:
        if not part:
            continue
        normalized = posixpath.normpath(str(part).replace("\\", "/"))
        if normalized in ("", "."):
            continue
        if (
            normalized.startswith("/")
            or normalized == ".."
            or normalized.startswith("../")
        ):
            raise HTTPException(status_code=400, detail="Invalid file path")
        cleaned.append(normalized)
    return posixpath.join(*cleaned) if cleaned else ""


def _default_commit_path_config() -> PathConfig:
    return PathConfig(**path_config_service.DEFAULT_PATHS)


def _path_config_from_commit(
    project: project_service.Project, commit: str | None
) -> PathConfig:
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
        raise HTTPException(
            status_code=500, detail=f"Invalid .prism.json in commit: {error}"
        ) from error

    if not isinstance(raw_config, dict):
        return _default_commit_path_config()

    merged: dict[str, object] = {}
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
        config.designOutputs if output_type == "design" else config.manufacturingOutputs
    )
    if not output_dir:
        raise HTTPException(
            status_code=404, detail=f"{output_type} outputs folder not configured"
        )
    return output_dir


def _read_commit_file(
    project: project_service.Project,
    commit: str,
    file_path: str,
    *,
    relative_prefix: str | None = None,
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
    configured_path: str | None,
    *,
    not_found_detail: str,
) -> file_service.CommitFile:
    path = configured_path or ""
    if not path:
        raise HTTPException(status_code=404, detail=not_found_detail)

    if "*" not in path:
        return _read_commit_file(
            project, commit, path, not_found_detail=not_found_detail
        )

    repo_path, sub_path = _repo_context(project)
    matches = file_service.find_files_in_commit(
        repo_path, commit, path, relative_prefix=sub_path
    )
    if not matches:
        raise HTTPException(status_code=404, detail=not_found_detail)
    return _read_commit_file(
        project, commit, matches[0], not_found_detail=not_found_detail
    )


def _commit_file_response(
    commit_file: file_service.CommitFile,
    *,
    inline: bool = True,
    headers: dict[str, str] | None = None,
) -> Response:
    media_type = mimetypes.guess_type(commit_file.name)[0] or "application/octet-stream"
    response_headers = dict(headers or {})
    disposition = "inline" if inline else "attachment"
    safe_name = commit_file.name.replace('"', "")
    response_headers["Content-Disposition"] = (
        f"{disposition}; filename=\"{safe_name}\"; filename*=UTF-8''{quote(commit_file.name)}"
    )
    return Response(
        content=commit_file.content, media_type=media_type, headers=response_headers
    )


def _files_from_commit(
    project: project_service.Project,
    commit: str,
    directory_path: str,
) -> list[file_service.FileItem]:
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
        item
        for item in files
        if not item.is_dir and item.name.lower().endswith((".glb", ".step", ".stp"))
    ]
    selected = next(
        (item for item in model_files if item.path.lower().startswith("3dmodel/")), None
    )
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
            item
            for item in files
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


def _read_utf8_file(
    file_path: str | Path, *, not_found_detail: str, read_error_prefix: str
) -> str:
    path = Path(file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=not_found_detail)
    if path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot read directory")

    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise HTTPException(
            status_code=500, detail=f"{read_error_prefix}: {error}"
        ) from error


def _read_file_from_commit(
    project: project_service.Project,
    commit: str,
    file_path: str,
    *,
    relative_prefix: str | None = None,
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
        raise HTTPException(
            status_code=400, detail="Binary file cannot be decoded"
        ) from error


def _filter_projects_for_user(
    projects: list[project_service.Project],
    user: AuthenticatedUser,
) -> list[project_service.Project]:
    return [
        p
        for p in projects
        if workspace.is_folder_visible_to_role(p.folder_id, user.role)
    ]


def _load_project_readme_content(
    project: project_service.Project,
    commit: str | None = None,
) -> str | None:
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


@router.get("/", response_model=list[project_service.Project])
async def list_projects(user: AuthenticatedUser = Depends(require_viewer)):
    """Return all registered projects (both Type-1 and Type-2)."""
    rows = await asyncio.to_thread(workspace.get_all_projects, user.role)
    return [_row_to_project(r) for r in rows]


@router.get("/monorepos", response_model=list[Monorepo])
async def list_monorepos(user: AuthenticatedUser = Depends(require_viewer)):
    """
    List all monorepos with their metadata.
    Uses workspace DB - no subprocess calls.
    """
    repos = await asyncio.to_thread(workspace.get_repositories, "multi")
    result = []
    for repo in repos:
        projects = await asyncio.to_thread(workspace.get_projects_by_repo, repo["id"])
        abs_path = workspace._abs_clone_path(repo["clone_path"])
        result.append(
            Monorepo(
                name=repo["name"],
                path=abs_path,
                project_count=len(projects),
                last_synced=repo.get("last_synced_at"),
                repo_url=repo.get("url"),
            )
        )
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

    current_path = resolve_path_within_root(
        repo_path, subpath, invalid_detail="Invalid path"
    )
    if not current_path.exists() or not current_path.is_dir():
        raise HTTPException(status_code=404, detail="Path not found")

    folders = []
    projects = []

    all_rows = workspace.get_all_projects(user.role)
    all_registered = [_row_to_project(r) for r in all_rows]
    repo_projects = {
        p.sub_path: p for p in all_registered if p.parent_repo == repo_name
    }

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

        folders.append(
            {"name": item_name, "path": relative_path, "item_count": item_count}
        )

        if any(name.endswith(".kicad_pro") for name in child_names):
            project = repo_projects.get(relative_path)
            if project:
                custom_display_name = path_config_service.get_project_display_name(
                    str(item_path)
                )
                projects.append(
                    {
                        "id": project.id,
                        "name": project.name,
                        "display_name": custom_display_name,
                        "relative_path": relative_path,
                        "has_thumbnail": project_service.get_project_thumbnail_path(
                            project.id
                        )
                        is not None,
                        "last_modified": project.last_modified,
                    }
                )

    return {
        "repo_name": repo_name,
        "current_path": subpath,
        "folders": folders,
        "projects": projects,
    }


@router.get("/search")
async def search_projects(
    q: str = "",
    limit: int = Query(default=100, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Search across all projects (standalone and monorepo sub-projects).
    Uses SQL LIKE - no full hydration needed.
    """
    query = q.strip()
    if not query:
        return {"results": []}

    rows = await asyncio.to_thread(workspace.search_projects, query, limit, user.role)
    results = []
    for r in rows:
        results.append(
            {
                "id": r["id"],
                "name": r["name"],
                "description": r.get("description", ""),
                "parent_repo": r.get("parent_repo"),
                "sub_path": r.get("relative_path")
                if r.get("relative_path") != "."
                else None,
                "last_modified": r.get("last_modified", ""),
                "thumbnail_url": f"/api/projects/{r['id']}/thumbnail"
                if r.get("thumbnail_rel")
                else None,
            }
        )
    return {"results": results}


class AnalyzeRequest(BaseModel):
    url: str


class ImportRequest(BaseModel):
    url: str
    import_type: str  # "type1" or "type2"
    selected_paths: list[str] | None = None
    local_path_mode: str | None = None  # "reference" or "copy" for local imports


def _check_local_import_permission(url: str, user: AuthenticatedUser) -> None:
    """Raise 403 if a local-path import is not permitted for this user.

    Local imports are admin-only.  When LOCAL_IMPORT_ALLOWED_ROOTS is set the
    requested path must also be inside one of the configured roots.
    """
    if not project_import_service.is_local_path(url):
        return
    from app.core.roles import role_meets_minimum

    if not role_meets_minimum(user.role, "admin"):
        raise HTTPException(
            status_code=403,
            detail="Local path imports are restricted to admin users",
        )
    allowed_roots = settings.LOCAL_IMPORT_ALLOWED_ROOTS
    if allowed_roots:
        # Resolve the configured roots (trusted config values) and check whether
        # the user-supplied path starts with one of them after normalisation.
        # We avoid calling Path(url).resolve() with unsanitised input by using
        # os.path.normpath instead, which does not hit the filesystem.
        import os as _os

        normalised_url = _os.path.normpath(url)
        resolved_roots = [str(Path(r).resolve()) for r in allowed_roots]
        if not any(
            normalised_url == root or normalised_url.startswith(root + _os.sep)
            for root in resolved_roots
        ):
            raise HTTPException(
                status_code=403,
                detail="Path is not within an allowed import root",
            )


@router.post("/analyze")
async def analyze_repository(
    request: AnalyzeRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """
    Analyze a repository (remote URL or local path) to determine import type
    and discover KiCAD projects.
    """
    _check_local_import_permission(request.url, user)
    try:
        job_id = project_import_service.start_analyze_job(request.url)
        return {"job_id": job_id, "status": "started"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}") from e


@router.post("/import")
async def import_project(
    request: ImportRequest,
    user: AuthenticatedUser = Depends(require_designer),
):
    """
    Start an async project import job.
    For Type-1: imports single project at root.
    For Type-2: imports selected subprojects.
    For local paths: admin-only; local_path_mode must be "reference" or "copy".
    """
    _check_local_import_permission(request.url, user)
    if (
        project_import_service.is_local_path(request.url)
        and not request.local_path_mode
    ):
        raise HTTPException(
            status_code=400,
            detail="local_path_mode ('reference' or 'copy') is required for local path imports",
        )
    try:
        job_id = project_import_service.start_import_job(
            repo_url=request.url,
            import_type=request.import_type,
            selected_paths=request.selected_paths,
            local_path_mode=request.local_path_mode,
        )
        return {"job_id": job_id, "status": "started"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """
    Get the status of an import job.
    """
    status = project_import_service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@router.post("/{project_id}/sync", dependencies=[Depends(require_designer)])
async def sync_project_endpoint(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """
    Sync project repository with remote.
    Type-1: pulls the project repo.
    Type-2: pulls the parent repo.
    """
    _ = get_project_for_role_or_404(project_id, user.role)
    result = project_import_service.sync_project(project_id)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    file_service.invalidate_file_listing_cache()

    return result


class WorkflowRequest(BaseModel):
    type: str  # design, manufacturing, render
    author: str | None = "anonymous"


@router.post("/{project_id}/workflows", dependencies=[Depends(require_designer)])
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

    try:
        _ = get_project_for_role_or_404(project_id, user.role)
        job_id = project_service.start_workflow_job(
            project_id, request.type, request.author
        )
        return {"job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{project_id}/thumbnail")
async def get_project_thumbnail(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    project = get_project_for_role_or_404(project_id, user.role)
    # Use cached thumbnail path from DB, fallback to filesystem detection
    row = workspace.get_project_by_id(project_id)
    thumbnail_rel = row.get("thumbnail_rel") if row else None
    if thumbnail_rel:
        # Contain the DB-sourced relative path within the project root so a
        # tampered thumbnail_rel can't escape via '..' or an absolute path.
        try:
            abs_path = resolve_path_within_root(
                project.path, thumbnail_rel, invalid_detail="Invalid thumbnail path"
            )
        except HTTPException:
            abs_path = None
        if abs_path and abs_path.is_file():
            return FileResponse(
                str(abs_path), headers={"Cache-Control": "public, max-age=300"}
            )
    # Fallback: live filesystem detection
    path = project_service.get_project_thumbnail_path(project_id)
    if not path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=300"})


@router.get("/{project_id}", response_model=project_service.Project)
async def get_project_detail(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """Get detailed project information."""
    return get_project_for_role_or_404(project_id, user.role)


@router.get("/{project_id}/properties", response_model=ProjectPropertiesResponse)
async def get_project_properties(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    project = get_project_for_role_or_404(project_id, user.role)
    return await asyncio.to_thread(_build_project_properties, project)


def _build_project_properties(
    project: project_service.Project,
) -> ProjectPropertiesResponse:
    repo_path, relative_path = _repo_context(project)
    if relative_path:
        releases = get_releases_filtered(repo_path, relative_path)
        latest_commits = get_commits_list_filtered(repo_path, relative_path, 1)
    else:
        releases = get_releases(repo_path)
        latest_commits = get_commits_list(repo_path, 1)

    latest_commit = latest_commits[0] if latest_commits else None
    latest_tag = releases[0] if releases else None

    schematic_path = project_service.find_schematic_file(project.path)
    pcb_path = project_service.find_pcb_file(project.path)
    schematic_metadata = project_properties_service.extract_schematic_metadata(
        project.path, schematic_path
    )
    pcb_metadata = project_properties_service.extract_pcb_metadata(
        project.path, pcb_path
    )

    return ProjectPropertiesResponse(
        project=project,
        repository=ProjectPropertiesRepository(
            latest_commit=(
                ProjectPropertiesLatestCommit(**latest_commit)
                if latest_commit
                else None
            ),
            latest_tag=(ProjectPropertiesTag(**latest_tag) if latest_tag else None),
        ),
        files=ProjectPropertiesFiles(
            schematic=(
                ProjectPropertiesSchematicFile(**schematic_metadata)
                if schematic_metadata
                else None
            ),
            pcb=(ProjectPropertiesPcbFile(**pcb_metadata) if pcb_metadata else None),
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
    base_url: str | None = Query(
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
async def delete_project_endpoint(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """
    Delete a project from the registry.
    For standalone projects, this also deletes the project files.
    For monorepo sub-projects, only removes the registry entry.
    """
    _ = get_project_for_role_or_404(project_id, user.role)
    success = await asyncio.to_thread(workspace.delete_project, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted successfully"}


@router.get("/{project_id}/files", response_model=list[file_service.FileItem])
async def get_project_files(
    project_id: str,
    type: str = "design",
    commit: str | None = None,
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
        return _files_from_commit(
            project, commit, _output_dir_from_config(config, output_type)
        )
    return file_service.get_project_files(project.path, output_type)


@router.get("/{project_id}/download")
async def download_file(
    project_id: str,
    path: str,
    type: str = "design",
    inline: bool = False,
    commit: str | None = None,
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

    file_path = resolve_path_within_root(
        output_dir, path, invalid_detail="Invalid file path"
    )

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot download directory")

    disposition = "inline" if inline else "attachment"
    return FileResponse(
        file_path, filename=file_path.name, content_disposition_type=disposition
    )


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
    commit: str | None = None,
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

    file_path = resolve_path_within_root(
        project.path, asset_path, invalid_detail="Invalid asset path"
    )

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot serve directory")

    return FileResponse(file_path)


@router.get("/{project_id}/docs")
async def get_docs_files(
    project_id: str,
    commit: str | None = None,
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
            content = _read_file_from_commit(
                project, commit, path, relative_prefix=docs_path
            )
            return {"content": content, "path": path}
        except HTTPException:
            raise

    # Otherwise read from filesystem
    resolved = path_config_service.resolve_paths(project.path)
    docs_dir = resolved.documentation_dir

    if not docs_dir or not os.path.exists(docs_dir):
        raise HTTPException(status_code=404, detail="Documentation folder not found")

    file_path = resolve_path_within_root(
        docs_dir, path, invalid_detail="Invalid file path"
    )
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
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """
    Get list of Git releases/tags for a project.
    For Type-2 projects, uses parent repo with subproject file tracking.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    repo_path, relative_path = _repo_context(project)
    if relative_path:
        releases = get_releases_filtered(repo_path, relative_path)
    else:
        releases = get_releases(project.path)

    return {"releases": releases}


@router.get("/{project_id}/commits/distance")
async def get_project_commit_distance(
    project_id: str,
    commit: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Count how many commits behind HEAD the requested commit is.
    For Type-2 projects, only commits affecting the subproject path are counted.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    repo_path, relative_path = _repo_context(project)
    commits_behind = get_commit_distance(repo_path, commit, relative_path)
    return {"commits_behind": commits_behind}


@router.get("/{project_id}/commits")
async def get_project_commits(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Get list of commits for a project.
    For Type-2 projects, shows only commits affecting the subproject.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    repo_path, relative_path = _repo_context(project)
    if relative_path:
        commits = get_commits_list_filtered(repo_path, relative_path, limit)
    else:
        commits = get_commits_list(project.path, limit)

    return {"commits": commits}


def _build_commit_summary(
    repo_path: str, relative_path: str | None, commit_hash: str
) -> dict:
    """Blocking work for get_commit_summary - run via asyncio.to_thread."""
    from git import Repo

    files = get_commit_file_summary(repo_path, commit_hash, relative_path)

    parent_hash = None
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
        parent_hash = commit.parents[0].hexsha if commit.parents else None
    except Exception:  # noqa: S110
        pass

    if parent_hash:
        repo_root = sch_diff_service._git_root(Path(repo_path))
        for f in files:
            name = f["filename"]
            if name.endswith(".kicad_sch"):
                _enrich_with_diff(
                    f,
                    repo_root,
                    parent_hash,
                    commit_hash,
                    diff_fn=sch_diff_service.diff_schematics,
                    extract_fn=lambda c: list(
                        sch_diff_service._extract_all(
                            sch_diff_service._parse_sexp(c)
                        ).values()
                    ),
                    out_key="schematic_diff",
                )
            elif name.endswith(".kicad_pcb"):
                _enrich_with_diff(
                    f,
                    repo_root,
                    parent_hash,
                    commit_hash,
                    diff_fn=pcb_diff_service.diff_pcb,
                    extract_fn=lambda c: list(
                        pcb_diff_service._extract_all_pcb(
                            sch_diff_service._parse_sexp(c)
                        ).values()
                    ),
                    out_key="pcb_diff",
                )

    return {"files": files}


@router.get("/{project_id}/commits/{commit_hash}/summary")
async def get_commit_summary(
    project_id: str,
    commit_hash: str,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return files changed in a commit vs its parent, with item-level counts for .kicad_sch files.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    repo_path, relative_path = _repo_context(project)
    return await asyncio.to_thread(
        _build_commit_summary, repo_path, relative_path, commit_hash
    )


@router.get("/{project_id}/commits/{commit_hash}/file")
async def get_commit_file(
    project_id: str,
    commit_hash: str,
    path: str = Query(..., description="Repo-relative file path"),
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Stream raw file content from a specific commit.
    Works for both text and binary files (PDF, images, etc.).
    Returns the file with an appropriate Content-Type header so browsers can
    display it inline (PDF viewer, image preview, etc.).
    """
    import mimetypes

    project = get_project_for_role_or_404(project_id, user.role)
    repo_path, sub_path = _repo_context(project)

    # Reject path traversal
    if ".." in Path(path).parts:
        raise HTTPException(status_code=400, detail="Invalid path")

    # For Type-2 projects constrain reads to the project subpath so sibling
    # boards inside the same monorepo cannot be accessed through this endpoint.
    if sub_path:
        normalised_sub = sub_path.rstrip("/") + "/"
        if not (path == sub_path or path.startswith(normalised_sub)):
            raise HTTPException(
                status_code=403,
                detail="Path is outside the project scope",
            )

    try:
        from git import Repo as GitRepo

        repo = GitRepo(repo_path)
        commit = repo.commit(commit_hash)
        blob = commit.tree / path
        content = blob.data_stream.read()
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"File '{path}' not found in commit {commit_hash[:7]}",
        ) from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e

    mime, _ = mimetypes.guess_type(path)
    if mime is None:
        mime = "application/octet-stream"

    filename = Path(path).name
    return Response(
        content=content,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


# Cap per-bucket items so the summary response stays small even for huge PCB diffs.
_MAX_ITEMS_PER_BUCKET = 200


def _summarise_item(item: dict) -> dict:
    """
    Normalise a diff item (sch or pcb) into a small payload the frontend can
    use to render one clickable row and to navigate the diff viewer to it.
    """
    out = {
        "id": item.get("uuid", ""),
        "type": item.get("type", ""),
    }
    # Identity / human label
    for k in (
        "reference",
        "value",
        "footprint",
        "text",
        "name",
        "net_name",
        "net",
        "sheet_file",
        "sheet_name",
        "lib_id",
        "layer",
    ):
        v = item.get(k)
        if v not in (None, ""):
            out[k] = v
    # Position helps the frontend zoom; omit when zero/missing
    if item.get("x") or item.get("y"):
        out["x"] = item.get("x")
        out["y"] = item.get("y")
    return out


def _summarise_changed(changed_entry: dict) -> dict:
    """A 'changed' entry has shape {item: {...}, changes: {field: {old,new}}}."""
    item = changed_entry.get("item", {})
    return {
        **_summarise_item(item),
        "changes": changed_entry.get("changes", {}),
    }


def _enrich_with_diff(
    file_entry: dict,
    repo_root,
    parent_hash: str,
    commit_hash: str,
    *,
    diff_fn,
    extract_fn,
    out_key: str,
) -> None:
    """
    Add a diff dict (added/removed/changed counts + per-item lists) to
    file_entry under out_key, using the given diff/extract helpers.
    No-op on any failure.
    """
    if file_entry["status"] not in ("modified", "added", "removed"):
        return
    try:
        rel = file_entry["path"]
        if file_entry["status"] == "modified":
            old_c = sch_diff_service._read_file_at_commit(repo_root, parent_hash, rel)
            new_c = sch_diff_service._read_file_at_commit(repo_root, commit_hash, rel)
        elif file_entry["status"] == "added":
            old_c, new_c = (
                None,
                sch_diff_service._read_file_at_commit(repo_root, commit_hash, rel),
            )
        else:  # removed
            old_c, new_c = (
                sch_diff_service._read_file_at_commit(repo_root, parent_hash, rel),
                None,
            )

        if old_c and new_c:
            diff = diff_fn(old_c, new_c)
        elif new_c:
            diff = {"added": extract_fn(new_c), "removed": [], "changed": []}
        elif old_c:
            diff = {"added": [], "removed": extract_fn(old_c), "changed": []}
        else:
            return

        added_full = diff.get("added", [])
        removed_full = diff.get("removed", [])
        changed_full = diff.get("changed", [])

        file_entry[out_key] = {
            "added": len(added_full),
            "removed": len(removed_full),
            "changed": len(changed_full),
            # Per-item lists, capped. The frontend uses these to render one
            # clickable row per change. `truncated` flags when we hit the cap.
            "added_items": [
                _summarise_item(i) for i in added_full[:_MAX_ITEMS_PER_BUCKET]
            ],
            "removed_items": [
                _summarise_item(i) for i in removed_full[:_MAX_ITEMS_PER_BUCKET]
            ],
            "changed_items": [
                _summarise_changed(c) for c in changed_full[:_MAX_ITEMS_PER_BUCKET]
            ],
            "truncated": (
                len(added_full) > _MAX_ITEMS_PER_BUCKET
                or len(removed_full) > _MAX_ITEMS_PER_BUCKET
                or len(changed_full) > _MAX_ITEMS_PER_BUCKET
            ),
        }
    except Exception:  # noqa: S110
        pass


@router.get("/{project_id}/schematic")
async def get_project_schematic(
    project_id: str,
    commit: str | None = None,
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
    commit: str | None = None,
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
            path
            for path in file_service.find_files_in_commit(
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
    subsheet_urls = [
        {"name": s, "url": f"/api/projects/{project_id}/asset/{s}"} for s in subsheets
    ]
    return {"files": subsheet_urls}


@router.get("/{project_id}/pcb")
async def get_project_pcb(
    project_id: str,
    commit: str | None = None,
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
    commit: str | None = None,
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
    commit: str | None = None,
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
async def get_project_config(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
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
        "source": "explicit" if explicit_config else "auto-detected",
    }


@router.post("/{project_id}/detect-paths", dependencies=[Depends(require_designer)])
async def detect_project_paths(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """
    Run auto-detection on project paths.
    Returns detected paths without saving them.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    detected = path_config_service.detect_paths(project.path)

    return {
        "detected": detected.model_dump(),
        "validation": path_config_service.validate_config(project.path, detected),
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
        "validation": validation,
    }


class ProjectNameRequest(BaseModel):
    display_name: str


class ProjectDescriptionRequest(BaseModel):
    description: str


@router.get("/{project_id}/name")
async def get_project_name(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """
    Get the display name for a project.
    Returns custom name from .prism.json or fallback name.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    return {"display_name": project.display_name, "fallback_name": project.name}


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
    await asyncio.to_thread(
        workspace.update_project, project_id, display_name=display_name
    )

    return {
        "display_name": display_name,
        "message": "Project name updated successfully",
    }


@router.get("/{project_id}/description")
async def get_project_description(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer)
):
    """
    Get project description from project registry.
    """
    project = get_project_for_role_or_404(project_id, user.role)

    return {"description": project.description}


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

    updated = await asyncio.to_thread(
        workspace.update_project, project_id, description=next_description
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")

    # Also persist to .prism.json for compatibility
    config = path_config_service.get_path_config(project.path)
    config.description = next_description
    path_config_service.save_path_config(project.path, config)

    return {
        "description": next_description,
        "message": "Project description updated successfully",
    }
