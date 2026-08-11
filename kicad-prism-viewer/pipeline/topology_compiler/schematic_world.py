from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable


SCHEMA = "prism.schematic_world_a0"
PAGE_WIDTH_MM = 360.0
HORIZONTAL_GAP_MM = 72.0
VERTICAL_GAP_MM = 84.0


def _safe_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-")
    return cleaned or fallback


def _source_page_size(ir: Any) -> tuple[float, float]:
    canvas = getattr(ir, "canvas", None) or {}
    width = max(1.0, float(canvas.get("width_nm") or 1) / 1_000_000.0)
    height = max(1.0, float(canvas.get("height_nm") or 1) / 1_000_000.0)
    return width, height


def _page_size(ir: Any) -> tuple[float, float]:
    width, height = _source_page_size(ir)
    scale = PAGE_WIDTH_MM / width
    return PAGE_WIDTH_MM, height * scale


def _hierarchy_depth(instance: Any) -> int:
    if bool(getattr(instance, "is_top_level", False)):
        return 0
    path = str(getattr(instance, "sheet_path", "") or "")
    return max(1, len([part for part in path.split("/") if part]))


def _operation_bounds(operation: Any) -> list[float] | None:
    data = operation.to_dict() if hasattr(operation, "to_dict") else dict(operation)
    points: list[tuple[float, float]] = []

    for point in data.get("points", []) or []:
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            points.append((float(point[0]), float(point[1])))
    for x_key, y_key in (
        ("x", "y"),
        ("cx", "cy"),
        ("x1", "y1"),
        ("x2", "y2"),
        ("start_x", "start_y"),
        ("mid_x", "mid_y"),
        ("end_x", "end_y"),
    ):
        if x_key in data and y_key in data:
            points.append((float(data[x_key]), float(data[y_key])))

    if not points:
        return None

    left = min(point[0] for point in points)
    top = min(point[1] for point in points)
    right = max(point[0] for point in points)
    bottom = max(point[1] for point in points)
    diameter = float(data.get("diameter_nm") or 0)
    radius = float(data.get("radius_nm") or diameter / 2.0)
    if radius:
        left -= radius
        top -= radius
        right += radius
        bottom += radius
    if str(data.get("kind") or "") == "Text":
        size_x = float(data.get("size_x_nm") or 1_000_000)
        size_y = float(data.get("size_y_nm") or size_x)
        text = str(data.get("text") or "")
        width = max(size_x, size_x * max(1, len(text)) * 0.62)
        left -= width / 2.0
        right += width / 2.0
        top -= size_y / 1.6
        bottom += size_y / 1.6
    margin = max(float(data.get("width_nm") or data.get("pen_width_nm") or 0) / 2.0, 350_000.0)
    return [
        (left - margin) / 1_000_000.0,
        (top - margin) / 1_000_000.0,
        (right + margin) / 1_000_000.0,
        (bottom + margin) / 1_000_000.0,
    ]


def _record_bounds(record: Any) -> list[float] | None:
    bounds = getattr(record, "bounds", None)
    if bounds is not None:
        return [
            float(bounds.left) / 1_000_000.0,
            float(bounds.top) / 1_000_000.0,
            float(bounds.right) / 1_000_000.0,
            float(bounds.bottom) / 1_000_000.0,
        ]
    operation_bounds = [
        item
        for operation in (getattr(record, "operations", []) or [])
        if (item := _operation_bounds(operation)) is not None
    ]
    if not operation_bounds:
        return None
    return [
        min(item[0] for item in operation_bounds),
        min(item[1] for item in operation_bounds),
        max(item[2] for item in operation_bounds),
        max(item[3] for item in operation_bounds),
    ]


def _record_summary(
    ir: Any,
    svg_to_net: dict[str, dict[str, Any]],
) -> tuple[dict[str, int], list[dict[str, Any]]]:
    counts: dict[str, int] = defaultdict(int)
    features: list[dict[str, Any]] = []
    for index, record in enumerate(getattr(ir, "records", []) or [], start=1):
        kind = str(getattr(record, "kind", "") or "unknown")
        counts[kind] += 1
        record_uuid = str(getattr(record, "uuid", "") or "")
        object_id = str(getattr(record, "object_id", "") or "")
        feature = {
            "id": index,
            "uuid": record_uuid,
            "objectId": object_id,
            "kind": kind,
        }
        bounds = _record_bounds(record)
        if bounds is not None:
            feature["boundsMm"] = bounds
        net = (
            svg_to_net.get(record_uuid) or svg_to_net.get(object_id)
            if kind
            in {
                "wire",
                "junction",
                "label",
                "global_label",
                "hierarchical_label",
                "no_connect",
                "bus",
                "bus_entry",
            }
            else None
        )
        if net:
            feature["netUid"] = str(net.get("uid") or "")
            feature["netName"] = str(net.get("name") or "")
        extras = getattr(record, "extras", None) or {}
        for key in ("reference", "value", "text", "sheet_name", "sheet_file"):
            value = extras.get(key)
            if value not in (None, ""):
                feature[key] = str(value)
        features.append(feature)
    return dict(sorted(counts.items())), features


def _layout_pages(pages: list[dict[str, Any]]) -> dict[str, float]:
    by_depth: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for page in pages:
        by_depth[int(page["depth"])].append(page)

    row_heights: dict[int, float] = {}
    row_widths: dict[int, float] = {}
    for depth, row in by_depth.items():
        row.sort(key=lambda item: (int(item["sheetNumber"]), item["name"]))
        row_heights[depth] = max(float(item["heightMm"]) for item in row)
        row_widths[depth] = sum(float(item["widthMm"]) for item in row) + HORIZONTAL_GAP_MM * max(0, len(row) - 1)

    max_width = max(row_widths.values(), default=PAGE_WIDTH_MM)
    y = 0.0
    for depth in sorted(by_depth):
        row = by_depth[depth]
        x = (max_width - row_widths[depth]) / 2.0
        for page in row:
            page["worldX"] = x
            page["worldY"] = y
            x += float(page["widthMm"]) + HORIZONTAL_GAP_MM
        y += row_heights[depth] + VERTICAL_GAP_MM

    return {
        "minX": 0.0,
        "minY": 0.0,
        "maxX": max_width,
        "maxY": max(0.0, y - VERTICAL_GAP_MM),
    }


def build_schematic_world(
    design: Any,
    design_payload: dict[str, Any],
    output_dir: Path,
    *,
    progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    from kicad_monkey import KiCadSvgRenderOptions, render_ir_to_svg  # type: ignore
    from kicad_monkey.kicad_schematic_svg_enrichment import (  # type: ignore
        schematic_root_svg_attrs,
        schematic_svg_enrichment_payload,
    )

    schematic_dir = output_dir / "schematic-world"
    page_dir = schematic_dir / "pages"
    page_dir.mkdir(parents=True, exist_ok=True)

    pages: list[dict[str, Any]] = []
    features_by_page: dict[str, list[dict[str, Any]]] = {}
    instance_to_page: dict[str, str] = {}
    options = KiCadSvgRenderOptions.enriched_default()

    instances = list(design.schematic_instances())
    if progress:
        progress(f"schematic world pages={len(instances)}")
    for index, instance in enumerate(instances, start=1):
        ir = design.to_schematic_instance_ir(instance)
        page_id = f"page-{index:04d}"
        instance_path = str(getattr(instance, "sheet_instance_path", "") or "")
        instance_to_page[instance_path] = page_id
        source_path = str(getattr(instance, "source_path", "") or "")
        sheet_name = str(getattr(instance, "sheet_name", "") or Path(source_path).stem or page_id)
        filename = f"{index:04d}-{_safe_name(sheet_name, page_id)}.svg"
        width_mm, height_mm = _page_size(ir)
        source_width_mm, source_height_mm = _source_page_size(ir)
        root_attrs = schematic_root_svg_attrs(
            source_path=source_path,
            sheet_name=sheet_name,
            sheet_path=getattr(instance, "sheet_path", ""),
            profile="enriched",
        )
        root_attrs["data-sheet-instance-path"] = instance_path
        svg = render_ir_to_svg(ir, options=options, root_extra_attrs=root_attrs)
        (page_dir / filename).write_text(svg, encoding="utf-8")

        enrichment = schematic_svg_enrichment_payload(
            design_payload,
            source_path=source_path,
            sheet_name=sheet_name,
            sheet_path=getattr(instance, "sheet_path", ""),
            sheet_instance_path=instance_path,
            profile="enriched",
        )
        view_indexes = enrichment.get("view_indexes", {})
        net_map = view_indexes.get("net_uid_to_svg", {}) or {}
        record_counts, features = _record_summary(ir, view_indexes.get("svg_to_net", {}) or {})
        features_by_page[page_id] = features
        pages.append(
            {
                "id": page_id,
                "name": sheet_name,
                "sheetNumber": int(getattr(instance, "sheet_number", index) or index),
                "sourcePath": source_path,
                "sheetPath": str(getattr(instance, "sheet_path", "") or ""),
                "sheetInstancePath": instance_path,
                "parentSheetInstancePath": str(getattr(instance, "parent_sheet_instance_path", "") or ""),
                "parentId": "",
                "depth": _hierarchy_depth(instance),
                "widthMm": width_mm,
                "heightMm": height_mm,
                "sourceWidthMm": source_width_mm,
                "sourceHeightMm": source_height_mm,
                "svg": f"pages/{filename}",
                "recordCounts": record_counts,
                "featureCount": len(features),
                "netUids": sorted(str(uid) for uid in net_map),
            }
        )
        if progress and (index == len(instances) or index % 5 == 0):
            progress(f"schematic world rendered pages={index}/{len(instances)}")

    for page in pages:
        page["parentId"] = instance_to_page.get(page["parentSheetInstancePath"], "")

    world_bounds = _layout_pages(pages)
    page_by_id = {page["id"]: page for page in pages}
    edges = [
        {
            "id": f"edge-{page['parentId']}-{page['id']}",
            "source": page["parentId"],
            "target": page["id"],
            "kind": "hierarchy",
        }
        for page in pages
        if page["parentId"] in page_by_id
    ]

    net_to_pages: dict[str, list[str]] = defaultdict(list)
    for page in pages:
        for net_uid in page["netUids"]:
            net_to_pages[net_uid].append(page["id"])

    features_path = schematic_dir / "features.json"
    features_path.write_text(
        json.dumps({"schema": f"{SCHEMA}.features", "pages": features_by_page}, separators=(",", ":")),
        encoding="utf-8",
    )

    revision_source = json.dumps(
        {
            "pages": [
                {
                    "instance": page["sheetInstancePath"],
                    "source": page["sourcePath"],
                    "features": page["featureCount"],
                    "nets": page["netUids"],
                }
                for page in pages
            ],
            "design": design_payload.get("design", {}),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    manifest = {
        "schema": SCHEMA,
        "geometryRevision": hashlib.sha256(revision_source).hexdigest(),
        "worldBoundsMm": world_bounds,
        "pages": pages,
        "edges": edges,
        "features": "features.json",
        "netToPages": dict(sorted(net_to_pages.items())),
        "lod": {
            "overview": {"maxPixelsPerPage": 240, "source": "svg-raster"},
            "detail": {"minPixelsPerPage": 520, "source": "svg-raster"},
        },
    }
    (schematic_dir / "schematic.manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":")),
        encoding="utf-8",
    )
    if progress:
        progress(f"schematic world manifest pages={len(pages)} features={sum(page['featureCount'] for page in pages)}")
    return {
        "schema": SCHEMA,
        "path": "schematic-world/schematic.manifest.json",
        "geometry_revision": manifest["geometryRevision"],
        "page_count": len(pages),
    }
