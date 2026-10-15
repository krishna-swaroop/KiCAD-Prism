"""
Project Import Service for KiCAD Prism

Handles Type-1 (single project) and Type-2 (multiple projects) imports.
"""
import os
import hashlib
import mimetypes
import shutil
import tempfile
from pathlib import Path
from functools import wraps
from typing import Callable, List, Optional, Sequence
from dataclasses import dataclass
from git import Repo, RemoteProgress
from app.services import derived_assets, git_remote_access, project_revision, project_service, path_config_service
from app.services.git_failures import GitAccessError, as_access_error
from app.services.git_remote_url import ParsedRemote, RemoteUrlPolicy, parse_remote_url
from app.services.job_runtime import JobContext, JobResult, PermanentJobError
from app.services.job_kinds import JobKind, JobSubject, repository_lock, subject_lock
from app.services.kicad_tools import kicad_cli
from app.services.project_import_followups import (
    retry_import_follow_ups,
    schedule_import_follow_ups,
)
from app.services.project_import_plan import (
    ProjectImportPlan,
    build_project_import_plan,
)
from app.services.workspace_service import workspace


# Separates a directory from the project file inside it. A directory may hold
# several KiCad projects, so the directory alone cannot name one.
PROJECT_KEY_SEPARATOR = "::"


def make_project_key(relative_path: str, project_file: str) -> str:
    """The stable identifier for one project inside a repository.

    Prism used to identify a project by its directory. That silently merged the
    two projects of a repository that keeps, say, a fixture's top and base plate
    side by side in the root: one checkbox ticked both, one of the two was
    registered, and it was named after one board while the viewer rendered the
    other. Naming the project file as well keeps them apart.

    Projects registered before the anchor existed have no project file recorded;
    their key stays the bare directory, which is what it has always been.
    """
    if not project_file:
        return relative_path
    return f"{relative_path}{PROJECT_KEY_SEPARATOR}{project_file}"


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
    # The project's own file within ``relative_path``: its ``.kicad_pro``, or the
    # board/schematic KiCad would regenerate one from. This is what tells two
    # projects in the same directory apart.
    project_file: str = ""

    @property
    def project_key(self) -> str:
        return make_project_key(self.relative_path, self.project_file)


def find_existing_repository(parsed: ParsedRemote) -> Optional[dict]:
    """Find an already-imported repository that resolves to the same remote.

    Compares canonical identities rather than URL strings, so importing
    ``git@github.com:org/repo.git`` after ``https://github.com/org/repo`` is
    recognised as the same repository instead of cloning it twice.

    A stored URL is read under this deployment's policy, not the default one.
    An operator running an internal Git server without TLS enables
    ``IMPORT_ALLOW_INSECURE_HTTP`` to import from it; reading its own rows back
    under a policy that rejects ``http://`` made those repositories fail to
    canonicalize, leaving deduplication to an exact string comparison that a
    trailing ``.git`` or a change of case defeats.
    """
    policy = git_remote_access.remote_url_policy()
    target = parsed.dedup_key
    for repository in workspace.get_repositories():
        stored = str(repository.get("url") or "")
        if not stored:
            continue
        try:
            if parse_remote_url(stored, policy).dedup_key == target:
                return repository
        except Exception:
            # A row predating URL validation should not block a valid import.
            if stored.strip() == parsed.url:
                return repository
    return None


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
                stem = Path(pro_file).stem
                # With several projects in one directory, the subtree answer
                # above ("does anything here have a board?") is about the
                # directory, not about this project. Ask per project file.
                if len(pro_files) > 1:
                    project_has_sch = f"{stem}.kicad_sch" in filenames
                    project_has_pcb = f"{stem}.kicad_pcb" in filenames
                else:
                    project_has_sch = has_sch
                    project_has_pcb = has_pcb
                projects.append(DiscoveredProject(
                    name=stem,
                    relative_path=relative_path,
                    full_path="", # No checkout path
                    has_schematic=project_has_sch,
                    has_pcb=project_has_pcb,
                    has_project_file=True,
                    project_file=pro_file,
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
            project_file=anchor,
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


def resolve_cached_paths(
    project_path: str,
    *,
    current_source: Optional[str] = None,
    anchor: Optional[str] = None,
) -> dict:
    """Resolve and return cached path info for a project directory.

    ``current_source`` is the project's recorded ``thumbnail_source``, so a
    thumbnail the user chose deliberately survives a re-scan. ``anchor`` is the
    project's own file, needed when the directory holds more than one project.
    """
    try:
        resolved = path_config_service.resolve_paths(project_path, anchor=anchor)
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
            uploaded = derived_assets.find_thumbnail(
                project_path, kind="custom", anchor=anchor
            )
            if uploaded is not None:
                thumbnail_file = uploaded
                thumb_rel = uploaded.name
                thumbnail_source = "custom"

        if thumbnail_file is None:
            generated = derived_assets.find_thumbnail(project_path, anchor=anchor)
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
            'project_file_rel': anchor or '',
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


def infer_project_anchor(project_path: str) -> str:
    """Guess a project's own file for a row registered before anchors existed.

    Only answers when the guess cannot be wrong: a directory holding exactly one
    ``.kicad_pro`` has exactly one project, which is every project Prism has
    registered so far that still works. A directory with several is the case
    this whole mechanism exists for, and it must be re-imported rather than
    guessed at.
    """
    try:
        pro_files = sorted(
            name for name in os.listdir(project_path) if name.endswith(".kicad_pro")
        )
    except OSError:
        return ""
    return pro_files[0] if len(pro_files) == 1 else ""


def find_legacy_row_to_adopt(
    rows: list[dict], relative_path: str, name: str
) -> Optional[dict]:
    """A pre-anchor project row this import should take over rather than duplicate.

    An install predating anchors has one row per directory with an empty
    ``project_file_rel``. Re-importing a directory that turns out to hold two
    projects discovers both, neither matches that row's key, and both would
    register as new -- leaving the old row, whose name came from one board
    while it rendered another, registered alongside them.

    Discovery has always named a project after its ``.kicad_pro`` stem, so the
    row's name identifies which project it is exactly rather than by guess.
    Taking it over keeps whatever is attached to that project id -- comments,
    releases, history -- and makes it consistent with the board it renders.
    Anything less than an exact, unique match is left alone: a duplicate row is
    recoverable, silently rebinding a project's history to the wrong board is
    not.
    """
    candidates = [
        row
        for row in rows
        if str(row.get("relative_path") or ".") == relative_path
        and not str(row.get("project_file_rel") or "").strip()
        and str(row.get("name") or "") == name
    ]
    return candidates[0] if len(candidates) == 1 else None


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
    anchor = str(row.get("project_file_rel") or "") or infer_project_anchor(project_path)
    cached = resolve_cached_paths(
        project_path,
        current_source=str(row.get("thumbnail_source") or "") or None,
        anchor=anchor,
    )
    if cached:
        workspace.update_project(project_id, **cached)
    return cached


def generate_thumbnail_for_project(
    project_path: str,
    logs_list: Optional[List[str]] = None,
    anchor: Optional[str] = None,
) -> bool:
    """
    Find the main .kicad_pcb file and run kicad-cli pcb render to generate a thumbnail.
    """
    try:
        from PIL import Image

        resolved = path_config_service.resolve_paths(project_path, anchor=anchor)
        pcb_file = resolved.pcb
        if not pcb_file or not os.path.exists(pcb_file):
            if logs_list is not None:
                logs_list.append(f"No .kicad_pcb file found to generate thumbnail for {project_path}")
            return False
        
        cli = kicad_cli()
        if logs_list is not None:
            logs_list.append(
                f"Generating thumbnail using {cli.executable()} for PCB: {pcb_file}"
            )

        # Render into a scratch directory outside the checkout. Nothing this
        # function does may leave a file inside the user's working tree.
        staging_dir = derived_assets.thumbnail_dir(project_path, anchor)
        staging_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=staging_dir,
            prefix=".thumbnail-render-",
            suffix=".png",
            delete=False,
        ) as temporary_render:
            render_path = Path(temporary_render.name)


        cmd = [
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
        
        result = cli.run(cmd, timeout=120)

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
                project_path, webp_path, anchor=anchor
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
    parsed = parse_remote_url(repo_url, git_remote_access.remote_url_policy())
    validated_ref = _validate_ref(ref)
    paths = sorted(selected_paths or [])
    active_key = hashlib.sha256(
        "\x1f".join(
            [parsed.dedup_key, import_type, validated_ref or "", *paths]
        ).encode("utf-8")
    ).hexdigest()
    queued = PROJECT_IMPORT.enqueue(
        {
            "repo_url": parsed.url,
            "import_type": import_type,
            "selected_paths": list(selected_paths or []),
            "ref": validated_ref,
        },
        subject=JobSubject(lock_key=_repository_lock_key(parsed)),
        artifact_key=active_key,
        requested_by=requested_by,
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
    parsed = parse_remote_url(repo_url, git_remote_access.remote_url_policy())
    validated_ref = _validate_ref(ref)
    active_key = hashlib.sha256(
        "\x1f".join([parsed.dedup_key, validated_ref or ""]).encode("utf-8")
    ).hexdigest()
    queued = PROJECT_ANALYZE.enqueue(
        {"repo_url": parsed.url, "ref": validated_ref},
        subject=JobSubject(lock_key=_repository_lock_key(parsed)),
        artifact_key=active_key,
        requested_by=requested_by,
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


def _is_access_failure(error_message: Optional[str]) -> bool:
    """Whether a failure is one the user can fix by granting Prism access,
    matched on the phrases `git_failures` writes into the message."""
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


#: Job error code for a failure the import dialog can offer a guided fix for.
GIT_ACCESS_ERROR_CODE = "git_access"


def _classify_access_failure(handler: Callable[[JobContext], JobResult]) -> Callable[[JobContext], JobResult]:
    """Fail access failures with GIT_ACCESS_ERROR_CODE so status readers need not parse prose."""
    @wraps(handler)
    def run(context: JobContext) -> JobResult:
        try:
            return handler(context)
        except Exception as error:
            if isinstance(error, PermanentJobError) or not _is_access_failure(str(error)):
                raise
            raise PermanentJobError(str(error), code=GIT_ACCESS_ERROR_CODE) from error

    return run


@_classify_access_failure
def run_project_analyze_job_v3(context: JobContext) -> JobResult:
    parsed = parse_remote_url(str(context.payload["repo_url"]), git_remote_access.remote_url_policy())
    requested_ref = _validate_ref(context.payload.get("ref"))

    context.progress(
        stage="list-branches", message="Listing remote branches", percent=0, force=True
    )
    parsed, branches, default_branch = git_remote_access.resolve_remote_access(parsed)
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
        rows = workspace.get_projects_by_repo(str(existing_repo["id"]))
        # Both spellings: the key a project registered today reports, and the
        # bare directory a project registered before anchors existed reports.
        # The dialog matches on either, so an older project still shows as
        # imported without hiding a sibling that shares its directory.
        imported_paths = list(
            dict.fromkeys(
                make_project_key(
                    str(row.get("relative_path") or "."),
                    str(row.get("project_file_rel") or ""),
                )
                for row in rows
            )
        )

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
                "project_key": project.project_key,
                "project_file": project.project_file,
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
                env=git_remote_access.git_env(),
                **clone_options,
            )
        except GitAccessError:
            raise
        except Exception as error:
            raise as_access_error(
                error, target=git_remote_access.describe_target(parsed), host=parsed.host
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


def _register_planned_projects(
    plan: ProjectImportPlan,
    target_path: Path,
    repo_id: str,
    context: JobContext,
) -> list[str]:
    """Register only the projects named by the plan."""

    checkout_root = target_path.resolve()
    imported_ids: list[str] = []
    total = len(plan.selected)
    for index, project in enumerate(plan.selected):
        context.check_cancelled()
        if plan.import_type == "type1":
            project_root = target_path
            description = f"Project {plan.repo_name}"
        else:
            project_root = target_path / project.relative_path
            if not project_root.resolve().is_relative_to(checkout_root):
                raise ValueError(
                    f"Project path escapes the checkout: {project.relative_path}"
                )
            description = f"{plan.repo_name} / {project.name}"
        cached = resolve_cached_paths(str(project_root), anchor=project.project_file)
        if project.adopt_project_id:
            workspace.update_project(project.adopt_project_id, **cached)
            imported_ids.append(project.adopt_project_id)
        else:
            imported_ids.append(
                workspace.register_project(
                    repo_id=repo_id,
                    name=project.name,
                    relative_path=project.register_relative_path,
                    description=description,
                    **cached,
                )
            )
        context.progress(
            stage="register-projects",
            message=f"Registered {index + 1} of {total} projects",
            percent=80 + (15 * (index + 1) / total) if total else 80,
        )
    return imported_ids


@_classify_access_failure
def run_project_import_job_v3(context: JobContext) -> JobResult:
    payload = context.payload
    parsed = parse_remote_url(str(payload["repo_url"]), git_remote_access.remote_url_policy())
    requested_paths = [str(path) for path in payload.get("selected_paths") or []]
    ref = _validate_ref(payload.get("ref"))
    cloned_in_job = False

    context.progress(
        stage="validate-import",
        message="Validating repository import",
        percent=0,
        force=True,
    )
    if git_remote_access._github_ssh_equivalent(parsed) is not None:
        parsed, _branches, _default_branch = git_remote_access.resolve_remote_access(parsed)
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

    already_imported: set[str] = set()
    existing_rows: list[dict] = []
    existing_checkout_path = None
    if existing_repo:
        existing_rows = list(workspace.get_projects_by_repo(str(existing_repo["id"])))
        already_imported = {
            make_project_key(
                str(row.get("relative_path") or "."),
                str(row.get("project_file_rel") or ""),
            )
            for row in existing_rows
        }
        existing_checkout_path = workspace.repository_clone_path(existing_repo)

    plan = build_project_import_plan(
        repo_url=repo_url,
        repo_name=repo_name,
        import_type=import_type,
        discovered=discovered,
        requested_paths=requested_paths,
        already_imported=already_imported,
        existing_repo=existing_repo,
        existing_rows=existing_rows,
        projects_root=str(project_service.PROJECTS_ROOT),
        existing_checkout_path=existing_checkout_path,
    )
    target_path = Path(plan.target_path)
    base_path = target_path.parent

    try:
        adopted_checkout = False
        if target_path.exists():
            existing_checkout = Repo(str(target_path))
            # Under this deployment's policy, for the same reason as
            # `find_existing_repository`: the default policy rejects `http://`,
            # so on a workspace configured for a plaintext internal Git server
            # every remote here raised and was dropped, and the checkout Prism
            # had just cloned itself was reported as belonging to someone else.
            policy = git_remote_access.remote_url_policy()
            remotes = set()
            for remote in existing_checkout.remotes:
                try:
                    remotes.add(parse_remote_url(remote.url, policy).dedup_key)
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
                    env=git_remote_access.git_env(),
                    **clone_options,
                )
            except GitAccessError:
                raise
            except Exception as error:
                raise as_access_error(
                    error, target=git_remote_access.describe_target(parsed), host=parsed.host
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
        imported_ids = _register_planned_projects(plan, target_path, repo_id, context)
        # Render boards in their own jobs. The projects are registered and
        # browsable now; thumbnails fill in as each render finishes, rather than
        # holding the import open for two minutes per board.
        context.progress(
            stage="queue-thumbnails",
            message="Queueing board renders",
            percent=97,
            force=True,
        )
        follow_ups = schedule_import_follow_ups(
            imported_ids, requested_by="project-import"
        )
        thumbnail_job_ids = [
            str(item["job_id"])
            for item in follow_ups
            if item.get("operation") == "thumbnail" and item.get("job_id")
        ]

        return JobResult(
            message=f"Imported {len(imported_ids)} project(s)",
            details={
                "project_ids": imported_ids,
                "repo_id": repo_id,
                "repo_url": repo_url,
                "import_type": import_type,
                "thumbnail_job_ids": thumbnail_job_ids,
                "follow_ups": follow_ups,
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
    queued = PROJECT_THUMBNAIL.enqueue(
        {"project_id": project_id},
        subject=JobSubject.of_project(row, project_id),
        artifact_key=hashlib.sha256(f"thumbnail:{project_id}".encode("utf-8")).hexdigest(),
        requested_by=requested_by,
    )
    return str(queued["job_id"])


def start_board_bundle_job(project_id: str, *, requested_by: str = "") -> Optional[str]:
    """Queue board.prism for the project's current revision (the 3D job builds it).

    Import and sync build it so the 3D tab and Simulation Studio never wait on a
    first visit. A revision already built is a no-op: its artifact key is taken.
    """
    from app.services import project_service

    try:
        return project_service.start_workflow_job(project_id, "webgpu_3d", author=requested_by or "prism")
    except Exception as error:
        print(f"Could not queue board.prism for {project_id}: {error}", flush=True)
        return None


def start_project_metadata_job(project_id: str, *, requested_by: str = "") -> Optional[str]:
    """Queue a metadata refresh for one project.

    Separate from the thumbnail job even though both shell out to kicad-cli:
    a thumbnail is cosmetic and may be replaced by an upload, while this is the
    data the project card reads. Keeping them apart means a render failure does
    not take the card's size and title block with it.
    """
    row = workspace.get_project_by_id(project_id)
    if not row:
        return None
    queued = PROJECT_METADATA.enqueue(
        {"project_id": project_id},
        subject=JobSubject.of_project(row, project_id),
        artifact_key=hashlib.sha256(f"metadata:{project_id}".encode("utf-8")).hexdigest(),
        requested_by=requested_by,
    )
    return str(queued["job_id"])


def run_project_metadata_job_v3(context: JobContext) -> JobResult:
    from app.services import project_metadata_service

    project_id = str(context.payload["project_id"])
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    project_path = str(row.get("path") or "")
    if not project_path or not os.path.isdir(project_path):
        raise ValueError(f"Project path not found: {project_path}")
    anchor = str(row.get("project_file_rel") or "") or infer_project_anchor(project_path)

    context.progress(
        stage="read-metadata",
        message="Reading project metadata",
        percent=10,
        force=True,
    )
    schematic_path = project_service.find_schematic_file(project_path, anchor)
    pcb_path = project_service.find_pcb_file(project_path, anchor)
    try:
        location = project_revision.locate(row)
        repo_path, relative_path = str(location.repo_root), location.sub_path
    except project_revision.ProjectNotInRepository:
        repo_path, relative_path = project_path, None
    context.check_cancelled()

    computed = project_metadata_service.refresh_project_metadata(
        project_id,
        project_path,
        schematic_path,
        pcb_path,
        repo_path=repo_path,
        relative_path=relative_path, anchor=anchor,
    )
    pcb = computed.get("pcb") or {}
    return JobResult(
        message="Project metadata updated",
        details={
            "project_id": project_id,
            "has_schematic": computed.get("schematic") is not None,
            "has_pcb": computed.get("pcb") is not None,
            # Recorded so a card with no size on it can be told apart from a
            # board that genuinely has no outline.
            "board_stats_source": computed.get("board_stats_source") or "unavailable",
            "dimensions_mm": pcb.get("dimensions_mm"),
            # A push that did not touch the design skips the kicad-cli pass.
            "reused_file_metadata": bool(computed.get("reused_file_metadata")),
        },
    )


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
    anchor = str(row.get("project_file_rel") or "") or infer_project_anchor(project_path)

    context.progress(
        stage="render-thumbnail",
        message="Rendering board thumbnail",
        percent=10,
        force=True,
    )
    logs: list[str] = []
    rendered = generate_thumbnail_for_project(project_path, logs, anchor=anchor)
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


def start_sync_job(project_id: str, *, requested_by: str = "", fetch_only: bool = False) -> str:
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")
    mode = "fetch" if fetch_only else "sync"
    active_key = hashlib.sha256(f"{mode}:{project_id}".encode("utf-8")).hexdigest()
    queued = PROJECT_SYNC.enqueue(
        {"project_id": project_id, "fetch_only": fetch_only},
        subject=JobSubject.of_project(row, project_id),
        artifact_key=active_key,
        requested_by=requested_by,
        # A background fetch yields to work someone asked for.
        priority=200 if fetch_only else None,
    )
    return str(queued["job_id"])


def run_project_sync_job_v3(context: JobContext) -> JobResult:
    project_id = str(context.payload["project_id"])
    fetch_only = bool(context.payload.get("fetch_only", False))
    context.progress(
        stage="fetch",
        message="Fetching repository updates",
        percent=5,
        force=True,
    )
    result = sync_project(project_id, fetch_only=fetch_only)
    context.check_cancelled()
    if result.get("status") == "error":
        raise RuntimeError(str(result.get("message") or "Project sync failed"))
    from app.services import file_service
    from app.services.systems.detection import project_synced

    # A fetch that moved no ref changed nothing a listing or a tracked system reads.
    if not fetch_only or result.get("refs_changed", True):
        file_service.invalidate_file_listing_cache()
        project_synced(project_id)  # System Builder: a fetch may have moved a branch some system tracks
    if fetch_only:
        return JobResult(message=str(result.get("message") or "Fetched remote refs"), details=dict(result))
    # Re-render in its own job: a `kicad-cli` render can take two minutes, and
    # sync holds a write lock on the whole repository while it runs.
    try:
        start_thumbnail_job(project_id, requested_by="project-sync")
    except Exception as error:
        print(f"Could not queue thumbnail refresh for {project_id}: {error}", flush=True)
    # A sync is the one event that can change what the files say about
    # themselves, so it is the event that has to refresh the stored metadata.
    try:
        start_project_metadata_job(project_id, requested_by="project-sync")
    except Exception as error:
        print(f"Could not queue metadata refresh for {project_id}: {error}", flush=True)
    start_board_bundle_job(project_id, requested_by="project-sync")
    return JobResult(
        message=str(result.get("message") or "Sync completed"),
        details=dict(result),
    )


def _ref_tips(repo: Repo) -> dict[str, str]:
    """Every ref and the object it names, to tell whether a fetch moved anything."""

    output = repo.git.for_each_ref("--format=%(objectname) %(refname)")
    return dict(reversed(line.split(" ", 1)) for line in output.splitlines() if " " in line)


def sync_project(project_id: str, *, fetch_only: bool = False) -> dict:
    """
    Sync a project with its remote repository.
    For Type-1: syncs the project repo.
    For Type-2: syncs the parent repo.

    Fetch every ref. Manual Sync fast-forwards the checked-out branch when safe;
    background refresh only updates remote-tracking refs. Neither mode rebases
    or creates commits in the server-managed checkout.
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

        # Reuse the clone's pinned-host-key and noninteractive Git policy.
        env = git_remote_access.git_env()

        if not fetch_only:
            derived_assets.purge_legacy_in_tree_thumbnails(sync_path, repo)

        # Fetch all refs for branch viewing and prune deleted branches.
        refs_before = _ref_tips(repo)
        fetch_info = origin.fetch(env=env, prune=True)
        refs_changed = _ref_tips(repo) != refs_before

        if fetch_only:
            message = f"Fetched {len(fetch_info)} ref(s)"
        elif repo.head.is_detached:
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

        if not fetch_only:
            path_config_service.clear_config_cache()
            project_path = row.get('path', '')
            if project_path and os.path.isdir(project_path):
                refresh_project_assets(project_id)

        workspace.update_repository_synced(row.get('repo_id', ''))

        return {
            "status": "success",
            "message": message,
            "path": sync_path,
            "refs_changed": refs_changed,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


PROJECT_ANALYZE = JobKind(
    "project_analyze",
    run_project_analyze_job_v3,
    resources={"prism_worker": 1, "import": 1},
    lock=subject_lock("read"),
    max_attempts=2,
)
PROJECT_IMPORT = JobKind(
    "project_import",
    run_project_import_job_v3,
    resources={"prism_worker": 1, "import": 1},
    lock=subject_lock("write"),
    max_attempts=1,
)
PROJECT_SYNC = JobKind(
    "project_sync",
    run_project_sync_job_v3,
    resources={"prism_worker": 1, "import": 1},
    lock=repository_lock("write"),
    max_attempts=2,
)
# Thumbnail and metadata read the checkout with kicad-cli; the read lock keeps
# them from seeing it halfway through a sync fast-forward.
PROJECT_THUMBNAIL = JobKind(
    "project_thumbnail",
    run_project_thumbnail_job_v3,
    lock=repository_lock("read", project_fallback=False),
    max_attempts=2,
)
PROJECT_METADATA = JobKind(
    "project_metadata",
    run_project_metadata_job_v3,
    lock=repository_lock("read", project_fallback=False),
    max_attempts=2,
)
JOB_KINDS = (PROJECT_ANALYZE, PROJECT_IMPORT, PROJECT_SYNC, PROJECT_THUMBNAIL, PROJECT_METADATA)
