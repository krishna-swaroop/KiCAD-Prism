"""A job kind, declared once next to its handler.

Each kind states its execution policy in one place: the worker pool, the
resource slots it holds, the shape of its lock, how many attempts it gets,
its priority, and optionally how it settles its own feature rows when a job
ends. Callers ask for a job by kind and subject::

    DESIGN_COMPARE.enqueue(payload, subject=JobSubject.of_project(row), artifact_key=key)

and never restate pools, slot names or lock keys. ``job_handlers`` collects
the declarations; ``tests/test_job_kinds.py`` checks every declared kind
against the pools and slots the workers actually have.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Iterable, Mapping

from app.core.config import settings

if TYPE_CHECKING:  # importable from any service module without a cycle
    from app.services.job_runtime import JobHandler

POOLS = frozenset({"prism", "catalog"})

TRACKER_RESOURCE = "tracker_sync"

# Resource slot -> capacity. The worker configures exactly these slots, so a
# kind can only ask for a slot named here.
_CAPACITIES: Mapping[str, Callable[[], int]] = {
    "prism_worker": lambda: settings.PRISM_WORKER_CONCURRENCY,
    "webgpu": lambda: settings.PRISM_WEBGPU_CONCURRENCY,
    "design_compare": lambda: settings.PRISM_DESIGN_COMPARE_CONCURRENCY,
    "workflow": lambda: settings.PRISM_WORKFLOW_CONCURRENCY,
    "import": lambda: settings.PRISM_IMPORT_CONCURRENCY,
    "semantic_compile": lambda: settings.PRISM_SEMANTIC_COMPILE_SLOTS,
    "catalog_worker": lambda: settings.CATALOG_WORKER_CONCURRENCY,
    "catalog_kicad": lambda: settings.CATALOG_KICAD_CONCURRENCY,
    "sim": lambda: settings.PRISM_SIM_CONCURRENCY,
    TRACKER_RESOURCE: lambda: min(2, max(1, settings.PRISM_WORKER_CONCURRENCY - 1)),
}
RESOURCES = frozenset(_CAPACITIES)


def resource_capacities() -> dict[str, int]:
    return {name: capacity() for name, capacity in _CAPACITIES.items()}


@dataclass(frozen=True)
class JobSubject:
    """What a job works on, as far as queueing cares.

    ``lock_key`` names the lock of kinds whose subject is not a project (a
    remote URL being imported, a System's Git clone).
    """

    project_id: str | None = None
    repository_id: str | None = None
    lock_key: str = ""

    @classmethod
    def of_project(cls, row: Mapping[str, Any] | None, project_id: str | None = None) -> "JobSubject":
        """The subject for a workspace project row (``repo_id`` is its repository)."""

        row = row or {}
        return cls(
            project_id=project_id or (str(row.get("id")) if row.get("id") else None),
            repository_id=str(row.get("repo_id") or "") or None,
        )


NO_SUBJECT = JobSubject()

LockShape = Callable[[JobSubject], list[dict[str, str]]]


def repository_lock(mode: str, *, project_fallback: bool = True) -> LockShape:
    """Lock the project's repository; without one, the project (or nothing)."""

    def locks(subject: JobSubject) -> list[dict[str, str]]:
        if subject.repository_id:
            return [{"key": f"repository:{subject.repository_id}", "mode": mode}]
        if project_fallback:
            return [{"key": f"project:{subject.project_id}", "mode": mode}]
        return []

    return locks


def subject_lock(mode: str) -> LockShape:
    """Lock ``subject.lock_key``."""

    def locks(subject: JobSubject) -> list[dict[str, str]]:
        if not subject.lock_key:
            raise ValueError("This job kind needs a subject lock key")
        return [{"key": subject.lock_key, "mode": mode}]

    return locks


@dataclass(frozen=True)
class JobKind:
    name: str
    handler: JobHandler
    pool: str = "prism"
    resources: Mapping[str, int] = field(default_factory=lambda: {"prism_worker": 1})
    lock: LockShape | None = None
    max_attempts: int = 3
    priority: int = 100
    # End-of-job hook: settle(job row) ends the kind's own feature rows from
    # the job's final state. Idempotent; leaves a still-executing attempt
    # alone. ``orphans()`` lists jobs whose rows were left behind.
    settle: Callable[[Mapping[str, Any]], Any] | None = None
    orphans: Callable[[], Iterable[str]] | None = None

    def __post_init__(self) -> None:
        if self.pool not in POOLS:
            raise ValueError(f"{self.name}: unknown worker pool {self.pool!r}")
        unknown = set(self.resources) - RESOURCES
        if unknown:
            raise ValueError(f"{self.name}: unknown resource slots {sorted(unknown)}")
        if self.max_attempts < 1 or any(count < 1 for count in self.resources.values()):
            raise ValueError(f"{self.name}: attempts and slot counts must be positive")
        if (self.settle is None) != (self.orphans is None):
            raise ValueError(f"{self.name}: settle and orphans come together")

    def enqueue(
        self,
        payload: Mapping[str, Any],
        *,
        subject: JobSubject = NO_SUBJECT,
        artifact_key: str = "",
        requested_by: str = "",
        priority: int | None = None,
        service: Any | None = None,
    ) -> dict[str, Any]:
        """Queue one job of this kind; returns the job row (``job_id`` et al.).

        An ``artifact_key`` deduplicates against an active job of the same
        kind and reuses a completed artifact (see ``JobService.enqueue``).
        """

        if service is None:
            from app.services.job_service import jobs as service
        return service.enqueue(
            self.name,
            dict(payload),
            worker_pool=self.pool,
            artifact_key=artifact_key,
            project_id=subject.project_id,
            repository_id=subject.repository_id or None,
            requested_by=requested_by,
            priority=self.priority if priority is None else priority,
            max_attempts=self.max_attempts,
            resources=dict(self.resources),
            locks=self.lock(subject) if self.lock else [],
        )
