"""Connection-level metadata grid preferences and row hydration."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

from app.services.catalog.normalization import (
    json_loads as _json_loads,
    utc_now_iso as _utc_now_iso,
)


@dataclass(frozen=True)
class PreparedMetadataGridPreferences:
    """Prepared preference values that can be written on a supplied connection."""

    user_email: str
    layout: dict[str, Any]
    layout_json: str
    updated_at: str


@dataclass(frozen=True)
class PreparedMetadataGridRows:
    """Prepared metadata-head query inputs and the columns needed to hydrate rows."""

    query: str
    params: tuple[str, ...]
    column_keys: tuple[str, ...]
    needs_extras: bool


class CatalogMetadataGrid:
    """Read and hydrate metadata-grid data using caller-owned connections."""

    @staticmethod
    def prepare_preferences(
        user_email: str, layout: dict[str, Any]
    ) -> PreparedMetadataGridPreferences:
        normalized = {
            "visible": [str(value) for value in layout.get("visible") or []],
            "order": [str(value) for value in layout.get("order") or []],
            "widths": {
                str(key): max(80, min(600, int(value)))
                for key, value in dict(layout.get("widths") or {}).items()
            },
            "pinned": [str(value) for value in layout.get("pinned") or []],
        }
        return PreparedMetadataGridPreferences(
            user_email=user_email.casefold(),
            layout=normalized,
            layout_json=json.dumps(normalized, separators=(",", ":")),
            updated_at=_utc_now_iso(),
        )

    def get_preferences(self, conn: Any, user_email: str) -> dict[str, Any]:
        row = conn.execute(
            "SELECT layout_json FROM catalog_grid_preferences WHERE user_email = %s",
            (user_email.casefold(),),
        ).fetchone()
        return _json_loads(row["layout_json"], {}) if row else {}

    def save_preferences(
        self, conn: Any, prepared: PreparedMetadataGridPreferences
    ) -> None:
        conn.execute(
            """
            INSERT INTO catalog_grid_preferences (user_email, layout_json, updated_at) VALUES (%s, %s, %s)
            ON CONFLICT(user_email) DO UPDATE SET layout_json = excluded.layout_json, updated_at = excluded.updated_at
            """,
            (prepared.user_email, prepared.layout_json, prepared.updated_at),
        )

    @staticmethod
    def prepare_rows(
        component_ids: list[str], fields: list[dict[str, Any]]
    ) -> PreparedMetadataGridRows:
        column_keys = tuple(
            sorted(
                {
                    str(field["storage_key"])
                    for field in fields
                    if field["storage_kind"] == "column"
                }
            )
        )
        needs_extras = any(field["storage_kind"] == "extra" for field in fields)
        selected_columns = ["component_id", "revision_id", *column_keys]
        if needs_extras:
            selected_columns.append("extra_fields")
        placeholders = ",".join("%s" for _ in component_ids)
        return PreparedMetadataGridRows(
            query=(
                f"SELECT {', '.join(selected_columns)} FROM component_heads "
                f"WHERE component_id IN ({placeholders})"
            ),
            params=tuple(component_ids),
            column_keys=column_keys,
            needs_extras=needs_extras,
        )

    @staticmethod
    def fetch_rows(conn: Any, prepared: PreparedMetadataGridRows) -> list[Any]:
        return conn.execute(prepared.query, prepared.params).fetchall()

    @staticmethod
    def hydrate_rows(
        prepared: PreparedMetadataGridRows,
        rows: list[Any],
        items: list[dict[str, Any]],
    ) -> None:
        by_component = {str(row["component_id"]): dict(row) for row in rows}
        for item in items:
            head = by_component.get(str(item["id"]), {})
            for key in prepared.column_keys:
                if key in head:
                    item[key] = str(head[key] or "")
            if prepared.needs_extras:
                item["extra_fields"] = _json_loads(head.get("extra_fields"), {})


__all__ = [
    "CatalogMetadataGrid",
    "PreparedMetadataGridPreferences",
    "PreparedMetadataGridRows",
]
