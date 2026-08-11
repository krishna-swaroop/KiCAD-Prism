"""
Project Import Service for KiCAD Prism

Handles Type-1 (single project) and Type-2 (multiple projects) imports.
"""
import os
import hashlib
import mimetypes
import subprocess
import shutil
import tempfile
from pathlib import Path
from typing import List, Optional, Sequence
from dataclasses import dataclass
from git import Git, Repo, RemoteProgress
from app.core.config import settings
from app.services import derived_assets, project_service, path_config_service
from app.services.git_failures import GitAccessError, as_access_error
from app.services.git_remote_url import ParsedRemote, RemoteUrlPolicy, parse_remote_url
from app.services.job_runtime import JobContext, JobResult
from app.services.job_service import jobs as v3_jobs
from app.services.workspace_service import workspace


@dataclass
class DiscoveredProject:
    """A KiCAD project discovered within a repository."""
    name: str
    relative_path: str
    full_path: str
    has_schematic: bool
    has_pcb: bool
    # False when the directory holds design files but no .kicad_pro. Plenty of
    # teams gitignore the project file because KiCad rewrites it on every open,
    # so its absence must not hide the board.
    has_project_file: bool = True


def remote_url_policy() -> RemoteUrlPolicy:
    """Build the clone-URL policy for this deployment."""
    return RemoteUrlPolicy.build(
        allowed_hosts=settings.IMPORT_ALLOWED_HOSTS,
        allow_insecure_http=settings.IMPORT_ALLOW_INSECURE_HTTP,
    )


def find_existing_repository(parsed: ParsedRemote) -> Optional[dict]:
    """Find an already-imported repository that resolves to the same remote.

    Compares canonical identities rather than URL strings, so importing
    ``git@github.com:org/repo.git`` after ``https://github.com/org/repo`` is
    recognised as the same repository instead of cloning it twice.
    """
    target = parsed.dedup_key
    for repository in workspace.get_repositories():
        stored = str(repository.get("url") or "")
        if not stored:
            continue
        try:
            if parse_remote_url(stored).dedup_key == target:
                return repository
        except Exception:
            # A row predating URL validation should not block a valid import.
            if stored.strip() == parsed.url:
                return repository
    return None


def _describe_target(parsed: ParsedRemote) -> str:
    """How a repository should be named in a message to the user."""
    return f"{parsed.host}/{parsed.path.strip('/').removesuffix('.git')}"


def _inject_github_token(env: dict) -> None:
    """Supply GITHUB_TOKEN to one Git invocation, and leave nothing behind.

    This used to be written into the container's ``~/.gitconfig`` at startup, so
    the token sat in cleartext on the filesystem, in the writable layer of a
    committed image, and in any support bundle that captured the home
    directory -- and it applied to every process in the container, not only the
    ones meant to reach GitHub. ``GIT_CONFIG_*`` expresses the same rewrite for
    the duration of a single command.
    """
    token = settings.GITHUB_TOKEN.strip()
    if not token:
        return
    # The parent environment may already carry GIT_CONFIG_* entries; append.
    try:
        index = int(env.get("GIT_CONFIG_COUNT", "0") or "0")
    except ValueError:
        index = 0
    env[f"GIT_CONFIG_KEY_{index}"] = f"url.https://{token}@github.com/.insteadOf"
    env[f"GIT_CONFIG_VALUE_{index}"] = "https://github.com/"
    env["GIT_CONFIG_COUNT"] = str(index + 1)


def git_env() -> dict:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    # Host keys must already be pinned. This used to be `accept-new`, which
    # trusts whatever key the first connection is offered -- a window in which a
    # host on the path can present its own key and read every repository the
    # workspace pulls. Trusting a new host is now a deliberate administrator
    # action, taken after comparing the fingerprint against what the Git server's
    # operator publishes.
    env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=yes -o BatchMode=yes"
    _inject_github_token(env)
    return env


def list_remote_branches(parsed: ParsedRemote) -> tuple[List[str], Optional[str]]:
    """Return the remote's branch names and its default branch.

    Uses ``ls-remote`` rather than a clone: enumerating refs costs one round
    trip and no disk, so the dialog can offer a branch picker before the user
    has committed to importing anything.
    """
    git = Git()
    git.update_environment(**git_env())
    try:
        head_output = git.ls_remote("--symref", parsed.url, "HEAD")
    except Exception as error:
        # This is the first thing that touches the remote, so it is where a
        # wrong URL or a missing permission shows up. Reporting it here gives a
        # far better message than letting the clone fail later.
        raise as_access_error(
            error, target=_describe_target(parsed), host=parsed.host
        ) from error

    default_branch: Optional[str] = None
    for line in head_output.splitlines():
        if line.startswith("ref:"):
            target = line.split()[1]
            default_branch = target.removeprefix("refs/heads/")
            break

    try:
        heads_output = git.ls_remote("--heads", parsed.url)
    except Exception:
        return ([default_branch] if default_branch else []), default_branch

    branches = []
    for line in heads_output.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].startswith("refs/heads/"):
            branches.append(parts[1].removeprefix("refs/heads/"))
    branches.sort(key=lambda name: (name != default_branch, name.casefold()))
    return branches, default_branch


def _github_ssh_equivalent(parsed: ParsedRemote) -> Optional[ParsedRemote]:
    """Return the workspace-SSH spelling of one GitHub HTTPS remote.

    GitHub's Clone menu presents HTTPS first, while Prism's deployment uses a
    shared machine-user SSH key for private repositories.  Requiring every
    designer to understand that deployment detail made imports appear tied to
    the laptop or role of the person pasting the URL.  Keep HTTPS as the first
    attempt (so public repositories and ``GITHUB_TOKEN`` continue to work), but
    provide the equivalent SSH address when that attempt needs credentials.
    """
    if parsed.scheme != "https" or parsed.host.casefold() != "github.com":
        return None
    if parsed.port not in (None, 443):
        return None
    path = parsed.path.strip("/")
    if not path:
        return None
    if not path.endswith(".git"):
        path += ".git"
    return parse_remote_url(f"git@github.com:{path}", remote_url_policy())


def resolve_remote_access(
    parsed: ParsedRemote,
) -> tuple[ParsedRemote, List[str], Optional[str]]:
    """Resolve a readable transport and return its branch information.

    A private GitHub repository addressed by HTTPS normally responds with a
    credentials error even when Prism's workspace SSH identity is authorized.
    In that narrow case, retry the same canonical repository over SSH.  Other
    failures retain their original meaning and SSH URLs remain untouched.
    """
    try:
        branches, default_branch = list_remote_branches(parsed)
        return parsed, branches, default_branch
    except GitAccessError as https_error:
        if https_error.reason not in {"credentials-required", "repository-not-found"}:
            raise
        ssh_remote = _github_ssh_equivalent(parsed)
        if ssh_remote is None:
            raise

        print(
            f"HTTPS access to {_describe_target(parsed)} needs credentials; "
            "retrying with Prism's workspace SSH identity",
            flush=True,
        )
        try:
            branches, default_branch = list_remote_branches(ssh_remote)
        except GitAccessError as ssh_error:
            # SSH-specific diagnostics (missing/untrusted client or an
            # unauthorized key) are more actionable than the original generic
            # HTTPS credential prompt.  A not-found response after the SSH
            # attempt also correctly covers a typo or a key lacking this one
            # repository's permission.
            if ssh_error.reason in {
                "ssh-unavailable",
                "host-key-unverified",
                "ssh-key-not-authorized",
                "repository-not-found",
            }:
                raise ssh_error from https_error
            raise https_error from ssh_error
        return ssh_remote, branches, default_branch


def _validate_ref(ref: Optional[str]) -> Optional[str]:
    """Reject anything that git would read as an option rather than a ref."""
    if ref is None:
        return None
    candidate = ref.strip()
    if not candidate:
        return None
    if candidate.startswith("-") or any(char.isspace() for char in candidate):
        raise ValueError(f"Invalid branch name: {ref!r}")
    return candidate


class V3CloneProgress(RemoteProgress):
    def __init__(self, context: JobContext, *, stage: str) -> None:
        super().__init__()
        self.context = context
        self.stage = stage

    def update(self, op_code, cur_count, max_count=None, message=""):
        self.context.check_cancelled()
        percent = 0.0
        if max_count and max_count > 0:
            percent = min((float(cur_count) / float(max_count)) * 75.0, 75.0)
        if message:
            print(f"[git] {message}", flush=True)
        self.context.progress(
            stage=self.stage,
            message=message or f"Cloning repository ({percent:.0f}%)",
            percent=percent,
        )


def is_excluded_directory(dir_name: str) -> bool:
    """Check if directory should be excluded from project discovery."""
    excluded = {
        'archive', 'archived', 'old', 'backup', 'backups',
        'obsolete', 'deprecated', 'trash', '.git', '__pycache__',
        'node_modules', '.venv', 'venv', '.env'
    }
    return dir_name.lower() in excluded or dir_name.startswith('.')


def _directory_depth(relative_path: str) -> int:
    return 0 if relative_path == "." else len(relative_path.split("/"))


def discover_projects_from_repo(repo: Repo) -> List[DiscoveredProject]:
    """
    Discover KiCAD projects by inspecting the Git tree directly (no-checkout).
    Returns list of DiscoveredProject.

    A directory counts as a project when it holds a ``.kicad_pro``, a
    ``.kicad_pcb`` or a ``.kicad_sch``. Requiring ``.kicad_pro`` used to make
    whole repositories import as nothing at all, because KiCad rewrites that
    file on every open and teams routinely gitignore it.
    """
    # Get all files in the repo recursively
    try:
        all_files = repo.git.ls_tree('-r', 'HEAD', '--name-only').splitlines()
    except Exception:
        # Fallback for empty repos or other issues
        return []

    # Map directory -> list of filenames
    dir_map: dict[str, list[str]] = {}
    for fpath in all_files:
        p = Path(fpath)
        # Handle relative path correctly (relative to repo root)
        dir_path = p.parent.as_posix() # Use as_posix for consistency
        dir_map.setdefault(dir_path, []).append(p.name)

    def is_visible(dir_path: str) -> bool:
        if dir_path == ".":
            return True
        return not any(is_excluded_directory(part) for part in dir_path.split("/"))

    visible = {path: names for path, names in dir_map.items() if is_visible(path)}

    def descendants(root: str) -> list[str]:
        """Directories at or beneath ``root``, root included."""
        if root == ".":
            return list(visible)
        prefix = f"{root}/"
        return [path for path in visible if path == root or path.startswith(prefix)]

    projects: List[DiscoveredProject] = []
    for dir_path, filenames in visible.items():
        pro_files = sorted(f for f in filenames if f.endswith(".kicad_pro"))
        pcb_files = sorted(f for f in filenames if f.endswith(".kicad_pcb"))
        sch_files = sorted(f for f in filenames if f.endswith(".kicad_sch"))
        if not (pro_files or pcb_files or sch_files):
            continue

        # Design files often live one level down (Subsheets/, sch/), so look
        # through the subtree rather than only at this directory. Without this a
        # board with hierarchical sheets reported "no schematic".
        subtree = descendants(dir_path)
        has_sch = any(
            name.endswith(".kicad_sch") for path in subtree for name in visible[path]
        )
        has_pcb = any(
            name.endswith(".kicad_pcb") for path in subtree for name in visible[path]
        )

        relative_path = dir_path if dir_path != "." else "."
        if pro_files:
            for pro_file in pro_files:
                projects.append(DiscoveredProject(
                    name=Path(pro_file).stem,
                    relative_path=relative_path,
                    full_path="", # No checkout path
                    has_schematic=has_sch,
                    has_pcb=has_pcb,
                    has_project_file=True,
                ))
            continue

        # No .kicad_pro: name the project after its board, or its schematic when
        # there is no board. KiCad regenerates the project file with this stem.
        anchor = (pcb_files or sch_files)[0]
        projects.append(DiscoveredProject(
            name=Path(anchor).stem,
            relative_path=relative_path,
            full_path="",
            has_schematic=has_sch,
            has_pcb=has_pcb,
            has_project_file=False,
        ))

    # A `Subsheets/` or `sch/` directory sits inside a project and holds that
    # project's own sheets; it is not a second board. Drop any project-file-less
    # directory that lives beneath another discovered project.
    project_paths = {project.relative_path for project in projects}

    def has_ancestor_project(relative_path: str) -> bool:
        if relative_path == ".":
            return False
        parent = Path(relative_path).parent
        while True:
            candidate = parent.as_posix()
            if candidate in project_paths:
                return True
            if candidate in (".", ""):
                return False
            parent = parent.parent

    projects = [
        project
        for project in projects
        if project.has_project_file or not has_ancestor_project(project.relative_path)
    ]

    # Sort by path depth (shallow first) then by name
    projects.sort(key=lambda p: (_directory_depth(p.relative_path), p.name.lower()))

    return projects


def resolve_cached_paths(project_path: str, *, current_source: Optional[str] = None) -> dict:
    """Resolve and return cached path info for a project directory.

    ``current_source`` is the project's recorded ``thumbnail_source``, so a
    thumbnail the user chose deliberately survives a re-scan.
    """
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
        # Prism's own render is what a project shows. An image committed under
        # assets/thumbnail used to win, which meant a stale hand-drawn picture
        # outranked a render of the board as it actually is now — and a repo
        # with no such image looked, wrongly, like a project Prism could not
        # render. The committed image is now only a stand-in for a project with
        # nothing to render, and any deliberate choice is made in the workspace.
        thumb_rel = None
        thumbnail_source = "generated"
        thumbnail_digest = None
        thumbnail_media_type = None
        thumbnail_size_bytes = None

        thumbnail_file = None
        if current_source == "custom":
            uploaded = derived_assets.find_thumbnail(project_path, kind="custom")
            if uploaded is not None:
                thumbnail_file = uploaded
                thumb_rel = uploaded.name
                thumbnail_source = "custom"

        if thumbnail_file is None:
            generated = derived_assets.find_thumbnail(project_path)
            if generated is not None:
                thumbnail_file = generated
                thumb_rel = generated.name
                thumbnail_source = "generated"

        if thumbnail_file is None and thumb:
            repository_rel = None
            if os.path.isfile(thumb):
                repository_rel = _rel(thumb)
            elif os.path.isdir(thumb):
                for f in sorted(os.listdir(thumb)):
                    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        repository_rel = _rel(os.path.join(thumb, f))
                        break
            candidate = Path(project_path) / repository_rel if repository_rel else None
            if candidate is not None and candidate.is_file():
                thumbnail_file = candidate
                thumb_rel = repository_rel
                thumbnail_source = "repository"

        if thumbnail_file is not None:
            thumbnail_digest = hashlib.sha256(thumbnail_file.read_bytes()).hexdigest()
            thumbnail_media_type = (
                mimetypes.guess_type(thumbnail_file.name)[0]
                or "application/octet-stream"
            )
            thumbnail_size_bytes = thumbnail_file.stat().st_size
        design_dir = resolved.design_outputs_dir
        has_3d = False
        has_ibom = False
        if design_dir and os.path.isdir(design_dir):
            for f in os.listdir(design_dir):
                fl = f.lower()
                if fl.endswith(('.glb', '.step', '.stp')):
                    has_3d = True
                if 'ibom' in fl and fl.endswith('.html'):
                    has_ibom = True
            model_dir = os.path.join(design_dir, '3DModel')
            if os.path.isdir(model_dir):
                for f in os.listdir(model_dir):
                    if f.lower().endswith(('.glb', '.step', '.stp')):
                        has_3d = True
        return {
            'schematic_rel': _rel(sch),
            'pcb_rel': _rel(pcb),
            'thumbnail_rel': thumb_rel,
            'thumbnail_source': thumbnail_source,
            'thumbnail_digest': thumbnail_digest,
            'thumbnail_media_type': thumbnail_media_type,
            'thumbnail_size_bytes': thumbnail_size_bytes,
            'jobset_rel': _rel(jobset),
            'has_3d_model': has_3d,
            'has_ibom': has_ibom,
        }
    except Exception:
        return {}


def refresh_project_assets(project_id: str) -> dict:
    """Re-scan a registered project's files, preserving its thumbnail choice.

    Every re-scan has to be told what the project's thumbnail is currently set
    to, or it would decide afresh each time and quietly discard an image the
    user uploaded. Reading the row here keeps that from being something each
    caller has to remember.
    """
    row = workspace.get_project_by_id(project_id) or {}
    project_path = str(row.get("path") or "")
    if not project_path:
        return {}
    cached = resolve_cached_paths(
        project_path, current_source=str(row.get("thumbnail_source") or "") or None
    )
    if cached:
        workspace.update_project(project_id, **cached)
    return cached


def generate_thumbnail_for_project(project_path: str, logs_list: Optional[List[str]] = None) -> bool:
    """
    Find the main .kicad_pcb file and run kicad-cli pcb render to generate a thumbnail.
    """
    try:
        from PIL import Image

        resolved = path_config_service.resolve_paths(project_path)
        pcb_file = resolved.pcb
        if not pcb_file or not os.path.exists(pcb_file):
            if logs_list is not None:
                logs_list.append(f"No .kicad_pcb file found to generate thumbnail for {project_path}")
            return False
        
        # Check standard paths for kicad-cli
        cli_path = "kicad-cli"
        # Check environment variable
        for var in ("KICAD_CLI_PATH", "KICAD_CLI"):
            val = os.environ.get(var, "").strip()
            if val and os.path.exists(val):
                cli_path = val
                break
        else:
            # Check standard Mac path
            mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
            if os.path.exists(mac_path):
                cli_path = mac_path
            else:
                # Check PATH
                which_cli = shutil.which("kicad-cli")
                if which_cli:
                    cli_path = which_cli

        if logs_list is not None:
            logs_list.append(f"Generating thumbnail using {cli_path} for PCB: {pcb_file}")

        # Render into a scratch directory outside the checkout. Nothing this
        # function does may leave a file inside the user's working tree.
        staging_dir = derived_assets.thumbnail_dir(project_path)
        staging_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=staging_dir,
            prefix=".thumbnail-render-",
            suffix=".png",
            delete=False,
        ) as temporary_render:
            render_path = Path(temporary_render.name)


        cmd = [
            cli_path,
            "pcb",
            "render",
            "--quality", "high",
            "--floor",
            "--perspective",
            "--rotate", "-45,0,45",
            "--width", "800",
            "--height", "600",
            "-o", str(render_path),
            pcb_file
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False
        )
        
        if result.returncode != 0:
            if logs_list is not None:
                logs_list.append(f"kicad-cli render failed (code {result.returncode}): {result.stderr[:400]}")
            render_path.unlink(missing_ok=True)
            return False

        with tempfile.NamedTemporaryFile(
            dir=staging_dir,
            prefix=".thumbnail-encode-",
            suffix=".webp",
            delete=False,
        ) as temporary_webp:
            webp_path = Path(temporary_webp.name)
        try:
            with Image.open(render_path) as image:
                image.thumbnail((640, 480), Image.Resampling.LANCZOS)
                for quality in (78, 68, 58):
                    image.save(
                        webp_path,
                        format="WEBP",
                        quality=quality,
                        method=6,
                    )
                    if webp_path.stat().st_size <= 250 * 1024:
                        break
            output_path, _digest, _size = derived_assets.store_thumbnail(
                project_path, webp_path
            )
        finally:
            render_path.unlink(missing_ok=True)
            webp_path.unlink(missing_ok=True)

        if logs_list is not None:
            logs_list.append(
                f"Successfully generated WebP thumbnail at {output_path} "
                f"({output_path.stat().st_size} bytes)"
            )
        return True
        
    except Exception as e:
        if logs_list is not None:
            logs_list.append(f"Exception during thumbnail generation: {e}")
        return False



def _repository_lock_key(parsed: ParsedRemote) -> str:
    """Lock on repository identity, so the two spellings of one remote serialise."""
    return f"repository-import:{hashlib.sha256(parsed.dedup_key.encode('utf-8')).hexdigest()}"


def start_import_job(repo_url: str, import_type: str,
                     selected_paths: Optional[List[str]] = None,
                     ref: Optional[str] = None,
                     *,
                     requested_by: str = "project-import") -> str:
    """
    Start an asynchronous import job.
    Returns job ID for polling.

    ``import_type`` and ``selected_paths`` are client-supplied hints only. The
    job re-derives both from the repository before anything is written to disk.
    """
    if import_type not in {"type1", "type2"}:
        raise ValueError("Import type must be type1 or type2")
    parsed = parse_remote_url(repo_url, remote_url_policy())
    validated_ref = _validate_ref(ref)
    paths = sorted(selected_paths or [])
    active_key = hashlib.sha256(
        "\x1f".join(
            [parsed.dedup_key, import_type, validated_ref or "", *paths]
        ).encode("utf-8")
    ).hexdigest()
    queued = v3_jobs.enqueue(
        "project_import",
        {
            "repo_url": parsed.url,
            "import_type": import_type,
            "selected_paths": list(selected_paths or []),
            "ref": validated_ref,
        },
        worker_pool="prism",
        artifact_key=active_key,
        requested_by=requested_by,
        max_attempts=1,
        resources={"prism_worker": 1, "import": 1},
        locks=[{"key": _repository_lock_key(parsed), "mode": "write"}],
    )
    return str(queued["job_id"])


def start_analyze_job(
    repo_url: str,
    ref: Optional[str] = None,
    *,
    requested_by: str = "project-import",
) -> str:
    """
    Start an asynchronous analysis job.
    Returns job ID.
    """
    parsed = parse_remote_url(repo_url, remote_url_policy())
    validated_ref = _validate_ref(ref)
    active_key = hashlib.sha256(
        "\x1f".join([parsed.dedup_key, validated_ref or ""]).encode("utf-8")
    ).hexdigest()
    queued = v3_jobs.enqueue(
        "project_analyze",
        {"repo_url": parsed.url, "ref": validated_ref},
        worker_pool="prism",
        artifact_key=active_key,
        requested_by=requested_by,
        max_attempts=2,
        resources={"prism_worker": 1, "import": 1},
        locks=[{"key": _repository_lock_key(parsed), "mode": "read"}],
    )
    return str(queued["job_id"])


#: Failure reasons the import dialog can offer a guided fix for.
ACCESS_FAILURE_REASONS = frozenset(
    {
        "ssh-key-not-authorized",
        "repository-not-found",
        "credentials-required",
        "host-key-unverified",
    }
)


def get_job_status(job_id: str) -> Optional[dict]:
    """Get the current status of an import or workflow job."""
    v3_job = v3_jobs.get(job_id)
    if v3_job:
        metadata = dict(v3_job.get("result_metadata") or {})
        error_message = v3_job.get("error_message") or None
        return {
            **v3_job,
            **metadata,
            "type": v3_job.get("kind"),
            "error": error_message,
            # Lets the dialog offer the right fix without matching on prose.
            "access_failure": _is_access_failure(error_message),
            "logs": [],
        }
    return workspace.get_job(job_id)


def _is_access_failure(error_message: Optional[str]) -> bool:
    """Whether a failure is one the user can fix by granting Prism access.

    The worker records only the exception's message, so the reason is recovered
    by matching the phrases `git_failures` writes rather than by plumbing a new
    column through the job table for a purely presentational hint.
    """
    if not error_message:
        return False
    text = error_message.casefold()
    return any(
        phrase in text
        for phrase in (
            "refused prism's ssh key",
            "could not be found, or prism has no access",
            "needs credentials that prism does not have",
            "could not verify the ssh host key",
        )
    )


def run_project_analyze_job_v3(context: JobContext) -> JobResult:
    parsed = parse_remote_url(str(context.payload["repo_url"]), remote_url_policy())
    requested_ref = _validate_ref(context.payload.get("ref"))

    context.progress(
        stage="list-branches", message="Listing remote branches", percent=0, force=True
    )
    parsed, branches, default_branch = resolve_remote_access(parsed)
    if requested_ref and branches and requested_ref not in branches:
        raise ValueError(f"Branch '{requested_ref}' does not exist on this remote")
    selected_ref = requested_ref or default_branch

    projects, import_type = _discover_remote_projects(
        context,
        parsed,
        stage="clone-metadata",
        percent_ceiling=85.0,
        ref=requested_ref,
    )

    # An already-imported repository is not an error any more: the dialog uses
    # this to offer the projects that are not registered yet.
    existing_repo = find_existing_repository(parsed)
    imported_paths: list[str] = []
    if existing_repo:
        imported_paths = [
            str(row.get("relative_path") or ".")
            for row in workspace.get_projects_by_repo(str(existing_repo["id"]))
        ]

    result = {
        "repo_name": parsed.repo_name,
        "repo_url": parsed.url,
        "import_type": import_type,
        "branches": branches,
        "default_branch": default_branch,
        "ref": selected_ref,
        "already_imported": bool(existing_repo),
        "imported_paths": imported_paths,
        "projects": [
            {
                "name": project.name,
                "relative_path": project.relative_path,
                "has_schematic": project.has_schematic,
                "has_pcb": project.has_pcb,
                "has_project_file": project.has_project_file,
            }
            for project in projects
        ],
    }
    if not projects:
        # An empty list on its own leaves the dialog with nothing to say. Tell
        # the user what was looked for so they can tell a wrong URL from a
        # wrong branch from a repository that genuinely holds no boards.
        result["empty_reason"] = (
            "No KiCad design files were found on the default branch. Prism looks "
            "for directories containing a .kicad_pro, .kicad_pcb or .kicad_sch "
            "file, ignoring archive, backup and hidden directories."
        )
    print(
        f"Found {len(projects)} project(s); classified repository as {import_type}",
        flush=True,
    )
    return JobResult(message="Analysis complete", details={"result": result})


def classify_import_type(projects: List[DiscoveredProject]) -> str:
    """A single project at the repository root is Type-1; anything else Type-2."""
    if len(projects) == 1 and projects[0].relative_path == ".":
        return "type1"
    return "type2"


def _discover_remote_projects(
    context: JobContext,
    parsed: ParsedRemote,
    *,
    stage: str,
    percent_ceiling: float,
    ref: Optional[str] = None,
) -> tuple[List[DiscoveredProject], str]:
    """Clone just enough of a remote to enumerate the KiCad projects inside it.

    Blobless, single-branch, no-checkout: the tree listing is all that is
    needed, so this stays cheap even against a repository with gigabytes of
    history.
    """
    temp_dir = tempfile.mkdtemp(prefix="kicad_analyze_")
    clone_path = Path(temp_dir) / parsed.repo_name
    context.progress(
        stage=stage,
        message=f"Cloning repository metadata ({ref})" if ref else "Cloning repository metadata",
        percent=0,
        force=True,
    )
    try:
        clone_options = {}
        if ref:
            clone_options["branch"] = ref
        try:
            repo = Repo.clone_from(
                parsed.url,
                str(clone_path),
                depth=1,
                single_branch=True,
                no_checkout=True,
                filter="blob:none",
                progress=V3CloneProgress(context, stage=stage),
                env=git_env(),
                **clone_options,
            )
        except GitAccessError:
            raise
        except Exception as error:
            raise as_access_error(
                error, target=_describe_target(parsed), host=parsed.host
            ) from error
        context.check_cancelled()
        context.progress(
            stage="discover-projects",
            message="Discovering KiCad projects",
            percent=percent_ceiling,
            force=True,
        )
        projects = discover_projects_from_repo(repo)
        return projects, classify_import_type(projects)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def run_project_import_job_v3(context: JobContext) -> JobResult:
    payload = context.payload
    parsed = parse_remote_url(str(payload["repo_url"]), remote_url_policy())
    requested_paths = [str(path) for path in payload.get("selected_paths") or []]
    ref = _validate_ref(payload.get("ref"))
    cloned_in_job = False

    context.progress(
        stage="validate-import",
        message="Validating repository import",
        percent=0,
        force=True,
    )
    if _github_ssh_equivalent(parsed) is not None:
        parsed, _branches, _default_branch = resolve_remote_access(parsed)
    repo_url = parsed.url
    repo_name = parsed.repo_name
    existing_repo = find_existing_repository(parsed)

    # The client's import_type and selected_paths are hints. Re-derive both from
    # the repository itself before choosing a target directory, so a crafted
    # request cannot pick the on-disk layout or escape the checkout with a
    # relative path like "../../etc".
    discovered, import_type = _discover_remote_projects(
        context, parsed, stage="validate-import", percent_ceiling=8.0, ref=ref
    )
    if not discovered:
        raise ValueError(
            f"No KiCad projects found in '{repo_name}'. Prism looks for "
            "directories containing a .kicad_pro, .kicad_pcb or .kicad_sch file."
        )

    # Importing three boards out of twenty used to make the other seventeen
    # unreachable: the repository was registered, and every later import of the
    # same URL failed as a duplicate. Adding to an existing repository is now
    # the normal path, and only the projects not yet registered are imported.
    already_imported: set[str] = set()
    if existing_repo:
        already_imported = {
            str(row.get("relative_path") or ".")
            for row in workspace.get_projects_by_repo(str(existing_repo["id"]))
        }

    discovered_paths = {project.relative_path for project in discovered}
    discovered_names = {project.relative_path: project.name for project in discovered}
    if import_type == "type1":
        requested_paths = ["."]
    unknown = sorted(set(requested_paths) - discovered_paths)
    if unknown:
        raise ValueError(
            "Selected paths are not KiCad projects in this repository: "
            + ", ".join(unknown)
        )
    selected_paths = [path for path in requested_paths if path not in already_imported]
    if not selected_paths:
        if requested_paths and already_imported:
            raise ValueError(
                f"Every selected project is already imported from "
                f"'{existing_repo.get('name') or repo_name}'."
            )
        raise ValueError("No projects selected for import")

    if existing_repo:
        target_path = Path(workspace.repository_clone_path(existing_repo))
        base_path = target_path.parent
    else:
        base_path = Path(project_service.PROJECTS_ROOT) / import_type
        target_path = base_path / repo_name

    try:
        adopted_checkout = False
        if target_path.exists():
            existing_checkout = Repo(str(target_path))
            remotes = set()
            for remote in existing_checkout.remotes:
                try:
                    remotes.add(parse_remote_url(remote.url).dedup_key)
                except Exception:
                    continue
            if parsed.dedup_key not in remotes:
                raise ValueError(
                    f"Existing checkout at {target_path} belongs to a different remote"
                )
            adopted_checkout = True
            print(f"Adopting existing checkout: {target_path}", flush=True)
            derived_assets.purge_legacy_in_tree_thumbnails(
                target_path, existing_checkout
            )

        base_path.mkdir(parents=True, exist_ok=True)
        if not adopted_checkout:
            context.progress(
                stage="clone-repository",
                message="Cloning repository",
                percent=10,
                force=True,
            )
            clone_options = {"branch": ref} if ref else {}
            try:
                Repo.clone_from(
                    repo_url,
                    str(target_path),
                    progress=V3CloneProgress(context, stage="clone-repository"),
                    env=git_env(),
                    **clone_options,
                )
            except GitAccessError:
                raise
            except Exception as error:
                raise as_access_error(
                    error, target=_describe_target(parsed), host=parsed.host
                ) from error
            cloned_in_job = True

        context.check_cancelled()
        context.progress(
            stage="register-projects",
            message="Registering imported projects",
            percent=80,
            force=True,
        )
        if existing_repo:
            repo_id = str(existing_repo["id"])
        else:
            repo_id = workspace.register_repository(
                name=repo_name,
                url=repo_url,
                clone_path_abs=str(target_path),
                import_type="single" if import_type == "type1" else "multi",
            )
        imported_ids: list[str] = []
        if import_type == "type1":
            cached = resolve_cached_paths(str(target_path))
            imported_ids.append(
                workspace.register_project(
                    repo_id=repo_id,
                    name=repo_name,
                    relative_path=".",
                    description=f"Project {repo_name}",
                    **cached,
                )
            )
        else:
            checkout_root = target_path.resolve()
            for index, relative_path in enumerate(selected_paths):
                context.check_cancelled()
                full_project_path = target_path / relative_path
                # Paths are already validated against discovery; this keeps the
                # guarantee local to the place that does the filesystem write.
                if not full_project_path.resolve().is_relative_to(checkout_root):
                    raise ValueError(f"Project path escapes the checkout: {relative_path}")
                # Discovery already worked out the board name, including for
                # directories whose .kicad_pro is gitignored.
                board_name = discovered_names.get(
                    relative_path, os.path.basename(relative_path)
                )
                cached = resolve_cached_paths(str(full_project_path))
                imported_ids.append(
                    workspace.register_project(
                        repo_id=repo_id,
                        name=board_name,
                        relative_path=relative_path,
                        description=f"{repo_name} / {board_name}",
                        **cached,
                    )
                )
                context.progress(
                    stage="register-projects",
                    message=f"Registered {index + 1} of {len(selected_paths)} projects",
                    percent=80 + (15 * (index + 1) / len(selected_paths)),
                )
        # Render boards in their own jobs. The projects are registered and
        # browsable now; thumbnails fill in as each render finishes, rather than
        # holding the import open for two minutes per board.
        context.progress(
            stage="queue-thumbnails",
            message="Queueing board renders",
            percent=97,
            force=True,
        )
        thumbnail_job_ids: list[str] = []
        for imported_id in imported_ids:
            try:
                job_id = start_thumbnail_job(imported_id, requested_by="project-import")
            except Exception as error:
                # A thumbnail is cosmetic; failing to queue one must not undo an
                # otherwise complete import.
                print(f"Could not queue thumbnail for {imported_id}: {error}", flush=True)
                continue
            if job_id:
                thumbnail_job_ids.append(job_id)

        return JobResult(
            message=f"Imported {len(imported_ids)} project(s)",
            details={
                "project_ids": imported_ids,
                "repo_id": repo_id,
                "repo_url": repo_url,
                "import_type": import_type,
                "thumbnail_job_ids": thumbnail_job_ids,
            },
        )
    except Exception:
        if cloned_in_job:
            shutil.rmtree(target_path, ignore_errors=True)
        raise


def start_thumbnail_job(project_id: str, *, requested_by: str = "") -> Optional[str]:
    """Queue a board render for one project.

    Rendering used to happen inline inside the import job: one `kicad-cli`
    invocation per project, sequentially, each with a two minute timeout, while
    the job held an import slot and its progress sat at 80%. Importing a twenty
    board monorepo could therefore occupy a worker for the better part of an
    hour with nothing to show for it. One job per project renders them
    independently, and the project appears in the workspace immediately.
    """
    row = workspace.get_project_by_id(project_id)
    if not row:
        return None
    repository_id = str(row.get("repo_id") or "")
    queued = v3_jobs.enqueue(
        "project_thumbnail",
        {"project_id": project_id},
        worker_pool="prism",
        artifact_key=hashlib.sha256(f"thumbnail:{project_id}".encode("utf-8")).hexdigest(),
        project_id=project_id,
        repository_id=repository_id or None,
        requested_by=requested_by,
        max_attempts=2,
        resources={"prism_worker": 1},
        # A read lock on the repository, so a render cannot observe the checkout
        # halfway through a sync fast-forward.
        locks=(
            [{"key": f"repository:{repository_id}", "mode": "read"}]
            if repository_id
            else []
        ),
    )
    return str(queued["job_id"])


def start_thumbnail_jobs(
    project_ids: Sequence[str],
    *,
    requested_by: str = "",
) -> list[str]:
    """Queue fresh board renders for a validated set of projects.

    Validate the complete selection before enqueueing anything so a stale
    visible-result selection cannot produce a confusing partial bulk action.
    Individual jobs remain independently deduplicated and independently
    reportable to the worker queue.
    """
    normalized_ids = list(
        dict.fromkeys(
            project_id.strip()
            for project_id in project_ids
            if project_id and project_id.strip()
        )
    )
    if not normalized_ids:
        raise ValueError("At least one project is required")

    missing_ids = [
        project_id
        for project_id in normalized_ids
        if not workspace.get_project_by_id(project_id)
    ]
    if missing_ids:
        noun = "Project" if len(missing_ids) == 1 else "Projects"
        raise ValueError(f"{noun} not found: {', '.join(missing_ids)}")

    job_ids: list[str] = []
    for project_id in normalized_ids:
        job_id = start_thumbnail_job(project_id, requested_by=requested_by)
        if not job_id:
            raise ValueError(f"Project not found: {project_id}")
        job_ids.append(job_id)
    return job_ids


def run_project_thumbnail_job_v3(context: JobContext) -> JobResult:
    project_id = str(context.payload["project_id"])
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    project_path = str(row.get("path") or "")
    if not project_path or not os.path.isdir(project_path):
        raise ValueError(f"Project path not found: {project_path}")

    context.progress(
        stage="render-thumbnail",
        message="Rendering board thumbnail",
        percent=10,
        force=True,
    )
    logs: list[str] = []
    rendered = generate_thumbnail_for_project(project_path, logs)
    for line in logs:
        print(line, flush=True)
    context.check_cancelled()

    # ``generate_thumbnail_for_project`` reports every renderer/encoder
    # failure as ``False`` so callers that merely refresh a project can remain
    # best-effort.  A thumbnail *job* has a stronger contract: returning a
    # JobResult marks it completed.  Surface the captured renderer diagnostic
    # as an exception instead of recording a failed kicad-cli invocation as a
    # successful job.
    no_board = any(
        line.startswith("No .kicad_pcb file found")
        for line in logs
    )
    if not rendered and not no_board:
        detail = logs[-1] if logs else "Thumbnail renderer did not produce an image"
        raise RuntimeError(detail)

    context.progress(
        stage="record-thumbnail", message="Recording thumbnail", percent=90, force=True
    )
    # The render is stored either way; refresh_project_assets decides whether it
    # becomes the visible thumbnail, so a user's uploaded image stays in place
    # and is simply backed by a current render if they ever revert.
    refresh_project_assets(project_id)
    return JobResult(
        message="Thumbnail rendered" if rendered else "No board to render",
        details={"project_id": project_id, "rendered": rendered},
    )


def start_sync_job(project_id: str, *, requested_by: str = "") -> str:
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    repository_id = str(row.get("repo_id") or "")
    active_key = hashlib.sha256(f"sync:{project_id}".encode("utf-8")).hexdigest()
    queued = v3_jobs.enqueue(
        "project_sync",
        {"project_id": project_id},
        worker_pool="prism",
        artifact_key=active_key,
        project_id=project_id,
        repository_id=repository_id or None,
        requested_by=requested_by,
        max_attempts=2,
        resources={"prism_worker": 1, "import": 1},
        locks=(
            [{"key": f"repository:{repository_id}", "mode": "write"}]
            if repository_id
            else [{"key": f"project:{project_id}", "mode": "write"}]
        ),
    )
    return str(queued["job_id"])


def run_project_sync_job_v3(context: JobContext) -> JobResult:
    project_id = str(context.payload["project_id"])
    context.progress(
        stage="fetch",
        message="Fetching repository updates",
        percent=5,
        force=True,
    )
    result = sync_project(project_id)
    context.check_cancelled()
    if result.get("status") == "error":
        raise RuntimeError(str(result.get("message") or "Project sync failed"))
    from app.services import file_service

    file_service.invalidate_file_listing_cache()
    # Re-render in its own job: a `kicad-cli` render can take two minutes, and
    # sync holds a write lock on the whole repository while it runs.
    try:
        start_thumbnail_job(project_id, requested_by="project-sync")
    except Exception as error:
        print(f"Could not queue thumbnail refresh for {project_id}: {error}", flush=True)
    return JobResult(
        message=str(result.get("message") or "Sync completed"),
        details=dict(result),
    )


def sync_project(project_id: str) -> dict:
    """
    Sync a project with its remote repository.
    For Type-1: syncs the project repo.
    For Type-2: syncs the parent repo.

    Prism's checkout is a read-only mirror of the remote. Sync fetches every ref
    and fast-forwards the current branch; it never merges, never rebases and
    never commits, so the checkout cannot diverge from what the team pushed.
    """
    row = workspace.get_project_by_id(project_id)
    if not row:
        return {"status": "error", "message": "Project not found"}

    import_type = row.get('import_type') or 'single'
    sync_path = row.get('parent_repo_path') if import_type == 'multi' else row.get('path')

    if not sync_path or not os.path.exists(sync_path):
        return {"status": "error", "message": f"Project path not found: {sync_path}"}

    try:
        repo = Repo(sync_path)
        origin = repo.remote('origin')

        # Sync must reach the remote on the same terms as the clone that created
        # this checkout. Building the environment here meant it kept an
        # `accept-new` host key policy after import moved to pinned keys, so an
        # operator who deliberately pinned a host was still exposed on every
        # sync -- and sync is the operation that runs unattended, repeatedly,
        # for the life of the project.
        env = git_env()

        # Clear out thumbnails an older Prism wrote into the tree, so a checkout
        # carrying them can still fast-forward.
        derived_assets.purge_legacy_in_tree_thumbnails(sync_path, repo)

        # Prune so branches deleted upstream stop showing up in the branch list,
        # and fetch all refs rather than only the checked-out branch, so design
        # comparison can reach any branch without a second network round trip.
        fetch_info = origin.fetch(env=env, prune=True)

        if repo.head.is_detached:
            message = "Fetched refs; checkout is on a detached HEAD so nothing was advanced"
        elif repo.is_dirty(untracked_files=False):
            # Prism never writes into the tree, so a dirty checkout means someone
            # edited it directly. Report rather than clobber their work.
            message = "Fetched refs; local changes in the checkout block a fast-forward"
        else:
            branch = repo.active_branch
            tracking = branch.tracking_branch()
            if tracking is None:
                message = f"Fetched refs; '{branch.name}' has no upstream to fast-forward from"
            else:
                repo.git.merge("--ff-only", tracking.name)
                message = f"Synced {len(fetch_info)} ref(s)"

        # Refresh cached paths after sync
        path_config_service.clear_config_cache()
        project_path = row.get('path', '')
        if project_path and os.path.isdir(project_path):
            refresh_project_assets(project_id)

        # Update repo last_synced_at
        workspace.update_repository_synced(row.get('repo_id', ''))

        return {
            "status": "success",
            "message": message,
            "path": sync_path
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}
