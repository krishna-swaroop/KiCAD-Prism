"""Read a board's fabrication rules, and define the canonical rule field set.

KiCad's Board Setup > Design Rules / Constraints holds the numbers a fab house
must be able to build to: minimum track width, clearances, drill and via sizes,
and so on. Those values live in the project's ``.kicad_pro`` (the authoritative
``board.design_settings.rules`` block), with a sibling ``.kicad_dru`` for custom
rules and the board's own ``(setup)`` block for the stackup finish.

This module reads them (never failing on an unusual board, like
``board_spec_service``) and defines ``PCB_RULE_FIELDS`` once: the same field list
drives extraction, the manufacturer-capability form, and its read-only display,
so the three never drift apart.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Bounded prefix to scan for the board (setup) stackup finish. The block sits at
# the top of a .kicad_pcb, so we never read a multi-megabyte board in full.
_SETUP_SCAN_BYTES = 200_000


# The canonical rule/capability fields. ``key`` matches the .kicad_pro rules key
# where one exists, so extraction is a direct copy. ``type`` is "number" (mm),
# "int", "bool" or "text". ``unit`` is shown in the UI. This list is the single
# source of truth for the extractor, the capability editor and its display.
PCB_RULE_FIELDS: list[dict[str, Any]] = [
    {"key": "min_track_width", "label": "Min track width", "type": "number", "unit": "mm"},
    {"key": "min_clearance", "label": "Min clearance", "type": "number", "unit": "mm"},
    {"key": "min_connection", "label": "Min connection width", "type": "number", "unit": "mm"},
    {"key": "min_via_diameter", "label": "Min via diameter", "type": "number", "unit": "mm"},
    {"key": "min_via_annular_width", "label": "Min via annular ring", "type": "number", "unit": "mm"},
    {"key": "min_through_hole_diameter", "label": "Min through-hole diameter", "type": "number", "unit": "mm"},
    {"key": "min_hole_clearance", "label": "Min hole clearance", "type": "number", "unit": "mm"},
    {"key": "min_hole_to_hole", "label": "Min hole to hole", "type": "number", "unit": "mm"},
    {"key": "min_copper_edge_clearance", "label": "Min copper to edge", "type": "number", "unit": "mm"},
    {"key": "min_microvia_diameter", "label": "Min microvia diameter", "type": "number", "unit": "mm"},
    {"key": "min_microvia_drill", "label": "Min microvia drill", "type": "number", "unit": "mm"},
    {"key": "min_silk_clearance", "label": "Min silkscreen clearance", "type": "number", "unit": "mm"},
    {"key": "min_text_height", "label": "Min text height", "type": "number", "unit": "mm"},
    {"key": "min_text_thickness", "label": "Min text thickness", "type": "number", "unit": "mm"},
    {"key": "min_groove_width", "label": "Min groove width", "type": "number", "unit": "mm"},
    {"key": "solder_mask_to_copper_clearance", "label": "Mask to copper clearance", "type": "number", "unit": "mm"},
    {"key": "min_resolved_spokes", "label": "Min thermal spokes", "type": "int"},
    {"key": "allow_blind_buried_vias", "label": "Blind/buried vias", "type": "bool"},
    {"key": "allow_microvias", "label": "Microvias", "type": "bool"},
    # Capability-only / stackup-sourced: not a .kicad_pro rules key.
    {"key": "max_layer_count", "label": "Max layer count", "type": "int"},
    {"key": "copper_finish", "label": "Copper finish", "type": "text"},
]

# The subset copied straight from .kicad_pro board.design_settings.rules.
_PRO_RULE_KEYS = {
    f["key"]
    for f in PCB_RULE_FIELDS
    if f["key"] not in ("max_layer_count", "copper_finish")
}

# Fields whose value is a whole number.
_INT_KEYS = {f["key"] for f in PCB_RULE_FIELDS if f["type"] == "int"}


def _sibling(pcb_path: Path, suffix: str) -> Path:
    """The sibling file sharing the board's basename (``foo.kicad_pcb`` ->
    ``foo.kicad_pro`` / ``foo.kicad_dru``)."""
    return pcb_path.with_suffix(suffix)


def _rules_from_pro(pcb_path: Path) -> dict[str, Any]:
    pro = _sibling(pcb_path, ".kicad_pro")
    if not pro.is_file():
        return {}
    try:
        data = json.loads(pro.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        logger.debug("could not read .kicad_pro rules for %s", pro, exc_info=True)
        return {}
    rules = (((data or {}).get("board") or {}).get("design_settings") or {}).get("rules") or {}
    out: dict[str, Any] = {}
    for key in _PRO_RULE_KEYS:
        if key not in rules:
            continue
        value = rules[key]
        if isinstance(value, bool):
            out[key] = value
        elif isinstance(value, (int, float)):
            # Rounded to KiCad's practical precision; drop the placeholder 0s that
            # mean "no constraint" so they do not read as a real 0mm rule.
            num = round(float(value), 4)
            if num > 0:
                out[key] = int(num) if key in _INT_KEYS else num
    return out


def _rules_from_dru(pcb_path: Path) -> dict[str, Any]:
    """Simple ``(constraint <kind> (min X))`` rules from a .kicad_dru, mapped onto
    our keys. Only the common track/clearance/hole constraints are recognised."""
    dru = _sibling(pcb_path, ".kicad_dru")
    if not dru.is_file():
        return {}
    try:
        text = dru.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return {}
    # (constraint track_width (min 0.15mm)) -> min_track_width
    kind_to_key = {
        "track_width": "min_track_width",
        "clearance": "min_clearance",
        "hole_clearance": "min_hole_clearance",
        "hole_size": "min_through_hole_diameter",
        "via_diameter": "min_via_diameter",
        "annular_width": "min_via_annular_width",
        "edge_clearance": "min_copper_edge_clearance",
        "silk_clearance": "min_silk_clearance",
        "text_height": "min_text_height",
        "text_thickness": "min_text_thickness",
    }
    out: dict[str, Any] = {}
    for kind, value in re.findall(
        r"\(constraint\s+(\w+)\s*\(min\s+([0-9.]+)\s*mm?\)", text
    ):
        key = kind_to_key.get(kind)
        if not key:
            continue
        try:
            num = round(float(value), 4)
        except ValueError:
            continue
        if num > 0:
            out[key] = num
    return out


def _finish_from_setup(pcb_path: Path) -> dict[str, Any]:
    try:
        with pcb_path.open(encoding="utf-8", errors="replace") as handle:
            text = handle.read(_SETUP_SCAN_BYTES)
    except Exception:
        return {}
    finish = re.search(r"\(copper_finish\s+\"([^\"]+)\"", text)
    return {"copper_finish": finish.group(1)} if finish else {}


def extract_pcb_rules(pcb_path: str | Path) -> dict[str, Any]:
    """Return the fabrication rules readable from a board, as ``{key: value}``.

    Priority: the .kicad_pro rules block (authoritative), then the .kicad_dru for
    any keys it did not carry, then the board stackup for the copper finish. Only
    fields actually found are present; unknown ones are absent. Never raises.
    """
    path = Path(pcb_path)
    if not path.is_file():
        return {}

    rules: dict[str, Any] = {}
    try:
        rules.update(_rules_from_pro(path))
    except Exception:
        logger.debug("pro rule extraction failed for %s", path, exc_info=True)
    try:
        for key, value in _rules_from_dru(path).items():
            rules.setdefault(key, value)  # pro wins; dru fills gaps
    except Exception:
        logger.debug("dru rule extraction failed for %s", path, exc_info=True)
    try:
        rules.update(_finish_from_setup(path))
    except Exception:
        logger.debug("setup finish extraction failed for %s", path, exc_info=True)
    return rules
