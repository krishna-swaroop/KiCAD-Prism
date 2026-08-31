"""Connection-level metadata field registry operations."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from app.services.catalog.metadata_schema import (
    BUILTIN_METADATA_FIELDS,
    CatalogMetadataSchema,
    METADATA_FIELD_TYPES,
)
from app.services.catalog.metadata_normalization import dedupe
from app.services.catalog.normalization import json_loads as _json_loads


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_metadata_value(field: dict[str, Any], value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return "Value is required" if field.get("required") else ""
    field_type = str(field.get("type") or "text")
    if field_type == "number":
        try:
            float(value)
        except ValueError:
            return "Enter a valid number"
    elif field_type == "url":
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return "Enter a valid HTTP(S) URL"
    elif field_type == "boolean" and value.casefold() not in {"true", "false", "1", "0", "yes", "no"}:
        return "Enter true or false"
    elif field_type == "enum" and value not in field.get("enum_values", []):
        return "Choose a configured enum value"
    return ""


@dataclass(frozen=True)
class PreparedMetadataField:
    payload: dict[str, Any]
    field_key: str
    field_type: str
    enum_values: list[str]
    now: str
    field_id: str


class CatalogMetadataFields:
    """List and mutate metadata field definitions on a supplied connection."""

    def __init__(self, metadata_schema: CatalogMetadataSchema) -> None:
        self._metadata_schema = metadata_schema

    def list_fields(self, conn: Any, include_archived: bool = False) -> list[dict[str, Any]]:
        rows = conn.execute(
            "SELECT * FROM catalog_field_definitions "
            + ("" if include_archived else "WHERE archived = 0 ")
            + "ORDER BY display_order, field_key"
        ).fetchall()
        return [self._metadata_schema.field_payload(dict(row)) for row in rows]

    @staticmethod
    def prepare_create_field(payload: dict[str, Any]) -> PreparedMetadataField:
        field_key = re.sub(r"[^a-z0-9_]+", "_", str(payload.get("key") or payload.get("label") or "").strip().casefold()).strip("_")
        if not field_key or field_key in {str(field["key"]) for field in BUILTIN_METADATA_FIELDS}:
            raise ValueError("Custom field key is empty or reserved")
        field_type = str(payload.get("type") or "text")
        if field_type not in METADATA_FIELD_TYPES:
            raise ValueError("Unsupported metadata field type")
        enum_values = dedupe([str(value).strip() for value in payload.get("enum_values") or [] if str(value).strip()])
        if field_type == "enum" and not enum_values:
            raise ValueError("Enum fields require at least one option")
        now = _utc_now_iso()
        field_id = str(uuid.uuid4())
        return PreparedMetadataField(payload, field_key, field_type, enum_values, now, field_id)

    def create_field(self, conn: Any, payload: PreparedMetadataField, actor: str) -> dict[str, Any]:
        field_key = payload.field_key
        field_type = payload.field_type
        enum_values = payload.enum_values
        now = payload.now
        field_id = payload.field_id
        source = payload.payload
        exists = conn.execute("SELECT 1 FROM catalog_field_definitions WHERE field_key = %s", (field_key,)).fetchone()
        if exists:
            raise ValueError(f"Metadata field '{field_key}' already exists")
        order_row = conn.execute("SELECT COALESCE(MAX(display_order), -1) AS value FROM catalog_field_definitions").fetchone()
        conn.execute(
            """
            INSERT INTO catalog_field_definitions (
                id, field_key, label, description, field_group, field_type, unit,
                enum_values_json, storage_kind, storage_key, built_in, required,
                display_order, archived, created_by, updated_by, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, 'custom', %s, %s, %s, 'extra', %s, 0, %s, %s, 0, %s, %s, %s, %s)
            """,
            (
                field_id, field_key, str(source.get("label") or field_key).strip(),
                str(source.get("description") or "").strip(), field_type,
                str(source.get("unit") or "").strip(), json.dumps(enum_values), field_key,
                int(bool(source.get("required"))), int(order_row["value"] or 0) + 1,
                actor, actor, now, now,
            ),
        )
        row = dict(conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone())
        after = self._metadata_schema.field_payload(row)
        self._metadata_schema.append_field_event(conn, field_id, "created", actor, None, after)
        return after

    def update_field(self, conn: Any, field_id: str, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        raw = conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()
        if not raw:
            raise ValueError("Metadata field not found")
        before = self._metadata_schema.field_payload(dict(raw))
        field_type = str(payload.get("type", before["type"]))
        if field_type not in METADATA_FIELD_TYPES:
            raise ValueError("Unsupported metadata field type")
        if before["built_in"] and field_type != before["type"]:
            raise ValueError("Built-in field types cannot be changed")
        enum_values = dedupe([str(value).strip() for value in payload.get("enum_values", before["enum_values"]) if str(value).strip()])
        if field_type == "enum" and not enum_values:
            raise ValueError("Enum fields require at least one option")
        next_required = bool(payload.get("required", before["required"]))
        if before["built_in"] and next_required != before["required"]:
            raise ValueError("Built-in field requirements cannot be changed")
        if not before["built_in"] and (
            field_type != before["type"] or enum_values != before["enum_values"] or next_required != before["required"]
        ):
            rows = conn.execute(
                "SELECT extra_fields FROM component_revisions cr JOIN components c ON c.current_revision_id = cr.id WHERE c.is_active = 1"
            ).fetchall()
            invalid = 0
            candidate = {**before, "type": field_type, "enum_values": enum_values, "required": next_required}
            for row in rows:
                value = str(_json_loads(row["extra_fields"], {}).get(before["key"], ""))
                if validate_metadata_value(candidate, value):
                    invalid += 1
            if invalid:
                raise ValueError(f"Field schema change would invalidate {invalid} current component value(s)")
        now = _utc_now_iso()
        display_order = before["display_order"] if payload.get("display_order") is None else int(payload["display_order"])
        conn.execute(
            """
            UPDATE catalog_field_definitions SET label = %s, description = %s, field_type = %s, unit = %s,
                enum_values_json = %s, required = %s, display_order = %s, updated_by = %s, updated_at = %s
            WHERE id = %s
            """,
            (
                str(payload.get("label", before["label"])).strip() or before["label"],
                str(payload.get("description", before["description"])).strip(), field_type,
                str(payload.get("unit", before["unit"])).strip(), json.dumps(enum_values),
                int(next_required),
                display_order, actor, now, field_id,
            ),
        )
        after = self._metadata_schema.field_payload(dict(conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()))
        self._metadata_schema.append_field_event(conn, field_id, "updated", actor, before, after)
        return after

    def set_field_archived(self, conn: Any, field_id: str, archived: bool, actor: str) -> dict[str, Any]:
        raw = conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()
        if not raw:
            raise ValueError("Metadata field not found")
        before = self._metadata_schema.field_payload(dict(raw))
        if before["built_in"]:
            raise ValueError("Built-in fields cannot be archived")
        conn.execute(
            "UPDATE catalog_field_definitions SET archived = %s, updated_by = %s, updated_at = %s WHERE id = %s",
            (int(archived), actor, _utc_now_iso(), field_id),
        )
        after = self._metadata_schema.field_payload(dict(conn.execute("SELECT * FROM catalog_field_definitions WHERE id = %s", (field_id,)).fetchone()))
        self._metadata_schema.append_field_event(conn, field_id, "archived" if archived else "restored", actor, before, after)
        return after

__all__ = ["CatalogMetadataFields", "PreparedMetadataField", "validate_metadata_value"]
