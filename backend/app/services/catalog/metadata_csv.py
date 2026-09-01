"""Pure metadata CSV preparation, rendering, parsing, and comparison."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import io
import re
from typing import Any, Mapping

from app.services.catalog.normalization import json_loads as _json_loads


CSV_REQUIRED_COLUMNS = (
    "value",
    "datasheet",
    "description",
    "manufacturer",
    "manufacturer_part_number",
)

CSV_ASSET_COLUMNS = (
    "symbol_file_path",
    "symbol_target_library",
    "symbol_target_name",
    "footprint_file_path",
    "footprint_target_library",
    "footprint_target_name",
    "model_3d_file_path",
    "spice_file_path",
)

CSV_SPREADSHEET_TEXT_GUARD = "\u200b"


@dataclass(frozen=True)
class PreparedMetadataCsvExport:
    """Ordered field groups and headers for a metadata CSV export."""

    fixed_fields: tuple[dict[str, Any], ...]
    custom_fields: tuple[dict[str, Any], ...]
    headers: tuple[str, ...]
    schema_version: str


@dataclass(frozen=True)
class ParsedMetadataCsvPreview:
    """Parsed metadata preview rows and unknown-field proposals."""

    parsed_rows: list[tuple[int, str, str, dict[str, str]]]
    proposed_fields: list[dict[str, Any]]


@dataclass(frozen=True)
class FilteredMetadataCsvChanges:
    """Rows and proposals that remain after comparing current metadata."""

    items: list[dict[str, Any]]
    skipped_unchanged_rows: int
    used_proposals: list[dict[str, Any]]


@dataclass(frozen=True)
class PreparedMetadataCsvImportRow:
    """A normalized legacy import row and its pure derived payloads."""

    row: dict[str, str]
    asset_links: tuple[tuple[str, str, str, str], ...]
    payload: dict[str, str]


@dataclass(frozen=True)
class ParsedMetadataCsvImport:
    """Validated legacy import rows in source order."""

    rows: list[PreparedMetadataCsvImportRow]


def _slugify(value: str, default: str = "component") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", (value or "").strip().lower()).strip("._-")
    return cleaned or default


class CatalogMetadataCsv:
    """Stateless metadata CSV operations."""

    @staticmethod
    def prepare_export(
        fields: list[dict[str, Any]],
        field_keys: list[str] | None = None,
        *,
        schema_version: str = "prism.component_metadata_a1",
    ) -> PreparedMetadataCsvExport:
        selected = list(fields)
        if field_keys is not None:
            requested = {str(key) for key in field_keys}
            known = {str(field["key"]) for field in fields}
            unknown = sorted(requested - known)
            if unknown:
                raise ValueError(f"Unknown or archived metadata field(s): {', '.join(unknown)}")
            selected = [field for field in fields if str(field["key"]) in requested]
        custom_fields = tuple(field for field in selected if field["storage_kind"] == "extra")
        fixed_fields = tuple(field for field in selected if field["storage_kind"] == "column")
        headers = (
            "_prism_schema_version",
            "component_id",
            "expected_revision_id",
            "revision",
            "workflow_stage",
            *(str(field["key"]) for field in fixed_fields),
            *(f"custom:{field['key']}" for field in custom_fields),
        )
        return PreparedMetadataCsvExport(
            fixed_fields=fixed_fields,
            custom_fields=custom_fields,
            headers=headers,
            schema_version=schema_version,
        )

    @staticmethod
    def render_header(prepared: PreparedMetadataCsvExport) -> str:
        output = io.StringIO()
        csv.DictWriter(output, fieldnames=prepared.headers, extrasaction="ignore").writeheader()
        return output.getvalue()

    @staticmethod
    def render_row(prepared: PreparedMetadataCsvExport, row: Mapping[str, Any]) -> str:
        extras = _json_loads(row["extra_fields"], {})
        payload = {
            "_prism_schema_version": prepared.schema_version,
            "component_id": str(row["component_id"]), "expected_revision_id": str(row["id"]),
            "revision": str(row["version"]), "workflow_stage": str(row["release_status"]),
        }
        payload.update({
            field["key"]: CatalogMetadataCsv.metadata_csv_export_value(
                field, str(row[field["storage_key"]] or "")
            )
            for field in prepared.fixed_fields
        })
        payload.update({
            f"custom:{field['key']}": CatalogMetadataCsv.metadata_csv_export_value(
                field, str(extras.get(field["storage_key"], "")),
            )
            for field in prepared.custom_fields
        })
        output = io.StringIO()
        csv.DictWriter(output, fieldnames=prepared.headers, extrasaction="ignore").writerow(payload)
        return output.getvalue()

    @staticmethod
    def metadata_csv_export_value(field: dict[str, Any], value: str) -> str:
        # CSV has no type information and spreadsheet applications aggressively
        # coerce text such as 0207, TRUE, dates, and long part numbers. An invisible
        # text marker survives spreadsheet save/export and is removed on re-import.
        if value and str(field.get("type") or "text") in {"text", "enum"}:
            return f"{CSV_SPREADSHEET_TEXT_GUARD}{value}"
        return value

    @staticmethod
    def metadata_csv_import_value(field: dict[str, Any] | None, value: str) -> str:
        normalized = str(value or "").removeprefix(CSV_SPREADSHEET_TEXT_GUARD).strip()
        if field and str(field.get("type") or "text") == "boolean":
            lowered = normalized.casefold()
            if lowered in {"true", "1", "yes"}:
                return "true"
            if lowered in {"false", "0", "no"}:
                return "false"
        return normalized

    @staticmethod
    def metadata_csv_values_equal(
        field: dict[str, Any] | None, before: str, after: str
    ) -> bool:
        if before == after:
            return True
        field_type = str((field or {}).get("type") or "text")
        before_folded = before.casefold()
        after_folded = after.casefold()
        boolean_tokens = {"true": True, "1": True, "yes": True, "false": False, "0": False, "no": False}
        if field_type == "boolean":
            return boolean_tokens.get(before_folded) == boolean_tokens.get(after_folded)
        if before_folded in {"true", "false"} and after_folded in {"true", "false"}:
            return before_folded == after_folded
        if field_type == "number":
            try:
                return Decimal(before) == Decimal(after)
            except InvalidOperation:
                return False
        return False

    @staticmethod
    def parse_preview(
        file_content: str, fields: list[dict[str, Any]]
    ) -> ParsedMetadataCsvPreview:
        reader = csv.DictReader(io.StringIO(file_content.lstrip("\ufeff")))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")
        reserved = {"_prism_schema_version", "component_id", "expected_revision_id", "revision", "workflow_stage"}
        fields_by_key = {field["key"]: field for field in fields}
        proposed: list[dict[str, Any]] = []
        header_to_key: dict[str, str] = {}
        for header in reader.fieldnames:
            if header in reserved:
                continue
            key = header.removeprefix("custom:")
            if key not in fields_by_key:
                proposed_key = re.sub(r"[^a-z0-9_]+", "_", key.casefold()).strip("_")
                if not proposed_key:
                    continue
                proposal = {
                    "key": proposed_key, "label": key, "description": "Imported from CSV",
                    "type": "text", "enum_values": [],
                }
                if proposed_key not in {item["key"] for item in proposed}:
                    proposed.append(proposal)
                header_to_key[header] = proposed_key
            else:
                header_to_key[header] = key
        parsed_rows: list[tuple[int, str, str, dict[str, str]]] = []
        for index, row in enumerate(reader, start=2):
            component_id = str(row.get("component_id") or "").strip()
            revision_id = str(row.get("expected_revision_id") or "").strip()
            if not component_id or not revision_id:
                raise ValueError(f"Row {index}: component_id and expected_revision_id are required")
            patch = {
                field_key: CatalogMetadataCsv.metadata_csv_import_value(
                    fields_by_key.get(field_key)
                    or next((field for field in proposed if field["key"] == field_key), None),
                    str(row.get(header) or ""),
                )
                for header, field_key in header_to_key.items()
            }
            parsed_rows.append((index, component_id, revision_id, patch))
        return ParsedMetadataCsvPreview(
            parsed_rows=parsed_rows,
            proposed_fields=proposed,
        )

    @staticmethod
    def filter_preview_changes(
        parsed_rows: list[tuple[int, str, str, dict[str, str]]],
        current_rows: Mapping[str, Mapping[str, Any]],
        fields: Mapping[str, dict[str, Any]],
        proposed: list[dict[str, Any]],
    ) -> FilteredMetadataCsvChanges:
        proposed_by_key = {str(field["key"]): field for field in proposed}
        items: list[dict[str, Any]] = []
        skipped_unchanged = 0
        for _, component_id, revision_id, patch in parsed_rows:
            current = current_rows.get(component_id)
            if not current:
                # Preserve missing/inactive rows so the staged review can explain them.
                items.append({"component_id": component_id, "expected_revision_id": revision_id, "patch": patch})
                continue
            extras = _json_loads(current.get("extra_fields"), {})
            changed_patch: dict[str, str] = {}
            for field_key, value in patch.items():
                field = fields.get(field_key) or proposed_by_key.get(field_key)
                if not field:
                    changed_patch[field_key] = value
                    continue
                storage_kind = str(field.get("storage_kind") or "extra")
                storage_key = str(field.get("storage_key") or field_key)
                before = str(current.get(storage_key) or "") if storage_kind == "column" else str(extras.get(storage_key, ""))
                if not CatalogMetadataCsv.metadata_csv_values_equal(field, before, value):
                    changed_patch[field_key] = value
            if changed_patch:
                items.append({
                    "component_id": component_id,
                    "expected_revision_id": revision_id,
                    "patch": changed_patch,
                })
            else:
                skipped_unchanged += 1
        used_field_keys = {field_key for item in items for field_key in item["patch"]}
        used_proposals = [field for field in proposed if str(field["key"]) in used_field_keys]
        return FilteredMetadataCsvChanges(
            items=items,
            skipped_unchanged_rows=skipped_unchanged,
            used_proposals=used_proposals,
        )

    @staticmethod
    def normalize_csv_row(row: dict[str, str], row_index: int) -> dict[str, str]:
        normalized = {
            _slugify(key, key).replace("-", "_"): (value or "").strip()
            for key, value in row.items()
        }
        for required in CSV_REQUIRED_COLUMNS:
            if not normalized.get(required, "").strip():
                raise ValueError(f"Row {row_index}: missing required column '{required}'")
        return normalized

    @staticmethod
    def prepare_import_row(row: dict[str, str]) -> PreparedMetadataCsvImportRow:
        asset_links: list[tuple[str, str, str, str]] = []
        if row.get("symbol_file_path"):
            asset_links.append(("symbol", row["symbol_file_path"], row.get("symbol_target_library", ""), row.get("symbol_target_name", "")))
        if row.get("footprint_file_path"):
            asset_links.append(("footprint", row["footprint_file_path"], row.get("footprint_target_library", ""), row.get("footprint_target_name", "")))
        if row.get("model_3d_file_path"):
            asset_links.append(("3dmodel", row["model_3d_file_path"], "", ""))
        if row.get("spice_file_path"):
            asset_links.append(("spice", row["spice_file_path"], "", ""))
        payload = {
            "value": row["value"],
            "description": row["description"],
            "datasheet_url": row["datasheet"],
            "manufacturer": row["manufacturer"],
            "mpn": row["manufacturer_part_number"],
            "category": row.get("category", ""),
            "package_name": row.get("package_name", ""),
            "vendor": row.get("vendor", ""),
            "vendor_part_number": row.get("vendor_part_number", ""),
            "mass_g": row.get("mass_g", ""),
            "rqjc_c_w": row.get("rqjc_c_w", ""),
            "rqjc_top_c_w": row.get("rqjc_top_c_w", ""),
            "temp_max_c": row.get("temp_max_c", ""),
            "temp_min_c": row.get("temp_min_c", ""),
            "power_dissipation_w": row.get("power_dissipation_w", ""),
            "rate": row.get("rate", ""),
            "sap_code": row.get("sap_code", ""),
        }
        return PreparedMetadataCsvImportRow(
            row=row,
            asset_links=tuple(asset_links),
            payload=payload,
        )

    @staticmethod
    def parse_import(file_content: str) -> ParsedMetadataCsvImport:
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")
        rows: list[PreparedMetadataCsvImportRow] = []
        errors: list[str] = []
        for index, row in enumerate(reader, start=2):
            try:
                normalized = CatalogMetadataCsv.normalize_csv_row(
                    {str(key): str(value or "") for key, value in row.items()}, index
                )
                rows.append(CatalogMetadataCsv.prepare_import_row(normalized))
            except ValueError as exc:
                errors.append(str(exc))
        if errors:
            raise ValueError("\n".join(errors))
        return ParsedMetadataCsvImport(rows=rows)


__all__ = [
    "CSV_ASSET_COLUMNS",
    "CSV_REQUIRED_COLUMNS",
    "CSV_SPREADSHEET_TEXT_GUARD",
    "CatalogMetadataCsv",
    "FilteredMetadataCsvChanges",
    "ParsedMetadataCsvImport",
    "ParsedMetadataCsvPreview",
    "PreparedMetadataCsvExport",
    "PreparedMetadataCsvImportRow",
]
