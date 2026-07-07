"""
PCB Thumbnail Generator

Parses a .kicad_pcb file and renders a PNG thumbnail of the front side using
Pillow. Four visual layers are composited in order:

  1. Board outline (edge cuts) — used to clip/fill the board shape
  2. F.Cu traces and zones — buried copper under soldermask
  3. Pads (SMD + TH) — exposed copper (soldermask openings)
  4. F.SilkS — silkscreen markings

Colors are placeholders; replace the COLOR_* constants to taste.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

from app.services.sch_diff_service import _get, _get_all, _parse_sexp

# ---------------------------------------------------------------------------
# Placeholder colors  (R, G, B, A)
# ---------------------------------------------------------------------------
COLOR_BACKGROUND = (30, 30, 30, 255)  # dark background outside board
COLOR_BOARD = (35, 95, 50, 255)  # soldermask green
COLOR_COPPER_BURIED = (45, 110, 60, 255)  # copper under soldermask (darker green)
COLOR_COPPER_EXPOSED = (180, 160, 100, 255)  # bare copper / pad (gold-ish grey)
COLOR_SILKSCREEN = (240, 240, 240, 255)  # white silkscreen

# Output size in pixels (16:9 to match the project card aspect-video container)
THUMBNAIL_W = 640
THUMBNAIL_H = 360
# Margin as fraction of board dimension
MARGIN = 0.05


# ---------------------------------------------------------------------------
# S-expression helpers (reuse from sch_diff_service via pcb_diff_service pattern)
# ---------------------------------------------------------------------------


def _stroke_width(node: list, default: float = 0.12) -> float:
    """Extract line width from a node, handling both KiCad 6 (width ...) and
    KiCad 7+ (stroke (width ...)) formats."""
    stroke = _get(node, "stroke")
    if stroke:
        wn = _get(stroke, "width")
        if wn and len(wn) > 1:
            try:
                return float(wn[1])
            except (ValueError, TypeError):
                pass
    wn = _get(node, "width")
    if wn and len(wn) > 1:
        try:
            return float(wn[1])
        except (ValueError, TypeError):
            pass
    return default


def _xy(node: list) -> tuple[float, float]:
    if node and len(node) >= 3:
        try:
            return float(node[1]), float(node[2])
        except (ValueError, TypeError):
            pass
    return 0.0, 0.0


def _at(node: list) -> tuple[float, float, float]:
    at = _get(node, "at")
    if at and len(at) >= 3:
        try:
            x, y = float(at[1]), float(at[2])
            rot = float(at[3]) if len(at) > 3 else 0.0
            return x, y, rot
        except (ValueError, TypeError):
            pass
    return 0.0, 0.0, 0.0


def _rotate(
    px: float, py: float, ox: float, oy: float, deg: float
) -> tuple[float, float]:
    a = math.radians(-deg)
    ca, sa = math.cos(a), math.sin(a)
    lx, ly = px - ox, py - oy
    return ox + lx * ca - ly * sa, oy + lx * sa + ly * ca


def _local_to_board(
    lx: float, ly: float, ox: float, oy: float, deg: float
) -> tuple[float, float]:
    """Transform a footprint-local point to board coordinates."""
    a = math.radians(-deg)
    ca, sa = math.cos(a), math.sin(a)
    return ox + lx * ca - ly * sa, oy + lx * sa + ly * ca


# ---------------------------------------------------------------------------
# Geometry extraction from parsed s-expression tree
# ---------------------------------------------------------------------------


def _edge_cuts(tree: list) -> list[dict]:
    """All graphical items on Edge.Cuts."""
    items = []
    for kind in ("gr_line", "gr_arc", "gr_rect", "gr_circle", "gr_poly"):
        for node in _get_all(tree, kind):
            layer_node = _get(node, "layer")
            layer = layer_node[1] if layer_node and len(layer_node) > 1 else ""
            if layer != "Edge.Cuts":
                continue
            items.append({"kind": kind, "node": node})
    return items


def _board_bbox(edge_items: list[dict]) -> tuple[float, float, float, float] | None:
    """Compute bounding box of edge cuts geometry (mm)."""
    xs, ys = [], []
    for item in edge_items:
        kind, node = item["kind"], item["node"]
        if kind in ("gr_line", "gr_rect"):
            sx, sy = _xy(_get(node, "start"))
            ex, ey = _xy(_get(node, "end"))
            xs += [sx, ex]
            ys += [sy, ey]
        elif kind == "gr_arc":
            sx, sy = _xy(_get(node, "start"))
            mx, my = _xy(_get(node, "mid"))
            ex, ey = _xy(_get(node, "end"))
            xs += [sx, mx, ex]
            ys += [sy, my, ey]
        elif kind == "gr_circle":
            cx, cy = _xy(_get(node, "center"))
            ex, ey = _xy(_get(node, "end"))
            r = math.hypot(ex - cx, ey - cy)
            xs += [cx - r, cx + r]
            ys += [cy - r, cy + r]
        elif kind == "gr_poly":
            pts = _get(node, "pts")
            if pts:
                for xy in _get_all(pts, "xy"):
                    if len(xy) > 2:
                        xs.append(float(xy[1]))
                        ys.append(float(xy[2]))
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _segments_and_arcs(tree: list, layer: str) -> list[dict]:
    out = []
    for node in _get_all(tree, "segment"):
        ln = _get(node, "layer")
        if ln and len(ln) > 1 and ln[1] == layer:
            out.append(
                {"kind": "segment", "node": node, "width": _stroke_width(node, 0.1)}
            )
    for node in _get_all(tree, "arc"):
        ln = _get(node, "layer")
        if ln and len(ln) > 1 and ln[1] == layer:
            out.append({"kind": "arc", "node": node, "width": _stroke_width(node, 0.1)})
    return out


def _zones(tree: list, layer: str) -> list[list[tuple[float, float]]]:
    polys = []
    for node in _get_all(tree, "zone"):
        ln = _get(node, "layer")
        if not (ln and len(ln) > 1 and ln[1] == layer):
            continue
        polygon = _get(node, "polygon")
        if not polygon:
            continue
        pts_node = _get(polygon, "pts")
        if not pts_node:
            continue
        pts = [
            (float(xy[1]), float(xy[2]))
            for xy in _get_all(pts_node, "xy")
            if len(xy) > 2
        ]
        if pts:
            polys.append(pts)
    return polys


def _fp_silkscreen_lines(tree: list) -> list[dict]:
    """fp_line / fp_rect on F.SilkS, transformed to board space."""
    out = []
    for fp in _get_all(tree, "footprint"):
        ox, oy, rot = _at(fp)
        for kind in ("fp_line", "fp_rect", "fp_circle"):
            for node in _get_all(fp, kind):
                ln = _get(node, "layer")
                layer = ln[1] if ln and len(ln) > 1 else ""
                if layer != "F.SilkS":
                    continue
                w = _stroke_width(node, 0.12)
                if kind == "fp_circle":
                    cn = _get(node, "center")
                    en = _get(node, "end")
                    if cn and en:
                        cx, cy = _local_to_board(
                            float(cn[1]), float(cn[2]), ox, oy, rot
                        )
                        ex, ey = _local_to_board(
                            float(en[1]), float(en[2]), ox, oy, rot
                        )
                        out.append(
                            {
                                "kind": "circle",
                                "cx": cx,
                                "cy": cy,
                                "ex": ex,
                                "ey": ey,
                                "width": w,
                            }
                        )
                else:
                    sn = _get(node, "start")
                    en = _get(node, "end")
                    if sn and en:
                        sx, sy = _local_to_board(
                            float(sn[1]), float(sn[2]), ox, oy, rot
                        )
                        ex, ey = _local_to_board(
                            float(en[1]), float(en[2]), ox, oy, rot
                        )
                        out.append(
                            {
                                "kind": "line",
                                "sx": sx,
                                "sy": sy,
                                "ex": ex,
                                "ey": ey,
                                "width": w,
                            }
                        )
    # Also board-level gr_line / gr_rect on F.SilkS
    for kind in ("gr_line", "gr_rect"):
        for node in _get_all(tree, kind):
            ln = _get(node, "layer")
            if not (ln and len(ln) > 1 and ln[1] == "F.SilkS"):
                continue
            sn = _get(node, "start")
            en = _get(node, "end")
            if sn and en:
                out.append(
                    {
                        "kind": "line",
                        "sx": float(sn[1]),
                        "sy": float(sn[2]),
                        "ex": float(en[1]),
                        "ey": float(en[2]),
                        "width": _stroke_width(node, 0.12),
                    }
                )
    return out


def _pads(tree: list) -> list[dict]:
    """All pads on F.Cu (SMD or TH) — these are soldermask openings."""
    out = []
    for fp in _get_all(tree, "footprint"):
        ox, oy, rot = _at(fp)
        for pad in _get_all(fp, "pad"):
            # Check pad layers include F.Cu
            layers_node = _get(pad, "layers")
            if not layers_node:
                continue
            pad_layers = [
                str(layer) for layer in layers_node[1:] if isinstance(layer, str)
            ]
            if "F.Cu" not in pad_layers and "*.Cu" not in pad_layers:
                continue
            at_node = _get(pad, "at")
            if not at_node or len(at_node) < 3:
                continue
            px, py = float(at_node[1]), float(at_node[2])
            pad_rot = float(at_node[3]) if len(at_node) > 3 else 0.0
            total_rot = rot + pad_rot
            bx, by = _rotate(px, py, 0.0, 0.0, rot)
            bx += ox
            by += oy

            size_node = _get(pad, "size")
            if not size_node or len(size_node) < 3:
                continue
            sw, sh = float(size_node[1]), float(size_node[2])

            shape_node = pad[2] if len(pad) > 2 and isinstance(pad[2], str) else None
            pad_type = pad[1] if len(pad) > 1 and isinstance(pad[1], str) else ""

            # roundrect corner ratio
            rr_node = _get(pad, "roundrect_rratio")
            rr = float(rr_node[1]) if rr_node and len(rr_node) > 1 else 0.0

            out.append(
                {
                    "x": bx,
                    "y": by,
                    "w": sw,
                    "h": sh,
                    "rot": total_rot,
                    "shape": shape_node,
                    "type": pad_type,
                    "rr": rr,
                }
            )
    return out


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _make_transform(
    bbox: tuple[float, float, float, float],
    img_w: int,
    img_h: int,
    margin: float,
) -> tuple[float, float, float]:
    """Return (scale, tx, ty) mapping mm board coords → pixel coords."""
    min_x, min_y, max_x, max_y = bbox
    bw = max_x - min_x or 1.0
    bh = max_y - min_y or 1.0
    scale = min(img_w / (bw * (1 + 2 * margin)), img_h / (bh * (1 + 2 * margin)))
    tx = (img_w - bw * scale) / 2 - min_x * scale
    ty = (img_h - bh * scale) / 2 - min_y * scale
    return scale, tx, ty


def _mm_to_px(
    x: float, y: float, scale: float, tx: float, ty: float
) -> tuple[int, int]:
    return int(x * scale + tx), int(y * scale + ty)


def _w_px(w_mm: float, scale: float) -> int:
    return max(1, int(w_mm * scale))


def render_thumbnail(
    pcb_path: str,
    out_path: str,
    img_w: int = THUMBNAIL_W,
    img_h: int = THUMBNAIL_H,
) -> None:
    from PIL import Image, ImageDraw

    text = Path(pcb_path).read_text(encoding="utf-8", errors="replace")
    tree = _parse_sexp(text)

    edge_items = _edge_cuts(tree)
    bbox = _board_bbox(edge_items)
    if not bbox:
        raise ValueError("No Edge.Cuts geometry found — cannot determine board outline")

    min_x, min_y, max_x, max_y = bbox
    scale, tx, ty = _make_transform(bbox, img_w, img_h, MARGIN)

    img = Image.new("RGBA", (img_w, img_h), COLOR_BACKGROUND)
    draw = ImageDraw.Draw(img)

    # --- 1. Board fill (soldermask) ---
    # Draw a filled board shape from edge cuts
    board_poly: list[tuple[int, int]] = []
    # Collect outline polygon from gr_poly or approximate rect from bbox
    for item in edge_items:
        if item["kind"] == "gr_poly":
            pts_node = _get(item["node"], "pts")
            if pts_node:
                pts = [
                    _mm_to_px(float(xy[1]), float(xy[2]), scale, tx, ty)
                    for xy in _get_all(pts_node, "xy")
                    if len(xy) > 2
                ]
                if pts:
                    board_poly = pts
                    break

    if board_poly:
        draw.polygon(board_poly, fill=COLOR_BOARD)
    else:
        # Fallback: filled rectangle from bbox
        x0, y0 = _mm_to_px(min_x, min_y, scale, tx, ty)
        x1, y1 = _mm_to_px(max_x, max_y, scale, tx, ty)
        draw.rectangle([x0, y0, x1, y1], fill=COLOR_BOARD)
        # Draw edge cut lines on top of fill
        for item in edge_items:
            node = item["node"]
            if item["kind"] == "gr_line":
                sx, sy = _xy(_get(node, "start"))
                ex, ey = _xy(_get(node, "end"))
                draw.line(
                    [
                        _mm_to_px(sx, sy, scale, tx, ty),
                        _mm_to_px(ex, ey, scale, tx, ty),
                    ],
                    fill=COLOR_BOARD,
                    width=max(1, _w_px(0.1, scale)),
                )
            elif item["kind"] == "gr_arc":
                # approximate arc as line to start/end
                sx, sy = _xy(_get(node, "start"))
                ex, ey = _xy(_get(node, "end"))
                draw.line(
                    [
                        _mm_to_px(sx, sy, scale, tx, ty),
                        _mm_to_px(ex, ey, scale, tx, ty),
                    ],
                    fill=COLOR_BOARD,
                    width=max(1, _w_px(0.1, scale)),
                )

    # --- 2. F.Cu zones (buried copper) ---
    for poly_pts in _zones(tree, "F.Cu"):
        px_pts = [_mm_to_px(x, y, scale, tx, ty) for x, y in poly_pts]
        if len(px_pts) >= 3:
            draw.polygon(px_pts, fill=COLOR_COPPER_BURIED)

    # --- 3. F.Cu segments and arcs (traces) ---
    for item in _segments_and_arcs(tree, "F.Cu"):
        node, w = item["node"], item["width"]
        lw = max(1, _w_px(w, scale))
        if item["kind"] == "segment":
            sx, sy = _xy(_get(node, "start"))
            ex, ey = _xy(_get(node, "end"))
            draw.line(
                [_mm_to_px(sx, sy, scale, tx, ty), _mm_to_px(ex, ey, scale, tx, ty)],
                fill=COLOR_COPPER_BURIED,
                width=lw,
            )
        elif item["kind"] == "arc":
            sx, sy = _xy(_get(node, "start"))
            ex, ey = _xy(_get(node, "end"))
            draw.line(
                [_mm_to_px(sx, sy, scale, tx, ty), _mm_to_px(ex, ey, scale, tx, ty)],
                fill=COLOR_COPPER_BURIED,
                width=lw,
            )

    # --- 4. Pads (exposed copper / soldermask openings) ---
    for pad in _pads(tree):
        bx, by = pad["x"], pad["y"]
        sw, sh = pad["w"] * scale, pad["h"] * scale
        cx, cy = bx * scale + tx, by * scale + ty
        shape = pad.get("shape") or "rect"
        rot = pad.get("rot", 0.0)

        if shape in ("circle", "oval") and abs(sw - sh) < 0.5:
            r = sw / 2
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COLOR_COPPER_EXPOSED)
        else:
            # Rotated rectangle approximation via polygon
            hw, hh = sw / 2, sh / 2
            corners_local = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
            a = math.radians(-rot)
            ca, sa = math.cos(a), math.sin(a)
            corners = [
                (cx + lx * ca - ly * sa, cy + lx * sa + ly * ca)
                for lx, ly in corners_local
            ]
            draw.polygon(corners, fill=COLOR_COPPER_EXPOSED)

    # --- 5. F.SilkS ---
    for item in _fp_silkscreen_lines(tree):
        if item["kind"] == "line":
            lw = max(1, _w_px(item["width"], scale))
            draw.line(
                [
                    _mm_to_px(item["sx"], item["sy"], scale, tx, ty),
                    _mm_to_px(item["ex"], item["ey"], scale, tx, ty),
                ],
                fill=COLOR_SILKSCREEN,
                width=lw,
            )
        elif item["kind"] == "circle":
            lw = max(1, _w_px(item["width"], scale))
            cx, cy = item["cx"] * scale + tx, item["cy"] * scale + ty
            ex, ey = item["ex"] * scale + tx, item["ey"] * scale + ty
            r = math.hypot(ex - cx, ey - cy)
            draw.ellipse(
                [cx - r, cy - r, cx + r, cy + r], outline=COLOR_SILKSCREEN, width=lw
            )

    # Save as RGB PNG (drop alpha for smaller file)
    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    img.convert("RGB").save(out_path, "PNG", optimize=True)


# ---------------------------------------------------------------------------
# High-level entry points called by the API
# ---------------------------------------------------------------------------


def generate_for_project(project_id: str) -> str:
    """Generate thumbnail for a single project. Returns output path."""
    from app.services import path_config_service
    from app.services.workspace_service import workspace

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError(f"Project {project_id} not found")

    project_path = row["path"]
    project_name = row["name"]

    resolved = path_config_service.resolve_paths(project_path)
    pcb_path = resolved.pcb
    if not pcb_path or not os.path.exists(pcb_path):
        raise FileNotFoundError(f"No .kicad_pcb file found for project {project_id}")

    thumb_dir = os.path.join(project_path, "assets", "thumbnail")
    out_path = os.path.join(thumb_dir, f"{project_name}.png")

    render_thumbnail(pcb_path, out_path)

    rel = os.path.relpath(out_path, project_path).replace("\\", "/")
    workspace.update_project(project_id, thumbnail_rel=rel)

    return out_path


def generate_missing(job: dict) -> None:
    """Background worker: generate thumbnails for all projects without one."""
    from app.services.workspace_service import workspace

    all_projects = workspace.get_all_projects()
    without_thumb = [p for p in all_projects if not p.get("thumbnail_rel")]

    total = len(without_thumb)
    job["message"] = f"Found {total} projects without thumbnails"
    job["percent"] = 0

    succeeded, failed = 0, 0
    for i, row in enumerate(without_thumb):
        pid = row["id"]
        name = row.get("name", pid)
        print(f"[thumbnail] Processing {name} ({pid}) path={row.get('path')}")
        try:
            out = generate_for_project(pid)
            print(f"[thumbnail] OK: {out}")
            succeeded += 1
        except Exception as exc:
            print(f"[thumbnail] SKIP {name}: {exc}")
            job["logs"].append(f"[SKIP] {name}: {exc}")
            failed += 1
        job["percent"] = int((i + 1) / total * 100)
        job["message"] = f"Processed {i + 1}/{total} — {succeeded} ok, {failed} skipped"

    job["status"] = "done"
    job["message"] = f"Done — {succeeded} generated, {failed} skipped"
    job["percent"] = 100
    print(f"[thumbnail] Finished: {succeeded} generated, {failed} skipped")
