"""
Minimal s-expression surgery for .kicad_pcb files.

Stdlib-only on purpose: keeps this importable from tests without pulling
in the workspace/database stack.
"""

from typing import Optional

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
