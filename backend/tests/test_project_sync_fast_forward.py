"""Sync must treat Prism's checkout as a read-only mirror.

The previous implementation called `origin.pull()`, which merges. Combined with
Prism writing generated thumbnails into the tree, that could create merge
commits in a repository the team considers the source of truth, or fail outright
once upstream touched the same path.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import project_import_service


class SyncFastForwardsOnly(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.checkout = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)

        self.repo = mock.Mock()
        self.repo.working_tree_dir = str(self.checkout)
        self.repo.head.is_detached = False
        self.repo.is_dirty.return_value = False
        self.repo.active_branch.name = "main"
        self.repo.active_branch.tracking_branch.return_value = SimpleNamespace(
            name="origin/main"
        )
        self.origin = self.repo.remote.return_value
        self.origin.fetch.return_value = ["ref"]

        self._patches = [
            mock.patch.object(
                project_import_service.workspace,
                "get_project_by_id",
                return_value={
                    "id": "prj_1",
                    "repo_id": "repo_1",
                    "import_type": "single",
                    "path": str(self.checkout),
                    "parent_repo_path": str(self.checkout),
                },
            ),
            mock.patch.object(project_import_service, "Repo", return_value=self.repo),
            mock.patch.object(
                project_import_service, "generate_thumbnail_for_project", return_value=False
            ),
            mock.patch.object(
                project_import_service, "resolve_cached_paths", return_value={}
            ),
            mock.patch.object(project_import_service.workspace, "update_project"),
            mock.patch.object(
                project_import_service.workspace, "update_repository_synced"
            ),
        ]
        for patch in self._patches:
            patch.start()
            self.addCleanup(patch.stop)

    def test_sync_never_pulls(self) -> None:
        result = project_import_service.sync_project("prj_1")
        self.assertEqual(result["status"], "success")
        # `pull` fetches *and merges*; a mirror must not merge.
        self.origin.pull.assert_not_called()
        self.repo.git.merge.assert_called_once_with("--ff-only", "origin/main")

    def test_sync_prunes_deleted_remote_branches(self) -> None:
        project_import_service.sync_project("prj_1")
        self.assertTrue(self.origin.fetch.call_args.kwargs["prune"])

    def test_dirty_checkout_is_reported_rather_than_clobbered(self) -> None:
        self.repo.is_dirty.return_value = True
        result = project_import_service.sync_project("prj_1")
        self.assertEqual(result["status"], "success")
        self.repo.git.merge.assert_not_called()
        self.assertIn("local changes", result["message"])

    def test_detached_head_is_reported_rather_than_moved(self) -> None:
        self.repo.head.is_detached = True
        result = project_import_service.sync_project("prj_1")
        self.repo.git.merge.assert_not_called()
        self.assertIn("detached HEAD", result["message"])

    def test_branch_without_upstream_is_reported(self) -> None:
        self.repo.active_branch.tracking_branch.return_value = None
        result = project_import_service.sync_project("prj_1")
        self.repo.git.merge.assert_not_called()
        self.assertIn("no upstream", result["message"])

    def test_sync_requires_a_pinned_host_key(self) -> None:
        """Sync built its own environment and kept `accept-new` after import
        moved to pinned keys. Sync is the operation that runs unattended and
        repeatedly, so it is the one an attacker has the most chances at."""
        project_import_service.sync_project("prj_1")
        env = self.origin.fetch.call_args.kwargs["env"]
        self.assertIn("StrictHostKeyChecking=yes", env["GIT_SSH_COMMAND"])
        self.assertNotIn("accept-new", env["GIT_SSH_COMMAND"])

    def test_sync_never_waits_on_a_credential_prompt(self) -> None:
        # No terminal is attached to a worker, so a prompt is a hung job.
        project_import_service.sync_project("prj_1")
        env = self.origin.fetch.call_args.kwargs["env"]
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
        self.assertIn("BatchMode=yes", env["GIT_SSH_COMMAND"])

    def test_sync_uses_the_same_environment_as_every_other_remote_call(self) -> None:
        # Built locally, it drifts. This is what let the policies diverge.
        project_import_service.sync_project("prj_1")
        env = self.origin.fetch.call_args.kwargs["env"]
        expected = project_import_service.git_env()
        self.assertEqual(env["GIT_SSH_COMMAND"], expected["GIT_SSH_COMMAND"])
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], expected["GIT_TERMINAL_PROMPT"])

    def test_sync_clears_legacy_in_tree_thumbnails(self) -> None:
        # A checkout carrying thumbnails from an older Prism cannot fast-forward
        # until they are gone.
        with mock.patch.object(
            project_import_service.derived_assets, "purge_legacy_in_tree_thumbnails"
        ) as purge:
            project_import_service.sync_project("prj_1")
        purge.assert_called_once()


class NoHostKeyPolicyIsWrittenByHand(unittest.TestCase):
    """The policy diverged twice, in two different modules, because each place
    that talked to a remote spelled out its own ssh options. Nothing outside
    git_env may name a host key policy at all."""

    #: app/ is a namespace package with no __file__, so anchor on a module in it.
    SOURCE_ROOT = Path(project_import_service.__file__).resolve().parents[1]

    def _matching_lines(self, needle: str, *, skip: tuple[str, ...] = ()) -> list[str]:
        found: list[str] = []
        for path in sorted(self.SOURCE_ROOT.rglob("*.py")):
            if path.name in skip:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for number, line in enumerate(text.splitlines(), start=1):
                if needle in line and not line.lstrip().startswith("#"):
                    found.append(f"{path.relative_to(self.SOURCE_ROOT)}:{number}")
        return found

    def test_only_git_env_sets_a_host_key_policy(self) -> None:
        offenders = self._matching_lines(
            "StrictHostKeyChecking",
            # git_env is the single definition; git_failures only matches on the
            # string when explaining a failure it did not cause.
            skip=("project_import_service.py", "git_failures.py"),
        )
        self.assertEqual(
            offenders,
            [],
            "call git_env() instead of writing an ssh host key policy inline",
        )

    def test_nothing_accepts_an_unknown_host_key(self) -> None:
        offenders = self._matching_lines("accept-new")
        self.assertEqual(offenders, [], "accept-new trusts whatever key answers first")


if __name__ == "__main__":
    unittest.main()
