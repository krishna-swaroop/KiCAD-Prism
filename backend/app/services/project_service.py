import datetime
import json
import logging
import os
import shutil
import subprocess
import threading
import time
import uuid
from typing import Any
from urllib.parse import quote

from git import RemoteProgress, Repo
from pydantic import BaseModel

from app.services import path_config_service

logger = logging.getLogger(__name__)


class Project(BaseModel):
    id: str
    name: str
    display_name: str | None = None  # Custom name from .prism.json
    description: str
    path: str
    last_modified: str
    registered_at: str | None = None
    thumbnail_url: str | None = None
    sub_path: str | None = None  # Relative path within parent repo
    parent_repo: str | None = None  # Parent monorepo name
    repo_url: str | None = None  # Original Git URL
    import_type: str | None = None  # "type1" or "type2_subproject"
    parent_repo_path: str | None = None  # Path to parent repo for Type-2
    folder_id: str | None = (
        None  # Optional folder assignment for workspace organization
    )
    portfolio: dict[str, Any] | None = None  # Portfolio scene/detail metadata
    local_path_mode: str | None = None  # "reference" or "copy" for local-path imports


class RegisteredProjectRecord(BaseModel):
    id: str
    name: str
    path: str
    description: str
    last_modified: str
    registered_at: str | None = None
    sub_path: str | None = None
    parent_repo: str | None = None
    repo_url: str | None = None
    import_type: str | None = None
    parent_repo_path: str | None = None
    folder_id: str | None = None
    local_path_mode: str | None = None  # "reference" or "copy" for local-path imports


# PROJECTS_ROOT is where imported projects are stored.
# In Docker, this should be a persistent volume mount.
PROJECTS_ROOT = os.environ.get(
    "KICAD_PROJECTS_ROOT",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/projects")),
)

# MONOREPOS_ROOT is where monorepos are cloned (Type-2 sub-projects)
MONOREPOS_ROOT = os.path.join(PROJECTS_ROOT, "type2")

# PROJECT_REGISTRY_FILE tracks all registered projects with metadata
PROJECT_REGISTRY_FILE = os.path.join(PROJECTS_ROOT, ".project_registry.json")

# Ensure directories exist
os.makedirs(PROJECTS_ROOT, exist_ok=True)
os.makedirs(MONOREPOS_ROOT, exist_ok=True)
os.makedirs(os.path.join(PROJECTS_ROOT, "type1"), exist_ok=True)

PROJECTS_CACHE_TTL = 5.0  # seconds

_project_records_cache: list[RegisteredProjectRecord] = []
_project_records_cache_time: float = 0
_projects_cache: list[Project] = []
_projects_cache_time: float = 0


def _load_project_registry() -> dict[str, dict]:
    """Load the project registry from JSON file."""
    if os.path.exists(PROJECT_REGISTRY_FILE):
        try:
            with open(PROJECT_REGISTRY_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as err:
            logger.warning(
                "Failed to load project registry from %s: %s",
                PROJECT_REGISTRY_FILE,
                err,
            )
    return {}


def _save_project_registry(registry: dict[str, dict]) -> None:
    """Save the project registry to JSON file."""
    try:
        with open(PROJECT_REGISTRY_FILE, "w") as f:
            json.dump(registry, f, indent=2)
        invalidate_project_caches()
    except OSError as err:
        logger.warning(
            "Failed to save project registry to %s: %s", PROJECT_REGISTRY_FILE, err
        )


def invalidate_project_caches() -> None:
    from app.services import project_properties_service

    global _project_records_cache, _project_records_cache_time
    global _projects_cache, _projects_cache_time
    _project_records_cache = []
    _project_records_cache_time = 0
    _projects_cache = []
    _projects_cache_time = 0
    project_properties_service.invalidate_project_properties_cache()


def register_project(
    project_id: str,
    name: str,
    path: str,
    repo_url: str,
    sub_path: str | None = None,
    parent_repo: str | None = None,
    description: str | None = None,
    folder_id: str | None = None,
) -> None:
    """Register a project in the registry."""
    registry = _load_project_registry()

    # Get last modified time
    try:
        mtime = os.path.getmtime(path)
        last_modified = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
    except OSError as err:
        logger.warning("Could not read project mtime for %s: %s", path, err)
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
        "folder_id": folder_id,
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
        return datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
    except OSError:
        return fallback


def _to_relative_project_path(project_path: str, file_path: str | None) -> str | None:
    if not file_path:
        return None
    try:
        relative = os.path.relpath(file_path, project_path)
    except ValueError:
        return None
    if relative.startswith(".."):
        return None
    return relative.replace(os.sep, "/")


def _resolve_thumbnail_from_path(project_path: str) -> str | None:
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


def _build_portfolio_metadata(
    project_id: str, project_path: str
) -> dict[str, Any] | None:
    configured = path_config_service.get_portfolio_config(project_path)
    portfolio: dict[str, Any] = dict(configured) if configured else {}

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
        portfolio["modelUrl"] = (
            f"/api/projects/{quote(project_id, safe='')}/asset/{encoded_model_path}"
        )

    if thumbnail_path:
        encoded_thumbnail_path = quote(thumbnail_path, safe="/")
        portfolio["thumbnailPath"] = thumbnail_path
        portfolio["thumbnailUrl"] = (
            f"/api/projects/{quote(project_id, safe='')}/asset/{encoded_thumbnail_path}"
        )

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
        thumbnail_url=f"/api/projects/{record.id}/thumbnail"
        if thumbnail_path
        else None,
        sub_path=record.sub_path,
        parent_repo=record.parent_repo,
        repo_url=record.repo_url,
        import_type=record.import_type,
        parent_repo_path=record.parent_repo_path,
        folder_id=record.folder_id,
        portfolio=portfolio,
        local_path_mode=record.local_path_mode,
    )


def get_registered_project_records() -> list[RegisteredProjectRecord]:
    """
    Return normalized registry-backed project records without hydrating `.prism.json`.
    """
    global _project_records_cache, _project_records_cache_time

    current_time = time.time()
    if (
        _project_records_cache
        and (current_time - _project_records_cache_time) < PROJECTS_CACHE_TTL
    ):
        return _project_records_cache

    registry = _load_project_registry()
    records: list[RegisteredProjectRecord] = []
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
                last_modified=_record_last_modified(
                    normalized_path, data.get("last_modified", "Unknown")
                ),
                registered_at=data.get("registered_at"),
                sub_path=data.get("sub_path"),
                parent_repo=data.get("parent_repo"),
                repo_url=data.get("repo_url"),
                import_type=data.get("import_type"),
                parent_repo_path=(
                    _normalize_path(data.get("parent_repo_path"))
                    if data.get("import_type") == "type2_subproject"
                    and data.get("parent_repo_path")
                    else None
                ),
                folder_id=data.get("folder_id"),
                local_path_mode=data.get("local_path_mode"),
            )
        )

    _project_records_cache = records
    _project_records_cache_time = current_time
    return records


def get_registered_projects() -> list[Project]:
    """
    Get all registered projects from the registry.
    Uses a short-term cache to avoid excessive I/O.
    """
    global _projects_cache, _projects_cache_time

    current_time = time.time()
    if _projects_cache and (current_time - _projects_cache_time) < PROJECTS_CACHE_TTL:
        return _projects_cache

    projects = [
        _record_to_project(record) for record in get_registered_project_records()
    ]

    _projects_cache = projects
    _projects_cache_time = current_time
    return projects


def get_project_by_id(project_id: str) -> Project | None:
    """
    Efficiently get a single project by its ID without scanning all projects if possible.
    """
    # Try cache first
    global _projects_cache, _projects_cache_time
    current_time = time.time()
    if _projects_cache and (current_time - _projects_cache_time) < PROJECTS_CACHE_TTL:
        project = next((p for p in _projects_cache if p.id == project_id), None)
        if project:
            return project

    record = next(
        (item for item in get_registered_project_records() if item.id == project_id),
        None,
    )
    if not record:
        return None

    return _record_to_project(record)


# Global job store: {job_id: {status: str, message: str, percent: float, project_id: str, error: str, logs: list[str], type: str}}
jobs = {}


class CloneProgress(RemoteProgress):
    def __init__(self, job_id):
        super().__init__()
        self.job_id = job_id

    def update(self, op_code, cur_count, max_count=None, message=""):
        if self.job_id in jobs:
            job = jobs[self.job_id]
            # Calculate percentage if max_count is available
            percent = 0
            if max_count:
                percent = (cur_count / max_count) * 100

            job["percent"] = percent
            job["message"] = message or f"Processing... {int(percent)}%"
            # Add to logs only if message makes sense
            if message:
                job["logs"].append(f"[GIT] {message}")


def _run_clone_job(job_id: str, repo_url: str, selected_paths: list[str] | None = None):
    job = jobs[job_id]

    # Extract project name
    project_name = repo_url.rstrip("/").split("/")[-1]
    if project_name.endswith(".git"):
        project_name = project_name[:-4]

    # Clone to monorepos directory
    target_path = os.path.join(MONOREPOS_ROOT, project_name)
    target_path_abs = os.path.abspath(target_path)

    # Check if monorepo already exists
    if os.path.exists(target_path):
        job["status"] = "failed"
        job["error"] = f"Monorepo '{project_name}' already exists"
        job["logs"].append(f"Error: Monorepo '{project_name}' already exists")
        return

    try:
        job["logs"].append(f"Cloning {repo_url} into {target_path}...")
        # Prevent git from asking for credentials (avoid hanging)
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"

        Repo.clone_from(repo_url, target_path, progress=CloneProgress(job_id), env=env)

        # Register project(s)
        if selected_paths and len(selected_paths) > 0:
            # Multi-project import
            imported_projects = []
            for sub_path in selected_paths:
                # Generate unique project ID
                safe_name = sub_path.replace("/", "-").replace(" ", "_")
                project_id = f"{project_name}-{safe_name}"

                # Check for duplicate ID
                registry = _load_project_registry()
                if project_id in registry:
                    existing_path = _normalize_path(
                        registry[project_id].get("path", "")
                    )
                    if existing_path != os.path.abspath(
                        os.path.join(target_path, sub_path)
                    ):
                        # Different project with same ID - add numeric suffix
                        suffix = 1
                        original_id = project_id
                        while f"{original_id}-{suffix}" in registry:
                            suffix += 1
                        project_id = f"{original_id}-{suffix}"
                        job["logs"].append(
                            f"Warning: ID collision detected, using {project_id}"
                        )

                full_project_path = os.path.join(target_path, sub_path)

                # Get project name from the .kicad_pro file
                pro_files = [
                    f for f in os.listdir(full_project_path) if f.endswith(".kicad_pro")
                ]
                board_name = (
                    pro_files[0].replace(".kicad_pro", "")
                    if pro_files
                    else os.path.basename(sub_path)
                )

                register_project(
                    project_id=project_id,
                    name=board_name,
                    path=full_project_path,
                    repo_url=repo_url,
                    sub_path=sub_path,
                    parent_repo=project_name,
                    description=f"{project_name} / {board_name}",
                )
                imported_projects.append(project_id)
                job["logs"].append(f"Registered sub-project: {project_id}")

            job["project_ids"] = imported_projects
            job["message"] = f"Imported {len(imported_projects)} projects"
        else:
            # Single project import (root level)
            # Check if root has .kicad_pro files
            pro_files = [f for f in os.listdir(target_path) if f.endswith(".kicad_pro")]

            if pro_files:
                # Root has KiCAD project
                project_id = project_name

                # Check for duplicate ID
                registry = _load_project_registry()
                if project_id in registry:
                    existing_path = _normalize_path(
                        registry[project_id].get("path", "")
                    )
                    if existing_path != target_path_abs:
                        # Different project with same ID - add numeric suffix
                        suffix = 1
                        original_id = project_id
                        while f"{original_id}-{suffix}" in registry:
                            suffix += 1
                        project_id = f"{original_id}-{suffix}"
                        job["logs"].append(
                            f"Warning: ID collision detected, using {project_id}"
                        )

                register_project(
                    project_id=project_id,
                    name=project_name,
                    path=target_path,
                    repo_url=repo_url,
                    sub_path=None,
                    parent_repo=None,
                    description=f"Project {project_name}",
                )
                job["project_id"] = project_id
            else:
                # No KiCAD files at root - register as monorepo container
                job["logs"].append("Warning: No .kicad_pro files found at root level")
                job["project_id"] = project_name

        job["status"] = "completed"
        job["percent"] = 100
        job["logs"].append("Clone and registration successful.")

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Error: {str(e)}")
        logger.exception("Clone and registration job failed")
        # Cleanup
        if os.path.exists(target_path):
            try:
                shutil.rmtree(target_path)
            except Exception as cleanup_err:
                logger.warning(
                    "Failed to clean up cloned target %s after failure: %s",
                    target_path,
                    cleanup_err,
                )


def start_import_job(repo_url: str, selected_paths: list[str] | None = None) -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "message": "Starting import...",
        "percent": 0,
        "project_id": None,
        "project_ids": [],
        "error": None,
        "logs": [],
        "type": "import",
    }

    thread = threading.Thread(
        target=_run_clone_job, args=(job_id, repo_url, selected_paths)
    )
    thread.daemon = True
    thread.start()

    return job_id


def get_job_status(job_id: str):
    return jobs.get(job_id)


# Workflow Jobs
def _find_cli_path():
    # Check standard Mac path first
    mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    if os.path.exists(mac_path):
        return mac_path
    return "kicad-cli"  # Fallback to PATH


def _run_workflow_job(job_id: str, project_id: str, workflow_type: str):
    job = jobs[job_id]

    try:
        from app.services.workspace_service import workspace

        row = workspace.get_project_by_id(project_id)
        if not row:
            raise ValueError("Project not found")
        project_path = row["path"]

        job["logs"].append(f"Starting workflow: {workflow_type}")
        cli_path = _find_cli_path()
        job["logs"].append(f"Using KiCAD CLI: {cli_path}")

        # Find .kicad_pro file
        pro_file = None
        for file in os.listdir(project_path):
            if file.endswith(".kicad_pro"):
                pro_file = file
                break

        if not pro_file:
            raise ValueError(".kicad_pro file not found in project root")

        output_id = ""
        if workflow_type == "design":
            output_id = "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814"
        elif workflow_type == "manufacturing":
            output_id = "9e5c254b-cb26-4a49-beea-fa7af8a62903"
        elif workflow_type == "render":
            output_id = "81c80ad4-e8b9-4c9a-8bed-df7864fdefc6"
        else:
            raise ValueError(f"Unknown workflow type: {workflow_type}")

        # Resolve workflow jobset from project settings (.prism.json) / auto-detection.
        config = path_config_service.get_path_config(project_path)
        resolved_paths = path_config_service.resolve_paths(project_path, config)
        jobset_path = resolved_paths.jobset_path
        configured_jobset = config.jobset or "Outputs.kicad_jobset"

        if not jobset_path:
            raise ValueError(f"{configured_jobset} not found in project root")

        # Prefer a path relative to project root for CLI invocation/log readability.
        try:
            project_root_abs = os.path.abspath(project_path)
            jobset_abs = os.path.abspath(jobset_path)
            if os.path.commonpath([project_root_abs, jobset_abs]) == project_root_abs:
                jobset_file = os.path.relpath(jobset_abs, project_root_abs)
            else:
                jobset_file = jobset_path
        except ValueError:
            jobset_file = jobset_path

        cmd = [
            cli_path,
            "jobset",
            "run",
            "-f",
            jobset_file,
            "--output",
            output_id,
            pro_file,
        ]

        job["logs"].append(f"Command: {' '.join(cmd)}")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=project_path,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )

        for line in process.stdout:
            line = line.strip()
            if line:
                job["logs"].append(line)

        return_code = process.wait()

        if return_code == 0:
            job["percent"] = 100
            job["message"] = "Processing outputs..."
            job["logs"].append("Job completed successfully.")

            # --- Git Push Logic ---
            try:
                job["logs"].append("Starting Git Sync...")
                repo = Repo(project_path)

                # Check for changes
                if not repo.is_dirty(untracked_files=True):
                    job["logs"].append("No changes detected to commit.")
                else:
                    # Add all changes
                    job["logs"].append("Staging files...")
                    repo.git.add(".")
                    job["logs"].append("Files staged.")

                    # Commit
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    author_name = job.get("author", "anonymous")
                    commit_message = f"Generated {workflow_type} outputs - {timestamp} by {author_name}"
                    job["logs"].append(f"Committing with message: '{commit_message}'")

                    # Set local config for this commit to ensure it works even if global config is missing
                    # Or just use author argument in commit
                    repo.git.commit(
                        m=commit_message, author="KiCAD Prism <prism@example.com>"
                    )
                    job["logs"].append("Commit created.")

                    # Push
                    job["logs"].append("Pushing to remote...")
                    # Disable interactive prompt for push
                    env = os.environ.copy()
                    env["GIT_TERMINAL_PROMPT"] = "0"

                    origin = repo.remote(name="origin")
                    push_info = origin.push(env=env)

                    # Check push results
                    for info in push_info:
                        if info.flags & info.ERROR:
                            raise Exception(f"Push failed: {info.summary}")

                    job["logs"].append("Successfully pushed to remote.")

            except Exception as e:
                job["logs"].append(f"Git Sync Warning: {str(e)}")
                logger.warning(
                    "Git sync warning while pushing workflow output for %s: %s",
                    project_id,
                    e,
                )
                # We don't fail the job if push fails, just warn
            # ----------------------

            job["status"] = "completed"
            job["message"] = "Workflow completed successfully"

        else:
            job["status"] = "failed"
            job["error"] = f"Process exited with code {return_code}"
            job["logs"].append(f"Job failed with exit code {return_code}")

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Error: {str(e)}")
        logger.exception("Workflow job %s failed", job_id)


def start_workflow_job(
    project_id: str, workflow_type: str, author: str = "anonymous"
) -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "message": "Queued...",
        "percent": 0,
        "project_id": project_id,
        "error": None,
        "logs": [],
        "type": workflow_type,
        "author": author,
    }

    thread = threading.Thread(
        target=_run_workflow_job, args=(job_id, project_id, workflow_type)
    )
    thread.daemon = True
    thread.start()

    return job_id


def get_project_thumbnail_path(project_id: str) -> str | None:
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
        print("[DEBUG] Thumbnail path does not exist or is None")
        return None

    # If thumbnail path points to a specific file, return it directly
    if os.path.isfile(thumbnail_path):
        print(f"[DEBUG] Returning specific file: {thumbnail_path}")
        return thumbnail_path

    # If it's a directory, find first image file
    if os.path.isdir(thumbnail_path):
        for file in os.listdir(thumbnail_path):
            if file.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                result = os.path.join(thumbnail_path, file)
                print(f"[DEBUG] Returning file from directory: {result}")
                return result

    print("[DEBUG] No valid thumbnail found")
    return None


def find_schematic_file(project_path: str) -> str | None:
    """Find the main .kicad_sch file using path config."""
    resolved = path_config_service.resolve_paths(project_path)
    return resolved.schematic


def find_pcb_file(project_path: str) -> str | None:
    """Find the main .kicad_pcb file using path config."""
    resolved = path_config_service.resolve_paths(project_path)
    return resolved.pcb


def find_3d_model(project_path: str) -> str | None:
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


def find_ibom_file(project_path: str) -> str | None:
    """Find the iBoM HTML file using path config."""
    resolved = path_config_service.resolve_paths(project_path)

    if not resolved.design_outputs_dir or not os.path.exists(
        resolved.design_outputs_dir
    ):
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
    local_path_mode = project.local_path_mode

    # Remove from registry
    del registry[project_id]
    _save_project_registry(registry)

    # Never delete files for reference-mode local imports
    if local_path_mode == "reference":
        return True

    if import_type == "type2_subproject" and parent_repo:
        # Check if there are any remaining subprojects for this parent repo
        remaining_subprojects = [
            p
            for p in registry.values()
            if p.get("parent_repo") == parent_repo
            and p.get("import_type") == "type2_subproject"
        ]

        # If no remaining subprojects, delete the parent repo directory
        if not remaining_subprojects and project_path:
            parent_repo_path = project.parent_repo_path or os.path.dirname(project_path)
            if os.path.exists(parent_repo_path):
                try:
                    shutil.rmtree(parent_repo_path)
                    logger.info("Deleted Type-2 parent repo: %s", parent_repo_path)
                except Exception as err:
                    logger.warning(
                        "Failed to delete parent repo directory %s: %s",
                        parent_repo_path,
                        err,
                    )
    elif not parent_repo and project_path and os.path.exists(project_path):
        # For Type-1 projects (standalone), delete the directory
        try:
            shutil.rmtree(project_path)
        except Exception as err:
            logger.warning(
                "Failed to delete project directory %s: %s", project_path, err
            )

    return True


def update_project_folder_id(project_id: str, folder_id: str | None) -> bool:
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


def get_subsheets(project_path: str, main_schematic: str) -> list[str]:
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
