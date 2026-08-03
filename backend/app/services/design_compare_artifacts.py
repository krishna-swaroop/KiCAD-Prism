"""Manufacturing artifacts: the board stackup and the fabrication output.

Neither is a design object, so neither goes through the object diff. The stackup
is read straight out of the board file's own s-expressions, and the fabrication
comparison comes back from the plotted Gerbers.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.services import fabrication_compare_service, semantic_index_service
from .design_compare_sources import _find_pcb


def _iter_sexpr_blocks(text: str, kind: str):
    """Yield bounded KiCad S-expressions without catastrophic cross-file regexes."""
    pattern = re.compile(rf"\({re.escape(kind)}(?=\s|\))")
    for match in pattern.finditer(text):
        end = semantic_index_service._balanced_s_expression_end(text, match.start())
        if end is not None:
            yield text[match.start():end]


def _extract_stackup(snap: Path) -> Dict[str, Any]:
    # Shares the fabrication pass's board lookup: two selection rules over the
    # same snapshot let a multi-board repository report a stackup from one board
    # and Gerbers from another, with nothing saying which was chosen.
    pcb = _find_pcb(snap)
    if not pcb:
        return {"present": False, "layers": [], "settings": {}}
    text = pcb.read_text(encoding="utf-8", errors="replace")
    # Prefer (stackup ...) block layers. Parse each (layer ...) form independently so
    # fields like (color ...) between (type ...) and (thickness ...) are tolerated.
    layers: List[Dict[str, Any]] = []
    stackup_start = re.search(r"\(stackup(?=\s|\))", text)
    stackup_end = (
        semantic_index_service._balanced_s_expression_end(text, stackup_start.start())
        if stackup_start
        else None
    )
    body = text[stackup_start.start():stackup_end] if stackup_start and stackup_end else ""

    def quoted_field(block: str, field: str) -> Optional[str]:
        match = re.search(rf'\({re.escape(field)}\s+"([^"]*)"\)', block)
        return match.group(1) if match else None

    def numeric_field(block: str, field: str) -> Optional[float]:
        match = re.search(rf"\({re.escape(field)}\s+([-+0-9.eE]+)\)", block)
        return float(match.group(1)) if match else None

    for layer_block in _iter_sexpr_blocks(body, "layer"):
        name_match = re.match(r'\(layer\s+"([^"]+)"', layer_block)
        if not name_match:
            continue
        type_match = re.search(r'\(type\s+"([^"]*)"\)', layer_block)
        thickness_match = re.search(r"\(thickness\s+([-+0-9.eE]+)\)", layer_block)
        layers.append(
            {
                "name": name_match.group(1),
                "type": type_match.group(1) if type_match else "",
                "thickness": float(thickness_match.group(1)) if thickness_match else None,
                "material": quoted_field(layer_block, "material"),
                "color": quoted_field(layer_block, "color"),
                "epsilon_r": numeric_field(layer_block, "epsilon_r"),
                "loss_tangent": numeric_field(layer_block, "loss_tangent"),
            }
        )
    if not layers:
        # Fallback: board layer table
        for m in re.finditer(r'\(\s*(\d+)\s+"([^"]+)"\s+"([^"]+)"', text):
            layers.append({"name": m.group(2), "type": m.group(3), "ordinal": int(m.group(1))})
    finish = quoted_field(body, "copper_finish")
    dielectric_match = re.search(r"\(dielectric_constraints\s+(yes|no)\)", body)
    settings = {
        "copper_finish": finish,
        "dielectric_constraints": (
            dielectric_match.group(1) == "yes" if dielectric_match else None
        ),
    }
    return {"present": bool(layers), "layers": layers, "settings": settings}


def _diff_stackup(base: Dict[str, Any], head: Dict[str, Any]) -> Dict[str, Any]:
    base_layers = base.get("layers") or []
    head_layers = head.get("layers") or []
    base_settings = base.get("settings") or {}
    head_settings = head.get("settings") or {}
    return {
        "base": base_layers,
        "head": head_layers,
        "base_settings": base_settings,
        "head_settings": head_settings,
        "changed": (
            json.dumps(base_layers, sort_keys=True) != json.dumps(head_layers, sort_keys=True)
            or json.dumps(base_settings, sort_keys=True)
            != json.dumps(head_settings, sort_keys=True)
        ),
        "present": bool(base.get("present") or head.get("present")),
    }


def _empty_fabrication(*warnings: str) -> Dict[str, Any]:
    """The fabrication domain with nothing to show yet, or nothing to show.

    The partial result is published while the PCB pass is still running, so the
    reviewer reads this shape before any Gerber has been plotted. Deriving it
    from the comparison engine rather than re-authoring it keeps one definition
    of the payload: a placeholder that drifts from the real thing takes the
    whole Design Comparison view down mid-render, not just this tab.
    """

    return {
        **fabrication_compare_service.compare_layers([], []),
        "warnings": sorted(set(warnings)),
    }


def _diff_fabrication(
    base_rev: Dict[str, Any],
    head_rev: Dict[str, Any],
    render_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Compare the two revisions' plotted Gerber packages, if both exist."""

    base_export = base_rev.get("fabrication") or {}
    head_export = head_rev.get("fabrication") or {}
    reasons = [
        str(export.get("reason") or "fabrication output unavailable")
        for export in (base_export, head_export)
        if not export.get("present")
    ]
    if reasons:
        return _empty_fabrication(*reasons)
    base_dir = Path(str(base_export.get("dir")))
    head_dir = Path(str(head_export.get("dir")))
    if not base_dir.is_dir() or not head_dir.is_dir():
        return _empty_fabrication("cached fabrication output was removed")
    comparison = fabrication_compare_service.compare_directories(
        base_dir, head_dir, render_dir
    )
    export_warnings = [
        warning
        for export in (base_export, head_export)
        for warning in (export.get("warnings") or [])
    ]
    if export_warnings:
        comparison["warnings"] = sorted(
            set(comparison.get("warnings") or []) | set(export_warnings)
        )
    return comparison


def _manifest_entry(prepared: Any) -> Dict[str, Any]:
    return {
        "digest": prepared.digest,
        "sizeBytes": prepared.size_bytes,
        "mediaType": prepared.media_type,
    }
