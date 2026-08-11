from __future__ import annotations

import argparse
import logging
import os
import signal
import socket
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import IO

from app.core.config import settings
from app.services.job_runtime import job_state_root
from app.services.job_service import jobs


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("prism-worker")


@dataclass
class RunningJob:
    job_id: str
    fence: int
    attempt: int
    process: subprocess.Popen[bytes]
    log_handle: IO[bytes]
    last_heartbeat: float
    termination_started: float | None = None
    termination_reason: str = ""
    finalized_observed: float | None = None
    log_closed: bool = False


@dataclass
class PendingRelease:
    """Claim that must be released after a launch-time database outage."""

    job_id: str
    fence: int
    cancel: bool
    error_code: str = "launch_not_started"
    error_message: str = "Worker could not start the job after a database outage"
    attempts: int = 0


class PrismWorker:
    def __init__(self, worker_pool: str = "prism") -> None:
        if worker_pool not in {"prism", "catalog"}:
            raise ValueError(f"Unsupported worker pool: {worker_pool}")
        self.worker_pool = worker_pool
        self.concurrency = (
            settings.CATALOG_WORKER_CONCURRENCY
            if worker_pool == "catalog"
            else settings.PRISM_WORKER_CONCURRENCY
        )
        self.poll_seconds = (
            settings.CATALOG_WORKER_POLL_SECONDS
            if worker_pool == "catalog"
            else settings.PRISM_WORKER_POLL_SECONDS
        )
        self.lease_seconds = (
            settings.CATALOG_JOB_LEASE_SECONDS
            if worker_pool == "catalog"
            else settings.PRISM_JOB_LEASE_SECONDS
        )
        self.heartbeat_seconds = min(
            settings.PRISM_JOB_HEARTBEAT_SECONDS,
            max(1.0, self.lease_seconds / 3),
        )
        self.worker_id = (
            f"{worker_pool}:{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
        )
        self.running: dict[str, RunningJob] = {}
        self.pending_releases: dict[str, PendingRelease] = {}
        self.stopping = False
        self._last_database_error_log = 0.0
        self._catalog_maintenance_date = ""

    @staticmethod
    def resource_capacities() -> dict[str, int]:
        return {
            "prism_worker": settings.PRISM_WORKER_CONCURRENCY,
            "webgpu": settings.PRISM_WEBGPU_CONCURRENCY,
            "design_compare": settings.PRISM_DESIGN_COMPARE_CONCURRENCY,
            "workflow": settings.PRISM_WORKFLOW_CONCURRENCY,
            "import": settings.PRISM_IMPORT_CONCURRENCY,
            "semantic_compile": settings.PRISM_SEMANTIC_COMPILE_SLOTS,
            "catalog_worker": settings.CATALOG_WORKER_CONCURRENCY,
            "catalog_kicad": settings.CATALOG_KICAD_CONCURRENCY,
        }

    def request_stop(self, *_args: object) -> None:
        self.stopping = True

    def _log_database_error(self, operation: str) -> None:
        now = time.monotonic()
        if now - self._last_database_error_log >= 10:
            logger.exception("Database operation failed while trying to %s", operation)
            self._last_database_error_log = now

    def _get_job(self, job_id: str) -> tuple[dict[str, object] | None, bool]:
        try:
            return jobs.get(job_id), True
        except Exception:
            self._log_database_error(f"read job {job_id}")
            return None, False

    @staticmethod
    def _close_log(running: RunningJob) -> None:
        if running.log_closed:
            return
        running.log_handle.close()
        running.log_closed = True

    def _queue_pending_release(
        self,
        job_id: str,
        fence: int,
        *,
        cancel: bool,
        error_code: str = "launch_not_started",
        error_message: str = "Worker could not start the job after a database outage",
    ) -> None:
        self.pending_releases[job_id] = PendingRelease(
            job_id=job_id,
            fence=fence,
            cancel=cancel,
            error_code=error_code,
            error_message=error_message,
        )

    def _release_unstarted_claim(
        self,
        job_id: str,
        fence: int,
        *,
        cancel: bool | None = None,
        error_code: str = "launch_not_started",
        error_message: str = "Worker could not record the child log path",
    ) -> bool:
        current, database_available = self._get_job(job_id)
        if not database_available:
            self._queue_pending_release(
                job_id,
                fence,
                cancel=bool(cancel),
                error_code=error_code,
                error_message=error_message,
            )
            return False
        if current is None or int(current.get("fence") or -1) != fence:
            self.pending_releases.pop(job_id, None)
            return True
        if current.get("lease_owner") != self.worker_id:
            self.pending_releases.pop(job_id, None)
            return True
        status = str(current.get("status") or "")
        treat_as_cancel = status == "cancel_requested" if cancel is None else cancel
        try:
            if treat_as_cancel or status == "cancel_requested":
                jobs.finalize_cancel(
                    job_id,
                    self.worker_id,
                    fence,
                    message="Cancelled before the job process started",
                )
            elif status == "running":
                jobs.fail(
                    job_id,
                    self.worker_id,
                    fence,
                    error_code=error_code,
                    error_message=error_message,
                    transient=True,
                    retry_after_seconds=0,
                )
            else:
                self.pending_releases.pop(job_id, None)
                return True
        except Exception:
            self._log_database_error(f"release unstarted job {job_id}")
            self._queue_pending_release(
                job_id,
                fence,
                cancel=treat_as_cancel or status == "cancel_requested",
                error_code=error_code,
                error_message=error_message,
            )
            return False
        self.pending_releases.pop(job_id, None)
        return True

    def flush_pending_releases(self) -> None:
        for job_id, pending in tuple(self.pending_releases.items()):
            pending.attempts += 1
            released = self._release_unstarted_claim(
                pending.job_id,
                pending.fence,
                cancel=pending.cancel,
                error_code=pending.error_code,
                error_message=pending.error_message,
            )
            if released:
                logger.info(
                    "Released abandoned claim job=%s fence=%s after database recovery",
                    pending.job_id,
                    pending.fence,
                )
            elif pending.attempts >= 20:
                logger.error(
                    "Abandoned claim still held after retries; lease recovery will "
                    "handle job=%s fence=%s",
                    pending.job_id,
                    pending.fence,
                )
                self.pending_releases.pop(job_id, None)

    def launch(self, job: dict[str, object]) -> None:
        job_id = str(job["job_id"])
        fence = int(job["fence"])
        attempt = int(job.get("attempt") or 1)
        log_dir = job_state_root() / "jobs" / job_id
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"attempt-{attempt}-fence-{fence}.log"
        log_handle = log_path.open("ab", buffering=0)
        log_path_recorded = False
        for retry in range(3):
            try:
                log_path_recorded = jobs.set_log_path(
                    job_id,
                    self.worker_id,
                    fence,
                    str(log_path),
                )
            except Exception:
                self._log_database_error(f"record the log path for job {job_id}")
            if log_path_recorded:
                break
            if retry < 2:
                time.sleep(0.05 * (retry + 1))
        if not log_path_recorded:
            log_handle.close()
            self._release_unstarted_claim(
                job_id,
                fence,
                error_code="launch_not_started",
                error_message="Worker could not record the child log path",
            )
            logger.warning("Lease disappeared before job %s could start", job_id)
            return
        command = [
            sys.executable,
            "-m",
            "app.job_runner",
            "--job-id",
            job_id,
            "--fence",
            str(fence),
            "--worker-id",
            self.worker_id,
        ]
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                cwd=str(Path(__file__).resolve().parents[1]),
                start_new_session=True,
            )
        except Exception as error:
            log_handle.close()
            try:
                jobs.fail(
                    job_id,
                    self.worker_id,
                    fence,
                    error_code="child_start_failed",
                    error_message=str(error),
                    transient=True,
                    retry_after_seconds=5,
                )
            except Exception:
                self._log_database_error(f"schedule retry for job {job_id}")
            logger.exception("Could not start job %s", job_id)
            return
        now = time.monotonic()
        self.running[job_id] = RunningJob(
            job_id=job_id,
            fence=fence,
            attempt=attempt,
            process=process,
            log_handle=log_handle,
            last_heartbeat=now,
        )
        logger.info(
            "Started job=%s fence=%s attempt=%s pid=%s",
            job_id,
            fence,
            attempt,
            process.pid,
        )

    @staticmethod
    def _signal_group(process: subprocess.Popen[bytes], sig: signal.Signals) -> None:
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            return

    def begin_termination(self, running: RunningJob, reason: str) -> None:
        if running.termination_started is not None:
            return
        running.termination_started = time.monotonic()
        running.termination_reason = reason
        self._signal_group(running.process, signal.SIGTERM)
        logger.warning(
            "Terminating job=%s fence=%s reason=%s",
            running.job_id,
            running.fence,
            reason,
        )

    def supervise(self) -> None:
        self.flush_pending_releases()
        now = time.monotonic()
        finished: list[str] = []
        for job_id, running in tuple(self.running.items()):
            return_code = running.process.poll()
            if return_code is not None:
                self._close_log(running)
                current, database_available = self._get_job(job_id)
                if not database_available:
                    self._queue_pending_release(
                        job_id,
                        running.fence,
                        cancel=False,
                        error_code="runner_exited",
                        error_message=(
                            f"Job runner exited with code {return_code} during "
                            "database outage"
                        ),
                    )
                    finished.append(job_id)
                    continue
                authoritative = (
                    current is not None
                    and int(current.get("fence") or -1) == running.fence
                    and current.get("lease_owner") == self.worker_id
                )
                if authoritative and current.get("status") in {"running", "cancel_requested"}:
                    try:
                        if current.get("status") == "cancel_requested":
                            jobs.finalize_cancel(
                                job_id,
                                self.worker_id,
                                running.fence,
                                message="Cancelled",
                            )
                        elif self.stopping:
                            jobs.fail(
                                job_id,
                                self.worker_id,
                                running.fence,
                                error_code="worker_shutdown",
                                error_message="Worker restarted while the job was running",
                                transient=True,
                                retry_after_seconds=0,
                            )
                        else:
                            jobs.fail(
                                job_id,
                                self.worker_id,
                                running.fence,
                                error_code="runner_exited",
                                error_message=f"Job runner exited with code {return_code}",
                            )
                    except Exception:
                        self._log_database_error(f"finalize exited job {job_id}")
                        self._queue_pending_release(
                            job_id,
                            running.fence,
                            cancel=current.get("status") == "cancel_requested",
                            error_code="runner_exited",
                            error_message=(
                                f"Job runner exited with code {return_code}"
                            ),
                        )
                        finished.append(job_id)
                        continue
                logger.info(
                    "Job=%s fence=%s exited code=%s",
                    job_id,
                    running.fence,
                    return_code,
                )
                finished.append(job_id)
                continue

            current, database_available = self._get_job(job_id)
            if (
                database_available
                and current is not None
                and int(current.get("fence") or -1) == running.fence
                and current.get("status") == "cancel_requested"
            ):
                self.begin_termination(running, "cancel_requested")
            elif database_available:
                same_fence = (
                    current is not None
                    and int(current.get("fence") or -1) == running.fence
                )
                finalized = (
                    same_fence
                    and current.get("status")
                    in {"completed", "failed", "cancelled", "retry_wait"}
                )
                if finalized:
                    if running.finalized_observed is None:
                        running.finalized_observed = now
                        logger.debug(
                            "Job=%s fence=%s finalized status=%s; waiting for child exit",
                            running.job_id,
                            running.fence,
                            current.get("status"),
                        )
                    elif (
                        now - running.finalized_observed
                        >= settings.PRISM_JOB_CANCEL_GRACE_SECONDS
                    ):
                        self.begin_termination(running, "finalized_child_stuck")
                    continue
                if (
                    current is None
                    or not same_fence
                    or current.get("lease_owner") != self.worker_id
                    or current.get("status")
                    not in {"running", "cancel_requested"}
                ):
                    self.begin_termination(running, "lease_lost")

            if (
                running.termination_started is not None
                and now - running.termination_started
                >= settings.PRISM_JOB_CANCEL_GRACE_SECONDS
            ):
                self._signal_group(running.process, signal.SIGKILL)
                continue

            if now - running.last_heartbeat < self.heartbeat_seconds:
                continue
            try:
                renewed = jobs.heartbeat(
                    job_id,
                    self.worker_id,
                    running.fence,
                    lease_seconds=self.lease_seconds,
                )
            except Exception:
                logger.exception("Heartbeat failed for job=%s", job_id)
                renewed = False
            if renewed:
                running.last_heartbeat = now
            elif (
                now - running.last_heartbeat
                >= self.lease_seconds - 2
            ):
                self.begin_termination(running, "lease_lost")

        for job_id in finished:
            self.running.pop(job_id, None)

    def schedule_catalog_maintenance(self) -> None:
        if self.worker_pool != "catalog" or not settings.CATALOG_RETENTION_ENABLED:
            return
        today = datetime.now(timezone.utc).date().isoformat()
        if self._catalog_maintenance_date == today:
            return
        from app.services.catalog_job_service import catalog_jobs

        catalog_jobs.enqueue(
            "artifact_maintenance",
            {},
            created_by="system:catalog-worker",
            idempotency_key=f"artifact-maintenance:{today}",
            max_attempts=3,
        )
        self._catalog_maintenance_date = today

    def run(self) -> None:
        while not self.stopping:
            try:
                jobs.initialize()
                jobs.configure_resource_slots(self.resource_capacities())
                break
            except Exception:
                self._log_database_error("initialize the worker")
                time.sleep(min(1.0, self.poll_seconds))
        if self.stopping:
            return
        logger.info(
            "Worker %s started pool=%s concurrency=%s",
            self.worker_id,
            self.worker_pool,
            self.concurrency,
        )
        while not self.stopping:
            try:
                self.schedule_catalog_maintenance()
            except Exception:
                self._log_database_error("schedule catalog maintenance")
            self.supervise()
            available_slots = self.concurrency - len(self.running) - len(self.pending_releases)
            while available_slots > 0:
                try:
                    claimed = jobs.claim(
                        self.worker_id,
                        worker_pool=self.worker_pool,
                        lease_seconds=self.lease_seconds,
                    )
                except Exception:
                    self._log_database_error("claim the next job")
                    break
                if not claimed:
                    break
                self.launch(claimed)
                available_slots = self.concurrency - len(self.running) - len(self.pending_releases)
            time.sleep(self.poll_seconds)

        for running in self.running.values():
            self.begin_termination(running, "worker_shutdown")
        shutdown_deadline = time.monotonic() + settings.PRISM_JOB_CANCEL_GRACE_SECONDS + 2
        while self.running and time.monotonic() < shutdown_deadline:
            self.supervise()
            time.sleep(0.1)
        kill_deadline = time.monotonic() + 5
        while self.running and time.monotonic() < kill_deadline:
            for running in self.running.values():
                self._signal_group(running.process, signal.SIGKILL)
            self.supervise()
            if self.running:
                time.sleep(0.05)
        self.flush_pending_releases()
        for running in self.running.values():
            self._close_log(running)
            logger.error(
                "Worker stopped before job finalization; lease recovery will handle "
                "job=%s fence=%s",
                running.job_id,
                running.fence,
            )
        self.running.clear()
        if self.pending_releases:
            logger.error(
                "Worker stopped with %s abandoned claims pending lease recovery",
                len(self.pending_releases),
            )
        logger.info("Worker %s stopped", self.worker_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a supervised Prism worker pool")
    parser.add_argument("--pool", choices=("prism", "catalog"), default="prism")
    args = parser.parse_args()
    # Workers do the cloning, so a worker image without ssh breaks imports even
    # when the API image has it.
    from app.services.git_access_service import warn_if_openssh_missing

    warn_if_openssh_missing(f"The {args.pool} worker")
    worker = PrismWorker(args.pool)
    signal.signal(signal.SIGTERM, worker.request_stop)
    signal.signal(signal.SIGINT, worker.request_stop)
    worker.run()


if __name__ == "__main__":
    main()
