"""
Comments storage service.

Design:
- PostgreSQL is the single source of truth for comments/replies.
- Per-project isolation is enforced via project_id on every row.
- Existing .comments/comments.json is imported once per project on first access.
- comments.json is exported from DB when users press "Push Comments".
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.services import project_service
from app.services.postgres_database import database

COMMENTS_META = {
    "version": "1.0",
    "generator": "KiCad-Prism-Web",
}

COMMENT_CLASSES = ("general", "observation", "question", "task")
COMMENT_SEVERITIES = ("info", "minor", "major", "critical")
DEFAULT_COMMENT_CLASS = "general"
DEFAULT_COMMENT_SEVERITY = "info"


def _utc_now_iso() -> str:
    """Return UTC timestamp in ISO-8601 format with Z suffix."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _iso_timestamp(value) -> str:
    return value.isoformat().replace("+00:00", "Z") if hasattr(value, "isoformat") else str(value)


def get_project_comments_json_path(project_path: str) -> str:
    """Return canonical comments.json path for a project."""
    return os.path.join(project_path, ".comments", "comments.json")


def _optional_str(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_area_bounds(raw) -> Optional[Tuple[float, float, float, float]]:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        x, y, w, h = (float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]))
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    return (x, y, w, h)


def _normalize_comment_class(raw) -> str:
    value = str(raw or DEFAULT_COMMENT_CLASS).strip().lower()
    return value if value in COMMENT_CLASSES else DEFAULT_COMMENT_CLASS


def _normalize_severity(raw) -> str:
    value = str(raw or DEFAULT_COMMENT_SEVERITY).strip().lower()
    return value if value in COMMENT_SEVERITIES else DEFAULT_COMMENT_SEVERITY


def _normalize_mentions(raw) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    mentions: List[str] = []
    seen = set()
    for item in raw:
        email = _optional_str(item)
        if not email:
            continue
        normalized = email.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        mentions.append(normalized)
    return mentions


def _mentions_from_content(content: str, known_emails: Optional[List[str]] = None) -> List[str]:
    """Extract @mentions that look like emails; optionally intersect with known users."""
    found = re.findall(r"@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})", content or "")
    mentions = _normalize_mentions(found)
    if known_emails is None:
        return mentions
    allowed = {email.lower() for email in known_emails}
    return [email for email in mentions if email in allowed]


def _row_to_comment_dict(row, replies: List[Dict]) -> Dict:
    location = {
        "x": row["location_x"],
        "y": row["location_y"],
        "layer": row["location_layer"] or "",
        "page": row["location_page"] or "",
    }
    area_vals = (row.get("area_x"), row.get("area_y"), row.get("area_w"), row.get("area_h"))
    if all(v is not None for v in area_vals):
        location["bounds"] = [area_vals[0], area_vals[1], area_vals[2], area_vals[3]]

    comment = {
        "id": row["id"],
        "author": row["author"],
        "timestamp": _iso_timestamp(row["timestamp"]),
        "status": row["status"],
        "context": row["context"],
        "location": location,
        "content": row["content"],
        "replies": replies,
        "commentClass": _normalize_comment_class(row.get("comment_class")),
        "severity": _normalize_severity(row.get("severity")),
        "mentions": _normalize_mentions(row.get("mentions")),
    }
    element_id = row.get("element_id")
    element_ref = row.get("element_ref")
    element_type = row.get("element_type")
    if element_id:
        comment["elementId"] = element_id
    if element_ref:
        comment["elementRef"] = element_ref
    if element_type:
        comment["elementType"] = element_type
    metadata = row.get("metadata")
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = None
    if isinstance(metadata, dict) and metadata:
        comment["metadata"] = metadata
    scope = row.get("scope") or "canvas"
    comment["scope"] = scope
    if scope == "comparison":
        comment["baseCommit"] = row.get("base_commit")
        comment["compareCommit"] = row.get("compare_commit")
        comment["comparisonDomain"] = row.get("comparison_domain")
        comment["filePath"] = row.get("file_path")
        comment["semanticItemId"] = row.get("semantic_item_id")
        comment["anchorKind"] = row.get("anchor_kind")

    # Forge projection fields (nullable today; reserved for future Issues sync).
    forge_provider = row.get("forge_provider")
    forge_issue_id = row.get("forge_issue_id")
    forge_issue_url = row.get("forge_issue_url")
    forge_sync_state = row.get("forge_sync_state")
    if forge_provider:
        comment["forgeProvider"] = forge_provider
    if forge_issue_id:
        comment["forgeIssueId"] = forge_issue_id
    if forge_issue_url:
        comment["forgeIssueUrl"] = forge_issue_url
    if forge_sync_state:
        comment["forgeSyncState"] = forge_sync_state
    return comment


class CommentsStoreService:
    """PostgreSQL-backed comments service."""

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
                conn.execute("CREATE SCHEMA IF NOT EXISTS comments")
                conn.execute("SET search_path TO comments, public")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS comments (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        author TEXT NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL,
                        status TEXT NOT NULL,
                        context TEXT NOT NULL,
                        location_x REAL NOT NULL,
                        location_y REAL NOT NULL,
                        location_layer TEXT NOT NULL DEFAULT '',
                        location_page TEXT NOT NULL DEFAULT '',
                        content TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS comment_replies (
                        id TEXT PRIMARY KEY,
                        comment_id TEXT NOT NULL,
                        project_id TEXT NOT NULL,
                        author TEXT NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL,
                        content TEXT NOT NULL,
                        FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS project_comment_state (
                        project_id TEXT PRIMARY KEY,
                        imported_from_json BOOLEAN NOT NULL DEFAULT FALSE,
                        imported_at TIMESTAMPTZ,
                        last_exported_at TIMESTAMPTZ,
                        last_export_commit TEXT
                    );

                    CREATE INDEX IF NOT EXISTS idx_comments_project
                        ON comments(project_id, timestamp, id);
                    CREATE INDEX IF NOT EXISTS idx_replies_project_comment
                        ON comment_replies(project_id, comment_id, timestamp, id);
                    """,
                    prepare=False,
                )
                # Keep the additive migration idempotent while paying one remote
                # database round trip instead of one for every column.
                conn.execute(
                    ";\n".join((
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_x REAL",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_y REAL",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_w REAL",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS area_h REAL",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS element_id TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS element_ref TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS element_type TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS comment_class TEXT NOT NULL DEFAULT 'general'",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info'",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'canvas'",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS base_commit TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS compare_commit TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS comparison_domain TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS file_path TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS semantic_item_id TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_kind TEXT",
                        # Reserved for future GitHub/GitLab Issues projection (unused today).
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_provider TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_issue_id TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_issue_url TEXT",
                        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS forge_sync_state TEXT",
                    )),
                    prepare=False,
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_comments_comparison
                    ON comments(
                        project_id, scope, base_commit, compare_commit,
                        comparison_domain, semantic_item_id
                    )
                    """
                )
                conn.commit()

            self._initialized = True

    @contextmanager
    def _connect(self):
        with database.connection() as conn:
            conn.execute("SET search_path TO comments, public")
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
                self._import_comments_payload(conn, project_id, payload)

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

    def _import_comments_payload(self, conn, project_id: str, payload: Dict) -> None:
        comments = payload.get("comments", [])

        for raw_comment in comments:
            if not isinstance(raw_comment, dict):
                continue

            context = str(raw_comment.get("context", "PCB")).upper()
            if context not in {"PCB", "SCH"}:
                context = "PCB"

            status = str(raw_comment.get("status", "OPEN")).upper()
            if status not in {"OPEN", "RESOLVED"}:
                status = "OPEN"

            location = raw_comment.get("location", {})
            if not isinstance(location, dict):
                location = {}

            comment_id = str(raw_comment.get("id") or f"c_{uuid.uuid4().hex[:8]}")
            author = str(raw_comment.get("author") or "anonymous")
            timestamp = str(raw_comment.get("timestamp") or _utc_now_iso())
            content = str(raw_comment.get("content") or "")

            try:
                loc_x = float(location.get("x", 0.0))
                loc_y = float(location.get("y", 0.0))
            except (TypeError, ValueError):
                loc_x = 0.0
                loc_y = 0.0

            loc_layer = str(location.get("layer") or "")
            loc_page = str(location.get("page") or "")
            area = _parse_area_bounds(location.get("bounds"))
            element_id = _optional_str(raw_comment.get("elementId") or raw_comment.get("element_id"))
            element_ref = _optional_str(raw_comment.get("elementRef") or raw_comment.get("element_ref"))
            element_type = _optional_str(raw_comment.get("elementType") or raw_comment.get("element_type"))
            comment_class = _normalize_comment_class(
                raw_comment.get("commentClass") or raw_comment.get("comment_class")
            )
            severity = _normalize_severity(raw_comment.get("severity"))
            mentions = _normalize_mentions(raw_comment.get("mentions"))
            if not mentions:
                mentions = _mentions_from_content(content)

            conn.execute(
                """
                INSERT INTO comments(
                    id, project_id, author, timestamp, status, context,
                    location_x, location_y, location_layer, location_page, content,
                    area_x, area_y, area_w, area_h,
                    element_id, element_ref, element_type,
                    comment_class, severity, mentions
                )
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    comment_id,
                    project_id,
                    author,
                    timestamp,
                    status,
                    context,
                    loc_x,
                    loc_y,
                    loc_layer,
                    loc_page,
                    content,
                    area[0] if area else None,
                    area[1] if area else None,
                    area[2] if area else None,
                    area[3] if area else None,
                    element_id,
                    element_ref,
                    element_type,
                    comment_class,
                    severity,
                    json.dumps(mentions),
                ),
            )

            replies = raw_comment.get("replies", [])
            if not isinstance(replies, list):
                continue

            for raw_reply in replies:
                if not isinstance(raw_reply, dict):
                    continue

                reply_id = str(raw_reply.get("id") or f"r_{uuid.uuid4().hex[:8]}")
                reply_author = str(raw_reply.get("author") or "anonymous")
                reply_timestamp = str(raw_reply.get("timestamp") or _utc_now_iso())
                reply_content = str(raw_reply.get("content") or "")

                conn.execute(
                    """
                    INSERT INTO comment_replies(
                        id, comment_id, project_id, author, timestamp, content
                    )
                    VALUES(%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        reply_id,
                        comment_id,
                        project_id,
                        reply_author,
                        reply_timestamp,
                        reply_content,
                    ),
                )

    def _build_snapshot(self, conn, project_id: str) -> Dict:
        comment_rows = conn.execute(
            """
            SELECT id, author, timestamp, status, context,
                   location_x, location_y, location_layer, location_page, content,
                   area_x, area_y, area_w, area_h,
                   element_id, element_ref, element_type,
                   comment_class, severity, mentions, metadata,
                   scope, base_commit, compare_commit, comparison_domain,
                   file_path, semantic_item_id, anchor_kind,
                   forge_provider, forge_issue_id, forge_issue_url, forge_sync_state
            FROM comments
            WHERE project_id = %s AND scope <> 'comparison'
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

        reply_rows = conn.execute(
            """
            SELECT id, comment_id, author, timestamp, content
            FROM comment_replies
            WHERE project_id = %s
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

        replies_by_comment: Dict[str, List[Dict]] = {}

        for row in reply_rows:
            replies_by_comment.setdefault(row["comment_id"], []).append(
                {
                    "author": row["author"],
                    "timestamp": _iso_timestamp(row["timestamp"]),
                    "content": row["content"],
                }
            )

        comments: List[Dict] = []
        for row in comment_rows:
            comments.append(
                _row_to_comment_dict(row, replies_by_comment.get(row["id"], []))
            )

        return {
            "meta": dict(COMMENTS_META),
            "comments": comments,
        }

    def _get_comment_with_replies(self, conn, project_id: str, comment_id: str) -> Optional[Dict]:
        row = conn.execute(
            """
            SELECT id, author, timestamp, status, context,
                   location_x, location_y, location_layer, location_page, content,
                   area_x, area_y, area_w, area_h,
                   element_id, element_ref, element_type,
                   comment_class, severity, mentions, metadata,
                   scope, base_commit, compare_commit, comparison_domain,
                   file_path, semantic_item_id, anchor_kind,
                   forge_provider, forge_issue_id, forge_issue_url, forge_sync_state
            FROM comments
            WHERE project_id = %s AND id = %s
            """,
            (project_id, comment_id),
        ).fetchone()

        if not row:
            return None

        reply_rows = conn.execute(
            """
            SELECT author, timestamp, content
            FROM comment_replies
            WHERE project_id = %s AND comment_id = %s
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id, comment_id),
        ).fetchall()

        replies = [
            {
                "author": reply["author"],
                "timestamp": _iso_timestamp(reply["timestamp"]),
                "content": reply["content"],
            }
            for reply in reply_rows
        ]
        return _row_to_comment_dict(row, replies)

    def get_comments_file(self, project_id: str, project_path: str) -> Dict:
        self.initialize()
        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                return self._build_snapshot(conn, project_id)

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
    ) -> Dict:
        self.initialize()
        context_norm = context.upper()
        timestamp = _utc_now_iso()
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
                        file_path, semantic_item_id, anchor_kind
                    )
                    VALUES(
                        %s, %s, %s, %s, 'OPEN', %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb,
                        %s, %s, %s, %s, %s, %s, %s
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
                    ),
                )

                created = self._get_comment_with_replies(conn, project_id, comment_id)
                if not created:
                    raise RuntimeError("Failed to fetch created comment.")

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
                query = """
                    SELECT id, author, timestamp, status, context,
                           location_x, location_y, location_layer, location_page, content,
                           area_x, area_y, area_w, area_h,
                           element_id, element_ref, element_type,
                           comment_class, severity, mentions, metadata,
                           scope, base_commit, compare_commit, comparison_domain,
                           file_path, semantic_item_id, anchor_kind,
                           forge_provider, forge_issue_id, forge_issue_url, forge_sync_state
                    FROM comments
                    WHERE project_id = %s
                      AND scope = 'comparison'
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
                        """
                        SELECT comment_id, author, timestamp, content
                        FROM comment_replies
                        WHERE project_id = %s AND comment_id = ANY(%s)
                        ORDER BY timestamp ASC, id ASC
                        """,
                        (project_id, comment_ids),
                    ).fetchall()
                    for reply in reply_rows:
                        replies_by_comment.setdefault(reply["comment_id"], []).append(
                            {
                                "author": reply["author"],
                                "timestamp": _iso_timestamp(reply["timestamp"]),
                                "content": reply["content"],
                            }
                        )
                return {
                    "meta": dict(COMMENTS_META),
                    "comments": [
                        _row_to_comment_dict(row, replies_by_comment.get(row["id"], []))
                        for row in rows
                    ],
                }

    def update_comment_status(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        status: str,
    ) -> Optional[Dict]:
        self.initialize()

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                cur = conn.execute(
                    """
                    UPDATE comments
                    SET status = %s
                    WHERE project_id = %s AND id = %s
                    """,
                    (status, project_id, comment_id),
                )

                if cur.rowcount == 0:
                    return None

                return self._get_comment_with_replies(conn, project_id, comment_id)

    def add_reply(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        content: str,
        author: str,
    ) -> Optional[Tuple[Dict, Dict]]:
        self.initialize()
        timestamp = _utc_now_iso()
        reply_id = f"r_{uuid.uuid4().hex[:8]}"

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                exists = conn.execute(
                    "SELECT 1 FROM comments WHERE project_id = %s AND id = %s",
                    (project_id, comment_id),
                ).fetchone()

                if not exists:
                    return None

                conn.execute(
                    """
                    INSERT INTO comment_replies(id, comment_id, project_id, author, timestamp, content)
                    VALUES(%s, %s, %s, %s, %s, %s)
                    """,
                    (reply_id, comment_id, project_id, author, timestamp, content),
                )

                updated_comment = self._get_comment_with_replies(conn, project_id, comment_id)
                if not updated_comment:
                    return None

                return (
                    updated_comment,
                    {
                        "author": author,
                        "timestamp": timestamp,
                        "content": content,
                    },
                )

    def delete_comment(self, project_id: str, project_path: str, comment_id: str) -> bool:
        self.initialize()

        with self._connect() as conn:
            with conn.transaction():
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                cur = conn.execute(
                    "DELETE FROM comments WHERE project_id = %s AND id = %s",
                    (project_id, comment_id),
                )
                return cur.rowcount > 0

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
