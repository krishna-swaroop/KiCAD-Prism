"""Reads over the ``remote_component_heads`` projection for desktop KiCad.

The projection is maintained by PostgreSQL triggers (see
``postgres_projections.py``); these reads never hydrate revisions. Payload shape
mirrors the full component payload closely enough for the remote provider and
must stay stable for installed KiCad clients.
"""

from __future__ import annotations

from typing import Any

from app.services.catalog.component_read_models import (
    cad_availability,
    inventory_payloads_from_source_rows,
    remote_place_enabled,
)
from app.services.catalog.metadata_normalization import IDENTITY_KIND_MPN
from app.services.catalog.normalization import json_loads
from app.services.catalog.preview_renderer import PREVIEW_STATUS_READY


REMOTE_HEADS_MAX_PAGE_SIZE = 200
REMOTE_HEAD_TIEBREAKER = "component_id"
_PROJECTION_VERSION_SQL = "SELECT value FROM catalog_meta WHERE key = 'remote_component_heads_version'"


def remote_head_payload(raw: Any) -> dict[str, Any]:
    """Shape one projection row as a released, remote-visible component."""
    row = dict(raw)
    has_symbol = bool(row.get("has_symbol"))
    has_footprint = bool(row.get("has_footprint"))
    identity_kind = str(row.get("identity_kind") or IDENTITY_KIND_MPN)
    availability_state, missing_assets = cad_availability(has_symbol, has_footprint)
    assets: list[dict[str, Any]] = []
    if has_symbol:
        assets.append(
            {
                "asset_type": "symbol",
                "target_library": str(row.get("symbol_library") or ""),
                "target_name": str(row.get("symbol_name") or ""),
            }
        )
    if has_footprint:
        assets.append({"asset_type": "footprint"})
    previews: list[dict[str, Any]] = []
    for kind in ("symbol", "footprint"):
        preview_id = str(row.get(f"{kind}_preview_id") or "")
        if preview_id:
            previews.append(
                {
                    "id": preview_id,
                    "kind": kind,
                    "status": PREVIEW_STATUS_READY,
                    "file_path": "projected",
                    "generation_error": "",
                }
            )
    return {
        "id": str(row["component_id"]),
        "slug": str(row["slug"]),
        "name": str(row["name"]),
        "identity_kind": identity_kind,
        "manufacturer": str(row["manufacturer"]),
        "mpn": str(row["mpn"]),
        "description": str(row["description"]),
        "package_name": str(row["package_name"]),
        "category": str(row["category"]),
        "datasheet_url": str(row["datasheet_url"]),
        "summary": str(row["summary"]),
        "version": f"{int(row['version'])}.0.0",
        "library_name": str(row.get("symbol_library") or ""),
        "symbol_name": str(row.get("symbol_name") or ""),
        "assets": assets,
        "previews": previews,
        "availability_state": availability_state,
        "missing_assets": missing_assets,
        "place_enabled": remote_place_enabled(
            is_active=True,
            identity_kind=identity_kind,
            missing_assets=missing_assets,
            release_status="released",
        ),
        "release_status": "released",
        "workflow_stage": "released",
        "supply": {
            "sources": inventory_payloads_from_source_rows(
                json_loads(row.get("inventory_sources"), [])
            )[1]
        },
        "default_representation_id": str(row.get("default_representation_id") or ""),
        "representation_count": int(row.get("representation_count") or 0),
        "symbol_variant_count": int(row.get("symbol_variant_count") or 0),
        "footprint_variant_count": int(row.get("footprint_variant_count") or 0),
        "representations": [],
        "extra_fields": json_loads(row.get("extra_fields"), {}),
    }


class CatalogRemoteHeads:
    """Paginated search and category reads over the remote heads projection."""

    @staticmethod
    def projection_version(conn: Any) -> str:
        row = conn.execute(_PROJECTION_VERSION_SQL).fetchone()
        return str(row["value"]) if row else "0"

    @classmethod
    def list_heads(
        cls,
        conn: Any,
        *,
        query: str = "",
        category: str | None = None,
        page: int = 1,
        page_size: int = 50,
        include_total: bool = True,
    ) -> dict[str, Any]:
        normalized_page = max(1, int(page))
        normalized_size = max(1, min(REMOTE_HEADS_MAX_PAGE_SIZE, int(page_size)))
        offset = (normalized_page - 1) * normalized_size
        filters: list[str] = []
        params: list[Any] = []
        query_text = query.strip()
        if category is not None:
            filters.append("category = %s")
            params.append(category)
        if query_text:
            filters.append(
                "(LOWER(search_document) LIKE LOWER(%s) "
                "OR LOWER(mpn) LIKE LOWER(%s) "
                "OR LOWER(name) LIKE LOWER(%s))"
            )
            wildcard = f"%{query_text}%"
            params.extend([wildcard, wildcard, wildcard])
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        if query_text:
            order_sql = (
                "ORDER BY CASE "
                "WHEN LOWER(mpn) = LOWER(%s) THEN 0 "
                "WHEN LOWER(mpn) LIKE LOWER(%s) THEN 1 "
                "WHEN LOWER(name) LIKE LOWER(%s) THEN 2 "
                f"ELSE 3 END, updated_at DESC, {REMOTE_HEAD_TIEBREAKER}"
            )
            order_params: list[Any] = [query_text, f"{query_text}%", f"{query_text}%"]
        else:
            order_sql = f"ORDER BY updated_at DESC, {REMOTE_HEAD_TIEBREAKER}"
            order_params = []

        total: int | None = None
        if include_total:
            total = int(
                conn.execute(
                    f"SELECT COUNT(1) AS total FROM remote_component_heads {where_sql}",
                    tuple(params),
                ).fetchone()["total"]
            )
        # Fetch one extra row so has_more is known without a count query.
        rows = conn.execute(
            f"""
            SELECT *
            FROM remote_component_heads
            {where_sql}
            {order_sql}
            LIMIT %s OFFSET %s
            """,
            tuple(params + order_params + [normalized_size + 1, offset]),
        ).fetchall()
        projection_version = cls.projection_version(conn)

        has_more = len(rows) > normalized_size
        if has_more:
            rows = rows[:normalized_size]
        if total is not None:
            has_more = offset + len(rows) < total
        return {
            "items": [remote_head_payload(raw) for raw in rows],
            "total": total,
            "has_more": has_more,
            "page": normalized_page,
            "page_size": normalized_size,
            "pages": (max(1, (total + normalized_size - 1) // normalized_size) if total is not None else None),
            "projection_version": projection_version,
        }

    @classmethod
    def list_categories(cls, conn: Any) -> dict[str, Any]:
        rows = conn.execute(
            """
            SELECT category AS name, COUNT(1) AS count
            FROM remote_component_heads
            GROUP BY category
            ORDER BY category
            """
        ).fetchall()
        return {
            "categories": [{"name": str(row["name"] or ""), "count": int(row["count"])} for row in rows],
            "projection_version": cls.projection_version(conn),
        }


__all__ = [
    "REMOTE_HEADS_MAX_PAGE_SIZE",
    "REMOTE_HEAD_TIEBREAKER",
    "CatalogRemoteHeads",
    "remote_head_payload",
]
