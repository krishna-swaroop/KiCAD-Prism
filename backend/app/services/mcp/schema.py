"""The JSON-Schema object wrapper the MCP tool modules share."""

from __future__ import annotations

from typing import Any


def object_schema(
    properties: dict[str, Any],
    required: tuple[str, ...] = (),
    *,
    additional: bool = False,
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": additional,
    }
