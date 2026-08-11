from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from .models import stable_id


LAYER_COLORS = {
    "Board": "#2f6b4f",
    "F.Cu": "#df342b",
    "B.Cu": "#245fd3",
    "Edge.Cuts": "#d9d9d9",
    "F.SilkS": "#f2f2f2",
    "B.SilkS": "#dddddd",
    "F.Mask": "#316d4f",
    "B.Mask": "#275840",
    "F.Paste": "#c5cbd3",
    "B.Paste": "#aeb7c2",
}

INNER_LAYER_COLORS = [
    "#269e4d",
    "#93612f",
    "#159eb7",
    "#7047b8",
    "#b58b24",
    "#a34f76",
]


def _bbox_list(bounds: Any) -> list[float] | None:
    if bounds is None or not bounds.is_valid():
        return None
    return [
        round(float(bounds.min_x), 6),
        round(float(bounds.min_y), 6),
        round(float(bounds.max_x), 6),
        round(float(bounds.max_y), 6),
    ]


def _bbox_from_points(points: list[tuple[float, float]]) -> list[float] | None:
    if not points:
        return None
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)]


def _merge_bbox(left: list[float] | None, right: list[float] | None) -> list[float] | None:
    if not left:
        return right
    if not right:
        return left
    return [
        min(left[0], right[0]),
        min(left[1], right[1]),
        max(left[2], right[2]),
        max(left[3], right[3]),
    ]


def _clean_contour(points: list[tuple[float, float]]) -> list[list[float]]:
    cleaned: list[list[float]] = []
    for x, y in points:
        point = [round(float(x), 6), round(float(y), 6)]
        if cleaned and cleaned[-1] == point:
            continue
        cleaned.append(point)
    if len(cleaned) > 1 and cleaned[0] == cleaned[-1]:
        cleaned.pop()
    return cleaned if len(cleaned) >= 3 else []


def _geometry_from_contours(contours: list[list[tuple[float, float]]]) -> dict[str, Any]:
    cleaned = [_clean_contour(contour) for contour in contours]
    cleaned = [contour for contour in cleaned if contour]
    if not cleaned:
        return {}
    return {"type": "polygons", "contours": cleaned}


def _geometry_from_polyset(polyset: Any) -> dict[str, Any]:
    if polyset is None or polyset.is_empty():
        return {}
    return _geometry_from_contours(list(getattr(polyset, "outlines", []) or []))


def _transform_contour(
    contour: list[tuple[float, float]],
    x: float,
    y: float,
    angle: float,
) -> list[tuple[float, float]]:
    from kicad_monkey.kicad_geometry import rotate_point  # type: ignore

    transformed: list[tuple[float, float]] = []
    for px, py in contour:
        rx, ry = rotate_point(float(px), float(py), -angle)
        transformed.append((rx + x, ry + y))
    return transformed


def _pad_center(pad: Any) -> tuple[float, float]:
    return float(getattr(pad, "at_x", 0.0) or 0.0), float(getattr(pad, "at_y", 0.0) or 0.0)


def _placement_angle(footprint: Any) -> float:
    return float(getattr(footprint, "at_angle", 0.0) or 0.0)


def _drop_placement_angle(
    contour: list[tuple[float, float]],
    center: tuple[float, float],
    placement_angle: float,
) -> list[tuple[float, float]]:
    """Take the footprint placement back out of a pad outline.

    KiCad board files store ``pad.at_angle`` in board space, not footprint-local
    space: a footprint placed at 90 degrees writes 90 onto every pad that sits
    unrotated in the library. The ``Pad`` shape helpers bake that angle into the
    outline they return, and ``_transform_contour`` then applies the placement
    again, so a rotated footprint gets its pads rotated twice. Rotating the
    outline back about the pad center leaves the footprint-local shape the
    placement transform expects.
    """
    if abs(placement_angle) < 1e-12:
        return contour
    from kicad_monkey.kicad_geometry import rotate_point  # type: ignore

    cx, cy = center
    rotated: list[tuple[float, float]] = []
    for px, py in contour:
        rx, ry = rotate_point(float(px) - cx, float(py) - cy, placement_angle)
        rotated.append((rx + cx, ry + cy))
    return rotated


def _pad_contours(pad: Any, footprint: Any) -> list[list[tuple[float, float]]]:
    from kicad_monkey.kicad_geometry import rotate_point  # type: ignore
    from kicad_monkey.kicad_pcb_polygon_ops import circle_to_polygon, oval_to_polygon  # type: ignore

    shape = _value(getattr(getattr(pad, "shape", ""), "value", getattr(pad, "shape", "")))
    center = _pad_center(pad)
    if shape == "circle":
        contours = [circle_to_polygon(center, pad.size_x / 2.0)]
    elif shape == "oval":
        start, end, width = pad._to_oval_segment(*center)
        contours = [oval_to_polygon(start, end, width)]
    elif shape == "roundrect":
        contours = [pad._to_roundrect_polygon(*center)]
    elif shape == "trapezoid":
        contours = [pad._to_trapezoid_polygon(*center)]
    elif shape == "custom" and getattr(pad, "custom_primitives", None):
        # Custom primitive points are pad-local and unrotated, so they need the
        # same placement the shape helpers above apply for themselves.
        pad_angle = -float(getattr(pad, "at_angle", 0.0) or 0.0)

        def _primitive_contour(points: Any) -> list[tuple[float, float]]:
            contour: list[tuple[float, float]] = []
            for px, py in points:
                rx, ry = rotate_point(float(px), float(py), pad_angle)
                contour.append((rx + center[0], ry + center[1]))
            return contour

        contours = [
            _primitive_contour(primitive.points)
            for primitive in pad.custom_primitives
            if getattr(primitive, "primitive_type", "") == "gr_poly" and primitive.points
        ]
    else:
        contours = [pad._to_rect_polygon(*center)]

    placement_angle = _placement_angle(footprint)
    return [
        _transform_contour(
            _drop_placement_angle(contour, center, placement_angle),
            float(getattr(footprint, "at_x", 0.0) or 0.0),
            float(getattr(footprint, "at_y", 0.0) or 0.0),
            placement_angle,
        )
        for contour in contours
    ]


def _value(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _net_name(net: Any) -> str:
    return _value(getattr(net, "name", ""))


def _net_uid(name: str) -> str:
    return stable_id("net", name) if name else ""


def _component_uid(designator: str) -> str:
    return stable_id("cmp", designator) if designator else ""


def _role_for_layer(name: str, raw_type: str = "") -> str:
    if name == "Board":
        return "dielectric"
    if name == "Edge.Cuts":
        return "outline"
    if name.endswith(".Cu"):
        return "copper"
    if name.endswith(".Mask"):
        return "soldermask"
    if name.endswith(".Paste"):
        return "paste"
    if name.endswith(".SilkS"):
        return "silkscreen"
    if name.endswith(".Fab"):
        return "fabrication"
    if raw_type:
        return raw_type
    return "drawing"


def _layer_material(role: str) -> str:
    if role == "dielectric":
        return "FR4"
    if role == "copper":
        return "copper"
    if role == "soldermask":
        return "soldermask"
    if role == "silkscreen":
        return "ink"
    return role


def _declared_layers(pcb: Any, pcb_file: Path | None = None) -> list[dict[str, Any]]:
    board_thickness = float(getattr(pcb, "thickness", 1.6) or 1.6)
    stackup = getattr(pcb, "stackup", None)
    stackup_layers = list(getattr(stackup, "layers", []) or [])

    allowed_roles = {"copper", "dielectric", "soldermask", "silkscreen", "paste"}
    if stackup_layers:
        return _normalize_stackup_layers(
            [
                {
                    "name": _value(getattr(raw, "name", "")) or f"stackup_{index}",
                    "role": _stackup_role(raw),
                    "type": _value(getattr(raw, "type_name", "")),
                    "thickness_mm": float(getattr(raw, "thickness", 0.0) or 0.0),
                    "material": _value(getattr(raw, "material", "")),
                    "epsilon_r": _float_or_none(getattr(raw, "epsilon_r", None)),
                    "loss_tangent": _float_or_none(getattr(raw, "loss_tangent", None)),
                    "color": _value(getattr(raw, "color", "")),
                }
                for index, raw in enumerate(stackup_layers)
            ],
            allowed_roles,
        )

    if pcb_file:
        parsed_layers = _stackup_layers_from_pcb_file(pcb_file)
        if parsed_layers:
            return _normalize_stackup_layers(parsed_layers, allowed_roles)

    # Fallback when no physical stackup is defined
    extracted_layers = []
    for raw in getattr(pcb, "layers", []) or []:
        name = _value(getattr(raw, "canonical_name", ""))
        if not name:
            continue
        raw_type = _value(getattr(getattr(raw, "layer_type", ""), "value", ""))
        role = _role_for_layer(name, raw_type)
        if role not in allowed_roles:
            continue
        thickness = 0.035 if role == "copper" else 0.01 if role == "soldermask" else 0.0
        extracted_layers.append(
            {
                "name": name,
                "role": role,
                "thickness_mm": thickness,
                "material": _layer_material(role),
                "color": LAYER_COLORS.get(name, "#8a8a8a"),
                "synthetic_stackup": True,
            }
        )

    existing_physical_thickness = sum(layer.get("thickness_mm", 0.0) or 0.0 for layer in extracted_layers)
    board_layer = {
        "name": "Board",
        "role": "dielectric",
        "type": "core",
        "thickness_mm": max(0.0, board_thickness - existing_physical_thickness),
        "material": "FR4",
        "color": LAYER_COLORS["Board"],
        "synthetic_stackup": True,
    }

    return _canonical_fallback_stackup(extracted_layers, board_layer)


def _canonical_fallback_stackup(
    extracted_layers: list[dict[str, Any]],
    board_layer: dict[str, Any],
) -> list[dict[str, Any]]:
    by_name = {str(layer.get("name") or ""): layer for layer in extracted_layers}
    used: set[int] = set()

    def take(name: str) -> dict[str, Any] | None:
        layer = by_name.get(name)
        if layer is None:
            return None
        used.add(id(layer))
        return layer

    ordered: list[dict[str, Any]] = []
    for name in ("F.SilkS", "F.Paste", "F.Mask", "F.Cu"):
        layer = take(name)
        if layer:
            ordered.append(layer)

    top_inner = [
        layer
        for layer in extracted_layers
        if id(layer) not in used and str(layer.get("role") or "") == "copper" and str(layer.get("name") or "").startswith("In")
    ]
    top_inner.sort(key=lambda layer: str(layer.get("name") or ""))
    for layer in top_inner:
        used.add(id(layer))
        ordered.append(layer)

    ordered.append(board_layer)

    bottom_copper = take("B.Cu")
    if bottom_copper:
        ordered.append(bottom_copper)

    for name in ("B.Mask", "B.Paste", "B.SilkS"):
        layer = take(name)
        if layer:
            ordered.append(layer)

    remainder = [layer for layer in extracted_layers if id(layer) not in used]
    remainder.sort(key=lambda layer: _fallback_layer_sort_key(str(layer.get("name") or ""), str(layer.get("role") or "")))
    ordered.extend(remainder)

    for index, layer in enumerate(ordered):
        layer["stack_index"] = index
    return ordered


def _fallback_layer_sort_key(name: str, role: str) -> tuple[int, str]:
    if name.startswith("F."):
        return (10, name)
    if role == "copper":
        return (20, name)
    if name.startswith("B."):
        return (30, name)
    return (40, name)


def _stackup_role(raw: Any) -> str:
    name = _value(getattr(raw, "name", ""))
    get_item_type = getattr(raw, "get_item_type", None)
    item_type = get_item_type() if callable(get_item_type) else ""
    role = _value(getattr(item_type, "value", item_type)).lower()
    return _normalize_physical_role(role or _role_for_layer(name, _value(getattr(raw, "type_name", ""))))


def _normalize_physical_role(role: str) -> str:
    normalized = _value(role).lower()
    if normalized == "solderpaste":
        return "paste"
    if normalized in {"core", "prepreg"}:
        return "dielectric"
    return normalized


def _normalize_stackup_layers(raw_layers: list[dict[str, Any]], allowed_roles: set[str]) -> list[dict[str, Any]]:
    extracted_layers = []
    inner_index = 0
    for raw in raw_layers:
        name = _value(raw.get("name")) or f"stackup_{len(extracted_layers)}"
        role = _normalize_physical_role(_value(raw.get("role")) or _role_for_layer(name, _value(raw.get("type"))))
        if role not in allowed_roles:
            continue
        color = _value(raw.get("color"))
        if role == "copper":
            if name == "F.Cu":
                color = "#df342b"
            elif name == "B.Cu":
                color = "#245fd3"
            else:
                color = INNER_LAYER_COLORS[inner_index % len(INNER_LAYER_COLORS)]
                inner_index += 1
        extracted_layers.append(
            {
                "name": name,
                "role": role,
                "type": _value(raw.get("type")),
                "thickness_mm": float(raw.get("thickness_mm") or 0.0),
                "material": _value(raw.get("material")) or _layer_material(role),
                "color": color or LAYER_COLORS.get(name, "#8a8a8a"),
                "stack_index": len(extracted_layers),
                "epsilon_r": _float_or_none(raw.get("epsilon_r")),
                "loss_tangent": _float_or_none(raw.get("loss_tangent")),
            }
        )
    return extracted_layers


def _stackup_layers_from_pcb_file(pcb_file: Path) -> list[dict[str, Any]]:
    if not pcb_file.is_file():
        return []
    try:
        from kicad_monkey.kicad_sexpr import parse_sexp  # type: ignore
    except Exception:
        return []
    try:
        text = pcb_file.read_text(encoding="utf-8")
        stackup_text = _extract_named_form(text, "stackup")
        if not stackup_text:
            return []
        stackup = parse_sexp(stackup_text)
    except Exception:
        return []
    if not _sexp_is(stackup, "stackup"):
        return []
    layers: list[dict[str, Any]] = []
    for item in stackup:
        if not _sexp_is(item, "layer") or len(item) < 2:
            continue
        name = _value(item[1])
        layer_type = _value(_sexp_value(item, "type"))
        role = _normalize_physical_role(_role_for_layer(name, layer_type))
        layers.append(
            {
                "name": name,
                "role": role,
                "type": layer_type,
                "thickness_mm": _float_or_zero(_sexp_value(item, "thickness")),
                "material": _value(_sexp_value(item, "material")),
                "epsilon_r": _float_or_none(_sexp_value(item, "epsilon_r")),
                "loss_tangent": _float_or_none(_sexp_value(item, "loss_tangent")),
                "color": "",
            }
        )
    return layers


def _default_stackup_metadata() -> dict[str, Any]:
    return {
        "copper_finish": "None",
        "edge_connector": False,
        "castellated_pads": False,
        "edge_plating": False,
    }


def _stackup_metadata_from_pcb_file(pcb_file: Path) -> dict[str, Any]:
    defaults = _default_stackup_metadata()
    if not pcb_file.is_file():
        return defaults
    try:
        from kicad_monkey.kicad_sexpr import parse_sexp  # type: ignore
    except Exception:
        return defaults
    try:
        text = pcb_file.read_text(encoding="utf-8")
        stackup_text = _extract_named_form(text, "stackup")
        if not stackup_text:
            return defaults
        stackup = parse_sexp(stackup_text)
    except Exception:
        return defaults
    if not _sexp_is(stackup, "stackup"):
        return defaults
    return {
        "copper_finish": _clean_enum_text(_sexp_value(stackup, "copper_finish")) or "None",
        "edge_connector": _manufacturing_bool(_sexp_value(stackup, "edge_connector"), default=False),
        "castellated_pads": _manufacturing_bool(_sexp_value(stackup, "castellated_pads"), default=False),
        "edge_plating": _manufacturing_bool(_sexp_value(stackup, "edge_plating"), default=False),
    }


def _extract_named_form(text: str, head: str) -> str | None:
    """Return one balanced top-level form without parsing the full PCB tree."""
    marker = f"({head}"
    start = text.find(marker)
    while start >= 0:
        after = start + len(marker)
        if after >= len(text) or text[after].isspace() or text[after] in ")(" :
            break
        start = text.find(marker, after)
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def _sexp_is(value: Any, name: str) -> bool:
    return isinstance(value, list) and bool(value) and _value(value[0]) == name


def _sexp_child(value: Any, name: str) -> list[Any] | None:
    if not isinstance(value, list):
        return None
    return next((item for item in value if _sexp_is(item, name)), None)


def _sexp_value(value: Any, name: str) -> Any:
    child = _sexp_child(value, name)
    if child and len(child) > 1:
        return child[1]
    return None


def _float_or_zero(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _float_or_none(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _boolish(value: Any) -> bool:
    return _value(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _boolish_or_none(value: Any) -> bool | None:
    text = _value(value).strip().lower()
    if not text:
        return None
    return text in {"1", "true", "yes", "y", "on"}


def _clean_enum_text(value: Any) -> str:
    text = _value(value).strip()
    if not text:
        return ""
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    if text.lower() == "none":
        return "None"
    return text


def _manufacturing_bool(value: Any, *, default: bool | None = None) -> bool | None:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    text = _clean_enum_text(value).strip().lower().replace("-", "_")
    if not text:
        return default
    if text in {"0", "false", "no", "n", "off", "none"}:
        return False
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    return True


def _first_boolish(*values: Any, default: bool | None = None) -> bool | None:
    for value in values:
        parsed = _manufacturing_bool(value)
        if parsed is not None:
            return parsed
    return default


def _board_bbox(pcb: Any) -> list[float]:
    bbox: list[float] | None = None
    for item in pcb.top_level_outline_items(layer_name="Edge.Cuts"):
        bbox = _merge_bbox(bbox, _item_bbox(item))
    if bbox:
        return bbox
    board_bounds = _bbox_list(pcb.get_bounds())
    return board_bounds or [0.0, 0.0, 80.0, 50.0]


def _item_bbox(item: Any) -> list[float] | None:
    get_bounds = getattr(item, "get_bounds", None)
    if callable(get_bounds):
        return _bbox_list(get_bounds())
    get_corners = getattr(item, "get_corners", None)
    if callable(get_corners):
        return _bbox_from_points(list(get_corners()) or [])
    if all(hasattr(item, attr) for attr in ("start_x", "start_y", "end_x", "end_y")):
        return _bbox_from_points(
            [
                (float(item.start_x), float(item.start_y)),
                (float(item.end_x), float(item.start_y)),
                (float(item.end_x), float(item.end_y)),
                (float(item.start_x), float(item.end_y)),
            ]
        )
    return None


def _physical(
    *,
    uid_seed: str,
    kind: str,
    layer: str,
    layers: list[str] | None = None,
    bbox: list[float] | None,
    source_id: str = "",
    net_name: str = "",
    designator: str = "",
    geometry: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not bbox:
        return None
    return {
        "uid": stable_id("obj", uid_seed),
        "kind": kind,
        "layer": layer,
        "layers": list(layers or ([layer] if layer else [])),
        "net_uid": _net_uid(net_name),
        "net_name": net_name,
        "component_uid": _component_uid(designator),
        "designator": designator,
        "bbox_mm": bbox,
        "source_ids": [source_id] if source_id else [],
        "geometry": geometry or {},
    }


def _extract_footprints(pcb: Any, *, include_geometry: bool = True) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    objects: list[dict[str, Any]] = []
    terminal_pad_links: list[dict[str, str]] = []
    for footprint in getattr(pcb, "footprints", []) or []:
        designator = _value(footprint.get_property_value("Reference", ""))
        footprint_bbox: list[float] | None = None
        source_id = _value(getattr(footprint, "uuid", ""))

        for pad in getattr(footprint, "pads", []) or []:
            transformed = _pad_world_bbox(pad, footprint)
            if not transformed:
                continue
            pad_geometry = _geometry_from_contours(_pad_contours(pad, footprint)) if include_geometry else {}
            footprint_bbox = _merge_bbox(footprint_bbox, transformed)
            layers = list(getattr(pad, "layers", []) or [])
            layer = next((name for name in layers if name.endswith(".Cu")), layers[0] if layers else _value(getattr(footprint, "layer", "")))
            net_name = _net_name(getattr(pad, "net", None))
            pad_uuid = _value(getattr(pad, "uuid", ""))
            pad_uid_seed = f"pad:{source_id}:{pad_uuid or pad.number}"
            pad_item = _physical(
                uid_seed=pad_uid_seed,
                kind="pad",
                layer=layer or "F.Cu",
                layers=layers,
                bbox=transformed,
                source_id=pad_uuid,
                net_name=net_name,
                designator=designator,
                geometry=pad_geometry,
            )
            if pad_item:
                objects.append(pad_item)
                terminal_pad_links.append(
                    {
                        "designator": designator,
                        "pin": _value(getattr(pad, "number", "")),
                        "net_name": net_name,
                        "object_uid": pad_item["uid"],
                    }
                )
        if footprint_bbox:
            footprint_bbox = [
                footprint_bbox[0] - 0.35,
                footprint_bbox[1] - 0.35,
                footprint_bbox[2] + 0.35,
                footprint_bbox[3] + 0.35,
            ]
        else:
            footprint_bbox = _bbox_list(footprint.get_bounds())
        item = _physical(
            uid_seed=f"footprint:{source_id or designator}",
            kind="footprint_body",
            layer=_value(getattr(footprint, "layer", "")) or "F.Cu",
            bbox=footprint_bbox,
            source_id=source_id,
            designator=designator,
        )
        if item:
            objects.append(item)
    return objects, terminal_pad_links


def _component_footprints(pcb: Any) -> list[dict[str, Any]]:
    components: list[dict[str, Any]] = []
    for footprint in getattr(pcb, "footprints", []) or []:
        designator = _value(footprint.get_property_value("Reference", ""))
        source_id = _value(getattr(footprint, "uuid", ""))
        bbox = _bbox_list(footprint.get_bounds())
        components.append(
            {
                "designator": designator,
                "uid": _component_uid(designator),
                "unique_id": source_id,
                "layer": _value(getattr(footprint, "layer", "")) or "F.Cu",
                "bbox_mm": bbox,
                "x_mm": float(getattr(footprint, "at_x", 0.0) or 0.0),
                "y_mm": float(getattr(footprint, "at_y", 0.0) or 0.0),
                "angle_deg": float(getattr(footprint, "at_angle", 0.0) or 0.0),
            }
        )
    return components


def _pad_records_and_links(pcb: Any) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    pads: list[dict[str, Any]] = []
    links: list[dict[str, str]] = []
    for footprint in getattr(pcb, "footprints", []) or []:
        designator = _value(footprint.get_property_value("Reference", ""))
        source_id = _value(getattr(footprint, "uuid", ""))
        for pad in getattr(footprint, "pads", []) or []:
            transformed = _pad_world_bbox(pad, footprint)
            if not transformed:
                continue
            layers = list(getattr(pad, "layers", []) or [])
            net_name = _net_name(getattr(pad, "net", None))
            pad_uuid = _value(getattr(pad, "uuid", ""))
            object_uid = stable_id("obj", f"pad:{source_id}:{pad_uuid or pad.number}")
            number = _value(getattr(pad, "number", ""))
            pads.append(
                {
                    "uid": object_uid,
                    "source_id": pad_uuid,
                    "designator": designator,
                    "pin": number,
                    "net_name": net_name,
                    "layers": layers,
                    "bbox_mm": transformed,
                    "drill": {
                        "drill_mm": _float_or_none(getattr(pad, "drill", None)),
                        "drill_width_mm": _float_or_none(getattr(pad, "drill_width", None)),
                        "drill_height_mm": _float_or_none(getattr(pad, "drill_height", None)),
                        "plated": bool(getattr(pad, "plated", False)),
                    },
                }
            )
            links.append(
                {
                    "designator": designator,
                    "pin": number,
                    "net_name": net_name,
                    "object_uid": object_uid,
                }
            )
    return pads, links


def _pad_world_bbox(pad: Any, footprint: Any) -> list[float] | None:
    """Board-space bounding box for a pad, placement counted exactly once.

    ``Pad.get_bounds`` already resolves ``pad.at_angle``, which board files
    store in board space, so the placement angle has to come back out before
    the footprint transform puts it in again. See ``_drop_placement_angle``.
    """
    bounds = _bbox_list(pad.get_bounds())
    if not bounds:
        return None
    min_x, min_y, max_x, max_y = bounds
    corners = [(min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y)]
    placement_angle = _placement_angle(footprint)
    corners = _drop_placement_angle(corners, _pad_center(pad), placement_angle)
    transformed = _transform_contour(
        corners,
        float(getattr(footprint, "at_x", 0.0) or 0.0),
        float(getattr(footprint, "at_y", 0.0) or 0.0),
        placement_angle,
    )
    return _bbox_from_points(transformed) or bounds


def _extract_routing(pcb: Any) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for segment in getattr(pcb, "segments", []) or []:
        net_name = _net_name(getattr(segment, "net", None))
        item = _physical(
            uid_seed=f"segment:{getattr(segment, 'uuid', '')}",
            kind="track",
            layer=_value(getattr(segment, "layer", "")) or "F.Cu",
            bbox=_bbox_list(segment.get_bounds()),
            source_id=_value(getattr(segment, "uuid", "")),
            net_name=net_name,
            geometry=_geometry_from_polyset(segment._to_poly()),
        )
        if item:
            objects.append(item)

    for via in getattr(pcb, "vias", []) or []:
        layers = list(getattr(via, "layers", []) or [])
        net_name = _net_name(getattr(via, "net", None))
        item = _physical(
            uid_seed=f"via:{getattr(via, 'uuid', '')}",
            kind="via",
            layer=layers[0] if layers else "F.Cu",
            layers=layers,
            bbox=_bbox_list(via.get_bounds()),
            source_id=_value(getattr(via, "uuid", "")),
            net_name=net_name,
            geometry=_geometry_from_polyset(via._to_poly()),
        )
        if item:
            objects.append(item)

    for arc in getattr(pcb, "arcs", []) or []:
        net_name = _net_name(getattr(arc, "net", None))
        item = _physical(
            uid_seed=f"arc:{getattr(arc, 'uuid', '')}",
            kind="track_arc",
            layer=_value(getattr(arc, "layer", "")) or "F.Cu",
            bbox=_bbox_list(arc.get_bounds()),
            source_id=_value(getattr(arc, "uuid", "")),
            net_name=net_name,
            geometry=_geometry_from_polyset(arc._to_poly()),
        )
        if item:
            objects.append(item)
    return objects


def _extract_zones(pcb: Any) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for zone in getattr(pcb, "zones", []) or []:
        net_name = _net_name(getattr(zone, "net", None))
        layers = list(getattr(zone, "layers", []) or [])
        if not layers:
            layers = [_value(getattr(zone, "layer", "")) or "F.Cu"]
        for layer in layers:
            contours = [
                list(filled.points)
                for filled in getattr(zone, "filled_polygons", []) or []
                if getattr(filled, "points", None)
                and _value(getattr(filled, "layer", "")) in {"", layer}
            ]
            if not contours:
                contours = [
                    list(poly.points)
                    for poly in getattr(zone, "polygons", []) or []
                    if getattr(poly, "points", None)
                ]
            item = _physical(
                uid_seed=f"zone:{getattr(zone, 'uuid', '')}:{layer}",
                kind="zone",
                layer=layer,
                bbox=_bbox_list(zone.get_bounds()),
                source_id=_value(getattr(zone, "uuid", "")),
                net_name=net_name,
                geometry=_geometry_from_contours(contours),
            )
            if item:
                objects.append(item)
    return objects


def _extract_board_graphics(pcb: Any) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for rect in getattr(pcb, "gr_rects", []) or []:
        bbox = _bbox_from_points(
            [
                (rect.start_x, rect.start_y),
                (rect.end_x, rect.start_y),
                (rect.end_x, rect.end_y),
                (rect.start_x, rect.end_y),
            ]
        )
        item = _physical(
            uid_seed=f"graphic_rect:{getattr(rect, 'uuid', '')}",
            kind="board_outline" if getattr(rect, "layer", "") == "Edge.Cuts" else "graphic_rect",
            layer=_value(getattr(rect, "layer", "")) or "Edge.Cuts",
            bbox=bbox,
            source_id=_value(getattr(rect, "uuid", "")),
            geometry=_geometry_from_polyset(rect._to_poly()),
        )
        if item:
            objects.append(item)
    return objects


def _pcb_metadata_common(
    pcb: Any,
    project_file: Path,
    *,
    physical_objects: list[dict[str, Any]],
    terminal_pad_links: list[dict[str, str]],
    board_bbox: list[float] | None = None,
    components: list[dict[str, Any]] | None = None,
    stats: dict[str, int] | None = None,
    profile_callback=None,
) -> dict[str, Any]:
    pcb_file = project_file.with_suffix(".kicad_pcb")
    layers = _profile_timed(profile_callback, "declared_layers", lambda: _declared_layers(pcb, pcb_file))
    stackup = getattr(pcb, "stackup", None)
    file_stackup_metadata = _profile_timed(
        profile_callback,
        "stackup_metadata_from_file",
        lambda: _stackup_metadata_from_pcb_file(pcb_file),
    )
    computed_thickness = float(getattr(pcb, "thickness", 1.6) or 1.6)
    get_board_thickness = getattr(stackup, "get_board_thickness", None)
    if callable(get_board_thickness):
        computed_thickness = float(get_board_thickness() or computed_thickness)
    project_file_pro = project_file.with_suffix(".kicad_pro")
    net_classes_list = []
    if project_file_pro.is_file():
        net_classes_started = time.perf_counter()
        try:
            from kicad_monkey.kicad_project import KiCadProject
            proj = KiCadProject.from_file(project_file_pro)
            if proj.net_settings and proj.net_settings.classes:
                for nc in proj.net_settings.classes:
                    net_classes_list.append({
                        "name": nc.name,
                        "track_width": nc.track_width,
                        "clearance": nc.clearance,
                        "diff_pair_gap": nc.diff_pair_gap,
                        "diff_pair_width": nc.diff_pair_width,
                        "via_diameter": nc.via_diameter,
                        "via_drill": nc.via_drill,
                    })
        except Exception:
            pass
        _profile_emit(
            profile_callback,
            "project_net_classes",
            (time.perf_counter() - net_classes_started) * 1000.0,
            net_classes=len(net_classes_list),
        )

    if board_bbox is None:
        board_bbox = _profile_timed(profile_callback, "board_bbox", lambda: _board_bbox(pcb))
    if components is None:
        components = _profile_timed(profile_callback, "component_footprints", lambda: _component_footprints(pcb))
    stats_started = time.perf_counter()
    if stats is None:
        def collection_count(name: str) -> int:
            counter = getattr(pcb, "collection_count", None)
            if callable(counter):
                return int(counter(name))
            return len(getattr(pcb, name, []) or [])

        stats = {
            "layers": len(layers),
            "footprints": collection_count("footprints"),
            "pads": sum(len(getattr(fp, "pads", []) or []) for fp in getattr(pcb, "footprints", []) or []),
            "segments": collection_count("segments"),
            "vias": collection_count("vias"),
            "zones": collection_count("zones"),
            "physical_objects": len(physical_objects),
        }
    else:
        stats = {**stats, "layers": len(layers), "physical_objects": len(physical_objects)}
    _profile_emit(profile_callback, "stats", (time.perf_counter() - stats_started) * 1000.0, **stats)

    return {
        "source": str(pcb_file),
        "board": {
            "bbox_mm": board_bbox,
            "thickness_mm": computed_thickness,
            "aux_axis_origin_mm": [0.0, 0.0],
            "stackup": {
                "present": True,
                "layers": layers,
                "computed_thickness_mm": computed_thickness,
                "copper_finish": _clean_enum_text(getattr(stackup, "copper_finish", ""))
                or file_stackup_metadata.get("copper_finish", "None"),
                "edge_connector": _first_boolish(
                    getattr(stackup, "edge_connector", None),
                    file_stackup_metadata.get("edge_connector"),
                    default=False,
                ),
                "castellated_pads": _first_boolish(
                    getattr(stackup, "castellated_pads", None),
                    file_stackup_metadata.get("castellated_pads"),
                    default=False,
                ),
                "edge_plating": _first_boolish(
                    getattr(stackup, "edge_plating", None),
                    file_stackup_metadata.get("edge_plating"),
                    default=False,
                ),
            },
            "net_classes": net_classes_list,
        },
        "physical_objects": physical_objects,
        "terminal_pad_links": terminal_pad_links,
        "components": components,
        "stats": stats,
    }


def _profile_emit(callback, key: str, elapsed_ms: float | None = None, **values: Any) -> None:
    if not callback:
        return
    payload = dict(values)
    if elapsed_ms is not None:
        payload["elapsed_ms"] = elapsed_ms
    callback(key, payload)


def _profile_timed(callback, key: str, factory):
    import time

    started = time.perf_counter()
    result = factory()
    _profile_emit(callback, key, (time.perf_counter() - started) * 1000.0)
    return result


def extract_pcb_metadata_light(pcb: Any, project_file: Path, profile_callback=None) -> dict[str, Any]:
    import time

    started = time.perf_counter()
    pads, terminal_pad_links = _pad_records_and_links(pcb)
    _profile_emit(
        profile_callback,
        "extract_footprints",
        None,
        pads=len(pads),
        terminal_pad_links=len(terminal_pad_links),
    )
    metadata = _profile_timed(
        profile_callback,
        "common_metadata",
        lambda: _pcb_metadata_common(
            pcb,
            project_file,
            physical_objects=[],
            terminal_pad_links=terminal_pad_links,
            profile_callback=profile_callback,
        ),
    )
    metadata["pads"] = pads
    metadata["mode"] = "light"
    metadata["stats"]["physical_objects"] = 0
    _profile_emit(profile_callback, "total", (time.perf_counter() - started) * 1000.0)
    return metadata


def _unified_ir_metadata_records(
    pcb_ir: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, str]], dict[str, dict[str, Any]], dict[str, int]]:
    """Derive Prism's compact PCB indexes from the already-built plotter IR.

    This deliberately avoids walking ``pcb.footprints`` a second time. The
    generic plotter IR already carries footprint placement, pad identity,
    terminal/net attributes, and drill dimensions.
    """

    components: list[dict[str, Any]] = []
    terminal_pad_links_by_key: dict[tuple[str, str], dict[str, str]] = {}
    pad_holes: dict[str, dict[str, Any]] = {}
    counts = {"footprints": 0, "pads": 0, "segments": 0, "vias": 0, "zones": 0}

    for record in pcb_ir.get("records", []) or []:
        kind = str(record.get("kind") or "")
        if kind == "segment":
            counts["segments"] += 1
        elif kind == "via":
            counts["vias"] += 1
        elif kind == "zone_fill":
            counts["zones"] += 1
        if kind != "footprint":
            continue

        counts["footprints"] += 1
        footprint_uuid = str(record.get("uuid") or "")
        designator = str(record.get("reference") or "")
        placement = record.get("placement") or {}
        components.append(
            {
                "designator": designator,
                "uid": _component_uid(designator),
                "unique_id": footprint_uuid,
                "layer": str(record.get("layer") or "F.Cu"),
                "bbox_mm": None,
                "x_mm": round(float(placement.get("x_nm") or 0) * 1e-6, 6),
                "y_mm": round(float(placement.get("y_nm") or 0) * 1e-6, 6),
                "angle_deg": float(placement.get("angle_deg") or 0.0),
            }
        )

        for operation in record.get("operations", []) or []:
            if str(operation.get("kind") or "") != "StartBlock":
                continue
            data_ref = str(operation.get("data_ref") or "")
            attrs = operation.get("extra_attrs") or {}
            if data_ref == "pad":
                pad_number = str(attrs.get("pad_number") or "")
                pad_uuid = str(operation.get("data_uuid") or operation.get("label") or "")
                net_name = str(attrs.get("net") or "")
                key = (footprint_uuid, pad_uuid or pad_number)
                terminal_pad_links_by_key[key] = {
                    "designator": str(attrs.get("component") or designator),
                    "pin": pad_number,
                    "net_name": net_name,
                    "object_uid": stable_id(
                        "obj",
                        f"pad:{footprint_uuid}:{pad_uuid or pad_number}",
                    ),
                }
            elif data_ref == "pad_hole":
                owner = str(attrs.get("hole_owner") or "")
                if not owner:
                    continue
                pad_number = str(attrs.get("pad_number") or "")
                key = (footprint_uuid, owner or pad_number)
                terminal_pad_links_by_key.setdefault(
                    key,
                    {
                        "designator": str(attrs.get("component") or designator),
                        "pin": pad_number,
                        "net_name": str(attrs.get("net") or ""),
                        "object_uid": stable_id(
                            "obj",
                            f"pad:{footprint_uuid}:{owner or pad_number}",
                        ),
                    },
                )
                diameter = _float_or_none(attrs.get("hole_diameter_mm"))
                width = _float_or_none(attrs.get("hole_width_mm"))
                height = _float_or_none(attrs.get("hole_height_mm"))
                drill = diameter
                if drill is None and width and height:
                    drill = min(width, height)
                if not drill or drill <= 0:
                    continue
                pad_holes[owner] = {
                    "drill_mm": drill,
                    "drill_width_mm": width or drill,
                    "drill_height_mm": height or drill,
                    "oval": bool(width and height and abs(width - height) > 1e-12),
                    "plated": str(attrs.get("hole_plating") or "plated") != "non_plated",
                }

    terminal_pad_links = list(terminal_pad_links_by_key.values())
    counts["pads"] = len(terminal_pad_links)
    return components, terminal_pad_links, pad_holes, counts


def compile_pcb_artifacts(
    pcb: Any,
    project_file: Path,
    pcb_ir: dict[str, Any],
    profile_callback=None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """Compile all Prism board-side indexes from one parsed PCB and its IR."""

    started = time.perf_counter()
    components, terminal_pad_links, pad_holes, stats = _profile_timed(
        profile_callback,
        "derive_indexes_from_ir",
        lambda: _unified_ir_metadata_records(pcb_ir),
    )
    board_bbox = _profile_timed(profile_callback, "board_bbox", lambda: _board_bbox(pcb))
    metadata = _profile_timed(
        profile_callback,
        "common_metadata",
        lambda: _pcb_metadata_common(
            pcb,
            project_file,
            physical_objects=[],
            terminal_pad_links=terminal_pad_links,
            board_bbox=board_bbox,
            components=components,
            stats=stats,
            profile_callback=profile_callback,
        ),
    )
    metadata["mode"] = "unified"
    _profile_emit(
        profile_callback,
        "total",
        (time.perf_counter() - started) * 1000.0,
        terminal_pad_links=len(terminal_pad_links),
        pad_holes=len(pad_holes),
    )
    return metadata, pad_holes


def extract_pcb_metadata_full(project_file: Path, pcb: Any | None = None, profile_callback=None) -> dict[str, Any]:
    import time

    started = time.perf_counter()
    if pcb is None:
        def load_pcb():
            from kicad_monkey import KiCadPcb  # type: ignore

            return KiCadPcb.from_file(project_file.with_suffix(".kicad_pcb"))

        pcb = _profile_timed(profile_callback, "kicad_pcb_from_file", load_pcb)
    else:
        _profile_emit(profile_callback, "kicad_pcb_from_file", 0.0, reused_loaded_pcb=True)
    footprint_objects, terminal_pad_links = _profile_timed(
        profile_callback,
        "extract_footprints",
        lambda: _extract_footprints(pcb, include_geometry=True),
    )
    physical_objects = []
    physical_objects.extend(_profile_timed(profile_callback, "extract_board_graphics", lambda: _extract_board_graphics(pcb)))
    physical_objects.extend(_profile_timed(profile_callback, "extract_zones", lambda: _extract_zones(pcb)))
    physical_objects.extend(_profile_timed(profile_callback, "extract_routing", lambda: _extract_routing(pcb)))
    physical_objects.extend(footprint_objects)
    metadata = _profile_timed(
        profile_callback,
        "common_metadata",
        lambda: _pcb_metadata_common(
            pcb,
            project_file,
            physical_objects=physical_objects,
            terminal_pad_links=terminal_pad_links,
            profile_callback=profile_callback,
        ),
    )
    metadata["mode"] = "full"
    _profile_emit(
        profile_callback,
        "total",
        (time.perf_counter() - started) * 1000.0,
        physical_objects=len(physical_objects),
        terminal_pad_links=len(terminal_pad_links),
        stats=metadata.get("stats") or {},
    )
    return metadata


def extract_pcb_metadata(project_file: Path) -> dict[str, Any]:
    return extract_pcb_metadata_full(project_file)
