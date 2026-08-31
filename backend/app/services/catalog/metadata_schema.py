"""Catalog metadata schema and field-definition persistence primitives."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

from app.services.catalog.normalization import json_loads


SYMBOL_METADATA_LABEL_TO_KEY = {
    "Value": "value",
    "Description": "description",
    "Datasheet": "datasheet_url",
    "Manufacturer": "manufacturer",
    "Manufacturer Part Number": "mpn",
    "Vendor": "vendor",
    "Vendor Part Number": "vendor_part_number",
    "Mass (g)": "mass_g",
    "RQjC (C/W)": "rqjc_c_w",
    "RQjC_top (C/W)": "rqjc_top_c_w",
    "Temp_max (C)": "temp_max_c",
    "Temp_min (C)": "temp_min_c",
    "Power Dissipation (W)": "power_dissipation_w",
    "Rate": "rate",
    "SAP Code": "sap_code",
}

METADATA_SCHEMA_VERSION = "prism.component_metadata_a1"
METADATA_FIELD_TYPES = {"text", "number", "url", "boolean", "enum"}
BUILTIN_METADATA_FIELDS: tuple[dict[str, Any], ...] = (
    {"key": "value", "label": "Value", "group": "core", "type": "text", "required": True},
    {"key": "category", "label": "Category", "group": "core", "type": "text"},
    {"key": "description", "label": "Description", "group": "core", "type": "text", "required": True},
    {"key": "datasheet_url", "label": "Datasheet", "group": "core", "type": "url", "required": True},
    {"key": "manufacturer", "label": "Manufacturer", "group": "core", "type": "text", "required": True},
    {"key": "mpn", "label": "Manufacturer Part Number", "group": "core", "type": "text", "required": True},
    {"key": "vendor", "label": "Vendor", "group": "core", "type": "text"},
    {"key": "vendor_part_number", "label": "Vendor Part Number", "group": "core", "type": "text"},
    {"key": "package_name", "label": "Package / Footprint", "group": "core", "type": "text"},
    {"key": "mass_g", "label": "Mass", "group": "engineering", "type": "number", "unit": "g"},
    {"key": "rqjc_c_w", "label": "RQjC", "group": "engineering", "type": "number", "unit": "C/W"},
    {"key": "rqjc_top_c_w", "label": "RQjC top", "group": "engineering", "type": "number", "unit": "C/W"},
    {"key": "temp_max_c", "label": "Maximum temperature", "group": "engineering", "type": "number", "unit": "C"},
    {"key": "temp_min_c", "label": "Minimum temperature", "group": "engineering", "type": "number", "unit": "C"},
    {"key": "power_dissipation_w", "label": "Power dissipation", "group": "engineering", "type": "number", "unit": "W"},
    {"key": "rate", "label": "Rate", "group": "engineering", "type": "number"},
    {"key": "sap_code", "label": "SAP Code", "group": "core", "type": "text"},
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CatalogMetadataSchema:
    """Persist metadata definitions using a caller-owned database connection."""

    def field_payload(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "key": str(row["field_key"]),
            "label": str(row["label"]),
            "description": str(row.get("description") or ""),
            "group": str(row.get("field_group") or "custom"),
            "type": str(row.get("field_type") or "text"),
            "unit": str(row.get("unit") or ""),
            "enum_values": json_loads(row.get("enum_values_json"), []),
            "storage_kind": str(row.get("storage_kind") or "extra"),
            "storage_key": str(row.get("storage_key") or row["field_key"]),
            "built_in": bool(row.get("built_in")),
            "required": bool(row.get("required")),
            "display_order": int(row.get("display_order") or 0),
            "archived": bool(row.get("archived")),
            "created_by": str(row.get("created_by") or ""),
            "updated_by": str(row.get("updated_by") or ""),
            "created_at": str(row.get("created_at") or ""),
            "updated_at": str(row.get("updated_at") or ""),
        }

    def append_field_event(
        self,
        conn: Any,
        field_id: str,
        event_type: str,
        actor: str,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
    ) -> None:
        conn.execute(
            "INSERT INTO catalog_field_definition_events "
            "(id, field_id, event_type, actor, before_json, after_json, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                str(uuid.uuid4()), field_id, event_type, actor,
                json.dumps(before or {}, sort_keys=True, separators=(",", ":")),
                json.dumps(after or {}, sort_keys=True, separators=(",", ":")),
                _utc_now_iso(),
            ),
        )

    def ensure_schema(self, conn: Any) -> None:
        """Create the metadata-editing registry and durable batch tables."""
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS catalog_field_definitions (
                id TEXT PRIMARY KEY,
                field_key TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                field_group TEXT NOT NULL DEFAULT 'custom',
                field_type TEXT NOT NULL DEFAULT 'text',
                unit TEXT NOT NULL DEFAULT '',
                enum_values_json TEXT NOT NULL DEFAULT '[]',
                storage_kind TEXT NOT NULL DEFAULT 'extra',
                storage_key TEXT NOT NULL,
                built_in INTEGER NOT NULL DEFAULT 0,
                required INTEGER NOT NULL DEFAULT 0,
                display_order INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                created_by TEXT NOT NULL DEFAULT '',
                updated_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_field_definition_events (
                id TEXT PRIMARY KEY,
                field_id TEXT NOT NULL REFERENCES catalog_field_definitions(id),
                event_type TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT '',
                before_json TEXT NOT NULL DEFAULT '{}',
                after_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_grid_preferences (
                user_email TEXT PRIMARY KEY,
                layout_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_metadata_batches (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                schema_version TEXT NOT NULL,
                change_summary TEXT NOT NULL DEFAULT '',
                unknown_fields_json TEXT NOT NULL DEFAULT '[]',
                created_by TEXT NOT NULL DEFAULT '',
                total_items INTEGER NOT NULL DEFAULT 0,
                valid_items INTEGER NOT NULL DEFAULT 0,
                applied_items INTEGER NOT NULL DEFAULT 0,
                failed_items INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS catalog_metadata_batch_items (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL REFERENCES catalog_metadata_batches(id) ON DELETE CASCADE,
                component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
                expected_revision_id TEXT NOT NULL,
                patch_json TEXT NOT NULL DEFAULT '{}',
                diff_json TEXT NOT NULL DEFAULT '[]',
                validation_status TEXT NOT NULL DEFAULT 'valid',
                error_message TEXT NOT NULL DEFAULT '',
                applied_revision_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(batch_id, component_id)
            );

            CREATE TABLE IF NOT EXISTS revision_validation_evidence_links (
                revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                source_run_id TEXT NOT NULL REFERENCES asset_validation_runs(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                PRIMARY KEY(revision_id, asset_id)
            );

            CREATE INDEX IF NOT EXISTS idx_catalog_fields_order ON catalog_field_definitions(archived, display_order, field_key);
            CREATE INDEX IF NOT EXISTS idx_metadata_batches_actor ON catalog_metadata_batches(created_by, created_at);
            CREATE INDEX IF NOT EXISTS idx_metadata_batch_items_batch ON catalog_metadata_batch_items(batch_id, validation_status);
            """
        )
        now = _utc_now_iso()
        for index, field in enumerate(BUILTIN_METADATA_FIELDS):
            field_id = f"builtin:{field['key']}"
            conn.execute(
                """
                INSERT INTO catalog_field_definitions (
                    id, field_key, label, description, field_group, field_type, unit,
                    enum_values_json, storage_kind, storage_key, built_in, required,
                    display_order, archived, created_by, updated_by, created_at, updated_at
                ) VALUES (%s, %s, %s, '', %s, %s, %s, '[]', 'column', %s, 1, %s, %s, 0, 'system', 'system', %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    field_id,
                    field["key"],
                    field["label"],
                    field["group"],
                    field["type"],
                    field.get("unit", ""),
                    field["key"],
                    int(bool(field.get("required"))),
                    index,
                    now,
                    now,
                ),
            )
        legacy_keys: set[str] = set()
        for row in conn.execute(
            "SELECT cr.extra_fields FROM components c "
            "JOIN component_revisions cr ON cr.id = c.current_revision_id WHERE c.is_active = 1"
        ).fetchall():
            legacy_keys.update(str(key) for key in json_loads(row["extra_fields"], {}) if str(key).strip())
        self.ensure_extra_field_definitions(conn, legacy_keys, actor="system:migration")

    def ensure_extra_field_definitions(
        self,
        conn: Any,
        storage_keys: Iterable[str],
        *,
        actor: str,
    ) -> None:
        reserved = {
            "reference", "footprint", "lib_id", "ki_keywords", "ki_description",
            *(str(field["key"]).casefold() for field in BUILTIN_METADATA_FIELDS),
            *(str(label).casefold() for label in SYMBOL_METADATA_LABEL_TO_KEY),
        }
        existing_rows = [dict(row) for row in conn.execute("SELECT * FROM catalog_field_definitions").fetchall()]
        existing_storage = {
            str(row["storage_key"]): row for row in existing_rows if str(row["storage_kind"]) == "extra"
        }
        used_keys = {str(row["field_key"]) for row in existing_rows}
        order_row = conn.execute("SELECT COALESCE(MAX(display_order), -1) AS value FROM catalog_field_definitions").fetchone()
        next_order = int(order_row["value"] if order_row and order_row["value"] is not None else -1) + 1
        now = _utc_now_iso()
        for raw_key in sorted({str(key).strip() for key in storage_keys if str(key).strip()}, key=str.casefold):
            if raw_key in existing_storage or raw_key.casefold() in reserved:
                continue
            base_key = re.sub(r"[^a-z0-9_]+", "_", raw_key.casefold()).strip("_") or "field"
            field_key = base_key
            if field_key in used_keys:
                field_key = f"{base_key}_{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:8]}"
            while field_key in used_keys:
                field_key = f"{field_key}_2"
            field_id = f"discovered:{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:24]}"
            conn.execute(
                """
                INSERT INTO catalog_field_definitions (
                    id, field_key, label, description, field_group, field_type, unit,
                    enum_values_json, storage_kind, storage_key, built_in, required,
                    display_order, archived, created_by, updated_by, created_at, updated_at
                ) VALUES (%s, %s, %s, 'Discovered from existing KiCad component metadata', 'custom',
                          'text', '', '[]', 'extra', %s, 0, 0, %s, 0, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (field_id, field_key, raw_key, raw_key, next_order, actor, actor, now, now),
            )
            row = conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()
            if row:
                payload = self.field_payload(dict(row))
                self.append_field_event(conn, field_id, "created", actor, None, payload)
                existing_storage[raw_key] = dict(row)
                used_keys.add(field_key)
                next_order += 1


__all__ = [
    "BUILTIN_METADATA_FIELDS",
    "CatalogMetadataSchema",
    "METADATA_FIELD_TYPES",
    "METADATA_SCHEMA_VERSION",
    "SYMBOL_METADATA_LABEL_TO_KEY",
]
