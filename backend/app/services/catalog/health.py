"""Catalog health: validation, availability, and preview counters for operators."""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.catalog.component_queries import CatalogComponentQueries
from app.services.catalog.component_read_models import (
    STATE_PLACE_READY,
    VALIDATION_STATUS_FAILED,
    VALIDATION_STATUS_NOT_RUN,
    VALIDATION_STATUS_PASSED,
    VALIDATION_STATUS_SKIPPED,
    VALIDATION_STATUS_WARNING,
)
from app.services.catalog.klc_validation import CatalogKlcValidation
from app.services.catalog.preview_renderer import PREVIEW_STATUS_FAILED


HEALTH_PAGE_SIZE = 10000


class CatalogHealth:
    """Aggregate one health snapshot over every active component."""

    def __init__(self, component_queries: CatalogComponentQueries, klc: CatalogKlcValidation) -> None:
        self._component_queries = component_queries
        self._klc = klc

    def report(self, conn: Any) -> dict[str, Any]:
        validation_counts = {
            status: 0
            for status in (
                VALIDATION_STATUS_PASSED,
                VALIDATION_STATUS_WARNING,
                VALIDATION_STATUS_FAILED,
                VALIDATION_STATUS_SKIPPED,
                VALIDATION_STATUS_NOT_RUN,
            )
        }
        place_ready = 0
        released = 0
        missing_files = 0
        total_components = 0
        page = 1
        while True:
            # Lightweight payloads avoid hydrating preview graphs for every component.
            plan = self._component_queries.prepare_list_components(
                include_inactive=False, page=page, page_size=HEALTH_PAGE_SIZE, lightweight=True
            )
            result = self._component_queries.execute_list_components(conn, plan)
            total_components = int(result["total"])
            for component in result["items"]:
                status = component["validation"]["status"]
                validation_counts[status] = validation_counts.get(status, 0) + 1
                if component["availability_state"] == STATE_PLACE_READY:
                    place_ready += 1
                else:
                    missing_files += 1
                if component["release_status"] == "released":
                    released += 1
            if page >= int(result["pages"]):
                break
            page += 1
        preview_failed_row = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM revision_preview_outputs rpo
            JOIN components c ON c.current_revision_id = rpo.revision_id
            JOIN asset_preview_versions apv ON apv.id = rpo.preview_id
            WHERE c.is_active = 1 AND apv.status = %s
            """,
            (PREVIEW_STATUS_FAILED,),
        ).fetchone()
        return {
            "enabled": bool(settings.CATALOG_KLC_ENABLED),
            "checker_available": self._klc.checker_available(),
            "checker_path": str(self._klc.utils_root()),
            "release_gate": self._klc.release_gate(),
            "total_components": total_components,
            "released": released,
            "place_ready": place_ready,
            "missing_files": missing_files,
            "preview_failed": int(preview_failed_row["count"] if preview_failed_row else 0),
            "validation": validation_counts,
        }


__all__ = ["HEALTH_PAGE_SIZE", "CatalogHealth"]
