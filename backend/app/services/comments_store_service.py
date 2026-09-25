"""
Comments storage service.

Design:
- PostgreSQL is the single source of truth for comments/replies.
- Per-project isolation is enforced via project_id on every row.
- Existing .comments/comments.json is imported once per project on first access.
- comments.json is exported from DB when users press "Push Comments".
- Authorship is a stable actor key (``author_user_id``/``author_kind``) with the
  display text kept beside it; rows written before that existed are ``legacy``
  and have no owner. Edits advance ``revision`` and append to
  ``comment_revisions``; deletes are tombstones. Reads only return live rows.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from contextlib import contextmanager
from typing import Dict, List, Optional, Tuple

from app.services import comment_live_events, comments_revisions, comments_schema_migrations, project_service
from app.services.comments_revisions import Editor, RevisionConflict  # noqa: F401  (re-exported for callers)
from app.services.comments_store_codec import (
    ANCHOR_STATE_PINNED,
    ANCHOR_STATE_UNPINNED,
    AUTHOR_KIND_LEGACY,
    AUTHOR_KIND_USER,
    COMMENT_CLASSES,
    COMMENT_SEVERITIES,
    COMMENTS_META,
    DEFAULT_COMMENT_CLASS,
    DEFAULT_COMMENT_SEVERITY,
    _COMMENT_COLUMNS,
    _REPLY_COLUMNS,
    _SYSTEM_EDITOR,
    _anchor_already_pinned,
    _mentions_from_content,
    _normalize_comment_class,
    _normalize_mentions,
    _normalize_severity,
    _optional_str,
    _parse_area_bounds,
    _row_to_comment_dict,
    _row_to_reply_dict,
    _utc_now_iso,
    get_project_comments_json_path,
    import_comments_payload,
)
from app.services.comments_store_retry import _retry_on_deadlock
from app.services.comments_store_schema import create_base_tables
from app.services.postgres_database import database
from app.services.trackers.promotion import (
    PromotionActor,
    _live_thread,
    after_root_severity_change,
    evaluate_dispatch,
    manual_promote_root,
    maybe_auto_promote_root,
)
from app.services.trackers.projections import attach_tracker_projection, attach_tracker_projections
from app.services.trackers.publication_policy import DispatchPause
from app.services.trackers.reply_mutations import (
    after_reply_added,
    after_reply_deleted,
    after_reply_edited,
)
from app.services.trackers.reply_mutations import share_reply as enqueue_share_reply
from app.services.trackers.state_mutations import enqueue_set_state
from app.services.trackers.thread_mutations import after_root_content_edited, after_root_deleted


class CommentsStoreService:
    """PostgreSQL-backed comments service."""

    # Tests point a subclass at a disposable schema; production is "comments".
    schema = "comments"
    workspace_schema = "workspace"

    def __init__(self) -> None:
        self._init_lock = threading.Lock()
        self._initialized = False

    def initialize(self) -> None:
        """Create DB schema if missing."""
        if self._initialized:
            return

        with self._init_lock:
            if self._initialized:
                return

            with self._connect() as conn:
                conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-schema",))
                conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{self.schema}"')
                conn.execute(f'SET search_path TO "{self.schema}", public')
                create_base_tables(conn)
                comments_schema_migrations.apply_comments_migrations(conn)
                conn.commit()

            self._initialized = True

    @contextmanager
    def _connect(self):
        with database.connection() as conn:
            # Tracker projections and outbound hooks read workspace tables
            # (connectors, project destinations) through this connection.
            conn.execute(f'SET search_path TO "{self.schema}", "{self.workspace_schema}", public')
            yield conn

    def _bootstrap_project_if_needed(self, conn, project_id: str, project_path: str) -> None:
        conn.execute(
            """
            INSERT INTO project_comment_state(project_id, imported_from_json)
            VALUES(%s, FALSE)
            ON CONFLICT (project_id) DO NOTHING
            """,
            (project_id,),
        )

        state_row = conn.execute(
            "SELECT imported_from_json FROM project_comment_state WHERE project_id = %s",
            (project_id,),
        ).fetchone()

        imported = bool(state_row["imported_from_json"]) if state_row else False
        if imported:
            return

        existing_count = conn.execute(
            "SELECT COUNT(1) AS count FROM comments WHERE project_id = %s",
            (project_id,),
        ).fetchone()["count"]

        if existing_count == 0:
            payload = self._read_comments_json(project_path)
            if payload:
                import_comments_payload(conn, project_id, payload)

        conn.execute(
            """
            UPDATE project_comment_state
            SET imported_from_json = TRUE,
                imported_at = %s
            WHERE project_id = %s
            """,
            (_utc_now_iso(), project_id),
        )

    def _read_comments_json(self, project_path: str) -> Optional[Dict]:
        comments_path = get_project_comments_json_path(project_path)
        if not os.path.exists(comments_path):
            return None

        try:
            with open(comments_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return None

        if not isinstance(payload, dict):
            return None

        comments = payload.get("comments")
        if not isinstance(comments, list):
            return None

        return payload

    def _build_snapshot(self, conn, project_id: str) -> Dict:
        # Read the cursor before the rows. Under READ COMMITTED a concurrent
        # commit after this read is then replayable, never silently skipped.
        cursor = comment_live_events.current_cursor(conn, project_id)
        comment_rows = conn.execute(
            f"""
            SELECT {_COMMENT_COLUMNS}
            FROM comments
            WHERE project_id = %s AND scope <> 'comparison' AND deleted_at IS NULL
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

        reply_rows = conn.execute(
            f"""
            SELECT {_REPLY_COLUMNS}
            FROM comment_replies
            WHERE project_id = %s AND deleted_at IS NULL
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

        replies_by_comment: Dict[str, List[Dict]] = {}

        for row in reply_rows:
            replies_by_comment.setdefault(row["comment_id"], []).append(_row_to_reply_dict(row))

        comments: List[Dict] = [
            _row_to_comment_dict(row, replies_by_comment.get(row["id"], []))
            for row in comment_rows
        ]
        attach_tracker_projections(conn, project_id, comments, workspace_schema=self.workspace_schema)

        return {
            "meta": dict(COMMENTS_META),
            "comments": comments,
            "cursor": cursor,
        }

    def _get_comment_with_replies(
        self,
        conn,
        project_id: str,
        comment_id: str,
        *,
        unsynced_reply_ids: Optional[set[str]] = None,
    ) -> Optional[Dict]:
        row = conn.execute(
            f"""
            SELECT {_COMMENT_COLUMNS}
            FROM comments
            WHERE project_id = %s AND id = %s AND deleted_at IS NULL
            """,
            (project_id, comment_id),
        ).fetchone()

        if not row:
            return None

        reply_rows = conn.execute(
            f"""
            SELECT {_REPLY_COLUMNS}
            FROM comment_replies
            WHERE project_id = %s AND comment_id = %s AND deleted_at IS NULL
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id, comment_id),
        ).fetchall()

        comment = _row_to_comment_dict(row, [_row_to_reply_dict(reply) for reply in reply_rows])
        attach_tracker_projection(
            conn, project_id, comment,
            workspace_schema=self.workspace_schema, unsynced_reply_ids=unsynced_reply_ids,
        )
        return comment

    def get_comments_file(self, project_id: str, project_path: str) -> Dict:
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                return self._build_snapshot(conn, project_id)

    @_retry_on_deadlock
    def create_comment(
        self,
        project_id: str,
        project_path: str,
        context: str,
        location: Dict,
        content: str,
        author: str,
        element_id: Optional[str] = None,
        element_ref: Optional[str] = None,
        element_type: Optional[str] = None,
        comment_class: Optional[str] = None,
        severity: Optional[str] = None,
        mentions: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
        scope: str = "canvas",
        base_commit: Optional[str] = None,
        compare_commit: Optional[str] = None,
        comparison_domain: Optional[str] = None,
        file_path: Optional[str] = None,
        semantic_item_id: Optional[str] = None,
        anchor_kind: Optional[str] = None,
        author_user_id: Optional[str] = None,
        author_kind: Optional[str] = None,
        anchor_commit: Optional[str] = None,
        anchor_revision_key: Optional[str] = None,
        anchor_source: Optional[str] = None,
        selected_side: Optional[str] = None,
        project_relative_path: Optional[str] = None,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Dict:
        """Insert a root comment at revision 1 and record its creation.

        ``author`` is the display text. Ownership comes only from
        ``author_user_id``; without one the row is ``legacy`` and has no
        owner, which is how pre-identity callers keep working. The anchor
        is ``pinned`` only when the caller supplies a validated commit;
        nothing here infers one.
        """
        self.initialize()
        context_norm = context.upper()
        timestamp = _utc_now_iso()
        author_user_id = _optional_str(author_user_id)
        author_kind_norm = _optional_str(author_kind) or (AUTHOR_KIND_USER if author_user_id else AUTHOR_KIND_LEGACY)
        anchor_commit = _optional_str(anchor_commit)
        selected_side = _optional_str(selected_side)
        project_relative_path = _optional_str(project_relative_path)
        has_comparison_pair = bool(_optional_str(base_commit) and _optional_str(compare_commit))
        anchor_state = ANCHOR_STATE_PINNED if (anchor_commit or has_comparison_pair) else ANCHOR_STATE_UNPINNED
        area = _parse_area_bounds(location.get("bounds"))
        class_norm = _normalize_comment_class(comment_class)
        severity_norm = _normalize_severity(severity)
        mentions_norm = _normalize_mentions(mentions)
        if not mentions_norm:
            mentions_norm = _mentions_from_content(content)
        metadata_norm = metadata if isinstance(metadata, dict) else {}

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                comment_id = f"c_{uuid.uuid4().hex[:8]}"
                conn.execute(
                    """
                    INSERT INTO comments(
                        id, project_id, author, timestamp, status, context,
                        location_x, location_y, location_layer, location_page, content,
                        area_x, area_y, area_w, area_h,
                        element_id, element_ref, element_type,
                        comment_class, severity, mentions, metadata,
                        scope, base_commit, compare_commit, comparison_domain,
                        file_path, semantic_item_id, anchor_kind,
                        author_user_id, author_kind, revision, updated_at,
                        anchor_commit, anchor_revision_key, anchor_source, anchor_state,
                        selected_side, project_relative_path
                    )
                    VALUES(
                        %s, %s, %s, %s, 'OPEN', %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb,
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, 1, %s,
                        %s, %s, %s, %s,
                        %s, %s
                    )
                    """,
                    (
                        comment_id,
                        project_id,
                        author,
                        timestamp,
                        context_norm,
                        float(location.get("x", 0.0)),
                        float(location.get("y", 0.0)),
                        str(location.get("layer", "")),
                        str(location.get("page", "")),
                        content,
                        area[0] if area else None,
                        area[1] if area else None,
                        area[2] if area else None,
                        area[3] if area else None,
                        _optional_str(element_id),
                        _optional_str(element_ref),
                        _optional_str(element_type),
                        class_norm,
                        severity_norm,
                        json.dumps(mentions_norm),
                        json.dumps(metadata_norm),
                        scope,
                        _optional_str(base_commit),
                        _optional_str(compare_commit),
                        _optional_str(comparison_domain),
                        _optional_str(file_path),
                        _optional_str(semantic_item_id),
                        _optional_str(anchor_kind),
                        author_user_id,
                        author_kind_norm,
                        timestamp,
                        anchor_commit,
                        _optional_str(anchor_revision_key),
                        _optional_str(anchor_source),
                        anchor_state,
                        selected_side,
                        project_relative_path,
                    ),
                )
                comments_revisions.record_revision(
                    conn, project_id=project_id, target_kind=comments_revisions.ROOT, target_id=comment_id,
                    revision=1, change_kind=comments_revisions.CHANGE_CREATE,
                    editor=Editor(user_id=author_user_id, kind=author_kind_norm, display=author),
                    content=content, severity=severity_norm, comment_class=class_norm, mentions=mentions_norm,
                )

                created = self._get_comment_with_replies(conn, project_id, comment_id)
                if not created:
                    raise RuntimeError("Failed to fetch created comment.")

                if promotion_actor is not None:
                    outcome = maybe_auto_promote_root(
                        conn, project_id=project_id, comment=created, actor=promotion_actor,
                        workspace_schema=self.workspace_schema,
                    )
                    created = self._get_comment_with_replies(conn, project_id, comment_id)
                    if not created:
                        raise RuntimeError("Failed to fetch created comment.")
                    if outcome.action == "denied" and outcome.code:
                        created.setdefault("tracker", {}).setdefault("notPromotableReason", outcome.code)

                return created

    def get_comparison_comments(
        self,
        project_id: str,
        project_path: str,
        base_commit: str,
        compare_commit: str,
        comparison_domain: Optional[str] = None,
    ) -> Dict:
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                cursor = comment_live_events.current_cursor(conn, project_id)
                query = f"""
                    SELECT {_COMMENT_COLUMNS}
                    FROM comments
                    WHERE project_id = %s
                      AND scope = 'comparison'
                      AND deleted_at IS NULL
                      AND base_commit = %s
                      AND compare_commit = %s
                """
                params: List[object] = [project_id, base_commit, compare_commit]
                if comparison_domain:
                    query += " AND comparison_domain = %s"
                    params.append(comparison_domain)
                query += " ORDER BY timestamp ASC, id ASC"
                rows = conn.execute(query, tuple(params)).fetchall()
                comment_ids = [row["id"] for row in rows]
                replies_by_comment: Dict[str, List[Dict]] = {}
                if comment_ids:
                    reply_rows = conn.execute(
                        f"""
                        SELECT {_REPLY_COLUMNS}
                        FROM comment_replies
                        WHERE project_id = %s AND comment_id = ANY(%s) AND deleted_at IS NULL
                        ORDER BY timestamp ASC, id ASC
                        """,
                        (project_id, comment_ids),
                    ).fetchall()
                    for reply in reply_rows:
                        replies_by_comment.setdefault(reply["comment_id"], []).append(_row_to_reply_dict(reply))
                return {
                    "meta": dict(COMMENTS_META),
                    "cursor": cursor,
                    "comments": [
                        _row_to_comment_dict(row, replies_by_comment.get(row["id"], []))
                        for row in rows
                    ],
                }

    def _authorize_linked_status(self, conn, project_id: str, comment_id: str, actor: PromotionActor) -> None:
        """A role below the project's promote role may not move a linked thread.

        A paused connector only means no ``set_state`` op is queued; the local
        status still changes.
        """
        thread = _live_thread(conn, comment_id)
        if thread is None or str(thread.get("external_id") or "") in ("", "pending"):
            return
        try:
            evaluate_dispatch(conn, project_id, actor.role, workspace_schema=self.workspace_schema)
        except DispatchPause:
            pass

    def _enqueue_status(self, conn, project_id: str, comment_id: str, actor: PromotionActor) -> Optional[Dict]:
        updated = self._get_comment_with_replies(conn, project_id, comment_id)
        if updated is not None:
            enqueue_set_state(
                conn, project_id=project_id, comment_id=comment_id, actor=actor,
                local_revision=int(updated.get("revision") or 1),
                workspace_schema=self.workspace_schema,
            )
            updated = self._get_comment_with_replies(conn, project_id, comment_id)
        return updated

    def _after_root_edit(
        self, conn, project_id: str, comment_id: str, actor: PromotionActor,
        *, previous_severity: str, severity_changed: bool, content_changed: bool,
    ) -> None:
        updated = self._get_comment_with_replies(conn, project_id, comment_id)
        if updated is None:
            return
        if severity_changed:
            after_root_severity_change(
                conn, project_id=project_id, comment=updated, previous_severity=previous_severity,
                actor=actor, workspace_schema=self.workspace_schema,
            )
            updated = self._get_comment_with_replies(conn, project_id, comment_id)
        if content_changed and updated is not None:
            after_root_content_edited(
                conn, project_id=project_id, comment=updated, actor=actor,
                workspace_schema=self.workspace_schema,
            )

    def _current_severity(self, conn, project_id: str, comment_id: str) -> str:
        row = conn.execute(
            "SELECT severity FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
            (project_id, comment_id),
        ).fetchone()
        return str((row or {}).get("severity") or DEFAULT_COMMENT_SEVERITY)

    @_retry_on_deadlock
    def update_comment_status(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        status: str,
        editor: Optional[Editor] = None,
        expected_revision: Optional[int] = None,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Optional[Dict]:
        """Resolve or reopen; raises RevisionConflict when the thread moved on."""
        self.initialize()

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                if not self._live_root_exists(conn, project_id, comment_id):
                    return None
                if promotion_actor is not None:
                    self._authorize_linked_status(conn, project_id, comment_id, promotion_actor)
                comments_revisions.set_root_status(
                    conn, project_id=project_id, comment_id=comment_id, status=status,
                    editor=editor or _SYSTEM_EDITOR, expected_revision=expected_revision,
                )
                if promotion_actor is not None:
                    return self._enqueue_status(conn, project_id, comment_id, promotion_actor)
                return self._get_comment_with_replies(conn, project_id, comment_id)

    def get_comment(self, project_id: str, project_path: str, comment_id: str) -> Optional[Dict]:
        """One live root with its live replies, or None."""
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                return self._get_comment_with_replies(conn, project_id, comment_id)

    def get_thread(self, project_id: str, project_path: str, comment_id: str) -> Tuple[Optional[Dict], int]:
        """One thread for a live refresh, with the stream cursor read before it.

        ``None`` means the thread is gone (deleted or never existed), which the
        client applies as a removal.
        """
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                # Same ordering as the snapshot: cursor first, then the row.
                cursor = comment_live_events.current_cursor(conn, project_id)
                return self._get_comment_with_replies(conn, project_id, comment_id), cursor

    def _live_root_exists(self, conn, project_id: str, comment_id: str) -> bool:
        return bool(conn.execute(
            "SELECT 1 FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
            (project_id, comment_id),
        ).fetchone())

    def _lock_live_root(self, conn, project_id: str, comment_id: str) -> bool:
        """Lock a live root so a concurrent tombstone cannot race a reply insert."""
        return bool(conn.execute(
            """
            SELECT 1 FROM comments
            WHERE project_id = %s AND id = %s AND deleted_at IS NULL
            FOR UPDATE
            """,
            (project_id, comment_id),
        ).fetchone())

    @_retry_on_deadlock
    def edit_comment(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        editor: Editor,
        expected_revision: Optional[int],
        content: Optional[str] = None,
        severity: Optional[str] = None,
        comment_class: Optional[str] = None,
        mentions: Optional[List[str]] = None,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Optional[Dict]:
        """Edit a root's prose/severity/class/mentions as one revision.

        Anchor and location are immutable and deliberately not accepted here.
        """
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                if not self._live_root_exists(conn, project_id, comment_id):
                    return None
                previous_severity = self._current_severity(conn, project_id, comment_id)
                comments_revisions.edit_root(
                    conn, project_id=project_id, comment_id=comment_id, editor=editor,
                    expected_revision=expected_revision, content=content,
                    severity=_normalize_severity(severity) if severity is not None else None,
                    comment_class=_normalize_comment_class(comment_class) if comment_class is not None else None,
                    mentions=_normalize_mentions(mentions) if mentions is not None else None,
                )
                if promotion_actor is not None:
                    self._after_root_edit(
                        conn, project_id, comment_id, promotion_actor,
                        previous_severity=previous_severity,
                        severity_changed=severity is not None, content_changed=content is not None,
                    )
                return self._get_comment_with_replies(conn, project_id, comment_id)

    @_retry_on_deadlock
    def patch_comment(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        editor: Editor,
        *,
        expected_revision: Optional[int] = None,
        content: Optional[str] = None,
        severity: Optional[str] = None,
        comment_class: Optional[str] = None,
        mentions: Optional[List[str]] = None,
        status: Optional[str] = None,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Optional[Dict]:
        """Apply an HTTP patch atomically, even when it edits prose and status.

        With ``promotion_actor`` a linked thread queues the matching forge
        update (issue body, severity label, open/closed) in the same
        transaction; without it the patch stays Prism-local.
        """
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                if not self._live_root_exists(conn, project_id, comment_id):
                    return None
                if status is not None and promotion_actor is not None:
                    self._authorize_linked_status(conn, project_id, comment_id, promotion_actor)
                previous_severity = self._current_severity(conn, project_id, comment_id)
                has_edit = any(value is not None for value in (content, severity, comment_class, mentions))
                if has_edit:
                    expected_revision = comments_revisions.edit_root(
                        conn, project_id=project_id, comment_id=comment_id, editor=editor,
                        expected_revision=expected_revision, content=content,
                        severity=_normalize_severity(severity) if severity is not None else None,
                        comment_class=_normalize_comment_class(comment_class) if comment_class is not None else None,
                        mentions=_normalize_mentions(mentions) if mentions is not None else None,
                    )
                    if promotion_actor is not None:
                        self._after_root_edit(
                            conn, project_id, comment_id, promotion_actor,
                            previous_severity=previous_severity,
                            severity_changed=severity is not None, content_changed=content is not None,
                        )
                if status is not None:
                    comments_revisions.set_root_status(
                        conn, project_id=project_id, comment_id=comment_id, status=status,
                        editor=editor, expected_revision=expected_revision,
                    )
                    if promotion_actor is not None:
                        return self._enqueue_status(conn, project_id, comment_id, promotion_actor)
                return self._get_comment_with_replies(conn, project_id, comment_id)

    @_retry_on_deadlock
    def pin_comment_anchor(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        editor: Editor,
        *,
        commit: str,
        source_revision_key: Optional[str],
        file_path: Optional[str] = None,
        project_relative_path: Optional[str] = None,
        expected_revision: Optional[int] = None,
    ) -> Optional[Dict]:
        """Admin pin of an unpinned root. Already-pinned rows stay immutable."""
        self.initialize()
        now = _utc_now_iso()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                row = conn.execute(
                    f"SELECT {_COMMENT_COLUMNS} FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
                    (project_id, comment_id),
                ).fetchone()
                if row is None:
                    return None
                if _anchor_already_pinned(row):
                    raise ValueError("anchor fields are immutable")
                params: List[object] = [
                    commit, source_revision_key, "manual", ANCHOR_STATE_PINNED,
                    _optional_str(file_path) or row.get("file_path"),
                    _optional_str(project_relative_path) or row.get("project_relative_path"),
                    now, project_id, comment_id,
                ]
                guard = " AND anchor_state = %s"
                params.append(ANCHOR_STATE_UNPINNED)
                if expected_revision is not None:
                    guard += " AND revision = %s"
                    params.append(expected_revision)
                updated = conn.execute(
                    f"""
                    UPDATE comments
                    SET anchor_commit = %s, anchor_revision_key = %s, anchor_source = %s,
                        anchor_state = %s, file_path = %s, project_relative_path = %s,
                        revision = revision + 1, updated_at = %s
                    WHERE project_id = %s AND id = %s AND deleted_at IS NULL{guard}
                    RETURNING revision
                    """,
                    tuple(params),
                ).fetchone()
                if updated is None:
                    latest = conn.execute(
                        f"SELECT {_COMMENT_COLUMNS} FROM comments WHERE project_id = %s AND id = %s AND deleted_at IS NULL",
                        (project_id, comment_id),
                    ).fetchone()
                    if latest is None:
                        return None
                    if _anchor_already_pinned(latest):
                        raise ValueError("anchor fields are immutable")
                    raise comments_revisions.RevisionConflict(
                        "root", comment_id, int(latest["revision"] or 1),
                    )
                comments_revisions.record_revision(
                    conn, project_id=project_id, target_kind=comments_revisions.ROOT, target_id=comment_id,
                    revision=int(updated["revision"]), change_kind=comments_revisions.CHANGE_EDIT, editor=editor,
                    content=row["content"],
                )
                return self._get_comment_with_replies(conn, project_id, comment_id)

    @_retry_on_deadlock
    def edit_reply(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        reply_id: str,
        content: str,
        editor: Editor,
        expected_revision: Optional[int],
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Optional[Dict]:
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                if not self._live_reply(conn, project_id, comment_id, reply_id):
                    return None
                comments_revisions.edit_reply(
                    conn, project_id=project_id, reply_id=reply_id, content=content,
                    editor=editor, expected_revision=expected_revision,
                )
                updated = self._get_comment_with_replies(conn, project_id, comment_id)
                if updated is not None and promotion_actor is not None:
                    edited = self._live_reply(conn, project_id, comment_id, reply_id)
                    if edited:
                        after_reply_edited(
                            conn, project_id=project_id, comment=updated,
                            reply=_row_to_reply_dict(edited), actor=promotion_actor,
                            workspace_schema=self.workspace_schema,
                        )
                        updated = self._get_comment_with_replies(conn, project_id, comment_id)
                return updated

    @_retry_on_deadlock
    def delete_reply(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        reply_id: str,
        editor: Editor,
        expected_revision: Optional[int] = None,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Optional[Dict]:
        """Tombstone one reply; history and the row itself are kept."""
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                live_reply = self._live_reply(conn, project_id, comment_id, reply_id)
                if not live_reply:
                    return None
                reply_snapshot = _row_to_reply_dict(live_reply)
                comments_revisions.tombstone_reply(
                    conn, project_id=project_id, reply_id=reply_id, editor=editor, expected_revision=expected_revision,
                )
                updated = self._get_comment_with_replies(conn, project_id, comment_id)
                if updated is not None and promotion_actor is not None:
                    after_reply_deleted(
                        conn, project_id=project_id, comment=updated, reply=reply_snapshot,
                        actor=promotion_actor, workspace_schema=self.workspace_schema,
                    )
                    updated = self._get_comment_with_replies(conn, project_id, comment_id)
                return updated

    def _live_reply(self, conn, project_id: str, comment_id: str, reply_id: str):
        return conn.execute(
            f"""
            SELECT {_REPLY_COLUMNS} FROM comment_replies
            WHERE project_id = %s AND comment_id = %s AND id = %s AND deleted_at IS NULL
            """,
            (project_id, comment_id, reply_id),
        ).fetchone()

    def get_reply(self, project_id: str, comment_id: str, reply_id: str) -> Optional[Dict]:
        self.initialize()
        with self._connect() as conn:
            row = self._live_reply(conn, project_id, comment_id, reply_id)
            return _row_to_reply_dict(row) if row else None

    def get_history(self, project_id: str, target_kind: str, target_id: str) -> List[Dict]:
        self.initialize()
        with self._connect() as conn:
            return comments_revisions.history(conn, project_id=project_id, target_kind=target_kind, target_id=target_id)

    def get_anchor_bindings(self, project_id: str, comment_ids: List[str]) -> Dict[str, List[Dict]]:
        """Read manual reattachments in one query; creation stays on the root row."""
        self.initialize()
        if not comment_ids:
            return {}
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT id, comment_id, effective_commit, element_id, file_path,
                          location_x, location_y, location_layer, location_page, area_bounds, relative_point
                   FROM comment_anchor_bindings
                   WHERE project_id = %s AND comment_id = ANY(%s)
                   ORDER BY id""",
                (project_id, comment_ids),
            ).fetchall()
        bindings: Dict[str, List[Dict]] = {}
        for row in rows:
            location = {
                "x": row["location_x"], "y": row["location_y"],
                "layer": row["location_layer"], "page": row["location_page"],
            }
            if row["area_bounds"] is not None:
                location["bounds"] = row["area_bounds"]
            bindings.setdefault(row["comment_id"], []).append({
                "sequence": int(row["id"]), "commit": row["effective_commit"],
                "elementId": row["element_id"], "filePath": row["file_path"],
                "location": location, "relativePoint": row["relative_point"],
            })
        return bindings

    @_retry_on_deadlock
    def reattach_comment(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        *,
        commit: str,
        location: Dict,
        element_id: Optional[str],
        relative_point: Optional[List[float]],
        file_path: Optional[str],
        editor: Editor,
        expected_revision: int,
    ) -> Optional[Dict]:
        """Append a binding effective from ``commit``; never rewrite origin."""
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                row = conn.execute(
                    """UPDATE comments SET revision = revision + 1, updated_at = %s
                       WHERE project_id = %s AND id = %s AND scope = 'canvas'
                         AND deleted_at IS NULL AND revision = %s
                       RETURNING revision, scope""",
                    (_utc_now_iso(), project_id, comment_id, expected_revision),
                ).fetchone()
                if row is None:
                    current = conn.execute(
                        "SELECT revision FROM comments WHERE project_id = %s AND id = %s AND scope = 'canvas' AND deleted_at IS NULL",
                        (project_id, comment_id),
                    ).fetchone()
                    if current is None:
                        return None
                    raise RevisionConflict("root", comment_id, int(current["revision"]))

                conn.execute(
                    """INSERT INTO comment_anchor_bindings (
                           project_id, comment_id, effective_commit, element_id, file_path,
                           location_x, location_y, location_layer, location_page, area_bounds, relative_point,
                           editor_user_id, editor_kind
                       ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)""",
                    (
                        project_id, comment_id, commit, _optional_str(element_id), _optional_str(file_path),
                        float(location["x"]), float(location["y"]),
                        str(location.get("layer", "")), str(location.get("page", "")),
                        json.dumps(location["bounds"]) if location.get("bounds") is not None else None,
                        json.dumps(relative_point) if relative_point is not None else None,
                        editor.user_id, editor.kind,
                    ),
                )
                comments_revisions.record_revision(
                    conn, project_id=project_id, target_kind=comments_revisions.ROOT,
                    target_id=comment_id, revision=int(row["revision"]),
                    change_kind=comments_revisions.CHANGE_REATTACH, editor=editor, emit_change=False,
                )
                comment_live_events.record_change(
                    conn, project_id=project_id, comment_id=comment_id,
                    scope="canvas", change_kind="anchor",
                )
                return self._get_comment_with_replies(conn, project_id, comment_id)

    @_retry_on_deadlock
    def add_reply(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        content: str,
        author: str,
        author_user_id: Optional[str] = None,
        author_kind: Optional[str] = None,
        origin: str = comments_revisions.ORIGIN_PRISM,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> Optional[Tuple[Dict, Dict]]:
        self.initialize()
        timestamp = _utc_now_iso()
        reply_id = f"r_{uuid.uuid4().hex[:8]}"
        author_user_id = _optional_str(author_user_id)
        author_kind_norm = _optional_str(author_kind) or (AUTHOR_KIND_USER if author_user_id else AUTHOR_KIND_LEGACY)

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                if not self._lock_live_root(conn, project_id, comment_id):
                    return None

                conn.execute(
                    """
                    INSERT INTO comment_replies(
                        id, comment_id, project_id, author, timestamp, content,
                        author_user_id, author_kind, revision, updated_at, origin
                    )
                    SELECT %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, %s
                    FROM comments
                    WHERE project_id = %s AND id = %s AND deleted_at IS NULL
                    """,
                    (reply_id, comment_id, project_id, author, timestamp, content,
                     author_user_id, author_kind_norm, timestamp, origin,
                     project_id, comment_id),
                )
                inserted = conn.execute(
                    "SELECT 1 FROM comment_replies WHERE project_id = %s AND id = %s",
                    (project_id, reply_id),
                ).fetchone()
                if not inserted:
                    return None
                comments_revisions.record_revision(
                    conn, project_id=project_id, target_kind=comments_revisions.REPLY, target_id=reply_id,
                    revision=1, change_kind=comments_revisions.CHANGE_CREATE,
                    editor=Editor(user_id=author_user_id, kind=author_kind_norm, display=author, origin=origin),
                    content=content,
                )

                unsynced_reply_ids: set[str] = set()
                if promotion_actor is not None:
                    parent = self._get_comment_with_replies(conn, project_id, comment_id)
                    created_reply = self._live_reply(conn, project_id, comment_id, reply_id)
                    if parent and created_reply:
                        outcome = after_reply_added(
                            conn, project_id=project_id, comment=parent,
                            reply=_row_to_reply_dict(created_reply), actor=promotion_actor,
                            workspace_schema=self.workspace_schema,
                        )
                        if outcome.action == "unsynced":
                            unsynced_reply_ids.add(reply_id)
                            conn.execute(
                                "UPDATE comment_replies SET sync_state = %s WHERE project_id = %s AND id = %s",
                                ("unsynced_local", project_id, reply_id),
                            )

                updated_comment = self._get_comment_with_replies(
                    conn, project_id, comment_id, unsynced_reply_ids=unsynced_reply_ids or None,
                )
                if not updated_comment:
                    return None

                created = self._live_reply(conn, project_id, comment_id, reply_id)
                reply_payload = _row_to_reply_dict(created)
                if reply_id in unsynced_reply_ids:
                    reply_payload["sync"] = {"state": "unsynced_local", "reason": "publication_required"}
                return (updated_comment, reply_payload)

    @_retry_on_deadlock
    def promote_comment(
        self, project_id: str, project_path: str, comment_id: str, actor: PromotionActor,
    ) -> Optional[Dict]:
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                current = self._get_comment_with_replies(conn, project_id, comment_id)
                if current is None:
                    return None
                result = manual_promote_root(
                    conn, project_id=project_id, comment=current, actor=actor,
                    workspace_schema=self.workspace_schema,
                )
                if result.action == "denied":
                    from app.services.trackers.publication_policy import PublicationDenied

                    raise PublicationDenied(result.code or "publication_required", result.reason or "Publication denied")
                # The tracked_threads/sync_ops trigger emits the durable
                # projection event in this transaction for a newly queued op.
                return self._get_comment_with_replies(conn, project_id, comment_id)

    @_retry_on_deadlock
    def share_reply(
        self, project_id: str, project_path: str, comment_id: str,
        reply_id: str, actor: PromotionActor,
    ) -> Optional[Dict]:
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                current = self._get_comment_with_replies(conn, project_id, comment_id)
                reply = self._live_reply(conn, project_id, comment_id, reply_id)
                if current is None or reply is None:
                    return None
                enqueue_share_reply(
                    conn, project_id=project_id, comment=current,
                    reply=_row_to_reply_dict(reply), actor=actor,
                    workspace_schema=self.workspace_schema,
                )
                conn.execute(
                    "UPDATE comment_replies SET sync_state = NULL WHERE project_id = %s AND id = %s",
                    (project_id, reply_id),
                )
                comment_live_events.record_change(
                    conn, project_id=project_id, comment_id=comment_id,
                    scope=current.get("scope", "canvas"), change_kind="projection",
                    base_commit=current.get("baseCommit"), compare_commit=current.get("compareCommit"),
                )
                return self._get_comment_with_replies(conn, project_id, comment_id)



    def delete_project_comments(self, project_id: str) -> None:
        """Remove every comment listing stored for a deleted project."""
        self.initialize()

        with self._connect() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM comment_revisions WHERE project_id = %s", (project_id,))
                conn.execute("DELETE FROM comment_change_events WHERE project_id = %s", (project_id,))
                conn.execute("DELETE FROM comment_stream_heads WHERE project_id = %s", (project_id,))
                conn.execute(
                    "DELETE FROM comments WHERE project_id = %s",
                    (project_id,),
                )
                conn.execute(
                    "DELETE FROM project_comment_state WHERE project_id = %s",
                    (project_id,),
                )

    @_retry_on_deadlock
    def delete_comment(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        editor: Optional[Editor] = None,
        expected_revision: Optional[int] = None,
        promotion_actor: Optional[PromotionActor] = None,
    ) -> bool:
        """Tombstone a root and its live replies.

        The rows stay for history and for the tracker's unlink lineage;
        every read path filters ``deleted_at``. ``delete_project_comments``
        remains the one hard delete, used when the project itself goes.
        """
        self.initialize()

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                if not self._live_root_exists(conn, project_id, comment_id):
                    return False
                comments_revisions.tombstone_root(
                    conn, project_id=project_id, comment_id=comment_id,
                    editor=editor or _SYSTEM_EDITOR, expected_revision=expected_revision,
                )
                if promotion_actor is not None:
                    after_root_deleted(
                        conn, project_id=project_id, comment_id=comment_id, actor=promotion_actor,
                        workspace_schema=self.workspace_schema,
                    )
                return True

    def export_comments_json(self, project_id: str, project_path: str) -> str:
        self.initialize()

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                snapshot = self._build_snapshot(conn, project_id)

                comments_path = get_project_comments_json_path(project_path)
                os.makedirs(os.path.dirname(comments_path), exist_ok=True)

                fd, tmp_path = tempfile.mkstemp(
                    prefix=".comments-",
                    suffix=".tmp",
                    dir=os.path.dirname(comments_path),
                )

                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as handle:
                        json.dump(snapshot, handle, indent=2)
                        handle.write("\n")
                    os.replace(tmp_path, comments_path)
                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)

                conn.execute(
                    """
                    UPDATE project_comment_state
                    SET last_exported_at = %s
                    WHERE project_id = %s
                    """,
                    (_utc_now_iso(), project_id),
                )

                return comments_path

    def mark_export_commit(self, project_id: str, commit_sha: str) -> None:
        if not commit_sha:
            return

        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO project_comment_state(project_id, imported_from_json)
                    VALUES(%s, TRUE)
                    ON CONFLICT (project_id) DO NOTHING
                    """,
                    (project_id,),
                )
                conn.execute(
                    """
                    UPDATE project_comment_state
                    SET last_exported_at = %s,
                        last_export_commit = %s
                    WHERE project_id = %s
                    """,
                    (_utc_now_iso(), commit_sha, project_id),
                )


comments_store = CommentsStoreService()


def initialize_comments_store() -> None:
    comments_store.initialize()
