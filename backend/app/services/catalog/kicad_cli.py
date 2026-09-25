"""Locate and invoke ``kicad-cli`` for catalog rendering and normalization."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess

from app.services.catalog.runtime import CatalogRuntime


KICAD_CLI_TIMEOUT_SECONDS = 60
KICAD_CLI_VERSION_TIMEOUT_SECONDS = 10


class KicadCliRunner:
    """Stateless ``kicad-cli`` access using the runtime for discovery caches."""

    @staticmethod
    def resolve(runtime: CatalogRuntime) -> str | None:
        if runtime.kicad_cli and Path(runtime.kicad_cli).exists():
            return runtime.kicad_cli
        candidates = (
            shutil.which("kicad-cli"),
            "/usr/bin/kicad-cli",
            "/usr/local/bin/kicad-cli",
            "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
            os.path.expanduser("~/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"),
        )
        for candidate in candidates:
            if candidate and Path(candidate).exists():
                runtime.kicad_cli = str(candidate)
                return runtime.kicad_cli
        return None

    @staticmethod
    def run(runtime: CatalogRuntime, args: list[str]) -> tuple[bool, str]:
        cli = KicadCliRunner.resolve(runtime)
        if not cli:
            return False, "kicad-cli is not available in the backend runtime"
        try:
            result = subprocess.run(
                [cli, *args],
                capture_output=True,
                text=True,
                timeout=KICAD_CLI_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return False, f"kicad-cli timed out after {KICAD_CLI_TIMEOUT_SECONDS} seconds"
        if result.returncode != 0:
            return False, (
                result.stderr or result.stdout or f"kicad-cli exited with code {result.returncode}"
            ).strip()
        return True, ""

    @staticmethod
    def version(runtime: CatalogRuntime) -> str:
        """Return the cached tool version, ``unavailable`` when no binary resolves.

        An unavailable binary is deliberately not cached so a later install is
        picked up without restarting the process.
        """
        cli = KicadCliRunner.resolve(runtime)
        if not cli:
            return "unavailable"
        if runtime.kicad_cli_version is not None:
            return runtime.kicad_cli_version
        try:
            result = subprocess.run(
                [cli, "--version"],
                capture_output=True,
                text=True,
                timeout=KICAD_CLI_VERSION_TIMEOUT_SECONDS,
                check=False,
            )
            version = (result.stdout or result.stderr or "unknown").strip() or "unknown"
        except (OSError, subprocess.TimeoutExpired):
            version = "unknown"
        runtime.kicad_cli_version = version
        return version


__all__ = [
    "KICAD_CLI_TIMEOUT_SECONDS",
    "KICAD_CLI_VERSION_TIMEOUT_SECONDS",
    "KicadCliRunner",
]
