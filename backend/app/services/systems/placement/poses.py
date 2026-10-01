"""Poses and the default layout (CONTRACTS_P2 §14.1, §14.3).

A pose is ``{"translationMm": [x, y, z], "rotation": [x, y, z, w]}`` and maps an
instance's own frame into its parent's as ``T·R``. Matrices are 4×4,
column-major (WebGPU's layout), in mm.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Optional, Sequence

DEFAULT_GAP_MM = 20.0

IDENTITY = {"translationMm": [0.0, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0, 1.0]}

Bounds = Mapping[str, Sequence[float]]  # {"minMm": [x, y, z], "maxMm": [x, y, z]}


def _clean(value: float) -> float:
    """Round away float noise (1e-9) and fold -0.0, so equal poses serialise equally."""
    return round(float(value), 9) + 0.0


def canonical_rotation(q: Sequence[float]) -> list[float]:
    """§14.1: normalised, ``w ≥ 0`` (the first non-zero of w, x, y, z positive)."""
    size = math.sqrt(sum(c * c for c in q)) or 1.0
    q = [c / size for c in q]
    leading = next((c for c in (q[3], q[0], q[1], q[2]) if abs(c) > 1e-12), 1.0)
    return [_clean(-c if leading < 0 else c) for c in q]


def rotate(q: Sequence[float], v: Sequence[float]) -> list[float]:
    x, y, z, w = q
    # v' = v + 2w(u × v) + 2u × (u × v), u = (x, y, z)
    cx, cy, cz = y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]
    return [v[0] + 2 * (w * cx + y * cz - z * cy),
            v[1] + 2 * (w * cy + z * cx - x * cz),
            v[2] + 2 * (w * cz + x * cy - y * cx)]


def _multiply(a: Sequence[float], b: Sequence[float]) -> list[float]:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


def compose(parent: Mapping[str, Any], child: Mapping[str, Any]) -> dict:
    """``parent · child``: the child's frame expressed in the parent's parent."""
    moved = rotate(parent["rotation"], child["translationMm"])
    return {"translationMm": [_clean(a + b) for a, b in zip(parent["translationMm"], moved)],
            "rotation": canonical_rotation(_multiply(parent["rotation"], child["rotation"]))}


def matrix(pose: Mapping[str, Any]) -> list[float]:
    """Column-major 4×4 of ``T·R``."""
    x, y, z, w = pose["rotation"]
    tx, ty, tz = pose["translationMm"]
    values = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0.0,
              2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0.0,
              2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0.0,
              tx, ty, tz, 1.0]
    return [_clean(v) for v in values]


def transform_bounds(pose: Mapping[str, Any], bounds: Optional[Bounds]) -> Optional[dict]:
    """The axis-aligned box around ``bounds``' eight corners after ``pose``."""
    if bounds is None:
        return None
    lo, hi = bounds["minMm"], bounds["maxMm"]
    corners = [rotate(pose["rotation"], [(lo, hi)[i >> k & 1][k] for k in range(3)]) for i in range(8)]
    t = pose["translationMm"]
    return {"minMm": [_clean(min(c[k] for c in corners) + t[k]) for k in range(3)],
            "maxMm": [_clean(max(c[k] for c in corners) + t[k]) for k in range(3)]}


def union(boxes: Sequence[Optional[Bounds]]) -> Optional[dict]:
    present = [b for b in boxes if b is not None]
    if not present:
        return None
    return {"minMm": [min(b["minMm"][k] for b in present) for k in range(3)],
            "maxMm": [max(b["maxMm"][k] for b in present) for k in range(3)]}


def default_row(items: Sequence[tuple[str, Optional[Bounds]]], gap_mm: float = DEFAULT_GAP_MM) -> dict[str, dict]:
    """§14.3 default poses: along +x in the given order, ``gap_mm`` between bounding boxes.

    Each box's minimum x sits ``gap_mm`` after the previous box's maximum (the
    first at x = 0) and its minimum y on y = 0. An item without bounds takes an
    empty slot at the cursor. Rotation is the identity.
    """
    poses: dict[str, dict] = {}
    cursor = 0.0
    for key, bounds in items:
        if bounds is None:
            translation = [cursor, 0.0, 0.0]
            width = 0.0
        else:
            translation = [cursor - bounds["minMm"][0], -bounds["minMm"][1], 0.0]
            width = bounds["maxMm"][0] - bounds["minMm"][0]
        poses[key] = {"translationMm": [_clean(v) for v in translation], "rotation": [0.0, 0.0, 0.0, 1.0]}
        cursor += width + gap_mm
    return poses


MAX_TRANSLATION_MM = 1_000_000.0  # a kilometre: anything further is a typo, not a placement


def pose_from(translation_mm: Sequence[float], rotation: Sequence[float]) -> dict:
    """A pose from API or manifest input, canonical (§14.1); ``ValueError`` when it is not one."""
    if len(translation_mm) != 3 or len(rotation) != 4:
        raise ValueError("translationMm takes 3 numbers and rotation 4 (x, y, z, w)")
    values = [float(v) for v in (*translation_mm, *rotation)]
    if any(not math.isfinite(v) for v in values):
        raise ValueError("pose values must be finite")
    if any(abs(v) > MAX_TRANSLATION_MM for v in values[:3]):
        raise ValueError(f"translation is limited to ±{MAX_TRANSLATION_MM:g} mm")
    if math.sqrt(sum(v * v for v in values[3:])) < 1e-6:
        raise ValueError("rotation must be a non-zero quaternion")
    return {"translationMm": [_clean(v) for v in values[:3]], "rotation": canonical_rotation(values[3:])}


def place(
    items: Sequence[tuple[str, Optional[Bounds]]],
    stored: Mapping[str, Mapping[str, Any]],
    gap_mm: float = DEFAULT_GAP_MM,
) -> dict[str, dict]:
    """Every member's pose in its system's frame, with its ``source``.

    ``items`` are the members in §14.3 order (label, then instance ID) with
    their own-frame bounds; ``stored`` the poses kept for some of them. A
    stored pose wins; the rest take their slot in the default row, which is
    laid out over every member so moving one board never shifts the others.
    M4 adds the tree solve (``auto`` poses from driving mates) between the two.
    """
    defaults = default_row(items, gap_mm)
    out: dict[str, dict] = {}
    for key, _bounds in items:
        pose = stored.get(key)
        if pose is None:
            out[key] = {**defaults[key], "source": "default"}
        else:
            out[key] = {"translationMm": [_clean(v) for v in pose["translationMm"]],
                        "rotation": canonical_rotation(pose["rotation"]), "source": pose["source"]}
    return out
