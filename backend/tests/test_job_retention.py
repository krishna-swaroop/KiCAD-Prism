from __future__ import annotations

import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from app.core.config import settings
from app.services import job_retention
from app.services.job_service import JobService
from app.services.postgres_database import database


@unittest.skipUnless(
    os.environ.get("PRISM_DATABASE_URL"),
    "PRISM_DATABASE_URL is required for PostgreSQL job integration tests",
)
class JobRetentionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = JobService()
        self.service.initialize()
        suffix = uuid.uuid4().hex
        self.routine = f"test-routine-{suffix}"
        self.other = f"test-other-{suffix}"
        self.job_ids: list[str] = []
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.root, ignore_errors=True))

    def tearDown(self) -> None:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("DELETE FROM ws_jobs WHERE id = ANY(%s)", (self.job_ids,))
            conn.commit()

    def job(self, kind: str, key: str, *, status: str = "completed", age_days: float = 0) -> str:
        job_id = str(self.service.enqueue(kind, {"test": True}, worker_pool="test", artifact_key=key)["job_id"])
        self.job_ids.append(job_id)
        log = self.root / "jobs" / job_id / "attempt-1-fence-1.log"
        log.parent.mkdir(parents=True)
        log.write_text("x")
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                UPDATE ws_jobs
                SET status = %s, log_path = %s,
                    created_at = NOW() - (%s * INTERVAL '1 day'),
                    completed_at = NOW() - (%s * INTERVAL '1 day')
                WHERE id = %s
                """,
                (status, str(log), age_days, age_days, job_id),
            )
            conn.commit()
        return job_id

    def remaining(self) -> set[str]:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            rows = conn.execute("SELECT id FROM ws_jobs WHERE id = ANY(%s)", (self.job_ids,)).fetchall()
        return {str(row["id"]) for row in rows}

    def prune(self) -> dict[str, int]:
        with (
            mock.patch.object(job_retention, "ROUTINE_KINDS", (self.routine,)),
            mock.patch.object(job_retention, "job_state_root", return_value=self.root),
            mock.patch.object(settings, "PRISM_ROUTINE_JOB_RETENTION_DAYS", 7),
            mock.patch.object(settings, "PRISM_JOB_RETENTION_DAYS", 90),
        ):
            return job_retention.prune_jobs(self.service)

    def test_old_finished_jobs_go_with_their_logs_and_the_newest_per_key_stays(self) -> None:
        old_poll = self.job(self.routine, "dest-a", age_days=10)
        newest_poll = self.job(self.routine, "dest-a", age_days=9)
        recent_poll = self.job(self.routine, "dest-b", age_days=1)
        running_poll = self.job(self.routine, "dest-c", status="running", age_days=30)
        old_build = self.job(self.other, "build", age_days=40)
        newer_build = self.job(self.other, "build", age_days=20)
        ancient_build = self.job(self.other, "", age_days=100)

        self.prune()

        self.assertEqual(self.remaining(), {newest_poll, recent_poll, running_poll, old_build, newer_build})
        self.assertFalse((self.root / "jobs" / old_poll).exists())
        self.assertFalse((self.root / "jobs" / ancient_build).exists())
        self.assertTrue((self.root / "jobs" / newest_poll).exists())

    def test_log_folders_without_a_job_row_are_swept(self) -> None:
        orphan = self.root / "jobs" / "job-gone"
        orphan.mkdir(parents=True)
        os.utime(orphan, (0, 0))
        fresh = self.root / "jobs" / "job-just-started"
        fresh.mkdir()
        self.prune()
        self.assertFalse(orphan.exists())
        self.assertTrue(fresh.exists())


if __name__ == "__main__":
    unittest.main()
