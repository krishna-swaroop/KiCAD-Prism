"""Write generated artifacts to disk safely.

Every write is LF-terminated UTF-8 without a byte order mark, on every platform.
CRLF in a shell script breaks the image build, CRLF in .env silently appends a
carriage return to PUBLIC_BASE_URL, and a BOM makes Caddy reject the first
directive. None of those are worth rediscovering, so encoding is not left to
whatever the host's default happens to be.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

SECRET_FILES = frozenset({".env"})


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalised = content.replace("\r\n", "\n")
    # newline="" stops Python from translating \n back to \r\n on Windows.
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(normalised)


def backup_existing(root: Path, paths: list[str]) -> Path | None:
    """Move any previously generated files aside before overwriting them."""
    existing = [root / path for path in paths if (root / path).exists()]
    if not existing:
        return None

    stamp = time.strftime("%Y%m%d-%H%M%S")
    destination = root / f"generated.bak.{stamp}"
    for source in existing:
        relative = source.relative_to(root)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return destination


def restrict_permissions(path: Path) -> str | None:
    """Limit a secret-bearing file to its owner. Returns a note on failure."""
    if os.name == "nt":
        user = os.environ.get("USERNAME")
        if not user:
            return "USERNAME is unset; could not restrict permissions."
        try:
            subprocess.run(
                ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:(R,W)"],
                check=True,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            return f"Could not restrict permissions with icacls: {exc}"
        return None

    try:
        path.chmod(0o600)
    except OSError as exc:
        return f"Could not chmod 600: {exc}"
    return None


def apply(root: Path, files: dict[str, str], *, dry_run: bool = False) -> tuple[Path | None, list[str]]:
    """Write every artifact. Returns (backup directory, permission warnings)."""
    if dry_run:
        return None, []

    backup = backup_existing(root, sorted(files))
    warnings: list[str] = []

    for relative, content in sorted(files.items()):
        target = root / relative
        write_text(target, content)
        if target.name in SECRET_FILES:
            problem = restrict_permissions(target)
            if problem:
                warnings.append(problem)

    return backup, warnings


def load_existing_env(path: Path) -> dict[str, str]:
    """Read a previously generated .env so a re-run can reuse its secrets."""
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value
    return values
