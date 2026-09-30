"""Build identity for images the installer builds from this checkout.

Published release images carry PRISM_RELEASE, PRISM_REVISION and
PRISM_BUILD_DATE from CI. An image built from source gets them here instead,
so the About dialog and bug reports name the commit it was built from rather
than ``development`` / ``unknown``.
"""

from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

GIT_TIMEOUT_SECONDS = 10


def _git(root: Path, *args: str) -> str | None:
    try:
        done = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    value = done.stdout.strip()
    return value if done.returncode == 0 and value else None


def source_build_identity(root: Path, *, now: datetime | None = None) -> dict[str, str]:
    """PRISM_* build arguments describing this checkout; empty values are omitted."""
    identity: dict[str, str] = {}
    release = _git(root, "describe", "--tags", "--always", "--dirty")
    revision = _git(root, "rev-parse", "HEAD")
    if release:
        identity["PRISM_RELEASE"] = release
    if revision:
        identity["PRISM_REVISION"] = revision
    identity["PRISM_BUILD_DATE"] = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return identity


def compose_environment(root: Path) -> dict[str, str]:
    """The environment for Compose commands: this checkout's identity, then the
    caller's environment, so a value the operator exported still wins."""
    return {**source_build_identity(root), **os.environ}
