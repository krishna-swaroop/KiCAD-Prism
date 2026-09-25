"""Connection-level project-import identity matching and usage indexing."""

from __future__ import annotations

import json
import uuid
from typing import Any


class CatalogProjectImportMatching:
    """Match project identities and index where-used observations on a supplied connection."""

    @staticmethod
    def normalize_identity_requests(
        identities: list[dict[str, str]],
    ) -> set[tuple[str, str]]:
        return {
            (str(item.get("manufacturer") or "").strip().casefold(), str(item.get("mpn") or "").strip().casefold())
            for item in identities
            if str(item.get("manufacturer") or "").strip() and str(item.get("mpn") or "").strip()
        }

    def match_component_identities(
        self,
        conn: Any,
        requested: set[tuple[str, str]],
    ) -> dict[str, dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT component.id, revision.name, revision.manufacturer, revision.mpn,
                   revision.id AS revision_id, revision.version
            FROM components component
            JOIN component_revisions revision ON revision.id = component.current_revision_id
            WHERE component.is_active = 1
            """
        ).fetchall()
        matches: dict[str, dict[str, Any]] = {}
        for row in rows:
            key = (str(row["manufacturer"] or "").strip().casefold(), str(row["mpn"] or "").strip().casefold())
            if key not in requested:
                continue
            matches["\0".join(key)] = {
                "component_id": str(row["id"]),
                "revision_id": str(row["revision_id"]),
                "version": int(row["version"] or 0),
                "name": str(row["name"] or row["mpn"] or ""),
                "manufacturer": str(row["manufacturer"] or ""),
                "manufacturer_part_number": str(row["mpn"] or ""),
            }
        return matches

    def record_component_usage(
        self,
        conn: Any,
        *,
        component_id: str,
        provenance: list[dict[str, Any]],
        observed_at: str,
        source: str = "semantic_scan",
    ) -> int:
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for raw_source in provenance:
            project_id = str(raw_source.get("projectId") or "")
            source_revision = str(raw_source.get("sourceRevision") or "")
            if not project_id:
                continue
            detail = {
                str(key): value
                for key, value in raw_source.items()
                if value not in (None, "", [], {})
            }
            grouped.setdefault((project_id, source_revision), []).append(detail)

        for (project_id, source_revision), details in grouped.items():
            conn.execute(
                """
                UPDATE component_usage
                SET is_current = 0, last_seen_at = %s
                WHERE component_id = %s AND project_id = %s AND source_revision <> %s AND is_current = 1
                """,
                (observed_at, component_id, project_id, source_revision),
            )
            references = sorted(
                {
                    str(detail.get("reference") or "")
                    for detail in details
                    if str(detail.get("reference") or "")
                }
            )
            conn.execute(
                """
                INSERT INTO component_usage (
                    id, component_id, project_id, source_revision, references_json, details_json,
                    source, is_current, first_seen_at, last_seen_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, %s)
                ON CONFLICT(component_id, project_id, source_revision)
                DO UPDATE SET references_json = excluded.references_json,
                              details_json = excluded.details_json,
                              source = excluded.source,
                              is_current = 1,
                              last_seen_at = excluded.last_seen_at
                """,
                (
                    str(uuid.uuid4()),
                    component_id,
                    project_id,
                    source_revision,
                    json.dumps(references, separators=(",", ":")),
                    json.dumps(details, sort_keys=True, separators=(",", ":")),
                    source,
                    observed_at,
                    observed_at,
                ),
            )
        return len(grouped)

    def index_project_component_usage(
        self,
        conn: Any,
        proposals: list[dict[str, Any]],
        *,
        observed_at: str,
    ) -> dict[str, int]:
        matched_components: set[str] = set()
        observations = 0
        for proposal in proposals:
            metadata = dict(proposal.get("metadata") or {})
            manufacturer = str(metadata.get("manufacturer") or "").strip()
            mpn = str(metadata.get("manufacturer_part_number") or metadata.get("mpn") or "").strip()
            if not manufacturer or not mpn:
                continue
            component = conn.execute(
                """
                SELECT component.id
                FROM components component
                JOIN component_revisions revision ON revision.id = component.current_revision_id
                WHERE component.is_active = 1
                  AND lower(revision.manufacturer) = lower(%s)
                  AND lower(revision.mpn) = lower(%s)
                ORDER BY component.created_at
                LIMIT 1
                """,
                (manufacturer, mpn),
            ).fetchone()
            if not component:
                continue
            component_id = str(component["id"])
            matched_components.add(component_id)
            observations += self.record_component_usage(
                conn,
                component_id=component_id,
                provenance=list(proposal.get("provenance") or []),
                observed_at=observed_at,
                source="semantic_scan",
            )
        return {"matched_components": len(matched_components), "observations": observations}


__all__ = ["CatalogProjectImportMatching"]
