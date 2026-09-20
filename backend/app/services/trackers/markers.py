"""Bounded correlation markers for tracker recovery (TR-18, C5/D2).

Markers are opaque correlation identifiers embedded in issue and reply bodies.
They are not proof of ownership on their own: recovery validates connector,
container, local target, op id and bot authorship before confirming an op.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional

MARKER_PREFIX = "prism:v1"
MARKER_RE = re.compile(
    r"<!--\s*prism:v1\s+"
    r"connector=(?P<connector>\S+)\s+"
    r"container=(?P<container>\S+)\s+"
    r"(?:(?P<kind>comment|reply)=(?P<target>\S+)\s+)?"
    r"op=(?P<op>\S+)\s*-->"
)

ValidationReason = Literal[
    "match",
    "connector_mismatch",
    "container_mismatch",
    "target_mismatch",
    "op_mismatch",
    "author_not_bot",
    "malformed",
]


@dataclass(frozen=True)
class ParsedMarker:
    connector_id: str
    container_id: str
    op_id: str
    comment_id: Optional[str] = None
    reply_id: Optional[str] = None
    raw: str = ""


@dataclass(frozen=True)
class MarkerValidation:
    accepted: bool
    reason: ValidationReason
    marker: ParsedMarker


def build_marker(
    *,
    connector_id: str,
    container_id: str,
    op_id: str,
    comment_id: str | None = None,
    reply_id: str | None = None,
) -> str:
    """Render the canonical opaque correlation marker (CONTRACTS §7)."""

    connector = (connector_id or "").strip()
    container = (container_id or "").strip()
    op = (op_id or "").strip()
    if not connector or not container or not op:
        raise ValueError("connector_id, container_id and op_id are required")
    if comment_id and reply_id:
        raise ValueError("marker must target either a comment or a reply, not both")
    target_kind = "comment" if comment_id else "reply"
    target_id = (comment_id or reply_id or "").strip()
    if not target_id:
        raise ValueError("comment_id or reply_id is required")
    return (
        f"<!-- {MARKER_PREFIX} connector={connector} container={container} "
        f"{target_kind}={target_id} op={op} -->"
    )


def parse_marker(text: str) -> Optional[ParsedMarker]:
    """Parse a single marker string. Returns None when malformed."""

    match = MARKER_RE.fullmatch((text or "").strip())
    if not match:
        return None
    kind = match.group("kind")
    target = match.group("target")
    return ParsedMarker(
        connector_id=match.group("connector"),
        container_id=match.group("container"),
        op_id=match.group("op"),
        comment_id=target if kind == "comment" else None,
        reply_id=target if kind == "reply" else None,
        raw=match.group(0),
    )


def extract_markers(body: str) -> list[ParsedMarker]:
    """Find every bounded marker present in a remote body."""

    markers: list[ParsedMarker] = []
    for match in MARKER_RE.finditer(body or ""):
        kind = match.group("kind")
        target = match.group("target")
        markers.append(
            ParsedMarker(
                connector_id=match.group("connector"),
                container_id=match.group("container"),
                op_id=match.group("op"),
                comment_id=target if kind == "comment" else None,
                reply_id=target if kind == "reply" else None,
                raw=match.group(0),
            )
        )
    return markers


def validate_marker(
    marker: ParsedMarker,
    *,
    connector_id: str,
    container_id: str,
    op_id: str,
    comment_id: str | None = None,
    reply_id: str | None = None,
    author_user_id: str | None = None,
    bot_user_id: str | None = None,
) -> MarkerValidation:
    """Validate a parsed marker against persisted op and connector provenance."""

    if marker.connector_id != connector_id:
        return MarkerValidation(False, "connector_mismatch", marker)
    if marker.container_id != container_id:
        return MarkerValidation(False, "container_mismatch", marker)
    if marker.op_id != op_id:
        return MarkerValidation(False, "op_mismatch", marker)
    if comment_id is not None and marker.comment_id != comment_id:
        return MarkerValidation(False, "target_mismatch", marker)
    if reply_id is not None and marker.reply_id != reply_id:
        return MarkerValidation(False, "target_mismatch", marker)
    bot = (bot_user_id or "").strip()
    author = (author_user_id or "").strip()
    if bot and author and author != bot:
        return MarkerValidation(False, "author_not_bot", marker)
    return MarkerValidation(True, "match", marker)
