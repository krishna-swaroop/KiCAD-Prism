from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any


def mesh_axis_range(path: Path, mesh_name_contains: str, axis: int) -> tuple[float, float] | None:
    payload = _glb_json(path)
    meshes = payload.get("meshes", [])
    accessors = payload.get("accessors", [])
    nodes = payload.get("nodes", [])
    roots = payload.get("scenes", [{}])[payload.get("scene", 0)].get("nodes", [])
    result: list[float] = []

    def visit(node_index: int, parent: list[float]) -> None:
        node = nodes[node_index]
        world = _multiply(parent, _node_matrix(node))
        mesh_index = node.get("mesh")
        if mesh_index is not None:
            mesh = meshes[mesh_index]
            if mesh_name_contains.lower() in str(mesh.get("name") or "").lower():
                for primitive in mesh.get("primitives", []):
                    accessor = accessors[primitive.get("attributes", {}).get("POSITION", -1)]
                    minimum, maximum = accessor.get("min"), accessor.get("max")
                    if minimum and maximum:
                        for corner in _corners(minimum, maximum):
                            result.append(_transform_point(world, corner)[axis])
        for child in node.get("children", []):
            visit(child, world)

    for root in roots:
        visit(root, _identity())
    return (min(result), max(result)) if result else None


def _glb_json(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"Not a GLB file: {path}")
    offset = 12
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if kind == b"JSON":
            return json.loads(chunk.decode("utf-8").rstrip("\x00 "))
    raise ValueError(f"GLB has no JSON chunk: {path}")


def _identity() -> list[float]:
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def _node_matrix(node: dict[str, Any]) -> list[float]:
    if node.get("matrix"):
        return [float(value) for value in node["matrix"]]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    qx, qy, qz, qw = node.get("rotation", [0, 0, 0, 1])
    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz = qx * qy, qx * qz, qy * qz
    wx, wy, wz = qw * qx, qw * qy, qw * qz
    return [
        (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
        (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
        (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
        tx, ty, tz, 1,
    ]


def _multiply(left: list[float], right: list[float]) -> list[float]:
    return [
        sum(left[row + index * 4] * right[index + column * 4] for index in range(4))
        for column in range(4)
        for row in range(4)
    ]


def _transform_point(matrix: list[float], point: list[float]) -> list[float]:
    x, y, z = point
    return [
        matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ]


def _corners(minimum: list[float], maximum: list[float]) -> list[list[float]]:
    return [
        [x, y, z]
        for x in (minimum[0], maximum[0])
        for y in (minimum[1], maximum[1])
        for z in (minimum[2], maximum[2])
    ]
