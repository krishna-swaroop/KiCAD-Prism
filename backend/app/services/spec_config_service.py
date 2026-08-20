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


# --------------------------------------------------------------------------
# Capabilities as .config text
#
# A fabrication method's capabilities are written in the same .config grammar as
# a spec schema: each capability is a `number` field whose default is the
# minimum, e.g. `min_track_width: number = 0.1 | Min track width (mm)`. The unit,
# when present, is the trailing `(...)` of the label. This keeps the same editor,
# preview, and download/upload for both.
# --------------------------------------------------------------------------

_UNIT_RE = re.compile(r"^(?P<label>.*?)\s*\((?P<unit>[^()]*)\)\s*$")


def _split_label_unit(label: str) -> tuple[str, str]:
    """Split a trailing `(unit)` off a label: `Min track width (mm)` -> (label, mm)."""
    match = _UNIT_RE.match(label.strip())
    if match:
        return match.group("label").strip(), match.group("unit").strip()
    return label.strip(), ""


def capabilities_from_config(text: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Derive the capability value map and its label/unit metadata from .config
    text. Value = each field's numeric default (fields with no numeric default
    are skipped). Metadata carries the label and any trailing `(unit)`."""
    parsed = parse_spec_config(text or "")
    capabilities: dict[str, Any] = {}
    meta: dict[str, Any] = {}
    for section in parsed.sections:
        for fld in section.fields:
            default = fld.default
            if default is None:
                continue
            try:
                value = float(default)
            except (TypeError, ValueError):
                continue
            # Store whole numbers as ints so 4 does not become 4.0 in the UI.
            capabilities[fld.key] = int(value) if value.is_integer() else value
            label, unit = _split_label_unit(fld.label)
            meta[fld.key] = {"label": label, "unit": unit} if unit else {"label": label}
    return capabilities, meta


def capabilities_to_config(
    capabilities: dict[str, Any],
    meta: dict[str, Any] | None = None,
    *,
    rule_fields: list[dict[str, Any]] | None = None,
) -> str:
    """Render a capability value map as .config text: KiCad-tracked keys in their
    canonical order first (under [Board rules]), then custom keys (under
    [Other]). Label/unit come from ``meta`` or, for tracked keys, ``rule_fields``.
    The inverse of :func:`capabilities_from_config`."""
    meta = meta or {}
    rule_fields = rule_fields or []
    field_by_key = {f["key"]: f for f in rule_fields}
    tracked_order = [f["key"] for f in rule_fields]
    tracked_keys = set(tracked_order)

    def line_for(key: str) -> str | None:
        if key not in capabilities:
            return None
        value = capabilities[key]
        entry = meta.get(key) or {}
        label = entry.get("label") or field_by_key.get(key, {}).get("label") or _humanise(key)
        unit = entry.get("unit") or field_by_key.get(key, {}).get("unit") or ""
        label_text = f"{label} ({unit})" if unit else label
        return f"{key}: number = {value} | {label_text}"

    lines: list[str] = [
        "# Fabrication capabilities: each is a minimum the board must meet.",
        "# Written in the same .config grammar as a spec schema; the default is",
        "# the minimum value, e.g. `min_track_width: number = 0.1 | Min track (mm)`.",
    ]

    tracked_lines = [line for key in tracked_order if (line := line_for(key))]
    if tracked_lines:
        lines += ["", "[Board rules]", *tracked_lines]

    custom_keys = [k for k in capabilities if k not in tracked_keys]
    custom_lines = [line for key in custom_keys if (line := line_for(key))]
    if custom_lines:
        lines += ["", "[Other]", *custom_lines]

    return "\n".join(lines) + "\n"


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
# PCBWay standard PCB quote, field by field with the exact site options.

[Base]
board_type: choice(Single pieces, Panel by Customer, Panel by Supplier) = Single pieces | Board type
route_process: choice(Panel as PCBWay prefer, Panel as V-Scoring, Panel as Tab Route, Both V-Scoring&Tab-routing) = Panel as PCBWay prefer when board_type != Single pieces | Route process
different_design: choice(1, 2, 3, 4, 5, 6) = 1 when board_type != Single pieces | Different designs in panel
board_width_mm: number | Size width (mm)
board_height_mm: number | Size height (mm)
quantity: choice(5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 9000, 10000) = 5 | Quantity
layer_count: choice(1 Layer, 2 Layers, 4 Layers, 6 Layers, 8 Layers, 10 Layers, 12 Layers, 14 Layers) = 2 Layers | Layers

[Material]
material: choice(FR-4, Aluminum, Rogers, HDI(Buried/blind vias) ≥4 Layers, Copper Base) = FR-4 | Material
rogers_material: choice(Rogers 4003C, Rogers 4350B) = Rogers 4003C when material = Rogers | Rogers laminate
thermal_conductivity: choice(1.0W/(m⋅K), 1.5W/(m⋅K), 2.0W/(m⋅K), 3.0W/(m⋅K)) = 1.0W/(m⋅K) when material = Aluminum | Thermal conductivity
mcpcb_structure: choice(Metal core in the middle, Metal base on the bottom side) = Metal core in the middle when material = Aluminum | Structure of MCPCB
fr4_tg: choice(TG 130-140, TG 150-160, TG 170-180, S1000H TG150, S1000-2M TG170) = TG 130-140 when material = FR-4 | FR4 TG
board_thickness_mm: choice(0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.4, 2.6, 2.8, 3.0, 3.2, ≥1.7-8.0) = 1.6 | Board thickness (mm)

[Tolerances]
min_track_spacing: choice(3/3mil, 4/4mil, 5/5mil, 6/6mil, 8/8mil) = 3/3mil | Min track / spacing
min_hole_size: choice(0.15mm, 0.2mm, 0.25mm, 0.3mm, 0.8mm, 1.0mm, No Drill) = 0.15mm | Min hole size

[Colour]
solder_mask: choice(Green, Red, Yellow, Blue, White, Black, Purple, Matte black, Matte green, None) = Green | Solder mask
silkscreen: choice(White, Black, Yellow, None) = White | Silkscreen
uv_printing: choice(None, Single-sided: Top, Single-sided: Bottom, Double-sided) = None | UV printing / multi-colour

[Finish]
surface_finish: choice(HASL with lead, HASL lead free, Immersion gold(ENIG), OSP, Hard gold, Immersion silver(Ag), Immersion tin, HASL lead free + Selective Immersion gold, HASL lead free + Selective Hard gold, Immersion gold + Selective Hard gold, ENEPIG, None/Plain copper) = HASL lead free | Surface finish
via_process: choice(Tenting vias, Plugged vias with solder mask, Vias not covered) = Tenting vias | Via process
edge_connector: choice(Yes, No, Yes (20°), Yes (30°), Yes (45°), HASL with lead, HASL lead free, Immersion gold(ENIG), OSP, Hard gold, Immersion silver(Ag), Immersion tin, ENEPIG, None/Plain copper) = No | Edge connector (gold fingers)

[Copper]
finished_copper: choice(Bare board(0 oz Cu), 1 oz Cu, 2 oz Cu, 3 oz Cu, 4 oz Cu, 5 oz Cu, 6 oz Cu, 7 oz Cu, 8 oz Cu, 9 oz Cu, 10 oz Cu, 11 oz Cu, 12 oz Cu, 13 oz Cu) = 1 oz Cu | Outer copper
inner_copper: choice(1 oz, 1.5 oz, 2 oz, 3 oz, 4 oz, 5 oz, 6 oz) = 1 oz when layer_count != 1 Layer | Inner copper

[Options]
remove_product_no: choice(No, Yes (extra+$ 1.5), Specify a location) = No | Remove PCBWay order number
other_special_request: text | Other special request

[Delivery]
carrier: choice(DHL, FedEx IE, FedEx IP, UPS Saver, UPS Expedited, SF Express, EMS, Register Air Mail, PCBWay Ship) | Shipping carrier

[+Stencil]
stencil_type: choice(Framework, Non-framework) = Framework | Stencil type
stencil_step: choice(Yes, No) = No | Multi-level / step stencil
stencil_size: choice(370×470mm (Valid area 190×290mm), 420×520mm (Valid area 240×340mm), 450×550mm (Valid area 270×370mm), 584×584mm (Valid area 380×380mm), 550×650mm (Valid area 350×450mm), 736×736mm (Valid area 500×500mm), 400×600mm (Valid area 220×400mm), 400×800mm (Valid area 220×600mm), 400×1000mm (Valid area 220×760mm), 500×800mm (Valid area 320×600mm), 400×1200mm (Valid area 220×1000mm), 400×1400mm (Valid area 220×1200mm), 500×1200mm (Valid area 320×1000mm), 500×1400mm (Valid area 320×1200mm), Custom Size (Valid area 190×290mm), Custom Size (Valid area 550×550mm)) = 370×470mm (Valid area 190×290mm) | Stencil size
stencil_side: choice(Top, Bottom, Top+Bottom(On Single Stencil), Top & Bottom(On Separate Stencil)) = Top | Stencil side
stencil_fiducials: choice(None, half lasered, lasered through) = None | Existing fiducials
stencil_electropolishing: choice(Yes, No) = No | Electropolishing

[+Assembly]
assembly_side: choice(Top side, Bottom side, Both sides) = Top side | Assembly side(s)
assembly_qty: int | Boards to assemble
unique_parts: int | Unique parts
smd_parts: int | SMD parts
bga_qfp_parts: int | BGA / QFP parts
through_hole_parts: int | Through-hole parts
assembly_notes: text | Assembly details
"""


# PCBWay advanced / HDI PCB order options, from the advanced quote form.
PCBWAY_ADVANCED_SPEC_CONFIG = """\
# PCBWay advanced / HDI / high-frequency / thick-copper quote, field by field.

[Base]
pcb_type: choice(Through hole board, HDI(Buried/blind vias)) = Through hole board | PCB type
board_spec: choice(IPC 6012 Class 2, IPC 6012 Class 3, IATF16949, ISO13485, Customer Standard) = IPC 6012 Class 2 | Board spec
board_type: choice(Single pieces, Panel by Customer, Panel by Supplier) = Single pieces | Board type
board_width_mm: number | Size width (mm)
board_height_mm: number | Size height (mm)
quantity: int = 5 | Quantity
layer_count: choice(1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60) = 4 Layers | Layers

[Material]
material: choice(FR-4, Aluminum, Rogers, HDI(Buried/blind vias) ≥4 Layers, Copper Base) = FR-4 | Material
board_thickness_mm: choice(≥0.1-0.2 (reviewed), 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 7.0, 8.0, Other (reviewed)) = 1.6 | Board thickness (mm)

[Tolerances]
min_track_spacing: choice(3/3mil, 4/4mil, 5/5mil, 6/6mil, 8/8mil) = 3/3mil | Min track / spacing
min_hole_size: choice(0.15mm, 0.2mm, 0.25mm, 0.3mm, No Drill) = 0.15mm | Min hole size

[Colour]
solder_mask: choice(Green, Red, Yellow, Blue, White, Black, Pink, Grey, Orange, Transparent, Purple, Matte black, Matte green, Matte blue, Matte red, None) = Green | Solder mask
silkscreen: choice(White, Black, Yellow, Blue, Grey, None) = White | Silkscreen

[Finish]
surface_finish: choice(HASL with lead, HASL lead free, Immersion gold(ENIG), OSP, Hard gold, Immersion silver(Ag), Immersion Tin, HASL lead free + Selective Immersion gold, HASL lead free + Selective Hard gold, Immersion gold + Selective Hard gold, ENEPIG, None/Plain copper) = Immersion gold(ENIG) | Surface finish
edge_connector: choice(Yes, No, Yes (20°), Yes (30°), Yes (45°), HASL with lead, HASL lead free, Immersion gold(ENIG), OSP, Hard gold, Immersion silver(Ag), Immersion tin, ENEPIG, None/Plain copper) = No | Edge connector (gold fingers)

[Copper]
finished_copper: choice(Bare board(0 oz Cu), 0.5 oz Cu, 1 oz Cu, 2 oz Cu, 3 oz Cu, 4 oz Cu, 5 oz Cu, 6 oz Cu, 7 oz Cu, 8 oz Cu, 9 oz Cu, 10 oz Cu, 11 oz Cu, 12 oz Cu, 13 oz Cu, 14 oz Cu, 15 oz Cu, 16 oz Cu, 17 oz Cu, 18 oz Cu, 19 oz Cu, 20 oz Cu) = 1 oz Cu | Outer copper
inner_copper: choice(0.5 oz, 1 oz, 1.5 oz, 2 oz, 3 oz, 4 oz, 5 oz, 6 oz, 7 oz, 8 oz, 9 oz, 10 oz, 11 oz, 12 oz, 13 oz, 14 oz, 15 oz, 16 oz, 17 oz, 18 oz, 19 oz, 20 oz) = 1 oz when layer_count != 1 Layer | Inner copper

[Options]
final_inspection_report: choice(Default Inspection Report, Microsection Inspection Report, Solderability Test Report, Thermal Stress Test Report, Impedance Test Report, Humidity indicator cards) = Default Inspection Report | Final inspection report
other_special_request: text | Other special request

[Delivery]
carrier: choice(DHL, FedEx IE, FedEx IP, UPS Saver, UPS Expedited, SF Express, EMS, Register Air Mail, PCBWay Ship) | Shipping carrier
"""


# PCBWay flexible / rigid-flex PCB order options, from the flex quote form.
PCBWAY_FLEX_SPEC_CONFIG = """\
# PCBWay flexible / rigid-flex PCB quote, field by field.

[Base]
pcb_type: choice(Flexible PCB, Rigid-Flex Board) = Flexible PCB | PCB type
board_type: choice(Single pieces, Panel by Customer, Panel by Supplier) = Single pieces | Board type
different_design: choice(1, 2, 3, 4, 5, 6) = 1 when board_type != Single pieces | Different designs in panel
board_width_mm: number | Size width (mm)
board_height_mm: number | Size height (mm)
layer_count: choice(1 Layer, 2 Layers, 4 Layers, 6 Layers, 8 Layers, 10 Layers, 12 Layers, 14 Layers, 16 Layers, Stack-up for FPC) = 2 Layers | Layers

[Material]
base_material: choice(Polyimide Flex, PET, High Frequency(DK≤3.6), SF230) = Polyimide Flex | Base material
pet_material: choice(Transparent, Translucent) = Transparent when base_material = PET | PET type
fpc_thickness_mm: choice(0.025, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.2, 0.22, 0.23, 0.24, 0.25, 0.26, 0.27, 0.29, 0.3, 0.33, 0.34, ≥0.35, ≥0.4) = 0.2 | FPC thickness (mm)

[Tolerances]
min_track_spacing: choice(≥ 0.06mm) = ≥ 0.06mm | Min track / spacing
min_hole_size: choice(≥ φ0.15/0.35mm, No Drill) = ≥ φ0.15/0.35mm | Min hole / pad size

[Colour]
coverlay: choice(Yellow Coverlay, White Coverlay, Black Coverlay, None, Transparent) = Yellow Coverlay | Solder mask / coverlay
silkscreen: choice(White, Black, None) = White | Silkscreen

[Finish]
surface_finish: choice(Immersion gold (ENIG), OSP, Hard gold, Immersion silver(Ag), Immersion tin, Immersion gold + Selective Hard gold, ENEPIG) = Immersion gold (ENIG) | Surface finish
edge_connector: choice(Yes, No) = No | Edge connector

[Copper]
finished_copper: choice(0.25 oz Cu(9µm), 1/3 oz Cu(12µm), 0.5 oz Cu(18µm), 1 oz Cu(35µm), 1.5 oz Cu(55µm), 2 oz Cu(70µm), 2.5 oz Cu(88µm), Min Track/Spacing for FPC >>) = 1 oz Cu(35µm) | Outer copper
inner_copper: choice(1/3 oz Cu(12µm), 0.5 oz Cu(18µm), 1 oz Cu(35µm)) = 1 oz Cu(35µm) when layer_count != 1 Layer | Inner copper

[Flex options]
stiffener: choice(without, TOP, BOT, Both sides, 0.05mm, 0.1mm, 0.15mm, 0.2mm, 0.25mm, 0.075mm(unusual), 0.125mm(unusual), 0.175mm(unusual), 0.225mm(unusual), 0.275mm(unusual), 0.3mm, 0.4mm, 0.5mm, 0.6mm, 0.7mm, 0.8mm, 1.0mm, 1.2mm, 1.5mm, 0.1mm(unusual), 0.9mm(unusual), 1.1mm(unusual), 1.3mm(unusual), 1.4mm(unusual), 1.6mm(unusual), 0.35mm, 0.45mm(unusual), e.g.) = without | Stiffener
tape_3m_tesa: choice(3M467(Not for reflow and wave soldering), Tesa8853, Tesa8854, 3M9495LE(unusual,Not for reflow and wave soldering), without, e.g.) = without | 3M / Tesa tape
conductive_tape: choice(HT-A1134(Not for reflow and wave soldering), without) = without | Conductive double-sided tape
emi_shielding_film: choice(HCF-6000G, PC800, without) = without | EMI shielding film
e_test: choice(100%, No) = 100% | Electrical test

[Delivery]
carrier: choice(DHL, FedEx IE, FedEx IP, UPS Saver, UPS Expedited, SF Express, EMS, Register Air Mail, PCBWay Ship) | Shipping carrier
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
    # KiCad-tracked minimums (1 oz process), from the capabilities page.
    "min_track_width": 0.1,
    "min_clearance": 0.1,
    "min_via_diameter": 0.25,
    "min_via_annular_width": 0.2,          # PTH annular ring
    "min_through_hole_diameter": 0.15,
    "min_hole_to_hole": 0.2,               # via hole-to-hole
    "min_copper_edge_clearance": 0.2,      # routed copper clearance
    "min_hole_clearance": 0.2,             # NPTH to track
    "min_silk_clearance": 0.15,            # pad to silkscreen
    "min_text_height": 1.0,
    "min_text_thickness": 0.15,
    "solder_mask_to_copper_clearance": 0.1,  # min dam (1 oz, standard colours)
    # Custom capabilities KiCad does not track; see JLCPCB_STANDARD_META.
    "min_via_hole_size_mm": 0.15,
    "min_drilled_hole_mm": 0.15,
    "min_npth_mm": 0.5,
    "hole_position_tolerance_mm": 0.05,
    "min_board_thickness_mm": 0.4,
    "max_board_thickness_mm": 4.5,
    "board_dimension_tolerance_mm": 0.1,
    "min_board_size_mm": 3.0,
    "max_board_width_mm": 670.0,           # 2-layer FR-4
    "max_board_height_mm": 600.0,
    "impedance_tolerance_pct": 10.0,
    "min_soldermask_dam_mm": 0.1,
    "aspect_ratio": 10.0,
    "min_plated_slot_mm": 0.5,
    "min_castellated_hole_mm": 0.5,
    "castellated_hole_to_hole_mm": 0.5,
    "min_bga_pad_mm": 0.2,
    "min_smd_pad_mm": 0.25,
    "outer_copper_plating_um": 18.0,
}

# Labels/units for the custom (non KiCad-tracked) JLCPCB standard capabilities.
JLCPCB_STANDARD_META: dict[str, Any] = {
    "min_via_hole_size_mm": {"label": "Min via hole size", "unit": "mm"},
    "min_drilled_hole_mm": {"label": "Min drilled hole (2+ layer)", "unit": "mm"},
    "min_npth_mm": {"label": "Min NPTH", "unit": "mm"},
    "hole_position_tolerance_mm": {"label": "Hole position tolerance (±)", "unit": "mm"},
    "min_board_thickness_mm": {"label": "Min board thickness", "unit": "mm"},
    "max_board_thickness_mm": {"label": "Max board thickness", "unit": "mm"},
    "board_dimension_tolerance_mm": {"label": "Dimension tolerance (±)", "unit": "mm"},
    "min_board_size_mm": {"label": "Min board size", "unit": "mm"},
    "max_board_width_mm": {"label": "Max board width", "unit": "mm"},
    "max_board_height_mm": {"label": "Max board height", "unit": "mm"},
    "impedance_tolerance_pct": {"label": "Impedance tolerance (±)", "unit": "%"},
    "min_soldermask_dam_mm": {"label": "Min solder-mask dam", "unit": "mm"},
    "aspect_ratio": {"label": "Max aspect ratio (thickness : hole)", "unit": ": 1"},
    "min_plated_slot_mm": {"label": "Min plated slot width", "unit": "mm"},
    "min_castellated_hole_mm": {"label": "Min castellated hole diameter", "unit": "mm"},
    "castellated_hole_to_hole_mm": {"label": "Castellated hole to hole", "unit": "mm"},
    "min_bga_pad_mm": {"label": "Min BGA pad diameter", "unit": "mm"},
    "min_smd_pad_mm": {"label": "Min SMD pad", "unit": "mm"},
    "outer_copper_plating_um": {"label": "Average hole plating thickness", "unit": "µm"},
}

# The advanced (HDI) process reaches finer features; it inherits the standard
# custom capabilities and overrides the ones it improves on.
JLCPCB_ADVANCED_CAPABILITIES: dict[str, Any] = {
    **JLCPCB_STANDARD_CAPABILITIES,
    "min_track_width": 0.0635,   # 2.5 mil
    "min_clearance": 0.0635,
    "min_via_diameter": 0.15,
    "min_through_hole_diameter": 0.1,
    "min_microvia_diameter": 0.25,
    "min_microvia_drill": 0.1,
    "min_via_hole_size_mm": 0.1,
}
JLCPCB_ADVANCED_META: dict[str, Any] = dict(JLCPCB_STANDARD_META)

# JLCPCB flex (FPC) process, from jlcpcb.com/capabilities/flex-pcb-capabilities.
# KiCad-tracked minimums (mm); 4 mil = 0.1016 mm.
JLCPCB_FLEX_CAPABILITIES: dict[str, Any] = {
    # KiCad-tracked minimums (35µm/1oz copper process).
    "min_track_width": 0.1016,           # 4 mil
    "min_clearance": 0.1016,             # 4 mil
    "min_through_hole_diameter": 0.1,    # hole range 0.1-6.5 mm
    "min_via_diameter": 0.55,
    "min_via_annular_width": 0.18,
    "min_copper_edge_clearance": 0.3,
    "min_hole_clearance": 0.2,           # NPTH to copper
    "min_text_height": 1.0,
    "min_text_thickness": 0.15,
    "min_silk_clearance": 0.15,          # character to pad
    # Flex-only capabilities KiCad does not track (custom); see FLEX_META below.
    "min_via_hole_size_mm": 0.3,
    "hole_diameter_tolerance_mm": 0.08,
    "max_board_width_mm": 234.0,
    "max_board_height_mm": 490.0,
    "board_outline_tolerance_mm": 0.1,
    "min_finished_thickness_mm": 0.07,
    "max_finished_thickness_mm": 0.45,
    "bend_radius_factor_single_layer": 6.0,
    "bend_radius_factor_multi_layer": 10.0,
    "min_bga_pad_mm": 0.25,
    "min_plated_slot_mm": 0.5,
    "min_castellated_hole_mm": 0.3,
    "castellated_hole_to_hole_mm": 0.4,
    "min_solder_bridge_mm": 0.5,
    "gold_finger_edge_clearance_mm": 0.2,
    "coverlay_expansion_mm": 0.1,
    "min_tooling_hole_mm": 2.0,
    "fiducial_diameter_mm": 1.0,
    "panel_edge_width_mm": 5.0,
}

# Labels/units for the custom (non KiCad-tracked) flex capabilities above.
JLCPCB_FLEX_META: dict[str, Any] = {
    "min_via_hole_size_mm": {"label": "Min via hole size", "unit": "mm"},
    "hole_diameter_tolerance_mm": {"label": "Hole diameter tolerance (±)", "unit": "mm"},
    "max_board_width_mm": {"label": "Max board width", "unit": "mm"},
    "max_board_height_mm": {"label": "Max board height", "unit": "mm"},
    "board_outline_tolerance_mm": {"label": "Outline tolerance (±)", "unit": "mm"},
    "min_finished_thickness_mm": {"label": "Min finished thickness", "unit": "mm"},
    "max_finished_thickness_mm": {"label": "Max finished thickness", "unit": "mm"},
    "bend_radius_factor_single_layer": {"label": "Bend radius (single layer)", "unit": "× thickness"},
    "bend_radius_factor_multi_layer": {"label": "Bend radius (multi-layer)", "unit": "× thickness"},
    "min_bga_pad_mm": {"label": "Min BGA pad diameter", "unit": "mm"},
    "min_plated_slot_mm": {"label": "Min plated slot width", "unit": "mm"},
    "min_castellated_hole_mm": {"label": "Min castellated hole diameter", "unit": "mm"},
    "castellated_hole_to_hole_mm": {"label": "Castellated hole to hole", "unit": "mm"},
    "min_solder_bridge_mm": {"label": "Min solder bridge width", "unit": "mm"},
    "gold_finger_edge_clearance_mm": {"label": "Gold finger to board edge", "unit": "mm"},
    "coverlay_expansion_mm": {"label": "Coverlay expansion (one side)", "unit": "mm"},
    "min_tooling_hole_mm": {"label": "Tooling hole diameter", "unit": "mm"},
    "fiducial_diameter_mm": {"label": "Fiducial diameter", "unit": "mm"},
    "panel_edge_width_mm": {"label": "Panel handling edge width", "unit": "mm"},
}

# PCBWay standard process, from pcbway.com/capabilities.html. KiCad-tracked
# minimums (mm); 16 mil = 0.4064 mm, 6 mil = 0.1524 mm.
PCBWAY_STANDARD_CAPABILITIES: dict[str, Any] = {
    # KiCad-tracked minimums; 6 mil = 0.1524 mm, 16 mil = 0.4064 mm,
    # 4 mil = 0.1016 mm, 2 mil = 0.0508 mm.
    "min_track_width": 0.1,              # 4 mil
    "min_clearance": 0.1,                # 4 mil
    "min_through_hole_diameter": 0.15,
    "min_via_annular_width": 0.15,       # 6 mil
    "min_copper_edge_clearance": 0.25,   # CNC routing
    "min_hole_to_hole": 0.4064,          # 16 mil
    "min_text_thickness": 0.15,
    "min_text_height": 0.8,
    "solder_mask_to_copper_clearance": 0.0508,  # 2 mil min opening
    # PCBWay capabilities KiCad does not track (custom); see PCBWAY_META below.
    "min_soldermask_bridge_mm": 0.1016,  # 4 mil
    "min_drilled_hole_mm": 0.15,
    "max_drilled_hole_mm": 6.0,
    "hole_size_tolerance_mm": 0.08,      # PTH
    "npth_hole_tolerance_mm": 0.05,
    "min_plated_slot_mm": 0.5,
    "min_castellated_hole_mm": 0.4,
    "min_board_size_mm": 3.0,
    "max_board_width_mm": 560.0,         # multilayer
    "max_board_height_mm": 1150.0,
    "min_board_thickness_mm": 0.2,
    "max_board_thickness_mm": 3.2,
    "board_outline_tolerance_mm": 0.2,   # CNC
    "impedance_tolerance_pct": 10.0,
    "max_outer_copper_oz": 8.0,
    "max_inner_copper_oz": 4.0,
}

# Labels/units for the custom (non KiCad-tracked) PCBWay capabilities above.
PCBWAY_META: dict[str, Any] = {
    "min_soldermask_bridge_mm": {"label": "Min solder-mask bridge", "unit": "mm"},
    "min_drilled_hole_mm": {"label": "Min drilled hole", "unit": "mm"},
    "max_drilled_hole_mm": {"label": "Max drilled hole", "unit": "mm"},
    "hole_size_tolerance_mm": {"label": "PTH hole tolerance (±)", "unit": "mm"},
    "npth_hole_tolerance_mm": {"label": "NPTH hole tolerance (±)", "unit": "mm"},
    "min_plated_slot_mm": {"label": "Min plated slot width", "unit": "mm"},
    "min_castellated_hole_mm": {"label": "Min castellated hole diameter", "unit": "mm"},
    "min_board_size_mm": {"label": "Min board size", "unit": "mm"},
    "max_board_width_mm": {"label": "Max board width", "unit": "mm"},
    "max_board_height_mm": {"label": "Max board height", "unit": "mm"},
    "min_board_thickness_mm": {"label": "Min board thickness", "unit": "mm"},
    "max_board_thickness_mm": {"label": "Max board thickness", "unit": "mm"},
    "board_outline_tolerance_mm": {"label": "Outline tolerance (±, CNC)", "unit": "mm"},
    "impedance_tolerance_pct": {"label": "Impedance tolerance (±)", "unit": "%"},
    "max_outer_copper_oz": {"label": "Max outer copper", "unit": "oz"},
    "max_inner_copper_oz": {"label": "Max inner copper", "unit": "oz"},
}

# PCBWay advanced / HDI process, from pcbway.com/advanced-pcb-capabilities.html.
# 2 mil = 0.0508 mm, 3 mil = 0.0762 mm, 6 mil = 0.1524 mm, 8 mil = 0.2032 mm.
PCBWAY_ADVANCED_CAPABILITIES: dict[str, Any] = {
    # KiCad-tracked minimums (HDI process).
    "min_track_width": 0.0508,           # 2 mil
    "min_clearance": 0.0508,             # 2 mil
    "min_via_diameter": 0.076,           # laser microvia
    "min_via_annular_width": 0.0762,     # 3 mil
    "min_through_hole_diameter": 0.15,   # mechanical via
    "min_hole_clearance": 0.1524,        # 6 mil hole to conductor
    "min_microvia_diameter": 0.076,
    "min_microvia_drill": 0.076,
    # HDI capabilities KiCad does not track (custom); see PCBWAY_ADVANCED_META.
    "min_mechanical_via_mm": 0.15,
    "min_bga_pad_mm": 0.2032,            # 8 mil
    "min_bga_pitch_mm": 0.4,
    "min_dielectric_thickness_mm": 0.0508,  # 2 mil insulating layer
    "min_blind_via_pp_thickness_mm": 0.06,
    "min_blind_via_core_thickness_mm": 0.1,
    "max_hdi_layers": 64.0,
    "max_board_width_mm": 609.0,
    "max_board_height_mm": 889.0,
    "min_board_thickness_mm": 0.21,
    "max_board_thickness_mm": 6.0,
    "aspect_ratio": 20.0,
    "impedance_tolerance_pct": 10.0,
    "max_outer_copper_oz": 8.0,
    "min_base_copper_oz": 0.33,
}

# Labels/units for the custom (non KiCad-tracked) PCBWay advanced capabilities.
PCBWAY_ADVANCED_META: dict[str, Any] = {
    "min_mechanical_via_mm": {"label": "Min mechanical via diameter", "unit": "mm"},
    "min_bga_pad_mm": {"label": "Min BGA pad diameter", "unit": "mm"},
    "min_bga_pitch_mm": {"label": "Min BGA pitch", "unit": "mm"},
    "min_dielectric_thickness_mm": {"label": "Min insulating layer thickness", "unit": "mm"},
    "min_blind_via_pp_thickness_mm": {"label": "Min blind-via prepreg thickness", "unit": "mm"},
    "min_blind_via_core_thickness_mm": {"label": "Min blind-via core thickness", "unit": "mm"},
    "max_hdi_layers": {"label": "Max HDI layer count", "unit": "layers"},
    "max_board_width_mm": {"label": "Max board width", "unit": "mm"},
    "max_board_height_mm": {"label": "Max board height", "unit": "mm"},
    "min_board_thickness_mm": {"label": "Min board thickness", "unit": "mm"},
    "max_board_thickness_mm": {"label": "Max board thickness", "unit": "mm"},
    "aspect_ratio": {"label": "Max aspect ratio (thickness : hole)", "unit": ": 1"},
    "impedance_tolerance_pct": {"label": "Impedance tolerance (±)", "unit": "%"},
    "max_outer_copper_oz": {"label": "Max outer copper", "unit": "oz"},
    "min_base_copper_oz": {"label": "Min base copper", "unit": "oz"},
}

SEED_MANUFACTURERS: list[dict[str, Any]] = [
    {
        "name": "JLCPCB",
        "website": "https://jlcpcb.com",
        "templates": [
            {"key": "jlcpcb:standard", "name": "JLCPCB standard", "config": JLCPCB_SPEC_CONFIG,
             "capabilities": JLCPCB_STANDARD_CAPABILITIES, "capability_meta": JLCPCB_STANDARD_META},
            {"key": "jlcpcb:advanced", "name": "JLCPCB advanced PCB", "config": JLCPCB_ADVANCED_SPEC_CONFIG,
             "capabilities": JLCPCB_ADVANCED_CAPABILITIES, "capability_meta": JLCPCB_ADVANCED_META},
            {"key": "jlcpcb:flex", "name": "JLCPCB flexible PCB", "config": JLCPCB_SPEC_CONFIG,
             "capabilities": JLCPCB_FLEX_CAPABILITIES, "capability_meta": JLCPCB_FLEX_META},
        ],
    },
    {
        "name": "PCBWay",
        "website": "https://www.pcbway.com",
        "templates": [
            {"key": "pcbway:standard", "name": "PCBWay standard", "config": PCBWAY_SPEC_CONFIG,
             "capabilities": PCBWAY_STANDARD_CAPABILITIES, "capability_meta": PCBWAY_META},
            {"key": "pcbway:advanced", "name": "PCBWay advanced PCB", "config": PCBWAY_ADVANCED_SPEC_CONFIG,
             "capabilities": PCBWAY_ADVANCED_CAPABILITIES, "capability_meta": PCBWAY_ADVANCED_META},
            {"key": "pcbway:flex", "name": "PCBWay flexible PCB", "config": PCBWAY_FLEX_SPEC_CONFIG},
        ],
    },
]
