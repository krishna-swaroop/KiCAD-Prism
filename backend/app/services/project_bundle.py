"""``board.prism``: the one asset Prism stores per project revision.

A project's sources, its refilled board, the materialized board pack, the
design JSON and the 3D viewer's assets (``viewer/``) go into one archive,
built by ``prism-bundle`` (prism-sim-studio) and keyed like the 3D bundle:
project, source fingerprint and generator build. The 3D tab serves an
unpacked copy (a cache that can be deleted and is rebuilt from the archive),
and Simulation Studio hands the archive to its engines as it is.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

from app.core.config import settings

ARCHIVE_SUFFIX = ".prism"
VIEWER_PREFIX = "viewer/"
PACK_MEMBER = "materialization/board.kmpack"
PACK_FILE = "board.kmpack"
MANIFEST_MEMBER = "bundle.json"
#: Unpacked into the 3D bundle directory beside the viewer files; never a viewer file name.
MANIFEST_FILE = "board.prism.json"


def prism_bundle_binary() -> Path:
    return Path(settings.PRISM_SIM_BIN_DIR) / "prism-bundle"


def available() -> bool:
    return prism_bundle_binary().is_file()


def update_fingerprint(hasher) -> None:
    """A new prism-bundle makes new archives."""

    binary = prism_bundle_binary()
    if binary.is_file():
        hasher.update(b"board-prism-a1")
        hasher.update(hashlib.sha256(binary.read_bytes()).digest())


def archive_path(bundle_dir: Path) -> Path:
    """The archive beside its unpacked directory: ``<source>/<build>.prism``."""

    return bundle_dir.with_name(bundle_dir.name + ARCHIVE_SUFFIX)


def build(project_file: Path, refilled: Path | None, viewer_dir: Path, target: Path, log: list[str]) -> dict[str, Any]:
    """``prism-bundle build`` of the project with ``viewer_dir`` as its viewer assets.

    The zones come from ``refilled`` (a copy the same KiCad refilled), else
    kicad-cli refills them, else the saved fills stand. Returns the manifest.
    """

    from app.services.kicad_tools import locate_kicad_cli
    from app.sim_studio.runs import kicad_cli_version

    command = [str(prism_bundle_binary()), "build", str(project_file), "-o", str(target), "--viewer-dir", str(viewer_dir)]
    cli = locate_kicad_cli()
    if refilled is not None and cli:
        command += ["--refilled-board", str(refilled), "--refill-tool", kicad_cli_version(cli)]
    else:
        command += ["--kicad-cli", cli] if cli else ["--no-refill"]
    completed = subprocess.run(
        command, capture_output=True, text=True, timeout=settings.PRISM_ZONE_REFILL_TIMEOUT_SECONDS, check=False
    )
    log.extend(f"prism-bundle: {line}" for line in completed.stderr.splitlines() if line.strip())
    if completed.returncode != 0:
        lines = [line for line in completed.stderr.splitlines() if line.strip()]
        first = next((line for line in lines if line.lower().startswith("error")), lines[-1] if lines else "")
        raise RuntimeError(f"prism-bundle failed: {first or completed.returncode}")
    return read_manifest(target)


def read_manifest(archive: Path) -> dict[str, Any]:
    with zipfile.ZipFile(archive) as bundle:
        return json.loads(bundle.read(MANIFEST_MEMBER))


def unpack(archive: Path, destination: Path) -> None:
    """The viewer files and the board pack into ``destination``, each checked against the manifest."""

    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read(MANIFEST_MEMBER))
        hashes = {member["path"]: member["sha256"] for member in manifest.get("members") or ()}
        wanted = [path for path in hashes if path.startswith(VIEWER_PREFIX) or path == PACK_MEMBER]
        for path in wanted:
            relative = PACK_FILE if path == PACK_MEMBER else path[len(VIEWER_PREFIX):]
            parts = PurePosixPath(relative).parts
            if not parts or any(part in ("", ".", "..") for part in parts) or PurePosixPath(relative).is_absolute():
                raise RuntimeError(f"board.prism member escapes its directory: {path}")
            out = destination.joinpath(*parts)
            out.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with bundle.open(path) as source, out.open("wb") as sink:
                for chunk in iter(lambda: source.read(1 << 20), b""):
                    digest.update(chunk)
                    sink.write(chunk)
            if digest.hexdigest() != hashes[path]:
                raise RuntimeError(f"board.prism member {path} does not match its manifest hash")
        (destination / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def unpack_into(archive: Path, target: Path) -> None:
    """Replace ``target`` with a fresh unpack of ``archive`` (staged beside it, then renamed)."""

    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f"{target.name}.unpack.", dir=str(target.parent)))
    try:
        unpack(archive, staging)
        if target.exists():
            shutil.rmtree(target)
        staging.rename(target)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def store(built: Path, archive: Path) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    partial = archive.with_name(f".{archive.name}.partial")
    shutil.copyfile(built, partial)
    partial.replace(archive)


def simulation_gate(manifest: dict[str, Any]) -> str | None:
    """Why this bundle cannot be simulated, or None: a failed or skipped schematic cross-check."""

    check = manifest.get("cross_check") or {}
    status = str(check.get("status") or "")
    if status == "skipped":
        return "The project has no schematic, so the board cannot be checked against it for simulation."
    if status == "failed":
        errors = check.get("errors") or []
        first = errors[0].get("message") if errors and isinstance(errors[0], dict) else ""
        more = f" (and {len(errors) - 1} more)" if len(errors) > 1 else ""
        return f"The schematic and board disagree: {first or 'cross-check failed'}{more}"
    return None
