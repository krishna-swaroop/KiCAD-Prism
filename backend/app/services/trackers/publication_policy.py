"""Project publication settings and dispatch policy (TR-23, C4/D7).

Destination changes bump ``destination_generation`` without moving existing links.
Dispatch revalidates role, acknowledgement and connector pause state before any
outbound write is allowed to proceed.
"""

from __future__ import annotations

import json
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional
from urllib.parse import urlparse
from uuid import uuid4

from app.core.config import Settings, settings as default_settings
from app.core.roles import Role, normalize_role, role_meets_minimum
from app.services.trackers.connector_service import ConnectorNotFound, ConnectorService
from app.services.trackers.store import TrackerStore

DEFAULT_LABELS = {
    "base": "prism",
    "severityPrefix": "severity:",
    "classPrefix": "class:",
    "boardPrefix": "board:",
}
DEFAULT_AUTO_MIN_SEVERITY = "minor"
DEFAULT_PROMOTE_MIN_ROLE = "designer"
ALLOWED_PROMOTE_MIN_ROLES = frozenset({"viewer", "designer"})
VISIBILITIES = ("public", "private", "unknown")


def normalize_promote_min_role(value: str | None) -> str | None:
    """Validate PUT ``promoteMinRole`` to CONTRACTS allowlist ``{viewer, designer}``."""

    if value is None:
        return None
    role = normalize_role(value)
    if role not in ALLOWED_PROMOTE_MIN_ROLES:
        allowed = ", ".join(sorted(ALLOWED_PROMOTE_MIN_ROLES))
        raise ValueError(f"promoteMinRole must be one of: {allowed}")
    return role


class ProjectTrackerNotFound(KeyError):
    """No tracker settings row for this project."""


class PublicationDenied(ValueError):
    """Actor or policy blocks publication."""

    def __init__(self, code: str, message: str, *, required_role: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.required_role = required_role


class DispatchPause(Exception):
    """Queued write must wait for acknowledgement or connector recovery."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def _github_repo_path(repo_url: str) -> str | None:
    text = (repo_url or "").strip()
    if not text:
        return None
    if text.startswith("git@github.com:"):
        path = text.split(":", 1)[1]
    else:
        parsed = urlparse(text)
        host = (parsed.hostname or "").casefold()
        if host not in {"github.com", "www.github.com"}:
            return None
        path = parsed.path.lstrip("/")
    path = path.removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", path):
        return None
    return path


class PublicationPolicyService:
    def __init__(
        self,
        *,
        connect: Callable[[], Any] | None = None,
        settings: Settings | None = None,
        connector_service: ConnectorService | None = None,
        workspace_schema: str = "workspace",
    ) -> None:
        self._connect = connect
        self.settings = settings or default_settings
        self.connector_service = connector_service or ConnectorService(settings=self.settings)
        self.workspace_schema = workspace_schema

    @contextmanager
    def connection(self):
        if self._connect is not None:
            with self._connect() as conn:
                yield conn
            return
        from app.services.postgres_database import database

        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            yield conn

    def get_settings(self, project_id: str) -> dict:
        with self.connection() as conn:
            row = self._row(conn, project_id)
            if row is None:
                raise ProjectTrackerNotFound(project_id)
            return self._public_settings(conn, row)

    def get_or_default(self, project_id: str, *, repo_url: str | None = None, connector_id: str | None = None) -> dict:
        with self.connection() as conn:
            row = self._row(conn, project_id)
            if row is not None:
                return self._public_settings(conn, row)
            if not connector_id:
                connectors = conn.execute(
                    "SELECT id FROM tracker_connectors WHERE paused = FALSE ORDER BY created_at ASC LIMIT 1"
                ).fetchall()
                connector_id = str(connectors[0]["id"]) if connectors else None
            if not connector_id:
                raise ProjectTrackerNotFound(project_id)
            container_path = _github_repo_path(repo_url or "") or ""
            remote_id = f"pending:{container_path or project_id}"
            store = TrackerStore(conn)
            visibility = "unknown"
            if container_path:
                # One-time, best-effort: turn the imported remote into the
                # numeric repository id the forge API needs. A failure here
                # only leaves the placeholder for the admin to save later.
                try:
                    observed = self.connector_service.observe_container(
                        connector_id,
                        container_kind="repo",
                        container_path=container_path,
                        remote_container_id=remote_id,
                        generation=1,
                    )
                except Exception:  # noqa: BLE001 - seeding must never fail a read
                    observed = {}
                resolved = str(observed.get("remoteContainerId") or "")
                if resolved.isdigit():
                    remote_id = resolved
                    container_path = str(observed.get("containerPath") or container_path)
                    visibility = str(observed.get("visibility") or "unknown")
            store.set_project_tracker(
                project_tracker_id=f"pt_{uuid4().hex[:12]}",
                project_id=project_id,
                connector_id=connector_id,
                container_kind="repo",
                container_path=container_path,
                remote_container_id=remote_id,
                generation=1,
                visibility=visibility,
            )
            conn.commit()
            row = self._row(conn, project_id)
            return self._public_settings(conn, row)

    def update_settings(
        self,
        project_id: str,
        *,
        actor_user_id: str,
        connector_id: str,
        destination: Mapping[str, Any],
        auto_min_severity: str | None = None,
        auto_task_class: bool | None = None,
        promote_min_role: str | None = None,
        labels: Mapping[str, str] | None = None,
    ) -> dict:
        # Resolve destination visibility before the write transaction so forge
        # I/O is not held under a DB lock (R3-M10).
        with self.connection() as conn:
            current = self._row(conn, project_id)
            generation = int((current or {}).get("destination_generation") or 1)
            connector_changed = current is None or str(current["connector_id"]) != connector_id
            container_changed = current is None or (
                str(current.get("container_path") or "") != str(destination.get("containerPath") or "")
                or str(current.get("remote_container_id") or "") != str(destination.get("remoteContainerId") or "")
            )
            destination_changed = connector_changed or container_changed
            if destination_changed:
                generation = int((current or {}).get("destination_generation") or 0) + 1
            project_tracker_id = str((current or {}).get("id") or f"pt_{uuid4().hex[:12]}")
            conn.rollback()

        observed = self.connector_service.observe_container(
            connector_id,
            container_kind=str(destination.get("containerKind") or "repo"),
            container_path=str(destination.get("containerPath") or ""),
            remote_container_id=str(destination.get("remoteContainerId") or ""),
            generation=generation,
            visibility_hint=str(destination.get("visibility") or "") or None,
        )
        visibility = str(observed.get("visibility") or "unknown")
        promote_min_role = normalize_promote_min_role(promote_min_role)

        with self.connection() as conn:
            current = self._row(conn, project_id)
            live_changed = current is None or (
                str(current["connector_id"]) != connector_id
                or str(current.get("container_path") or "") != str(destination.get("containerPath") or "")
                or str(current.get("remote_container_id") or "") != str(destination.get("remoteContainerId") or "")
            )
            if live_changed and current is not None:
                from app.services.trackers.link_lifecycle import (
                    pause_project_links_on_destination_removal,
                )

                pause_project_links_on_destination_removal(
                    conn,
                    project_id,
                    reason="destination_removed",
                )
            if current is not None:
                project_tracker_id = str(current.get("id") or project_tracker_id)
                if live_changed:
                    generation = max(
                        generation,
                        int(current.get("destination_generation") or 0) + 1,
                    )
            store = TrackerStore(conn)
            store.set_project_tracker(
                project_tracker_id=project_tracker_id,
                project_id=project_id,
                connector_id=connector_id,
                container_kind=str(destination.get("containerKind") or "repo"),
                container_path=str(observed.get("containerPath") or destination.get("containerPath") or ""),
                remote_container_id=str(
                    observed.get("remoteContainerId") or destination.get("remoteContainerId") or ""
                ),
                generation=generation,
                visibility=visibility,
            )
            if (
                auto_min_severity is not None
                or auto_task_class is not None
                or promote_min_role is not None
                or labels is not None
            ):
                conn.execute(
                    """
                    UPDATE project_trackers
                    SET auto_min_severity = COALESCE(%s, auto_min_severity),
                        auto_task_class = COALESCE(%s, auto_task_class),
                        promote_min_role = COALESCE(%s, promote_min_role),
                        labels = COALESCE(%s::jsonb, labels)
                    WHERE project_id = %s
                    """,
                    (
                        auto_min_severity,
                        auto_task_class,
                        promote_min_role,
                        json.dumps(dict(labels)) if labels is not None else None,
                        project_id,
                    ),
                )
            store.audit(
                action="project_tracker.update",
                actor_user_id=actor_user_id,
                project_id=project_id,
                connector_id=connector_id,
                detail={
                    "destinationGeneration": generation,
                    "destinationChanged": destination_changed or live_changed,
                },
            )
            conn.commit()
            row = self._row(conn, project_id)
            return self._public_settings(conn, row)

    def acknowledge(self, project_id: str, *, actor_user_id: str, visibility: str) -> dict:
        if visibility not in VISIBILITIES:
            raise ValueError("invalid visibility")
        with self.connection() as conn:
            row = self._row(conn, project_id)
            if row is None:
                raise ProjectTrackerNotFound(project_id)
            observed = self.connector_service.observe_container(
                str(row["connector_id"]),
                container_kind=str(row.get("container_kind") or "repo"),
                container_path=str(row.get("container_path") or ""),
                remote_container_id=str(row.get("remote_container_id") or ""),
                generation=int(row.get("destination_generation") or 1),
                visibility_hint=visibility,
            )
            observed_visibility = str(observed.get("visibility") or "unknown")
            store = TrackerStore(conn)
            store.acknowledge_destination(
                ack_id=f"ack_{uuid4().hex[:12]}",
                connector_id=str(row["connector_id"]),
                remote_container_id=str(observed.get("remoteContainerId") or row["remote_container_id"]),
                visibility=observed_visibility,
                acknowledged_by=actor_user_id,
            )
            conn.execute(
                """
                UPDATE project_trackers
                SET visibility = %s,
                    container_path = COALESCE(%s, container_path),
                    remote_container_id = COALESCE(%s, remote_container_id)
                WHERE project_id = %s
                """,
                (
                    observed_visibility,
                    observed.get("containerPath"),
                    observed.get("remoteContainerId"),
                    project_id,
                ),
            )
            store.audit(
                action="project_tracker.acknowledge",
                actor_user_id=actor_user_id,
                project_id=project_id,
                connector_id=str(row["connector_id"]),
                detail={"visibility": observed_visibility, "requestedVisibility": visibility},
            )
            conn.commit()
            row = self._row(conn, project_id)
            return self._public_settings(conn, row)

    def evaluate_dispatch(
        self,
        project_id: str,
        *,
        actor_role: Role,
        destination_generation: int | None = None,
    ) -> None:
        """Raise when a write must not be sent for policy or visibility reasons."""

        with self.connection() as conn:
            row = self._row(conn, project_id)
            if row is None:
                raise PublicationDenied("publication_required", "Project tracker destination is not configured")
            promote_min_role = normalize_role(str(row.get("promote_min_role") or DEFAULT_PROMOTE_MIN_ROLE)) or DEFAULT_PROMOTE_MIN_ROLE
            if not role_meets_minimum(actor_role, promote_min_role):
                raise PublicationDenied(
                    "publication_required",
                    f"Sharing to the tracker requires the {promote_min_role} role on this project",
                    required_role=promote_min_role,
                )
            connector_id = str(row["connector_id"])
            try:
                connector = self.connector_service.get(connector_id)
            except ConnectorNotFound:
                raise DispatchPause("connector_missing", "Tracker connector is not available") from None
            if connector.get("paused"):
                raise DispatchPause(
                    str(connector.get("pausedReason") or "paused"),
                    "Tracker connector is paused",
                )
            visibility = str(row.get("visibility") or "unknown")
            if visibility == "unknown":
                raise DispatchPause("visibility_unknown", "Destination visibility is unknown")
            ack = self._ack_row(
                conn,
                connector_id=connector_id,
                remote_container_id=str(row["remote_container_id"]),
                visibility=visibility,
            )
            if visibility == "public" and ack is None:
                raise DispatchPause("visibility", "Public destination acknowledgement is required")
            if destination_generation is not None and int(destination_generation) != int(row["destination_generation"]):
                raise DispatchPause(
                    "destination_generation",
                    "Operation targets an unknown destination generation",
                )

    def _row(self, conn: Any, project_id: str) -> Optional[dict]:
        return conn.execute(
            "SELECT * FROM project_trackers WHERE project_id = %s",
            (project_id,),
        ).fetchone()

    def _ack_row(self, conn: Any, *, connector_id: str, remote_container_id: str, visibility: str) -> Optional[dict]:
        return conn.execute(
            """
            SELECT * FROM destination_acks
            WHERE connector_id = %s AND remote_container_id = %s AND observed_visibility = %s
            """,
            (connector_id, remote_container_id, visibility),
        ).fetchone()

    def _public_settings(self, conn: Any, row: Mapping[str, Any]) -> dict:
        labels = row.get("labels") or {}
        if isinstance(labels, str):
            labels = json.loads(labels)
        visibility = row.get("visibility") or "unknown"
        ack_row = self._ack_row(
            conn,
            connector_id=str(row["connector_id"]),
            remote_container_id=str(row["remote_container_id"]),
            visibility=str(visibility),
        )
        ack = None
        if ack_row:
            acknowledged_at = ack_row.get("acknowledged_at")
            ack = {
                "visibility": str(ack_row["observed_visibility"]),
                "acknowledgedBy": str(ack_row["acknowledged_by"]),
                "acknowledgedAt": acknowledged_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                if isinstance(acknowledged_at, datetime)
                else str(acknowledged_at),
                "valid": str(ack_row["observed_visibility"]) == str(visibility),
            }
        return {
            "projectId": row["project_id"],
            "connectorId": row["connector_id"],
            "destination": {
                "containerKind": row["container_kind"],
                "containerPath": row["container_path"],
                "remoteContainerId": row["remote_container_id"],
                "generation": int(row["destination_generation"]),
                "visibility": visibility,
            },
            "acknowledgement": ack,
            "autoMinSeverity": str(row.get("auto_min_severity") or DEFAULT_AUTO_MIN_SEVERITY),
            "autoTaskClass": bool(row.get("auto_task_class", True)),
            "promoteMinRole": str(row.get("promote_min_role") or DEFAULT_PROMOTE_MIN_ROLE),
            "labels": {
                "base": labels.get("base", DEFAULT_LABELS["base"]),
                "severityPrefix": labels.get("severityPrefix", DEFAULT_LABELS["severityPrefix"]),
                "classPrefix": labels.get("classPrefix", DEFAULT_LABELS["classPrefix"]),
                "boardPrefix": labels.get("boardPrefix", DEFAULT_LABELS["boardPrefix"]),
            },
        }


__all__ = [
    "ALLOWED_PROMOTE_MIN_ROLES",
    "DispatchPause",
    "ProjectTrackerNotFound",
    "PublicationDenied",
    "normalize_promote_min_role",
    "PublicationPolicyService",
]
