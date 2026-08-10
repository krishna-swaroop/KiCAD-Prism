"""Schema validation for release configurations and project policy overlays."""

from __future__ import annotations

import re
from typing import Any, Mapping

from .errors import ConfigSchemaError

CONFIGURATION_SCHEMA = "prism.release-studio.configuration/1"
POLICY_SCHEMA = "prism.release-studio.policy/1"

CONFIGURATION_KEYS = frozenset(
    {
        "schema",
        "title",
        "board",
        "schematic",
        "jobset",
        "default_variant",
        "policy",
        "fields",
        "notes",
        "document_number",
        "revision",
        "variants",
        "template",
        "sheets",
    }
)

POLICY_KEYS = frozenset(
    {
        "schema",
        "extends",
        "version",
        "title",
        "rules",
        "waivers",
    }
)

# org:<key>@<version> — version is a positive integer.
_PINNED_ORG_EXTENDS_RE = re.compile(r"^org:([A-Za-z0-9._-]+)@([1-9][0-9]*)$")
_UNPINNED_ORG_EXTENDS_RE = re.compile(r"^org:([A-Za-z0-9._-]+)$")


def validate_configuration_mapping(
    data: Mapping[str, Any],
    *,
    source: str = "<configuration>",
) -> dict[str, Any]:
    """Validate a release configuration mapping; reject unknown keys by name."""

    if not isinstance(data, Mapping):
        raise ConfigSchemaError(f"{source}: configuration root must be a mapping")

    unknown = sorted(set(data) - CONFIGURATION_KEYS)
    if unknown:
        names = ", ".join(repr(key) for key in unknown)
        raise ConfigSchemaError(f"{source}: unknown key(s): {names}")

    schema = data.get("schema")
    if schema != CONFIGURATION_SCHEMA:
        raise ConfigSchemaError(
            f"{source}: schema must be {CONFIGURATION_SCHEMA!r}, got {schema!r}"
        )

    for required in ("title", "board", "schematic", "jobset"):
        value = data.get(required)
        if not isinstance(value, str) or not value.strip():
            raise ConfigSchemaError(f"{source}: {required!r} must be a non-empty string")

    default_variant = data.get("default_variant", "")
    if default_variant is None:
        default_variant = ""
    if not isinstance(default_variant, str):
        raise ConfigSchemaError(f"{source}: default_variant must be a string")

    fields = data.get("fields", {})
    if fields is None:
        fields = {}
    if not isinstance(fields, Mapping):
        raise ConfigSchemaError(f"{source}: fields must be a mapping")

    notes = data.get("notes", {})
    if notes is None:
        notes = {}
    if not isinstance(notes, Mapping):
        raise ConfigSchemaError(f"{source}: notes must be a mapping")
    for note_key, note_value in notes.items():
        if not isinstance(note_value, list) or not all(
            isinstance(item, str) for item in note_value
        ):
            raise ConfigSchemaError(
                f"{source}: notes.{note_key} must be a list of strings"
            )

    policy = data.get("policy")
    if policy is not None:
        _validate_policy_reference(policy, source=f"{source}.policy")

    variants = data.get("variants", [])
    if variants is None:
        variants = []
    if not isinstance(variants, list) or not all(isinstance(item, str) for item in variants):
        raise ConfigSchemaError(f"{source}: variants must be a list of strings")

    sheets = data.get("sheets")
    if sheets is not None and not isinstance(sheets, list):
        raise ConfigSchemaError(f"{source}: sheets must be a list")

    for optional_str in ("document_number", "revision", "template"):
        value = data.get(optional_str)
        if value is not None and not isinstance(value, str):
            raise ConfigSchemaError(f"{source}: {optional_str!r} must be a string")

    # Return a normalized dict so digests are stable across YAML null/default forms.
    normalized: dict[str, Any] = {
        "schema": CONFIGURATION_SCHEMA,
        "title": data["title"].strip(),
        "board": data["board"].strip(),
        "schematic": data["schematic"].strip(),
        "jobset": data["jobset"].strip(),
        "default_variant": default_variant,
        "fields": dict(fields),
        "notes": {key: list(value) for key, value in notes.items()},
        "variants": list(variants),
    }
    if policy is not None:
        normalized["policy"] = _normalize_policy_reference(policy)
    for optional_str in ("document_number", "revision", "template"):
        if optional_str in data and data[optional_str] is not None:
            normalized[optional_str] = data[optional_str]
    if sheets is not None:
        normalized["sheets"] = list(sheets)
    return normalized


def validate_policy_mapping(
    data: Mapping[str, Any],
    *,
    source: str = "<policy>",
) -> dict[str, Any]:
    """Validate a project policy overlay; require pinned org extends."""

    if not isinstance(data, Mapping):
        raise ConfigSchemaError(f"{source}: policy root must be a mapping")

    unknown = sorted(set(data) - POLICY_KEYS)
    if unknown:
        names = ", ".join(repr(key) for key in unknown)
        raise ConfigSchemaError(f"{source}: unknown key(s): {names}")

    schema = data.get("schema")
    if schema != POLICY_SCHEMA:
        raise ConfigSchemaError(
            f"{source}: schema must be {POLICY_SCHEMA!r}, got {schema!r}"
        )

    extends = data.get("extends")
    if extends is not None:
        validate_org_extends(extends, source=f"{source}.extends")

    rules = data.get("rules", [])
    if rules is None:
        rules = []
    if not isinstance(rules, list):
        raise ConfigSchemaError(f"{source}: rules must be a list")

    waivers = data.get("waivers")
    if waivers is not None and not isinstance(waivers, Mapping):
        raise ConfigSchemaError(f"{source}: waivers must be a mapping")

    version = data.get("version")
    if version is not None and not isinstance(version, int):
        raise ConfigSchemaError(f"{source}: version must be an integer")

    title = data.get("title")
    if title is not None and not isinstance(title, str):
        raise ConfigSchemaError(f"{source}: title must be a string")

    normalized: dict[str, Any] = {
        "schema": POLICY_SCHEMA,
        "rules": list(rules),
    }
    if extends is not None:
        normalized["extends"] = extends.strip() if isinstance(extends, str) else extends
    if version is not None:
        normalized["version"] = version
    if title is not None:
        normalized["title"] = title
    if waivers is not None:
        normalized["waivers"] = dict(waivers)
    return normalized


def validate_org_extends(value: Any, *, source: str = "extends") -> str:
    """Accept only pinned ``org:<key>@<version>`` references."""

    if not isinstance(value, str) or not value.strip():
        raise ConfigSchemaError(f"{source}: must be a non-empty string")
    text = value.strip()
    if _PINNED_ORG_EXTENDS_RE.fullmatch(text):
        return text
    if _UNPINNED_ORG_EXTENDS_RE.fullmatch(text):
        raise ConfigSchemaError(
            f"{source}: unpinned org reference {text!r}; "
            "use org:<key>@<version>"
        )
    raise ConfigSchemaError(
        f"{source}: expected org:<key>@<version>, got {text!r}"
    )


def _validate_policy_reference(value: Any, *, source: str) -> None:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            raise ConfigSchemaError(f"{source}: must be a non-empty string")
        if text.startswith("org:"):
            validate_org_extends(text, source=source)
        return
    if isinstance(value, Mapping):
        unknown = sorted(set(value) - {"extends", "path"})
        if unknown:
            names = ", ".join(repr(key) for key in unknown)
            raise ConfigSchemaError(f"{source}: unknown key(s): {names}")
        if "extends" in value:
            validate_org_extends(value["extends"], source=f"{source}.extends")
        path = value.get("path")
        if path is not None and (not isinstance(path, str) or not path.strip()):
            raise ConfigSchemaError(f"{source}.path must be a non-empty string")
        if "extends" not in value and path is None:
            raise ConfigSchemaError(f"{source}: requires extends or path")
        return
    raise ConfigSchemaError(f"{source}: must be a string or mapping")


def _normalize_policy_reference(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    assert isinstance(value, Mapping)
    normalized: dict[str, Any] = {}
    if "extends" in value:
        normalized["extends"] = validate_org_extends(value["extends"])
    if "path" in value and value["path"] is not None:
        normalized["path"] = str(value["path"]).strip()
    return normalized
