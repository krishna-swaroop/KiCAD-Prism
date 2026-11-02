"""The registry of job kinds, and what happens when a job ends.

Every kind is declared once, next to its handler, as a ``JobKind``
(``job_kinds.py``) in its module's ``JOB_KINDS``. ``load_builtin_job_handlers``
imports those modules and registers the declarations; the runner looks the
handler up here, and the runner, the supervisor and the worker's sweep call
``settle_job_end`` so a kind can settle its own rows from the job's end state.
"""

from __future__ import annotations

import importlib
import logging
from typing import Any

from app.services.job_kinds import JobKind
from app.services.job_runtime import JobHandler

logger = logging.getLogger(__name__)

# Modules that declare ``JOB_KINDS``.
KIND_MODULES = (
    "app.services.design_compare_service",
    "app.services.design_bundle.jobs",
    "app.services.design_render.service",
    "app.services.release_studio_build_service",
    "app.services.release_studio_config_service",
    "app.services.project_import_service",
    "app.services.project_service",
    "app.services.catalog_worker_tasks",
    "app.services.trackers.jobs",
    "app.services.supply.jobs",
    "app.services.supply.release_snapshot",
    "app.sim_studio.runs",
)

_KINDS: dict[str, JobKind] = {}


def register_job_kind(kind: JobKind) -> None:
    existing = _KINDS.get(kind.name)
    if existing is not None and existing is not kind:
        raise RuntimeError(f"Job kind already registered: {kind.name}")
    _KINDS[kind.name] = kind


def load_builtin_job_handlers() -> None:
    for module_name in KIND_MODULES:
        for kind in importlib.import_module(module_name).JOB_KINDS:
            register_job_kind(kind)


def get_job_kind(name: str) -> JobKind | None:
    return _KINDS.get(name)


def get_job_handler(name: str) -> JobHandler | None:
    kind = _KINDS.get(name)
    return kind.handler if kind else None


def registered_job_kinds() -> tuple[str, ...]:
    return tuple(sorted(_KINDS))


def settle_job_end(job_id: str, service: Any) -> None:
    """Run the kind's end hook for ``job_id``; failures are logged, never raised."""

    try:
        load_builtin_job_handlers()
        job = service.get(job_id)
        kind = _KINDS.get(str((job or {}).get("kind") or ""))
        if job is not None and kind is not None and kind.settle is not None:
            kind.settle(job)
    except Exception:
        logger.exception("Could not settle the end of job %s", job_id)


def sweep_job_ends(service: Any) -> None:
    """Settle rows whose job ended without its process settling them."""

    load_builtin_job_handlers()
    for name, kind in sorted(_KINDS.items()):
        if kind.orphans is None:
            continue
        try:
            job_ids = list(kind.orphans())
        except Exception:
            logger.exception("Could not list unsettled %s jobs", name)
            continue
        for job_id in job_ids:
            settle_job_end(job_id, service)
