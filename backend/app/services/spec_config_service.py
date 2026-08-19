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
# ` when <cond>` clause, split off before the label/default. Case-insensitive
# keyword, bounded by whitespace so a value containing "when" is not caught.
_WHEN_RE = re.compile(r"\swhen\s", re.IGNORECASE)
_COND_IN_RE = re.compile(r"^(?P<key>\S+)\s+in\s*\((?P<opts>.*)\)$", re.IGNORECASE)
_COND_OP_RE = re.compile(r"^(?P<key>\S+)\s*(?P<op>!=|>=|<=|=|>|<)\s*(?P<value>.+)$")


def _split_options(text: str) -> list[str]:
    """Split a comma-separated option list, ignoring commas inside parentheses.

    Option values are real product labels that can carry their own commas and
    parentheses, e.g. ``HASL(with lead)``, ``Both sides ( Black ,18um )``, or
    ``Top + Bottom(On Single Stencil)``. A plain ``split(",")`` tore those apart
    and dropped half of an option, so a nested comma stays part of its option.
    """
    options: list[str] = []
    depth = 0
    current: list[str] = []
    for char in text:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth = max(0, depth - 1)
            current.append(char)
        elif char == "," and depth == 0:
            options.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    options.append("".join(current).strip())
    return [opt for opt in options if opt]


@dataclass
class SpecCondition:
    """A gate: show the field/section only when ``key`` satisfies ``op``/``values``.

    ``op`` is one of ``=``, ``!=``, ``>``, ``<``, ``>=``, ``<=`` (single value) or
    ``in`` (any of ``values``). Comparisons are done on the live form value.
    """

    key: str
    op: str
    values: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"key": self.key, "op": self.op, "values": self.values}


@dataclass
class SpecFieldDef:
    key: str
    label: str
    type: str
    options: list[str] = field(default_factory=list)
    default: Any = None
    when: SpecCondition | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "options": self.options,
            "default": self.default,
            "when": self.when.to_dict() if self.when else None,
        }


@dataclass
class SpecSectionDef:
    title: str
    fields: list[SpecFieldDef] = field(default_factory=list)
    # ``[+Name]`` marks a section optional: off by default, switched on with a
    # toggle. A plain ``[Name]`` is always shown.
    optional: bool = False
    when: SpecCondition | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "optional": self.optional,
            "when": self.when.to_dict() if self.when else None,
            "fields": [f.to_dict() for f in self.fields],
        }


def _parse_condition(text: str, lineno: int, errors: list[str]) -> SpecCondition | None:
    """Parse a ``when`` clause body into a SpecCondition, or None with an error.

    Accepts ``key = value``, ``key != value``, ``key > n`` (and >=, <, <=), and
    ``key in (a, b, c)``.
    """
    text = text.strip()

    in_match = _COND_IN_RE.match(text)
    if in_match:
        key = in_match.group("key").strip()
        options = _split_options(in_match.group("opts"))
        if not _KEY_RE.match(key) or not options:
            errors.append(f"Line {lineno}: invalid `when {text}`.")
            return None
        return SpecCondition(key=key, op="in", values=options)

    op_match = _COND_OP_RE.match(text)
    if op_match:
        key = op_match.group("key").strip()
        value = op_match.group("value").strip()
        if not _KEY_RE.match(key) or not value:
            errors.append(f"Line {lineno}: invalid `when {text}`.")
            return None
        return SpecCondition(key=key, op=op_match.group("op"), values=[value])

    errors.append(
        f"Line {lineno}: could not read `when {text}`. "
        "Use `when key = value`, `when key != value`, `when key > n`, or `when key in (a, b)`."
    )
    return None


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

        # Strip a trailing comment up front so it can never be mistaken for part of
        # a `when` clause, a label, or a value.
        line = line.split("#", 1)[0].strip()
        if not line:
            continue

        # A human label (`| Label`) is split off first so a label may contain the
        # word "when" freely. The grammar is therefore:
        #   key: type [= default] [when cond] | Label
        # with the label always last.
        label_override = None
        if "|" in line:
            line, label_override = (part.strip() for part in line.split("|", 1))

        # Now split off a trailing `when ...` clause; it binds to the whole
        # field/section.
        when_cond: SpecCondition | None = None
        when_split = _WHEN_RE.split(line, maxsplit=1)
        if len(when_split) == 2:
            line, when_body = when_split[0].strip(), when_split[1].strip()
            when_cond = _parse_condition(when_body, lineno, errors)

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
            current = SpecSectionDef(title=name, optional=optional, when=when_cond)
            sections.append(current)
            continue

        # A field line: `key: type [= default]` (label and when already split off).
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
        field_def.when = when_cond

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
        options = _split_options(choice_match.group("opts"))
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
#          key: type when other = x   show only when another field has a value
#                                     (also: !=, >, <, >=, <=, or  in (a, b, c))

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
# Spec schema built field by field from the JLCPCB PCB quote form, with the
# exact option values from the site. Fields are gated to mirror how the form
# reveals them (FR-4-only, Flex-only, multilayer-only, panel-only).

[Base]
base_material: choice(FR-4, Flex) = FR-4 | Base material
layer_count: choice(1, 2, 4, 6, 8, 10, 12, 14, 16) = 2 | Layers
board_width_mm: number | Dimension width (mm)
board_height_mm: number | Dimension height (mm)
product_type: choice(Industrial/Consumer electronics, Aerospace, Medical) = Industrial/Consumer electronics | Product type
different_design: choice(1, 2, 3, 4) = 1 | Different design
delivery_format: choice(Single PCB, Panel by Customer, Panel by JLCPCB) = Single PCB | Delivery format
# Panel layout only applies when the board is delivered as a panel.
panel_columns: int when delivery_format != Single PCB | Panel columns
panel_rows: int when delivery_format != Single PCB | Panel rows

[Stackup]
board_thickness_mm: choice(0.4mm, 0.6mm, 0.8mm, 1.0mm, 1.2mm, 1.6mm, 2.0mm) = 1.6mm | PCB thickness
outer_copper_weight_oz: choice(1 oz, 2 oz, 3.5 oz, 4.5 oz) = 1 oz | Outer copper weight
# Inner copper only exists on multilayer boards.
inner_copper_weight_oz: choice(0.5 oz, 1 oz, 2 oz) = 0.5 oz when layer_count != 1 | Inner copper weight
# FR-4 TG material grade.
material_type: choice(FR4 TG135, KB6164 - TG135, Nan Ya NP-140F, S1141 TG140, S1000H TG155) = FR4 TG135 when base_material = FR-4 | Material Type

[Colour]
solder_mask_color: choice(Green, Purple, Red, Yellow, Blue, White, Black) = Green | PCB color
silkscreen_color: choice(White) = White | Silkscreen

[Surface finish]
surface_finish: choice(OSP, HASL(with lead), LeadFree HASL, ENIG) = HASL(with lead) | Surface finish

[Flex]
# Flex-only options, revealed when the material is Flex.
eda_software: choice(EasyEDA Pro, Other) = Other when base_material = Flex | EDA software
stiffener: choice(Without, Polyimide, FR4, Stainless Steel, 3M Tape) = Without when base_material = Flex | Stiffener
emi_shielding_film: choice(Without, Both sides ( Black ,18um ), Single side ( Black ,18um )) = Without when base_material = Flex | EMI shielding film
coverlay_thickness: choice(PI:12.5um/AD:15um, PI:25um/AD:25um) = PI:25um/AD:25um when base_material = Flex | Coverlay thickness
cutting_method: choice(Laser Cutting, Punching) = Laser Cutting when base_material = Flex | Cutting method

[Vias]
via_covering: choice(Tented, Untented, Plugged, Epoxy Filled & Capped, Copper paste Filled & Capped) = Tented | Via covering
via_plating_method: choice(Not Specified, Conductive Adhesive, Horizontal Electroless Copper Plating) = Not Specified | Via plating method
# Via size only matters on boards that have vias (multilayer).
min_via_hole: choice(0.3mm/(0.4/0.45mm), 0.25mm/(0.35/0.4mm), 0.2mm/(0.3/0.35mm), 0.15mm/(0.25/0.3mm)) = 0.3mm/(0.4/0.45mm) when layer_count != 1 | Min via hole size / diameter

[Options]
board_outline_tolerance: choice(±0.2mm(Regular), ±0.1mm(Precision)) = ±0.2mm(Regular) | Board outline tolerance
# Gold fingers, castellation and edge plating are FR-4 features.
gold_fingers: choice(No, Yes) = No when base_material = FR-4 | Gold fingers
castellated_holes: choice(No, Yes) = No when base_material = FR-4 | Castellated holes
edge_plating: choice(No, Yes) = No when base_material = FR-4 | Edge plating
blind_slots: choice(No, Yes) = No | Blind slots
mark_on_pcb: choice(Remove Mark, 2D barcode (Serial Number)) = Remove Mark | Mark on PCB
confirm_production_file: choice(No, Yes) = No | Confirm production file

[Testing & quality]
electrical_test: choice(Flying Probe Fully Test) = Flying Probe Fully Test | Electrical test
appearance_quality: choice(IPC Class 2 Standard, Superb Quality) = IPC Class 2 Standard | Appearance quality
silkscreen_technology: choice(Ink-jet Printing Silkscreen, High-precision Printing Silkscreen, EasyEDA multi-color silkscreen, High-definition Exposure Silkscreen) = Ink-jet Printing Silkscreen | Silkscreen technology
paper_between_pcbs: choice(No, Yes) = No | Paper between PCBs
ul_marking: choice(No, Yes (Any Position), Yes (Specify Position)) = No | UL marking
humidity_indicator_card: choice(No, Yes) = No | Humidity indicator card
kelvin_test: choice(No, Yes) = No | 4-Wire Kelvin test
package_box: choice(With JLCPCB logo, Blank box) = With JLCPCB logo | Package box
inspection_report: choice(No, Final Inspection Report, Electrical Test Report, ROHS Test Report) = No | Inspection report
pcb_remark: text | PCB remark

[Delivery]
carrier: choice(DHL Express, DHL Express (DDP), UPS Worldwide Express Saver, FedEx Express, EuroPacket, Global Standard Direct Line, Sea Shipment, My UPS Account, My DHL Account, My FedEx Account) | Shipping carrier

[+Assembly]
# JLCPCB PCB Assembly (PCBA) options, from the assembly quote form.
pcba_type: choice(Economic, Standard) = Standard | PCBA type
assembly_side: choice(Top Side, Bottom Side, Both Sides) = Top Side | Assembly side
assembly_qty: int | Boards to assemble
edge_rails_fiducials: choice(Added by JLCPCB, Added by Customer) = Added by JLCPCB | Edge rails / fiducials
parts_selection: choice(By Customer (Self-Service), By JLCPCB (Manual Match)) = By Customer (Self-Service) | Parts selection
confirm_parts_placement: choice(No, Yes) = No | Confirm parts placement
stencil_storage: choice(No, Yes) = No | Stencil storage
fixture_storage: choice(No, Yes) = No | Fixture storage
unique_parts: int | Unique part count (BOM lines)
smt_parts: int | SMT joints
through_hole_parts: int | Through-hole joints
assembly_notes: text | Assembly notes

[+Stencil]
# JLCPCB Stencil options, from the stencil quote form.
stencil_side: choice(Top only, Bottom only, Top + Bottom(On Single Stencil), Top + Bottom(On Separate Stencils)) = Top only | Stencil side
stencil_dimensions: choice(Standard Size, Custom Size) = Standard Size | Stencil size
stencil_thickness: choice(Select by JLCPCB, Select by Customer) = Select by JLCPCB | Stencil thickness
stencil_process_type: choice(Solder paste stencil, Red glue stencil) = Solder paste stencil | Stencil process
polishing_process: choice(Sanding, Etching, Electropolishing) = Sanding | Polishing process
stencil_fiducials: choice(No Fiducial, Etched Through, Etched Half into board) = No Fiducial | Fiducials
stencil_framework: choice(No, Yes) = No | Framework
step_stencil: choice(No, Yes) = No | Step stencil
nano_coating: choice(No, Yes) = No | Nano-coating
engrave_text: choice(No, Yes) = No | Engrave text
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
# Spec schema for advanced / HDI JLCPCB boards, field by field from the
# advanced quote form with the exact option values. The extra stackup,
# drilling and impedance controls are the point of this schema.

[Base]
base_material: choice(FR-4, Flex, Copper Core) = FR-4 | Base material
layer_count: choice(1, 2, 4, 6, 8, 10, 12, 14, 16) = 6 | Layers
board_width_mm: number | Dimension width (mm)
board_height_mm: number | Dimension height (mm)
product_type: choice(Industrial/Consumer electronics, Aerospace, Medical) = Industrial/Consumer electronics | Product type
different_design: choice(1, 2, 3, 4) = 1 | Different design
delivery_format: choice(Single PCB, Panel by Customer, Panel by JLCPCB) = Single PCB | Delivery format

[Stackup]
board_thickness_mm: choice(0.4mm, 0.6mm, 0.8mm, 1.0mm, 1.2mm, 1.6mm, 2.0mm) = 1.6mm | PCB thickness
outer_copper_weight_oz: choice(1 oz, 2 oz) = 1 oz | Outer copper weight
inner_copper_weight_oz: choice(0.5 oz, 1 oz, 2 oz) = 0.5 oz when layer_count != 1 | Inner copper weight
material_type: choice(FR4 TG135, FR4 TG155, Nan Ya NP-140F, Nan Ya NP-155F, KB-6165 - TG155, S1000H TG155, Shengyi S1000-2M - TG170) = FR4 TG135 when base_material = FR-4 | Material Type
specify_layer_sequence: choice(No, Yes) = No | Specify layer sequence
specify_stackup: choice(No, Yes) = No | Specify stackup

[Colour]
solder_mask_color: choice(Green, Purple, Red, Yellow, Blue, White, Black) = Green | PCB color
silkscreen_color: choice(White) = White | Silkscreen

[Surface finish]
surface_finish: choice(OSP, ENIG, HASL(with lead), LeadFree HASL) = ENIG | Surface finish

[Vias & drilling]
via_covering: choice(Tented, Epoxy Filled & Untented, Plugged, Epoxy Filled & Capped, Copper paste Filled & Capped) = Tented | Via covering
min_via_hole: choice(0.3mm/(0.4/0.45mm), 0.25mm/(0.35/0.4mm), 0.2mm/(0.3/0.35mm), 0.15mm/(0.25/0.3mm)) = 0.3mm/(0.4/0.45mm) | Min via hole size / diameter
press_fit_hole: choice(No, Yes (Tolerance +/-0.05mm)) = No | Press-fit hole
backdrill: choice(No, Yes) = No | Back-drill

[Options]
board_outline_tolerance: choice(±0.2mm(Regular), ±0.1mm(Precision)) = ±0.2mm(Regular) | Board outline tolerance
gold_fingers: choice(No, Yes) = No | Gold fingers
castellated_holes: choice(No, Yes) = No | Castellated holes
edge_plating: choice(No, Yes) = No | Edge plating
blind_slots: choice(No, Yes) = No | Blind slots
mark_on_pcb: choice(Remove Mark, 2D barcode (Serial Number)) = Remove Mark | Mark on PCB
ul_marking: choice(No, Yes (Any Position), Yes (Specify Position)) = No | UL marking
confirm_production_file: choice(No, Yes) = No | Confirm production file

[Testing & quality]
electrical_test: choice(Flying Probe Fully Test) = Flying Probe Fully Test | Electrical test
appearance_quality: choice(IPC Class 2 Standard, Superb Quality) = IPC Class 2 Standard | Appearance quality
silkscreen_technology: choice(Ink-jet Printing Silkscreen, High-precision Printing Silkscreen, High-definition Exposure Silkscreen) = Ink-jet Printing Silkscreen | Silkscreen technology
kelvin_test: choice(No, Yes) = No | 4-Wire Kelvin test
paper_between_pcbs: choice(No, Yes) = No | Paper between PCBs
humidity_indicator_card: choice(No, Yes) = No | Humidity indicator card
package_box: choice(With JLCPCB logo, Blank box) = With JLCPCB logo | Package box
inspection_report: choice(No, Final Inspection Report, Electrical Test Report, ROHS Test Report) = No | Inspection report
pcb_remark: text | PCB remark

[Delivery]
carrier: choice(DHL Express, DHL Express (DDP), UPS Worldwide Express Saver, FedEx Express, EuroPacket, Global Standard Direct Line, Sea Shipment, My UPS Account, My DHL Account, My FedEx Account) | Shipping carrier
"""


# Built-in manufacturers seeded on first startup, each with one or more starting
# templates. Users own these once seeded and can edit or delete them freely.
# JLCPCB standard-process minimums, from jlcpcb.com/capabilities/pcb-capabilities
# (1 oz outer copper figures). Each is the smallest feature the fab can build, mm.
JLCPCB_STANDARD_CAPABILITIES: dict[str, Any] = {
    "min_track_width": 0.1,
    "min_clearance": 0.1,
    "min_via_diameter": 0.25,
    "min_through_hole_diameter": 0.15,
    "min_via_annular_width": 0.15,
    "min_copper_edge_clearance": 0.2,
    "min_text_height": 1.0,
    "min_text_thickness": 0.15,
}

# The advanced (HDI) process reaches finer features.
JLCPCB_ADVANCED_CAPABILITIES: dict[str, Any] = {
    **JLCPCB_STANDARD_CAPABILITIES,
    "min_track_width": 0.0635,   # 2.5 mil
    "min_clearance": 0.0635,
    "min_via_diameter": 0.15,
    "min_through_hole_diameter": 0.1,
    "min_microvia_diameter": 0.25,
    "min_microvia_drill": 0.1,
}

SEED_MANUFACTURERS: list[dict[str, Any]] = [
    {
        "name": "JLCPCB",
        "website": "https://jlcpcb.com",
        "templates": [
            {"key": "jlcpcb:standard", "name": "JLCPCB standard", "config": JLCPCB_SPEC_CONFIG,
             "capabilities": JLCPCB_STANDARD_CAPABILITIES},
            {"key": "jlcpcb:advanced", "name": "JLCPCB advanced PCB", "config": JLCPCB_ADVANCED_SPEC_CONFIG,
             "capabilities": JLCPCB_ADVANCED_CAPABILITIES},
        ],
    },
    {
        "name": "PCBWay",
        "website": "https://www.pcbway.com",
        "templates": [
            {"key": "pcbway:standard", "name": "PCBWay standard", "config": PCBWAY_SPEC_CONFIG},
        ],
    },
]
