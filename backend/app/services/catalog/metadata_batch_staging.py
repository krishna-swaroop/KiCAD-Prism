"""Prepare metadata-batch items without owning persistence or transactions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.catalog.metadata_fields import validate_metadata_value
from app.services.catalog.normalization import json_loads as _json_loads


@dataclass(frozen=True)
class PreparedMetadataBatchItem:
    """Prepared values and validation messages for one metadata-batch row."""

    component_id: str
    expected_revision_id: str
    normalized_patch: dict[str, str]
    diff: list[dict[str, str]]
    errors: list[str]
    target_identity: tuple[str, str, str] | None


class CatalogMetadataBatchStaging:
    """Prepare metadata-batch rows using only a caller-supplied connection."""

    @staticmethod
    def duplicate_identities(
        conn: Any, items: list[dict[str, Any]]
    ) -> set[tuple[str, str, str]]:
        identity_counts: dict[tuple[str, str, str], int] = {}
        for raw_item in items:
            component_id = str(raw_item.get("component_id") or "")
            component = conn.execute(
                "SELECT cr.manufacturer, cr.mpn, cr.name FROM components c "
                "JOIN component_revisions cr ON cr.id = c.current_revision_id "
                "WHERE c.id = %s AND c.is_active = 1",
                (component_id,),
            ).fetchone()
            if not component:
                continue
            patch = dict(raw_item.get("patch") or {})
            manufacturer = str(patch.get("manufacturer", component["manufacturer"]) or "").strip().casefold()
            mpn = str(patch.get("mpn", component["mpn"]) or "").strip().casefold()
            name = str(patch.get("name", component["name"]) or "").strip().casefold()
            if manufacturer and mpn:
                identity = (manufacturer, mpn, name)
                identity_counts[identity] = identity_counts.get(identity, 0) + 1
        return {identity for identity, count in identity_counts.items() if count > 1}

    @staticmethod
    def prepare_item(
        conn: Any,
        raw_item: dict[str, Any],
        fields: dict[str, dict[str, Any]],
        duplicate_identities: set[tuple[str, str, str]],
    ) -> PreparedMetadataBatchItem:
        component_id = str(raw_item.get("component_id") or "")
        expected_revision_id = str(raw_item.get("expected_revision_id") or "")
        component = conn.execute(
            "SELECT c.is_active, cr.* FROM components c JOIN component_revisions cr ON cr.id = c.current_revision_id WHERE c.id = %s",
            (component_id,),
        ).fetchone()
        errors: list[str] = []
        diff: list[dict[str, str]] = []
        normalized_patch: dict[str, str] = {}
        target_identity: tuple[str, str, str] | None = None
        if not component or not bool(component["is_active"]):
            errors.append("Component was not found or is inactive")
        elif str(component["id"]) != expected_revision_id:
            errors.append("Component revision conflict: refresh or re-export before applying")
        else:
            extras = _json_loads(component["extra_fields"], {})
            for field_key, raw_value in dict(raw_item.get("patch") or {}).items():
                field = fields.get(str(field_key))
                if not field or field.get("archived"):
                    errors.append(f"Unknown or archived field: {field_key}")
                    continue
                value = str(raw_value or "").strip()
                validation_error = validate_metadata_value(field, value)
                if validation_error:
                    errors.append(f"{field['label']}: {validation_error}")
                    continue
                before = str(component[field["storage_key"]] or "") if field["storage_kind"] == "column" else str(extras.get(field["storage_key"], ""))
                if before != value:
                    normalized_patch[str(field_key)] = value
                    diff.append({"field": str(field_key), "label": str(field["label"]), "before": before, "after": value})
            for field_key, field in fields.items():
                if not field.get("required") or field.get("archived"):
                    continue
                if field["storage_kind"] == "column":
                    resulting = normalized_patch.get(field_key, str(component[field["storage_key"]] or ""))
                else:
                    resulting = normalized_patch.get(field_key, str(extras.get(field["storage_key"], "")))
                required_error = validate_metadata_value(field, resulting)
                if required_error:
                    errors.append(f"{field['label']}: {required_error}")
            target_manufacturer = normalized_patch.get("manufacturer", str(component["manufacturer"] or ""))
            target_mpn = normalized_patch.get("mpn", str(component["mpn"] or ""))
            target_name = normalized_patch.get("name", str(component["name"] or ""))
            target_identity = (target_manufacturer, target_mpn, target_name)
            if (
                target_manufacturer.strip().casefold(),
                target_mpn.strip().casefold(),
                target_name.strip().casefold(),
            ) in duplicate_identities:
                errors.append(
                    "Multiple rows in this batch resolve to the same manufacturer, "
                    "manufacturer part number and name"
                )
        return PreparedMetadataBatchItem(
            component_id=component_id,
            expected_revision_id=expected_revision_id,
            normalized_patch=normalized_patch,
            diff=diff,
            errors=errors,
            target_identity=target_identity,
        )


__all__ = ["CatalogMetadataBatchStaging", "PreparedMetadataBatchItem"]
