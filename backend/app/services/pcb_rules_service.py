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


# The operators a capability constraint can use. ``op`` is stored; ``label`` is
# shown. A capability is {op, value} (gte/lte/bool), {op, min, max} (between), or
# {op, values} (in).
CAPABILITY_OPERATORS: list[dict[str, str]] = [
    {"op": "gte", "label": "at least (≥)"},
    {"op": "lte", "label": "at most (≤)"},
    {"op": "between", "label": "between"},
    {"op": "in", "label": "one of"},
    {"op": "bool", "label": "supported"},
]

# Numeric length fields default to their sensible operator sets.
_MIN_OPS = ["gte", "between"]      # a fab minimum: board must be >= it (or in range)
_MAX_OPS = ["lte", "between"]      # a fab maximum: board must be <= it (or in range)
_RANGE_OPS = ["between", "gte", "lte"]


def _num(key: str, label: str, *, compare: str = "gte", operators: list[str] | None = None) -> dict[str, Any]:
    return {
        "key": key, "label": label, "type": "number", "unit": "mm",
        "compare": compare, "operators": operators or _MIN_OPS,
    }


# The canonical rule/capability fields. ``key`` matches the .kicad_pro rules key
# where one exists, so extraction is a direct copy. ``type`` is "number" (mm),
# "int", "bool" or "text". ``unit`` is shown in the UI. ``compare`` is the field's
# default operator and encodes the board-check direction; ``operators`` are the
# operators the editor offers. Single source of truth for the extractor, the
# capability editor, its display, and evaluation.
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
    {"key": "min_resolved_spokes", "label": "Min thermal spokes", "type": "int",
     "compare": "gte", "operators": _MIN_OPS},
    # A supported layer-count range, and a supported thickness range: both are
    # checked against the board's own extracted layer count / thickness.
    {"key": "layer_count", "label": "Layer count", "type": "int",
     "compare": "between", "operators": _RANGE_OPS},
    {"key": "board_thickness_mm", "label": "Board thickness", "type": "number", "unit": "mm",
     "compare": "between", "operators": _RANGE_OPS},
    {"key": "allow_blind_buried_vias", "label": "Blind/buried vias", "type": "bool",
     "compare": "bool", "operators": ["bool"]},
    {"key": "allow_microvias", "label": "Microvias", "type": "bool",
     "compare": "bool", "operators": ["bool"]},
    {"key": "copper_finish", "label": "Copper finish", "type": "text",
     "compare": "in", "operators": ["in"]},
]

_FIELDS_BY_KEY = {f["key"]: f for f in PCB_RULE_FIELDS}

# The subset copied straight from .kicad_pro board.design_settings.rules (i.e. not
# the board-spec-sourced or capability-only fields).
_PRO_RULE_KEYS = {
    f["key"]
    for f in PCB_RULE_FIELDS
    if f["key"] not in ("layer_count", "board_thickness_mm", "copper_finish")
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
    # Layer count and thickness come from the board-spec extractor (which reads the
    # header robustly), so those capability ranges have a board value to check.
    try:
        from app.services import board_spec_service

        spec = board_spec_service.extract_board_spec(path)
        if "layer_count" in spec:
            rules["layer_count"] = spec["layer_count"]
        if "board_thickness_mm" in spec:
            rules["board_thickness_mm"] = spec["board_thickness_mm"]
    except Exception:
        logger.debug("board-spec extraction for rules failed for %s", path, exc_info=True)
    return rules


# ---------------------------------------------------------------------------
# Capabilities: normalisation and evaluation
# ---------------------------------------------------------------------------


def normalize_capability(key: str, raw: Any) -> dict[str, Any] | None:
    """Coerce a stored capability into ``{op, ...}``. A legacy bare scalar is
    wrapped with the field's default operator; ``None``/empty returns None."""
    if raw is None or raw == "":
        return None
    field = _FIELDS_BY_KEY.get(key)
    default_op = (field or {}).get("compare", "gte")
    if isinstance(raw, dict):
        op = raw.get("op") or default_op
        return {**raw, "op": op}
    # Legacy scalar / bool.
    if isinstance(raw, bool) or default_op == "bool":
        return {"op": "bool", "value": bool(raw)}
    if default_op == "in":
        values = raw if isinstance(raw, list) else [raw]
        return {"op": "in", "values": [str(v) for v in values]}
    return {"op": default_op, "value": raw}


def _as_number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def evaluate_capability(key: str, capability: Any, board_value: Any) -> str:
    """Compare one board value against one capability. Returns
    ``"pass" | "fail" | "unknown"``. Unknown when either side is absent or a
    number cannot be parsed for a numeric operator."""
    cap = normalize_capability(key, capability)
    if cap is None:
        return "unknown"
    op = cap.get("op")

    if op == "bool":
        # The board "needs" the feature when its extracted flag is true. A fab that
        # supports it always passes; one that does not fails only if the board needs it.
        supported = bool(cap.get("value"))
        if board_value is None:
            return "unknown"
        needs = bool(board_value)
        if supported:
            return "pass"
        return "fail" if needs else "pass"

    if op == "in":
        allowed = [str(v).strip().lower() for v in (cap.get("values") or [])]
        if not allowed:
            return "unknown"
        if board_value is None or str(board_value) == "":
            return "unknown"
        return "pass" if str(board_value).strip().lower() in allowed else "fail"

    b = _as_number(board_value)
    if b is None:
        return "unknown"
    if op == "gte":
        v = _as_number(cap.get("value"))
        return "unknown" if v is None else ("pass" if b >= v else "fail")
    if op == "lte":
        v = _as_number(cap.get("value"))
        return "unknown" if v is None else ("pass" if b <= v else "fail")
    if op == "between":
        lo, hi = _as_number(cap.get("min")), _as_number(cap.get("max"))
        if lo is None and hi is None:
            return "unknown"
        if lo is not None and b < lo:
            return "fail"
        if hi is not None and b > hi:
            return "fail"
        return "pass"
    return "unknown"


def evaluate_rules(capabilities: dict[str, Any], board_rules: dict[str, Any]) -> list[dict[str, Any]]:
    """A full comparison row per field that has a capability or a board value, in
    the canonical field order."""
    rows: list[dict[str, Any]] = []
    for field in PCB_RULE_FIELDS:
        key = field["key"]
        cap = capabilities.get(key)
        board_value = board_rules.get(key)
        has_cap = cap is not None and cap != ""
        has_board = key in board_rules and board_value is not None
        if not has_cap and not has_board:
            continue
        rows.append({
            "key": key,
            "label": field["label"],
            "unit": field.get("unit"),
            "capability": normalize_capability(key, cap) if has_cap else None,
            "board_value": board_value if has_board else None,
            "verdict": evaluate_capability(key, cap, board_value),
        })
    return rows
