"""Inventory CSV parsing and connection-level operations."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import Any, Iterator

from app.services.catalog.metadata_normalization import (
    IDENTITY_KIND_MPN,
    normalize_identity_value,
)


INVENTORY_CSV_HEADERS = (
    "component_id",
    "manufacturer",
    "mpn",
    "quantity",
    "uom",
    "inventory_status",
)


@dataclass(frozen=True)
class InventoryCsvIdentity:
    """Normalized fields used to resolve one inventory row."""

    component_id: str
    manufacturer: str
    mpn: str


@dataclass(frozen=True)
class PreparedInventoryCsvRow:
    """Validated inventory values ready for the caller-owned upsert."""

    quantity: float
    uom: str
    inventory_status: str


class CatalogInventoryCsv:
    """Parse and execute inventory CSV operations on supplied connections."""

    @staticmethod
    def parse(file_content: str) -> Iterator[dict[str, Any]]:
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            raise ValueError("CSV file is empty")
        return reader

    @staticmethod
    def fetch_export_rows(conn: Any) -> list[Any]:
        return conn.execute(
            """
            SELECT component.id AS component_id, revision.manufacturer, revision.mpn,
                   COALESCE(SUM(inventory.quantity), 0) AS quantity,
                   COALESCE(MIN(inventory.uom), '') AS uom,
                   COALESCE(MIN(inventory.inventory_status), '') AS inventory_status
            FROM components component
            JOIN component_revisions revision ON revision.id = component.current_revision_id
            LEFT JOIN inventory_levels inventory
              ON inventory.component_id = component.id AND inventory.source = 'csv'
            WHERE component.identity_kind = 'mpn'
            GROUP BY component.id, revision.manufacturer, revision.mpn
            ORDER BY lower(revision.manufacturer), lower(revision.mpn), component.id
            """
        ).fetchall()

    @staticmethod
    def render_export(rows: list[Any]) -> str:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=INVENTORY_CSV_HEADERS)
        writer.writeheader()
        for row in rows:
            writer.writerow(dict(row))
        return output.getvalue()

    @staticmethod
    def prepare_identity(row: dict[str, Any], row_index: int) -> InventoryCsvIdentity:
        component_id = str(row.get("component_id") or "").strip()
        manufacturer = str(row.get("manufacturer") or "").strip()
        mpn = str(row.get("manufacturer_part_number") or row.get("mpn") or "").strip()
        if not component_id and (not manufacturer or not mpn):
            raise ValueError(f"Row {row_index}: component_id or manufacturer+mpn is required")
        return InventoryCsvIdentity(component_id, manufacturer, mpn)

    @staticmethod
    def find_component(conn: Any, identity: InventoryCsvIdentity) -> Any | None:
        if identity.component_id:
            return conn.execute(
                """
                SELECT component.id, component.identity_kind,
                       component.normalized_manufacturer, component.normalized_part_number
                FROM components component WHERE component.id = %s
                """,
                (identity.component_id,),
            ).fetchone()
        return conn.execute(
            """
            SELECT id, identity_kind, normalized_manufacturer, normalized_part_number
            FROM components
            WHERE identity_kind = 'mpn'
              AND normalized_manufacturer = %s AND normalized_part_number = %s
            """,
            (
                normalize_identity_value(identity.manufacturer),
                normalize_identity_value(identity.mpn),
            ),
        ).fetchone()

    @staticmethod
    def validate_component(
        component: Any,
        identity: InventoryCsvIdentity,
        row_index: int,
    ) -> None:
        if str(component["identity_kind"]) != IDENTITY_KIND_MPN:
            raise ValueError(f"Row {row_index}: provisional components cannot receive MPN inventory")
        if identity.manufacturer and normalize_identity_value(identity.manufacturer) != str(
            component["normalized_manufacturer"]
        ):
            raise ValueError(f"Row {row_index}: manufacturer does not match component_id")
        if identity.mpn and normalize_identity_value(identity.mpn) != str(
            component["normalized_part_number"]
        ):
            raise ValueError(f"Row {row_index}: mpn does not match component_id")

    @staticmethod
    def prepare_upsert(row: dict[str, Any], row_index: int) -> PreparedInventoryCsvRow:
        try:
            quantity = float(row.get("quantity") or row.get("stock_quantity") or 0)
        except (TypeError, ValueError):
            raise ValueError(f"Row {row_index}: quantity must be numeric") from None
        return PreparedInventoryCsvRow(
            quantity=quantity,
            uom=str(row.get("uom") or row.get("stock_uom") or ""),
            inventory_status=str(row.get("inventory_status") or ""),
        )

    @staticmethod
    def upsert(
        conn: Any,
        component_id: Any,
        row_index: int,
        prepared: PreparedInventoryCsvRow,
        now: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO inventory_levels (
                source, component_id, location_key, source_record_id, quantity, uom,
                inventory_status, fetch_status, fetched_at, updated_at
            ) VALUES ('csv', %s, '', %s, %s, %s, %s, 'ok', %s, %s)
            ON CONFLICT(source, component_id, location_key) DO UPDATE SET
                source_record_id = EXCLUDED.source_record_id,
                quantity = EXCLUDED.quantity,
                uom = EXCLUDED.uom,
                inventory_status = EXCLUDED.inventory_status,
                fetch_status = EXCLUDED.fetch_status,
                fetched_at = EXCLUDED.fetched_at,
                updated_at = EXCLUDED.updated_at
            """,
            (
                component_id,
                f"csv:{row_index}",
                prepared.quantity,
                prepared.uom,
                prepared.inventory_status,
                now,
                now,
            ),
        )


__all__ = [
    "CatalogInventoryCsv",
    "INVENTORY_CSV_HEADERS",
    "InventoryCsvIdentity",
    "PreparedInventoryCsvRow",
]
