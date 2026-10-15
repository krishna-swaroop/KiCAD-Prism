from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from app.services import project_auto_sync_service


class ProjectAutoSyncTests(unittest.TestCase):
    def test_schedules_one_fetch_per_due_repository_and_throttles_retries(self) -> None:
        now = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)
        projects = [
            {"id": "a", "repo_id": "shared", "repo_last_synced": None},
            {"id": "b", "repo_id": "shared", "repo_last_synced": None},
            {"id": "c", "repo_id": "recent", "repo_last_synced": (now - timedelta(seconds=60)).isoformat()},
        ]
        attempts = {}
        with (
            mock.patch.object(project_auto_sync_service.workspace, "get_all_projects", return_value=projects),
            mock.patch.object(project_auto_sync_service, "start_sync_job") as start,
        ):
            self.assertEqual(project_auto_sync_service.enqueue_due_fetches(attempts, interval_seconds=300, now=now), 1)
            self.assertEqual(project_auto_sync_service.enqueue_due_fetches(attempts, interval_seconds=300, now=now), 0)
        start.assert_called_once_with("a", requested_by="system:auto-sync", fetch_only=True)

    def test_an_unchanged_remote_gets_no_job_only_a_synced_time(self) -> None:
        now = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)
        projects = [{"id": "a", "repo_id": "quiet", "repo_last_synced": None, "path": "/repo"}]
        with (
            mock.patch.object(project_auto_sync_service.workspace, "get_all_projects", return_value=projects),
            mock.patch.object(project_auto_sync_service.workspace, "update_repository_synced") as synced,
            mock.patch.object(project_auto_sync_service, "remote_unchanged", return_value=True) as unchanged,
            mock.patch.object(project_auto_sync_service, "start_sync_job") as start,
        ):
            self.assertEqual(project_auto_sync_service.enqueue_due_fetches({}, interval_seconds=300, now=now), 0)
        unchanged.assert_called_once_with("/repo")
        synced.assert_called_once_with("quiet")
        start.assert_not_called()


_IDENTITY = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
             "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}


def _git(*args: str, cwd: Path) -> str:
    env = {**os.environ, **_IDENTITY}
    return subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout


class RemoteUnchangedTests(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(tempfile.mkdtemp())
        self.origin = root / "origin"
        self.origin.mkdir()
        _git("init", "-q", "-b", "main", cwd=self.origin)
        _git("commit", "-q", "--allow-empty", "-m", "one", cwd=self.origin)
        _git("tag", "-a", "v1", "-m", "v1", cwd=self.origin)
        _git("clone", "-q", str(self.origin), "clone", cwd=root)
        self.clone = root / "clone"

    def test_matches_after_a_fetch_and_not_after_an_upstream_commit(self) -> None:
        self.assertTrue(project_auto_sync_service.remote_unchanged(str(self.clone)))
        _git("commit", "-q", "--allow-empty", "-m", "two", cwd=self.origin)
        self.assertFalse(project_auto_sync_service.remote_unchanged(str(self.clone)))
        _git("fetch", "-q", "--tags", "--prune", cwd=self.clone)
        self.assertTrue(project_auto_sync_service.remote_unchanged(str(self.clone)))
        _git("branch", "feature", cwd=self.origin)
        self.assertFalse(project_auto_sync_service.remote_unchanged(str(self.clone)))

    def test_any_doubt_means_fetch(self) -> None:
        self.assertFalse(project_auto_sync_service.remote_unchanged(""))
        self.assertFalse(project_auto_sync_service.remote_unchanged(str(self.clone.parent / "missing")))


if __name__ == "__main__":
    unittest.main()
