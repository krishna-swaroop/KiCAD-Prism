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

from app.core.errors import NotFound
from app.services.catalog import models as catalog_models
from app.services.catalog.component_identity import ComponentIdentity, find_identity_holder
from app.services.catalog.conflicts import CatalogConflict, revision_conflict
from app.services.catalog.field_rules import custom_field_errors, missing_custom_fields
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.metadata_normalization import (
    IDENTITY_KIND_MPN,
    IDENTITY_KIND_PROVISIONAL_IPN,
    metadata_keywords,
    metadata_search_document,
    normalize_metadata,
)
from app.services.catalog.metadata_schema import CatalogMetadataSchema
from app.services.catalog.normalization import json_loads, slugify, utc_now_iso
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import REVISION_MANIFEST_A3, CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


SOURCE_MANUAL = "manual"
SOURCE_EXTERNAL = "external"

# The first revision of a component made from another component's released revision.
CHANGE_KIND_CREATE_FROM = "create_from"
SOURCE_NOT_RELEASED_CODE = "source_not_released"

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


def metadata_column_values(metadata: dict[str, Any]) -> tuple[Any, ...]:
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

    def identity_holder(
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
    ) -> dict[str, Any] | None:
        """The component (active or retired) holding this identity, under the identity lock."""
        identity = ComponentIdentity.of(
            manufacturer=manufacturer,
            mpn=mpn,
            identity_kind=identity_kind,
            identity_source=identity_source,
            source_internal_part_number=source_internal_part_number,
        )
        if acquire_identity_lock:
            self._catalog_locks.lock_component_identity(conn, identity.lock_scope, identity.part_number)
        return find_identity_holder(conn, identity, exclude_component_id=component_id)

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
        if self.identity_holder(
            conn,
            manufacturer=manufacturer,
            mpn=mpn,
            identity_kind=identity_kind,
            identity_source=identity_source,
            source_internal_part_number=source_internal_part_number,
            component_id=component_id,
            acquire_identity_lock=acquire_identity_lock,
        ):
            raise ValueError("A component with this manufacturer-part identity already exists")

    def missing_custom_fields(self, conn: Any, metadata: dict[str, Any]) -> list[str]:
        """Labels of the active custom required fields that normalized ``metadata`` leaves blank."""
        return [
            str(field.get("label") or field.get("key"))
            for field in missing_custom_fields(
                self._metadata_schema.list_fields(conn), metadata, identity_kind=metadata["identity_kind"]
            )
        ]

    def assert_custom_fields_present(self, conn: Any, metadata: dict[str, Any]) -> None:
        """Refuse normalized ``metadata`` that leaves a custom required field blank (``"<Label>: Required"``)."""
        errors = custom_field_errors(
            self._metadata_schema.list_fields(conn), metadata, identity_kind=metadata["identity_kind"]
        )
        if errors:
            raise ValueError("; ".join(errors))

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
        kind: str = "part",
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
            metadata["identity_source"]
            if metadata["identity_kind"] == IDENTITY_KIND_PROVISIONAL_IPN
            else ""
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
                (*metadata_column_values(metadata), now, revision["id"]),
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
                id, slug, kind, identity_kind, identity_source, normalized_manufacturer, normalized_part_number,
                source, external_source, external_id, is_active, current_revision_id,
                released_revision_id, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, '', %s, %s)
            """,
            (
                component_id,
                slug,
                kind,
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
                change_kind if source != SOURCE_MANUAL or change_kind == CHANGE_KIND_CREATE_FROM else "create",
                change_summary,
                actor,
                "",
                REVISION_MANIFEST_A3,
                "open",
                *metadata_column_values(metadata),
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
        """A new component.

        With ``payload["source"]`` (``component_id`` and ``expected_revision_id``)
        the first revision links the assets, representations, previews and
        model alignment of the source's released revision. Metadata always comes
        from ``payload``; nothing is copied from the source.
        """
        payload = dict(payload)
        source = payload.pop("source", None)
        component_id = str(uuid.uuid4())
        metadata = normalize_metadata(payload)
        self.assert_custom_fields_present(conn, metadata)
        if not source:
            self.upsert_metadata_row(
                conn,
                runtime,
                component_id=component_id,
                metadata=metadata,
                now=utc_now_iso(),
                existing_component_id=None,
                actor=actor,
                change_summary=change_summary,
            )
            return component_id
        source_component_id = str(source.get("component_id") or "").strip()
        source_revision_id = self.released_source_revision(
            conn, source_component_id, str(source.get("expected_revision_id") or "").strip()
        )
        now = utc_now_iso()
        _, revision_id = self.upsert_metadata_row(
            conn,
            runtime,
            component_id=component_id,
            metadata=metadata,
            now=now,
            existing_component_id=None,
            actor=actor,
            change_summary=change_summary,
            finalize_revision=False,
            change_kind=CHANGE_KIND_CREATE_FROM,
        )
        self._revision_kernel.copy_revision_links(conn, source_revision_id, revision_id, now)
        self._revision_kernel.inherit_validation_evidence(conn, source_revision_id, revision_id)
        catalog_models.copy_alignments(conn, source_component_id, component_id, revision_id, actor=actor, now=now)
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="component.created",
            actor=actor,
            details={
                "change_kind": CHANGE_KIND_CREATE_FROM,
                "change_summary": change_summary,
                "source_component_id": source_component_id,
                "source_revision_id": source_revision_id,
            },
        )
        return component_id

    @staticmethod
    def released_source_revision(conn: Any, component_id: str, expected_revision_id: str) -> str:
        """The released revision to create from, held so that no release changes it before commit."""
        row = conn.execute(
            "SELECT id, is_active, released_revision_id FROM components WHERE id = %s FOR SHARE",
            (component_id,),
        ).fetchone() if component_id else None
        if not row or not int(row["is_active"] or 0):
            raise NotFound("Source component not found")
        released_revision_id = str(row["released_revision_id"] or "")
        if not released_revision_id:
            raise CatalogConflict("Source component has no released revision", code=SOURCE_NOT_RELEASED_CODE)
        if released_revision_id != expected_revision_id:
            raise CatalogConflict("Source component was released again: refresh it before creating from it")
        return released_revision_id

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
            raise revision_conflict(component_id=component_id, current_revision_id=str(revision["id"]))
        metadata = merge_metadata_patch(component, revision, updates)
        if metadata_matches_revision(revision, metadata):
            return ""
        self.assert_custom_fields_present(conn, metadata)
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
    "metadata_column_values",
    "metadata_matches_revision",
]
