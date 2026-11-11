"""A ``prism-kicad`` stand-in for the Release Studio document tests.

Answers the three commands the Documentation Engine uses -- ``version``,
``stroke-text`` and ``drawing-sheet`` -- from Python ``kicad_monkey``, so the
tests can exercise the real subprocess contract (request files, stdout
documents, batching) without a release build of the CLI. ``PRISM_KICAD_STUB_LOG``
names a file every invocation appends its ``argv`` to as one JSON line.

The answers are the reference implementation the CLI must match: the parity
tests in ``test_release_studio_documents.py`` compare a real ``PRISM_KICAD``
against the same calls.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

VERSION = {
    "schema": "prism.cli.version.a0",
    "crate_version": "0.7.0",
    "engine_version": "2026.9.7",
    "hlr_procedure": {
        "geometer_version": "2026.9.19",
        "options": "assembly-hlr-a0",
    },
    "kicad_file_formats": {"board": 20260206, "schematic": 20260306},
    "kicad_version": "10.0.6",
    "member_schemas": [
        {"path": "bundle.json", "schema": "prism.bundle.manifest.a3"},
        {"path": "design.json", "schema": "kicad_monkey.design.a0"},
        {
            "path": "materialization/board.kmpack",
            "schema": "kicad_monkey.materialization.a1",
        },
        {
            "path": "models/assembly-hlr.json",
            "schema": "prism.assembly_hlr.a0",
        },
        {
            "path": "projections/board-objects.json",
            "schema": "prism.board_objects.a0",
        },
        {
            "path": "projections/occurrences.json",
            "schema": "prism.occurrences.a0",
        },
        {
            "path": "projections/placements.json",
            "schema": "prism.placements.a1",
        },
        {"path": "projections/project.json", "schema": "prism.project.a0"},
        {
            "path": "projections/route-metrics.json",
            "schema": "prism.route_metrics.a0",
        },
        {
            "path": "projections/semantic-index.json",
            "schema": "prism.semantic_index.a2",
        },
        {"path": "projections/stackup.json", "schema": "prism.stackup.a0"},
        {
            "path": "projections/system-interface.json",
            "schema": "prism.system_interface.v1",
        },
    ],
    "models_procedure": "kicad-cli-glb-a0",
    "pack_format_version": 0,
    "refill_procedure": "pcbnew-zone-filler-a0",
    "upgrade_procedure": "kicad-seeded-upgrade-a0",
}

_LAYOUT_CONTROLS = frozenset("\n\r\t")


def _log(argv: list[str], **extra: object) -> None:
    path = os.environ.get("PRISM_KICAD_STUB_LOG")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"args": argv, **extra}) + "\n")


def _metrics() -> dict:
    from kicad_monkey.kicad_stroke_font import get_glyph, get_space_width

    advances = {}
    for codepoint in range(32, 11264):
        glyph = get_glyph(chr(codepoint))
        if glyph is not None:
            advances[str(codepoint)] = glyph.width
    return {
        "schema": "prism.cli.stroke_font_metrics.a0",
        "space_width": get_space_width(),
        "super_sub_size_multiplier": 0.8,
        "advances": advances,
    }


def _stroke_text(request: dict) -> dict:
    from kicad_monkey.kicad_stroke_font import get_glyph, get_renderer

    renderer = get_renderer()
    runs = []
    for run in request["runs"]:
        text = str(run["text"])
        size = float(run["size_mm"])
        polylines = renderer.render_text_polylines(
            text,
            float(run["x_mm"]),
            float(run["y_mm"]),
            size,
            size,
            h_align=str(run["h_align"]),
            v_align=str(run["v_align"]),
        )
        missing = sorted(
            {
                ord(char)
                for char in text
                if char not in _LAYOUT_CONTROLS and get_glyph(char) is None
            }
        )
        runs.append(
            {
                "polylines_mm": [
                    [[float(px), float(py)] for px, py in polyline]
                    for polyline in polylines
                ],
                "advance_mm": renderer._calculate_text_width(text) * size,
                "missing_codepoints": missing,
            }
        )
    return {"schema": "prism.cli.stroke_text_result.a0", "runs": runs}


def _drawing_sheet(request: dict) -> dict:
    from kicad_monkey import drawing_sheet_to_ops, load_default_drawing_sheet

    title_block = request["title_block"]
    ops = drawing_sheet_to_ops(
        load_default_drawing_sheet(),
        paper_width_nm=int(request["paper_width_nm"]),
        paper_height_nm=int(request["paper_height_nm"]),
        title_block={
            "title": title_block["title"],
            "date": title_block["date"],
            "rev": title_block["rev"],
            "company": title_block["company"],
            "comments": {
                int(number): text
                for number, text in title_block["comments"].items()
            },
        },
        sheet_index=int(request["sheet_index"]),
        sheet_count=int(request["sheet_count"]),
        paper_name=request["paper_name"],
        filename=request["file_name"],
        sheet_path=request["sheet_path"],
        sheet_name=request["sheet_name"],
        kicad_version=request["kicad_version"],
    )
    converted = []
    for op in ops:
        kind = op.kind.value if hasattr(op.kind, "value") else str(op.kind)
        payload = dict(op.payload)
        if kind == "PlotPoly":
            converted.append(
                {
                    "kind": "poly",
                    "points": [
                        {"x_nm": int(x), "y_nm": int(y)}
                        for x, y in payload["points"]
                    ],
                    "fill": payload["fill"],
                    "width_nm": int(payload["width_nm"]),
                    "stroke_color": payload["stroke_color"],
                }
            )
        elif kind == "Rect":
            converted.append(
                {
                    "kind": "rect",
                    "x1_nm": int(payload["x1"]),
                    "y1_nm": int(payload["y1"]),
                    "x2_nm": int(payload["x2"]),
                    "y2_nm": int(payload["y2"]),
                    "corner_radius_nm": int(payload.get("corner_radius_nm", 0)),
                    "fill": payload["fill"],
                    "width_nm": int(payload["width_nm"]),
                    "stroke_color": payload["stroke_color"],
                }
            )
        elif kind == "Text":
            converted.append(
                {
                    "kind": "text",
                    "x_nm": int(payload["x"]),
                    "y_nm": int(payload["y"]),
                    "text": payload["text"],
                    "color": payload["color"],
                    "orient_deg": payload["orient_deg"],
                    "size_x_nm": int(payload["size_x_nm"]),
                    "size_y_nm": int(payload["size_y_nm"]),
                    "pen_width_nm": int(payload["pen_width_nm"]),
                    "h_align": payload["h_align"],
                    "v_align": payload["v_align"],
                    "italic": bool(payload["italic"]),
                    "bold": bool(payload["bold"]),
                    "multiline": bool(payload["multiline"]),
                    "font_face": payload["font_face"],
                }
            )
        else:  # pragma: no cover - the default worksheet has no other operation
            raise SystemExit(f"unexpected drawing-sheet operation: {kind}")
    return {"schema": "prism.cli.drawing_sheet_result.a0", "ops": converted}


def _request_path(argv: list[str]) -> Path:
    return Path(argv[argv.index("--request") + 1])


def _artwork_svg(view: str) -> str:
    """A deterministic view: the same bytes on every run, for the same view."""

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" '
        f'viewBox="0 0 20 10" data-view="{view}">'
        '<path d="M 0 0 L 20 0 L 20 10 L 0 10 Z" fill="none" stroke="#000000" '
        'stroke-width="0.15" data-feature="board-outline" />'
        '<g data-projection="outline" data-bounds-kind="model"></g>'
        '<text x="5" y="5" font-size="1.6" text-anchor="middle" '
        'dominant-baseline="central" fill="#000000" data-component="R1">R1</text>'
        "</svg>"
    )


def _artwork(argv: list[str]) -> dict:
    """``artwork``: one deterministic SVG per requested view."""

    output = Path(argv[argv.index("-o") + 1])
    views = [argv[index + 1] for index, argument in enumerate(argv) if argument == "--view"]
    entries = []
    for view in views:
        output.mkdir(parents=True, exist_ok=True)
        payload = _artwork_svg(view).encode("utf-8")
        (output / f"{view}.svg").write_bytes(payload)
        entries.append(
            {
                "name": view,
                "file": f"{view}.svg",
                "sha256": hashlib.sha256(payload).hexdigest(),
                "footprints_drawn": 0,
                "designators_placed": 0,
                "dnp_footprints_hatched": 0,
                "footprints_without_outline": [],
            }
        )
    return {
        "schema": "prism.cli.artwork_result.a0",
        "views": sorted(entries, key=lambda entry: entry["name"]),
    }


def main(argv: list[str]) -> int:
    if argv[:1] == ["version"] or argv[:1] == ["--version"]:
        _log(argv)
        print(json.dumps(VERSION, separators=(",", ":")))
        return 0
    if argv[:1] == ["artwork"]:
        _log(argv)
        print(json.dumps(_artwork(argv), separators=(",", ":")))
        return 0
    if argv[:1] == ["stroke-text"]:
        if "--metrics" in argv:
            _log(argv)
            print(json.dumps(_metrics(), separators=(",", ":")))
            return 0
        request = json.loads(_request_path(argv).read_text(encoding="utf-8"))
        _log(argv, runs=len(request.get("runs", ())))
        print(json.dumps(_stroke_text(request), separators=(",", ":")))
        return 0
    if argv[:1] == ["drawing-sheet"]:
        _log(argv)
        request = json.loads(_request_path(argv).read_text(encoding="utf-8"))
        print(json.dumps(_drawing_sheet(request), separators=(",", ":")))
        return 0
    _log(argv)
    print(json.dumps({"schema": "prism.cli.error.a0", "category": "usage",
                      "code": "usage", "message": "unsupported stub command"}))
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
