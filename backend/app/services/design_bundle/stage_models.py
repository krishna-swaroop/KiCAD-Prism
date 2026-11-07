"""The models stage's KiCad step: ``kicad-cli-glb-a0`` (cli-spec.md §9.3).

Created by WP-K as the hook the job calls; WP-V1 owns it from Wave 2 (parity
with today's component export, divergences, the board-body and mask facts).

The export runs in a copy of the bundle's ``sources/`` so models resolve
through ``${KIPRJMOD}`` to the bundled repository models and through
``KICAD*_3DMODEL_DIR`` to the image's stock library. Its output is always
named ``components.glb`` (cli-spec.md §5.2.4). Results are cached by the
source board's blob id, the repository model blobs, the commits of the
submodules (whose models are expanded only at materialization), the
generator's KiCad version and models procedure (ADR §4.4).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Callable, Mapping

from app.core.config import settings
from app.services import kicad_libraries, kicad_tools, kicad_variables
from app.services.design_bundle.archive import Archive, BundleInvalid
from app.services.design_bundle.generator import Generator
from app.services.design_bundle.kicad_steps import KicadStepFailed

logger = logging.getLogger(__name__)

GLB_NAME = "components.glb"


def cache_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "bundle-models-cache"


def hlr_cache_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "hlr-cache"


def hlr_args(environ: Mapping[str, str] | None = None) -> list[str]:
    """Stage `models`'s assembly HLR inputs (cli-spec.md §5.2.4); none without a Geometer runtime.

    The model libraries are passed as the variables KiCad resolves references
    through, so the member resolves exactly what the GLB export does: the stock
    variables the environment sets, then every variable a library binds
    (the job's pinned snapshot; ``environ`` stands in for the environment).
    """

    executable = settings.GEOMETER_EXECUTABLE
    if not executable:
        return []
    snapshot = kicad_libraries.current() if environ is None else kicad_libraries.snapshot(environ)
    return ["--geometer", executable, "--hlr-cache", str(hlr_cache_root()), *snapshot.model_dir_args()]


def _documents(archive: Archive) -> tuple[Any, Any]:
    """The bundle's placements and the project file, parsed; ``None`` for one that cannot be read.

    Both are members of the bundle, so no KiCad text is parsed here. A member
    that cannot be read names nothing: the stage still runs, and says so in its log.
    """

    placements = project = None
    try:
        placements = json.loads(archive.read("projections/placements.json", structured=False))
    except (BundleInvalid, ValueError) as error:
        logger.warning("Path variables: could not read the placements: %s", error)
    project_file = (archive.manifest.get("config") or {}).get("project_file")
    if project_file:
        try:
            project = json.loads(archive.read(f"sources/{project_file}", structured=False))
        except (BundleInvalid, ValueError) as error:
            logger.warning("Path variables: could not read the project file: %s", error)
    return placements, project


def referenced_variables(archive: Archive) -> kicad_variables.Referenced:
    """The path variables the board's models and the project's drawing sheets name."""

    return kicad_variables.referenced(*_documents(archive))


def missing_models(archive: Archive, libraries: kicad_libraries.Snapshot) -> dict[str, int]:
    """Per variable, how many model files are not there although the server defines the variable.

    A static check against the snapshot the models were exported with, so it
    holds on a cache hit, where kicad-cli does not run.
    """

    placements, project = _documents(archive)
    return kicad_variables.missing_models(placements, kicad_variables.project_text_variables(project), libraries.folder_of)


def cache_key(
    record: Mapping[str, Any],
    generator: Generator,
    tool_version: str = "",
    libraries: Mapping[str, str | None] | None = None,
) -> str:
    board = record["config"].get("board")
    entries = record["entries"]
    board_id = next((e["object_id"] for e in entries if e["path"] == board), "")
    models = sorted((e["path"], e["object_id"]) for e in entries if e["category"] == "model-3d")
    # Models inside a submodule are expanded only at materialization; the
    # gitlink's commit is what changes when they do.
    gitlinks = sorted((e["path"], e["object_id"]) for e in entries if e["category"] == "gitlink")
    material = {
        "board": [board, board_id],
        "models": models,
        "gitlinks": gitlinks,
        "kicad_version": generator.kicad_version,
        "models_procedure": generator.models_procedure,
        # The KiCad that exports may be a later patch release of the generator's (decisions.md).
        "tool_version": tool_version,
    }
    if libraries:
        # What each path variable the board uses points at, by what it is and not where it is
        # mounted: a library added, moved to another commit or removed changes the models, and
        # one the board does not use changes nothing.
        material["libraries"] = sorted(libraries.items())
    return hashlib.sha256(json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def export_components_glb(
    sources: Path,
    record: Mapping[str, Any],
    generator: Generator,
    work: Path,
    *,
    cancel: Callable[[], None] | None = None,
    libraries: Mapping[str, str | None] | None = None,
) -> tuple[Path, bool]:
    """``$JOB/models/components.glb`` for the record's board; returns ``(path, cache_hit)``."""

    from app.services.design_bundle.kicad_steps import worker_kicad_version

    key = cache_key(record, generator, worker_kicad_version(), libraries)
    cached = cache_root() / f"{key}.glb"
    output_dir = work / "models"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / GLB_NAME
    if cached.is_file():
        shutil.copyfile(cached, output)
        _stamp(cached)
        return output, True
    tool = kicad_tools.kicad_cli()
    if not tool.available():
        raise KicadStepFailed("kicad-cli is not installed; the component GLB cannot be exported")
    tree = work / "models-src"
    shutil.copytree(sources, tree, symlinks=False)
    board = tree / str(record["config"]["board"])
    try:
        result = tool.with_cancel(cancel).run(
            ["pcb", "export", "glb", "--force", "--no-board-body", "--output", str(output), str(board)],
            timeout=settings.PRISM_DESIGN_BUNDLE_GLB_TIMEOUT_SECONDS,
            cwd=tree,
        )
    except kicad_tools.ToolError as error:
        raise KicadStepFailed(f"kicad-cli pcb export glb failed: {error}") from error
    if not result.ok or not output.is_file():
        raise KicadStepFailed(f"kicad-cli pcb export glb failed: {result.detail()[:400]}")
    cached.parent.mkdir(parents=True, exist_ok=True)
    temp = cached.with_name(f".{cached.name}.{os.getpid()}.part")
    shutil.copyfile(output, temp)
    os.replace(temp, cached)
    return output, False


def _stamp(path: Path) -> None:
    """Mark a cached GLB used, so retention evicts by last use."""

    try:
        os.utime(path, None)
    except OSError:
        pass  # a lost stamp only makes eviction earlier


#: A ``.part`` file older than this is an export that died before its rename.
PART_GRACE_SECONDS = 3600


def prune_cache(*, unused_before: float, now: float) -> dict[str, int]:
    """Bundle retention's pass over the GLB cache: drop GLBs unused since ``unused_before``.

    Returns the GLBs removed and the bytes the cache still holds. A cache file
    is only ever copied out, never read in place, so removing one an export is
    about to copy at worst re-exports it.
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
        if stale_part or (item.suffix == ".glb" and info.st_mtime < unused_before):
            item.unlink(missing_ok=True)
            removed += item.suffix == ".glb"
        else:
            kept_bytes += info.st_size
    return {"removed": removed, "bytes": kept_bytes}
