from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.security import AuthenticatedUser, require_viewer
from app.services.postgres_database import database


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])


def build_metadata() -> dict[str, str]:
    return {
        "release": os.environ.get("PRISM_RELEASE", "development"),
        "revision": os.environ.get("PRISM_REVISION", "unknown"),
        "buildDate": os.environ.get("PRISM_BUILD_DATE", "unknown"),
    }


KICAD_CLI_VERSION_TIMEOUT_SECONDS = 10
_kicad_cli_version_lock = threading.Lock()
_kicad_cli_version: str | None = None


def kicad_cli_version() -> str:
    """Return the backend's ``kicad-cli --version``, cached once it resolves.

    A missing binary is not cached, so a later install is picked up without a
    restart. Only the first output line is kept: it is the bare version number,
    and nothing after it is useful in a bug report.
    """
    global _kicad_cli_version
    with _kicad_cli_version_lock:
        if _kicad_cli_version is not None:
            return _kicad_cli_version
        cli = shutil.which("kicad-cli")
        if not cli:
            return "unavailable"
        try:
            result = subprocess.run(
                [cli, "--version"],
                capture_output=True,
                text=True,
                timeout=KICAD_CLI_VERSION_TIMEOUT_SECONDS,
                check=False,
            )
            lines = (result.stdout or "").strip().splitlines()
            version = lines[0].strip() if result.returncode == 0 and lines else "unknown"
        except (OSError, subprocess.TimeoutExpired):
            version = "unknown"
        _kicad_cli_version = version
        return version


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


@router.get("/about")
def about(_user: AuthenticatedUser = Depends(require_viewer)) -> dict[str, str]:
    """Build and toolchain identity for the About dialog and bug reports.

    Signed-in only: unlike the release fields on the probes, the KiCad version
    says something about the host that anonymous callers do not need.
    """
    return {**build_metadata(), "kicadCli": kicad_cli_version()}
