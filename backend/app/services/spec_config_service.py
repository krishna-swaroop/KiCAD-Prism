"""Parse a project's manufacturing spec schema from a small ``.config`` syntax.

The per-project Manufacturing tab is driven by a user-defined schema rather than a
fixed field set: a team decides which specs matter for their boards and writes them
in a ``.config`` file, edited in the web editor. This module turns that text into a
structured schema the form renders from.

The syntax is deliberately tiny and forgiving, closer to an INI file than a
programming language:

    # a comment
    [Section name]
    layer_count: int
    board_thickness_mm: number = 1.6
    solder_mask_color: text
    impedance_controlled: bool
    surface_finish: choice(HASL, ENIG, OSP)   # a dropdown

Rules:
  * ``[Name]`` opens a section. Fields before any section go in a default one.
  * ``key: type`` declares a field. ``key`` is the stable identifier the saved
    value is stored under; it is also matched against the board extractor's
    well-known keys, so naming a field ``layer_count`` makes Extract fill it.
  * ``type`` is one of: text, int, number, bool, choice(a, b, c).
  * ``= value`` after the type sets a default (optional).
  * A human label defaults to the key humanised, or can be given with ``| Label``.

Parsing never raises for a bad line; it collects errors and returns them alongside
whatever it could parse, so the editor can show them inline without losing the rest.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# The field types the editor and form understand.
FIELD_TYPES = ("text", "int", "number", "bool", "choice")

_SECTION_RE = re.compile(r"^\[(?P<name>.+)\]$")
_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_CHOICE_RE = re.compile(r"^choice\((?P<opts>.*)\)$", re.IGNORECASE)


@dataclass
class SpecFieldDef:
    key: str
    label: str
    type: str
    options: list[str] = field(default_factory=list)
    default: Any = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "options": self.options,
            "default": self.default,
        }


@dataclass
class SpecSectionDef:
    title: str
    fields: list[SpecFieldDef] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"title": self.title, "fields": [f.to_dict() for f in self.fields]}


@dataclass
class ParsedSpecConfig:
    sections: list[SpecSectionDef]
    errors: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "sections": [s.to_dict() for s in self.sections],
            "errors": self.errors,
        }


def _humanise(key: str) -> str:
    """`board_thickness_mm` -> `Board thickness mm`."""
    words = key.replace("_", " ").strip()
    return words[:1].upper() + words[1:] if words else key


def _coerce_default(raw: str, type_name: str) -> Any:
    raw = raw.strip()
    if type_name == "int":
        try:
            return int(raw)
        except ValueError:
            return None
    if type_name == "number":
        try:
            return float(raw)
        except ValueError:
            return None
    if type_name == "bool":
        return raw.lower() in ("true", "yes", "1", "on")
    return raw


def parse_spec_config(text: str) -> ParsedSpecConfig:
    """Parse the ``.config`` text into sections of typed fields, plus any errors."""
    sections: list[SpecSectionDef] = []
    errors: list[str] = []
    seen_keys: set[str] = set()

    # Fields declared before any [Section] land in this implicit one, created only
    # if actually used so a config that opens with a section has no empty leader.
    default_section = SpecSectionDef(title="Specifications")
    current = default_section

    for lineno, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        section_match = _SECTION_RE.match(line)
        if section_match:
            name = section_match.group("name").strip()
            if not name:
                errors.append(f"Line {lineno}: a section needs a name.")
                continue
            current = SpecSectionDef(title=name)
            sections.append(current)
            continue

        # A field line: `key: type [= default] [| Label]` plus an optional trailing comment.
        line = line.split("#", 1)[0].strip()
        if not line:
            continue

        label_override = None
        if "|" in line:
            line, label_override = (part.strip() for part in line.split("|", 1))

        if ":" not in line:
            errors.append(f"Line {lineno}: expected `key: type`.")
            continue

        key_part, rest = line.split(":", 1)
        key = key_part.strip()
        rest = rest.strip()

        if not _KEY_RE.match(key):
            errors.append(
                f"Line {lineno}: `{key}` is not a valid field key "
                "(letters, digits, underscore; must not start with a digit)."
            )
            continue
        if key in seen_keys:
            errors.append(f"Line {lineno}: field `{key}` is declared more than once.")
            continue

        default_raw = None
        if "=" in rest:
            rest, default_raw = (part.strip() for part in rest.split("=", 1))

        field_def = _parse_type(key, rest, lineno, errors)
        if field_def is None:
            continue

        if label_override:
            field_def.label = label_override
        if default_raw is not None:
            field_def.default = _coerce_default(default_raw, field_def.type)

        # Attach the default section to the tree the first time it gains a field.
        if current is default_section and default_section not in sections:
            sections.insert(0, default_section)
        current.fields.append(field_def)
        seen_keys.add(key)

    # Drop a default section that stayed empty (config opened straight into [Section]).
    sections = [s for s in sections if s.fields or s is not default_section]
    sections = [s for s in sections if s.fields]

    return ParsedSpecConfig(sections=sections, errors=errors)


def _parse_type(key: str, type_text: str, lineno: int, errors: list[str]) -> SpecFieldDef | None:
    label = _humanise(key)

    choice_match = _CHOICE_RE.match(type_text)
    if choice_match:
        options = [opt.strip() for opt in choice_match.group("opts").split(",") if opt.strip()]
        if not options:
            errors.append(f"Line {lineno}: `choice(...)` needs at least one option.")
            return None
        return SpecFieldDef(key=key, label=label, type="choice", options=options)

    type_name = type_text.lower()
    if type_name not in ("text", "int", "number", "bool"):
        errors.append(
            f"Line {lineno}: unknown type `{type_text}`. "
            "Use text, int, number, bool, or choice(a, b, c)."
        )
        return None
    return SpecFieldDef(key=key, label=label, type=type_name)


# The starter config a project gets before anyone edits one. Mirrors the fields the
# board extractor can fill, so Extract works out of the box, plus a few common manual
# ones. Users edit freely from here.
DEFAULT_SPEC_CONFIG = """\
# Manufacturing spec fields for this board.
# Syntax:  key: type   (types: text, int, number, bool, choice(a, b, c))
#          key: type = default        adds a default value
#          key: type | Nice Label     overrides the label

[Stackup & physical]
layer_count: int
board_thickness_mm: number | Board thickness (mm)
board_width_mm: number | Board width (mm)
board_height_mm: number | Board height (mm)
copper_weight_oz: number | Copper weight (oz)
material: text = FR-4

[Finish & cosmetic]
solder_mask_color: text = Green
silkscreen_color: text = White
surface_finish: choice(HASL, Lead-free HASL, ENIG, OSP, Immersion Silver)
mask_type: choice(Glossy, Matte)

[Process]
impedance_controlled: bool
castellated: bool | Castellated / edge plating
ipc_class: choice(1, 2, 3)
"""


# A ready-made schema mirroring JLCPCB's PCB order options, so a team ordering from
# them can start from a schema that matches the quote form field for field. Keys line
# up with the board extractor's well-known names where they exist (layer_count,
# board_thickness_mm, board dimensions, surface_finish) so Extract still fills them.
JLCPCB_SPEC_CONFIG = """\
# Spec schema modelled on JLCPCB's PCB order options.
# Values follow their quote form; edit freely for your board.

[Base]
base_material: choice(FR-4, Aluminum, Copper Core, Rogers, PTFE) = FR-4
layer_count: int = 2
board_width_mm: number | Board width (mm)
board_height_mm: number | Board height (mm)
different_design_count: int = 1 | Different designs in panel

[Stackup]
board_thickness_mm: choice(0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0) = 1.6 | PCB thickness (mm)
outer_copper_weight_oz: choice(1, 2, 2.5, 3.5, 4.5) = 1 | Outer copper (oz)
inner_copper_weight_oz: choice(0.5, 1, 2) | Inner copper (oz)
impedance_control: bool | Impedance control

[Finish & cosmetic]
solder_mask_color: choice(Green, Purple, Red, Yellow, Blue, White, Black) = Green | PCB color
silkscreen_color: choice(White, Black) = White
surface_finish: choice(HASL, Lead-free HASL, ENIG, OSP) = HASL
via_covering: choice(Tented, Untented, Plugged, Epoxy filled & capped, Copper paste filled & capped) = Tented

[Advanced]
min_via_hole_mm: choice(0.3, 0.25, 0.2, 0.15) = 0.3 | Min via hole (mm)
min_track_spacing: text | Min track/spacing (mil)
board_outline_tolerance: choice(Regular ±0.2mm, Precision ±0.1mm) = Regular ±0.2mm
gold_fingers: bool
castellated_holes: bool
edge_plating: bool
remove_order_number: choice(No, Yes - specify position, Yes - JLCPCB chooses) = No

[Delivery]
material_type: text = FR-4 TG130
lead_time: text
notes: text
"""


# Named starter templates the editor offers. The first is applied to new projects.
TEMPLATES: dict[str, dict[str, str]] = {
    "default": {"label": "Prism default", "config": DEFAULT_SPEC_CONFIG},
    "jlcpcb": {"label": "JLCPCB", "config": JLCPCB_SPEC_CONFIG},
}


def list_templates() -> list[dict[str, str]]:
    """The named starter schemas, for the editor's template picker."""
    return [{"id": key, "label": value["label"]} for key, value in TEMPLATES.items()]


def get_template(template_id: str) -> str | None:
    """The raw config text for a named template, or None if unknown."""
    template = TEMPLATES.get(template_id)
    return template["config"] if template else None
