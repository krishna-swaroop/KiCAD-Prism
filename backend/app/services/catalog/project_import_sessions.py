from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from app.services.catalog.normalization import json_loads


class CatalogProjectImportSessions:
    def create_session(
        self,
        conn: Any,
        *,
        session_id: str,
        scope: str,
        project_id: str,
        project_ids: list[str],
        project_revisions: dict[str, str],
        source_revision: str,
        selection: dict[str, Any],
        actor: str,
        now: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO project_component_import_sessions (
                id, scope, project_id, project_ids_json, project_revisions_json,
                source_revision, selection_json, status,
                created_by, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'queued', %s, %s, %s)
            """,
            (
                session_id,
                scope,
                project_id,
                json.dumps(sorted(set(project_ids)), separators=(",", ":")),
                json.dumps(project_revisions, sort_keys=True, separators=(",", ":")),
                source_revision,
                json.dumps(selection, sort_keys=True, separators=(",", ":")),
                actor,
                now,
                now,
            ),
        )

    def get_session(self, conn: Any, session_id: str) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM project_component_import_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()
        if not row:
            return None
        payload = dict(row)
        payload["selection"] = json_loads(payload.pop("selection_json"), {})
        payload["project_ids"] = json_loads(payload.pop("project_ids_json"), [])
        payload["project_revisions"] = json_loads(payload.pop("project_revisions_json"), {})
        count = conn.execute(
            "SELECT COUNT(1) AS count FROM project_component_import_proposals WHERE session_id = %s",
            (session_id,),
        ).fetchone()
        payload["proposal_count"] = int(count["count"] if count else 0)
        return payload

    def list_session_ids(
        self,
        conn: Any,
        *,
        created_by: str,
        include_all: bool,
    ) -> list[str]:
        if include_all:
            rows = conn.execute(
                "SELECT id FROM project_component_import_sessions ORDER BY created_at DESC LIMIT 100"
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id FROM project_component_import_sessions
                WHERE created_by = %s ORDER BY created_at DESC LIMIT 100
                """,
                (created_by,),
            ).fetchall()
        return [str(row["id"]) for row in rows]

    def update_session(
        self,
        conn: Any,
        session_id: str,
        *,
        status: str,
        error_message: str,
        now: str,
    ) -> None:
        result = conn.execute(
            "UPDATE project_component_import_sessions SET status = %s, error_message = %s, updated_at = %s WHERE id = %s",
            (status, error_message, now, session_id),
        )
        if result.rowcount == 0:
            raise ValueError("Project import session not found")

    def stage_proposals(
        self,
        conn: Any,
        session_id: str,
        proposals: list[dict[str, Any]],
        *,
        now: str,
    ) -> None:
        if not conn.execute(
            "SELECT 1 FROM project_component_import_sessions WHERE id = %s",
            (session_id,),
        ).fetchone():
            raise ValueError("Project import session not found")
        conn.execute("DELETE FROM project_component_import_proposals WHERE session_id = %s", (session_id,))
        for proposal in proposals:
            conn.execute(
                """
                INSERT INTO project_component_import_proposals (
                    id, session_id, dedupe_key, component_uid, reference, metadata_json, assets_json,
                    provenance_json, findings_json, status, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'candidate', %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    session_id,
                    str(proposal["dedupe_key"]),
                    str(proposal.get("component_uid") or ""),
                    str(proposal.get("reference") or ""),
                    json.dumps(proposal.get("metadata") or {}, sort_keys=True, separators=(",", ":")),
                    json.dumps(proposal.get("assets") or [], sort_keys=True, separators=(",", ":")),
                    json.dumps(proposal.get("provenance") or [], sort_keys=True, separators=(",", ":")),
                    json.dumps(proposal.get("findings") or [], sort_keys=True, separators=(",", ":")),
                    now,
                    now,
                ),
            )
        conn.execute(
            "UPDATE project_component_import_sessions SET status = 'staged', updated_at = %s WHERE id = %s",
            (now, session_id),
        )

    def list_proposals(self, conn: Any, session_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            "SELECT * FROM project_component_import_proposals WHERE session_id = %s ORDER BY reference, id",
            (session_id,),
        ).fetchall()
        return [self._proposal_payload(row) for row in rows]

    def get_proposal(self, conn: Any, proposal_id: str) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM project_component_import_proposals WHERE id = %s",
            (proposal_id,),
        ).fetchone()
        return self._proposal_payload(row) if row else None

    def save_drafts(
        self,
        conn: Any,
        session_id: str,
        drafts: dict[str, dict[str, Any]],
        *,
        now: str,
    ) -> int:
        updated = 0
        for proposal_id, draft in drafts.items():
            cursor = conn.execute(
                """
                UPDATE project_component_import_proposals
                SET draft_json = %s, updated_at = %s
                WHERE id = %s AND session_id = %s AND status = 'candidate'
                """,
                (json.dumps(draft or {}, separators=(",", ":")), now, proposal_id, session_id),
            )
            updated += cursor.rowcount
        return updated

    def reject_proposal(self, conn: Any, proposal_id: str, *, now: str) -> None:
        result = conn.execute(
            """
            UPDATE project_component_import_proposals
            SET status = 'rejected', updated_at = %s
            WHERE id = %s AND status = 'candidate'
            """,
            (now, proposal_id),
        )
        if result.rowcount == 0:
            raise ValueError("Project import proposal was not found or has already been resolved")

    def list_resolved_session_ids(self, conn: Any, *, older_than: str) -> list[str]:
        rows = conn.execute(
            """
            SELECT session.id
            FROM project_component_import_sessions session
            WHERE session.updated_at < %s
              AND NOT EXISTS (
                SELECT 1 FROM project_component_import_proposals proposal
                WHERE proposal.session_id = session.id
                  AND proposal.status IN ('candidate', 'accepting')
              )
            """,
            (older_than,),
        ).fetchall()
        return [str(row["id"]) for row in rows]

    @staticmethod
    def remove_staging_directories(
        *,
        store_root: Path,
        session_ids: list[str],
    ) -> dict[str, Any]:
        removed: list[str] = []
        imports_root = (Path(store_root) / "imports").resolve()
        for session_id in session_ids:
            path = (imports_root / session_id).resolve()
            try:
                path.relative_to(imports_root)
            except ValueError:
                continue
            if path.is_dir():
                shutil.rmtree(path)
                removed.append(session_id)
        return {"removed": len(removed), "session_ids": removed}

    @staticmethod
    def _proposal_payload(row: Any) -> dict[str, Any]:
        proposal = dict(row)
        proposal["metadata"] = json_loads(proposal.pop("metadata_json"), {})
        proposal["assets"] = json_loads(proposal.pop("assets_json"), [])
        proposal["provenance"] = json_loads(proposal.pop("provenance_json"), [])
        proposal["findings"] = json_loads(proposal.pop("findings_json"), [])
        proposal["draft"] = json_loads(proposal.pop("draft_json", "{}"), {})
        return proposal


__all__ = ["CatalogProjectImportSessions"]
