"""Descriptive metadata for the project card.

Everything here reads a *bounded prefix* of a KiCad file. The header fields --
version, generator, paper, uuid, title block -- all sit in the first few
hundred bytes, so there is never a reason to pull a 57 MB board into memory to
find them.

Board geometry does not live in the header and is not derived here at all. It
comes from ``kicad-cli`` via ``kicad_board_stats_service``; see that module for
why. This one used to scan the whole board for Edge.Cuts graphics, which was
both a second source of truth for a question KiCad already answers and
quadratic enough to saturate a core for minutes on a large design.

Nothing in this module is called from a request handler. The metadata job runs
it once per import or sync and stores the result; the API reads the store.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional


_STRING_PATTERN = r'"((?:[^"\\]|\\.)*)"'

#: How much of a file to read when looking for header fields.
#:
#: A KiCad header -- version, generator, paper, uuid, title_block -- is written
#: first and is a few hundred bytes. 256 KB is three orders of magnitude of
#: slack against that, and still a bounded read on a file that may be tens of
#: megabytes. If a title block ever fell outside it the field comes back None,
#: which is the same answer the old code gave for a file it could not parse.
HEADER_BYTES = 256 * 1024


def _read_header(path: Path) -> Optional[str]:
    """Return the leading slice of a KiCad file, or None if unreadable.

    Decoded with ``errors="ignore"`` because the slice can end mid-character;
    the fields being matched are ASCII, so a dropped tail byte cannot change
    them.
    """
    try:
        with path.open("rb") as handle:
            return handle.read(HEADER_BYTES).decode("utf-8", errors="ignore")
    except OSError:
        return None


def _unescape_kicad_string(value: str) -> str:
    return value.replace(r"\\", "\\").replace(r"\"", '"')


def _extract_sexpr_block(text: str, token: str) -> Optional[str]:
    start = text.find(f"({token}")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    return None


def _extract_string_value(block: str, key: str) -> Optional[str]:
    match = re.search(rf"\({re.escape(key)}\s+{_STRING_PATTERN}\)", block)
    if not match:
        return None
    return _unescape_kicad_string(match.group(1))


def _extract_number_value(block: str, key: str) -> Optional[float]:
    match = re.search(rf"\({re.escape(key)}\s+([-+]?\d+(?:\.\d+)?)\)", block)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _extract_int_value(block: str, key: str) -> Optional[int]:
    value = _extract_number_value(block, key)
    if value is None:
        return None
    return int(value)


def _parse_title_block(text: str) -> Optional[dict]:
    block = _extract_sexpr_block(text, "title_block")
    if not block:
        return None

    comments = {
        index: _unescape_kicad_string(value)
        for index, value in re.findall(rf"\(comment\s+(\d+)\s+{_STRING_PATTERN}\)", block)
    }

    return {
        "title": _extract_string_value(block, "title") or "",
        "date": _extract_string_value(block, "date") or "",
        "rev": _extract_string_value(block, "rev") or "",
        "company": _extract_string_value(block, "company") or "",
        "comments": comments,
    }


def _relative_to_project(project_path: str, file_path: str) -> str:
    return Path(file_path).resolve().relative_to(Path(project_path).resolve()).as_posix()


def _relative_or_name(project_path: str, path: Path) -> str:
    try:
        return _relative_to_project(project_path, str(path))
    except ValueError:
        return path.name


def compute_schematic_metadata(project_path: str, file_path: Optional[str]) -> Optional[dict]:
    """Header metadata for a schematic, from a bounded read."""
    if not file_path:
        return None
    path = Path(file_path)
    text = _read_header(path)
    if text is None:
        return None

    return {
        "path": _relative_or_name(project_path, path),
        "filename": path.name,
        "version": _extract_int_value(text, "version"),
        "generator": _extract_string_value(text, "generator"),
        "generator_version": _extract_string_value(text, "generator_version"),
        "paper": _extract_string_value(text, "paper"),
        "uuid": _extract_string_value(text, "uuid"),
        "title_block": _parse_title_block(text),
    }


def compute_pcb_metadata(
    project_path: str,
    file_path: Optional[str],
    board_facts: Optional[dict] = None,
) -> Optional[dict]:
    """Header metadata for a board, plus whatever kicad-cli reported.

    ``board_facts`` is the reduced ``kicad-cli pcb export stats`` output. It is
    optional so a deployment without the toolchain still gets a populated card
    -- it simply has no size or thickness on it, rather than a size this code
    guessed at.
    """
    if not file_path:
        return None
    path = Path(file_path)
    text = _read_header(path)
    if text is None:
        return None

    facts = board_facts or {}
    return {
        "path": _relative_or_name(project_path, path),
        "filename": path.name,
        "version": _extract_int_value(text, "version"),
        "generator": _extract_string_value(text, "generator"),
        "generator_version": _extract_string_value(text, "generator_version"),
        "paper": _extract_string_value(text, "paper"),
        "dimensions_mm": facts.get("dimensions_mm"),
        "thickness_mm": facts.get("thickness_mm"),
        "title_block": _parse_title_block(text),
    }
