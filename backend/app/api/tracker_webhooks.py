"""Inbound GitHub webhook HTTP endpoint (TR-27)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.services.trackers.github_webhooks import GitHubWebhookService, WebhookRejected

router = APIRouter(prefix="/api/trackers/webhooks", tags=["tracker-webhooks"])
service = GitHubWebhookService()


@router.post("/github/{connector_id}")
async def github_webhook(connector_id: str, request: Request) -> JSONResponse:
    raw = await request.body()
    try:
        result = service.ingest(connector_id, dict(request.headers), raw)
    except WebhookRejected as exc:
        reason = str(exc)
        if reason in {"invalid_signature", "webhook_not_configured"}:
            raise HTTPException(status_code=401, detail="Webhook signature verification failed") from exc
        if reason == "payload_too_large":
            raise HTTPException(status_code=413, detail="Webhook payload too large") from exc
        raise HTTPException(status_code=400, detail="Invalid webhook delivery") from exc
    return JSONResponse({"ok": True, **result})
