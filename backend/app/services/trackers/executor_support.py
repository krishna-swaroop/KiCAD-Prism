"""Shared outbound executor helpers (R3-M1 / M3 / M4).

Actor-role resolution, DispatchPause → provider-error mapping, connector
auth pause, and helpers for the load → close → I/O → reopen confirm pattern.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from app.core.roles import Role, normalize_role
from app.services.trackers.errors import PROVIDER_ERROR_CLASSES, ProviderError
from app.services.trackers.op_store import OpStore
from app.services.trackers.publication_policy import DispatchPause, PublicationDenied
from app.services.trackers.promotion import evaluate_dispatch

# Local policy pauses (not forge credential loss). Additive to C3 classes.
DISPATCH_PAUSE_ERROR_CLASSES = frozenset(
    {
        "paused",
        "visibility",
        "visibility_unknown",
        "connector_missing",
    }
)

# Retained without consuming attempts; never enter recovery as unknown outcome.
NON_CONSUMING_ERROR_CLASSES = frozenset({"auth_lost", "forbidden"} | DISPATCH_PAUSE_ERROR_CLASSES)


def workspace_schema(conn: Any) -> str:
    row = conn.execute("SHOW search_path").fetchone()
    first = str(row["search_path"]).split(",")[0].strip().strip('"')
    if first and first not in {"$user", "public"}:
        return first
    return "workspace"


def resolve_actor_role(
    conn: Any,
    op: Mapping[str, Any],
    *,
    schema: str | None = None,
) -> Role:
    """Role used for D7 publication re-check at dispatch.

    Prefer a role snapshotted on the op at enqueue. Otherwise resolve from
    ``user_roles`` (by ``user_id``, then email). Missing actors default to
    ``designer`` (legacy system ops). Known but unresolvable actors default to
    ``viewer`` so a raised ``promote_min_role`` can deny.
    """

    snapshotted = normalize_role(str(op.get("actor_role") or "") or None)
    if snapshotted is not None:
        return snapshotted

    actor_user_id = str(op.get("actor_user_id") or "").strip()
    if not actor_user_id:
        # Legacy / system ops without an actor keep prior designer default so
        # visibility and connector pauses remain reachable in D7.
        return "designer"

    schema_candidates: list[str] = []
    if schema:
        schema_candidates.append(schema)
    schema_candidates.append("workspace")
    current = workspace_schema(conn)
    if current not in schema_candidates:
        schema_candidates.append(current)

    saw_missing_schema = False
    for schema_name in schema_candidates:
        try:
            role = _lookup_role_in_schema(conn, schema_name, actor_user_id)
        except _RoleSchemaMissing:
            saw_missing_schema = True
            continue
        if role is not None:
            return role
    if saw_missing_schema:
        # Disposable test schemas often omit identity tables; keep designer so
        # D7 visibility/connector pauses remain observable for enqueued actors.
        return "designer"
    # Known actor_user_id that cannot be resolved: fail closed.
    return "viewer"


def _lookup_role_in_schema(conn: Any, schema_name: str, actor_user_id: str) -> Role | None:
    """Best-effort role lookup. Uses a savepoint so missing tables do not abort the txn.

    Returns the role when found. Returns None when the user is absent. Raises
    ``_RoleSchemaMissing`` when the schema/table is unavailable so callers can
    try the next candidate or fall back.
    """

    sp = f"actor_role_{abs(hash(schema_name)) % 10_000_000}"
    try:
        conn.execute(f"SAVEPOINT {sp}")
        row = conn.execute(
            f'SELECT role FROM "{schema_name}".user_roles WHERE user_id = %s LIMIT 1',
            (actor_user_id,),
        ).fetchone()
        if row is not None:
            conn.execute(f"RELEASE SAVEPOINT {sp}")
            return normalize_role(str(row["role"])) or "viewer"
        user = conn.execute(
            f'SELECT email FROM "{schema_name}".users WHERE user_id = %s LIMIT 1',
            (actor_user_id,),
        ).fetchone()
        if user is not None:
            email = str(user.get("email") or "").strip().lower()
            if email:
                by_email = conn.execute(
                    f'SELECT role FROM "{schema_name}".user_roles WHERE email = %s LIMIT 1',
                    (email,),
                ).fetchone()
                if by_email is not None:
                    conn.execute(f"RELEASE SAVEPOINT {sp}")
                    return normalize_role(str(by_email["role"])) or "viewer"
        conn.execute(f"RELEASE SAVEPOINT {sp}")
        return None
    except Exception as exc:
        try:
            conn.execute(f"ROLLBACK TO SAVEPOINT {sp}")
        except Exception:
            pass
        raise _RoleSchemaMissing(schema_name) from exc


class _RoleSchemaMissing(Exception):
    """Identity tables are unavailable in the candidate schema."""


def provider_error_for_dispatch_pause(exc: DispatchPause) -> ProviderError:
    """Map a policy pause to a non-auth_lost error class (R3-M4)."""

    reason = str(getattr(exc, "reason", None) or "paused")
    if reason == "auth_lost":
        return ProviderError("auth_lost", str(exc), retryable=False)
    if reason == "forbidden":
        return ProviderError("forbidden", str(exc), retryable=False)
    if reason in DISPATCH_PAUSE_ERROR_CLASSES:
        return ProviderError(reason, str(exc), retryable=False)
    if reason in PROVIDER_ERROR_CLASSES:
        return ProviderError(reason, str(exc), retryable=False)
    return ProviderError("paused", str(exc), retryable=False)


def policy_check(
    conn: Any,
    *,
    project_id: str,
    op: Mapping[str, Any],
    destination_generation: int | None = None,
) -> None:
    """D7 send-time revalidation; maps pauses without inventing auth_lost."""

    try:
        evaluate_dispatch(
            conn,
            project_id,
            resolve_actor_role(conn, op),
            workspace_schema=workspace_schema(conn),
        )
    except PublicationDenied as exc:
        raise ProviderError("forbidden", str(exc), retryable=False) from exc
    except DispatchPause as exc:
        raise provider_error_for_dispatch_pause(exc) from exc
    if destination_generation is not None:
        op_gen = int(op.get("destination_generation") or 0)
        if op_gen != int(destination_generation):
            raise ProviderError("invalid_request", "destination generation mismatch", retryable=False)


def pause_connector_auth_lost(conn: Any, connector_id: str, remote_container_id: str) -> None:
    """C5: real credential loss pauses the connector and marks links inaccessible."""

    conn.execute(
        """
        UPDATE tracker_connectors
        SET paused = TRUE,
            paused_reason = 'auth_lost',
            updated_at = NOW()
        WHERE id = %s
        """,
        (connector_id,),
    )
    conn.execute(
        """
        UPDATE tracked_threads
        SET link_state = 'inaccessible',
            paused_reason = 'auth_lost'
        WHERE connector_id = %s
          AND remote_container_id = %s
          AND unlinked_at IS NULL
        """,
        (connector_id, remote_container_id),
    )


def apply_provider_error(
    conn: Any,
    ops: OpStore,
    *,
    op: Mapping[str, Any],
    fence: int,
    exc: ProviderError,
    connector_id: str | None = None,
    remote_container_id: str | None = None,
) -> None:
    """Schedule/fail after I/O. Real auth_lost pauses the connector (R3-M4)."""

    op_id = str(op["id"])
    if str(op.get("state") or "") == "sent" and exc.class_ not in NON_CONSUMING_ERROR_CLASSES:
        ops.enter_recovery(op_id, fence)
        raise exc
    if exc.class_ == "auth_lost" and connector_id and remote_container_id:
        pause_connector_auth_lost(conn, connector_id, remote_container_id)
    if exc.class_ in NON_CONSUMING_ERROR_CLASSES:
        ops.schedule(
            op_id,
            fence,
            next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=15),
            error=exc.to_dto(),
            consume_attempt=False,
        )
        return
    raise exc


__all__ = [
    "DISPATCH_PAUSE_ERROR_CLASSES",
    "NON_CONSUMING_ERROR_CLASSES",
    "apply_provider_error",
    "pause_connector_auth_lost",
    "policy_check",
    "provider_error_for_dispatch_pause",
    "resolve_actor_role",
    "workspace_schema",
]
