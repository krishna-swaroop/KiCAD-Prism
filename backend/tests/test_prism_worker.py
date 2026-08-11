from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app import prism_worker


class PrismWorkerTests(unittest.TestCase):
    def test_catalog_pool_has_independent_concurrency_and_fenced_resources(self) -> None:
        worker = prism_worker.PrismWorker("catalog")
        self.assertEqual(
            worker.concurrency,
            prism_worker.settings.CATALOG_WORKER_CONCURRENCY,
        )
        self.assertEqual(
            worker.lease_seconds,
            prism_worker.settings.CATALOG_JOB_LEASE_SECONDS,
        )
        capacities = worker.resource_capacities()
        self.assertEqual(
            capacities["catalog_worker"],
            prism_worker.settings.CATALOG_WORKER_CONCURRENCY,
        )
        self.assertEqual(
            capacities["catalog_kicad"],
            prism_worker.settings.CATALOG_KICAD_CONCURRENCY,
        )

    def test_catalog_maintenance_is_idempotently_scheduled_once_per_day(self) -> None:
        from app.services.catalog_job_service import catalog_jobs

        worker = prism_worker.PrismWorker("catalog")
        with (
            mock.patch.object(
                prism_worker.settings,
                "CATALOG_RETENTION_ENABLED",
                True,
            ),
            mock.patch.object(catalog_jobs, "enqueue") as enqueue,
        ):
            worker.schedule_catalog_maintenance()
            worker.schedule_catalog_maintenance()

        enqueue.assert_called_once()
        self.assertTrue(
            enqueue.call_args.kwargs["idempotency_key"].startswith(
                "artifact-maintenance:"
            )
        )

    def test_cancel_between_claim_and_launch_is_finalized_without_child(self) -> None:
        worker = prism_worker.PrismWorker()
        job = {"job_id": "job-1", "fence": 7, "attempt": 1}
        current = {
            "job_id": "job-1",
            "status": "cancel_requested",
            "fence": 7,
            "lease_owner": worker.worker_id,
        }
        with tempfile.TemporaryDirectory() as temporary:
            with (
                mock.patch.object(
                    prism_worker,
                    "job_state_root",
                    return_value=Path(temporary),
                ),
                mock.patch.object(
                    prism_worker.jobs,
                    "set_log_path",
                    return_value=False,
                ),
                mock.patch.object(
                    prism_worker.jobs,
                    "get",
                    return_value=current,
                ),
                mock.patch.object(
                    prism_worker.jobs,
                    "finalize_cancel",
                    return_value=True,
                ) as finalize,
                mock.patch.object(prism_worker.subprocess, "Popen") as popen,
            ):
                worker.launch(job)

        finalize.assert_called_once_with(
            "job-1",
            worker.worker_id,
            7,
            message="Cancelled before the job process started",
        )
        popen.assert_not_called()
        self.assertEqual(worker.running, {})

    def test_database_outage_does_not_crash_supervisor_and_loses_lease_safely(
        self,
    ) -> None:
        worker = prism_worker.PrismWorker()
        process = mock.Mock(pid=12345)
        process.poll.return_value = None
        running = prism_worker.RunningJob(
            job_id="job-db-outage",
            fence=3,
            attempt=1,
            process=process,
            log_handle=mock.Mock(),
            last_heartbeat=0,
        )
        worker.running[running.job_id] = running

        with (
            mock.patch.object(prism_worker.time, "monotonic", return_value=100.0),
            mock.patch.object(
                prism_worker.jobs,
                "get",
                side_effect=RuntimeError("database unavailable"),
            ),
            mock.patch.object(
                prism_worker.jobs,
                "heartbeat",
                side_effect=RuntimeError("database unavailable"),
            ),
            mock.patch.object(worker, "begin_termination") as terminate,
        ):
            worker.supervise()

        terminate.assert_called_once_with(running, "lease_lost")
        self.assertIn(running.job_id, worker.running)

    def test_launch_aborts_without_child_when_log_fence_cannot_be_recorded(
        self,
    ) -> None:
        worker = prism_worker.PrismWorker()
        job = {"job_id": "job-db-outage", "fence": 3, "attempt": 1}
        with tempfile.TemporaryDirectory() as temporary:
            with (
                mock.patch.object(
                    prism_worker,
                    "job_state_root",
                    return_value=Path(temporary),
                ),
                mock.patch.object(
                    prism_worker.jobs,
                    "set_log_path",
                    side_effect=RuntimeError("database unavailable"),
                ),
                mock.patch.object(
                    prism_worker.jobs,
                    "get",
                    side_effect=RuntimeError("database unavailable"),
                ),
                mock.patch.object(prism_worker.subprocess, "Popen") as popen,
            ):
                worker.launch(job)

        popen.assert_not_called()
        self.assertEqual(worker.running, {})
        self.assertIn("job-db-outage", worker.pending_releases)

    def test_pending_release_is_flushed_after_database_recovers(self) -> None:
        worker = prism_worker.PrismWorker()
        worker._queue_pending_release(
            "job-recover",
            4,
            cancel=False,
            error_code="launch_not_started",
            error_message="outage",
        )
        current = {
            "job_id": "job-recover",
            "status": "running",
            "fence": 4,
            "lease_owner": worker.worker_id,
        }
        with (
            mock.patch.object(prism_worker.jobs, "get", return_value=current),
            mock.patch.object(
                prism_worker.jobs,
                "fail",
                return_value="retry_wait",
            ) as fail,
        ):
            worker.flush_pending_releases()

        fail.assert_called_once()
        self.assertEqual(worker.pending_releases, {})

    def test_exited_child_during_database_outage_queues_pending_release(self) -> None:
        worker = prism_worker.PrismWorker()
        process = mock.Mock(pid=12345)
        process.poll.return_value = 1
        running = prism_worker.RunningJob(
            job_id="job-db-outage",
            fence=3,
            attempt=1,
            process=process,
            log_handle=mock.Mock(),
            last_heartbeat=0,
        )
        worker.running[running.job_id] = running

        with mock.patch.object(
            prism_worker.jobs,
            "get",
            side_effect=RuntimeError("database unavailable"),
        ):
            worker.supervise()

        running.log_handle.close.assert_called_once()
        self.assertNotIn(running.job_id, worker.running)
        self.assertIn(running.job_id, worker.pending_releases)

    def test_finalized_job_waits_for_runner_exit_without_reporting_lease_loss(
        self,
    ) -> None:
        worker = prism_worker.PrismWorker()
        process = mock.Mock(pid=12345)
        process.poll.return_value = None
        running = prism_worker.RunningJob(
            job_id="job-handler-failed",
            fence=1,
            attempt=1,
            process=process,
            log_handle=mock.Mock(),
            last_heartbeat=100,
        )
        worker.running[running.job_id] = running
        current = {
            "job_id": running.job_id,
            "status": "failed",
            "fence": running.fence,
            "lease_owner": "",
        }

        with (
            mock.patch.object(prism_worker.time, "monotonic", return_value=101.0),
            mock.patch.object(prism_worker.jobs, "get", return_value=current),
            mock.patch.object(worker, "begin_termination") as terminate,
            mock.patch.object(prism_worker.jobs, "heartbeat") as heartbeat,
        ):
            worker.supervise()

        terminate.assert_not_called()
        heartbeat.assert_not_called()
        self.assertEqual(running.finalized_observed, 101.0)


if __name__ == "__main__":
    unittest.main()
