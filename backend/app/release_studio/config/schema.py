"""Schema validation for release configurations and project policy overlays."""

from __future__ import annotations

import re
from pathlib import PurePosixPath, PureWindowsPath
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
_LOCAL_POLICY_DIR = PurePosixPath(".prism/release-studio/policies")


def validate_configuration_mapping(
    data: Mapping[str, Any],
    *,
    source: str = "<configuration>",
) -> dict[str, Any]:
    """Validate and normalize a release configuration mapping."""

    if not isinstance(data, Mapping):
        raise ConfigSchemaError(f"{source}: configuration root must be a mapping")
    _ensure_string_mapping_keys(data, source=source)

    unknown = sorted(key for key in data if key not in CONFIGURATION_KEYS)
    if unknown:
        names = ", ".join(repr(key) for key in unknown)
        raise ConfigSchemaError(f"{source}: unknown key(s): {names}")

    schema = data.get("schema")
    if schema != CONFIGURATION_SCHEMA:
        raise ConfigSchemaError(
            f"{source}: schema must be {CONFIGURATION_SCHEMA!r}, got {schema!r}"
        )

    title = _require_nonblank_string(data.get("title"), source=f"{source}.title")
    board = _normalize_repository_path(
        data.get("board"),
        source=f"{source}.board",
        kind="board",
        suffixes=(".kicad_pcb",),
    )
    schematic = _normalize_repository_path(
        data.get("schematic"),
        source=f"{source}.schematic",
        kind="schematic",
        suffixes=(".kicad_sch",),
    )
    jobset = _normalize_repository_path(
        data.get("jobset"),
        source=f"{source}.jobset",
        kind="jobset",
        suffixes=(".kicad_jobset",),
    )

    raw_default_variant = data.get("default_variant")
    if raw_default_variant is None:
        default_variant = ""
    else:
        default_variant = _require_nonblank_string(
            raw_default_variant,
            source=f"{source}.default_variant",
        )

    fields = data.get("fields", {})
    if fields is None:
        fields = {}
    if not isinstance(fields, Mapping):
        raise ConfigSchemaError(f"{source}.fields: must be a mapping")

    notes = data.get("notes", {})
    if notes is None:
        notes = {}
    if not isinstance(notes, Mapping):
        raise ConfigSchemaError(f"{source}.notes: must be a mapping")
    for note_key, note_value in notes.items():
        if not isinstance(note_value, list):
            raise ConfigSchemaError(
                f"{source}.notes.{note_key}: must be a list of strings"
            )
        for index, item in enumerate(note_value):
            if not isinstance(item, str) or not item.strip():
                raise ConfigSchemaError(
                    f"{source}.notes.{note_key}[{index}]: must be a non-empty string"
                )

    policy = data.get("policy")
    if policy is not None:
        _validate_policy_reference(policy, source=f"{source}.policy")

    variants = data.get("variants", [])
    if variants is None:
        variants = []
    variants = _normalize_nonblank_string_list(
        variants,
        source=f"{source}.variants",
        description="variants",
    )

    sheets = data.get("sheets")
    if sheets is not None:
        if not isinstance(sheets, list):
            raise ConfigSchemaError(f"{source}.sheets: must be a list")
        normalized_sheets = [
            _normalize_repository_path(
                item,
                source=f"{source}.sheets[{index}]",
                kind="schematic sheet",
                suffixes=(".kicad_sch",),
            )
            for index, item in enumerate(sheets)
        ]
    else:
        normalized_sheets = None

    normalized: dict[str, Any] = {
        "schema": CONFIGURATION_SCHEMA,
        "title": title,
        "board": board,
        "schematic": schematic,
        "jobset": jobset,
        "default_variant": default_variant,
        "fields": dict(fields),
        "notes": {key: list(value) for key, value in notes.items()},
        "variants": variants,
    }
    if policy is not None:
        normalized["policy"] = _normalize_policy_reference(
            policy,
            source=f"{source}.policy",
        )
    for optional_str in ("document_number", "revision"):
        value = data.get(optional_str)
        if value is not None:
            normalized[optional_str] = _require_nonblank_string(
                value,
                source=f"{source}.{optional_str}",
            )
    template = data.get("template")
    if template is not None:
        normalized["template"] = _normalize_repository_path(
            template,
            source=f"{source}.template",
            kind="template",
        )
    if normalized_sheets is not None:
        normalized["sheets"] = normalized_sheets
    return normalized


def validate_policy_mapping(
    data: Mapping[str, Any],
    *,
    source: str = "<policy>",
) -> dict[str, Any]:
    """Validate and normalize a project policy overlay."""

    if not isinstance(data, Mapping):
        raise ConfigSchemaError(f"{source}: policy root must be a mapping")
    _ensure_string_mapping_keys(data, source=source)

    unknown = sorted(key for key in data if key not in POLICY_KEYS)
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
        extends = validate_org_extends(extends, source=f"{source}.extends")

    rules = data.get("rules", [])
    if rules is None:
        rules = []
    if not isinstance(rules, list):
        raise ConfigSchemaError(f"{source}.rules: must be a list")
    for index, rule in enumerate(rules):
        if isinstance(rule, str) and not rule.strip():
            raise ConfigSchemaError(
                f"{source}.rules[{index}]: must not be blank"
            )

    waivers = data.get("waivers")
    if waivers is not None and not isinstance(waivers, Mapping):
        raise ConfigSchemaError(f"{source}.waivers: must be a mapping")

    version = data.get("version")
    if version is not None:
        if isinstance(version, bool) or not isinstance(version, int):
            raise ConfigSchemaError(f"{source}.version: must be an integer")
        if version <= 0:
            raise ConfigSchemaError(f"{source}.version: must be a positive integer")

    title = data.get("title")
    if title is not None:
        title = _require_nonblank_string(title, source=f"{source}.title")

    normalized: dict[str, Any] = {
        "schema": POLICY_SCHEMA,
        "rules": list(rules),
    }
    if extends is not None:
        normalized["extends"] = extends
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
        else:
            _normalize_local_policy_path(text, source=source)
        return
    if isinstance(value, Mapping):
        unknown = sorted(key for key in value if key not in {"extends", "path"})
        if unknown:
            names = ", ".join(repr(key) for key in unknown)
            raise ConfigSchemaError(f"{source}: unknown key(s): {names}")
        if "extends" in value:
            validate_org_extends(value["extends"], source=f"{source}.extends")
        path = value.get("path")
        if path is not None:
            _normalize_local_policy_path(path, source=f"{source}.path")
        if "extends" not in value and path is None:
            raise ConfigSchemaError(f"{source}: requires extends or path")
        return
    raise ConfigSchemaError(f"{source}: must be a string or mapping")


def _normalize_policy_reference(value: Any, *, source: str) -> Any:
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("org:"):
            return validate_org_extends(text, source=source)
        return _normalize_local_policy_path(text, source=source)
    assert isinstance(value, Mapping)
    normalized: dict[str, Any] = {}
    if "extends" in value:
        normalized["extends"] = validate_org_extends(
            value["extends"],
            source=f"{source}.extends",
        )
    if "path" in value and value["path"] is not None:
        normalized["path"] = _normalize_local_policy_path(
            value["path"],
            source=f"{source}.path",
        )
    return normalized


def _normalize_local_policy_path(value: Any, *, source: str) -> str:
    path = _normalize_repository_path(
        value,
        source=source,
        kind="local policy",
        suffixes=(".yaml",),
    )
    parts = tuple(path.split("/"))
    prefix = _LOCAL_POLICY_DIR.parts
    if len(parts) != len(prefix) + 1 or parts[: len(prefix)] != prefix:
        raise ConfigSchemaError(
            f"{source}: local policy path must be a direct .yaml file under "
            f"{_LOCAL_POLICY_DIR.as_posix()}/"
        )
    return path


def _normalize_repository_path(
    value: Any,
    *,
    source: str,
    kind: str,
    suffixes: tuple[str, ...] = (),
) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigSchemaError(
            f"{source}: {kind} path must be a non-empty repository-relative string"
        )
    text = value.strip()
    if "\x00" in text:
        raise ConfigSchemaError(f"{source}: {kind} path contains a NUL byte")

    windows = PureWindowsPath(text)
    if text.startswith(("/", "\\")) or windows.drive or windows.root:
        raise ConfigSchemaError(
            f"{source}: {kind} path must be repository-relative, not absolute: {text!r}"
        )
    if "\\" in text:
        raise ConfigSchemaError(
            f"{source}: {kind} path must use POSIX repository-relative form: {text!r}"
        )
    raw_parts = text.split("/")
    if ".." in raw_parts:
        raise ConfigSchemaError(
            f"{source}: {kind} path must not contain '..': {text!r}"
        )

    path = PurePosixPath(text)
    normalized = path.as_posix()
    if not normalized or normalized == ".":
        raise ConfigSchemaError(
            f"{source}: {kind} path must name a repository file"
        )
    if suffixes and path.suffix.casefold() not in {suffix.casefold() for suffix in suffixes}:
        expected = ", ".join(suffixes)
        raise ConfigSchemaError(
            f"{source}: {kind} path must end with one of {expected}: {text!r}"
        )
    return normalized


def _require_nonblank_string(value: Any, *, source: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigSchemaError(f"{source}: must be a non-empty string")
    return value.strip()


def _normalize_nonblank_string_list(
    value: Any,
    *,
    source: str,
    description: str,
) -> list[str]:
    if not isinstance(value, list):
        raise ConfigSchemaError(f"{source}: must be a list of strings")
    normalized: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            raise ConfigSchemaError(
                f"{source}[{index}]: {description} entries must be non-empty strings"
            )
        normalized.append(item.strip())
    return normalized


def _ensure_string_mapping_keys(value: Any, *, source: str) -> None:
    """Reject non-string or blank keys before any set/sort operation."""

    if isinstance(value, Mapping):
        for key, nested in value.items():
            if not isinstance(key, str):
                raise ConfigSchemaError(
                    f"{source}: mapping key {key!r} at {source} must be a string"
                )
            if not key.strip():
                raise ConfigSchemaError(
                    f"{source}: mapping key at {source} must be a non-empty string"
                )
            _ensure_string_mapping_keys(nested, source=f"{source}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _ensure_string_mapping_keys(item, source=f"{source}[{index}]")
