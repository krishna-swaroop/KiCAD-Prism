"""Rewrite stored KiCad files into the payloads desktop KiCad places.

Symbols gain the component's metadata properties and a footprint reference
that points at the remote library nickname; footprints have their 3D model
paths redirected to the remote provider destination. These rewrites are pure
and byte-stable for identical inputs, which is what keeps manifest hashes and
inline bundles reproducible.
"""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any

from app.core.config import settings
from app.services.catalog.asset_files import content_type_for_asset
from app.services.catalog.metadata_descriptors import (
    SYMBOL_METADATA_FIELD_ORDER,
    SYMBOL_METADATA_LABEL_TO_KEY,
)
from app.services.catalog.normalization import sanitize_name, sha256_bytes


_TOP_LEVEL_PROPERTY_RE = re.compile(r'^([ \t]+)\(property "([^"]+)" ')
_MODEL_RE = re.compile(r'\(model\s+"[^"]+"')


def remote_library_nickname(library_name: str) -> str:
    prefix = sanitize_name(settings.REMOTE_PROVIDER_LIBRARY_PREFIX, "remote").lower()
    library = sanitize_name(library_name, "library").lower()
    return f"{prefix}_{library}"


def escape_symbol_property_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def symbol_property_block(name: str, value: str, *, indent: str = "    ", hidden: bool = True) -> str:
    hide = " hide" if hidden else ""
    child_indent = f"{indent}  "
    return (
        f'{indent}(property "{name}" "{escape_symbol_property_value(value)}" (at 0 0 0)\n'
        f"{child_indent}(effects (font (size 1.27 1.27)){hide})\n"
        f"{indent})\n"
    )


def symbol_metadata_fields(component: dict[str, Any] | None) -> dict[str, str]:
    if not component:
        return {label: "" for label in SYMBOL_METADATA_FIELD_ORDER}
    fields = {label: str(component.get(key) or "") for label, key in SYMBOL_METADATA_LABEL_TO_KEY.items()}
    for key, value in sorted(dict(component.get("extra_fields") or {}).items()):
        normalized_key = str(key).strip()
        if normalized_key and normalized_key not in fields and normalized_key not in {"Reference", "Footprint"}:
            fields[normalized_key] = str(value or "")
    return fields


def extract_top_level_symbol_properties(header: str) -> tuple[str, list[tuple[str, str]], str, str]:
    """Split a symbol header into prefix, property blocks, trailing text, indent."""
    lines = header.splitlines(keepends=True)
    prefix_parts: list[str] = []
    property_blocks: list[tuple[str, str]] = []
    trailing = ""
    first_indent = ""
    index = 0

    while index < len(lines):
        line = lines[index]
        match = _TOP_LEVEL_PROPERTY_RE.match(line)
        if not match:
            if property_blocks:
                trailing = "".join(lines[index:])
                break
            prefix_parts.append(line)
            index += 1
            continue

        indent = match.group(1)
        if not first_indent:
            first_indent = indent
        name = match.group(2)
        depth = line.count("(") - line.count(")")
        block_lines = [line]
        index += 1

        while depth > 0 and index < len(lines):
            block_line = lines[index]
            block_lines.append(block_line)
            depth += block_line.count("(") - block_line.count(")")
            index += 1

        property_blocks.append((name, "".join(block_lines)))

    return "".join(prefix_parts), property_blocks, trailing, first_indent or "    "


def rewrite_symbol_payload(
    payload: bytes,
    footprint_ref: str | None,
    component: dict[str, Any] | None = None,
) -> bytes:
    text = payload.decode("utf-8")
    first_symbol_index = text.find('(symbol "')
    marker_index = text.find('(symbol "', first_symbol_index + 1) if first_symbol_index != -1 else -1
    if marker_index <= 0:
        header = text
        suffix = ""
    else:
        header = text[:marker_index]
        suffix = text[marker_index:]

    prefix, extracted_blocks, trailing, indent = extract_top_level_symbol_properties(header)
    if not extracted_blocks:
        return payload

    existing_blocks = {name: block for name, block in extracted_blocks}
    ordered_names = [name for name, _ in extracted_blocks]
    metadata_fields = symbol_metadata_fields(component)
    custom_blocks = {
        label: symbol_property_block(label, value, indent=indent, hidden=label != "Value")
        for label, value in metadata_fields.items()
    }
    if footprint_ref:
        custom_blocks["Footprint"] = symbol_property_block("Footprint", footprint_ref, indent=indent)
    elif "Footprint" in existing_blocks:
        custom_blocks["Footprint"] = existing_blocks["Footprint"]

    for property_name in SYMBOL_METADATA_FIELD_ORDER:
        if property_name not in ordered_names:
            ordered_names.append(property_name)
    for property_name in sorted(set(metadata_fields) - set(SYMBOL_METADATA_FIELD_ORDER)):
        if property_name not in ordered_names:
            ordered_names.append(property_name)
    if "Footprint" not in ordered_names:
        ordered_names.append("Footprint")

    rebuilt_blocks = [
        custom_blocks.get(property_name, existing_blocks.get(property_name, ""))
        for property_name in ordered_names
    ]
    return (prefix + "".join(rebuilt_blocks) + trailing + suffix).encode("utf-8")


def rewrite_footprint_payload(
    payload: bytes,
    asset: dict[str, Any],
    model_assets: list[dict[str, Any]] | None = None,
) -> bytes:
    text = payload.decode("utf-8")
    models = list(model_assets or [])
    if not models or "(model " not in text:
        return payload
    prefix = sanitize_name(settings.REMOTE_PROVIDER_LIBRARY_PREFIX, "remote").lower()
    destination = settings.REMOTE_PROVIDER_DESTINATION_DIR.rstrip("/")
    if destination in {"/RemoteLibrary", "$/RemoteLibrary"}:
        destination = "${KIPRJMOD}/RemoteLibrary"
    model_index = 0

    def replace_model(match: re.Match[str]) -> str:
        nonlocal model_index
        if model_index >= len(models):
            return match.group(0)
        model = models[model_index]
        model_index += 1
        model_name = Path(str(model.get("canonical_path") or model.get("name") or "model.step")).name
        model_path = f"{destination}/{prefix}_3d/{model_name}"
        return f'(model "{model_path}"'

    return _MODEL_RE.sub(replace_model, text).encode("utf-8")


def materialize_asset(
    asset: dict[str, Any],
    assets_for_revision: list[dict[str, Any]],
    component: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Read one stored asset and return it with its placement payload attached."""
    path = Path(str(asset["canonical_path"]))
    payload = path.read_bytes()
    if asset["asset_type"] == "symbol":
        footprint_asset = next(
            (candidate for candidate in assets_for_revision if candidate["asset_type"] == "footprint"), None
        )
        footprint_ref = None
        if footprint_asset:
            footprint_ref = (
                f"{remote_library_nickname(str(footprint_asset['target_library']))}:{footprint_asset['target_name']}"
            )
        payload = rewrite_symbol_payload(payload, footprint_ref, component)
    elif asset["asset_type"] == "footprint":
        payload = rewrite_footprint_payload(
            payload,
            asset,
            [candidate for candidate in assets_for_revision if candidate["asset_type"] == "3dmodel"],
        )
    return {
        **asset,
        "payload": payload,
        "content_type": content_type_for_asset(str(asset["asset_type"]), path),
        "size_bytes": len(payload),
        "sha256": sha256_bytes(payload),
        "name": path.name,
    }


__all__ = [
    "SYMBOL_METADATA_FIELD_ORDER",
    "escape_symbol_property_value",
    "extract_top_level_symbol_properties",
    "materialize_asset",
    "remote_library_nickname",
    "rewrite_footprint_payload",
    "rewrite_symbol_payload",
    "symbol_metadata_fields",
    "symbol_property_block",
]
