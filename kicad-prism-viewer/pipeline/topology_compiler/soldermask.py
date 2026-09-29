"""Solder mask and paste geometry for the 3D view, from the PCB plotter IR.

The mask is the board outline minus its openings: pads flashed on the side's mask
layer (grown by the margin the plotter resolved for them), graphics and zones on
the mask layer, untented vias, and every drilled hole. Pads use the same IR
flashes and ring builder as the copper tiles, so openings match the copper.

Paste is the pads flashed on the side's paste layer, grown by the board's paste
clearance, plus graphics on the paste layer. Per-pad paste margins and the
clearance ratio are not in the IR and are ignored.

Built here rather than taken from ``kicad-cli``: its GLB export only cuts pad
openings when pads are exported too, and the native board compiler emits no mask.
"""

from __future__ import annotations

import math
from typing import Any

from shapely import clip_by_rect, make_valid
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.ops import polygonize, unary_union

from .pcb_geometry import NM_TO_MM, capsule, pad_rings, point_nm, sample_arc_op, transform

SIDES = {"top": "F", "bottom": "B"}
# Segments per full circle for circles drawn on Edge.Cuts or the mask layers.
CIRCLE_STEPS = 48
# Mask and paste are cut into square tiles before packing: the triangulator
# slows sharply with the number of holes, and a whole-board mask has thousands.
TILE_MM = 10.0
# Paste sits this far outside the mask face, so it never shares its plane.
PASTE_LIFT_MM = 0.005
PASTE_COLOR = [0.62, 0.63, 0.65, 1.0]
# Bump when the geometry changes, so cached masks are rebuilt.
SOLDERMASK_VERSION = "ir-a2"


def soldermask_polygons(
    pcb_ir: dict[str, Any],
    *,
    tented: dict[str, bool] | None = None,
    paste_margin_mm: float = 0.0,
) -> dict[str, Any] | None:
    """Mask and paste polygons per side in board millimetres. None without a closed outline."""

    records = list(pcb_ir.get("records") or [])
    board = _board_outline(records)
    if board is None or board.is_empty:
        return None
    tented = tented or {"top": True, "bottom": True}
    drills = _drill_holes(records)
    sides: dict[str, Any] = {}
    paste: dict[str, Any] = {}
    for side, prefix in SIDES.items():
        openings = _pad_openings(records, prefix) + _layer_openings(records, f"{prefix}.Mask")
        if not tented[side]:
            openings += _via_openings(records)
        cut = unary_union(openings + drills)
        sides[side] = _polygon_rings(_tiled(make_valid(board.difference(cut))))
        deposits = _paste_deposits(records, prefix, paste_margin_mm) + _layer_openings(records, f"{prefix}.Paste")
        if deposits:
            area = make_valid(unary_union(deposits).intersection(board).difference(unary_union(drills)))
            paste[side] = _polygon_rings(_tiled(area))
    return {"version": SOLDERMASK_VERSION, "sides": sides, "paste": paste}


def soldermask_polygons_from_file(pcb_file: str) -> dict[str, Any] | None:
    """For backends that never build the IR in-process; runs in a worker process."""

    from kicad_monkey import KiCadPcb  # type: ignore

    pcb = KiCadPcb.from_file(pcb_file)
    return soldermask_polygons(
        pcb.to_ir(source_path=str(pcb_file)).to_dict(),
        tented=board_tenting(pcb),
        paste_margin_mm=board_paste_margin(pcb),
    )


def place_soldermask(
    polygons: dict[str, Any] | None,
    topology: dict[str, Any],
    color: list[float] | None = None,
) -> dict[str, Any] | None:
    """Add each side's face height and colour, which come from the compiled stackup."""

    if not polygons:
        return None
    faces = _mask_faces_mm(topology)
    lift = {"top": PASTE_LIFT_MM, "bottom": -PASTE_LIFT_MM}
    return {
        "schema": "prism.soldermask.v1",
        "color": color or mask_color(topology),
        "pasteColor": PASTE_COLOR,
        "sides": {
            side: {"faceZMm": faces[side], "polygons": rings}
            for side, rings in polygons["sides"].items()
        },
        "paste": {
            side: {"faceZMm": faces[side] + lift[side], "polygons": rings}
            for side, rings in (polygons.get("paste") or {}).items()
            if rings
        },
    }


def board_tenting(pcb: Any) -> dict[str, bool]:
    """Board via tenting per side; KiCad tents vias unless the setup says otherwise."""

    tented = {"top": True, "bottom": True}

    def visit(node: Any) -> None:
        if not isinstance(node, list) or not node:
            return
        if str(node[0]) == "tenting":
            for entry in node[1:]:
                if isinstance(entry, list) and len(entry) >= 2:
                    side = {"front": "top", "back": "bottom"}.get(str(entry[0]))
                    if side:
                        tented[side] = str(entry[1]).lower() != "no"
            return
        for child in node[1:]:
            visit(child)

    visit(getattr(pcb, "setup_sexp", None))
    return tented


def board_paste_margin(pcb: Any) -> float:
    """Board ``pad_to_paste_clearance`` in mm (usually 0 or negative)."""

    def find(node: Any) -> float | None:
        if not isinstance(node, list) or not node:
            return None
        if str(node[0]) == "pad_to_paste_clearance" and len(node) >= 2:
            try:
                return float(node[1])
            except (TypeError, ValueError):
                return None
        for child in node[1:]:
            value = find(child)
            if value is not None:
                return value
        return None

    return find(getattr(pcb, "setup_sexp", None)) or 0.0


# --- IR walking --------------------------------------------------------------


def _op_layer(record: dict[str, Any], op: dict[str, Any]) -> str:
    attrs = op.get("extra_attrs") or {}
    return str(attrs.get("layer_name") or op.get("layer") or record.get("layer") or "")


def _footprint_frame(record: dict[str, Any]) -> tuple[tuple[float, float], float]:
    placement = record.get("placement") or {}
    return point_nm(placement.get("x_nm"), placement.get("y_nm")), -float(placement.get("angle_deg") or 0.0)


def _placed(record: dict[str, Any]):
    """Map footprint-local points to the board; board-level records are already there."""

    if record.get("kind") != "footprint":
        return lambda points: points
    origin, angle = _footprint_frame(record)
    return lambda points: [transform(point, origin, angle) for point in points]


def _layer_ops(records: list[dict[str, Any]], layer: str):
    """(record, op) pairs drawn on ``layer``, board-level and footprint-local."""

    for record in records:
        kind = record.get("kind")
        if kind == "footprint":
            for op in record.get("operations") or []:
                if _op_layer(record, op) == layer:
                    yield record, op
        elif str(record.get("layer") or "") == layer or layer in (record.get("layers") or []):
            for op in record.get("operations") or []:
                yield record, op


def _op_paths(op: dict[str, Any]) -> tuple[list[list[tuple[float, float]]], bool]:
    """Centre lines of a graphic op in its own frame, and whether it is filled."""

    kind = str(op.get("kind") or "")
    filled = "FILLED" in str(op.get("fill") or "").upper() or str(op.get("fill") or "").lower() == "yes"
    if kind == "ThickSegment":
        return [[point_nm(op.get("start_x"), op.get("start_y")), point_nm(op.get("end_x"), op.get("end_y"))]], False
    if kind == "ArcThreePoint":
        return [sample_arc_op(op)], False
    if kind == "Circle":
        center = point_nm(op.get("cx"), op.get("cy"))
        radius = float(op.get("diameter_nm") or 0) * NM_TO_MM / 2
        ring = [
            (center[0] + radius * math.cos(math.tau * index / CIRCLE_STEPS),
             center[1] + radius * math.sin(math.tau * index / CIRCLE_STEPS))
            for index in range(CIRCLE_STEPS + 1)
        ]
        return [ring], filled
    if kind == "Rect":
        x0, y0 = point_nm(op.get("x1"), op.get("y1"))
        x1, y1 = point_nm(op.get("x2"), op.get("y2"))
        return [[(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]], filled
    if kind == "PlotPoly":
        points = [point_nm(point[0], point[1]) for point in op.get("points") or []]
        if len(points) >= 3 and filled:
            points = points + [points[0]]
        return ([points] if len(points) >= 2 else []), filled
    return [], False


# --- geometry ----------------------------------------------------------------


def _board_outline(records: list[dict[str, Any]]) -> Polygon | MultiPolygon | None:
    lines: list[LineString] = []
    for record, op in _layer_ops(records, "Edge.Cuts"):
        placed = _placed(record)
        for path in _op_paths(op)[0]:
            # Snap to 0.1 um so footprint-local segments, which pick up float
            # error from the placement transform, meet the board segments they join.
            path = [(round(x, 4), round(y, 4)) for x, y in placed(path)]
            if len(path) >= 2:
                lines.append(LineString(path))
    if not lines:
        return None
    faces = list(polygonize(unary_union(lines)))
    if not faces:
        return None
    # polygonize returns a cutout both as a hole of the outer face and as a face
    # of its own; keep the largest face and any separate outline beside it.
    faces.sort(key=lambda face: face.area, reverse=True)
    outer = faces[0]
    board = outer
    for face in faces[1:]:
        if not outer.contains(face.representative_point()):
            board = board.union(face)
    return board


def _on_mask(layers: Any, prefix: str) -> bool:
    names = {str(layer) for layer in layers or []}
    return f"{prefix}.Mask" in names or "*.Mask" in names or "F&B.Mask" in names


def _pad_openings(records: list[dict[str, Any]], prefix: str) -> list[Any]:
    """Pad flashes on the mask layer, grown by the margin the plotter resolved."""

    openings = []
    for record in records:
        if record.get("kind") != "footprint":
            continue
        placed = _placed(record)
        for op in record.get("operations") or []:
            kind = str(op.get("kind") or "")
            if not _on_mask(op.get("layers"), prefix):
                continue
            margin = float(op.get("mask_margin_nm") or 0) * NM_TO_MM
            if kind.startswith("FlashPad"):
                try:
                    rings = pad_rings(op)
                except ValueError:
                    continue
                shape = unary_union([Polygon(placed(ring)) for ring in rings if len(ring) >= 3])
            elif kind == "Circle" and op.get("role") == "npth_hole":
                center = placed([point_nm(op.get("cx"), op.get("cy"))])[0]
                size = max(
                    float(op.get("diameter_nm") or 0),
                    float(op.get("pad_size_x_nm") or 0),
                    float(op.get("pad_size_y_nm") or 0),
                ) * NM_TO_MM
                shape = Point(center).buffer(size / 2)
            else:
                continue
            if shape.is_empty:
                continue
            openings.append(shape.buffer(margin) if margin else shape)
    return openings


def _paste_deposits(records: list[dict[str, Any]], prefix: str, margin: float) -> list[Any]:
    """Pad flashes on the paste layer, grown (or shrunk) by the board paste clearance."""

    deposits = []
    for record in records:
        if record.get("kind") != "footprint":
            continue
        placed = _placed(record)
        for op in record.get("operations") or []:
            if not str(op.get("kind") or "").startswith("FlashPad"):
                continue
            names = {str(layer) for layer in op.get("layers") or []}
            if f"{prefix}.Paste" not in names and "*.Paste" not in names:
                continue
            try:
                rings = pad_rings(op)
            except ValueError:
                continue
            shape = unary_union([Polygon(placed(ring)) for ring in rings if len(ring) >= 3])
            if margin:
                shape = shape.buffer(margin)
            if not shape.is_empty:
                deposits.append(shape)
    return deposits


def _layer_openings(records: list[dict[str, Any]], layer: str) -> list[Any]:
    """Graphics and zones drawn on a mask layer, which open the mask."""

    openings = []
    for record, op in _layer_ops(records, layer):
        paths, filled = _op_paths(op)
        width = float(op.get("width_nm") or 0) * NM_TO_MM
        placed = _placed(record)
        for path in paths:
            path = placed(path)
            if filled and len(path) >= 4:
                openings.append(Polygon(path))
            if width > 0 and len(path) >= 2:
                openings.append(LineString(path).buffer(width / 2))
            elif not filled and record.get("kind") == "zone_fill" and len(path) >= 3:
                openings.append(Polygon(path))
    return openings


def _via_openings(records: list[dict[str, Any]]) -> list[Any]:
    openings = []
    for record in records:
        if record.get("kind") != "via" or not record.get("size"):
            continue
        center = _via_center(record)
        if center:
            openings.append(Point(center).buffer(float(record["size"]) / 2))
    return openings


def _via_center(record: dict[str, Any]) -> tuple[float, float] | None:
    for op in record.get("operations") or []:
        if str(op.get("kind") or "").startswith("FlashPad"):
            return point_nm(op.get("x"), op.get("y"))
    return None


def _drill_holes(records: list[dict[str, Any]]) -> list[Any]:
    holes = []
    for record in records:
        kind = record.get("kind")
        if kind == "via" and record.get("drill"):
            center = _via_center(record)
            if center:
                holes.append(Point(center).buffer(float(record["drill"]) / 2))
        elif kind == "footprint":
            placed = _placed(record)
            origin, angle = _footprint_frame(record)
            for op in record.get("operations") or []:
                if op.get("kind") == "Circle" and op.get("role") in {"pad_drill", "npth_hole"}:
                    center = placed([point_nm(op.get("cx"), op.get("cy"))])[0]
                    holes.append(Point(center).buffer(float(op.get("diameter_nm") or 0) * NM_TO_MM / 2))
                elif op.get("kind") == "ThickSegment" and op.get("role") in {"pad_drill", "npth_hole"}:
                    # Oval drill: a slot along the segment.
                    start, end = placed([
                        point_nm(op.get("start_x"), op.get("start_y")),
                        point_nm(op.get("end_x"), op.get("end_y")),
                    ])
                    radius = float(op.get("width_nm") or 0) * NM_TO_MM / 2
                    holes.append(Polygon(capsule(start, end, radius)))
    return holes


def _mask_faces_mm(topology: dict[str, Any]) -> dict[str, float]:
    """Outer face height of each mask layer in KiCad's board frame.

    Same frame as the copper tiles: the stackup shifted so the bottom copper's
    inner face sits at 0.
    """

    layers = list(topology.get("layers") or [])
    copper = sorted(
        (layer for layer in layers if layer.get("role") == "copper"),
        key=lambda layer: float(layer.get("z_mm") or 0.0),
    )
    masks = {str(layer.get("name")): layer for layer in layers if layer.get("role") == "soldermask"}
    if len(copper) < 2:
        return {"top": 1.6, "bottom": -0.05}
    bottom, top = copper[0], copper[-1]
    offset = -(float(bottom.get("z_mm") or 0.0) + float(bottom.get("thickness_mm") or 0.0) / 2)

    def face(name: str, sign: int, copper_layer: dict[str, Any]) -> float:
        layer = masks.get(name)
        if layer:
            z = float(layer.get("z_mm") or 0.0) + sign * float(layer.get("thickness_mm") or 0.01) / 2
        else:
            # No mask layer in the stackup: a nominal 10 um over the outer copper.
            z = float(copper_layer.get("z_mm") or 0.0) + sign * (
                float(copper_layer.get("thickness_mm") or 0.035) / 2 + 0.01
            )
        return z + offset

    return {"top": face("F.Mask", 1, top), "bottom": face("B.Mask", -1, bottom)}


MASK_COLORS = {
    "green": [0.06, 0.16, 0.11, 0.83],
    "red": [0.52, 0.05, 0.05, 0.83],
    "blue": [0.05, 0.12, 0.42, 0.83],
    "black": [0.05, 0.05, 0.05, 0.85],
    "white": [0.9, 0.9, 0.9, 0.83],
    "purple": [0.3, 0.1, 0.4, 0.83],
    "yellow": [0.7, 0.62, 0.1, 0.83],
}


def mask_color(topology: dict[str, Any]) -> list[float]:
    """Mask colour from the F.Mask stackup layer, green by default."""

    for layer in topology.get("layers") or []:
        if layer.get("name") == "F.Mask":
            return MASK_COLORS.get(str(layer.get("color") or "").strip().lower(), MASK_COLORS["green"])
    return MASK_COLORS["green"]


def _tiled(geometry: Any) -> list[Any]:
    """Clip a geometry into TILE_MM squares; neighbours share their cut edges exactly."""

    if geometry.is_empty:
        return []
    min_x, min_y, max_x, max_y = geometry.bounds
    columns = max(1, math.ceil((max_x - min_x) / TILE_MM))
    rows = max(1, math.ceil((max_y - min_y) / TILE_MM))
    pieces = []
    for column in range(columns):
        x0 = min_x + column * TILE_MM
        x1 = max_x if column == columns - 1 else x0 + TILE_MM
        for row in range(rows):
            y0 = min_y + row * TILE_MM
            y1 = max_y if row == rows - 1 else y0 + TILE_MM
            piece = clip_by_rect(geometry, x0, y0, x1, y1)
            if not piece.is_empty:
                pieces.append(piece)
    return pieces


def _polygons_of(geometry: Any):
    if isinstance(geometry, Polygon):
        yield geometry
    else:
        for part in getattr(geometry, "geoms", []):
            yield from _polygons_of(part)


def _polygon_rings(geometries: list[Any]) -> list[dict[str, Any]]:
    polygons = []
    for polygon in (part for geometry in geometries for part in _polygons_of(geometry)):
        if polygon.is_empty or polygon.area <= 0:
            continue
        polygons.append({
            "outer": [[round(x, 5), round(y, 5)] for x, y in polygon.exterior.coords[:-1]],
            "holes": [
                [[round(x, 5), round(y, 5)] for x, y in ring.coords[:-1]]
                for ring in polygon.interiors
            ],
        })
    return polygons
