"""Stable, domain-scoped projections of Prism's semantic index (S1).

The semantic index is a cache artifact and contains a generation timestamp,
lookup indexes, and generator metadata.  None of those describe the design.
This module reduces it to facts a domain reviewer actually reasons about and
sorts set-like collections canonically before they enter a fingerprint.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from app.release_studio.canonical import canonical_json


def _stable_list(value: Any) -> list[Any]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        return []
    rows = [dict(item) if isinstance(item, Mapping) else item for item in value]
    return sorted(rows, key=canonical_json)


def semantic_scope_projections(index: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """Return the semantic facts assigned to each governed technical domain."""

    schema = str(index.get("schema") or "")
    components = _stable_list(index.get("components"))
    nets = _stable_list(index.get("nets"))
    terminals = _stable_list(index.get("terminals"))
    sheet_instances = _stable_list(index.get("sheetInstances"))
    buses = _stable_list(index.get("buses"))

    bare_board = {
        "schema": schema,
        "nets": nets,
        "terminals": terminals,
    }
    assembly = {
        "schema": schema,
        "components": components,
    }
    documentation = {
        **bare_board,
        "components": components,
        "sheetInstances": sheet_instances,
        "buses": buses,
    }
    return {
        "bare_board": bare_board,
        "assembly": assembly,
        "documentation": documentation,
    }


__all__ = ["semantic_scope_projections"]
