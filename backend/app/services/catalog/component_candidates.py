"""Deterministic, deliberately bounded KiCad candidate generation.

These are review candidates. Source pinout correctness and KLC remain separate
checks in the existing catalog workflow.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

from app.services.catalog.component_spec import validate_spec

GENERATOR_VERSION = "prism-component-candidates/3"


def checked_candidates(spec: Any, *, identity: dict | None = None, documents: list | None = None) -> dict:
    findings = validate_spec(spec)
    if findings:
        return {"findings": findings, "files": {}}
    if identity:
        for key in ("manufacturer", "mpn"):
            if spec.get("identity", {}).get(key) != identity.get(key):
                findings.append({"code": "IDENTITY_MISMATCH", "path": f"identity.{key}", "detail": "Must match the requested component"})
    if documents is not None:
        fetched = {d.get("sha256"): d for d in documents if isinstance(d, dict)}
        pages = {}
        for source in spec.get("sources", []) if isinstance(spec.get("sources"), list) else []:
            if not isinstance(source, dict):
                continue
            doc = fetched.get(source.get("sha256"))
            if not doc or source.get("url") != doc.get("url"):
                findings.append({"code": "SOURCE_NOT_FETCHED", "path": "sources", "detail": "Source URL and digest must match a document fetched by this task"})
            else:
                pages[source.get("id")] = doc.get("pages", 1)
        def check_pages(value: Any) -> None:
            if isinstance(value, dict):
                if "source_id" in value and "page" in value:
                    if not isinstance(value["source_id"], str) or not isinstance(value["page"], int) or isinstance(value["page"], bool) or not 1 <= value["page"] <= pages.get(value["source_id"], 0):
                        findings.append({"code": "SOURCE_PAGE", "path": "evidence", "detail": "Evidence page is outside the fetched document"})
                for child in value.values():
                    check_pages(child)
            elif isinstance(value, list):
                for child in value:
                    check_pages(child)
        check_pages(spec)
    if findings:
        return {"findings": findings, "files": {}, "generator": GENERATOR_VERSION}
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", spec["identity"]["mpn"])[:100]
    files = {"symbol": {"filename": name + ".kicad_sym", "content": symbol(spec, name)}}
    footprint_findings = footprint_requirements(spec)
    if not footprint_findings:
        files["footprint"] = {"filename": name + ".kicad_mod", "content": footprint(spec, name)}
    return {"findings": footprint_findings, "warnings": footprint_review_findings(spec), "files": files, "generator": GENERATOR_VERSION,
            "review_required": True, "source_pinout_review": "pending", "klc": "not_run"}


def q(value: str) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def n(value: float) -> str:
    return format(value, ".6f").rstrip("0").rstrip(".") or "0"


def compact_symbol(spec: dict, name: str) -> str:
    """Conventional small-IC layout from semantic pin types, preserving all pins."""
    groups = {side: [] for side in ("left", "right", "top", "bottom")}
    output_types = {"output", "power_out", "open_collector", "open_emitter", "tri_state"}
    for pin in spec["pins"]:
        ground = re.fullmatch(r"(?:A|D|P)?GND|VSS", pin["name"], flags=re.I)
        side = "bottom" if ground else "top" if pin["electrical_type"] == "power_in" else "right" if pin["electrical_type"] in output_types else "left"
        groups[side].append(pin)
    # Keep related power outputs together before the status/monitoring outputs.
    groups["right"].sort(key=lambda pin: pin["electrical_type"] != "power_out")
    pitch, length = 2.54, 5.08
    label_chars = sum(max((len(pin["name"]) for pin in groups[side]), default=0) for side in ("left", "right"))
    width = max(25.4, (max(len(groups["top"]), len(groups["bottom"])) + 2) * pitch,
                math.ceil((label_chars * 0.8 + 5.08) / pitch) * pitch)
    height = max(20.32, (max(len(groups["left"]), len(groups["right"])) + 2) * pitch)
    top, bottom = height / 2, -height / 2
    lines = ['(kicad_symbol_lib (version 20231120) (generator "prism_component_agent")',
             f' (symbol {q(name)} (pin_names (offset 0.508)) (in_bom yes) (on_board yes)',
             f'  (property "Reference" "U" (at 0 {n(top + 10.16)} 0) (effects (font (size 1.27 1.27))))',
             f'  (property "Value" {q(name)} (at 0 {n(top + 7.62)} 0) (effects (font (size 1.27 1.27))))',
             f'  (symbol {q(name + "_1_0")}',
             f'   (rectangle (start {n(-width / 2)} {n(top)}) (end {n(width / 2)} {n(bottom)}) (stroke (width 0) (type default)) (fill (type background)))', '  )',
             f'  (symbol {q(name + "_1_1")}']
    for side, sequence in groups.items():
        for row, pin in enumerate(sequence):
            if side in {"left", "right"}:
                x, y, angle = (-width / 2 - length if side == "left" else width / 2 + length), top - (row + 1) * pitch, (0 if side == "left" else 180)
            else:
                x = (row - (len(sequence) - 1) / 2) * pitch
                y, angle = (top + length, 270) if side == "top" else (bottom - length, 90)
            lines.append(f'   (pin {pin["electrical_type"]} line (at {n(x)} {n(y)} {angle}) (length {n(length)}) (name {q(pin["name"])} (effects (font (size 1.27 1.27)))) (number {q(pin["number"])} (effects (font (size 1.27 1.27)))))')
    lines.extend(['  )', ' )', ')'])
    return "\n".join(lines) + "\n"


def symbol(spec: dict, name: str) -> str:
    if len(spec["units"]) == 1 and len(spec["pins"]) <= 40:
        return compact_symbol(spec, name)
    pins = {p["number"]: p for p in spec["pins"]}
    lines = ['(kicad_symbol_lib (version 20231120) (generator "prism_component_agent")',
             f' (symbol {q(name)} (pin_names (offset 0.508)) (in_bom yes) (on_board yes)',
             '  (property "Reference" "U" (at 0 5.08 0) (effects (font (size 1.27 1.27))))',
             f'  (property "Value" {q(name)} (at 0 2.54 0) (effects (font (size 1.27 1.27))))']
    for index, unit in enumerate(spec["units"], 1):
        numbers = unit["pin_numbers"]
        # Stable, readable layout. Functional partitioning is explicitly in the spec.
        left = [p for p in numbers if pins[p]["electrical_type"] not in {"output", "power_out"}]
        right = [p for p in numbers if p not in left]
        rows = max(len(left), len(right), 1)
        height = max(7.62, (rows + 2) * 2.54)
        width = max(15.24, math.ceil(max(len(pins[p]["name"]) for p in numbers) * 0.8 / 2.54) * 2.54 + 10.16)
        lines.extend([f'  (symbol {q(name + "_" + str(index) + "_0")}',
                      f'   (rectangle (start {n(-width / 2)} 0) (end {n(width / 2)} {n(-height)}) (stroke (width 0) (type default)) (fill (type background)))'])
        if len(spec["units"]) > 1:
            lines.append(f'   (text {q(unit["name"])} (at 0 -1.27 0) (effects (font (size 1.27 1.27))))')
        lines.extend(['  )', f'  (symbol {q(name + "_" + str(index) + "_1")}'])
        for side, sequence in ((-1, left), (1, right)):
            for row, number in enumerate(sequence):
                pin = pins[number]
                lines.append(f'   (pin {pin["electrical_type"]} line (at {n(side * (width / 2 + 5.08))} {n(-(row + 2) * 2.54)} {0 if side == -1 else 180}) (length 5.08) (name {q(pin["name"])} (effects (font (size 1.27 1.27)))) (number {q(number)} (effects (font (size 1.27 1.27)))))')
        lines.append('  )')
    lines.extend([' )', ')'])
    return "\n".join(lines) + "\n"


def footprint_requirements(spec: dict) -> list[dict]:
    findings = []
    def positive(value: Any) -> bool:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 < value < 1000
    for axis in ("body_x_mm", "body_y_mm"):
        if not positive(spec["package"].get(axis)):
            findings.append({"code": "FOOTPRINT_BODY_REQUIRED", "path": f"package.{axis}", "detail": "Positive body dimension needed to draw the candidate; engineering estimates are allowed"})
    for i, pad in enumerate(spec["pads"]):
        if pad.get("kind") == "mechanical" or pad.get("shape") not in {"rect", "circle", "roundrect"}:
            findings.append({"code": "FOOTPRINT_PAD_UNSUPPORTED", "path": f"pads[{i}]", "detail": "V1 supports documented SMD rect, circle, or roundrect pads"})
        for axis in ("x_mm", "y_mm"):
            value = pad.get(axis)
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or abs(value) >= 1000:
                findings.append({"code": "FOOTPRINT_POSITION_REQUIRED", "path": f"pads[{i}].{axis}", "detail": "Finite pad position needed to draw the candidate; engineering estimates are allowed"})
        for axis in ("size_x_mm", "size_y_mm"):
            if not positive(pad.get(axis)):
                findings.append({"code": "FOOTPRINT_SIZE_REQUIRED", "path": f"pads[{i}].{axis}", "detail": "Positive land size needed to draw the candidate; engineering estimates are allowed"})
        if pad.get("shape") == "circle" and pad.get("size_x_mm") != pad.get("size_y_mm"):
            findings.append({"code": "FOOTPRINT_CIRCLE", "path": f"pads[{i}]", "detail": "Circular pad diameters must match"})
    for i, pad in enumerate(spec["pads"]):
        if pad.get("rotation_deg", 0) != 0:
            findings.append({"code": "FOOTPRINT_ROTATION_UNSUPPORTED", "path": f"pads[{i}]", "detail": "V1 supports axis-aligned pads only"})
    return findings


def footprint_review_findings(spec: dict) -> list[dict]:
    """Geometry/provenance concerns remain visible without blocking drafts."""
    findings = []
    package_evidence = spec["package"].get("evidence", {})
    for key, evidence in (package_evidence.items() if isinstance(package_evidence, dict) else []):
        if isinstance(evidence, dict) and evidence.get("status") == "estimated":
            findings.append({"code": "GEOMETRY_ESTIMATED", "path": f"package.{key}", "detail": evidence.get("method", "Engineering estimate")})
    for i, pad in enumerate(spec["pads"]):
        evidence = pad.get("evidence", {})
        if isinstance(evidence, dict) and evidence.get("status") == "estimated":
            findings.append({"code": "GEOMETRY_ESTIMATED", "path": f"pads[{i}]", "detail": evidence.get("method", "Engineering estimate")})
        for axis in ("size_x_mm", "size_y_mm"):
            evidence = pad.get("size_evidence", {}).get(axis) if isinstance(pad.get("size_evidence"), dict) else None
            if not isinstance(evidence, dict) or "source_id" not in evidence:
                method = evidence.get("method") if isinstance(evidence, dict) else None
                findings.append({"code": "LAND_SIZE_REVIEW", "path": f"pads[{i}].{axis}", "detail": method or "Land size is a draft assumption; verify during footprint review"})
    if not footprint_requirements(spec):
        for i, pad in enumerate(spec["pads"]):
            for other in spec["pads"][i + 1:]:
                if pad["number"] == other["number"]:
                    continue
                dx, dy = abs(pad["x_mm"] - other["x_mm"]), abs(pad["y_mm"] - other["y_mm"])
                if dx < (pad["size_x_mm"] + other["size_x_mm"]) / 2 and dy < (pad["size_y_mm"] + other["size_y_mm"]) / 2:
                    findings.append({"code": "FOOTPRINT_PAD_OVERLAP", "path": f"pads[{i}]", "detail": "Different-number pad bounding boxes overlap; review the draft footprint"})
    return findings


def footprint(spec: dict, name: str) -> str:
    bx, by = spec["package"]["body_x_mm"] / 2, spec["package"]["body_y_mm"] / 2
    lines = [f'(footprint {q(name)} (version 20240108) (generator "prism_component_agent") (layer "F.Cu") (attr smd)',
             ' (property "Reference" "REF**" (at 0 -3 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))',
             f' (property "Value" {q(name)} (at 0 3 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))',
             f' (fp_rect (start {n(-bx)} {n(-by)}) (end {n(bx)} {n(by)}) (stroke (width 0.1) (type default)) (fill none) (layer "F.Fab"))']
    extent_x, extent_y = bx, by
    for pad in spec["pads"]:
        x, y, sx, sy = (pad[k] for k in ("x_mm", "y_mm", "size_x_mm", "size_y_mm"))
        extent_x, extent_y = max(extent_x, abs(x) + sx / 2), max(extent_y, abs(y) + sy / 2)
        ratio = ' (roundrect_rratio 0.25)' if pad["shape"] == "roundrect" else ''
        lines.append(f' (pad {q(pad["number"])} smd {pad["shape"]} (at {n(x)} {n(y)}) (size {n(sx)} {n(sy)}) (layers "F.Cu" "F.Paste" "F.Mask"){ratio})')
    # Fixed candidate clearance is a declared generator policy, to be checked in KLC/engineering review.
    lines.append(f' (fp_rect (start {n(-extent_x - .25)} {n(-extent_y - .25)}) (end {n(extent_x + .25)} {n(extent_y + .25)}) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd"))')
    lines.append(')')
    return "\n".join(lines) + "\n"
