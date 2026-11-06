"""Fetching, publishing and removing KiCad path libraries, as jobs.

A git library keeps one shallow object store (``store.git``) under
``.kicad-prism/libraries/<name>``. A fetch asks the remote for exactly one
commit, extracts the library's folder from that commit (never a checkout: only
regular files and folders are written, links are skipped), and publishes it by
writing ``current.json`` last. Each published version is its own folder, so a
job reading the old one is never disturbed; old folders go after a grace
period (``sweep``). A failed fetch leaves the published version serving.

What was checked is what is fetched: a check resolves the ref to a commit, the
fetch takes that commit, and the ref is only read again when a remote refuses
to serve a commit by its id.
"""

from __future__ import annotations

import hashlib
import http.client
import json
import logging
import os
import queue
import re
import shutil
import subprocess
import tarfile
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable
from urllib.parse import urljoin, urlsplit

from app.core.config import settings
from app.services import kicad_libraries, kicad_library_store
from app.services.design_bundle.materialize import lfs_pointer
from app.services.git_failures import describe_git_failure, strip_url_credentials
from app.services.job_kinds import JobKind, JobSubject, subject_lock
from app.services.job_runtime import JobCancelled, JobContext, JobResult, PermanentJobError, RetryableJobError
from app.services.process_tree import group_popen_kwargs, kill_tree
from app.services.tree_removal import remove_tree

logger = logging.getLogger(__name__)

FETCH_KIND = "kicad_library_fetch"
REMOVE_KIND = "kicad_library_remove"
SWEEP_KIND = "kicad_library_sweep"
# After the interactive work and before the tracker's background polling.
PRIORITY = 200
#: The protocols git may use for a library. Tests add ``file``; production never does.
ALLOWED_PROTOCOLS: tuple[str, ...] = ("https",)
#: A fetch refuses to start when the volume has less than this free, and stops below a quarter of it.
MIN_FREE_BYTES = 2 * 1024**3
_RESERVE_BYTES = MIN_FREE_BYTES // 4
# Files are written in chunks this large; free space is read again every _SPACE_EVERY bytes.
_CHUNK = 1024 * 1024
_SPACE_EVERY = 16 * 1024 * 1024
# How many redirects a library's host may answer with before git is given the url.
_MAX_REDIRECTS = 5
_UPLOAD_PACK = "/info/refs?service=git-upload-pack"
#: A superseded or removed version stays this long, longer than any job that could be reading it.
GRACE_SECONDS = 6 * 3600
_REMOTE_TIMEOUT_SECONDS = 30
# Cancellation and free space are checked this often while git runs.
_TICK_SECONDS = 2.0
_SUPERSEDED = ".superseded"
_REMOVED_FILE = "removed.json"
_STORE = "store.git"
_KEEP_REF = "refs/prism/keep/"
_PHASES = (("Receiving objects", 0, 70), ("Resolving deltas", 70, 80), ("Downloading LFS objects", 85, 95))
_PERCENT = re.compile(r"^(?:remote:\s*)?(?P<phase>[A-Za-z ]+):\s+(?P<percent>\d+)%")
# The console lists this many of a repository's tags and branches.
_MAX_LISTED = 100
_COMMIT = re.compile(r"[0-9a-f]{40}")
# A Git LFS pointer is a short text file; anything larger is the file itself.
_LFS_POINTER_MAX = 1024
_LFS_DIR = "lfs"
# What a failed git command means for a library, and whether it would fail the same way again.
_PRIVATE = "{target} was not found, or it is private. Libraries must be public https repositories."
_FAILURES = {
    "repository-not-found": (_PRIVATE, True),
    "credentials-required": (_PRIVATE, True),
    "host-unresolved": ("Could not resolve {host}.", False),
    "host-unreachable": ("Could not reach {host}.", False),
    "disk-full": ("The server ran out of disk space.", False),
}


class FetchError(RuntimeError):
    """A fetch that failed. ``permanent`` ones would fail the same way again."""

    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


def progress_of(line: str) -> int | None:
    """Overall percent for one line of git's progress output, or None for any other line."""

    match = _PERCENT.match(line.strip())
    if match is None:
        return None
    for phase, start, end in _PHASES:
        if match["phase"].strip() == phase:
            return start + (end - start) * int(match["percent"]) // 100
    return None


def _environment() -> dict[str, str]:
    return {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GCM_INTERACTIVE": "never",
        "GIT_LFS_SKIP_SMUDGE": "1",
        "LC_ALL": "C",
    }


def _git(*args: str, git_dir: Path | None = None) -> list[str]:
    """``git`` with only the allowed protocols, no redirects, no credential helper and nothing to prompt with.

    A redirect is followed by :func:`remote_url` before git runs, where its host is checked.
    """

    command = ["git", "-c", "protocol.allow=never"]
    for protocol in ALLOWED_PROTOCOLS:
        command += ["-c", f"protocol.{protocol}.allow=always"]
    command += ["-c", "http.followRedirects=false", "-c", "credential.helper=", "-c", "core.askPass="]
    if git_dir is not None:
        command += ["--git-dir", str(git_dir)]
    return [*command, *args]


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None  # the 3xx is raised as an HTTPError, and read below


_OPENER = urllib.request.build_opener(_NoRedirects)


def remote_url(url: str) -> str:
    """Where the repository at ``url`` answers: its host's redirects followed, each to a host a library may use.

    git runs with redirects off, against this url. GitLab, for one, redirects
    a repository url without ``.git`` to the one with it. A redirect to a host
    IMPORT_ALLOWED_HOSTS does not list, or to something that is not a
    repository, fails the fetch. A host that cannot be reached here is left to
    git, which says why in its own words.
    """

    current = url
    for _ in range(_MAX_REDIRECTS):
        if urlsplit(current).scheme != "https":
            return current
        probe = current.rstrip("/") + _UPLOAD_PACK
        request = urllib.request.Request(probe, method="GET", headers={"User-Agent": "git/2 (KiCad Prism)"})
        try:
            with _OPENER.open(request, timeout=_REMOTE_TIMEOUT_SECONDS):
                return current
        except urllib.error.HTTPError as error:
            error.close()
            location = error.headers.get("Location") if 300 <= error.code < 400 else None
            if not location:
                return current
        except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError):
            return current
        target = urljoin(probe, location)
        host = urlsplit(url).hostname or "the server"
        if not target.endswith(_UPLOAD_PACK):
            raise FetchError(f"{host} redirects this library to something that is not a git repository", permanent=True)
        try:
            current = kicad_libraries.check_git_url(target.removesuffix(_UPLOAD_PACK))
        except ValueError as error:
            raise FetchError(
                f"{host} redirects this library to {urlsplit(target).hostname or 'another server'}, "
                f"which libraries may not use: {error}",
                permanent=True,
            ) from error
    raise FetchError(f"{urlsplit(url).hostname or 'The server'} redirects this library too many times", permanent=True)


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1][:300] if lines else ""


def _failure(stderr: str, url: str, fallback: str) -> FetchError:
    """What a failed git command means, in the console's words, without credentials in it.

    Read with the rules project imports use (``git_failures``). Their advice
    about tokens and SSH keys does not apply: a library uses neither.
    """

    reason, _ = describe_git_failure(RuntimeError(stderr))
    parts = urlsplit(url)
    host = parts.hostname or "the server"
    target = f"{host}{parts.path}".rstrip("/").removesuffix(".git")
    if reason in _FAILURES:
        template, permanent = _FAILURES[reason]
        return FetchError(template.format(target=target, host=host), permanent=permanent)
    line = strip_url_credentials(_last_line(stderr))
    return FetchError(f"{fallback}: {line}" if line else fallback)


def resolve_remote(url: str, ref: str) -> str:
    """The commit ``ref`` points at on the remote (a tag's own commit, not the tag object)."""

    url = remote_url(url)
    try:
        done = subprocess.run(
            _git("ls-remote", "--", url, f"refs/tags/{ref}", f"refs/tags/{ref}^{{}}", f"refs/heads/{ref}"),
            capture_output=True,
            text=True,
            timeout=_REMOTE_TIMEOUT_SECONDS,
            env=_environment(),
        )
    except subprocess.TimeoutExpired as error:
        raise FetchError(f"No answer from the repository within {_REMOTE_TIMEOUT_SECONDS} seconds") from error
    except OSError as error:
        raise FetchError(f"git could not run: {error}", permanent=True) from error
    if done.returncode != 0:
        raise _failure(done.stderr, url, "git ls-remote failed")
    found: dict[str, str] = {}
    for line in done.stdout.splitlines():
        sha, _, name = line.partition("\t")
        if _COMMIT.fullmatch(sha):
            found[name] = sha
    for name in (f"refs/tags/{ref}^{{}}", f"refs/tags/{ref}", f"refs/heads/{ref}"):
        if name in found:
            return found[name]
    if _COMMIT.fullmatch(ref):
        return ref
    raise FetchError(f"The repository has no tag or branch {ref}", permanent=True)


def free_bytes(directory: Path) -> int:
    probe = directory
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return shutil.disk_usage(probe).free


def _require_space(directory: Path, needed: int = 0) -> None:
    """Refuse to start writing ``needed`` bytes unless the volume keeps MIN_FREE_BYTES besides."""

    free = free_bytes(directory)
    if free < MIN_FREE_BYTES:
        raise FetchError(
            f"Less than {MIN_FREE_BYTES // 1024**3} GB free where the libraries are stored; free some space"
        )
    if needed and free - needed < _RESERVE_BYTES:
        raise FetchError(f"The library needs {_gb(needed)} and there is not that much free space; free some space")


def _gb(size: int) -> str:
    return f"{size / 1024**3:.1f} GB"


def max_bytes() -> int:
    """The most one fetch of a library may write: PRISM_KICAD_LIBRARY_MAX_GB."""

    return settings.PRISM_KICAD_LIBRARY_MAX_GB * 1024**3


def _too_large(size: int | None = None) -> FetchError:
    found = f"is {_gb(size)}" if size is not None else "is larger than that"
    return FetchError(
        f"A library may be at most {settings.PRISM_KICAD_LIBRARY_MAX_GB} GB (PRISM_KICAD_LIBRARY_MAX_GB); this one {found}",
        permanent=True,
    )


def _check_room(directory: Path) -> None:
    """Stop a write that is running the volume out of space."""

    if free_bytes(directory) < _RESERVE_BYTES:
        raise FetchError("The volume ran out of space while the library was being fetched")


def _run_streaming(
    command: list[str],
    *,
    on_progress: Callable[[int], None],
    on_tick: Callable[[], None],
    cwd: Path | None = None,
) -> tuple[int, str]:
    """Run a git command, reading its progress from stderr; returns (exit code, its last lines of stderr).

    ``on_tick`` runs every _TICK_SECONDS whether or not git prints anything, so
    a check it makes (cancellation, free space, size) is never held up by a
    quiet download.
    """

    process = subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        env=_environment(),
        cwd=None if cwd is None else str(cwd),
        **group_popen_kwargs(),
    )
    assert process.stderr is not None
    lines: queue.Queue[str | None] = queue.Queue()

    def read(stream: Any) -> None:
        try:
            # git redraws a progress line with carriage returns; read it as lines of either kind.
            for chunk in stream:
                for line in chunk.replace("\r", "\n").splitlines():
                    lines.put(line)
        except (OSError, ValueError):
            pass  # the pipe closed under a killed process
        finally:
            lines.put(None)

    reader = threading.Thread(target=read, args=(process.stderr,), name="git-progress", daemon=True)
    reader.start()
    tail: deque[str] = deque(maxlen=20)
    last, ticked = -1, time.monotonic()
    try:
        while True:
            try:
                line = lines.get(timeout=_TICK_SECONDS)
            except queue.Empty:
                line = ""
            if line is None:
                break
            percent = progress_of(line)
            if percent is not None:
                if percent != last:
                    last = percent
                    on_progress(percent)
            elif line.strip():
                tail.append(line.strip())
            if time.monotonic() - ticked >= _TICK_SECONDS:
                ticked = time.monotonic()
                on_tick()
        return process.wait(), os.linesep.join(tail)
    except BaseException:
        kill_tree(process)
        process.wait()
        raise
    finally:
        reader.join(timeout=5)


def _ensure_store(store: Path) -> None:
    if (store / "HEAD").is_file():
        return
    store.parent.mkdir(parents=True, exist_ok=True)
    done = subprocess.run(_git("init", "--bare", "-q", str(store)), capture_output=True, text=True, env=_environment())
    if done.returncode != 0:
        raise FetchError(f"Could not create the library's object store: {_last_line(done.stderr)}", permanent=True)


def _has_commit(store: Path, commit: str) -> bool:
    done = subprocess.run(
        _git("cat-file", "-e", f"{commit}^{{commit}}", git_dir=store), capture_output=True, env=_environment()
    )
    return done.returncode == 0


def fetch_into_store(
    library: kicad_libraries.Library,
    commit: str,
    *,
    on_progress: Callable[[int], None] = lambda percent: None,
    on_tick: Callable[[], None] = lambda: None,
) -> None:
    """Make ``commit`` present in the library's object store, downloading only what it adds.

    On every tick the download is stopped if the volume runs short of space or
    the store has grown by more than a library may be.
    """

    store = library.clone_dir / _STORE
    _ensure_store(store)
    if not _has_commit(store, commit):
        _require_space(library.clone_dir)
        url = remote_url(library.git)
        start, limit = folder_size(store), max_bytes()

        def tick() -> None:
            on_tick()
            _check_room(library.clone_dir)
            if folder_size(store) - start > limit:
                raise _too_large()

        flags = ["--depth", "1", "--no-tags", "--no-write-fetch-head", "--progress"]
        code, tail = _run_streaming(
            _git("fetch", *flags, "--", url, commit, git_dir=store), on_progress=on_progress, on_tick=tick
        )
        if code != 0 or not _has_commit(store, commit):
            # A remote that will not serve a commit by its id: take the ref, as a branch and then as a tag
            # (one of them does not exist), and check it is still that commit.
            fetched = False
            for spec in (
                f"+refs/heads/{library.ref}:refs/prism/fetching/head",
                f"+refs/tags/{library.ref}:refs/prism/fetching/tag",
            ):
                code, tail = _run_streaming(
                    _git("fetch", *flags, "--", url, spec, git_dir=store),
                    on_progress=on_progress,
                    on_tick=tick,
                )
                fetched = fetched or code == 0
                if _has_commit(store, commit):
                    break
            if not _has_commit(store, commit):
                if fetched:
                    raise FetchError(f"{library.ref} moved while it was being fetched; it will be checked again")
                raise _failure(tail, library.git, "git fetch failed")
    done = subprocess.run(
        _git("update-ref", f"{_KEEP_REF}{commit}", commit, git_dir=store), capture_output=True, text=True, env=_environment()
    )
    if done.returncode != 0:
        raise FetchError(f"Could not keep the fetched commit: {_last_line(done.stderr)}", permanent=True)


class UnsafeArchive(FetchError):
    def __init__(self, message: str) -> None:
        super().__init__(message, permanent=True)


def _checked_member(member: tarfile.TarInfo) -> tarfile.TarInfo | None:
    """The member as it may be written, or ``None`` to skip it. A name that could escape raises."""

    name = member.name
    parts = PurePosixPath(name.replace("\\", "/")).parts
    if (
        not name
        or name.startswith(("/", "\\"))
        or ".." in parts
        or "\\" in name
        or any(":" in part for part in parts)
        or "\x00" in name
    ):
        raise UnsafeArchive(f"The repository holds a file name this server will not write: {name[:80]!r}")
    if not (member.isreg() or member.isdir()):
        return None  # links, devices and fifos are never part of a library
    member.mode = 0o755 if member.isdir() else 0o644
    member.uid = member.gid = 0
    member.uname = member.gname = ""
    return member


def tree_bytes(library: kicad_libraries.Library, commit: str) -> int:
    """The bytes ``commit``'s library folder holds, read from the store before anything is written."""

    command = _git("ls-tree", "-r", "-l", "-z", commit, git_dir=library.clone_dir / _STORE)
    if library.subdir:
        command += ["--", library.subdir]
    done = subprocess.run(command, capture_output=True, env=_environment())
    if done.returncode != 0:
        raise FetchError(f"Could not read the library's files: {_last_line(done.stderr.decode('utf-8', 'replace'))}")
    total = 0
    for entry in done.stdout.split(b"\0"):
        fields = entry.split(b"\t", 1)[0].split()
        if len(fields) == 4 and fields[1] == b"blob" and fields[3].isdigit():
            total += int(fields[3])
    return total


def _write_member(archive: tarfile.TarFile, member: tarfile.TarInfo, destination: Path, check: Callable[[int], None]) -> None:
    """Write one checked member below ``destination``, streamed, calling ``check`` with each chunk's size."""

    parts = PurePosixPath(member.name).parts
    if not parts:
        return
    target = destination.joinpath(*parts)
    if member.isdir():
        target.mkdir(parents=True, exist_ok=True)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    source = archive.extractfile(member)
    if source is None:
        return
    with source, target.open("wb") as writer:
        while chunk := source.read(_CHUNK):
            check(len(chunk))
            writer.write(chunk)


def extract_version(
    library: kicad_libraries.Library,
    commit: str,
    destination: Path,
    *,
    on_tick: Callable[[], None] = lambda: None,
) -> int:
    """Write ``commit``'s library folder into ``destination``; returns the bytes written.

    Refused before anything is written when the folder is larger than a
    library may be or than the volume has room for. While it is written, the
    size and the free space are checked as each file streams, so one large
    file cannot fill the volume either.
    """

    needed, limit = tree_bytes(library, commit), max_bytes()
    if needed > limit:
        raise _too_large(needed)
    _require_space(destination.parent, needed)
    store = library.clone_dir / _STORE
    command = _git("archive", "--format=tar", commit, git_dir=store)
    if library.subdir:
        command += ["--", library.subdir]
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=_environment(), **group_popen_kwargs()
    )
    assert process.stdout is not None and process.stderr is not None
    written = {"total": 0, "since_space": 0, "ticked": time.monotonic()}

    def check(size: int) -> None:
        written["total"] += size
        written["since_space"] += size
        if written["total"] > limit:
            raise _too_large()
        if written["since_space"] >= _SPACE_EVERY:
            written["since_space"] = 0
            _check_room(destination)
        if time.monotonic() - written["ticked"] >= _TICK_SECONDS:
            written["ticked"] = time.monotonic()
            on_tick()

    try:
        destination.mkdir(parents=True)
        unreadable = False
        try:
            with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
                for member in archive:
                    allowed = _checked_member(member)
                    if allowed is not None:
                        _write_member(archive, allowed, destination, check)
                    check(0)
        except tarfile.ReadError:
            # git wrote no archive: its own exit status says why.
            unreadable = True
        error = process.stderr.read().decode("utf-8", "replace")
        code = process.wait()
        if unreadable and code == 0:
            raise FetchError("The library's archive could not be read")
        if code != 0:
            if library.subdir and "did not match" in error:
                raise FetchError(f"The repository has no folder {library.subdir!r} at this commit", permanent=True)
            raise FetchError(f"git archive failed: {_last_line(error)}")
    except BaseException:
        kill_tree(process)
        process.wait()
        remove_tree(destination, ignore_errors=True)
        raise
    return int(written["total"])


def lfs_pointers(folder: Path) -> list[tuple[Path, str, int]]:
    """The files under ``folder`` that are Git LFS pointers, not content: ``(file, sha256, size)``."""

    found: list[tuple[Path, str, int]] = []
    for root, _dirs, files in os.walk(folder):
        for name in files:
            path = Path(root, name)
            try:
                if path.stat().st_size > _LFS_POINTER_MAX:
                    continue
                pointer = lfs_pointer(path.read_bytes())
            except OSError:
                continue
            if pointer is not None:
                found.append((path, *pointer))
    return found


def lfs_endpoint(url: str) -> str:
    """Where git-lfs asks for a repository's objects: what git-lfs itself derives from the url."""

    base = url.rstrip("/")
    return f"{base if base.endswith('.git') else base + '.git'}/info/lfs"


def _copy_verified(source: Path, target: Path, sha: str, size: int) -> bool:
    """Copy one LFS object over its pointer, only if its bytes are the ones the pointer names."""

    temp = target.with_name(f".{target.name}.prism-lfs.tmp")
    digest = hashlib.sha256()
    try:
        if source.is_symlink() or not source.is_file() or source.stat().st_size != size:
            return False
        with source.open("rb") as reader, temp.open("wb") as writer:
            while chunk := reader.read(_CHUNK):
                digest.update(chunk)
                writer.write(chunk)
        if digest.hexdigest() != sha:
            temp.unlink(missing_ok=True)
            return False
        os.replace(temp, target)
        return True
    except OSError:
        temp.unlink(missing_ok=True)
        return False


def _place_verified(source: Path, target: Path, sha: str, size: int, placed: dict[str, Path]) -> bool:
    """Put one LFS object over its pointer, only if its bytes are the ones the pointer names.

    The object is moved out of the store, so the volume never holds it twice;
    a second pointer to the same object gets a copy of the first.
    """

    if sha in placed:
        return _copy_verified(placed[sha], target, sha, size)
    digest = hashlib.sha256()
    try:
        if source.is_symlink() or not source.is_file() or source.stat().st_size != size:
            return False
        with source.open("rb") as reader:
            while chunk := reader.read(_CHUNK):
                digest.update(chunk)
        if digest.hexdigest() != sha:
            return False
        os.replace(source, target)
    except OSError:
        return False
    placed[sha] = target
    return True


def hydrate_lfs(
    library: kicad_libraries.Library,
    commit: str,
    folder: Path,
    *,
    on_progress: Callable[[int], None] = lambda percent: None,
    on_tick: Callable[[], None] = lambda: None,
    already: int = 0,
) -> int:
    """Replace the Git LFS pointers in an extracted version with their files; returns how many.

    Model libraries often keep STEP and WRL files in LFS, and ``git archive``
    writes the pointers. KiCad cannot read a pointer, yet the file exists, so
    nothing would report the model missing. The objects are downloaded into the
    store, moved over their pointers once verified, then the rest is dropped
    from the store: the version folder is what is kept. A pointer left over
    fails the fetch, and the version served before keeps serving.

    ``already`` is what the extraction wrote: with the sizes the pointers name,
    it is checked against the library's limit before anything is downloaded,
    and the download is stopped if it outgrows that or the volume's free space.
    """

    pointers = lfs_pointers(folder)
    if not pointers:
        return 0
    if shutil.which("git-lfs") is None:
        raise FetchError(
            f"{len(pointers)} files in this library are stored with Git LFS, and git-lfs is not installed on the server",
            permanent=True,
        )
    needed, limit = sum(size for _path, _sha, size in pointers), max_bytes()
    if already + needed > limit:
        raise _too_large(already + needed)
    store = library.clone_dir / _STORE
    _require_space(library.clone_dir, needed)
    downloads = store / _LFS_DIR

    def tick() -> None:
        on_tick()
        _check_room(library.clone_dir)
        if already + folder_size(downloads) > limit:
            raise _too_large()

    url = remote_url(library.git)
    # The endpoint is given here, so a .lfsconfig in the repository cannot send git-lfs to another server.
    command = _git(
        "-c", f"remote.origin.url={url}", "-c", f"lfs.url={lfs_endpoint(url)}",
        "lfs", "fetch", "origin", commit, git_dir=store,
    )
    if library.subdir:
        command += ["--include", f"{library.subdir.rstrip('/')}/**"]
    try:
        code, tail = _run_streaming(command, on_progress=on_progress, on_tick=tick)
        if code != 0:
            raise _failure(tail, library.git, "git lfs fetch failed")
        objects = downloads / "objects"
        placed: dict[str, Path] = {}
        missing = []
        for path, sha, size in pointers:
            if sha in placed:
                _check_room(library.clone_dir)
            if not _place_verified(objects / sha[:2] / sha[2:4] / sha, path, sha, size, placed):
                missing.append(path)
    finally:
        remove_tree(downloads, ignore_errors=True)
    if missing:
        raise FetchError(f"{len(missing)} of the library's {len(pointers)} Git LFS files could not be downloaded")
    return len(pointers)


def _write_published(library: kicad_libraries.Library, commit: str, directory: str) -> None:
    """``current.json``, replaced in one step (retried briefly where another process holds the old one open)."""

    target = library.clone_dir / kicad_libraries.PUBLISHED_FILE
    temp = target.with_name(f".{target.name}.{os.getpid()}.{time.monotonic_ns()}.tmp")
    temp.write_text(json.dumps({"source": library.source, "commit": commit, "dir": directory}), encoding="utf-8")
    for attempt in range(10):
        try:
            os.replace(temp, target)
            return
        except PermissionError:
            if attempt == 9:
                temp.unlink(missing_ok=True)
                raise
            time.sleep(0.2)


def publish(library: kicad_libraries.Library, commit: str, directory: str) -> None:
    """Serve ``directory`` as the library's version from now on; the one it replaces starts its grace period.

    The one it replaces may have come from another source (the name was declared again): it goes too.
    """

    before = library.last_published()
    _write_published(library, commit, directory)
    (library.clone_dir / _REMOVED_FILE).unlink(missing_ok=True)
    (library.clone_dir / f"{directory}{_SUPERSEDED}").unlink(missing_ok=True)
    if before is not None and before.directory != directory:
        (library.clone_dir / f"{before.directory}{_SUPERSEDED}").write_text(str(time.time()), encoding="utf-8")
    store = library.clone_dir / _STORE
    subprocess.run(
        _git("update-ref", "refs/prism/current", commit, git_dir=store), capture_output=True, env=_environment()
    )


def fetch_version(
    library: kicad_libraries.Library,
    commit: str,
    *,
    on_progress: Callable[[int], None] = lambda percent: None,
    on_tick: Callable[[], None] = lambda: None,
) -> int:
    """Publish ``commit`` of ``library``: fetch it if the store lacks it, extract it if its folder is missing."""

    directory = library.directory_for(commit)
    target = library.clone_dir / directory
    if not target.is_dir():
        fetch_into_store(library, commit, on_progress=on_progress, on_tick=on_tick)
        on_progress(85)
        partial = target.with_name(directory + ".partial")
        remove_tree(partial, ignore_errors=True)
        written = extract_version(library, commit, partial, on_tick=on_tick)
        if library.subdir and not (partial / library.subdir).is_dir():
            remove_tree(partial, ignore_errors=True)
            raise FetchError(f"The repository has no folder {library.subdir!r} at this commit", permanent=True)
        try:
            hydrate_lfs(library, commit, partial, on_progress=on_progress, on_tick=on_tick, already=written)
        except BaseException:
            remove_tree(partial, ignore_errors=True)
            raise
        partial.rename(target)
    publish(library, commit, directory)
    return folder_size(target)


def folder_size(directory: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(directory):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def _library(name: str) -> kicad_libraries.Library | None:
    kicad_libraries.forget_rows()
    return next((library for library in kicad_libraries.configured()[0] if library.name == name), None)


def target_commit(library: kicad_libraries.Library, requested: str = "") -> str:
    """What to publish: the commit asked for, else the pin, else where the ref points now."""

    if requested:
        return requested
    if library.update_policy == "pinned" and library.pinned_commit:
        return library.pinned_commit
    return resolve_remote(library.git, library.ref)


def run_fetch_job(context: JobContext) -> JobResult:
    name = str(context.job["payload"].get("name") or "")
    requested = str(context.job["payload"].get("commit") or "")
    library = _library(name)
    if library is None or not library.git:
        return JobResult(message=f"{name} is no longer a git library")
    requested_by = str(context.job.get("requested_by") or "")
    if requested and library.update_policy == "pinned" and library.pinned_commit and requested != library.pinned_commit:
        # Queued before the library was pinned (a scheduled check, an update): a pinned library serves its pin only.
        return JobResult(message=f"{name} is pinned at {library.pinned_commit[:12]}; {requested[:12]} was not fetched")
    kicad_library_store.record_fetch(name, state="fetching", progress=0, error=None)
    checked = [time.monotonic()]

    def on_tick() -> None:
        if time.monotonic() - checked[0] >= _TICK_SECONDS:
            checked[0] = time.monotonic()
            context.check_cancelled()

    def on_progress(percent: int) -> None:
        context.progress(stage="fetching", message=f"Fetching {name}", percent=percent)
        kicad_library_store.record_fetch(name, state="fetching", progress=percent)

    try:
        commit = target_commit(library, requested)
        served = library.published()
        if served is not None and served.commit == commit and served.directory == library.directory_for(commit) \
                and served.source == library.source:
            kicad_library_store.record_published(
                name, commit=commit, ref=library.ref, size_bytes=None, requested_by=requested_by
            )
            return JobResult(message=f"{name} is already at {commit[:12]}")
        size = fetch_version(library, commit, on_progress=on_progress, on_tick=on_tick)
        fresh = _library(name)
        if fresh is not None and fresh.update_policy == "pinned" and fresh.pinned_commit and fresh.pinned_commit != commit:
            # Pinned while this fetch ran: the pin is what serves, and it is usually still on disk.
            commit = fresh.pinned_commit
            size = fetch_version(fresh, commit, on_progress=on_progress, on_tick=on_tick)
    except JobCancelled:
        kicad_library_store.record_fetch(name, state="failed", error="Cancelled")
        raise
    except FetchError as error:
        kicad_library_store.record_fetch(name, state="failed", error=str(error)[:500])
        if error.permanent:
            raise PermanentJobError(str(error), code="library-fetch-failed") from error
        raise RetryableJobError(str(error), code="library-fetch-failed", retry_after_seconds=60) from error
    except Exception as error:
        kicad_library_store.record_fetch(name, state="failed", error="The library could not be fetched; see the job log")
        raise RetryableJobError(str(error), code="library-fetch-failed", retry_after_seconds=60) from error
    kicad_library_store.record_published(name, commit=commit, ref=library.ref, size_bytes=size, requested_by=requested_by)
    logger.info("KiCad library %s is at %s (%s bytes)", name, commit, size)
    return JobResult(message=f"Fetched {name} at {commit[:12]}", details={"sizeBytes": size, "commit": commit})


def unpublish(library_directory: Path) -> None:
    """Stop serving a library at once; its folders go after the grace period."""

    (library_directory / kicad_libraries.PUBLISHED_FILE).unlink(missing_ok=True)
    (library_directory / _REMOVED_FILE).write_text(str(time.time()), encoding="utf-8")


def run_remove_job(context: JobContext) -> JobResult:
    name = str(context.job["payload"].get("name") or "")
    if not name or not kicad_libraries._NAME.fullmatch(name):
        return JobResult(message="Nothing to remove")
    if _library(name) is not None:
        return JobResult(message=f"{name} is declared again; kept")
    directory = kicad_libraries.libraries_root() / name
    if directory.is_dir():
        unpublish(directory)
    return JobResult(message=f"Stopped serving {name}")


def _age(path: Path) -> float | None:
    """Seconds since the time a marker file records, or ``None`` if there is none."""

    try:
        return time.time() - float(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def sweep(
    keep_commits: dict[str, Iterable[str]] | None = None,
    *,
    grace: float = GRACE_SECONDS,
    declared: Iterable[str] | None = None,
    only: str | None = None,
) -> list[str]:
    """Delete what the grace period has passed on: superseded versions, removed libraries, stale partials.

    ``keep_commits`` names, per library, the commits whose objects stay in its
    store (the published and recorded versions); the rest are unreferenced and
    git prunes them a day later. ``declared`` is every library name the
    database holds, read just now: only a folder whose name is not there is a
    removed library. A declared library whose row no longer validates (a host
    the server stopped allowing) is left as it is. ``only`` limits the pass to
    one library's folder: the sweep job holds that library's lock. Returns the
    paths removed.
    """

    root = kicad_libraries.libraries_root()
    removed: list[str] = []
    if not root.is_dir():
        return removed
    valid = {library.name: library for library in kicad_libraries.configured()[0]}
    names = set(valid) if declared is None else set(declared)
    folders = sorted(p for p in root.iterdir() if p.is_dir() and kicad_libraries._NAME.fullmatch(p.name))
    for library_dir in (p for p in folders if only is None or p.name == only):
        library = valid.get(library_dir.name)
        if library is None and library_dir.name in names:
            continue
        if library is None:
            marker = library_dir / _REMOVED_FILE
            age = _age(marker)
            if age is None:
                unpublish(library_dir)
            elif age > grace:
                remove_tree(library_dir, ignore_errors=True)
                removed.append(str(library_dir))
            continue
        published = library.published()
        for entry in list(library_dir.iterdir()):
            if entry.name.endswith(".partial") and entry.is_dir() and time.time() - entry.stat().st_mtime > grace:
                remove_tree(entry, ignore_errors=True)
                removed.append(str(entry))
            elif entry.name.endswith(_SUPERSEDED):
                directory = entry.name[: -len(_SUPERSEDED)]
                age = _age(entry)
                if published is not None and published.directory == directory:
                    entry.unlink(missing_ok=True)
                elif age is not None and age > grace:
                    remove_tree(library_dir / directory, ignore_errors=True)
                    entry.unlink(missing_ok=True)
                    removed.append(str(library_dir / directory))
        if keep_commits is not None:
            _prune_store(library_dir / _STORE, set(keep_commits.get(library.name, ())) | ({published.commit} if published else set()))
    return removed


def _dropped_refs(store: Path, keep: set[str]) -> list[str]:
    """The store's refs a sweep removes: a fetch's temporary ones, and kept versions no longer recorded."""

    if not (store / "HEAD").is_file():
        return []
    listed = subprocess.run(
        _git("for-each-ref", "--format=%(refname)", _KEEP_REF, "refs/prism/fetching/", git_dir=store),
        capture_output=True,
        text=True,
        env=_environment(),
    )
    # A fetch's own temporary refs are done with once it published; the kept versions are the recorded ones.
    return [
        ref for ref in listed.stdout.split() if not ref.startswith(_KEEP_REF) or ref.removeprefix(_KEEP_REF) not in keep
    ]


def _prune_store(store: Path, keep: set[str]) -> None:
    dropped = _dropped_refs(store, keep)
    for ref in dropped:
        subprocess.run(_git("update-ref", "-d", ref, git_dir=store), capture_output=True, env=_environment())
    if dropped:
        subprocess.run(_git("gc", "-q", "--prune=1.day.ago", git_dir=store), capture_output=True, env=_environment())


def run_sweep_job(context: JobContext) -> JobResult:
    """One library's sweep, under its lock, so it never prunes a store a fetch is writing."""

    name = str(context.job["payload"].get("name") or "")
    if not name or not kicad_libraries._NAME.fullmatch(name):
        return JobResult(message="Nothing to sweep")
    # The names come from the database read here, never from a cache that may be empty
    # because the database was unreachable: a folder is only removed if its row is gone.
    names = [row["name"] for row in kicad_library_store.declared()]
    keep = {name: [version["commit"] for version in kicad_library_store.versions(name)]} if name in names else {}
    removed = sweep(keep, declared=names, only=name)
    if removed:
        logger.info("KiCad library sweep removed %s", ", ".join(removed))
    return JobResult(message=f"Swept {name}", details={"removed": len(removed)})


def _needs_sweep(
    library_dir: Path, library: kicad_libraries.Library | None, declared: bool, keep: set[str], grace: float = GRACE_SECONDS
) -> bool:
    """Whether a sweep of this folder would change anything; read only, so it needs no lock."""

    if library is None:
        if declared:
            return False  # a declared row that no longer validates is left alone
        age = _age(library_dir / _REMOVED_FILE)
        return age is None or age > grace
    published = library.published()
    for entry in library_dir.iterdir():
        if entry.name.endswith(".partial") and entry.is_dir() and time.time() - entry.stat().st_mtime > grace:
            return True
        if entry.name.endswith(_SUPERSEDED):
            directory = entry.name[: -len(_SUPERSEDED)]
            age = _age(entry)
            if (published is not None and published.directory == directory) or (age is not None and age > grace):
                return True
    return bool(_dropped_refs(library_dir / _STORE, keep | ({published.commit} if published else set())))


def request_sweeps(*, grace: float = GRACE_SECONDS) -> list[str]:
    """Queue a sweep of every library folder with something to remove; returns their names. For the worker's upkeep.

    A library with nothing to sweep costs no job; one already queued is not queued twice.
    """

    root = kicad_libraries.libraries_root()
    if not root.is_dir():
        return []
    declared = {row["name"] for row in kicad_library_store.declared()}
    kicad_libraries.forget_rows()
    valid = {library.name: library for library in kicad_libraries.configured()[0]}
    queued = []
    for library_dir in sorted(p for p in root.iterdir() if p.is_dir() and kicad_libraries._NAME.fullmatch(p.name)):
        name = library_dir.name
        keep = {version["commit"] for version in kicad_library_store.versions(name)} if name in valid else set()
        if _needs_sweep(library_dir, valid.get(name), name in declared, keep, grace):
            SWEEP.enqueue({"name": name}, subject=_subject(name), artifact_key=f"{SWEEP_KIND}:{name}", requested_by="upkeep")
            queued.append(name)
    return queued


def _subject(name: str) -> JobSubject:
    return JobSubject(lock_key=f"kicad-library:{name}")


def request_fetch(name: str, *, commit: str = "", requested_by: str = "") -> dict[str, Any]:
    """Queue a fetch of ``name`` (at ``commit``, else its pin or its ref); safe to repeat."""

    return FETCH.enqueue(
        {"name": name, **({"commit": commit} if commit else {})}, subject=_subject(name), requested_by=requested_by
    )


def request_removal(library: kicad_libraries.Library, *, requested_by: str = "") -> dict[str, Any] | None:
    """Queue the end of a removed library's service; a path library has nothing of Prism's to remove."""

    if not library.git:
        return None
    return REMOVE.enqueue({"name": library.name}, subject=_subject(library.name), requested_by=requested_by)


def check_remote(url: str, ref: str = "") -> dict[str, Any]:
    """Whether ``url`` answers as a git repository, its tags and branches, and whether ``ref`` is one of them.

    For the console's form: an administrator sees a wrong address or ref before saving.
    """

    url = url.strip()
    try:
        kicad_libraries.check_git_url(url)
        url = remote_url(url)
    except (ValueError, FetchError) as error:
        return {"reachable": False, "error": str(error)}
    try:
        done = subprocess.run(
            _git("ls-remote", "--symref", "--", url, "HEAD", "refs/tags/*", "refs/heads/*"),
            capture_output=True,
            text=True,
            timeout=_REMOTE_TIMEOUT_SECONDS,
            env=_environment(),
        )
    except subprocess.TimeoutExpired:
        return {"reachable": False, "error": f"No answer within {_REMOTE_TIMEOUT_SECONDS} seconds"}
    except OSError as error:
        return {"reachable": False, "error": f"git could not run: {error}"}
    if done.returncode != 0:
        return {"reachable": False, "error": str(_failure(done.stderr, url, "git ls-remote failed"))}
    tags, branches, default = [], [], None
    for line in done.stdout.splitlines():
        first, _, name = line.partition("\t")
        if first.startswith("ref: refs/heads/") and name == "HEAD":
            default = first.removeprefix("ref: refs/heads/")
        elif name.endswith("^{}"):
            continue  # a tag's peeled commit; the tag itself is already listed
        elif name.startswith("refs/tags/"):
            tags.append(name.removeprefix("refs/tags/"))
        elif name.startswith("refs/heads/"):
            branches.append(name.removeprefix("refs/heads/"))
    # Newest tag first (10 before 9), numbered releases before named ones, the default branch before the others.
    tags.sort(key=lambda name: (name[:1].isdigit(), _version_order(name)), reverse=True)
    branches.sort(key=lambda name: (name != default, name))
    ref = ref.strip()
    return {
        "reachable": True,
        "defaultBranch": default,
        "tags": tags[:_MAX_LISTED],
        "branches": branches[:_MAX_LISTED],
        "refFound": (ref in tags or ref in branches) if ref else None,
    }


def _version_order(name: str) -> list[tuple[int, int | str]]:
    """A sort key that reads digit runs as numbers: 10.0.4 after 9.0.9."""

    key: list[tuple[int, int | str]] = [
        (0, int(part)) if part.isdigit() else (1, part) for part in re.split(r"(\d+)", name) if part
    ]
    # A release sorts after its own pre-releases: 10.0.8 is newer than 10.0.8-rc1.
    return [*key, (2, "")]


def queue_missing() -> list[str]:
    """Queue a fetch for every git library with nothing to serve; returns their names. For startup."""

    queued = []
    kicad_libraries.forget_rows()
    libraries, problems = kicad_libraries.configured()
    for problem in problems:
        logger.warning("KiCad libraries: %s", problem)
    for library in libraries:
        if library.path and not library.ready:
            logger.warning("KiCad library %s: %s is not a folder.", library.name, library.path)
        if library.git and not library.ready:
            request_fetch(library.name, requested_by="startup")
            queued.append(library.name)
    return queued


FETCH = JobKind(
    FETCH_KIND,
    run_fetch_job,
    resources={"kicad_library": 1},
    lock=subject_lock("write"),
    priority=PRIORITY,
    max_attempts=3,
)
REMOVE = JobKind(REMOVE_KIND, run_remove_job, lock=subject_lock("write"), priority=PRIORITY, max_attempts=2)
SWEEP = JobKind(SWEEP_KIND, run_sweep_job, lock=subject_lock("write"), priority=PRIORITY, max_attempts=1)
JOB_KINDS = (FETCH, REMOVE, SWEEP)
