from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
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


if __name__ == "__main__":
    unittest.main()
