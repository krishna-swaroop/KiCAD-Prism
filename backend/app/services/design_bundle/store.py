"""The bundle store and its unpacked cache (bundle-format.md §8, ADR §5).

```text
<root>/<project_id>/<revision_key>/
  <generator_digest>.prism        the archive, rewritten per stage by prism-kicad
  <generator_digest>.prism.verified
                                  the manifest_sha256 `bundle verify` accepted (C2r §2 item 9)
  <generator_digest>/             unpacked cache; can always be deleted
    <manifest_sha256>/            one archive version
      bundle.json                 written first
      <member path>               extracted lazily, verified, never modified
```

The CLI writes the archive itself (``-o`` is :func:`archive_path`), so the
store only creates directories, opens and validates archives, extracts
members, and deletes. A file in a version directory is always verified: it is
written to a temporary name beside its target, checked for size and SHA-256,
then renamed, and nothing below a version directory is ever followed through a
symbolic link. Extracting refreshes the version directory's mtime, which is how
:func:`prune_cache_store` tells a directory a reader is using from an idle one;
that sweep never touches the archive or its marker. The marker beside the
archive records that ``bundle verify`` accepted its current manifest; it gates
step 7 on reads (bundle-format.md §9) and is removed with the archive.
"""

from __future__ import annotations

import dataclasses
import logging
import json
import os
import re
import shutil
import stat
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, BinaryIO, Callable, Iterable, Mapping

from app.core.config import settings
from app.services.design_bundle.archive import MANIFEST, Archive, BundleInvalid, open_archive

logger = logging.getLogger(__name__)

_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_PROJECT_ID = re.compile(r"^[A-Za-z0-9._-]{1,200}$")
_STALE_TEMP = re.compile(r"^\..+\.prism-kicad-\d+-\d+\.tmp$")
TEMP_MAX_AGE_SECONDS = 3600


def root() -> Path:
    configured = settings.PRISM_DESIGN_BUNDLE_ROOT.strip()
    if configured:
        return Path(configured).expanduser()
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "bundles"


def _checked(project_id: str, revision_key: str, generator_digest: str | None = None) -> None:
    if not _PROJECT_ID.match(project_id) or project_id in (".", ".."):
        raise ValueError(f"unusable project id for the bundle store: {project_id!r}")
    if not _HEX64.match(revision_key) or (generator_digest is not None and not _HEX64.match(generator_digest)):
        raise ValueError("revision key and generator digest are 64 lowercase hex digits")


def revision_dir(project_id: str, revision_key: str) -> Path:
    _checked(project_id, revision_key)
    return root() / project_id / revision_key


def archive_path(project_id: str, revision_key: str, generator_digest: str) -> Path:
    _checked(project_id, revision_key, generator_digest)
    return revision_dir(project_id, revision_key) / f"{generator_digest}.prism"


def marker_path(project_id: str, revision_key: str, generator_digest: str) -> Path:
    _checked(project_id, revision_key, generator_digest)
    return revision_dir(project_id, revision_key) / f"{generator_digest}.prism.verified"


def models_record_path(project_id: str, revision_key: str, generator_digest: str) -> Path:
    _checked(project_id, revision_key, generator_digest)
    return revision_dir(project_id, revision_key) / f"{generator_digest}.models.json"


def write_models_record(project_id: str, revision_key: str, generator_digest: str, record: Mapping[str, Any]) -> None:
    """Record the KiCad path variables a bundle's models were exported with, and what each pointed at.

    The archive format has no place for them, and a board's models resolve
    through them: a bundle built before a library was ready has a component GLB
    without that library's models. Best effort: a bundle with no record is
    judged from its placements, so a failed write never causes a rebuild.
    """

    path = models_record_path(project_id, revision_key, generator_digest)
    temp = path.parent / f".{path.name}.prism-kicad-{os.getpid()}-{time.monotonic_ns()}.tmp"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp.write_text(json.dumps(dict(record), sort_keys=True), encoding="utf-8")
        os.replace(temp, path)
    except OSError:
        temp.unlink(missing_ok=True)
        logger.warning("Could not record the models of bundle %s/%s", project_id, revision_key, exc_info=True)


def read_models_record(project_id: str, revision_key: str, generator_digest: str) -> dict[str, Any] | None:
    """The record written by :func:`write_models_record`, or ``None`` for a bundle with none."""

    try:
        value = json.loads(models_record_path(project_id, revision_key, generator_digest).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) and isinstance(value.get("variables"), dict) else None


def write_marker(archive: Archive, project_id: str, revision_key: str, generator_digest: str) -> None:
    """Record that ``bundle verify`` accepted ``archive``'s current manifest.

    The content is the verified ``manifest_sha256``, one trailing LF. It is
    written to a temporary name in the same directory and renamed, so a reader
    sees either the previous marker or the new one, never a partial line.
    """

    path = marker_path(project_id, revision_key, generator_digest)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.parent / f".{path.name}.prism-kicad-{os.getpid()}-{time.monotonic_ns()}.tmp"
    try:
        with open(temp, "w", encoding="ascii", newline="\n") as handle:
            handle.write(archive.manifest_sha256 + "\n")
        os.replace(temp, path)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def _marked_manifest(path: Path) -> str | None:
    try:
        info = os.lstat(path)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 80:
            return None
        return path.read_text(encoding="ascii").strip()
    except (OSError, UnicodeDecodeError):
        return None


def cache_dir(project_id: str, revision_key: str, generator_digest: str) -> Path:
    _checked(project_id, revision_key, generator_digest)
    return revision_dir(project_id, revision_key) / generator_digest


def prepare(project_id: str, revision_key: str, generator_digest: str) -> Path:
    """The archive path, with its directory created (the CLI creates none)."""

    path = archive_path(project_id, revision_key, generator_digest)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


#: Validated archives (bundle-format.md §9 steps 1-5), by file identity. Every
#: design-data read opened and re-checked the same archive: ~0.2 s each.
_opened: "OrderedDict[tuple[Any, ...], Archive]" = OrderedDict()
_OPENED_MAX = 64
_opened_lock = threading.Lock()


def open_bundle(project_id: str, revision_key: str, generator_digest: str, bundle_key: str) -> Archive | None:
    """The stored archive, validated (§9 steps 1-5), or ``None``.

    A rejected archive is treated like a missing one: it is deleted with its
    cache, and the caller queues a rebuild (bundle-format.md §9).
    """

    path = archive_path(project_id, revision_key, generator_digest)
    try:
        info = path.stat()
    except OSError:
        return None
    # A stored archive is replaced by rename, never edited in place, so the
    # same inode, size and mtime are the same validated archive.
    identity = (str(path), info.st_ino, info.st_size, info.st_mtime_ns, bundle_key)
    with _opened_lock:
        archive = _opened.get(identity)
        if archive is not None:
            _opened.move_to_end(identity)
    if archive is None:
        try:
            archive = open_archive(path, expected_bundle_key=bundle_key)
        except BundleInvalid as error:
            logger.warning("Deleting rejected bundle %s: %s", path, error)
            delete(project_id, revision_key, generator_digest)
            return None
        with _opened_lock:
            _opened[identity] = archive
            while len(_opened) > _OPENED_MAX:
                _opened.popitem(last=False)
    # A marker that names another manifest is stale: the archive was rewritten
    # since it was verified, so step 7 runs as usual.
    # The cached archive is shared; each caller gets its own verified flag.
    verified = _marked_manifest(marker_path(project_id, revision_key, generator_digest)) == archive.manifest_sha256
    return dataclasses.replace(archive, verified=verified)


def delete(project_id: str, revision_key: str, generator_digest: str) -> None:
    archive_path(project_id, revision_key, generator_digest).unlink(missing_ok=True)
    marker_path(project_id, revision_key, generator_digest).unlink(missing_ok=True)
    models_record_path(project_id, revision_key, generator_digest).unlink(missing_ok=True)
    shutil.rmtree(cache_dir(project_id, revision_key, generator_digest), ignore_errors=True)
    _remove_empty(revision_dir(project_id, revision_key))


def _remove_empty(directory: Path) -> None:
    for candidate in (directory, directory.parent):
        try:
            candidate.rmdir()
        except OSError:
            return


def remove_other_generators(project_id: str, revision_key: str, keep_digest: str) -> list[str]:
    """ADR §5: a revision keeps only its newest generator's bundle. Returns the removed digests."""

    directory = revision_dir(project_id, revision_key)
    removed = []
    if not directory.is_dir():
        return removed
    for item in directory.iterdir():
        for suffix in (".models.json", ".prism.verified", ".prism"):
            if item.name.endswith(suffix):
                digest = item.name[: -len(suffix)]
                break
        else:
            digest = item.name
        if _HEX64.match(digest) and digest != keep_digest:
            if item.is_dir() and not item.is_symlink():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)
            removed.append(digest)
    return sorted(set(removed))


# ---------------------------------------------------------------- unpacked cache


def version_dir(archive: Archive, project_id: str, revision_key: str, generator_digest: str) -> Path:
    return cache_dir(project_id, revision_key, generator_digest) / archive.manifest_sha256


def _no_link_below(base: Path, target: Path) -> None:
    current = base
    for part in target.relative_to(base).parts[:-1]:
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            current.mkdir(mode=0o755)
            continue
        if not stat.S_ISDIR(info.st_mode):
            raise BundleInvalid("archive-path-collision", f"{current.name} is not a directory")


def _install(base: Path, target: Path, write: Callable[[BinaryIO], None], size: int) -> None:
    _no_link_below(base, target)
    try:
        info = os.lstat(target)
    except FileNotFoundError:
        info = None
    if info is not None:
        if stat.S_ISREG(info.st_mode) and info.st_size == size:
            return  # files are verified before they are renamed into a version directory
        raise BundleInvalid("archive-path-collision", f"{target.name} is in the way")
    temp = target.parent / f".{target.name}.{os.getpid()}.{time.monotonic_ns()}.part"
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o644)
    try:
        with os.fdopen(fd, "wb") as handle:
            write(handle)
        os.chmod(temp, 0o644)
        os.replace(temp, target)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def extract(
    archive: Archive, project_id: str, revision_key: str, generator_digest: str, paths: Iterable[str]
) -> Path:
    """Extract ``paths`` (exact member paths, or prefixes ending in ``/``) into the archive's version directory."""

    base = version_dir(archive, project_id, revision_key, generator_digest)
    base.mkdir(parents=True, exist_ok=True, mode=0o755)
    # Retention reads this mtime to tell a directory a reader is using from an
    # idle one. A reader that only re-reads already extracted files would
    # otherwise leave it at the time the first member was written.
    _touch(base)
    manifest_bytes = archive.manifest_bytes
    _install(base, base / MANIFEST, lambda handle: handle.write(manifest_bytes), len(manifest_bytes))
    members = archive.manifest["members"]
    for wanted in paths:
        chosen = [m for m in members if (m["path"].startswith(wanted) if wanted.endswith("/") else m["path"] == wanted)]
        if not chosen:
            raise BundleInvalid("member-not-found", f"{wanted} selects nothing", wanted)
        for member in chosen:
            target = base / member["path"]
            _install(base, target, lambda handle, path=member["path"]: archive.stream(path, handle), member["bytes"])
    _touch(base)
    return base


def _touch(path: Path) -> None:
    try:
        os.utime(path, None)
    except OSError:
        pass


#: One unpacked version directory, as the store-wide cache sweep sees it.
@dataclasses.dataclass
class _CacheVersion:
    path: Path
    key: tuple[str, str, str]
    bytes: int
    accessed: float


def _tree_bytes(path: Path) -> int:
    """Bytes of the regular files below ``path``; symbolic links are never followed."""

    total = 0
    stack = [path]
    while stack:
        current = stack.pop()
        try:
            entries = list(os.scandir(current))
        except OSError:
            continue
        for entry in entries:
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    stack.append(Path(entry.path))
                elif entry.is_file(follow_symlinks=False):
                    total += entry.stat(follow_symlinks=False).st_size
            except OSError:
                continue
    return total


def _subdirectories(path: Path) -> list[Path]:
    try:
        return [item for item in path.iterdir() if item.is_dir() and not item.is_symlink()]
    except OSError:
        return []


def prune_cache_store(
    *,
    keep: Mapping[tuple[str, str, str], str],
    last_used: Mapping[tuple[str, str, str], float] | None = None,
    grace_seconds: float,
    idle_before: float,
    max_bytes: int,
    max_bytes_per_project: int,
    now: float | None = None,
) -> dict[str, int]:
    """Tighten the unpacked caches: superseded versions, idle archives, then caps (ADR §5, §8).

    ``keep`` maps a cache key to the archive's current ``manifest_sha256``.
    Version directories of that key other than ``keep``'s go after
    ``grace_seconds``; all of an archive's version directories go once its last
    read (``last_used``, else the directory's own mtime) is older than
    ``idle_before``; then the least recently used directories go until the
    project and store stay under their byte caps. A directory whose mtime is
    inside the grace period -- or, for the caps, whose archive was read inside
    it -- is never removed: that is the reader that may be using it right now.
    Symbolic links are never followed, and only keys named by ``keep`` are
    touched.

    The archive and its marker are not part of this: a removed cache is
    re-extracted from the archive on the next read.
    """

    now = time.time() if now is None else now
    cutoff = now - max(0.0, grace_seconds)
    report = {
        "versions": 0, "idle_versions": 0, "idle_bytes": 0,
        "capped_versions": 0, "capped_bytes": 0, "cache_bytes": 0,
    }
    base = root()
    if base.is_symlink() or not base.is_dir():
        return report
    entries: list[_CacheVersion] = []
    for project in _subdirectories(base):
        for revision in _subdirectories(project):
            if not _HEX64.match(revision.name):
                continue
            for digest in _subdirectories(revision):
                if not _HEX64.match(digest.name):
                    continue
                key = (project.name, revision.name, digest.name)
                current = keep.get(key)
                if current is None:
                    continue
                versions = [item for item in _subdirectories(digest) if _HEX64.match(item.name)]
                accessed: dict[str, float] = {}
                for item in versions:
                    try:
                        accessed[item.name] = item.lstat().st_mtime
                    except OSError:
                        continue
                # Superseded manifest versions: a reader that opened the earlier
                # archive keeps its own directory until the grace period ends.
                for name, mtime in list(accessed.items()):
                    if name == current or mtime >= cutoff:
                        continue
                    shutil.rmtree(digest / name, ignore_errors=True)
                    accessed.pop(name)
                    report["versions"] += 1
                newest = max(accessed.values(), default=now)
                # The archive row's last read is the recency signal; a directory
                # mtime only says when it was last written. Either inside the
                # grace period still protects a directory from the caps.
                last_read = newest if last_used is None else float(last_used.get(key, newest))
                # Idle: the archive stays, its unpacked members do not.
                if last_read < idle_before:
                    for name, mtime in list(accessed.items()):
                        if mtime >= cutoff:
                            continue
                        size = _tree_bytes(digest / name)
                        shutil.rmtree(digest / name, ignore_errors=True)
                        accessed.pop(name)
                        report["idle_versions"] += 1
                        report["idle_bytes"] += size
                for name, mtime in accessed.items():
                    entries.append(
                        _CacheVersion(digest / name, key, _tree_bytes(digest / name), max(last_read, mtime))
                    )
                _remove_empty(digest)

    def _evict(group: list[_CacheVersion], cap: int, *, versions_key: str, bytes_key: str) -> None:
        if cap <= 0:
            return
        remaining = sum(entry.bytes for entry in group)
        for entry in sorted(group, key=lambda item: (item.accessed, str(item.path))):
            if remaining <= cap:
                return
            # Inside the grace period the reader may still be using it.
            if entry.accessed >= cutoff:
                continue
            shutil.rmtree(entry.path, ignore_errors=True)
            remaining -= entry.bytes
            report[versions_key] += 1
            report[bytes_key] += entry.bytes
            entry.bytes = 0

    projects: dict[str, list[_CacheVersion]] = {}
    for entry in entries:
        projects.setdefault(entry.key[0], []).append(entry)
    for group in projects.values():
        _evict(group, max_bytes_per_project, versions_key="capped_versions", bytes_key="capped_bytes")
    _evict(entries, max_bytes, versions_key="capped_versions", bytes_key="capped_bytes")
    report["cache_bytes"] = sum(entry.bytes for entry in entries)
    return report


def sweep_temporary_files(*, now: float | None = None) -> int:
    """cli-spec.md §5.2.5: delete the CLI's ``.*.prism-kicad-*.tmp`` files older than an hour."""

    base = root()
    if not base.is_dir():
        return 0
    cutoff = (now if now is not None else time.time()) - TEMP_MAX_AGE_SECONDS
    removed = 0
    for project in base.iterdir():
        if not project.is_dir() or project.is_symlink():
            continue
        for revision in project.iterdir():
            if not revision.is_dir() or revision.is_symlink():
                continue
            for item in revision.iterdir():
                if _STALE_TEMP.match(item.name) and item.is_file() and item.lstat().st_mtime < cutoff:
                    item.unlink(missing_ok=True)
                    removed += 1
    return removed


def stored_bytes(project_id: str) -> int:
    """Bytes the project's archives hold (ADR §11 G2: sizes are reported).

    Only the ``<generator digest>.prism`` files beside each revision key: the
    unpacked cache under them is disposable and swept on its own
    (``prune_cache_store``). Walking it statted every extracted source of every
    version, which took seconds on a large project over a bind mount.
    """

    base = root() / project_id
    total = 0
    try:
        revisions = list(os.scandir(base))
    except OSError:
        return 0
    for revision in revisions:
        if not revision.is_dir(follow_symlinks=False):
            continue
        try:
            entries = list(os.scandir(revision.path))
        except OSError:
            continue
        for entry in entries:
            if entry.name.endswith(".prism") and entry.is_file(follow_symlinks=False):
                try:
                    total += entry.stat(follow_symlinks=False).st_size
                except OSError:
                    continue
    return total
