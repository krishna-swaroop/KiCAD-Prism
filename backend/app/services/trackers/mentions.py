"""Privacy-safe mentions and forge assignee resolution (TR-22, D8/C4).

Mention tokens in comment content use ``@[Display Name](user:<id>)``. Legacy
``@email`` input is converted on ingest. Publication maps linked identities to
forge logins, applies ``can_assign``, and surfaces display-only warnings for
unlinked or unassignable users without failing draft creation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Iterable, Mapping, Optional, Sequence

MENTION_TOKEN_RE = re.compile(r"@\[([^\]]+)\]\(user:([^)]+)\)")
LEGACY_EMAIL_MENTION_RE = re.compile(
    r"@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})"
)
USER_ID_RE = re.compile(r"^[A-Za-z0-9._\-]+$")


@dataclass(frozen=True)
class Mention:
    user_id: str
    display_name: str

    def to_wire(self) -> dict[str, str]:
        return {"userId": self.user_id, "displayName": self.display_name}


@dataclass(frozen=True)
class MentionCandidate:
    user_id: str
    display_name: str
    role: str
    linked_providers: tuple[str, ...] = ()

    def to_wire(self) -> dict[str, object]:
        return {
            "userId": self.user_id,
            "displayName": self.display_name,
            "role": self.role,
            "linkedProviders": list(self.linked_providers),
        }


@dataclass(frozen=True)
class MentionAssignmentResult:
    prose_block: str
    assignees: list[str] = field(default_factory=list)
    assignment_hints: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def format_mention_token(display_name: str, user_id: str) -> str:
    name = (display_name or "").strip() or user_id
    return f"@[{name}](user:{user_id})"


def parse_mention_tokens(content: str) -> list[Mention]:
    mentions: list[Mention] = []
    seen: set[str] = set()
    for match in MENTION_TOKEN_RE.finditer(content or ""):
        user_id = (match.group(2) or "").strip()
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        display_name = (match.group(1) or "").strip() or user_id
        mentions.append(Mention(user_id=user_id, display_name=display_name))
    return mentions


def _looks_like_email(value: str) -> bool:
    return "@" in value and "." in value.split("@", 1)[-1]


def convert_legacy_email_mentions(
    content: str,
    *,
    email_index: Mapping[str, tuple[str, str]],
) -> tuple[str, list[Mention]]:
    """Replace legacy ``@email`` tokens with privacy-safe mention tokens."""

    mentions: list[Mention] = []
    seen: set[str] = set()

    def replace(match: re.Match[str]) -> str:
        email = (match.group(1) or "").strip().lower()
        mapped = email_index.get(email)
        if not mapped:
            return match.group(0)
        user_id, display_name = mapped
        if user_id not in seen:
            seen.add(user_id)
            mentions.append(Mention(user_id=user_id, display_name=display_name))
        return format_mention_token(display_name, user_id)

    converted = LEGACY_EMAIL_MENTION_RE.sub(replace, content or "")
    return converted, mentions


def normalize_incoming_mentions(
    *,
    content: str,
    raw_mentions: Optional[Sequence[object]],
    candidates_by_id: Mapping[str, MentionCandidate],
    email_index: Mapping[str, tuple[str, str]],
) -> tuple[str, list[Mention]]:
    """Normalize create/update payloads to mention tokens plus DTO rows."""

    converted, legacy = convert_legacy_email_mentions(content, email_index=email_index)
    merged: dict[str, Mention] = {item.user_id: item for item in legacy}
    for item in parse_mention_tokens(converted):
        merged[item.user_id] = item

    if raw_mentions:
        for raw in raw_mentions:
            if isinstance(raw, Mapping):
                user_id = str(raw.get("userId") or raw.get("user_id") or "").strip()
                display_name = str(raw.get("displayName") or raw.get("display_name") or "").strip()
            else:
                text = str(raw or "").strip()
                if not text:
                    continue
                if _looks_like_email(text):
                    mapped = email_index.get(text.lower())
                    if not mapped:
                        continue
                    user_id, display_name = mapped
                else:
                    user_id = text
                    candidate = candidates_by_id.get(user_id)
                    display_name = candidate.display_name if candidate else user_id
            if not user_id:
                continue
            candidate = candidates_by_id.get(user_id)
            if candidate is not None:
                display_name = candidate.display_name
            merged[user_id] = Mention(
                user_id=user_id,
                display_name=display_name or user_id,
            )

    mentions = list(merged.values())
    if mentions:
        converted = _ensure_tokens_in_content(converted, mentions)
    return converted, mentions


def _ensure_tokens_in_content(content: str, mentions: Iterable[Mention]) -> str:
    updated = content or ""
    for mention in mentions:
        token = format_mention_token(mention.display_name, mention.user_id)
        if token in updated:
            continue
        if MENTION_TOKEN_RE.search(updated):
            continue
        updated = f"{updated.rstrip()} {token}".strip()
    return updated


def storage_user_ids(mentions: Sequence[Mention]) -> list[str]:
    return [mention.user_id for mention in mentions]


def enrich_stored_mentions(
    raw: object,
    *,
    candidates_by_id: Mapping[str, MentionCandidate],
    email_index: Mapping[str, tuple[str, str]],
) -> list[dict[str, str]]:
    """Map persisted mention rows to the frozen wire DTO."""

    if raw is None:
        return []
    items: list[object]
    if isinstance(raw, str):
        try:
            import json

            parsed = json.loads(raw)
        except Exception:
            parsed = [raw]
        items = parsed if isinstance(parsed, list) else [parsed]
    elif isinstance(raw, list):
        items = raw
    else:
        items = [raw]

    mentions: list[Mention] = []
    seen: set[str] = set()
    for item in items:
        if isinstance(item, Mapping):
            user_id = str(item.get("userId") or item.get("user_id") or "").strip()
            display_name = str(item.get("displayName") or item.get("display_name") or "").strip()
            if user_id and user_id not in seen:
                seen.add(user_id)
                candidate = candidates_by_id.get(user_id)
                mentions.append(
                    Mention(
                        user_id=user_id,
                        display_name=candidate.display_name if candidate else (display_name or user_id),
                    )
                )
            continue
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        if _looks_like_email(text):
            mapped = email_index.get(text.lower())
            if mapped:
                user_id, display_name = mapped
                mentions.append(Mention(user_id=user_id, display_name=display_name))
            continue
        candidate = candidates_by_id.get(text)
        mentions.append(
            Mention(
                user_id=text,
                display_name=candidate.display_name if candidate else text,
            )
        )
    return [mention.to_wire() for mention in mentions]


def list_mention_candidates(conn: object) -> list[MentionCandidate]:
    rows = conn.execute(
        """
        SELECT
            u.user_id,
            COALESCE(NULLIF(TRIM(u.name), ''), SPLIT_PART(u.email, '@', 1)) AS display_name,
            ur.role,
            tc.provider
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN user_identities ui
            ON ui.user_id = u.user_id AND ui.status = 'active'
        LEFT JOIN tracker_connectors tc ON tc.id = ui.connector_id
        ORDER BY display_name ASC, u.user_id ASC
        """,
    ).fetchall()
    grouped: dict[str, dict[str, object]] = {}
    for row in rows:
        user_id = str(row["user_id"])
        bucket = grouped.setdefault(
            user_id,
            {
                "user_id": user_id,
                "display_name": str(row["display_name"] or user_id),
                "role": str(row["role"] or "viewer"),
                "providers": set(),
            },
        )
        provider = row.get("provider")
        if provider:
            bucket["providers"].add(str(provider))
    candidates = [
        MentionCandidate(
            user_id=str(item["user_id"]),
            display_name=str(item["display_name"]),
            role=str(item["role"]),
            linked_providers=tuple(sorted(item["providers"])),  # type: ignore[arg-type]
        )
        for item in grouped.values()
    ]
    return sorted(candidates, key=lambda item: (item.display_name.casefold(), item.user_id))


def build_candidate_indexes(
    candidates: Sequence[MentionCandidate],
    *,
    conn: object,
) -> tuple[dict[str, MentionCandidate], dict[str, tuple[str, str]]]:
    by_id = {candidate.user_id: candidate for candidate in candidates}
    rows = conn.execute("SELECT user_id, email, name FROM users").fetchall()
    email_index: dict[str, tuple[str, str]] = {}
    for row in rows:
        email = str(row["email"] or "").strip().lower()
        if not email:
            continue
        user_id = str(row["user_id"])
        candidate = by_id.get(user_id)
        display_name = candidate.display_name if candidate else str(row.get("name") or email.split("@", 1)[0])
        email_index[email] = (user_id, display_name)
    return by_id, email_index


def lookup_forge_logins(conn: object, *, connector_id: str, user_ids: Sequence[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    placeholders = ", ".join(["%s"] * len(user_ids))
    rows = conn.execute(
        f"""
        SELECT user_id, forge_login
        FROM user_identities
        WHERE connector_id = %s
          AND status = 'active'
          AND user_id IN ({placeholders})
        """,
        (connector_id, *user_ids),
    ).fetchall()
    return {str(row["user_id"]): str(row["forge_login"]) for row in rows}


def render_mention_token_for_forge(
    mention: Mention,
    *,
    forge_login: Optional[str],
) -> str:
    if forge_login:
        return f"@{forge_login}"
    return f"**{mention.display_name}**"


def resolve_mention_assignments(
    *,
    content: str,
    mentions: Sequence[Mention],
    forge_logins: Mapping[str, str],
    can_assign: Callable[[str], bool],
    max_assignees: int = 10,
) -> MentionAssignmentResult:
    """Apply the frozen multi-mention assignment policy for one draft."""

    prose = content or ""
    assignees: list[str] = []
    hints: list[str] = []
    warnings: list[str] = []
    overflow: list[str] = []

    for mention in mentions:
        login = forge_logins.get(mention.user_id)
        replacement = render_mention_token_for_forge(mention, forge_login=login)
        token = format_mention_token(mention.display_name, mention.user_id)
        prose = prose.replace(token, replacement)

        if not login:
            hint = f"Assignment hint: {mention.display_name} (not linked)"
            if hint not in hints:
                hints.append(hint)
            continue

        if not can_assign(login):
            warning = f"Cannot assign {login} on this destination"
            if warning not in warnings:
                warnings.append(warning)
            continue

        if len(assignees) < max(0, int(max_assignees)):
            if login not in assignees:
                assignees.append(login)
        elif login not in overflow:
            overflow.append(login)

    for login in overflow:
        hint = f"Assignment hint: @{login} (assignee limit reached)"
        if hint not in hints:
            hints.append(hint)

    return MentionAssignmentResult(
        prose_block=prose.strip(),
        assignees=assignees,
        assignment_hints=hints,
        warnings=warnings,
    )


__all__ = [
    "Mention",
    "MentionAssignmentResult",
    "MentionCandidate",
    "build_candidate_indexes",
    "convert_legacy_email_mentions",
    "enrich_stored_mentions",
    "format_mention_token",
    "list_mention_candidates",
    "lookup_forge_logins",
    "normalize_incoming_mentions",
    "parse_mention_tokens",
    "render_mention_token_for_forge",
    "resolve_mention_assignments",
    "storage_user_ids",
]
