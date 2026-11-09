"""Sync must treat Prism's checkout as a read-only mirror.

The previous implementation called `origin.pull()`, which merges. Combined with
Prism writing generated thumbnails into the tree, that could create merge
commits in a repository the team considers the source of truth, or fail outright
once upstream touched the same path.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from git import GitCommandError

from app.services import job_service, path_config_service, project_import_service, project_service
from app.services import event_log
from app.services.job_runtime import RetryableJobError
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from support.postgres import requires_scratch_postgres, scratch_schema
from support.repo import git, set_identity  # noqa: E402


class SyncFastForwardsOnly(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.checkout = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)

        self.repo = mock.Mock()
        self.repo.working_tree_dir = str(self.checkout)
        self.repo.head.is_detached = False
        self.repo.is_dirty.return_value = False
        self.repo.index.diff.return_value = []
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

    def test_sync_fetches_with_prune_and_only_fast_forwards(self) -> None:
        result = project_import_service.sync_project("prj_1")
        self.assertEqual(result["status"], "success")
        # `pull` fetches *and merges*; a mirror must not merge.
        self.origin.pull.assert_not_called()
        self.assertTrue(self.origin.fetch.call_args.kwargs["prune"])
        self.repo.git.merge.assert_called_once_with("--ff-only", "origin/main")

    def test_background_fetch_does_not_change_the_checkout(self) -> None:
        with mock.patch.object(
            project_import_service.derived_assets, "purge_legacy_in_tree_thumbnails"
        ) as purge:
            result = project_import_service.sync_project("prj_1", fetch_only=True)
        self.assertEqual(result["status"], "success")
        self.origin.fetch.assert_called_once()
        self.repo.git.merge.assert_not_called()
        purge.assert_not_called()

    def test_background_fetch_job_is_separate_and_lower_priority(self) -> None:
        with mock.patch.object(
            job_service.jobs, "enqueue", return_value={"job_id": "job-1"}
        ) as enqueue:
            project_import_service.start_sync_job("prj_1", fetch_only=True)
        self.assertEqual(enqueue.call_args.args[0], "project_fetch")
        self.assertEqual(enqueue.call_args.args[1]["fetch_only"], True)
        self.assertEqual(
            enqueue.call_args.kwargs["locks"],
            [{"key": "repository:repo_1", "mode": "read"}],
        )
        self.assertEqual(enqueue.call_args.kwargs["priority"], 200)

    def test_fetch_uses_the_configured_timeout(self) -> None:
        with mock.patch.object(
            project_import_service.settings,
            "PRISM_GIT_FETCH_TIMEOUT_SECONDS",
            42,
        ):
            project_import_service.sync_project("prj_1", fetch_only=True)
        self.assertEqual(
            self.origin.fetch.call_args.kwargs["kill_after_timeout"], 42
        )

    def test_fetch_defaults_git_low_speed_abort_without_overriding_it(self) -> None:
        project_import_service.sync_project("prj_1", fetch_only=True)
        env = self.origin.fetch.call_args.kwargs["env"]
        self.assertEqual(env["GIT_HTTP_LOW_SPEED_LIMIT"], "1000")
        self.assertEqual(env["GIT_HTTP_LOW_SPEED_TIME"], "60")

        with mock.patch.dict(
            "os.environ",
            {"GIT_HTTP_LOW_SPEED_LIMIT": "2048", "GIT_HTTP_LOW_SPEED_TIME": "120"},
        ):
            project_import_service.sync_project("prj_1", fetch_only=True)
        env = self.origin.fetch.call_args.kwargs["env"]
        self.assertEqual(env["GIT_HTTP_LOW_SPEED_LIMIT"], "2048")
        self.assertEqual(env["GIT_HTTP_LOW_SPEED_TIME"], "120")

    def test_a_timed_out_fetch_is_a_retryable_job_error(self) -> None:
        self.origin.fetch.side_effect = GitCommandError(
            "git fetch",
            128,
            stderr='Timeout: the command "git fetch" did not complete in 300 secs.',
        )
        context = SimpleNamespace(
            payload={"project_id": "prj_1", "fetch_only": True},
            check_cancelled=mock.Mock(),
            progress=lambda **values: None,
        )
        with mock.patch.object(
            project_import_service.settings,
            "PRISM_GIT_FETCH_TIMEOUT_SECONDS",
            300,
        ):
            with self.assertRaisesRegex(
                RetryableJobError, "git fetch timed out after 300 s"
            ) as raised:
                project_import_service.run_project_sync_job_v3(context)
        self.assertEqual(raised.exception.code, "git-fetch-timeout")

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

    def test_sync_fetches_with_the_shared_unattended_pinned_environment(self) -> None:
        # Sync runs unattended and repeatedly, so it is the remote call an
        # attacker gets the most chances at. It once built its own environment
        # and kept `accept-new` after import moved to pinned keys; a prompt with
        # no terminal attached is a hung job.
        project_import_service.sync_project("prj_1")
        env = self.origin.fetch.call_args.kwargs["env"]
        expected = project_import_service.git_remote_access.git_env()
        self.assertEqual(env["GIT_SSH_COMMAND"], expected["GIT_SSH_COMMAND"])
        self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
        self.assertIn("StrictHostKeyChecking=yes", env["GIT_SSH_COMMAND"])
        self.assertIn("BatchMode=yes", env["GIT_SSH_COMMAND"])
        self.assertNotIn("accept-new", env["GIT_SSH_COMMAND"])

    def test_sync_clears_legacy_in_tree_thumbnails(self) -> None:
        # A checkout carrying thumbnails from an older Prism cannot fast-forward
        # until they are gone.
        with mock.patch.object(
            project_import_service.derived_assets, "purge_legacy_in_tree_thumbnails"
        ) as purge:
            project_import_service.sync_project("prj_1")
        purge.assert_called_once()


class EditingSettingsKeepsSyncFastForwarding(unittest.TestCase):
    """Editing a project's settings in Prism must not dirty the checkout.

    The settings routes used to write `.prism.json` into the server-managed
    checkout. Sync treats a dirty tracked tree as someone's local edit and
    stops fast-forwarding, so one rename froze the project at that commit.
    """

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        root = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)
        self.upstream = root / "upstream.git"
        git(root, "init", "-q", "--bare", "-b", "main", str(self.upstream))
        self.author = root / "author"
        git(root, "clone", "-q", str(self.upstream), str(self.author))
        set_identity(self.author)
        (self.author / "board.kicad_pro").write_text("{}", encoding="utf-8")
        (self.author / ".prism.json").write_text(
            json.dumps({"paths": {"designOutputs": "Design-Outputs"}}), encoding="utf-8"
        )
        git(self.author, "add", "-A")
        git(self.author, "commit", "-qm", "seed")
        git(self.author, "push", "-q", "origin", "HEAD:main")
        self.checkout = root / "checkout"
        git(root, "clone", "-q", str(self.upstream), str(self.checkout))
        self.row = {
            "id": "prj_1",
            "repo_id": "repo_1",
            "import_type": "single",
            "path": str(self.checkout),
            "parent_repo_path": str(self.checkout),
            "name": "board",
            "relative_path": ".",
            "project_file_rel": "board.kicad_pro",
            "path_settings": None,
        }
        path_config_service.clear_config_cache()
        self.addCleanup(path_config_service.clear_config_cache)
        for patch in (
            mock.patch.object(project_import_service.workspace, "get_project_by_id", return_value=self.row),
            mock.patch.object(project_import_service.workspace, "update_project", return_value=True),
            mock.patch.object(project_import_service.workspace, "update_repository_synced"),
            mock.patch.object(project_import_service, "refresh_project_assets"),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def test_a_settings_edit_does_not_block_the_next_fast_forward(self) -> None:
        project = project_service._workspace_row_to_project(self.row)
        config = project_service.path_config_for(project)
        config.designOutputs = "Outputs"
        project_service.save_path_config_for(project, config)

        (self.author / "board.kicad_sch").write_text("(kicad_sch)", encoding="utf-8")
        git(self.author, "add", "-A")
        git(self.author, "commit", "-qm", "upstream work")
        git(self.author, "push", "-q", "origin", "HEAD:main")
        upstream_head = git(self.author, "rev-parse", "HEAD")

        result = project_import_service.sync_project("prj_1")

        self.assertEqual(result["status"], "success", result)
        self.assertEqual(git(self.checkout, "rev-parse", "HEAD"), upstream_head, result["message"])
        self.assertEqual(git(self.checkout, "status", "--porcelain"), "")


class KicadLocalStateDoesNotBlockSync(unittest.TestCase):
    """kicad-cli's edits to a tracked ``.kicad_prl`` must not freeze the checkout (#1122).

    The import's thumbnail render let kicad-cli 10 rewrite the project's local
    settings in the checkout. Sync then took the checkout for hand-edited and
    never fast-forwarded again.
    """

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        root = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)
        self.upstream = root / "upstream.git"
        git(root, "init", "-q", "--bare", "-b", "main", str(self.upstream))
        self.author = root / "author"
        git(root, "clone", "-q", str(self.upstream), str(self.author))
        set_identity(self.author)
        (self.author / "board.kicad_pro").write_text("{}", encoding="utf-8")
        (self.author / "board.kicad_prl").write_text('{"board": {"visible_layers": "fff"}}', encoding="utf-8")
        (self.author / "board.kicad_sch").write_text("(kicad_sch)", encoding="utf-8")
        git(self.author, "add", "-A")
        git(self.author, "commit", "-qm", "seed")
        git(self.author, "push", "-q", "origin", "HEAD:main")
        self.checkout = root / "checkout"
        git(root, "clone", "-q", str(self.upstream), str(self.checkout))
        row = {
            "id": "prj_1",
            "repo_id": "repo_1",
            "import_type": "single",
            "path": str(self.checkout),
            "parent_repo_path": str(self.checkout),
        }
        for patch in (
            mock.patch.object(project_import_service.workspace, "get_project_by_id", return_value=row),
            mock.patch.object(project_import_service.workspace, "update_repository_synced"),
            mock.patch.object(project_import_service, "refresh_project_assets"),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def _advance_upstream(self) -> str:
        (self.author / "board.kicad_sch").write_text("(kicad_sch (version 2))", encoding="utf-8")
        git(self.author, "add", "-A")
        git(self.author, "commit", "-qm", "upstream work")
        git(self.author, "push", "-q", "origin", "HEAD:main")
        return git(self.author, "rev-parse", "HEAD")

    def test_a_rewritten_kicad_prl_is_put_back_and_the_checkout_fast_forwards(self) -> None:
        (self.checkout / "board.kicad_prl").write_text('{"board": {"visible_layers": "000"}}', encoding="utf-8")
        upstream_head = self._advance_upstream()

        result = project_import_service.sync_project("prj_1")

        self.assertEqual(result["status"], "success", result)
        self.assertEqual(git(self.checkout, "rev-parse", "HEAD"), upstream_head, result["message"])
        self.assertEqual(git(self.checkout, "status", "--porcelain"), "")

    def test_any_other_local_change_still_blocks_the_fast_forward(self) -> None:
        (self.checkout / "board.kicad_prl").write_text('{"board": {"visible_layers": "000"}}', encoding="utf-8")
        (self.checkout / "board.kicad_sch").write_text("(kicad_sch (hand edit))", encoding="utf-8")
        previous = git(self.checkout, "rev-parse", "HEAD")
        self._advance_upstream()

        result = project_import_service.sync_project("prj_1")

        self.assertIn("local changes", result["message"])
        self.assertEqual(git(self.checkout, "rev-parse", "HEAD"), previous)
        self.assertIn("visible_layers\": \"000", (self.checkout / "board.kicad_prl").read_text(encoding="utf-8"))


@requires_scratch_postgres("the revision.synced producer")
class SyncAppendsRevisionSynced(unittest.TestCase):
    """A fast-forward is a revision event; a fetch that moves nothing is not."""

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        root = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)
        self.upstream = root / "upstream.git"
        git(root, "init", "-q", "--bare", "-b", "main", str(self.upstream))
        self.author = root / "author"
        git(root, "clone", "-q", str(self.upstream), str(self.author))
        set_identity(self.author)
        (self.author / "board.kicad_pro").write_text("{}", encoding="utf-8")
        git(self.author, "add", "-A")
        git(self.author, "commit", "-qm", "seed")
        git(self.author, "push", "-q", "origin", "HEAD:main")
        self.checkout = root / "checkout"
        git(root, "clone", "-q", str(self.upstream), str(self.checkout))
        self.row = {
            "id": "prj_1",
            "repo_id": "repo_1",
            "import_type": "single",
            "path": str(self.checkout),
            "parent_repo_path": str(self.checkout),
            "name": "board",
            "relative_path": ".",
            "project_file_rel": "board.kicad_pro",
            "path_settings": None,
        }
        path_config_service.clear_config_cache()
        self.addCleanup(path_config_service.clear_config_cache)
        self.events = scratch_schema(self, "sync_events", ledgers=(WORKSPACE_LEDGER,))
        for patch_ in (
            mock.patch.object(project_import_service.workspace, "get_project_by_id", return_value=self.row),
            mock.patch.object(project_import_service.workspace, "update_project", return_value=True),
            mock.patch.object(project_import_service.workspace, "update_repository_synced"),
            mock.patch.object(project_import_service, "refresh_project_assets"),
            mock.patch.object(event_log, "connect", self.events.connection),
        ):
            patch_.start()
            self.addCleanup(patch_.stop)

    def _advance_upstream(self) -> str:
        (self.author / "board.kicad_sch").write_text("(kicad_sch)", encoding="utf-8")
        git(self.author, "add", "-A")
        git(self.author, "commit", "-qm", "upstream work")
        git(self.author, "push", "-q", "origin", "HEAD:main")
        return git(self.author, "rev-parse", "HEAD")

    def _events(self):
        with self.events.connect() as conn:
            return conn.execute("SELECT kind, project_id, payload FROM ws_events ORDER BY id").fetchall()

    def test_a_fast_forward_appends_revision_synced_with_both_commits(self) -> None:
        previous = git(self.checkout, "rev-parse", "HEAD")
        head = self._advance_upstream()

        result = project_import_service.sync_project("prj_1")

        self.assertEqual(result["status"], "success", result)
        events = self._events()
        self.assertEqual([(event["kind"], event["project_id"]) for event in events],
                         [("revision.synced", "prj_1")])
        self.assertEqual(
            events[0]["payload"],
            {"branch": "main", "commit": head, "previousCommit": previous},
        )

    def test_a_fetch_that_moves_nothing_appends_no_event(self) -> None:
        self.assertEqual(project_import_service.sync_project("prj_1")["status"], "success")
        self.assertEqual(self._events(), [])


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
            skip=("git_remote_access.py", "git_failures.py"),
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
