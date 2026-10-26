"""Personal access token management (ADR scripting-and-mcp §3.6).

A signed-in person creates a scoped, expiring token for scripts and CI. Tokens
are minted from a browser session only: a token cannot mint another token. The
secret is returned once; every listing omits both the secret and its hash.
"""

from __future__ import annotations

import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.core import policy
from app.core.config import settings
from app.core.errors import Conflict, Forbidden
from app.core.security import AuthenticatedUser, require_admin, require_viewer
from app.services import personal_tokens

router = APIRouter(prefix="/api/auth/tokens", tags=["auth"])


class PersonalTokenView(BaseModel):
    """A token as its owner (or an admin) may see it: no secret, no hash."""

    id: str
    user_email: str
    name: str
    scopes: list[str]
    prefix: str
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class CreatedPersonalToken(PersonalTokenView):
    """The one response that carries the secret, shown once."""

    token: str


class CreatePersonalTokenRequest(BaseModel):
    name: str
    scopes: list[str]
    expiresInDays: int = 90


@router.get("", response_model=list[PersonalTokenView])
async def list_personal_tokens(
    user: AuthenticatedUser = Depends(require_viewer),
) -> list[dict]:
    """The caller's own tokens."""
    return await asyncio.to_thread(personal_tokens.list_for, user.email)


@router.post("", response_model=CreatedPersonalToken)
async def create_personal_token(
    body: CreatePersonalTokenRequest,
    user: AuthenticatedUser = Depends(require_viewer),
) -> dict:
    """Create a token for the signed-in person and show its secret once."""
    if not settings.AUTH_ENABLED:
        raise Conflict("Authentication is disabled", code="auth_disabled")
    if user.auth_type != "session":
        raise Forbidden(
            "Personal access tokens must be created from a signed-in browser",
            code="session_required",
        )

    # Ops scopes are for admins (ADR scripting-and-mcp D20); the policy check at
    # call time would refuse anyone else anyway, so refuse the token up front.
    if set(body.scopes) & set(policy.OPS_SCOPES) and not policy.role_allows(user.role, "ops_read"):
        raise Forbidden("Ops scopes need the admin role", code="ops-admin-only")

    row, token = await asyncio.to_thread(
        personal_tokens.create,
        user.email,
        body.name,
        body.scopes,
        body.expiresInDays,
    )
    return {**row, "token": token}


@router.delete("/{token_id}", status_code=204, response_model=None)
async def revoke_personal_token(
    token_id: str,
    user: AuthenticatedUser = Depends(require_viewer),
) -> Response:
    """Revoke a token the caller owns, or any token when the caller is an admin."""
    await asyncio.to_thread(
        personal_tokens.revoke,
        token_id,
        by_email=user.email,
        is_admin=policy.role_allows(user.role, "admin"),
    )
    return Response(status_code=204)


@router.get("/all", response_model=list[PersonalTokenView])
async def list_all_personal_tokens(
    _user: AuthenticatedUser = Depends(require_admin),
) -> list[dict]:
    """Every person's tokens, for an administrator."""
    return await asyncio.to_thread(personal_tokens.list_all)
