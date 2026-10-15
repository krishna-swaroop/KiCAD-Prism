"""Retention for Simulation Studio runs: rows, run folders and their inputs.

A run folder holds its input ``board.prism`` and the engine's output; nothing
removed old runs, and inputs were often private copies of the same bundle.
Artifact maintenance runs this once a day.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from app.core.config import settings
from app.sim_studio.run_store import RunStore
from app.sim_studio.runs import run_dir, sim_root


def prune_runs(store: RunStore | None = None) -> dict[str, int]:
    store = store or RunStore()
    removed = store.prune(keep_succeeded=settings.PRISM_SIM_SUCCEEDED_RUNS_KEPT)
    folders = 0
    for run_id in removed:
        folder = run_dir(run_id)
        if folder.is_dir():
            shutil.rmtree(folder, ignore_errors=True)
            folders += 1
    folders += _remove_orphan_runs(sim_root() / "runs", store.ids())
    return {"sim_runs_pruned": len(removed), "sim_run_folders_removed": folders, **_share_inputs(store.bundles())}


def _remove_orphan_runs(root: Path, known: set[str]) -> int:
    """Run folders with no row (deleted projects, rows removed by hand)."""

    if not root.is_dir():
        return 0
    removed = 0
    for folder in root.iterdir():
        if folder.is_dir() and folder.name not in known:
            shutil.rmtree(folder, ignore_errors=True)
            removed += 1
    return removed


def _share_inputs(bundles: dict[str, str]) -> dict[str, int]:
    """Hard-link runs' identical input bundles to one file (same recorded sha256)."""

    first: dict[str, Path] = {}
    linked = 0
    reclaimed = 0
    for run_id, digest in sorted(bundles.items()):
        path = run_dir(run_id) / "input" / "board.prism"
        try:
            stat = path.stat()
        except OSError:
            continue
        keep = first.setdefault(digest, path)
        if keep == path:
            continue
        try:
            if os.path.samefile(keep, path) or keep.stat().st_size != stat.st_size:
                continue
            partial = path.with_name(".board.prism.link")
            partial.unlink(missing_ok=True)
            os.link(keep, partial)
            partial.replace(path)
        except OSError:
            continue
        linked += 1
        reclaimed += stat.st_size
    return {"sim_inputs_linked": linked, "sim_input_bytes_reclaimed": reclaimed}
