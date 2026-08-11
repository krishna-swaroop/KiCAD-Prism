"""Normalise an extracted footprint to the front side of the board.

A footprint placed on the back of a PCB is stored mirrored: back copper, silk and
fab layers, mirrored text justification, and geometry that is *not* a simple
coordinate negation - KiCad also carries a 180 degree orientation and reorders
items. Importing those bytes straight into the library yields a footprint that
renders back-to-front in previews and is wrong for any other board.

The transform is reproduced with KiCad's own `FOOTPRINT::Flip`, which is an exact
involution, rather than with regular expressions over the S-expression text. A
hand-rolled geometric flip would corrupt pad positions silently, which is far
worse than the mirrored preview it set out to fix.

`pcbnew` is loaded in a subprocess. It is a heavyweight native module that
segfaults rather than raising when misused, and an import worker must not die
with it.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

NORMALIZE_TIMEOUT_SECONDS = 60


@dataclass(frozen=True)
class NormalizedFootprint:
    payload: bytes
    changed: bool
    error: str = ""


def _looks_back_side(payload: bytes) -> bool:
    """Cheap check so front-side footprints never pay for a subprocess."""
    head = payload[:4096].decode("utf-8", errors="replace")
    for line in head.splitlines()[:12]:
        stripped = line.strip()
        if stripped.startswith("(layer "):
            return stripped.startswith('(layer "B.')
    return False


def normalize_to_front(payload: bytes, target_name: str) -> NormalizedFootprint:
    """Return front-side footprint bytes, or the original when nothing is needed."""
    if not _looks_back_side(payload):
        return NormalizedFootprint(payload=payload, changed=False)

    safe_name = "".join(char for char in target_name if char.isalnum() or char in "-_.") or "footprint"

    with tempfile.TemporaryDirectory(prefix="prism-fp-normalize-") as tmp:
        root = Path(tmp)
        source = root / "source.pretty"
        output = root / "output.pretty"
        source.mkdir()
        output.mkdir()
        (source / f"{safe_name}.kicad_mod").write_bytes(payload)

        try:
            completed = subprocess.run(
                [sys.executable, "-m", "app.services.kicad_footprint_normalizer",
                 str(source), str(output), safe_name],
                capture_output=True,
                text=True,
                timeout=NORMALIZE_TIMEOUT_SECONDS,
            )
        except (subprocess.SubprocessError, OSError) as error:
            logger.warning("Footprint side normalisation could not run: %s", error)
            return NormalizedFootprint(payload=payload, changed=False, error=str(error))

        if completed.returncode != 0:
            detail = (completed.stderr or "").strip().splitlines()
            message = detail[-1] if detail else f"exit code {completed.returncode}"
            logger.warning("Footprint side normalisation failed for %s: %s", target_name, message)
            return NormalizedFootprint(payload=payload, changed=False, error=message)

        produced = output / f"{safe_name}.kicad_mod"
        if not produced.is_file():
            return NormalizedFootprint(
                payload=payload, changed=False, error="normaliser produced no footprint"
            )
        return NormalizedFootprint(payload=produced.read_bytes(), changed=True)


def _main(argv: list[str]) -> int:
    """Subprocess entry point. Runs inside the KiCad runtime, never in the API process."""
    if len(argv) != 3:
        print("usage: kicad_footprint_normalizer <source.pretty> <output.pretty> <name>", file=sys.stderr)
        return 2
    source_dir, output_dir, name = argv

    import pcbnew  # noqa: PLC0415 - deliberately loaded only in this subprocess

    # A footprint must belong to a board before it is transformed; pcbnew segfaults
    # on an orphaned footprint rather than raising.
    board = pcbnew.CreateEmptyBoard()
    footprint = pcbnew.FootprintLoad(source_dir, name)
    if footprint is None:
        print(f"could not load footprint {name}", file=sys.stderr)
        return 3
    board.Add(footprint)

    if not footprint.IsFlipped():
        print("already front side", file=sys.stderr)
        return 4

    footprint.Flip(footprint.GetPosition(), False)
    # Placement rotation is not part of a library footprint's identity.
    footprint.SetOrientationDegrees(0)

    plugin = pcbnew.PCB_IO_MGR.FindPlugin(pcbnew.PCB_IO_MGR.KICAD_SEXP)
    plugin.FootprintSave(output_dir, footprint)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
