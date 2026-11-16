"""A project's files at one revision.

Every reader of "this project's KiCad inputs at commit X" goes through here:
the semantic index and visualizer, design comparison, the variant catalog
snapshot, System Builder's STEP export, Release Studio's closure, and the
project routes that read a file at a commit.

The module owns four decisions that used to be made separately (and drift):

* **Location.** Where the project sits in its repository. A workspace row, a
  ``Project`` model and a bare object with a ``path`` all locate the same way:
  the recorded clone (``parent_repo_path``) is the repository root when it is
  known, otherwise Git is asked (``rev-parse --show-toplevel``). The project's
  directory inside the repository is derived from those two paths, never read
  from a vocabulary field (``sub_path``/``relative_path``/``type2_subproject``)
  that only some callers carry.
* **Commit resolution.** A ref resolves to a full commit id or raises
  ``RevisionNotFound``.
* **Source sets.** Which files are a revision's design sources and which are
  generated noise (``is_generated``), and which of them a checkout, a cache key
  or a file list contains (``FULL_TREE``, ``KICAD_SOURCES``, ``COMPARE_INPUTS``,
  ``SEMANTIC_SOURCES``).
* **Materialization.** Files are read from Git objects (``ls-tree`` and one
  ``cat-file --batch``), never through ``git archive``: ``.gitattributes``
  ``export-ignore``/``export-subst`` must not change what KiCad sees. Regular
  blobs keep their executable bit; submodules are skipped; a symlink is kept
  only when it resolves inside the materialized tree, so nothing a tool follows
  can read outside the checkout.

The Git transport to remotes (credentials, host keys) is a separate adapter,
``git_remote_access``; everything here reads a local clone.
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Iterator, Mapping, Optional

from app.services import kicad_noise_service, path_config_service


class ProjectNotInRepository(ValueError):
    """The project has no checkout, or its checkout is not inside a Git repository."""


class RevisionNotFound(ValueError):
    """A ref that does not name a commit in the project's repository."""


@dataclass(frozen=True)
class ProjectLocation:
    """Where a project sits in its repository."""

    repo_root: Path
    #: The project directory inside the repository, POSIX, ``""`` at the root.
    relative_path: str
    #: The project's own file (``.kicad_pro``, or a board/schematic), if recorded.
    anchor: Optional[str] = None

    @property
    def checkout(self) -> Path:
        """The project's directory in the working tree."""
        return self.repo_root / self.relative_path if self.relative_path else self.repo_root

    @property
    def sub_path(self) -> Optional[str]:
        """``relative_path`` with ``None`` for a repository-root project."""
        return self.relative_path or None

    def repo_path(self, project_path: str) -> str:
        """A project-relative POSIX path as a repository-relative one."""
        normalized = PurePosixPath(str(project_path).replace("\\", "/"))
        if normalized.is_absolute() or ".." in normalized.parts:
            raise ValueError(f"Invalid project path: {project_path}")
        joined = PurePosixPath(self.relative_path) / normalized if self.relative_path else normalized
        text = joined.as_posix()
        return "" if text == "." else text


def _field(project: Any, name: str) -> Any:
    if isinstance(project, Mapping):
        return project.get(name)
    return getattr(project, name, None)


def _git_toplevel(path: Path) -> Path:
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ProjectNotInRepository(f"Project is not inside a git repository: {path}")
    return Path(result.stdout.strip()).resolve()


def locate(project: Any) -> ProjectLocation:
    """Locate a project given a workspace row, a ``Project`` or any object with ``path``."""

    raw_checkout = _field(project, "path")
    if not raw_checkout:
        raise ProjectNotInRepository("Project has no checkout path")
    checkout = Path(str(raw_checkout)).resolve()
    recorded_root = _field(project, "parent_repo_path")
    repo_root = Path(str(recorded_root)).resolve() if recorded_root else _git_toplevel(checkout)
    try:
        relative = checkout.relative_to(repo_root).as_posix()
    except ValueError as error:
        raise ProjectNotInRepository(
            f"Project checkout {checkout} is not inside its repository {repo_root}"
        ) from error
    return ProjectLocation(
        repo_root=repo_root,
        relative_path="" if relative == "." else relative,
        anchor=path_config_service.anchor_for_project(project),
    )


def locate_id(project_id: str) -> ProjectLocation:
    """Locate a project by id from the workspace database."""

    from app.services.workspace_service import workspace

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError(f"Project '{project_id}' not found")
    return locate(row)


def _repo_root_of(where: ProjectLocation | Path | str) -> Path:
    return where.repo_root if isinstance(where, ProjectLocation) else Path(where)


def resolve_commit(where: ProjectLocation | Path | str, ref: str) -> str:
    """The full commit id ``ref`` names, or ``RevisionNotFound``."""

    if not ref or not isinstance(ref, str) or ref.startswith("-"):
        raise RevisionNotFound(f"Commit not found: {ref}")
    result = subprocess.run(
        ["git", "-C", str(_repo_root_of(where)), "rev-parse", "--verify", f"{ref}^{{commit}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RevisionNotFound(f"Commit not found: {ref}")
    return result.stdout.strip()


def default_ref(project: Any) -> str:
    """The project's imported branch tip, or the checkout HEAD for older projects."""
    branch = _field(project, "import_branch")
    return f"refs/remotes/origin/{branch}" if branch else "HEAD"


def project_file_rel(location: ProjectLocation) -> str:
    """The repository-relative path of the project's ``.kicad_pro`` (working tree)."""

    from app.services.kicad_project_locator import find_kicad_project

    project_file = find_kicad_project(str(location.checkout), location.anchor)
    return project_file.resolve().relative_to(location.repo_root).as_posix()


# ---------------------------------------------------------------------------
# Source sets
# ---------------------------------------------------------------------------


#: Directories KiCad and Prism write generated copies into (backups, autosave,
#: caches). Their files are never a project's design inputs.
GENERATED_DIR_PARTS = frozenset({".cache", ".kicad-prism", "archive", "autosave", "backup", "backups"})

#: Prism's project settings. ``kicad_noise_service`` hides the file from change
#: lists, but it is an input: source sets that name it keep it.
_PRISM_SETTINGS = ".prism.json"


def is_generated(relative_path: str) -> bool:
    """Whether a file is something KiCad or Prism generated, never a design source.

    ``relative_path`` is POSIX, relative to the repository or to the project
    directory. This is the one rule for every reader of a revision's sources:
    checkouts, cache keys, comparison file lists and the schematic field
    overlay. It is ``kicad_noise_service.is_noise`` (backups, autosaves, lock
    files, caches, fetched ``RemoteLibrary`` parts; the change-list rule the
    agent shares) plus the generated directories and backup names a snapshot
    can also hold.
    """

    path = PurePosixPath(relative_path.replace("\\", "/"))
    name = path.name.casefold()
    if name != _PRISM_SETTINGS and kicad_noise_service.is_noise(path.as_posix()):
        return True
    parents = [part.casefold() for part in path.parts[:-1]]
    return (
        any(part in GENERATED_DIR_PARTS or part.endswith("-backups") for part in parents)
        or name.startswith(("~", "._"))
        or "-backup-" in name
        or name.endswith((".bak", ".lck"))
    )


@dataclass(frozen=True)
class SourceSet:
    """Which files of a revision a checkout contains."""

    name: str
    #: Lower-case suffixes to keep; ``None`` keeps every file.
    suffixes: Optional[frozenset[str]] = None
    #: File names kept regardless of suffix.
    names: frozenset[str] = frozenset()
    #: Lower-case directory names skipped at any depth below the repository root.
    skip_dir_parts: frozenset[str] = frozenset()
    #: Directory names skipped directly below the checkout's scope.
    skip_top_dirs: frozenset[str] = frozenset()
    #: Leave out what :func:`is_generated` calls generated (judged within the scope).
    skip_generated: bool = False

    def keeps(self, repo_path: str, scoped_path: str) -> bool:
        path = PurePosixPath(repo_path)
        if self.skip_dir_parts and {part.casefold() for part in path.parts[:-1]} & self.skip_dir_parts:
            return False
        scoped = PurePosixPath(scoped_path)
        if self.skip_top_dirs and len(scoped.parts) > 1 and scoped.parts[0] in self.skip_top_dirs:
            return False
        if self.skip_generated and is_generated(scoped_path):
            return False
        if self.suffixes is None:
            return True
        return path.name in self.names or path.suffix.casefold() in self.suffixes

    def includes(self, relative_path: str) -> bool:
        """``keeps`` for a path already relative to the scope (a working tree)."""

        return self.keeps(relative_path, relative_path)


#: Everything committed: kicad-cli may read libraries, models and worksheets
#: from anywhere in the repository.
FULL_TREE = SourceSet("full-tree")

#: The project's KiCad documents and Prism settings, for source-text readers.
KICAD_SOURCES = SourceSet(
    "kicad-sources",
    suffixes=frozenset({".kicad_pro", ".kicad_pcb", ".kicad_sch"}),
    names=frozenset({_PRISM_SETTINGS}),
    skip_generated=True,
)

#: What a semantic index is built from, and so what its cache key hashes: the
#: project's documents, the libraries beside them, and Prism settings.
SEMANTIC_SOURCES = SourceSet(
    "semantic-sources",
    suffixes=frozenset({".kicad_pro", ".kicad_sch", ".kicad_pcb", ".kicad_sym", ".kicad_mod"}),
    names=frozenset({_PRISM_SETTINGS}),
    skip_generated=True,
)

#: The inputs semantic, geometry, BOM and viewer generation need for one
#: revision of a comparison, without manufacturing and 3D asset bulk.
COMPARE_INPUTS = SourceSet(
    "compare-inputs",
    suffixes=frozenset(
        {".kicad_dru", ".kicad_jobset", ".kicad_pcb", ".kicad_pro", ".kicad_sch", ".kicad_wks"}
    ),
    names=frozenset({_PRISM_SETTINGS, "fp-lib-table", "sym-lib-table"}),
    skip_dir_parts=GENERATED_DIR_PARTS,
    skip_generated=True,
    skip_top_dirs=frozenset(
        {
            "Manufacturing-Outputs",
            "Design-Outputs",
            "archive",
            ".github",
            "packages3D",
            "simulation",
            "docs",
            "assets",
        }
    ),
)


# ---------------------------------------------------------------------------
# Materialization
# ---------------------------------------------------------------------------


_REGULAR_MODES = {"100644": 0o644, "100755": 0o755}
_SYMLINK_MODE = "120000"


@dataclass(frozen=True)
class _Entry:
    mode: str
    oid: str
    repo_path: str
    target: Path


@dataclass
class Materialized:
    """What a materialization wrote."""

    files: int = 0
    symlinks: int = 0
    #: Repository paths of symlinks dropped because they resolve outside the tree.
    dropped_symlinks: list[str] = field(default_factory=list)


def _list_tree(repo_root: Path, commit: str, scope: str) -> list[tuple[str, str, str, str]]:
    args = ["git", "-C", str(repo_root), "ls-tree", "-r", "-z", commit]
    if scope:
        args += ["--", scope.rstrip("/") + "/"]
    process = subprocess.run(args, capture_output=True, check=False)
    if process.returncode != 0:
        detail = process.stderr.decode("utf-8", errors="replace").strip()
        raise RevisionNotFound(f"git ls-tree failed for {commit}: {detail}")
    entries = []
    for record in process.stdout.split(b"\0"):
        if not record:
            continue
        metadata, name = record.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split()
        entries.append((mode, kind, oid, name.decode("utf-8", errors="surrogateescape")))
    return entries


def _read_objects(repo_root: Path, entries: list[_Entry], sink) -> None:
    """Stream each entry's blob through one ``cat-file --batch`` into ``sink``."""

    if not entries:
        return
    process = subprocess.Popen(
        ["git", "-C", str(repo_root), "cat-file", "--batch"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    assert process.stdin is not None and process.stdout is not None

    def request() -> None:
        try:
            for entry in entries:
                process.stdin.write(entry.oid.encode("ascii") + b"\n")
        except BrokenPipeError:
            pass
        finally:
            with contextlib.suppress(BrokenPipeError):
                process.stdin.close()

    writer = threading.Thread(target=request, daemon=True)
    writer.start()
    try:
        for entry in entries:
            header = process.stdout.readline().split()
            if len(header) != 3 or header[0].decode("ascii") != entry.oid or header[1] != b"blob":
                raise ValueError(f"Could not read {entry.repo_path} from the repository")
            sink(entry, process.stdout, int(header[2]))
            process.stdout.read(1)  # the newline after each object
    except BaseException:
        process.kill()
        raise
    finally:
        writer.join()
        process.stdout.close()
        process.wait()


def _write_blob(entry: _Entry, stream, size: int) -> None:
    entry.target.parent.mkdir(parents=True, exist_ok=True)
    with entry.target.open("wb") as handle:
        remaining = size
        while remaining:
            chunk = stream.read(min(remaining, 1 << 20))
            if not chunk:
                raise ValueError(f"Truncated object for {entry.repo_path}")
            handle.write(chunk)
            remaining -= len(chunk)
    os.chmod(entry.target, _REGULAR_MODES[entry.mode])


def materialize(
    where: ProjectLocation | Path | str,
    commit: str,
    destination: Path,
    *,
    source_set: SourceSet = FULL_TREE,
    scope: str = "",
    strip_scope: bool = False,
) -> Materialized:
    """Write ``source_set`` at ``commit`` under ``destination``.

    ``scope`` limits the read to one repository directory. With
    ``strip_scope`` its files land directly in ``destination`` (the project
    directory becomes the root); otherwise they keep their repository paths.
    """

    repo_root = _repo_root_of(where)
    scope = scope.strip("/")
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    regular: list[_Entry] = []
    links: list[_Entry] = []
    for mode, kind, oid, repo_path in _list_tree(repo_root, commit, scope):
        if kind != "blob" or (mode not in _REGULAR_MODES and mode != _SYMLINK_MODE):
            continue  # submodules (gitlinks) carry no content of this repository
        scoped_path = repo_path[len(scope) + 1:] if scope else repo_path
        if not source_set.keeps(repo_path, scoped_path):
            continue
        relative = PurePosixPath(scoped_path if strip_scope else repo_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"Invalid repository path: {repo_path}")
        entry = _Entry(mode, oid, repo_path, root / relative)
        (links if mode == _SYMLINK_MODE else regular).append(entry)

    result = Materialized()
    _read_objects(repo_root, regular, _write_blob)
    result.files = len(regular)

    # Links are created after every regular file, so no write above can pass
    # through one, and are kept only when they resolve inside the tree.
    targets: dict[str, bytes] = {}
    _read_objects(repo_root, links, lambda entry, stream, size: targets.__setitem__(entry.repo_path, stream.read(size)))
    for entry in links:
        entry.target.parent.mkdir(parents=True, exist_ok=True)
        os.symlink(os.fsdecode(targets[entry.repo_path]), entry.target)
    for entry in links:
        try:
            inside = entry.target.resolve().is_relative_to(root)
        except (OSError, RuntimeError):  # a link loop
            inside = False
        if inside:
            result.symlinks += 1
        else:
            entry.target.unlink()
            result.dropped_symlinks.append(entry.repo_path)
    return result


@dataclass(frozen=True)
class RevisionCheckout:
    """A temporary, repository-shaped checkout of one commit."""

    root: Path
    commit: str
    location: ProjectLocation

    @property
    def project_dir(self) -> Path:
        return self.root / self.location.relative_path if self.location.relative_path else self.root

    def path(self, repo_path: str) -> Path:
        return self.root / repo_path


@contextlib.contextmanager
def checkout(
    location: ProjectLocation,
    commit: str,
    *,
    source_set: SourceSet = FULL_TREE,
    scope: str = "",
    prefix: str = "project-revision-",
) -> Iterator[RevisionCheckout]:
    """Materialize ``commit`` into a private directory removed on exit.

    ``commit`` is resolved first, so the yielded checkout names the exact
    commit that was read.
    """

    resolved = resolve_commit(location, commit)
    with tempfile.TemporaryDirectory(prefix=prefix) as tmp:
        root = Path(tmp) / "checkout"
        materialize(location, resolved, root, source_set=source_set, scope=scope)
        yield RevisionCheckout(root=root, commit=resolved, location=location)


# ---------------------------------------------------------------------------
# Single files
# ---------------------------------------------------------------------------


def read_file(location: ProjectLocation, commit: str, project_path: str) -> Optional[bytes]:
    """A project-relative file's bytes at ``commit``; ``None`` when it is absent.

    Raises ``RevisionNotFound`` when ``commit`` does not resolve.
    """

    resolved = resolve_commit(location, commit)
    spec = f"{resolved}:{location.repo_path(project_path)}"
    process = subprocess.run(
        ["git", "-C", str(location.repo_root), "cat-file", "--batch"],
        input=spec.encode("utf-8") + b"\n",
        capture_output=True,
        check=False,
    )
    header, _, rest = process.stdout.partition(b"\n")
    parts = header.split()
    if process.returncode != 0 or len(parts) != 3 or parts[1] != b"blob":
        return None
    return rest[: int(parts[2])]


def path_config_at(location: ProjectLocation, commit: str) -> path_config_service.PathConfig:
    """The project's ``.prism.json`` settings as committed at ``commit``.

    A missing or non-object file yields the defaults. Settings for one of
    several projects sharing a directory live under ``projects.<anchor>``; the
    same merge the working tree uses applies, so a co-located sibling never
    inherits another project's paths at a historical revision. Raises
    ``ValueError`` for a file that is not valid JSON.
    """

    defaults = path_config_service.DEFAULT_PATHS
    content = read_file(location, commit, ".prism.json")
    if content is None:
        return path_config_service.PathConfig(**defaults)
    try:
        raw = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError(f"Invalid .prism.json in commit: {error}") from error
    if not isinstance(raw, dict):
        return path_config_service.PathConfig(**defaults)
    merged: dict[str, object] = dict(path_config_service.config_for_anchor(raw, location.anchor))
    for key, default_value in defaults.items():
        if not str(merged.get(key) or "").strip():
            merged[key] = default_value
    return path_config_service.PathConfig(**merged)
