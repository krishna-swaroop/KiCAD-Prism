"""
Local thumbnail generator using kicad-cli + Chrome headless.

Exports each PCB layer as a separate SVG, then composites them in the correct
visual order with proper colors into a single HTML page, and screenshots it
with Chrome headless.

Layer compositing order (bottom to top):
  1. Board fill (green soldermask) — filled with the Edge.Cuts clipPath
  2. F.Cu (darker green) — buried copper under soldermask
  3. F.Mask openings (gold) — exposed copper where soldermask is absent
  4. F.SilkS (white) — silkscreen on top

Writes PNGs to data/projects/.kicad-prism/thumbnails/{project_id}.png
and updates the workspace SQLite DB (no API/auth needed).

Usage:
    python scripts/generate_thumbnails_local.py [--projects-root ./data/projects]
    python scripts/generate_thumbnails_local.py --force
    python scripts/generate_thumbnails_local.py --id prj_abc123
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

KICAD_CLI = r"C:\Program Files\KiCad\8.0\bin\kicad-cli.exe"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# Layers exported separately for correct compositing
LAYER_NAMES = ["Edge.Cuts", "F.Cu", "F.Mask", "F.SilkS"]

# Output image size (16:9 to match the project card)
IMG_W, IMG_H = 640, 360

# Color palette
COLOR_OUTSIDE = "#1e1e1e"  # background outside board
COLOR_SOLDERMASK = "#235f32"  # green soldermask (board fill)
COLOR_COPPER_BURIED = "#2d7040"  # copper under soldermask (darker green)
COLOR_COPPER_EXPOSED = "#c8a84b"  # bare copper / pads (gold)
COLOR_SILKSCREEN = "#f0f0f0"  # white silkscreen

DB_RELATIVE = ".kicad-prism/prism.sqlite3"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


@contextmanager
def open_db(db_path: Path):
    conn = sqlite3.connect(str(db_path), timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def get_projects(db_path: Path, projects_root: Path) -> list[dict]:
    with open_db(db_path) as conn:
        rows = conn.execute(
            """SELECT p.id, p.name, p.relative_path, p.thumbnail_rel,
                      r.clone_path AS repo_clone_path
               FROM ws_projects p JOIN ws_repositories r ON p.repo_id = r.id"""
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        clone = d.pop("repo_clone_path") or ""
        rel = d.get("relative_path") or "."
        clone_abs = clone if os.path.isabs(clone) else str(projects_root / clone)
        d["path"] = clone_abs if rel == "." else os.path.join(clone_abs, rel)
        result.append(d)
    return result


def set_thumbnail_rel(db_path: Path, project_id: str, rel: str | None) -> None:
    with open_db(db_path) as conn:
        conn.execute(
            "UPDATE ws_projects SET thumbnail_rel = ? WHERE id = ?",
            (rel, project_id),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# PCB helpers
# ---------------------------------------------------------------------------


def find_pcb(project_path: str) -> Path | None:
    root = Path(project_path)
    pcbs = sorted(root.rglob("*.kicad_pcb"))
    return pcbs[0] if pcbs else None


def export_layer_svg(pcb: Path, layer: str, out_dir: Path) -> Path | None:
    safe = layer.replace(".", "_")
    svg_out = out_dir / f"{safe}.svg"
    r = subprocess.run(
        [
            KICAD_CLI,
            "pcb",
            "export",
            "svg",
            "--layers",
            layer,
            "--page-size-mode",
            "2",  # board area only — no frame/title block
            "--exclude-drawing-sheet",
            "-o",
            str(svg_out),
            str(pcb),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if r.returncode != 0:
        print(f"    kicad-cli error ({layer}): {r.stderr.strip()}")
        return None
    return svg_out if svg_out.exists() else None


def extract_viewbox(svg_text: str) -> tuple[float, float]:
    """Return (width_mm, height_mm) from SVG viewBox."""
    m = re.search(r'viewBox="([^"]+)"', svg_text)
    if m:
        parts = m.group(1).split()
        if len(parts) == 4:
            return float(parts[2]), float(parts[3])
    return 84.0, 71.0


def extract_inner_g(svg_text: str) -> str:
    """Return the content of the outermost <svg> element (everything inside the root tag)."""
    m = re.search(r"<svg[^>]*>(.*)</svg>", svg_text, re.DOTALL)
    return m.group(1).strip() if m else ""


def _chain_segments(paths_d: list[str]) -> str:
    """
    Given a list of SVG path `d` strings that are open line segments forming a
    closed board outline, chain them into a single closed polygon path.
    Falls back to the bounding box if chaining fails.
    """

    # Parse each path into a list of (x, y) points
    def parse_pts(d: str) -> list[tuple[float, float]]:
        coords = re.findall(r"[-+]?[0-9]*\.?[0-9]+", d)
        pts = []
        for i in range(0, len(coords) - 1, 2):
            pts.append((float(coords[i]), float(coords[i + 1])))
        return pts

    segments = [parse_pts(d) for d in paths_d if parse_pts(d)]
    if not segments:
        return ""

    # Greedily chain segments by matching endpoints (tolerance 0.01 mm)
    TOL = 0.01
    chain: list[tuple[float, float]] = list(segments[0])
    remaining = segments[1:]
    for _ in range(len(remaining) * len(remaining) + 1):
        if not remaining:
            break
        matched = False
        tail = chain[-1]
        for i, seg in enumerate(remaining):
            if abs(seg[0][0] - tail[0]) < TOL and abs(seg[0][1] - tail[1]) < TOL:
                chain.extend(seg[1:])
                remaining.pop(i)
                matched = True
                break
            if abs(seg[-1][0] - tail[0]) < TOL and abs(seg[-1][1] - tail[1]) < TOL:
                chain.extend(reversed(seg[:-1]))
                remaining.pop(i)
                matched = True
                break
        if not matched:
            break  # non-contiguous — just use what we have

    if len(chain) < 3:
        return ""
    pts_str = " ".join(f"{x:.4f},{y:.4f}" for x, y in chain)
    return f'<polygon points="{pts_str}"/>'


def extract_clip_shapes(edge_svg: str) -> str:
    """Return SVG shape(s) from Edge.Cuts for use inside a <clipPath>.

    Handles three cases:
      1. Single closed path (rectangle / polygon) → use directly
      2. Multiple open line segments → chain into a closed polygon
      3. Fallback → bounding-box rect of the viewBox
    """
    inner = extract_inner_g(edge_svg)

    # Collect all path d= values
    path_ds = re.findall(r'<path[^>]*\bd="([^"]+)"', inner)

    if len(path_ds) == 1:
        # Already a single path — use it as-is
        m = re.search(r"<path[^>]*/>", inner) or re.search(r"<path[^>]*>", inner)
        if m:
            return m.group(0)

    if len(path_ds) > 1:
        # Multiple segments — try to chain them
        poly = _chain_segments(path_ds)
        if poly:
            return poly

    # Fallback: rect/circle/polygon elements
    shapes = re.findall(r"<(?:rect|circle|polygon|ellipse)[^>]*/>", inner)
    if shapes:
        return "\n".join(shapes)

    # Last resort: cover entire viewBox
    vb = re.search(r'viewBox="[0-9. ]+ ([0-9.]+) ([0-9.]+)"', edge_svg)
    if vb:
        return f'<rect x="0" y="0" width="{vb.group(1)}" height="{vb.group(2)}"/>'
    return '<rect x="0" y="0" width="9999" height="9999"/>'


def recolor_svg_content(
    content: str, old_colors: list[str], new_color: str, opacity: float = 1.0
) -> str:
    """Replace all occurrences of old_colors with new_color in inline SVG styles."""
    result = content
    for old in old_colors:
        result = result.replace(old, new_color)
    # Also adjust opacity if needed
    if opacity < 1.0:
        result = re.sub(
            r"(fill-opacity|stroke-opacity):[0-9.]+",
            lambda m: m.group(0).split(":")[0] + f":{opacity:.4f}",
            result,
        )
    return result


# ---------------------------------------------------------------------------
# Composite render
# ---------------------------------------------------------------------------


def build_html(layer_svgs: dict[str, str | None], vb_w: float, vb_h: float) -> str:
    """
    Build HTML that composites PCB layers in correct visual order.

    layer_svgs: dict mapping layer name -> svg file text (or None if missing)
    """
    margin = 0.05
    scale = min(IMG_W / (vb_w * (1 + 2 * margin)), IMG_H / (vb_h * (1 + 2 * margin)))
    bw = vb_w * scale
    bh = vb_h * scale

    # Build clip path from Edge.Cuts — collect all shape elements
    edge_text = layer_svgs.get("Edge.Cuts") or ""
    clip_shapes = extract_clip_shapes(edge_text)

    # Build per-layer SVG <g> blocks, recoloring any known KiCad color to our palette.
    # recolor_svg_content does case-insensitive replacement via .upper() normalisation.
    def layer_g(layer_name: str, old_colors: list[str], new_color: str) -> str:
        text = layer_svgs.get(layer_name) or ""
        if not text:
            return ""
        inner = extract_inner_g(text)
        inner = recolor_svg_content(inner, old_colors, new_color)
        inner = re.sub(r"fill-opacity:[0-9.]+", "fill-opacity:1.0000", inner)
        return inner

    # F.Cu — KiCad exports copper as #C83434; drill holes as #ECECEC/#FFFFFF circles.
    # Split them: copper gets buried color, drill holes are extracted separately
    # and rendered last (on top of everything) as COLOR_OUTSIDE to punch through.
    fcu_text = layer_svgs.get("F.Cu") or ""
    fcu_g = ""
    drill_holes_g = ""
    if fcu_text:
        fcu_inner = extract_inner_g(fcu_text)
        fcu_inner = re.sub(r"fill-opacity:[0-9.]+", "fill-opacity:1.0000", fcu_inner)

        # Split <g> blocks by fill color: drill holes are in groups with fill #ECECEC or #FFFFFF
        # Strategy: replace drill hole colors with a sentinel, extract those groups, then clean up.
        HOLE_COLORS = {"#ECECEC", "#ececec", "#FFFFFF", "#ffffff"}

        # Parse into individual <g>...</g> or self-contained <g.../> blocks
        # Simpler: split by top-level <g style= blocks
        g_blocks = re.split(r"(?=<g )", fcu_inner)
        copper_blocks = []
        hole_blocks = []
        for block in g_blocks:
            if not block.strip():
                continue
            # Check the fill color declared in this block's style
            style_m = re.search(r'fill:([^;"\s]+)', block)
            fill_color = style_m.group(1) if style_m else ""
            if fill_color in HOLE_COLORS:
                hole_blocks.append(block)
            else:
                copper_blocks.append(block)

        copper_inner = "".join(copper_blocks)
        copper_inner = copper_inner.replace("#C83434", COLOR_COPPER_BURIED).replace(
            "#c83434", COLOR_COPPER_BURIED
        )
        fcu_g = copper_inner

        # Drill holes: recolor to outside background so they punch through all layers
        hole_inner = "".join(hole_blocks)
        hole_inner = hole_inner.replace("#ECECEC", COLOR_OUTSIDE).replace(
            "#ececec", COLOR_OUTSIDE
        )
        hole_inner = hole_inner.replace("#FFFFFF", COLOR_OUTSIDE).replace(
            "#ffffff", COLOR_OUTSIDE
        )
        drill_holes_g = hole_inner

    # F.Mask — pad openings exported as #D864FF (purple)
    fmask_g = layer_g("F.Mask", ["#D864FF", "#d864ff"], COLOR_COPPER_EXPOSED)

    # F.SilkS — exported as #F2EDA1 (yellow)
    fsilk_g = layer_g("F.SilkS", ["#F2EDA1", "#f2eda1"], COLOR_SILKSCREEN)

    clip_id = "board-clip"

    svg_parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
        f'     width="{bw:.2f}" height="{bh:.2f}"',
        f'     viewBox="0 0 {vb_w} {vb_h}">',
        "  <defs>",
        f'    <clipPath id="{clip_id}">',
        f"      {clip_shapes}",
        "    </clipPath>",
        "  </defs>",
        # Board fill (soldermask green), clipped to board outline
        f'  <rect width="{vb_w}" height="{vb_h}" fill="{COLOR_SOLDERMASK}" clip-path="url(#{clip_id})"/>',
        # F.Cu — buried copper (darker green)
        f'  <g clip-path="url(#{clip_id})">{fcu_g}</g>',
        # F.Mask — exposed copper (gold), the pad openings
        f'  <g clip-path="url(#{clip_id})">{fmask_g}</g>',
        # F.SilkS — silkscreen (white)
        f'  <g clip-path="url(#{clip_id})">{fsilk_g}</g>',
        # Drill holes — rendered last, no clip, punch through all layers
        f"  <g>{drill_holes_g}</g>",
        "</svg>",
    ]
    board_svg = "\n".join(svg_parts)

    return "\n".join(
        [
            '<!DOCTYPE html><html><head><meta charset="utf-8">',
            "<style>",
            "* { margin: 0; padding: 0; box-sizing: border-box; }",
            f"body {{ width: {IMG_W}px; height: {IMG_H}px; background: {COLOR_OUTSIDE}; overflow: hidden; display: flex; align-items: center; justify-content: center; }}",
            "</style></head><body>",
            board_svg,
            "</body></html>",
        ]
    )


def render_png(html: str, png_path: Path) -> bool:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".html", delete=False, encoding="utf-8"
    ) as f:
        html_path = f.name
        f.write(html)
    try:
        html_url = "file:///" + html_path.replace("\\", "/")
        r = subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                f"--window-size={IMG_W},{IMG_H}",
                f"--screenshot={str(png_path)}",
                html_url,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        time.sleep(0.5)
        if not png_path.exists():
            print(f"    Chrome failed (rc={r.returncode}): {r.stderr[:300]}")
            return False
        return True
    except Exception as exc:
        print(f"    Chrome exception: {exc}")
        return False
    finally:
        try:
            os.unlink(html_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def process_project(proj: dict, thumb_store: Path, db_path: Path, force: bool) -> str:
    """Returns 'ok', 'skip', or 'fail'."""
    pid = proj["id"]
    name = proj["name"]

    if not force and (thumb_store / f"{pid}.png").exists():
        print(f"  SKIP {name} (already rendered — use --force to redo)")
        return "skip"

    project_path = proj.get("path", "")
    if not project_path:
        print(f"  SKIP {name} (no path in DB)")
        return "skip"

    pcb = find_pcb(project_path)
    if not pcb:
        print(f"  SKIP {name} (no .kicad_pcb found under {project_path})")
        return "skip"

    print(f"  {name} ({pid}) — {pcb.name}")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        layer_svgs: dict[str, str | None] = {}
        for layer in LAYER_NAMES:
            svg_path = export_layer_svg(pcb, layer, tmp)
            layer_svgs[layer] = (
                svg_path.read_text(encoding="utf-8") if svg_path else None
            )

        edge_text = layer_svgs.get("Edge.Cuts") or ""
        if not edge_text:
            print("    No Edge.Cuts — cannot render")
            return "fail"

        vb_w, vb_h = extract_viewbox(edge_text)
        html = build_html(layer_svgs, vb_w, vb_h)

        png_path = thumb_store / f"{pid}.png"
        print("    Rendering ...")
        if not render_png(html, png_path):
            return "fail"

    # Clear thumbnail_rel so backend falls through to the central store
    set_thumbnail_rel(db_path, pid, None)
    print(f"    Saved: {png_path.name}")
    return "ok"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate PCB thumbnails locally using kicad-cli + Chrome"
    )
    parser.add_argument("--projects-root", default="./data/projects")
    parser.add_argument(
        "--force", action="store_true", help="Regenerate even if PNG already exists"
    )
    parser.add_argument("--id", dest="project_id", help="Only process this project ID")
    args = parser.parse_args()

    for exe, label in [(KICAD_CLI, "kicad-cli"), (CHROME, "Chrome")]:
        if not Path(exe).exists():
            print(f"ERROR: {label} not found at {exe}")
            sys.exit(1)

    projects_root = Path(args.projects_root).resolve()
    db_path = projects_root / DB_RELATIVE
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}")
        sys.exit(1)

    thumb_store = db_path.parent / "thumbnails"
    thumb_store.mkdir(parents=True, exist_ok=True)

    projects = get_projects(db_path, projects_root)
    print(f"Found {len(projects)} project(s)")

    counts = {"ok": 0, "skip": 0, "fail": 0}
    for proj in projects:
        if args.project_id and proj["id"] != args.project_id:
            continue
        result = process_project(proj, thumb_store, db_path, args.force)
        counts[result] += 1

    print(
        f"\nDone — {counts['ok']} generated, {counts['skip']} skipped, {counts['fail']} failed"
    )
    if counts["ok"]:
        print("Restart the backend to clear any cached thumbnail URLs.")


if __name__ == "__main__":
    main()
