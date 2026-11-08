"""Re-registration and retention of ``ws_artifacts`` rows."""

from __future__ import annotations

import hashlib
import unittest
from typing import Any

from app.services import job_artifact_records
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from support.postgres import requires_scratch_postgres, scratch_schema, seed_job


@requires_scratch_postgres("job artifact record tests")
class JobArtifactRecordsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "job_artifacts", ledgers=(WORKSPACE_LEDGER,))
        self.conn = self.scratch.conn

    def _artifact(
        self,
        digest: str,
        *,
        object_path: str = "",
        schema_version: str = "v1",
        generator_version: str = "gen-1",
    ) -> dict[str, Any]:
        return {
            "kind": "test-reinsert",
            "artifact_key": "key",
            "digest": digest,
            "object_path": object_path or f"/objects/{digest}",
            "media_type": "application/json",
            "size_bytes": 7,
            "schema_version": schema_version,
            "generator_version": generator_version,
            "readiness": "ready",
        }

    def test_a_reinserted_artifact_is_live_again_and_not_pruned(self) -> None:
        digest = hashlib.sha256(b"payload").hexdigest()
        seed_job(self.conn, "job-first", "test-reinsert", "completed", fence=1)
        job_artifact_records.insert_artifact(
            self.conn,
            "artifact-id",
            self._artifact(digest),
            job_id="job-first",
            fence=1,
        )
        first = job_artifact_records.artifact_for_job(self.conn, "job-first")
        self.assertIsNotNone(first)
        self.assertTrue(
            job_artifact_records.invalidate_artifact(
                self.conn,
                str(first["id"]),
                reason="object_corrupt",
                record_event=lambda *args, **kwargs: None,
            )
        )
        self.assertIsNone(job_artifact_records.artifact_for_job(self.conn, "job-first"))
        # Simulate the invalidated copy having aged past the retention window.
        self.conn.execute(
            "UPDATE ws_artifacts SET invalidated_at = NOW() - INTERVAL '2 days' WHERE id = %s",
            (first["id"],),
        )

        seed_job(self.conn, "job-second", "test-reinsert", "completed", fence=2)
        job_artifact_records.insert_artifact(
            self.conn,
            "unused-id",
            self._artifact(
                digest,
                object_path=f"/objects/new/{digest}",
                schema_version="v2",
                generator_version="gen-2",
            ),
            job_id="job-second",
            fence=2,
        )

        revived = job_artifact_records.artifact_for_job(self.conn, "job-second")
        self.assertIsNotNone(revived)
        self.assertEqual(str(revived["id"]), str(first["id"]))
        self.assertIsNone(revived["invalidated_at"])
        self.assertEqual(revived["source_job_id"], "job-second")
        self.assertEqual(revived["object_path"], f"/objects/new/{digest}")
        self.assertEqual(revived["schema_version"], "v2")
        self.assertEqual(revived["generator_version"], "gen-2")
        self.assertIn(
            str(revived["id"]),
            {
                str(row["id"])
                for row in job_artifact_records.list_ready_artifacts(self.conn, limit=10)
            },
        )

        pruned = job_artifact_records.prune_artifact_metadata(
            self.conn,
            retention_seconds=30 * 24 * 60 * 60,
            partial_retention_seconds=24 * 60 * 60,
            invalid_retention_seconds=0,
        )
        self.assertEqual(pruned, 0)
        self.assertIsNotNone(job_artifact_records.artifact_for_job(self.conn, "job-second"))
