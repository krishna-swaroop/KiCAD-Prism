"""
PCB Diff Service

Parses .kicad_pcb files from two commits, diffs them by UUID, and returns
a structured change set suitable for the interactive PCB diff viewer.

"""

from pathlib import Path

# Reuse the s-expression parser and git helpers from sch_diff_service
from app.services.sch_diff_service import (
    _at,
    _get,
    _get_all,
    _git_root,
    _parse_sexp,
    _read_file_at_commit,
    _uuid,
    is_valid_commit_hash,
    list_tree_paths,
)
from app.services.workspace_service import workspace

# ---------------------------------------------------------------------------
# PCB element extraction
# ---------------------------------------------------------------------------


def _property(lst: list, name: str) -> str | None:
    for item in _get_all(lst, "property"):
        if len(item) >= 3 and item[1] == name:
            return item[2]
    return None


def _at_with_rot(lst: list) -> tuple:
    """Return (x, y, rotation_deg) from an (at x y [rot]) node."""
    a = _get(lst, "at")
    if a and len(a) >= 3:
        try:
            x = float(a[1])
            y = float(a[2])
            rot = float(a[3]) if len(a) >= 4 else 0.0
            return x, y, rot
        except (ValueError, TypeError):
            pass
    return 0.0, 0.0, 0.0


def _pad_sig(pad: list) -> str:
    """Stable signature for a single pad: number, type, shape, layers, size, drill, position.

    Net is intentionally excluded: net indices are renumbered by KiCad whenever
    any footprint is added/removed, so including them would flag every pad on
    every component as changed even when nothing moved.
    """
    number = pad[1] if len(pad) > 1 and isinstance(pad[1], str) else ""
    pad_type = pad[2] if len(pad) > 2 and isinstance(pad[2], str) else ""
    shape = pad[3] if len(pad) > 3 and isinstance(pad[3], str) else ""
    at_node = _get(pad, "at")
    px = float(at_node[1]) if at_node and len(at_node) > 1 else 0.0
    py = float(at_node[2]) if at_node and len(at_node) > 2 else 0.0
    size_node = _get(pad, "size")
    sw = float(size_node[1]) if size_node and len(size_node) > 1 else 0.0
    sh = float(size_node[2]) if size_node and len(size_node) > 2 else 0.0
    drill_node = _get(pad, "drill")
    dr = float(drill_node[1]) if drill_node and len(drill_node) > 1 else 0.0
    layers_node = _get(pad, "layers")
    layers = ",".join(
        str(layer_name) for layer_name in (layers_node[1:] if layers_node else [])
    )
    return f"{number}:{pad_type}:{shape}:{px:.4f},{py:.4f}:{sw:.4f},{sh:.4f}:{dr:.4f}:{layers}"


def _extract_footprints(tree: list) -> dict:
    result = {}
    for item in _get_all(tree, "footprint"):
        uid = _uuid(item)
        if not uid:
            continue
        x, y, rot = _at_with_rot(item)
        layer_node = _get(item, "layer")
        layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
        # Build a stable pad fingerprint: any pad change flags the footprint as changed
        pads = _get_all(item, "pad")
        pad_sig = ";".join(sorted(_pad_sig(p) for p in pads))
        result[uid] = {
            "type": "footprint",
            "uuid": uid,
            "x": x,
            "y": y,
            "rotation": rot,
            "reference": _property(item, "Reference") or "",
            "value": _property(item, "Value") or "",
            "lib_id": item[1] if len(item) > 1 and isinstance(item[1], str) else "",
            "layer": layer,
            "pad_sig": pad_sig,
        }
    return result


# Footprint graphic child node kinds we itemise as standalone diff items.
_FP_GRAPHIC_KINDS = (
    "fp_line",
    "fp_text",
    "fp_arc",
    "fp_circle",
    "fp_rect",
    "fp_poly",
)


def _xy(node: list) -> tuple:
    """Return (x, y) floats from a 2-coord node like (start x y) / (center x y)."""
    if node and len(node) >= 3:
        try:
            return float(node[1]), float(node[2])
        except (ValueError, TypeError):
            pass
    return 0.0, 0.0


def _apply_fp_transform(
    lx: float, ly: float, ox: float, oy: float, rot_deg: float
) -> tuple:
    """Transform a footprint-local point to board space.

    KiCad footprint graphics are stored in the footprint's local frame; the
    footprint's (at x y rot) places and rotates them on the board. We rotate by
    -rot (KiCad's positive rotation is counter-clockwise on a y-down board) and
    translate by the footprint origin so overlay positions land on the board.
    """
    import math

    a = math.radians(-rot_deg)
    ca, sa = math.cos(a), math.sin(a)
    return ox + lx * ca - ly * sa, oy + lx * sa + ly * ca


def _fp_graphic_geo_sig(kind: str, node: list) -> str:
    """Local-geometry signature for one footprint graphic.

    Uses footprint-LOCAL coordinates so the signature is invariant to the
    parent footprint moving/rotating — only an actual edit of the graphic
    changes it. Identity (the dict key) is the graphic's own uuid, so a single
    silk element can be pinpointed instead of the whole footprint flagging.
    """
    if kind == "fp_text":
        text = node[2] if len(node) > 2 and isinstance(node[2], str) else ""
        return f"t:{text}"
    if kind in ("fp_line", "fp_rect"):
        sx, sy = _xy(_get(node, "start"))
        ex, ey = _xy(_get(node, "end"))
        return f"{sx:.4f},{sy:.4f}-{ex:.4f},{ey:.4f}"
    if kind == "fp_circle":
        cx, cy = _xy(_get(node, "center"))
        ex, ey = _xy(_get(node, "end"))
        return f"c:{cx:.4f},{cy:.4f} e:{ex:.4f},{ey:.4f}"
    if kind == "fp_arc":
        sx, sy = _xy(_get(node, "start"))
        mx, my = _xy(_get(node, "mid"))
        ex, ey = _xy(_get(node, "end"))
        return f"s:{sx:.4f},{sy:.4f} m:{mx:.4f},{my:.4f} e:{ex:.4f},{ey:.4f}"
    if kind == "fp_poly":
        pts = _get(node, "pts")
        xys = _get_all(pts, "xy") if pts else []
        return ";".join(
            f"{float(p[1]):.4f},{float(p[2]):.4f}" for p in xys if len(p) > 2
        )
    return ""


# Padding added to every edge of the text bounding box (mm). Gives a small
# visible gap between the border and the ink.
_TEXT_BOX_PAD_MM = 0.25


def _resolved_text(text: str, reference: str = "", value: str = "") -> str:
    """Resolve KiCad text variables (${REFERENCE}, ${VALUE}, …)."""
    import re

    t = text or ""
    t = t.replace("${REFERENCE}", reference or "REF")
    t = t.replace("${VALUE}", value or "VAL")
    return re.sub(r"\$\{[^}]*\}", "REF", t)


def text_local_corners(
    text: str,
    ax: float,
    ay: float,
    t_angle: float,
    size_x: float,
    size_y: float,
    justify: str,
    *,
    reference: str = "",
    value: str = "",
) -> list:
    """Exact bounding box of a rendered text item, as 4 world-space corners.

    Uses kicad_monkey's stroke font renderer (same glyph data as KiCad) to
    render the text to polylines at the given anchor/angle/size/justify, then
    takes the axis-aligned bbox of all stroke points and adds a small padding.
    Returns 4 corners in the same coordinate frame as (ax, ay).
    """
    from kicad_monkey.kicad_stroke_font import get_renderer

    resolved = _resolved_text(text, reference, value)
    h_align = (
        "right" if "right" in justify else "center" if "left" not in justify else "left"
    )
    v_align = (
        "top" if "top" in justify else "center" if "bottom" not in justify else "bottom"
    )

    polylines = get_renderer().render_text_polylines(
        resolved,
        ax,
        ay,
        size_x,
        size_y,
        angle=t_angle,
        h_align=h_align,
        v_align=v_align,
    )

    all_pts = [pt for pl in polylines for pt in pl]
    if not all_pts:
        # Empty string or all spaces — return a tiny box at the anchor.
        p = _TEXT_BOX_PAD_MM
        return [(ax - p, ay - p), (ax + p, ay - p), (ax + p, ay + p), (ax - p, ay + p)]

    p = _TEXT_BOX_PAD_MM
    min_x = min(pt[0] for pt in all_pts) - p
    max_x = max(pt[0] for pt in all_pts) + p
    min_y = min(pt[1] for pt in all_pts) - p
    max_y = max(pt[1] for pt in all_pts) + p
    return [(min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y)]


def _fp_graphic_board_points(
    kind: str,
    node: list,
    ox: float,
    oy: float,
    rot: float,
    *,
    reference: str = "",
    value: str = "",
) -> list:
    """Board-space points describing the graphic's extent, for the overlay bbox.

    Returns transformed (x, y) tuples in board coordinates. The frontend builds
    a bounding box from these, so the box hugs the actual graphic wherever the
    footprint sits/rotates. Separate from geo_sig (which stays local for diffing).
    """

    def tf(lx, ly):
        return _apply_fp_transform(lx, ly, ox, oy, rot)

    if kind in ("fp_line",):
        return [tf(*_xy(_get(node, "start"))), tf(*_xy(_get(node, "end")))]
    if kind == "fp_rect":
        sx, sy = _xy(_get(node, "start"))
        ex, ey = _xy(_get(node, "end"))
        # All four corners so rotation produces a correct enclosing box.
        return [tf(sx, sy), tf(ex, sy), tf(ex, ey), tf(sx, ey)]
    if kind == "fp_circle":
        cx, cy = _xy(_get(node, "center"))
        ex, ey = _xy(_get(node, "end"))
        r = ((ex - cx) ** 2 + (ey - cy) ** 2) ** 0.5
        # Bounding square of the circle in local space, then transformed.
        return [
            tf(cx - r, cy - r),
            tf(cx + r, cy - r),
            tf(cx + r, cy + r),
            tf(cx - r, cy + r),
        ]
    if kind == "fp_arc":
        return [
            tf(*_xy(_get(node, "start"))),
            tf(*_xy(_get(node, "mid"))),
            tf(*_xy(_get(node, "end"))),
        ]
    if kind == "fp_poly":
        pts = _get(node, "pts")
        xys = _get_all(pts, "xy") if pts else []
        return [tf(float(p[1]), float(p[2])) for p in xys if len(p) > 2]
    if kind == "fp_text":
        # fp_text (at lx ly angle): lx/ly is footprint-local; angle is BOARD-SPACE
        # (KiCad stores it pre-rotated so the text reads correctly regardless of
        # footprint orientation). We therefore:
        #   1. Convert the footprint-local anchor to board space via tf().
        #   2. Rotate the glyph corners by the board-space text angle about that
        #      board-space anchor — no extra footprint rotation applied to the angle.
        at = _get(node, "at")
        ax, ay = _xy(at)
        t_angle = float(at[3]) if at and len(at) > 3 else 0.0
        text = node[2] if len(node) > 2 and isinstance(node[2], str) else ""
        eff = _get(node, "effects")
        font = _get(eff, "font") if eff else None
        size = _get(font, "size") if font else None
        size_x = float(size[1]) if size and len(size) > 1 else 1.0
        size_y = float(size[2]) if size and len(size) > 2 else size_x
        just_node = _get(eff, "justify") if eff else None
        justify = " ".join(str(a) for a in just_node[1:]) if just_node else ""
        # Board-space anchor position.
        bx, by = tf(ax, ay)
        # text_local_corners with anchor=(bx,by) and board-space t_angle gives
        # corners already in board space — no further transform needed.
        return text_local_corners(
            text,
            bx,
            by,
            t_angle,
            size_x,
            size_y,
            justify,
            reference=reference,
            value=value,
        )
    return []


def _extract_fp_graphics(tree: list) -> dict:
    """Itemise each footprint graphic (silkscreen, fab, courtyard, …).

    Each fp_line / fp_text / fp_arc / fp_circle / fp_rect / fp_poly becomes its
    own diff item keyed by `<footprint-uuid>:<graphic-uuid>` so a single changed
    silk element is pinpointed rather than the whole footprint flagging.

    Geometry is emitted in BOARD space (`polygon_points`, plus start/end for
    lines) so the overlay box hugs the real graphic. The comparison signature
    (`geo_sig`) stays footprint-LOCAL so moving the footprint does not spuriously
    flag its silk as edited.
    """
    result = {}
    for fp in _get_all(tree, "footprint"):
        fp_uid = _uuid(fp)
        if not fp_uid:
            continue
        ox, oy, rot = _at_with_rot(fp)
        ref = _property(fp, "Reference") or ""
        val = _property(fp, "Value") or ""
        for kind in _FP_GRAPHIC_KINDS:
            for node in _get_all(fp, kind):
                g_uid = _uuid(node)
                if not g_uid:
                    continue
                layer_node = _get(node, "layer")
                layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
                board_pts = _fp_graphic_board_points(
                    kind, node, ox, oy, rot, reference=ref, value=val
                )
                # Anchor (x/y) = centroid of the board-space points, so the
                # overlay falls on the graphic even when there's no bbox path.
                if board_pts:
                    bx = sum(p[0] for p in board_pts) / len(board_pts)
                    by = sum(p[1] for p in board_pts) / len(board_pts)
                else:
                    bx, by = ox, oy
                text = (
                    node[2]
                    if kind == "fp_text" and len(node) > 2 and isinstance(node[2], str)
                    else ""
                )
                item = {
                    "type": kind,
                    "uuid": f"{fp_uid}:{g_uid}",
                    "x": bx,
                    "y": by,
                    "layer": layer,
                    "text": text,
                    "geo_sig": _fp_graphic_geo_sig(kind, node),
                    "parent_ref": ref,
                    # Board-space outline for the overlay bbox.
                    "polygon_points": [[p[0], p[1]] for p in board_pts],
                }
                # Lines also expose start/end so the frontend's segment-style
                # bbox path applies (with stroke-width padding).
                if kind == "fp_line" and len(board_pts) >= 2:
                    item["start_x"], item["start_y"] = board_pts[0]
                    item["end_x"], item["end_y"] = board_pts[1]
                result[item["uuid"]] = item
    return result


def _build_net_names(tree: list) -> dict:
    """Return {net_index_str → net_name} from top-level (net N "name") nodes."""
    names: dict = {}
    for node in _get_all(tree, "net"):
        if len(node) >= 3:
            names[str(node[1])] = str(node[2])
    return names


def _extract_segments(tree: list, net_names: dict | None = None) -> dict:
    result = {}
    for item in _get_all(tree, "segment"):
        start = _get(item, "start")
        end = _get(item, "end")
        sx = float(start[1]) if start and len(start) > 1 else 0.0
        sy = float(start[2]) if start and len(start) > 2 else 0.0
        ex = float(end[1]) if end and len(end) > 1 else 0.0
        ey = float(end[2]) if end and len(end) > 2 else 0.0
        # Normalise direction so (A→B) and (B→A) hash the same
        if (sx, sy) > (ex, ey):
            sx, sy, ex, ey = ex, ey, sx, sy
        layer_node = _get(item, "layer")
        layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
        net_node = _get(item, "net")
        net_idx = str(net_node[1]) if net_node and len(net_node) > 1 else ""
        net_name = (net_names or {}).get(net_idx, net_idx)
        width_node = _get(item, "width")
        width = float(width_node[1]) if width_node and len(width_node) > 1 else 0.0
        # Key by geometry only — net is a property, not identity.
        # Dropping net from the key means index renumbering (which KiCad does on
        # every footprint add/remove) and net renames don't create ghost adds/removes.
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
            "net": net_idx,
            "net_name": net_name,
            "width": width,
        }
    return result


def _extract_vias(tree: list, net_names: dict | None = None) -> dict:
    result = {}
    for item in _get_all(tree, "via"):
        x, y = _at(item)
        size_node = _get(item, "size")
        size = float(size_node[1]) if size_node and len(size_node) > 1 else 0.0
        drill_node = _get(item, "drill")
        drill = float(drill_node[1]) if drill_node and len(drill_node) > 1 else 0.0
        net_node = _get(item, "net")
        net_idx = str(net_node[1]) if net_node and len(net_node) > 1 else ""
        net_name = (net_names or {}).get(net_idx, net_idx)
        layers_node = _get(item, "layers")
        start_layer = layers_node[1] if layers_node and len(layers_node) > 1 else ""
        end_layer = layers_node[2] if layers_node and len(layers_node) > 2 else ""
        via_type = "through"
        for atom in item:
            if atom in ("blind", "micro"):
                via_type = atom
                break
        geo_key = f"via:{x:.4f},{y:.4f}:{size:.4f}:{drill:.4f}"
        result[geo_key] = {
            "type": "via",
            "uuid": geo_key,
            "x": x,
            "y": y,
            "size": size,
            "drill": drill,
            "net": net_idx,
            "net_name": net_name,
            "start_layer": start_layer,
            "end_layer": end_layer,
            "via_type": via_type,
        }
    return result


def _extract_zones(tree: list) -> dict:
    result = {}
    for item in _get_all(tree, "zone"):
        uid = _uuid(item)
        if not uid:
            continue
        # Use centroid of the outline polygon, else (0,0)
        x, y = 0.0, 0.0
        polygon = _get(item, "polygon")
        if polygon:
            pts = _get(polygon, "pts")
            if pts:
                xys = _get_all(pts, "xy")
                if xys:
                    xs = [float(p[1]) for p in xys if len(p) > 2]
                    ys = [float(p[2]) for p in xys if len(p) > 2]
                    if xs:
                        x, y = sum(xs) / len(xs), sum(ys) / len(ys)
        net_node = _get(item, "net")
        net_name_node = _get(item, "net_name")
        name_node = _get(item, "name")
        layer_node = _get(item, "layer")
        layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
        # Multi-layer zones use a 'layers' list instead of 'layer'
        layers_node = _get(item, "layers")
        if layers_node and len(layers_node) > 1:
            layer = ",".join(str(layer_name) for layer_name in layers_node[1:])
        priority_node = _get(item, "priority")
        priority = (
            int(priority_node[1]) if priority_node and len(priority_node) > 1 else 0
        )
        # Fill sub-tree attributes (Tranche 5)
        fill_node = _get(item, "fill")
        fill_mode = ""
        fill_thermal_gap = 0.0
        fill_thermal_bridge = 0.0
        min_thickness = 0.0
        if fill_node:
            fill_mode = (
                fill_node[1]
                if len(fill_node) > 1 and isinstance(fill_node[1], str)
                else ""
            )
            tg = _get(fill_node, "thermal_gap")
            fill_thermal_gap = float(tg[1]) if tg and len(tg) > 1 else 0.0
            tb = _get(fill_node, "thermal_bridge_width")
            fill_thermal_bridge = float(tb[1]) if tb and len(tb) > 1 else 0.0
        min_t_node = _get(item, "min_thickness")
        min_thickness = (
            float(min_t_node[1]) if min_t_node and len(min_t_node) > 1 else 0.0
        )
        connect_pads_node = _get(item, "connect_pads")
        connect_pads_mode = ""
        connect_pads_clearance = 0.0
        if connect_pads_node:
            for atom in connect_pads_node[1:]:
                if isinstance(atom, str) and atom not in ("clearance",):
                    connect_pads_mode = atom
                    break
            cp_clr = _get(connect_pads_node, "clearance")
            connect_pads_clearance = (
                float(cp_clr[1]) if cp_clr and len(cp_clr) > 1 else 0.0
            )
        # Keepout flags
        keepout_node = _get(item, "keepout")
        keepout_sig = ""
        if keepout_node:
            flags = [
                str(f[0]) + "=" + str(f[1])
                for f in keepout_node[1:]
                if isinstance(f, list) and len(f) >= 2
            ]
            keepout_sig = ";".join(flags)
        # Collect outline polygon points for frontend rendering + comparison
        polygon_points = []
        if polygon:
            pts = _get(polygon, "pts")
            if pts:
                xys = _get_all(pts, "xy")
                polygon_points = [[float(p[1]), float(p[2])] for p in xys if len(p) > 2]
        # Stable signature for the zone outline so polygon edits register as changes.
        outline_sig = ";".join(f"{px:.4f},{py:.4f}" for px, py in polygon_points)
        result[uid] = {
            "type": "zone",
            "uuid": uid,
            "x": x,
            "y": y,
            "net": str(net_node[1]) if net_node and len(net_node) > 1 else "",
            "net_name": net_name_node[1]
            if net_name_node and len(net_name_node) > 1
            else "",
            "name": name_node[1] if name_node and len(name_node) > 1 else "",
            "layer": layer,
            "priority": priority,
            "fill_mode": fill_mode,
            "fill_thermal_gap": fill_thermal_gap,
            "fill_thermal_bridge": fill_thermal_bridge,
            "min_thickness": min_thickness,
            "connect_pads_mode": connect_pads_mode,
            "connect_pads_clearance": connect_pads_clearance,
            "keepout_sig": keepout_sig,
            "polygon_points": polygon_points,
            "outline_sig": outline_sig,
        }
    return result


def _extract_gr_items(tree: list) -> dict:
    """Graphical items: gr_text, gr_line, gr_circle, gr_rect, gr_arc, gr_poly."""
    result = {}
    for kind in ("gr_text", "gr_line", "gr_circle", "gr_rect", "gr_arc", "gr_poly"):
        for item in _get_all(tree, kind):
            uid = _uuid(item)
            if not uid:
                continue
            x, y = _at(item)
            layer_node = _get(item, "layer")
            layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
            text = ""
            geo_sig = ""
            polygon_points: list = []
            if kind == "gr_text" and len(item) > 1 and isinstance(item[1], str):
                text = item[1]
                # Compute exact text corners from font metrics so the overlay
                # polygon wraps the actual glyphs (no fixed-size guess).
                at_node = _get(item, "at")
                ax = float(at_node[1]) if at_node and len(at_node) > 1 else x
                ay = float(at_node[2]) if at_node and len(at_node) > 2 else y
                t_angle = float(at_node[3]) if at_node and len(at_node) > 3 else 0.0
                eff = _get(item, "effects")
                font = _get(eff, "font") if eff else None
                size = _get(font, "size") if font else None
                size_x = float(size[1]) if size and len(size) > 1 else 1.0
                size_y = float(size[2]) if size and len(size) > 2 else size_x
                just_node = _get(eff, "justify") if eff else None
                justify = " ".join(str(a) for a in just_node[1:]) if just_node else ""
                corners = text_local_corners(
                    text, ax, ay, t_angle, size_x, size_y, justify
                )
                polygon_points = [[p[0], p[1]] for p in corners]
                geo_sig = f"t:{text}"
            elif kind == "gr_line":
                start = _get(item, "start")
                end = _get(item, "end")
                sx = float(start[1]) if start and len(start) > 1 else 0.0
                sy = float(start[2]) if start and len(start) > 2 else 0.0
                ex = float(end[1]) if end and len(end) > 1 else 0.0
                ey = float(end[2]) if end and len(end) > 2 else 0.0
                geo_sig = f"{sx:.4f},{sy:.4f}-{ex:.4f},{ey:.4f}"
            elif kind == "gr_circle":
                center = _get(item, "center")
                end = _get(item, "end")
                cx = float(center[1]) if center and len(center) > 1 else 0.0
                cy = float(center[2]) if center and len(center) > 2 else 0.0
                ex = float(end[1]) if end and len(end) > 1 else 0.0
                ey = float(end[2]) if end and len(end) > 2 else 0.0
                geo_sig = f"c:{cx:.4f},{cy:.4f} e:{ex:.4f},{ey:.4f}"
            elif kind == "gr_rect":
                start = _get(item, "start")
                end = _get(item, "end")
                sx = float(start[1]) if start and len(start) > 1 else 0.0
                sy = float(start[2]) if start and len(start) > 2 else 0.0
                ex = float(end[1]) if end and len(end) > 1 else 0.0
                ey = float(end[2]) if end and len(end) > 2 else 0.0
                geo_sig = f"s:{sx:.4f},{sy:.4f} e:{ex:.4f},{ey:.4f}"
            elif kind == "gr_arc":
                start = _get(item, "start")
                mid = _get(item, "mid")
                end = _get(item, "end")
                sx = float(start[1]) if start and len(start) > 1 else 0.0
                sy = float(start[2]) if start and len(start) > 2 else 0.0
                mx = float(mid[1]) if mid and len(mid) > 1 else 0.0
                my = float(mid[2]) if mid and len(mid) > 2 else 0.0
                ex = float(end[1]) if end and len(end) > 1 else 0.0
                ey = float(end[2]) if end and len(end) > 2 else 0.0
                geo_sig = f"s:{sx:.4f},{sy:.4f} m:{mx:.4f},{my:.4f} e:{ex:.4f},{ey:.4f}"
            elif kind == "gr_poly":
                pts = _get(item, "pts")
                if pts:
                    xys = _get_all(pts, "xy")
                    pts_list = [(float(p[1]), float(p[2])) for p in xys if len(p) > 2]
                    geo_sig = ";".join(f"{px:.4f},{py:.4f}" for px, py in pts_list)
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


def _extract_arcs(tree: list, net_names: dict | None = None) -> dict:
    """Curved track arcs (type='arc' in PCB routing layer)."""
    result = {}
    for item in _get_all(tree, "arc"):
        start = _get(item, "start")
        mid = _get(item, "mid")
        end = _get(item, "end")
        if not (start and mid and end):
            continue
        try:
            sx, sy = float(start[1]), float(start[2])
            mx, my = float(mid[1]), float(mid[2])
            ex, ey = float(end[1]), float(end[2])
        except (ValueError, TypeError, IndexError):
            continue
        layer_node = _get(item, "layer")
        layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
        net_node = _get(item, "net")
        net_idx = str(net_node[1]) if net_node and len(net_node) > 1 else ""
        net_name = (net_names or {}).get(net_idx, net_idx)
        width_node = _get(item, "width")
        width = float(width_node[1]) if width_node and len(width_node) > 1 else 0.0
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
            "net": net_idx,
            "net_name": net_name,
            "width": width,
        }
    return result


def _extract_all_pcb(tree: list) -> dict:
    net_names = _build_net_names(tree)
    items = {}
    items.update(_extract_footprints(tree))
    items.update(_extract_segments(tree, net_names))
    items.update(_extract_arcs(tree, net_names))
    items.update(_extract_vias(tree, net_names))
    items.update(_extract_zones(tree))
    items.update(_extract_gr_items(tree))
    items.update(_extract_fp_graphics(tree))
    return items


# ---------------------------------------------------------------------------
# Diff computation
# ---------------------------------------------------------------------------

_PCB_COMPARABLE_KEYS = {
    "footprint": [
        "reference",
        "value",
        "lib_id",
        "layer",
        "x",
        "y",
        "rotation",
        "pad_sig",
    ],
    "segment": ["start_x", "start_y", "end_x", "end_y", "layer", "width"],
    "arc": [
        "start_x",
        "start_y",
        "mid_x",
        "mid_y",
        "end_x",
        "end_y",
        "layer",
        "width",
    ],
    "via": ["x", "y", "size", "drill", "start_layer", "end_layer", "via_type"],
    "zone": [
        "net",
        "net_name",
        "name",
        "layer",
        "priority",
        "x",
        "y",
        "outline_sig",
        "fill_mode",
        "fill_thermal_gap",
        "fill_thermal_bridge",
        "min_thickness",
        "connect_pads_mode",
        "connect_pads_clearance",
        "keepout_sig",
    ],
    "gr_text": ["text", "layer", "x", "y"],
    "gr_line": ["layer", "geo_sig"],
    "gr_circle": ["layer", "geo_sig"],
    "gr_rect": ["layer", "geo_sig"],
    "gr_arc": ["layer", "geo_sig"],
    "gr_poly": ["layer", "geo_sig"],
    # Footprint graphics compare on LOCAL geometry (geo_sig) + layer + text only.
    # x/y (board space) are intentionally excluded so moving the parent
    # footprint doesn't flag every silk element — only a real silk edit does.
    "fp_text": ["text", "layer", "geo_sig"],
    "fp_line": ["layer", "geo_sig"],
    "fp_circle": ["layer", "geo_sig"],
    "fp_rect": ["layer", "geo_sig"],
    "fp_arc": ["layer", "geo_sig"],
    "fp_poly": ["layer", "geo_sig"],
}


_NET_NAME_TYPES = {"segment", "arc", "via"}


def _item_changes(old: dict, new: dict, track_net_names: bool = False) -> dict:
    changes = {}
    keys = list(_PCB_COMPARABLE_KEYS.get(old["type"], []))
    if track_net_names and old["type"] in _NET_NAME_TYPES:
        keys = keys + ["net_name"]
    for k in keys:
        ov, nv = old.get(k), new.get(k)
        if ov != nv:
            changes[k] = {"old": ov, "new": nv}
    return changes


_SNAP = 0.001  # mm tolerance for shared-endpoint matching


def _seg_endpoints(item: dict):
    return (
        (item["start_x"], item["start_y"]),
        (item["end_x"], item["end_y"]),
    )


def _pts_close(a, b) -> bool:
    return abs(a[0] - b[0]) < _SNAP and abs(a[1] - b[1]) < _SNAP


def _segments_share_endpoint(old: dict, new: dict) -> bool:
    """True when the two segments share at least one endpoint (within tolerance)."""
    for op in _seg_endpoints(old):
        for np in _seg_endpoints(new):
            if _pts_close(op, np):
                return True
    return False


def _match_segments(removed_segs: list, added_segs: list) -> tuple:
    """
    Greedily pair removed↔added segments that share an endpoint and have the
    same layer/net/width.  Returns (changed_pairs, still_removed, still_added).
    """
    changed = []
    used_removed = set()
    used_added = set()

    # Index added segments by (layer, width) for fast lookup.
    # Net is excluded — a rerouted segment may have a new net assignment.
    from collections import defaultdict

    added_by_key = defaultdict(list)
    for i, seg in enumerate(added_segs):
        k = (seg["layer"], seg["width"])
        added_by_key[k].append(i)

    for ri, old_seg in enumerate(removed_segs):
        k = (old_seg["layer"], old_seg["width"])
        for ai in added_by_key.get(k, []):
            if ai in used_added:
                continue
            new_seg = added_segs[ai]
            if _segments_share_endpoint(old_seg, new_seg):
                chg = _item_changes(old_seg, new_seg)
                if chg:
                    changed.append(
                        {"item": new_seg, "old_item": old_seg, "changes": chg}
                    )
                used_removed.add(ri)
                used_added.add(ai)
                break  # each removed seg matches at most one added seg

    still_removed = [s for i, s in enumerate(removed_segs) if i not in used_removed]
    still_added = [s for i, s in enumerate(added_segs) if i not in used_added]
    return changed, still_removed, still_added


def _extract_pcb_items(content: str, parser: str) -> dict:
    """Parse + extract PCB items as {key: item}, selecting the parser.

    'native' uses the in-house s-expression extractor; 'monkey' uses the
    kicad_monkey adapter. Both return the identical item-dict shape so the
    diff algorithm downstream is parser-agnostic.
    """
    if parser == "monkey":
        # Imported lazily so the native path has no dependency on kicad_monkey.
        from app.services import monkey_extract_service

        return monkey_extract_service.extract_all_pcb(content)
    return _extract_all_pcb(_parse_sexp(content))


def diff_pcb(
    old_content: str,
    new_content: str,
    parser: str = "native",
    track_net_names: bool = False,
) -> dict:
    old_items = _extract_pcb_items(old_content, parser)
    new_items = _extract_pcb_items(new_content, parser)

    old_uuids = set(old_items)
    new_uuids = set(new_items)

    added_all = [new_items[u] for u in (new_uuids - old_uuids)]
    removed_all = [old_items[u] for u in (old_uuids - new_uuids)]
    changed = []
    for u in old_uuids & new_uuids:
        chg = _item_changes(old_items[u], new_items[u], track_net_names=track_net_names)
        if chg:
            changed.append(
                {"item": new_items[u], "old_item": old_items[u], "changes": chg}
            )

    # Reclassify added/removed segment/arc pairs that share an endpoint as "changed"
    added_segs = [i for i in added_all if i["type"] in ("segment", "arc")]
    removed_segs = [i for i in removed_all if i["type"] in ("segment", "arc")]
    added_other = [i for i in added_all if i["type"] not in ("segment", "arc")]
    removed_other = [i for i in removed_all if i["type"] not in ("segment", "arc")]

    seg_changed, still_removed, still_added = _match_segments(removed_segs, added_segs)
    changed.extend(seg_changed)

    return {
        "added": added_other + still_added,
        "removed": removed_other + still_removed,
        "changed": changed,
    }


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def _find_all_pcb_paths(
    repo_root: Path, commit: str, sub_path: str | None = None
) -> list:
    """Return repo-root-relative .kicad_pcb paths in the commit tree.

    When sub_path is set (Type-2 project) only paths inside that subtree are
    returned, so sibling boards in the same monorepo are not included.
    """
    paths = [p for p in list_tree_paths(repo_root, commit) if p.endswith(".kicad_pcb")]
    if sub_path:
        prefix = sub_path.rstrip("/") + "/"
        paths = [p for p in paths if p == sub_path or p.startswith(prefix)]
    return paths


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def get_pcb_diff(
    project_id: str,
    commit1: str,
    commit2: str,
    parser: str = "native",
    track_net_names: bool = False,
) -> dict | None:
    """
    Return interactive diff data for all PCB files between two commits.

    Returns:
        {
            commit1: str,
            commit2: str,
            boards: [
                {
                    filename: str,
                    old_content: str|None,
                    new_content: str|None,
                    diff: { added, removed, changed },
                },
                ...
            ],
        }
    or None if no PCB files found.
    """
    # Trust boundary: commit ids come from query parameters.
    if not is_valid_commit_hash(commit1) or not is_valid_commit_hash(commit2):
        return None

    row = workspace.get_project_by_id(project_id)
    if not row:
        return None

    project_path = Path(row["path"])
    repo_root = _git_root(project_path)
    sub_path: str | None = row.get("sub_path")

    paths1 = set(_find_all_pcb_paths(repo_root, commit1, sub_path))
    paths2 = set(_find_all_pcb_paths(repo_root, commit2, sub_path))
    all_paths = paths1 | paths2

    if not all_paths:
        return None

    boards = []
    for rel_path in sorted(all_paths):
        filename = rel_path.split("/")[-1]
        # commit1 = newer, commit2 = older (parent)
        new_content = (
            _read_file_at_commit(repo_root, commit1, rel_path)
            if rel_path in paths1
            else None
        )
        old_content = (
            _read_file_at_commit(repo_root, commit2, rel_path)
            if rel_path in paths2
            else None
        )

        if old_content and new_content:
            diff = diff_pcb(
                old_content, new_content, parser=parser, track_net_names=track_net_names
            )
        elif new_content:
            items = list(_extract_pcb_items(new_content, parser).values())
            diff = {"added": items, "removed": [], "changed": []}
        elif old_content:
            items = list(_extract_pcb_items(old_content, parser).values())
            diff = {"added": [], "removed": items, "changed": []}
        else:
            continue

        boards.append(
            {
                "filename": filename,
                "old_content": old_content,
                "new_content": new_content,
                "diff": diff,
            }
        )

    if not boards:
        return None

    return {"commit1": commit1, "commit2": commit2, "boards": boards}
