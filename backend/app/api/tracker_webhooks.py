"""Inbound GitHub webhook HTTP endpoint (TR-27)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.services.trackers.github_webhooks import (
    GitHubWebhookService,
    MAX_BODY_BYTES,
    WebhookRejected,
)

router = APIRouter(prefix="/api/trackers/webhooks", tags=["tracker-webhooks"])
service = GitHubWebhookService()


async def _read_body_with_limit(request: Request, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise WebhookRejected("payload_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/github/{connector_id}")
async def github_webhook(connector_id: str, request: Request) -> JSONResponse:
    raw = await _read_body_with_limit(request, MAX_BODY_BYTES)
    headers = dict(request.headers)
    try:
        # Secret decryption and the hint insert are blocking DB work; keep them
        # off the event loop like every other tracker route.
        result = await asyncio.to_thread(service.ingest, connector_id, headers, raw)
    except WebhookRejected as exc:
        reason = str(exc)
        if reason in {"invalid_signature", "webhook_not_configured"}:
            raise HTTPException(status_code=401, detail="Webhook signature verification failed") from exc
        if reason == "payload_too_large":
            raise HTTPException(status_code=413, detail="Webhook payload too large") from exc
        raise HTTPException(status_code=400, detail="Invalid webhook delivery") from exc
    return JSONResponse({"ok": True, **result})
