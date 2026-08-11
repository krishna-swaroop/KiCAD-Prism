"""
Storage for assets Prism generates about a project.

Prism renders board thumbnails itself. Those renders used to be written into
``<checkout>/assets/thumbnail/``, inside the user's own Git working tree. That
left every checkout permanently dirty, meant ``git pull`` could refuse to fast
forward once upstream touched the same path, and put Prism's output in the way
of anyone running ``git add -A`` in the repository. For a tool whose whole
premise is that Git stays the source of truth, writing into the source of truth
is the one thing it must not do.

Generated assets therefore live outside every checkout, under the Prism data
directory, keyed by the project's location on disk. The checkout stays exactly
as Git left it.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Thumbnails Prism wrote into checkouts before generated assets were moved out.
# Matched so they can be cleaned up, never so they can be reused.
_LEGACY_THUMBNAIL_PATTERNS = ("thumbnail.*.webp", "thumbnail.png")
_GENERATED_THUMBNAIL_RE = re.compile(r"^thumbnail\.[0-9a-f]{8,}\.webp$")

THUMBNAIL_MEDIA_TYPE = "image/webp"


def derived_root() -> Path:
    """Root of the Prism-owned derived asset tree."""
    return Path(settings.KICAD_PROJECTS_ROOT) / ".kicad-prism" / "derived"


def _project_key(project_path: str | Path) -> str:
    """Stable directory name for a project checkout.

    Keyed by resolved path rather than project id because assets are generated
    during import, before the project row exists.
    """
    resolved = str(Path(project_path).resolve())
    return hashlib.sha256(resolved.encode("utf-8")).hexdigest()[:32]


def thumbnail_dir(project_path: str | Path) -> Path:
    return derived_root() / "thumbnails" / _project_key(project_path)


# A render and an uploaded image are stored side by side under distinct
# prefixes, so replacing one never disturbs the other. That is what lets a user
# drop their upload and get the render back without waiting for kicad-cli.
_PREFIXES = {"generated": "thumbnail", "custom": "custom"}


def _prefix(kind: str) -> str:
    try:
        return _PREFIXES[kind]
    except KeyError:
        raise ValueError(f"Unknown thumbnail kind: {kind}") from None


def store_thumbnail(
    project_path: str | Path, source: Path, *, kind: str = "generated"
) -> tuple[Path, str, int]:
    """Move ``source`` into the derived store, returning (path, digest, size).

    Replaces any thumbnail of the same kind already held for this project, so
    each kind keeps at most one file and stale digests cannot be served.
    """
    prefix = _prefix(kind)
    encoded = source.read_bytes()
    digest = hashlib.sha256(encoded).hexdigest()
    directory = thumbnail_dir(project_path)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{prefix}.{digest[:16]}.webp"
    source.replace(target)
    # Render/encode staging files are created with NamedTemporaryFile and are
    # therefore mode 0600 on Linux.  ``replace`` preserves that mode, but the
    # generated asset is served by nginx (a different uid from the worker), so
    # a successfully rendered thumbnail otherwise becomes unreadable at the
    # final hand-off.  The derived store contains public workspace thumbnails,
    # not credentials; make the completed artifact readable by its serving
    # process while keeping it non-executable and owner-writable only.
    target.chmod(0o644)
    for stale in directory.glob(f"{prefix}.*.webp"):
        if stale != target:
            stale.unlink(missing_ok=True)
    return target, digest, target.stat().st_size


def find_thumbnail(project_path: str | Path, *, kind: str = "generated") -> Optional[Path]:
    """Return the stored thumbnail of ``kind``, if there is one."""
    prefix = _prefix(kind)
    directory = thumbnail_dir(project_path)
    if not directory.is_dir():
        return None
    for candidate in sorted(directory.glob(f"{prefix}.*.webp")):
        if candidate.is_file():
            return candidate
    return None


def discard_thumbnail(project_path: str | Path, *, kind: str) -> bool:
    """Drop the stored thumbnail of ``kind``. Returns whether one was removed."""
    prefix = _prefix(kind)
    directory = thumbnail_dir(project_path)
    if not directory.is_dir():
        return False
    removed = False
    for candidate in directory.glob(f"{prefix}.*.webp"):
        candidate.unlink(missing_ok=True)
        removed = True
    return removed


#: Bounds on an uploaded image. The byte cap keeps a large upload from being
#: read into memory at all; the pixel cap stops a small, highly compressed file
#: from expanding into gigabytes once decoded.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_UPLOAD_PIXELS = 64_000_000
THUMBNAIL_BOX = (640, 480)


class ThumbnailImageError(ValueError):
    """An uploaded file could not be used as a thumbnail."""


def store_uploaded_thumbnail(project_path: str | Path, data: bytes) -> tuple[Path, str, int]:
    """Normalise an uploaded image and store it as the project's custom thumbnail.

    The upload is decoded and re-encoded rather than stored as received. Prism
    serves thumbnails back to every member of the workspace, and handing back
    bytes a user supplied means serving whatever else was hidden in them — a
    polyglot file that a browser sniffs as HTML, or metadata the uploader did
    not mean to publish. Re-encoding produces a file whose only content is the
    pixels, in the one format the rest of the pipeline already emits.
    """
    from PIL import Image, UnidentifiedImageError

    if not data:
        raise ThumbnailImageError("The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ThumbnailImageError(
            f"The image is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    directory = thumbnail_dir(project_path)
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=directory, prefix=".thumbnail-upload-", suffix=".webp", delete=False
    ) as handle:
        encoded_path = Path(handle.name)

    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            if width * height > MAX_UPLOAD_PIXELS:
                raise ThumbnailImageError("The image has too many pixels to process.")
            # Flatten to RGB: WebP has no palette mode, and an alpha channel
            # would show as black once the card draws it over a light surface.
            if image.mode in ("RGBA", "LA", "P"):
                converted = image.convert("RGBA")
                flattened = Image.new("RGB", converted.size, (255, 255, 255))
                flattened.paste(converted, mask=converted.split()[-1])
                image = flattened
            elif image.mode != "RGB":
                image = image.convert("RGB")
            image.thumbnail(THUMBNAIL_BOX, Image.Resampling.LANCZOS)
            for quality in (82, 72, 62):
                image.save(encoded_path, format="WEBP", quality=quality, method=6)
                if encoded_path.stat().st_size <= 250 * 1024:
                    break
        return store_thumbnail(project_path, encoded_path, kind="custom")
    except UnidentifiedImageError as error:
        raise ThumbnailImageError("That file is not an image Prism can read.") from error
    except OSError as error:  # truncated or otherwise undecodable image data
        raise ThumbnailImageError("That image could not be decoded.") from error
    finally:
        encoded_path.unlink(missing_ok=True)


def discard(project_path: str | Path) -> None:
    """Drop every derived asset for a project checkout."""
    shutil.rmtree(thumbnail_dir(project_path), ignore_errors=True)


def purge_legacy_in_tree_thumbnails(project_path: str | Path, repo) -> list[str]:
    """Remove thumbnails an older Prism wrote into the checkout.

    Only files matching Prism's own generated naming *and* untracked by Git are
    touched: an untracked file at that path was written by Prism and never
    committed, so removing it cannot lose anyone's work. A thumbnail the team
    actually committed is tracked, stays put, and continues to take precedence
    over anything Prism renders.
    """
    directory = Path(project_path) / "assets" / "thumbnail"
    if not directory.is_dir():
        return []

    candidates: list[Path] = []
    for pattern in _LEGACY_THUMBNAIL_PATTERNS:
        candidates.extend(path for path in directory.glob(pattern) if path.is_file())
    if not candidates:
        return []

    try:
        tracked_output = repo.git.ls_files("--", str(directory))
    except Exception:
        # Without a reliable tracked-file list, leave the checkout alone.
        return []
    tracked = {
        (Path(repo.working_tree_dir) / line).resolve()
        for line in tracked_output.splitlines()
        if line.strip()
    }

    removed: list[str] = []
    for candidate in candidates:
        if candidate.resolve() in tracked:
            continue
        if candidate.name != "thumbnail.png" and not _GENERATED_THUMBNAIL_RE.match(candidate.name):
            continue
        candidate.unlink(missing_ok=True)
        removed.append(candidate.name)

    if removed:
        logger.info(
            "Removed %d Prism-generated thumbnail(s) from the checkout at %s",
            len(removed),
            project_path,
        )
        try:
            next(directory.iterdir())
        except StopIteration:
            directory.rmdir()
    return removed
