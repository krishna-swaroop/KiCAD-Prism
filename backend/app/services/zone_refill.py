"""One zone refill per board revision, shared by the 3D bundle and Simulation Studio.

A committed board can carry stale zone fills (copper moved after the last
refill). The 3D job refills a scratch copy once with KiCad's own zone filler,
then draws the analytic board, builds the semantic index and the simulation
bundle from that copy, so every view shows the copper a solve uses.

The refill runs ``ZONE_FILLER`` through KiCad's Python (``pcbnew``) rather
than ``kicad-cli pcb drc --refill-zones``: the fills are the same and it skips
the DRC, which is most of that command's time on a large board.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.core.config import settings

#: Bump when the refill changes, so cached 3D bundles rebuild.
REFILL_REVISION = "zone-refill-a0"

_SCRIPT = """
import sys, pcbnew
board = pcbnew.LoadBoard(sys.argv[1])
pcbnew.ZONE_FILLER(board).Fill(board.Zones())
pcbnew.SaveBoard(sys.argv[1], board)
"""


def enabled() -> bool:
    return bool(settings.PRISM_ZONE_REFILL_ENABLED)


def update_fingerprint(hasher) -> None:
    if enabled():
        hasher.update(REFILL_REVISION.encode("utf-8"))


def refill(project_file: Path, scratch: Path, log: list[str]) -> Path | None:
    """A refilled copy of the project's board in ``scratch``, or None (the saved fills stand).

    The project file and custom rules go beside the copy: the filler reads
    clearances and zone settings from them.
    """

    if not enabled():
        return None
    board = project_file.with_suffix(".kicad_pcb")
    if not board.is_file():
        return None
    scratch.mkdir(parents=True, exist_ok=True)
    for suffix in (".kicad_pro", ".kicad_pcb", ".kicad_dru"):
        source = project_file.with_suffix(suffix)
        if source.is_file():
            shutil.copyfile(source, scratch / source.name)
    copy = scratch / board.name
    try:
        completed = subprocess.run(
            [settings.PRISM_KICAD_PYTHON, "-I", "-c", _SCRIPT, str(copy)],
            capture_output=True,
            text=True,
            timeout=settings.PRISM_ZONE_REFILL_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.append(f"Zone refill skipped, using the saved fills: {type(exc).__name__}: {exc}")
        return None
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip().splitlines()[-1:] or [str(completed.returncode)]
        log.append(f"Zone refill failed, using the saved fills: {detail[0]}")
        return None
    log.append(f"Zones refilled on a copy of {board.name}")
    return copy
