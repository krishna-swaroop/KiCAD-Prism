from __future__ import annotations

from typing import Any, Callable, Iterable, Mapping
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.services.component_catalog_service import catalog_service
from app.services.job_artifact_service import job_artifacts
from app.services.git_read_cache_service import git_read_cache
from app.services.job_service import jobs as context_jobs
from app.services.job_kinds import JobKind
from app.services.job_runtime import (
    CHECKPOINT_KEY,
    PARTIAL_RESULT_KEY,
    JobCancelled,
    JobContext,
    JobResult,
    LostJobLease,
    PermanentJobError,
    RetryableJobError,
)
from app.services.catalog.conflicts import CatalogConflict
from app.services.catalog.project_import_sessions import IMPORT_JOB_KINDS, RUNNING_STATUSES, CatalogProjectImportSessions
from app.services.catalog.step_quarantine import StepQuarantine
from app.services.project_component_import_service import run_project_import_session
from app.services.library_folder_import_service import run_folder_import_session
from app.services.local_artifact_store import artifact_store


def _step(
    context: JobContext,
    *,
    progress: float | None = None,
    message: str | None = None,
    checkpoint: dict[str, Any] | None = None,
    result: dict[str, Any] | None = None,
) -> None:
    """A catalog progress step: one checkpoint under the ``catalog`` stage."""

    context.save_checkpoint(
        stage="catalog",
        message=message or "Processing catalog job",
        percent=progress,
        checkpoint=checkpoint,
        result=result,
    )


def _list_active_component_ids() -> list[str]:
    ids: list[str] = []
    page = 1
    while True:
        result = catalog_service.list_components(
            include_inactive=False, page=page, page_size=10000, lightweight=True
        )
        ids.extend(str(component["id"]) for component in result["items"])
        if page >= int(result.get("pages") or 1):
            break
        page += 1
    return ids


def resolve_validation_worklist(context: JobContext) -> list[str]:
    """Return the frozen validation worklist for this job.

    Resume uses checkpoint.component_ids, never a fresh catalog listing. A
    crash after validating item i but before checkpointing i+1 re-runs i:
    the index is at-least-once, not exact-once.
    """
    saved = context.checkpoint.get("component_ids")
    if saved is not None:
        return [str(value) for value in saved]
    requested = context.payload.get("component_ids")
    if requested is not None:
        return [str(value) for value in requested]
    return _list_active_component_ids()


def run_validation(context: JobContext) -> dict[str, Any]:
    ids = resolve_validation_worklist(context)
    errors: list[dict[str, str]] = list(context.partial_result.get("errors") or [])
    validated = int(context.checkpoint.get("index") or 0)
    component_payload: dict[str, Any] | None = None
    total = len(ids)
    if validated < total:
        start_message = f"Validating {validated + 1}/{total} components"
    elif total:
        start_message = f"Validated {validated}/{total} components"
    else:
        start_message = "No components to validate"
    _step(
        context,
        progress=(validated / total) * 100 if total else 100,
        message=start_message,
        checkpoint={"index": validated, "component_ids": ids},
        result={"validated": validated, "total": total, "errors": errors},
    )
    for index in range(validated, total):
        component_id = ids[index]
        _step(
            context,
            progress=(index / total) * 100 if total else 100,
            message=f"Validating {index + 1}/{total} components",
            checkpoint={"index": index, "component_ids": ids},
            result={"validated": index, "total": total, "errors": errors},
        )
        try:
            result = catalog_service.validate_component_klc(component_id)
            if total == 1:
                component_payload = result.get("component")
        except ValueError as exc:
            errors.append({"component_id": component_id, "error": str(exc)})
        validated = index + 1
    _step(
        context,
        progress=100,
        message=f"Validated {validated}/{total} components" if total else "No components to validate",
        checkpoint={"index": validated, "component_ids": ids},
        result={"validated": validated, "total": total, "errors": errors, "component": component_payload},
    )
    return {"validated": validated, "total": total, "errors": errors, "component": component_payload}


def run_previews(context: JobContext) -> dict[str, Any]:
    def callback(counts: dict[str, Any]) -> None:
        total = int(counts.get("total_assets") or 0)
        scanned = int(counts.get("scanned_assets") or 0)
        _step(
            context,
            progress=100 if total == 0 else (scanned / total) * 100,
            message=f"Generating previews {scanned}/{total}",
            checkpoint={"scanned_assets": scanned},
            result=counts,
        )

    return catalog_service.generate_missing_component_previews(progress_callback=callback)


def run_project_import(context: JobContext) -> dict[str, Any]:
    session_id = str(context.payload["session_id"])
    _step(context, progress=5, message="Scanning captured project revisions", checkpoint={"session_id": session_id})
    run_project_import_session(session_id)
    session = catalog_service.get_project_import_session(session_id)
    if not session or session.get("status") == "failed":
        raise RuntimeError(str((session or {}).get("error_message") or "Project import failed"))
    _step(context, progress=100, message="Project import proposals staged")
    return {"session_id": session_id, "proposal_count": int(session.get("proposal_count") or 0)}


def run_folder_import(context: JobContext) -> dict[str, Any]:
    payload = context.payload
    session_id = str(payload["session_id"])
    snapshot_id = str(payload["snapshot_id"])
    approved_values = list(payload.get("approved_component_ids") or [])
    footprint_resolutions = {
        str(key): str(value) for key, value in dict(payload.get("footprint_resolutions") or {}).items()
    }
    _step(context, progress=5, message="Resolving KiCad library snapshot", checkpoint={"snapshot_id": snapshot_id})
    run_folder_import_session(
        session_id,
        snapshot_id,
        dict(payload.get("server_source") or {}) or None,
        set(str(value) for value in approved_values) if approved_values else None,
        footprint_resolutions,
    )
    session = catalog_service.get_project_import_session(session_id)
    _step(context, progress=100, message="Folder import proposals staged")
    return {"session_id": session_id, "proposal_count": int((session or {}).get("proposal_count") or 0)}


IMPORT_JOB_TYPES = IMPORT_JOB_KINDS


def settle_import_job(job: Mapping[str, Any]) -> bool:
    """End hook: a running import session whose job ended without success fails."""

    if str(job.get("status") or "") not in {"failed", "cancelled"}:
        return False
    session_id = str((job.get("payload") or {}).get("session_id") or "")
    if not session_id:
        return False
    session = catalog_service.get_project_import_session(session_id)
    if not session or str(session.get("status") or "") not in RUNNING_STATUSES:
        return False
    reason = str(job.get("error_message") or job.get("message") or "The import did not finish")
    catalog_service.update_project_import_session(session_id, status="failed", error_message=reason)
    return True


def _running_import_session_ids(session_ids: list[str]) -> set[str]:
    if not session_ids:
        return set()
    with catalog_service.connection() as conn:
        return CatalogProjectImportSessions().running_session_ids(conn, session_ids)


def _unsettled_import_job_ids(kind: str) -> list[str]:
    from app.services.job_queries import newest_jobs

    ended = newest_jobs(kind=kind, statuses=("failed", "cancelled"), limit=100)
    session_ids = [str((job.get("payload") or {}).get("session_id") or "") for job in ended]
    running = _running_import_session_ids([session_id for session_id in session_ids if session_id])
    return [
        str(job["job_id"])
        for job, session_id in zip(ended, session_ids)
        if session_id and session_id in running
    ]


def purge_superseded_step_files(*, job_id: str = "", pinned_revision_ids: Iterable[str] = ()) -> dict[str, Any]:
    """Quarantine abandoned draft STEP files, then delete quarantined ones past the grace period.

    Both passes keep the files of ``pinned_revision_ids``, and the expiry pass restores a
    quarantined file a pin needs again. Both commit their
    purge-ledger rows (``catalog/step_quarantine.py``).
    """
    catalog_service.initialize()
    with catalog_service.connection() as conn:
        pinned = tuple(sorted(map(str, pinned_revision_ids)))
        result = StepQuarantine.purge_superseded_step_files(
            conn, catalog_service.runtime, job_id=job_id, pinned_revision_ids=pinned
        )
        expired = StepQuarantine.expire(
            conn,
            catalog_service.runtime,
            grace_days=settings.CATALOG_DRAFT_MODEL_QUARANTINE_DAYS,
            job_id=job_id,
            pinned_revision_ids=pinned,
        )
        conn.commit()
    return {**result, "expired": expired}


def run_artifact_maintenance(context: JobContext) -> dict[str, Any]:
    _step(context, progress=10, message="Applying local artifact retention")
    result = artifact_store.run_retention()
    _step(context, progress=45, message="Reconciling fenced job artifacts", result=result)
    reconciliation = job_artifacts.reconcile_registered_artifacts()
    metadata_rows_pruned = context_jobs.prune_artifact_metadata(
        retention_seconds=max(
            0,
            settings.PRISM_JOB_ARTIFACT_RETENTION_DAYS,
        )
        * 24
        * 60
        * 60,
        partial_retention_seconds=max(
            0,
            settings.PRISM_JOB_PARTIAL_RETENTION_HOURS,
        )
        * 60
        * 60,
    )
    _step(
        context,
        progress=60,
        message="Collecting unreferenced artifact objects",
        result={**result, **reconciliation},
    )
    # One collection over the shared object tree; it asks every owner
    # (object_store.default_reference_owners), not just job metadata.
    garbage_collection = job_artifacts.collect_unreferenced_objects()
    staging_cleanup = job_artifacts.cleanup_stale_staging()
    git_cache_rows_purged = git_read_cache.prune()
    # After artifact metadata: a job whose artifacts just expired can go too.
    from app.services.job_retention import prune_jobs

    job_retention = prune_jobs(context_jobs)
    sim_retention = _sim_studio_retention()
    _step(context, progress=80, message="Quarantining superseded STEP payloads")
    step_result = purge_superseded_step_files(job_id=context.job_id)
    staging = catalog_service.cleanup_resolved_import_staging(
        older_than=(datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    )
    return {
        **result,
        **reconciliation,
        **garbage_collection,
        **staging_cleanup,
        "job_artifact_metadata_rows_pruned": metadata_rows_pruned,
        "git_cache_rows_purged": git_cache_rows_purged,
        **job_retention,
        "superseded_steps_quarantined": step_result["quarantined"],
        "quarantined_steps_deleted": step_result["expired"]["deleted"],
        "quarantined_steps_restored": step_result["expired"]["restored"],
        "staging_sessions_removed": staging["removed"],
        **sim_retention,
    }


def _sim_studio_retention() -> dict[str, int]:
    """Simulation Studio's runs, run folders and meshes (``app.sim_studio.retention``).

    Runs while the Studio is enabled, and afterwards for as long as runs it
    left behind are on disk; an installation that never used it is untouched.
    """

    from app.sim_studio import retention as sim_retention
    from app.sim_studio.runs import sim_root

    if not settings.PRISM_SIM_STUDIO_ENABLED and not sim_root().is_dir():
        return {}
    return sim_retention.prune_runs()


def run_metadata_batch(context: JobContext) -> dict[str, Any]:
    payload = context.payload
    batch_id = str(payload["batch_id"])
    actor = str(payload.get("actor") or context.job.get("requested_by") or "metadata-worker")

    def callback(counts: dict[str, Any]) -> None:
        total = int(counts.get("total") or 0)
        completed = int(counts.get("completed") or 0)
        _step(
            context,
            progress=100 if total == 0 else (completed / total) * 100,
            message=f"Applying metadata revisions {completed}/{total}",
            checkpoint={"batch_id": batch_id, "completed": completed},
            result={"batch_id": batch_id, **counts},
        )

    try:
        result = catalog_service.apply_metadata_batch(
            batch_id,
            actor=actor,
            item_ids=[str(value) for value in payload.get("item_ids") or []],
            progress_callback=callback,
        )
    except CatalogConflict:
        raise
    except ValueError as error:
        raise PermanentJobError(str(error), code="catalog_invalid_input") from error
    _step(context, progress=100, message="Metadata batch applied", result=result)
    return result


def run_model_glb(context: JobContext) -> dict[str, Any]:
    """CONTRACTS_P2 §18.2: convert a part's STEP models to GLB with Geometer."""
    component_id = str(context.payload.get("componentId") or "")
    revision_id = str(context.payload.get("revisionId") or "") or None
    _step(context, message="Converting 3D models", progress=0.0)
    models = catalog_service.part_relations.convert_models(component_id, revision_id)
    _step(context, message="Converted 3D models", progress=100.0)
    return {"componentId": component_id, "converted": sum(1 for m in models if m["glb"]), "models": len(models)}


def run_project_catalog_usage(context: JobContext) -> dict[str, Any]:
    """Issue #698: record which catalog revision each part of a project commit placed."""
    from app.services import project_catalog_usage_service

    project_id = str(context.payload["project_id"])
    _step(context, progress=10, message="Reading schematics")
    result = project_catalog_usage_service.scan(project_id, str(context.payload.get("commit") or "HEAD"))
    _step(context, progress=100, message="Library usage recorded", result=result)
    return result


CatalogHandler = Callable[[JobContext], dict[str, Any]]

HANDLERS: dict[str, CatalogHandler] = {
    "catalog_validation": run_validation,
    "catalog_preview_generation": run_previews,
    "project_component_import": run_project_import,
    "folder_library_import": run_folder_import,
    "artifact_maintenance": run_artifact_maintenance,
    "catalog_metadata_batch": run_metadata_batch,
    "catalog_model_glb": run_model_glb,
    "project_catalog_usage": run_project_catalog_usage,
}

# These load KiCad libraries and take a catalog_kicad slot as well.
KICAD_HEAVY_JOB_TYPES = frozenset(
    {
        "catalog_validation",
        "catalog_preview_generation",
        "folder_library_import",
        "project_component_import",
    }
)


def _adopt_queued_envelope(context: JobContext) -> None:
    """Read a job queued before the catalog envelope was removed.

    Such a job's payload is ``{catalog_payload, catalog_checkpoint,
    catalog_result, ...}``. Only jobs already queued at upgrade time have it.
    """

    payload = context.job["payload"]
    if "catalog_payload" not in payload:
        return
    context.job["payload"] = {
        **dict(payload.get("catalog_payload") or {}),
        CHECKPOINT_KEY: dict(payload.get("catalog_checkpoint") or {}),
        PARTIAL_RESULT_KEY: dict(payload.get("catalog_result") or {}),
    }


def run_catalog_job_v3(context: JobContext) -> JobResult:
    """The catalog pool's handler: runs the kind's task and maps its errors.

    Unknown errors stay retryable; catalog conflicts and invalid input fail
    for good with their code. The accumulated result is the job's details
    and, for an idempotent job, its JSON artifact.
    """

    job_type = str(context.job["kind"])
    handler = HANDLERS.get(job_type)
    if handler is None:
        raise PermanentJobError(
            f"Unsupported catalog job type: {job_type}",
            code="unsupported_catalog_job",
        )
    _adopt_queued_envelope(context)
    catalog_service.initialize()
    artifact_store.initialize()
    try:
        result = handler(context)
    except (JobCancelled, LostJobLease, RetryableJobError, PermanentJobError):
        raise
    except CatalogConflict as error:
        raise PermanentJobError(str(error), code=error.code) from error
    except Exception as error:
        raise RetryableJobError(
            str(error),
            code="catalog_job_failed",
            retry_after_seconds=5,
        ) from error
    accumulated_result = {**context.partial_result, **dict(result or {})}
    context.check_cancelled()
    artifact_key = str(context.job.get("artifact_key") or "")
    if artifact_key:
        artifact = job_artifacts.prepare_json(
            context,
            accumulated_result,
            kind=job_type,
            artifact_key=artifact_key,
            schema_version="prism.catalog_job_result.a0",
        )
        return JobResult(
            message="Catalog job completed",
            artifact=artifact,
            details=accumulated_result,
        )
    return JobResult(
        message="Catalog job completed",
        details=accumulated_result,
    )


CATALOG_JOB_KINDS = {
    job_type: JobKind(
        job_type,
        run_catalog_job_v3,
        pool="catalog",
        resources=(
            {"catalog_worker": 1, "catalog_kicad": 1}
            if job_type in KICAD_HEAVY_JOB_TYPES
            else {"catalog_worker": 1}
        ),
        **(
            {
                "settle": settle_import_job,
                "orphans": lambda kind=job_type: _unsettled_import_job_ids(kind),
            }
            if job_type in IMPORT_JOB_TYPES
            else {}
        ),
    )
    for job_type in HANDLERS
}
JOB_KINDS = tuple(CATALOG_JOB_KINDS.values())
