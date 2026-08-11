"""Characterization tests for the generic KiCad jobset execution seam."""

from __future__ import annotations

import datetime
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import kicad_jobset_service, project_import_service, project_service
from app.services.job_runtime import JobResult


class KicadJobsetServiceTests(unittest.TestCase):
    def _context(self) -> SimpleNamespace:
        return SimpleNamespace(
            check_cancelled=mock.Mock(),
            progress=mock.Mock(),
        )

    def _process(self) -> mock.Mock:
        process = mock.Mock()
        process.stdout = ["first line\n", "second line\n"]
        process.wait.return_value = 0
        return process

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
        process = self._process()
        repository = self._repository()
        fixed_time = datetime.datetime(2026, 8, 11, 12, 13, 14)

        with tempfile.TemporaryDirectory() as temporary:
            project_path = Path(temporary)
            jobset_path = project_path / "Outputs.kicad_jobset"
            jobset_path.write_text("{}", encoding="utf-8")

            with (
                mock.patch.object(
                    kicad_jobset_service.subprocess,
                    "Popen",
                    return_value=process,
                ) as popen,
                mock.patch.object(
                    project_import_service,
                    "git_env",
                    return_value={"GIT_TERMINAL_PROMPT": "0"},
                ) as git_env,
            ):
                result = kicad_jobset_service.execute_kicad_jobset(
                    context,
                    project_path=project_path,
                    jobset_path=jobset_path,
                    project_file="board.kicad_pro",
                    output_id="output-id",
                    workflow_type="manufacturing",
                    author="designer@example.com",
                    routing="repository",
                    cli_path="kicad-cli",
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
        self.assertEqual(popen.call_args.args[0], expected_argv)
        self.assertEqual(
            popen.call_args.kwargs,
            {
                "stdout": kicad_jobset_service.subprocess.PIPE,
                "stderr": kicad_jobset_service.subprocess.STDOUT,
                "cwd": str(project_path),
                "text": True,
                "bufsize": 1,
            },
        )
        repository.git.add.assert_called_once_with(".")
        repository.git.commit.assert_called_once_with(
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
        process = self._process()
        repository_factory = mock.Mock(side_effect=AssertionError("Git was used"))

        with tempfile.TemporaryDirectory() as temporary:
            project_path = Path(temporary)
            jobset_path = project_path / "Outputs.kicad_jobset"
            jobset_path.write_text("{}", encoding="utf-8")
            with mock.patch.object(
                kicad_jobset_service.subprocess,
                "Popen",
                return_value=process,
            ):
                result = kicad_jobset_service.execute_kicad_jobset(
                    context,
                    project_path=project_path,
                    jobset_path=jobset_path,
                    project_file="board.kicad_pro",
                    output_id="artifact-output",
                    workflow_type="design",
                    routing="artifact",
                    cli_path="kicad-cli",
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
        process = self._process()
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
                mock.patch.object(
                    project_service,
                    "_find_cli_path",
                    return_value="kicad-cli",
                ),
                mock.patch.object(
                    project_service.subprocess,
                    "Popen",
                    return_value=process,
                ),
                mock.patch.object(project_service, "Repo", return_value=repository),
                mock.patch.object(
                    project_import_service,
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


if __name__ == "__main__":
    unittest.main()
