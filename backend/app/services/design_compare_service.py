"""Design Comparison service — connectivity semantics plus ecad-viewer object deltas."""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import multiprocessing
import tempfile
import threading
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from app.core.config import settings
from app.services import (
    bom_diff_service,
    design_compare_occurrences as occurrences,
    document_diff_service,
    fabrication_compare_service,
    project_revision,
    semantic_index_service,
)
from app.services.design_compare_benchmark import DesignCompareBenchmark
from app.services.job_artifact_service import job_artifacts
from app.services.job_kinds import JobKind, JobSubject, repository_lock
from app.services.job_runtime import JobContext, JobResult, job_state_root
from app.services.job_service import jobs as v3_jobs
from app.services.workspace_service import workspace

# The pure computation lives in four sibling modules; the job orchestration,
# caching and snapshotting stay here.
from .design_compare_sources import (
    _find_pcb,
    _find_pro,
    _list_kicad_sources,
)
from .design_compare_semantics import (
    _connectivity_changes,
    _summary,
)
from .design_compare_nodes import (
    _hydrate_native_targets,
    _node_changes,
    _route_metrics_from_digest,
)
from .design_compare_artifacts import (
    _diff_fabrication,
    _diff_stackup,
    _empty_fabrication,
    _extract_stackup,
    _manifest_entry,
)

logger = logging.getLogger(__name__)

# Defaults land in the platform temporary directory rather than a literal
# `/tmp`, which does not exist on Windows.
_CACHE_ROOT = Path(
    settings.PRISM_DESIGN_COMPARE_CACHE
    or Path(tempfile.gettempdir()) / "prism_design_compare_cache"
)
_CACHE_SCHEMA = "prism.design_compare_revision_v13"
_INITIAL_CACHE_SCHEMA = "prism.design_compare_revision_initial_v3"
_CACHE_LOCKS: Dict[str, threading.Lock] = {}
_CACHE_LOCKS_GUARD = threading.Lock()


def _snapshot_commit(repo_path: Path, commit: str, destination: Path, relative_path: Optional[str]) -> None:
    """Materialize only comparison inputs, flattened to the project directory."""
    if destination.exists():
        shutil.rmtree(destination)
    written = project_revision.materialize(
        repo_path,
        commit,
        destination,
        source_set=project_revision.COMPARE_INPUTS,
        scope=relative_path or "",
        strip_scope=True,
    )
    if not written.files:
        raise RuntimeError(f"No KiCad design inputs found at {commit}")


def _project_anchor(project_id: str) -> Optional[str]:
    """Return this project's own KiCad project file, failing closed.

    A missing workspace row or a database error must abort comparison work. If
    either were treated as an unanchored project, source discovery would fall
    back to the first co-located board and could cache a sibling's design.
    """

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError(f"Project '{project_id}' not found")
    return str(row.get("project_file_rel") or "").strip() or None


def _project_cache_namespace(project_id: str) -> str:
    """Keep caches for different anchors of a stable project id separate."""

    anchor = _project_anchor(project_id) or ""
    anchor_digest = hashlib.sha256(anchor.encode("utf-8")).hexdigest()[:16]
    return f"{project_id}-{anchor_digest}"


def _cache_dir(project_id: str, commit: str) -> Path:
    namespace = _project_cache_namespace(project_id)
    _touch_cache_entry(namespace, commit)
    entry = _CACHE_ROOT / namespace / commit
    tag = semantic_index_service.generator_cache_tag()
    # A commit's entry kept one copy per generator build (sources, Gerbers,
    # parse caches); only the current build's is ever read.
    if entry.is_dir():
        for stale in entry.iterdir():
            if stale.is_dir() and stale.name != tag:
                shutil.rmtree(stale, ignore_errors=True)
    return entry / tag


def _touch_cache_entry(project_namespace: str, commit: str) -> None:
    """Stamp a cache entry as used, so eviction can rank by last use.

    Eviction ranks whole ``project/commit`` entries by that directory's mtime.
    Writing a snapshot does not update it: a directory's mtime changes when its
    own entries change, not when something deeper down does, so the build only
    ever touches ``commit/<tag>/snapshot``. Left alone the entry's mtime is its
    creation time, which makes eviction FIFO -- and the commit everyone diffs
    against is usually the oldest, so it would be evicted first and every
    comparison against it would pay the cold path. Stamping here, at the single
    choke point every reader and writer goes through, makes it a real LRU.
    """

    entry = _CACHE_ROOT / project_namespace / commit
    try:
        if entry.is_dir():
            os.utime(entry, None)
    except OSError:
        # Losing a timestamp only degrades eviction order; never fail a compare.
        pass


def _cache_lock(project_id: str, commit: str) -> threading.Lock:
    namespace = _project_cache_namespace(project_id)
    key = f"{namespace}:{commit}:{semantic_index_service.generator_cache_tag()}"
    with _CACHE_LOCKS_GUARD:
        return _CACHE_LOCKS.setdefault(key, threading.Lock())


# The revision cache never rolled over: a snapshot plus its ~21 MB ecad object
# index is kept per commit, forever, on a persistent volume. Cap the total and
# evict least-recently-used commit directories so it cannot grow without bound.
# 0 disables the cap.
_CACHE_MAX_BYTES = settings.PRISM_DESIGN_COMPARE_CACHE_MAX_BYTES

# Never evict an entry used within this window. `_prune_revision_cache` runs in
# one worker while three others may be mid-build, and the per-process
# `_CACHE_LOCKS` cannot coordinate across them, so a plain size check could
# delete a snapshot a live job is still reading. An entry is stamped on every
# use, so a recent stamp means "someone may still be in here".
_CACHE_MIN_AGE_SECONDS = settings.PRISM_DESIGN_COMPARE_CACHE_MIN_AGE


def _dir_size(path: Path) -> int:
    total = 0
    for child in path.rglob("*"):
        try:
            if child.is_file():
                total += child.stat().st_size
        except OSError:
            continue
    return total


def _prune_revision_cache(
    max_bytes: int = _CACHE_MAX_BYTES,
    *,
    min_age_seconds: float = _CACHE_MIN_AGE_SECONDS,
) -> None:
    """Keep the revision cache under a size cap, evicting least-recently-used first.

    Each ``project/commit`` directory is one cache entry, stamped by
    `_touch_cache_entry` every time a comparison resolves it. When the total
    exceeds the cap, whole entries are removed oldest-stamp-first until it fits.
    Entries stamped within ``min_age_seconds`` are never evicted, because a
    concurrent worker may still be reading one. Best-effort: any error here is
    logged and swallowed, because a comparison result is already published and a
    full disk is a worse failure than a slightly oversized cache.
    """

    if max_bytes <= 0 or not _CACHE_ROOT.exists():
        return
    try:
        now = time.time()
        entries: list[tuple[float, Path, int]] = []
        total = 0
        for project_dir in _CACHE_ROOT.iterdir():
            if not project_dir.is_dir():
                continue
            for commit_dir in project_dir.iterdir():
                if not commit_dir.is_dir():
                    continue
                try:
                    mtime = commit_dir.stat().st_mtime
                except OSError:
                    continue
                size = _dir_size(commit_dir)
                total += size
                # In-use entries still count toward the total; they are just not
                # candidates, so the cap is respected as soon as they age out.
                if now - mtime >= min_age_seconds:
                    entries.append((mtime, commit_dir, size))
        if total <= max_bytes:
            return
        for _mtime, commit_dir, size in sorted(entries, key=lambda item: item[0]):
            if total <= max_bytes:
                break
            shutil.rmtree(commit_dir, ignore_errors=True)
            total -= size
            logger.info("Evicted design-compare cache entry %s (%d bytes)", commit_dir, size)
        if total > max_bytes:
            logger.warning(
                "Design-compare cache still %d bytes over the %d byte cap; "
                "the remaining entries were used within the last %.0fs",
                total - max_bytes,
                max_bytes,
                min_age_seconds,
            )
    except Exception:
        logger.exception("Design-compare cache prune failed")


def _read_revision_cache(
    marker: Path,
    *,
    schema: str = _CACHE_SCHEMA,
) -> Optional[Dict[str, Any]]:
    try:
        payload = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if payload.get("schema") != schema:
        return None
    return payload


def _timed_revision_action(
    *,
    commit: str,
    label: str,
    action: Callable[[], Any],
    logs: List[str],
    timings: Dict[str, float],
    benchmark: Optional[DesignCompareBenchmark],
    stage: str,
) -> Any:
    started = time.perf_counter()
    scope = f"revision:{commit}:{stage}"
    if benchmark is None:
        try:
            return action()
        finally:
            elapsed = time.perf_counter() - started
            timings[label] = elapsed
            logs.append(f"Timing {commit[:7]} {stage}.{label}: {elapsed:.3f}s")
    with benchmark.span(label, scope=scope):
        try:
            return action()
        finally:
            elapsed = time.perf_counter() - started
            timings[label] = elapsed
            logs.append(f"Timing {commit[:7]} {stage}.{label}: {elapsed:.3f}s")


def _semantic_timing_callback(
    benchmark: Optional[DesignCompareBenchmark],
    *,
    commit: str,
    stage: str,
) -> Optional[Callable[[Dict[str, Any]], None]]:
    if benchmark is None:
        return None

    def record(event: Dict[str, Any]) -> None:
        benchmark.record_duration(
            event["phase"],
            elapsed_ns=event["elapsedNs"],
            cpu_ns=event["cpuNs"],
            scope=f"revision:{commit}:{stage}:semantic",
            metadata=event.get("metadata"),
        )

    return record


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # The temporary name carries the writer's identity. A fixed `.tmp`
    # suffix is only safe while one process writes a given cache entry, and
    # the revision stages now build in worker processes -- two writers
    # racing on one name would interleave into a corrupt file that then
    # gets renamed into place as if it were whole.
    temporary = path.with_suffix(f"{path.suffix}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps(payload, separators=(",", ":")), encoding="utf-8"
        )
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _load_or_build_initial_revision(
    project_id: str,
    repo_path: Path,
    relative_path: Optional[str],
    commit: str,
    logs: List[str],
    on_progress: Optional[Any] = None,
    benchmark: Optional[DesignCompareBenchmark] = None,
) -> Dict[str, Any]:
    """Build the Schematic+BOM revision stage without materializing the PCB."""

    revision_started = time.perf_counter()
    timings: Dict[str, float] = {}

    def timed(label: str, action: Callable[[], Any]) -> Any:
        return _timed_revision_action(
            commit=commit,
            label=label,
            action=action,
            logs=logs,
            timings=timings,
            benchmark=benchmark,
            stage="initial",
        )

    cache = _cache_dir(project_id, commit)
    full_marker = cache / "revision.json"
    initial_marker = cache / "initial.json"
    cached = _read_revision_cache(full_marker) if full_marker.exists() else None
    if cached is not None:
        logs.append(f"Full cache hit for {commit[:7]}")
        if benchmark is not None:
            benchmark.mark("full-cache-hit", scope=f"revision:{commit}:initial")
        if on_progress:
            on_progress(f"Initial assets cached {commit[:7]}")
        return cached
    cached = (
        _read_revision_cache(initial_marker, schema=_INITIAL_CACHE_SCHEMA)
        if initial_marker.exists()
        else None
    )
    if cached is not None:
        logs.append(f"Initial cache hit for {commit[:7]}")
        if benchmark is not None:
            benchmark.mark("initial-cache-hit", scope=f"revision:{commit}:initial")
        if on_progress:
            on_progress(f"Initial assets cached {commit[:7]}")
        return cached

    with _cache_lock(project_id, commit):
        cached = _read_revision_cache(full_marker) if full_marker.exists() else None
        if cached is not None:
            logs.append(f"Full cache hit for {commit[:7]} after wait")
            if benchmark is not None:
                benchmark.mark("full-cache-hit-after-wait", scope=f"revision:{commit}:initial")
            if on_progress:
                on_progress(f"Initial assets cached {commit[:7]}")
            return cached
        cached = (
            _read_revision_cache(initial_marker, schema=_INITIAL_CACHE_SCHEMA)
            if initial_marker.exists()
            else None
        )
        if cached is not None:
            logs.append(f"Initial cache hit for {commit[:7]} after wait")
            if benchmark is not None:
                benchmark.mark("initial-cache-hit-after-wait", scope=f"revision:{commit}:initial")
            return cached

        snap = cache / "snapshot"
        if not snap.exists():
            logs.append(f"Snapshotting {commit[:7]}…")
            if on_progress:
                on_progress(f"Snapshotting {commit[:7]}…")
            timed(
                "snapshot",
                lambda: _snapshot_commit(repo_path, commit, snap, relative_path),
            )
        else:
            logs.append(f"Snapshot ready for {commit[:7]}")

        pro = _find_pro(snap, _project_anchor(project_id))
        semantic_index: Dict[str, Any] = {
            "schema": semantic_index_service.SCHEMA,
            "components": [],
            "nets": [],
            "terminals": [],
            "indexes": {},
        }
        if pro:
            try:
                if on_progress:
                    on_progress(f"Building schematic semantics for {commit[:7]}…")
                semantic_index = timed(
                    "schematic-semantic-index",
                    lambda: semantic_index_service.build_semantic_index(
                        pro,
                        source_revision_key=commit,
                        commit=commit,
                        timing_callback=_semantic_timing_callback(
                            benchmark,
                            commit=commit,
                            stage="initial",
                        ),
                        include_pcb=False,
                        include_components=False,
                    ),
                )
                logs.append(f"Built schematic semantic index for {commit[:7]}")
            except Exception as exc:
                logs.append(f"Schematic semantic index failed for {commit[:7]}: {exc}")
                semantic_index = {
                    "schema": "fallback",
                    "components": [],
                    "nets": [],
                    "terminals": [],
                    "indexes": {},
                }


        payload = {
            "schema": _INITIAL_CACHE_SCHEMA,
            "commit": commit,
            "semantic": semantic_index,
            "stackup": {"present": False, "layers": []},
            "sources": timed("source-list", lambda: _list_kicad_sources(snap)),
            "timings": timings,
        }
        timed("cache-write", lambda: _atomic_write_json(initial_marker, payload))
        total = time.perf_counter() - revision_started
        logs.append(
            f"Timing {commit[:7]} initial total: {total:.3f}s; "
            f"cache={initial_marker.stat().st_size / (1024 * 1024):.1f}MiB"
        )
        if on_progress:
            on_progress(f"Schematic and BOM ready for {commit[:7]}")
        return payload


def _load_or_build_pcb_revision(
    project_id: str,
    commit: str,
    initial: Dict[str, Any],
    logs: List[str],
    on_progress: Optional[Any] = None,
    benchmark: Optional[DesignCompareBenchmark] = None,
) -> Dict[str, Any]:
    """Finish PCB+Stackup by scanning the existing Stage 1 snapshot."""

    if initial.get("schema") == _CACHE_SCHEMA:
        logs.append(f"PCB cache already loaded for {commit[:7]}")
        if benchmark is not None:
            benchmark.mark("pcb-cache-reused", scope=f"revision:{commit}:pcb")
        return initial

    timings = dict(initial.get("timings") or {})

    def timed(label: str, action: Callable[[], Any]) -> Any:
        return _timed_revision_action(
            commit=commit,
            label=label,
            action=action,
            logs=logs,
            timings=timings,
            benchmark=benchmark,
            stage="pcb",
        )

    cache = _cache_dir(project_id, commit)
    marker = cache / "revision.json"
    cached = _read_revision_cache(marker) if marker.exists() else None
    if cached is not None:
        logs.append(f"PCB cache hit for {commit[:7]}")
        if benchmark is not None:
            benchmark.mark("pcb-cache-hit", scope=f"revision:{commit}:pcb")
        return cached

    with _cache_lock(project_id, commit):
        cached = _read_revision_cache(marker) if marker.exists() else None
        if cached is not None:
            logs.append(f"PCB cache hit for {commit[:7]} after wait")
            return cached

        snap = cache / "snapshot"
        semantic_index = copy.deepcopy(initial.get("semantic") or {})

        anchor = _project_anchor(project_id)
        try:
            stackup = timed("stackup", lambda: _extract_stackup(snap, anchor))
        except Exception as exc:
            logs.append(f"Stackup extract failed for {commit[:7]}: {exc}")
            stackup = {"present": False, "layers": []}

        fabrication = timed(
            "fabrication-export",
            lambda: _export_fabrication(cache, snap, commit, logs, anchor),
        )

        payload = {
            **initial,
            "schema": _CACHE_SCHEMA,
            "semantic": semantic_index,
            "stackup": stackup,
            "fabrication": fabrication,
            "timings": timings,
        }
        timed("cache-write", lambda: _atomic_write_json(marker, payload))
        if on_progress:
            on_progress(f"PCB and Stackup ready for {commit[:7]}")
        return payload


_FABRICATION_COMPLETE_MARKER = ".prism_complete"


def _export_fabrication(
    cache: Path,
    snap: Path,
    commit: str,
    logs: List[str],
    anchor: Optional[str] = None,
) -> Dict[str, Any]:
    """Plot this revision's Gerber package once, beside its snapshot.

    Fabrication output belongs to a revision, not to a comparison, so it is
    cached with the revision and reused by every comparison that touches it.
    A missing or broken KiCad CLI degrades the fabrication domain only — the
    rest of the comparison is pure parsing and must still complete.

    Completeness is gated on a marker file, not on the directory being
    non-empty: a killed `kicad-cli` can leave a partial plot that must not be
    treated as a successful export on the next compare.
    """

    board = _find_pcb(snap, anchor)
    if board is None:
        return {"present": False, "reason": "no board file in this revision"}
    output = cache / "fabrication"
    if (output / _FABRICATION_COMPLETE_MARKER).is_file():
        return {"present": True, "dir": str(output)}
    # Incomplete leftover from an interrupted export — do not reuse.
    if output.exists():
        shutil.rmtree(output, ignore_errors=True)
    staging = cache / "fabrication.staging"
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    ok, message = fabrication_compare_service.export_gerbers(board, staging)
    if not ok:
        logs.append(f"Gerber export failed for {commit[:7]}: {message}")
        shutil.rmtree(staging, ignore_errors=True)
        return {"present": False, "reason": message}
    # A missing drill program costs the drill layers, not the whole package, so
    # it is a warning on an otherwise usable fabrication comparison.
    drilled, drill_message = fabrication_compare_service.export_drill(board, staging)
    if not drilled:
        logs.append(f"Drill export failed for {commit[:7]}: {drill_message}")
    # Marker last inside staging, then promote atomically so a crash mid-plot
    # never leaves a directory that the next run would treat as complete.
    (staging / _FABRICATION_COMPLETE_MARKER).write_text("1", encoding="utf-8")
    staging.replace(output)
    logs.append(f"Plotted fabrication output for {commit[:7]}")
    return {
        "present": True,
        "dir": str(output),
        "warnings": [] if drilled else [f"drill program unavailable: {drill_message}"],
    }


def _load_or_build_revision(
    project_id: str,
    repo_path: Path,
    relative_path: Optional[str],
    commit: str,
    logs: List[str],
    on_progress: Optional[Any] = None,
    benchmark: Optional[DesignCompareBenchmark] = None,
) -> Dict[str, Any]:
    """Compatibility full-revision entry point used by cache warmers/tests."""

    initial = _load_or_build_initial_revision(
        project_id,
        repo_path,
        relative_path,
        commit,
        logs,
        on_progress=on_progress,
        benchmark=benchmark,
    )
    return _load_or_build_pcb_revision(
        project_id,
        commit,
        initial,
        logs,
        on_progress=on_progress,
        benchmark=benchmark,
    )


# The Node parser package (ecad-parse/ecad-diff and the vendored parser). It sits in
# backend/, so the image's `COPY backend/ .` carries it to /app/design-compare-parser.
_PARSER_PACKAGE = Path(__file__).parents[2] / "design-compare-parser"


def _run_ecad_object_delta(
    project_id: str,
    base: str,
    head: str,
) -> Dict[str, Any]:
    """Parse both cached snapshots once with ecad-viewer's parser."""

    base_snapshot = _cache_dir(project_id, base) / "snapshot"
    head_snapshot = _cache_dir(project_id, head) / "snapshot"
    if not base_snapshot.exists() or not head_snapshot.exists():
        raise RuntimeError("Design comparison snapshots are not ready for object diff")
    return _ecad_object_delta(base_snapshot, head_snapshot)


def _ecad_object_delta(base_snapshot: Path, head_snapshot: Path) -> Dict[str, Any]:
    """The parser's object delta between two snapshot directories."""

    script = _PARSER_PACKAGE / "ecad-diff.mjs"
    if not script.exists():
        raise RuntimeError("ecad-viewer parser diff script is not installed")
    with tempfile.TemporaryDirectory(prefix="prism-ecad-diff-") as temporary:
        output = Path(temporary) / "delta.json"
        process = subprocess.run(
            [
                "node",
                str(script),
                str(base_snapshot),
                str(head_snapshot),
                "--out",
                str(output),
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if process.returncode != 0:
            detail = (process.stderr or process.stdout or "unknown error").strip()
            raise RuntimeError(f"ecad-viewer parser diff failed: {detail}")
        return json.loads(output.read_text(encoding="utf-8"))


def _build_revisions(
    project_id: str,
    repo_path: Path,
    relative_path: str,
    base: str,
    head: str,
    heartbeat: Callable[[str, Optional[float]], None],
    benchmark: Optional[DesignCompareBenchmark] = None,
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[str]]]:
    """Build the requested snapshots with bounded, newest-independent workers."""
    unique_commits = list(dict.fromkeys((base, head)))
    configured_workers = settings.PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS
    max_workers = max(1, min(2, configured_workers, len(unique_commits)))
    revision_labels = {
        commit: (
            "old/new"
            if base == head
            else "old"
            if commit == base
            else "new"
        )
        for commit in unique_commits
    }
    revisions: Dict[str, Dict[str, Any]] = {}
    revision_logs: Dict[str, List[str]] = {}
    state_lock = threading.Lock()
    completed = 0

    def build_revision(commit: str) -> tuple[Dict[str, Any], List[str]]:
        local_logs: List[str] = []

        def report(message: str) -> None:
            with state_lock:
                progress = 15 + completed * 20
            heartbeat(
                f"{revision_labels[commit].capitalize()}: {message}",
                progress,
            )

        load_arguments = {
            "on_progress": report,
        }
        if benchmark is not None:
            load_arguments["benchmark"] = benchmark
        revision = _load_or_build_revision(
            project_id,
            repo_path,
            relative_path,
            commit,
            local_logs,
            **load_arguments,
        )
        return revision, local_logs

    heartbeat(
        "Building old and new revisions…"
        if len(unique_commits) == 2 and max_workers == 2
        else "Building revisions…",
        15,
    )
    executor = ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix="design-compare-revision",
    )
    futures = {
        executor.submit(build_revision, commit): commit
        for commit in unique_commits
    }
    try:
        for future in as_completed(futures):
            commit = futures[future]
            revision, local_logs = future.result()
            revisions[commit] = revision
            revision_logs[commit] = local_logs
            with state_lock:
                completed += 1
                progress = 15 + completed * 20
            heartbeat(
                f"{revision_labels[commit].capitalize()} revision ready",
                progress,
            )
    except Exception:
        for future in futures:
            future.cancel()
        raise
    finally:
        executor.shutdown(wait=True, cancel_futures=True)

    return revisions, revision_logs


def _stage_worker_count(stage: str, revision_count: int) -> int:
    # Both stages are bounded at two. Stage 1 overlaps the two independent
    # schematic compiles; Stage 2 runs only lightweight source-geometry scans
    # after parser sessions have been released (no concurrent PCB ASTs).
    configured = {
        "initial": settings.PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS,
        "pcb": settings.PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS,
    }[stage]
    if configured is None:
        configured = settings.PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS
    return max(1, min(2, configured, revision_count))


def _revision_processes_enabled() -> bool:
    """Whether the two revisions are compiled in separate processes.

    Stage 1 is pure CPU work -- lexing and parsing schematics -- so running
    the two revisions on threads leaves them serialised behind the GIL and
    the pool buys nothing. Processes are the default for that reason; the
    switch exists so a constrained deployment can go back to one address
    space, and so the unit tests can stay in-process.
    """
    return settings.PRISM_DESIGN_COMPARE_REVISION_PROCESSES


def _initial_revision_task(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Build one initial revision, callable from a worker process.

    Everything crossing the boundary has to pickle, so the caller's logs
    list, progress callback and benchmark recorder cannot come along. The
    worker collects its own and hands them back for the parent to merge.
    """
    logs: List[str] = []
    benchmark: Optional[DesignCompareBenchmark] = None
    if payload.get("benchmark_job_id"):
        benchmark = DesignCompareBenchmark(job_id=payload["benchmark_job_id"])

    revision = _load_or_build_initial_revision(
        payload["project_id"],
        Path(payload["repo_path"]),
        payload["relative_path"],
        payload["commit"],
        logs,
        benchmark=benchmark,
    )
    return {
        "revision": revision,
        "logs": logs,
        "events": benchmark.drain_events() if benchmark is not None else [],
    }


def _build_initial_revisions(
    project_id: str,
    repo_path: Path,
    relative_path: Optional[str],
    base: str,
    head: str,
    heartbeat: Callable[[str, Optional[float]], None],
    benchmark: Optional[DesignCompareBenchmark] = None,
) -> tuple[
    Dict[str, Dict[str, Any]],
    Dict[str, List[str]],
]:
    unique_commits = list(dict.fromkeys((base, head)))
    max_workers = _stage_worker_count("initial", len(unique_commits))
    revisions: Dict[str, Dict[str, Any]] = {}
    revision_logs: Dict[str, List[str]] = {}
    completed = 0
    state_lock = threading.Lock()

    def build(commit: str) -> tuple[Dict[str, Any], List[str]]:
        local_logs: List[str] = []

        def report(message: str) -> None:
            with state_lock:
                progress = 10 + completed * 18
            heartbeat(f"Initial {commit[:7]}: {message}", progress)

        revision = _load_or_build_initial_revision(
            project_id,
            repo_path,
            relative_path,
            commit,
            local_logs,
            on_progress=report,
            benchmark=benchmark,
        )
        return revision, local_logs

    heartbeat("Building Schematic and BOM assets…", 10)

    use_processes = max_workers > 1 and _revision_processes_enabled()
    if use_processes:
        # `spawn` rather than the Linux default `fork`: this runs inside a
        # threaded server, and forking a process that holds locks in other
        # threads is a deadlock waiting to happen.
        executor = ProcessPoolExecutor(
            max_workers=max_workers,
            mp_context=multiprocessing.get_context("spawn"),
        )
        submit = lambda commit: executor.submit(  # noqa: E731
            _initial_revision_task,
            {
                "project_id": project_id,
                "repo_path": str(repo_path),
                "relative_path": relative_path,
                "commit": commit,
                "benchmark_job_id": benchmark.job_id if benchmark is not None else None,
            },
        )
    else:
        executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="design-compare-initial",
        )
        submit = lambda commit: executor.submit(build, commit)  # noqa: E731

    stage_started_ms = time.perf_counter() * 1000
    try:
        futures = {submit(commit): commit for commit in unique_commits}
        try:
            for future in as_completed(futures):
                commit = futures[future]
                result = future.result()
                if use_processes:
                    revision = result["revision"]
                    local_logs = result["logs"]
                    if benchmark is not None and result["events"]:
                        benchmark.absorb_events(
                            result["events"],
                            offset_ms=stage_started_ms - benchmark.started_ms,
                            thread=f"design-compare-initial-{commit[:7]}",
                        )
                else:
                    revision, local_logs = result
                revisions[commit] = revision
                revision_logs[commit] = local_logs
                with state_lock:
                    completed += 1
                    progress = 10 + completed * 18
                heartbeat(f"Schematic and BOM ready for {commit[:7]}", progress)
        except Exception:
            for future in futures:
                future.cancel()
            raise
    finally:
        executor.shutdown(wait=True)
    return revisions, revision_logs


def _prepare_comparison_snapshots(
    project_id: str,
    repo_path: Path,
    relative_path: Optional[str],
    base: str,
    head: str,
    heartbeat: Callable[[str, Optional[float]], None],
) -> None:
    """Materialize both snapshots before the independent parsers start."""

    commits = list(dict.fromkeys((base, head)))

    def prepare(commit: str) -> None:
        snapshot = _cache_dir(project_id, commit) / "snapshot"
        if snapshot.exists():
            return
        with _cache_lock(project_id, commit):
            if not snapshot.exists():
                _snapshot_commit(repo_path, commit, snapshot, relative_path)

    heartbeat("Preparing old and new design snapshots…", 8)
    with ThreadPoolExecutor(
        max_workers=min(2, len(commits)),
        thread_name_prefix="design-compare-snapshot",
    ) as executor:
        list(executor.map(prepare, commits))


def _build_pcb_revisions(
    project_id: str,
    base: str,
    head: str,
    initial_revisions: Dict[str, Dict[str, Any]],
    heartbeat: Callable[[str, Optional[float]], None],
    benchmark: Optional[DesignCompareBenchmark] = None,
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[str]]]:
    unique_commits = list(dict.fromkeys((base, head)))
    max_workers = _stage_worker_count("pcb", len(unique_commits))
    revisions: Dict[str, Dict[str, Any]] = {}
    revision_logs: Dict[str, List[str]] = {}
    completed = 0
    state_lock = threading.Lock()

    def build(commit: str) -> tuple[Dict[str, Any], List[str]]:
        local_logs: List[str] = []

        def report(message: str) -> None:
            with state_lock:
                progress = 60 + completed * 16
            heartbeat(f"Background {commit[:7]}: {message}", progress)

        revision = _load_or_build_pcb_revision(
            project_id,
            commit,
            initial_revisions[commit],
            local_logs,
            on_progress=report,
            benchmark=benchmark,
        )
        return revision, local_logs

    heartbeat("Schematic and BOM ready; building PCB and Stackup in background…", 60)
    with ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix="design-compare-pcb",
    ) as executor:
        futures = {executor.submit(build, commit): commit for commit in unique_commits}
        try:
            for future in as_completed(futures):
                commit = futures[future]
                revision, local_logs = future.result()
                revisions[commit] = revision
                revision_logs[commit] = local_logs
                with state_lock:
                    completed += 1
                    progress = 60 + completed * 16
                heartbeat(f"PCB and Stackup ready for {commit[:7]}", progress)
        except Exception:
            for future in futures:
                future.cancel()
            raise
    return revisions, revision_logs


def _comparison_bom_fields(project_id: str, head: str) -> List[str]:
    fields = ["Reference", "Value", "Footprint", "Datasheet"]
    try:
        cfg_path = _cache_dir(project_id, head) / "snapshot" / ".prism.json"
        if cfg_path.exists():
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
            fields = cfg.get("bom", {}).get("fields") or fields
    except Exception:
        pass
    return fields


def _assemble_initial_comparison(
    *,
    project_id: str,
    base: str,
    head: str,
    revisions: Dict[str, Dict[str, Any]],
    object_delta: Dict[str, Any],
    include_unchanged: bool,
    benchmark: DesignCompareBenchmark,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    def assemble(phase: str, action: Callable[[], Any]) -> Any:
        with benchmark.span(phase, scope="assembly:initial"):
            return action()

    base_rev = revisions[base]
    head_rev = revisions[head]
    base_semantic = {
        **(base_rev.get("semantic") or {}),
        "components": occurrences.revision_components(object_delta["base"]),
    }
    head_semantic = {
        **(head_rev.get("semantic") or {}),
        "components": occurrences.revision_components(object_delta["head"]),
    }
    connectivity_changes = assemble(
        "schematic-semantic-diff",
        lambda: _connectivity_changes(base_semantic, head_semantic),
    )
    parser_changes = assemble(
        "schematic-object-diff",
        lambda: _node_changes(object_delta, "schematic"),
    )
    schematic_changes = assemble(
        "schematic-change-merge",
        lambda: [*parser_changes, *connectivity_changes],
    )
    assemble(
        "native-target-hydration",
        lambda: _hydrate_native_targets(
            schematic_changes,
            object_delta["base"],
            object_delta["head"],
        ),
    )
    bom = assemble(
        "bom-diff",
        lambda: bom_diff_service.diff_boms(
            occurrences.bom_rows(base_semantic["components"]),
            occurrences.bom_rows(head_semantic["components"]),
            _comparison_bom_fields(project_id, head),
            include_unchanged=include_unchanged,
        ),
    )
    source_files = {
        "base": base_rev.get("sources") or [],
        "head": head_rev.get("sources") or [],
    }
    empty_pcb_changes: List[Dict[str, Any]] = []
    document_diff = assemble(
        "document-diff",
        lambda: document_diff_service.build_project_diff(
            schematic_changes=schematic_changes,
            pcb_changes=empty_pcb_changes,
            files=source_files,
        ),
    )
    sheets = sorted(
        {
            Path(source["filename"]).name
            for source in source_files["base"] + source_files["head"]
            if source["filename"].endswith(".kicad_sch")
        }
    )
    result = {
        "schema": "prism.semantic_comparison_v3",
        "base": base,
        "head": head,
        "compare": head,
        "diagnostics": [],
        "readiness": {
            "stage": "initial-ready",
            "domains": {
                "schematic": "ready",
                "bom": "ready",
                "pcb": "building",
                "stackup": "building",
                "fabrication": "building",
            },
        },
        "files": source_files,
        "document_diff": document_diff,
        "schematic": {
            "pages": sheets,
            "changes": schematic_changes,
            "summary": _summary(schematic_changes),
        },
        "pcb": {
            "changes": [],
            "summary": {"added": 0, "removed": 0, "changed": 0},
            "route_metrics": {"base": {}, "compare": {}},
        },
        "bom": bom,
        "stackup": {"base": [], "head": [], "changed": False, "present": False},
        "fabrication": _empty_fabrication(),
    }
    state = {"schematic_changes": schematic_changes, "object_delta": object_delta}
    return result, state


def _complete_comparison(
    *,
    initial_result: Dict[str, Any],
    assembly_state: Dict[str, Any],
    base: str,
    head: str,
    revisions: Dict[str, Dict[str, Any]],
    benchmark: DesignCompareBenchmark,
    render_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    def assemble(phase: str, action: Callable[[], Any]) -> Any:
        with benchmark.span(phase, scope="assembly:pcb"):
            return action()

    base_rev = revisions[base]
    head_rev = revisions[head]
    object_delta = assembly_state["object_delta"]
    pcb_changes = assemble(
        "pcb-object-diff",
        lambda: _node_changes(object_delta, "pcb"),
    )
    stackup = assemble(
        "stackup-diff",
        lambda: _diff_stackup(base_rev.get("stackup") or {}, head_rev.get("stackup") or {}),
    )
    route_metrics = assemble(
        "route-metrics",
        lambda: {
            "base": _route_metrics_from_digest(
                object_delta["base"], base_rev.get("stackup") or {}
            ),
            "compare": _route_metrics_from_digest(
                object_delta["head"], head_rev.get("stackup") or {}
            ),
        },
    )
    fabrication = assemble(
        "fabrication-diff",
        lambda: _diff_fabrication(base_rev, head_rev, render_dir),
    )
    source_files = initial_result["files"]
    schematic_changes = assembly_state["schematic_changes"]
    document_diff = assemble(
        "document-diff",
        lambda: document_diff_service.build_project_diff(
            schematic_changes=schematic_changes,
            pcb_changes=pcb_changes,
            files=source_files,
        ),
    )
    return {
        **initial_result,
        "readiness": {
            "stage": "complete",
            "domains": {
                "schematic": "ready",
                "bom": "ready",
                "pcb": "ready",
                "stackup": "ready",
                "fabrication": "ready",
            },
        },
        "document_diff": document_diff,
        "pcb": {
            "changes": pcb_changes,
            "summary": _summary(pcb_changes),
            "route_metrics": route_metrics,
        },
        "stackup": stackup,
        "fabrication": fabrication,
    }


def _prepare_comparison_bundle(
    context: JobContext,
    result: Dict[str, Any],
    *,
    artifact_key: str,
) -> tuple[Any, tuple[Any, ...]]:
    """Split the completed result into immutable, independently served sidecars."""

    core = {
        key: result.get(key)
        for key in (
            "schema",
            "base",
            "head",
            "compare",
            "diagnostics",
            "readiness",
            "files",
        )
    }
    # Layer artwork is one sidecar per layer per revision so a reviewer fetches
    # only the layer they opened, not every plotted layer on the board.
    render_artifacts: List[Any] = []
    render_manifest: Dict[str, Dict[str, Any]] = {}
    for layer in ((result.get("fabrication") or {}).get("layers") or []):
        render = layer.get("render") or {}
        for side in list(render):
            source = Path(str(render[side]))
            if not source.is_file():
                render.pop(side, None)
                continue
            name = f"fab:{layer.get('name')}:{side}"
            prepared = job_artifacts.prepare_file(
                context,
                source,
                kind="design_compare_sidecar",
                artifact_key=f"{artifact_key}:sidecar:{name}",
                media_type="image/svg+xml",
                generator_version=semantic_index_service.generator_cache_tag(),
                readiness="sidecar",
            )
            render_artifacts.append(prepared)
            render_manifest[name] = _manifest_entry(prepared)
            # The payload carries the sidecar's name; the API turns names into
            # URLs in one place, for every sidecar alike.
            render[side] = name

    payloads = {
        "core": core,
        "schematic": result.get("schematic") or {},
        "pcb": result.get("pcb") or {},
        "bom": result.get("bom"),
        "stackup": result.get("stackup") or {},
        "fabrication": result.get("fabrication") or {},
        "document_diff": result.get("document_diff") or {},
    }
    sidecars = list(render_artifacts)
    manifest_sidecars: Dict[str, Dict[str, Any]] = dict(render_manifest)
    for name, payload in payloads.items():
        prepared = job_artifacts.prepare_json(
            context,
            payload,
            kind="design_compare_sidecar",
            artifact_key=f"{artifact_key}:sidecar:{name}",
            schema_version=str(result.get("schema") or ""),
            generator_version=semantic_index_service.generator_cache_tag(),
            readiness="sidecar",
        )
        sidecars.append(prepared)
        manifest_sidecars[name] = _manifest_entry(prepared)

    manifest = {
        "schema": "prism.design_compare_bundle_v1",
        "resultSchema": result.get("schema"),
        "base": result.get("base"),
        "head": result.get("head"),
        "compare": result.get("compare"),
        "readiness": result.get("readiness"),
        "domains": {
            name: {
                "summary": (
                    (result.get(name) or {}).get("summary")
                    if isinstance(result.get(name), dict)
                    else None
                ),
                "changeCount": len((result.get(name) or {}).get("changes") or [])
                if isinstance(result.get(name), dict)
                else 0,
            }
            for name in ("schematic", "pcb", "bom", "stackup", "fabrication")
        },
        "sidecars": manifest_sidecars,
    }
    primary = job_artifacts.prepare_json(
        context,
        manifest,
        kind="design_compare",
        artifact_key=artifact_key,
        schema_version="prism.design_compare_bundle_v1",
        generator_version=semantic_index_service.generator_cache_tag(),
        readiness="ready",
    )
    return primary, tuple(sidecars)


def _resolve_revision(repo_path: Path, revision: str) -> str:
    process = subprocess.run(
        ["git", "-C", str(repo_path), "rev-parse", "--verify", f"{revision}^{{commit}}"],
        capture_output=True,
        text=True,
    )
    resolved = process.stdout.strip()
    if process.returncode != 0 or not re.fullmatch(r"[0-9a-f]{40}", resolved):
        raise ValueError(f"Invalid commit revision: {revision}")
    return resolved


def start_design_compare_job(
    project_id: str,
    base: str,
    head: str,
    *,
    include_unchanged: bool = False,
    requested_by: str = "",
) -> str:
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError(f"Project '{project_id}' not found")
    artifact_key = hashlib.sha256(
        json.dumps(
            {
                "project": project_id,
                "projectFileRel": str(row.get("project_file_rel") or ""),
                "base": base,
                "head": head,
                "includeUnchanged": include_unchanged,
                "cacheSchema": _CACHE_SCHEMA,
                "initialCacheSchema": _INITIAL_CACHE_SCHEMA,
                "generator": semantic_index_service.generator_cache_tag(),
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    queued = DESIGN_COMPARE.enqueue(
        {
            "project_id": project_id,
            "base": base,
            "head": head,
            "include_unchanged": include_unchanged,
            "artifact_key": artifact_key,
            "project_file_rel": str(row.get("project_file_rel") or ""),
        },
        subject=JobSubject.of_project(row, project_id),
        artifact_key=artifact_key,
        requested_by=requested_by,
    )
    return str(queued["job_id"])


def get_job_status(job_id: str) -> Optional[dict]:
    """The comparison job as the result routes check it: project, status, result version."""

    job = v3_jobs.get(job_id)
    if not job or job.get("kind") != "design_compare":
        return None
    metadata = dict(job.get("result_metadata") or {})
    payload = dict(job.get("payload") or {})
    return {
        "job_id": job_id,
        "status": job.get("status"),
        "project_id": job.get("project_id") or payload.get("project_id"),
        "result_version": metadata.get("result_version", 0),
    }


def get_job_result(job_id: str) -> Optional[dict]:
    """The latest published result (a partial one while PCB is still building)."""

    job = v3_jobs.get(job_id)
    if job and job.get("result_path"):
        path = Path(str(job["result_path"]))
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


def get_job_sidecar(job_id: str, digest: str) -> Optional[dict]:
    artifact = v3_jobs.get_artifact_for_job_digest(job_id, digest)
    if not artifact or artifact.get("kind") != "design_compare_sidecar":
        return None
    return artifact


def delete_job(job_id: str) -> None:
    """Cancel the comparison if it is still running; finished results stay."""

    job = v3_jobs.get(job_id)
    if job and job.get("status") in {"queued", "running", "retry_wait", "cancel_requested"}:
        v3_jobs.request_cancel(job_id)


@dataclass(frozen=True)
class ComparisonRequest:
    """One comparison, with both revisions resolved to commits."""

    project_id: str
    repo_path: Path
    relative_path: Optional[str]
    base: str
    head: str
    include_unchanged: bool = False


class ComparisonStages:
    """The comparison's computation, one method per stage.

    The worker uses these; a test replaces the stages it does not want to
    run (they snapshot Git, parse KiCad files and plot Gerbers).
    """

    def snapshots(self, request: ComparisonRequest, heartbeat: Callable[..., None]) -> None:
        _prepare_comparison_snapshots(
            request.project_id, request.repo_path, request.relative_path,
            request.base, request.head, heartbeat,
        )

    def object_delta(self, request: ComparisonRequest) -> Dict[str, Any]:
        return _run_ecad_object_delta(request.project_id, request.base, request.head)

    def initial_revisions(
        self, request: ComparisonRequest, heartbeat: Callable[..., None], benchmark: DesignCompareBenchmark
    ) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[str]]]:
        return _build_initial_revisions(
            request.project_id, request.repo_path, request.relative_path,
            request.base, request.head, heartbeat, benchmark=benchmark,
        )

    def assemble_initial(
        self,
        request: ComparisonRequest,
        revisions: Dict[str, Dict[str, Any]],
        object_delta: Dict[str, Any],
        benchmark: DesignCompareBenchmark,
    ) -> tuple[Dict[str, Any], Dict[str, Any]]:
        return _assemble_initial_comparison(
            project_id=request.project_id, base=request.base, head=request.head,
            revisions=revisions, object_delta=object_delta,
            include_unchanged=request.include_unchanged, benchmark=benchmark,
        )

    def pcb_revisions(
        self,
        request: ComparisonRequest,
        initial_revisions: Dict[str, Dict[str, Any]],
        heartbeat: Callable[..., None],
        benchmark: DesignCompareBenchmark,
    ) -> tuple[Dict[str, Dict[str, Any]], Dict[str, List[str]]]:
        return _build_pcb_revisions(
            request.project_id, request.base, request.head, initial_revisions, heartbeat, benchmark=benchmark,
        )

    def complete(
        self,
        request: ComparisonRequest,
        initial_result: Dict[str, Any],
        assembly_state: Dict[str, Any],
        revisions: Dict[str, Dict[str, Any]],
        benchmark: DesignCompareBenchmark,
        render_dir: Optional[Path],
    ) -> Dict[str, Any]:
        return _complete_comparison(
            initial_result=initial_result, assembly_state=assembly_state, base=request.base,
            head=request.head, revisions=revisions, benchmark=benchmark, render_dir=render_dir,
        )


class JobArtifactPublisher:
    """Publishes stage results as fenced job artifacts (the worker's adapter).

    A partial result becomes the job's current result atomically with its
    fence check; a rejected publication means this attempt lost its lease.
    """

    def __init__(self, context: JobContext, artifact_key: str) -> None:
        self.context = context
        self.artifact_key = artifact_key

    def publish_partial(
        self, result: Dict[str, Any], *, stage: str, message: str, details: Dict[str, Any]
    ) -> None:
        artifact = job_artifacts.prepare_json(
            self.context,
            result,
            kind="design_compare",
            artifact_key=self.artifact_key,
            schema_version=str(result.get("schema") or ""),
            generator_version=semantic_index_service.generator_cache_tag(),
            readiness="partial",
        )
        if not v3_jobs.publish_partial_artifact(
            self.context.job_id,
            self.context.worker_id,
            self.context.fence,
            artifact.__dict__,
            stage=stage,
            message=message,
            percent=60,
            details=details,
        ):
            raise RuntimeError("Fenced partial comparison publication was rejected")

    def publish_complete(self, result: Dict[str, Any]) -> tuple[Any, tuple[Any, ...]]:
        """The bundle manifest and its sidecars; the job's completion publishes them."""

        return _prepare_comparison_bundle(self.context, result, artifact_key=self.artifact_key)


def _ready_details(result: Dict[str, Any], request: ComparisonRequest, version: int) -> Dict[str, Any]:
    domains = result["readiness"]["domains"]
    return {
        "result_version": version,
        "ready_domains": [domain for domain, status in domains.items() if status == "ready"],
        "readiness": result["readiness"],
        "base": request.base,
        "head": request.head,
    }


def _late_domains_failed(initial_result: Dict[str, Any]) -> Dict[str, Any]:
    failed = copy.deepcopy(initial_result)
    readiness = failed.setdefault("readiness", {})
    domains = readiness.setdefault("domains", {})
    for domain, status in list(domains.items()):
        if status != "ready":
            domains[domain] = "failed"
    readiness["stage"] = "background-failed"
    return failed


def run_comparison(
    request: ComparisonRequest,
    publisher: Any,
    *,
    benchmark: DesignCompareBenchmark,
    stages: ComparisonStages | None = None,
    heartbeat: Callable[..., None] = lambda message, percent=None: None,
    check_cancelled: Callable[[], None] = lambda: None,
    render_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Run the staged comparison and return the complete result.

    Schematic and BOM are published as result version 1 as soon as they are
    ready, before the PCB stage starts. If anything fails after that, the
    initial result is republished as version 2 with every domain that was
    still building marked failed, and the error propagates.
    """

    stages = stages or ComparisonStages()
    base, head = request.base, request.head

    def log_revisions(revision_logs: Dict[str, List[str]], stage: str) -> None:
        for commit in dict.fromkeys((base, head)):
            side = "old/new" if base == head else "old" if commit == base else "new"
            for message in revision_logs.get(commit, []):
                print(f"[{stage}:{side}] {message}", flush=True)

    initial_result: Optional[Dict[str, Any]] = None
    try:
        check_cancelled()
        with benchmark.span("snapshot-pipeline"):
            stages.snapshots(request, heartbeat)
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="design-compare-object-delta") as executor:
            def build_object_delta() -> Dict[str, Any]:
                with benchmark.span("ecad-object-delta"):
                    return stages.object_delta(request)

            object_future = executor.submit(build_object_delta)
            with benchmark.span("initial-revision-pipeline"):
                initial_revisions, initial_logs = stages.initial_revisions(request, heartbeat, benchmark)
            check_cancelled()
            heartbeat("Finishing native object differences…", 45)
            object_delta = object_future.result()
        log_revisions(initial_logs, "initial")
        check_cancelled()
        heartbeat("Assembling Schematic and BOM differences…", 50)
        assembled, assembly_state = stages.assemble_initial(request, initial_revisions, object_delta, benchmark)
        publisher.publish_partial(
            assembled,
            stage="background-pcb",
            message="Schematic and BOM ready; building PCB and Stackup in background…",
            details=_ready_details(assembled, request, 1),
        )
        initial_result = assembled

        check_cancelled()
        with benchmark.span("pcb-revision-pipeline"):
            complete_revisions, pcb_logs = stages.pcb_revisions(request, initial_revisions, heartbeat, benchmark)
        log_revisions(pcb_logs, "pcb")
        check_cancelled()
        heartbeat("Assembling PCB and Stackup differences…", 92)
        return stages.complete(
            request, initial_result, assembly_state, complete_revisions, benchmark, render_dir
        )
    except Exception:
        if initial_result is not None:
            failed = _late_domains_failed(initial_result)
            try:
                publisher.publish_partial(
                    failed,
                    stage="background-failed",
                    message="Schematic and BOM ready; PCB and Stackup failed",
                    details=_ready_details(failed, request, 2),
                )
            except Exception:  # noqa: BLE001 - a cancelled or lost attempt keeps its last result
                logger.warning("Could not publish the failed comparison readiness", exc_info=True)
        raise


def run_design_compare_job_v3(context: JobContext) -> JobResult:
    """Job handler ``design_compare``: one comparison under a fenced worker lease."""

    payload = context.payload
    project_id = str(payload["project_id"])
    artifact_key = str(payload["artifact_key"])
    if (_project_anchor(project_id) or "") != str(payload.get("project_file_rel") or ""):
        raise RuntimeError(
            "Project anchor changed after the comparison was queued; retry the comparison"
        )
    location = project_revision.locate_id(project_id)
    request = ComparisonRequest(
        project_id=project_id,
        repo_path=location.repo_root,
        relative_path=location.sub_path,
        base=_resolve_revision(location.repo_root, str(payload["base"])),
        head=_resolve_revision(location.repo_root, str(payload["head"])),
        include_unchanged=bool(payload.get("include_unchanged")),
    )
    started = time.perf_counter()
    revision_count = len({request.base, request.head})
    benchmark = DesignCompareBenchmark(
        job_id=context.job_id,
        metadata={
            "projectId": project_id,
            "base": request.base,
            "compare": request.head,
            "initialWorkers": _stage_worker_count("initial", revision_count),
            "pcbWorkers": _stage_worker_count("pcb", revision_count),
            "semanticGenerator": semantic_index_service.generator_cache_tag(),
            "pipeline": "staged-domain-v3-worker",
            "fence": context.fence,
        },
    )
    benchmark_path = job_state_root() / "jobs" / context.job_id / f"benchmark-fence-{context.fence}.json"

    def heartbeat(message: str, percent: Optional[float] = None) -> None:
        print(message, flush=True)
        context.progress(stage="building", message=message, percent=percent)

    publisher = JobArtifactPublisher(context, artifact_key)
    try:
        result = run_comparison(
            request,
            publisher,
            benchmark=benchmark,
            heartbeat=heartbeat,
            check_cancelled=context.check_cancelled,
            # Layer artwork is prepared as content-addressed artifacts, and
            # `prepare_file` only accepts sources inside the fence.
            render_dir=context.staging_dir / "fabrication-render",
        )
    except Exception:
        try:
            benchmark.write(benchmark_path)
        except Exception:
            logger.exception("Could not publish failed V3 comparison benchmark")
        raise
    benchmark.update_metadata(
        totalReadyMs=round((time.perf_counter() - started) * 1000, 3),
        schematicChanges=len(result["schematic"]["changes"]),
        pcbChanges=len(result["pcb"]["changes"]),
        bomChanges=len((result.get("bom") or {}).get("changes") or []),
    )
    benchmark.write(benchmark_path)
    complete, sidecars = publisher.publish_complete(result)
    _prune_revision_cache()
    return JobResult(
        message="Design comparison ready",
        artifact=complete,
        sidecar_artifacts=sidecars,
        details={
            **_ready_details(result, request, 2),
            "benchmark_path": str(benchmark_path),
            "sidecar_count": len(sidecars),
        },
    )


def settle_comparison_end(job: Dict[str, Any]) -> bool:
    """End hook: an ended comparison still showing late domains as building
    (its process died after the partial result) republishes them as failed,
    as version 2, the way a failure inside the handler does (D19).

    Unfenced, because the attempt is over; applies only while the job's result
    is the partial one it read. Returns whether it published. Idempotent. The
    runner traps no SIGTERM (D20): a cancel that kills it is settled here.
    """

    metadata = dict(job.get("result_metadata") or {})
    if job.get("status") not in {"failed", "cancelled"} or metadata.get("result_version") != 1:
        return False
    path = Path(str(job.get("result_path") or ""))
    if not job.get("result_digest") or not path.is_file():
        return False
    failed = _late_domains_failed(json.loads(path.read_text(encoding="utf-8")))
    payload = dict(job.get("payload") or {})
    artifact = job_artifacts.prepare_ended_json(
        failed,
        kind="design_compare",
        artifact_key=str(payload.get("artifact_key") or job.get("artifact_key") or ""),
        schema_version=str(failed.get("schema") or ""),
        generator_version=semantic_index_service.generator_cache_tag(),
        readiness="partial",
    )
    domains = failed["readiness"]["domains"]
    details = {
        **metadata,
        "result_version": 2,
        "ready_domains": [domain for domain, status in domains.items() if status == "ready"],
        "readiness": failed["readiness"],
    }
    return v3_jobs.publish_ended_result(
        str(job["job_id"]), artifact.__dict__, expected_digest=str(job["result_digest"]), details=details
    )


def _unsettled_comparisons() -> list[str]:
    return v3_jobs.ended_job_ids("design_compare", result_metadata={"result_version": 1})


DESIGN_COMPARE = JobKind(
    "design_compare",
    run_design_compare_job_v3,
    resources={"prism_worker": 1, "design_compare": 1, "semantic_compile": 2},
    lock=repository_lock("read"),
    settle=settle_comparison_end,
    orphans=_unsettled_comparisons,
)
JOB_KINDS = (DESIGN_COMPARE,)
