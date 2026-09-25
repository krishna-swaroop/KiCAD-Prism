"""Seal a cloned revision: refresh previews, hash the manifest, append audit."""

from __future__ import annotations

from typing import Any

from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.preview_pipeline import CatalogPreviewPipeline
from app.services.catalog.revision_kernel import CatalogRevisionKernel
from app.services.catalog.runtime import CatalogRuntime


class CatalogRevisionFinalizer:
    """Complete a revision write inside the caller's transaction.

    Every mutation that clones a revision ends here so the manifest hash and the
    audit chain always describe the revision's final asset and preview state.
    """

    def __init__(
        self,
        revision_kernel: CatalogRevisionKernel,
        preview_pipeline: CatalogPreviewPipeline,
    ) -> None:
        self._revision_kernel = revision_kernel
        self._preview_pipeline = preview_pipeline

    def finalize_revision(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        *,
        component_id: str,
        revision_id: str,
        event_type: str,
        actor: str = "",
        details: dict[str, Any] | None = None,
    ) -> str:
        """Refresh previews, persist the manifest hash, and audit; return the hash."""
        self._preview_pipeline.refresh_revision_preview_outputs(conn, runtime, revision_id)
        manifest_hash = self._revision_kernel.revision_manifest_hash(conn, revision_id)
        conn.execute(
            "UPDATE component_revisions SET manifest_hash = %s, updated_at = %s WHERE id = %s",
            (manifest_hash, utc_now_iso(), revision_id),
        )
        self._revision_kernel.append_audit_event(
            conn,
            component_id=component_id,
            revision_id=revision_id,
            event_type=event_type,
            actor=actor,
            details={**(details or {}), "manifest_hash": manifest_hash},
        )
        return manifest_hash


__all__ = ["CatalogRevisionFinalizer"]
