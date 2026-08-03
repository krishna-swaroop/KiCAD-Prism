"""Design Comparison service — connectivity semantics plus ecad-viewer object deltas."""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import math
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
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.services import (
    bom_diff_service,
    document_diff_service,
    fabrication_compare_service,
    semantic_index_service,
)
from app.services.design_compare_benchmark import DesignCompareBenchmark
from app.services.job_artifact_service import job_artifacts
from app.services.job_runtime import JobContext, JobResult, job_state_root
from app.services.job_service import jobs as v3_jobs
from app.services.workspace_service import workspace

# The pure computation lives in four sibling modules; the stateful job
# orchestration, caching and snapshotting stay here. Re-exported under their
# original names so existing call sites — and the test suite, which patches a
# dozen of the names that stayed — keep working unchanged.
from .design_compare_sources import (  # noqa: F401
    _GENERATED_PARTS,
    _find_pcb,
    _find_pro,
    _is_generated_kicad_path,
    _list_kicad_sources,
)
from .design_compare_semantics import (  # noqa: F401
    _component_native_keys,
    _component_page,
    _component_sources,
    _component_visual_targets,
    _dedupe_visual_targets,
    _diff_designs,
    _lookup_terminal_pairs,
    _match_by_keys,
    _native_item,
    _net_bucket_targets,
    _net_connectivity_fingerprint,
    _net_label_count,
    _net_source_id,
    _net_source_ids,
    _semantic_lookups,
    _semantic_structure_changes,
    _summary,
    _terminal_names,
    _terminal_pairs,
    _terminal_visual_target,
)
from .design_compare_nodes import (  # noqa: F401
    _group_changes,
    _hydrate_native_targets,
    _is_pcb_fabrication_layer,
    _item_layers,
    _native_index,
    _node_change,
    _node_changes,
    _node_classification,
    _node_label,
    _parser_components,
    _property_attributes,
    _route_metrics_from_digest,
    _semantic_with_parser_components,
)
from .design_compare_artifacts import (  # noqa: F401
    _diff_fabrication,
    _diff_stackup,
    _empty_fabrication,
    _extract_stackup,
    _manifest_entry,
)

logger = logging.getLogger(__name__)

design_compare_jobs: Dict[str, dict] = {}
# Defaults land in the platform temporary directory rather than a literal
# `/tmp`, which does not exist on Windows.
_CACHE_ROOT = Path(
    os.environ.get("PRISM_DESIGN_COMPARE_CACHE")
    or Path(tempfile.gettempdir()) / "prism_design_compare_cache"
)
_JOB_ROOT = Path(
    os.environ.get("PRISM_DESIGN_COMPARE_JOBS")
    or Path(tempfile.gettempdir()) / "prism_design_compare"
)
_CACHE_SCHEMA = "prism.design_compare_revision_v13"
_INITIAL_CACHE_SCHEMA = "prism.design_compare_revision_initial_v3"
_CACHE_LOCKS: Dict[str, threading.Lock] = {}
_CACHE_LOCKS_GUARD = threading.Lock()


def _persist_job(job_id: str) -> None:
    job = design_compare_jobs.get(job_id)
    if not job:
        return
    workspace.update_job(
        job_id,
        status=job.get("status", "running"),
        message=job.get("message", ""),
        percent=job.get("percent", 0),
        **{
            key: value
            for key, value in job.items()
            # The result is already published atomically under _JOB_ROOT. Writing
            # the multi-megabyte payload into the workspace JSONB row duplicates
            # serialization and can dominate completion time on large projects.
            if key not in {"job_id", "status", "message", "percent", "result"}
        },
    )


def _repo_paths(project_id: str) -> Tuple[Path, Optional[str], Path]:
    """Return (git_repo_root, relative_sub_path, project_checkout_path)."""
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError(f"Project '{project_id}' not found")
    checkout = Path(row["path"])
    import_type = row.get("import_type")
    parent = row.get("parent_repo_path")
    sub = row.get("sub_path")
    if parent and sub:
        return Path(parent), sub, checkout
    if import_type == "type2_subproject":
        return Path(parent or checkout.parent), sub, checkout
    return checkout, None, checkout


_SNAPSHOT_SUFFIXES = {
    ".kicad_dru",
    ".kicad_jobset",
    ".kicad_pcb",
    ".kicad_pro",
    ".kicad_sch",
    ".kicad_wks",
}
_SNAPSHOT_NAMES = {".prism.json", "fp-lib-table", "sym-lib-table"}


def _snapshot_paths(
    repo_path: Path,
    commit: str,
    relative_path: Optional[str],
) -> List[str]:
    """List only inputs needed by semantic, geometry, BOM, and viewer generation."""
    args = ["git", "-C", str(repo_path), "ls-tree", "-rz", "--name-only", commit]
    if relative_path:
        args.extend(["--", relative_path])
    process = subprocess.run(args, capture_output=True)
    if process.returncode != 0:
        raise RuntimeError(
            f"git ls-tree failed for {commit}: "
            f"{process.stderr.decode('utf-8', errors='replace')}"
        )
    paths: List[str] = []
    for raw in process.stdout.split(b"\0"):
        if not raw:
            continue
        value = raw.decode("utf-8", errors="surrogateescape")
        path = Path(value)
        folded_parts = {part.casefold() for part in path.parts[:-1]}
        if folded_parts & _GENERATED_PARTS:
            continue
        if path.name in _SNAPSHOT_NAMES or path.suffix.casefold() in _SNAPSHOT_SUFFIXES:
            paths.append(value)
    if not paths:
        raise RuntimeError(f"No KiCad design inputs found at {commit}")
    return paths


def _snapshot_commit(repo_path: Path, commit: str, destination: Path, relative_path: Optional[str]) -> None:
    """Archive only comparison inputs, excluding manufacturing and 3D asset bulk."""
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    paths = _snapshot_paths(repo_path, commit, relative_path)
    args = ["git", "-C", str(repo_path), "archive", "--format=tar", commit, "--", *paths]
    archive = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert archive.stdout is not None
    tar = subprocess.Popen(
        ["tar", "-x", "-C", str(destination)],
        stdin=archive.stdout,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    archive.stdout.close()
    _, tar_err = tar.communicate()
    _, arch_err = archive.communicate()
    if archive.returncode != 0:
        raise RuntimeError(
            f"git archive failed for {commit}: {arch_err.decode('utf-8', errors='replace')}"
        )
    if tar.returncode != 0:
        raise RuntimeError(
            f"tar extract failed for {commit}: {tar_err.decode('utf-8', errors='replace')}"
        )
    # Type-2 archives extract as <sub_path>/... — flatten to destination root
    if relative_path:
        nested = destination / relative_path
        if nested.exists() and nested.is_dir():
            for child in list(nested.iterdir()):
                target = destination / child.name
                if target.exists():
                    if target.is_dir():
                        shutil.rmtree(target)
                    else:
                        target.unlink()
                shutil.move(str(child), str(target))
            # remove emptied prefix dirs
            try:
                shutil.rmtree(destination / Path(relative_path).parts[0])
            except Exception:
                pass

    # Drop manufacturing / CI / asset bulk — design compare only needs KiCad sources.
    for name in (
        "Manufacturing-Outputs",
        "Design-Outputs",
        "archive",
        ".github",
        "packages3D",
        "simulation",
        "docs",
        "assets",
    ):
        heavy = destination / name
        if heavy.exists():
            shutil.rmtree(heavy, ignore_errors=True)



def _cache_dir(project_id: str, commit: str) -> Path:
    return (
        _CACHE_ROOT
        / project_id
        / commit
        / semantic_index_service.generator_cache_tag()
    )


def _cache_lock(project_id: str, commit: str) -> threading.Lock:
    key = f"{project_id}:{commit}:{semantic_index_service.generator_cache_tag()}"
    with _CACHE_LOCKS_GUARD:
        return _CACHE_LOCKS.setdefault(key, threading.Lock())


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

        pro = _find_pro(snap)
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
            "bom_rows": timed(
                "bom-projection",
                lambda: _semantic_bom_rows(semantic_index),
            ),
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

        try:
            stackup = timed("stackup", lambda: _extract_stackup(snap))
        except Exception as exc:
            logs.append(f"Stackup extract failed for {commit[:7]}: {exc}")
            stackup = {"present": False, "layers": []}

        fabrication = timed(
            "fabrication-export",
            lambda: _export_fabrication(cache, snap, commit, logs),
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

    board = _find_pcb(snap)
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






def _semantic_bom_rows(semantic_index: Dict[str, Any]) -> List[Dict[str, str]]:
    """Project BOM rows projected from the already-compiled schematic model.

    Design Comparison used to invoke kicad-cli after kicad-monkey had already
    parsed and compiled the same schematic hierarchy. Keeping the projection
    in-process removes that second parser pass and preserves every canonical
    and custom field exposed by the semantic index.
    """

    rows: List[Dict[str, str]] = []
    for component in semantic_index.get("components") or []:
        reference = str(component.get("reference") or "").strip()
        if not reference:
            continue
        fields = {
            str(key): "" if value is None else str(value)
            for key, value in (component.get("fields") or {}).items()
            if str(key)
        }
        if fields.get("kicad_in_bom", "true").strip().casefold() == "false":
            continue
        rows.append(
            {
                **fields,
                "Reference": reference,
                "Value": str(component.get("value") or fields.get("Value") or ""),
                "Footprint": str(
                    component.get("footprint") or fields.get("Footprint") or ""
                ),
            }
        )
    return sorted(rows, key=lambda row: row["Reference"])































































def _run_ecad_object_delta(
    project_id: str,
    base: str,
    head: str,
) -> Dict[str, Any]:
    """Parse both cached snapshots once with ecad-viewer's parser."""

    script = next(
        (
            candidate
            for candidate in (
                Path(__file__).parents[3] / "scripts" / "ecad-diff.mjs",
                Path(__file__).parents[2] / "scripts" / "ecad-diff.mjs",
            )
            if candidate.exists()
        ),
        None,
    )
    if script is None:
        raise RuntimeError("ecad-viewer parser diff script is not installed")
    base_snapshot = _cache_dir(project_id, base) / "snapshot"
    head_snapshot = _cache_dir(project_id, head) / "snapshot"
    if not base_snapshot.exists() or not head_snapshot.exists():
        raise RuntimeError("Design comparison snapshots are not ready for object diff")
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


























_STALE_JOB_SECONDS = int(os.environ.get("PRISM_DESIGN_COMPARE_STALE_SECONDS", "300"))


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
    try:
        configured_workers = int(
            os.environ.get("PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS", "2")
        )
    except ValueError:
        configured_workers = 2
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
    defaults = {"initial": 2, "pcb": 2}
    variable = {
        "initial": "PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS",
        "pcb": "PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS",
    }[stage]
    configured_value = os.environ.get(
        variable,
        os.environ.get(
            "PRISM_DESIGN_COMPARE_MAX_REVISION_WORKERS",
            str(defaults[stage]),
        ),
    )
    try:
        configured = int(configured_value)
    except ValueError:
        configured = defaults[stage]
    return max(1, min(2, configured, revision_count))


def _revision_processes_enabled() -> bool:
    """Whether the two revisions are compiled in separate processes.

    Stage 1 is pure CPU work -- lexing and parsing schematics -- so running
    the two revisions on threads leaves them serialised behind the GIL and
    the pool buys nothing. Processes are the default for that reason; the
    switch exists so a constrained deployment can go back to one address
    space, and so the unit tests can stay in-process.
    """
    raw = os.environ.get("PRISM_DESIGN_COMPARE_REVISION_PROCESSES", "1").strip()
    return raw.lower() not in {"0", "false", "no", "off"}


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


def _revision_bom_rows(revision: Dict[str, Any]) -> List[Dict[str, str]]:
    rows = revision.get("bom_rows")
    if isinstance(rows, list):
        return rows
    return bom_diff_service.parse_bom_csv(revision.get("bom_csv") or "")


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
    base_semantic = _semantic_with_parser_components(base_rev, object_delta["base"])
    head_semantic = _semantic_with_parser_components(head_rev, object_delta["head"])
    sch_diff = assemble(
        "schematic-semantic-diff",
        lambda: _diff_designs(base_semantic, head_semantic),
    )
    parser_changes = assemble(
        "schematic-object-diff",
        lambda: _node_changes(object_delta, "schematic"),
    )
    schematic_changes = assemble(
        "schematic-change-merge",
        lambda: [
            *parser_changes,
            *[
                change
                for change in sch_diff["changes"]
                if change.get("category") in {"nets", "sheets"}
            ],
        ],
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
            _semantic_bom_rows(base_semantic),
            _semantic_bom_rows(head_semantic),
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
            "groups": assemble("schematic-grouping", lambda: _group_changes(schematic_changes)),
            "summary": _summary(schematic_changes),
        },
        "pcb": {
            "changes": [],
            "groups": [],
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
            "groups": assemble("pcb-grouping", lambda: _group_changes(pcb_changes)),
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
                "groupCount": len((result.get(name) or {}).get("groups") or [])
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


def _publish_comparison_result(
    job_id: str,
    job: Dict[str, Any],
    result: Dict[str, Any],
    *,
    version: int,
    benchmark: DesignCompareBenchmark,
) -> Path:
    result_path = _JOB_ROOT / job_id / "result.json"
    with benchmark.span(f"result-publish-v{version}"):
        _atomic_write_json(result_path, result)
    job["result"] = result
    job["result_version"] = version
    job["readiness"] = result["readiness"]
    job["ready_domains"] = [
        domain
        for domain, status in result["readiness"]["domains"].items()
        if status == "ready"
    ]
    return result_path


def _run_job(
    job_id: str,
    project_id: str,
    base: str,
    head: str,
    include_unchanged: bool,
) -> None:
    """Legacy in-process runner retained for unit tests only.

    Production work is enqueued through ``start_design_compare_job`` and executed
    by ``run_design_compare_job_v3`` inside ``prism-worker``.
    """

    job = design_compare_jobs[job_id]
    logs: List[str] = job.setdefault("logs", [])
    job_lock = threading.Lock()
    job_started = time.perf_counter()
    benchmark = DesignCompareBenchmark(
        job_id=job_id,
        metadata={
            "projectId": project_id,
            "base": base,
            "compare": head,
            "initialWorkers": _stage_worker_count("initial", len(set((base, head)))),
            "pcbWorkers": _stage_worker_count("pcb", len(set((base, head)))),
            "semanticGenerator": semantic_index_service.generator_cache_tag(),
            "pipeline": "staged-domain-v1",
        },
    )

    def heartbeat(message: str, percent: Optional[float] = None) -> None:
        with job_lock:
            job["message"] = message
            if percent is not None:
                job["percent"] = percent
            job["logs"] = logs[-40:]
            _persist_job(job_id)

    def append_revision_logs(
        revision_logs: Dict[str, List[str]],
        *,
        stage: str,
    ) -> None:
        for commit in dict.fromkeys((base, head)):
            side = "old/new" if base == head else "old" if commit == base else "new"
            logs.extend(
                f"[{stage}:{side}] {message}"
                for message in revision_logs.get(commit, [])
            )

    try:
        repo_path, relative_path, _checkout = _repo_paths(project_id)
        initial_started = time.perf_counter()
        with benchmark.span("snapshot-pipeline"):
            _prepare_comparison_snapshots(
                project_id,
                repo_path,
                relative_path,
                base,
                head,
                heartbeat,
            )
        with ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="design-compare-object-delta",
        ) as parser_executor:
            def build_object_delta() -> Dict[str, Any]:
                with benchmark.span("ecad-object-delta"):
                    return _run_ecad_object_delta(project_id, base, head)

            object_future = parser_executor.submit(build_object_delta)
            with benchmark.span("initial-revision-pipeline"):
                initial_revisions, initial_logs = _build_initial_revisions(
                    project_id,
                    repo_path,
                    relative_path,
                    base,
                    head,
                    heartbeat,
                    benchmark=benchmark,
                )
            heartbeat("Finishing native object differences…", 45)
            object_delta = object_future.result()
        append_revision_logs(initial_logs, stage="initial")

        heartbeat("Assembling Schematic and BOM differences…", 50)
        initial_result, assembly_state = _assemble_initial_comparison(
            project_id=project_id,
            base=base,
            head=head,
            revisions=initial_revisions,
            object_delta=object_delta,
            include_unchanged=include_unchanged,
            benchmark=benchmark,
        )
        result_path = _publish_comparison_result(
            job_id,
            job,
            initial_result,
            version=1,
            benchmark=benchmark,
        )
        initial_elapsed = time.perf_counter() - initial_started
        logs.append(f"Timing initial ready: {initial_elapsed:.3f}s")
        benchmark.update_metadata(initialReadyMs=round(initial_elapsed * 1000, 3))
        heartbeat(
            "Schematic and BOM ready; building PCB and Stackup in background…",
            60,
        )
        with benchmark.span("pcb-revision-pipeline"):
            complete_revisions, pcb_logs = _build_pcb_revisions(
                project_id,
                base,
                head,
                initial_revisions,
                heartbeat,
                benchmark=benchmark,
            )
        append_revision_logs(pcb_logs, stage="pcb")
        heartbeat("Assembling PCB and Stackup differences…", 92)
        result = _complete_comparison(
            initial_result=initial_result,
            assembly_state=assembly_state,
            base=base,
            head=head,
            revisions=complete_revisions,
            benchmark=benchmark,
        )
        result_path = _publish_comparison_result(
            job_id,
            job,
            result,
            version=2,
            benchmark=benchmark,
        )

        total_elapsed = time.perf_counter() - job_started
        logs.append(f"Timing comparison total: {total_elapsed:.3f}s")
        benchmark.update_metadata(
            totalReadyMs=round(total_elapsed * 1000, 3),
            resultBytes=result_path.stat().st_size,
            schematicChanges=len(result["schematic"]["changes"]),
            pcbChanges=len(result["pcb"]["changes"]),
            bomChanges=len((result.get("bom") or {}).get("changes") or []),
        )
        job["status"] = "completed"
        job["message"] = "Design comparison ready"
        job["percent"] = 100
        job["logs"] = logs
    except Exception as exc:
        logger.exception("staged design-compare failed")
        if job.get("result"):
            failed_result = copy.deepcopy(job["result"])
            domains = failed_result.setdefault("readiness", {}).setdefault("domains", {})
            for domain in ("pcb", "stackup"):
                if domains.get(domain) != "ready":
                    domains[domain] = "failed"
            failed_result["readiness"]["stage"] = "background-failed"
            _publish_comparison_result(
                job_id,
                job,
                failed_result,
                version=int(job.get("result_version") or 1) + 1,
                benchmark=benchmark,
            )
        job["status"] = "failed"
        job["message"] = str(exc)
        job["logs"] = logs + [str(exc)]
        benchmark.update_metadata(error=str(exc))
    finally:
        benchmark_path = _JOB_ROOT / job_id / "benchmark.json"
        try:
            benchmark.write(benchmark_path)
            job["benchmark_path"] = str(benchmark_path)
            job.setdefault("logs", []).append(f"Structured benchmark: {benchmark_path}")
        except Exception:
            logger.exception("design-compare benchmark publish failed")
        _persist_job(job_id)


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
    repository_id = str(row.get("repo_id") or "")
    queued = v3_jobs.enqueue(
        "design_compare",
        {
            "project_id": project_id,
            "base": base,
            "head": head,
            "include_unchanged": include_unchanged,
            "artifact_key": artifact_key,
        },
        worker_pool="prism",
        artifact_key=artifact_key,
        project_id=project_id,
        repository_id=repository_id or None,
        requested_by=requested_by,
        resources={
            "prism_worker": 1,
            "design_compare": 1,
            "semantic_compile": 2,
        },
        locks=(
            [{"key": f"repository:{repository_id}", "mode": "read"}]
            if repository_id
            else [{"key": f"project:{project_id}", "mode": "read"}]
        ),
    )
    return str(queued["job_id"])


def get_job_status(job_id: str) -> Optional[dict]:
    v3_job = v3_jobs.get(job_id)
    if v3_job and v3_job.get("kind") == "design_compare":
        metadata = dict(v3_job.get("result_metadata") or {})
        payload = dict(v3_job.get("payload") or {})
        return {
            "job_id": job_id,
            "status": v3_job.get("status"),
            "message": v3_job.get("message"),
            "percent": v3_job.get("percent", 0),
            "logs": [],
            "project_id": v3_job.get("project_id") or payload.get("project_id"),
            "base": payload.get("base"),
            "head": payload.get("head"),
            "benchmark_path": metadata.get("benchmark_path"),
            "result_version": metadata.get("result_version", 0),
            "ready_domains": metadata.get("ready_domains") or [],
            "readiness": metadata.get("readiness"),
            "result_digest": v3_job.get("result_digest"),
            "error": v3_job.get("error_message") or None,
        }

    # Legacy in-memory / pre-V3 rows are retained only for unit tests that still
    # exercise _run_job directly. Production enqueue never populates this path.
    job = design_compare_jobs.get(job_id) or workspace.get_job(job_id, "design_compare")
    if not job:
        return None

    status = job.get("status")
    if status == "running" and job_id in design_compare_jobs:
        updated = job.get("updated_at")
        try:
            if updated is not None:
                from datetime import datetime, timezone

                if isinstance(updated, str):
                    updated = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                if getattr(updated, "tzinfo", None) is None:
                    updated = updated.replace(tzinfo=timezone.utc)
                age = (datetime.now(timezone.utc) - updated).total_seconds()
                if age > _STALE_JOB_SECONDS:
                    msg = (
                        f"Design compare stalled after {int(age)}s "
                        f"(likely worker restart during large-board compile). "
                        f"Close and retry."
                    )
                    job["status"] = "failed"
                    job["message"] = msg
                    design_compare_jobs[job_id]["status"] = "failed"
                    design_compare_jobs[job_id]["message"] = msg
                    status = "failed"
        except Exception:
            logger.exception("stale design-compare check failed")

    return {
        "job_id": job_id,
        "status": status,
        "message": job.get("message"),
        "percent": job.get("percent", 0),
        "logs": job.get("logs") or [],
        "project_id": job.get("project_id"),
        "base": job.get("base") or (job.get("payload") or {}).get("base"),
        "head": job.get("head") or (job.get("payload") or {}).get("head"),
        "benchmark_path": job.get("benchmark_path") or (job.get("result_metadata") or {}).get("benchmark_path"),
        "result_version": job.get("result_version", 0) or (job.get("result_metadata") or {}).get("result_version", 0),
        "ready_domains": job.get("ready_domains") or (job.get("result_metadata") or {}).get("ready_domains") or [],
        "readiness": job.get("readiness") or (job.get("result_metadata") or {}).get("readiness"),
    }


def get_job_result(job_id: str) -> Optional[dict]:
    v3_job = v3_jobs.get(job_id)
    if v3_job and v3_job.get("result_path"):
        path = Path(str(v3_job["result_path"]))
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    job = design_compare_jobs.get(job_id)
    if job and job.get("result"):
        return job["result"]
    path = _JOB_ROOT / job_id / "result.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    stored = workspace.get_job(job_id, "design_compare")
    if stored and stored.get("result"):
        return stored["result"]
    return None


def get_job_sidecar(job_id: str, digest: str) -> Optional[dict]:
    artifact = v3_jobs.get_artifact_for_job_digest(job_id, digest)
    if not artifact or artifact.get("kind") != "design_compare_sidecar":
        return None
    return artifact


def delete_job(job_id: str) -> None:
    v3_job = v3_jobs.get(job_id)
    if v3_job:
        if v3_job.get("status") in {"queued", "running", "retry_wait", "cancel_requested"}:
            v3_jobs.request_cancel(job_id)
        return
    design_compare_jobs.pop(job_id, None)
    path = _JOB_ROOT / job_id
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
    try:
        workspace.delete_job(job_id)
    except Exception:
        logger.exception("Failed to delete legacy design-compare job %s", job_id)


def run_design_compare_job_v3(context: JobContext) -> JobResult:
    """Execute and publish a semantic comparison under a fenced worker lease."""

    payload = context.payload
    project_id = str(payload["project_id"])
    requested_base = str(payload["base"])
    requested_head = str(payload["head"])
    include_unchanged = bool(payload.get("include_unchanged"))
    artifact_key = str(payload["artifact_key"])
    repo_path, relative_path, _checkout = _repo_paths(project_id)
    base = _resolve_revision(repo_path, requested_base)
    head = _resolve_revision(repo_path, requested_head)
    logs: list[str] = []
    started = time.perf_counter()
    benchmark = DesignCompareBenchmark(
        job_id=context.job_id,
        metadata={
            "projectId": project_id,
            "base": base,
            "compare": head,
            "initialWorkers": _stage_worker_count("initial", len(set((base, head)))),
            "pcbWorkers": _stage_worker_count("pcb", len(set((base, head)))),
            "semanticGenerator": semantic_index_service.generator_cache_tag(),
            "pipeline": "staged-domain-v3-worker",
            "fence": context.fence,
        },
    )

    def heartbeat(message: str, percent: Optional[float] = None) -> None:
        print(message, flush=True)
        context.progress(
            stage="building",
            message=message,
            percent=percent,
        )

    def append_revision_logs(revision_logs: Dict[str, List[str]], stage: str) -> None:
        for commit in dict.fromkeys((base, head)):
            side = "old/new" if base == head else "old" if commit == base else "new"
            for message in revision_logs.get(commit, []):
                rendered = f"[{stage}:{side}] {message}"
                logs.append(rendered)
                print(rendered, flush=True)

    try:
        context.check_cancelled()
        with benchmark.span("snapshot-pipeline"):
            _prepare_comparison_snapshots(
                project_id,
                repo_path,
                relative_path,
                base,
                head,
                heartbeat,
            )
        with ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="design-compare-object-delta",
        ) as parser_executor:
            def build_object_delta() -> Dict[str, Any]:
                with benchmark.span("ecad-object-delta"):
                    return _run_ecad_object_delta(project_id, base, head)

            object_future = parser_executor.submit(build_object_delta)
            with benchmark.span("initial-revision-pipeline"):
                initial_revisions, initial_logs = _build_initial_revisions(
                    project_id,
                    repo_path,
                    relative_path,
                    base,
                    head,
                    heartbeat,
                    benchmark=benchmark,
                )
            context.check_cancelled()
            heartbeat("Finishing native object differences…", 45)
            object_delta = object_future.result()
        append_revision_logs(initial_logs, "initial")
        context.check_cancelled()
        heartbeat("Assembling Schematic and BOM differences…", 50)
        initial_result, assembly_state = _assemble_initial_comparison(
            project_id=project_id,
            base=base,
            head=head,
            revisions=initial_revisions,
            object_delta=object_delta,
            include_unchanged=include_unchanged,
            benchmark=benchmark,
        )
        partial = job_artifacts.prepare_json(
            context,
            initial_result,
            kind="design_compare",
            artifact_key=artifact_key,
            schema_version=str(initial_result.get("schema") or ""),
            generator_version=semantic_index_service.generator_cache_tag(),
            readiness="partial",
        )
        partial_details = {
            "result_version": 1,
            "ready_domains": ["schematic", "bom"],
            "readiness": initial_result["readiness"],
            "base": base,
            "head": head,
        }
        if not v3_jobs.publish_partial_artifact(
            context.job_id,
            context.worker_id,
            context.fence,
            partial.__dict__,
            stage="background-pcb",
            message="Schematic and BOM ready; building PCB and Stackup in background…",
            percent=60,
            details=partial_details,
        ):
            raise RuntimeError("Fenced partial comparison publication was rejected")

        context.check_cancelled()
        with benchmark.span("pcb-revision-pipeline"):
            complete_revisions, pcb_logs = _build_pcb_revisions(
                project_id,
                base,
                head,
                initial_revisions,
                heartbeat,
                benchmark=benchmark,
            )
        append_revision_logs(pcb_logs, "pcb")
        context.check_cancelled()
        heartbeat("Assembling PCB and Stackup differences…", 92)
        result = _complete_comparison(
            initial_result=initial_result,
            assembly_state=assembly_state,
            base=base,
            head=head,
            revisions=complete_revisions,
            benchmark=benchmark,
            # Layer artwork is prepared as content-addressed artifacts, and
            # `prepare_file` only accepts sources inside the fence.
            render_dir=context.staging_dir / "fabrication-render",
        )
        elapsed = time.perf_counter() - started
        benchmark.update_metadata(
            totalReadyMs=round(elapsed * 1000, 3),
            schematicChanges=len(result["schematic"]["changes"]),
            pcbChanges=len(result["pcb"]["changes"]),
            bomChanges=len((result.get("bom") or {}).get("changes") or []),
        )
        benchmark_path = (
            job_state_root()
            / "jobs"
            / context.job_id
            / f"benchmark-fence-{context.fence}.json"
        )
        benchmark.write(benchmark_path)
        complete, sidecars = _prepare_comparison_bundle(
            context,
            result,
            artifact_key=artifact_key,
        )
        return JobResult(
            message="Design comparison ready",
            artifact=complete,
            sidecar_artifacts=sidecars,
            details={
                "result_version": 2,
                "ready_domains": ["schematic", "bom", "pcb", "stackup", "fabrication"],
                "readiness": result["readiness"],
                "benchmark_path": str(benchmark_path),
                "base": base,
                "head": head,
                "sidecar_count": len(sidecars),
            },
        )
    except Exception:
        try:
            benchmark_path = (
                job_state_root()
                / "jobs"
                / context.job_id
                / f"benchmark-fence-{context.fence}.json"
            )
            benchmark.write(benchmark_path)
        except Exception:
            logger.exception("Could not publish failed V3 comparison benchmark")
        raise
