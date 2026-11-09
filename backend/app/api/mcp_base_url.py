"""The public base URL the MCP endpoints advertise."""

from __future__ import annotations

from fastapi import Request

from app.core.config import settings


def base_url(request: Request) -> str:
    configured = settings.PUBLIC_BASE_URL.strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")
