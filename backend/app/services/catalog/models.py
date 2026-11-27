"""Catalog 3D models for System Builder (CONTRACTS_P2 §18.2; PLAN §5.5).

A part's ``3dmodel`` STEP assets are converted to GLB with Geometer and cached
by the STEP's sha256 plus the converter identity, so a new Geometer produces
new cached files and an unchanged STEP is never converted twice. Geometer's
``model_bounds`` is stored with each GLB. Each (part, model) has one
**alignment** (offset, rotation, scale) mapping the model into the part's
mating frame; it is applied at render time and never baked into the GLB.

Mating frame (the housing twin of ``F_c``, CONTRACTS_P2 §14.4): origin on the
mating face, +z the direction the part mates toward, pad 1 at −x. Two aligned
mating parts meet with one of them turned half a turn about x.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

STEP_SUFFIXES = (".step", ".stp")
PREVIEW_VIEWS = {
    "front": ((0.0, -1.0, 0.0), (0.0, 0.0, 1.0)),
    "side": ((1.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
    "top": ((0.0, 0.0, 1.0), (0.0, 1.0, 0.0)),
}
IDENTITY = {"offsetMm": [0.0, 0.0, 0.0], "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}


def converter_id() -> str:
    """Geometer's version: its GLB export takes no tessellation options, so the version is the setting."""
    import geometer

    version = getattr(geometer, "__version__", None)
    if version is None:
        import importlib.metadata

        version = importlib.metadata.version("wn-geometer")
    return f"geometer-{version}"


def glb_key(step_sha256: str, converter: str) -> str:
    return hashlib.sha256(f"{step_sha256}\n{converter}".encode()).hexdigest()


def _glb_materials(glb: bytes) -> int:
    length = int.from_bytes(glb[12:16], "little")
    return len(json.loads(glb[20:20 + length]).get("materials") or [])


def convert(step: bytes) -> dict[str, Any]:
    """``{glb, bounds, materials}`` for STEP bytes."""
    import geometer

    glb = geometer.step_to_glb(step)
    bounds = geometer.model_bounds(step).bounds
    return {"glb": glb, "bounds": {"minMm": list(bounds["min"]), "maxMm": list(bounds["max"])},
            "materials": _glb_materials(glb)}


def normalized_alignment(value: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    value = dict(value or IDENTITY)
    offset = [float(v) for v in value.get("offsetMm") or IDENTITY["offsetMm"]]
    rotation = [float(v) for v in value.get("rotationDeg") or IDENTITY["rotationDeg"]]
    scale = float(value.get("scale") if value.get("scale") is not None else 1.0)
    if len(offset) != 3 or len(rotation) != 3:
        raise ValueError("offsetMm and rotationDeg take three numbers")
    if not all(math.isfinite(v) for v in [*offset, *rotation, scale]) or not 0 < scale <= 100:
        raise ValueError("alignment numbers must be finite and the scale in (0, 100]")
    if any(abs(v) > 10_000 for v in offset):
        raise ValueError("offsets are limited to ±10 m")
    return {"offsetMm": offset, "rotationDeg": rotation, "scale": scale}


def alignment_matrix(alignment: Mapping[str, Any]) -> list[float]:
    """Column-major 4×4 of ``T(offset) · Rz · Ry · Rx · S`` (rotate about x, then y, then z; degrees)."""
    rx, ry, rz = (math.radians(v) for v in alignment["rotationDeg"])
    s = alignment["scale"]
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    r = [[cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
         [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
         [-sy, cy * sx, cy * cx]]
    t = alignment["offsetMm"]
    return [r[0][0] * s, r[1][0] * s, r[2][0] * s, 0.0,
            r[0][1] * s, r[1][1] * s, r[2][1] * s, 0.0,
            r[0][2] * s, r[1][2] * s, r[2][2] * s, 0.0,
            t[0], t[1], t[2], 1.0]


def _multiply(a: Sequence[float], b: Sequence[float]) -> list[float]:
    """Column-major ``a · b``."""
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4)) for col in range(4) for row in range(4)]


HALF_TURN_X = [1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0]


def preview_svg(step: bytes, alignment: Mapping[str, Any], view: str,
                partner: Optional[tuple[bytes, Mapping[str, Any]]] = None) -> str:
    """An orthographic view of the aligned model, optionally mated to ``partner`` (its STEP and alignment).

    The mating face sits at z = 0; the partner is turned half a turn about x so the two faces meet.
    """
    import geometer
    from geometer import MeshIllustrationInputA0, MeshIllustrationStyleA0, MeshIllustrationView

    if view not in PREVIEW_VIEWS:
        raise ValueError(f"view must be one of {', '.join(PREVIEW_VIEWS)}")
    placed = []
    for index, (data, matrix) in enumerate([(step, alignment_matrix(alignment))] + (
            [(partner[0], _multiply(HALF_TURN_X, alignment_matrix(partner[1])))] if partner else [])):
        try:
            meshes = geometer.model_tessellation(data).mesh_collection.meshes
        except geometer.GeometerOperationError as exc:  # some STEPs convert to GLB but don't tessellate
            raise ValueError("Geometer could not tessellate this model for a preview") from exc
        for mesh in meshes:
            base = mesh.matrix or [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
            placed.append(dataclasses.replace(mesh, id=f"{index}:{mesh.id}", matrix=tuple(_multiply(matrix, base))))
    direction, up = PREVIEW_VIEWS[view]
    result = geometer.mesh_illustration(MeshIllustrationInputA0(
        schema="geometry.mesh_illustration.input.a0", meshes=tuple(placed),
        view=MeshIllustrationView(direction=direction, up=up),
        style=MeshIllustrationStyleA0(source_colors=True, transparent_background=True, show_outlines=True)))
    return result.svg


# ---------------------------------------------------------------------------
# Storage (catalog migration 5)


def conversion_job_key(component_id: str, revision_id: Optional[str] = None) -> str:
    """The ``catalog_model_glb`` job key: per component (its current revision) or pinned revision, and per
    converter, so a new Geometer converts again rather than reusing the old converter's completed job."""
    return f"catalog_model_glb:{component_id}" + (f"@{revision_id}" if revision_id else "") + f":{converter_id()}"


def step_assets(conn: Any, component_id: str, revision_id: Optional[str] = None) -> list[dict[str, Any]]:
    """A revision's ``3dmodel`` assets that are STEP files: ``revision_id`` of this component, else the current one."""
    rows = conn.execute(
        """
        SELECT a.id, a.name, a.canonical_path, a.sha256
        FROM component_revisions cr
        JOIN components c ON c.id = cr.component_id
        JOIN revision_assets ra ON ra.revision_id = cr.id AND ra.asset_type = '3dmodel'
        JOIN assets a ON a.id = ra.asset_id
        WHERE c.id = %s AND cr.id = COALESCE(%s, c.current_revision_id)
        ORDER BY a.name, a.id
        """,
        (component_id, revision_id),
    ).fetchall()
    return [dict(r) for r in rows if str(r["canonical_path"]).lower().endswith(STEP_SUFFIXES)]


def cached(conn: Any, keys: Iterable[str]) -> dict[str, dict[str, Any]]:
    keys = sorted(set(keys))
    if not keys:
        return {}
    rows = conn.execute("SELECT * FROM catalog_model_glb WHERE key = ANY(%s)", (keys,)).fetchall()
    return {str(r["key"]): dict(r) for r in rows}


def store_glb(conn: Any, root: Path, *, key: str, step_sha256: str, converter: str, converted: Mapping[str, Any],
              now: str) -> dict[str, Any]:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{key}.glb"
    path.write_bytes(converted["glb"])
    conn.execute(
        """
        INSERT INTO catalog_model_glb (key, step_sha256, converter, glb_sha256, glb_path, bounds_json, materials,
                                       size_bytes, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (key) DO NOTHING
        """,
        (key, step_sha256, converter, hashlib.sha256(converted["glb"]).hexdigest(), str(path),
         json.dumps(converted["bounds"], sort_keys=True), int(converted["materials"]), len(converted["glb"]), now),
    )
    return cached(conn, [key])[key]


def alignments(conn: Any, component_id: str) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        "SELECT asset_id, alignment_json, updated_by, updated_at FROM catalog_model_alignment WHERE component_id = %s",
        (component_id,),
    ).fetchall()
    return {str(r["asset_id"]): {**json.loads(r["alignment_json"]), "updatedBy": str(r["updated_by"]),
                                 "updatedAt": str(r["updated_at"])} for r in rows}


def set_alignment(conn: Any, component_id: str, asset_id: str, alignment: Mapping[str, Any], *, actor: str,
                  now: str) -> None:
    conn.execute(
        """
        INSERT INTO catalog_model_alignment (component_id, asset_id, alignment_json, updated_by, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (component_id, asset_id) DO UPDATE SET alignment_json = EXCLUDED.alignment_json,
            updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
        """,
        (component_id, asset_id, json.dumps(dict(alignment), sort_keys=True), actor, now),
    )


def copy_alignments(conn: Any, source_component_id: str, component_id: str, revision_id: str, *, actor: str,
                    now: str) -> None:
    """Give ``component_id`` the source's alignment of each model that ``revision_id`` links.

    A component made from another one shares its models; the same model in the
    same series has the same mating frame.
    """
    conn.execute(
        """
        INSERT INTO catalog_model_alignment (component_id, asset_id, alignment_json, updated_by, updated_at)
        SELECT %s, alignment.asset_id, alignment.alignment_json, %s, %s
        FROM catalog_model_alignment alignment
        JOIN revision_assets link ON link.asset_id = alignment.asset_id AND link.revision_id = %s
        WHERE alignment.component_id = %s AND link.asset_type = '3dmodel'
        ON CONFLICT (component_id, asset_id) DO NOTHING
        """,
        (component_id, actor, now, revision_id, source_component_id),
    )


def model_doc(asset: Mapping[str, Any], glb: Optional[Mapping[str, Any]], alignment: Optional[Mapping[str, Any]]) -> dict:
    return {
        "assetId": str(asset["id"]), "name": str(asset["name"]), "stepSha256": str(asset["sha256"]),
        "glb": None if glb is None else {"key": str(glb["key"]), "converter": str(glb["converter"]),
                                         "bounds": json.loads(glb["bounds_json"]), "materials": int(glb["materials"]),
                                         "sizeBytes": int(glb["size_bytes"])},
        "alignment": dict(alignment) if alignment else {**IDENTITY, "updatedBy": None, "updatedAt": None},
    }
