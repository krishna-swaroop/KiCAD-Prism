"""Synthesize a release configuration mapping from per-release build inputs."""

from __future__ import annotations

from typing import Any, Mapping

from app.release_studio.config.schema import CONFIGURATION_SCHEMA, validate_configuration_mapping
from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY


def synthesize_configuration(
    *,
    board: str,
    schematic: str,
    variant: str = "",
    document_name: str = "",
    tag: str = "",
    date: str = "",
    notes: str = "",
    manufacturing: Mapping[str, Any] | None = None,
    vendors: list[str] | None = None,
    bom_preset: str = "",
    title: str = "",
) -> dict[str, Any]:
    """Build the mapping the document engine and closure already consume."""

    specs = dict(manufacturing or {})
    fields = {
        key: str(specs[key]).strip()
        for key in (
            "manufacturing_ipc_class",
            "assembly_ipc_class",
            "solder_mask_colour",
            "silkscreen_colour",
            "via_treatment",
        )
        if str(specs.get(key) or "").strip()
    }
    document = {
        "schema": CONFIGURATION_SCHEMA,
        "title": (title or document_name or tag or "Release").strip(),
        "board": board,
        "schematic": schematic,
        "default_variant": variant.strip(),
        "variants": [variant.strip()] if variant.strip() else [],
        "fields": fields,
        "notes": {},
        "typography": DEFAULT_TYPOGRAPHY,
        "vendors": list(vendors or specs.get("vendors") or []),
    }
    if document_name.strip():
        document["document_number"] = document_name.strip()
    if tag.strip():
        document["revision"] = tag.strip()
    if date.strip():
        document["release_date"] = date.strip()
    if notes.strip():
        document["release_notes"] = notes.strip()
    if bom_preset.strip():
        document["bom_preset"] = bom_preset.strip()
    return validate_configuration_mapping(document, source="<release-inputs>")
