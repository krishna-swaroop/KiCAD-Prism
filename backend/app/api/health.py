from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.services.postgres_database import database


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])


def build_metadata() -> dict[str, str]:
    return {
        "release": os.environ.get("PRISM_RELEASE", "development"),
        "revision": os.environ.get("PRISM_REVISION", "unknown"),
        "buildDate": os.environ.get("PRISM_BUILD_DATE", "unknown"),
    }


def readiness_status(projects_root: str | None = None) -> tuple[bool, dict[str, str]]:
    checks: dict[str, str] = {}

    try:
        with database.connection() as connection:
            row = connection.execute("SELECT 1 AS ready").fetchone()
        checks["database"] = "ok" if row is not None else "failed"
    except Exception:
        # Do not include the exception: database errors can contain credentials.
        logger.warning("Prism readiness database check failed")
        checks["database"] = "failed"

    root = Path(projects_root or settings.KICAD_PROJECTS_ROOT)
    checks["projects"] = (
        "ok"
        if root.is_dir() and os.access(root, os.R_OK | os.W_OK | os.X_OK)
        else "failed"
    )

    return all(value == "ok" for value in checks.values()), checks


def health_payload(status: str, *, checks: dict[str, str] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": status, **build_metadata()}
    if checks is not None:
        payload["checks"] = checks
    return payload


@router.get("/live")
def live() -> dict[str, Any]:
    return health_payload("ok")


@router.get("/ready")
def ready() -> dict[str, Any]:
    is_ready, checks = readiness_status()
    payload = health_payload("ready" if is_ready else "not_ready", checks=checks)
    if not is_ready:
        raise HTTPException(status_code=503, detail=payload)
    return payload
