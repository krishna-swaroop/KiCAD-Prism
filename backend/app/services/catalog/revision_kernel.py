"""Connection-level revision persistence operations for the catalog."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.normalization import (
    canonical_json,
    json_loads,
    sha256_text,
    utc_now_iso as _utc_now_iso,
)


REVISION_MANIFEST_A0 = "prism.revision_manifest_a0"
REVISION_MANIFEST_A1 = "prism.revision_manifest_a1"
REVISION_MANIFEST_A2 = "prism.revision_manifest_a2"
REVISION_MANIFEST_A3 = "prism.revision_manifest_a3"

WORKFLOW_STAGES = ("open", "in_progress", "qa_review", "done", "released", "archived")
LEGACY_WORKFLOW_STAGE_MAP = {
    "draft": "open",
    "in_review": "qa_review",
    "qa_approved": "done",
    "released": "released",
    "deprecated": "archived",
}


def normalize_workflow_stage(stage: str) -> str:
    normalized = (stage or "").strip().lower()
    return LEGACY_WORKFLOW_STAGE_MAP.get(normalized, normalized)


class CatalogRevisionKernel:
    """Persist revision, manifest, audit, and validation-link state.

    A connection is supplied for every operation.  The kernel never opens,
    commits, rolls back, or otherwise owns a connection or transaction.
    """

    def __init__(self, catalog_locks: CatalogLockOperations) -> None:
        self._catalog_locks = catalog_locks

    def component_row(self, conn: Any, component_id: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT * FROM components WHERE id = %s", (component_id,)).fetchone()
        return dict(row) if row else None

    def revision_row(self, conn: Any, revision_id: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT * FROM component_revisions WHERE id = %s", (revision_id,)).fetchone()
        return dict(row) if row else None

    def active_revision_row(
        self,
        conn: Any,
        component_id: str,
        *,
        released: bool = False,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        component = self.component_row(conn, component_id)
        if not component:
            return None, None
        revision_id = component["released_revision_id"] if released else component["current_revision_id"]
        if not revision_id:
            return component, None
        return component, self.revision_row(conn, str(revision_id))

    def append_audit_event(
        self,
        conn: Any,
        *,
        component_id: str,
        revision_id: str,
        event_type: str,
        actor: str = "",
        details: dict[str, Any] | None = None,
    ) -> None:
        self._catalog_locks.lock_audit_append(conn, component_id)
        previous = conn.execute(
            "SELECT sequence, event_hash FROM catalog_audit_events WHERE component_id = %s ORDER BY sequence DESC LIMIT 1",
            (component_id,),
        ).fetchone()
        previous_hash = str(previous["event_hash"]) if previous else ""
        sequence = int(previous["sequence"] or 0) + 1 if previous else 1
        created_at = _utc_now_iso()
        event_id = str(uuid.uuid4())
        details_json = canonical_json(details or {})
        canonical = canonical_json(
            {
                "id": event_id,
                "component_id": component_id,
                "revision_id": revision_id,
                "event_type": event_type,
                "actor": actor,
                "details": json.loads(details_json),
                "previous_hash": previous_hash,
                "created_at": created_at,
            }
        )
        event_hash = sha256_text(canonical)
        conn.execute(
            """
            INSERT INTO catalog_audit_events (
                id, component_id, sequence, revision_id, event_type, actor, details_json,
                previous_hash, event_hash, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                event_id,
                component_id,
                sequence,
                revision_id,
                event_type,
                actor,
                details_json,
                previous_hash,
                event_hash,
                created_at,
            ),
        )
        conn.execute(
            "INSERT INTO catalog_meta (key, value) VALUES (%s, %s) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (f"audit_head:{component_id}", event_hash),
        )

    def revision_manifest_hash(self, conn: Any, revision_id: str) -> str:
        revision = self.revision_row(conn, revision_id)
        if not revision:
            return ""
        excluded = {
            "id",
            "component_id",
            "release_status",
            "manifest_hash",
            "manifest_schema",
            "created_at",
            "updated_at",
            "version",
            "parent_revision_id",
            "change_kind",
            "change_summary",
            "created_by",
        }
        metadata = {key: revision[key] for key in sorted(revision) if key not in excluded}
        assets = [
            {
                "asset_type": str(asset["asset_type"]),
                "sha256": str(asset["sha256"]),
                "target_library": str(asset["target_library"]),
                "target_name": str(asset["target_name"]),
                "required": bool(asset["required"]),
            }
            for asset in self.load_assets_for_revision(conn, revision_id)
        ]
        manifest_schema = str(revision.get("manifest_schema") or REVISION_MANIFEST_A0)
        payload: dict[str, Any] = {"metadata": metadata, "assets": assets}
        if manifest_schema == REVISION_MANIFEST_A1:
            payload = {
                "schema": REVISION_MANIFEST_A1,
                **payload,
                "previews": [
                    {
                        "asset_id": str(preview["asset_id"]),
                        "kind": str(preview["kind"]),
                        "sha256": str(preview["sha256"]),
                        "generator_fingerprint": str(preview["generator_fingerprint"]),
                    }
                    for preview in self.load_preview_evidence_for_revision(conn, revision_id)
                    if str(preview["status"]) == "ready"
                ],
            }
        elif manifest_schema == REVISION_MANIFEST_A2:
            payload = {"schema": REVISION_MANIFEST_A2, **payload}
        elif manifest_schema == REVISION_MANIFEST_A3:
            payload = {
                "schema": REVISION_MANIFEST_A3,
                **payload,
                "representations": [
                    {
                        "label": str(item["label"]),
                        "symbol_asset_id": str(item["symbol_asset_id"] or ""),
                        "footprint_asset_id": str(item["footprint_asset_id"] or ""),
                        "is_default": bool(item["is_default"]),
                        "display_order": int(item["display_order"]),
                        "source_internal_part_number": str(item["source_internal_part_number"] or ""),
                        "provenance": json_loads(item["provenance_json"], {}),
                    }
                    for item in conn.execute(
                        "SELECT * FROM revision_representations WHERE revision_id = %s "
                        "ORDER BY display_order, label, COALESCE(symbol_asset_id, ''), "
                        "COALESCE(footprint_asset_id, '')",
                        (revision_id,),
                    ).fetchall()
                ],
            }
        elif manifest_schema != REVISION_MANIFEST_A0:
            raise ValueError(f"Unsupported revision manifest schema: {manifest_schema}")
        canonical = canonical_json(payload)
        return sha256_text(canonical)

    @staticmethod
    def assert_expected_revision(current_id: str, expected_revision_id: str = "") -> None:
        # Empty expected_revision_id is the legacy skip used by older callers.
        if expected_revision_id and current_id != expected_revision_id:
            raise CatalogConflict()

    def clone_revision(
        self,
        conn: Any,
        component_id: str,
        *,
        actor: str = "",
        change_kind: str = "edit",
        change_summary: str = "",
        expected_revision_id: str = "",
    ) -> dict[str, Any]:
        self._catalog_locks.lock_revision_clone(conn, component_id)
        component, current = self.active_revision_row(conn, component_id, released=False)
        if not component or not current:
            raise ValueError("Component not found")
        self.assert_expected_revision(str(current["id"]), expected_revision_id)

        now = _utc_now_iso()
        next_version = int(
            conn.execute(
                "SELECT COALESCE(MAX(version), 0) AS max_version FROM component_revisions WHERE component_id = %s",
                (component_id,),
            ).fetchone()["max_version"]
        ) + 1
        parent_status = normalize_workflow_stage(str(current["release_status"]))
        # Preserve in-flight workflow across asset/metadata clones. Only branch
        # back to open when starting new work from a released/archived revision.
        if change_kind == "new_draft" or parent_status in {"released", "archived"}:
            next_status = "open"
        elif parent_status == "done":
            next_status = "in_progress"
        else:
            next_status = parent_status if parent_status in WORKFLOW_STAGES else "open"
        revision_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO component_revisions (
                id, component_id, version, parent_revision_id, change_kind, change_summary, created_by,
                manifest_hash, manifest_schema, release_status, name, value, description, datasheet_url,
                manufacturer, mpn, normalized_manufacturer, normalized_mpn, mpn_source,
                category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, extra_fields, search_document, created_at, updated_at
            )
            SELECT
                %s, component_id, %s, id, %s, %s, %s, '', %s, %s, name, value, description, datasheet_url,
                manufacturer, mpn, normalized_manufacturer, normalized_mpn, mpn_source,
                category, package_name, vendor, vendor_part_number, mass_g,
                rqjc_c_w, rqjc_top_c_w, temp_max_c, temp_min_c, power_dissipation_w, rate, sap_code,
                summary, keywords, extra_fields, search_document, %s, %s
            FROM component_revisions
            WHERE id = %s
            """,
            (
                revision_id,
                next_version,
                change_kind,
                change_summary,
                actor,
                REVISION_MANIFEST_A3,
                next_status,
                now,
                now,
                current["id"],
            ),
        )
        conn.execute(
            """
            INSERT INTO revision_assets (revision_id, asset_type, asset_id, required, created_at, updated_at)
            SELECT %s, asset_type, asset_id, required, %s, %s
            FROM revision_assets
            WHERE revision_id = %s
            """,
            (revision_id, now, now, current["id"]),
        )
        for representation in conn.execute(
            """
            SELECT label, symbol_asset_id, footprint_asset_id, is_default, display_order,
                   source_internal_part_number, provenance_json
            FROM revision_representations
            WHERE revision_id = %s
            ORDER BY display_order, id
            """,
            (current["id"],),
        ).fetchall():
            conn.execute(
                """
                INSERT INTO revision_representations (
                    id, revision_id, label, symbol_asset_id, footprint_asset_id, is_default,
                    display_order, source_internal_part_number, provenance_json, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()), revision_id, representation["label"],
                    representation["symbol_asset_id"], representation["footprint_asset_id"],
                    representation["is_default"], representation["display_order"],
                    representation["source_internal_part_number"], representation["provenance_json"],
                    now, now,
                ),
            )
        conn.execute(
            """
            INSERT INTO revision_previews (revision_id, asset_id, kind, preview_id, created_at)
            SELECT %s, asset_id, kind, preview_id, %s
            FROM revision_previews
            WHERE revision_id = %s
            """,
            (revision_id, now, current["id"]),
        )
        conn.execute(
            """
            INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
            SELECT %s, asset_id, kind, preview_id, %s
            FROM revision_preview_outputs
            WHERE revision_id = %s
            """,
            (revision_id, now, current["id"]),
        )
        conn.execute(
            "UPDATE components SET current_revision_id = %s, updated_at = %s WHERE id = %s",
            (revision_id, now, component_id),
        )
        self.inherit_validation_evidence(conn, str(current["id"]), revision_id)
        return self.revision_row(conn, revision_id) or {}

    def load_assets_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT a.*, ra.required
            FROM revision_assets ra
            JOIN assets a ON a.id = ra.asset_id
            WHERE ra.revision_id = %s
            ORDER BY CASE a.asset_type
                WHEN 'symbol' THEN 1
                WHEN 'footprint' THEN 2
                WHEN '3dmodel' THEN 3
                WHEN 'spice' THEN 4
                ELSE 99
            END, a.target_library, a.target_name, a.sha256
            """,
            (revision_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def load_preview_evidence_for_revision(self, conn: Any, revision_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT preview.*
            FROM revision_previews link
            JOIN asset_preview_versions preview ON preview.id = link.preview_id
            WHERE link.revision_id = %s
            ORDER BY preview.kind, preview.asset_id, preview.created_at, preview.id
            """,
            (revision_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def inherit_validation_evidence(self, conn: Any, parent_revision_id: str, revision_id: str) -> None:
        # Inherit only for assets still attached to the child revision so replaced
        # or detached CAD does not keep stale validation evidence links.
        assets = conn.execute(
            "SELECT asset_id FROM revision_assets WHERE revision_id = %s AND asset_type IN ('symbol', 'footprint')",
            (revision_id,),
        ).fetchall()
        for asset in assets:
            run = conn.execute(
                "SELECT id FROM asset_validation_runs WHERE revision_id = %s AND asset_id = %s ORDER BY finished_at DESC, created_at DESC LIMIT 1",
                (parent_revision_id, asset["asset_id"]),
            ).fetchone()
            if not run:
                run = conn.execute(
                    "SELECT source_run_id AS id FROM revision_validation_evidence_links WHERE revision_id = %s AND asset_id = %s",
                    (parent_revision_id, asset["asset_id"]),
                ).fetchone()
            if run:
                conn.execute(
                    """
                    INSERT INTO revision_validation_evidence_links (revision_id, asset_id, source_run_id, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT(revision_id, asset_id) DO UPDATE SET
                        source_run_id = excluded.source_run_id, created_at = excluded.created_at
                    """,
                    (revision_id, asset["asset_id"], run["id"], _utc_now_iso()),
                )


__all__ = [
    "CatalogRevisionKernel",
    "LEGACY_WORKFLOW_STAGE_MAP",
    "REVISION_MANIFEST_A0",
    "REVISION_MANIFEST_A1",
    "REVISION_MANIFEST_A2",
    "REVISION_MANIFEST_A3",
    "WORKFLOW_STAGES",
    "normalize_workflow_stage",
]
