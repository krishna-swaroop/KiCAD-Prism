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

import json
import logging
import os
import re
import shutil
import subprocess
import tarfile
import time
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable

from app.services import kicad_libraries, kicad_library_store
from app.services.job_kinds import JobKind, JobSubject, subject_lock
from app.services.job_runtime import JobCancelled, JobContext, JobResult, PermanentJobError, RetryableJobError
from app.services.process_tree import group_popen_kwargs, kill_tree
from app.services.tree_removal import remove_tree

logger = logging.getLogger(__name__)

FETCH_KIND = "kicad_library_fetch"
REMOVE_KIND = "kicad_library_remove"
# After the interactive work and before the tracker's background polling.
PRIORITY = 200
#: The protocols git may use for a library. Tests add ``file``; production never does.
ALLOWED_PROTOCOLS: tuple[str, ...] = ("https",)
#: A fetch refuses to start, and stops, when the volume has less than this free.
MIN_FREE_BYTES = 2 * 1024**3
#: A superseded or removed version stays this long, longer than any job that could be reading it.
GRACE_SECONDS = 6 * 3600
_REMOTE_TIMEOUT_SECONDS = 30
# Cancellation and free space are checked this often while git runs.
_TICK_SECONDS = 2.0
_SUPERSEDED = ".superseded"
_REMOVED_FILE = "removed.json"
_STORE = "store.git"
_KEEP_REF = "refs/prism/keep/"
_PHASES = (("Receiving objects", 0, 70), ("Resolving deltas", 70, 80))
_PERCENT = re.compile(r"^(?:remote:\s*)?(?P<phase>[A-Za-z ]+):\s+(?P<percent>\d+)%")
# The console lists this many of a repository's tags and branches.
_MAX_LISTED = 100
_COMMIT = re.compile(r"[0-9a-f]{40}")


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
    """``git`` with only the allowed protocols, no credential helper and nothing to prompt with."""

    command = ["git", "-c", "protocol.allow=never"]
    for protocol in ALLOWED_PROTOCOLS:
        command += ["-c", f"protocol.{protocol}.allow=always"]
    command += ["-c", "credential.helper=", "-c", "core.askPass="]
    if git_dir is not None:
        command += ["--git-dir", str(git_dir)]
    return [*command, *args]


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1][:300] if lines else ""


def resolve_remote(url: str, ref: str) -> str:
    """The commit ``ref`` points at on the remote (a tag's own commit, not the tag object)."""

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
        raise FetchError(_last_line(done.stderr) or "git ls-remote failed")
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


def _require_space(directory: Path) -> None:
    if free_bytes(directory) < MIN_FREE_BYTES:
        raise FetchError(
            f"Less than {MIN_FREE_BYTES // 1024**3} GB free where the libraries are stored; free some space"
        )


def _run_streaming(
    command: list[str],
    *,
    on_progress: Callable[[int], None],
    on_tick: Callable[[], None],
    cwd: Path | None = None,
) -> tuple[int, str]:
    """Run a git command, reading its progress from stderr; returns (exit code, last stderr line)."""

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
    tail, last, ticked = "", -1, time.monotonic()
    try:
        # git redraws a progress line with carriage returns; read it as lines of either kind.
        for chunk in process.stderr:
            for line in chunk.replace("\r", "\n").splitlines():
                tail = line.strip() or tail
                percent = progress_of(line)
                if percent is not None and percent != last:
                    last = percent
                    on_progress(percent)
            if time.monotonic() - ticked >= _TICK_SECONDS:
                ticked = time.monotonic()
                on_tick()
        return process.wait(), tail
    except BaseException:
        kill_tree(process)
        process.wait()
        raise


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
    """Make ``commit`` present in the library's object store, downloading only what it adds."""

    store = library.clone_dir / _STORE
    _ensure_store(store)
    if not _has_commit(store, commit):
        _require_space(library.clone_dir)
        flags = ["--depth", "1", "--no-tags", "--no-write-fetch-head", "--progress"]
        code, tail = _run_streaming(
            _git("fetch", *flags, "--", library.git, commit, git_dir=store), on_progress=on_progress, on_tick=on_tick
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
                    _git("fetch", *flags, "--", library.git, spec, git_dir=store),
                    on_progress=on_progress,
                    on_tick=on_tick,
                )
                fetched = fetched or code == 0
                if _has_commit(store, commit):
                    break
            if not _has_commit(store, commit):
                if fetched:
                    raise FetchError(f"{library.ref} moved while it was being fetched; it will be checked again")
                raise FetchError(f"git fetch failed: {tail}")
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


def extract_version(
    library: kicad_libraries.Library,
    commit: str,
    destination: Path,
    *,
    on_tick: Callable[[], None] = lambda: None,
) -> int:
    """Write ``commit``'s library folder into ``destination``; returns the bytes written."""

    store = library.clone_dir / _STORE
    command = _git("archive", "--format=tar", commit, git_dir=store)
    if library.subdir:
        command += ["--", library.subdir]
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=_environment(), **group_popen_kwargs()
    )
    assert process.stdout is not None and process.stderr is not None
    total, ticked = 0, time.monotonic()
    try:
        destination.mkdir(parents=True)
        unreadable = False
        try:
            with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
                for member in archive:
                    allowed = _checked_member(member)
                    if allowed is None:
                        continue
                    if hasattr(tarfile, "data_filter"):
                        archive.extract(allowed, destination, set_attrs=False, filter="data")
                    else:  # pragma: no cover - Python without extraction filters
                        archive.extract(allowed, destination, set_attrs=False)
                    total += allowed.size if allowed.isreg() else 0
                    if time.monotonic() - ticked >= _TICK_SECONDS:
                        ticked = time.monotonic()
                        on_tick()
                        if free_bytes(destination) < MIN_FREE_BYTES // 4:
                            raise FetchError("The volume ran out of space while the library was being written")
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
    return total


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
    """Serve ``directory`` as the library's version from now on; the one it replaces starts its grace period."""

    before = library.published()
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
        extract_version(library, commit, partial, on_tick=on_tick)
        if library.subdir and not (partial / library.subdir).is_dir():
            remove_tree(partial, ignore_errors=True)
            raise FetchError(f"The repository has no folder {library.subdir!r} at this commit", permanent=True)
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


def sweep(keep_commits: dict[str, Iterable[str]] | None = None, *, grace: float = GRACE_SECONDS) -> list[str]:
    """Delete what the grace period has passed on: superseded versions, removed libraries, stale partials.

    ``keep_commits`` names, per library, the commits whose objects stay in its
    store (the published and recorded versions); the rest are unreferenced and
    git prunes them a day later. Returns the paths removed.
    """

    root = kicad_libraries.libraries_root()
    removed: list[str] = []
    if not root.is_dir():
        return removed
    declared = {library.name: library for library in kicad_libraries.configured()[0]}
    for library_dir in sorted(p for p in root.iterdir() if p.is_dir() and kicad_libraries._NAME.fullmatch(p.name)):
        library = declared.get(library_dir.name)
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


def _prune_store(store: Path, keep: set[str]) -> None:
    if not (store / "HEAD").is_file():
        return
    listed = subprocess.run(
        _git("for-each-ref", "--format=%(refname)", _KEEP_REF, "refs/prism/fetching/", git_dir=store),
        capture_output=True,
        text=True,
        env=_environment(),
    )
    # A fetch's own temporary refs are done with once it published; the kept versions are the recorded ones.
    dropped = [
        ref for ref in listed.stdout.split() if not ref.startswith(_KEEP_REF) or ref.removeprefix(_KEEP_REF) not in keep
    ]
    for ref in dropped:
        subprocess.run(_git("update-ref", "-d", ref, git_dir=store), capture_output=True, env=_environment())
    if dropped:
        subprocess.run(_git("gc", "-q", "--prune=1.day.ago", git_dir=store), capture_output=True, env=_environment())


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
    except ValueError as error:
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
        return {"reachable": False, "error": _last_line(done.stderr) or "git ls-remote failed"}
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
JOB_KINDS = (FETCH, REMOVE)
