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
    # ``[+Name]`` marks a section optional: off by default, switched on with a
    # toggle. A plain ``[Name]`` is always shown.
    optional: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "optional": self.optional,
            "fields": [f.to_dict() for f in self.fields],
        }


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
            # A leading `+` marks the section optional (off by default).
            optional = name.startswith("+")
            if optional:
                name = name[1:].strip()
            if not name:
                errors.append(f"Line {lineno}: a section needs a name.")
                continue
            current = SpecSectionDef(title=name, optional=optional)
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
#          [Section]                  a section header
#          [+Section]                 an optional section (off until toggled on)

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

[+Assembly]
pcba_type: choice(Economic, Standard) = Standard | PCBA type
assembly_side: choice(Top side, Bottom side, Both sides) = Top side
assembly_qty: int | Boards to assemble
tooling_holes: choice(Added by JLCPCB, Added by customer) = Added by JLCPCB
paste_type: choice(Leaded, Lead-free) = Leaded | Solder paste
unique_parts: int | Unique part count (BOM lines)
smt_parts: int | SMT joints
through_hole_parts: int | Through-hole joints
first_article_inspection: bool | First-article inspection (FAI)
xray_bga: bool | X-ray inspection for BGAs
conformal_coating: bool
depanel: choice(No, By router, By V-cut) = No | Depanelize
confirm_parts_placement: bool
assembly_notes: text

[+Stencil]
stencil_type: choice(Framework, Frameless) = Framework | Stencil type
stencil_side: choice(Top, Bottom, Top & Bottom) = Top
stencil_size: choice(380x380mm, 420x520mm, 550x650mm, 584x584mm, 736x736mm) = 420x520mm | Stencil size
stencil_thickness_mm: choice(0.1, 0.12, 0.15, 0.2) = 0.12 | Stencil thickness (mm)
stencil_fiducials: choice(None, Half lasered, Lasered through) = None | Fiducials
electropolishing: bool
custom_stencil_qty: int | Stencil quantity
"""


# A ready-made schema mirroring PCBWay's standard PCB order options.
PCBWAY_SPEC_CONFIG = """\
# Spec schema modelled on PCBWay's standard PCB order options.
# Values follow their order form; edit freely for your board.

[Base]
base_material: choice(FR-4, Aluminum, Copper Base, Rogers) = FR-4
fr4_tg: choice(TG130, TG150, TG170) = TG130 | FR4 TG
layer_count: int = 2
board_width_mm: number | Board width (mm)
board_height_mm: number | Board height (mm)

[Stackup]
board_thickness_mm: choice(0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.4, 2.6, 2.8, 3.0, 3.2) = 1.6 | PCB thickness (mm)
outer_copper_weight_oz: choice(1, 2, 3, 4, 5, 6, 7, 8) = 1 | Outer copper (oz)
inner_copper_weight_oz: choice(1, 2, 3, 4) | Inner copper (oz)
min_track_spacing_mm: number = 0.1 | Min track/spacing (mm)
min_via_hole_mm: number = 0.3 | Min via hole (mm)

[Finish & cosmetic]
solder_mask_color: choice(Green, Red, Yellow, Blue, White, Black, Purple, Matte Green, Matte Black) = Green
silkscreen_color: choice(White, Black, Yellow, None) = White
surface_finish: choice(HASL, Lead-free HASL, Immersion Gold (ENIG), Hard Gold, Immersion Silver, Immersion Tin, OSP, ENEPIG) = HASL
via_process: choice(Tenting, Plugged, Untented) = Tenting

[Advanced]
impedance_control: bool
gold_fingers: bool
castellated_holes: bool | Castellated / half holes
edge_plating: bool
panelization: choice(None, V-scoring, Tab-routing, Perforation) = None

[Delivery]
lead_time: text
notes: text
"""


# A distinct schema for advanced / HDI PCBs, where the stackup, drilling and
# controlled-impedance options are the whole point. Separate from the standard
# template so an advanced board is not squeezed into standard-board fields.
JLCPCB_ADVANCED_SPEC_CONFIG = """\
# Spec schema for advanced / HDI PCBs.
# Covers the extra stackup, drilling and impedance controls advanced boards need.

[Base]
base_material: choice(FR-4, Rogers, PTFE, Mixed dielectric) = FR-4
layer_count: int = 6
board_width_mm: number | Board width (mm)
board_height_mm: number | Board height (mm)

[Stackup]
board_thickness_mm: number = 1.6 | Board thickness (mm)
outer_copper_weight_oz: choice(0.5, 1, 2) = 1 | Outer copper (oz)
inner_copper_weight_oz: choice(0.5, 1, 2) = 0.5 | Inner copper (oz)
stackup_type: choice(JLCPCB defined, Customer defined) = JLCPCB defined
dielectric_material: text | Core / prepreg
symmetric_stackup: bool

[HDI & drilling]
hdi_type: choice(None, 1 stage (1+N+1), 2 stage (2+N+2), Any-layer) = None | HDI structure
laser_via: bool | Laser-drilled microvias
min_via_hole_mm: choice(0.15, 0.1, 0.075) = 0.15 | Min via / laser via (mm)
min_track_spacing_mm: choice(0.1, 0.09, 0.075, 0.0635) = 0.1 | Min track/space (mm)
via_in_pad: bool
back_drilling: bool | Back-drill (remove stubs)
blind_buried_vias: bool

[Impedance]
impedance_control: bool
impedance_tolerance: choice(±10%, ±5%) = ±10%
controlled_dielectric: bool | Specified Dk/Df

[Finish & cosmetic]
solder_mask_color: choice(Green, Black, White, Blue, Red) = Green | PCB color
silkscreen_color: choice(White, Black) = White
surface_finish: choice(ENIG, ENEPIG, Hard Gold, Immersion Silver, OSP) = ENIG
gold_fingers: bool

[Quality]
ipc_class: choice(2, 3) = 2 | IPC class
coupon: bool | Add test coupon
cross_section_report: bool
flying_probe_test: choice(Sample, 100%) = 100% | Electrical test
special_requests: text
"""


# Built-in manufacturers seeded on first startup, each with one or more starting
# templates. Users own these once seeded and can edit or delete them freely.
SEED_MANUFACTURERS: list[dict[str, Any]] = [
    {
        "name": "JLCPCB",
        "website": "https://jlcpcb.com",
        "templates": [
            {"name": "JLCPCB standard", "config": JLCPCB_SPEC_CONFIG},
            {"name": "JLCPCB advanced PCB", "config": JLCPCB_ADVANCED_SPEC_CONFIG},
        ],
    },
    {
        "name": "PCBWay",
        "website": "https://www.pcbway.com",
        "templates": [
            {"name": "PCBWay standard", "config": PCBWAY_SPEC_CONFIG},
        ],
    },
]
