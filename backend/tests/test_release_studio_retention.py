"""Retention and filesystem-GC behavior for Release Studio artifact pins."""

from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency guard for host-only checks
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

from app.services.job_artifact_service import JobArtifactService  # noqa: E402
from app.services.job_service import JobService  # noqa: E402


POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


def _database_identity(url: str) -> tuple[str, str, int | None, str]:
    parsed = urlsplit(url)
    return (
        parsed.username or "",
        (parsed.hostname or "").lower(),
        parsed.port,
        parsed.path.lstrip("/"),
    )


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _database_identity(POSTGRES_URL) == _database_identity(APPLICATION_POSTGRES_URL)
)


class TestDatabaseJobService(JobService):
    """Run the production JobService SQL against the isolated test database."""

    def initialize(self) -> None:
        # The fixture creates only the workspace tables needed by these methods.
        # In particular, never initialize the process-global application pool.
        return None

    @contextmanager
    def _connect(self):
        assert psycopg is not None
        dsn = POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)
        with psycopg.connect(dsn, row_factory=dict_row) as conn:
            yield conn


@unittest.skipUnless(
    POSTGRES_URL,
    "TEST_POSTGRES_URL is required for Release Studio retention tests",
)
@unittest.skipUnless(
    psycopg is not None,
    "psycopg is required for Release Studio retention tests",
)
@unittest.skipIf(
    SHARED_APPLICATION_DATABASE,
    "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL",
)
class ReleaseStudioRetentionPostgresTests(unittest.TestCase):
    """Exercise R9 against a disposable PostgreSQL workspace schema."""

    def setUp(self) -> None:
        assert psycopg is not None
        self.conn = psycopg.connect(
            POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1),
            row_factory=dict_row,
        )
        self.conn.execute("CREATE SCHEMA IF NOT EXISTS workspace")
        self.conn.execute("SET search_path TO workspace, public")
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ws_jobs (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'test',
                status TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            )
            """
        )
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ws_artifacts (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'test',
                artifact_key TEXT NOT NULL DEFAULT '',
                digest TEXT NOT NULL DEFAULT '',
                object_path TEXT NOT NULL,
                media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                size_bytes BIGINT NOT NULL DEFAULT 0,
                schema_version TEXT NOT NULL DEFAULT '',
                generator_version TEXT NOT NULL DEFAULT '',
                readiness TEXT NOT NULL DEFAULT 'ready',
                source_job_id TEXT REFERENCES ws_jobs(id) ON DELETE SET NULL,
                source_fence BIGINT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                invalidated_at TIMESTAMPTZ
            )
            """
        )
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ws_artifact_release_pins (
                artifact_id TEXT PRIMARY KEY
                            REFERENCES ws_artifacts(id) ON DELETE CASCADE,
                pin_kind TEXT NOT NULL,
                pin_ref TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        self.conn.commit()

        self.service = TestDatabaseJobService()
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.artifacts = JobArtifactService(Path(self.tempdir.name))
        self.job_ids: list[str] = []
        self.artifact_ids: list[str] = []

    def tearDown(self) -> None:
        self.conn.rollback()
        self.conn.execute("SET search_path TO workspace, public")
        self.conn.execute(
            "DELETE FROM ws_artifact_release_pins WHERE artifact_id = ANY(%s)",
            (self.artifact_ids,),
        )
        self.conn.execute(
            "DELETE FROM ws_artifacts WHERE id = ANY(%s)",
            (self.artifact_ids,),
        )
        self.conn.execute(
            "DELETE FROM ws_jobs WHERE id = ANY(%s)",
            (self.job_ids,),
        )
        self.conn.commit()
        self.conn.close()

    def _artifact(
        self,
        *,
        readiness: str = "ready",
        invalidated: bool = False,
        pinned: bool = False,
        object_path: str | None = None,
    ) -> str:
        job_id = f"r9-job-{uuid.uuid4().hex}"
        artifact_id = f"r9-artifact-{uuid.uuid4().hex}"
        artifact_path = object_path or str(
            Path(self.tempdir.name) / f"{artifact_id}.bin"
        )
        self.conn.execute(
            """
            INSERT INTO ws_jobs(
                id, kind, status, created_at, updated_at, completed_at
            )
            VALUES (
                %s, %s, 'completed',
                NOW() - INTERVAL '1 hour',
                NOW() - INTERVAL '1 hour',
                NOW() - INTERVAL '1 hour'
            )
            """,
            (job_id, "release-studio-r9"),
        )
        self.conn.execute(
            """
            INSERT INTO ws_artifacts(
                id, kind, artifact_key, digest, object_path, readiness,
                source_job_id, created_at, last_accessed_at, invalidated_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                NOW() - INTERVAL '1 hour',
                NOW() - INTERVAL '1 hour',
                CASE
                    WHEN %s THEN NOW() - INTERVAL '1 hour'
                    ELSE NULL
                END
            )
            """,
            (
                artifact_id,
                "release-studio-r9",
                artifact_id,
                hashlib.sha256(artifact_id.encode()).hexdigest(),
                artifact_path,
                readiness,
                job_id,
                invalidated,
            ),
        )
        if pinned:
            self.conn.execute(
                """
                INSERT INTO ws_artifact_release_pins(artifact_id, pin_kind, pin_ref)
                VALUES (%s, 'release_studio', %s)
                """,
                (artifact_id, f"release-{artifact_id}"),
            )
        self.conn.commit()
        self.job_ids.append(job_id)
        self.artifact_ids.append(artifact_id)
        return artifact_id

    def _object_path(self, label: str) -> Path:
        digest = hashlib.sha256(label.encode()).hexdigest()
        return self.artifacts.objects / digest[:2] / digest[2:4] / digest

    def test_expired_pinned_artifact_survives_general_pruning(self) -> None:
        pinned = self._artifact(pinned=True)
        unpinned = self._artifact()

        pruned = self.service.prune_artifact_metadata(
            retention_seconds=0,
            partial_retention_seconds=0,
            invalid_retention_seconds=0,
        )

        self.assertEqual(pruned, 1)
        rows = self.conn.execute(
            "SELECT id FROM ws_artifacts WHERE id = ANY(%s)",
            ([pinned, unpinned],),
        ).fetchall()
        self.assertEqual({str(row["id"]) for row in rows}, {pinned})

    def test_pinned_invalid_and_partial_artifacts_survive_pruning(self) -> None:
        cases = (
            ("invalid", "invalid", True),
            ("partial", "partial", False),
        )
        for label, readiness, invalidated in cases:
            with self.subTest(label=label):
                pinned = self._artifact(
                    readiness=readiness,
                    invalidated=invalidated,
                    pinned=True,
                )
                unpinned = self._artifact(
                    readiness=readiness,
                    invalidated=invalidated,
                )

                pruned = self.service.prune_artifact_metadata(
                    retention_seconds=0,
                    partial_retention_seconds=0,
                    invalid_retention_seconds=0,
                )

                self.assertEqual(pruned, 1)
                rows = self.conn.execute(
                    "SELECT id FROM ws_artifacts WHERE id = ANY(%s)",
                    ([pinned, unpinned],),
                ).fetchall()
                self.assertEqual({str(row["id"]) for row in rows}, {pinned})

    def test_referenced_paths_include_pinned_invalidated_artifacts(self) -> None:
        pinned_path = self._object_path("pinned-invalidated")
        unpinned_path = self._object_path("unpinned-invalidated")
        self._artifact(
            invalidated=True,
            pinned=True,
            object_path=str(pinned_path),
        )
        self._artifact(invalidated=True, object_path=str(unpinned_path))

        paths = self.service.referenced_object_paths()

        self.assertIn(str(pinned_path), paths)
        self.assertNotIn(str(unpinned_path), paths)

    def test_filesystem_gc_preserves_pinned_invalidated_object(self) -> None:
        pinned_path = self._object_path("gc-pinned")
        unpinned_path = self._object_path("gc-unpinned")
        for path in (pinned_path, unpinned_path):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(path.name.encode())
            old = max(0.0, path.stat().st_mtime - 3600)
            os.utime(path, (old, old))

        self._artifact(
            invalidated=True,
            pinned=True,
            object_path=str(pinned_path),
        )
        self._artifact(invalidated=True, object_path=str(unpinned_path))

        referenced = self.service.referenced_object_paths()
        self.assertIn(str(pinned_path), referenced)
        self.assertNotIn(str(unpinned_path), referenced)

        result = self.artifacts.collect_unreferenced_objects(
            service=self.service,
            grace_seconds=0,
        )

        self.assertTrue(pinned_path.exists())
        self.assertFalse(unpinned_path.exists())
        self.assertEqual(result["objects_removed"], 1)


if __name__ == "__main__":
    unittest.main()
