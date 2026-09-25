"""Connection-level metadata batch persistence and read operations."""

from __future__ import annotations

from typing import Any

from app.services.catalog.normalization import json_loads


class CatalogMetadataBatches:
    """Persist and read metadata-batch state on a supplied connection."""

    @staticmethod
    def batch_payload(conn: Any, batch_id: str) -> dict[str, Any] | None:
        batch = conn.execute(
            "SELECT * FROM catalog_metadata_batches WHERE id = %s", (batch_id,)
        ).fetchone()
        if not batch:
            return None
        items = conn.execute(
            "SELECT item.*, cr.name, cr.mpn FROM catalog_metadata_batch_items item "
            "JOIN components c ON c.id = item.component_id "
            "JOIN component_revisions cr ON cr.id = c.current_revision_id "
            "WHERE item.batch_id = %s ORDER BY cr.manufacturer, cr.mpn, item.id",
            (batch_id,),
        ).fetchall()
        return {
            "id": str(batch["id"]), "source": str(batch["source"]), "status": str(batch["status"]),
            "schema_version": str(batch["schema_version"]), "change_summary": str(batch["change_summary"]),
            "unknown_fields": json_loads(batch["unknown_fields_json"], []),
            "created_by": str(batch["created_by"]), "total_items": int(batch["total_items"]),
            "valid_items": int(batch["valid_items"]), "applied_items": int(batch["applied_items"]),
            "failed_items": int(batch["failed_items"]), "created_at": str(batch["created_at"]),
            "updated_at": str(batch["updated_at"]),
            "items": [
                {
                    "id": str(item["id"]), "component_id": str(item["component_id"]),
                    "expected_revision_id": str(item["expected_revision_id"]), "name": str(item["name"]),
                    "mpn": str(item["mpn"]), "patch": json_loads(item["patch_json"], {}),
                    "diff": json_loads(item["diff_json"], []), "validation_status": str(item["validation_status"]),
                    "error_message": str(item["error_message"]), "applied_revision_id": str(item["applied_revision_id"]),
                }
                for item in items
            ],
        }

    @staticmethod
    def insert_batch(
        conn: Any,
        *,
        batch_id: str,
        source: str,
        status: str,
        schema_version: str,
        change_summary: str,
        unknown_fields_json: str,
        created_by: str,
        total_items: int,
        created_at: str,
        updated_at: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO catalog_metadata_batches (
                id, source, status, schema_version, change_summary, unknown_fields_json, created_by,
                total_items, valid_items, applied_items, failed_items, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, 0, 0, %s, %s)
            """,
            (
                batch_id, source, status, schema_version, change_summary,
                unknown_fields_json, created_by, total_items, created_at, updated_at,
            ),
        )

    @staticmethod
    def insert_batch_item(
        conn: Any,
        *,
        item_id: str,
        batch_id: str,
        component_id: str,
        expected_revision_id: str,
        patch_json: str,
        diff_json: str,
        validation_status: str,
        error_message: str,
        created_at: str,
        updated_at: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO catalog_metadata_batch_items (
                id, batch_id, component_id, expected_revision_id, patch_json, diff_json,
                validation_status, error_message, applied_revision_id, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, '', %s, %s)
            """,
            (
                item_id, batch_id, component_id, expected_revision_id,
                patch_json, diff_json, validation_status, error_message, created_at, updated_at,
            ),
        )

    @staticmethod
    def update_valid_items(conn: Any, batch_id: str, valid_items: int) -> None:
        conn.execute(
            "UPDATE catalog_metadata_batches SET valid_items = %s WHERE id = %s",
            (valid_items, batch_id),
        )

    @staticmethod
    def fetch_batch_field_proposals(conn: Any, batch_id: str) -> list[Any] | None:
        batch = conn.execute(
            "SELECT * FROM catalog_metadata_batches WHERE id = %s", (batch_id,)
        ).fetchone()
        return json_loads(batch["unknown_fields_json"], []) if batch else None

    @staticmethod
    def mark_fields_approved(conn: Any, batch_id: str, updated_at: str) -> None:
        conn.execute(
            "UPDATE catalog_metadata_batches SET status = 'ready', unknown_fields_json = '[]', updated_at = %s WHERE id = %s",
            (updated_at, batch_id),
        )

    @staticmethod
    def fetch_item_for_apply(conn: Any, item_id: str) -> Any:
        return conn.execute(
            "SELECT item.*, batch.change_summary, batch.id AS metadata_batch_id FROM catalog_metadata_batch_items item "
            "JOIN catalog_metadata_batches batch ON batch.id = item.batch_id WHERE item.id = %s",
            (item_id,),
        ).fetchone()

    @staticmethod
    def mark_item_applied(
        conn: Any, item_id: str, revision_id: str, updated_at: str
    ) -> None:
        conn.execute(
            "UPDATE catalog_metadata_batch_items SET validation_status = 'applied', applied_revision_id = %s, updated_at = %s WHERE id = %s",
            (revision_id, updated_at, item_id),
        )

    @staticmethod
    def fetch_batch_for_apply(conn: Any, batch_id: str) -> Any:
        return conn.execute(
            "SELECT * FROM catalog_metadata_batches WHERE id = %s", (batch_id,)
        ).fetchone()

    @staticmethod
    def fetch_valid_item_rows(conn: Any, batch_id: str) -> list[Any]:
        return conn.execute(
            "SELECT id FROM catalog_metadata_batch_items WHERE batch_id = %s AND validation_status = 'valid' ORDER BY id",
            (batch_id,),
        ).fetchall()

    @staticmethod
    def mark_item_conflict(
        conn: Any, item_id: str, error_message: str, updated_at: str
    ) -> None:
        conn.execute(
            "UPDATE catalog_metadata_batch_items SET validation_status = 'conflict', error_message = %s, updated_at = %s WHERE id = %s",
            (error_message, updated_at, item_id),
        )

    @staticmethod
    def calculate_batch_totals(conn: Any, batch_id: str) -> Any:
        return conn.execute(
            "SELECT SUM(CASE WHEN validation_status = 'applied' THEN 1 ELSE 0 END) AS applied, "
            "SUM(CASE WHEN validation_status IN ('invalid', 'conflict') THEN 1 ELSE 0 END) AS failed, "
            "SUM(CASE WHEN validation_status = 'valid' THEN 1 ELSE 0 END) AS remaining "
            "FROM catalog_metadata_batch_items WHERE batch_id = %s",
            (batch_id,),
        ).fetchone()

    @staticmethod
    def finalize_batch(
        conn: Any,
        *,
        batch_id: str,
        status: str,
        valid_items: int,
        applied_items: int,
        failed_items: int,
        updated_at: str,
    ) -> None:
        conn.execute(
            "UPDATE catalog_metadata_batches SET status = %s, valid_items = %s, applied_items = %s, failed_items = %s, updated_at = %s WHERE id = %s",
            (status, valid_items, applied_items, failed_items, updated_at, batch_id),
        )


__all__ = ["CatalogMetadataBatches"]
