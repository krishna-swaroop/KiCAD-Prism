"""The board's solder mask and paste colours as KiCad states them.

KiCad keeps a mask colour on the stackup's ``F.Mask``/``B.Mask`` layers: a
name ("Green", "Black", ...) or a custom ``#RRGGBBAA``. A board without one
shows KiCad's default green. The colours are linear RGBA, as glTF materials
take them, so the analytic board and the mesh mask agree.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

MASK_COLORS = {
    "green": [0.06, 0.16, 0.11, 0.83],
    "red": [0.52, 0.05, 0.05, 0.83],
    "blue": [0.05, 0.12, 0.42, 0.83],
    "black": [0.05, 0.05, 0.05, 0.85],
    "white": [0.9, 0.9, 0.9, 0.83],
    "purple": [0.3, 0.1, 0.4, 0.83],
    "yellow": [0.7, 0.62, 0.1, 0.83],
}
PASTE_COLOR = [0.62, 0.63, 0.65, 1.0]
_MASK_LAYER = re.compile(r'\(layer\s+"([FB])\.Mask"')
_COLOR = re.compile(r'\(color\s+"([^"]*)"\)')


def _stackup_text(text: str) -> str:
    """The balanced ``(stackup ...)`` form, or "" when the board has none."""

    start = text.find("(stackup")
    if start < 0:
        return ""
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return ""


def stackup_mask_colors(text: str) -> dict[str, str]:
    """``{"front"|"back": colour}`` for each mask layer the stackup colours."""

    stackup = _stackup_text(text)
    colors: dict[str, str] = {}
    for match in _MASK_LAYER.finditer(stackup):
        # The layer's own form runs to the next "(layer"; its colour is inside it.
        following = stackup.find("(layer", match.end())
        color = _COLOR.search(stackup, match.end(), following if following >= 0 else len(stackup))
        if color:
            colors["front" if match.group(1) == "F" else "back"] = color.group(1)
    return colors


def _linear(channel: int) -> float:
    value = channel / 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def mask_rgba(color: str) -> list[float]:
    """A KiCad mask colour (name or ``#RRGGBB[AA]``) as linear RGBA; green when unknown."""

    value = color.strip().lower()
    if re.fullmatch(r"#[0-9a-f]{6}([0-9a-f]{2})?", value):
        channels = [int(value[i:i + 2], 16) for i in range(1, len(value), 2)]
        alpha = channels[3] / 255.0 if len(channels) == 4 else MASK_COLORS["green"][3]
        return [round(_linear(channel), 4) for channel in channels[:3]] + [round(alpha, 4)]
    return list(MASK_COLORS.get(value, MASK_COLORS["green"]))


def board_looks(pcb_file: Path) -> dict[str, Any]:
    """Mask colour per side and the paste colour, from the board's stackup."""

    try:
        text = pcb_file.read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = ""
    colors = stackup_mask_colors(text)
    front = mask_rgba(colors.get("front", ""))
    return {
        "soldermask": {"front": front, "back": mask_rgba(colors.get("back", colors.get("front", "")))},
        "paste": PASTE_COLOR,
    }
