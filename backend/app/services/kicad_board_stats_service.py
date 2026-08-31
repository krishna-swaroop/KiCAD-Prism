"""Board facts from ``kicad-cli``, not from a parser of our own.

Prism used to derive the board outline size by scanning the ``.kicad_pcb``
itself: every ``gr_line``/``gr_arc``/``gr_poly``/``gr_circle`` block was pulled
out and the Edge.Cuts ones reduced to a bounding box. That was wrong twice
over.

It was wrong in principle, because Release Studio already states the rule this
module follows -- KiCad owns the board-statistics schema (see
``app/release_studio/projections.py``). A second, hand-written parser for the
same facts can only ever be an approximation of the first, and it silently
disagreed with KiCad on arc bulge, which the scan approximated by its endpoints
and midpoint.

It was wrong in practice, because the scan was quadratic. It sliced the tail of
the file on every match, so a 57.7 MB board with 10,217 ``gr_line`` blocks
copied roughly 400 GB of string, saturated a core, and -- being pure Python
under the GIL -- starved the event loop serving every other request on the
box. That is what made opening a large project take tens of seconds.

``kicad-cli pcb export stats`` answers the same question authoritatively in
about 30 seconds on that board. Thirty seconds is still far too long to spend
inside a request, which is why nothing here is called from one: the metadata
job runs this once when a project is imported or synced, and the API serves
what it stored.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


logger = logging.getLogger(__name__)

#: ``pcb export stats`` on the largest board in our corpus takes ~30s. The
#: ceiling is generous rather than tight: the job that calls this owns a worker
#: slot for its duration either way, and a board big enough to need the time is
#: exactly the board whose numbers we most want.
STATS_TIMEOUT_SECONDS = 600

SOURCE = "kicad-cli pcb export stats --format json"

#: KiCad prints dimensions as a formatted quantity -- ``"160.0000 mm"`` -- not
#: as a number, so the unit travels with the value and has to come back off.
_QUANTITY = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?)\s*(\S+)?\s*$")


class BoardStatsUnavailable(RuntimeError):
    """kicad-cli could not produce statistics for this board."""


def _resolve_cli() -> str:
    """Locate kicad-cli the same way Release Studio does.

    Imported lazily: the API process resolves this module at import time and
    must not fail to start because a toolchain it never calls is absent.
    """
    from app.release_studio.steps import StepExecutionError, resolve_cli_path

    try:
        return resolve_cli_path()
    except StepExecutionError as error:
        raise BoardStatsUnavailable(str(error)) from error


def _quantity_mm(value: object) -> Optional[float]:
    """Return a millimetre magnitude, or None if KiCad did not report one.

    Anything not already in millimetres is refused rather than converted: a
    silently wrong unit is worse than a blank field, and every KiCad build we
    run reports mm here.
    """
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    match = _QUANTITY.match(value)
    if not match:
        return None
    unit = (match.group(2) or "mm").lower()
    if unit not in ("mm", "millimeter", "millimetre"):
        logger.warning("Ignoring board dimension in unexpected unit: %r", value)
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def export_board_stats(pcb_path: str, *, cli_path: Optional[str] = None) -> dict:
    """Run ``pcb export stats`` and return the parsed report.

    Raises ``BoardStatsUnavailable`` when the toolchain is missing or the run
    fails; callers treat that as "no board facts", never as a hard error, so a
    deployment without kicad-cli degrades to a project card with fewer fields
    rather than to a broken page.
    """
    board = Path(pcb_path)
    if not board.is_file():
        raise BoardStatsUnavailable(f"Board not found: {pcb_path}")

    executable = cli_path or _resolve_cli()

    with tempfile.TemporaryDirectory(prefix="prism-board-stats-") as scratch:
        out_path = Path(scratch) / "stats.json"
        # Each invocation gets its own temp/runtime dir: kicad-cli takes an
        # instance lock keyed on it, and two of them sharing one directory
        # serialise for no reason.
        env = dict(os.environ)
        for key in ("TMPDIR", "TMP", "TEMP", "XDG_RUNTIME_DIR"):
            env[key] = scratch

        argv = [
            executable,
            "pcb",
            "export",
            "stats",
            "--format",
            "json",
            "-o",
            str(out_path),
            str(board),
        ]
        try:
            completed = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                timeout=STATS_TIMEOUT_SECONDS,
                env=env,
                cwd=scratch,
            )
        except subprocess.TimeoutExpired as error:
            raise BoardStatsUnavailable(
                f"kicad-cli timed out after {STATS_TIMEOUT_SECONDS}s on {board.name}"
            ) from error
        except OSError as error:
            raise BoardStatsUnavailable(f"kicad-cli could not be executed: {error}") from error

        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip().splitlines()
            raise BoardStatsUnavailable(
                f"kicad-cli exited {completed.returncode}: {detail[-1] if detail else 'no output'}"
            )
        if not out_path.is_file():
            raise BoardStatsUnavailable("kicad-cli reported success but wrote no statistics")

        try:
            return json.loads(out_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise BoardStatsUnavailable(f"Could not read board statistics: {error}") from error


def board_facts(stats: dict) -> dict:
    """Reduce a stats report to the fields the project card shows.

    Kept deliberately narrow. The report carries pad, via, drill and component
    counts too; those belong to Release Studio's projection, which already has
    a schema and a canonicaliser for them. Duplicating that here would create
    the same two-sources-of-truth problem this module exists to remove.
    """
    board = stats.get("board") if isinstance(stats.get("board"), dict) else {}
    metadata = stats.get("metadata") if isinstance(stats.get("metadata"), dict) else {}

    width = _quantity_mm(board.get("width"))
    height = _quantity_mm(board.get("height"))
    dimensions = None
    if width is not None and height is not None and board.get("has_outline") is not False:
        dimensions = {"width": round(width, 2), "height": round(height, 2)}

    return {
        "dimensions_mm": dimensions,
        "thickness_mm": _quantity_mm(board.get("board_thickness")),
        "stats_generator": metadata.get("generator") or None,
    }
