"""Design Comparison: the ``design_compare`` job and its revision cache.

Every comparison runs ``prism-kicad compare`` over two revisions
(``design_compare_bundle_path``, amendment C2r). The legacy staged pipeline and
its Node parser were deleted in R1: there is one path.

This module keeps what the bundle path and the result routes share: the
fabrication plot cached by bundle key, the layer-render sidecars, the cache's
size cap, revision resolution, and the job's status/result reads.
"""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services import event_log, fabrication_compare_service, project_revision
from app.services import design_compare_bundle_path
from app.services.design_bundle import cli as design_bundle_cli
from app.services.design_compare_artifacts import _manifest_entry
from app.services.job_artifact_service import job_artifacts
from app.services.job_kinds import JobKind, JobSubject, memory_units, repository_lock
from app.services.job_runtime import JobContext, JobResult
from app.services.job_service import ACTIVE_STATUSES, jobs as v3_jobs
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)

# Defaults land in the platform temporary directory rather than a literal
# `/tmp`, which does not exist on Windows.
_CACHE_ROOT = Path(
    settings.PRISM_DESIGN_COMPARE_CACHE
    or Path(tempfile.gettempdir()) / "prism_design_compare_cache"
)


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


# The revision cache never rolled over: a snapshot plus its ~21 MB ecad object
# index is kept per commit, forever, on a persistent volume. Cap the total and
# evict least-recently-used commit directories so it cannot grow without bound.
# 0 disables the cap.
_CACHE_MAX_BYTES = settings.PRISM_DESIGN_COMPARE_CACHE_MAX_BYTES

# Never evict an entry used within this window. `_prune_revision_cache` runs in
# one worker while three others may be mid-build, and the per-process cache
# locks cannot coordinate across them, so a plain size check could delete a
# snapshot a live job is still reading. An entry is stamped on every use, so a
# recent stamp means "someone may still be in here".
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


_FABRICATION_COMPLETE_MARKER = ".prism_complete"


def _plot_fabrication(board: Path, output: Path, staging: Path, label: str, logs: List[str]) -> Dict[str, Any]:
    """Plot ``board``'s Gerber package into ``output`` once, through ``staging``.

    ``output`` counts as complete only with its marker file; anything else is
    an interrupted export and is plotted again. ``label`` names the revision
    in the logs. The bundle path (``design_compare_bundle_path``) calls it.
    """

    if (output / _FABRICATION_COMPLETE_MARKER).is_file():
        return {"present": True, "dir": str(output)}
    # Incomplete leftover from an interrupted export — do not reuse.
    if output.exists():
        shutil.rmtree(output, ignore_errors=True)
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    ok, message = fabrication_compare_service.export_gerbers(board, staging)
    if not ok:
        logs.append(f"Gerber export failed for {label}: {message}")
        shutil.rmtree(staging, ignore_errors=True)
        return {"present": False, "reason": message}
    # A missing drill program costs the drill layers, not the whole package, so
    # it is a warning on an otherwise usable fabrication comparison.
    drilled, drill_message = fabrication_compare_service.export_drill(board, staging)
    if not drilled:
        logs.append(f"Drill export failed for {label}: {drill_message}")
    # Marker last inside staging, then promote atomically so a crash mid-plot
    # never leaves a directory that the next run would treat as complete.
    (staging / _FABRICATION_COMPLETE_MARKER).write_text("1", encoding="utf-8")
    staging.replace(output)
    logs.append(f"Plotted fabrication output for {label}")
    return {
        "present": True,
        "dir": str(output),
        "warnings": [] if drilled else [f"drill program unavailable: {drill_message}"],
    }


def _prepare_render_sidecars(
    context: JobContext,
    fabrication: Dict[str, Any],
    *,
    artifact_key: str,
    generator_version: str,
) -> tuple[List[Any], Dict[str, Dict[str, Any]]]:
    """Layer artwork as one sidecar per layer per revision, so a reviewer fetches
    only the layer they opened, not every plotted layer on the board.

    Rewrites each layer's ``render`` to the sidecar names, in place.
    """

    render_artifacts: List[Any] = []
    render_manifest: Dict[str, Dict[str, Any]] = {}
    for layer in (fabrication.get("layers") or []):
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
                generator_version=generator_version,
                readiness="sidecar",
            )
            render_artifacts.append(prepared)
            render_manifest[name] = _manifest_entry(prepared)
            # The payload carries the sidecar's name; the API turns names into
            # URLs in one place, for every sidecar alike.
            render[side] = name
    return render_artifacts, render_manifest


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
    # The engine digest as well as the generator: a compare fix that changes
    # no bundle member must not serve the comparisons cached before it.
    identity: Dict[str, Any] = {
        "project": project_id,
        "projectFileRel": str(row.get("project_file_rel") or ""),
        "base": base,
        "head": head,
        "includeUnchanged": include_unchanged,
        "pipeline": design_compare_bundle_path.PIPELINE,
        "generator": design_bundle_cli.generator().digest,
        "engine": design_bundle_cli.binary_digest(),
    }
    artifact_key = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    payload: Dict[str, Any] = {
        "project_id": project_id,
        "base": base,
        "head": head,
        "include_unchanged": include_unchanged,
        "artifact_key": artifact_key,
        "project_file_rel": str(row.get("project_file_rel") or ""),
        "pipeline": design_compare_bundle_path.PIPELINE,
        "requested_by": requested_by,
    }
    queued = DESIGN_COMPARE.enqueue(
        payload,
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
    """The latest published result (a partial one while fabrication is still building)."""

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
    if job and job.get("status") in ACTIVE_STATUSES:
        v3_jobs.request_cancel(job_id)


def _late_domains_failed(initial_result: Dict[str, Any]) -> Dict[str, Any]:
    failed = copy.deepcopy(initial_result)
    readiness = failed.setdefault("readiness", {})
    domains = readiness.setdefault("domains", {})
    for domain, status in list(domains.items()):
        if status != "ready":
            domains[domain] = "failed"
    readiness["stage"] = "background-failed"
    return failed


def run_design_compare_job_v3(context: JobContext) -> JobResult:
    """Job handler ``design_compare``: one comparison under a fenced worker lease."""

    payload = context.payload
    project_id = str(payload["project_id"])
    artifact_key = str(payload["artifact_key"])
    if (_project_anchor(project_id) or "") != str(payload.get("project_file_rel") or ""):
        raise RuntimeError(
            "Project anchor changed after the comparison was queued; retry the comparison"
        )
    if payload.get("pipeline") != design_compare_bundle_path.PIPELINE:
        raise RuntimeError("Design comparison must be queued on the compare pipeline")
    location = project_revision.locate_id(project_id)
    return design_compare_bundle_path.run_job(
        context,
        base=_resolve_revision(location.repo_root, str(payload["base"])),
        head=_resolve_revision(location.repo_root, str(payload["head"])),
    )


def settle_comparison_end(job: Dict[str, Any]) -> bool:
    """End hook: record a finished comparison; republish late domains as failed.

    A completed job appends ``comparison.done`` with the commits its result
    carries, after the job row committed. An ended comparison still showing late
    domains as building (its process died after the partial result) republishes
    them as failed, as version 2, the way a failure inside the handler does
    (D19).

    Unfenced, because the attempt is over; applies only while the job's result
    is the partial one it read. Returns whether it published. Idempotent. The
    runner traps no SIGTERM (D20): a cancel that kills it is settled here.
    """

    payload = dict(job.get("payload") or {})
    metadata = dict(job.get("result_metadata") or {})
    job_id = str(job.get("job_id") or job.get("id") or "")
    if job.get("status") == "completed":
        event_log.record_quietly(
            "comparison.done",
            project_id=job.get("project_id") or payload.get("project_id"),
            topic=f"job:{job_id}",
            payload={
                "jobId": job_id,
                "base": str(metadata.get("base") or payload.get("base") or ""),
                "compare": str(metadata.get("head") or payload.get("head") or ""),
            },
        )
        return False
    if job.get("status") not in {"failed", "cancelled"} or metadata.get("result_version") != 1:
        return False
    path = Path(str(job.get("result_path") or ""))
    if not job.get("result_digest") or not path.is_file():
        return False
    failed = _late_domains_failed(json.loads(path.read_text(encoding="utf-8")))
    artifact = job_artifacts.prepare_ended_json(
        failed,
        kind="design_compare",
        artifact_key=str(payload.get("artifact_key") or job.get("artifact_key") or ""),
        schema_version=str(failed.get("schema") or ""),
        generator_version=design_bundle_cli.generator().digest,
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
    # Two side reads (each a prism-kicad parse, the 2.0-2.1 GiB stage) run at
    # once while two kicad-cli plots start, so 3072 MiB is estimated from two
    # parsers plus one plot rather than from a single measurement.
    resources={"prism_worker": 1, "design_compare": 1, **memory_units(3072)},
    lock=repository_lock("read"),
    settle=settle_comparison_end,
    orphans=_unsettled_comparisons,
)
JOB_KINDS = (DESIGN_COMPARE,)
