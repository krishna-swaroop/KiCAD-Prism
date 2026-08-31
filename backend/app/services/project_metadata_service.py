"""Compute and store the descriptive metadata behind the project card.

The workspace preview panel used to call an endpoint that read both KiCad
files and scanned them on every open. The facts it wants -- header fields and
board size -- change only when the files change, so they are computed once per
import or sync and stored. ``/properties`` is then a single row read.

Board size comes from ``kicad-cli``; header fields come from a bounded read of
the file's first 256 KB. Neither is derived from a full-file scan of our own.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import Any, Optional

from app.services import kicad_board_stats_service, project_properties_service
from app.services.workspace_service import workspace


logger = logging.getLogger(__name__)


def source_fingerprint(schematic_path: Optional[str], pcb_path: Optional[str]) -> str:
    """Identify the inputs a stored row was computed from.

    Size and mtime rather than a content hash: hashing a 57 MB board to decide
    whether to re-read it would cost more than the read it is guarding. The
    pair is enough to notice a sync that changed either file, which is the only
    event that can invalidate a row.
    """
    parts: list[str] = []
    for label, path in (("sch", schematic_path), ("pcb", pcb_path)):
        if not path:
            parts.append(f"{label}:-")
            continue
        try:
            stat = os.stat(path)
        except OSError:
            parts.append(f"{label}:missing")
            continue
        parts.append(f"{label}:{Path(path).name}:{stat.st_size}:{stat.st_mtime_ns}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def compute_project_metadata(
    project_path: str,
    schematic_path: Optional[str],
    pcb_path: Optional[str],
) -> dict[str, Any]:
    """Read what the files say about themselves.

    kicad-cli failure is not an error here. A deployment without the toolchain,
    or a board it refuses, still yields a usable card -- one without a size on
    it. Failing the whole job would leave the panel with nothing at all, which
    is strictly worse and would also make the toolchain a hard dependency of
    browsing the workspace.
    """
    board_facts: dict[str, Any] = {}
    stats_source = ""
    if pcb_path:
        try:
            stats = kicad_board_stats_service.export_board_stats(pcb_path)
            board_facts = kicad_board_stats_service.board_facts(stats)
            stats_source = kicad_board_stats_service.SOURCE
        except kicad_board_stats_service.BoardStatsUnavailable as error:
            logger.warning("Board statistics unavailable for %s: %s", pcb_path, error)

    return {
        "schematic": project_properties_service.compute_schematic_metadata(
            project_path, schematic_path
        ),
        "pcb": project_properties_service.compute_pcb_metadata(
            project_path, pcb_path, board_facts
        ),
        "source_fingerprint": source_fingerprint(schematic_path, pcb_path),
        "board_stats_source": stats_source,
    }


def refresh_project_metadata(
    project_id: str,
    project_path: str,
    schematic_path: Optional[str],
    pcb_path: Optional[str],
) -> dict[str, Any]:
    """Recompute and store one project's metadata."""
    computed = compute_project_metadata(project_path, schematic_path, pcb_path)
    workspace.upsert_project_metadata(
        project_id,
        schematic=computed["schematic"],
        pcb=computed["pcb"],
        source_fingerprint=computed["source_fingerprint"],
        board_stats_source=computed["board_stats_source"],
    )
    return computed


def stored_metadata_is_current(
    project_id: str,
    schematic_path: Optional[str],
    pcb_path: Optional[str],
) -> tuple[Optional[dict[str, Any]], bool]:
    """Return the stored row and whether it still matches the files on disk."""
    record = workspace.get_project_metadata(project_id)
    if not record:
        return None, False
    expected = source_fingerprint(schematic_path, pcb_path)
    return record, str(record.get("source_fingerprint") or "") == expected
