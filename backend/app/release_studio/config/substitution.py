"""Strict ``{{namespace.key}}`` substitution for release notes and fields."""

from __future__ import annotations

import re
from typing import Any, Mapping

from .errors import SubstitutionError

_TOKEN_PATH_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*")


def substitute_string(
    text: str,
    context: Mapping[str, Any],
    *,
    source: str | None = None,
) -> str:
    """Replace ``{{ns.key}}`` tokens; missing keys and bad braces raise.

    Substitution is strict, non-recursive, and expression-free. An unknown
    key is never blanked — it raises ``SubstitutionError`` naming the key
    and optional source location (for example a note line).
    """

    if not isinstance(text, str):
        raise SubstitutionError(f"substitution target must be a string, got {type(text).__name__}")

    result: list[str] = []
    cursor = 0
    while cursor < len(text):
        char = text[cursor]
        if char == "}":
            _raise_substitution_error("unbalanced braces", text, source=source)
        if char != "{":
            result.append(char)
            cursor += 1
            continue

        if not text.startswith("{{", cursor):
            _raise_substitution_error("unbalanced braces", text, source=source)
        end = text.find("}}", cursor + 2)
        if end < 0:
            _raise_substitution_error("unbalanced braces", text, source=source)
        body = text[cursor + 2 : end]
        path = body.strip()
        if "{" in body or "}" in body:
            _raise_substitution_error("unbalanced braces", text, source=source)
        if not path or _TOKEN_PATH_RE.fullmatch(path) is None:
            _raise_substitution_error(
                f"invalid substitution token {body!r}",
                text,
                source=source,
            )
        try:
            value = _lookup(context, path)
        except KeyError as exc:
            missing = str(exc).strip("'")
            _raise_substitution_error(
                f"missing substitution key {missing!r}",
                text,
                source=source,
            )
        if value is None:
            _raise_substitution_error(
                f"missing substitution key {path!r}",
                text,
                source=source,
            )
        if isinstance(value, (dict, list)):
            _raise_substitution_error(
                f"substitution key {path!r} resolved to {type(value).__name__}",
                text,
                source=source,
            )
        result.append(str(value))
        cursor = end + 2

    return "".join(result)


def substitute_value(
    value: Any,
    context: Mapping[str, Any],
    *,
    source: str | None = None,
) -> Any:
    """Recursively substitute strings inside nested lists/dicts."""

    if isinstance(value, str):
        return substitute_string(value, context, source=source)
    if isinstance(value, list):
        return [
            substitute_value(
                item,
                context,
                source=f"{source}[{index}]" if source else f"[{index}]",
            )
            for index, item in enumerate(value)
        ]
    if isinstance(value, dict):
        return {
            key: substitute_value(
                item,
                context,
                source=f"{source}.{key}" if source else str(key),
            )
            for key, item in value.items()
        }
    return value


def _lookup(context: Mapping[str, Any], path: str) -> Any:
    current: Any = context
    parts = path.split(".")
    for index, part in enumerate(parts):
        if not isinstance(current, Mapping) or part not in current:
            raise KeyError(".".join(parts[: index + 1]))
        current = current[part]
    return current


def _raise_substitution_error(
    message: str,
    text: str,
    *,
    source: str | None,
) -> None:
    where = f" in {source}" if source else ""
    raise SubstitutionError(f"{message}{where}: {text!r}")
