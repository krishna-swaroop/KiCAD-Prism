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


def repo_fingerprint(repo_path: Optional[str]) -> str:
    """Identify the repository state the stored commit/tag was read at.

    Deliberately separate from ``source_fingerprint``. A push moves HEAD
    without touching the checked-out board, and a tag can be added without
    moving HEAD at all; neither should trigger the ~30 s kicad-cli pass that
    the file fingerprint guards. Reading HEAD and counting tags costs about
    16 ms against the ~290 ms of Git work it decides whether to repeat.
    """
    if not repo_path:
        return ""
    try:
        from git import Repo

        repo = Repo(repo_path)
        head = repo.head.commit.hexsha if repo.head.is_valid() else "unborn"
        # Tag count and tip name together: a tag added or moved changes one or
        # the other, and neither requires walking the tag objects.
        tags = sorted(tag.name for tag in repo.tags)
        digest = hashlib.sha256(
            "|".join([head, str(len(tags)), tags[-1] if tags else "-"]).encode("utf-8")
        ).hexdigest()
        return digest
    except Exception as error:  # pragma: no cover - depends on the checkout
        logger.warning("Could not fingerprint repository %s: %s", repo_path, error)
        return ""


def compute_repository_facts(repo_path: str, relative_path: Optional[str]) -> dict[str, Any]:
    """The latest commit and tag the card shows.

    ``get_releases_filtered`` counts files under the subproject path for every
    tag, so this grows with the tag list -- which is exactly why it belongs in
    a job rather than in the request that opens a panel.
    """
    from app.services.git_service import (
        get_commits_list,
        get_commits_list_filtered,
        get_releases,
        get_releases_filtered,
    )

    if relative_path:
        releases = get_releases_filtered(repo_path, relative_path)
        latest_page = get_commits_list_filtered(repo_path, relative_path, 1)
    else:
        releases = get_releases(repo_path)
        latest_page = get_commits_list(repo_path, 1)

    latest_commits = latest_page["commits"] if isinstance(latest_page, dict) else latest_page
    return {
        "latest_commit": latest_commits[0] if latest_commits else None,
        "latest_tag": releases[0] if releases else None,
    }


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
    repo_path: Optional[str] = None,
    relative_path: Optional[str] = None,
) -> dict[str, Any]:
    """Recompute and store one project's metadata.

    The two halves are refreshed independently. File metadata is reused when
    the files have not changed, because recomputing it means another kicad-cli
    pass -- 30 s on a large board -- and a push that only moved HEAD is not a
    reason to pay it. Repository facts are always recomputed: they are the
    cheap half and they are what a push actually changes.
    """
    stored = workspace.get_project_metadata(project_id)
    files_fingerprint = source_fingerprint(schematic_path, pcb_path)

    if stored and str(stored.get("source_fingerprint") or "") == files_fingerprint:
        computed: dict[str, Any] = {
            "schematic": stored.get("schematic"),
            "pcb": stored.get("pcb"),
            "source_fingerprint": files_fingerprint,
            "board_stats_source": str(stored.get("board_stats_source") or ""),
            "reused_file_metadata": True,
        }
    else:
        computed = compute_project_metadata(project_path, schematic_path, pcb_path)
        computed["reused_file_metadata"] = False

    repository: Optional[dict[str, Any]] = None
    if repo_path:
        try:
            repository = compute_repository_facts(repo_path, relative_path)
        except Exception as error:
            # A card without a commit line beats a job that fails and leaves
            # the whole row unwritten.
            logger.warning("Could not read repository facts for %s: %s", project_id, error)

    computed["repository"] = repository
    computed["repo_fingerprint"] = repo_fingerprint(repo_path)

    workspace.upsert_project_metadata(
        project_id,
        schematic=computed["schematic"],
        pcb=computed["pcb"],
        source_fingerprint=computed["source_fingerprint"],
        board_stats_source=computed["board_stats_source"],
        repository=repository,
        repo_fingerprint=computed["repo_fingerprint"],
    )
    return computed


def stored_metadata_is_current(
    project_id: str,
    schematic_path: Optional[str],
    pcb_path: Optional[str],
    repo_path: Optional[str] = None,
) -> tuple[Optional[dict[str, Any]], bool]:
    """Return the stored row and whether it still describes the project.

    Stale on either axis: the files may have changed, or the repository may
    have moved. Both are cheap to check -- two ``stat`` calls and a HEAD read.
    """
    record = workspace.get_project_metadata(project_id)
    if not record:
        return None, False

    files_current = str(record.get("source_fingerprint") or "") == source_fingerprint(
        schematic_path, pcb_path
    )
    repo_current = str(record.get("repo_fingerprint") or "") == repo_fingerprint(repo_path)
    return record, files_current and repo_current
