"""Shared kicad-cli resolver for all backend services."""

from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path


def resolve() -> str:
    """Return the kicad-cli path, raising RuntimeError if not found."""
    result = _resolve()
    if not result:
        raise RuntimeError(
            "Missing required executable: kicad-cli. "
            "Install KiCad or set the KICAD_CLI_PATH environment variable."
        )
    return result


def resolve_optional() -> str | None:
    """Return the kicad-cli path, or None if not found."""
    return _resolve()


def _version_key(p: Path) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in p.name.split("."))
    except ValueError:
        return (0,)


def _resolve() -> str | None:
    # 1. Explicit env override
    for var in ("KICAD_CLI_PATH", "KICAD_CLI"):
        val = os.environ.get(var, "").strip()
        if val and Path(val).is_file():
            return val

    # 2. PATH
    found = shutil.which("kicad-cli")
    if found:
        return found

    # 3. Platform-specific well-known locations
    system = platform.system()
    if system == "Windows":
        kicad_root = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "KiCad"
        if kicad_root.is_dir():
            for version_dir in sorted(
                kicad_root.iterdir(), key=_version_key, reverse=True
            ):
                candidate = version_dir / "bin" / "kicad-cli.exe"
                if candidate.is_file():
                    return str(candidate)
    elif system == "Darwin":
        for candidate in (
            "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
            Path.home() / "Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
        ):
            if Path(candidate).is_file():
                return str(candidate)
    else:
        for candidate in ("/usr/bin/kicad-cli", "/usr/local/bin/kicad-cli"):
            if Path(candidate).is_file():
                return candidate

    return None
