"""Connection-level component history and evidence reads for the catalog."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.catalog.revision_kernel import (
    CatalogRevisionKernel,
    normalize_workflow_stage,
)
from app.services.catalog.normalization import (
    canonical_json,
    json_loads,
    sha256_file,
    sha256_text,
)


class CatalogComponentHistoryReads:
    """Read component history and integrity evidence from a supplied connection."""

    def __init__(self, revision_kernel: CatalogRevisionKernel) -> None:
        self._revision_kernel = revision_kernel

    def list_component_revisions(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        if not self._revision_kernel.component_row(conn, component_id):
            raise ValueError("Component not found")
        rows = conn.execute(
            """
                SELECT id, component_id, version, parent_revision_id, change_kind, change_summary,
                       created_by, manifest_hash, release_status, created_at, updated_at
                FROM component_revisions
                WHERE component_id = %s
                ORDER BY version DESC
                """,
            (component_id,),
        ).fetchall()
        return [
            {
                **dict(row),
                "release_status": normalize_workflow_stage(str(row["release_status"])),
                "workflow_stage": normalize_workflow_stage(str(row["release_status"])),
            }
            for row in rows
        ]

    def list_component_audit_events(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        if not self._revision_kernel.component_row(conn, component_id):
            raise ValueError("Component not found")
        rows = conn.execute(
            """
                SELECT id, component_id, sequence, revision_id, event_type, actor, details_json,
                       previous_hash, event_hash, created_at
                FROM catalog_audit_events
                WHERE component_id = %s
                ORDER BY sequence DESC
                """,
            (component_id,),
        ).fetchall()
        return [
            {**dict(row), "details": json_loads(row["details_json"], {})}
            for row in rows
        ]

    def verify_component_audit_chain(self, conn: Any, component_id: str) -> dict[str, Any]:
        if not self._revision_kernel.component_row(conn, component_id):
            raise ValueError("Component not found")
        rows = conn.execute(
            """
                SELECT id, component_id, sequence, revision_id, event_type, actor, details_json,
                       previous_hash, event_hash, created_at
                FROM catalog_audit_events
                WHERE component_id = %s
                ORDER BY sequence
                """,
            (component_id,),
        ).fetchall()
        if not rows:
            return {
                "valid": False,
                "coverage": "missing",
                "reason": "missing_audit_events",
                "event_count": 0,
                "verified_count": 0,
                "first_invalid_event_id": "",
                "head_hash": "",
            }
        coverage = (
            "legacy_snapshot"
            if any(str(row["event_type"]) == "audit.migrated" for row in rows)
            else "complete"
        )
        previous_hash = ""
        for index, row in enumerate(rows):
            expected_sequence = index + 1
            if int(row["sequence"] or 0) != expected_sequence:
                return {
                    "valid": False,
                    "coverage": coverage,
                    "reason": "audit_sequence_gap",
                    "event_count": len(rows),
                    "verified_count": index,
                    "first_invalid_event_id": str(row["id"]),
                    "head_hash": previous_hash,
                }
            details = json_loads(row["details_json"], {})
            canonical = canonical_json(
                {
                    "id": str(row["id"]),
                    "component_id": str(row["component_id"]),
                    "revision_id": str(row["revision_id"]),
                    "event_type": str(row["event_type"]),
                    "actor": str(row["actor"]),
                    "details": details,
                    "previous_hash": str(row["previous_hash"]),
                    "created_at": str(row["created_at"]),
                }
            )
            expected_hash = sha256_text(canonical)
            if str(row["previous_hash"]) != previous_hash or str(row["event_hash"]) != expected_hash:
                return {
                    "valid": False,
                    "coverage": coverage,
                    "reason": "audit_hash_mismatch",
                    "event_count": len(rows),
                    "verified_count": index,
                    "first_invalid_event_id": str(row["id"]),
                    "head_hash": previous_hash,
                }
            previous_hash = expected_hash

        anchor = conn.execute(
            "SELECT value FROM catalog_meta WHERE key = %s",
            (f"audit_head:{component_id}",),
        ).fetchone()
        anchored_head = str(anchor["value"]) if anchor else ""
        if anchored_head != previous_hash:
            return {
                "valid": False,
                "coverage": coverage,
                "reason": "audit_head_mismatch",
                "event_count": len(rows),
                "verified_count": len(rows),
                "first_invalid_event_id": "",
                "head_hash": previous_hash,
                "anchored_head_hash": anchored_head,
            }

        revisions = conn.execute(
            "SELECT id, manifest_hash FROM component_revisions WHERE component_id = %s ORDER BY version",
            (component_id,),
        ).fetchall()
        for revision in revisions:
            revision_id = str(revision["id"])
            expected_manifest = self._revision_kernel.revision_manifest_hash(conn, revision_id)
            if str(revision["manifest_hash"]) != expected_manifest:
                return {
                    "valid": False,
                    "coverage": coverage,
                    "reason": "revision_manifest_mismatch",
                    "event_count": len(rows),
                    "verified_count": len(rows),
                    "first_invalid_event_id": "",
                    "first_invalid_revision_id": revision_id,
                    "head_hash": previous_hash,
                }

        assets = conn.execute(
            """
                SELECT DISTINCT asset.id, asset.canonical_path, asset.sha256
                FROM revision_assets link
                JOIN component_revisions revision ON revision.id = link.revision_id
                JOIN assets asset ON asset.id = link.asset_id
                WHERE revision.component_id = %s
                """,
            (component_id,),
        ).fetchall()
        for asset in assets:
            path = Path(str(asset["canonical_path"]))
            if not path.is_file() or sha256_file(path) != str(asset["sha256"]):
                return {
                    "valid": False,
                    "coverage": coverage,
                    "reason": "asset_content_mismatch",
                    "event_count": len(rows),
                    "verified_count": len(rows),
                    "first_invalid_event_id": "",
                    "first_invalid_asset_id": str(asset["id"]),
                    "head_hash": previous_hash,
                }

        return {
            "valid": True,
            "coverage": coverage,
            "reason": "",
            "event_count": len(rows),
            "verified_count": len(rows),
            "revision_count": len(revisions),
            "asset_count": len(assets),
            "first_invalid_event_id": "",
            "head_hash": previous_hash,
            "anchored_head_hash": anchored_head,
        }

    def list_component_usage(
        self,
        conn: Any,
        component_id: str,
        *,
        include_history: bool = False,
    ) -> list[dict[str, Any]]:
        if not self._revision_kernel.component_row(conn, component_id):
            raise ValueError("Component not found")
        rows = conn.execute(
            """
                SELECT *
                FROM component_usage
                WHERE component_id = %s AND (%s = 1 OR is_current = 1)
                ORDER BY last_seen_at DESC, project_id, source_revision
                """,
            (component_id, 1 if include_history else 0),
        ).fetchall()
        return [
            {
                **dict(row),
                "references": json_loads(row["references_json"], []),
                "details": json_loads(row["details_json"], []),
                "is_current": bool(row["is_current"]),
            }
            for row in rows
        ]

    def list_component_review_decisions(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        if not self._revision_kernel.component_row(conn, component_id):
            raise ValueError("Component not found")
        rows = conn.execute(
            "SELECT * FROM component_review_decisions WHERE component_id = %s ORDER BY created_at DESC, id DESC",
            (component_id,),
        ).fetchall()
        return [
            {
                **dict(row),
                "validation": json_loads(row["validation_json"], {}),
                "policy": json_loads(row["policy_json"], {}),
            }
            for row in rows
        ]

    def list_component_release_records(self, conn: Any, component_id: str) -> list[dict[str, Any]]:
        if not self._revision_kernel.component_row(conn, component_id):
            raise ValueError("Component not found")
        rows = conn.execute(
            "SELECT * FROM component_release_records WHERE component_id = %s ORDER BY created_at DESC, id DESC",
            (component_id,),
        ).fetchall()
        return [
            {
                **dict(row),
                "validation": json_loads(row["validation_json"], {}),
                "policy": json_loads(row["policy_json"], {}),
            }
            for row in rows
        ]


__all__ = ["CatalogComponentHistoryReads"]
