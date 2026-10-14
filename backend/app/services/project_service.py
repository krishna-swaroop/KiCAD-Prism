import os
import hashlib
import json
import logging
import shutil
import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from git import Repo
from pydantic import BaseModel

from app.core.config import settings
from app.release_studio.jobset import WORKFLOW_OUTPUT_IDS as _WORKFLOW_OUTPUT_IDS
from app.services import kicad_jobset_service, path_config_service, project_settings_service, semantic_index_service
from app.services.workspace_service import workspace
from app.services.job_artifact_service import job_artifacts
from app.services.job_runtime import JobContext, JobResult
from app.services.job_kinds import JobKind, JobSubject, repository_lock

logger = logging.getLogger(__name__)

class Project(BaseModel):
    id: str
    name: str
    display_name: Optional[str] = None  # Custom name from .prism.json
    description: str
    path: str
    last_modified: str
    registered_at: Optional[str] = None
    # When Prism last fetched the project's repository; what "Last updated" shows.
    last_synced_at: Optional[str] = None
    thumbnail_url: Optional[str] = None
    # Where the thumbnail came from: "generated" (kicad-cli render), "custom"
    # (uploaded in the workspace) or "repository" (an image committed in the
    # repo, used only when there is nothing to render). The workspace needs
    # this to know which thumbnail actions to offer.
    thumbnail_source: Optional[str] = None
    sub_path: Optional[str] = None  # Relative path within parent repo
    # This project's own file inside its directory (its .kicad_pro, or the board
    # KiCad would regenerate one from). A directory can hold several KiCad
    # projects, and this is what tells them apart. Empty for projects registered
    # before Prism recorded it, which are the only project in their directory.
    project_file: Optional[str] = None
    parent_repo: Optional[str] = None  # Parent monorepo name
    repo_url: Optional[str] = None  # Original Git URL
    # The repository's real git origin, asked of git rather than trusting `url`
    # (which for a local import is a filesystem path). origin_owner is
    # "external" (a real remote like GitLab), "prism" (Prism hosts it), or
    # "none". The desktop agent's Open-in-KiCad needs these to know what it can
    # clone from.
    origin_url: Optional[str] = None
    origin_owner: Optional[str] = None
    import_type: Optional[str] = None  # "type1" or "type2_subproject"
    parent_repo_path: Optional[str] = None  # Path to parent repo for Type-2
    folder_id: Optional[str] = None  # Optional folder assignment for workspace organization
    portfolio: Optional[Dict[str, Any]] = None  # Portfolio scene/detail metadata


# PROJECTS_ROOT is where imported projects are stored.
# In Docker, this should be a persistent volume mount.
PROJECTS_ROOT = settings.KICAD_PROJECTS_ROOT

# MONOREPOS_ROOT is where monorepos are cloned (Type-2 sub-projects)
MONOREPOS_ROOT = os.path.join(PROJECTS_ROOT, "type2")

# Ensure directories exist
os.makedirs(PROJECTS_ROOT, exist_ok=True)
os.makedirs(MONOREPOS_ROOT, exist_ok=True)
os.makedirs(os.path.join(PROJECTS_ROOT, "type1"), exist_ok=True)

# The project file that identifies one project inside a shared directory.
# Accepts either a `Project` or a raw workspace row, because callers hold one or
# the other depending on how deep in the stack they are.
project_anchor = path_config_service.anchor_for_project


def _project_path_of(project: Any) -> str:
    if isinstance(project, dict):
        return str(project.get("path") or "")
    return str(getattr(project, "path", "") or "")


def path_config_for(project: Any, use_cache: bool = True) -> path_config_service.PathConfig:
    """Load a project's path configuration, honouring its anchor."""
    return path_config_service.get_path_config(
        _project_path_of(project), use_cache, anchor=project_anchor(project)
    )


def resolved_paths_for(
    project: Any,
    config: Optional[path_config_service.PathConfig] = None,
) -> path_config_service.ResolvedPaths:
    """Resolve a project's paths, honouring its anchor."""
    return path_config_service.resolve_paths(
        _project_path_of(project), config, anchor=project_anchor(project)
    )


def save_path_config_for(project: Any, config: path_config_service.PathConfig) -> None:
    """Store a project's path configuration in Prism, never in its checkout."""
    project_settings_service.save(project, config)


def thumbnail_url_for_row(row: dict) -> Optional[str]:
    if not row.get("thumbnail_rel"):
        return None
    project_id = quote(str(row["id"]), safe="")
    digest = str(row.get("thumbnail_digest") or "")
    if digest:
        return f"/api/projects/{project_id}/thumbnail/{quote(digest, safe='')}"
    return f"/api/projects/{project_id}/thumbnail"


def get_project_by_id(project_id: str) -> Optional[Project]:
    """Resolve a project from the workspace database, the only project registry."""
    workspace_row = workspace.get_project_by_id(project_id)
    return _workspace_row_to_project(workspace_row) if workspace_row else None


def _workspace_row_to_project(row: dict) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        display_name=row.get("display_name"),
        description=row.get("description", ""),
        path=row.get("path", ""),
        last_modified=row.get("last_modified", ""),
        registered_at=row.get("registered_at"),
        last_synced_at=row.get("repo_last_synced"),
        thumbnail_url=thumbnail_url_for_row(row),
        thumbnail_source=row.get("thumbnail_source") or "generated",
        sub_path=row.get("relative_path") if row.get("relative_path") != "." else None,
        # Background jobs resolve their project through here, not through the
        # API's converter. Dropping the anchor sent every WebGPU render,
        # semantic index and KiCad workflow back to "the first .kicad_pro that
        # sorts", so a directory holding two projects built the wrong one while
        # the workspace, reading the other converter, showed the right one.
        project_file=row.get("project_file_rel") or None,
        parent_repo=row.get("parent_repo"),
        repo_url=row.get("repo_url"),
        import_type=row.get("import_type"),
        parent_repo_path=row.get("parent_repo_path"),
        folder_id=row.get("folder_id"),
        portfolio=row.get("portfolio"),
    )

# Workflow Jobs
def webgpu_artifact_key(row: dict, commit: str | None, *, force: bool = False) -> str:
    """The ``webgpu_3d`` job key for a project row at ``commit`` (or its workspace).

    It names the 3D generator build, so a completed job from an older viewer or
    pipeline build never stands in for a bundle the current build cannot read.
    """
    from app.services import semantic_visualizer_service

    source_selector = commit or f"workspace:{row.get('last_modified') or ''}"
    return hashlib.sha256(
        json.dumps(
            {
                "project": str(row.get("id") or ""),
                "projectFileRel": str(row.get("project_file_rel") or ""),
                "source": source_selector,
                "force": bool(force),
                "generator": semantic_index_service.generator_cache_tag(),
                "webgpuBuild": semantic_visualizer_service.BUILD_FINGERPRINT,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


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
    project_file_rel = str(row.get("project_file_rel") or "")

    if workflow_type == "webgpu_3d":
        artifact_key = webgpu_artifact_key(row, commit, force=force)
        queued = WEBGPU_3D.enqueue(
            {
                "project_id": project_id,
                "commit": commit,
                "force": bool(force),
                "artifact_key": artifact_key,
                "project_file_rel": project_file_rel,
            },
            subject=JobSubject.of_project(row, project_id),
            artifact_key="" if force else artifact_key,
            requested_by=author,
        )
        return str(queued["job_id"])

    active_key = hashlib.sha256(
        json.dumps(
            {
                "project": project_id,
                "projectFileRel": project_file_rel,
                "workflow": workflow_type,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    queued = KICAD_WORKFLOW.enqueue(
        {
            "project_id": project_id,
            "workflow_type": workflow_type,
            "author": author,
            "project_file_rel": project_file_rel,
        },
        subject=JobSubject.of_project(row, project_id),
        artifact_key=active_key,
        requested_by=author,
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
    project_file_rel = str(row.get("project_file_rel") or "")
    source_selector = commit or f"workspace:{row.get('last_modified') or ''}"
    artifact_key = hashlib.sha256(
        json.dumps(
            {
                "project": project_id,
                "projectFileRel": project_file_rel,
                "source": source_selector,
                "generator": semantic_index_service.generator_cache_tag(),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    queued = SEMANTIC_INDEX.enqueue(
        {
            "project_id": project_id,
            "commit": commit,
            "force": bool(force),
            "artifact_key": artifact_key,
            "project_file_rel": project_file_rel,
        },
        subject=JobSubject.of_project(row, project_id),
        artifact_key="" if force else artifact_key,
        requested_by=requested_by,
    )
    return str(queued["job_id"])


def run_webgpu_3d_job_v3(context: JobContext) -> JobResult:
    from app.services import semantic_visualizer_service

    payload = context.payload
    project_id = str(payload["project_id"])
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    expected_anchor = str(payload.get("project_file_rel") or "")
    current_anchor = str(row.get("project_file_rel") or "")
    if current_anchor != expected_anchor:
        raise RuntimeError(
            "Project anchor changed after WebGPU generation was queued; retry the job"
        )
    project = _workspace_row_to_project(row)
    commit = payload.get("commit")
    force = bool(payload.get("force"))
    artifact_key = str(payload["artifact_key"])
    # "mesh": the follow-up that adds copper tiles to an analytic bundle.
    geometry = payload.get("geometry")
    status_selector = semantic_visualizer_service.status_selector_for_project(
        project,
        commit=str(commit) if commit else None,
        last_modified=row.get("last_modified") or "",
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
            geometry=geometry,
        )
    else:
        status = semantic_visualizer_service.build_visualizer_bundle(
            project,
            state,
            persist,
            force=force,
            geometry=geometry,
        )
    context.check_cancelled()
    if status.get("board_geometry") == "analytic" and geometry != "mesh":
        _enqueue_mesh_follow_up(row, project_id, payload, requested_by=str(context.job.get("requested_by") or ""))
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
    status_selector = semantic_visualizer_service.status_selector_for_project(
        project,
        commit=str(status.get("commit") or commit) if commit else None,
        last_modified=row.get("last_modified") or "",
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
    expected_anchor = str(payload.get("project_file_rel") or "")
    current_anchor = str(row.get("project_file_rel") or "")
    if current_anchor != expected_anchor:
        raise RuntimeError(
            "Project anchor changed after semantic indexing was queued; retry the job"
        )
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


def run_kicad_workflow_job_v3(context: JobContext) -> JobResult:
    payload = context.payload
    project_id = str(payload["project_id"])
    workflow_type = str(payload["workflow_type"])
    author = str(payload.get("author") or "anonymous")
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    expected_anchor = str(payload.get("project_file_rel") or "")
    current_anchor = str(row.get("project_file_rel") or "")
    if current_anchor != expected_anchor:
        raise RuntimeError(
            "Project anchor changed after the KiCad workflow was queued; retry the job"
        )
    output_id = _WORKFLOW_OUTPUT_IDS.get(workflow_type)
    if output_id is None:
        raise ValueError(f"Unknown workflow type: {workflow_type}")

    project = _workspace_row_to_project(row)
    context.progress(
        stage="resolve-inputs",
        message=f"Preparing {workflow_type} workflow",
        percent=5,
        force=True,
    )
    context.check_cancelled()

    # This project's own .kicad_pro, not whichever one sorts first: a directory
    # holding two projects would otherwise build the wrong board.
    pro_file = project_anchor(project)
    if not pro_file or not pro_file.endswith(".kicad_pro"):
        pro_file = next(
            (name for name in sorted(os.listdir(project.path)) if name.endswith(".kicad_pro")),
            None,
        )
    if not pro_file:
        raise ValueError(".kicad_pro file not found in project root")

    config = path_config_for(project)
    resolved_paths = resolved_paths_for(project, config)
    jobset_path = resolved_paths.jobset_path
    configured_jobset = config.jobset or "Outputs.kicad_jobset"
    if not jobset_path:
        raise ValueError(f"{configured_jobset} not found in project root")

    execution = kicad_jobset_service.execute_kicad_jobset(
        context,
        project_path=project.path,
        jobset_path=jobset_path,
        project_file=pro_file,
        output_id=output_id,
        workflow_type=workflow_type,
        author=author,
        routing="repository",
        # Keep the old project_service.Repo patch seam for the legacy handler
        # while the generic service remains independently testable.
        repository_factory=Repo,
        timestamp_factory=datetime.datetime.now,
    )

    return JobResult(
        message="Workflow completed successfully",
        details={
            "project_id": project_id,
            "workflow_type": workflow_type,
            "generated_commit": execution.generated_commit,
            "warnings": list(execution.warnings),
        },
    )

def get_project_thumbnail_path(project_id: str) -> Optional[str]:
    project = get_project_by_id(project_id)
    if not project:
        print(f"[DEBUG] Project {project_id} not found")
        return None
    
    # Use path config service to get thumbnail path
    config = path_config_for(project)
    resolved = resolved_paths_for(project, config)
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

def find_schematic_file(project_path: str, anchor: Optional[str] = None) -> Optional[str]:
    """Find the main .kicad_sch file using path config."""
    resolved = path_config_service.resolve_paths(project_path, anchor=anchor)
    return resolved.schematic

def find_pcb_file(project_path: str, anchor: Optional[str] = None) -> Optional[str]:
    """Find the main .kicad_pcb file using path config."""
    resolved = path_config_service.resolve_paths(project_path, anchor=anchor)
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


#: The mesh follow-up runs after interactive 3D builds.
MESH_FOLLOW_UP_PRIORITY = 200


def _enqueue_mesh_follow_up(row: dict[str, Any], project_id: str, payload: dict[str, Any], *, requested_by: str) -> None:
    """Queue the copper tiles for a bundle published analytic-first. Its own
    artifact key keeps one per revision and skips a revision already done."""

    commit = payload.get("commit")
    key = f"{webgpu_artifact_key(row, commit, force=False)}:mesh"
    try:
        WEBGPU_3D.enqueue(
            {
                "project_id": project_id,
                "commit": commit,
                "force": False,
                "artifact_key": key,
                "project_file_rel": payload.get("project_file_rel") or "",
                "geometry": "mesh",
            },
            subject=JobSubject.of_project(row, project_id),
            artifact_key=key,
            requested_by=requested_by,
            priority=MESH_FOLLOW_UP_PRIORITY,
        )
    except Exception as exc:  # The analytic bundle is published; the tiles can be built later.
        logger.warning("Mesh follow-up for %s not queued: %s", project_id, type(exc).__name__)


WEBGPU_3D = JobKind(
    "webgpu_3d",
    run_webgpu_3d_job_v3,
    resources={"prism_worker": 1, "webgpu": 1, "semantic_compile": 1},
    lock=repository_lock("read"),
)
KICAD_WORKFLOW = JobKind(
    "kicad_workflow",
    run_kicad_workflow_job_v3,
    resources={"prism_worker": 1, "workflow": 1},
    lock=repository_lock("write"),
    max_attempts=1,
)
SEMANTIC_INDEX = JobKind(
    "semantic_index",
    run_semantic_index_job_v3,
    resources={"prism_worker": 1, "semantic_compile": 1},
    lock=repository_lock("read"),
)
JOB_KINDS = (WEBGPU_3D, KICAD_WORKFLOW, SEMANTIC_INDEX)
