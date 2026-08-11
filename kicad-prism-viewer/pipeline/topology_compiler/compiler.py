from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .models import (
    Component,
    GraphicPrimitive,
    Layer,
    Net,
    PhysicalObject,
    SchematicPage,
    Terminal,
    Topology,
    stable_id,
)


METADATA_PATTERN = re.compile(
    r"<metadata\b(?P<attrs>[^>]*)>(?P<body>.*?)</metadata>",
    re.IGNORECASE | re.DOTALL,
)


def _json_text_from_metadata(body: str) -> str | None:
    text = body.strip()
    if not text:
        return None
    text = re.sub(r"^<!\[CDATA\[(.*)\]\]>$", r"\1", text, flags=re.DOTALL).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        return None
    return text[start : end + 1]


def load_enriched_svg_metadata(path: Path) -> dict[str, Any] | None:
    content = path.read_text(encoding="utf-8", errors="replace")
    for match in METADATA_PATTERN.finditer(content):
        candidate = _json_text_from_metadata(match.group("body"))
        if not candidate:
            continue
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        schema = str(payload.get("schema", ""))
        if schema.startswith("kicad_monkey."):
            return payload
    return None


def _component_uid(designator: str) -> str:
    return stable_id("cmp", designator)


def _net_uid(name: str, explicit: str = "") -> str:
    return explicit or stable_id("net", name)


def _default_layers() -> list[Layer]:
    return [
        Layer("layer_silk", "F.SilkS", "silkscreen", 0.9, 0.0, "ink", "#f2f2f2", "marking", 0),
        Layer("layer_fcu", "F.Cu", "copper", 0.84, 0.035, "copper", "#df342b", "copper", 1),
        Layer("layer_board", "Board", "dielectric", 0.0, 1.53, "FR4", "#2f6b4f", "board", 2),
        Layer("layer_bcu", "B.Cu", "copper", -0.84, 0.035, "copper", "#245fd3", "copper", 3),
    ]


def _layers_from_pcb_metadata(metadata: dict[str, Any] | None) -> list[Layer]:
    if not metadata:
        return _default_layers()
    stackup = metadata.get("board", {}).get("stackup", {})
    raw_layers = stackup.get("layers", [])
    if not raw_layers:
        return _default_layers()

    layers: list[Layer] = []
    board_thickness = float(metadata.get("board", {}).get("thickness_mm", 1.6))

    # Check if there are real dielectric layers besides "Board"
    has_real_dielectrics = any(
        raw.get("name") != "Board" and str(raw.get("role") or "").lower() == "dielectric"
        for raw in raw_layers
    )

    board_layer = next((raw for raw in raw_layers if raw.get("name") == "Board"), None)
    if board_layer and not has_real_dielectrics:
        # Only add the Board placeholder when no real dielectric layers exist
        board_layer_thickness = float(board_layer.get("thickness_mm") or board_thickness)
        layers.append(
            Layer(
                uid=stable_id("layer", "Board"),
                name="Board",
                role="dielectric",
                z_mm=0.0,
                thickness_mm=board_layer_thickness,
                material=str(board_layer.get("material") or "FR4"),
                color=str(board_layer.get("color") or "#2f6b4f"),
                visibility_group="board",
                stack_index=int(board_layer.get("stack_index") or 0),
                epsilon_r=_optional_float(board_layer.get("epsilon_r")),
                loss_tangent=_optional_float(board_layer.get("loss_tangent")),
            )
        )
    stack_layers = [raw for raw in raw_layers if raw.get("name") != "Board"]
    has_physical_stackup = any("stack_index" in raw for raw in stack_layers) and not all(
        bool(raw.get("synthetic_stackup")) for raw in stack_layers
    )
    physical_layers = (
        stack_layers
        if has_physical_stackup
        else [raw for raw in stack_layers if str(raw.get("role") or "") == "copper"]
    )
    physical_thickness = sum(float(raw.get("thickness_mm") or 0.0) for raw in physical_layers)
    if not has_physical_stackup:
        physical_thickness = board_thickness + sum(
            float(raw.get("thickness_mm") or 0.0) for raw in physical_layers
        )
    cursor = physical_thickness / 2.0
    for index, raw in enumerate(stack_layers):
        thickness = float(raw.get("thickness_mm") or 0.0)
        name = str(raw.get("name") or raw.get("display_name") or f"layer_{index}")
        role = str(raw.get("role") or raw.get("type") or "unknown")
        if has_physical_stackup:
            cursor -= thickness / 2.0
            z_mm = cursor
            cursor -= thickness / 2.0
        elif role == "copper" and name == "F.Cu":
            z_mm = board_thickness / 2.0 + thickness / 2.0
        elif role == "copper" and name == "B.Cu":
            z_mm = -board_thickness / 2.0 - thickness / 2.0
        elif role == "copper":
            z_mm = 0.0
        else:
            z_mm = board_thickness / 2.0 + 0.05 if name.startswith("F.") else -board_thickness / 2.0 - 0.05
        layers.append(
            Layer(
                uid=stable_id("layer", name),
                name=name,
                role=role,
                z_mm=round(z_mm, 6),
                thickness_mm=thickness,
                material=str(raw.get("material") or role),
                color=str(raw.get("color") or "#8a8a8a"),
                visibility_group=role,
                stack_index=int(raw.get("stack_index") if raw.get("stack_index") is not None else index),
                epsilon_r=_optional_float(raw.get("epsilon_r")),
                loss_tangent=_optional_float(raw.get("loss_tangent")),
            )
        )
    return layers or _default_layers()


def _optional_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _manufacturing_bool(value: Any, *, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower().replace("-", "_")
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    if text in {"0", "false", "no", "n", "off", "none"}:
        return False
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    return True


def _board_from_pcb_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {
            "bbox_mm": [0.0, 0.0, 80.0, 50.0],
            "origin_mm": [0.0, 0.0],
            "thickness_mm": 1.6,
            "stackup_present": False,
            "stackup": {
                "present": False,
                "copper_finish": "None",
                "edge_connector": False,
                "castellated_pads": False,
                "edge_plating": False,
            },
            "materials": ["FR4", "copper"],
        }
    board = metadata.get("board", {})
    stackup = board.get("stackup", {})
    return {
        "bbox_mm": board.get("bbox_mm") or [0.0, 0.0, 80.0, 50.0],
        "origin_mm": board.get("aux_axis_origin_mm") or [0.0, 0.0],
        "thickness_mm": board.get("thickness_mm") or 1.6,
        "stackup_present": bool(stackup.get("present")),
        "stackup": {
            "present": bool(stackup.get("present")),
            "computed_thickness_mm": stackup.get("computed_thickness_mm"),
            "copper_finish": stackup.get("copper_finish") or "None",
            "edge_connector": _manufacturing_bool(stackup.get("edge_connector")),
            "castellated_pads": _manufacturing_bool(stackup.get("castellated_pads")),
            "edge_plating": _manufacturing_bool(stackup.get("edge_plating")),
        },
        "materials": sorted(
            {
                str(layer.get("material"))
                for layer in stackup.get("layers", [])
                if layer.get("material")
            }
        ),
        "net_classes": board.get("net_classes") or [],
    }


def compile_topology(
    design_payload: dict[str, Any],
    schematic_metadata: list[dict[str, Any]] | None = None,
    pcb_metadata: dict[str, Any] | None = None,
    asset_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    schematic_metadata = schematic_metadata or []

    components: list[Component] = []
    component_by_designator: dict[str, Component] = {}
    for raw in design_payload.get("components", []):
        designator = str(raw.get("designator") or raw.get("reference") or "")
        if not designator:
            continue
        uid = str(raw.get("uid") or _component_uid(designator))
        component = Component(
            uid=uid,
            designator=designator,
            value=str(raw.get("value") or ""),
            footprint=str(raw.get("footprint") or ""),
            parameters={str(k): str(v) for k, v in (raw.get("parameters") or {}).items()},
            schematic_symbol_ids=[str(raw.get("svg_id"))] if raw.get("svg_id") else [],
        )
        components.append(component)
        component_by_designator[designator] = component

    nets: list[Net] = []
    terminals: list[Terminal] = []
    net_by_name: dict[str, Net] = {}
    for raw in design_payload.get("nets", []):
        name = str(raw.get("name") or "")
        if not name:
            continue
        net = Net(
            uid=_net_uid(name, str(raw.get("uid") or "")),
            name=name,
            aliases=[str(item) for item in raw.get("aliases", [])],
            net_class=str(raw.get("net_class") or ""),
            graphical_ids=[
                str(item)
                for values in (raw.get("graphical") or {}).values()
                for item in (values or [])
            ],
        )
        for terminal_raw in raw.get("terminals", []) or []:
            designator = str(terminal_raw.get("designator") or terminal_raw.get("ref") or "")
            pin = str(terminal_raw.get("pin") or "")
            component = component_by_designator.get(designator)
            terminal_uid = stable_id("term", f"{name}:{designator}:{pin}")
            terminal = Terminal(
                uid=terminal_uid,
                component_uid=component.uid if component else "",
                designator=designator,
                pin=pin,
                net_uid=net.uid,
                net_name=name,
                schematic_pin_id=str(terminal_raw.get("svg_id") or terminal_raw.get("source_pin_id") or ""),
            )
            terminals.append(terminal)
            net.terminals.append(terminal_uid)
        nets.append(net)
        net_by_name[name] = net

    layers = _layers_from_pcb_metadata(pcb_metadata)
    board = _board_from_pcb_metadata(pcb_metadata)
    physical_objects: list[PhysicalObject] = []

    board_object = PhysicalObject(
        uid="obj_board_substrate",
        kind="board_body",
        layer="Board",
        bbox_mm=list(board["bbox_mm"]),
        source_ids=[],
    )
    physical_objects.append(board_object)

    for layer in layers:
        if layer.name == "Board":
            continue
        physical_objects.append(
            PhysicalObject(
                uid=stable_id("obj", f"layer:{layer.name}"),
                kind="layer_sheet",
                layer=layer.name,
                bbox_mm=list(board["bbox_mm"]),
                source_ids=[layer.uid],
            )
        )

    extracted_physical_objects = (pcb_metadata or {}).get("physical_objects", [])
    if extracted_physical_objects:
        for raw in extracted_physical_objects:
            net_name = str(raw.get("net_name") or "")
            designator = str(raw.get("designator") or "")
            net = net_by_name.get(net_name)
            component = component_by_designator.get(designator)
            physical_objects.append(
                PhysicalObject(
                    uid=str(raw.get("uid") or stable_id("obj", json.dumps(raw, sort_keys=True))),
                    kind=str(raw.get("kind") or "unknown"),
                    layer=str(raw.get("layer") or ""),
                    layers=[str(item) for item in raw.get("layers", []) if item],
                    net_uid=net.uid if net else str(raw.get("net_uid") or ""),
                    net_name=net.name if net else net_name,
                    component_uid=component.uid if component else str(raw.get("component_uid") or ""),
                    designator=component.designator if component else designator,
                    bbox_mm=[float(v) for v in raw.get("bbox_mm", [])],
                    source_ids=[str(item) for item in raw.get("source_ids", []) if item],
                    geometry=raw.get("geometry", {}) if isinstance(raw.get("geometry"), dict) else {},
                )
            )
    elif (pcb_components := (pcb_metadata or {}).get("components", [])):
        for raw in pcb_components:
            designator = str(raw.get("designator") or "")
            component = component_by_designator.get(designator)
            x = float(raw.get("x_mm") or 0.0)
            y = float(raw.get("y_mm") or 0.0)
            w = 3.0 + min(8.0, len(designator) * 0.3)
            h = 2.0
            physical_objects.append(
                PhysicalObject(
                    uid=stable_id("obj", f"component:{designator}"),
                    kind="footprint_body",
                    layer=str(raw.get("layer") or "F.Cu"),
                    component_uid=component.uid if component else "",
                    designator=designator,
                    bbox_mm=[x - w / 2, y - h / 2, x + w / 2, y + h / 2],
                    source_ids=[str(raw.get("unique_id") or "")],
                )
            )
    elif not pcb_metadata:
        min_x, min_y, max_x, _max_y = [float(v) for v in board["bbox_mm"]]
        for index, component in enumerate(components[:24]):
            x = min_x + 8.0 + (index % 8) * 8.0
            y = min_y + 8.0 + (index // 8) * 8.0
            physical_objects.append(
                PhysicalObject(
                    uid=stable_id("obj", f"component:{component.designator}"),
                    kind="footprint_body",
                    layer="F.Cu",
                    component_uid=component.uid,
                    designator=component.designator,
                    bbox_mm=[x - 2.2, y - 1.2, x + 2.2, y + 1.2],
                    source_ids=component.schematic_symbol_ids,
                )
            )

    terminal_by_key = {
        (terminal.designator, terminal.pin, terminal.net_name): terminal
        for terminal in terminals
    }
    for link in (pcb_metadata or {}).get("terminal_pad_links", []):
        key = (
            str(link.get("designator") or ""),
            str(link.get("pin") or ""),
            str(link.get("net_name") or ""),
        )
        terminal = terminal_by_key.get(key)
        if terminal:
            terminal.pcb_pad_id = str(link.get("object_uid") or "")

    component_by_uid = {component.uid: component for component in components}
    net_by_uid = {net.uid: net for net in nets}
    for obj in physical_objects:
        if obj.component_uid and obj.kind == "footprint_body":
            component = component_by_uid.get(obj.component_uid)
            if component and obj.uid not in component.pcb_footprint_ids:
                component.pcb_footprint_ids.append(obj.uid)
        if obj.net_uid:
            net = net_by_uid.get(obj.net_uid)
            if net and obj.uid not in net.pcb_object_ids:
                net.pcb_object_ids.append(obj.uid)

    schematic_pages: list[SchematicPage] = []
    graphic_primitives: list[GraphicPrimitive] = []
    for index, meta in enumerate(schematic_metadata):
        view = meta.get("view", {})
        sheet_path = str(view.get("sheet_instance_path") or view.get("sheet_path") or f"/sheet/{index}")
        page_uid = stable_id("page", sheet_path)
        schematic_pages.append(
            SchematicPage(
                uid=page_uid,
                sheet_path=sheet_path,
                hierarchy_path=str(view.get("sheet_path") or sheet_path),
                title=str(view.get("sheet_name") or f"Sheet {index + 1}"),
                bbox=[0.0, 0.0, 297.0, 210.0],
                transform=[index * 360.0, 0.0, 1.0],
                svg_ids=list((meta.get("view_indexes") or {}).get("svg_to_nets", {}).keys()),
            )
        )
        svg_to_nets = (meta.get("view_indexes") or {}).get("svg_to_nets", {})
        for svg_id, candidates in svg_to_nets.items():
            first = candidates[0] if candidates else {}
            net_name = str(first.get("name") or "")
            net = net_by_name.get(net_name)
            primitive = GraphicPrimitive(
                uid=stable_id("g", f"{sheet_path}:{svg_id}"),
                source_id=str(svg_id),
                primitive_kind="schematic_net_graphic",
                bbox=[0.0, 0.0, 1.0, 1.0],
                sheet_path=sheet_path,
                net_uid=net.uid if net else str(first.get("uid") or ""),
                net_name=net_name,
            )
            graphic_primitives.append(primitive)

    if not schematic_pages:
        schematic_pages.append(
            SchematicPage(
                uid="page_root",
                sheet_path="/",
                hierarchy_path="/",
                title="Root Schematic",
                bbox=[0.0, 0.0, 297.0, 210.0],
                transform=[0.0, 0.0, 1.0],
                svg_ids=[],
            )
        )

    indexes = _build_indexes(components, nets, terminals, physical_objects, schematic_pages, graphic_primitives)
    topology = Topology(
        design={
            "source_cad": "kicad",
            "units": "mm",
            "generator": "kicad-3d-viz-dev",
            "source_schema": design_payload.get("schema", "unknown"),
            "project": design_payload.get("project", {}),
            "assets": asset_metadata or {},
        },
        board=board,
        components=components,
        nets=nets,
        terminals=terminals,
        layers=layers,
        physical_objects=physical_objects,
        schematic_pages=schematic_pages,
        graphic_primitives=graphic_primitives,
        indexes=indexes,
        validation={
            "errors": [],
            "warnings": [],
            "stats": {
                "components": len(components),
                "nets": len(nets),
                "terminals": len(terminals),
                "physical_objects": len(physical_objects),
                "schematic_pages": len(schematic_pages),
            },
        },
    )
    return topology.to_dict()


def _build_indexes(
    components: list[Component],
    nets: list[Net],
    terminals: list[Terminal],
    physical_objects: list[PhysicalObject],
    schematic_pages: list[SchematicPage],
    graphic_primitives: list[GraphicPrimitive],
) -> dict[str, Any]:
    net_to_objects: dict[str, list[str]] = {}
    component_to_objects: dict[str, list[str]] = {}
    object_to_net: dict[str, str] = {}
    object_to_component: dict[str, str] = {}
    source_svg_to_object: dict[str, list[str]] = {}
    object_to_source_svg: dict[str, list[str]] = {}

    for obj in physical_objects:
        if obj.net_uid:
            net_to_objects.setdefault(obj.net_uid, []).append(obj.uid)
            object_to_net[obj.uid] = obj.net_uid
        if obj.component_uid:
            component_to_objects.setdefault(obj.component_uid, []).append(obj.uid)
            object_to_component[obj.uid] = obj.component_uid
        for source_id in obj.source_ids:
            if not source_id:
                continue
            source_svg_to_object.setdefault(source_id, []).append(obj.uid)
        object_to_source_svg[obj.uid] = [sid for sid in obj.source_ids if sid]

    for primitive in graphic_primitives:
        if primitive.net_uid:
            net_to_objects.setdefault(primitive.net_uid, []).append(primitive.uid)
            object_to_net[primitive.uid] = primitive.net_uid
        if primitive.component_uid:
            component_to_objects.setdefault(primitive.component_uid, []).append(primitive.uid)
            object_to_component[primitive.uid] = primitive.component_uid
        if primitive.source_id:
            source_svg_to_object.setdefault(primitive.source_id, []).append(primitive.uid)
            object_to_source_svg[primitive.uid] = [primitive.source_id]

    return {
        "net_to_objects": net_to_objects,
        "component_to_objects": component_to_objects,
        "object_to_net": object_to_net,
        "object_to_component": object_to_component,
        "source_svg_to_object": source_svg_to_object,
        "object_to_source_svg": object_to_source_svg,
        "sheet_path_to_pages": {page.sheet_path: [page.uid] for page in schematic_pages},
        "designator_to_component": {component.designator: component.uid for component in components},
        "net_name_to_net": {net.name: net.uid for net in nets},
        "terminal_to_net": {terminal.uid: terminal.net_uid for terminal in terminals},
    }
