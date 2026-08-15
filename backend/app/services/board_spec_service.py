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
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

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


def extract_board_spec(pcb_path: str | Path) -> dict[str, Any]:
    """Return the specs derivable from a board file, as ``{field: value}``.

    Only fields that were actually found are present. Fields the file does not
    carry (mask colour, finish type beyond the stackup's copper finish, IPC class)
    are simply absent, so the caller can tell "extracted" from "unknown".
    """
    path = Path(pcb_path)
    if not path.is_file():
        return {}

    try:
        from kiutils.board import Board

        board = Board.from_file(str(path))
    except Exception:
        logger.warning("Could not parse board for spec extraction: %s", path, exc_info=True)
        return {}

    spec: dict[str, Any] = {}

    # Copper layer count from the (layers ...) declaration.
    try:
        copper = [
            layer for layer in (board.layers or [])
            if _is_copper_layer(getattr(layer, "name", ""))
        ]
        if copper:
            spec["layer_count"] = len(copper)
    except Exception:
        logger.debug("layer count extraction failed for %s", path, exc_info=True)

    # Overall board thickness: prefer the general block, fall back to summing the
    # stackup's dielectric/copper thicknesses.
    try:
        general = getattr(board, "general", None)
        thickness = getattr(general, "thickness", None) if general else None
        if isinstance(thickness, (int, float)) and thickness > 0:
            spec["board_thickness_mm"] = round(float(thickness), 3)
    except Exception:
        logger.debug("thickness extraction failed for %s", path, exc_info=True)

    # Stackup: copper finish and edge features are genuine fab specs when present.
    try:
        setup = getattr(board, "setup", None)
        stackup = getattr(setup, "stackup", None) if setup else None
        if stackup is not None:
            finish = getattr(stackup, "copperFinish", None)
            if finish:
                spec["surface_finish"] = str(finish)
            if getattr(stackup, "castellatedPads", False):
                spec["castellated"] = True
            if getattr(stackup, "edgePlating", False):
                spec["edge_plating"] = True
            # Sum stackup layer thicknesses if the general block did not give one.
            if "board_thickness_mm" not in spec:
                layers = getattr(stackup, "layers", None) or []
                total = sum(
                    float(getattr(layer, "thickness", 0) or 0)
                    for layer in layers
                    if isinstance(getattr(layer, "thickness", None), (int, float))
                )
                if total > 0:
                    spec["board_thickness_mm"] = round(total, 3)
    except Exception:
        logger.debug("stackup extraction failed for %s", path, exc_info=True)

    # Board dimensions from the Edge.Cuts outline.
    try:
        bbox = _edge_cuts_bbox(board)
        if bbox:
            spec["board_width_mm"], spec["board_height_mm"] = bbox
    except Exception:
        logger.debug("edge cuts extraction failed for %s", path, exc_info=True)

    return spec
