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

    def test_about_requires_a_signed_in_user(self) -> None:
        route = next(r for r in health.router.routes if getattr(r, "path", "") == "/api/health/about")
        dependencies = [dependency.call for dependency in route.dependant.dependencies]
        self.assertIn(health.require_viewer, dependencies)

    def test_about_reports_build_metadata_and_kicad_cli_version(self) -> None:
        with (
            patch.dict(os.environ, {"PRISM_RELEASE": "v4.0.0", "PRISM_REVISION": "abc123"}, clear=False),
            patch.object(health, "kicad_cli_version", return_value="10.0.4"),
        ):
            payload = health.about(MagicMock())

        self.assertEqual(payload["release"], "v4.0.0")
        self.assertEqual(payload["revision"], "abc123")
        self.assertEqual(payload["kicadCli"], "10.0.4")

    def test_kicad_cli_version_keeps_first_line_and_caches_it(self) -> None:
        completed = MagicMock(returncode=0, stdout="10.0.4\nextra detail\n")
        with (
            patch.object(health, "_kicad_cli_version", None),
            patch.object(health.shutil, "which", return_value="/usr/bin/kicad-cli"),
            patch.object(health.subprocess, "run", return_value=completed) as run,
        ):
            self.assertEqual(health.kicad_cli_version(), "10.0.4")
            self.assertEqual(health.kicad_cli_version(), "10.0.4")

        run.assert_called_once()

    def test_kicad_cli_version_does_not_cache_a_missing_binary(self) -> None:
        with (
            patch.object(health, "_kicad_cli_version", None),
            patch.object(health.shutil, "which", return_value=None),
        ):
            self.assertEqual(health.kicad_cli_version(), "unavailable")
            self.assertIsNone(health._kicad_cli_version)


if __name__ == "__main__":
    unittest.main()
