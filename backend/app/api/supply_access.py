"""Access shared by the supply endpoints that both writers and approvers use."""

from __future__ import annotations

from fastapi import Depends, HTTPException

from app.core import policy
from app.core.security import AuthenticatedUser, require_supply_reader


async def require_supply_editor(user: AuthenticatedUser = Depends(require_supply_reader)) -> AuthenticatedUser:
    """Whoever may propose supply decisions: the people who write supply data and the people who approve it."""

    # The token side is a writer's; the role may be a writer's or an approver's (QA proposes too, through an agent as well).
    refused = policy.refusal(user, "supply_write", check_role=False)
    if refused:
        raise HTTPException(status_code=403, detail=refused)
    if not (policy.role_allows(user.role, "supply_write") or policy.role_allows(user.role, "supply_approve")):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user


def is_approver(user: AuthenticatedUser) -> bool:
    """Whether this caller's decisions stand without a second person: an approver's role, and a person, not an agent."""

    return policy.allows(user, "supply_approve")
