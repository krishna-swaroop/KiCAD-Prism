"""Provider capability flags reported by ``IssueTracker.capabilities()``.

Nothing on this record implies moderation of other people's content (D5).
Adapters must prove each flag with a fixture before claiming it.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProviderCapabilities(BaseModel):
    """Frozen capability DTO from ``docs/tracker-integration/dto-examples.json``."""

    model_config = ConfigDict(extra="forbid")

    provider: str
    canEditOwnComment: bool
    canDeleteOwnComment: bool
    canEditIssueBody: bool
    hasStateEvents: bool
    hasTransferEvents: bool
    supportsConditionalGet: bool
    maxAssignees: int = Field(ge=0)
    apiVersion: str
    instanceKind: Literal["github.com", "ghes", "gitlab", "gitea", "forgejo"]

    def to_dto(self) -> dict:
        return self.model_dump()


def github_com_capabilities(*, api_version: str = "2022-11-28") -> ProviderCapabilities:
    """Documented github.com defaults. GHES must not reuse this blindly."""

    return ProviderCapabilities(
        provider="github",
        canEditOwnComment=True,
        canDeleteOwnComment=True,
        canEditIssueBody=True,
        hasStateEvents=True,
        hasTransferEvents=True,
        supportsConditionalGet=True,
        maxAssignees=10,
        apiVersion=api_version,
        instanceKind="github.com",
    )


def require_capability(caps: ProviderCapabilities, flag: str) -> None:
    """Raise ``capability_missing`` when an adapter cannot honour a write."""

    from app.services.trackers.errors import ProviderError

    if not getattr(caps, flag):
        raise ProviderError(
            "capability_missing",
            f"Provider {caps.provider} does not support {flag}.",
        )


def redact_secret(value: Optional[str]) -> str:
    """Identity tokens and PEMs never appear in logs or exception text."""

    if not value:
        return ""
    return "<redacted>"
