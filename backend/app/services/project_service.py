import os
import hashlib
import json
import shlex
import time
import shutil
import datetime
import subprocess
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from git import Repo
from pydantic import BaseModel

from app.services import path_config_service, semantic_index_service
from app.services.workspace_service import workspace
from app.services.job_artifact_service import job_artifacts
from app.services.job_runtime import JobContext, JobResult
from app.services.job_service import jobs as v3_jobs

class Project(BaseModel):
    id: str
    name: str
    display_name: Optional[str] = None  # Custom name from .prism.json
    description: str
    path: str
    last_modified: str
    registered_at: Optional[str] = None
    thumbnail_url: Optional[str] = None
    # Where the thumbnail came from: "generated" (kicad-cli render), "custom"
    # (uploaded in the workspace) or "repository" (an image committed in the
    # repo, used only when there is nothing to render). The workspace needs
    # this to know which thumbnail actions to offer.
    thumbnail_source: Optional[str] = None
    sub_path: Optional[str] = None  # Relative path within parent repo
    parent_repo: Optional[str] = None  # Parent monorepo name
    repo_url: Optional[str] = None  # Original Git URL
    import_type: Optional[str] = None  # "type1" or "type2_subproject"
    parent_repo_path: Optional[str] = None  # Path to parent repo for Type-2
    folder_id: Optional[str] = None  # Optional folder assignment for workspace organization
    portfolio: Optional[Dict[str, Any]] = None  # Portfolio scene/detail metadata


class RegisteredProjectRecord(BaseModel):
    id: str
    name: str
    path: str
    description: str
    last_modified: str
    registered_at: Optional[str] = None
    sub_path: Optional[str] = None
    parent_repo: Optional[str] = None
    repo_url: Optional[str] = None
    import_type: Optional[str] = None
    parent_repo_path: Optional[str] = None
    folder_id: Optional[str] = None

# PROJECTS_ROOT is where imported projects are stored.
# In Docker, this should be a persistent volume mount.
PROJECTS_ROOT = os.environ.get("KICAD_PROJECTS_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/projects")))

# MONOREPOS_ROOT is where monorepos are cloned (Type-2 sub-projects)
MONOREPOS_ROOT = os.path.join(PROJECTS_ROOT, "type2")

# PROJECT_REGISTRY_FILE tracks all registered projects with metadata
PROJECT_REGISTRY_FILE = os.path.join(PROJECTS_ROOT, ".project_registry.json")

# Ensure directories exist
os.makedirs(PROJECTS_ROOT, exist_ok=True)
os.makedirs(MONOREPOS_ROOT, exist_ok=True)
os.makedirs(os.path.join(PROJECTS_ROOT, "type1"), exist_ok=True)

PROJECTS_CACHE_TTL = 5.0  # seconds

_project_records_cache: List[RegisteredProjectRecord] = []
_project_records_cache_time: float = 0
_projects_cache: List[Project] = []
_projects_cache_time: float = 0

def _load_project_registry() -> Dict[str, dict]:
    """Load the project registry from JSON file."""
    if os.path.exists(PROJECT_REGISTRY_FILE):
        try:
            with open(PROJECT_REGISTRY_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}

def _save_project_registry(registry: Dict[str, dict]) -> None:
    """Save the project registry to JSON file."""
    try:
        with open(PROJECT_REGISTRY_FILE, 'w') as f:
            json.dump(registry, f, indent=2)
        invalidate_project_caches()
    except IOError as e:
        print(f"Warning: Failed to save project registry: {e}")


def invalidate_project_caches() -> None:
    from app.services import project_properties_service

    global _project_records_cache, _project_records_cache_time
    global _projects_cache, _projects_cache_time
    _project_records_cache = []
    _project_records_cache_time = 0
    _projects_cache = []
    _projects_cache_time = 0
    project_properties_service.invalidate_project_properties_cache()

def register_project(project_id: str, name: str, path: str, repo_url: str,
                     sub_path: Optional[str] = None, parent_repo: Optional[str] = None,
                     description: Optional[str] = None, folder_id: Optional[str] = None) -> None:
    """Register a project in the registry."""
    registry = _load_project_registry()
    
    # Get last modified time
    try:
        mtime = os.path.getmtime(path)
        last_modified = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
    except:
        last_modified = "Unknown"
    
    registry[project_id] = {
        "name": name,
        "path": path,
        "repo_url": repo_url,
        "sub_path": sub_path,
        "parent_repo": parent_repo,
        "description": description or f"Project {name}",
        "last_modified": last_modified,
        "registered_at": datetime.datetime.now().isoformat(),
        "folder_id": folder_id
    }
    
    _save_project_registry(registry)

def _normalize_path(path: str) -> str:
    """
    Normalize project paths to work in both Docker and terminal environments.
    Converts between /app/projects and absolute local paths.
    """
    # If path is already correct for current environment and exists, return as-is
    if os.path.exists(path):
        return os.path.abspath(path)
    
    # Convert Docker path to local path (running on host, registry has docker paths)
    if path.startswith("/app/projects"):
        local_path = path.replace("/app/projects", PROJECTS_ROOT)
        if os.path.exists(local_path):
            return local_path
            
    # Convert Host path to Docker path (running in docker, registry has host paths)
    # Strategy: locate 'data/projects/' or 'type1'/'type2' and append to current PROJECTS_ROOT
    for marker in ["data/projects/", "type1/", "type2/", "monorepos/"]:
        if marker in path:
            parts = path.split(marker)
            # Reconstruct using current PROJECTS_ROOT
            # If marker is data/projects/, we just want the part after it
            # If marker is type1/, we want type1/ + suffix
            suffix = parts[-1]
            if marker == "data/projects/":
                remapped = os.path.join(PROJECTS_ROOT, suffix)
            else:
                remapped = os.path.join(PROJECTS_ROOT, marker.strip("/"), suffix)
                
            if os.path.exists(remapped):
                return remapped
    
    # Convert relative path to absolute
    if not os.path.isabs(path):
        abs_path = os.path.abspath(os.path.join(PROJECTS_ROOT, "..", "..", path))
        if os.path.exists(abs_path):
            return abs_path
        
        # Try relative to PROJECTS_ROOT
        abs_path = os.path.abspath(os.path.join(PROJECTS_ROOT, path))
        if os.path.exists(abs_path):
            return abs_path
    
    # Return original path if no conversion worked
    return path

def _record_last_modified(path: str, fallback: str) -> str:
    try:
        mtime = os.path.getmtime(path)
        return datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
    except OSError:
        return fallback


def _to_relative_project_path(project_path: str, file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None
    try:
        relative = os.path.relpath(file_path, project_path)
    except ValueError:
        return None
    if relative.startswith(".."):
        return None
    return relative.replace(os.sep, "/")


def _resolve_thumbnail_from_path(project_path: str) -> Optional[str]:
    config = path_config_service.get_path_config(project_path)
    resolved = path_config_service.resolve_paths(project_path, config)
    thumbnail_path = resolved.thumbnail_dir

    if not thumbnail_path or not os.path.exists(thumbnail_path):
        return None

    if os.path.isfile(thumbnail_path):
        return thumbnail_path

    for file_name in sorted(os.listdir(thumbnail_path)):
        if file_name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            return os.path.join(thumbnail_path, file_name)

    return None


def _build_portfolio_metadata(project_id: str, project_path: str) -> Optional[Dict[str, Any]]:
    configured = path_config_service.get_portfolio_config(project_path)
    portfolio: Dict[str, Any] = dict(configured) if configured else {}

    model_path = portfolio.get("modelPath")
    if not model_path:
        detected_model = find_3d_model(project_path)
        model_path = _to_relative_project_path(project_path, detected_model)

    thumbnail_path = portfolio.get("thumbnailPath")
    if not thumbnail_path:
        detected_thumbnail = _resolve_thumbnail_from_path(project_path)
        thumbnail_path = _to_relative_project_path(project_path, detected_thumbnail)

    if model_path:
        encoded_model_path = quote(model_path, safe="/")
        portfolio["modelPath"] = model_path
        portfolio["modelUrl"] = f"/api/projects/{quote(project_id, safe='')}/asset/{encoded_model_path}"

    if thumbnail_path:
        encoded_thumbnail_path = quote(thumbnail_path, safe="/")
        portfolio["thumbnailPath"] = thumbnail_path
        portfolio["thumbnailUrl"] = f"/api/projects/{quote(project_id, safe='')}/asset/{encoded_thumbnail_path}"

    if "tags" not in portfolio:
        portfolio["tags"] = []

    return portfolio or None


def _record_to_project(record: RegisteredProjectRecord) -> Project:
    custom_display_name = path_config_service.get_project_display_name(record.path)
    custom_description = path_config_service.get_project_description(record.path)
    portfolio = _build_portfolio_metadata(record.id, record.path)
    thumbnail_path = _resolve_thumbnail_from_path(record.path)

    return Project(
        id=record.id,
        name=record.name,
        display_name=custom_display_name,
        description=custom_description or record.description,
        path=record.path,
        last_modified=record.last_modified,
        registered_at=record.registered_at,
        thumbnail_url=f"/api/projects/{record.id}/thumbnail" if thumbnail_path else None,
        sub_path=record.sub_path,
        parent_repo=record.parent_repo,
        repo_url=record.repo_url,
        import_type=record.import_type,
        parent_repo_path=record.parent_repo_path,
        folder_id=record.folder_id,
        portfolio=portfolio,
    )


def thumbnail_url_for_row(row: dict) -> Optional[str]:
    if not row.get("thumbnail_rel"):
        return None
    project_id = quote(str(row["id"]), safe="")
    digest = str(row.get("thumbnail_digest") or "")
    if digest:
        return f"/api/projects/{project_id}/thumbnail/{quote(digest, safe='')}"
    return f"/api/projects/{project_id}/thumbnail"


def get_registered_project_records() -> List[RegisteredProjectRecord]:
    """
    Return normalized registry-backed project records without hydrating `.prism.json`.
    """
    global _project_records_cache, _project_records_cache_time

    current_time = time.time()
    if _project_records_cache and (current_time - _project_records_cache_time) < PROJECTS_CACHE_TTL:
        return _project_records_cache

    registry = _load_project_registry()
    records: List[RegisteredProjectRecord] = []
    for project_id, data in registry.items():
        normalized_path = _normalize_path(data["path"])
        if not os.path.exists(normalized_path):
            continue

        records.append(
            RegisteredProjectRecord(
                id=project_id,
                name=data["name"],
                path=normalized_path,
                description=data.get("description", f"Project {data['name']}"),
                last_modified=_record_last_modified(normalized_path, data.get("last_modified", "Unknown")),
                registered_at=data.get("registered_at"),
                sub_path=data.get("sub_path"),
                parent_repo=data.get("parent_repo"),
                repo_url=data.get("repo_url"),
                import_type=data.get("import_type"),
                parent_repo_path=(
                    _normalize_path(data.get("parent_repo_path"))
                    if data.get("import_type") == "type2_subproject" and data.get("parent_repo_path")
                    else None
                ),
                folder_id=data.get("folder_id"),
            )
        )

    _project_records_cache = records
    _project_records_cache_time = current_time
    return records

def get_registered_projects() -> List[Project]:
    """
    Get all registered projects from the registry.
    Uses a short-term cache to avoid excessive I/O.
    """
    global _projects_cache, _projects_cache_time
    
    current_time = time.time()
    if _projects_cache and (current_time - _projects_cache_time) < PROJECTS_CACHE_TTL:
        return _projects_cache
        
    projects = [_record_to_project(record) for record in get_registered_project_records()]
    
    _projects_cache = projects
    _projects_cache_time = current_time
    return projects


def get_project_by_id(project_id: str) -> Optional[Project]:
    """
    Resolve a project from the authoritative workspace registry.

    The JSON registry remains a compatibility fallback for older local installs,
    but current `prj_*` identities are owned by the workspace database. This is
    especially important in separate worker processes, whose legacy in-memory
    registry cache may be empty even though the API can see the project.
    """
    workspace_row = workspace.get_project_by_id(project_id)
    if workspace_row:
        return _workspace_row_to_project(workspace_row)

    # Try cache first
    global _projects_cache, _projects_cache_time
    current_time = time.time()
    if _projects_cache and (current_time - _projects_cache_time) < PROJECTS_CACHE_TTL:
        project = next((p for p in _projects_cache if p.id == project_id), None)
        if project:
            return project

    record = next((item for item in get_registered_project_records() if item.id == project_id), None)
    if not record:
        return None

    return _record_to_project(record)

def _workspace_row_to_project(row: dict) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        display_name=row.get("display_name"),
        description=row.get("description", ""),
        path=row.get("path", ""),
        last_modified=row.get("last_modified", ""),
        registered_at=row.get("registered_at"),
        thumbnail_url=thumbnail_url_for_row(row),
        thumbnail_source=row.get("thumbnail_source") or "generated",
        sub_path=row.get("relative_path") if row.get("relative_path") != "." else None,
        parent_repo=row.get("parent_repo"),
        repo_url=row.get("repo_url"),
        import_type=row.get("import_type"),
        parent_repo_path=row.get("parent_repo_path"),
        folder_id=row.get("folder_id"),
        portfolio=row.get("portfolio"),
    )

def get_job_status(job_id: str):
    v3_job = v3_jobs.get(job_id)
    if v3_job:
        metadata = dict(v3_job.get("result_metadata") or {})
        payload_compat = dict(v3_job.get("payload") or {})
        staged_keys = (
            "bundle_url",
            "readiness",
            "readiness_stage",
            "sourceRevisionKey",
            "source_fingerprint",
            "status_selector",
            "commit",
        )
        staged_fields = {
            key: payload_compat[key]
            for key in staged_keys
            if key in payload_compat and payload_compat[key] is not None
        }
        logs = payload_compat.get("logs")
        if not isinstance(logs, list):
            logs = []
        return {
            **metadata,
            **staged_fields,
            **v3_job,
            "type": v3_job.get("kind"),
            "error": v3_job.get("error_message") or None,
            "logs": logs,
        }
    return workspace.get_job(job_id)

# Workflow Jobs
def _find_cli_path():
    # Check standard Mac path first
    mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    if os.path.exists(mac_path):
        return mac_path
    return "kicad-cli" # Fallback to PATH

def start_workflow_job(
    project_id: str,
    workflow_type: str,
    author: str = "anonymous",
    force: bool = False,
    commit: str | None = None,
) -> str:
    if workflow_type not in {"design", "manufacturing", "render", "webgpu_3d"}:
        raise ValueError(f"Unknown workflow type: {workflow_type}")
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    repository_id = str(row.get("repo_id") or "")

    if workflow_type == "webgpu_3d":
        source_selector = commit or f"workspace:{row.get('last_modified') or ''}"
        artifact_key = hashlib.sha256(
            json.dumps(
                {
                    "project": project_id,
                    "source": source_selector,
                    "force": bool(force),
                    "generator": semantic_index_service.generator_cache_tag(),
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        queued = v3_jobs.enqueue(
            "webgpu_3d",
            {
                "project_id": project_id,
                "commit": commit,
                "force": bool(force),
                "artifact_key": artifact_key,
            },
            worker_pool="prism",
            artifact_key="" if force else artifact_key,
            project_id=project_id,
            repository_id=repository_id or None,
            requested_by=author,
            resources={
                "prism_worker": 1,
                "webgpu": 1,
                "semantic_compile": 1,
            },
            locks=(
                [{"key": f"repository:{repository_id}", "mode": "read"}]
                if repository_id
                else [{"key": f"project:{project_id}", "mode": "read"}]
            ),
        )
        return str(queued["job_id"])

    active_key = hashlib.sha256(
        json.dumps(
            {
                "project": project_id,
                "workflow": workflow_type,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    queued = v3_jobs.enqueue(
        "kicad_workflow",
        {
            "project_id": project_id,
            "workflow_type": workflow_type,
            "author": author,
        },
        worker_pool="prism",
        artifact_key=active_key,
        project_id=project_id,
        repository_id=repository_id or None,
        requested_by=author,
        max_attempts=1,
        resources={
            "prism_worker": 1,
            "workflow": 1,
        },
        locks=(
            [{"key": f"repository:{repository_id}", "mode": "write"}]
            if repository_id
            else [{"key": f"project:{project_id}", "mode": "write"}]
        ),
    )
    return str(queued["job_id"])


def start_semantic_index_job(
    project_id: str,
    *,
    commit: str | None = None,
    force: bool = False,
    requested_by: str = "",
) -> str:
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    repository_id = str(row.get("repo_id") or "")
    source_selector = commit or f"workspace:{row.get('last_modified') or ''}"
    artifact_key = hashlib.sha256(
        json.dumps(
            {
                "project": project_id,
                "source": source_selector,
                "generator": semantic_index_service.generator_cache_tag(),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    queued = v3_jobs.enqueue(
        "semantic_index",
        {
            "project_id": project_id,
            "commit": commit,
            "force": bool(force),
            "artifact_key": artifact_key,
        },
        worker_pool="prism",
        artifact_key="" if force else artifact_key,
        project_id=project_id,
        repository_id=repository_id or None,
        requested_by=requested_by,
        resources={
            "prism_worker": 1,
            "semantic_compile": 1,
        },
        locks=(
            [{"key": f"repository:{repository_id}", "mode": "read"}]
            if repository_id
            else [{"key": f"project:{project_id}", "mode": "read"}]
        ),
    )
    return str(queued["job_id"])


def run_webgpu_3d_job_v3(context: JobContext) -> JobResult:
    from app.services import semantic_visualizer_service

    payload = context.payload
    project_id = str(payload["project_id"])
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    project = _workspace_row_to_project(row)
    commit = payload.get("commit")
    force = bool(payload.get("force"))
    artifact_key = str(payload["artifact_key"])
    status_selector = (
        f"commit:{commit}" if commit else f"workspace:{row.get('last_modified') or ''}"
    )
    state: dict[str, Any] = {
        "job_id": context.job_id,
        "status": "running",
        "stage": "starting",
        "message": "Generating WebGPU 3D assets...",
        "percent": 0,
        "project_id": project_id,
        "status_selector": status_selector,
        "logs": [],
        "performance": [],
    }
    if commit:
        state["commit"] = commit
    emitted_logs = 0
    last_readiness_stage: dict[str, str | None] = {"value": None}

    def persist() -> None:
        nonlocal emitted_logs
        logs = list(state.get("logs") or [])
        for line in logs[emitted_logs:]:
            print(str(line), flush=True)
        emitted_logs = len(logs)
        readiness_stage = state.get("readiness_stage")
        milestone = (
            isinstance(readiness_stage, str)
            and readiness_stage
            and readiness_stage != last_readiness_stage["value"]
        )
        if milestone:
            last_readiness_stage["value"] = str(readiness_stage)
        payload_updates: dict[str, Any] = {}
        for key in (
            "bundle_url",
            "readiness",
            "readiness_stage",
            "sourceRevisionKey",
            "source_fingerprint",
            "status_selector",
            "commit",
        ):
            if key in state and state[key] is not None:
                payload_updates[key] = state[key]
        if logs:
            payload_updates["logs"] = logs[-80:]
        if state.get("bundle_url") and state.get("readiness"):
            semantic_visualizer_service.sync_staged_webgpu_status(
                job_id=context.job_id,
                fence=context.fence,
                project=project,
                state=state,
            )
        context.progress(
            stage=str(state.get("stage") or "building"),
            message=str(state.get("message") or "Generating WebGPU 3D assets..."),
            percent=float(state.get("percent") or 0),
            payload_updates=payload_updates or None,
            force=bool(milestone),
        )

    context.check_cancelled()
    if commit:
        status = semantic_visualizer_service.build_visualizer_bundle_for_commit(
            project,
            str(commit),
            state,
            persist,
            force=force,
        )
    else:
        status = semantic_visualizer_service.build_visualizer_bundle(
            project,
            state,
            persist,
            force=force,
        )
    context.check_cancelled()
    source_fingerprint = str(status["source_fingerprint"])
    build_fingerprint = str(status["build_fingerprint"])
    bundle_path = semantic_visualizer_service.bundle_path(
        project_id,
        source_fingerprint,
        build_fingerprint,
    )
    staged_manifest = context.staging_dir / "bundle.json"
    shutil.copy2(bundle_path, staged_manifest)
    artifact = job_artifacts.prepare_file(
        context,
        staged_manifest,
        kind="webgpu_3d",
        artifact_key=artifact_key,
        media_type="application/json",
        schema_version=str(status.get("schema") or ""),
        generator_version=build_fingerprint,
        readiness="ready",
    )
    status_selector = (
        f"commit:{status.get('commit') or commit}"
        if commit
        else f"workspace:{row.get('last_modified') or ''}"
    )
    return JobResult(
        message="WebGPU 3D assets are ready",
        artifact=artifact,
        details={
            **status,
            "project_id": project_id,
            "status_selector": status_selector,
            "performance": state.get("performance") or [],
        },
    )


def run_semantic_index_job_v3(context: JobContext) -> JobResult:
    payload = context.payload
    project_id = str(payload["project_id"])
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    project = _workspace_row_to_project(row)
    commit = payload.get("commit")
    context.progress(
        stage="semantic-compile",
        message="Generating semantic identity index",
        percent=10,
        force=True,
    )
    result = semantic_index_service.generate(
        project,
        str(commit) if commit else None,
        force=bool(payload.get("force")),
    )
    context.check_cancelled()
    artifact = job_artifacts.prepare_json(
        context,
        result,
        kind="semantic_index",
        artifact_key=str(payload["artifact_key"]),
        schema_version=str(result.get("schema") or ""),
        generator_version=semantic_index_service.generator_cache_tag(),
    )
    return JobResult(
        message="Semantic identity index is ready",
        artifact=artifact,
        details={
            "available": True,
            "sourceRevisionKey": result.get("sourceRevisionKey"),
            "generator": result.get("generator"),
        },
    )


_WORKFLOW_OUTPUT_IDS = {
    "design": "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814",
    "manufacturing": "9e5c254b-cb26-4a49-beea-fa7af8a62903",
    "render": "81c80ad4-e8b9-4c9a-8bed-df7864fdefc6",
}


def run_kicad_workflow_job_v3(context: JobContext) -> JobResult:
    payload = context.payload
    project_id = str(payload["project_id"])
    workflow_type = str(payload["workflow_type"])
    author = str(payload.get("author") or "anonymous")
    output_id = _WORKFLOW_OUTPUT_IDS.get(workflow_type)
    if output_id is None:
        raise ValueError(f"Unknown workflow type: {workflow_type}")

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    project = _workspace_row_to_project(row)
    context.progress(
        stage="resolve-inputs",
        message=f"Preparing {workflow_type} workflow",
        percent=5,
        force=True,
    )
    context.check_cancelled()

    pro_file = next(
        (name for name in sorted(os.listdir(project.path)) if name.endswith(".kicad_pro")),
        None,
    )
    if not pro_file:
        raise ValueError(".kicad_pro file not found in project root")

    config = path_config_service.get_path_config(project.path)
    resolved_paths = path_config_service.resolve_paths(project.path, config)
    jobset_path = resolved_paths.jobset_path
    configured_jobset = config.jobset or "Outputs.kicad_jobset"
    if not jobset_path:
        raise ValueError(f"{configured_jobset} not found in project root")

    try:
        project_root_abs = os.path.abspath(project.path)
        jobset_abs = os.path.abspath(jobset_path)
        jobset_file = (
            os.path.relpath(jobset_abs, project_root_abs)
            if os.path.commonpath([project_root_abs, jobset_abs]) == project_root_abs
            else jobset_path
        )
    except ValueError:
        jobset_file = jobset_path

    command = [
        _find_cli_path(),
        "jobset",
        "run",
        "-f",
        jobset_file,
        "--output",
        output_id,
        pro_file,
    ]
    print(f"Running: {shlex.join(command)}", flush=True)
    context.progress(
        stage="run-jobset",
        message=f"Generating {workflow_type} outputs",
        percent=15,
        force=True,
    )
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=project.path,
        text=True,
        bufsize=1,
    )
    if process.stdout is not None:
        for line in process.stdout:
            line = line.rstrip()
            if line:
                print(line, flush=True)
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"KiCad workflow exited with code {return_code}")

    context.check_cancelled()
    context.progress(
        stage="git-sync",
        message="Synchronizing generated outputs",
        percent=90,
        force=True,
    )
    warnings: list[str] = []
    generated_commit = ""
    try:
        repo = Repo(project.path)
        if repo.is_dirty(untracked_files=True):
            repo.git.add(".")
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            commit_message = (
                f"Generated {workflow_type} outputs - {timestamp} by {author}"
            )
            repo.git.commit(
                m=commit_message,
                author="KiCAD Prism <prism@example.com>",
            )
            generated_commit = str(repo.head.commit.hexsha)
            context.check_cancelled()
            # Share the import path's environment rather than rolling a second
            # one: this push previously had neither the GITHUB_TOKEN rewrite nor
            # the strict host-key check that every other remote operation uses.
            from app.services.project_import_service import git_env

            push_info = repo.remote(name="origin").push(env=git_env())
            for info in push_info:
                if info.flags & info.ERROR:
                    raise RuntimeError(f"Push failed: {info.summary}")
            print(f"Generated commit {generated_commit} pushed successfully", flush=True)
        else:
            print("No generated changes detected to commit", flush=True)
    except Exception as error:
        warning = f"Git sync warning: {error}"
        warnings.append(warning)
        print(warning, flush=True)

    return JobResult(
        message="Workflow completed successfully",
        details={
            "project_id": project_id,
            "workflow_type": workflow_type,
            "generated_commit": generated_commit,
            "warnings": warnings,
        },
    )

def get_project_thumbnail_path(project_id: str) -> Optional[str]:
    project = get_project_by_id(project_id)
    if not project:
        print(f"[DEBUG] Project {project_id} not found")
        return None
    
    # Use path config service to get thumbnail path
    config = path_config_service.get_path_config(project.path)
    resolved = path_config_service.resolve_paths(project.path, config)
    thumbnail_path = resolved.thumbnail_dir
    
    print(f"[DEBUG] Project: {project.path}")
    print(f"[DEBUG] Config thumbnail: {config.thumbnail}")
    print(f"[DEBUG] Resolved thumbnail_dir: {thumbnail_path}")
    
    if not thumbnail_path or not os.path.exists(thumbnail_path):
        print(f"[DEBUG] Thumbnail path does not exist or is None")
        return None
    
    # If thumbnail path points to a specific file, return it directly
    if os.path.isfile(thumbnail_path):
        print(f"[DEBUG] Returning specific file: {thumbnail_path}")
        return thumbnail_path
    
    # If it's a directory, find first image file
    if os.path.isdir(thumbnail_path):
        for file in os.listdir(thumbnail_path):
            if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                result = os.path.join(thumbnail_path, file)
                print(f"[DEBUG] Returning file from directory: {result}")
                return result
    
    print(f"[DEBUG] No valid thumbnail found")
    return None

def find_schematic_file(project_path: str) -> Optional[str]:
    """Find the main .kicad_sch file using path config."""
    resolved = path_config_service.resolve_paths(project_path)
    return resolved.schematic

def find_pcb_file(project_path: str) -> Optional[str]:
    """Find the main .kicad_pcb file using path config."""
    resolved = path_config_service.resolve_paths(project_path)
    return resolved.pcb

def find_3d_model(project_path: str) -> Optional[str]:
    """Find the .glb or .step model using path config."""
    resolved = path_config_service.resolve_paths(project_path)
    
    # Check Design-Outputs/3DModel subdirectory
    if resolved.design_outputs_dir:
        model_dir = os.path.join(resolved.design_outputs_dir, "3DModel")
        if os.path.exists(model_dir):
            for file in os.listdir(model_dir):
                if file.lower().endswith((".glb", ".step", ".stp")):
                    return os.path.join(model_dir, file)
    
    # Check Design-Outputs root for 3D models
    if resolved.design_outputs_dir and os.path.exists(resolved.design_outputs_dir):
        for file in os.listdir(resolved.design_outputs_dir):
            if file.lower().endswith((".glb", ".step", ".stp")):
                return os.path.join(resolved.design_outputs_dir, file)
    
    return None

def find_ibom_file(project_path: str) -> Optional[str]:
    """Find the iBoM HTML file using path config."""
    resolved = path_config_service.resolve_paths(project_path)
    
    if not resolved.design_outputs_dir or not os.path.exists(resolved.design_outputs_dir):
        return None
    
    for file in os.listdir(resolved.design_outputs_dir):
        if "ibom" in file.lower() and file.endswith(".html"):
            return os.path.join(resolved.design_outputs_dir, file)
    return None

def delete_project(project_id: str) -> bool:
    """
    Delete a project from the registry and optionally remove its files.
    Returns True if project was found and deleted, False otherwise.
    """
    project = get_project_by_id(project_id)
    if not project:
        return False

    registry = _load_project_registry()
    if project_id not in registry:
        return False

    project_path = project.path
    parent_repo = project.parent_repo
    import_type = project.import_type
    
    # Remove from registry
    del registry[project_id]
    _save_project_registry(registry)
    
    if import_type == "type2_subproject" and parent_repo:
        # Check if there are any remaining subprojects for this parent repo
        remaining_subprojects = [
            p for p in registry.values()
            if p.get("parent_repo") == parent_repo and p.get("import_type") == "type2_subproject"
        ]
        
        # If no remaining subprojects, delete the parent repo directory
        if not remaining_subprojects and project_path:
            parent_repo_path = project.parent_repo_path or os.path.dirname(project_path)
            if os.path.exists(parent_repo_path):
                try:
                    shutil.rmtree(parent_repo_path)
                    print(f"Deleted Type-2 parent repo: {parent_repo_path}")
                except Exception as e:
                    print(f"Warning: Failed to delete parent repo directory {parent_repo_path}: {e}")
    elif not parent_repo and project_path and os.path.exists(project_path):
        # For Type-1 projects (standalone), delete the directory
        try:
            shutil.rmtree(project_path)
        except Exception as e:
            print(f"Warning: Failed to delete project directory {project_path}: {e}")
    
    return True


def update_project_folder_id(project_id: str, folder_id: Optional[str]) -> bool:
    """
    Persist workspace folder assignment for a project.
    Returns False if project does not exist.
    """
    registry = _load_project_registry()
    if project_id not in registry:
        return False

    registry[project_id]["folder_id"] = folder_id
    _save_project_registry(registry)

    return True


def update_project_description(project_id: str, description: str) -> bool:
    """
    Persist project description in .prism.json.
    Falls back to registry only for project lookup and backward compatibility.
    Returns False if project does not exist.
    """
    project = get_project_by_id(project_id)
    if not project:
        return False

    config = path_config_service.get_path_config(project.path)
    config.description = description
    path_config_service.save_path_config(project.path, config)

    # Keep registry mirrored for legacy fallback/search compatibility on older code paths.
    registry = _load_project_registry()
    if project_id in registry:
        registry[project_id]["description"] = description
        _save_project_registry(registry)

    return True

def get_subsheets(project_path: str, main_schematic: str) -> List[str]:
    """Find all .kicad_sch files using path config."""
    subsheets = []
    main_name = os.path.basename(main_schematic)
    
    # Get path config
    resolved = path_config_service.resolve_paths(project_path)
    config = path_config_service.get_path_config(project_path)
    
    # Check root directory for other schematic files
    for file in os.listdir(project_path):
        if file.endswith(".kicad_sch") and file != main_name:
            subsheets.append(file)
            
    # Check configured subsheets directory
    if resolved.subsheets_dir and os.path.isdir(resolved.subsheets_dir):
        for file in os.listdir(resolved.subsheets_dir):
            if file.endswith(".kicad_sch"):
                # Return path relative to project root
                subsheet_rel = os.path.join(config.subsheets or "Subsheets", file)
                subsheets.append(subsheet_rel)
                
    return subsheets
