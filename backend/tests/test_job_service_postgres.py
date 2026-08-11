from __future__ import annotations

import hashlib
import os
import tempfile
import uuid
import unittest
from pathlib import Path

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
                "DELETE FROM ws_webgpu_ready WHERE project_id LIKE %s",
                (f"%{self.suffix}%",),
            )
            conn.execute(
                "DELETE FROM ws_artifacts WHERE kind = %s OR source_job_id = ANY(%s)",
                (self.kind, self.job_ids),
            )
            conn.execute(
                "DELETE FROM ws_jobs WHERE id = ANY(%s)",
                (self.job_ids,),
            )
            conn.execute(
                "DELETE FROM ws_job_resource_slots WHERE resource_name = %s",
                (self.resource,),
            )
            conn.commit()

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

        replacement = self.enqueue("cancel-expire")
        self.assertFalse(replacement.get("deduplicated"))
        self.assertNotEqual(first["job_id"], replacement["job_id"])

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

    def test_webgpu_completion_publishes_o1_readiness_metadata(self) -> None:
        selector = f"commit:{self.suffix}"
        project_id = f"project-{self.suffix}"
        queued = self.service.enqueue(
            "webgpu_3d",
            {"test": True},
            worker_pool=self.pool,
            artifact_key=f"webgpu-{self.suffix}",
        )
        self.job_ids.append(str(queued["job_id"]))
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        details = {
            "schema": "prism.webgpu_3d_status_a0",
            "project_id": project_id,
            "status_selector": selector,
            "source_fingerprint": "source-a",
            "sourceRevisionKey": "source-a",
            "build_fingerprint": "build-a",
            "bundle_url": "/bundle.json",
            "status": "ready",
            "available": True,
            "commit": "a" * 40,
        }
        path, digest, size = self.write_artifact_file("bundle.json", b"{}")
        artifact = {
            "kind": "webgpu_3d",
            "artifact_key": f"webgpu-{self.suffix}",
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
                queued["job_id"],
                "worker-a",
                int(claim["fence"]),
                artifact,
                details=details,
            )
        )
        ready = self.service.get_webgpu_ready(project_id, selector, "build-a")
        self.assertIsNotNone(ready)
        self.assertTrue(ready["available"])
        prefixed = self.service.find_webgpu_ready_by_commit_prefix(
            project_id,
            "build-a",
            "a" * 12,
        )
        self.assertEqual(prefixed["commit"], "a" * 40)

    def test_webgpu_staged_upsert_exposes_building_status_via_fast_read(self) -> None:
        selector = f"workspace:staged-{self.suffix}"
        project_id = f"project-staged-{self.suffix}"
        queued = self.service.enqueue(
            "webgpu_3d",
            {"test": True},
            worker_pool=self.pool,
            artifact_key=f"webgpu-staged-{self.suffix}",
        )
        self.job_ids.append(str(queued["job_id"]))
        claim = self.service.claim("worker-a", worker_pool=self.pool)
        readiness = {
            "schema": "prism.visualizer_readiness.a0",
            "stage": "board-ready",
            "progress": 35,
            "available_assets": ["board"],
            "revision": "rev-partial",
        }
        self.service.upsert_webgpu_ready_status(
            job_id=str(queued["job_id"]),
            fence=int(claim["fence"]),
            details={
                "schema": "prism.webgpu_3d_status_a0",
                "project_id": project_id,
                "status_selector": selector,
                "source_fingerprint": "source-partial",
                "sourceRevisionKey": "source-partial",
                "build_fingerprint": "build-a",
                "bundle_url": "/partial/bundle.json",
                "status": "building",
                "available": True,
                "readiness": readiness,
            },
        )
        ready = self.service.get_webgpu_ready(project_id, selector, "build-a")
        self.assertIsNotNone(ready)
        self.assertEqual(ready["status"], "building")
        self.assertTrue(ready["available"])
        self.assertEqual(ready["readiness"]["stage"], "board-ready")

    def test_webgpu_ready_upsert_respects_invalidation_and_recency(self) -> None:
        selector = f"commit:webgpu-race-{self.suffix}"
        project_id = f"project-race-{self.suffix}"
        older = self.service.enqueue(
            "webgpu_3d",
            {"order": 1},
            worker_pool=self.pool,
            artifact_key=f"webgpu-old-{self.suffix}",
        )
        newer = self.service.enqueue(
            "webgpu_3d",
            {"order": 2},
            worker_pool=self.pool,
            artifact_key=f"webgpu-new-{self.suffix}",
        )
        self.job_ids.extend([str(older["job_id"]), str(newer["job_id"])])
        older_claim = self.service.claim("worker-a", worker_pool=self.pool)
        newer_claim = self.service.claim("worker-b", worker_pool=self.pool)
        self.assertEqual(older["job_id"], older_claim["job_id"])
        self.assertEqual(newer["job_id"], newer_claim["job_id"])

        def publish(job_id: str, worker_id: str, fence: int, label: str) -> None:
            path, digest, size = self.write_artifact_file(
                f"{label}.json",
                label.encode(),
            )
            self.assertTrue(
                self.service.complete_artifact(
                    job_id,
                    worker_id,
                    fence,
                    {
                        "kind": "webgpu_3d",
                        "artifact_key": f"webgpu-{label}-{self.suffix}",
                        "digest": digest,
                        "object_path": path,
                        "media_type": "application/json",
                        "size_bytes": size,
                        "schema_version": "test-v1",
                        "generator_version": "test",
                        "readiness": "ready",
                    },
                    details={
                        "project_id": project_id,
                        "status_selector": selector,
                        "sourceRevisionKey": label,
                        "build_fingerprint": "build-race",
                        "bundle_url": f"/{label}.json",
                        "status": "ready",
                        "available": True,
                        "commit": "b" * 40,
                    },
                )
            )

        publish(newer["job_id"], "worker-b", int(newer_claim["fence"]), "newer")
        self.assertTrue(
            self.service.invalidate_webgpu_ready(project_id, selector, "build-race")
        )
        publish(older["job_id"], "worker-a", int(older_claim["fence"]), "older")
        self.assertIsNone(
            self.service.get_webgpu_ready(project_id, selector, "build-race")
        )


if __name__ == "__main__":
    unittest.main()
