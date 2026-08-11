from __future__ import annotations

import hashlib
import base64
import html
import json
import math
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

from .schematic_world import (
    _hierarchy_depth,
    _layout_pages,
    _operation_bounds,
    _page_size,
    _record_bounds,
    _safe_name,
    _source_page_size,
)
from .vendor_paths import ensure_reference_paths


SCHEMA = "prism.schematic_vector_a0"
ELECTRICAL_NET_KINDS = {
    "wire",
    "junction",
    "label",
    "global_label",
    "hierarchical_label",
    "no_connect",
    "bus",
    "bus_entry",
    "pin",
    "pin_body",
    "pin_name",
    "pin_number",
}
COORDINATE_KEYS = {
    "x",
    "y",
    "cx",
    "cy",
    "x1",
    "y1",
    "x2",
    "y2",
    "start_x",
    "start_y",
    "mid_x",
    "mid_y",
    "end_x",
    "end_y",
    "radius_nm",
    "diameter_nm",
    "width_nm",
    "pen_width_nm",
    "size_x_nm",
    "size_y_nm",
}
NON_GEOMETRY_OPERATION_KINDS = {
    "EndPlot",
    "EndBlock",
    "SetColor",
    "SetCurrentLineWidth",
    "SetDash",
    "SetPageSettings",
    "SetViewport",
    "StartBlock",
    "StartPlot",
    "TextEmpty",
}
SUPPORTED_VECTOR_OPERATION_KINDS = {
    "ArcCenterAngle",
    "ArcThreePoint",
    "BezierCurve",
    "Circle",
    "PenTo",
    "Line",
    "PlotPoly",
    "PlotImage",
    "Rect",
    "ThickArc",
    "ThickSegment",
}

_STROKE_TEXT_THICKNESS_RATIO = 0.15
_STROKE_TEXT_BOLD_THICKNESS_RATIO = 0.20
_H_STROKE_ALIGNMENT = {
    "left": "left",
    "center": "center",
    "right": "right",
    "indeterminate": "left",
}
_V_STROKE_ALIGNMENT = {
    "top": "top",
    "center": "center",
    "bottom": "bottom",
    "indeterminate": "bottom",
}
_ITALIC_TILT = 1.0 / 8.0
_LABEL_TEXT_INSET_MM = 1.05
_LABEL_TEXT_KINDS = {"label", "hierarchical_label"}
_SVG_TAG_RE = re.compile(r"<\s*([a-zA-Z][\w:-]*)\b")
_DNP_MARKER_RGB = "#dc090d"


def _mm(value: Any) -> float:
    return float(value or 0) / 1_000_000.0


def _record_source_id(record: Any, index: int) -> str:
    uuid = str(getattr(record, "uuid", "") or "")
    object_id = str(getattr(record, "object_id", "") or "")
    return uuid or object_id or f"record-{index}"


def stable_feature_key(
    sheet_instance_path: str,
    source_id: str,
    operation_index: int,
    semantic_role: str,
    sub_feature_index: int,
) -> str:
    return (
        f"{sheet_instance_path or '/'} | {source_id or 'unknown'} | "
        f"{int(operation_index)} | {semantic_role or 'unknown'} | {int(sub_feature_index)}"
    )


def deterministic_feature_ids(feature_keys: list[str] | set[str]) -> dict[str, int]:
    return {key: index for index, key in enumerate(sorted(set(feature_keys)), start=1)}


def _text_cache_contours(data: dict[str, Any]) -> list[list[list[float]]] | None:
    polygons = data.get("render_cache_polygons")
    if polygons is None:
        cache = data.get("render_cache")
        if isinstance(cache, dict):
            polygons = cache.get("polygons") or cache.get("contours")
    if not isinstance(polygons, list) or not polygons:
        return None
    contours: list[list[list[float]]] = []
    for polygon in polygons:
        if not isinstance(polygon, list) or len(polygon) < 2:
            continue
        contour = []
        for point in polygon:
            if isinstance(point, dict):
                x = point.get("x", point.get("x_nm"))
                y = point.get("y", point.get("y_nm"))
            elif isinstance(point, (list, tuple)) and len(point) >= 2:
                x, y = point[0], point[1]
            else:
                continue
            if x is None or y is None:
                continue
            contour.append([_mm(x), _mm(y)])
        if len(contour) >= 2:
            contours.append(contour)
    return contours or None


def _polyline_bounds(polylines: list[list[list[float]]]) -> list[float] | None:
    points = [point for polyline in polylines for point in polyline]
    if not points:
        return None
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _json_checksum(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _bounds_union(bounds: list[list[float]]) -> list[float] | None:
    clean = [item for item in bounds if item and len(item) == 4]
    if not clean:
        return None
    return [
        min(item[0] for item in clean),
        min(item[1] for item in clean),
        max(item[2] for item in clean),
        max(item[3] for item in clean),
    ]


def _primitive_bounds(primitive: dict[str, Any]) -> list[float] | None:
    if bounds := primitive.get("boundsMm"):
        return [float(value) for value in bounds[:4]]
    points: list[list[float]] = []
    for key in ("pointsMm",):
        points.extend(primitive.get(key) or [])
    for key in ("polylinesMm", "contoursMm"):
        for polyline in primitive.get(key) or []:
            points.extend(polyline)
    for triangle in primitive.get("trianglesMm") or []:
        points.extend(triangle)
    if primitive.get("kind") == "plotimage":
        x = float(primitive.get("xMm") or 0)
        y = float(primitive.get("yMm") or 0)
        return [x, y, x + float(primitive.get("widthMm") or 0), y + float(primitive.get("heightMm") or 0)]
    if all(key in primitive for key in ("x1Mm", "y1Mm", "x2Mm", "y2Mm")):
        points.extend([[primitive["x1Mm"], primitive["y1Mm"]], [primitive["x2Mm"], primitive["y2Mm"]]])
    if all(key in primitive for key in ("cxMm", "cyMm")):
        radius = float(primitive.get("radiusMm") or primitive.get("diameterMm", 0) / 2 or 0)
        cx = float(primitive["cxMm"])
        cy = float(primitive["cyMm"])
        return [cx - radius, cy - radius, cx + radius, cy + radius]
    if not points:
        return None
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _count_by_key(items: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for item in items:
        counts[str(item.get(key) or "unknown")] += 1
    return dict(sorted(counts.items()))


def _svg_tag_counts(svg_text: str) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for match in _SVG_TAG_RE.finditer(svg_text):
        tag = match.group(1).split(":")[-1]
        counts[tag] += 1
    return dict(sorted(counts.items()))


def _svg_number(value: Any, precision: int = 4) -> str:
    text = f"{float(value):.{precision}f}"
    return text.rstrip("0").rstrip(".") or "0"


def _svg_points(points: list[list[float]]) -> str:
    return " ".join(f"{_svg_number(point[0])},{_svg_number(point[1])}" for point in points)


def _svg_style_color(primitive: dict[str, Any], *, fill: bool = False) -> str:
    color = primitive.get("fillColor" if fill else "color") or primitive.get("strokeColor") or ""
    if isinstance(color, str) and color.startswith("#") and len(color) in {7, 9}:
        return color[:7]
    if primitive.get("semanticRole") in {"wire", "bus", "junction"}:
        return "#008000"
    if str(primitive.get("kind") or "").startswith("text"):
        return "#006464"
    return "#840000"


def _native_preview_svg(page: dict[str, Any], primitives: list[dict[str, Any]]) -> str:
    width = float(page["sourceWidthMm"])
    height = float(page["sourceHeightMm"])
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {_svg_number(width)} {_svg_number(height)}" '
        f'width="{_svg_number(width)}mm" height="{_svg_number(height)}mm">',
        '<rect x="0" y="0" width="100%" height="100%" fill="#f7f5ea"/>',
    ]
    for primitive in primitives:
        kind = str(primitive.get("kind") or "")
        stroke = _svg_style_color(primitive)
        fill = _svg_style_color(primitive, fill=True)
        width_mm = max(float(primitive.get("widthMm") or primitive.get("pen_widthMm") or 0.12), 0.05)
        if kind == "plotimage" and primitive.get("image"):
            image_path = html.escape(str(primitive["image"]["path"]))
            lines.append(
                f'<image href="../{image_path}" x="{_svg_number(primitive.get("xMm", 0))}" '
                f'y="{_svg_number(primitive.get("yMm", 0))}" '
                f'width="{_svg_number(primitive.get("widthMm", 0))}" '
                f'height="{_svg_number(primitive.get("heightMm", 0))}" opacity="0.92"/>'
            )
            continue
        for triangle in primitive.get("trianglesMm") or []:
            if len(triangle) == 3:
                lines.append(f'<polygon points="{_svg_points(triangle)}" fill="{fill}" stroke="none" opacity="0.9"/>')
        for polyline in primitive.get("polylinesMm") or []:
            if len(polyline) >= 2:
                lines.append(
                    f'<polyline points="{_svg_points(polyline)}" fill="none" '
                    f'stroke="{stroke}" stroke-width="{_svg_number(width_mm)}" '
                    'stroke-linecap="round" stroke-linejoin="round"/>'
                )
        points = primitive.get("pointsMm") or []
        if len(points) >= 2:
            tag = "polygon" if kind in {"plotpoly", "polygon"} and str(primitive.get("fill") or "").upper() == "FILLED_SHAPE" else "polyline"
            fill_attr = f'fill="{fill}" opacity="0.9"' if tag == "polygon" else 'fill="none"'
            lines.append(
                f'<{tag} points="{_svg_points(points)}" {fill_attr} stroke="{stroke}" '
                f'stroke-width="{_svg_number(width_mm)}" stroke-linecap="round" stroke-linejoin="round"/>'
            )
        elif all(key in primitive for key in ("x1Mm", "y1Mm", "x2Mm", "y2Mm")):
            if kind == "rect":
                x1 = float(primitive["x1Mm"])
                y1 = float(primitive["y1Mm"])
                x2 = float(primitive["x2Mm"])
                y2 = float(primitive["y2Mm"])
                lines.append(
                    f'<rect x="{_svg_number(min(x1, x2))}" y="{_svg_number(min(y1, y2))}" '
                    f'width="{_svg_number(abs(x2 - x1))}" height="{_svg_number(abs(y2 - y1))}" '
                    f'fill="none" stroke="{stroke}" stroke-width="{_svg_number(width_mm)}"/>'
                )
            else:
                lines.append(
                    f'<line x1="{_svg_number(primitive["x1Mm"])}" y1="{_svg_number(primitive["y1Mm"])}" '
                    f'x2="{_svg_number(primitive["x2Mm"])}" y2="{_svg_number(primitive["y2Mm"])}" '
                    f'stroke="{stroke}" stroke-width="{_svg_number(width_mm)}" stroke-linecap="round"/>'
                )
        elif all(key in primitive for key in ("cxMm", "cyMm")):
            radius = float(primitive.get("radiusMm") or primitive.get("diameterMm", 0) / 2 or 0.4)
            fill_attr = fill if str(primitive.get("fill") or "").upper() == "FILLED_SHAPE" else "none"
            lines.append(
                f'<circle cx="{_svg_number(primitive["cxMm"])}" cy="{_svg_number(primitive["cyMm"])}" '
                f'r="{_svg_number(radius)}" fill="{fill_attr}" stroke="{stroke}" '
                f'stroke-width="{_svg_number(width_mm)}"/>'
            )
    lines.append("</svg>")
    return "\n".join(lines)


def _native_overlay_svg(page: dict[str, Any], primitives: list[dict[str, Any]]) -> str:
    width = float(page["sourceWidthMm"])
    height = float(page["sourceHeightMm"])
    source = html.escape("../" + str(page["svg"]))
    native = _native_preview_svg(page, primitives)
    body = native.split(">", 1)[1].rsplit("</svg>", 1)[0]
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {_svg_number(width)} {_svg_number(height)}" '
        f'width="{_svg_number(width)}mm" height="{_svg_number(height)}mm">',
        f'<image href="{source}" x="0" y="0" width="{_svg_number(width)}" height="{_svg_number(height)}" opacity="0.34"/>',
        '<g id="native-vector-preview" opacity="0.82">',
        body,
        "</g>",
        "</svg>",
    ])


def _visual_regression_page_report(
    page: dict[str, Any],
    primitives: list[dict[str, Any]],
    unsupported: list[dict[str, str]],
    svg_text: str,
) -> dict[str, Any]:
    primitive_bounds = [_primitive_bounds(primitive) for primitive in primitives]
    native_payload = [
        {
            "featureId": primitive.get("featureId", 0),
            "kind": primitive.get("kind", ""),
            "semanticRole": primitive.get("semanticRole", ""),
            "boundsMm": _primitive_bounds(primitive),
        }
        for primitive in primitives
    ]
    return {
        "pageId": page["id"],
        "name": page["name"],
        "svg": page["svg"],
        "nativePreview": f"parity/{page['id']}-native.svg",
        "overlay": f"parity/{page['id']}-overlay.svg",
        "nativeChecksum": _json_checksum(native_payload),
        "svgChecksum": hashlib.sha256(svg_text.encode("utf-8")).hexdigest(),
        "nativePrimitiveCount": len(primitives),
        "nativePrimitiveCounts": _count_by_key(primitives, "kind"),
        "nativeSemanticCounts": _count_by_key(primitives, "semanticRole"),
        "sourceSvgTagCounts": _svg_tag_counts(svg_text),
        "nativeBoundsMm": _bounds_union([bounds for bounds in primitive_bounds if bounds]),
        "unsupportedCount": len(unsupported),
        "unsupportedCounts": _count_by_key(unsupported, "operationKind"),
        "imagePrimitiveCount": sum(1 for primitive in primitives if primitive.get("kind") == "plotimage"),
        "textPrimitiveCount": sum(1 for primitive in primitives if str(primitive.get("kind") or "").startswith("text")),
    }


def _primitive_style(data: dict[str, Any]) -> dict[str, Any]:
    style: dict[str, Any] = {}
    if color := data.get("color") or data.get("stroke_color"):
        style["color"] = str(color)
    if fill_color := data.get("fill_color"):
        style["fillColor"] = str(fill_color)
    if fill := data.get("fill"):
        style["fill"] = str(fill)
    if line_style := data.get("line_style"):
        style["lineStyle"] = str(line_style)
    if stroke_color := data.get("stroke_color"):
        style["strokeColor"] = str(stroke_color)
    return style


def _circle_from_three_points(
    start: tuple[float, float],
    mid: tuple[float, float],
    end: tuple[float, float],
) -> tuple[tuple[float, float], float] | None:
    ax, ay = start
    bx, by = mid
    cx, cy = end
    denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(denominator) < 1e-9:
        return None
    ux = (
        (ax * ax + ay * ay) * (by - cy)
        + (bx * bx + by * by) * (cy - ay)
        + (cx * cx + cy * cy) * (ay - by)
    ) / denominator
    uy = (
        (ax * ax + ay * ay) * (cx - bx)
        + (bx * bx + by * by) * (ax - cx)
        + (cx * cx + cy * cy) * (bx - ax)
    ) / denominator
    radius = math.hypot(ax - ux, ay - uy)
    return (ux, uy), radius


def _angle_between(start: float, mid: float, end: float) -> tuple[float, float]:
    tau = math.tau
    start = start % tau
    mid = mid % tau
    end = end % tau
    ccw_span = (end - start) % tau
    mid_ccw = (mid - start) % tau
    if mid_ccw <= ccw_span:
        return start, start + ccw_span
    cw_span = (start - end) % tau
    return start, start - cw_span


def _arc_points_from_three_points(data: dict[str, Any]) -> list[list[float]] | None:
    start = (_mm(data.get("start_x", 0)), _mm(data.get("start_y", 0)))
    mid = (_mm(data.get("mid_x", 0)), _mm(data.get("mid_y", 0)))
    end = (_mm(data.get("end_x", 0)), _mm(data.get("end_y", 0)))
    circle = _circle_from_three_points(start, mid, end)
    if circle is None:
        return [list(start), list(mid), list(end)]
    center, radius = circle
    start_angle = math.atan2(start[1] - center[1], start[0] - center[0])
    mid_angle = math.atan2(mid[1] - center[1], mid[0] - center[0])
    end_angle = math.atan2(end[1] - center[1], end[0] - center[0])
    a0, a1 = _angle_between(start_angle, mid_angle, end_angle)
    return _arc_points(center, radius, a0, a1)


def _arc_points(
    center: tuple[float, float],
    radius: float,
    start_angle: float,
    end_angle: float,
) -> list[list[float]]:
    angle_span = end_angle - start_angle
    chord_error = 0.025
    if radius <= 0:
        return [[center[0], center[1]]]
    step_angle = 2 * math.acos(max(-1, min(1, 1 - chord_error / max(radius, chord_error))))
    steps = max(8, min(96, int(math.ceil(abs(angle_span) / max(step_angle, 0.05)))))
    return [
        [
            center[0] + math.cos(start_angle + angle_span * index / steps) * radius,
            center[1] + math.sin(start_angle + angle_span * index / steps) * radius,
        ]
        for index in range(steps + 1)
    ]


def _bezier_points(points: list[list[float]]) -> list[list[float]]:
    if len(points) < 4:
        return points
    p0, p1, p2, p3 = points[:4]
    steps = 24
    out = []
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        out.append([
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ])
    return out


def _polygon_area(points: list[list[float]]) -> float:
    area = 0.0
    for index, point in enumerate(points):
        nxt = points[(index + 1) % len(points)]
        area += point[0] * nxt[1] - nxt[0] * point[1]
    return area * 0.5


def _point_in_triangle(point: list[float], a: list[float], b: list[float], c: list[float]) -> bool:
    def sign(p1: list[float], p2: list[float], p3: list[float]) -> float:
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign(point, a, b)
    d2 = sign(point, b, c)
    d3 = sign(point, c, a)
    has_neg = d1 < -1e-9 or d2 < -1e-9 or d3 < -1e-9
    has_pos = d1 > 1e-9 or d2 > 1e-9 or d3 > 1e-9
    return not (has_neg and has_pos)


def _clean_contour(points: list[list[float]]) -> list[list[float]]:
    clean: list[list[float]] = []
    for point in points:
        if not clean or math.hypot(clean[-1][0] - point[0], clean[-1][1] - point[1]) > 1e-9:
            clean.append(point)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) <= 1e-9:
        clean.pop()
    return clean


def _triangulate_simple_polygon(points: list[list[float]]) -> list[list[list[float]]] | None:
    clean = _clean_contour(points)
    if len(clean) < 3:
        return None
    if len(clean) == 3:
        return [clean]

    ccw = _polygon_area(clean) > 0
    remaining = list(range(len(clean)))
    triangles: list[list[list[float]]] = []
    guard = 0
    while len(remaining) > 3 and guard < len(clean) * len(clean):
        guard += 1
        clipped = False
        for cursor, current_index in enumerate(list(remaining)):
            prev_index = remaining[(cursor - 1) % len(remaining)]
            next_index = remaining[(cursor + 1) % len(remaining)]
            a = clean[prev_index]
            b = clean[current_index]
            c = clean[next_index]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if (ccw and cross <= 1e-9) or (not ccw and cross >= -1e-9):
                continue
            if any(
                index not in {prev_index, current_index, next_index}
                and _point_in_triangle(clean[index], a, b, c)
                for index in remaining
            ):
                continue
            triangles.append([a, b, c] if ccw else [a, c, b])
            remaining.remove(current_index)
            clipped = True
            break
        if not clipped:
            return None
    if len(remaining) == 3:
        a, b, c = [clean[index] for index in remaining]
        triangles.append([a, b, c] if ccw else [a, c, b])
    return triangles


def _triangulate_with_earcut(contours: list[list[list[float]]]) -> list[list[list[float]]] | None:
    cleaned = [_clean_contour(contour) for contour in contours]
    cleaned = [contour for contour in cleaned if len(contour) >= 3]
    if not cleaned:
        return None
    repo_root = Path(__file__).resolve().parents[2]
    earcut_path = repo_root / "node_modules" / "earcut" / "src" / "earcut.js"
    if not earcut_path.exists():
        return None
    vertices: list[float] = []
    points: list[list[float]] = []
    holes: list[int] = []
    for index, contour in enumerate(cleaned):
        if index:
            holes.append(len(points))
        for point in contour:
            points.append(point)
            vertices.extend(point[:2])
    script = """
import fs from 'node:fs';
import earcut from './node_modules/earcut/src/earcut.js';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(earcut(input.vertices, input.holes, 2)));
"""
    try:
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=repo_root,
            input=json.dumps({"vertices": vertices, "holes": holes}),
            text=True,
            capture_output=True,
            timeout=10,
            check=True,
        )
        indices = json.loads(result.stdout or "[]")
    except Exception:
        return None
    if len(indices) % 3:
        return None
    triangles = []
    for offset in range(0, len(indices), 3):
        try:
            triangles.append([points[int(indices[offset])], points[int(indices[offset + 1])], points[int(indices[offset + 2])]])
        except (IndexError, TypeError, ValueError):
            return None
    return triangles or None


def _triangulate_contours(contours: list[list[list[float]]]) -> tuple[list[list[list[float]]], str] | tuple[None, str]:
    if not contours:
        return None, ""
    if triangles := _triangulate_with_earcut(contours):
        return triangles, "earcut"
    if len(contours) == 1:
        if triangles := _triangulate_simple_polygon(contours[0]):
            return triangles, "earclip-simple"
    return None, ""


def _polygon_contours_from_data(data: dict[str, Any], primitive: dict[str, Any]) -> list[list[list[float]]]:
    if primitive.get("pointsMm"):
        return [primitive["pointsMm"]]
    raw_contours = data.get("contours") or data.get("polygons") or []
    contours = []
    if isinstance(raw_contours, list):
        for contour in raw_contours:
            if not isinstance(contour, list):
                continue
            points = []
            for point in contour:
                if isinstance(point, dict):
                    if "x" in point and "y" in point:
                        points.append([_mm(point["x"]), _mm(point["y"])])
                elif isinstance(point, (list, tuple)) and len(point) >= 2:
                    points.append([_mm(point[0]), _mm(point[1])])
            if points:
                contours.append(points)
    return contours


def _image_primitive(data: dict[str, Any], feature_id: int) -> tuple[dict[str, Any] | None, str | None]:
    image_data = str(data.get("image_data_b64") or "")
    image_format = str(data.get("image_format") or "png").lower().strip(".") or "png"
    if not image_data:
        return None, "PlotImage"
    center_x = _mm(data.get("x", 0))
    center_y = _mm(data.get("y", 0))
    width = _mm(data.get("width_nm", 0))
    height = _mm(data.get("height_nm", 0))
    if width <= 0 or height <= 0:
        return None, "PlotImage"
    x = center_x - width / 2
    y = center_y - height / 2
    primitive = {
        "featureId": feature_id,
        "kind": "plotimage",
        "centerXMm": center_x,
        "centerYMm": center_y,
        "xMm": x,
        "yMm": y,
        "widthMm": width,
        "heightMm": height,
        "boundsMm": [x, y, x + width, y + height],
        "imageFormat": image_format,
        "imageDataB64": image_data,
    }
    primitive.update(_primitive_style(data))
    if "scale" in data:
        primitive["scale"] = float(data.get("scale") or 1)
    return primitive, None


def _shear_text_polylines(
    polylines: list[list[tuple[float, float]]] | list[list[list[float]]],
    *,
    anchor_x: float,
    anchor_y: float,
    angle_deg: float,
    mirror: bool,
) -> list[list[list[float]]]:
    """Apply KiCad NewStroke italic in the viewer's y-down schematic space."""

    angle_rad = math.radians(-angle_deg)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    tilt = -_ITALIC_TILT * (-1 if mirror else 1)
    sheared: list[list[list[float]]] = []
    for polyline in polylines:
        transformed = []
        for x, y in polyline:
            dx = float(x) - anchor_x
            dy = float(y) - anchor_y
            sx = dx * cos_a + dy * sin_a
            sy = -dx * sin_a + dy * cos_a
            sx += sy * tilt
            rx = sx * cos_a - sy * sin_a
            ry = sx * sin_a + sy * cos_a
            transformed.append([rx + anchor_x, ry + anchor_y])
        if len(transformed) >= 2:
            sheared.append(transformed)
    return sheared


def _translate_primitive_geometry(primitive: dict[str, Any], dx: float, dy: float) -> None:
    def shift_point(point: list[float] | tuple[float, float]) -> list[float]:
        return [float(point[0]) + dx, float(point[1]) + dy]

    for key in ("pointsMm",):
        if primitive.get(key):
            primitive[key] = [shift_point(point) for point in primitive[key]]
    for key in ("polylinesMm", "contoursMm"):
        if primitive.get(key):
            primitive[key] = [[shift_point(point) for point in polyline] for polyline in primitive[key]]
    if primitive.get("trianglesMm"):
        primitive["trianglesMm"] = [[shift_point(point) for point in triangle] for triangle in primitive["trianglesMm"]]
    for x_key, y_key in (
        ("xMm", "yMm"),
        ("centerXMm", "centerYMm"),
        ("cxMm", "cyMm"),
        ("x1Mm", "y1Mm"),
        ("x2Mm", "y2Mm"),
        ("start_xMm", "start_yMm"),
        ("mid_xMm", "mid_yMm"),
        ("end_xMm", "end_yMm"),
    ):
        if x_key in primitive and y_key in primitive:
            primitive[x_key] = float(primitive[x_key]) + dx
            primitive[y_key] = float(primitive[y_key]) + dy
    if primitive.get("boundsMm"):
        left, top, right, bottom = primitive["boundsMm"]
        primitive["boundsMm"] = [left + dx, top + dy, right + dx, bottom + dy]


def _inset_label_text_primitive(primitive: dict[str, Any], record_kind: str) -> None:
    if record_kind not in _LABEL_TEXT_KINDS or not str(primitive.get("kind") or "").startswith("text"):
        return
    style = primitive.get("style") or {}
    h_align = str(style.get("hAlign") or "").lower()
    if h_align == "center":
        return
    direction = 1.0 if h_align == "left" else -1.0
    angle = math.radians(float(style.get("orientDeg") or 0))
    dx = math.cos(angle) * _LABEL_TEXT_INSET_MM * direction
    dy = -math.sin(angle) * _LABEL_TEXT_INSET_MM * direction
    _translate_primitive_geometry(primitive, dx, dy)


def _materialize_image_primitive(primitive: dict[str, Any], image_dir: Path) -> str | None:
    image_data = primitive.pop("imageDataB64", "")
    if not image_data:
        return None
    try:
        payload = base64.b64decode(image_data, validate=True)
    except Exception:
        return None
    image_format = str(primitive.get("imageFormat") or "png").lower().strip(".") or "png"
    digest = hashlib.sha256(payload).hexdigest()
    filename = f"{digest[:24]}.{image_format}"
    image_dir.mkdir(parents=True, exist_ok=True)
    output = image_dir / filename
    if not output.exists():
        output.write_bytes(payload)
    primitive["image"] = {
        "path": f"images/{filename}",
        "format": image_format,
        "bytes": len(payload),
        "sha256": digest,
    }
    return filename


def _normalize_align(value: Any, mapping: dict[str, str], default: str) -> str:
    raw = str(value or default).split(".")[-1].lower()
    if raw.startswith("gr_text_h_align_"):
        raw = raw.replace("gr_text_h_align_", "", 1)
    if raw.startswith("gr_text_v_align_"):
        raw = raw.replace("gr_text_v_align_", "", 1)
    return mapping.get(raw, default)


def _stroke_renderer():
    try:
        from kicad_monkey.kicad_stroke_font import get_renderer  # type: ignore
    except ModuleNotFoundError:
        ensure_reference_paths()
        from kicad_monkey.kicad_stroke_font import get_renderer  # type: ignore
    return get_renderer()


def _schematic_text_length_mm(
    text: str,
    size_x_nm: int,
    *,
    bold: bool = False,
    italic: bool = False,
    font_face: str = "",
) -> float:
    if not text or size_x_nm <= 0:
        return 0.0
    try:
        from kicad_monkey.kicad_schematic_to_ir import _schematic_outline_text_width_nm  # type: ignore
    except ModuleNotFoundError:
        ensure_reference_paths()
        from kicad_monkey.kicad_schematic_to_ir import _schematic_outline_text_width_nm  # type: ignore
    except Exception:
        return 0.0
    try:
        return float(
            _schematic_outline_text_width_nm(
                text,
                int(size_x_nm),
                bold=bold,
                italic=italic,
                font_face=font_face,
            )
        ) / 1_000_000.0
    except Exception:
        return 0.0


def _apply_text_length_adjust(
    polylines: list[list[tuple[float, float]]],
    *,
    target_length_mm: float,
    angle_deg: float,
    h_align: str,
    v_align: str,
) -> list[list[tuple[float, float]]]:
    if target_length_mm <= 0 or not polylines:
        return polylines
    angle_rad = math.radians(angle_deg)
    axis = (math.cos(angle_rad), -math.sin(angle_rad))
    normal = (math.sin(angle_rad), math.cos(angle_rad))
    axis_projections = [
        point[0] * axis[0] + point[1] * axis[1]
        for polyline in polylines
        for point in polyline
    ]
    normal_projections = [
        point[0] * normal[0] + point[1] * normal[1]
        for polyline in polylines
        for point in polyline
    ]
    if not axis_projections or not normal_projections:
        return polylines
    current_min = min(axis_projections)
    current_max = max(axis_projections)
    current_span = current_max - current_min
    if current_span <= 1e-9:
        return polylines
    normalized_align = str(h_align or "left").lower()
    if normalized_align == "right":
        axis_anchor = current_max
    elif normalized_align == "center":
        axis_anchor = (current_min + current_max) * 0.5
    else:
        axis_anchor = current_min
    normal_min = min(normal_projections)
    normal_max = max(normal_projections)
    normalized_v_align = str(v_align or "bottom").lower()
    if normalized_v_align == "top":
        normal_anchor = normal_min
    elif normalized_v_align == "center":
        normal_anchor = (normal_min + normal_max) * 0.5
    else:
        normal_anchor = normal_max
    scale = target_length_mm / current_span

    def scale_point(point: tuple[float, float]) -> tuple[float, float]:
        axis_projected = point[0] * axis[0] + point[1] * axis[1]
        normal_projected = point[0] * normal[0] + point[1] * normal[1]
        axis_delta = (axis_anchor + (axis_projected - axis_anchor) * scale) - axis_projected
        normal_delta = (normal_anchor + (normal_projected - normal_anchor) * scale) - normal_projected
        return (
            point[0] + axis[0] * axis_delta + normal[0] * normal_delta,
            point[1] + axis[1] * axis_delta + normal[1] * normal_delta,
        )

    return [[scale_point(point) for point in polyline] for polyline in polylines]


def _newstroke_text_primitive(
    data: dict[str, Any],
    feature_id: int,
    *,
    record_kind: str = "",
) -> tuple[dict[str, Any] | None, str | None]:
    text = str(data.get("text") or "")
    if not text:
        return None, "TextEmpty"

    size_x_nm = int(data.get("size_x_nm") or 1_270_000)
    size_y_nm = int(data.get("size_y_nm") or 1_270_000)
    bold = bool(data.get("bold"))
    italic = bool(data.get("italic"))
    mirror = bool(data.get("mirror"))
    orient_deg = float(data.get("orient_deg", data.get("angle", 0)) or 0)
    h_align = _normalize_align(data.get("h_align"), _H_STROKE_ALIGNMENT, "left")
    v_align = _normalize_align(data.get("v_align"), _V_STROKE_ALIGNMENT, "bottom")
    font_face = str(data.get("font_face") or "")
    ratio = _STROKE_TEXT_BOLD_THICKNESS_RATIO if bold else _STROKE_TEXT_THICKNESS_RATIO
    default_pen_nm = int(round(size_y_nm * ratio))
    pen_width_nm = data.get("pen_width_nm")
    effective_pen_nm = default_pen_nm if pen_width_nm is None or int(pen_width_nm or 0) <= 0 else int(pen_width_nm)

    x_mm = _mm(data.get("x", 0))
    y_mm = _mm(data.get("y", 0))
    size_x_mm = size_x_nm / 1_000_000.0
    size_y_mm = size_y_nm / 1_000_000.0
    lines = text.splitlines() or [text]
    line_height = size_y_mm * 1.25
    angle_rad = math.radians(orient_deg)
    advance_x = -line_height * math.sin(angle_rad)
    advance_y = line_height * math.cos(angle_rad)
    if len(lines) > 1:
        if v_align == "center":
            start_offset = -(len(lines) - 1) / 2
        elif v_align == "bottom":
            start_offset = -(len(lines) - 1)
        else:
            start_offset = 0
    else:
        start_offset = 0
    try:
        polylines = []
        for line_index, line in enumerate(lines):
            offset = start_offset + line_index
            line_polylines = _stroke_renderer().render_text_polylines(
                text=line,
                pos_x=x_mm + advance_x * offset,
                pos_y=y_mm + advance_y * offset,
                size_x=size_x_mm,
                size_y=size_y_mm,
                angle=orient_deg,
                h_align=h_align,
                v_align=v_align,
                mirror=mirror,
                italic=False,
            )
            target_length_mm = _schematic_text_length_mm(
                line,
                size_x_nm,
                bold=bold,
                italic=italic,
                font_face=font_face,
            )
            line_polylines = _apply_text_length_adjust(
                line_polylines,
                target_length_mm=target_length_mm,
                angle_deg=orient_deg,
                h_align=h_align,
                v_align=v_align,
            )
            polylines.extend(line_polylines)
    except Exception as exc:  # pragma: no cover - diagnostic path depends on external renderer failures.
        return None, f"TextNewStrokeError:{type(exc).__name__}"

    if italic:
        polylines = _shear_text_polylines(
            polylines,
            anchor_x=x_mm,
            anchor_y=y_mm,
            angle_deg=orient_deg,
            mirror=mirror,
        )

    polylines_mm = [
        [[float(x), float(y)] for x, y in polyline]
        for polyline in polylines
        if len(polyline) >= 2
    ]
    if not polylines_mm:
        return None, "TextNewStrokeEmpty"

    primitive: dict[str, Any] = {
        "featureId": feature_id,
        "kind": "text_strokes",
        "provider": "newstroke",
        "polylinesMm": polylines_mm,
        "widthMm": effective_pen_nm / 1_000_000.0,
        "text": text,
        "style": {
            "provider": "newstroke",
            "sizeXNm": size_x_nm,
            "sizeYNm": size_y_nm,
            "orientDeg": orient_deg,
            "hAlign": h_align,
            "vAlign": v_align,
            "mirror": mirror,
            "italic": italic,
            "bold": bold,
            "fontFace": font_face,
            "multiline": len(lines) > 1,
            "lineCount": len(lines),
            "effectiveStrokeWidthMm": effective_pen_nm / 1_000_000.0,
        },
    }
    primitive["style"]["lengthProvider"] = "kicad_monkey._schematic_outline_text_width_nm"
    primitive["style"]["lengthAdjust"] = "spacingAndGlyphs"
    if data.get("color"):
        primitive["color"] = str(data.get("color") or "")
    if bounds := _polyline_bounds(polylines_mm):
        pad = primitive["widthMm"] / 2
        primitive["boundsMm"] = [bounds[0] - pad, bounds[1] - pad, bounds[2] + pad, bounds[3] + pad]
    return primitive, None


def _semantic_role(record_kind: str, operation_kind: str) -> str:
    lowered_record = str(record_kind or "").lower()
    if lowered_record in {
        "wire",
        "bus",
        "bus_entry",
        "junction",
        "no_connect",
        "label",
        "global_label",
        "hierarchical_label",
        "pin",
    }:
        return lowered_record
    lowered_op = str(operation_kind or "").lower()
    if lowered_op == "plotpoly":
        return "graphic_polyline"
    if lowered_op == "rect":
        return "graphic_rect"
    if lowered_op == "circle":
        return "graphic_circle"
    if lowered_op.startswith("arc"):
        return "graphic_arc"
    if lowered_op == "text":
        return "text"
    return lowered_op or lowered_record or "unknown"


def _is_symbol_record(record: Any) -> bool:
    return str(getattr(record, "kind", "") or "") in {"symbol_instance", "symbol_overplot"}


def _is_dnp_marker_operation(data: dict[str, Any]) -> bool:
    """Identify KiCad's red assembly-exclusion cross operations.

    kicad-monkey emits the cross as two thick segments at the end of a DNP
    symbol record.  They used to be folded into the generic ``symbol_body``
    feature, which let later body geometry obscure them and made their bounds
    indistinguishable from the grey symbol.  The layer color is KiCad's stable
    semantic marker for these otherwise ordinary segments.
    """
    kind = str(data.get("kind") or "")
    color = str(data.get("stroke_color") or data.get("color") or "").casefold()
    return kind in {"Line", "PenTo", "ThickSegment"} and color.startswith(_DNP_MARKER_RGB)


def _component_indexes(design_payload: dict[str, Any], topology: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    by_designator: dict[str, dict[str, Any]] = {}
    for component in design_payload.get("components", []) or []:
        designator = str(component.get("designator") or "")
        if not designator:
            continue
        by_designator[designator] = {
            "componentDesignator": designator,
            "componentSvgId": str(component.get("svg_id") or ""),
            "componentValue": str(component.get("value") or ""),
            "componentFootprint": str(component.get("footprint") or ""),
            "libraryRef": str(component.get("library_ref") or ""),
        }
    if topology:
        for component in topology.get("components", []) or []:
            designator = str(component.get("designator") or "")
            if not designator:
                continue
            by_designator.setdefault(designator, {"componentDesignator": designator})
            by_designator[designator].update(
                {
                    "componentUid": str(component.get("uid") or ""),
                    "componentValue": str(component.get("value") or by_designator[designator].get("componentValue") or ""),
                    "componentFootprint": str(component.get("footprint") or by_designator[designator].get("componentFootprint") or ""),
                }
            )
    return by_designator


def _pin_lookup_indexes(
    design_payload: dict[str, Any],
    topology: dict[str, Any] | None,
    component_by_designator: dict[str, dict[str, Any]],
) -> dict[str, dict[Any, dict[str, Any]]]:
    by_svg_id: dict[Any, dict[str, Any]] = {}
    by_designator_pin: dict[Any, dict[str, Any]] = {}
    for net in design_payload.get("nets", []) or []:
        net_payload = {
            "netUid": str(net.get("uid") or ""),
            "netName": str(net.get("name") or ""),
            "netClass": str(net.get("net_class") or ""),
        }
        terminal_meta: dict[tuple[str, str], dict[str, Any]] = {}
        for terminal in net.get("terminals", []) or []:
            designator = str(terminal.get("designator") or "")
            pin = str(terminal.get("pin") or "")
            if not designator or not pin:
                continue
            terminal_meta[(designator, pin)] = {
                **net_payload,
                "designator": designator,
                "pinNumber": pin,
                "pinName": str(terminal.get("pin_name") or ""),
                "pinType": str(terminal.get("pin_type") or ""),
            }
        for pin_item in (net.get("graphical", {}) or {}).get("pins", []) or []:
            designator = str(pin_item.get("designator") or "")
            pin = str(pin_item.get("pin") or "")
            svg_id = str(pin_item.get("svg_id") or "")
            if not designator or not pin:
                continue
            payload = {
                **terminal_meta.get((designator, pin), net_payload),
                **component_by_designator.get(designator, {}),
                "designator": designator,
                "pinNumber": pin,
                "svgId": svg_id,
            }
            by_designator_pin[(designator, pin)] = payload
            if svg_id:
                by_svg_id[svg_id] = payload
        for endpoint in net.get("endpoints", []) or []:
            if endpoint.get("role") != "pin":
                continue
            designator = str(endpoint.get("designator") or "")
            pin = str(endpoint.get("pin") or "")
            object_id = str(endpoint.get("object_id") or endpoint.get("element_id") or "")
            if not designator or not pin:
                continue
            payload = {
                **terminal_meta.get((designator, pin), net_payload),
                **component_by_designator.get(designator, {}),
                "designator": designator,
                "pinNumber": pin,
                "pinName": str(endpoint.get("pin_name") or terminal_meta.get((designator, pin), {}).get("pinName") or ""),
                "pinType": str(endpoint.get("pin_type") or terminal_meta.get((designator, pin), {}).get("pinType") or ""),
                "svgId": object_id,
            }
            by_designator_pin[(designator, pin)] = {**by_designator_pin.get((designator, pin), {}), **payload}
            if object_id:
                by_svg_id[object_id] = {**by_svg_id.get(object_id, {}), **payload}

    if topology:
        for terminal in topology.get("terminals", []) or []:
            component_uid = str(terminal.get("component_uid") or "")
            pin = str(terminal.get("pin") or terminal.get("pad") or "")
            designator = ""
            for component in topology.get("components", []) or []:
                if str(component.get("uid") or "") == component_uid:
                    designator = str(component.get("designator") or "")
                    break
            if not designator or not pin:
                continue
            payload = {
                **component_by_designator.get(designator, {}),
                "designator": designator,
                "pinNumber": pin,
                "terminalUid": str(terminal.get("uid") or ""),
                "pcbPadId": str(terminal.get("pcb_pad_id") or ""),
                "modelContactId": str(terminal.get("model_contact_id") or ""),
                "netUid": str(terminal.get("net_uid") or by_designator_pin.get((designator, pin), {}).get("netUid") or ""),
                "netName": str(terminal.get("net_name") or by_designator_pin.get((designator, pin), {}).get("netName") or ""),
                "componentUid": component_uid,
            }
            by_designator_pin[(designator, pin)] = {**by_designator_pin.get((designator, pin), {}), **payload}
    return {"bySvgId": by_svg_id, "byDesignatorPin": by_designator_pin}


def _topology_graphical_net_candidates(topology: dict[str, Any] | None) -> dict[str, list[dict[str, Any]]]:
    if not topology:
        return {}
    candidates: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for net in topology.get("nets", []) or []:
        payload = {
            "uid": str(net.get("uid") or ""),
            "name": str(net.get("name") or ""),
            "net_class": str(net.get("net_class") or ""),
        }
        if not payload["uid"]:
            continue
        for graphical_id in net.get("graphical_ids", []) or []:
            if not isinstance(graphical_id, str) or not graphical_id or graphical_id.startswith("{"):
                continue
            candidates[graphical_id].append(payload)
    indexes = topology.get("indexes", {}) or {}
    object_to_net = indexes.get("object_to_net", {}) or {}
    nets_by_uid = {str(net.get("uid") or ""): net for net in topology.get("nets", []) or []}
    for source_id, object_id_or_ids in (indexes.get("source_svg_to_object", {}) or {}).items():
        object_ids = object_id_or_ids if isinstance(object_id_or_ids, list) else [object_id_or_ids]
        for object_id in object_ids:
            net_uid = str(object_to_net.get(str(object_id)) or "")
            net = nets_by_uid.get(net_uid)
            if not net:
                continue
            candidates[str(source_id)].append(
                {
                    "uid": net_uid,
                    "name": str(net.get("name") or ""),
                    "net_class": str(net.get("net_class") or ""),
                }
            )
    return {key: _dedupe_net_candidates(value) for key, value in candidates.items()}


def _dedupe_net_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        uid = str(candidate.get("uid") or "")
        if uid:
            output[uid] = candidate
    return list(output.values())


def _page_topology_svg_to_net(
    topology_candidates: dict[str, list[dict[str, Any]]],
    *,
    sheet_name: str,
    source_path: str,
) -> dict[str, dict[str, Any]]:
    resolved: dict[str, dict[str, Any]] = {}
    context_tokens = [
        token
        for token in {
            sheet_name.lower(),
            Path(source_path).stem.replace("_", " ").replace("-", " ").lower(),
        }
        if token
    ]
    for source_id, candidates in topology_candidates.items():
        if len(candidates) == 1:
            resolved[source_id] = candidates[0]
            continue
        matching = [
            candidate
            for candidate in candidates
            if any(token and token in str(candidate.get("name") or "").replace("_", " ").replace("-", " ").lower() for token in context_tokens)
        ]
        if len(matching) == 1:
            resolved[source_id] = matching[0]
    return resolved


def _symbol_body_key(sheet_instance_path: str, source_id: str) -> str:
    return stable_feature_key(sheet_instance_path, source_id, 0, "symbol_body", 0)


def _dnp_marker_key(sheet_instance_path: str, source_id: str) -> str:
    return stable_feature_key(sheet_instance_path, source_id, 0, "dnp_marker", 0)


def _pin_feature_key(sheet_instance_path: str, pin_source_id: str) -> str:
    return stable_feature_key(sheet_instance_path, pin_source_id, 0, "pin", 0)


def _pin_block_info(data: dict[str, Any], pin_lookup: dict[str, dict[Any, dict[str, Any]]]) -> dict[str, Any] | None:
    extras = data.get("extra_attrs") or {}
    if str(data.get("data_ref") or "") != "symbol_pin" and extras.get("primitive") != "pin" and extras.get("object-type") != "pin":
        return None
    pin_source_id = str(data.get("data_uuid") or data.get("uuid") or data.get("object_id") or "")
    pin_number = str(extras.get("pin") or data.get("pin") or "")
    designator = str(extras.get("designator") or "")
    symbol_uuid = str(extras.get("symbol-uuid") or "")
    payload: dict[str, Any] = {
        "pinSourceId": pin_source_id,
        "uuid": pin_source_id,
        "sourceId": pin_source_id,
        "pinNumber": pin_number,
        "designator": designator,
        "reference": designator,
        "symbolUuid": symbol_uuid,
    }
    by_svg = pin_lookup.get("bySvgId", {})
    by_designator_pin = pin_lookup.get("byDesignatorPin", {})
    payload.update(by_svg.get(pin_source_id, {}))
    if designator and pin_number:
        payload.update(by_designator_pin.get((designator, pin_number), {}))
    if not payload.get("pinName"):
        payload["pinName"] = ""
    return payload if pin_source_id else None


def _union_bounds(bounds_list: list[list[float]]) -> list[float] | None:
    if not bounds_list:
        return None
    return [
        min(bounds[0] for bounds in bounds_list),
        min(bounds[1] for bounds in bounds_list),
        max(bounds[2] for bounds in bounds_list),
        max(bounds[3] for bounds in bounds_list),
    ]


def _symbol_owner_features(
    page_id: str,
    sheet_instance_path: str,
    record: Any,
    record_index: int,
    parent_feature: dict[str, Any],
    pin_lookup: dict[str, dict[Any, dict[str, Any]]],
    component_by_designator: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not _is_symbol_record(record):
        return []
    source_id = _record_source_id(record, record_index)
    extras = getattr(record, "extras", None) or {}
    reference = str(parent_feature.get("reference") or extras.get("reference") or "")
    value = str(parent_feature.get("value") or extras.get("value") or "")
    pins: dict[str, dict[str, Any]] = {}
    pin_bounds: dict[str, list[list[float]]] = defaultdict(list)
    current_pin: dict[str, Any] | None = None
    body_bounds: list[list[float]] = []
    dnp_marker_bounds: list[list[float]] = []
    for operation in getattr(record, "operations", []) or []:
        data = operation.to_dict() if hasattr(operation, "to_dict") else dict(operation)
        kind = str(data.get("kind") or "")
        if kind == "StartBlock":
            current_pin = _pin_block_info(data, pin_lookup)
            if current_pin:
                pins[current_pin["pinSourceId"]] = {**current_pin}
                if current_pin.get("designator") and not reference:
                    reference = str(current_pin.get("designator") or "")
            continue
        if kind == "EndBlock":
            current_pin = None
            continue
        bounds = _operation_bounds(operation)
        if not bounds:
            continue
        if current_pin:
            pin_bounds[current_pin["pinSourceId"]].append(bounds)
        elif _is_dnp_marker_operation(data):
            dnp_marker_bounds.append(bounds)
        elif kind not in NON_GEOMETRY_OPERATION_KINDS and kind != "Text":
            body_bounds.append(bounds)

    component_meta = component_by_designator.get(reference, {})
    feature_base = {
        "pageId": page_id,
        "sheetInstancePath": sheet_instance_path,
        "parentStableKey": parent_feature["stableKey"],
        "symbolFeatureStableKey": parent_feature["stableKey"],
        "symbolFeatureId": 0,
        "symbolUuid": parent_feature.get("uuid") or extras.get("source_symbol_uuid") or "",
        "reference": reference,
        "value": value or component_meta.get("componentValue", ""),
        "libraryRef": str(extras.get("lib_id") or component_meta.get("libraryRef") or ""),
        "unit": int(extras.get("unit") or 1),
        "convert": int(extras.get("convert") or 1),
        "rotationDeg": float(extras.get("at_angle_deg") or 0),
        "mirror": str(extras.get("mirror") or ""),
        "dnp": bool(extras.get("dnp")),
        "excludeFromSimulation": bool(extras.get("exclude_from_sim")),
        "inBom": bool(extras.get("in_bom", True)),
        "onBoard": bool(extras.get("on_board", True)),
        **component_meta,
    }
    body = {
        **feature_base,
        "id": 0,
        "stableKey": _symbol_body_key(sheet_instance_path, source_id),
        "sourceId": source_id,
        "uuid": parent_feature.get("uuid", ""),
        "objectId": parent_feature.get("objectId", ""),
        "kind": "symbol_body",
        "semanticRole": "symbol_body",
    }
    if bounds := _union_bounds(body_bounds) or parent_feature.get("boundsMm"):
        body["boundsMm"] = bounds
    features = [body]
    if marker_bounds := _union_bounds(dnp_marker_bounds):
        features.append(
            {
                **feature_base,
                "id": 0,
                "stableKey": _dnp_marker_key(sheet_instance_path, source_id),
                "sourceId": f"{source_id}:dnp-marker",
                "uuid": parent_feature.get("uuid", ""),
                "objectId": parent_feature.get("objectId", ""),
                "kind": "dnp_marker",
                "semanticRole": "dnp_marker",
                "parentStableKey": body["stableKey"],
                "boundsMm": marker_bounds,
                "dnp": True,
            }
        )
    for pin_source_id, pin in sorted(pins.items()):
        feature = {
            **feature_base,
            **pin,
            "id": 0,
            "stableKey": _pin_feature_key(sheet_instance_path, pin_source_id),
            "sourceId": pin_source_id,
            "uuid": pin_source_id,
            "objectId": pin_source_id,
            "kind": "pin",
            "semanticRole": "pin",
            "parentStableKey": parent_feature["stableKey"],
            "symbolFeatureStableKey": parent_feature["stableKey"],
        }
        if bounds := _union_bounds(pin_bounds.get(pin_source_id, [])):
            feature["boundsMm"] = bounds
        features.append(feature)
    return features


def _symbol_text_role(
    data: dict[str, Any],
    parent_feature: dict[str, Any],
    outside_text_count: int,
    inferred_reference: str,
) -> str:
    text = str(data.get("text") or "")
    reference = str(parent_feature.get("reference") or inferred_reference or "")
    value = str(parent_feature.get("value") or "")
    if reference and (text == reference or text.startswith(reference)):
        return "symbol_reference"
    if value and text == value:
        return "symbol_value"
    if outside_text_count == 0:
        return "symbol_reference"
    if outside_text_count == 1:
        return "symbol_value"
    return "symbol_text"


def _operation_descriptors(
    page: dict[str, Any],
    record: Any,
    record_index: int,
    parent_feature: dict[str, Any],
    pin_lookup: dict[str, dict[Any, dict[str, Any]]],
    component_by_designator: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    source_id = _record_source_id(record, record_index)
    is_symbol = _is_symbol_record(record)
    current_pin: dict[str, Any] | None = None
    descriptors: list[dict[str, Any]] = []
    outside_text_count = 0
    inferred_reference = ""
    for op_index, operation in enumerate(getattr(record, "operations", []) or [], start=1):
        data = operation.to_dict() if hasattr(operation, "to_dict") else dict(operation)
        operation_kind = str(data.get("kind") or "unknown")
        if operation_kind == "StartBlock":
            current_pin = _pin_block_info(data, pin_lookup)
            if current_pin and current_pin.get("designator"):
                inferred_reference = str(current_pin.get("designator") or "")
            continue
        if operation_kind == "EndBlock":
            current_pin = None
            continue
        if operation_kind in NON_GEOMETRY_OPERATION_KINDS:
            continue
        feature_source_id = source_id
        parent_stable_key = parent_feature["stableKey"]
        semantic_role = _semantic_role(str(getattr(record, "kind", "") or "unknown"), operation_kind)
        metadata: dict[str, Any] = {}
        if current_pin:
            feature_source_id = str(current_pin["pinSourceId"])
            parent_stable_key = _pin_feature_key(page["sheetInstancePath"], feature_source_id)
            if operation_kind == "Text":
                text = str(data.get("text") or "")
                semantic_role = "pin_number" if text == str(current_pin.get("pinNumber") or "") else "pin_name"
            else:
                semantic_role = "pin_body"
            metadata = dict(current_pin)
        elif is_symbol:
            if _is_dnp_marker_operation(data):
                semantic_role = "dnp_marker"
                parent_stable_key = _dnp_marker_key(page["sheetInstancePath"], source_id)
            elif operation_kind == "Text":
                semantic_role = _symbol_text_role(data, parent_feature, outside_text_count, inferred_reference)
                outside_text_count += 1
            else:
                semantic_role = "symbol_body"
                parent_stable_key = _symbol_body_key(page["sheetInstancePath"], source_id)
            reference = str(parent_feature.get("reference") or inferred_reference or "")
            metadata = {
                "reference": reference,
                "value": str(parent_feature.get("value") or component_by_designator.get(reference, {}).get("componentValue") or ""),
                "symbolUuid": parent_feature.get("uuid", ""),
                "dnp": bool(parent_feature.get("dnp")),
                **component_by_designator.get(reference, {}),
            }
        feature_key = stable_feature_key(page["sheetInstancePath"], feature_source_id, op_index, semantic_role, 0)
        feature_role = semantic_role
        if str(getattr(record, "kind", "") or "") in _LABEL_TEXT_KINDS:
            feature_key = parent_feature["stableKey"]
            feature_role = str(getattr(record, "kind", "") or "")
            parent_stable_key = parent_feature["stableKey"]
        elif semantic_role == "symbol_body":
            feature_key = _symbol_body_key(page["sheetInstancePath"], source_id)
            feature_role = "symbol_body"
        elif semantic_role == "dnp_marker":
            feature_key = _dnp_marker_key(page["sheetInstancePath"], source_id)
            feature_role = "dnp_marker"
        elif semantic_role == "pin_body":
            feature_key = _pin_feature_key(page["sheetInstancePath"], feature_source_id)
            feature_role = "pin"
        descriptors.append(
            {
                "opIndex": op_index,
                "operation": operation,
                "operationKind": operation_kind,
                "sourceId": feature_source_id,
                "semanticRole": semantic_role,
                "featureKey": feature_key,
                "featureRole": feature_role,
                "parentStableKey": parent_stable_key,
                "metadata": metadata,
            }
        )
    return descriptors


def _operation_to_primitive(
    operation: Any,
    feature_id: int = 0,
    *,
    record_kind: str = "",
) -> tuple[dict[str, Any] | None, str | None]:
    data = operation.to_dict() if hasattr(operation, "to_dict") else dict(operation)
    kind = str(data.get("kind") or "unknown")
    if kind in NON_GEOMETRY_OPERATION_KINDS:
        return None, None
    if kind == "PlotImage":
        return _image_primitive(data, feature_id)
    if kind == "Text":
        contours = _text_cache_contours(data)
        if contours:
            primitive = {
                "featureId": feature_id,
                "kind": "text_contours",
                "provider": "render_cache",
                "contoursMm": contours,
                "text": str(data.get("text") or ""),
                "style": {
                    "provider": "render_cache",
                    "sizeXNm": int(data.get("size_x_nm") or 0),
                    "sizeYNm": int(data.get("size_y_nm") or 0),
                    "orientDeg": float(data.get("orient_deg", data.get("angle", 0)) or 0),
                    "hAlign": str(data.get("h_align") or ""),
                    "vAlign": str(data.get("v_align") or ""),
                    "mirror": bool(data.get("mirror")),
                    "italic": bool(data.get("italic")),
                    "bold": bool(data.get("bold")),
                    "fontFace": str(data.get("font_face") or ""),
                },
            }
            if bounds := _polyline_bounds(contours):
                primitive["boundsMm"] = bounds
            if data.get("color"):
                primitive["color"] = str(data.get("color") or "")
            return primitive, None
        return _newstroke_text_primitive(data, feature_id, record_kind=record_kind)
    if kind not in SUPPORTED_VECTOR_OPERATION_KINDS:
        return None, kind
    lowered = kind.lower()
    primitive: dict[str, Any] = {"featureId": feature_id, "kind": lowered}
    primitive.update(_primitive_style(data))

    points = data.get("points") or []
    if points:
        primitive["pointsMm"] = [[_mm(point[0]), _mm(point[1])] for point in points if len(point) >= 2]
    if str(primitive.get("fill") or "").upper() == "FILLED_SHAPE":
        contours = _polygon_contours_from_data(data, primitive)
        if contours:
            triangles, provider = _triangulate_contours(contours)
            if triangles:
                primitive["trianglesMm"] = triangles
                primitive["triangulation"] = provider
                if len(contours) > 1:
                    primitive["contourCount"] = len(contours)
    if kind == "ArcThreePoint":
        if arc_points := _arc_points_from_three_points(data):
            primitive["pointsMm"] = arc_points
            primitive["tessellated"] = True
    elif kind == "ArcCenterAngle":
        center = (_mm(data.get("cx", data.get("center_x", 0))), _mm(data.get("cy", data.get("center_y", 0))))
        radius = _mm(data.get("radius_nm", data.get("radius", 0)))
        start_deg = float(data.get("start_angle_deg", data.get("start_angle", 0)) or 0)
        end_deg = float(data.get("end_angle_deg", data.get("end_angle", data.get("angle", 0))) or 0)
        primitive["pointsMm"] = _arc_points(center, radius, math.radians(start_deg), math.radians(end_deg))
        primitive["tessellated"] = True
    elif kind == "ThickArc":
        if arc_points := _arc_points_from_three_points(data):
            primitive["pointsMm"] = arc_points
            primitive["tessellated"] = True
    elif kind == "BezierCurve" and primitive.get("pointsMm"):
        primitive["pointsMm"] = _bezier_points(primitive["pointsMm"])
        primitive["tessellated"] = True
    for key in COORDINATE_KEYS:
        if key in data:
            output_key = key[:-3] + "Mm" if key.endswith("_nm") else f"{key}Mm"
            primitive[output_key] = _mm(data[key])
    if "text" in data:
        primitive["text"] = str(data.get("text") or "")
    if "angle" in data:
        primitive["angle"] = float(data.get("angle") or 0)

    has_geometry = (
        "pointsMm" in primitive
        or any(key.endswith("Mm") for key in primitive)
        or lowered == "text_contours"
    )
    if not has_geometry:
        return None, kind

    return primitive, None


def _record_feature(
    page_id: str,
    sheet_instance_path: str,
    record: Any,
    record_index: int,
    feature_id: int,
    svg_to_net: dict[str, dict[str, Any]],
    component_by_designator: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    kind = str(getattr(record, "kind", "") or "unknown")
    source_id = _record_source_id(record, record_index)
    record_uuid = str(getattr(record, "uuid", "") or "")
    object_id = str(getattr(record, "object_id", "") or "")
    feature = {
        "id": feature_id,
        "stableKey": stable_feature_key(sheet_instance_path, source_id, 0, "record", 0),
        "pageId": page_id,
        "sheetInstancePath": sheet_instance_path,
        "sourceId": source_id,
        "uuid": record_uuid,
        "objectId": object_id,
        "kind": kind,
    }
    bounds = _record_bounds(record)
    if bounds is not None:
        feature["boundsMm"] = bounds
    net = (
        svg_to_net.get(record_uuid) or svg_to_net.get(object_id)
        if kind in ELECTRICAL_NET_KINDS
        else None
    )
    if net:
        feature["netUid"] = str(net.get("uid") or "")
        feature["netName"] = str(net.get("name") or "")
    extras = getattr(record, "extras", None) or {}
    for key in ("reference", "value", "text", "sheet_name", "sheet_file"):
        value = extras.get(key)
        if value not in (None, ""):
            feature[key] = str(value)
    if _is_symbol_record(record):
        feature.update(
            {
                "dnp": bool(extras.get("dnp")),
                "excludeFromSimulation": bool(extras.get("exclude_from_sim")),
                "inBom": bool(extras.get("in_bom", True)),
                "onBoard": bool(extras.get("on_board", True)),
            }
        )
    if component_by_designator and feature.get("reference"):
        component_meta = component_by_designator.get(str(feature["reference"]), {})
        for key, value in component_meta.items():
            if value not in (None, "") and key not in feature:
                feature[key] = value
        if not feature.get("value") and component_meta.get("componentValue"):
            feature["value"] = component_meta["componentValue"]
    return feature


def _page_chunks(
    page: dict[str, Any],
    records: list[Any],
    features: list[dict[str, Any]],
    feature_id_by_key: dict[str, int],
    pin_lookup: dict[str, dict[Any, dict[str, Any]]] | None = None,
    component_by_designator: dict[str, dict[str, Any]] | None = None,
    image_dir: Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, str]], list[dict[str, Any]]]:
    feature_by_source = {feature["sourceId"]: feature for feature in features}
    feature_by_key = {feature["stableKey"]: feature for feature in features}
    pin_lookup = pin_lookup or {"bySvgId": {}, "byDesignatorPin": {}}
    component_by_designator = component_by_designator or {}
    unsupported: list[dict[str, str]] = []
    simplified_bounds = []
    primitives = []
    primitive_features: list[dict[str, Any]] = []

    for record_index, record in enumerate(records, start=1):
        source_id = _record_source_id(record, record_index)
        parent_feature = feature_by_source.get(source_id)
        if not parent_feature:
            continue
        record_kind = str(getattr(record, "kind", "") or "unknown")
        record_primitives: list[dict[str, Any]] = []
        record_primitive_features: list[dict[str, Any]] = []
        bounds = parent_feature.get("boundsMm")
        if bounds:
            simplified_bounds.append(
                {
                    "featureId": parent_feature["id"],
                    "kind": parent_feature["kind"],
                    "boundsMm": bounds,
                    "netUid": parent_feature.get("netUid", ""),
                }
            )
        for descriptor in _operation_descriptors(
            page,
            record,
            record_index,
            parent_feature,
            pin_lookup,
            component_by_designator,
        ):
            operation = descriptor["operation"]
            op_index = descriptor["opIndex"]
            operation_kind = descriptor["operationKind"]
            semantic_role = descriptor["semanticRole"]
            sub_feature_key = descriptor.get("featureKey") or stable_feature_key(
                page["sheetInstancePath"],
                descriptor["sourceId"],
                op_index,
                semantic_role,
                0,
            )
            primitive_feature_id = feature_id_by_key.get(sub_feature_key, 0)
            primitive, unsupported_kind = _operation_to_primitive(operation, primitive_feature_id, record_kind=record_kind)
            if primitive:
                _inset_label_text_primitive(primitive, record_kind)
                if primitive.get("kind") == "plotimage":
                    if not image_dir or not _materialize_image_primitive(primitive, image_dir):
                        unsupported.append(
                            {
                                "sourceId": source_id,
                                "recordKind": record_kind,
                                "operationKind": "PlotImage",
                                "semanticRole": semantic_role,
                            }
                        )
                        continue
                primitive["subFeatureKey"] = sub_feature_key
                primitive["semanticRole"] = semantic_role
                bounds_mm = primitive.get("boundsMm") or _operation_bounds(operation)
                if bounds_mm:
                    primitive["boundsMm"] = bounds_mm
                primitive_feature = {
                    **(feature_by_key.get(descriptor["parentStableKey"]) or parent_feature),
                    **descriptor["metadata"],
                    "id": primitive_feature_id,
                    "stableKey": sub_feature_key,
                    "parentStableKey": descriptor["parentStableKey"],
                    "parentFeatureId": feature_id_by_key.get(descriptor["parentStableKey"], parent_feature["id"]),
                    "primitiveKind": primitive["kind"],
                    "subFeatureIndex": op_index,
                    "semanticRole": semantic_role,
                    "kind": descriptor.get("featureRole") or semantic_role,
                }
                if bounds_mm:
                    primitive_feature["boundsMm"] = bounds_mm
                record_primitives.append(primitive)
                record_primitive_features.append(primitive_feature)
            elif unsupported_kind:
                unsupported.append(
                    {
                        "sourceId": source_id,
                        "recordKind": record_kind,
                        "operationKind": unsupported_kind,
                        "semanticRole": semantic_role,
                    }
                )
        for primitive, primitive_feature in zip(record_primitives, record_primitive_features, strict=True):
            if primitive.get("boundsMm"):
                primitive_feature["boundsMm"] = primitive["boundsMm"]
            primitives.append(primitive)
            primitive_features.append(primitive_feature)

    # DNP crosses are an overplot in KiCad and must remain above all symbol,
    # pin and wire geometry, including records that happen to follow the
    # component in the source schematic.
    order = sorted(
        range(len(primitives)),
        key=lambda index: primitives[index].get("semanticRole") == "dnp_marker",
    )
    primitives = [primitives[index] for index in order]
    primitive_features = [primitive_features[index] for index in order]

    lod0 = {
        "schema": f"{SCHEMA}.chunk",
        "pageId": page["id"],
        "lod": 0,
        "pageCard": {
            "boundsMm": [0, 0, page["sourceWidthMm"], page["sourceHeightMm"]],
            "title": page["name"],
            "sheetInstancePath": page["sheetInstancePath"],
        },
    }
    lod1 = {
        "schema": f"{SCHEMA}.chunk",
        "pageId": page["id"],
        "lod": 1,
        "featureBounds": simplified_bounds,
    }
    lod2 = {
        "schema": f"{SCHEMA}.chunk",
        "pageId": page["id"],
        "lod": 2,
        "primitives": primitives,
        "unsupported": unsupported,
    }
    return lod0, lod1, lod2, unsupported, primitive_features


def build_schematic_scene(
    design: Any,
    design_payload: dict[str, Any],
    output_dir: Path,
    topology: dict[str, Any] | None = None,
    *,
    progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    from kicad_monkey import KiCadSvgRenderOptions, render_ir_to_svg  # type: ignore
    from kicad_monkey.kicad_schematic_svg_enrichment import (  # type: ignore
        schematic_root_svg_attrs,
        schematic_svg_enrichment_payload,
    )

    schematic_dir = output_dir / "schematic-vector"
    page_dir = schematic_dir / "pages"
    chunk_dir = schematic_dir / "chunks"
    image_dir = schematic_dir / "images"
    parity_dir = schematic_dir / "parity"
    page_dir.mkdir(parents=True, exist_ok=True)
    chunk_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)
    parity_dir.mkdir(parents=True, exist_ok=True)

    options = KiCadSvgRenderOptions.enriched_default()
    pages: list[dict[str, Any]] = []
    features: list[dict[str, Any]] = []
    features_by_page: dict[str, list[int]] = defaultdict(list)
    instance_to_page: dict[str, str] = {}
    net_to_pages: dict[str, set[str]] = defaultdict(set)
    component_to_pages: dict[str, set[str]] = defaultdict(set)
    hierarchy_endpoint_index: dict[str, list[dict[str, str]]] = defaultdict(list)
    unsupported_operations: list[dict[str, str]] = []
    visual_regression_pages: list[dict[str, Any]] = []
    source_svg_by_page: dict[str, str] = {}
    page_records: dict[str, list[Any]] = {}
    feature_key_payloads: dict[str, dict[str, Any]] = {}
    page_feature_keys: dict[str, list[str]] = defaultdict(list)
    page_text_coverage: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"required": 0, "covered": 0, "renderCache": 0, "newstroke": 0, "unsupported": 0}
    )
    text_cache_coverage = {
        "required": 0,
        "covered": 0,
        "renderCache": 0,
        "newstroke": 0,
        "unsupported": 0,
        "byRecordKind": defaultdict(lambda: {"required": 0, "covered": 0, "renderCache": 0, "newstroke": 0, "unsupported": 0}),
    }
    component_by_designator = _component_indexes(design_payload, topology)
    pin_lookup = _pin_lookup_indexes(design_payload, topology, component_by_designator)
    topology_graphical_nets = _topology_graphical_net_candidates(topology)

    instances = list(design.schematic_instances())
    if progress:
        progress(f"schematic vector pages={len(instances)}")

    for index, instance in enumerate(instances, start=1):
        ir = design.to_schematic_instance_ir(instance)
        page_id = f"page-{index:04d}"
        instance_path = str(getattr(instance, "sheet_instance_path", "") or "")
        instance_to_page[instance_path] = page_id
        source_path = str(getattr(instance, "source_path", "") or "")
        sheet_name = str(getattr(instance, "sheet_name", "") or Path(source_path).stem or page_id)
        filename = f"{index:04d}-{_safe_name(sheet_name, page_id)}.svg"
        width_mm, height_mm = _page_size(ir)
        source_width_mm, source_height_mm = _source_page_size(ir)
        root_attrs = schematic_root_svg_attrs(
            source_path=source_path,
            sheet_name=sheet_name,
            sheet_path=getattr(instance, "sheet_path", ""),
            profile="enriched",
        )
        root_attrs["data-sheet-instance-path"] = instance_path
        svg = render_ir_to_svg(ir, options=options, root_extra_attrs=root_attrs)
        (page_dir / filename).write_text(svg, encoding="utf-8")
        source_svg_by_page[page_id] = svg

        enrichment = schematic_svg_enrichment_payload(
            design_payload,
            source_path=source_path,
            sheet_name=sheet_name,
            sheet_path=getattr(instance, "sheet_path", ""),
            sheet_instance_path=instance_path,
            profile="enriched",
        )
        view_indexes = enrichment.get("view_indexes", {})
        svg_to_net = {
            **_page_topology_svg_to_net(
                topology_graphical_nets,
                sheet_name=sheet_name,
                source_path=source_path,
            ),
            **(view_indexes.get("svg_to_net", {}) or {}),
        }
        net_map = view_indexes.get("net_uid_to_svg", {}) or {}
        for net_uid in net_map:
            net_to_pages[str(net_uid)].add(page_id)
        for record_index, record in enumerate(getattr(ir, "records", []) or [], start=1):
            feature = _record_feature(
                page_id,
                instance_path,
                record,
                record_index,
                0,
                svg_to_net,
                component_by_designator,
            )
            feature_key_payloads[feature["stableKey"]] = feature
            page_feature_keys[page_id].append(feature["stableKey"])
            for owner_feature in _symbol_owner_features(
                page_id,
                instance_path,
                record,
                record_index,
                feature,
                pin_lookup,
                component_by_designator,
            ):
                feature_key_payloads[owner_feature["stableKey"]] = owner_feature
                page_feature_keys[page_id].append(owner_feature["stableKey"])
                if owner_feature.get("netUid"):
                    net_to_pages[owner_feature["netUid"]].add(page_id)
            if feature.get("netUid"):
                net_to_pages[feature["netUid"]].add(page_id)
            if feature.get("reference"):
                component_to_pages[feature["reference"]].add(page_id)
            if feature.get("kind") in {"global_label", "hierarchical_label", "label", "bus", "bus_entry"}:
                hierarchy_endpoint_index[feature.get("netUid", "")].append(
                    {
                        "pageId": page_id,
                        "featureKey": feature["stableKey"],
                        "kind": feature["kind"],
                        "text": feature.get("text") or feature.get("netName") or "",
                    }
                )
            for descriptor in _operation_descriptors(
                {
                    "id": page_id,
                    "sheetInstancePath": instance_path,
                    "sourceWidthMm": source_width_mm,
                    "sourceHeightMm": source_height_mm,
                },
                record,
                record_index,
                feature,
                pin_lookup,
                component_by_designator,
            ):
                operation = descriptor["operation"]
                data = operation.to_dict() if hasattr(operation, "to_dict") else dict(operation)
                operation_kind = descriptor["operationKind"]
                if operation_kind in NON_GEOMETRY_OPERATION_KINDS:
                    continue
                record_kind = str(getattr(record, "kind", "") or "unknown")
                semantic_role = descriptor["semanticRole"]
                primitive, unsupported_kind = _operation_to_primitive(operation, 0)
                if operation_kind == "Text":
                    bucket = text_cache_coverage["byRecordKind"][record_kind]
                    text_required = bool(str(data.get("text") or ""))
                    if text_required:
                        page_bucket = page_text_coverage[page_id]
                        text_cache_coverage["required"] += 1
                        bucket["required"] += 1
                        page_bucket["required"] += 1
                        if primitive:
                            provider = str(primitive.get("provider") or "unknown")
                            text_cache_coverage["covered"] += 1
                            bucket["covered"] += 1
                            page_bucket["covered"] += 1
                            if provider == "render_cache":
                                text_cache_coverage["renderCache"] += 1
                                bucket["renderCache"] += 1
                                page_bucket["renderCache"] += 1
                            elif provider == "newstroke":
                                text_cache_coverage["newstroke"] += 1
                                bucket["newstroke"] += 1
                                page_bucket["newstroke"] += 1
                        else:
                            text_cache_coverage["unsupported"] += 1
                            bucket["unsupported"] += 1
                            page_bucket["unsupported"] += 1
                if not primitive:
                    continue
                primitive_key = descriptor.get("featureKey") or stable_feature_key(
                    instance_path,
                    descriptor["sourceId"],
                    descriptor["opIndex"],
                    semantic_role,
                    0,
                )
                parent_key = descriptor["parentStableKey"]
                primitive_feature = {
                    **feature,
                    **descriptor["metadata"],
                    "stableKey": primitive_key,
                    "parentStableKey": parent_key,
                    "primitiveKind": primitive["kind"],
                    "subFeatureIndex": descriptor["opIndex"],
                    "semanticRole": semantic_role,
                    "kind": descriptor.get("featureRole") or semantic_role,
                }
                if feature.get("netUid") and not primitive_feature.get("netUid"):
                    primitive_feature["netUid"] = feature["netUid"]
                    primitive_feature["netName"] = feature.get("netName", "")
                bounds_mm = _operation_bounds(operation)
                if primitive.get("boundsMm"):
                    bounds_mm = primitive["boundsMm"]
                if bounds_mm:
                    primitive_feature["boundsMm"] = bounds_mm
                if primitive_key not in feature_key_payloads:
                    feature_key_payloads[primitive_key] = primitive_feature
                    page_feature_keys[page_id].append(primitive_key)

        page = {
            "id": page_id,
            "name": sheet_name,
            "sheetNumber": int(getattr(instance, "sheet_number", index) or index),
            "sourcePath": source_path,
            "sheetPath": str(getattr(instance, "sheet_path", "") or ""),
            "sheetInstancePath": instance_path,
            "parentSheetInstancePath": str(getattr(instance, "parent_sheet_instance_path", "") or ""),
            "parentId": "",
            "depth": _hierarchy_depth(instance),
            "widthMm": width_mm,
            "heightMm": height_mm,
            "sourceWidthMm": source_width_mm,
            "sourceHeightMm": source_height_mm,
            "thumbnail": {"path": f"pages/{filename}", "kind": "enriched-svg"},
            "svg": f"pages/{filename}",
            "chunks": {
                "lod0": f"chunks/{page_id}/lod0.json",
                "lod1": f"chunks/{page_id}/lod1.json",
                "lod2": f"chunks/{page_id}/lod2.json",
            },
            "featureIds": [],
            "featureCount": 0,
            "netUids": sorted(str(uid) for uid in net_map),
        }
        pages.append(page)
        page_records[page_id] = list(getattr(ir, "records", []) or [])
        if progress and (index == len(instances) or index % 5 == 0):
            progress(f"schematic vector indexed pages={index}/{len(instances)}")

    for page in pages:
        page["parentId"] = instance_to_page.get(page["parentSheetInstancePath"], "")

    feature_id_by_key = deterministic_feature_ids(set(feature_key_payloads))
    features = []
    features_by_page.clear()
    for key in sorted(feature_key_payloads):
        feature = dict(feature_key_payloads[key])
        feature["id"] = feature_id_by_key[key]
        if parent_key := feature.get("parentStableKey"):
            feature["parentFeatureId"] = feature_id_by_key.get(parent_key, 0)
        if symbol_key := feature.get("symbolFeatureStableKey"):
            feature["symbolFeatureId"] = feature_id_by_key.get(symbol_key, 0)
        features.append(feature)
    for page in pages:
        ids = sorted(
            {
                feature_id_by_key[key]
                for key in page_feature_keys.get(page["id"], [])
                if key in feature_id_by_key
            }
        )
        page["featureIds"] = ids
        page["featureCount"] = len(ids)
        coverage = dict(page_text_coverage[page["id"]])
        satisfied = coverage["covered"] >= coverage["required"]
        page["nativeDetail"] = {
            "enabled": bool(satisfied),
            "representation": "native-vector" if satisfied else "svg-fallback",
            "textCoverageSatisfied": bool(satisfied),
            "text": coverage,
            "fallbackReason": "" if satisfied else "required text operations were not fully covered",
        }
        features_by_page[page["id"]] = ids
    for endpoints in hierarchy_endpoint_index.values():
        for endpoint in endpoints:
            key = endpoint.pop("featureKey", "")
            endpoint["featureId"] = str(feature_id_by_key.get(key, 0))

    world_bounds = _layout_pages(pages)
    page_by_id = {page["id"]: page for page in pages}
    edges = [
        {
            "id": f"edge-{page['parentId']}-{page['id']}",
            "source": page["parentId"],
            "target": page["id"],
            "kind": "hierarchy",
        }
        for page in pages
        if page["parentId"] in page_by_id
    ]

    features_by_id = {feature["id"]: feature for feature in features}
    for page_index, page in enumerate(pages, start=1):
        page_chunk_dir = chunk_dir / page["id"]
        page_chunk_dir.mkdir(parents=True, exist_ok=True)
        page_features = [features_by_id[feature_id] for feature_id in page["featureIds"]]
        lod0, lod1, lod2, unsupported, primitive_features = _page_chunks(
            page,
            page_records[page["id"]],
            page_features,
            feature_id_by_key,
            pin_lookup,
            component_by_designator,
            image_dir,
        )
        unsupported_operations.extend(
            {"pageId": page["id"], **item}
            for item in unsupported
            if item.get("operationKind") not in NON_GEOMETRY_OPERATION_KINDS
        )
        for filename, payload in (("lod0.json", lod0), ("lod1.json", lod1), ("lod2.json", lod2)):
            (page_chunk_dir / filename).write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        native_preview = _native_preview_svg(page, lod2["primitives"])
        overlay_preview = _native_overlay_svg(page, lod2["primitives"])
        (parity_dir / f"{page['id']}-native.svg").write_text(native_preview, encoding="utf-8")
        (parity_dir / f"{page['id']}-overlay.svg").write_text(overlay_preview, encoding="utf-8")
        visual_regression_pages.append(
            _visual_regression_page_report(
                page,
                lod2["primitives"],
                unsupported,
                source_svg_by_page.get(page["id"], ""),
            )
        )
        if progress and (page_index == len(pages) or page_index % 5 == 0):
            progress(f"schematic vector wrote chunks={page_index}/{len(pages)}")

    strings = sorted(
        {
            str(value)
            for feature in features
            for key in ("stableKey", "sourceId", "uuid", "objectId", "kind", "netUid", "netName", "reference", "value", "text")
            if (value := feature.get(key)) not in (None, "")
        }
        | {
            str(value)
            for page in pages
            for key in ("id", "name", "sourcePath", "sheetPath", "sheetInstancePath")
            if (value := page.get(key)) not in (None, "")
        }
    )
    string_ids = {value: index for index, value in enumerate(strings)}

    (schematic_dir / "features.json").write_text(
        json.dumps(
            {
                "schema": f"{SCHEMA}.features",
                "features": features,
                "pages": {page_id: ids for page_id, ids in sorted(features_by_page.items())},
                "byStableKey": {feature["stableKey"]: feature["id"] for feature in features},
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    (schematic_dir / "strings.json").write_text(
        json.dumps({"schema": f"{SCHEMA}.strings", "strings": strings, "ids": string_ids}, separators=(",", ":")),
        encoding="utf-8",
    )
    (schematic_dir / "pages.json").write_text(
        json.dumps({"schema": f"{SCHEMA}.pages", "pages": pages}, separators=(",", ":")),
        encoding="utf-8",
    )

    revision_source = json.dumps(
        {
            "schema": SCHEMA,
            "textCacheCoverage": {
                "required": text_cache_coverage["required"],
                "covered": text_cache_coverage["covered"],
                "renderCache": text_cache_coverage["renderCache"],
                "newstroke": text_cache_coverage["newstroke"],
                "unsupported": text_cache_coverage["unsupported"],
                "byRecordKind": dict(sorted(
                    (key, dict(value))
                    for key, value in text_cache_coverage["byRecordKind"].items()
                )),
            },
            "pages": [
                {
                    "instance": page["sheetInstancePath"],
                    "source": page["sourcePath"],
                    "features": page["featureCount"],
                    "chunks": page["chunks"],
                }
                for page in pages
            ],
            "edges": edges,
            "unsupported": unsupported_operations,
            "design": design_payload.get("design", {}),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    manifest = {
        "schema": SCHEMA,
        "geometryRevision": hashlib.sha256(revision_source).hexdigest(),
        "coordinateSystem": {
            "units": "mm",
            "pageSpace": "+x right, +y down in KiCad schematic canvas coordinates",
            "worldSpace": "+x right, +y down across hierarchy layout",
            "featureIdentity": "sheetInstancePath + source UUID/object ID + primitive/sub-feature index",
        },
        "worldBoundsMm": world_bounds,
        "pages": pages,
        "pageTable": "pages.json",
        "edges": edges,
        "featureTable": "features.json",
        "stringTable": "strings.json",
        "netToPages": {key: sorted(value) for key, value in sorted(net_to_pages.items())},
        "componentToPages": {key: sorted(value) for key, value in sorted(component_to_pages.items())},
        "hierarchyEndpointIndex": {
            key: value for key, value in sorted(hierarchy_endpoint_index.items()) if key
        },
        "unsupported": unsupported_operations,
        "diagnostics": {
            "unsupportedOperationCount": len(unsupported_operations),
            "textCacheCoverage": {
                "required": text_cache_coverage["required"],
                "covered": text_cache_coverage["covered"],
                "renderCache": text_cache_coverage["renderCache"],
                "newstroke": text_cache_coverage["newstroke"],
                "unsupported": text_cache_coverage["unsupported"],
                "byRecordKind": dict(sorted(
                    (key, dict(value))
                    for key, value in text_cache_coverage["byRecordKind"].items()
                )),
            },
            "nativeDetailCoverage": {
                page["id"]: page["nativeDetail"]
                for page in pages
            },
            "textProvider": {
                "mode": "render-cache-first-newstroke-fallback",
                "defaultProvider": "newstroke",
                "outlineProvider": "Text.render_cache/render_cache_polygons when present and valid",
                "fallback": "page-level-svg-when-required-text-coverage-is-incomplete",
                "licenseProvenance": "NewStroke text geometry is generated by kicad_monkey.kicad_stroke_font from KiCad's stroke-font behavior. No external glyph corpus vendored. Browser fonts and toy client-side strokes are not used in native L2/L3.",
            },
        },
        "lodPolicy": {
            "hysteresis": 0.18,
            "levels": [
                {"lod": 0, "name": "page-card-thumbnail", "maxPagePixels": 420},
                {"lod": 1, "name": "page-structure", "minPagePixels": 300, "maxPagePixels": 1200},
                {"lod": 2, "name": "electrical-review-vectors", "minPagePixels": 900},
                {"lod": 3, "name": "fidelity-vectors-and-text", "future": True},
            ],
        },
    }
    diagnostics = {
        "schema": f"{SCHEMA}.diagnostics",
        "unsupported": unsupported_operations,
        "textCacheCoverage": manifest["diagnostics"]["textCacheCoverage"],
        "nativeDetailCoverage": manifest["diagnostics"]["nativeDetailCoverage"],
        "textProvider": manifest["diagnostics"]["textProvider"],
            "nativeDetailComposition": "SVG thumbnails are L0/fallback only; native L2 hides the full SVG texture.",
            "visualRegression": {
                "mode": "build-time-native-preview-svg",
                "pageCount": len(visual_regression_pages),
                "artifactDir": "parity",
                "report": "visual-regression.json",
                "nativePreview": "Native vector preview generated from prism.schematic_vector_a0 L2 primitives.",
                "overlay": "Source SVG thumbnail rendered at low opacity underneath the native preview for inspectable parity diffs.",
            },
        }
    visual_regression = {
        "schema": f"{SCHEMA}.visual_regression",
        "geometryRevision": manifest["geometryRevision"],
        "pageCount": len(visual_regression_pages),
        "pages": visual_regression_pages,
        "totals": {
            "nativePrimitiveCount": sum(page["nativePrimitiveCount"] for page in visual_regression_pages),
            "unsupportedCount": sum(page["unsupportedCount"] for page in visual_regression_pages),
            "imagePrimitiveCount": sum(page["imagePrimitiveCount"] for page in visual_regression_pages),
            "textPrimitiveCount": sum(page["textPrimitiveCount"] for page in visual_regression_pages),
        },
    }
    (schematic_dir / "visual-regression.json").write_text(
        json.dumps(visual_regression, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    (schematic_dir / "diagnostics.json").write_text(
        json.dumps(diagnostics, separators=(",", ":")),
        encoding="utf-8",
    )
    (schematic_dir / "schematic.vector.manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":")),
        encoding="utf-8",
    )
    if progress:
        progress(
            "schematic vector manifest "
            f"pages={len(pages)} features={len(features)} unsupported={len(unsupported_operations)}"
        )
    return {
        "schema": SCHEMA,
        "path": "schematic-vector/schematic.vector.manifest.json",
        "geometry_revision": manifest["geometryRevision"],
        "page_count": len(pages),
        "feature_count": len(features),
        "unsupported_count": len(unsupported_operations),
    }
