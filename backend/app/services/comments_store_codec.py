"""Comment JSON import and API projection helpers.

Imported repository files are legacy, unowned comments; the store owns the transaction.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.services import comments_revisions
from app.services.comments_revisions import Editor

# 1.1 adds authorUserId/authorKind, reply ids, revision/updatedAt and the anchor
# block. Every addition is optional for readers; 1.0 files still import.
COMMENTS_META = {
    "version": "1.1",
    "generator": "KiCad-Prism-Web",
}

AUTHOR_KIND_LEGACY = "legacy"
AUTHOR_KIND_USER = "user"
ANCHOR_STATE_PINNED = "pinned"
ANCHOR_STATE_UNPINNED = "unpinned"

_SYSTEM_EDITOR = Editor(user_id=None, kind="system", display="")

_COMMENT_COLUMNS = """
    id, author, timestamp, status, context,
    location_x, location_y, location_layer, location_page, content,
    area_x, area_y, area_w, area_h,
    element_id, element_ref, element_type,
    comment_class, severity, mentions, metadata,
    scope, base_commit, compare_commit, comparison_domain,
    file_path, semantic_item_id, anchor_kind,
    forge_provider, forge_issue_id, forge_issue_url, forge_sync_state,
    author_user_id, author_kind, revision, updated_at, deleted_at,
    anchor_commit, anchor_revision_key, anchor_source, anchor_state,
    selected_side, project_relative_path
"""

_REPLY_COLUMNS = """
    id, comment_id, author, timestamp, content,
    author_user_id, author_kind, revision, updated_at, deleted_at, origin,
    sync_state
"""

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


def _anchor_already_pinned(row) -> bool:
    """Pinned state or a stored comparison pair is an identity, not a draft.

    Comparison creates without ``selectedSide`` are ``anchor_state=pinned``
    with a null ``anchor_commit``; the ordered pair is what pins them.
    """
    if (row.get("anchor_state") or ANCHOR_STATE_UNPINNED) == ANCHOR_STATE_PINNED:
        return True
    return bool(_optional_str(row.get("base_commit")) and _optional_str(row.get("compare_commit")))


def _anchor_block(row) -> Dict:
    """Where the comment is pinned, and how we know (contract D6).

    ``unpinned`` rows are readable and visibly unpinned; they never gain a
    commit by inference. The comparison pair is carried alongside so one
    block answers "which revision" for both canvas and comparison scopes.
    """
    state = row.get("anchor_state") or ANCHOR_STATE_UNPINNED
    block = {
        "state": state,
        "source": row.get("anchor_source"),
        "commit": row.get("anchor_commit"),
        "sourceRevisionKey": row.get("anchor_revision_key"),
        "baseCommit": row.get("base_commit"),
        "compareCommit": row.get("compare_commit"),
        "selectedSide": row.get("selected_side"),
    }
    project_file = row.get("project_relative_path")
    if project_file:
        block["projectFile"] = project_file
    return block


def _row_to_reply_dict(row) -> Dict:
    reply = {
        "id": row["id"],
        "author": row["author"],
        "authorUserId": row.get("author_user_id"),
        "authorKind": row.get("author_kind") or AUTHOR_KIND_LEGACY,
        "timestamp": _iso_timestamp(row["timestamp"]),
        "updatedAt": _iso_timestamp(row.get("updated_at") or row["timestamp"]),
        "revision": int(row.get("revision") or 1),
        "content": row["content"],
        "origin": row.get("origin") or comments_revisions.ORIGIN_PRISM,
    }
    if row.get("deleted_at"):
        reply["deletedAt"] = _iso_timestamp(row["deleted_at"])
    sync_state = _optional_str(row.get("sync_state"))
    if sync_state:
        reply["syncState"] = sync_state
    return reply


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
        "authorUserId": row.get("author_user_id"),
        "authorKind": row.get("author_kind") or AUTHOR_KIND_LEGACY,
        "timestamp": _iso_timestamp(row["timestamp"]),
        "updatedAt": _iso_timestamp(row.get("updated_at") or row["timestamp"]),
        "revision": int(row.get("revision") or 1),
        "status": row["status"],
        "context": row["context"],
        "location": location,
        "content": row["content"],
        "replies": replies,
        "commentClass": _normalize_comment_class(row.get("comment_class")),
        "severity": _normalize_severity(row.get("severity")),
        "mentions": _normalize_mentions(row.get("mentions")),
        "anchor": _anchor_block(row),
    }
    if (comment["anchor"].get("state") or ANCHOR_STATE_UNPINNED) == ANCHOR_STATE_UNPINNED:
        comment["tracker"] = {"linkState": None, "notPromotableReason": "unpinned_anchor"}
    if row.get("deleted_at"):
        comment["deletedAt"] = _iso_timestamp(row["deleted_at"])
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


def import_comments_payload(conn, project_id: str, payload: Dict) -> None:
    """Load a comments.json (1.0 or 1.1) once, as legacy rows.

    A file in the repository is not an authentication source: even when
    it carries ``authorUserId`` the imported rows get no owner, only the
    display text. Reply ids from the file are kept so later exports and
    desktop consumers see stable ids.
    """
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
                comment_class, severity, mentions,
                author_kind, updated_at
            )
            VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
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
                AUTHOR_KIND_LEGACY,
                timestamp,
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
                    id, comment_id, project_id, author, timestamp, content,
                    author_kind, updated_at
                )
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    reply_id,
                    comment_id,
                    project_id,
                    reply_author,
                    reply_timestamp,
                    reply_content,
                    AUTHOR_KIND_LEGACY,
                    reply_timestamp,
                ),
            )
