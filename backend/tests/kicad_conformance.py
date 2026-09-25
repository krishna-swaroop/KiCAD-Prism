"""Read KiCad's own table rendering out of the pinned source tree.

Stage 2 requires the released characteristics table to match KiCad's own
rendering *string for string*.  There is no CLI that emits
``Build_Board_Characteristics_Table``, so the only honest oracle is KiCad's
source, and the pinned tree is the one whose digest is already part of
``toolchain_digest``.

That tree is not present everywhere Prism's tests run, so conformance is checked
in two layers:

* a recorded fixture, compared on every run, that says what KiCad renders;
* a re-derivation from the source, run wherever the tree is available, that says
  the fixture is still true.

The second layer is the one that catches a KiCad upgrade.  The first is the one
that keeps the check from quietly running nowhere -- which is precisely how a
stale assertion survived in this suite before.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

#: Where the pinned KiCad source tree may be found.  The environment variable
#: wins; the sibling checkout is the layout a Prism developer machine has.
KICAD_SOURCE_ENV = "PRISM_KICAD_SOURCE_ROOT"
_parents = Path(__file__).resolve().parents
_SIBLING_ROOT = (
    _parents[3] / "kicad-docker" / ".kicad-native-arm64"
    if len(_parents) > 3
    else Path("/nonexistent-kicad-source")
)

CONFORMANCE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "release-studio" / "kicad-conformance"
if not CONFORMANCE_DIR.is_dir():
    # Docker images keep tests under /app/tests while fixtures stay at the repo
    # root; prefer a present directory so the recorded-oracle check can run.
    alt = Path(__file__).resolve().parents[1] / "fixtures" / "release-studio" / "kicad-conformance"
    if alt.is_dir():
        CONFORMANCE_DIR = alt

#: `addDataCell( _( "Copper layer count: " ) )` -- KiCad writes the label and its
#: trailing colon-space into one translatable string, and the colon is
#: presentation rather than part of the row's name.
_DATA_CELL = re.compile(r'addDataCell\(\s*_\(\s*"([^"]*?):\s*"\s*\)\s*\)')


def kicad_source_root() -> Path | None:
    """The pinned KiCad source tree, or ``None`` when it is not on this host."""

    override = os.environ.get(KICAD_SOURCE_ENV, "").strip()
    if override:
        candidate = Path(override)
        return candidate if candidate.is_dir() else None
    if not _SIBLING_ROOT.is_dir():
        return None
    # The tree is unpacked as `source-<commit>`; there is normally exactly one.
    sources = sorted(path for path in _SIBLING_ROOT.glob("source-*") if path.is_dir())
    return sources[0] if len(sources) == 1 else None


def load_conformance(name: str) -> dict:
    """Load a recorded KiCad rendering by fixture name."""

    return json.loads((CONFORMANCE_DIR / f"{name}.json").read_text(encoding="utf-8"))


def characteristic_labels_from_source(root: Path) -> list[str]:
    """Parse the row labels `Build_Board_Characteristics_Table` emits, in order.

    Only the cells after the header are read, so the table's own caption is not
    mistaken for a row.
    """

    source = root / "pcbnew" / "board_tables" / "board_characteristics_table.cpp"
    text = source.read_text(encoding="utf-8")
    marker = 'addHeaderCell( _( "BOARD CHARACTERISTICS" ) );'
    if marker not in text:
        raise AssertionError(
            f"{source} no longer opens with the BOARD CHARACTERISTICS header cell; "
            "the conformance parser needs updating before it can be trusted"
        )
    return _DATA_CELL.findall(text.split(marker, 1)[1])
