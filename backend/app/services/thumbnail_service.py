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
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
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


def _export_layer_svgs(
    pcb_path: str, tmp_dir: str
) -> tuple[dict[str, str], str | None]:
    """Export per-layer SVGs.

    Returns (layer_map, fcu_no_drill_path) where fcu_no_drill_path is the
    F.Cu SVG exported without drill markers (drill-shape-opt 0), used to
    detect drill hole positions by diffing against the default export.
    """
    kicad_cli = _find_kicad_cli()
    if not kicad_cli:
        raise RuntimeError(
            "kicad-cli not found — install KiCad 8+ to generate thumbnails"
        )

    board_stem = Path(pcb_path).stem

    # Main export: all layers with drill markers (default drill-shape-opt 2)
    main_dir = os.path.join(tmp_dir, "main")
    os.makedirs(main_dir)
    _run_kicad_cli(kicad_cli, pcb_path, main_dir, _EXPORT_LAYERS, drill_shape_opt=2)
    layer_map = _collect_svgs(main_dir, board_stem, _EXPORT_LAYERS)

    # Second F.Cu export without drill markers — diff gives us drill hole positions
    drill_dir = os.path.join(tmp_dir, "nodrill")
    os.makedirs(drill_dir)
    _run_kicad_cli(kicad_cli, pcb_path, drill_dir, ["F.Cu"], drill_shape_opt=0)
    no_drill_map = _collect_svgs(drill_dir, board_stem, ["F.Cu"])
    fcu_no_drill = no_drill_map.get("F.Cu")

    return layer_map, fcu_no_drill


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
        layer_map, fcu_no_drill_svg = _export_layer_svgs(pcb_path, tmp)

        if not layer_map:
            raise RuntimeError(f"kicad-cli produced no SVG layers for {pcb_path}")

        # --- Rasterize all needed layers ------------------------------------
        def ras(path: str) -> np.ndarray | None:
            try:
                img = _rasterize(path, img_w, img_h)
                return np.array(img)
            except Exception:
                logger.exception("cairosvg failed rasterizing %s", path)
                return None

        def ras_layer(name: str) -> np.ndarray | None:
            svg = layer_map.get(name)
            return ras(svg) if svg else None

        edge_arr = ras_layer("Edge.Cuts")
        fcu_arr = ras_layer("F.Cu")  # includes drill markers (opt 2)
        mask_arr = ras_layer("F.Mask")
        silk_arr = ras_layer("F.Silkscreen")
        fcu_nd = ras(fcu_no_drill_svg) if fcu_no_drill_svg else None  # no drill markers

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

        # Copper without drill markers (clean annular rings and fills)
        copper = (
            (fcu_nd[:, :, 3] > 10)
            if fcu_nd is not None
            else ((fcu_arr[:, :, 3] > 10) if fcu_arr is not None else _zero)
        )

        # F.Mask openings = exposed pads / bare copper areas
        exposed = (mask_arr[:, :, 3] > 10) if mask_arr is not None else _zero

        # Drill holes: pixels present in F.Cu(opt2) but absent in F.Cu(opt0).
        # These are the drill marker shapes kicad-cli draws on top of the copper.
        if fcu_arr is not None and fcu_nd is not None:
            hole = (fcu_arr[:, :, 3] > 10) & ~(fcu_nd[:, :, 3] > 10)
        else:
            # Fallback: zero in F.Cu inside an exposed pad region
            hole = board_inside & ~copper & exposed

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
