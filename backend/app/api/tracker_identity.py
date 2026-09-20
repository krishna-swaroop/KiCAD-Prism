"""Session-user tracker identity OAuth routes (TR-21)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict

from app.core.security import AuthenticatedUser, get_current_user, require_admin
from app.services.public_url_service import resolve_public_base_url
from app.services.trackers.errors import ProviderError
from app.services.trackers.identity_service import (
    IdentityNotFound,
    IdentityService,
    OAuthStateError,
)
from app.services.trackers.secrets import SecretStoreLocked

router = APIRouter(prefix="/api/trackers", tags=["tracker-identities"])
admin_router = APIRouter(
    prefix="/api/admin/trackers",
    tags=["tracker-identities-admin"],
    dependencies=[Depends(require_admin)],
)
service = IdentityService()


class OAuthBeginResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    authorizeUrl: str


def _actor(user: AuthenticatedUser) -> str:
    return user.user_id or user.email


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, IdentityNotFound):
        return HTTPException(status_code=404, detail="Identity not found")
    if isinstance(exc, OAuthStateError):
        code = str(exc)
        if code == "session_expired":
            return HTTPException(
                status_code=409,
                detail={
                    "detail": "Your session changed during account linking. Sign in again and retry.",
                    "code": "session_expired",
                },
            )
        if code in {"cross_user_callback", "user_mismatch"}:
            return HTTPException(status_code=403, detail="OAuth callback does not match the signed-in user")
        return HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    if isinstance(exc, SecretStoreLocked):
        return HTTPException(status_code=503, detail="Tracker credential encryption is locked")
    if isinstance(exc, ProviderError):
        status = 409 if exc.class_ == "auth_lost" else 400
        return HTTPException(
            status_code=status,
            detail={"class": exc.class_, "message": exc.message, "retryable": exc.retryable},
        )
    raise exc


@router.get("/identities")
async def list_identities(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    if user.auth_type != "session":
        raise HTTPException(status_code=403, detail="Session required to list linked accounts")
    return service.list_identities(_actor(user))


@router.post("/connectors/{connector_id}/oauth/begin")
async def begin_oauth(
    connector_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> OAuthBeginResponse:
    if user.auth_type != "session":
        raise HTTPException(status_code=403, detail="Session required to link an account")
    base = resolve_public_base_url(request)
    callback_url = f"{base.rstrip('/')}/api/trackers/oauth/callback"
    try:
        payload = service.begin_oauth(
            user_id=_actor(user),
            session_id=user.session_id,
            connector_id=connector_id,
            callback_url=callback_url,
        )
    except Exception as exc:
        raise _http_error(exc) from exc
    return OAuthBeginResponse(authorizeUrl=payload["authorizeUrl"])


@router.get("/oauth/callback")
async def oauth_callback(
    request: Request,
    code: str = Query(default=""),
    state: str = Query(default=""),
    user: AuthenticatedUser = Depends(get_current_user),
):
    if user.auth_type != "session":
        raise HTTPException(status_code=403, detail="Session required to complete account linking")
    if not (code or "").strip() or not (state or "").strip():
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")
    try:
        identity = service.complete_oauth(
            code=code.strip(),
            state_token=state.strip(),
            session_id=user.session_id,
            actor_user_id=_actor(user),
        )
    except Exception as exc:
        raise _http_error(exc) from exc
    return JSONResponse({"linked": True, "identity": identity})


@router.delete("/identities/{connector_id}", status_code=204)
async def unlink_identity(
    connector_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    if user.auth_type != "session":
        raise HTTPException(status_code=403, detail="Session required to unlink an account")
    try:
        service.unlink(_actor(user), connector_id)
    except Exception as exc:
        raise _http_error(exc) from exc


@admin_router.post("/connectors/{connector_id}/identities/{user_id}/revoke")
async def admin_revoke_identity(
    connector_id: str,
    user_id: str,
    admin: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return service.admin_revoke(
            actor_user_id=_actor(admin),
            user_id=user_id,
            connector_id=connector_id,
        )
    except Exception as exc:
        raise _http_error(exc) from exc
