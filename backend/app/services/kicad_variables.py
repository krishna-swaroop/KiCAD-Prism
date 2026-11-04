"""Which KiCad path variables a board and its project name.

A footprint's 3D model, and the project's drawing sheet, are files named
through variables such as `${KICAD10_3DMODEL_DIR}` or `${LSF_KICAD_LIB}`. The
bundle's placements member keeps each model path as written; this reads the
variables out of them. A project can define its own text variables
(`LIB = ${LSF_KICAD_LIB}/3d`), which KiCad expands first, so a path through
`${LIB}` names `LSF_KICAD_LIB` and is counted there.

Pure functions over parsed documents: no file or archive is opened here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

_REFERENCE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$\(([A-Za-z_][A-Za-z0-9_]*)\)")
# `:KICAD10_3DMODEL_DIR:Package_SO/foo.step`, the alias form a path may start with.
_ALIAS = re.compile(r"^:([A-Za-z_][A-Za-z0-9_]*):")
#: KiCad binds this itself: the folder of the project.
BUILT_IN = frozenset({"KIPRJMOD"})
_MAX_DEPTH = 8


@dataclass(frozen=True)
class Referenced:
    """What a board and its project name: models and sheet references per variable."""

    models: Mapping[str, int] = field(default_factory=dict)
    sheets: Mapping[str, int] = field(default_factory=dict)

    @property
    def variables(self) -> list[str]:
        """Every variable named, for the models' fingerprint: a sheet does not change the models."""

        return sorted(self.models)

    @property
    def all_variables(self) -> list[str]:
        return sorted(set(self.models) | set(self.sheets))


def variables_in(path: str, text_variables: Mapping[str, str] | None = None) -> set[str]:
    """The variables a path needs defined from outside the project, expanding the project's own first."""

    found: set[str] = set()
    _collect(path, text_variables or {}, found, set(), 0)
    return found


def _collect(value: str, text_variables: Mapping[str, str], found: set[str], seen: set[str], depth: int) -> None:
    if depth > _MAX_DEPTH or "://" in value and not value.startswith(":"):
        return  # a URI (`kicad-embed://`) names no variable; a cycle or a runaway chain stops here
    names = [match.group(1) or match.group(2) for match in _REFERENCE.finditer(value)]
    alias = _ALIAS.match(value)
    if alias:
        names.append(alias.group(1))
    for name in names:
        if name in BUILT_IN:
            continue
        if name in text_variables:
            if name in seen:
                continue
            _collect(str(text_variables[name]), text_variables, found, seen | {name}, depth + 1)
        else:
            found.add(name)


def project_text_variables(project: Mapping[str, Any] | None) -> dict[str, str]:
    """The `text_variables` of a parsed `.kicad_pro`."""

    variables = project.get("text_variables") if isinstance(project, Mapping) else None
    if not isinstance(variables, Mapping):
        return {}
    return {str(name): str(value) for name, value in variables.items()}


def model_variables(placements: Mapping[str, Any] | None, text_variables: Mapping[str, str] | None = None) -> dict[str, int]:
    """Per variable, how many 3D model references name it (a model naming two counts for each)."""

    counts: dict[str, int] = {}
    footprints = placements.get("footprints") if isinstance(placements, Mapping) else None
    for footprint in footprints or []:
        for model in (footprint.get("models") if isinstance(footprint, Mapping) else None) or []:
            path = model.get("path") if isinstance(model, Mapping) else None
            if not isinstance(path, str) or not path:
                continue
            for name in variables_in(path, text_variables):
                counts[name] = counts.get(name, 0) + 1
    return counts


def sheet_variables(project: Mapping[str, Any] | None, text_variables: Mapping[str, str] | None = None) -> dict[str, int]:
    """Per variable, how many of the project's drawing sheets name it (the board's and the schematic's)."""

    counts: dict[str, int] = {}
    if not isinstance(project, Mapping):
        return counts
    for section in ("pcbnew", "schematic"):
        block = project.get(section)
        sheet = block.get("page_layout_descr_file") if isinstance(block, Mapping) else None
        if isinstance(sheet, str) and sheet:
            for name in variables_in(sheet, text_variables):
                counts[name] = counts.get(name, 0) + 1
    return counts


def referenced(placements: Mapping[str, Any] | None, project: Mapping[str, Any] | None) -> Referenced:
    """The variables a board's models and its project's drawing sheets name."""

    text = project_text_variables(project)
    return Referenced(models=model_variables(placements, text), sheets=sheet_variables(project, text))


def merge(counts: Iterable[Mapping[str, int]]) -> dict[str, int]:
    total: dict[str, int] = {}
    for part in counts:
        for name, count in part.items():
            total[name] = total.get(name, 0) + count
    return total
