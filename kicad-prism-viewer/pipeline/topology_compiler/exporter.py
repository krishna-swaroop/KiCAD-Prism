from __future__ import annotations

import json
from pathlib import Path
from string import Template
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
VIEWER_ROOT = ROOT / "viewer"


def _read_viewer_sources() -> dict[str, str]:
    return {
        "styles": (VIEWER_ROOT / "styles.css").read_text(encoding="utf-8"),
        "app": (VIEWER_ROOT / "app.js").read_text(encoding="utf-8"),
    }


def _compact_net_details(topology: dict[str, Any]) -> dict[str, Any]:
    components = {
        str(component.get("uid") or ""): component
        for component in topology.get("components", [])
    }
    details: dict[str, dict[str, Any]] = {}
    for terminal in topology.get("terminals", []):
        net_uid = str(terminal.get("net_uid") or "")
        if not net_uid:
            continue
        component = components.get(str(terminal.get("component_uid") or ""), {})
        endpoint = {
            "designator": str(terminal.get("designator") or component.get("designator") or ""),
            "pin": str(terminal.get("pin") or ""),
            "value": str(component.get("value") or ""),
            "pcb_pad_id": str(terminal.get("pcb_pad_id") or ""),
        }
        terminals = details.setdefault(net_uid, {"terminals": []})["terminals"]
        if endpoint not in terminals:
            terminals.append(endpoint)
    return details


def export_viewer_html(
    topology: dict[str, Any],
    output_path: Path,
    *,
    title: str = "KiCad 3D Viz",
    semantic_geometry: dict[str, Any] | None = None,
) -> None:
    sources = _read_viewer_sources()
    template = Template((VIEWER_ROOT / "viewer.template.html").read_text(encoding="utf-8"))
    embedded_topology = topology
    embedded_geometry = semantic_geometry or {}
    if semantic_geometry:
        embedded_topology = {
            "schema": topology.get("schema"),
            "design": topology.get("design", {}),
            "board": topology.get("board", {}),
            "net_details": _compact_net_details(topology),
        }
        embedded_geometry = {
            "schema": semantic_geometry.get("schema"),
            "packing_mode": semantic_geometry.get("packing_mode"),
            "connected_net_count": semantic_geometry.get("connected_net_count"),
            "assets": semantic_geometry.get("assets", {}),
            "semantic_gltf": semantic_geometry.get("semantic_gltf", {}),
        }
    html = template.safe_substitute(
        title=title,
        styles=sources["styles"],
        app=sources["app"],
        topology_json=json.dumps(embedded_topology, separators=(",", ":")),
        semantic_geometry_json=json.dumps(embedded_geometry, separators=(",", ":")),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
