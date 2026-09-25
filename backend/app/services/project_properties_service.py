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
from dataclasses import replace
from pathlib import Path
from typing import Mapping, Optional

from app.services import kicad_text_variables


_STRING_PATTERN = r'"((?:[^"\\]|\\.)*)"'

#: KiCad's title block carries nine numbered comment fields.
_COMMENT_COUNT = 9

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


def _iter_top_level_blocks(text: str, token: str) -> list[str]:
    """Every direct child ``(token ...)`` block of the document root.

    The root token itself is depth one, so its children sit at depth two.
    Footprints and symbols carry their own ``(property ...)`` entries deeper
    than that; only the document's own entries are returned.
    """
    marker = f"({token}"
    boundary = ' \t\r\n"'

    blocks: list[str] = []
    depth = 0
    in_string = False
    escaped = False

    for index, char in enumerate(text):
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
            after = index + len(marker)
            if (
                depth == 2
                and text.startswith(marker, index)
                and after < len(text)
                and text[after] in boundary
            ):
                block = _extract_sexpr_block(text[index:], token)
                if block is not None:
                    blocks.append(block)
        elif char == ")":
            depth -= 1

    return blocks


def _extract_document_properties(text: str) -> dict[str, str]:
    """Top-level ``(property "NAME" "VALUE")`` entries of a document.

    KiCad 8+ writes the project's text variables into the board as these
    entries, so the board still resolves when opened without its sidecar
    ``.kicad_pro``. They are a fallback: the project's live values take
    precedence.
    """
    properties: dict[str, str] = {}
    for block in _iter_top_level_blocks(text, "property"):
        match = re.match(
            rf"\(\s*property\s+{_STRING_PATTERN}\s+{_STRING_PATTERN}", block
        )
        if not match:
            continue
        name = _unescape_kicad_string(match.group(1))
        if name:
            properties[name] = _unescape_kicad_string(match.group(2))
    return properties


def _title_block_fields(block: str) -> dict[str, str]:
    """The title block's fields under the names KiCad's variables use."""
    fields = {
        "TITLE": _extract_string_value(block, "title") or "",
        "ISSUE_DATE": _extract_string_value(block, "date") or "",
        "REVISION": _extract_string_value(block, "rev") or "",
        "COMPANY": _extract_string_value(block, "company") or "",
    }
    for number in range(1, _COMMENT_COUNT + 1):
        fields[f"COMMENT{number}"] = (
            _extract_string_value(block, f"comment {number}") or ""
        )
    return fields


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


def _document_context(
    text: str,
    path: Path,
    *,
    project_variables: Optional[Mapping[str, str]] = None,
    project_name: Optional[str] = None,
) -> kicad_text_variables.TextVariableContext:
    """The variables one document's title block may reference.

    Read once per file so the schematic and the board are expanded from the
    same project. The title block fields are not known yet; ``_parse_title_block``
    layers them in per block.
    """
    return kicad_text_variables.TextVariableContext(
        filename=path.name,
        project_name=project_name or "",
        project_variables=project_variables or {},
        document_properties=_extract_document_properties(text),
    )


def _parse_title_block(
    text: str, context: kicad_text_variables.TextVariableContext
) -> Optional[dict]:
    """The title block, reduced to the two fields the panel shows.

    KiCad's block also carries rev, company and numbered comments. Prism
    extracted all of them and rendered none, so they were payload nobody read
    and parsing nobody needed. Narrowed to what the properties panel actually
    displays: the title, which is its heading for the board, and the date.

    The two fields are expanded through the project's text variables before
    they leave here. KiCad authors title blocks out of them -- a board may read
    ``(title "${TITLE}")`` with the value in its ``.kicad_pro`` -- and the
    viewer already renders the resolved value; returning the raw reference made
    the card disagree with the board beside it.
    """
    block = _extract_sexpr_block(text, "title_block")
    if not block:
        return None

    raw_title = _extract_string_value(block, "title") or ""
    raw_date = _extract_string_value(block, "date") or ""
    resolved = replace(context, title_block_fields=_title_block_fields(block))
    return {
        "title": resolved.expand(raw_title),
        "date": resolved.expand(raw_date),
    }


def _relative_to_project(project_path: str, file_path: str) -> str:
    return Path(file_path).resolve().relative_to(Path(project_path).resolve()).as_posix()


def _relative_or_name(project_path: str, path: Path) -> str:
    try:
        return _relative_to_project(project_path, str(path))
    except ValueError:
        return path.name


def compute_schematic_metadata(
    project_path: str,
    file_path: Optional[str],
    *,
    project_variables: Optional[Mapping[str, str]] = None,
    project_name: Optional[str] = None,
) -> Optional[dict]:
    """Header metadata for a schematic, from a bounded read.

    ``project_variables`` are the sidecar ``.kicad_pro``'s ``text_variables``.
    The caller resolves the project once and passes the same map to both
    documents, so a card cannot show the schematic and the board expanded from
    different projects.
    """
    if not file_path:
        return None
    path = Path(file_path)
    text = _read_header(path)
    if text is None:
        return None

    context = _document_context(
        text,
        path,
        project_variables=project_variables,
        project_name=project_name,
    )
    return {
        "path": _relative_or_name(project_path, path),
        "filename": path.name,
        "version": _extract_int_value(text, "version"),
        "generator": _extract_string_value(text, "generator"),
        "generator_version": _extract_string_value(text, "generator_version"),
        "title_block": _parse_title_block(text, context),
    }


def compute_pcb_metadata(
    project_path: str,
    file_path: Optional[str],
    board_facts: Optional[dict] = None,
    *,
    project_variables: Optional[Mapping[str, str]] = None,
    project_name: Optional[str] = None,
) -> Optional[dict]:
    """Header metadata for a board, plus whatever kicad-cli reported.

    ``board_facts`` is the reduced ``kicad-cli pcb export stats`` output. It is
    optional so a deployment without the toolchain still gets a populated card
    -- it simply has no size or thickness on it, rather than a size this code
    guessed at.

    ``project_variables`` are the sidecar ``.kicad_pro``'s ``text_variables``,
    passed through to the title block expansion.
    """
    if not file_path:
        return None
    path = Path(file_path)
    text = _read_header(path)
    if text is None:
        return None

    context = _document_context(
        text,
        path,
        project_variables=project_variables,
        project_name=project_name,
    )
    facts = board_facts or {}
    return {
        "path": _relative_or_name(project_path, path),
        "filename": path.name,
        "version": _extract_int_value(text, "version"),
        "generator": _extract_string_value(text, "generator"),
        "generator_version": _extract_string_value(text, "generator_version"),
        "dimensions_mm": facts.get("dimensions_mm"),
        "thickness_mm": facts.get("thickness_mm"),
        "title_block": _parse_title_block(text, context),
    }
