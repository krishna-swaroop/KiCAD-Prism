from __future__ import annotations

import shutil
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping

from app.core.config import settings
from app.services.job_service import JobService, jobs


class JobCancelled(RuntimeError):
    pass


class RetryableJobError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "transient_failure",
        retry_after_seconds: int = 5,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retry_after_seconds = retry_after_seconds


class LostJobLease(RuntimeError):
    pass


@dataclass(frozen=True)
class PreparedArtifact:
    kind: str
    artifact_key: str
    digest: str
    object_path: str
    size_bytes: int
    media_type: str = "application/octet-stream"
    schema_version: str = ""
    generator_version: str = ""
    readiness: str = "ready"


@dataclass(frozen=True)
class JobResult:
    result_path: str | None = None
    result_digest: str | None = None
    message: str = "Completed"
    details: Mapping[str, Any] = field(default_factory=dict)
    artifact: PreparedArtifact | None = None
    sidecar_artifacts: tuple[PreparedArtifact, ...] = ()


def job_state_root() -> Path:
    configured = settings.PRISM_JOB_ARTIFACT_ROOT.strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (
        Path(settings.KICAD_PROJECTS_ROOT)
        / ".kicad-prism"
    ).expanduser().resolve()


class JobContext:
    """Fenced execution context passed to one child-process handler."""

    def __init__(
        self,
        job: Mapping[str, Any],
        *,
        worker_id: str,
        service: JobService = jobs,
        progress_interval_seconds: float = 0.5,
    ) -> None:
        self.job = dict(job)
        self.job_id = str(job["job_id"])
        self.fence = int(job["fence"])
        self.worker_id = worker_id
        self.service = service
        self.progress_interval_seconds = max(0.1, progress_interval_seconds)
        self._last_progress_at = 0.0
        self._last_stage = str(job.get("stage") or "")
        self._last_percent = float(job.get("percent") or 0)
        self._pending: dict[str, Any] = {}
        self._progress_lock = threading.RLock()
        self.root = job_state_root()
        self.staging_dir = self.root / "staging" / self.job_id / str(self.fence)
        self.staging_dir.mkdir(parents=True, exist_ok=True)

    @property
    def payload(self) -> dict[str, Any]:
        return dict(self.job.get("payload") or {})

    def check_cancelled(self) -> None:
        current = self.service.get(self.job_id)
        if current is None or int(current.get("fence") or -1) != self.fence:
            raise LostJobLease("Job lease is no longer authoritative")
        if current.get("status") == "cancel_requested":
            raise JobCancelled("Cancellation requested")
        if current.get("status") != "running":
            raise LostJobLease(f"Job is no longer running: {current.get('status')}")

    def progress(
        self,
        *,
        stage: str | None = None,
        message: str | None = None,
        percent: float | None = None,
        payload_updates: Mapping[str, Any] | None = None,
        force: bool = False,
    ) -> None:
        with self._progress_lock:
            now = time.monotonic()
            if stage is not None:
                self._pending["stage"] = stage
            if message is not None:
                self._pending["message"] = message
            if percent is not None:
                self._pending["percent"] = percent
            if payload_updates:
                accumulated = dict(self._pending.get("payload_updates") or {})
                accumulated.update(payload_updates)
                self._pending["payload_updates"] = accumulated
            transition = (
                (stage is not None and stage != self._last_stage)
                or (percent is not None and float(percent) in {0.0, 100.0})
            )
            if (
                not force
                and not transition
                and now - self._last_progress_at < self.progress_interval_seconds
            ):
                return
            self.flush_progress()

    def flush_progress(self) -> None:
        with self._progress_lock:
            if not self._pending:
                return
            values = self._pending
            self._pending = {}
            if not self.service.progress(
                self.job_id,
                self.worker_id,
                self.fence,
                **values,
            ):
                raise LostJobLease("Fenced progress update was rejected")
            self._last_progress_at = time.monotonic()
            if "stage" in values:
                self._last_stage = str(values["stage"])
            if "percent" in values:
                self._last_percent = float(values["percent"])

    def cleanup_staging(self) -> None:
        if self.staging_dir.exists():
            shutil.rmtree(self.staging_dir, ignore_errors=True)


JobHandler = Callable[[JobContext], JobResult]
