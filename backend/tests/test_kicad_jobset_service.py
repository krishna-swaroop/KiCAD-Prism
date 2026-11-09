"""Characterization tests for the generic KiCad jobset execution seam."""

from __future__ import annotations

import datetime
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from git import Repo
from support.repo import git, git_env, init_repo

from app.services import git_remote_access, kicad_jobset_service, project_service
from app.services.job_runtime import JobResult
from app.services.kicad_tools import ToolResult
from tests.kicad_tool_fakes import FakeTool


class KicadJobsetServiceTests(unittest.TestCase):
    def _context(self) -> SimpleNamespace:
        return SimpleNamespace(
            check_cancelled=mock.Mock(),
            progress=mock.Mock(),
        )

    def _tool(self) -> FakeTool:
        return FakeTool(lambda args, **_: ToolResult(0, "first line\nsecond line\n"))

    def _repository(self) -> mock.Mock:
        repository = mock.Mock()
        repository.is_dirty.return_value = True
        repository.head.commit.hexsha = "generated-sha"
        repository.remote.return_value.push.return_value = [
            SimpleNamespace(flags=0, ERROR=1)
        ]
        return repository

    def test_repository_route_characterizes_argv_and_commit_message(self) -> None:
        context = self._context()
        tool = self._tool()
        repository = self._repository()
        fixed_time = datetime.datetime(2026, 8, 11, 12, 13, 14)

        with tempfile.TemporaryDirectory() as temporary:
            project_path = Path(temporary)
            jobset_path = project_path / "Outputs.kicad_jobset"
            jobset_path.write_text("{}", encoding="utf-8")

            with mock.patch.object(
                git_remote_access,
                "git_env",
                return_value={"GIT_TERMINAL_PROMPT": "0"},
            ) as git_env:
                result = kicad_jobset_service.execute_kicad_jobset(
                    context,
                    project_path=project_path,
                    jobset_path=jobset_path,
                    project_file="board.kicad_pro",
                    output_id="output-id",
                    workflow_type="manufacturing",
                    author="designer@example.com",
                    routing="repository",
                    tool=tool,
                    repository_factory=lambda _path: repository,
                    timestamp_factory=lambda: fixed_time,
                )

        expected_argv = [
            "kicad-cli",
            "jobset",
            "run",
            "-f",
            "Outputs.kicad_jobset",
            "--output",
            "output-id",
            "board.kicad_pro",
        ]
        self.assertEqual(["kicad-cli", *tool.calls[0]["args"]], expected_argv)
        self.assertEqual(tool.calls[0]["cwd"], str(project_path))
        self.assertTrue(tool.calls[0]["tee"])
        self.assertEqual(tool.calls[0]["timeout"], kicad_jobset_service.JOBSET_TIMEOUT_SECONDS)
        # The run polls the job's cancellation.
        self.assertIs(tool.cancel, context.check_cancelled)
        repository.is_dirty.assert_called_once_with(untracked_files=True, path=".")
        repository.git.add.assert_called_once_with("--", ".")
        repository.git.commit.assert_called_once_with(
            "--",
            ".",
            m=(
                "Generated manufacturing outputs - "
                "2026-08-11 12:13:14 by designer@example.com"
            ),
            author="KiCAD Prism <prism@example.com>",
        )
        repository.remote.assert_called_once_with(name="origin")
        repository.remote.return_value.push.assert_called_once_with(
            env={"GIT_TERMINAL_PROMPT": "0"}
        )
        git_env.assert_called_once_with()
        self.assertEqual(result.generated_commit, "generated-sha")
        self.assertEqual(result.warnings, ())
        self.assertEqual(result.argv, tuple(expected_argv))
        self.assertEqual(
            result.output,
            kicad_jobset_service.JobsetOutputMetadata(
                project_path=str(project_path),
                jobset_path=str(jobset_path),
                jobset_file="Outputs.kicad_jobset",
                project_file="board.kicad_pro",
                output_id="output-id",
                routing="repository",
            ),
        )

    def test_artifact_route_does_not_construct_or_mutate_a_repository(self) -> None:
        context = self._context()
        repository_factory = mock.Mock(side_effect=AssertionError("Git was used"))

        with tempfile.TemporaryDirectory() as temporary:
            project_path = Path(temporary)
            jobset_path = project_path / "Outputs.kicad_jobset"
            jobset_path.write_text("{}", encoding="utf-8")
            result = kicad_jobset_service.execute_kicad_jobset(
                context,
                project_path=project_path,
                jobset_path=jobset_path,
                project_file="board.kicad_pro",
                output_id="artifact-output",
                workflow_type="design",
                routing="artifact",
                tool=self._tool(),
                repository_factory=repository_factory,
            )

        repository_factory.assert_not_called()
        self.assertEqual(result.output.routing, "artifact")
        self.assertEqual(result.generated_commit, "")
        self.assertEqual(result.warnings, ())
        self.assertEqual(
            [call.kwargs["stage"] for call in context.progress.call_args_list],
            ["run-jobset"],
        )

    def test_legacy_handler_keeps_the_pre_change_job_result_shape(self) -> None:
        tool = self._tool()
        repository = self._repository()
        progress_updates: list[dict[str, object]] = []
        fixed_time = datetime.datetime(2026, 8, 11, 12, 13, 14)

        with tempfile.TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            (project_root / "board.kicad_pro").write_text("", encoding="utf-8")
            jobset = project_root / "Outputs.kicad_jobset"
            jobset.write_text("{}", encoding="utf-8")
            context = SimpleNamespace(
                payload={
                    "project_id": "project-1",
                    "workflow_type": "design",
                    "author": "designer@example.com",
                },
                check_cancelled=mock.Mock(),
                progress=lambda **values: progress_updates.append(values),
            )
            project = SimpleNamespace(path=str(project_root))

            with (
                mock.patch.object(
                    project_service.workspace,
                    "get_project_by_id",
                    return_value={"id": "project-1"},
                ),
                mock.patch.object(
                    project_service,
                    "_workspace_row_to_project",
                    return_value=project,
                ),
                mock.patch.object(
                    project_service.path_config_service,
                    "get_path_config",
                    return_value=SimpleNamespace(jobset="Outputs.kicad_jobset"),
                ),
                mock.patch.object(
                    project_service.path_config_service,
                    "resolve_paths",
                    return_value=SimpleNamespace(jobset_path=str(jobset)),
                ),
                mock.patch.object(kicad_jobset_service, "kicad_cli", return_value=tool),
                mock.patch.object(project_service, "Repo", return_value=repository),
                mock.patch.object(
                    git_remote_access,
                    "git_env",
                    return_value={"GIT_TERMINAL_PROMPT": "0"},
                ),
                mock.patch.object(
                    project_service.datetime,
                    "datetime",
                    SimpleNamespace(now=lambda: fixed_time),
                ),
            ):
                result = project_service.run_kicad_workflow_job_v3(context)

        self.assertEqual(
            result,
            JobResult(
                message="Workflow completed successfully",
                details={
                    "project_id": "project-1",
                    "workflow_type": "design",
                    "generated_commit": "generated-sha",
                    "warnings": [],
                },
            ),
        )
        self.assertEqual(progress_updates[-1]["stage"], "git-sync")

    def test_a_failed_or_expired_run_fails_the_workflow(self) -> None:
        from app.services.kicad_tools import ToolTimeout

        def expire(args, **_kwargs):
            raise ToolTimeout("kicad-cli timed out after 3600s: jobset run -f", 3600)

        for tool, message in (
            (FakeTool(lambda args, **_: ToolResult(2)), "exited with code 2"),
            (FakeTool(expire), "timed out after 3600s"),
        ):
            with tempfile.TemporaryDirectory() as temporary, self.assertRaisesRegex(RuntimeError, message):
                kicad_jobset_service.execute_kicad_jobset(
                    self._context(),
                    project_path=temporary,
                    jobset_path=Path(temporary) / "Outputs.kicad_jobset",
                    project_file="board.kicad_pro",
                    output_id="o",
                    workflow_type="design",
                    routing="artifact",
                    tool=tool,
                )


    def test_multi_project_import_commits_only_its_own_subdirectory(self) -> None:
        # #985: a multi-project import's checkout is a subdirectory of the
        # clone. Opening Repo() on it failed, so outputs were never committed.
        def write_outputs(args, *, cwd, **_kwargs):
            outputs = Path(cwd) / "Design-Outputs"
            outputs.mkdir()
            (outputs / "board.pdf").write_text("pdf", encoding="utf-8")
            (Path(cwd) / "board.kicad_prl").write_text("rewritten", encoding="utf-8")
            return ToolResult(0)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            remote = root / "remote.git"
            git(None, "init", "-q", "--bare", "-b", "main", str(remote))
            clone = root / "clone"
            board = {"board.kicad_pro": "{}", "board.kicad_prl": "{}"}
            init_repo(
                clone,
                {
                    **{f"boards/alpha/{name}": body for name, body in board.items()},
                    **{f"boards/beta/{name}": body for name, body in board.items()},
                    "boards/alpha/Outputs.kicad_jobset": "{}",
                },
            )
            git(clone, "remote", "add", "origin", str(remote))
            git(clone, "push", "-q", "-u", "origin", "main")
            project = clone / "boards" / "alpha"
            (clone / "boards" / "beta" / "board.kicad_prl").write_text("sibling edit", encoding="utf-8")

            with mock.patch.object(git_remote_access, "git_env", return_value=git_env()):
                result = kicad_jobset_service.execute_kicad_jobset(
                    self._context(),
                    project_path=project,
                    jobset_path=project / "Outputs.kicad_jobset",
                    project_file="board.kicad_pro",
                    output_id="o",
                    workflow_type="design",
                    routing="repository",
                    repository_root=clone,
                    tool=FakeTool(write_outputs),
                    repository_factory=Repo,
                )

            self.assertEqual(result.warnings, ())
            self.assertEqual(git(remote, "rev-parse", "main"), result.generated_commit)
            committed = git(clone, "show", "--name-only", "--format=", "HEAD").split()
            self.assertEqual(
                sorted(committed),
                ["boards/alpha/Design-Outputs/board.pdf", "boards/alpha/board.kicad_prl"],
            )
            self.assertEqual(git(clone, "status", "--porcelain"), "M boards/beta/board.kicad_prl")


if __name__ == "__main__":
    unittest.main()
