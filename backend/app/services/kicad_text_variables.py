"""Expand KiCad ``${NAME}`` text variables in stored metadata.

A title block is routinely authored out of variables -- ``(title "${TITLE}")``,
``(date "${DATE}")`` -- with the values defined in the project's sidecar
``.kicad_pro`` under ``text_variables``. The ECAD viewer expands them before
painting; the properties endpoint keeps its own copy of the title block, so it
has to expand them the same way or the card shows a reference the viewer has
already resolved.

The algorithm mirrors ``expand_text_vars``/``substitute_text_vars`` in
``ecad-viewer/packages/ecad-viewer-app/src/kicad/common.ts``: substitute
repeatedly so a value that is itself a variable resolves, cap the recursion so
``A -> ${B} -> ${A}`` cannot loop, and leave any reference that does not
resolve exactly as written. A visible ``${FOO}`` is a better failure than a
silently blank title. The viewer is the reference because the card sits beside
it; ``kicad_monkey`` carries a single-pass helper for its own renderers, which
does not resolve the indirection KiCad and the viewer do.

Precedence for one document, highest last:

1. Title block fields, under the names KiCad's own variables use --
   ``ISSUE_DATE``, ``REVISION``, ``TITLE``, ``COMPANY``, ``COMMENT1..9``.
2. Top-level ``(property "NAME" "VALUE")`` entries in the document. KiCad 8+
   writes a copy of the project's variables into boards this way, so a board
   still resolves when it is opened without its project.
3. The project's ``text_variables`` from the sidecar ``.kicad_pro``. The
   project is authoritative over the board's cached copy, exactly as in the
   viewer: the copy pins a board to whatever the variables were when it was
   last saved.
4. ``FILENAME`` and ``PROJECTNAME``, which KiCad resolves from the file itself
   and which nothing may shadow.

Only built-ins that are deterministic from the files on disk are resolved.
Time-dependent ones (``CURRENT_DATE`` and friends) stay visible on purpose:
metadata is computed once and stored, so a timestamp baked in at import would
silently go stale.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Mapping

#: Matches ``MAX_TEXT_VAR_DEPTH`` in the viewer's ``common.ts``.
MAX_TEXT_VARIABLE_DEPTH = 10

_VARIABLE_PATTERN = re.compile(r"\$\{(.+?)\}")


def _substitute(text: str, variables: Mapping[str, str], depth: int) -> str:
    def replace(match: re.Match[str]) -> str:
        value = variables.get(match.group(1))
        if value is None:
            return match.group(0)
        if depth >= MAX_TEXT_VARIABLE_DEPTH:
            return value
        return _substitute(value, variables, depth + 1)

    return _VARIABLE_PATTERN.sub(replace, text)


def expand_text_variables(text: str, variables: Mapping[str, str]) -> str:
    """Substitute ``${NAME}`` references in ``text``.

    Names are matched exactly, as the viewer matches them. Unknown references
    are returned unchanged.
    """
    if not text or "${" not in text:
        return text
    return _substitute(text, variables, 0)


@dataclass(frozen=True)
class TextVariableContext:
    """The layers one document resolves a ``${NAME}`` from."""

    filename: str = ""
    project_name: str = ""
    project_variables: Mapping[str, str] = field(default_factory=dict)
    document_properties: Mapping[str, str] = field(default_factory=dict)
    title_block_fields: Mapping[str, str] = field(default_factory=dict)

    def expand(self, text: str) -> str:
        variables: dict[str, str] = {}
        variables.update(self.title_block_fields)
        variables.update(self.document_properties)
        variables.update(self.project_variables)
        if self.project_name:
            variables["PROJECTNAME"] = self.project_name
        if self.filename:
            variables["FILENAME"] = self.filename
        return expand_text_variables(text, variables)


__all__ = [
    "MAX_TEXT_VARIABLE_DEPTH",
    "TextVariableContext",
    "expand_text_variables",
]
