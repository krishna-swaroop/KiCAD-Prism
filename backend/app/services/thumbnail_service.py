"""
PCB Thumbnail Generator

Uses kicad-cli to export per-layer SVGs, then composites them into a PNG
thumbnail using cairosvg (for SVG rasterisation) and Pillow (for compositing).

Layer stack (bottom → top):
  Edge.Cuts    — board outline clipping / fill
  B.Cu         — back copper (blue tint)
  F.Cu         — front copper (gold tint)
  B.Silkscreen — back silkscreen (light grey, low alpha)
  F.Silkscreen — front silkscreen (white)
  F.Fab        — front fab layer (optional, faint green)
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
# Layer stack: (kicad_layer_name, (R, G, B, alpha_0_255) | None)
# None means "use as board fill / no tint — take SVG colors as-is"
# ---------------------------------------------------------------------------
_LAYER_STACK: list[tuple[str, tuple[int, int, int, int] | None]] = [
    # Board base fill is drawn separately (COLOR_BOARD below)
    ("Edge.Cuts", None),  # outline; not composited, used only for board shape
    ("B.Cu", (80, 130, 210, 200)),  # back copper — blue
    ("F.Cu", (180, 130, 50, 220)),  # front copper — gold
    ("B.Silkscreen", (200, 200, 200, 100)),  # back silk — grey, faint
    ("F.Silkscreen", (245, 245, 245, 210)),  # front silk — white
    ("F.Fab", (80, 180, 80, 60)),  # fab layer — very faint green
]

COLOR_BOARD = (35, 95, 50, 255)  # PCB soldermask green

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


def _export_layer_svgs(pcb_path: str, tmp_dir: str) -> dict[str, str]:
    """Run kicad-cli to export all thumbnail layers as SVGs into tmp_dir.

    Returns a mapping of layer_name → absolute SVG path.
    """
    kicad_cli = _find_kicad_cli()
    if not kicad_cli:
        raise RuntimeError(
            "kicad-cli not found — install KiCad 8+ to generate thumbnails"
        )

    layer_names = [layer for layer, _ in _LAYER_STACK]
    layer_arg = ",".join(layer_names)

    cmd = [
        kicad_cli,
        "pcb",
        "export",
        "svg",
        "--output",
        tmp_dir,
        "--layers",
        layer_arg,
        "--page-size-mode",
        "2",  # board area only
        "--exclude-drawing-sheet",
        "--mode-multi",  # one file per layer
        pcb_path,
    ]
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=60, check=False
    )
    if result.returncode != 0:
        logger.warning("kicad-cli pcb export svg stderr: %s", result.stderr[:400])

    # kicad-cli names files: <board_stem>-<Layer_Name_with_dots_as_underscores>.svg
    board_stem = Path(pcb_path).stem
    layer_map: dict[str, str] = {}
    for layer_name, _ in _LAYER_STACK:
        slug = layer_name.replace(".", "_")
        candidate = os.path.join(tmp_dir, f"{board_stem}-{slug}.svg")
        if os.path.isfile(candidate):
            layer_map[layer_name] = candidate
        else:
            # Fallback: search for any file matching the slug
            matches = glob.glob(os.path.join(tmp_dir, f"*{slug}*.svg"))
            if matches:
                layer_map[layer_name] = matches[0]
            else:
                logger.debug("No SVG found for layer %s", layer_name)

    return layer_map


def _recolor_layer(layer_img: Image, tint: tuple[int, int, int, int]) -> Image:
    """Replace all non-transparent pixels with tint color, preserving alpha shape."""
    import numpy as np  # noqa: PLC0415

    arr = np.array(layer_img, dtype=np.uint16)  # shape (H, W, 4)
    alpha = arr[:, :, 3]  # original alpha channel
    r, g, b, a_target = tint

    out = np.zeros_like(arr)
    out[:, :, 0] = r
    out[:, :, 1] = g
    out[:, :, 2] = b
    # Scale original alpha by target alpha
    out[:, :, 3] = (alpha * a_target // 255).astype(np.uint16)

    from PIL import Image  # noqa: PLC0415

    return Image.fromarray(out.astype(np.uint8), "RGBA")


def render_thumbnail(
    pcb_path: str,
    out_path: str,
    img_w: int = THUMBNAIL_W,
    img_h: int = THUMBNAIL_H,
) -> None:
    """Generate a PCB thumbnail PNG at out_path by compositing per-layer SVGs."""
    import cairosvg  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415

    with tempfile.TemporaryDirectory(prefix="prism_thumb_") as tmp:
        layer_map = _export_layer_svgs(pcb_path, tmp)

        if not layer_map:
            raise RuntimeError(f"kicad-cli produced no SVG layers for {pcb_path}")

        # Board background fill
        composite = Image.new("RGBA", (img_w, img_h), COLOR_BOARD)

        for layer_name, tint in _LAYER_STACK:
            if layer_name == "Edge.Cuts":
                # Edge cuts SVG contains the board outline in the KiCad theme color.
                # We skip compositing it — the board shape comes from the background fill.
                # If we wanted to draw the edge outline we could, but the fill already
                # gives a clean board silhouette.
                continue

            svg_path = layer_map.get(layer_name)
            if not svg_path:
                continue

            try:
                png_bytes = cairosvg.svg2png(
                    url=svg_path,
                    output_width=img_w,
                    output_height=img_h,
                )
            except Exception:
                logger.exception("cairosvg failed for layer %s", layer_name)
                continue

            layer_img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")

            if tint is not None:
                layer_img = _recolor_layer(layer_img, tint)

            composite = Image.alpha_composite(composite, layer_img)

        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        composite.convert("RGB").save(out_path, "PNG", optimize=True)
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
