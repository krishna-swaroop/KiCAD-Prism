"""
Project Import Service for KiCAD Prism

Handles Type-1 (single project) and Type-2 (multiple projects) imports,
both from remote Git URLs and local filesystem paths.
"""

import logging
import os
import re
import shutil
import tempfile
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path

from git import InvalidGitRepositoryError, RemoteProgress, Repo

from app.services import path_config_service, project_service
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)


@dataclass
class DiscoveredProject:
    """A KiCAD project discovered within a repository."""

    name: str
    relative_path: str
    full_path: str
    has_schematic: bool
    has_pcb: bool


@dataclass
class AnalysisResult:
    """Result of analyzing a repository for import."""

    repo_name: str
    repo_url: str
    import_type: str  # "type1" or "type2"
    projects: list[DiscoveredProject]
    temp_path: str | None = None  # For cleanup after analysis


# Global job store for import operations
jobs: dict[str, dict] = {}

# Characters allowed in a repo directory name. Anything else (path separators,
# '..', leading dashes, etc.) is replaced so a crafted repo URL can't be turned
# into a path-traversal payload when joined to PROJECTS_ROOT.
_REPO_NAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]")


def _repo_name_from_url(repo_url: str) -> str:
    """Derive a safe single-segment directory name from a repository URL.

    Strips the trailing path component and '.git', then sanitizes it to a
    single path segment. Rejects names that would still escape (e.g. '..').
    """
    raw = repo_url.rstrip("/").split("/")[-1]
    if raw.endswith(".git"):
        raw = raw[:-4]
    name = _REPO_NAME_SAFE_RE.sub("_", raw).strip("._")
    if not name or name in (".", ".."):
        raise ValueError(
            f"Could not derive a safe repository name from URL: {repo_url!r}"
        )
    return name


def _ensure_within(base: Path, target: Path, *, what: str = "path") -> Path:
    """Return `target` resolved, asserting it stays inside `base`.

    Defense-in-depth guard before any destructive/clone filesystem op.
    """
    base_resolved = base.resolve()
    target_resolved = target.resolve()
    try:
        target_resolved.relative_to(base_resolved)
    except ValueError as error:
        raise ValueError(
            f"Refusing to use {what} outside of {base_resolved}: {target_resolved}"
        ) from error
    return target_resolved


def has_ssh_key() -> bool:
    """Check if a default SSH key exists."""
    ssh_dir = Path.home() / ".ssh"
    key_types = ["id_ed25519", "id_rsa"]
    for kt in key_types:
        if (ssh_dir / kt).exists():
            return True
    return False


class CloneProgress(RemoteProgress):
    """Git progress callback for clone operations."""

    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id

    def update(self, op_code, cur_count, max_count=None, message=""):
        if self.job_id in jobs:
            job = jobs[self.job_id]
            percent = 0
            if max_count and max_count > 0:
                percent = min((cur_count / max_count) * 100, 99)
            job["percent"] = int(percent)
            job["message"] = message or f"Cloning... {int(percent)}%"
            if message:
                job["logs"].append(f"[GIT] {message}")


def is_excluded_directory(dir_name: str) -> bool:
    """Check if directory should be excluded from project discovery."""
    excluded = {
        "archive",
        "archived",
        "old",
        "backup",
        "backups",
        "obsolete",
        "deprecated",
        "trash",
        ".git",
        "__pycache__",
        "node_modules",
        ".venv",
        "venv",
        ".env",
    }
    return dir_name.lower() in excluded or dir_name.startswith(".")


def is_local_path(url_or_path: str) -> bool:
    """Return True if the string looks like a local filesystem path rather than a remote URL."""
    p = url_or_path.strip()
    if p.startswith(("https://", "http://", "git@", "ssh://", "git://")):
        return False
    # Windows absolute paths (C:\..., \\server\share) and POSIX absolute paths
    if os.path.isabs(p) or p.startswith("\\\\"):
        return True
    return False


def discover_projects_from_filesystem(root: Path) -> list[DiscoveredProject]:
    """
    Discover KiCAD projects by walking the filesystem directly.
    Used for local-path imports (no git ls-tree available or needed).
    """
    projects = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded directories in-place so os.walk skips them
        dirnames[:] = [d for d in dirnames if not is_excluded_directory(d)]

        pro_files = [f for f in filenames if f.endswith(".kicad_pro")]
        if not pro_files:
            continue

        rel = Path(dirpath).relative_to(root)
        rel_str = rel.as_posix() if str(rel) != "." else "."
        has_sch = any(f.endswith(".kicad_sch") for f in filenames)
        has_pcb = any(f.endswith(".kicad_pcb") for f in filenames)

        for pro_file in pro_files:
            projects.append(
                DiscoveredProject(
                    name=Path(pro_file).stem,
                    relative_path=rel_str,
                    full_path=dirpath,
                    has_schematic=has_sch,
                    has_pcb=has_pcb,
                )
            )

    projects.sort(
        key=lambda p: (
            0 if p.relative_path == "." else len(p.relative_path.split("/")),
            p.name.lower(),
        )
    )
    return projects


def _run_analyze_local_job(job_id: str, local_path: str):
    """Background job: analyze a local filesystem path for KiCAD projects."""
    job = jobs[job_id]
    try:
        root = Path(local_path)
        if not root.exists() or not root.is_dir():
            job["status"] = "failed"
            job["error"] = f"Path does not exist or is not a directory: {local_path}"
            return

        repo_name = root.name
        job["logs"].append(f"Scanning {local_path} for KiCAD projects...")

        projects = discover_projects_from_filesystem(root)

        import_type = "type2"
        if len(projects) == 1 and projects[0].relative_path == ".":
            import_type = "type1"

        job["logs"].append(f"Found {len(projects)} project(s). Type: {import_type}")
        job["result"] = {
            "repo_name": repo_name,
            "repo_url": local_path,
            "import_type": import_type,
            "is_local": True,
            "projects": [
                {
                    "name": p.name,
                    "relative_path": p.relative_path,
                    "has_schematic": p.has_schematic,
                    "has_pcb": p.has_pcb,
                }
                for p in projects
            ],
        }
        job["status"] = "completed"
        job["percent"] = 100
        job["message"] = "Analysis complete."
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Error: {str(e)}")


def _run_import_local_job(
    job_id: str,
    local_path: str,
    import_type: str,
    selected_paths: list[str] | None,
    local_path_mode: str,
):
    """
    Background job: import a local git repo.
    local_path_mode: "reference" — register in-place, "copy" — git clone into data/projects.
    """
    job = jobs[job_id]
    target_path = None
    try:
        source = Path(local_path)
        if not source.exists() or not source.is_dir():
            job["status"] = "failed"
            job["error"] = f"Path does not exist: {local_path}"
            return

        raw_name = source.name
        repo_name = _REPO_NAME_SAFE_RE.sub("_", raw_name).strip("._")
        if not repo_name or repo_name in (".", ".."):
            job["status"] = "failed"
            job["error"] = (
                f"Could not derive a safe project name from path: {local_path}"
            )
            return

        if local_path_mode == "copy":
            # Clone the local repo into data/projects just like a remote import
            if import_type == "type1":
                base_path = Path(project_service.PROJECTS_ROOT) / "type1"
            else:
                base_path = Path(project_service.PROJECTS_ROOT) / "type2"

            # Defense-in-depth: assert the destination stays inside PROJECTS_ROOT.
            target_path = Path(
                _ensure_within(base_path, base_path / repo_name, what="copy target")
            )
            if target_path.exists():
                registry = project_service._load_project_registry()
                existing = [
                    p
                    for p in registry.values()
                    if p.get("parent_repo") == repo_name
                    or project_service._normalize_path(p.get("path", ""))
                    == str(target_path.resolve())
                ]
                if existing:
                    job["status"] = "failed"
                    job["error"] = f"Repository '{repo_name}' already exists"
                    return
                shutil.rmtree(target_path)

            base_path.mkdir(parents=True, exist_ok=True)
            job["logs"].append(f"Cloning {local_path} → {target_path}...")
            Repo.clone_from(
                str(source), str(target_path), progress=CloneProgress(job_id)
            )
            job["logs"].append("Clone complete.")
            effective_path = target_path
            effective_url = local_path  # keep original path as repo_url
        else:
            # Reference mode — use the path directly
            effective_path = source
            effective_url = local_path

        job["logs"].append("Registering projects...")
        ws_import_type = "single" if import_type == "type1" else "multi"
        repo_id = workspace.register_repository(
            name=repo_name,
            url=effective_url,
            clone_path_abs=str(effective_path),
            import_type=ws_import_type,
        )
        imported_ids = []

        if import_type == "type1":
            cached = _resolve_cached_paths(str(effective_path))
            project_id = workspace.register_project(
                repo_id=repo_id,
                name=repo_name,
                relative_path=".",
                description=f"Project {repo_name}",
                **cached,
            )
            imported_ids.append(project_id)
            job["logs"].append(f"Registered: {project_id}")
        else:
            if not selected_paths:
                job["status"] = "failed"
                job["error"] = "No projects selected"
                return
            for rel_path in selected_paths:
                full_project_path = effective_path / rel_path
                pro_files = list(full_project_path.glob("*.kicad_pro"))
                board_name = (
                    pro_files[0].stem if pro_files else os.path.basename(rel_path)
                )
                cached = _resolve_cached_paths(str(full_project_path))
                project_id = workspace.register_project(
                    repo_id=repo_id,
                    name=board_name,
                    relative_path=rel_path,
                    description=f"{repo_name} / {board_name}",
                    **cached,
                )
                imported_ids.append(project_id)
                job["logs"].append(f"Registered: {project_id}")

        job["project_ids"] = imported_ids
        job["status"] = "completed"
        job["percent"] = 100
        job["message"] = f"Imported {len(imported_ids)} project(s)"
        job["logs"].append("Import completed successfully.")

        _schedule_thumbnail_generation(imported_ids)

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Error: {str(e)}")
        if local_path_mode == "copy" and target_path and target_path.exists():
            try:
                shutil.rmtree(target_path)
            except Exception as cleanup_err:
                print(f"[import] Failed to clean up {target_path}: {cleanup_err}")


def discover_projects_from_repo(repo: Repo) -> list[DiscoveredProject]:
    """
    Discover KiCAD projects by inspecting the Git tree directly (no-checkout).
    Returns list of DiscoveredProject.
    """
    # Get all files in the repo recursively
    try:
        all_files = repo.git.ls_tree("-r", "HEAD", "--name-only").splitlines()
    except Exception:
        # Fallback for empty repos or other issues
        return []

    # Map directory -> list of filenames
    dir_map = {}
    for fpath in all_files:
        p = Path(fpath)
        # Handle relative path correctly (relative to repo root)
        dir_path = p.parent.as_posix()  # Use as_posix for consistency
        filename = p.name

        if dir_path not in dir_map:
            dir_map[dir_path] = []
        dir_map[dir_path].append(filename)

    projects = []
    for dir_path, filenames in dir_map.items():
        # Skip if any part of the path is excluded
        should_exclude = False
        parts = dir_path.split("/")
        if dir_path != ".":
            for part in parts:
                if is_excluded_directory(part):
                    should_exclude = True
                    break
        if should_exclude:
            continue

        pro_files = [f for f in filenames if f.endswith(".kicad_pro")]
        for pro_file in pro_files:
            has_sch = any(f.endswith(".kicad_sch") for f in filenames)
            has_pcb = any(f.endswith(".kicad_pcb") for f in filenames)

            projects.append(
                DiscoveredProject(
                    name=Path(pro_file).stem,
                    relative_path=dir_path if dir_path != "." else ".",
                    full_path="",  # No checkout path
                    has_schematic=has_sch,
                    has_pcb=has_pcb,
                )
            )

    # Sort by path depth (shallow first) then by name
    projects.sort(
        key=lambda p: (
            0 if p.relative_path == "." else len(p.relative_path.split("/")),
            p.name.lower(),
        )
    )

    return projects


def analyze_repository(repo_url: str) -> AnalysisResult:
    """
    Analyze a repository to determine import type and discover projects.
    Performs a shallow clone to a temporary directory.
    """
    # Error out if HTTPS is used while SSH key is present
    if (
        repo_url.startswith("https://")
        and has_ssh_key()
        and not os.environ.get("GITHUB_TOKEN")
    ):
        raise ValueError(
            "HTTPS URL provided. Please use the SSH URL (git@github.com:...) when an SSH key is configured."
        )

    repo_name = _repo_name_from_url(repo_url)

    # Create temp directory for analysis
    temp_dir = tempfile.mkdtemp(prefix="kicad_analyze_")
    clone_path = Path(temp_dir) / repo_name

    try:
        # Shallow clone for analysis
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        # Trust On First Use (TOFU) for SSH
        env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=accept-new"

        repo = Repo.clone_from(
            repo_url,
            str(clone_path),
            depth=1,
            single_branch=True,
            no_checkout=True,
            filter="blob:none",
            env=env,
        )

        # Discover projects from tree
        projects = discover_projects_from_repo(repo)

        # Determine import type
        # Type-1: Single .kicad_pro at root (relative_path == ".")
        # Type-2: Multiple projects or project not at root
        import_type = "type2"
        if len(projects) == 1 and projects[0].relative_path == ".":
            import_type = "type1"

        return AnalysisResult(
            repo_name=repo_name,
            repo_url=repo_url,
            import_type=import_type,
            projects=projects,
            temp_path=temp_dir,
        )

    except Exception:
        # Cleanup on error
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def _run_analyze_job(job_id: str, repo_url: str):
    """
    Background job: Analyze repository.
    """
    job = jobs[job_id]

    try:
        job["logs"].append(f"Analyzing {repo_url}...")

        # Error out if HTTPS is used while SSH key is present
        if (
            repo_url.startswith("https://")
            and has_ssh_key()
            and not os.environ.get("GITHUB_TOKEN")
        ):
            error_msg = "HTTPS URL provided. Please use the SSH URL (git@github.com:...) for private repositories when an SSH key is configured."
            job["logs"].append(f"Error: {error_msg}")
            job["status"] = "failed"
            job["error"] = error_msg
            return

        repo_name = _repo_name_from_url(repo_url)
        temp_dir = tempfile.mkdtemp(prefix="kicad_analyze_")
        clone_path = Path(temp_dir) / repo_name

        job["logs"].append("Cloning repository (blobless/no-checkout)...")

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=accept-new"

        repo = Repo.clone_from(
            repo_url,
            str(clone_path),
            depth=1,
            single_branch=True,
            no_checkout=True,
            filter="blob:none",
            progress=CloneProgress(job_id),
            env=env,
        )

        job["logs"].append("Discovering KiCAD projects from tree...")
        projects = discover_projects_from_repo(repo)

        import_type = "type2"
        if len(projects) == 1 and projects[0].relative_path == ".":
            import_type = "type1"

        job["logs"].append(f"Found {len(projects)} project(s). Type: {import_type}")

        # Store result in job
        job["result"] = {
            "repo_name": repo_name,
            "repo_url": repo_url,
            "import_type": import_type,
            "projects": [
                {
                    "name": p.name,
                    "relative_path": p.relative_path,
                    "has_schematic": p.has_schematic,
                    "has_pcb": p.has_pcb,
                }
                for p in projects
            ],
            # We don't pass temp_path here as we'll cleanup immediately or handled differently
        }

        # Cleanup temp dir immediately since we have the metadata
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

        job["status"] = "completed"
        job["percent"] = 100
        job["message"] = "Analysis complete."

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Error: {str(e)}")


def cleanup_analysis_temp(analysis: AnalysisResult):
    """Clean up temporary directory used for analysis."""
    if analysis.temp_path and os.path.exists(analysis.temp_path):
        shutil.rmtree(analysis.temp_path, ignore_errors=True)


def generate_project_id(base_id: str, registry: dict) -> str:
    """Generate unique project ID, handling collisions with a numeric suffix."""
    if base_id not in registry:
        return base_id
    suffix = 1
    while f"{base_id}-{suffix}" in registry:
        suffix += 1
    return f"{base_id}-{suffix}"


def _resolve_cached_paths(project_path: str) -> dict:
    """Resolve and return cached path info for a project directory."""
    try:
        resolved = path_config_service.resolve_paths(project_path)
        sch = resolved.schematic
        pcb = resolved.pcb
        thumb = resolved.thumbnail_dir
        jobset = resolved.jobset_path

        # Make paths relative to project_path
        def _rel(abs_path):
            if not abs_path:
                return None
            try:
                return os.path.relpath(abs_path, project_path)
            except ValueError:
                return None

        # Thumbnail: resolve to first image if directory
        thumb_rel = None
        if thumb:
            if os.path.isfile(thumb):
                thumb_rel = _rel(thumb)
            elif os.path.isdir(thumb):
                for f in sorted(os.listdir(thumb)):
                    if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                        thumb_rel = _rel(os.path.join(thumb, f))
                        break
        design_dir = resolved.design_outputs_dir
        has_3d = False
        has_ibom = False
        if design_dir and os.path.isdir(design_dir):
            for f in os.listdir(design_dir):
                fl = f.lower()
                if fl.endswith((".glb", ".step", ".stp")):
                    has_3d = True
                if "ibom" in fl and fl.endswith(".html"):
                    has_ibom = True
            model_dir = os.path.join(design_dir, "3DModel")
            if os.path.isdir(model_dir):
                for f in os.listdir(model_dir):
                    if f.lower().endswith((".glb", ".step", ".stp")):
                        has_3d = True
        return {
            "schematic_rel": _rel(sch),
            "pcb_rel": _rel(pcb),
            "thumbnail_rel": thumb_rel,
            "jobset_rel": _rel(jobset),
            "has_3d_model": has_3d,
            "has_ibom": has_ibom,
        }
    except Exception:
        return {}


def _run_import_job(
    job_id: str,
    repo_url: str,
    import_type: str,
    selected_paths: list[str] | None = None,
):
    """
    Background job: Clone repository and register projects.
    """
    job = jobs[job_id]

    try:
        # Error out if HTTPS is used while SSH key is present
        if (
            repo_url.startswith("https://")
            and has_ssh_key()
            and not os.environ.get("GITHUB_TOKEN")
        ):
            error_msg = "HTTPS URL provided. Please use the SSH URL (git@github.com:...) for private repositories when an SSH key is configured."
            job["logs"].append(f"Error: {error_msg}")
            job["status"] = "failed"
            job["error"] = error_msg
            return

        # Extract repo name
        repo_name = _repo_name_from_url(repo_url)

        # Determine target directory based on type
        if import_type == "type1":
            base_path = Path(project_service.PROJECTS_ROOT) / "type1"
        else:
            base_path = Path(project_service.PROJECTS_ROOT) / "type2"

        # Defense-in-depth: assert the clone destination stays inside
        # PROJECTS_ROOT before any rmtree/clone touches the filesystem.
        target_path = Path(
            _ensure_within(base_path, base_path / repo_name, what="clone target")
        )

        # Check if already exists via workspace DB
        existing_repo = workspace.get_repository_by_url(repo_url)
        if existing_repo:
            job["status"] = "failed"
            job["error"] = f"Repository '{repo_name}' is already imported"
            job["logs"].append(f"Error: Repository with URL {repo_url} already exists")
            return

        if target_path.exists():
            # Stranded directory with no DB entry — remove and re-clone
            job["logs"].append(f"Removing stranded directory: {target_path}")
            try:
                shutil.rmtree(target_path)
            except Exception as e:
                job["status"] = "failed"
                job["error"] = f"Failed to remove stranded directory: {e}"
                return

        # Ensure base directory exists
        base_path.mkdir(parents=True, exist_ok=True)

        # Clone repository
        job["logs"].append(f"Cloning {repo_url}...")
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        # Trust On First Use (TOFU) for SSH
        env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=accept-new"

        Repo.clone_from(
            repo_url,
            str(target_path),
            filter="blob:none",
            progress=CloneProgress(job_id),
            env=env,
        )

        job["logs"].append("Clone complete. Registering projects...")

        # Register repository in workspace DB
        repo_id = workspace.register_repository(
            name=repo_name,
            url=repo_url,
            clone_path_abs=str(target_path),
            import_type="single" if import_type == "type1" else "multi",
        )

        imported_ids = []

        if import_type == "type1":
            cached = _resolve_cached_paths(str(target_path))
            project_id = workspace.register_project(
                repo_id=repo_id,
                name=repo_name,
                relative_path=".",
                description=f"Project {repo_name}",
                **cached,
            )
            imported_ids.append(project_id)
            job["logs"].append(f"Registered Type-1 project: {project_id}")

        else:
            # Type-2: Register selected subprojects
            if not selected_paths:
                job["status"] = "failed"
                job["error"] = "No projects selected for Type-2 import"
                return

            for rel_path in selected_paths:
                full_project_path = target_path / rel_path
                pro_files = list(full_project_path.glob("*.kicad_pro"))
                board_name = (
                    pro_files[0].stem if pro_files else os.path.basename(rel_path)
                )
                cached = _resolve_cached_paths(str(full_project_path))
                project_id = workspace.register_project(
                    repo_id=repo_id,
                    name=board_name,
                    relative_path=rel_path,
                    description=f"{repo_name} / {board_name}",
                    **cached,
                )
                imported_ids.append(project_id)
                job["logs"].append(f"Registered Type-2 subproject: {project_id}")

        job["project_ids"] = imported_ids
        job["status"] = "completed"
        job["percent"] = 100
        job["message"] = f"Imported {len(imported_ids)} project(s)"
        job["logs"].append("Import completed successfully.")

        _schedule_thumbnail_generation(imported_ids)

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Error: {str(e)}")

        # Cleanup on failure
        if target_path.exists():
            try:
                shutil.rmtree(target_path)
            except Exception as cleanup_err:
                print(f"[import] Failed to clean up {target_path}: {cleanup_err}")


def start_import_job(
    repo_url: str,
    import_type: str,
    selected_paths: list[str] | None = None,
    local_path_mode: str | None = None,
) -> str:
    """
    Start an asynchronous import job.
    For local paths, local_path_mode must be "reference" or "copy".
    Returns job ID for polling.
    """
    job_id = str(uuid.uuid4())

    jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "message": "Starting import...",
        "percent": 0,
        "project_ids": [],
        "error": None,
        "logs": [f"Starting import of {repo_url}"],
        "type": "import",
        "repo_url": repo_url,
        "import_type": import_type,
    }

    if is_local_path(repo_url):
        mode = local_path_mode or "reference"
        thread = threading.Thread(
            target=_run_import_local_job,
            args=(job_id, repo_url, import_type, selected_paths, mode),
        )
    else:
        thread = threading.Thread(
            target=_run_import_job,
            args=(job_id, repo_url, import_type, selected_paths),
        )

    thread.daemon = True
    thread.start()
    return job_id


def start_analyze_job(repo_url: str) -> str:
    """
    Start an asynchronous analysis job.
    Returns job ID.
    """
    job_id = str(uuid.uuid4())

    jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "message": "Starting analysis...",
        "percent": 0,
        "error": None,
        "logs": [f"Starting analysis of {repo_url}"],
        "type": "analyze",
        "repo_url": repo_url,
    }

    if is_local_path(repo_url):
        thread = threading.Thread(
            target=_run_analyze_local_job, args=(job_id, repo_url)
        )
    else:
        thread = threading.Thread(target=_run_analyze_job, args=(job_id, repo_url))

    thread.daemon = True
    thread.start()
    return job_id


def get_job_status(job_id: str) -> dict | None:
    """Get the current status of an import or workflow job."""
    # Check import jobs first
    job = jobs.get(job_id)
    if job:
        return job

    # Then check workflow jobs from project_service
    return project_service.jobs.get(job_id)


def _schedule_thumbnail_generation(project_ids: list[str]) -> None:
    """Fire-and-forget: generate thumbnails for a list of project IDs in a daemon thread."""

    def _run() -> None:
        from app.services import thumbnail_service  # noqa: PLC0415

        for pid in project_ids:
            try:
                thumbnail_service.generate_for_project(pid)
                logger.info("thumbnail: generated for %s", pid)
            except Exception:
                logger.exception("thumbnail: failed for %s", pid)

    threading.Thread(target=_run, daemon=True).start()


def sync_project(project_id: str) -> dict:
    """
    Sync a project with its remote repository.
    For Type-1: pulls the project repo.
    For Type-2: pulls the parent repo.
    """
    row = workspace.get_project_by_id(project_id)
    if not row:
        return {"status": "error", "message": "Project not found"}

    import_type = row.get("import_type") or "single"
    sync_path = (
        row.get("parent_repo_path") if import_type == "multi" else row.get("path")
    )

    if not sync_path or not os.path.exists(sync_path):
        logger.error(
            "sync_project: path not found for project %s: %s", project_id, sync_path
        )
        return {"status": "error", "message": "Project path not found."}

    try:
        repo = Repo(sync_path)
    except InvalidGitRepositoryError:
        logger.error(
            "sync_project: not a git repository for project %s: %s",
            project_id,
            sync_path,
        )
        return {"status": "error", "message": "Project is not a valid git repository."}
    except Exception:
        logger.exception(
            "sync_project: failed to open repository for project %s", project_id
        )
        return {"status": "error", "message": "Failed to open project repository."}

    try:
        if not repo.remotes:
            # Local reference-mode repo with no remote — nothing to pull from
            path_config_service.clear_config_cache()
            return {
                "status": "success",
                "message": "Local repository with no remote; nothing to sync.",
            }

        origin = repo.remote("origin")

        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=accept-new"

        head_before = repo.head.commit.hexsha if repo.head.is_valid() else None
        fetch_info = origin.fetch(env=env)
        origin.pull(env=env)
        head_after = repo.head.commit.hexsha if repo.head.is_valid() else None

        # Refresh cached paths after sync
        path_config_service.clear_config_cache()
        project_path = row.get("path", "")
        if project_path and os.path.isdir(project_path):
            cached = _resolve_cached_paths(project_path)
            workspace.update_project(project_id, **cached)

        # Update repo last_synced_at
        workspace.update_repository_synced(row.get("repo_id", ""))

        # Regenerate thumbnail when new commits arrived
        if head_before != head_after:
            _schedule_thumbnail_generation([project_id])

        return {
            "status": "success",
            "message": f"Synced {len(fetch_info)} ref(s)",
        }

    except Exception:
        logger.exception("sync_project: sync failed for project %s", project_id)
        return {"status": "error", "message": "Failed to sync project repository."}
