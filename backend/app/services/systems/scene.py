"""The system scene descriptor ``prism.system_scene.a0`` (CONTRACTS_P2 §20).

Pure: the service hands in the occurrence tree, the reader's redaction, each
board's interface and each bundle's status; this module places every
occurrence and lists the board bundles the renderer needs, one per
(project, commit), however many occurrences share it.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any, Callable, Mapping, Optional, Sequence

from app.services.systems.hierarchy import Occurrence
from app.services.systems.placement import poses

SCHEMA = "prism.system_scene.a0"


def asset_id(project_id: str, commit: str) -> str:
    return "sba_" + hashlib.sha256(f"{project_id}\0{commit}".encode()).hexdigest()[:16]


def board_bounds(interface: Optional[Mapping[str, Any]]) -> Optional[dict]:
    """A board's box in its own frame (§14.2): the outline in x/y, ±t/2 in z."""
    outline = (interface or {}).get("boardOutlineMm")
    if not outline:
        return None
    half = float(interface.get("boardThicknessMm") or 0.0) / 2.0
    return {"minMm": [*outline["minMm"], -half], "maxMm": [*outline["maxMm"], half]}


def bundle_to_board(mid_plane_mm: Optional[float]) -> Optional[list[float]]:
    """Column-major map from a bundle's runtime frame (metres, z from the board's
    bottom face) to the board frame (mm, z = 0 at the mid-plane): scale by 1000,
    then lower by the mid-plane height."""
    if mid_plane_mm is None:
        return None
    return [1000.0, 0.0, 0.0, 0.0, 0.0, 1000.0, 0.0, 0.0, 0.0, 0.0, 1000.0, 0.0,
            0.0, 0.0, poses._clean(-mid_plane_mm), 1.0]


def build(
    system_id: str,
    system_version: int,
    occurrences: Sequence[Occurrence],
    shown: Mapping[str, Mapping[str, Any]],
    interface: Callable[[Occurrence], Optional[Mapping[str, Any]]],
    asset: Callable[[Occurrence], dict],
    stored: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> dict:
    """``shown`` is ``GET …/hierarchy``'s redacted entries by path (absent = hidden inside a
    restricted child system). ``asset(o)`` is the asset entry for a visible board.
    ``stored`` holds the root system's poses by instance ID; a child system's come
    frozen in its snapshot (a rigid group, §14.3)."""

    children: dict[str, list[Occurrence]] = defaultdict(list)
    for occurrence in occurrences:
        children[occurrence.path.rsplit("/", 1)[0]].append(occurrence)
    for members in children.values():
        members.sort(key=lambda o: (o.labels[-1].casefold(), o.instance_id))

    local: dict[str, Optional[dict]] = {}  # an occurrence's bounds in its own frame
    placed: dict[str, dict] = {}  # an occurrence's pose in its parent's frame, with its source

    def layout(prefix: str, kept: Mapping[str, Mapping[str, Any]]) -> Optional[dict]:
        """Place the members of the system at ``prefix``; return their union in its frame."""
        members = children.get(prefix, [])
        for member in members:
            if member.kind == "board":
                local[member.path] = board_bounds(interface(member))
            else:
                frozen = {p["instanceId"]: p for p in (member.child.poses if member.child else ())}
                local[member.path] = layout(member.path, frozen)
        row = poses.place([(m.path, local[m.path]) for m in members],
                          {m.path: kept[m.instance_id] for m in members if m.instance_id in kept})
        placed.update(row)
        return poses.union([poses.transform_bounds(row[m.path], local[m.path]) for m in members])

    layout("", stored or {})

    world: dict[str, dict] = {}
    assets: dict[str, dict] = {}
    out = []
    for occurrence in occurrences:  # parents come before their members
        parent = occurrence.path.rsplit("/", 1)[0]
        pose = {key: placed[occurrence.path][key] for key in ("translationMm", "rotation")}
        world[occurrence.path] = poses.compose(world[parent] if parent else poses.IDENTITY, pose)
        entry = shown.get(occurrence.path)
        if entry is None:
            continue
        item = {
            "path": occurrence.path, "parentPath": parent or None, "displayPath": entry["displayPath"],
            "labels": entry["labels"], "instanceId": occurrence.instance_id, "kind": occurrence.kind,
            "depth": occurrence.depth, "restricted": entry["restricted"], "assetId": None,
            "pose": placed[occurrence.path],
            "worldMatrix": poses.matrix(world[occurrence.path]),
            "boundsMm": local[occurrence.path],
        }
        if occurrence.kind == "board" and not entry["restricted"]:
            found = asset(occurrence)
            assets.setdefault(found["assetId"], found)
            item["assetId"] = found["assetId"]
        out.append(item)
    return {
        "schema": SCHEMA, "systemId": system_id, "systemVersion": system_version, "units": "mm",
        "assets": sorted(assets.values(), key=lambda a: a["assetId"]),
        "occurrences": out,
    }
