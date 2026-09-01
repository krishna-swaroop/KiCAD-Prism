"""Pure preparation and accounting for metadata-batch application."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from app.services.catalog.metadata_normalization import normalize_metadata
from app.services.catalog.normalization import json_loads


@dataclass(frozen=True)
class PreparedMetadataBatchApplication:
    """Prepared metadata revision values and audit details."""

    metadata: dict[str, Any]
    patch: dict[str, Any]
    parent_revision_id: str
    change_summary: str
    metadata_batch_id: str
    finalize_details: dict[str, Any]


@dataclass(frozen=True)
class MetadataBatchItemSelection:
    """Ordered valid item ids and the requested selection set."""

    selected: frozenset[str]
    ids: tuple[str, ...]


@dataclass(frozen=True)
class MetadataBatchAccounting:
    """Pure batch totals, final status, and public result."""

    status: str
    remaining: int
    total_applied: int
    total_failed: int
    result: dict[str, Any]


class CatalogMetadataBatchApplication:
    """Prepare and account for metadata-batch application without side effects."""

    @staticmethod
    def classify_item(item_id: str, item: Any) -> dict[str, str] | None:
        if not item:
            raise ValueError("Metadata batch item not found")
        if str(item["validation_status"]) == "applied":
            return {
                "item_id": item_id,
                "status": "applied",
                "revision_id": str(item["applied_revision_id"]),
            }
        if str(item["validation_status"]) != "valid":
            raise ValueError("Metadata batch item is not valid")
        return None

    @staticmethod
    def prepare_revision(
        item: Mapping[str, Any],
        revision: Mapping[str, Any],
        definitions: Mapping[str, Mapping[str, Any]],
    ) -> PreparedMetadataBatchApplication:
        patch = json_loads(item["patch_json"], {})
        merged = {**revision, "extra_fields": json_loads(revision.get("extra_fields"), {})}
        for field_key, value in patch.items():
            field = definitions.get(field_key)
            if not field:
                raise ValueError(f"Metadata field {field_key} is unavailable")
            if field["storage_kind"] == "column":
                merged[field["storage_key"]] = value
            else:
                merged["extra_fields"][field["storage_key"]] = value
        metadata = normalize_metadata(merged)
        parent_revision_id = str(revision["id"])
        change_summary = str(item["change_summary"])
        metadata_batch_id = str(item["metadata_batch_id"])
        finalize_details = {
            "change_kind": "metadata_bulk",
            "change_summary": change_summary,
            "metadata_batch_id": metadata_batch_id,
            "changed_fields": sorted(patch),
            "workflow_stage": "qa_review",
        }
        return PreparedMetadataBatchApplication(
            metadata=metadata,
            patch=patch,
            parent_revision_id=parent_revision_id,
            change_summary=change_summary,
            metadata_batch_id=metadata_batch_id,
            finalize_details=finalize_details,
        )

    @staticmethod
    def applied_result(item_id: str, revision_id: str) -> dict[str, str]:
        return {"item_id": item_id, "status": "applied", "revision_id": revision_id}

    @staticmethod
    def select_valid_item_ids(
        rows: list[Any], item_ids: list[str] | None
    ) -> MetadataBatchItemSelection:
        selected = set(item_ids or [])
        ids = tuple(
            str(row["id"])
            for row in rows
            if not selected or str(row["id"]) in selected
        )
        return MetadataBatchItemSelection(selected=frozenset(selected), ids=ids)

    @staticmethod
    def account_batch(
        batch_id: str,
        totals: Mapping[str, Any],
        applied: int,
        failed: int,
        errors: list[dict[str, str]],
    ) -> MetadataBatchAccounting:
        total_applied = int(totals["applied"] or 0)
        total_failed = int(totals["failed"] or 0)
        remaining = int(totals["remaining"] or 0)
        status = "completed" if total_failed == 0 and remaining == 0 else "partial"
        return MetadataBatchAccounting(
            status=status,
            remaining=remaining,
            total_applied=total_applied,
            total_failed=total_failed,
            result={
                "batch_id": batch_id,
                "status": status,
                "applied": applied,
                "failed": failed,
                "errors": errors,
            },
        )


__all__ = [
    "CatalogMetadataBatchApplication",
    "MetadataBatchAccounting",
    "MetadataBatchItemSelection",
    "PreparedMetadataBatchApplication",
]
