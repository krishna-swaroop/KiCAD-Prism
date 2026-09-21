"""Issue draft rendering and immutable Prism links (TR-24, C1/C4/C8).

Renders deterministic title, prose/context blocks, labels and markers for
outbound issue creation. Generated output obeys D8 (no emails in generated
blocks) and never trusts user-supplied marker or block delimiters.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Callable, Mapping, Optional, Sequence

from app.services.trackers.contracts import IssueContextBlock, IssueDraft
from app.services.trackers.deep_links import build_prism_deep_link
from app.services.trackers.markers import MARKER_PREFIX, build_marker
from app.services.trackers.mentions import (
    Mention,
    MentionAssignmentResult,
    format_mention_token,
    parse_mention_tokens,
    resolve_mention_assignments,
)
PROSE_BLOCK_START = "<!-- prism:block:prose -->"
PROSE_BLOCK_END = "<!-- /prism:block -->"
CONTEXT_BLOCK_START = "<!-- prism:block:context -->"
CONTEXT_BLOCK_END = "<!-- /prism:block -->"

_TRUSTED_MARKER_RE = re.compile(r"<!--\s*prism:v1\b[^>]*-->", re.IGNORECASE)
_TRUSTED_BLOCK_RE = re.compile(r"<!--\s*/?prism:block:\w+\s*-->", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_TITLE_SUMMARY_RE = re.compile(r"\s+")
_SHEET_INSTANCE_RE = re.compile(r"^/([^/]+?)(\d+)/$")
_DEFAULT_LABELS = {
    "base": "prism",
    "severityPrefix": "severity:",
    "classPrefix": "class:",
    "boardPrefix": "board:",
}


@dataclass(frozen=True)
class DraftAttribution:
    display_name: str
    forge_login: str | None = None
    verified: bool = True


@dataclass(frozen=True)
class DraftRenderInput:
    project_id: str
    comment: Mapping[str, object]
    connector_id: str
    remote_container_id: str
    op_id: str
    public_base_url: str
    labels: Mapping[str, str] | None = None
    attribution: DraftAttribution | None = None
    mentions: Sequence[Mention] = ()
    forge_logins: Mapping[str, str] | None = None
    can_assign: Callable[[str], bool] | None = None
    max_assignees: int = 10


def escape_generated_text(value: object) -> str:
    """Escape text placed in generated tracker blocks."""

    return html.escape(str(value or ""), quote=True)


def generated_text_contains_email(text: object) -> bool:
    """True when generated tracker text would violate D8 (no-email rule)."""

    return bool(_EMAIL_RE.search(str(text or "")))


def guard_generated_text_no_email(text: object, *, what: str = "generated draft") -> None:
    """Raise when Prism-generated text contains an email address (D8)."""

    if generated_text_contains_email(text):
        raise ValueError(f"{what} contains an email address")


def strip_untrusted_tracker_markup(content: str) -> str:
    """Remove forged markers/blocks so user prose cannot inject trusted markers."""

    cleaned = _TRUSTED_MARKER_RE.sub("", content or "")
    cleaned = _TRUSTED_BLOCK_RE.sub("", cleaned)
    return cleaned.strip()


def board_name_from_comment(comment: Mapping[str, object]) -> str:
    anchor = comment.get("anchor")
    anchor_map = anchor if isinstance(anchor, Mapping) else {}
    project_file = str(anchor_map.get("projectFile") or "").strip()
    if project_file:
        stem = project_file.rsplit("/", 1)[-1]
        if stem.endswith(".kicad_pro"):
            return stem[: -len(".kicad_pro")]
        return stem
    return "project"


def sheet_display_name(page: str) -> str | None:
    text = (page or "").strip()
    if not text:
        return None
    match = _SHEET_INSTANCE_RE.match(text if text.startswith("/") else f"/{text}/")
    if not match:
        return text
    name, instance = match.group(1), match.group(2)
    if instance.isdigit() and int(instance) > 1:
        return f"{name} (instance {instance})"
    return name


def title_summary_from_content(content: str, mentions: Sequence[Mention]) -> str:
    prose = strip_untrusted_tracker_markup(content)
    for mention in mentions:
        token = format_mention_token(mention.display_name, mention.user_id)
        prose = prose.replace(token, mention.display_name)
    first_line = prose.splitlines()[0] if prose else "Comment"
    collapsed = _TITLE_SUMMARY_RE.sub(" ", first_line).strip()
    if not collapsed:
        collapsed = "Comment"
    return collapsed[:120]


def render_issue_title(
    *,
    severity: str,
    content: str,
    comment: Mapping[str, object],
    mentions: Sequence[Mention] = (),
) -> str:
    severity_label = (severity or "info").strip().upper()
    summary = escape_generated_text(title_summary_from_content(content, mentions))
    board = escape_generated_text(board_name_from_comment(comment))
    context = str(comment.get("context") or "PCB").strip().upper()
    location = comment.get("location")
    location_map = location if isinstance(location, Mapping) else {}
    if context == "SCH":
        sheet = sheet_display_name(str(location_map.get("page") or ""))
        suffix = f" ({sheet})" if sheet else ""
    else:
        layer = str(location_map.get("layer") or "").strip()
        suffix = f" ({layer})" if layer else ""
    return f"[{severity_label}] {summary} — {board}{suffix}"


def render_requested_by(attribution: DraftAttribution) -> str:
    display = escape_generated_text(attribution.display_name)
    login = (attribution.forge_login or "").strip()
    if login:
        return f"@{escape_generated_text(login)} ({display})"
    if attribution.verified:
        return display
    return f"{display} (Prism, unverified)"


def _coordinates_line(location: Mapping[str, object]) -> str | None:
    try:
        x = float(location.get("x"))
        y = float(location.get("y"))
    except (TypeError, ValueError):
        return None
    return f"{x:g} mm, {y:g} mm"


def render_context_block_lines(
    *,
    comment: Mapping[str, object],
    prism_url: str,
    requested_by: str,
    assignment_hints: Sequence[str],
) -> list[str]:
    lines: list[str] = []
    board = board_name_from_comment(comment)
    if board:
        lines.append(f"Board: {escape_generated_text(board)}")

    context = str(comment.get("context") or "").strip().upper()
    if context:
        lines.append(f"Context: {escape_generated_text(context)}")

    location = comment.get("location")
    location_map = location if isinstance(location, Mapping) else {}
    layer = str(location_map.get("layer") or "").strip()
    if layer:
        lines.append(f"Layer: {escape_generated_text(layer)}")

    sheet = sheet_display_name(str(location_map.get("page") or ""))
    if sheet:
        lines.append(f"Sheet: {escape_generated_text(sheet)}")

    element_ref = str(comment.get("elementRef") or "").strip()
    if element_ref:
        lines.append(f"Refdes: {escape_generated_text(element_ref)}")

    element_type = str(comment.get("elementType") or "").strip().lower()
    element_value = element_ref
    if element_type == "net" and element_ref:
        lines.append(f"Net: {escape_generated_text(element_ref)}")
        element_value = ""
    elif element_type == "net":
        net_name = str(comment.get("elementId") or "").split(":", 1)[-1].strip()
        if net_name:
            lines.append(f"Net: {escape_generated_text(net_name)}")

    coords = _coordinates_line(location_map)
    if coords:
        lines.append(f"Coordinates: {coords}")

    anchor = comment.get("anchor")
    anchor_map = anchor if isinstance(anchor, Mapping) else {}
    project_file = str(anchor_map.get("projectFile") or "").strip()
    if project_file:
        lines.append(f"Project file: {escape_generated_text(project_file)}")

    scope = str(comment.get("scope") or "canvas")
    if scope == "comparison":
        base_commit = str(anchor_map.get("baseCommit") or comment.get("baseCommit") or "").strip()
        compare_commit = str(anchor_map.get("compareCommit") or comment.get("compareCommit") or "").strip()
        selected_side = str(anchor_map.get("selectedSide") or "").strip()
        if base_commit:
            lines.append(f"Base commit: {escape_generated_text(base_commit)}")
        if compare_commit:
            lines.append(f"Compare commit: {escape_generated_text(compare_commit)}")
        if selected_side:
            lines.append(f"Selected side: {escape_generated_text(selected_side)}")
    else:
        commit = str(anchor_map.get("commit") or "").strip()
        if commit:
            lines.append(f"Commit: {escape_generated_text(commit)}")

    metadata = comment.get("metadata")
    if isinstance(metadata, Mapping):
        variant = str(metadata.get("variant") or "").strip()
        if variant:
            lines.append(f"Variant: {escape_generated_text(variant)}")

    lines.append(f"Prism: {escape_generated_text(prism_url)}")
    lines.append(f"Requested by: {requested_by}")
    for hint in assignment_hints:
        lines.append(escape_generated_text(hint))
    return lines


def render_context_block_text(lines: Sequence[str]) -> str:
    return "\n".join(lines)


def compose_issue_body(
    *,
    prose_block: str,
    context_block: str,
    marker: str,
) -> str:
    parts = [
        PROSE_BLOCK_START,
        prose_block.rstrip(),
        PROSE_BLOCK_END,
        CONTEXT_BLOCK_START,
        context_block.rstrip(),
        CONTEXT_BLOCK_END,
        marker.strip(),
    ]
    return "\n".join(part for part in parts if part)


def build_issue_labels(
    *,
    severity: str,
    comment_class: str,
    board_name: str,
    labels: Mapping[str, str] | None = None,
) -> list[str]:
    config = dict(_DEFAULT_LABELS)
    if labels:
        config.update(labels)
    ordered = [
        config["base"],
        f"{config['severityPrefix']}{(severity or 'info').strip().lower()}",
        f"{config['classPrefix']}{(comment_class or 'general').strip().lower()}",
        f"{config['boardPrefix']}{board_name}",
    ]
    seen: set[str] = set()
    result: list[str] = []
    for label in ordered:
        text = label.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def build_issue_draft(input: DraftRenderInput) -> IssueDraft:
    """Render a frozen IssueDraft for one promotion/create op."""

    comment = input.comment
    comment_id = str(comment.get("id") or "").strip()
    if not comment_id:
        raise ValueError("comment id is required")

    mentions = list(input.mentions) or parse_mention_tokens(str(comment.get("content") or ""))
    prose_source = strip_untrusted_tracker_markup(str(comment.get("content") or ""))
    assignment = resolve_mention_assignments(
        content=prose_source,
        mentions=mentions,
        forge_logins=input.forge_logins or {},
        can_assign=input.can_assign or (lambda _login: True),
        max_assignees=input.max_assignees,
    )

    prism_url = build_prism_deep_link(
        public_base_url=input.public_base_url,
        project_id=input.project_id,
        comment=comment,
    )
    attribution = input.attribution or DraftAttribution(
        display_name=str(comment.get("author") or "Unknown"),
        verified=str(comment.get("authorKind") or "") != "legacy",
    )
    requested_by = render_requested_by(attribution)
    context_lines = render_context_block_lines(
        comment=comment,
        prism_url=prism_url,
        requested_by=requested_by,
        assignment_hints=assignment.assignment_hints,
    )
    context_text = render_context_block_text(context_lines)
    generated_blob = "\n".join([requested_by, context_text, prism_url, *assignment.assignment_hints])
    guard_generated_text_no_email(generated_blob, what="generated draft")

    marker = build_marker(
        connector_id=input.connector_id,
        container_id=input.remote_container_id,
        op_id=input.op_id,
        comment_id=comment_id,
    )
    if MARKER_PREFIX not in marker:
        raise ValueError("marker contract mismatch")

    severity = str(comment.get("severity") or "info")
    comment_class = str(comment.get("commentClass") or "general")
    title = render_issue_title(
        severity=severity,
        content=prose_source,
        comment=comment,
        mentions=mentions,
    )
    labels = build_issue_labels(
        severity=severity,
        comment_class=comment_class,
        board_name=board_name_from_comment(comment),
        labels=input.labels,
    )
    context_block = IssueContextBlock(
        board=board_name_from_comment(comment),
        context=str(comment.get("context") or None),
        layer=(str((comment.get("location") or {}).get("layer")) if isinstance(comment.get("location"), Mapping) else None) or None,
        sheet=sheet_display_name(str((comment.get("location") or {}).get("page") or "") if isinstance(comment.get("location"), Mapping) else ""),
        net=str(comment.get("elementRef") or "") or None,
        refdes=str(comment.get("elementRef") or "") if str(comment.get("elementType") or "") != "net" else None,
        coordinatesMm=_coordinates_mm(comment),
        commit=str((comment.get("anchor") or {}).get("commit") or "") if isinstance(comment.get("anchor"), Mapping) else None,
        prismUrl=prism_url,
        requestedBy=requested_by,
        assignmentHints=list(assignment.assignment_hints),
    )
    return IssueDraft(
        title=title,
        proseBlock=assignment.prose_block,
        contextBlock=context_block,
        labels=labels,
        assignees=list(assignment.assignees),
        marker=marker,
    )


def render_issue_body_from_draft(draft: IssueDraft) -> str:
    context_lines = render_context_block_lines(
        comment=_draft_comment_projection(draft),
        prism_url=draft.contextBlock.prismUrl or "",
        requested_by=draft.contextBlock.requestedBy or "",
        assignment_hints=draft.contextBlock.assignmentHints,
    )
    return compose_issue_body(
        prose_block=draft.proseBlock,
        context_block=render_context_block_text(context_lines),
        marker=draft.marker,
    )


def _coordinates_mm(comment: Mapping[str, object]) -> list[float] | None:
    location = comment.get("location")
    if not isinstance(location, Mapping):
        return None
    try:
        return [float(location["x"]), float(location["y"])]
    except (KeyError, TypeError, ValueError):
        return None


def _draft_comment_projection(draft: IssueDraft) -> dict[str, object]:
    block = draft.contextBlock
    return {
        "id": "draft",
        "context": block.context,
        "scope": "canvas",
        "location": {
            "layer": block.layer or "",
            "page": block.sheet or "",
            "x": (block.coordinatesMm or [0, 0])[0],
            "y": (block.coordinatesMm or [0, 0])[1],
        },
        "elementRef": block.net or block.refdes,
        "elementType": "net" if block.net else None,
        "anchor": {"commit": block.commit, "projectFile": None},
        "metadata": {},
    }


__all__ = [
    "CONTEXT_BLOCK_END",
    "CONTEXT_BLOCK_START",
    "DraftAttribution",
    "DraftRenderInput",
    "PROSE_BLOCK_END",
    "PROSE_BLOCK_START",
    "build_issue_draft",
    "build_issue_labels",
    "compose_issue_body",
    "escape_generated_text",
    "generated_text_contains_email",
    "guard_generated_text_no_email",
    "render_context_block_lines",
    "render_context_block_text",
    "render_issue_body_from_draft",
    "render_issue_title",
    "render_requested_by",
    "sheet_display_name",
    "strip_untrusted_tracker_markup",
    "title_summary_from_content",
]
