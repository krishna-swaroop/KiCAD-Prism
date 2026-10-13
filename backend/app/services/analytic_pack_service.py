"""Analytic board pack beside the semantic 3D bundle.

When ``PRISM_ANALYTIC_PCB_ENABLED`` is set, the 3D job also asks the
``prism-kicad-native`` helper for a ``kicad_monkey.materialization.a0`` pack
of the same board revision. The viewer draws the board from it, and
Simulation Studio reuses it. A failed pack never fails the 3D job: the mesh
board still renders.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict

from app.core.config import settings
from app.services.kicad_tools import native_geometry_helper

PACK_FILE = "board.kmpack"
PACK_SCHEMA = "kicad_monkey.materialization.a0"


def enabled() -> bool:
    return bool(settings.PRISM_ANALYTIC_PCB_ENABLED)


def update_fingerprint(hasher) -> None:
    """Rebuild cached bundles when the pack is switched on or its helper changes."""
    if not enabled():
        return
    hasher.update(b"analytic-pack-a0")
    helper = native_geometry_helper()
    if helper.is_file():
        hasher.update(helper.read_bytes())


def write_pack(project_file: Path, output_dir: Path, log: list[str]) -> Dict[str, Any] | None:
    """Writes ``board.kmpack`` into ``output_dir`` and returns its bundle entry."""
    pcb = project_file.with_suffix(".kicad_pcb")
    helper = native_geometry_helper()
    if not pcb.is_file():
        log.append(f"Analytic pack skipped: no board file {pcb.name}")
        return None
    if not helper.is_file():
        log.append(f"Analytic pack skipped: helper not found at {helper}")
        return None
    target = output_dir / PACK_FILE
    command = [str(helper), "emit-pack", "--pcb", str(pcb), "--output", str(target)]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=_timeout_seconds(),
            check=False,
        )
    except subprocess.TimeoutExpired:
        log.append("Analytic pack failed: helper timed out")
        target.unlink(missing_ok=True)
        return None
    if completed.returncode != 0:
        log.append(f"Analytic pack failed: {completed.stderr.strip() or completed.returncode}")
        target.unlink(missing_ok=True)
        return None
    metrics = _metrics(completed.stdout)
    log.append(f"Analytic pack written: {json.dumps(metrics, sort_keys=True)}")
    data = target.read_bytes()
    return {
        "schema": PACK_SCHEMA,
        "path": PACK_FILE,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "operations": metrics.get("operations"),
    }


def validate_entry(root: Path, entry: Any) -> None:
    if entry is None:
        return
    if not isinstance(entry, dict) or entry.get("path") != PACK_FILE:
        raise RuntimeError("Invalid analytic pack entry")
    path = root / PACK_FILE
    if not path.is_file() or path.stat().st_size != entry.get("bytes"):
        raise RuntimeError(f"Missing analytic pack asset: {PACK_FILE}")


def _timeout_seconds() -> float:
    try:
        return max(1.0, float(os.environ.get("PRISM_KICAD_NATIVE_TIMEOUT_SECONDS", "300")))
    except ValueError:
        return 300.0


def _metrics(stdout: str) -> Dict[str, Any]:
    for line in reversed(stdout.splitlines()):
        try:
            value = json.loads(line)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    return {}
