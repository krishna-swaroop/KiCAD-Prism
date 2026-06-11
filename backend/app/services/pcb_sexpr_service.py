"""
Minimal s-expression surgery for .kicad_pcb files.

Stdlib-only on purpose: keeps this importable from tests without pulling
in the workspace/database stack.
"""

import math
import re
from typing import List, Optional, Tuple

# Tokens that hold a zone's computed fill geometry. kicad-cli plots the
# stored fills without refilling, so removing these blocks yields
# pour-free exports while the zone outlines (polygon ...) still plot.
_FILL_TOKENS = ("(filled_polygon", "(filled_segments")


def _find_matching_paren(text: str, open_idx: int) -> Optional[int]:
    """
    Return the index of the ')' matching the '(' at open_idx, or None if
    unbalanced. Skips parens inside double-quoted strings (with backslash
    escapes), which .kicad_pcb property values may contain.
    """
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == '"':
            i += 1
            while i < n:
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == '"':
                    break
                i += 1
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def _is_token_boundary(text: str, token_start: int, token: str) -> bool:
    """True if the token name is not just a prefix of a longer name."""
    end = token_start + len(token)
    return end >= len(text) or not (text[end].isalnum() or text[end] == '_')


def strip_zone_fills(pcb_text: str) -> str:
    """
    Remove all (filled_polygon ...) and (filled_segments ...) blocks.

    These tokens only occur inside (zone ...) elements in the .kicad_pcb
    format, so no enclosing-zone check is needed. Zones on any layer
    (copper or otherwise) are stripped — the toggle means "hide all
    pours". Unfilled zones keep their (polygon ...) outline.
    """
    out_parts = []
    pos = 0
    n = len(pcb_text)
    while pos < n:
        # Find the nearest fill token, skipping quoted strings so a token
        # appearing inside a property value is left alone.
        next_idx = None
        i = pos
        while i < n:
            ch = pcb_text[i]
            if ch == '"':
                i += 1
                while i < n:
                    if pcb_text[i] == '\\':
                        i += 2
                        continue
                    if pcb_text[i] == '"':
                        break
                    i += 1
                i += 1
                continue
            if ch == '(':
                for token in _FILL_TOKENS:
                    if pcb_text.startswith(token, i) and _is_token_boundary(pcb_text, i, token):
                        next_idx = i
                        break
                if next_idx is not None:
                    break
            i += 1

        if next_idx is None:
            out_parts.append(pcb_text[pos:])
            break

        close_idx = _find_matching_paren(pcb_text, next_idx)
        if close_idx is None:
            # Unbalanced file: bail out and keep the remainder untouched.
            out_parts.append(pcb_text[pos:])
            break

        out_parts.append(pcb_text[pos:next_idx])
        pos = close_idx + 1
        # Drop trailing whitespace left behind on the line we removed from.
        while pos < n and pcb_text[pos] in ' \t':
            pos += 1
        if pos < n and pcb_text[pos] == '\n':
            pos += 1

    return "".join(out_parts)


# Board-level graphic elements that can form the board outline. Footprint
# graphics (fp_line etc.) on Edge.Cuts are intentionally ignored — they
# would need the footprint's position/rotation applied.
_OUTLINE_TOKENS = ("(gr_line", "(gr_arc", "(gr_rect", "(gr_circle", "(gr_poly", "(gr_curve")

_COORD_RE = re.compile(r'\((?:start|end|mid|center|xy)\s+(-?[\d.]+)\s+(-?[\d.]+)')
_CENTER_RE = re.compile(r'\(center\s+(-?[\d.]+)\s+(-?[\d.]+)')
_END_RE = re.compile(r'\(end\s+(-?[\d.]+)\s+(-?[\d.]+)')
# Layer names are quoted in modern files, bare in legacy (pre-v6) ones.
_EDGE_LAYER_RE = re.compile(r'\(layer\s+"?Edge\.Cuts"?\s*\)')


def edge_cuts_bbox(pcb_text: str) -> Optional[Tuple[float, float, float, float]]:
    """
    Bounding box (min_x, min_y, max_x, max_y) in mm of the board-level
    Edge.Cuts graphics, or None if no outline geometry is found.

    Arcs are approximated by their start/mid/end points and bezier curves
    by their control hull; both can only be off by a fraction of the
    plot margin, which is fine for anchoring diff exports.
    """
    points: List[Tuple[float, float]] = []
    pos = 0
    n = len(pcb_text)
    while pos < n:
        next_idx = None
        token_hit = None
        for token in _OUTLINE_TOKENS:
            idx = pcb_text.find(token, pos)
            if idx != -1 and (next_idx is None or idx < next_idx):
                if _is_token_boundary(pcb_text, idx, token):
                    next_idx = idx
                    token_hit = token
        if next_idx is None:
            break

        close_idx = _find_matching_paren(pcb_text, next_idx)
        if close_idx is None:
            break
        block = pcb_text[next_idx:close_idx + 1]
        pos = close_idx + 1

        if not _EDGE_LAYER_RE.search(block):
            continue

        if token_hit == "(gr_circle":
            center = _CENTER_RE.search(block)
            end = _END_RE.search(block)
            if center and end:
                cx, cy = float(center.group(1)), float(center.group(2))
                r = math.dist((cx, cy), (float(end.group(1)), float(end.group(2))))
                points.extend([(cx - r, cy - r), (cx + r, cy + r)])
            continue

        for m in _COORD_RE.finditer(block):
            points.append((float(m.group(1)), float(m.group(2))))

    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))
