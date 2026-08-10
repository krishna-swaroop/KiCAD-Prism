"""Strict ``{{namespace.key}}`` substitution for release notes and fields."""

from __future__ import annotations

import re
from typing import Any, Mapping

from .errors import SubstitutionError

_TOKEN_RE = re.compile(r"\{\{([^{}]+)\}\}")
_BARE_BRACE_RE = re.compile(r"(?<!\{)\{(?!\{)|(?<!\})\}(?!\})")


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

    if _BARE_BRACE_RE.search(text):
        where = f" in {source}" if source else ""
        raise SubstitutionError(f"unbalanced braces{where}: {text!r}")

    def _replace(match: re.Match[str]) -> str:
        path = match.group(1).strip()
        if not path or any(ch.isspace() for ch in path):
            where = f" in {source}" if source else ""
            raise SubstitutionError(f"invalid substitution token{where}: {match.group(0)!r}")
        try:
            value = _lookup(context, path)
        except KeyError as exc:
            where = f" in {source}" if source else ""
            missing = str(exc).strip("'")
            raise SubstitutionError(
                f"missing substitution key {missing!r}{where}"
            ) from None
        if value is None:
            where = f" in {source}" if source else ""
            raise SubstitutionError(f"missing substitution key {path!r}{where}")
        if isinstance(value, (dict, list)):
            where = f" in {source}" if source else ""
            raise SubstitutionError(
                f"substitution key {path!r} resolved to {type(value).__name__}{where}"
            )
        return str(value)

    return _TOKEN_RE.sub(_replace, text)


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
