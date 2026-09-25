"""Transfer, unlink and re-promotion lineage (TR-34, C4/C5/C7/D7).

Preserves thread/op history across verified transfers, local unlinks and
explicit re-promotion after confirmed remote deletion. Pending operations are
superseded when a link is unlinked or paused for an unapproved transfer so
old URLs and destination overrides cannot misroute later replies.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from app.core.roles import Role
from app.services.trackers.contracts import Moved, RemoteIssue
from app.services.trackers.op_store import LIVE_STATES, OpStore, StaleFence
from app.services.trackers.promotion import (
    PromotionActor,
    PromotionResult,
    _live_thread,
    evaluate_dispatch,
)
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied
from app.services.trackers.store import TrackerStore

REPROMOTABLE_STATES = ("deleted",)
PAUSED_TRANSFER_REASON = "transfer_unapproved"
CROSS_HOST_TRANSFER_REASON = "transfer_cross_host"
# D2: only pending ops may be cancelled locally. sent/recovering/quarantine
# must stay on the recovery path so a successful remote create is never
# discarded blindly after destination change or unlink (R4-M1).
SUPERSEDEABLE_STATES = ("pending",)


@dataclass(frozen=True)
class TransferOutcome:
    action: str
    link_state: str | None = None
    reason: str | None = None
    superseded_ops: tuple[str, ...] = ()


def can_repromote(link_state: str | None) -> bool:
    """Only confirmed remote deletion enables Promote again (D7)."""

    return str(link_state or "") in REPROMOTABLE_STATES


def can_offer_repromote(thread: Mapping[str, Any]) -> bool:
    if thread.get("unlinked_at"):
        return False
    return can_repromote(str(thread.get("link_state") or ""))


def _qual(schema: str, table: str) -> str:
    return f'"{schema}"."{table}"'


def _append_lineage(conn: Any, thread_id: str, entry: Mapping[str, Any]) -> None:
    conn.execute(
        """
        UPDATE tracked_threads
        SET lineage = lineage || %s::jsonb
        WHERE id = %s
        """,
        (json.dumps([dict(entry)]), thread_id),
    )


def _active_create_op(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'create_issue'
          AND state = ANY(%s)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        (thread_id, list(LIVE_STATES)),
    ).fetchone()
    return dict(row) if row else None


def _last_confirmed_create_op(conn: Any, thread_id: str) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT * FROM sync_ops
        WHERE tracked_thread_id = %s
          AND op = 'create_issue'
          AND state = 'confirmed'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (thread_id,),
    ).fetchone()
    return dict(row) if row else None


def _new_op_id() -> str:
    return f"op_{uuid.uuid4().hex[:12]}"


def supersede_live_ops(
    conn: Any,
    thread_id: str,
    *,
    reason: str,
) -> list[str]:
    """Cancel pending work for a thread without deleting audit rows.

    Only ``pending`` ops are superseded (R4-M1 / D2). Ops already
    ``sent`` / ``recovering`` / ``quarantine`` stay for recovery so a
    successful remote write is never discarded locally.
    """

    ops = OpStore(conn)
    superseded: list[str] = []
    for op in ops.list_thread(thread_id):
        if str(op.get("state") or "") not in SUPERSEDEABLE_STATES:
            continue
        try:
            ops.supersede(str(op["id"]), int(op.get("fence") or 0), reason=reason)
            superseded.append(str(op["id"]))
        except StaleFence:
            continue
    if superseded:
        conn.execute(
            "UPDATE tracked_threads SET pending_op_id = NULL WHERE id = %s",
            (thread_id,),
        )
    return superseded


def container_is_acknowledged(
    conn: Any,
    *,
    connector_id: str,
    remote_container_id: str,
    visibility: str,
    workspace_schema: str = "workspace",
) -> bool:
    if visibility not in {"public", "private"}:
        return False
    row = conn.execute(
        f"""
        SELECT 1 FROM {_qual(workspace_schema, "destination_acks")}
        WHERE connector_id = %s
          AND remote_container_id = %s
          AND observed_visibility = %s
        """,
        (connector_id, remote_container_id, visibility),
    ).fetchone()
    return row is not None


def _pause_for_unapproved_transfer(
    conn: Any,
    thread_id: str,
    *,
    reason: str,
    lineage_entry: Mapping[str, Any],
) -> TransferOutcome:
    superseded = supersede_live_ops(conn, thread_id, reason=reason)
    conn.execute(
        """
        UPDATE tracked_threads
        SET link_state = 'transferred',
            paused_reason = %s
        WHERE id = %s
        """,
        (reason, thread_id),
    )
    _append_lineage(conn, thread_id, lineage_entry)
    return TransferOutcome(
        action="paused",
        link_state="transferred",
        reason=reason,
        superseded_ops=tuple(superseded),
    )


def apply_verified_transfer(
    conn: Any,
    thread: Mapping[str, Any],
    issue: RemoteIssue,
    *,
    visibility: str,
    workspace_schema: str = "workspace",
) -> TransferOutcome:
    """Relink on approved same-connector transfer; otherwise pause (D7)."""

    thread_id = str(thread["id"])
    connector_id = str(thread["connector_id"])
    previous_container = str(thread["remote_container_id"])
    new_container = str(issue.container.remoteContainerId)
    if new_container == previous_container:
        return TransferOutcome(action="unchanged", link_state=str(thread.get("link_state") or "linked"))

    if not container_is_acknowledged(
        conn,
        connector_id=connector_id,
        remote_container_id=new_container,
        visibility=visibility,
        workspace_schema=workspace_schema,
    ):
        return _pause_for_unapproved_transfer(
            conn,
            thread_id,
            reason=PAUSED_TRANSFER_REASON,
            lineage_entry={
                "kind": "transfer_paused",
                "fromContainerId": previous_container,
                "toContainerId": new_container,
                "visibility": visibility,
            },
        )

    conn.execute(
        """
        UPDATE tracked_threads
        SET remote_container_id = %s,
            external_id = %s,
            external_number = %s,
            external_url = %s,
            link_state = 'linked',
            paused_reason = NULL,
            remote_state = %s,
            remote_version = %s::jsonb,
            last_verified_at = NOW(),
            container_path = COALESCE(%s, container_path)
        WHERE id = %s
        """,
        (
            new_container,
            str(issue.externalId),
            str(issue.number) if issue.number is not None else None,
            issue.url,
            issue.state,
            json.dumps(dict(issue.version.model_dump())),
            issue.container.path or None,
            thread_id,
        ),
    )
    _append_lineage(
        conn,
        thread_id,
        {
            "kind": "transfer_relinked",
            "fromContainerId": previous_container,
            "toContainerId": new_container,
            "externalId": str(issue.externalId),
            "containerPath": issue.container.path,
        },
    )
    return TransferOutcome(action="relinked", link_state="linked")


def apply_moved_issue(
    conn: Any,
    thread: Mapping[str, Any],
    moved: Moved,
    *,
    fetched_issue: RemoteIssue | None = None,
    visibility: str = "unknown",
    workspace_schema: str = "workspace",
) -> TransferOutcome:
    """Resolve a provider ``Moved`` read into relink or pause."""

    if fetched_issue is not None:
        return apply_verified_transfer(
            conn,
            thread,
            fetched_issue,
            visibility=visibility,
            workspace_schema=workspace_schema,
        )

    thread_id = str(thread["id"])
    new_container = str(moved.new_container_id or "")
    if not new_container:
        return _pause_for_unapproved_transfer(
            conn,
            thread_id,
            reason=PAUSED_TRANSFER_REASON,
            lineage_entry={"kind": "transfer_paused", "newRef": moved.new_ref},
        )
    if moved.new_ref and "/" in moved.new_ref and not container_is_acknowledged(
        conn,
        connector_id=str(thread["connector_id"]),
        remote_container_id=new_container,
        visibility=visibility,
        workspace_schema=workspace_schema,
    ):
        return _pause_for_unapproved_transfer(
            conn,
            thread_id,
            reason=PAUSED_TRANSFER_REASON,
            lineage_entry={
                "kind": "transfer_paused",
                "newRef": moved.new_ref,
                "toContainerId": new_container,
            },
        )
    return TransferOutcome(action="deferred", reason="fetch_required")


def unlink_thread_lifecycle(
    conn: Any,
    thread_id: str,
    *,
    reason: str,
    actor_user_id: str | None = None,
    project_id: str | None = None,
    connector_id: str | None = None,
    workspace_schema: str = "workspace",
) -> dict[str, Any]:
    """Unlink while superseding obsolete ops and retaining lineage/audit."""

    superseded = supersede_live_ops(conn, thread_id, reason=f"unlink:{reason}")
    store = TrackerStore(conn)
    thread = store.unlink_thread(thread_id, reason=reason)
    store.audit(
        action="thread.unlink",
        actor_user_id=actor_user_id,
        connector_id=connector_id,
        project_id=project_id,
        detail={"threadId": thread_id, "reason": reason, "supersededOps": superseded},
    )
    return {"thread": thread, "supersededOps": superseded}


def pause_project_links_on_destination_removal(
    conn: Any,
    project_id: str,
    *,
    reason: str = "destination_removed",
    workspace_schema: str = "workspace",
) -> dict[str, Any]:
    """Retain threads/ops/audit when a project destination is removed or replaced."""

    rows = conn.execute(
        """
        SELECT t.id, t.connector_id
        FROM tracked_threads t
        JOIN comments c ON c.id = t.comment_id
        WHERE c.project_id = %s
          AND t.unlinked_at IS NULL
        ORDER BY t.id ASC
        """,
        (project_id,),
    ).fetchall()
    store = TrackerStore(conn)
    superseded_total: list[str] = []
    for row in rows:
        thread_id = str(row["id"])
        superseded = supersede_live_ops(conn, thread_id, reason=reason)
        superseded_total.extend(superseded)
        conn.execute(
            """
            UPDATE tracked_threads
            SET paused_reason = COALESCE(paused_reason, %s)
            WHERE id = %s
            """,
            (reason, thread_id),
        )
    store.audit(
        action="project_tracker.destination_removed",
        project_id=project_id,
        detail={"threadCount": len(rows), "supersededOps": superseded_total},
    )
    return {"threadCount": len(rows), "supersededOps": superseded_total}


def repromote_deleted_thread(
    conn: Any,
    *,
    project_id: str,
    comment: Mapping[str, Any],
    actor: PromotionActor,
    workspace_schema: str = "workspace",
) -> PromotionResult:
    """Re-promote only from confirmed ``deleted`` with ``lineage_of`` (F8/D7)."""

    comment_id = str(comment["id"])
    thread = _live_thread(conn, comment_id)
    if thread is None:
        return PromotionResult(action="skipped", reason="not_linked")
    thread_id = str(thread["id"])
    active = _active_create_op(conn, thread_id)
    if active is not None:
        return PromotionResult(
            action="existing",
            op_id=str(active["id"]),
            thread_id=thread_id,
            reason="re_promote_pending",
        )

    link_state = str(thread.get("link_state") or "linked")
    if link_state == "inaccessible":
        return PromotionResult(action="denied", reason="inaccessible", code="not_repromotable")
    if link_state == "transferred":
        return PromotionResult(action="denied", reason="transferred", code="not_repromotable")
    if not can_repromote(link_state):
        return PromotionResult(action="denied", reason="not_deleted", code="not_repromotable")

    try:
        evaluate_dispatch(conn, project_id, actor.role, workspace_schema=workspace_schema)
    except PublicationDenied as exc:
        return PromotionResult(action="denied", reason=exc.args[0], code=exc.code)
    except DispatchPause as exc:
        return PromotionResult(action="denied", reason=exc.reason, code=exc.reason)

    predecessor = _last_confirmed_create_op(conn, thread_id)
    lineage_of = str(predecessor["id"]) if predecessor else None
    op_id = _new_op_id()
    generation = int(thread["destination_generation"])
    OpStore(conn).insert(
        op_id=op_id,
        tracked_thread_id=thread_id,
        op="create_issue",
        destination_generation=generation,
        local_revision=int(comment.get("revision") or 1),
        actor_user_id=actor.user_id,
        actor_role=actor.role,
        lineage_of=lineage_of,
    )
    conn.execute(
        """
        UPDATE tracked_threads
        SET external_id = 'pending',
            external_number = NULL,
            external_url = NULL,
            link_state = 'linked',
            paused_reason = NULL,
            pending_op_id = %s
        WHERE id = %s
        """,
        (op_id, thread_id),
    )
    _append_lineage(
        conn,
        thread_id,
        {
            "kind": "re_promote",
            "opId": op_id,
            "lineageOf": lineage_of,
            "destinationGeneration": generation,
        },
    )
    return PromotionResult(action="enqueued", op_id=op_id, thread_id=thread_id)


__all__ = [
    "CROSS_HOST_TRANSFER_REASON",
    "PAUSED_TRANSFER_REASON",
    "REPROMOTABLE_STATES",
    "SUPERSEDEABLE_STATES",
    "TransferOutcome",
    "apply_moved_issue",
    "apply_verified_transfer",
    "can_offer_repromote",
    "can_repromote",
    "container_is_acknowledged",
    "pause_project_links_on_destination_removal",
    "repromote_deleted_thread",
    "supersede_live_ops",
    "unlink_thread_lifecycle",
]
