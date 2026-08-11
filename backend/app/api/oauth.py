from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.services import rate_limit_service, service_client_service

router = APIRouter(prefix="/api/oauth", tags=["oauth"])


@router.post("/token")
async def token(
    request: Request,
    grant_type: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(...),
    scope: str = Form(default=""),
):
    if grant_type != "client_credentials":
        raise HTTPException(status_code=400, detail="Unsupported grant_type")

    # Bound secret-guessing against a machine client, keyed on the client id so one
    # noisy integration cannot lock out another.
    bucket = f"client_credentials:{client_id[:128]}"
    rate_limit_service.enforce(
        bucket,
        limit=settings.AUTH_LOGIN_RATE_LIMIT,
        window_seconds=settings.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    )

    payload = service_client_service.issue_client_credentials_token(
        client_id=client_id,
        client_secret=client_secret,
        requested_scope=scope,
    )
    rate_limit_service.clear(bucket)
    return JSONResponse(payload)
