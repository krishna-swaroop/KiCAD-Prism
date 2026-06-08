"""
kicad_monkey extraction adapters.

Alternative to the hand-rolled s-expression extractors in sch_diff_service /
pcb_diff_service. These produce **exactly the same item-dict shape** so the
existing diff algorithms (diff_schematics / diff_pcb) run unchanged — only the
parse + extract stage swaps.

Scope is deliberately narrow: parsing only. None of kicad_monkey's rendering,
netlist, or editing features are used.

The public surface mirrors the native extractors:
    extract_all_sch(content: str) -> dict[str, dict]   # {uuid: item}
    extract_all_pcb(content: str) -> dict[str, dict]   # {key:  item}
"""

import logging

from kicad_monkey import KiCadPcb, KiCadSchematic

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Small helpers to bridge kicad_monkey's typed model to the diff item dicts
# ---------------------------------------------------------------------------


def _prop(obj, name: str) -> str:
    """Read a named property's value from a kicad_monkey object.

    The two object models name the key differently:
      - PCB `Footprint.properties` -> `Property(name=..., value=...)`
      - Schematic `SchSymbol.properties` -> `SymProperty(key=..., value=...)`
    so we match on either `name` or `key`. Returns "" when absent, matching the
    native extractor.
    """
    for p in getattr(obj, "properties", None) or []:
        if getattr(p, "name", None) == name or getattr(p, "key", None) == name:
            return getattr(p, "value", "") or ""
    return ""


def _net_name(obj) -> str:
    """Net number-as-string for parity with the native extractor's `net` field.

    The native PCB extractor stores `net` as the *ordinal* rendered as a string
    (from the `(net N "name")` token). kicad_monkey exposes `obj.net` as a
    NetRef(ordinal, name); we mirror the native value (ordinal string).
    """
    net = getattr(obj, "net", None)
    if net is None:
        return ""
    ordinal = getattr(net, "ordinal", None)
    return str(ordinal) if ordinal is not None else ""


# ---------------------------------------------------------------------------
# Schematic
# ---------------------------------------------------------------------------


def _sch_symbols(sch) -> dict:
    result = {}
    for sym in sch.objects.where("SchSymbol"):
        uid = getattr(sym, "uuid", None)
        if not uid:
            continue
        result[uid] = {
            "type": "symbol",
            "uuid": uid,
            "x": float(getattr(sym, "at_x", 0.0) or 0.0),
            "y": float(getattr(sym, "at_y", 0.0) or 0.0),
            "rotation": float(getattr(sym, "at_angle", 0.0) or 0.0),
            "mirror": getattr(sym, "mirror", "") or "",
            "unit": int(getattr(sym, "unit", 1) or 1),
            "in_bom": bool(getattr(sym, "in_bom", True)),
            "on_board": bool(getattr(sym, "on_board", True)),
            "dnp": bool(getattr(sym, "dnp", False)),
            "reference": _prop(sym, "Reference"),
            "value": _prop(sym, "Value"),
            "footprint": _prop(sym, "Footprint"),
            "lib_id": getattr(sym, "lib_id", "") or "",
        }
    return result


def _sch_labels(sch) -> dict:
    # Native uses kinds: label, global_label, hierarchical_label, net_label.
    # kicad_monkey exposes SchLabel / SchGlobalLabel / SchHierLabel.
    kind_map = {
        "SchLabel": "label",
        "SchGlobalLabel": "global_label",
        "SchHierLabel": "hierarchical_label",
    }
    result = {}
    for cls, kind in kind_map.items():
        # where() returns an empty list for class names absent in this build,
        # so no guard is needed for versions that lack a given label type.
        for lbl in sch.objects.where(cls):
            uid = getattr(lbl, "uuid", None)
            if not uid:
                continue
            result[uid] = {
                "type": kind,
                "uuid": uid,
                "x": float(getattr(lbl, "at_x", 0.0) or 0.0),
                "y": float(getattr(lbl, "at_y", 0.0) or 0.0),
                "text": getattr(lbl, "text", "") or "",
            }
    return result


def _sch_texts(sch) -> dict:
    result = {}
    for cls in ("SchText",):
        for t in sch.objects.where(cls):
            uid = getattr(t, "uuid", None)
            if not uid:
                continue
            result[uid] = {
                "type": "text",
                "uuid": uid,
                "x": float(getattr(t, "at_x", 0.0) or 0.0),
                "y": float(getattr(t, "at_y", 0.0) or 0.0),
                "text": getattr(t, "text", "") or "",
            }
    return result


def _sch_sheets(sch) -> dict:
    result = {}
    for sh in sch.objects.where("SchSheet"):
        uid = getattr(sh, "uuid", None)
        if not uid:
            continue
        result[uid] = {
            "type": "sheet",
            "uuid": uid,
            "x": float(getattr(sh, "at_x", 0.0) or 0.0),
            "y": float(getattr(sh, "at_y", 0.0) or 0.0),
            "sheet_file": _prop(sh, "Sheet file") or _prop(sh, "Sheetfile"),
            "sheet_name": _prop(sh, "Sheet name") or _prop(sh, "Sheetname"),
        }
    return result


def _sch_wires(sch) -> dict:
    """Wires/buses. Mirror the native geometry-hash fallback identity.

    Native keys wires by uuid when present, else by a geometry signature; it
    also normalises endpoint order so (A->B) and (B->A) hash the same.
    """
    result = {}
    spec = (("SchWire", "wire"), ("SchBus", "bus"))
    for cls, kind in spec:
        for w in sch.objects.where(cls):
            pts = getattr(w, "points", None) or []
            if len(pts) < 2:
                continue
            (sx, sy), (ex, ey) = (
                (float(pts[0][0]), float(pts[0][1])),
                (float(pts[1][0]), float(pts[1][1])),
            )
            if (sx, sy) > (ex, ey):
                sx, sy, ex, ey = ex, ey, sx, sy
            uid = (
                getattr(w, "uuid", None)
                or f"{kind}:{sx:.4f},{sy:.4f}-{ex:.4f},{ey:.4f}"
            )
            result[uid] = {
                "type": kind,
                "uuid": uid,
                "x": (sx + ex) / 2,
                "y": (sy + ey) / 2,
                "start_x": sx,
                "start_y": sy,
                "end_x": ex,
                "end_y": ey,
                "net": "",
            }
    return result


def _sch_junctions(sch) -> dict:
    result = {}
    for cls, kind in (("SchJunction", "junction"), ("SchNoConnect", "no_connect")):
        for j in sch.objects.where(cls):
            x = float(getattr(j, "at_x", 0.0) or 0.0)
            y = float(getattr(j, "at_y", 0.0) or 0.0)
            uid = getattr(j, "uuid", None) or f"{kind}:{x:.4f},{y:.4f}"
            result[uid] = {"type": kind, "uuid": uid, "x": x, "y": y, "net": ""}
    return result


def extract_all_sch(content: str) -> dict:
    """Parse a .kicad_sch string with kicad_monkey and return {uuid: item}."""
    sch = KiCadSchematic.from_text(content)
    items: dict = {}
    items.update(_sch_symbols(sch))
    items.update(_sch_labels(sch))
    items.update(_sch_texts(sch))
    items.update(_sch_sheets(sch))
    items.update(_sch_wires(sch))
    items.update(_sch_junctions(sch))
    return items


# ---------------------------------------------------------------------------
# PCB
# ---------------------------------------------------------------------------


def _pad_sig(pad) -> str:
    """Stable per-pad signature mirroring the native pcb extractor's format:
    number:type:shape:px,py:sw,sh:drill:net:layers
    """
    number = getattr(pad, "number", "") or ""
    pad_type = (
        getattr(getattr(pad, "pad_type", None), "value", getattr(pad, "pad_type", ""))
        or ""
    )
    shape = (
        getattr(getattr(pad, "shape", None), "value", getattr(pad, "shape", "")) or ""
    )
    px = float(getattr(pad, "at_x", 0.0) or 0.0)
    py = float(getattr(pad, "at_y", 0.0) or 0.0)
    sw = float(getattr(pad, "size_x", 0.0) or 0.0)
    sh = float(getattr(pad, "size_y", 0.0) or 0.0)
    dr = (
        float(getattr(pad, "drill", 0.0) or 0.0)
        if getattr(pad, "drill", None) is not None
        else 0.0
    )
    net = _net_name(pad)
    layers = ",".join(getattr(pad, "layers", None) or [])
    return f"{number}:{pad_type}:{shape}:{px:.4f},{py:.4f}:{sw:.4f},{sh:.4f}:{dr:.4f}:{net}:{layers}"


def _pcb_footprints(pcb) -> dict:
    result = {}
    for fp in pcb.objects.where("Footprint"):
        uid = getattr(fp, "uuid", None)
        if not uid:
            continue
        pads = getattr(fp, "pads", None) or []
        pad_sig = ";".join(sorted(_pad_sig(p) for p in pads))
        result[uid] = {
            "type": "footprint",
            "uuid": uid,
            "x": float(getattr(fp, "at_x", 0.0) or 0.0),
            "y": float(getattr(fp, "at_y", 0.0) or 0.0),
            "rotation": float(getattr(fp, "at_angle", 0.0) or 0.0),
            "reference": _prop(fp, "Reference"),
            "value": _prop(fp, "Value"),
            "lib_id": getattr(fp, "library_link", "") or "",
            "layer": getattr(fp, "layer", "") or "",
            "pad_sig": pad_sig,
        }
    return result


def _pcb_segments(pcb) -> dict:
    result = {}
    for seg in pcb.objects.where("Segment"):
        sx = float(getattr(seg, "start_x", 0.0) or 0.0)
        sy = float(getattr(seg, "start_y", 0.0) or 0.0)
        ex = float(getattr(seg, "end_x", 0.0) or 0.0)
        ey = float(getattr(seg, "end_y", 0.0) or 0.0)
        if (sx, sy) > (ex, ey):
            sx, sy, ex, ey = ex, ey, sx, sy
        layer = getattr(seg, "layer", "") or ""
        net = _net_name(seg)
        width = float(getattr(seg, "width", 0.0) or 0.0)
        geo_key = f"seg:{sx:.4f},{sy:.4f}-{ex:.4f},{ey:.4f}:{layer}:{net}:{width:.4f}"
        result[geo_key] = {
            "type": "segment",
            "uuid": geo_key,
            "x": (sx + ex) / 2,
            "y": (sy + ey) / 2,
            "start_x": sx,
            "start_y": sy,
            "end_x": ex,
            "end_y": ey,
            "layer": layer,
            "net": net,
            "width": width,
        }
    return result


def _pcb_vias(pcb) -> dict:
    result = {}
    for via in pcb.objects.where("Via"):
        x = float(getattr(via, "at_x", 0.0) or 0.0)
        y = float(getattr(via, "at_y", 0.0) or 0.0)
        size = float(getattr(via, "size", 0.0) or 0.0)
        drill = float(getattr(via, "drill", 0.0) or 0.0)
        net = _net_name(via)
        layers = getattr(via, "layers", None) or []
        start_layer = layers[0] if layers else ""
        end_layer = layers[1] if len(layers) > 1 else ""
        via_type = getattr(via, "via_type", None) or "through"
        geo_key = f"via:{x:.4f},{y:.4f}:{size:.4f}:{drill:.4f}:{net}"
        result[geo_key] = {
            "type": "via",
            "uuid": geo_key,
            "x": x,
            "y": y,
            "size": size,
            "drill": drill,
            "net": net,
            "start_layer": start_layer,
            "end_layer": end_layer,
            "via_type": via_type,
        }
    return result


def _pcb_zones(pcb) -> dict:
    result = {}
    for zone in pcb.objects.where("Zone"):
        uid = getattr(zone, "uuid", None)
        # Outline polygon points. kicad_monkey exposes the zone *outline* as
        # `.polygons` (list of ZonePolygon with .points) — distinct from
        # `.filled_polygons`, which is the dense computed fill. The native
        # extractor reads the outline, so we mirror that.
        polygon_points = []
        for zpoly in getattr(zone, "polygons", None) or []:
            for p in getattr(zpoly, "points", None) or []:
                try:
                    polygon_points.append([float(p[0]), float(p[1])])
                except (TypeError, IndexError, ValueError):
                    pass
        if not uid:
            # Native keys zones by uuid; without one we cannot match — skip.
            continue
        xs = [p[0] for p in polygon_points]
        ys = [p[1] for p in polygon_points]
        cx = sum(xs) / len(xs) if xs else 0.0
        cy = sum(ys) / len(ys) if ys else 0.0
        layers = getattr(zone, "layers", None) or []
        layer = (
            ",".join(layers)
            if len(layers) > 1
            else (getattr(zone, "layer", "") or (layers[0] if layers else ""))
        )
        outline_sig = ";".join(f"{px:.4f},{py:.4f}" for px, py in polygon_points)
        result[uid] = {
            "type": "zone",
            "uuid": uid,
            "x": cx,
            "y": cy,
            "net": _net_name(zone),
            "net_name": getattr(getattr(zone, "net", None), "name", "") or "",
            "name": getattr(zone, "name", "") or "",
            "layer": layer,
            "priority": int(getattr(zone, "priority", 0) or 0),
            # Native parses `fill_mode` from the first atom of the (fill ...)
            # token, which is "yes" when filling is enabled. kicad_monkey models
            # that as the boolean `fill_enabled`; map it back for parity.
            "fill_mode": "yes" if getattr(zone, "fill_enabled", False) else "",
            "fill_thermal_gap": float(getattr(zone, "thermal_gap", 0.0) or 0.0),
            "fill_thermal_bridge": float(
                getattr(zone, "thermal_bridge_width", 0.0) or 0.0
            ),
            "min_thickness": float(getattr(zone, "min_thickness", 0.0) or 0.0),
            "connect_pads_mode": getattr(zone, "connect_pads_mode", "") or "",
            "connect_pads_clearance": float(
                getattr(zone, "connect_pads_clearance", 0.0) or 0.0
            ),
            "keepout_sig": "",
            "polygon_points": polygon_points,
            "outline_sig": outline_sig,
        }
    return result


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _pcb_arcs(pcb) -> dict:
    """Curved track arcs (type='arc'). Mirrors native _extract_arcs."""
    result = {}
    for arc in pcb.objects.where("Arc"):
        sx, sy = _f(getattr(arc, "start_x", 0)), _f(getattr(arc, "start_y", 0))
        mx, my = _f(getattr(arc, "mid_x", 0)), _f(getattr(arc, "mid_y", 0))
        ex, ey = _f(getattr(arc, "end_x", 0)), _f(getattr(arc, "end_y", 0))
        layer = getattr(arc, "layer", "") or ""
        net = _net_name(arc)
        width = _f(getattr(arc, "width", 0))
        geo_key = f"arc:{sx:.4f},{sy:.4f}-{mx:.4f},{my:.4f}-{ex:.4f},{ey:.4f}:{layer}:{net}:{width:.4f}"
        result[geo_key] = {
            "type": "arc",
            "uuid": geo_key,
            "x": (sx + ex) / 2,
            "y": (sy + ey) / 2,
            "start_x": sx,
            "start_y": sy,
            "mid_x": mx,
            "mid_y": my,
            "end_x": ex,
            "end_y": ey,
            "layer": layer,
            "net": net,
            "width": width,
        }
    return result


def _pcb_gr_items(pcb) -> dict:
    """Board graphics: gr_text, gr_line, gr_circle, gr_rect, gr_arc, gr_poly.

    This is where silkscreen, courtyard, and edge-cut graphics live. Mirrors
    native _extract_gr_items field-for-field, including the per-kind `geo_sig`
    format the diff compares on.
    """
    result = {}
    spec = (
        ("GrText", "gr_text"),
        ("GrLine", "gr_line"),
        ("GrCircle", "gr_circle"),
        ("GrRect", "gr_rect"),
        ("GrArc", "gr_arc"),
        ("GrPoly", "gr_poly"),
    )
    for cls, kind in spec:
        for it in pcb.objects.where(cls):
            uid = getattr(it, "uuid", None)
            if not uid:
                continue
            layer = getattr(it, "layer", "") or ""
            text = ""
            geo_sig = ""
            # x/y: native uses the (at ...) node — only gr_text/gr_circle carry
            # a meaningful anchor; the rest default to 0,0 to match native.
            x = y = 0.0
            if kind == "gr_text":
                text = getattr(it, "text", "") or ""
                x, y = _f(getattr(it, "at_x", 0)), _f(getattr(it, "at_y", 0))
            elif kind == "gr_line":
                geo_sig = (
                    f"{_f(it.start_x):.4f},{_f(it.start_y):.4f}-"
                    f"{_f(it.end_x):.4f},{_f(it.end_y):.4f}"
                )
            elif kind == "gr_circle":
                geo_sig = (
                    f"c:{_f(it.center_x):.4f},{_f(it.center_y):.4f} "
                    f"e:{_f(it.end_x):.4f},{_f(it.end_y):.4f}"
                )
            elif kind == "gr_rect":
                geo_sig = (
                    f"s:{_f(it.start_x):.4f},{_f(it.start_y):.4f} "
                    f"e:{_f(it.end_x):.4f},{_f(it.end_y):.4f}"
                )
            elif kind == "gr_arc":
                geo_sig = (
                    f"s:{_f(it.start_x):.4f},{_f(it.start_y):.4f} "
                    f"m:{_f(it.mid_x):.4f},{_f(it.mid_y):.4f} "
                    f"e:{_f(it.end_x):.4f},{_f(it.end_y):.4f}"
                )
            elif kind == "gr_poly":
                pts = getattr(it, "points", None) or []
                geo_sig = ";".join(f"{_f(p[0]):.4f},{_f(p[1]):.4f}" for p in pts)
            result[uid] = {
                "type": kind,
                "uuid": uid,
                "x": x,
                "y": y,
                "layer": layer,
                "text": text,
                "geo_sig": geo_sig,
            }
    return result


def extract_all_pcb(content: str) -> dict:
    """Parse a .kicad_pcb string with kicad_monkey and return {key: item}."""
    pcb = KiCadPcb.from_string(content)
    items: dict = {}
    items.update(_pcb_footprints(pcb))
    items.update(_pcb_segments(pcb))
    items.update(_pcb_arcs(pcb))
    items.update(_pcb_vias(pcb))
    items.update(_pcb_zones(pcb))
    items.update(_pcb_gr_items(pcb))
    return items
