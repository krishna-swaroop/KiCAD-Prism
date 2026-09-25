"""Commit-pinned Prism viewer deep links (TR-24, C8).

Deep links are generated from ``PUBLIC_BASE_URL`` and the comment's immutable
anchor. Formatting is pure string assembly — no network calls.
"""

from __future__ import annotations

from typing import Mapping, Optional
from urllib.parse import quote, urlencode

VIEW_BY_CONTEXT = {
    "PCB": "pcb",
    "SCH": "sch",
}

DIFF_BY_DOMAIN = {
    "PCB": "pcb",
    "SCH": "sch",
    "BOM": "bom",
    "STACKUP": "stackup",
    "FABRICATION": "fabrication",
}


def normalize_public_base_url(base: str) -> str:
    return (base or "").strip().rstrip("/")


def _project_path(project_id: str) -> str:
    return f"/projects/{quote(project_id, safe='')}"


def build_canvas_deep_link(
    *,
    public_base_url: str,
    project_id: str,
    comment_id: str,
    commit: str,
    context: str,
    variant: str | None = None,
    semantic_item_id: str | None = None,
) -> str:
    """Frozen canvas URL contract consumed by TR-41."""

    base = normalize_public_base_url(public_base_url)
    if not base:
        raise ValueError("public_base_url is required")
    view = VIEW_BY_CONTEXT.get((context or "").strip().upper(), "pcb")
    params: dict[str, str] = {
        "commit": (commit or "").strip(),
        "view": view,
        "comment": (comment_id or "").strip(),
    }
    if not params["commit"] or not params["comment"]:
        raise ValueError("commit and comment_id are required for canvas deep links")
    variant_name = (variant or "").strip()
    if variant_name:
        params["variant"] = variant_name
    item = (semantic_item_id or "").strip()
    if item:
        params["item"] = item
    return f"{base}{_project_path(project_id)}?{urlencode(params)}"


def build_comparison_deep_link(
    *,
    public_base_url: str,
    project_id: str,
    comment_id: str,
    base_commit: str,
    compare_commit: str,
    comparison_domain: str | None = None,
    selected_side: str | None = None,
    semantic_item_id: str | None = None,
) -> str:
    """Frozen comparison URL contract consumed by TR-41."""

    base = normalize_public_base_url(public_base_url)
    if not base:
        raise ValueError("public_base_url is required")
    base_sha = (base_commit or "").strip()
    compare_sha = (compare_commit or "").strip()
    comment = (comment_id or "").strip()
    if not base_sha or not compare_sha or not comment:
        raise ValueError("base_commit, compare_commit and comment_id are required")
    domain = (comparison_domain or "SCH").strip().upper()
    params: dict[str, str] = {
        "section": "history",
        "base": base_sha,
        "compare": compare_sha,
        "view": "semantic",
        "diff": DIFF_BY_DOMAIN.get(domain, "sch"),
        "comment": comment,
    }
    side = (selected_side or "").strip().lower()
    if side in {"base", "compare"}:
        params["side"] = side
    item = (semantic_item_id or "").strip()
    if item:
        params["item"] = item
    return f"{base}{_project_path(project_id)}?{urlencode(params)}"


def build_prism_deep_link(
    *,
    public_base_url: str,
    project_id: str,
    comment: Mapping[str, object],
) -> str:
    """Select canvas or comparison URL shape from a comment projection."""

    scope = str(comment.get("scope") or "canvas")
    comment_id = str(comment.get("id") or "").strip()
    if not comment_id:
        raise ValueError("comment id is required")

    metadata = comment.get("metadata")
    variant = None
    if isinstance(metadata, Mapping):
        raw_variant = metadata.get("variant")
        if raw_variant is not None:
            variant = str(raw_variant).strip() or None

    anchor = comment.get("anchor")
    anchor_map = anchor if isinstance(anchor, Mapping) else {}

    if scope == "comparison":
        return build_comparison_deep_link(
            public_base_url=public_base_url,
            project_id=project_id,
            comment_id=comment_id,
            base_commit=str(anchor_map.get("baseCommit") or comment.get("baseCommit") or ""),
            compare_commit=str(anchor_map.get("compareCommit") or comment.get("compareCommit") or ""),
            comparison_domain=str(comment.get("comparisonDomain") or "SCH"),
            selected_side=str(anchor_map.get("selectedSide") or "") or None,
            semantic_item_id=str(comment.get("semanticItemId") or "") or None,
        )

    commit = str(anchor_map.get("commit") or "").strip()
    if not commit:
        raise ValueError("pinned commit is required for canvas deep links")
    return build_canvas_deep_link(
        public_base_url=public_base_url,
        project_id=project_id,
        comment_id=comment_id,
        commit=commit,
        context=str(comment.get("context") or "PCB"),
        variant=variant,
        semantic_item_id=str(comment.get("semanticItemId") or "") or None,
    )


__all__ = [
    "DIFF_BY_DOMAIN",
    "VIEW_BY_CONTEXT",
    "build_canvas_deep_link",
    "build_comparison_deep_link",
    "build_prism_deep_link",
    "normalize_public_base_url",
]
