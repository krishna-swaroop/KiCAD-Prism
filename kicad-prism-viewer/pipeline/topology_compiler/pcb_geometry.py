from __future__ import annotations

import math
from typing import Any


NM_TO_MM = 1e-6

KIND_IDS = {
    "unknown": 0,
    "board": 1,
    "track": 2,
    "track_arc": 2,
    "zone": 3,
    "pad": 4,
    "via": 5,
    "silkscreen": 6,
    "component": 7,
}


def extract_pad_holes(pcb: Any) -> dict[str, dict[str, Any]]:
    holes: dict[str, dict[str, Any]] = {}
    for footprint in getattr(pcb, "footprints", []) or []:
        for pad in getattr(footprint, "pads", []) or []:
            source_uid = str(getattr(pad, "uuid", "") or "")
            drill = float(getattr(pad, "drill", 0.0) or 0.0)
            if not source_uid or drill <= 0:
                continue
            holes[source_uid] = {
                "drill_mm": drill,
                "drill_width_mm": float(getattr(pad, "drill_width", 0.0) or drill),
                "drill_height_mm": float(getattr(pad, "drill_height", 0.0) or drill),
                "oval": bool(getattr(pad, "drill_oval", False)),
                "plated": str(getattr(getattr(pad, "pad_type", ""), "value", getattr(pad, "pad_type", "")))
                != "np_thru_hole",
            }
    return holes


def point_nm(x: Any, y: Any) -> tuple[float, float]:
    return float(x or 0) * NM_TO_MM, float(y or 0) * NM_TO_MM


def transform(
    point: tuple[float, float],
    origin: tuple[float, float],
    angle_deg: float,
) -> tuple[float, float]:
    angle = math.radians(angle_deg)
    cosine, sine = math.cos(angle), math.sin(angle)
    return (
        origin[0] + point[0] * cosine - point[1] * sine,
        origin[1] + point[0] * sine + point[1] * cosine,
    )


def clean_ring(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    output: list[tuple[float, float]] = []
    for point in ring:
        if not output or math.dist(point, output[-1]) > 1e-9:
            output.append(point)
    if len(output) > 1 and math.dist(output[0], output[-1]) <= 1e-9:
        output.pop()
    return output


def circle(
    center: tuple[float, float],
    radius: float,
    segments: int = 32,
) -> list[tuple[float, float]]:
    return [
        (
            center[0] + math.cos(math.tau * index / segments) * radius,
            center[1] + math.sin(math.tau * index / segments) * radius,
        )
        for index in range(segments)
    ]


def capsule(
    start: tuple[float, float],
    end: tuple[float, float],
    radius: float,
    segments: int = 12,
) -> list[tuple[float, float]]:
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    return [
        (
            end[0] + math.cos(angle - math.pi / 2 + math.pi * index / segments) * radius,
            end[1] + math.sin(angle - math.pi / 2 + math.pi * index / segments) * radius,
        )
        for index in range(segments + 1)
    ] + [
        (
            start[0] + math.cos(angle + math.pi / 2 + math.pi * index / segments) * radius,
            start[1] + math.sin(angle + math.pi / 2 + math.pi * index / segments) * radius,
        )
        for index in range(segments + 1)
    ]


def sample_arc_op(op: dict[str, Any]) -> list[tuple[float, float]]:
    keys = ("start_x", "start_y", "mid_x", "mid_y", "end_x", "end_y")
    if not all(key in op for key in keys):
        return []
    return sample_three_point_arc(
        point_nm(op["start_x"], op["start_y"]),
        point_nm(op["mid_x"], op["mid_y"]),
        point_nm(op["end_x"], op["end_y"]),
    )


def sample_three_point_arc(
    start: tuple[float, float],
    mid: tuple[float, float],
    end: tuple[float, float],
) -> list[tuple[float, float]]:
    ax, ay = start
    bx, by = mid
    cx, cy = end
    denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(denominator) < 1e-12:
        return [start, end]
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
    start_angle = math.atan2(ay - uy, ax - ux)
    mid_angle = math.atan2(by - uy, bx - ux)
    end_angle = math.atan2(cy - uy, cx - ux)
    sweep = (end_angle - start_angle) % math.tau
    if ((mid_angle - start_angle) % math.tau) > sweep + 1e-9:
        sweep -= math.tau
    radius = math.hypot(ax - ux, ay - uy)
    count = max(4, min(128, math.ceil(abs(sweep) * radius / 0.05)))
    return [
        (
            ux + math.cos(start_angle + sweep * index / count) * radius,
            uy + math.sin(start_angle + sweep * index / count) * radius,
        )
        for index in range(count + 1)
    ]


def pad_rings(op: dict[str, Any]) -> list[list[tuple[float, float]]]:
    """Build a pad outline in footprint-local millimetres.

    ``pcb_footprint_to_record`` emits ``orient_deg = pad.at_angle -
    footprint.at_angle``: pad shapes stay footprint-local while
    ``extras.placement.angle_deg`` carries the placement, which
    ``SemanticGltfBuilder._add_pads`` applies on top. The angle is negated here
    because KiCad measures rotation clockwise-positive in the board's Y-down
    frame -- the same negation ``_add_pads`` applies to the placement angle.
    Adding the placement angle back in at this level would rotate the pad twice.
    """
    kind = str(op.get("kind") or "")
    center = point_nm(op.get("x"), op.get("y"))
    angle = -float(op.get("orient_deg") or 0.0)
    sx = float(op.get("size_x_nm") or op.get("diameter_nm") or 0) * NM_TO_MM
    sy = float(op.get("size_y_nm") or op.get("diameter_nm") or 0) * NM_TO_MM
    if kind == "FlashPadCircle":
        return [circle(center, sx / 2.0)]
    if kind == "FlashPadOval":
        if sx >= sy:
            ring = capsule((-(sx - sy) / 2.0, 0.0), ((sx - sy) / 2.0, 0.0), sy / 2.0)
        else:
            ring = capsule((0.0, -(sy - sx) / 2.0), (0.0, (sy - sx) / 2.0), sx / 2.0)
        return [[transform(point, center, angle) for point in ring]]
    if kind == "FlashPadRoundRect":
        radius = float(op.get("corner_radius_nm") or 0) * NM_TO_MM
        return [[transform(point, center, angle) for point in rounded_rect(sx, sy, radius)]]
    if kind == "FlashPadTrapez" and op.get("corners"):
        ring = [point_nm(point[0], point[1]) for point in op["corners"]]
        return [[transform(point, center, angle) for point in ring]]
    if kind in {"FlashPadRect", "FlashPadTrapez"}:
        ring = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
        return [[transform(point, center, angle) for point in ring]]
    if kind == "FlashPadCustom":
        polygons = op.get("polygons") or op.get("polygon") or []
        if polygons and isinstance(polygons[0], (int, float)):
            polygons = [polygons]
        return [
            [transform(point_nm(point[0], point[1]), center, angle) for point in polygon]
            for polygon in polygons
            if polygon
        ]
    raise ValueError(f"Unsupported PCB IR pad operation: {kind}")


def rounded_rect(
    width: float,
    height: float,
    radius: float,
    segments: int = 6,
) -> list[tuple[float, float]]:
    radius = min(max(0.0, radius), width / 2.0, height / 2.0)
    if radius <= 0:
        return [(-width / 2, -height / 2), (width / 2, -height / 2), (width / 2, height / 2), (-width / 2, height / 2)]
    points: list[tuple[float, float]] = []
    for cx, cy, start in (
        (width / 2 - radius, -height / 2 + radius, -math.pi / 2),
        (width / 2 - radius, height / 2 - radius, 0),
        (-width / 2 + radius, height / 2 - radius, math.pi / 2),
        (-width / 2 + radius, -height / 2 + radius, math.pi),
    ):
        points.extend(
            (
                cx + math.cos(start + math.pi / 2 * index / segments) * radius,
                cy + math.sin(start + math.pi / 2 * index / segments) * radius,
            )
            for index in range(segments + 1)
        )
    return points
