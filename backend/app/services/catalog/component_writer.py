"""Create components and write metadata revisions.

Every metadata write goes through :meth:`CatalogComponentWriter.upsert_metadata_row`,
which either inserts a new component with its first revision or clones the
current revision and rewrites the metadata columns. Identity uniqueness is
enforced here, under the advisory locks the caller has already taken in the
order identity → component. Nothing here commits.
"""

from __future__ import annotations

import json
from typing import Any
import uuid

from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.metadata_normalization import (
    IDENTITY_KIND_MPN,
    IDENTITY_KIND_PROVISIONAL_IPN,
    metadata_keywords,
    metadata_search_document,
    normalize_identity_value,
    normalize_metadata,
)
from app.services.catalog.metadata_schema import CatalogMetadataSchema
from app.services.catalog.normalization import json_loads, slugify, utc_now_iso
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import REVISION_MANIFEST_A3, CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


SOURCE_MANUAL = "manual"
SOURCE_EXTERNAL = "external"

# Request keys a metadata patch may carry, mapped to the revision column they set.
METADATA_PATCH_COLUMNS: dict[str, str] = {
    "datasheet_url": "datasheet_url",
    "mpn": "mpn",
    "value": "value",
    "description": "description",
    "manufacturer": "manufacturer",
    "category": "category",
    "package_name": "package_name",
    "vendor": "vendor",
    "vendor_part_number": "vendor_part_number",
    "mass_g": "mass_g",
    "rqjc_c_w": "rqjc_c_w",
    "rqjc_top_c_w": "rqjc_top_c_w",
    "temp_max_c": "temp_max_c",
    "temp_min_c": "temp_min_c",
    "power_dissipation_w": "power_dissipation_w",
    "rate": "rate",
    "sap_code": "sap_code",
}

METADATA_INSERT_COLUMNS: tuple[str, ...] = (
    "name",
    "value",
    "description",
    "datasheet_url",
    "manufacturer",
    "mpn",
    "normalized_manufacturer",
    "normalized_mpn",
    "mpn_source",
    "category",
    "package_name",
    "vendor",
    "vendor_part_number",
    "mass_g",
    "rqjc_c_w",
    "rqjc_top_c_w",
    "temp_max_c",
    "temp_min_c",
    "power_dissipation_w",
    "rate",
    "sap_code",
    "summary",
)
_METADATA_COLUMNS = METADATA_INSERT_COLUMNS


def _metadata_column_values(metadata: dict[str, Any]) -> tuple[Any, ...]:
    """Column values in ``_METADATA_COLUMNS`` order followed by keywords, extras, search text."""
    return (
        *(metadata[column] for column in _METADATA_COLUMNS),
        json.dumps(metadata_keywords(metadata), separators=(",", ":")),
        json.dumps(metadata["extra_fields"], sort_keys=True, separators=(",", ":")),
        metadata_search_document(metadata),
    )


def metadata_matches_revision(revision: dict[str, Any], metadata: dict[str, Any]) -> bool:
    """True when ``metadata`` would rewrite the revision with identical values."""
    return all(
        (
            json_loads(revision.get(key), {}) == metadata[key]
            if key == "extra_fields"
            else str(revision.get(key) or "") == str(metadata[key])
        )
        for key in (*_METADATA_COLUMNS, "extra_fields")
    )


def merge_metadata_patch(
    component: dict[str, Any],
    revision: dict[str, Any],
    updates: dict[str, Any],
) -> dict[str, Any]:
    """Apply a client patch to the current revision and normalize the result.

    A provisional component that gains a manufacturer part number is promoted to
    an orderable identity in the same write.
    """
    target_mpn = str(updates.get("mpn", revision.get("mpn") or ""))
    merged = {**revision}
    merged["identity_kind"] = str(component.get("identity_kind") or IDENTITY_KIND_MPN)
    merged["identity_source"] = str(component.get("identity_source") or "")
    if merged["identity_kind"] == IDENTITY_KIND_PROVISIONAL_IPN:
        merged["source_internal_part_number"] = str(component.get("normalized_part_number") or "")
        if target_mpn.strip():
            merged["identity_kind"] = IDENTITY_KIND_MPN
            merged["identity_source"] = ""
    merged["extra_fields"] = json_loads(revision.get("extra_fields"), {})
    for key, column in METADATA_PATCH_COLUMNS.items():
        if key in updates:
            merged[column] = str(updates[key] or "")
    if "extra_fields" in updates:
        merged["extra_fields"] = dict(updates["extra_fields"] or {})
    return normalize_metadata(merged)


class CatalogComponentWriter:
    """Insert components and rewrite revision metadata under caller-held locks."""

    def __init__(
        self,
        catalog_locks: CatalogLockOperations,
        revision_kernel: CatalogRevisionKernel,
        finalizer: CatalogRevisionFinalizer,
        metadata_schema: CatalogMetadataSchema,
    ) -> None:
        self._catalog_locks = catalog_locks
        self._revision_kernel = revision_kernel
        self._finalizer = finalizer
        self._metadata_schema = metadata_schema

    def unique_slug(self, conn: Any, base: str) -> str:
        self._catalog_locks.lock_slug_allocation(conn, base)
        slug = slugify(base or "component")
        candidate = slug
        counter = 2
        while conn.execute("SELECT 1 FROM components WHERE slug = %s", (candidate,)).fetchone():
            candidate = f"{slug}-{counter}"
            counter += 1
        return candidate

    def assert_identity_available(
        self,
        conn: Any,
        *,
        manufacturer: str,
        mpn: str,
        identity_kind: str = IDENTITY_KIND_MPN,
        identity_source: str = "",
        source_internal_part_number: str = "",
        component_id: str = "",
        acquire_identity_lock: bool = True,
    ) -> None:
        """Reject a second component with the same orderable or provisional identity."""
        normalized_manufacturer = normalize_identity_value(manufacturer)
        normalized_part_number = normalize_identity_value(
            mpn if identity_kind == IDENTITY_KIND_MPN else source_internal_part_number
        )
        if acquire_identity_lock:
            self._catalog_locks.lock_component_identity(
                conn,
                normalized_manufacturer if identity_kind == IDENTITY_KIND_MPN else identity_source,
                normalized_part_number,
            )
        existing = conn.execute(
            """
            SELECT id
            FROM components
            WHERE identity_kind = %s
              AND normalized_manufacturer = %s
              AND normalized_part_number = %s
              AND identity_source = %s
              AND id <> %s
            LIMIT 1
            """,
            (
                identity_kind,
                normalized_manufacturer if identity_kind == IDENTITY_KIND_MPN else "",
                normalized_part_number,
                identity_source if identity_kind == IDENTITY_KIND_PROVISIONAL_IPN else "",
                component_id,
            ),
        ).fetchone()
        if existing:
            raise ValueError("A component with this manufacturer-part identity already exists")

    def upsert_metadata_row(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        component_id: str,
        metadata: dict[str, Any],
        now: str,
        existing_component_id: str | None,
        actor: str = "",
        change_summary: str = "Update component metadata",
        expected_revision_id: str = "",
        finalize_revision: bool = True,
        source: str = SOURCE_MANUAL,
        external_source: str = "",
        external_id: str = "",
        change_kind: str = "metadata",
    ) -> tuple[str, str]:
        """Write ``metadata`` as a new revision; returns ``(component_id, revision_id)``.

        With ``existing_component_id`` the current revision is cloned and
        rewritten; otherwise a component and its version-1 revision are inserted.
        Callers that attach assets afterwards pass ``finalize_revision=False`` and
        finalize once the revision is complete.
        """
        self._metadata_schema.ensure_extra_field_definitions(
            conn,
            metadata.get("extra_fields", {}).keys(),
            actor=actor or "system:catalog",
        )
        self.assert_identity_available(
            conn,
            manufacturer=metadata["manufacturer"],
            mpn=metadata["mpn"],
            identity_kind=metadata["identity_kind"],
            identity_source=metadata["identity_source"],
            source_internal_part_number=metadata["source_internal_part_number"],
            component_id=existing_component_id or "",
        )
        identity_source = (
            metadata["identity_source"] if metadata["identity_kind"] == IDENTITY_KIND_PROVISIONAL_IPN else ""
        )
        normalized_manufacturer = (
            metadata["normalized_manufacturer"] if metadata["identity_kind"] == IDENTITY_KIND_MPN else ""
        )
        if existing_component_id:
            revision = self._revision_kernel.clone_revision(
                conn,
                existing_component_id,
                actor=actor,
                change_kind=change_kind,
                change_summary=change_summary,
                expected_revision_id=expected_revision_id,
            )
            assignments = ", ".join(f"{column} = %s" for column in _METADATA_COLUMNS)
            conn.execute(
                f"""
                UPDATE component_revisions
                SET {assignments}, keywords = %s, extra_fields = %s, search_document = %s, updated_at = %s
                WHERE id = %s
                """,
                (*_metadata_column_values(metadata), now, revision["id"]),
            )
            conn.execute(
                """
                UPDATE components
                SET identity_kind = %s, identity_source = %s,
                    normalized_manufacturer = %s, normalized_part_number = %s,
                    updated_at = %s
                WHERE id = %s
                """,
                (
                    metadata["identity_kind"],
                    identity_source,
                    normalized_manufacturer,
                    metadata["normalized_part_number"],
                    now,
                    existing_component_id,
                ),
            )
            if finalize_revision:
                self._finalizer.finalize_revision(
                    conn,
                    runtime,
                    component_id=existing_component_id,
                    revision_id=str(revision["id"]),
                    event_type="revision.created",
                    actor=actor,
                    details={"change_kind": change_kind, "change_summary": change_summary},
                )
            return existing_component_id, str(revision["id"])

        slug = self.unique_slug(
            conn,
            metadata["mpn"] or metadata["source_internal_part_number"] or metadata["value"],
        )
        revision_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO components (
                id, slug, identity_kind, identity_source, normalized_manufacturer, normalized_part_number,
                source, external_source, external_id, is_active, current_revision_id,
                released_revision_id, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, '', %s, %s)
            """,
            (
                component_id,
                slug,
                metadata["identity_kind"],
                identity_source,
                normalized_manufacturer,
                metadata["normalized_part_number"],
                source,
                external_source,
                external_id,
                revision_id,
                now,
                now,
            ),
        )
        columns = ", ".join(_METADATA_COLUMNS)
        placeholders = ", ".join("%s" for _ in range(len(_METADATA_COLUMNS) + 15))
        conn.execute(
            f"""
            INSERT INTO component_revisions (
                id, component_id, version, parent_revision_id, change_kind, change_summary, created_by,
                manifest_hash, manifest_schema, release_status, {columns},
                keywords, extra_fields, search_document, created_at, updated_at
            )
            VALUES ({placeholders})
            """,
            (
                revision_id,
                component_id,
                1,
                "",
                "create" if source == SOURCE_MANUAL else change_kind,
                change_summary,
                actor,
                "",
                REVISION_MANIFEST_A3,
                "open",
                *_metadata_column_values(metadata),
                now,
                now,
            ),
        )
        if finalize_revision:
            self._finalizer.finalize_revision(
                conn,
                runtime,
                component_id=component_id,
                revision_id=revision_id,
                event_type="component.created",
                actor=actor,
                details={"change_kind": "create", "change_summary": change_summary},
            )
        return component_id, revision_id

    def create_component(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        payload: dict[str, Any],
        *,
        actor: str = "",
        change_summary: str = "Create component",
    ) -> str:
        component_id = str(uuid.uuid4())
        self.upsert_metadata_row(
            conn,
            runtime,
            component_id=component_id,
            metadata=normalize_metadata(payload),
            now=utc_now_iso(),
            existing_component_id=None,
            actor=actor,
            change_summary=change_summary,
        )
        return component_id

    def update_metadata(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        updates: dict[str, Any],
        *,
        actor: str = "",
        change_summary: str = "Update component metadata",
        expected_revision_id: str = "",
    ) -> str | None:
        """Patch the current draft revision.

        Returns ``None`` when the component or its draft is missing, ``""`` when
        the patch changes nothing, otherwise the new revision id.
        """
        if not expected_revision_id.strip():
            raise ValueError("expected_revision_id is required when updating component metadata")
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            return None
        _, revision = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not revision:
            return None
        # Keep advisory-lock ordering consistent with project imports and creates:
        # identity first, component row second. Once the component lock is held,
        # reload the head before merging any client patch.
        target_manufacturer = str(updates.get("manufacturer", revision.get("manufacturer") or ""))
        target_mpn = str(updates.get("mpn", revision.get("mpn") or ""))
        self._catalog_locks.lock_component_identity(conn, target_manufacturer, target_mpn)
        self._catalog_locks.lock_component_for_mutation(conn, component_id)
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            return None
        _, revision = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not revision:
            return None
        if str(revision["id"]) != expected_revision_id:
            raise CatalogConflict()
        metadata = merge_metadata_patch(component, revision, updates)
        if metadata_matches_revision(revision, metadata):
            return ""
        _, revision_id = self.upsert_metadata_row(
            conn,
            runtime,
            component_id=component_id,
            metadata=metadata,
            now=utc_now_iso(),
            existing_component_id=component_id,
            actor=actor,
            change_summary=change_summary,
            expected_revision_id=expected_revision_id,
        )
        return revision_id


__all__ = [
    "METADATA_INSERT_COLUMNS",
    "METADATA_PATCH_COLUMNS",
    "SOURCE_EXTERNAL",
    "SOURCE_MANUAL",
    "CatalogComponentWriter",
    "merge_metadata_patch",
    "metadata_matches_revision",
]
