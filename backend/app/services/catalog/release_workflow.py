"""Workflow transitions, release gates, and component retirement.

Release is fail-closed: every gate that cannot be proven satisfied raises
before any row changes. Review decisions and release records are written once
per transition and never rewritten. Nothing here commits.
"""

from __future__ import annotations

import json
from typing import Any
import uuid

from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.component_read_models import (
    VALIDATION_STATUS_FAILED,
    VALIDATION_STATUS_NOT_RUN,
    VALIDATION_STATUS_SKIPPED,
    CatalogComponentReadModels,
)
from app.services.catalog.klc_validation import CatalogKlcValidation
from app.services.catalog.locking import CatalogLockOperations
from app.services.catalog.metadata_normalization import IDENTITY_KIND_MPN
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.revision_finalization import CatalogRevisionFinalizer
from app.services.catalog.revision_kernel import (
    WORKFLOW_STAGES,
    CatalogRevisionKernel,
    normalize_workflow_stage,
)
from app.services.catalog.runtime import CatalogRuntime


WORKFLOW_TRANSITIONS: dict[str, frozenset[str]] = {
    "open": frozenset({"in_progress", "archived"}),
    "in_progress": frozenset({"qa_review", "open", "archived"}),
    "qa_review": frozenset({"done", "in_progress", "archived"}),
    "done": frozenset({"released", "qa_review", "archived"}),
    "released": frozenset({"archived", "open"}),
    "archived": frozenset({"open"}),
}

_RELEASE_BLOCKING_VALIDATION = frozenset(
    {VALIDATION_STATUS_FAILED, VALIDATION_STATUS_SKIPPED, VALIDATION_STATUS_NOT_RUN}
)


def _compact_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def review_decision_for(
    current_status: str,
    release_status: str,
    *,
    self_approval_override: bool,
) -> str:
    """Name the review decision a transition records, or ``""`` for none."""
    if current_status == "qa_review" and release_status == "done":
        return "emergency_override" if self_approval_override else "approved"
    if current_status == "qa_review" and release_status == "in_progress":
        return "changes_requested"
    if current_status == "done" and release_status == "released":
        return "released"
    if release_status == "archived":
        return "archived"
    return ""


class CatalogReleaseWorkflow:
    """Move a component's current revision between workflow stages."""

    def __init__(
        self,
        catalog_locks: CatalogLockOperations,
        revision_kernel: CatalogRevisionKernel,
        read_models: CatalogComponentReadModels,
        finalizer: CatalogRevisionFinalizer,
        klc: CatalogKlcValidation,
    ) -> None:
        self._catalog_locks = catalog_locks
        self._revision_kernel = revision_kernel
        self._read_models = read_models
        self._finalizer = finalizer
        self._klc = klc

    def set_release_status(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        release_status: str,
        *,
        actor: str = "",
        self_approval_override_reason: str = "",
        review_note: str = "",
        actor_role: str = "",
        expected_revision_id: str = "",
        expected_manifest_hash: str = "",
    ) -> None:
        release_status = normalize_workflow_stage(release_status)
        if release_status not in WORKFLOW_STAGES:
            raise ValueError("Unsupported release status")
        self._catalog_locks.lock_component_for_mutation(conn, component_id)
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            raise ValueError("Component not found")
        revision = self._revision_kernel.revision_row(conn, str(component["current_revision_id"]))
        if not revision:
            raise ValueError("Component revision not found")
        if expected_revision_id and str(revision["id"]) != expected_revision_id:
            raise CatalogConflict("Component revision conflict: refresh the component before changing workflow")
        if expected_manifest_hash and str(revision.get("manifest_hash") or "") != expected_manifest_hash:
            raise ValueError("Component manifest conflict: refresh the component before changing workflow")
        current_status = normalize_workflow_stage(str(revision["release_status"]))
        if current_status == "released" and release_status == "open":
            revision = self._open_draft_from_release(conn, runtime, component_id, actor)
            current_status = normalize_workflow_stage(str(revision["release_status"]))

        if release_status != current_status and release_status not in WORKFLOW_TRANSITIONS.get(
            current_status, frozenset()
        ):
            raise ValueError(f"Cannot transition revision from {current_status} to {release_status}")
        if actor and current_status == "qa_review" and release_status == "in_progress" and not review_note.strip():
            raise ValueError("A review note is required when requesting changes")
        if (
            actor
            and release_status == "done"
            and str(revision.get("created_by") or "").casefold() == actor.casefold()
            and not self_approval_override_reason.strip()
        ):
            raise ValueError("Two-person approval required: revision authors cannot approve their own revision")
        if (
            release_status in {"done", "released"}
            and str(component.get("identity_kind") or IDENTITY_KIND_MPN) != IDENTITY_KIND_MPN
        ):
            raise ValueError("Provisional components require a manufacturer part number before approval or release")

        revision_id = str(revision["id"])
        manifest_hash = str(revision.get("manifest_hash") or "")
        assets = self._revision_kernel.load_assets_for_revision(conn, revision["id"])
        validation = self._read_models.component_validation_summary(conn, revision_id, assets)
        policy_snapshot = {
            "two_person_approval": True,
            "klc_release_gate": self._klc.release_gate(),
        }
        if release_status == "released":
            self._assert_release_allowed(conn, revision_id, validation)

        approval_decision = None
        if release_status == "released":
            approval_decision = conn.execute(
                """
                SELECT *
                FROM component_review_decisions
                WHERE component_id = %s AND revision_id = %s AND manifest_hash = %s
                  AND decision IN ('approved', 'emergency_override')
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (component_id, revision_id, manifest_hash),
            ).fetchone()
            if actor and not approval_decision:
                raise ValueError("Cannot release component without approval evidence for this exact revision")

        now = utc_now_iso()
        conn.execute(
            "UPDATE component_revisions SET release_status = %s, updated_at = %s WHERE id = %s",
            (release_status, now, revision["id"]),
        )
        if release_status == "released":
            conn.execute(
                "UPDATE components SET released_revision_id = %s, updated_at = %s WHERE id = %s",
                (revision["id"], now, component_id),
            )
        elif release_status == "archived" and str(component.get("released_revision_id") or "") == revision_id:
            conn.execute(
                "UPDATE components SET released_revision_id = '', updated_at = %s WHERE id = %s",
                (now, component_id),
            )
        else:
            conn.execute("UPDATE components SET updated_at = %s WHERE id = %s", (now, component_id))
        if release_status == current_status:
            return

        decision = review_decision_for(
            current_status,
            release_status,
            self_approval_override=bool(self_approval_override_reason.strip()),
        )
        if decision:
            conn.execute(
                """
                INSERT INTO component_review_decisions (
                    id, component_id, revision_id, reviewer, reviewer_role, decision, note,
                    manifest_hash, validation_json, policy_json, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    component_id,
                    revision_id,
                    actor,
                    actor_role,
                    decision,
                    self_approval_override_reason.strip() or review_note.strip(),
                    manifest_hash,
                    _compact_json(validation),
                    _compact_json(policy_snapshot),
                    now,
                ),
            )
        if release_status == "released":
            conn.execute(
                """
                INSERT INTO component_release_records (
                    id, component_id, revision_id, release_label, manifest_hash, released_by,
                    approval_decision_id, validation_json, policy_json, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT(component_id, revision_id, manifest_hash) DO NOTHING
                """,
                (
                    str(uuid.uuid4()),
                    component_id,
                    revision_id,
                    f"r{int(revision['version'])}",
                    manifest_hash,
                    actor,
                    str(approval_decision["id"]) if approval_decision else "",
                    _compact_json(validation),
                    _compact_json(policy_snapshot),
                    now,
                ),
            )
        self._revision_kernel.append_audit_event(
            conn,
            component_id=component_id,
            revision_id=revision_id,
            event_type="workflow.transitioned",
            actor=actor,
            details={
                "from": current_status,
                "to": release_status,
                "self_approval_override_reason": self_approval_override_reason.strip(),
                "review_note": review_note.strip(),
            },
        )

    def _open_draft_from_release(
        self,
        conn: Any,
        runtime: CatalogRuntime,
        component_id: str,
        actor: str,
    ) -> dict[str, Any]:
        """Reopening a released revision clones it; the release itself is immutable."""
        summary = "Create draft from released revision"
        revision = self._revision_kernel.clone_revision(
            conn,
            component_id,
            actor=actor,
            change_kind="new_draft",
            change_summary=summary,
        )
        self._finalizer.finalize_revision(
            conn,
            runtime,
            component_id=component_id,
            revision_id=str(revision["id"]),
            event_type="revision.created",
            actor=actor,
            details={"change_kind": "new_draft", "change_summary": summary},
        )
        return self._revision_kernel.revision_row(conn, str(revision["id"])) or revision

    def _assert_release_allowed(self, conn: Any, revision_id: str, validation: dict[str, Any]) -> None:
        default_representation = conn.execute(
            """
            SELECT symbol_asset_id, footprint_asset_id
            FROM revision_representations
            WHERE revision_id = %s AND is_default = 1
            LIMIT 1
            """,
            (revision_id,),
        ).fetchone()
        if (
            not default_representation
            or not default_representation["symbol_asset_id"]
            or not default_representation["footprint_asset_id"]
        ):
            raise ValueError("Cannot release component without one complete default representation")
        if self._klc.release_gate() == "block" and validation["status"] in _RELEASE_BLOCKING_VALIDATION:
            raise ValueError("Cannot release component until required symbol and footprint assets pass KLC validation")

    def deactivate_component(
        self,
        conn: Any,
        component_id: str,
        *,
        actor: str = "",
        reason: str = "",
    ) -> bool:
        """Tombstone a component; identity and evidence are never hard-deleted."""
        component = self._revision_kernel.component_row(conn, component_id)
        if not component:
            return False
        if not bool(component["is_active"]):
            return True
        result = conn.execute(
            "UPDATE components SET is_active = 0, updated_at = %s WHERE id = %s",
            (utc_now_iso(), component_id),
        )
        self._revision_kernel.append_audit_event(
            conn,
            component_id=component_id,
            revision_id=str(component.get("current_revision_id") or ""),
            event_type="component.retired",
            actor=actor,
            details={"reason": reason.strip() or "Removed from the active component catalog"},
        )
        return result.rowcount > 0


__all__ = ["CatalogReleaseWorkflow", "WORKFLOW_TRANSITIONS", "review_decision_for"]
