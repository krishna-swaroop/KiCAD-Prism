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


def _num(key: str, label: str) -> dict[str, Any]:
    return {"key": key, "label": label, "type": "number", "unit": "mm"}


# The canonical rule/capability fields. Every one is a manufacturer *minimum* the
# board must meet, stored as a single number (mm), so no operator is needed.
# ``key`` matches the .kicad_pro rules key so extraction is a direct copy. Single
# source of truth for the extractor, the capability editor and its display.
PCB_RULE_FIELDS: list[dict[str, Any]] = [
    _num("min_track_width", "Min track width"),
    _num("min_clearance", "Min clearance"),
    _num("min_connection", "Min connection width"),
    _num("min_via_diameter", "Min via diameter"),
    _num("min_via_annular_width", "Min via annular ring"),
    _num("min_through_hole_diameter", "Min through-hole diameter"),
    _num("min_hole_clearance", "Min hole clearance"),
    _num("min_hole_to_hole", "Min hole to hole"),
    _num("min_copper_edge_clearance", "Min copper to edge"),
    _num("min_microvia_diameter", "Min microvia diameter"),
    _num("min_microvia_drill", "Min microvia drill"),
    _num("min_silk_clearance", "Min silkscreen clearance"),
    _num("min_text_height", "Min text height"),
    _num("min_text_thickness", "Min text thickness"),
    _num("min_groove_width", "Min groove width"),
    _num("solder_mask_to_copper_clearance", "Mask to copper clearance"),
    {"key": "min_resolved_spokes", "label": "Min thermal spokes", "type": "int"},
]

# All rule keys are copied straight from .kicad_pro board.design_settings.rules.
_PRO_RULE_KEYS = {f["key"] for f in PCB_RULE_FIELDS}

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
    # The stackup copper finish is not a min-rule, but it is a useful board fact to
    # show; keep it out of the min-capability set but leave extraction here harmless.
    try:
        rules.update(_finish_from_setup(path))
    except Exception:
        logger.debug("setup finish extraction failed for %s", path, exc_info=True)
    return rules
