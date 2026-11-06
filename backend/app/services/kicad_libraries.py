"""The KiCad path variables a Prism process hands to KiCad, and the libraries behind them.

A board reaches files outside its repository through path variables such as
`${KICAD10_3DMODEL_DIR}` or `${LSF_KICAD_LIB}`. The image defines none of the
third-party ones and carries no stock 3D models, so an administrator declares
libraries in Settings (``ws_kicad_libraries``). A git library is fetched into
the shared projects volume (``kicad_library_fetch``) and published as one
folder per commit; a path library is a folder under the mount root.

:class:`Snapshot` is the one answer to "which variable points where", taken
once and used for a whole job. Per variable: a folder the environment already
sets (``environment_folder``), then a library, then unresolved. Nothing here writes ``os.environ``;
callers take :func:`current` and ask it for an environment, fingerprints or
``--model-dir`` arguments.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sys
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO, Iterable, Iterator, Mapping
from urllib.parse import urlsplit

from app.core.config import Settings, settings

logger = logging.getLogger(__name__)

#: Written last by a fetch: which commit is published and where its folder is.
PUBLISHED_FILE = "current.json"
# How long a process trusts the rows it read; a console edit reaches every process within this.
_ROWS_TTL_SECONDS = 5.0
_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
_VARIABLE = re.compile(r"[A-Z_][A-Z0-9_]{0,63}")
_COMMIT = re.compile(r"[0-9a-f]{40}")
_DIRECTORY = re.compile(r"[0-9a-f]{40}(-[0-9a-f]{8})?")
_REF_FORBIDDEN = re.compile(r"[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|//")
_STOCK_MODEL_DIR = re.compile(r"KICAD\d*_3DMODEL_DIR")

#: Names a library may not bind: the process's own plumbing, which a cloned repository must never steer.
RESERVED_NAMES = frozenset(
    {
        "PATH", "HOME", "USERPROFILE", "TMP", "TEMP", "TMPDIR", "KIPRJMOD", "KICAD_CONFIG_HOME",
        "SYSTEMROOT", "COMSPEC", "PATHEXT", "SHELL", "USER", "LOGNAME", "LANG", "DISPLAY",
    }
)
RESERVED_PREFIXES = ("LD_", "DYLD_", "PYTHON", "GIT_", "SSL_", "XDG_", "PRISM_", "KICAD_CLI")
UPDATE_POLICIES = ("follow", "pinned")
#: How often a library's remote may be checked: the console offers these.
CHECK_INTERVALS = (3600, 21600, 86400, 604800)
DEFAULT_CHECK_INTERVAL = 86400


@dataclass(frozen=True, slots=True)
class Published:
    """The version of a git library a fetch last published."""

    commit: str
    directory: str
    source: str


@dataclass(frozen=True, slots=True)
class Library:
    """One library: the variables it binds, where its files come from, how it is kept current.

    A git library publishes one folder per commit under ``.kicad-prism/libraries/<name>``;
    a path library is a folder under the mount root, named relative to it.
    ``subdir`` is the folder inside the repository the variables point at.
    """

    name: str
    variables: tuple[str, ...]
    git: str = ""
    ref: str = ""
    subdir: str = ""
    path: str = ""
    update_policy: str = "follow"
    pinned_commit: str = ""
    check_interval_seconds: int = DEFAULT_CHECK_INTERVAL
    generation: int = 1

    @property
    def clone_dir(self) -> Path:
        return libraries_root() / self.name

    @property
    def source(self) -> str:
        """What the library is, for a fetch to name what it published."""

        return f"path:{self.path}" if self.path else f"{self.git}#{self.subdir}"

    def directory_for(self, commit: str) -> str:
        """The folder a version of this library is extracted into: the commit, and which subfolder was taken.

        A changed subfolder at the same commit is a different folder, so a version
        already in use is never added to.
        """

        if not self.subdir:
            return commit
        return f"{commit}-{hashlib.sha256(self.subdir.encode('utf-8')).hexdigest()[:8]}"

    def published(self) -> Published | None:
        """The git library's published version, or ``None`` before the first fetch or if its folder is gone.

        A version fetched from another source (a library removed and declared
        again under its name, a changed subfolder) is not this library's: it
        serves nothing until its own fetch publishes.
        """

        published = self.last_published()
        return published if published is not None and published.source == self.source else None

    def last_published(self) -> Published | None:
        """What ``current.json`` names, whichever source it was fetched from: for a fetch to retire it."""

        if self.path:
            return None
        try:
            document = json.loads((self.clone_dir / PUBLISHED_FILE).read_text(encoding="utf-8"))
            commit, directory, source = str(document["commit"]), str(document["dir"]), str(document["source"])
        except (OSError, ValueError, KeyError, TypeError):
            return None
        if not _COMMIT.fullmatch(commit) or not _DIRECTORY.fullmatch(directory) or not directory.startswith(commit):
            return None
        if not self._contained(self.clone_dir / directory, self.clone_dir):
            return None
        return Published(commit=commit, directory=directory, source=source)

    @property
    def folder(self) -> Path | None:
        """The folder the variables point at; ``None`` while the library has nothing to serve."""

        if self.path:
            if not settings.PRISM_KICAD_LIBRARY_MOUNT_ROOT.strip() or mount_root_problem() is not None:
                return None
            root = mount_root()
            folder = root / self.path
            return folder if self._contained(folder, root) else None
        published = self.published()
        if published is None:
            return None
        root = self.clone_dir / published.directory
        folder = root / self.subdir if self.subdir else root
        return folder if self._contained(folder, root) else None

    @property
    def fingerprint(self) -> str | None:
        """What the bound folder is, independent of where it is mounted; ``None`` when nothing is served."""

        if self.folder is None:
            return None
        if self.path:
            return f"path:{self.path}#g{self.generation}"
        published = self.published()
        return None if published is None else f"git:{published.source}@{published.commit}"

    @property
    def ready(self) -> bool:
        return self.folder is not None

    @staticmethod
    def _contained(folder: Path, root: Path) -> bool:
        """Whether ``folder`` is a directory whose real path stays inside ``root``'s real path."""

        try:
            real = folder.resolve(strict=True)
            return real.is_dir() and real.is_relative_to(root.resolve(strict=True))
        except (OSError, RuntimeError):
            return False


@dataclass(frozen=True)
class Binding:
    """A variable a library binds."""

    variable: str
    folder: Path
    fingerprint: str
    library: str


@dataclass(frozen=True)
class Snapshot:
    """The variables to bind now, taken once.

    ``bindings`` are the library-bound variables, ``environ`` the process
    environment the snapshot was taken against (it wins over a library), and
    ``overridden`` the variables a library would bind but the environment sets.
    """

    bindings: Mapping[str, Binding] = field(default_factory=dict)
    environ: Mapping[str, str] = field(default_factory=dict)
    overridden: Mapping[str, str] = field(default_factory=dict)

    def env(self, base: Mapping[str, str] | None = None) -> dict[str, str]:
        """``base`` (default: this process's environment) with every bound variable over it."""

        env = dict(os.environ if base is None else base)
        for name, binding in self.bindings.items():
            env[name] = str(binding.folder)
        return env

    def fingerprints(self, variables: Iterable[str]) -> dict[str, str | None]:
        """What each variable points at, by what it is and not where: ``None`` when nothing defines it.

        A folder the environment sets is named by a hash of its value: the
        fingerprint is written to disk, and the value is the server's own.
        """

        found: dict[str, str | None] = {}
        for name in sorted(set(variables)):
            if name in self.bindings:
                found[name] = self.bindings[name].fingerprint
            else:
                value = environment_folder(self.environ, name)
                found[name] = None if value is None else f"env:{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"
        return found

    def folder_of(self, variable: str) -> Path | None:
        if variable in self.bindings:
            return self.bindings[variable].folder
        value = environment_folder(self.environ, variable)
        return None if value is None else Path(value)

    def defines(self, variable: str) -> bool:
        return self.folder_of(variable) is not None

    def model_dir_args(self) -> list[str]:
        """``--model-dir VAR=dir`` for prism-kicad: the stock variables the environment sets, then every bound one."""

        directories = {
            name: value
            for name in self.environ
            if _STOCK_MODEL_DIR.fullmatch(name) and (value := environment_folder(self.environ, name)) is not None
        }
        directories.update({name: str(binding.folder) for name, binding in self.bindings.items()})
        args: list[str] = []
        for name, directory in sorted(directories.items()):
            args += ["--model-dir", f"{name}={directory}"]
        return args


#: Binds nothing and defines nothing: for a caller whose result must not depend on what this server fetched.
NO_LIBRARIES = Snapshot()


def libraries_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "libraries"


def mount_root() -> Path:
    return Path(settings.PRISM_KICAD_LIBRARY_MOUNT_ROOT.strip()).expanduser()


def mount_root_problem() -> str | None:
    """Why the mount root may not be used, or ``None``: it must not hold, or sit inside, the projects root.

    A path library under a mount root that reaches the projects root would
    serve another project's repository, or Prism's own state, to every board.
    """

    if not settings.PRISM_KICAD_LIBRARY_MOUNT_ROOT.strip():
        return None
    mount = Path(os.path.realpath(mount_root()))
    projects = Path(os.path.realpath(Path(settings.KICAD_PROJECTS_ROOT).expanduser()))
    if mount == projects or mount in projects.parents or projects in mount.parents:
        return (
            f"PRISM_KICAD_LIBRARY_MOUNT_ROOT ({mount}) overlaps KICAD_PROJECTS_ROOT ({projects}). "
            "Mount the libraries in a folder of their own."
        )
    return None


def verify_mount_root_or_exit(process: str) -> None:
    """Refuse to start ``process`` with a mount root that reaches the projects root."""

    problem = mount_root_problem()
    if problem is not None:
        print(f"\n{process} did not start: {problem}\n", file=sys.stderr, flush=True)
        raise SystemExit(3)


def check_variable(name: Any) -> str:
    """A variable name a library may bind, or ``ValueError`` saying why not."""

    if not isinstance(name, str) or not _VARIABLE.fullmatch(name):
        raise ValueError("variable names are upper case letters, digits and '_', not starting with a digit")
    if name in RESERVED_NAMES or name.startswith(RESERVED_PREFIXES) or name in Settings.model_fields:
        raise ValueError(f"{name} is used by the server itself and cannot be bound to a library")
    return name


def environment_folder(environ: Mapping[str, str], name: str) -> str | None:
    """The folder the environment sets ``name`` to, if a board may resolve a model through it.

    A board names any variable it likes. Only a name a library could bind
    (never the server's settings or plumbing) and a value that is a folder
    count, so a model path cannot read a secret out of the environment, or
    learn which variables are set.
    """

    value = environ.get(name)
    if not value:
        return None
    try:
        check_variable(name)
    except ValueError:
        return None
    return value if os.path.isdir(value) else None


def check_git_url(url: Any) -> str:
    if not isinstance(url, str):
        raise ValueError("a git library needs an https:// url")
    text = url.strip()
    parts = urlsplit(text)
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or "@" in parts.netloc
        or re.search(r"\s", text)
        or text.startswith("-")
    ):
        raise ValueError("a git library needs a plain https:// url, with no credentials in it")
    # The rules project imports follow: IMPORT_ALLOWED_HOSTS, no dot segments, a repository path.
    from app.services.git_remote_url import RemoteUrlError, RemoteUrlPolicy, parse_remote_url

    try:
        parse_remote_url(text, RemoteUrlPolicy.build(allowed_hosts=settings.IMPORT_ALLOWED_HOSTS))
    except RemoteUrlError as error:
        raise ValueError(str(error)) from error
    return text


def check_ref(ref: Any) -> str:
    if not isinstance(ref, str) or not ref.strip() or ref.strip().startswith(("-", "/")) or _REF_FORBIDDEN.search(ref.strip()):
        raise ValueError("a git library needs a tag or branch name")
    return ref.strip()


def check_relative(value: Any, what: str) -> str:
    """A folder named below its root: no leading separator, drive, or ``..``, whichever OS reads it."""

    text = value.strip() if isinstance(value, str) else ""
    parts = text.replace(chr(92), "/").rstrip("/").split("/")
    if not text or text[0] in ("/", chr(92)) or ":" in text or ".." in parts or "" in parts:
        raise ValueError(f"{what} must be a relative folder")
    return text.strip("/" + chr(92))


def validate_entry(raw: Any) -> Library:
    """A library from its declared fields, or ``ValueError`` saying what is wrong with them."""

    if not isinstance(raw, dict):
        raise ValueError("an entry must be an object")
    name = raw.get("name")
    if not isinstance(name, str) or not _NAME.fullmatch(name) or name.endswith((".", ".partial")):
        raise ValueError("name must be letters, digits, '.', '_' or '-'")
    variables = raw.get("variables")
    if not isinstance(variables, (list, tuple)) or not variables or len(set(variables)) != len(variables):
        raise ValueError("variables must be a non-empty list of distinct variable names")
    names = tuple(check_variable(v) for v in variables)
    policy = raw.get("update_policy") or "follow"
    if policy not in UPDATE_POLICIES:
        raise ValueError("update policy is follow or pinned")
    interval = raw.get("check_interval_seconds") or DEFAULT_CHECK_INTERVAL
    if interval not in CHECK_INTERVALS:
        raise ValueError("the check interval is 1 hour, 6 hours, 1 day or 1 week")
    git, path = raw.get("git") or None, raw.get("path") or None
    if (git is None) == (path is None):
        raise ValueError("give exactly one of git and path")
    common = {"update_policy": policy, "check_interval_seconds": interval, "generation": int(raw.get("generation") or 1)}
    if path is not None:
        return Library(name=name, variables=names, path=check_relative(path, "path"), **common)
    pinned = raw.get("pinned_commit") or ""
    if pinned and not (isinstance(pinned, str) and _COMMIT.fullmatch(pinned)):
        raise ValueError("a pinned commit is a full 40-character commit id")
    subdir = raw.get("subdir") or ""
    return Library(
        name=name,
        variables=names,
        git=check_git_url(git),
        ref=check_ref(raw.get("ref")),
        subdir=check_relative(subdir, "subdir") if subdir else "",
        pinned_commit=pinned,
        **common,
    )


_rows_lock = threading.Lock()
_rows_cache: tuple[float, list[dict[str, Any]]] | None = None


def declared_rows() -> list[dict[str, Any]]:
    """The administrator's libraries, as ``validate_entry`` takes them; read through a short cache.

    A database that cannot be reached leaves the last rows read in force, and none
    if there never were any, so a tool run is never blocked on it.
    """

    global _rows_cache
    now = time.monotonic()
    with _rows_lock:
        if _rows_cache is not None and now - _rows_cache[0] < _ROWS_TTL_SECONDS:
            return _rows_cache[1]
        try:
            from app.services import kicad_library_store

            rows = kicad_library_store.declared()
        except Exception as error:
            logger.warning("KiCad libraries: could not read the declared libraries: %s", error)
            rows = _rows_cache[1] if _rows_cache is not None else []
        _rows_cache = (now, rows)
        return rows


def forget_rows() -> None:
    """Drop the cached rows: the next read goes to the database."""

    global _rows_cache
    with _rows_lock:
        _rows_cache = None


def configured() -> tuple[tuple[Library, ...], list[str]]:
    """The libraries in force, and why any declared one was left out."""

    kept: list[Library] = []
    problems: list[str] = []
    claimed: dict[str, str] = {}
    for raw in declared_rows():
        try:
            library = validate_entry(raw)
        except ValueError as error:
            problems.append(f"library {raw.get('name', '?')!r}: {error}")
            continue
        clash = next((v for v in library.variables if v in claimed), None)
        if clash is not None:
            problems.append(
                f"library {library.name!r} binds {clash}, which {claimed[clash]!r} already binds; it is ignored"
            )
            continue
        kept.append(library)
        claimed.update({v: library.name for v in library.variables})
    return tuple(kept), problems


def snapshot(environ: Mapping[str, str] | None = None) -> Snapshot:
    """The variables to bind now: the environment first, then each library that has something to serve."""

    env = dict(os.environ if environ is None else environ)
    bindings: dict[str, Binding] = {}
    overridden: dict[str, str] = {}
    for library in configured()[0]:
        folder, fingerprint = library.folder, library.fingerprint
        if folder is None or fingerprint is None:
            continue
        for name in library.variables:
            if environment_folder(env, name) is not None:
                overridden[name] = library.name
            else:
                bindings[name] = Binding(name, folder, fingerprint, library.name)
    return Snapshot(bindings=bindings, environ=env, overridden=overridden)


_pinned: Snapshot | None = None


def pin(taken: Snapshot | None = None) -> Snapshot:
    """Fix the snapshot this process uses from now on: a job takes one at its start and keeps it."""

    global _pinned
    _pinned = taken if taken is not None else snapshot()
    return _pinned


def unpin() -> None:
    global _pinned
    _pinned = None


def current() -> Snapshot:
    """The pinned snapshot, or a fresh one in a process that pinned none (the API)."""

    return _pinned if _pinned is not None else snapshot()


@contextmanager
def pinned(taken: Snapshot | None = None) -> Iterator[Snapshot]:
    """``taken`` (default: a fresh snapshot) as the process's snapshot for the block."""

    global _pinned
    before = _pinned
    try:
        yield pin(taken)
    finally:
        _pinned = before


def open_file(variable: str, relative: str, *, using: Snapshot | None = None) -> BinaryIO | None:
    """A file below a variable's folder, opened for reading, or ``None``.

    The one door for Prism's own code to a library's files: the path is
    resolved through the snapshot, and one that leaves the folder (``..``, a
    link, an absolute name) is refused.
    """

    folder = (using or current()).folder_of(variable)
    if folder is None or not isinstance(relative, str) or not relative.strip():
        return None
    try:
        root = folder.resolve(strict=True)
        target = (root / relative.replace(chr(92), "/")).resolve(strict=True)
        if not target.is_file() or not target.is_relative_to(root):
            return None
        return target.open("rb")
    except (OSError, RuntimeError, ValueError):
        return None
