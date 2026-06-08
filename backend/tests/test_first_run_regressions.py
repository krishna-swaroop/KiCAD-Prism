from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from git import Actor, Repo


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.projects import delete_project_endpoint  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from app.services import diff_service, project_import_service, project_service  # noqa: E402
from app.services.workspace_service import workspace  # noqa: E402


AUTHOR = Actor("Prism Test", "prism@example.com")


class _FakePopen:
    stdout: list[str] = []

    def __init__(self, *args, **kwargs) -> None:
        pass

    def wait(self) -> int:
        return 0


class FirstRunRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.projects_root = self.root / "projects"
        self.db_path = self.projects_root / ".kicad-prism" / "prism.sqlite3"

        self.previous_projects_root = project_service.PROJECTS_ROOT
        self.previous_monorepos_root = project_service.MONOREPOS_ROOT
        self.previous_registry_file = project_service.PROJECT_REGISTRY_FILE
        self.previous_workspace_db_path = workspace._db_path  # noqa: SLF001
        self.previous_workspace_initialized = workspace._initialized  # noqa: SLF001

        project_service.PROJECTS_ROOT = str(self.projects_root)
        project_service.MONOREPOS_ROOT = str(self.projects_root / "type2")
        project_service.PROJECT_REGISTRY_FILE = str(self.projects_root / ".project_registry.json")
        os.makedirs(project_service.MONOREPOS_ROOT, exist_ok=True)
        os.makedirs(self.projects_root / "type1", exist_ok=True)

        workspace._db_path = self.db_path  # noqa: SLF001
        workspace._initialized = False  # noqa: SLF001
        workspace.initialize()

        project_import_service.jobs.clear()
        project_service.jobs.clear()
        diff_service.diff_jobs.clear()

    def tearDown(self) -> None:
        project_import_service.jobs.clear()
        project_service.jobs.clear()
        diff_service.diff_jobs.clear()
        project_service.PROJECTS_ROOT = self.previous_projects_root
        project_service.MONOREPOS_ROOT = self.previous_monorepos_root
        project_service.PROJECT_REGISTRY_FILE = self.previous_registry_file
        workspace._db_path = self.previous_workspace_db_path  # noqa: SLF001
        workspace._initialized = self.previous_workspace_initialized  # noqa: SLF001
        self.tmp.cleanup()

    def _create_source_repo(self) -> Path:
        repo_dir = self.root / "source-repo"
        repo_dir.mkdir()
        (repo_dir / "Demo.kicad_pro").write_text("(kicad_pro)", encoding="utf-8")
        (repo_dir / "Demo.kicad_sch").write_text("(kicad_sch)", encoding="utf-8")
        (repo_dir / "Demo.kicad_pcb").write_text("(kicad_pcb)", encoding="utf-8")
        (repo_dir / "Outputs.kicad_jobset").write_text('{"jobs":[]}', encoding="utf-8")
        repo = Repo.init(repo_dir)
        repo.git.add(A=True)
        repo.index.commit("initial", author=AUTHOR, committer=AUTHOR)
        return repo_dir

    @staticmethod
    def _wait_for_job(job_getter, job_id: str, timeout: float = 5.0) -> dict:
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            last = job_getter(job_id)
            if last and last.get("status") != "running":
                return last
            time.sleep(0.05)
        raise AssertionError(f"Job {job_id} did not finish; last={last}")

    def _import_source_repo(self) -> tuple[Path, str]:
        source_repo = self._create_source_repo()
        job_id = project_import_service.start_import_job(str(source_repo), "type1")
        job = self._wait_for_job(project_import_service.get_job_status, job_id)
        self.assertEqual(job["status"], "completed", job)
        return source_repo, job["project_ids"][0]

    def test_import_job_status_survives_process_local_memory_loss(self) -> None:
        source_repo = self._create_source_repo()
        job_id = project_import_service.start_import_job(str(source_repo), "type1")
        job = self._wait_for_job(project_import_service.get_job_status, job_id)
        self.assertEqual(job["status"], "completed", job)

        project_import_service.jobs.clear()
        persisted = project_import_service.get_job_status(job_id)

        self.assertIsNotNone(persisted)
        self.assertEqual(persisted["status"], "completed")
        self.assertEqual(persisted["project_ids"], job["project_ids"])

    def test_imported_workspace_project_can_start_workflow(self) -> None:
        _, project_id = self._import_source_repo()

        with patch.object(project_service.subprocess, "Popen", _FakePopen):
            job_id = project_service.start_workflow_job(project_id, "design")
            job = self._wait_for_job(project_service.get_job_status, job_id)

        self.assertNotEqual(job.get("error"), "Project not found")
        self.assertEqual(job["status"], "completed", job)

    def test_delete_project_allows_same_repo_to_be_imported_again(self) -> None:
        source_repo, project_id = self._import_source_repo()
        user = AuthenticatedUser(email="admin@example.com", name="Admin", role="admin")

        response = asyncio.run(delete_project_endpoint(project_id, user))
        self.assertTrue(response["repository_deleted"])

        job_id = project_import_service.start_import_job(str(source_repo), "type1")
        job = self._wait_for_job(project_import_service.get_job_status, job_id)

        self.assertEqual(job["status"], "completed", job)

    def test_https_clone_is_not_rejected_when_ssh_key_exists(self) -> None:
        def fake_clone_from(*args, **kwargs):
            raise RuntimeError("clone attempted")

        with (
            patch.object(project_import_service, "has_ssh_key", return_value=True),
            patch.object(project_import_service.Repo, "clone_from", side_effect=fake_clone_from),
            patch.dict(os.environ, {"GITHUB_TOKEN": ""}, clear=False),
        ):
            with self.assertRaises(RuntimeError) as ctx:
                project_import_service.analyze_repository("https://example.com/repo.git")

        self.assertEqual(str(ctx.exception), "clone attempted")

    def test_diff_job_status_survives_process_local_memory_loss(self) -> None:
        job_id = diff_service.start_diff_job("missing-project", "a", "b")
        job = self._wait_for_job(diff_service.get_job_status, job_id)
        self.assertEqual(job["status"], "failed", job)

        diff_service.diff_jobs.clear()
        persisted = diff_service.get_job_status(job_id)

        self.assertIsNotNone(persisted)
        self.assertEqual(persisted["status"], "failed")


if __name__ == "__main__":
    unittest.main()
