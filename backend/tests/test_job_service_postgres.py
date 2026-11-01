from __future__ import annotations

import hashlib
import os
import tempfile
import uuid
import unittest
from pathlib import Path
from unittest import mock

from app.services import job_service
from app.services.job_service import JobService
from app.services.postgres_database import database


@unittest.skipUnless(
    os.environ.get("PRISM_DATABASE_URL"),
    "PRISM_DATABASE_URL is required for PostgreSQL job integration tests",
)
class JobServicePostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = JobService()
        self.service.initialize()
        self.suffix = uuid.uuid4().hex
        self.pool = f"test-{self.suffix}"
        self.kind = f"test-kind-{self.suffix}"
        self.resource = f"test-resource-{self.suffix}"
        self.job_ids: list[str] = []
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)

    def tearDown(self) -> None:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                "DELETE FROM ws_artifacts WHERE kind = %s OR source_job_id = ANY(%s)",
                (self.kind, self.job_ids),
            )
            conn.execute(
                "DELETE FROM ws_jobs WHERE id = ANY(%s)",
                (self.job_ids,),
            )
            conn.execute(
                "DELETE FROM ws_events WHERE topic = ANY(%s)",
                ([f"job:{job_id}" for job_id in self.job_ids],),
            )
            conn.execute(
                "DELETE FROM ws_job_resource_slots WHERE resource_name = %s",
                (self.resource,),
            )
            conn.commit()

    def _events(self, job_id: str):
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            return conn.execute(
                "SELECT * FROM ws_events WHERE topic = %s ORDER BY id",
                (f"job:{job_id}",),
            ).fetchall()

    def enqueue(self, artifact_key: str, **kwargs):
        job = self.service.enqueue(
            self.kind,
            {"test": True},
            worker_pool=self.pool,
            artifact_key=artifact_key,
            **kwargs,
        )
        job_id = str(job["job_id"])
        if job_id not in self.job_ids:
            self.job_ids.append(job_id)
        return job

    def write_artifact_file(self, name: str, payload: bytes) -> tuple[str, str, int]:
        path = Path(self._temp_dir.name) / name
        path.write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        return str(path), digest, len(payload)

    def expire(self, job_id: str) -> None:
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                UPDATE ws_jobs
                SET lease_expires_at = NOW() - INTERVAL '1 second'
                WHERE id = %s
                """,
                (job_id,),
            )
            conn.execute(
                """
                UPDATE ws_job_resource_slots
                SET lease_expires_at = NOW() - INTERVAL '1 second'
                WHERE job_id = %s
                """,
                (job_id,),
            )
            conn.execute(
                """
                UPDATE ws_job_locks
                SET lease_expires_at = NOW() - INTERVAL '1 second'
                WHERE job_id = %s
                """,
                (job_id,),
            )
            conn.commit()

    def test_old_finished_jobs_of_a_kind_are_pruned_and_the_rest_stay(self) -> None:
        old = self.enqueue("prune-old")["job_id"]
        recent = self.enqueue("prune-recent")["job_id"]
        queued = self.enqueue("prune-queued")["job_id"]
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute("UPDATE ws_jobs SET status = 'completed', completed_at = NOW() - INTERVAL '8 days' WHERE id = %s", (old,))
            conn.execute("UPDATE ws_jobs SET status = 'completed', completed_at = NOW() - INTERVAL '1 day' WHERE id = %s", (recent,))
            conn.commit()
        self.assertEqual(self.service.prune_finished(self.kind), 1)
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            left = {row["id"] for row in conn.execute("SELECT id FROM ws_jobs WHERE id = ANY(%s)", ([old, recent, queued],)).fetchall()}
        self.assertEqual(left, {recent, queued})

    def test_enqueued_job_matches_the_release_studio_response_model(self) -> None:
        """``create_candidate`` answers this row, so the typed model must keep it byte-for-byte."""

        from fastapi.encoders import jsonable_encoder

        from app.api import release_studio_models as models

        job = self.enqueue("model-check")
        self.assertEqual(
            models.JobRecord.model_validate(job).model_dump(mode="json"),
            jsonable_encoder(job),
        )

    def test_active_dedup_includes_cancellation(self) -> None:
        first = self.enqueue("same-artifact")
        duplicate = self.enqueue("same-artifact")
        self.assertTrue(duplicate["deduplicated"])
        self.assertEqual(first["job_id"], duplicate["job_id"])

        claimed = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertIsNotNone(claimed)
        self.assertEqual(
            self.service.request_cancel(first["job_id"], requested_by="test"),
            "cancel_requested",
        )
        cancelling_duplicate = self.enqueue("same-artifact")
        self.assertEqual(first["job_id"], cancelling_duplicate["job_id"])

        self.assertTrue(
            self.service.finalize_cancel(
                first["job_id"],
                "worker-a",
                int(claimed["fence"]),
            )
        )
        replacement = self.enqueue("same-artifact")
        self.assertNotEqual(first["job_id"], replacement["job_id"])

    def test_a_completed_job_appends_job_finished_after_the_commit(self) -> None:
        job = self.enqueue("finished")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertTrue(
            self.service.complete(job["job_id"], "worker-a", int(claim["fence"]))
        )

        finished = [row for row in self._events(job["job_id"]) if row["kind"] == "job.finished"]
        self.assertEqual(len(finished), 1)
        self.assertEqual(
            finished[0]["payload"],
            {"jobId": job["job_id"], "jobKind": self.kind, "state": "completed"},
        )

    def test_progress_events_hold_one_per_job_per_two_seconds(self) -> None:
        job = self.enqueue("progress")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        job_id, fence = job["job_id"], int(claim["fence"])

        def progress(percent: float) -> None:
            self.assertTrue(
                self.service.progress(job_id, "worker-a", fence, percent=percent)
            )

        # Two moves inside one window record once; the next window records the
        # new value, and repeating it does not record again.
        with mock.patch.object(job_service, "_monotonic", return_value=100.0):
            progress(10)
            progress(20)
        with mock.patch.object(job_service, "_monotonic", return_value=102.5):
            progress(30)
        with mock.patch.object(job_service, "_monotonic", return_value=105.0):
            progress(30)

        recorded = [
            row["payload"]["progress"]
            for row in self._events(job_id)
            if row["kind"] == "job.progress"
        ]
        self.assertEqual(recorded, [10.0, 30.0])

    def test_expired_cancel_requested_is_finalized_and_leaves_dedup(self) -> None:
        first = self.enqueue("cancel-expire")
        claimed = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertEqual(first["job_id"], claimed["job_id"])
        self.assertEqual(
            self.service.request_cancel(first["job_id"], requested_by="test"),
            "cancel_requested",
        )
        self.expire(first["job_id"])

        self.assertIsNone(self.service.claim("worker-b", worker_pool=self.pool))
        finalized = self.service.get(first["job_id"])
        self.assertEqual(finalized["status"], "cancelled")

        finished = [row for row in self._events(first["job_id"]) if row["kind"] == "job.finished"]
        self.assertEqual([row["payload"]["state"] for row in finished], ["cancelled"])

        replacement = self.enqueue("cancel-expire")
        self.assertFalse(replacement.get("deduplicated"))
        self.assertNotEqual(first["job_id"], replacement["job_id"])

    def test_active_jobs_without_a_lease_are_ended_and_leave_dedup(self) -> None:
        running = self.enqueue("unleased-running")
        cancelling = self.enqueue("unleased-cancelling")
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            for job_id, status in ((running["job_id"], "running"), (cancelling["job_id"], "cancel_requested")):
                conn.execute(
                    "UPDATE ws_jobs SET status = %s, lease_expires_at = NULL WHERE id = %s",
                    (status, job_id),
                )
            conn.commit()

        self.assertIsNone(self.service.claim("worker-a", worker_pool=self.pool))
        failed = self.service.get(running["job_id"])
        self.assertEqual((failed["status"], failed["error_code"]), ("failed", "orphaned"))
        self.assertEqual(self.service.get(cancelling["job_id"])["status"], "cancelled")
        for job_id, state in ((running["job_id"], "failed"), (cancelling["job_id"], "cancelled")):
            finished = [row for row in self._events(job_id) if row["kind"] == "job.finished"]
            self.assertEqual([row["payload"]["state"] for row in finished], [state])

        replacement = self.enqueue("unleased-running")
        self.assertNotEqual(running["job_id"], replacement["job_id"])

    def test_resource_slots_and_reclaim_reject_stale_fence(self) -> None:
        self.service.configure_resource_slots({self.resource: 1})
        first = self.enqueue("first", resources={self.resource: 1})
        second = self.enqueue("second", resources={self.resource: 1})
        claim_a = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertEqual(first["job_id"], claim_a["job_id"])
        self.assertIsNone(self.service.claim("worker-b", worker_pool=self.pool))

        self.expire(first["job_id"])
        claim_b = self.service.claim("worker-b", worker_pool=self.pool)
        self.assertEqual(first["job_id"], claim_b["job_id"])
        self.assertGreater(int(claim_b["fence"]), int(claim_a["fence"]))
        self.assertFalse(
            self.service.progress(
                first["job_id"],
                "worker-a",
                int(claim_a["fence"]),
                stage="stale",
            )
        )
        self.assertFalse(
            self.service.complete(
                first["job_id"],
                "worker-a",
                int(claim_a["fence"]),
            )
        )
        self.assertTrue(
            self.service.complete(
                first["job_id"],
                "worker-b",
                int(claim_b["fence"]),
            )
        )
        claim_second = self.service.claim("worker-c", worker_pool=self.pool)
        self.assertEqual(second["job_id"], claim_second["job_id"])

    def test_expired_slots_are_not_stolen_by_a_different_job(self) -> None:
        self.service.configure_resource_slots({self.resource: 1})
        first = self.enqueue("owner", resources={self.resource: 1})
        second = self.enqueue("waiter", resources={self.resource: 1})
        claim_a = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertEqual(first["job_id"], claim_a["job_id"])

        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                UPDATE ws_job_resource_slots
                SET lease_expires_at = NOW() - INTERVAL '1 second'
                WHERE job_id = %s
                """,
                (first["job_id"],),
            )
            conn.commit()

        self.assertIsNone(self.service.claim("worker-b", worker_pool=self.pool))
        self.assertFalse(
            self.service.heartbeat(
                first["job_id"],
                "worker-a",
                int(claim_a["fence"]),
            )
        )
        self.assertFalse(
            self.service.complete(
                first["job_id"],
                "worker-a",
                int(claim_a["fence"]),
            )
        )

        self.expire(first["job_id"])
        reclaim = self.service.claim("worker-b", worker_pool=self.pool)
        self.assertEqual(first["job_id"], reclaim["job_id"])
        self.assertTrue(
            self.service.complete(
                first["job_id"],
                "worker-b",
                int(reclaim["fence"]),
            )
        )
        claim_second = self.service.claim("worker-c", worker_pool=self.pool)
        self.assertEqual(second["job_id"], claim_second["job_id"])

    def test_repository_readers_coexist_and_writer_waits(self) -> None:
        lock_key = f"repo:{self.suffix}"
        reader_one = self.enqueue(
            "reader-one",
            locks=[{"key": lock_key, "mode": "read"}],
        )
        reader_two = self.enqueue(
            "reader-two",
            locks=[{"key": lock_key, "mode": "read"}],
        )
        writer = self.enqueue(
            "writer",
            locks=[{"key": lock_key, "mode": "write"}],
        )

        first_claim = self.service.claim("reader-a", worker_pool=self.pool)
        second_claim = self.service.claim("reader-b", worker_pool=self.pool)
        self.assertEqual(reader_one["job_id"], first_claim["job_id"])
        self.assertEqual(reader_two["job_id"], second_claim["job_id"])
        self.assertIsNone(self.service.claim("writer-a", worker_pool=self.pool))

        self.service.complete(
            reader_one["job_id"],
            "reader-a",
            int(first_claim["fence"]),
        )
        self.assertIsNone(self.service.claim("writer-a", worker_pool=self.pool))
        self.service.complete(
            reader_two["job_id"],
            "reader-b",
            int(second_claim["fence"]),
        )
        writer_claim = self.service.claim("writer-a", worker_pool=self.pool)
        self.assertEqual(writer["job_id"], writer_claim["job_id"])

    def test_completed_artifact_short_circuits_enqueue_with_valid_object(self) -> None:
        first = self.enqueue("cached-artifact")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        path, digest, size = self.write_artifact_file("cached.json", b"cached-body")
        artifact = {
            "kind": self.kind,
            "artifact_key": "cached-artifact",
            "digest": digest,
            "object_path": path,
            "media_type": "application/json",
            "size_bytes": size,
            "schema_version": "test-v1",
            "generator_version": "test",
            "readiness": "ready",
        }
        self.assertTrue(
            self.service.complete_artifact(
                first["job_id"],
                "worker-a",
                int(claim["fence"]),
                artifact,
            )
        )
        cached = self.enqueue("cached-artifact")
        self.assertTrue(cached["cache_hit"])
        self.assertEqual(first["job_id"], cached["job_id"])
        resolved = self.service.get_artifact_for_job(first["job_id"], touch=False)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["digest"], digest)

    def test_cache_hit_invalidates_missing_object_and_reenqueues(self) -> None:
        first = self.enqueue("missing-object")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        missing_path = str(Path(self._temp_dir.name) / "gone.json")
        artifact = {
            "kind": self.kind,
            "artifact_key": "missing-object",
            "digest": "a" * 64,
            "object_path": missing_path,
            "media_type": "application/json",
            "size_bytes": 12,
            "schema_version": "test-v1",
            "generator_version": "test",
            "readiness": "ready",
        }
        self.assertTrue(
            self.service.complete_artifact(
                first["job_id"],
                "worker-a",
                int(claim["fence"]),
                artifact,
            )
        )
        replacement = self.enqueue("missing-object")
        self.assertFalse(replacement.get("cache_hit"))
        self.assertNotEqual(first["job_id"], replacement["job_id"])
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                """
                SELECT readiness, invalidated_at IS NOT NULL AS invalid
                FROM ws_artifacts
                WHERE kind = %s AND artifact_key = %s
                """,
                (self.kind, "missing-object"),
            ).fetchone()
            conn.commit()
        self.assertEqual(row["readiness"], "invalid")
        self.assertTrue(row["invalid"])

    def test_cache_hit_updates_artifact_access_time(self) -> None:
        first = self.enqueue("cache-touch")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        path, digest, size = self.write_artifact_file("touch.json", b"x")
        artifact = {
            "kind": self.kind,
            "artifact_key": "cache-touch",
            "digest": digest,
            "object_path": path,
            "media_type": "application/json",
            "size_bytes": size,
            "schema_version": "test-v1",
            "generator_version": "test",
            "readiness": "ready",
        }
        self.assertTrue(
            self.service.complete_artifact(
                first["job_id"],
                "worker-a",
                int(claim["fence"]),
                artifact,
            )
        )
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            conn.execute(
                """
                UPDATE ws_artifacts
                SET last_accessed_at = NOW() - INTERVAL '1 day'
                WHERE kind = %s AND artifact_key = %s
                """,
                (self.kind, "cache-touch"),
            )
            before = conn.execute(
                """
                SELECT last_accessed_at FROM ws_artifacts
                WHERE kind = %s AND artifact_key = %s
                """,
                (self.kind, "cache-touch"),
            ).fetchone()["last_accessed_at"]
            conn.commit()

        cached = self.enqueue("cache-touch")
        self.assertTrue(cached["cache_hit"])
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            after = conn.execute(
                """
                SELECT last_accessed_at FROM ws_artifacts
                WHERE kind = %s AND artifact_key = %s
                """,
                (self.kind, "cache-touch"),
            ).fetchone()["last_accessed_at"]
        self.assertGreater(after, before)

    def test_fail_on_cancel_requested_never_retries(self) -> None:
        queued = self.enqueue("cancel-fail")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertEqual(
            self.service.request_cancel(queued["job_id"], requested_by="test"),
            "cancel_requested",
        )
        outcome = self.service.fail(
            queued["job_id"],
            "worker-a",
            int(claim["fence"]),
            error_code="cancelled_child",
            error_message="child stopped",
            transient=True,
            retry_after_seconds=0,
        )
        self.assertEqual(outcome, "cancelled")
        self.assertEqual(self.service.get(queued["job_id"])["status"], "cancelled")

    def test_a_successful_retry_clears_the_failed_attempt_s_error(self) -> None:
        queued = self.enqueue("retry-clears-error")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        outcome = self.service.fail(
            queued["job_id"],
            "worker-a",
            int(claim["fence"]),
            error_code="output-write-failed",
            error_message="-o's directory does not exist",
            transient=True,
            retry_after_seconds=0,
        )
        self.assertEqual(outcome, "retry_wait")
        self.assertEqual(self.service.get(queued["job_id"])["error_code"], "output-write-failed")
        retry = self.service.claim("worker-a", worker_pool=self.pool)
        self.assertEqual(str(retry["job_id"]), queued["job_id"])
        self.assertTrue(self.service.complete(queued["job_id"], "worker-a", int(retry["fence"]), message="done"))
        job = self.service.get(queued["job_id"])
        self.assertEqual(
            (job["status"], job["percent"], job["error_code"], job["error_message"]),
            ("completed", 100, "", ""),
        )

    def _artifact(self, name: str, body: bytes, readiness: str = "partial") -> dict:
        path, digest, size = self.write_artifact_file(name, body)
        return {"kind": self.kind, "artifact_key": "ended", "digest": digest, "object_path": path,
                "media_type": "application/json", "size_bytes": size, "readiness": readiness}

    def test_an_ended_job_result_is_replaced_once_and_never_while_running(self) -> None:
        queued = self.enqueue("ended")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        fence = int(claim["fence"])
        partial = self._artifact("partial.json", b"partial")
        self.assertTrue(self.service.publish_partial_artifact(
            queued["job_id"], "worker-a", fence, partial, stage="s", message="m", percent=50,
            details={"result_version": 1},
        ))
        relabel = self._artifact("failed.json", b"failed")
        # Running: an end hook must not overwrite a live attempt's result.
        self.assertFalse(self.service.publish_ended_result(
            queued["job_id"], relabel, expected_digest=partial["digest"], details={"result_version": 2}))
        self.assertEqual(self.service.ended_job_ids(self.kind, result_metadata={"result_version": 1}), [])
        self.service.fail(queued["job_id"], "worker-a", fence, error_code="x", error_message="x")
        self.assertEqual(self.service.ended_job_ids(self.kind, result_metadata={"result_version": 1}),
                         [queued["job_id"]])

        self.assertTrue(self.service.publish_ended_result(
            queued["job_id"], relabel, expected_digest=partial["digest"], details={"result_version": 2}))
        self.assertFalse(self.service.publish_ended_result(
            queued["job_id"], relabel, expected_digest=partial["digest"], details={"result_version": 2}))
        job = self.service.get(queued["job_id"])
        self.assertEqual((job["status"], job["result_digest"], job["result_metadata"]),
                         ("failed", relabel["digest"], {"result_version": 2}))
        self.assertEqual(self.service.ended_job_ids(self.kind, result_metadata={"result_version": 1}), [])
        with database.connection() as conn:
            conn.execute("SET search_path TO workspace, public")
            row = conn.execute(
                "SELECT source_job_id, source_fence FROM ws_artifacts WHERE kind = %s AND digest = %s",
                (self.kind, relabel["digest"]),
            ).fetchone()
        self.assertEqual((str(row["source_job_id"]), int(row["source_fence"])), (queued["job_id"], fence))

    def test_completed_sidecars_share_the_authoritative_fence(self) -> None:
        queued = self.enqueue("sidecar-bundle")
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        primary_path, primary_digest, primary_size = self.write_artifact_file(
            "manifest.json",
            b"{}",
        )
        sidecar_path, sidecar_digest, sidecar_size = self.write_artifact_file(
            "schematic.json",
            b"[]",
        )
        primary = {
            "kind": self.kind,
            "artifact_key": "sidecar-bundle",
            "digest": primary_digest,
            "object_path": primary_path,
            "media_type": "application/json",
            "size_bytes": primary_size,
            "schema_version": "bundle-v1",
            "generator_version": "test",
            "readiness": "ready",
        }
        sidecar = {
            "kind": "design_compare_sidecar",
            "artifact_key": "sidecar-bundle:sidecar:schematic",
            "digest": sidecar_digest,
            "object_path": sidecar_path,
            "media_type": "application/json",
            "size_bytes": sidecar_size,
            "schema_version": "result-v3",
            "generator_version": "test",
            "readiness": "sidecar",
        }

        self.assertTrue(
            self.service.complete_artifact(
                queued["job_id"],
                "worker-a",
                int(claim["fence"]),
                primary,
                extra_artifacts=[sidecar],
            )
        )
        resolved_primary = self.service.get_artifact_for_job(
            queued["job_id"],
            touch=False,
        )
        resolved_sidecar = self.service.get_artifact_for_job_digest(
            queued["job_id"],
            sidecar_digest,
            touch=False,
        )
        self.assertEqual(resolved_primary["digest"], primary_digest)
        self.assertEqual(resolved_sidecar["kind"], "design_compare_sidecar")


if __name__ == "__main__":
    unittest.main()
