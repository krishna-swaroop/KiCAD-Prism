"""Typed built-in metadata descriptors shared by registry, normalize, and exports.

Persistence columns and versioned API models stay explicit. Callers check those
contracts against this list instead of inventing SQL or generating request
models. Project-import symbol labels still omit ``sap_code``; name that gap in
``PROJECT_IMPORT_KNOWN_LABEL_GAPS`` until a behavioral ticket populates it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping


@dataclass(frozen=True)
class BuiltinMetadataDescriptor:
    """One built-in catalog metadata field and its boundary names."""

    key: str
    label: str
    group: str
    field_type: str
    required: bool = False
    unit: str = ""
    aliases: tuple[str, ...] = ()
    symbol_label: str | None = None
    create_field: str | None = None
    update_field: str | None = None
    csv_field: str | None = None
    in_search_document: bool = False
    in_keywords: bool = False
    normalize_required: bool = False

    def request_create_field(self) -> str:
        return self.create_field or self.key

    def request_update_field(self) -> str:
        return self.update_field or self.key

    def request_csv_field(self) -> str:
        return self.csv_field or self.key


BUILTIN_METADATA_DESCRIPTORS: tuple[BuiltinMetadataDescriptor, ...] = (
    BuiltinMetadataDescriptor(
        key="value",
        label="Value",
        group="core",
        field_type="text",
        required=True,
        symbol_label="Value",
        in_search_document=True,
        in_keywords=True,
        normalize_required=True,
    ),
    BuiltinMetadataDescriptor(
        key="category",
        label="Category",
        group="core",
        field_type="text",
        in_search_document=True,
        in_keywords=True,
    ),
    BuiltinMetadataDescriptor(
        key="description",
        label="Description",
        group="core",
        field_type="text",
        required=True,
        symbol_label="Description",
        in_search_document=True,
        normalize_required=True,
    ),
    BuiltinMetadataDescriptor(
        key="datasheet_url",
        label="Datasheet",
        group="core",
        field_type="url",
        required=True,
        aliases=("datasheet",),
        symbol_label="Datasheet",
        create_field="datasheet",
        csv_field="datasheet",
        normalize_required=True,
    ),
    BuiltinMetadataDescriptor(
        key="manufacturer",
        label="Manufacturer",
        group="core",
        field_type="text",
        required=True,
        symbol_label="Manufacturer",
        in_search_document=True,
        in_keywords=True,
        normalize_required=True,
    ),
    BuiltinMetadataDescriptor(
        key="mpn",
        label="Manufacturer Part Number",
        group="core",
        field_type="text",
        required=True,
        aliases=("manufacturer_part_number",),
        symbol_label="Manufacturer Part Number",
        create_field="manufacturer_part_number",
        csv_field="manufacturer_part_number",
        in_search_document=True,
        in_keywords=True,
    ),
    BuiltinMetadataDescriptor(
        key="vendor",
        label="Vendor",
        group="core",
        field_type="text",
        symbol_label="Vendor",
        in_search_document=True,
        in_keywords=True,
    ),
    BuiltinMetadataDescriptor(
        key="vendor_part_number",
        label="Vendor Part Number",
        group="core",
        field_type="text",
        symbol_label="Vendor Part Number",
        in_search_document=True,
    ),
    BuiltinMetadataDescriptor(
        key="package_name",
        label="Package / Footprint",
        group="core",
        field_type="text",
        in_search_document=True,
        in_keywords=True,
    ),
    BuiltinMetadataDescriptor(
        key="mass_g",
        label="Mass",
        group="engineering",
        field_type="number",
        unit="g",
        symbol_label="Mass (g)",
    ),
    BuiltinMetadataDescriptor(
        key="rqjc_c_w",
        label="RQjC",
        group="engineering",
        field_type="number",
        unit="C/W",
        symbol_label="RQjC (C/W)",
    ),
    BuiltinMetadataDescriptor(
        key="rqjc_top_c_w",
        label="RQjC top",
        group="engineering",
        field_type="number",
        unit="C/W",
        symbol_label="RQjC_top (C/W)",
    ),
    BuiltinMetadataDescriptor(
        key="temp_max_c",
        label="Maximum temperature",
        group="engineering",
        field_type="number",
        unit="C",
        symbol_label="Temp_max (C)",
    ),
    BuiltinMetadataDescriptor(
        key="temp_min_c",
        label="Minimum temperature",
        group="engineering",
        field_type="number",
        unit="C",
        symbol_label="Temp_min (C)",
    ),
    BuiltinMetadataDescriptor(
        key="power_dissipation_w",
        label="Power dissipation",
        group="engineering",
        field_type="number",
        unit="W",
        symbol_label="Power Dissipation (W)",
    ),
    BuiltinMetadataDescriptor(
        key="rate",
        label="Rate",
        group="engineering",
        field_type="number",
        symbol_label="Rate",
    ),
    BuiltinMetadataDescriptor(
        key="sap_code",
        label="SAP Code",
        group="core",
        field_type="text",
        symbol_label="SAP Code",
        in_search_document=True,
    ),
)

CREATE_REQUEST_PASSTHROUGH_FIELDS = frozenset({"change_summary", "extra_fields"})
UPDATE_REQUEST_PASSTHROUGH_FIELDS = frozenset(
    {"change_summary", "extra_fields", "expected_revision_id"}
)
INSERT_COLUMN_PASSTHROUGH_FIELDS = frozenset(
    {"name", "normalized_manufacturer", "normalized_mpn", "mpn_source", "summary"}
)
# Project import reads these from proposal metadata, not KiCad property labels.
PROJECT_IMPORT_LABEL_SKIP_KEYS = frozenset(
    {"value", "description", "datasheet_url", "manufacturer", "mpn"}
)
# SAP Code is present on symbols and in CSV/API, but project import still leaves
# it in extra_fields. Populate the column in a separate behavioral ticket.
PROJECT_IMPORT_KNOWN_LABEL_GAPS = frozenset({"sap_code"})
# Search and keyword surfaces keep these explicit orders; the completeness
# checker requires them to match the descriptor flags.
BUILTIN_SEARCH_DOCUMENT_KEYS: tuple[str, ...] = (
    "value",
    "description",
    "manufacturer",
    "mpn",
    "package_name",
    "category",
    "vendor",
    "vendor_part_number",
    "sap_code",
)
BUILTIN_KEYWORD_KEYS: tuple[str, ...] = (
    "value",
    "manufacturer",
    "mpn",
    "package_name",
    "category",
    "vendor",
)


def _registry_entry(descriptor: BuiltinMetadataDescriptor) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "key": descriptor.key,
        "label": descriptor.label,
        "group": descriptor.group,
        "type": descriptor.field_type,
    }
    if descriptor.required:
        entry["required"] = True
    if descriptor.unit:
        entry["unit"] = descriptor.unit
    return entry


BUILTIN_METADATA_FIELDS: tuple[dict[str, Any], ...] = tuple(
    _registry_entry(descriptor) for descriptor in BUILTIN_METADATA_DESCRIPTORS
)
SYMBOL_METADATA_LABEL_TO_KEY = {
    descriptor.symbol_label: descriptor.key
    for descriptor in BUILTIN_METADATA_DESCRIPTORS
    if descriptor.symbol_label is not None
}
SYMBOL_METADATA_FIELD_ORDER: tuple[str, ...] = tuple(
    descriptor.symbol_label
    for descriptor in BUILTIN_METADATA_DESCRIPTORS
    if descriptor.symbol_label is not None
)


def read_builtin_metadata_value(payload: Mapping[str, Any], descriptor: BuiltinMetadataDescriptor) -> str:
    """Return the descriptor's payload value, using aliases as first-truthy fallbacks.

    An empty string, ``0``, or ``False`` on the canonical key is treated as
    absent, matching the historical ``payload.get(key) or payload.get(alias)``
    chain. Do not add aliases to numeric fields without revisiting that rule.
    """

    raw: Any = payload.get(descriptor.key)
    for alias in descriptor.aliases:
        raw = raw or payload.get(alias)
    return str(raw or "").strip()


def builtin_metadata_mapping_gaps(
    *,
    normalized_keys: Iterable[str],
    create_fields: Iterable[str],
    update_fields: Iterable[str],
    symbol_label_to_key: Mapping[str, str],
    csv_payload_keys: Iterable[str],
    patch_columns: Mapping[str, str] | None = None,
    insert_columns: Iterable[str] | None = None,
    import_label_to_key: Mapping[str, str] | None = None,
    import_label_gaps: Iterable[str] | None = None,
    import_unchanged_keys: Iterable[str] | None = None,
    revision_diff_keys: Iterable[str] | None = None,
) -> tuple[str, ...]:
    """Return human-readable gaps when a surface omits a built-in field."""

    normalized = set(normalized_keys)
    create = set(create_fields)
    update = set(update_fields)
    csv_keys = set(csv_payload_keys)
    insert = None if insert_columns is None else set(insert_columns)
    import_labels = None if import_label_to_key is None else dict(import_label_to_key)
    known_import_gaps = set() if import_label_gaps is None else set(import_label_gaps)
    unchanged = None if import_unchanged_keys is None else set(import_unchanged_keys)
    diff_keys = None if revision_diff_keys is None else set(revision_diff_keys)
    gaps: list[str] = []
    for descriptor in BUILTIN_METADATA_DESCRIPTORS:
        if descriptor.key not in normalized:
            gaps.append(f"normalization missing {descriptor.key}")
        create_name = descriptor.request_create_field()
        if create_name not in create:
            gaps.append(f"create API missing {create_name}")
        update_name = descriptor.request_update_field()
        if update_name not in update:
            gaps.append(f"update API missing {update_name}")
        if descriptor.symbol_label is not None:
            mapped = symbol_label_to_key.get(descriptor.symbol_label)
            if mapped != descriptor.key:
                gaps.append(
                    f"symbol label {descriptor.symbol_label!r} missing or maps to {mapped!r}"
                )
        if descriptor.key not in csv_keys:
            gaps.append(f"CSV import payload missing {descriptor.key}")
        if patch_columns is not None and descriptor.key not in patch_columns:
            gaps.append(f"metadata patch columns missing {descriptor.key}")
        if insert is not None and descriptor.key not in insert:
            gaps.append(f"insert columns missing {descriptor.key}")
        if unchanged is not None and descriptor.key not in unchanged:
            gaps.append(f"import unchanged-check missing {descriptor.key}")
        if diff_keys is not None and descriptor.key not in diff_keys:
            gaps.append(f"revision diff missing {descriptor.key}")
        if import_labels is not None and descriptor.symbol_label is not None:
            if descriptor.key not in PROJECT_IMPORT_LABEL_SKIP_KEYS:
                mapped_import = import_labels.get(descriptor.symbol_label)
                if descriptor.key in known_import_gaps:
                    if mapped_import == descriptor.key:
                        gaps.append(
                            f"project import closed known gap {descriptor.key} without updating the allowlist"
                        )
                elif mapped_import != descriptor.key:
                    gaps.append(
                        f"project import missing {descriptor.symbol_label!r}"
                    )
    flagged_search = {
        descriptor.key
        for descriptor in BUILTIN_METADATA_DESCRIPTORS
        if descriptor.in_search_document
    }
    flagged_keywords = {
        descriptor.key for descriptor in BUILTIN_METADATA_DESCRIPTORS if descriptor.in_keywords
    }
    if flagged_search != set(BUILTIN_SEARCH_DOCUMENT_KEYS):
        gaps.append("search-document keys drifted from descriptor flags")
    if flagged_keywords != set(BUILTIN_KEYWORD_KEYS):
        gaps.append("keyword keys drifted from descriptor flags")
    if insert is not None:
        extra_insert = (
            insert
            - {descriptor.key for descriptor in BUILTIN_METADATA_DESCRIPTORS}
            - set(INSERT_COLUMN_PASSTHROUGH_FIELDS)
        )
        for extra in sorted(extra_insert):
            gaps.append(f"insert columns extra {extra}")
    known_create = {
        descriptor.request_create_field() for descriptor in BUILTIN_METADATA_DESCRIPTORS
    } | set(CREATE_REQUEST_PASSTHROUGH_FIELDS)
    known_update = {
        descriptor.request_update_field() for descriptor in BUILTIN_METADATA_DESCRIPTORS
    } | set(UPDATE_REQUEST_PASSTHROUGH_FIELDS)
    for extra in sorted(create - known_create):
        gaps.append(f"create API extra {extra}")
    for extra in sorted(update - known_update):
        gaps.append(f"update API extra {extra}")
    return tuple(gaps)


__all__ = [
    "BUILTIN_KEYWORD_KEYS",
    "BUILTIN_METADATA_DESCRIPTORS",
    "BUILTIN_METADATA_FIELDS",
    "BUILTIN_SEARCH_DOCUMENT_KEYS",
    "BuiltinMetadataDescriptor",
    "CREATE_REQUEST_PASSTHROUGH_FIELDS",
    "INSERT_COLUMN_PASSTHROUGH_FIELDS",
    "PROJECT_IMPORT_KNOWN_LABEL_GAPS",
    "PROJECT_IMPORT_LABEL_SKIP_KEYS",
    "SYMBOL_METADATA_FIELD_ORDER",
    "SYMBOL_METADATA_LABEL_TO_KEY",
    "UPDATE_REQUEST_PASSTHROUGH_FIELDS",
    "builtin_metadata_mapping_gaps",
    "read_builtin_metadata_value",
]
