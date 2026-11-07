"""One metadata batch from staging to its final accounting.

A batch is staged (from grid edits or a CSV), its proposed custom fields are
approved when it has any, its valid items are applied, and the batch totals
are recorded. This module owns that lifecycle and its transactions; the
compatibility facade forwards to it and exposes it as
``catalog_service.metadata_batch_lifecycle``. ``connect`` opens a catalog
connection and ``initialize`` makes sure the schema exists.

Transactions, one per step:

- ``stage`` and ``stage_csv``: one transaction for the batch row, its items
  and its valid count. ``stage_csv`` also reads the field registry and the
  current revisions in that transaction.
- ``approve_fields``: all or nothing. Every proposal is prepared first, then
  the fields are created and the batch is marked ready in one transaction, so
  a failing proposal creates none of them and the batch stays
  ``needs_fields``. A key that is already defined is an expected outcome
  (``create_field_unless_defined`` returns ``None``), not an error.
- ``apply``: the batch row is locked for the length of the run, so concurrent
  applies on one batch are serialized. Each item is applied in its own
  transaction, so a conflict on one item never rolls back another. A
  ``ValueError`` marks that item ``conflict`` in its own transaction. The
  accounting runs in one final transaction.
"""

from __future__ import annotations

from typing import Any, Callable, ContextManager

from app.services.catalog.metadata_batch_application import CatalogMetadataBatchApplication
from app.services.catalog.metadata_batch_workflow import CatalogMetadataBatchWorkflow
from app.services.catalog.metadata_batches import CatalogMetadataBatches
from app.services.catalog.metadata_csv import CatalogMetadataCsv
from app.services.catalog.metadata_fields import CatalogMetadataFields
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.runtime import CatalogRuntime

ProgressCallback = Callable[[dict[str, Any]], None]


class CatalogMetadataBatchLifecycle:
    """Stage → approve fields → apply → accounting for metadata batches."""

    def __init__(
        self,
        *,
        connect: Callable[[], ContextManager[Any]],
        initialize: Callable[[], None],
        runtime: CatalogRuntime,
        metadata_fields: CatalogMetadataFields,
        metadata_csv: CatalogMetadataCsv,
        batches: CatalogMetadataBatches,
        workflow: CatalogMetadataBatchWorkflow,
        application: CatalogMetadataBatchApplication,
    ) -> None:
        self._connect = connect
        self._initialize = initialize
        self._runtime = runtime
        self._metadata_fields = metadata_fields
        self._metadata_csv = metadata_csv
        self._batches = batches
        self._workflow = workflow
        self._application = application

    def get(self, batch_id: str) -> dict[str, Any] | None:
        self._initialize()
        with self._connect() as conn:
            return self._batches.batch_payload(conn, batch_id)

    def stage(
        self,
        items: list[dict[str, Any]],
        *,
        source: str,
        actor: str,
        change_summary: str,
        proposed_fields: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Validate ``items`` against the field registry and persist them as a batch."""
        self._initialize()
        with self._connect() as conn:
            batch_id = self._workflow.stage(
                conn,
                items,
                source=source,
                actor=actor,
                change_summary=change_summary,
                proposed_fields=proposed_fields,
            )
            conn.commit()
            return self._batches.batch_payload(conn, batch_id) or {}

    def stage_csv(self, file_content: str, *, actor: str, change_summary: str) -> dict[str, Any]:
        """Stage the rows of an edited metadata export that differ from the catalog.

        Unknown columns become proposed fields; rows with no change are counted
        in ``skipped_unchanged_rows`` and not staged.
        """
        self._initialize()
        with self._connect() as conn:
            fields = {
                field["key"]: field
                for field in self._metadata_fields.list_fields(conn, include_archived=True)
            }
            parsed = self._metadata_csv.parse_preview(file_content, list(fields.values()))
            changes = self._metadata_csv.filter_preview_changes(
                parsed.parsed_rows,
                self._batches.current_revision_rows(conn),
                fields,
                parsed.proposed_fields,
            )
            batch_id = self._workflow.stage(
                conn,
                changes.items,
                source="csv",
                actor=actor,
                change_summary=change_summary,
                proposed_fields=changes.used_proposals,
            )
            conn.commit()
            batch = self._batches.batch_payload(conn, batch_id) or {}
        return {
            **batch,
            "source_rows": len(parsed.parsed_rows),
            "skipped_unchanged_rows": changes.skipped_unchanged_rows,
        }

    def approve_fields(self, batch_id: str, *, actor: str) -> dict[str, Any]:
        """Create the batch's proposed fields and mark it ready to apply."""
        self._initialize()
        with self._connect() as conn:
            proposals = self._batches.fetch_batch_field_proposals(conn, batch_id)
        if proposals is None:
            raise ValueError("Metadata batch not found")
        prepared = [self._metadata_fields.prepare_create_field(proposal) for proposal in proposals]
        with self._connect() as conn:
            for field in prepared:
                self._metadata_fields.create_field_unless_defined(conn, field, actor)
            self._batches.mark_fields_approved(conn, batch_id, utc_now_iso())
            conn.commit()
            return self._batches.batch_payload(conn, batch_id) or {}

    def apply(
        self,
        batch_id: str,
        *,
        actor: str,
        item_ids: list[str] | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        """Apply the batch's valid items (or the selected ones) and record the totals.

        The batch row is locked for the whole run, so a concurrent apply on the
        same batch waits and then reads the items the first one applied.
        """
        self._initialize()
        with self._connect() as lock_conn:
            batch = self._batches.lock_batch_for_apply(lock_conn, batch_id)
            if not batch:
                raise ValueError("Metadata batch not found")
            if str(batch["status"]) == "needs_fields":
                raise ValueError("Unknown CSV fields must be approved before applying")
            rows = self._batches.fetch_valid_item_rows(lock_conn, batch_id)
            selection = self._application.select_valid_item_ids(rows, item_ids)
            ids = list(selection.ids)
            if selection.selected and not ids:
                raise ValueError("None of the selected metadata batch items are valid")
            applied = 0
            failed = 0
            errors: list[dict[str, str]] = []
            for index, item_id in enumerate(ids):
                try:
                    self._apply_item(item_id, actor=actor)
                    applied += 1
                except ValueError as exc:
                    failed += 1
                    errors.append({"item_id": item_id, "error": str(exc)})
                    self._mark_conflict(item_id, str(exc))
                if progress_callback:
                    progress_callback({"completed": index + 1, "total": len(ids), "applied": applied, "failed": failed})
            return self._account(lock_conn, batch_id, applied=applied, failed=failed, errors=errors)

    def _apply_item(self, item_id: str, *, actor: str) -> None:
        with self._connect() as conn:
            self._workflow.apply_item(conn, self._runtime, item_id, actor=actor)
            conn.commit()

    def _mark_conflict(self, item_id: str, error: str) -> None:
        with self._connect() as conn:
            self._batches.mark_item_conflict(conn, item_id, error, utc_now_iso())
            conn.commit()

    def _account(
        self, conn: Any, batch_id: str, *, applied: int, failed: int, errors: list[dict[str, str]]
    ) -> dict[str, Any]:
        totals = self._batches.calculate_batch_totals(conn, batch_id)
        accounting = self._application.account_batch(batch_id, totals, applied, failed, errors)
        self._batches.finalize_batch(
            conn,
            batch_id=batch_id,
            status=accounting.status,
            valid_items=accounting.remaining,
            applied_items=accounting.total_applied,
            failed_items=accounting.total_failed,
            updated_at=utc_now_iso(),
        )
        conn.commit()
        return accounting.result


__all__ = ["CatalogMetadataBatchLifecycle", "ProgressCallback"]
