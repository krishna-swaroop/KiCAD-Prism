"""Symbol/footprint representation pairs on component revisions."""

from __future__ import annotations

from typing import Any
import uuid

from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.normalization import canonical_json, utc_now_iso
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


class CatalogRepresentations:
    """Create, update, and delete representations; each writes a new revision."""

    def __init__(
        self,
        revision_kernel: CatalogRevisionKernel,
        finalizer: CatalogRevisionFinalizer,
    ) -> None:
        self._revision_kernel = revision_kernel
        self._finalizer = finalizer

    @staticmethod
    def representation_asset_id(
        conn: Any, revision_id: str, asset_id: str, expected_type: str
    ) -> str | None:
        value = str(asset_id or "").strip()
        if not value:
            return None
        row = conn.execute(
            """
            SELECT asset.id
            FROM revision_assets link
            JOIN assets asset ON asset.id = link.asset_id
            WHERE link.revision_id = %s AND asset.id = %s
              AND link.asset_type = %s AND asset.asset_type = %s
            """,
            (revision_id, value, expected_type, expected_type),
        ).fetchone()
        if not row:
            raise ValueError(f"{expected_type} asset is not attached to this revision")
        return value

    def current_representation_row(
        self, conn: Any, component_id: str, representation_id: str
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        _, revision = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not revision:
            raise ValueError("Component not found")
        row = conn.execute(
            "SELECT * FROM revision_representations WHERE id = %s AND revision_id = %s",
            (representation_id, revision["id"]),
        ).fetchone()
        if not row:
            raise ValueError("Representation was not found on the current revision")
        return revision, dict(row)

    def create_representation(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        *,
        label: str,
        symbol_asset_id: str = "",
        footprint_asset_id: str = "",
        display_order: int = 0,
        make_default: bool = False,
        source_internal_part_number: str = "",
        provenance: dict[str, Any] | None = None,
        expected_revision_id: str,
        actor: str = "",
        change_summary: str = "Add component representation",
    ) -> str:
        """Add a representation on a fresh revision; return the new revision id."""
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="representation",
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
        revision_id = str(revision["id"])
        symbol_id = self.representation_asset_id(conn, revision_id, symbol_asset_id, "symbol")
        footprint_id = self.representation_asset_id(conn, revision_id, footprint_asset_id, "footprint")
        existing_count = int(
            conn.execute(
                "SELECT COUNT(*) AS total FROM revision_representations WHERE revision_id = %s",
                (revision_id,),
            ).fetchone()["total"]
        )
        duplicate = conn.execute(
            """
            SELECT 1 FROM revision_representations
            WHERE revision_id = %s
              AND symbol_asset_id IS NOT DISTINCT FROM %s
              AND footprint_asset_id IS NOT DISTINCT FROM %s
            """,
            (revision_id, symbol_id, footprint_id),
        ).fetchone()
        if duplicate:
            raise ValueError("This symbol-footprint pair already has a representation")
        is_default = bool(make_default or existing_count == 0)
        if is_default:
            conn.execute(
                "UPDATE revision_representations SET is_default = 0, updated_at = %s WHERE revision_id = %s",
                (utc_now_iso(), revision_id),
            )
        now = utc_now_iso()
        conn.execute(
            """
            INSERT INTO revision_representations (
                id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                display_order, source_internal_part_number, provenance_json, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                revision_id,
                label.strip() or "Representation",
                symbol_id,
                footprint_id,
                1 if is_default else 0,
                int(display_order),
                source_internal_part_number.strip(),
                canonical_json(provenance or {}),
                now,
                now,
            ),
        )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="revision.created",
            actor=actor,
            details={"change_kind": "representation", "change_summary": change_summary},
        )
        return revision_id

    def update_representation(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        representation_id: str,
        *,
        updates: dict[str, Any],
        expected_revision_id: str,
        actor: str = "",
        change_summary: str = "Update component representation",
    ) -> str:
        current, original = self.current_representation_row(conn, component_id, representation_id)
        if str(current["id"]) != expected_revision_id:
            raise CatalogConflict()
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="representation",
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
        revision_id = str(revision["id"])
        cloned = conn.execute(
            """
            SELECT * FROM revision_representations
            WHERE revision_id = %s
              AND symbol_asset_id IS NOT DISTINCT FROM %s
              AND footprint_asset_id IS NOT DISTINCT FROM %s
            ORDER BY display_order, id LIMIT 1
            """,
            (revision_id, original["symbol_asset_id"], original["footprint_asset_id"]),
        ).fetchone()
        if not cloned:
            raise ValueError("Cloned representation could not be resolved")
        symbol_id = self.representation_asset_id(
            conn, revision_id, str(updates.get("symbol_asset_id", cloned["symbol_asset_id"]) or ""), "symbol"
        )
        footprint_id = self.representation_asset_id(
            conn,
            revision_id,
            str(updates.get("footprint_asset_id", cloned["footprint_asset_id"]) or ""),
            "footprint",
        )
        make_default = bool(updates.get("is_default", cloned["is_default"]))
        if bool(cloned["is_default"]) and "is_default" in updates and not make_default:
            raise ValueError(
                "The default representation cannot be unset; make another representation default"
            )
        now = utc_now_iso()
        if make_default:
            conn.execute(
                "UPDATE revision_representations SET is_default = 0, updated_at = %s WHERE revision_id = %s",
                (now, revision_id),
            )
        conn.execute(
            """
            UPDATE revision_representations
            SET label = %s, symbol_asset_id = %s, footprint_asset_id = %s,
                is_default = %s, display_order = %s, updated_at = %s
            WHERE id = %s
            """,
            (
                str(updates.get("label", cloned["label"]) or "Representation").strip(),
                symbol_id,
                footprint_id,
                1 if make_default else 0,
                int(updates.get("display_order", cloned["display_order"])),
                now,
                cloned["id"],
            ),
        )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="revision.created",
            actor=actor,
            details={"change_kind": "representation", "change_summary": change_summary},
        )
        return revision_id

    def delete_representation(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        representation_id: str,
        *,
        expected_revision_id: str,
        actor: str = "",
    ) -> str:
        change_summary = "Delete component representation"
        current, original = self.current_representation_row(conn, component_id, representation_id)
        if str(current["id"]) != expected_revision_id:
            raise CatalogConflict()
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="representation",
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
        revision_id = str(revision["id"])
        cloned = conn.execute(
            """
            SELECT id, is_default FROM revision_representations
            WHERE revision_id = %s
              AND symbol_asset_id IS NOT DISTINCT FROM %s
              AND footprint_asset_id IS NOT DISTINCT FROM %s
            ORDER BY display_order, id LIMIT 1
            """,
            (revision_id, original["symbol_asset_id"], original["footprint_asset_id"]),
        ).fetchone()
        if cloned:
            was_default = bool(cloned["is_default"])
            conn.execute("DELETE FROM revision_representations WHERE id = %s", (cloned["id"],))
            if was_default:
                replacement = conn.execute(
                    "SELECT id FROM revision_representations WHERE revision_id = %s ORDER BY display_order, id LIMIT 1",
                    (revision_id,),
                ).fetchone()
                if replacement:
                    conn.execute(
                        "UPDATE revision_representations SET is_default = 1, updated_at = %s WHERE id = %s",
                        (utc_now_iso(), replacement["id"]),
                    )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="revision.created",
            actor=actor,
            details={"change_kind": "representation", "change_summary": change_summary},
        )
        return revision_id


__all__ = ["CatalogRepresentations"]
