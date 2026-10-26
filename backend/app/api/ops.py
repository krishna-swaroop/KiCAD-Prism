"""Admin diagnostics under ``/api/ops`` (ADR scripting-and-mcp §11).

Every route here needs ``PRISM_MCP_OPS_ENABLED`` (otherwise 404) and the
``ops_read`` or ``ops_act`` policy action: an admin, and for a bearer token the
``ops:read`` or ``ops:act`` scope. Results carry identifiers, timings, counts
and sizes, never design content, and every free-text field passes through
``app.core.redaction`` (D22). The MCP ops tools call these routes, so the same
checks and the same token-activity audit apply to both.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core import policy
from app.core.security import AuthenticatedUser, require_ops_reader
from app.services.mcp import registry

router = APIRouter(prefix="/api/ops", tags=["ops"])


class OpsStatus(BaseModel):
    enabled: bool
    #: The ops scopes the caller's token holds; empty for a browser session.
    scopes: list[str]
    #: The ops tools an MCP client can list.
    tools: list[str]


@router.get("/status", response_model=OpsStatus, summary="Whether ops diagnostics are on, and for whom")
async def ops_status(user: AuthenticatedUser = Depends(require_ops_reader)) -> OpsStatus:
    held = policy.effective_scopes(user.scopes)
    return OpsStatus(
        enabled=True,
        scopes=[scope for scope in policy.OPS_SCOPES if scope in held],
        tools=[tool.name for tool in registry.tools() if tool.ops],
    )


__all__ = ["router"]
