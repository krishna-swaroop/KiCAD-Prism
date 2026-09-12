"""Stage and apply auditable metadata batches.

Staging validates each item against the current field schema and records a
diff per component; applying rewrites one component per transaction so a
conflict on one item never rolls back the others. The batch-level loop that
opens those transactions stays with the facade. Nothing here commits.
"""

from __future__ import annotations

import json
from typing import Any
import uuid

from app.services.catalog.component_writer import CatalogComponentWriter
from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.metadata_batch_application import CatalogMetadataBatchApplication
from app.services.catalog.metadata_batch_staging import CatalogMetadataBatchStaging
from app.services.catalog.metadata_batches import CatalogMetadataBatches
from app.services.catalog.metadata_fields import CatalogMetadataFields
from app.services.catalog.metadata_schema import METADATA_SCHEMA_VERSION
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


def _compact_json(value: Any, *, sort_keys: bool = False) -> str:
    return json.dumps(value, sort_keys=sort_keys, separators=(",", ":"))


class CatalogMetadataBatchWorkflow:
    """Stage batch items and apply one staged item as a reviewed revision."""

    def __init__(
        self,
        catalog_locks: CatalogLockOperations,
        revision_kernel: CatalogRevisionKernel,
        finalizer: CatalogRevisionFinalizer,
        component_writer: CatalogComponentWriter,
        metadata_fields: CatalogMetadataFields,
        batches: CatalogMetadataBatches,
        staging: CatalogMetadataBatchStaging,
        application: CatalogMetadataBatchApplication,
    ) -> None:
        self._catalog_locks = catalog_locks
        self._revision_kernel = revision_kernel
        self._finalizer = finalizer
        self._component_writer = component_writer
        self._metadata_fields = metadata_fields
        self._batches = batches
        self._staging = staging
        self._application = application

    def stage(
        self,
        conn: Any,
        items: list[dict[str, Any]],
        *,
        source: str,
        actor: str,
        change_summary: str,
        proposed_fields: list[dict[str, Any]] | None = None,
    ) -> str:
        """Persist a batch and its validated items; returns the batch id."""
        component_ids = [str(item.get("component_id") or "") for item in items]
        if len(component_ids) != len(set(component_ids)):
            raise ValueError("Each component may appear only once in a metadata batch")
        batch_id = str(uuid.uuid4())
        now = utc_now_iso()
        fields = {field["key"]: field for field in self._metadata_fields.list_fields(conn)}
        for proposal in proposed_fields or []:
            fields[str(proposal["key"])] = {
                **proposal,
                "storage_kind": "extra",
                "storage_key": proposal["key"],
                "archived": False,
            }
        valid_count = 0
        duplicate_identities = self._staging.duplicate_identities(conn, items)
        self._batches.insert_batch(
            conn,
            batch_id=batch_id,
            source=source,
            status="needs_fields" if proposed_fields else "ready",
            schema_version=METADATA_SCHEMA_VERSION,
            change_summary=change_summary.strip() or "Bulk update component metadata",
            unknown_fields_json=_compact_json(proposed_fields or []),
            created_by=actor,
            total_items=len(items),
            created_at=now,
            updated_at=now,
        )
        for raw_item in items:
            preparation = self._staging.prepare_item(conn, raw_item, fields, duplicate_identities)
            errors = list(preparation.errors)
            if preparation.target_identity is not None:
                target_manufacturer, target_mpn, _target_name = preparation.target_identity
                try:
                    self._component_writer.assert_identity_available(
                        conn,
                        manufacturer=target_manufacturer,
                        mpn=target_mpn,
                        component_id=preparation.component_id,
                        acquire_identity_lock=False,
                    )
                except ValueError as exc:
                    errors.append(str(exc))
            status = "invalid" if errors else "valid" if preparation.diff else "noop"
            if status == "valid":
                valid_count += 1
            self._batches.insert_batch_item(
                conn,
                item_id=str(uuid.uuid4()),
                batch_id=batch_id,
                component_id=preparation.component_id,
                expected_revision_id=preparation.expected_revision_id,
                patch_json=_compact_json(preparation.normalized_patch, sort_keys=True),
                diff_json=_compact_json(preparation.diff),
                validation_status=status,
                error_message="; ".join(errors),
                created_at=now,
                updated_at=now,
            )
        self._batches.update_valid_items(conn, batch_id, valid_count)
        return batch_id

    def apply_item(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        item_id: str,
        *,
        actor: str,
    ) -> dict[str, str]:
        """Apply one valid item as a ``qa_review`` revision that inherits validation evidence."""
        item = self._batches.fetch_item_for_apply(conn, item_id)
        early_result = self._application.classify_item(item_id, item)
        if early_result is not None:
            return early_result
        component_id = str(item["component_id"])
        self._catalog_locks.lock_component_for_mutation(conn, component_id)
        component, revision = self._revision_kernel.active_revision_row(conn, component_id, released=False)
        if not component or not revision:
            raise ValueError("Component not found")
        if str(revision["id"]) != str(item["expected_revision_id"]):
            raise CatalogConflict("Component revision conflict: current revision changed after preview")
        definitions = {field["key"]: field for field in self._metadata_fields.list_fields(conn)}
        prepared = self._application.prepare_revision(item, revision, definitions)
        metadata = prepared.metadata
        self._catalog_locks.lock_component_identity(conn, metadata["manufacturer"], metadata["mpn"])
        _, revision_id = self._component_writer.upsert_metadata_row(
            conn,
            runtime,
            component_id=component_id,
            metadata=metadata,
            now=utc_now_iso(),
            existing_component_id=component_id,
            actor=actor,
            change_summary=prepared.change_summary,
            expected_revision_id=prepared.parent_revision_id,
            finalize_revision=False,
            change_kind="metadata_bulk",
        )
        conn.execute("UPDATE component_revisions SET release_status = 'qa_review' WHERE id = %s", (revision_id,))
        self._revision_kernel.inherit_validation_evidence(conn, prepared.parent_revision_id, revision_id)
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=revision_id,
            event_type="revision.created",
            actor=actor,
            details=prepared.finalize_details,
        )
        self._batches.mark_item_applied(conn, item_id, revision_id, utc_now_iso())
        return self._application.applied_result(item_id, revision_id)


__all__ = ["CatalogMetadataBatchWorkflow"]
