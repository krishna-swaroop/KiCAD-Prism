"""
PCB Thumbnail Generator

Uses kicad-cli to export per-layer SVGs, then composites them into a PNG
thumbnail using cairosvg (for SVG rasterisation) and Pillow (for compositing).

Front-face layer stack (bottom -> top):
  Edge.Cuts    -- board outline; rasterised as a clip mask
  F.Cu         -- copper: gold where exposed, dark green where under soldermask
  F.Mask       -- identifies mask openings (exposed pads)
  F.Silkscreen -- silkscreen (white) on top
"""

from __future__ import annotations

import glob
import io
import logging
import math as _math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy
    from PIL.Image import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Output dimensions (16:9 matches the project card aspect-video container)
# ---------------------------------------------------------------------------
THUMBNAIL_W = 800
THUMBNAIL_H = 600

# ---------------------------------------------------------------------------
# Layers exported from kicad-cli.  Edge.Cuts is used only as a clip mask.
# Remaining entries: (kicad_layer_name, (R, G, B, alpha_0_255))
# ---------------------------------------------------------------------------
_EXPORT_LAYERS = ["Edge.Cuts", "F.Cu", "F.Mask", "F.Silkscreen"]

# ---------------------------------------------------------------------------
# Drill geometry parsed from the .kicad_pcb file
# ---------------------------------------------------------------------------


def _load_board(pcb_path: str):
    """Parse a .kicad_pcb with kiutils, tolerating the name-only net export.

    Some exports write `(net "NAME")` on pads/segments instead of the standard
    `(net <number> "NAME")`. kiutils' Net.from_sexpr does `exp[2]` and raises
    IndexError on the 2-element form, aborting the WHOLE board parse — which
    silently dropped every drill and rendered thumbnails with no holes. We
    normalise `(net "X")` -> `(net 0 "X")` in the text first (the net number is
    irrelevant to drill geometry) so kiutils parses cleanly.
    """
    import re  # noqa: PLC0415

    from kiutils.board import Board  # noqa: PLC0415
    from kiutils.utils import sexpr  # noqa: PLC0415

    text = Path(pcb_path).read_text(encoding="utf-8")
    text = re.sub(r'\(net\s+("[^"]*")\s*\)', r"(net 0 \1)", text)
    return Board.from_sexpr(sexpr.parse_sexp(text))


def _parse_drills(pcb_path: str) -> list[dict]:
    """Return a list of drill descriptors from a .kicad_pcb file.

    Each entry: {"x": float, "y": float, "r": float} in board mm coords.
    Covers through-hole pads and vias.  Returns [] on any error.
    """
    try:
        board = _load_board(pcb_path)
        drills: list[dict] = []

        # Through-hole pads
        for fp in board.footprints:
            fp_x = fp.position.X
            fp_y = fp.position.Y
            fp_angle = (fp.position.angle or 0) * _math.pi / 180
            for pad in fp.pads:
                if pad.type not in ("thru_hole", "np_thru_hole") or pad.drill is None:
                    continue
                # Rotate pad-local position by footprint angle
                px, py = pad.position.X, pad.position.Y
                rx = px * _math.cos(fp_angle) - py * _math.sin(fp_angle)
                ry = px * _math.sin(fp_angle) + py * _math.cos(fp_angle)
                drills.append(
                    {"x": fp_x + rx, "y": fp_y + ry, "r": pad.drill.diameter / 2}
                )

        # Vias
        for item in board.traceItems:
            if item.__class__.__name__ == "Via":
                drills.append(
                    {
                        "x": item.position.X,
                        "y": item.position.Y,
                        "r": item.drill / 2,
                    }
                )

        return drills
    except Exception:
        logger.exception("drill parse failed for %s", pcb_path)
        return []


def _edge_world_min(pcb_path: str) -> tuple[float, float] | None:
    """Return the (min_x, min_y) world-mm corner of the board's Edge.Cuts bbox.

    Handles every outline primitive — line, arc, circle, rect, polygon — not just
    straight segments, so rounded/curved boards resolve correctly. Returns None if
    no edge geometry is found (caller falls back to the SVG viewBox origin).
    """
    try:
        board = _load_board(pcb_path)
        xs: list[float] = []
        ys: list[float] = []

        def _pt(p: object) -> None:
            x = getattr(p, "X", None)
            y = getattr(p, "Y", None)
            if x is not None and y is not None:
                xs.append(x)
                ys.append(y)

        for s in board.graphicItems:
            if getattr(s, "layer", None) != "Edge.Cuts":
                continue
            # start/end cover lines, arcs (start/end), rects. Circles use
            # center/end. Arcs may also carry a midpoint. Polygons carry a
            # coordinate list. Grab whatever points are present; a bbox min only
            # needs extents, and arc/circle bulges beyond their control points are
            # a sub-mm rounding effect at thumbnail scale.
            for attr in ("start", "mid", "end", "center"):
                p = getattr(s, attr, None)
                if p is not None:
                    _pt(p)
            for coord_attr in ("coordinates", "points", "pts"):
                seq = getattr(s, coord_attr, None)
                if seq:
                    for p in seq:
                        _pt(p)

        if xs and ys:
            return (min(xs), min(ys))
        return None
    except Exception:
        logger.exception("edge world-min parse failed for %s", pcb_path)
        return None


def _drills_to_mask(
    drills: list[dict],
    board_origin_mm: tuple[float, float],
    board_size_mm: tuple[float, float],
    img_w: int,
    img_h: int,
) -> numpy.ndarray:
    """Rasterise drill positions into a boolean (H, W) numpy mask.

    board_origin_mm: (min_x, min_y) world mm of the board bbox top-left.
    board_size_mm:   (width, height) of the board in mm.
    cairosvg scales the SVG viewBox to output dimensions preserving aspect ratio.
    """
    import numpy as np  # noqa: PLC0415
    from PIL import Image, ImageDraw  # noqa: PLC0415

    ox, oy = board_origin_mm
    bw, bh = board_size_mm

    # cairosvg letterboxes: scale to fit, centred
    scale = min(img_w / bw, img_h / bh)
    off_x = (img_w - bw * scale) / 2
    off_y = (img_h - bh * scale) / 2

    def world_to_px(wx: float, wy: float) -> tuple[float, float]:
        return (wx - ox) * scale + off_x, (wy - oy) * scale + off_y

    img = Image.new("L", (img_w, img_h), 0)
    draw = ImageDraw.Draw(img)
    for d in drills:
        cx, cy = world_to_px(d["x"], d["y"])
        r_px = d["r"] * scale
        draw.ellipse([cx - r_px, cy - r_px, cx + r_px, cy + r_px], fill=255)
    return np.array(img) > 127


_KICAD_CLI_CANDIDATES = [
    r"C:\Program Files\KiCad\10.0\bin\kicad-cli.exe",
    r"C:\Program Files\KiCad\9.0\bin\kicad-cli.exe",
    r"C:\Program Files\KiCad\8.0\bin\kicad-cli.exe",
    "kicad-cli",
]


def _find_kicad_cli() -> str | None:
    for candidate in _KICAD_CLI_CANDIDATES:
        found = shutil.which(candidate) or (Path(candidate).is_file() and candidate)
        if found:
            return str(found)
    return None


def _run_kicad_cli(
    kicad_cli: str,
    pcb_path: str,
    out_dir: str,
    layers: list[str],
    drill_shape_opt: int = 2,
) -> None:
    cmd = [
        kicad_cli,
        "pcb",
        "export",
        "svg",
        "--output",
        out_dir,
        "--layers",
        ",".join(layers),
        "--page-size-mode",
        "2",
        "--exclude-drawing-sheet",
        "--drill-shape-opt",
        str(drill_shape_opt),
        "--mode-multi",
        pcb_path,
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=60, check=False
    )
    if result.returncode != 0:
        logger.warning("kicad-cli stderr: %s", result.stderr[:400])


def _collect_svgs(
    tmp_dir: str, board_stem: str, layer_names: list[str]
) -> dict[str, str]:
    layer_map: dict[str, str] = {}
    for name in layer_names:
        slug = name.replace(".", "_")
        candidate = os.path.join(tmp_dir, f"{board_stem}-{slug}.svg")
        if os.path.isfile(candidate):
            layer_map[name] = candidate
        else:
            matches = glob.glob(os.path.join(tmp_dir, f"*{slug}*.svg"))
            if matches:
                layer_map[name] = matches[0]
            else:
                logger.debug("No SVG found for layer %s", name)
    return layer_map


def _export_layer_svgs(pcb_path: str, tmp_dir: str) -> dict[str, str]:
    """Export per-layer SVGs. Returns a mapping of layer_name -> SVG path."""
    kicad_cli = _find_kicad_cli()
    if not kicad_cli:
        raise RuntimeError(
            "kicad-cli not found — install KiCad 8+ to generate thumbnails"
        )
    board_stem = Path(pcb_path).stem
    _run_kicad_cli(kicad_cli, pcb_path, tmp_dir, _EXPORT_LAYERS, drill_shape_opt=0)
    return _collect_svgs(tmp_dir, board_stem, _EXPORT_LAYERS)


def _rasterize(svg_path: str, img_w: int, img_h: int) -> Image:
    """Rasterize an SVG to an RGBA PIL Image at the given pixel size."""
    import cairosvg  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415

    png_bytes = cairosvg.svg2png(url=svg_path, output_width=img_w, output_height=img_h)
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def _board_mask(edge_img: Image) -> Image:
    """Return an RGBA mask where every non-transparent Edge.Cuts pixel is white+opaque.

    cairosvg renders Edge.Cuts as coloured strokes on a transparent background.
    We flood-fill the enclosed area so the mask covers the full board interior.
    """
    import numpy as np  # noqa: PLC0415
    from PIL import Image, ImageDraw  # noqa: PLC0415

    arr = np.array(edge_img)
    # Any pixel the SVG drew (alpha > 0) is an edge pixel
    edge_pixels = arr[:, :, 3] > 10

    # Build a binary image and find the bounding contour to flood-fill interior.
    # Simpler approach: use ImageDraw flood-fill from the centroid of the strokes.
    h, w = edge_pixels.shape
    stroke_mask = Image.fromarray((edge_pixels * 255).astype(np.uint8), "L")

    # Create a white board on black background, then fill enclosed area
    board_bw = Image.new("L", (w, h), 0)
    board_bw.paste(255, mask=stroke_mask)  # draw edge strokes in white

    # Flood-fill from the four image corners (outside) with grey=128, leaving
    # the board interior untouched, then invert: interior = white, outside = black.
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(board_bw, corner, 128)

    interior = np.array(board_bw)
    # Pixels that were NOT reached by the flood-fill (not 128, not 255 edge) are inside
    inside = (interior != 128).astype(np.uint8) * 255

    mask_rgba = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    mask_rgba.putalpha(Image.fromarray(inside, "L"))
    return mask_rgba


def render_thumbnail(
    pcb_path: str,
    out_path: str,
    img_w: int = THUMBNAIL_W,
    img_h: int = THUMBNAIL_H,
) -> None:
    """Generate a PCB thumbnail PNG at out_path by compositing per-layer SVGs.

    Compositing logic (per pixel, inside board outline):
      1. Board base: soldermask green
      2. Copper under mask: darker green (F.Cu pixels NOT in F.Mask)
      3. Exposed copper: gold (F.Cu pixels also in F.Mask openings)
      4. Drill holes: dark grey, punched through everything (transparent in F.Cu)
      5. Silkscreen: white on top
      6. Outside board outline: transparent -> dark background
    """
    import numpy as np  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415

    # Colors (RGBA)
    C_BOARD = np.array([30, 105, 50, 255], dtype=np.uint8)  # soldermask green
    C_CU_MASKED = np.array([22, 72, 35, 255], dtype=np.uint8)  # copper under mask
    C_CU_EXPOSED = np.array([210, 160, 40, 255], dtype=np.uint8)  # exposed pad/copper
    C_DRILL = np.array([28, 28, 28, 255], dtype=np.uint8)  # drilled hole
    C_SILK = np.array([245, 245, 245, 220], dtype=np.uint8)  # silkscreen
    C_BG = np.array([18, 18, 18, 255], dtype=np.uint8)  # image background

    with tempfile.TemporaryDirectory(prefix="prism_thumb_") as tmp:
        layer_map = _export_layer_svgs(pcb_path, tmp)

        if not layer_map:
            raise RuntimeError(f"kicad-cli produced no SVG layers for {pcb_path}")

        # --- Rasterize all needed layers ------------------------------------
        def ras_layer(name: str) -> np.ndarray | None:
            svg = layer_map.get(name)
            if not svg:
                return None
            try:
                return np.array(_rasterize(svg, img_w, img_h))
            except Exception:
                logger.exception("cairosvg failed for layer %s", name)
                return None

        edge_arr = ras_layer("Edge.Cuts")
        fcu_arr = ras_layer("F.Cu")
        mask_arr = ras_layer("F.Mask")
        silk_arr = ras_layer("F.Silkscreen")

        if edge_arr is None:
            raise RuntimeError(f"Edge.Cuts SVG not found for {pcb_path}")

        # --- Board outline mask (filled interior) ---------------------------
        try:
            edge_img = Image.fromarray(edge_arr, "RGBA")
            board_mask_img = _board_mask(edge_img)
            board_inside = np.array(board_mask_img)[:, :, 3] > 127  # bool (H, W)
        except Exception:
            logger.exception("board mask failed; using full frame")
            board_inside = np.ones((img_h, img_w), dtype=bool)

        # --- Boolean masks --------------------------------------------------
        _zero = np.zeros((img_h, img_w), dtype=bool)

        copper = (fcu_arr[:, :, 3] > 10) if fcu_arr is not None else _zero
        exposed = (mask_arr[:, :, 3] > 10) if mask_arr is not None else _zero

        # --- Drill holes from PCB file (TH pads + vias) --------------------
        # Parse board bbox from the Edge.Cuts SVG viewBox (board extents in mm,
        # relative to the kicad world origin stored in the PCB file).
        import re as _re  # noqa: PLC0415

        edge_svg_path = layer_map["Edge.Cuts"]
        with open(edge_svg_path, encoding="utf-8") as _f:
            _head = _f.read(1024)
        # Allow a leading sign / scientific notation in the viewBox numbers.
        _vb = _re.search(r'viewBox="([-0-9.eE+ ]+)"', _head)
        hole: np.ndarray = _zero
        if _vb:
            _parts = list(map(float, _vb.group(1).split()))
            if len(_parts) == 4 and _parts[2] > 0 and _parts[3] > 0:
                # The kicad-cli Edge.Cuts SVG viewBox gives the board SIZE in mm
                # reliably ("minX minY width height"), but its origin is normalised
                # to (0,0) — NOT the world origin. Drills from _parse_drills are in
                # world mm, so we still need the board's world bbox MIN. Derive it
                # robustly from every Edge.Cuts shape (lines, arcs, circles, rects,
                # polys). The previous code only inspected .start/.end (line
                # segments), so boards with arc/circle/rounded/polygon outlines got
                # an empty bbox and lost all their holes — the reported bug. If the
                # world min can't be found, fall back to the viewBox origin.
                _vw, _vh = _parts[2], _parts[3]
                try:
                    _origin = _edge_world_min(pcb_path)
                    if _origin is None:
                        _origin = (_parts[0], _parts[1])
                    _size = (_vw, _vh)
                    _drills = _parse_drills(pcb_path)
                    if _drills:
                        hole = _drills_to_mask(_drills, _origin, _size, img_w, img_h)
                except Exception:
                    logger.exception("drill mask failed; holes will be omitted")

        # --- Per-pixel composition -----------------------------------------
        # Paint order (bottom to top):
        #   1. Dark background
        #   2. Board base (soldermask green) inside outline
        #   3. Copper under soldermask (darker green)
        #   4. Exposed copper / pads (gold)
        #   5. Silkscreen (white, alpha-blended)
        #   6. Drill holes punched through everything (dark, on top)

        out = np.full((img_h, img_w, 4), C_BG, dtype=np.uint8)

        out[board_inside] = C_BOARD
        out[copper & ~exposed] = C_CU_MASKED
        out[exposed] = C_CU_EXPOSED

        # Silkscreen: alpha-blend over current composite
        if silk_arr is not None:
            silk_a = silk_arr[:, :, 3].astype(np.float32)
            silk_px = silk_a > 10
            a = silk_a[silk_px, np.newaxis] / 255.0
            out[silk_px, :3] = (
                (
                    C_SILK[:3].astype(np.float32) * a
                    + out[silk_px, :3].astype(np.float32) * (1.0 - a)
                )
                .clip(0, 255)
                .astype(np.uint8)
            )

        # Holes on top of everything — punch through board and silkscreen
        out[hole] = C_DRILL

        # Outside board: solid dark background
        out[~board_inside] = C_BG

        result = Image.fromarray(out, "RGBA").convert("RGB")
        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        result.save(out_path, "PNG", optimize=True)
        logger.info("thumbnail saved: %s (%dx%d)", out_path, img_w, img_h)


# ---------------------------------------------------------------------------
# High-level entry points called by the API
# ---------------------------------------------------------------------------


def generate_for_project(project_id: str) -> str:
    """Generate thumbnail for a single project. Returns output path."""
    from app.services import path_config_service  # noqa: PLC0415
    from app.services.workspace_service import workspace  # noqa: PLC0415

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
    """Background worker: generate (or regenerate) thumbnails for all projects."""
    from app.services.workspace_service import workspace  # noqa: PLC0415

    all_projects = workspace.get_all_projects()

    total = len(all_projects)
    job["message"] = f"Found {total} projects"
    job["percent"] = 0

    succeeded, failed = 0, 0
    for i, row in enumerate(all_projects):
        pid = row["id"]
        name = row.get("name", pid)
        logger.info("thumbnail batch: processing %s (%s)", name, pid)
        try:
            out = generate_for_project(pid)
            logger.info("thumbnail batch: OK %s", out)
            succeeded += 1
        except Exception as exc:
            logger.warning("thumbnail batch: skip %s — %s", name, exc)
            job["logs"].append(f"[SKIP] {name}: {exc}")
            failed += 1
        job["percent"] = int((i + 1) / total * 100)
        job["message"] = f"Processed {i + 1}/{total} — {succeeded} ok, {failed} skipped"

    job["status"] = "done"
    job["message"] = f"Done — {succeeded} generated, {failed} skipped"
    job["percent"] = 100
    logger.info("thumbnail batch finished: %d generated, %d skipped", succeeded, failed)
