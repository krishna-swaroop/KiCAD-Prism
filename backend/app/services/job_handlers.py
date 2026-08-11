from __future__ import annotations

from app.services.job_runtime import JobHandler


_HANDLERS: dict[str, JobHandler] = {}


def register_job_handler(kind: str, handler: JobHandler) -> None:
    normalized = kind.strip()
    if not normalized:
        raise ValueError("Job handler kind cannot be empty")
    if normalized in _HANDLERS and _HANDLERS[normalized] is not handler:
        raise RuntimeError(f"Job handler already registered: {normalized}")
    _HANDLERS[normalized] = handler


def get_job_handler(kind: str) -> JobHandler | None:
    return _HANDLERS.get(kind)


def registered_job_kinds() -> tuple[str, ...]:
    return tuple(sorted(_HANDLERS))


def load_builtin_job_handlers() -> None:
    from app.services.catalog_worker_tasks import (
        HANDLERS as catalog_handlers,
        run_catalog_job_v3,
    )
    from app.services.design_compare_service import run_design_compare_job_v3
    from app.services.project_import_service import (
        run_project_analyze_job_v3,
        run_project_import_job_v3,
        run_project_sync_job_v3,
        run_project_thumbnail_job_v3,
    )
    from app.services.project_service import (
        run_kicad_workflow_job_v3,
        run_semantic_index_job_v3,
        run_webgpu_3d_job_v3,
    )

    register_job_handler("design_compare", run_design_compare_job_v3)
    register_job_handler("webgpu_3d", run_webgpu_3d_job_v3)
    register_job_handler("kicad_workflow", run_kicad_workflow_job_v3)
    register_job_handler("semantic_index", run_semantic_index_job_v3)
    register_job_handler("project_analyze", run_project_analyze_job_v3)
    register_job_handler("project_import", run_project_import_job_v3)
    register_job_handler("project_sync", run_project_sync_job_v3)
    register_job_handler("project_thumbnail", run_project_thumbnail_job_v3)
    for job_type in catalog_handlers:
        register_job_handler(job_type, run_catalog_job_v3)
