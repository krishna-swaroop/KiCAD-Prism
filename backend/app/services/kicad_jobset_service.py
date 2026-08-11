"""Execute KiCad jobset outputs with explicit output routing.

The service owns the KiCad CLI seam and the legacy repository synchronization
behavior. Callers choose whether generated files remain as an artifact in the
working tree or are synchronized through the existing repository workflow.
"""

from __future__ import annotations

import datetime
import os
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal

from git import Repo

from app.services.job_runtime import JobContext


JobsetRouting = Literal["artifact", "repository"]
RepositoryFactory = Callable[[str], Repo]
TimestampFactory = Callable[[], datetime.datetime]


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


def find_kicad_cli_path() -> str:
    """Return the KiCad CLI path using the existing Prism lookup convention."""

    mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    if os.path.exists(mac_path):
        return mac_path
    return "kicad-cli"


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
    cli_path: str | None = None,
    repository_factory: RepositoryFactory | None = None,
    timestamp_factory: TimestampFactory | None = None,
) -> JobsetExecutionResult:
    """Run one KiCad jobset output and route its generated files.

    ``repository`` routing retains the pre-R2 add/commit/push behavior. The
    ``artifact`` route deliberately does not construct a Git repository or run
    any Git mutation; the generated files remain available under the project
    path for a later artifact consumer.
    """

    if routing not in {"artifact", "repository"}:
        raise ValueError(f"Unknown jobset routing: {routing}")

    project_path_text = os.fspath(project_path)
    jobset_path_text = os.fspath(jobset_path)
    jobset_file = jobset_file_argument(project_path_text, jobset_path_text)
    command = [
        cli_path or find_kicad_cli_path(),
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

    print(f"Running: {shlex.join(command)}", flush=True)
    context.progress(
        stage="run-jobset",
        message=f"Generating {workflow_type} outputs",
        percent=15,
        force=True,
    )
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=project_path_text,
        text=True,
        bufsize=1,
    )
    if process.stdout is not None:
        for line in process.stdout:
            line = line.rstrip()
            if line:
                print(line, flush=True)
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"KiCad workflow exited with code {return_code}")

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
        repo = repository_constructor(project_path)
        if repo.is_dirty(untracked_files=True):
            repo.git.add(".")
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
                m=commit_message,
                author="KiCAD Prism <prism@example.com>",
            )
            generated_commit = str(repo.head.commit.hexsha)
            context.check_cancelled()
            # Share the import path's environment rather than rolling a second
            # one: this keeps the existing GitHub token rewrite and strict
            # host-key behavior for repository-routed workflow output.
            from app.services.project_import_service import git_env

            push_info = repo.remote(name="origin").push(env=git_env())
            for info in push_info:
                if info.flags & info.ERROR:
                    raise RuntimeError(f"Push failed: {info.summary}")
            print(f"Generated commit {generated_commit} pushed successfully", flush=True)
        else:
            print("No generated changes detected to commit", flush=True)
    except Exception as error:
        warning = f"Git sync warning: {error}"
        warnings.append(warning)
        print(warning, flush=True)
    return generated_commit, warnings
