from __future__ import annotations

import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import health  # noqa: E402


@contextmanager
def database_connection(row: object | None = {"ready": 1}):
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = row
    yield connection


class HealthApiTests(unittest.TestCase):
    def test_liveness_reports_build_metadata_without_dependencies(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PRISM_RELEASE": "3.1.2",
                "PRISM_REVISION": "abc123",
                "PRISM_BUILD_DATE": "2026-07-27T00:00:00Z",
            },
            clear=False,
        ):
            self.assertEqual(
                health.live(),
                {
                    "status": "ok",
                    "release": "3.1.2",
                    "revision": "abc123",
                    "buildDate": "2026-07-27T00:00:00Z",
                },
            )

    def test_readiness_requires_database_and_writable_projects_directory(self) -> None:
        with tempfile.TemporaryDirectory() as projects_root:
            with patch.object(
                health.database,
                "connection",
                return_value=database_connection(),
            ):
                is_ready, checks = health.readiness_status(projects_root)

        self.assertTrue(is_ready)
        self.assertEqual(checks, {"database": "ok", "projects": "ok"})

    def test_readiness_sanitizes_database_failures(self) -> None:
        with tempfile.TemporaryDirectory() as projects_root:
            with (
                patch.object(
                    health.database,
                    "connection",
                    side_effect=RuntimeError("postgresql://secret@example.invalid"),
                ),
                self.assertLogs(health.logger, level="WARNING") as logged,
            ):
                is_ready, checks = health.readiness_status(projects_root)

        self.assertFalse(is_ready)
        self.assertEqual(checks["database"], "failed")
        self.assertNotIn("secret", str(checks))
        self.assertNotIn("secret", "\n".join(logged.output))

    def test_readiness_route_returns_service_unavailable(self) -> None:
        with patch.object(
            health,
            "readiness_status",
            return_value=(False, {"database": "failed", "projects": "ok"}),
        ):
            with self.assertRaises(HTTPException) as caught:
                health.ready()

        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail["status"], "not_ready")

    def test_readiness_rejects_missing_projects_directory(self) -> None:
        with tempfile.TemporaryDirectory() as parent:
            missing = str(Path(parent) / "missing")
            with patch.object(
                health.database,
                "connection",
                return_value=database_connection(),
            ):
                is_ready, checks = health.readiness_status(missing)

        self.assertFalse(is_ready)
        self.assertEqual(checks, {"database": "ok", "projects": "failed"})


if __name__ == "__main__":
    unittest.main()
