from __future__ import annotations

import os
import signal
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.release_studio.git_publish import GitPublishError, run_git
from app.services.job_runtime import JobCancelled


class GitPublishTransportTests(unittest.TestCase):
    def test_pre_cancellation_does_not_spawn_git(self) -> None:
        def cancel() -> None:
            raise JobCancelled("stop before launch")

        with tempfile.TemporaryDirectory() as tmp:
            with patch("app.release_studio.git_publish.subprocess.Popen") as popen:
                with self.assertRaises(JobCancelled):
                    run_git("status", cwd=Path(tmp), check_cancelled=cancel)

            popen.assert_not_called()

    def test_a_blocked_command_times_out(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = {**os.environ, "PATH": f"{_sleeping_git_bin(root)}{os.pathsep}{os.environ['PATH']}"}
            with self.assertRaisesRegex(GitPublishError, "timed out"):
                run_git("status", cwd=root, env=env, timeout_seconds=0.4)

    def test_unexpected_cancellation_error_kills_and_reaps_command(self) -> None:
        calls = {"n": 0}

        def cancel() -> None:
            calls["n"] += 1
            if calls["n"] > 1:
                raise RuntimeError("job database unavailable")

        processes: list[subprocess.Popen[str]] = []
        real_popen = subprocess.Popen

        def tracking_popen(*args: object, **kwargs: object) -> subprocess.Popen[str]:
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = {**os.environ, "PATH": f"{_sleeping_git_bin(root)}{os.pathsep}{os.environ['PATH']}"}
            with patch(
                "app.release_studio.git_publish.subprocess.Popen",
                side_effect=tracking_popen,
            ):
                with self.assertRaisesRegex(RuntimeError, "job database unavailable"):
                    run_git("status", cwd=root, env=env, timeout_seconds=10, check_cancelled=cancel)

        self.assertGreaterEqual(calls["n"], 2)
        self.assertEqual(len(processes), 1)
        self.assertEqual(processes[0].returncode, -signal.SIGKILL)
        self.assertEqual(processes[0].poll(), -signal.SIGKILL)

    def test_cancellation_kills_a_blocked_command(self) -> None:
        calls = {"n": 0}

        def cancel() -> None:
            calls["n"] += 1
            if calls["n"] > 1:
                raise JobCancelled("stop")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = {**os.environ, "PATH": f"{_sleeping_git_bin(root)}{os.pathsep}{os.environ['PATH']}"}
            with self.assertRaises(JobCancelled):
                run_git("status", cwd=root, env=env, timeout_seconds=10, check_cancelled=cancel)

    def test_communicate_error_is_cleaned_without_masking_original_error(self) -> None:
        process = _CommunicateFailureProcess()
        with patch(
            "app.release_studio.git_publish.subprocess.Popen",
            return_value=process,
        ), patch("app.release_studio.git_publish.os.killpg") as killpg:
            with self.assertRaisesRegex(RuntimeError, "pipe failed"):
                run_git("status", cwd=Path("."), timeout_seconds=1)

        killpg.assert_called_once_with(process.pid, signal.SIGKILL)
        self.assertTrue(process.reaped)
        self.assertEqual(len(process.communicate_timeouts), 2)

    def test_cleanup_stays_bounded_when_kill_cannot_reap(self) -> None:
        process = _UnkillableProcess()
        with patch(
            "app.release_studio.git_publish.subprocess.Popen",
            return_value=process,
        ), patch(
            "app.release_studio.git_publish.os.killpg",
            side_effect=OSError("group kill failed"),
        ):
            with self.assertRaisesRegex(GitPublishError, "timed out"):
                run_git("status", cwd=Path("."), timeout_seconds=0)

        self.assertEqual(process.wait_timeouts, [2, 2])

    def test_nonzero_command_result_is_returned(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = {
                **os.environ,
                "PATH": f"{_fake_git_bin(root, '#!/bin/sh\nexit 7\n')}{os.pathsep}{os.environ['PATH']}",
            }
            result = run_git("status", cwd=root, env=env, timeout_seconds=1)

        self.assertEqual(result.returncode, 7)


def _sleeping_git_bin(root: Path) -> Path:
    return _fake_git_bin(root, "#!/bin/sh\nsleep 30\nexit 1\n")


def _fake_git_bin(root: Path, script: str) -> Path:
    directory = root / "bin"
    directory.mkdir()
    real_git = shutil.which("git")
    if not real_git:
        raise AssertionError("git is required for publication tests")
    wrapper = directory / "git"
    wrapper.write_text(script, encoding="utf-8")
    wrapper.chmod(0o755)
    return directory


class _CommunicateFailureProcess:
    pid = 987_654_321

    def __init__(self) -> None:
        self.communicate_timeouts: list[float | None] = []
        self.reaped = False
        self.returncode: int | None = None

    def communicate(self, *, timeout: float | None = None) -> tuple[str, str]:
        self.communicate_timeouts.append(timeout)
        if len(self.communicate_timeouts) == 1:
            raise RuntimeError("pipe failed")
        self.returncode = -9
        self.reaped = True
        return "", ""


class _UnkillableProcess:
    pid = 987_654_322

    def __init__(self) -> None:
        self.wait_timeouts: list[float | None] = []

    def communicate(self, *, timeout: float | None = None) -> tuple[str, str]:
        raise subprocess.TimeoutExpired(["git"], timeout or 0)

    def kill(self) -> None:
        raise OSError("process kill failed")

    def wait(self, *, timeout: float | None = None) -> None:
        self.wait_timeouts.append(timeout)
        raise subprocess.TimeoutExpired(["git"], timeout or 0)


if __name__ == "__main__":
    unittest.main()
