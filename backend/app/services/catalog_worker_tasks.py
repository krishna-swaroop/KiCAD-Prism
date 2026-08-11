from __future__ import annotations

import os
from typing import Any, Callable
from datetime import datetime, timedelta, timezone

from app.services.component_catalog_service import catalog_service
from app.services.job_artifact_service import job_artifacts
from app.services.git_read_cache_service import git_read_cache
from app.services.job_service import jobs as context_jobs
from app.services.job_runtime import (
    JobCancelled,
    JobContext,
    JobResult,
    LostJobLease,
    RetryableJobError,
)
from app.services.project_component_import_service import run_project_import_session
from app.services.library_folder_import_service import run_folder_import_session
from app.services.local_artifact_store import artifact_store


Progress = Callable[..., bool]


def run_validation(job: dict[str, Any], progress: Progress) -> dict[str, Any]:
    requested = job["payload"].get("component_ids")
    if requested is None:
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
    else:
        ids = [str(value) for value in requested]
    errors: list[dict[str, str]] = list(job["result"].get("errors") or [])
    validated = int(job["checkpoint"].get("index") or 0)
    component_payload: dict[str, Any] | None = None
    total = len(ids)
    for index in range(validated, total):
        component_id = ids[index]
        progress(
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
    progress(
        progress=100,
        message=f"Validated {validated}/{total} components" if total else "No components to validate",
        checkpoint={"index": validated, "component_ids": ids},
        result={"validated": validated, "total": total, "errors": errors, "component": component_payload},
    )
    return {"validated": validated, "total": total, "errors": errors, "component": component_payload}


def run_previews(job: dict[str, Any], progress: Progress) -> dict[str, Any]:
    def callback(counts: dict[str, Any]) -> None:
        total = int(counts.get("total_assets") or 0)
        scanned = int(counts.get("scanned_assets") or 0)
        progress(
            progress=100 if total == 0 else (scanned / total) * 100,
            message=f"Generating previews {scanned}/{total}",
            checkpoint={"scanned_assets": scanned},
            result=counts,
        )

    return catalog_service.generate_missing_component_previews(progress_callback=callback)


def run_project_import(job: dict[str, Any], progress: Progress) -> dict[str, Any]:
    session_id = str(job["payload"]["session_id"])
    progress(progress=5, message="Scanning captured project revisions", checkpoint={"session_id": session_id})
    run_project_import_session(session_id)
    session = catalog_service.get_project_import_session(session_id)
    if not session or session.get("status") == "failed":
        raise RuntimeError(str((session or {}).get("error_message") or "Project import failed"))
    progress(progress=100, message="Project import proposals staged")
    return {"session_id": session_id, "proposal_count": int(session.get("proposal_count") or 0)}


def run_folder_import(job: dict[str, Any], progress: Progress) -> dict[str, Any]:
    session_id = str(job["payload"]["session_id"])
    snapshot_id = str(job["payload"]["snapshot_id"])
    approved_values = list(job["payload"].get("approved_component_ids") or [])
    footprint_resolutions = {
        str(key): str(value) for key, value in dict(job["payload"].get("footprint_resolutions") or {}).items()
    }
    progress(progress=5, message="Resolving KiCad library snapshot", checkpoint={"snapshot_id": snapshot_id})
    run_folder_import_session(
        session_id,
        snapshot_id,
        dict(job["payload"].get("server_source") or {}) or None,
        set(str(value) for value in approved_values) if approved_values else None,
        footprint_resolutions,
    )
    session = catalog_service.get_project_import_session(session_id)
    progress(progress=100, message="Folder import proposals staged")
    return {"session_id": session_id, "proposal_count": int((session or {}).get("proposal_count") or 0)}


def run_artifact_maintenance(job: dict[str, Any], progress: Progress) -> dict[str, Any]:
    progress(progress=10, message="Applying local artifact retention")
    result = artifact_store.run_retention()
    progress(progress=45, message="Reconciling fenced job artifacts", result=result)
    reconciliation = job_artifacts.reconcile_registered_artifacts()
    metadata_rows_pruned = context_jobs.prune_artifact_metadata(
        retention_seconds=max(
            0,
            int(os.environ.get("PRISM_JOB_ARTIFACT_RETENTION_DAYS", "30")),
        )
        * 24
        * 60
        * 60,
        partial_retention_seconds=max(
            0,
            int(os.environ.get("PRISM_JOB_PARTIAL_RETENTION_HOURS", "24")),
        )
        * 60
        * 60,
    )
    progress(
        progress=60,
        message="Collecting unreferenced job artifacts",
        result={**result, **reconciliation},
    )
    garbage_collection = job_artifacts.collect_unreferenced_objects()
    staging_cleanup = job_artifacts.cleanup_stale_staging()
    git_cache_rows_purged = git_read_cache.prune()
    progress(progress=80, message="Purging superseded STEP payloads")
    step_result = catalog_service.purge_superseded_step_files()
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
        "superseded_steps_purged": step_result["purged"],
        "staging_sessions_removed": staging["removed"],
    }


def run_metadata_batch(job: dict[str, Any], progress: Progress) -> dict[str, Any]:
    batch_id = str(job["payload"]["batch_id"])
    actor = str(job["payload"].get("actor") or job.get("created_by") or "metadata-worker")

    def callback(counts: dict[str, Any]) -> None:
        total = int(counts.get("total") or 0)
        completed = int(counts.get("completed") or 0)
        progress(
            progress=100 if total == 0 else (completed / total) * 100,
            message=f"Applying metadata revisions {completed}/{total}",
            checkpoint={"batch_id": batch_id, "completed": completed},
            result={"batch_id": batch_id, **counts},
        )

    result = catalog_service.apply_metadata_batch(
        batch_id,
        actor=actor,
        item_ids=[str(value) for value in job["payload"].get("item_ids") or []],
        progress_callback=callback,
    )
    progress(progress=100, message="Metadata batch applied", result=result)
    return result


HANDLERS: dict[str, Callable[[dict[str, Any], Progress], dict[str, Any]]] = {
    "catalog_validation": run_validation,
    "catalog_preview_generation": run_previews,
    "project_component_import": run_project_import,
    "folder_library_import": run_folder_import,
    "artifact_maintenance": run_artifact_maintenance,
    "catalog_metadata_batch": run_metadata_batch,
}

KICAD_HEAVY_JOB_TYPES = {
    "catalog_validation",
    "catalog_preview_generation",
    "folder_library_import",
    "project_component_import",
}


def run_catalog_job_v3(context: JobContext) -> JobResult:
    envelope = context.payload
    job_type = str(context.job["kind"])
    handler = HANDLERS.get(job_type)
    if handler is None:
        raise RuntimeError(f"Unsupported catalog job type: {job_type}")

    catalog_service.initialize()
    artifact_store.initialize()
    checkpoint = dict(envelope.get("catalog_checkpoint") or {})
    accumulated_result = dict(envelope.get("catalog_result") or {})
    legacy_job = {
        "id": context.job_id,
        "job_type": job_type,
        "payload": dict(envelope.get("catalog_payload") or {}),
        "checkpoint": checkpoint,
        "result": accumulated_result,
        "created_by": str(envelope.get("created_by") or ""),
    }

    def progress(**values: Any) -> bool:
        nonlocal checkpoint, accumulated_result
        context.check_cancelled()
        next_checkpoint = values.get("checkpoint")
        if next_checkpoint is not None:
            checkpoint = dict(next_checkpoint)
            legacy_job["checkpoint"] = checkpoint
        next_result = values.get("result")
        if next_result is not None:
            accumulated_result.update(dict(next_result))
            legacy_job["result"] = accumulated_result
        context.progress(
            stage="catalog",
            message=str(values.get("message") or "Processing catalog job"),
            percent=(
                float(values["progress"])
                if values.get("progress") is not None
                else None
            ),
            payload_updates={
                "catalog_checkpoint": dict(checkpoint),
                "catalog_result": dict(accumulated_result),
            },
        )
        return True

    try:
        result = handler(legacy_job, progress)
    except (JobCancelled, LostJobLease, RetryableJobError):
        raise
    except Exception as error:
        raise RetryableJobError(
            str(error),
            code="catalog_job_failed",
            retry_after_seconds=5,
        ) from error
    accumulated_result.update(dict(result or {}))
    context.check_cancelled()
    artifact_key = str(envelope.get("catalog_artifact_key") or "")
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
