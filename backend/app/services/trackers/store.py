"""Caller-connection tracker repositories. Returned rows never include envelopes."""

from __future__ import annotations

import json
import logging
from typing import Any, Mapping, Optional

from app.services.trackers.schema import FORBIDDEN_COLUMNS, LINK_STATES

logger = logging.getLogger(__name__)


def issue_number_for_api(thread: Mapping[str, Any]) -> str:
    """GitHub REST issue routes use the repo-scoped number, not the immutable id.

    Prefer ``external_number``. Falling back to ``external_id`` is logged because
    node ids are not issue numbers; callers that hit the fallback after a
    greenfield-only migration-5 backfill may be routing incorrectly.
    """

    number = thread.get("external_number")
    if number not in (None, ""):
        return str(number)
    fallback = str(thread.get("external_id") or "")
    if fallback and fallback not in {"pending"}:
        logger.warning(
            "tracked thread %s missing external_number; falling back to external_id=%s "
            "(unsafe when external_id is a provider node id, not the repo issue number)",
            thread.get("id"),
            fallback,
        )
    return fallback


def resolve_threads_for_issue_ref(
    conn: Any,
    *,
    connector_id: str,
    container_id: str,
    issue_ref: str,
) -> list[dict]:
    """Match a linked thread by immutable id or repo issue number."""

    ref = str(issue_ref or "")
    rows = conn.execute(
        """
        SELECT t.*, c.project_id
        FROM tracked_threads t
        JOIN comments c ON c.id = t.comment_id
        WHERE t.connector_id = %s
          AND t.remote_container_id = %s
          AND t.unlinked_at IS NULL
          AND (
              t.external_id = %s
              OR t.external_number = %s
          )
        ORDER BY t.id ASC
        """,
        (connector_id, container_id, ref, ref),
    ).fetchall()
    return [dict(row) for row in rows]


def _dump(row: Mapping[str, Any] | None, *, hide: tuple[str, ...] = ()) -> Optional[dict]:
    if row is None:
        return None
    leaked = set(row) & FORBIDDEN_COLUMNS
    if leaked:
        raise ValueError(f"owner/repo column leaked: {sorted(leaked)}")
    out = {}
    for key, value in row.items():
        if key in hide:
            continue
        out[key] = value
    return out


class TrackerStore:
    """All methods use the caller connection so they can join a comments transaction."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def upsert_connector(
        self,
        *,
        connector_id: str,
        provider: str,
        instance_kind: str,
        display_name: str = "",
        base_url: str = "",
        credential_envelope: str | None = None,
        bot_forge_user_id: str | None = None,
        bot_login: str | None = None,
    ) -> dict:
        self.conn.execute(
            """
            INSERT INTO tracker_connectors (
                id, provider, instance_kind, display_name, base_url,
                credential_envelope, bot_forge_user_id, bot_login
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                base_url = EXCLUDED.base_url,
                credential_envelope = COALESCE(EXCLUDED.credential_envelope, tracker_connectors.credential_envelope),
                bot_forge_user_id = COALESCE(EXCLUDED.bot_forge_user_id, tracker_connectors.bot_forge_user_id),
                bot_login = COALESCE(EXCLUDED.bot_login, tracker_connectors.bot_login),
                updated_at = NOW()
            """,
            (
                connector_id,
                provider,
                instance_kind,
                display_name,
                base_url,
                credential_envelope,
                bot_forge_user_id,
                bot_login,
            ),
        )
        return self.get_connector(connector_id)

    def get_connector(self, connector_id: str) -> dict:
        row = self.conn.execute(
            "SELECT * FROM tracker_connectors WHERE id = %s",
            (connector_id,),
        ).fetchone()
        payload = _dump(row, hide=("credential_envelope",))
        if payload is None:
            raise KeyError(connector_id)
        payload["credentialConfigured"] = bool(row.get("credential_envelope"))
        return payload

    def link_identity(
        self,
        *,
        identity_id: str,
        user_id: str,
        connector_id: str,
        provider: str,
        forge_user_id: str,
        forge_login: str,
        token_envelope: str | None = None,
        scopes: list | None = None,
        status: str = "active",
    ) -> dict:
        self.conn.execute(
            """
            INSERT INTO user_identities (
                id, user_id, connector_id, provider, forge_user_id, forge_login,
                token_envelope, scopes, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            """,
            (
                identity_id,
                user_id,
                connector_id,
                provider,
                forge_user_id,
                forge_login,
                token_envelope,
                json.dumps(scopes or []),
                status,
            ),
        )
        row = self.conn.execute(
            "SELECT * FROM user_identities WHERE id = %s", (identity_id,)
        ).fetchone()
        payload = _dump(row, hide=("token_envelope",))
        payload["tokenConfigured"] = bool(row.get("token_envelope"))
        return payload

    def set_project_tracker(
        self,
        *,
        project_tracker_id: str,
        project_id: str,
        connector_id: str,
        container_kind: str,
        container_path: str,
        remote_container_id: str,
        generation: int,
        visibility: str | None = None,
    ) -> dict:
        self.conn.execute(
            """
            INSERT INTO project_trackers (
                id, project_id, connector_id, container_kind, container_path,
                remote_container_id, destination_generation, visibility
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (project_id) DO UPDATE SET
                connector_id = EXCLUDED.connector_id,
                container_kind = EXCLUDED.container_kind,
                container_path = EXCLUDED.container_path,
                remote_container_id = EXCLUDED.remote_container_id,
                destination_generation = EXCLUDED.destination_generation,
                visibility = EXCLUDED.visibility
            """,
            (
                project_tracker_id,
                project_id,
                connector_id,
                container_kind,
                container_path,
                remote_container_id,
                generation,
                visibility,
            ),
        )
        return _dump(
            self.conn.execute(
                "SELECT * FROM project_trackers WHERE project_id = %s", (project_id,)
            ).fetchone()
        )

    def acknowledge_destination(
        self,
        *,
        ack_id: str,
        connector_id: str,
        remote_container_id: str,
        visibility: str,
        acknowledged_by: str,
    ) -> dict:
        self.conn.execute(
            """
            INSERT INTO destination_acks (
                id, connector_id, remote_container_id, observed_visibility, acknowledged_by
            ) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (connector_id, remote_container_id, observed_visibility) DO NOTHING
            """,
            (ack_id, connector_id, remote_container_id, visibility, acknowledged_by),
        )
        return _dump(
            self.conn.execute(
                """
                SELECT * FROM destination_acks
                WHERE connector_id = %s AND remote_container_id = %s
                  AND observed_visibility = %s
                """,
                (connector_id, remote_container_id, visibility),
            ).fetchone()
        )

    def insert_thread(
        self,
        *,
        thread_id: str,
        comment_id: str,
        project_tracker_id: str,
        destination_generation: int,
        connector_id: str,
        remote_container_id: str,
        external_id: str,
        external_number: str | None = None,
        external_url: str | None = None,
        link_state: str = "linked",
        lineage: list | None = None,
        container_path: str | None = None,
    ) -> dict:
        if link_state not in LINK_STATES:
            raise ValueError(f"unknown link_state: {link_state}")
        path = (container_path or "").strip() or None
        if path is None:
            row = self.conn.execute(
                "SELECT container_path FROM project_trackers WHERE id = %s",
                (project_tracker_id,),
            ).fetchone()
            if row and row.get("container_path"):
                path = str(row["container_path"])
        self.conn.execute(
            """
            INSERT INTO tracked_threads (
                id, comment_id, project_tracker_id, destination_generation,
                connector_id, remote_container_id, container_path, external_id,
                external_number, external_url, link_state, lineage
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                thread_id,
                comment_id,
                project_tracker_id,
                destination_generation,
                connector_id,
                remote_container_id,
                path,
                str(external_id),
                str(external_number) if external_number not in (None, "") else None,
                external_url,
                link_state,
                json.dumps(lineage or []),
            ),
        )
        return _dump(
            self.conn.execute(
                "SELECT * FROM tracked_threads WHERE id = %s", (thread_id,)
            ).fetchone()
        )

    def unlink_thread(self, thread_id: str, *, reason: str) -> dict:
        self.conn.execute(
            """
            UPDATE tracked_threads
            SET unlinked_at = NOW(),
                lineage = lineage || %s::jsonb
            WHERE id = %s AND unlinked_at IS NULL
            """,
            (json.dumps([{"reason": reason}]), thread_id),
        )
        return _dump(
            self.conn.execute(
                "SELECT * FROM tracked_threads WHERE id = %s", (thread_id,)
            ).fetchone()
        )

    def insert_reply_link(
        self,
        *,
        link_id: str,
        tracked_thread_id: str,
        reply_id: str,
        external_comment_id: str,
        remote_author_id: str | None = None,
        remote_author_login: str | None = None,
    ) -> dict:
        self.conn.execute(
            """
            INSERT INTO tracked_replies (
                id, tracked_thread_id, reply_id, external_comment_id,
                remote_author_id, remote_author_login
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                link_id,
                tracked_thread_id,
                reply_id,
                external_comment_id,
                remote_author_id,
                remote_author_login,
            ),
        )
        return _dump(
            self.conn.execute(
                "SELECT * FROM tracked_replies WHERE id = %s", (link_id,)
            ).fetchone()
        )

    def audit(
        self,
        *,
        action: str,
        actor_user_id: str | None = None,
        connector_id: str | None = None,
        project_id: str | None = None,
        detail: Mapping[str, Any] | None = None,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO tracker_audit (actor_user_id, action, connector_id, project_id, detail)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            """,
            (
                actor_user_id,
                action,
                connector_id,
                project_id,
                json.dumps(dict(detail or {})),
            ),
        )
