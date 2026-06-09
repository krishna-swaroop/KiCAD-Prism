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


def _f(v) -> float:
    """Coerce to float, defaulting to 0.0 on None/non-numeric (parity helper)."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _net_idx(obj) -> str:
    """Raw net ordinal string — stored in item['net'] for reference only."""
    net = getattr(obj, "net", None)
    if net is None:
        return ""
    ordinal = getattr(net, "ordinal", None)
    return str(ordinal) if ordinal is not None else ""


def _net_name(obj) -> str:
    """Resolved net name — used in geo_keys and comparable fields.

    kicad_monkey exposes obj.net as NetRef(ordinal, name). We use the name so
    that KiCad's index renumbering (which happens on every footprint add/remove)
    is invisible to the diff.
    """
    net = getattr(obj, "net", None)
    if net is None:
        return ""
    name = getattr(net, "name", None)
    if name is not None:
        return str(name)
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
    number:type:shape:px,py:sw,sh:drill:layers

    Net is intentionally excluded — same reason as in the native extractor.
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
    layers = ",".join(getattr(pad, "layers", None) or [])
    return f"{number}:{pad_type}:{shape}:{px:.4f},{py:.4f}:{sw:.4f},{sh:.4f}:{dr:.4f}:{layers}"


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


def _fp_transform(lx: float, ly: float, ox: float, oy: float, rot_deg: float) -> tuple:
    """Footprint-local point -> board space. Mirrors native _apply_fp_transform."""
    import math

    a = math.radians(-rot_deg)
    ca, sa = math.cos(a), math.sin(a)
    return ox + lx * ca - ly * sa, oy + lx * sa + ly * ca


def _fp_graphic_geo_sig(kind: str, g) -> str:
    """Local-geometry signature for one footprint graphic, matching native's
    _fp_graphic_geo_sig formats exactly so the two parsers compare equal."""
    if kind == "fp_text":
        return f"t:{getattr(g, 'text', '') or ''}"
    if kind in ("fp_line", "fp_rect"):
        return (
            f"{_f(getattr(g, 'start_x', 0)):.4f},{_f(getattr(g, 'start_y', 0)):.4f}-"
            f"{_f(getattr(g, 'end_x', 0)):.4f},{_f(getattr(g, 'end_y', 0)):.4f}"
        )
    if kind == "fp_circle":
        return (
            f"c:{_f(getattr(g, 'center_x', 0)):.4f},{_f(getattr(g, 'center_y', 0)):.4f} "
            f"e:{_f(getattr(g, 'end_x', 0)):.4f},{_f(getattr(g, 'end_y', 0)):.4f}"
        )
    if kind == "fp_arc":
        return (
            f"s:{_f(getattr(g, 'start_x', 0)):.4f},{_f(getattr(g, 'start_y', 0)):.4f} "
            f"m:{_f(getattr(g, 'mid_x', 0)):.4f},{_f(getattr(g, 'mid_y', 0)):.4f} "
            f"e:{_f(getattr(g, 'end_x', 0)):.4f},{_f(getattr(g, 'end_y', 0)):.4f}"
        )
    if kind == "fp_poly":
        pts = getattr(g, "points", None) or []
        return ";".join(f"{_f(p[0]):.4f},{_f(p[1]):.4f}" for p in pts)
    return ""


# (collection attribute on Footprint, item kind, geo_sig kind)
_FP_GRAPHIC_COLLECTIONS = (
    ("fp_lines", "fp_line"),
    ("fp_texts", "fp_text"),
    ("fp_arcs", "fp_arc"),
    ("fp_circles", "fp_circle"),
    ("fp_rects", "fp_rect"),
    ("fp_polys", "fp_poly"),
)


def _fp_graphic_board_points(
    kind: str,
    g,
    ox: float,
    oy: float,
    rot: float,
    *,
    reference: str = "",
    value: str = "",
) -> list:
    """Board-space points describing the graphic's extent (for the overlay bbox).
    Mirrors native _fp_graphic_board_points."""

    def tf(lx, ly):
        return _fp_transform(lx, ly, ox, oy, rot)

    if kind == "fp_line":
        return [
            tf(_f(getattr(g, "start_x", 0)), _f(getattr(g, "start_y", 0))),
            tf(_f(getattr(g, "end_x", 0)), _f(getattr(g, "end_y", 0))),
        ]
    if kind == "fp_rect":
        sx, sy = _f(getattr(g, "start_x", 0)), _f(getattr(g, "start_y", 0))
        ex, ey = _f(getattr(g, "end_x", 0)), _f(getattr(g, "end_y", 0))
        return [tf(sx, sy), tf(ex, sy), tf(ex, ey), tf(sx, ey)]
    if kind == "fp_circle":
        cx, cy = _f(getattr(g, "center_x", 0)), _f(getattr(g, "center_y", 0))
        ex, ey = _f(getattr(g, "end_x", 0)), _f(getattr(g, "end_y", 0))
        r = ((ex - cx) ** 2 + (ey - cy) ** 2) ** 0.5
        return [
            tf(cx - r, cy - r),
            tf(cx + r, cy - r),
            tf(cx + r, cy + r),
            tf(cx - r, cy + r),
        ]
    if kind == "fp_arc":
        return [
            tf(_f(getattr(g, "start_x", 0)), _f(getattr(g, "start_y", 0))),
            tf(_f(getattr(g, "mid_x", 0)), _f(getattr(g, "mid_y", 0))),
            tf(_f(getattr(g, "end_x", 0)), _f(getattr(g, "end_y", 0))),
        ]
    if kind == "fp_poly":
        return [tf(_f(p[0]), _f(p[1])) for p in (getattr(g, "points", None) or [])]
    if kind == "fp_text":
        # fp_text angle is stored in board-space (pre-rotated). Convert the
        # footprint-local anchor to board space, then build the glyph box using
        # the board-space angle — same logic as the native extractor.
        from app.services.pcb_diff_service import text_local_corners

        ax, ay = _f(getattr(g, "at_x", 0)), _f(getattr(g, "at_y", 0))
        t_angle = _f(getattr(g, "at_angle", 0))
        text = getattr(g, "text", "") or ""
        font = getattr(g, "effects", None)
        font = getattr(font, "font", None) if font else None
        size_x = _f(getattr(font, "size_x", 1.0)) if font else 1.0
        size_y = _f(getattr(font, "size_y", size_x)) if font else size_x
        h_align = getattr(g, "h_align", "") or ""
        bx, by = tf(ax, ay)
        return text_local_corners(
            text,
            bx,
            by,
            t_angle,
            size_x,
            size_y,
            h_align,
            reference=reference,
            value=value,
        )
    return []


def _pcb_fp_graphics(pcb) -> dict:
    """Itemise each footprint graphic (silkscreen/fab/courtyard/…) as a
    standalone diff item, mirroring native _extract_fp_graphics: keyed by
    `<footprint-uuid>:<graphic-uuid>`, board-space geometry, footprint-local
    geo_sig.
    """
    result = {}
    for fp in pcb.objects.where("Footprint"):
        fp_uid = getattr(fp, "uuid", None)
        if not fp_uid:
            continue
        ox = _f(getattr(fp, "at_x", 0))
        oy = _f(getattr(fp, "at_y", 0))
        rot = _f(getattr(fp, "at_angle", 0))
        ref = _prop(fp, "Reference")
        val = _prop(fp, "Value")
        for coll, kind in _FP_GRAPHIC_COLLECTIONS:
            for g in getattr(fp, coll, None) or []:
                g_uid = getattr(g, "uuid", None)
                if not g_uid:
                    continue
                board_pts = _fp_graphic_board_points(
                    kind, g, ox, oy, rot, reference=ref, value=val
                )
                if board_pts:
                    bx = sum(p[0] for p in board_pts) / len(board_pts)
                    by = sum(p[1] for p in board_pts) / len(board_pts)
                else:
                    bx, by = ox, oy
                item = {
                    "type": kind,
                    "uuid": f"{fp_uid}:{g_uid}",
                    "x": bx,
                    "y": by,
                    "layer": getattr(g, "layer", "") or "",
                    "text": getattr(g, "text", "") or "" if kind == "fp_text" else "",
                    "geo_sig": _fp_graphic_geo_sig(kind, g),
                    "parent_ref": ref,
                    "polygon_points": [[p[0], p[1]] for p in board_pts],
                }
                if kind == "fp_line" and len(board_pts) >= 2:
                    item["start_x"], item["start_y"] = board_pts[0]
                    item["end_x"], item["end_y"] = board_pts[1]
                result[item["uuid"]] = item
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
        net = _net_idx(seg)
        net_name = _net_name(seg)
        width = float(getattr(seg, "width", 0.0) or 0.0)
        geo_key = f"seg:{sx:.4f},{sy:.4f}-{ex:.4f},{ey:.4f}:{layer}:{width:.4f}"
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
            "net_name": net_name,
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
        net = _net_idx(via)
        net_name = _net_name(via)
        layers = getattr(via, "layers", None) or []
        start_layer = layers[0] if layers else ""
        end_layer = layers[1] if len(layers) > 1 else ""
        via_type = getattr(via, "via_type", None) or "through"
        geo_key = f"via:{x:.4f},{y:.4f}:{size:.4f}:{drill:.4f}"
        result[geo_key] = {
            "type": "via",
            "uuid": geo_key,
            "x": x,
            "y": y,
            "size": size,
            "drill": drill,
            "net": net,
            "net_name": net_name,
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


def _pcb_arcs(pcb) -> dict:
    """Curved track arcs (type='arc'). Mirrors native _extract_arcs."""
    result = {}
    for arc in pcb.objects.where("Arc"):
        sx, sy = _f(getattr(arc, "start_x", 0)), _f(getattr(arc, "start_y", 0))
        mx, my = _f(getattr(arc, "mid_x", 0)), _f(getattr(arc, "mid_y", 0))
        ex, ey = _f(getattr(arc, "end_x", 0)), _f(getattr(arc, "end_y", 0))
        layer = getattr(arc, "layer", "") or ""
        net = _net_idx(arc)
        net_name = _net_name(arc)
        width = _f(getattr(arc, "width", 0))
        geo_key = f"arc:{sx:.4f},{sy:.4f}-{mx:.4f},{my:.4f}-{ex:.4f},{ey:.4f}:{layer}:{width:.4f}"
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
            "net_name": net_name,
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
            polygon_points: list = []
            if kind == "gr_text":
                text = getattr(it, "text", "") or ""
                x, y = _f(getattr(it, "at_x", 0)), _f(getattr(it, "at_y", 0))
                t_angle = _f(getattr(it, "at_angle", 0))
                font = getattr(it, "font", None)
                size_x = _f(getattr(font, "size_x", 1.0)) if font else 1.0
                size_y = _f(getattr(font, "size_y", size_x)) if font else size_x
                h_align = getattr(it, "h_align", "") or ""
                from app.services.pcb_diff_service import text_local_corners

                corners = text_local_corners(
                    text, x, y, t_angle, size_x, size_y, h_align
                )
                polygon_points = [[p[0], p[1]] for p in corners]
                geo_sig = f"t:{text}"
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
                "polygon_points": polygon_points,
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
    items.update(_pcb_fp_graphics(pcb))
    return items
