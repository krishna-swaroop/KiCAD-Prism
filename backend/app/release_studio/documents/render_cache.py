"""The cover render cache: one raytraced PNG per exact set of render inputs.

``kicad-cli pcb render --quality high`` is the most expensive acquisition a
release makes: minutes of CPU and well over a gigabyte of memory on a 50 MB
board, even when the board has not changed since the last build.  This module
stores that PNG under ``KICAD_PROJECTS_ROOT/.kicad-prism/render-cache``, keyed
by everything that decides its pixels:

* the board's bytes and name,
* every 3D-model and project file under the board's directory that KiCad can
  resolve relative to it (``KIPRJMOD`` is the board's directory when no
  project is open, so a model the render resolves is one of these),
* the ``KICAD*_3DMODEL_DIR`` and ``KICAD_CONFIG_HOME`` bindings the render
  resolves stock models and user settings through,
* the executor image identity, which pins the image's model library,
* the render arguments (quality, floor, perspective, rotation, size), and
* the ``kicad-cli`` version.

Nothing time-varying is hashed: the output path, the working directory and the
staging root never enter the key, so the same board rendered into a different
build directory hits the same entry.  A hit returns the bytes the first render
produced, which is what makes a repeated build's dossier identical -- the
raytracer itself samples non-deterministically.

Entries are published atomically (write a ``.part`` beside the entry, rename it
into place), so a reader never sees a half-written PNG and a crashed writer
leaves nothing but a part file that retention sweeps.  A cached entry is only
ever read, never modified in place; removing one a render is about to read at
worst renders it again.
"""

from __future__ import annotations

import hashlib
import os
import re
import threading
from pathlib import Path
from typing import Any, Mapping, Sequence

from app.core.config import settings
from app.services import kicad_libraries

#: Bump when the key or the stored payload changes, so old entries stop matching.
CACHE_VERSION = "board-render-v1"

#: A ``.part`` file older than this died before its rename; the GLB cache's grace.
PART_GRACE_SECONDS = 3600

#: Files a render may open through ``KIPRJMOD``: 3D models, and the project and
#: rules files that travel with a board.  Suffixes are the loadable ones in
#: ``release_studio.closure_models``; deciding by suffix is not a board parse,
#: and a model the board does not name only costs a hit that could have been.
_RENDER_INPUT_SUFFIXES = frozenset(
    {
        ".step", ".stp", ".stepz", ".stpz", ".gz",
        ".wrl", ".wrz", ".vrml", ".x3d", ".igs", ".iges", ".idf", ".emn",
        ".wings",
        ".kicad_pro", ".kicad_dru",
    }
)

#: The image's KiCad environment; a change here changes which stock models open
#: and which user configuration the renderer reads.
_KEYED_ENVIRONMENT = re.compile(r"(?:KICAD\d*_3DMODEL_DIR|KICAD_CONFIG_HOME)")

#: The pinned executor identity, baked into the runtime (R00a).
EXECUTOR_IDENTITY_FILE = Path("/etc/prism/kicad-base-image")

_CHUNK = 1024 * 1024


def cache_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "render-cache"


def cache_key(
    *,
    board: Path,
    render_args: Sequence[str],
    cli_version: str,
    environ: Mapping[str, str] | None = None,
) -> str:
    """The key for one render of *board* with *render_args* on this toolchain.

    *render_args* is the render command with the output path and the board's
    location replaced by path-independent markers; those two host paths are not
    render inputs, while the board's own bytes are folded in separately.
    """

    parts = [
        CACHE_VERSION.encode("utf-8"),
        _executor_identity().encode("utf-8"),
        str(cli_version or "unknown").encode("utf-8"),
        board.name.encode("utf-8"),
        _board_inputs_digest(board).encode("ascii"),
        *(str(argument).encode("utf-8") for argument in render_args),
    ]
    # A library's variable is keyed by what the library is, not by where it is
    # mounted: the same library on another host renders the same bytes. Every
    # bound variable counts, so a board that uses it re-renders when it changes.
    bound = {name: binding.fingerprint for name, binding in kicad_libraries.current().bindings.items()}
    for name, value in sorted((environ if environ is not None else os.environ).items()):
        if name not in bound and value and _KEYED_ENVIRONMENT.fullmatch(name):
            parts.append(b"env")
            parts.append(name.encode("utf-8"))
            parts.append(str(value).encode("utf-8"))
    for name, fingerprint in sorted(bound.items()):
        parts.append(b"library")
        parts.append(name.encode("utf-8"))
        parts.append(fingerprint.encode("utf-8"))
    return hashlib.sha256(b"\0".join(parts)).hexdigest()


def load(key: str) -> bytes | None:
    """The cached PNG for *key*, or ``None`` when there is no usable entry."""

    path = cache_root() / f"{key}.png"
    try:
        payload = path.read_bytes()
    except OSError:
        return None
    _stamp(path)
    return payload


def store(key: str, payload: bytes) -> None:
    """Publish *payload* for *key* atomically; a failure publishes nothing."""

    root = cache_root()
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{key}.png"
    temp = target.with_name(f".{target.name}.{os.getpid()}.{threading.get_ident()}.part")
    try:
        temp.write_bytes(payload)
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)


def prune(*, unused_before: float, now: float) -> dict[str, int]:
    """Retention's pass over the render cache: drop PNGs unused since *unused_before*.

    Returns the entries removed and the bytes the cache still holds.  Part
    files older than the grace period are swept too: their writer died before
    the rename and no reader can use them.
    """

    removed, kept_bytes = 0, 0
    root = cache_root()
    if not root.is_dir():
        return {"removed": 0, "bytes": 0}
    for item in root.iterdir():
        try:
            info = item.stat()
        except OSError:
            continue
        stale_part = item.name.endswith(".part") and info.st_mtime < now - PART_GRACE_SECONDS
        if stale_part or (item.suffix == ".png" and info.st_mtime < unused_before):
            item.unlink(missing_ok=True)
            removed += item.suffix == ".png"
        else:
            kept_bytes += info.st_size
    return {"removed": removed, "bytes": kept_bytes}


def _stamp(path: Path) -> None:
    """Mark a cached entry used, so retention evicts by last use."""

    try:
        os.utime(path, None)
    except OSError:
        pass  # a lost stamp only makes eviction earlier


def _executor_identity() -> str:
    """The baked image identity, or ``unpinned`` on a dev host without one."""

    try:
        return EXECUTOR_IDENTITY_FILE.read_text(encoding="utf-8").strip() or "unpinned"
    except OSError:
        return "unpinned"


def _board_inputs_digest(board: Path) -> str:
    """SHA-256 over the board and every file beside it a render may open.

    The walk is bounded by the board's own directory: KiCad expands
    ``KIPRJMOD`` to that directory when no project is open, and every relative
    model reference in the bundle's board is resolved from it.
    """

    digest = hashlib.sha256(b"board-render-inputs-v1\0")
    _feed(digest, board.name, board)

    root = board.parent
    if root == Path(root.anchor):
        # A board at the filesystem root has no bounded directory to walk.
        return digest.hexdigest()
    entries: list[tuple[str, Path]] = []
    for directory, subdirectories, names in os.walk(root, followlinks=False):
        subdirectories.sort()
        for name in sorted(names):
            path = Path(directory) / name
            if path == board or path.suffix.casefold() not in _RENDER_INPUT_SUFFIXES:
                continue
            try:
                if not path.is_file():
                    continue
            except OSError:
                continue
            entries.append((path.relative_to(root).as_posix(), path))
    for relative, path in sorted(entries):
        _feed(digest, relative, path)
    return digest.hexdigest()


def _feed(digest: Any, name: str, path: Path) -> None:
    """Fold one file's name and bytes into *digest*, chunked and stat-guarded."""

    try:
        info = path.stat()
    except OSError:
        digest.update(f"{name}\0absent\0".encode("utf-8"))
        return
    digest.update(f"{name}\0{info.st_size}\0".encode("utf-8"))
    try:
        with path.open("rb") as handle:
            while chunk := handle.read(_CHUNK):
                digest.update(chunk)
    except OSError:
        digest.update(b"\0unreadable\0")
    digest.update(b"\0")
