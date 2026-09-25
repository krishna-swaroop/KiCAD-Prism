"""Cancellable Git transport for Release Studio configuration publication.

``save_configuration`` authors in a temporary clone and pushes with a lease.
The Git calls used to block indefinitely with no deadline, so a hung fetch or
push could occupy a worker until the lease expired. This module runs those
commands with a timeout and observes job cancellation while they are blocked.
Force-with-lease, author identity, credentials and branch selection stay with
the caller.
"""

from __future__ import annotations

import os
import signal
import subprocess
import time
from collections.abc import Callable, Mapping
from pathlib import Path

GIT_COMMAND_TIMEOUT_SECONDS = 60
_POLL_SECONDS = 0.1
_CLEANUP_TIMEOUT_SECONDS = 2


class GitPublishError(RuntimeError):
    """A Git publication command timed out or could not be started."""


def run_git(
    *args: str,
    cwd: Path,
    env: Mapping[str, str] | None = None,
    timeout_seconds: float | None = None,
    check_cancelled: Callable[[], None] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run one ``git -C <cwd> ...`` command until it finishes, times out, or is cancelled."""

    command = ["git", "-C", str(cwd), *args]
    environment = dict(env) if env is not None else None
    limit = GIT_COMMAND_TIMEOUT_SECONDS if timeout_seconds is None else float(timeout_seconds)

    if check_cancelled is not None:
        check_cancelled()

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=environment,
            start_new_session=True,
            close_fds=True,
        )
    except OSError as error:
        raise GitPublishError(f"git could not be executed: {error}") from error

    try:
        deadline = time.monotonic() + max(limit, 0.0)
        while True:
            if check_cancelled is not None:
                check_cancelled()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise GitPublishError(
                    f"git {' '.join(args)} timed out after {limit}s"
                )
            try:
                stdout, stderr = process.communicate(timeout=min(_POLL_SECONDS, remaining))
                return subprocess.CompletedProcess(
                    command, process.returncode or 0, stdout or "", stderr or ""
                )
            except subprocess.TimeoutExpired:
                continue
    except BaseException:
        try:
            _terminate(process)
        except BaseException:
            # Cleanup must never replace the exception that caused the
            # command to unwind.
            pass
        raise


def _terminate(process: subprocess.Popen[str]) -> None:
    """Terminate the command group and reap it without masking its exception."""

    _kill_process_group(process)
    try:
        process.communicate(timeout=_CLEANUP_TIMEOUT_SECONDS)
        return
    except BaseException:
        # A failed communicate can leave the child's pipes unusable. Wait
        # directly below so the process is still reaped.
        pass

    _kill_process_group(process)
    try:
        process.wait(timeout=_CLEANUP_TIMEOUT_SECONDS)
    except BaseException:
        # A process that outlives the first bounded wait gets one final
        # bounded kill-and-reap attempt. Any cleanup failure is handled by the
        # caller's exception-preserving guard.
        _kill_process_group(process)
        try:
            process.wait(timeout=_CLEANUP_TIMEOUT_SECONDS)
        except BaseException:
            pass


def _kill_process_group(process: subprocess.Popen[str]) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except BaseException:
        try:
            process.kill()
        except BaseException:
            pass
