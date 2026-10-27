"""Read-only extraction of manufacturing specs from a ``.kicad_pcb``.

The manufacturing tab lets a user record a board's physical specs. Some of those
values are already in the board file (layer count, board thickness, the outline's
size, the stackup's copper finish and edge features); others are fab-house choices
that live nowhere in the design (solder-mask colour, IPC class, lead time). This
module reads the first kind so the form can be prefilled, and says nothing about
the second.

Everything here is a *suggestion*. The stored spec is whatever the user saved; this
only offers a starting point, and never fails the request if a board is unusual: an
unreadable field is simply omitted rather than raised.

Parsing goes through ``kiutils`` (already a dependency), which reads KiCad's
s-expression format properly rather than by regular expression.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# How much of the file to scan for the header sections. The (general), (layers) and
# (setup (stackup ...)) blocks sit at the very top of a .kicad_pcb, well within this,
# so we never need to read a multi-megabyte board in full to get them.
_HEADER_SCAN_BYTES = 200_000

# Layers whose names are never board copper layers, so they must not inflate the
# copper layer count when we walk (layers ...).
_NON_COPPER_SUFFIXES = (
    ".Mask", ".Paste", ".SilkS", ".CrtYd", ".Fab", ".Cuts", ".Margin",
    ".User", ".Adhes", ".Dwgs", ".Eco1", ".Eco2",
)


def _is_copper_layer(name: str) -> bool:
    """A board copper layer is F.Cu, B.Cu or InN.Cu; nothing else counts."""
    if not name:
        return False
    if name in ("F.Cu", "B.Cu"):
        return True
    # Inner layers are In1.Cu, In2.Cu, ...
    return name.startswith("In") and name.endswith(".Cu")


def _edge_cuts_bbox(board: Any) -> tuple[float, float] | None:
    """Width and height in mm of the Edge.Cuts outline, or None if absent.

    Walks every graphic item on the Edge.Cuts layer and takes the bounding box of
    its coordinates. Curved segments are approximated by their end points, which is
    close enough for a manufacturing size figure the user can override.
    """
    xs: list[float] = []
    ys: list[float] = []

    def _consider(point: Any) -> None:
        if point is None:
            return
        x, y = getattr(point, "X", None), getattr(point, "Y", None)
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            xs.append(float(x))
            ys.append(float(y))

    for item in getattr(board, "graphicItems", []) or []:
        if getattr(item, "layer", None) != "Edge.Cuts":
            continue
        for attr in ("start", "end", "center", "mid"):
            _consider(getattr(item, attr, None))

    if len(xs) < 2 or len(ys) < 2:
        return None
    width = round(max(xs) - min(xs), 2)
    height = round(max(ys) - min(ys), 2)
    if width <= 0 or height <= 0:
        return None
    return width, height


def _extract_from_header(text: str) -> dict[str, Any]:
    """Read layer count, thickness and finish straight from the file header text.

    KiCad writes (general), (layers) and (setup (stackup ...)) at the top of a
    board, before the footprints. Reading them with small regexes avoids parsing
    the whole (often huge) board and, crucially, does not choke on newer pad/net
    syntax that the vendored kiutils version cannot handle. Everything found is a
    suggestion the user can override.
    """
    spec: dict[str, Any] = {}

    # Copper layer count: count the copper entries in the (layers ...) block. Each
    # line looks like: (0 "F.Cu" signal) / (4 "In1.Cu" power "GND-Inner1").
    layers_match = re.search(r"\(layers\b(.*?)\n\s*\)", text, re.DOTALL)
    if layers_match:
        names = re.findall(r'\(\s*\d+\s+"([^"]+)"', layers_match.group(1))
        copper = [n for n in names if _is_copper_layer(n)]
        if copper:
            spec["layer_count"] = len(copper)

    # Overall board thickness from the (general (thickness X)) block.
    thick = re.search(r"\(general\b.*?\(thickness\s+([0-9.]+)\)", text, re.DOTALL)
    if thick:
        try:
            value = round(float(thick.group(1)), 3)
            if value > 0:
                spec["board_thickness_mm"] = value
        except ValueError:
            pass

    # Copper finish and edge features from the (setup (stackup ...)) block.
    finish = re.search(r"\(copper_finish\s+\"([^\"]+)\"", text)
    if finish:
        spec["surface_finish"] = finish.group(1)
    if re.search(r"\(castellated_pads\s+yes\)", text):
        spec["castellated"] = True
    if re.search(r"\(edge_plating\s+yes\)", text):
        spec["edge_plating"] = True

    return spec


def extract_board_spec(pcb_path: str | Path) -> dict[str, Any]:
    """Return the specs derivable from a board file, as ``{field: value}``.

    Only fields that were actually found are present. Fields the file does not
    carry (mask colour, finish type beyond the stackup's copper finish, IPC class)
    are simply absent, so the caller can tell "extracted" from "unknown".

    Header fields (layers, thickness, finish) are read from the file text directly
    so a board that the vendored kiutils cannot fully parse still yields them. The
    board outline needs geometry, so it goes through kiutils, but a parse failure
    there only drops the size, not the whole result.
    """
    path = Path(pcb_path)
    if not path.is_file():
        return {}

    spec: dict[str, Any] = {}

    # Header fields: read from the top of the file, robust to unusual footprint syntax.
    try:
        with path.open(encoding="utf-8", errors="replace") as handle:
            header = handle.read(_HEADER_SCAN_BYTES)
        spec.update(_extract_from_header(header))
    except Exception:
        logger.debug("header extraction failed for %s", path, exc_info=True)

    # Board dimensions need geometry, so parse with kiutils. A failure here (e.g. a
    # board this kiutils version cannot read) leaves the header fields intact.
    try:
        from kiutils.board import Board

        board = Board.from_file(str(path))
        bbox = _edge_cuts_bbox(board)
        if bbox:
            spec["board_width_mm"], spec["board_height_mm"] = bbox

        # If the header regex missed the stackup thickness, sum it from kiutils.
        if "board_thickness_mm" not in spec:
            setup = getattr(board, "setup", None)
            stackup = getattr(setup, "stackup", None) if setup else None
            layers = getattr(stackup, "layers", None) or [] if stackup else []
            total = sum(
                float(getattr(layer, "thickness", 0) or 0)
                for layer in layers
                if isinstance(getattr(layer, "thickness", None), (int, float))
            )
            if total > 0:
                spec["board_thickness_mm"] = round(total, 3)
    except Exception:
        logger.debug("kiutils geometry pass failed for %s; header fields kept", path, exc_info=True)

    return spec
