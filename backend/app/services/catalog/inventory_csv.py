"""Inventory CSV parsing and connection-level operations."""

from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass
from typing import Any, Iterator

from app.services.catalog.inventory_policy import (
    aggregate_inventory_locations,
    csv_export_quantity_fields,
)
from app.services.catalog.metadata_normalization import (
    IDENTITY_KIND_MPN,
    normalize_identity_value,
)
from app.services.catalog.normalization import utc_now_iso


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
    def fetch_export_rows(conn: Any) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT component.id AS component_id, revision.manufacturer, revision.mpn,
                   inventory.source AS inventory_source, inventory.location_key,
                   inventory.quantity, inventory.uom, inventory.inventory_status
            FROM components component
            JOIN component_revisions revision ON revision.id = component.current_revision_id
            LEFT JOIN inventory_levels inventory
              ON inventory.component_id = component.id AND inventory.source = 'csv'
            WHERE component.identity_kind = 'mpn'
            ORDER BY lower(revision.manufacturer), lower(revision.mpn), component.id,
                     inventory.location_key
            """
        ).fetchall()
        return CatalogInventoryCsv.shape_export_rows(rows)

    @staticmethod
    def shape_export_rows(rows: list[Any]) -> list[dict[str, Any]]:
        """Collapse CSV location rows with the shared inventory policy."""

        grouped: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for row in rows:
            component_id = str(row["component_id"])
            if component_id not in grouped:
                grouped[component_id] = {
                    "component_id": component_id,
                    "manufacturer": row["manufacturer"],
                    "mpn": row["mpn"],
                    "locations": [],
                }
                order.append(component_id)
            if not row.get("inventory_source"):
                continue
            grouped[component_id]["locations"].append(
                {
                    "source": str(row["inventory_source"]),
                    "location_key": str(row.get("location_key") or ""),
                    "quantity": row.get("quantity"),
                    "uom": row.get("uom") or "",
                    "inventory_status": row.get("inventory_status") or "",
                }
            )
        export_rows: list[dict[str, Any]] = []
        for component_id in order:
            item = grouped[component_id]
            aggregates = aggregate_inventory_locations(item["locations"])
            quantity, uom, inventory_status = csv_export_quantity_fields(
                aggregates[0] if aggregates else None
            )
            export_rows.append(
                {
                    "component_id": component_id,
                    "manufacturer": item["manufacturer"],
                    "mpn": item["mpn"],
                    "quantity": quantity,
                    "uom": uom,
                    "inventory_status": inventory_status,
                }
            )
        return export_rows

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
        # Blank exports represent an unrepresentable mixed-unit total. Never
        # turn that unknown value into a known zero during re-import.
        raw_quantity = row.get("quantity")
        if raw_quantity is None:
            raw_quantity = row.get("stock_quantity")
        if raw_quantity is None or not str(raw_quantity).strip():
            raise ValueError(f"Row {row_index}: quantity is required; use 0 for zero stock")
        try:
            quantity = float(raw_quantity)
        except (TypeError, ValueError):
            raise ValueError(f"Row {row_index}: quantity must be numeric") from None
        if not math.isfinite(quantity):
            raise ValueError(f"Row {row_index}: quantity must be finite")
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

    @classmethod
    def import_file(cls, conn: Any, file_content: str) -> dict[str, Any]:
        """Upsert every resolvable row; per-row problems are reported, not raised."""
        reader = cls.parse(file_content)
        updated = 0
        not_found = 0
        errors: list[str] = []
        for index, row in enumerate(reader, start=2):
            try:
                identity = cls.prepare_identity(row, index)
            except ValueError as exc:
                errors.append(str(exc))
                continue
            component = cls.find_component(conn, identity)
            if not component:
                not_found += 1
                errors.append(f"Row {index}: component identity was not found")
                continue
            try:
                cls.validate_component(component, identity, index)
                prepared = cls.prepare_upsert(row, index)
            except ValueError as exc:
                errors.append(str(exc))
                continue
            cls.upsert(conn, component["id"], index, prepared, utc_now_iso())
            updated += 1
        return {"updated": updated, "not_found": not_found, "errors": errors}


__all__ = [
    "CatalogInventoryCsv",
    "INVENTORY_CSV_HEADERS",
    "InventoryCsvIdentity",
    "PreparedInventoryCsvRow",
]
