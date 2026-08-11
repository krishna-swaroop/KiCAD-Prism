from __future__ import annotations

import argparse
import logging
import sys

from app.services.job_handlers import get_job_handler, load_builtin_job_handlers
from app.services.job_runtime import (
    JobCancelled,
    JobContext,
    LostJobLease,
    RetryableJobError,
)
from app.services.job_service import jobs


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("prism-job-runner")


def execute(job_id: str, fence: int, worker_id: str) -> int:
    load_builtin_job_handlers()
    job = jobs.get(job_id)
    if (
        job is None
        or job.get("status") != "running"
        or int(job.get("fence") or -1) != fence
        or job.get("lease_owner") != worker_id
    ):
        logger.error("Refusing to execute a job without its current fenced lease")
        return 3
    handler = get_job_handler(str(job["kind"]))
    if handler is None:
        jobs.fail(
            job_id,
            worker_id,
            fence,
            error_code="unsupported_job_kind",
            error_message=f"No handler registered for {job['kind']}",
        )
        return 4

    context = JobContext(job, worker_id=worker_id)
    try:
        context.check_cancelled()
        result = handler(context)
        context.flush_progress()
        if result.artifact is not None:
            completed = jobs.complete_artifact(
                job_id,
                worker_id,
                fence,
                result.artifact.__dict__,
                extra_artifacts=[
                    artifact.__dict__ for artifact in result.sidecar_artifacts
                ],
                message=result.message,
                details=result.details,
            )
        else:
            completed = jobs.complete(
                job_id,
                worker_id,
                fence,
                result_path=result.result_path,
                result_digest=result.result_digest,
                message=result.message,
                details=result.details,
            )
        if not completed:
            raise LostJobLease("Fenced completion was rejected")
        context.cleanup_staging()
        return 0
    except JobCancelled as error:
        context.cleanup_staging()
        jobs.finalize_cancel(job_id, worker_id, fence, message=str(error))
        return 2
    except RetryableJobError as error:
        context.cleanup_staging()
        jobs.fail(
            job_id,
            worker_id,
            fence,
            error_code=error.code,
            error_message=str(error),
            transient=True,
            retry_after_seconds=error.retry_after_seconds,
        )
        return 5
    except LostJobLease:
        context.cleanup_staging()
        logger.exception("Job lease was lost")
        return 6
    except MemoryError as error:
        context.cleanup_staging()
        jobs.fail(
            job_id,
            worker_id,
            fence,
            error_code="out_of_memory",
            error_message=str(error) or "Worker ran out of memory",
        )
        logger.exception("Job ran out of memory")
        return 7
    except Exception as error:
        context.cleanup_staging()
        jobs.fail(
            job_id,
            worker_id,
            fence,
            error_code="handler_failed",
            error_message=str(error),
        )
        logger.exception("Job handler failed")
        return 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Execute one fenced Prism job")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--fence", required=True, type=int)
    parser.add_argument("--worker-id", required=True)
    args = parser.parse_args()
    raise SystemExit(execute(args.job_id, args.fence, args.worker_id))


if __name__ == "__main__":
    main()
