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
    # A trailing `(unit)` on a numeric field's label, split off: `Thickness (mm)`
    # gives label "Thickness" and unit "mm". Empty for other types.
    unit: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "unit": self.unit,
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
        if field_def.type in ("int", "number"):
            label, unit = _split_label_unit(field_def.label)
            if unit and _is_unit(unit):
                field_def.label, field_def.unit = label, unit
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


def _is_unit(text: str) -> bool:
    """A unit is a short single token (mm, oz, mil, um). A longer phrase in brackets
    is part of the label, not something to print after the value."""
    return 0 < len(text) <= 8 and not any(ch.isspace() for ch in text)


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
            label, unit = (fld.label, fld.unit) if fld.unit else _split_label_unit(fld.label)
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


# Built-in templates live in their own module; re-exported so callers keep importing from here.
from app.services.spec_config_templates import *  # noqa: E402,F401,F403
