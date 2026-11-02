"""Execute KiCad jobset outputs with explicit output routing.

The service owns the KiCad CLI seam and the legacy repository synchronization
behavior. Callers choose whether generated files remain as an artifact in the
working tree or are synchronized through the existing repository workflow.
"""

from __future__ import annotations

import datetime
import os
import shlex
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal

from git import Repo

from app.services.job_runtime import JobContext
from app.services.kicad_tools import KicadTool, ToolError, kicad_cli


JobsetRouting = Literal["artifact", "repository"]
RepositoryFactory = Callable[[str], Repo]
TimestampFactory = Callable[[], datetime.datetime]

#: A jobset runs every output it lists (plots, renders, STEP); bounded so a
#: wedged run frees its worker slot instead of holding it forever.
JOBSET_TIMEOUT_SECONDS = 3600


@dataclass(frozen=True)
class JobsetOutputMetadata:
    """The execution identity needed by later artifact consumers.

    This is intentionally in-memory metadata. R2 does not create a persistence
    record or inventory generated files.
    """

    project_path: str
    jobset_path: str
    jobset_file: str
    project_file: str
    output_id: str
    routing: JobsetRouting


@dataclass(frozen=True)
class JobsetExecutionResult:
    """The result of one KiCad jobset execution and its selected route."""

    output: JobsetOutputMetadata
    argv: tuple[str, ...]
    generated_commit: str = ""
    warnings: tuple[str, ...] = ()


def jobset_file_argument(project_path: str | Path, jobset_path: str | Path) -> str:
    """Return the jobset argument exactly as the legacy workflow did."""

    project_root_abs = os.path.abspath(os.fspath(project_path))
    jobset_abs = os.path.abspath(os.fspath(jobset_path))
    try:
        if os.path.commonpath([project_root_abs, jobset_abs]) == project_root_abs:
            return os.path.relpath(jobset_abs, project_root_abs)
    except ValueError:
        pass
    return os.fspath(jobset_path)


def execute_kicad_jobset(
    context: JobContext,
    *,
    project_path: str | Path,
    jobset_path: str | Path,
    project_file: str,
    output_id: str,
    workflow_type: str,
    author: str = "anonymous",
    routing: JobsetRouting = "repository",
    repository_root: str | Path | None = None,
    tool: KicadTool | None = None,
    repository_factory: RepositoryFactory | None = None,
    timestamp_factory: TimestampFactory | None = None,
) -> JobsetExecutionResult:
    """Run one KiCad jobset output and route its generated files.

    ``repository`` routing retains the pre-R2 add/commit/push behavior. The
    ``artifact`` route deliberately does not construct a Git repository or run
    any Git mutation; the generated files remain available under the project
    path for a later artifact consumer.

    ``repository_root`` is the clone that holds the project when the project is
    a subdirectory of it (a multi-project import); it defaults to the project
    path. Only the project's own directory is staged and committed, so files of
    sibling projects in the same repository are left alone.
    """

    if routing not in {"artifact", "repository"}:
        raise ValueError(f"Unknown jobset routing: {routing}")

    project_path_text = os.fspath(project_path)
    jobset_path_text = os.fspath(jobset_path)
    jobset_file = jobset_file_argument(project_path_text, jobset_path_text)
    tool = (tool or kicad_cli()).with_cancel(context.check_cancelled)
    args = [
        "jobset",
        "run",
        "-f",
        jobset_file,
        "--output",
        output_id,
        project_file,
    ]
    output = JobsetOutputMetadata(
        project_path=project_path_text,
        jobset_path=jobset_path_text,
        jobset_file=jobset_file,
        project_file=project_file,
        output_id=output_id,
        routing=routing,
    )

    try:
        command = [tool.executable(), *args]
    except ToolError as exc:
        raise RuntimeError(f"KiCad workflow could not start: {exc}") from exc
    print(f"Running: {shlex.join(command)}", flush=True)
    context.progress(
        stage="run-jobset",
        message=f"Generating {workflow_type} outputs",
        percent=15,
        force=True,
    )
    try:
        result = tool.run(args, cwd=project_path_text, timeout=JOBSET_TIMEOUT_SECONDS, tee=True)
    except ToolError as exc:
        raise RuntimeError(f"KiCad workflow failed: {exc}") from exc
    if not result.ok:
        raise RuntimeError(f"KiCad workflow exited with code {result.returncode}")

    context.check_cancelled()
    generated_commit = ""
    warnings: list[str] = []
    if routing == "repository":
        context.progress(
            stage="git-sync",
            message="Synchronizing generated outputs",
            percent=90,
            force=True,
        )
        generated_commit, warnings = _sync_repository(
            project_path_text,
            repository_root=os.fspath(repository_root or project_path_text),
            workflow_type=workflow_type,
            author=author,
            repository_factory=repository_factory,
            timestamp_factory=timestamp_factory,
            context=context,
        )

    return JobsetExecutionResult(
        output=output,
        argv=tuple(command),
        generated_commit=generated_commit,
        warnings=tuple(warnings),
    )


def _sync_repository(
    project_path: str,
    *,
    repository_root: str,
    workflow_type: str,
    author: str,
    repository_factory: RepositoryFactory | None,
    timestamp_factory: TimestampFactory | None,
    context: JobContext,
) -> tuple[str, list[str]]:
    """Preserve the legacy generated-output commit and push sequence."""

    warnings: list[str] = []
    generated_commit = ""
    try:
        repository_constructor = (
            repository_factory if repository_factory is not None else Repo
        )
        project_subpath = os.path.relpath(
            os.path.realpath(project_path), os.path.realpath(repository_root)
        )
        if project_subpath == ".." or project_subpath.startswith(f"..{os.sep}"):
            raise ValueError(
                f"Project {project_path} is not inside its repository {repository_root}"
            )
        repo = repository_constructor(repository_root)
        if repo.is_dirty(untracked_files=True, path=project_subpath):
            repo.git.add("--", project_subpath)
            now_factory = (
                timestamp_factory
                if timestamp_factory is not None
                else datetime.datetime.now
            )
            now = now_factory()
            timestamp = now.strftime("%Y-%m-%d %H:%M:%S")
            commit_message = (
                f"Generated {workflow_type} outputs - {timestamp} by {author}"
            )
            repo.git.commit(
                "--",
                project_subpath,
                m=commit_message,
                author="KiCAD Prism <prism@example.com>",
            )
            generated_commit = str(repo.head.commit.hexsha)
            context.check_cancelled()
            # Share the import path's environment rather than rolling a second
            # one: this keeps the existing GitHub token rewrite and strict
            # host-key behavior for repository-routed workflow output.
            from app.services.git_remote_access import git_env

            push_info = repo.remote(name="origin").push(env=git_env())
            for info in push_info:
                if info.flags & info.ERROR:
                    raise RuntimeError(f"Push failed: {info.summary}")
            print(f"Generated commit {generated_commit} pushed successfully", flush=True)
        else:
            print("No generated changes detected to commit", flush=True)
    except Exception as error:
        # Some Git errors (InvalidGitRepositoryError) carry only a path.
        warning = f"Git sync warning: {type(error).__name__}: {error}"
        warnings.append(warning)
        print(warning, flush=True)
    return generated_commit, warnings
