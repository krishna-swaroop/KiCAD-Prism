"""Git failures have to arrive as something the user can act on.

The failure this replaces read, in full:

    Cmd('git') failed due to: exit code(128)
      cmdline: git clone -v --depth=1 --single-branch --no-checkout
      --filter=blob:none --progress -- https://github.com/org/repo.git
      /tmp/kicad_analyze_ujfs8p8z/repo

which says nothing about the cause, nothing about the fix, and leaks the
server's temporary paths into the UI.
"""

from __future__ import annotations

import unittest

from app.services.git_failures import describe_git_failure, git_failure_message


class FakeGitError(Exception):
    """Stands in for GitPython's GitCommandError, which carries stderr."""

    def __init__(self, stderr: str) -> None:
        super().__init__(
            "Cmd('git') failed due to: exit code(128)\n  cmdline: git clone -v "
            "--depth=1 -- https://github.com/org/repo.git /tmp/kicad_analyze_x/repo"
        )
        self.stderr = stderr


class IdentifiesTheCause(unittest.TestCase):
    # Verbatim from a worker container built without openssh-client. git runs
    # GIT_SSH_COMMAND through /bin/sh, so the shell reports the missing binary
    # and git then adds its stock advice about access rights.
    MISSING_SSH_STDERR = (
        "ssh -o StrictHostKeyChecking=yes -o BatchMode=yes: 1: ssh: not found\n"
        "fatal: Could not read from remote repository.\n\n"
        "Please make sure you have the correct access rights and the repository exists."
    )

    def test_missing_ssh_client_blames_the_server_not_the_remote(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError(self.MISSING_SSH_STDERR),
            target="github.com/pixxelhq/JTYU-IN",
            host="github.com",
        )
        self.assertEqual(reason, "ssh-unavailable")
        self.assertIn("openssh-client", message)
        # git's own advice points at keys and permissions, which is exactly
        # wrong here; the message must not send the reader down that path.
        self.assertNotIn("deploy key", message)
        self.assertIn("not with github.com/pixxelhq/JTYU-IN", message)

    def test_missing_ssh_client_wins_over_the_generic_fallback(self) -> None:
        """The stderr also contains git's 'could not read from remote' line."""
        _, message = describe_git_failure(FakeGitError(self.MISSING_SSH_STDERR))
        self.assertNotIn("The Git server said", message)

    def test_bash_style_not_found_is_recognised_too(self) -> None:
        reason, _ = describe_git_failure(
            FakeGitError("sh: ssh: command not found\nfatal: Could not read from remote repository.")
        )
        self.assertEqual(reason, "ssh-unavailable")

    def test_private_repository_without_access(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError("remote: Repository not found.\nfatal: repository not found"),
            target="github.com/pixxelhq/JTYU-IN",
        )
        self.assertEqual(reason, "repository-not-found")
        self.assertIn("github.com/pixxelhq/JTYU-IN", message)
        # The important insight: a forge hides private repos rather than saying
        # "denied", so "not found" is what a missing permission looks like.
        self.assertIn("private", message)

    def test_ssh_key_not_authorized(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository."),
            target="github.com/org/repo",
        )
        self.assertEqual(reason, "ssh-key-not-authorized")
        self.assertIn("deploy key", message)

    def test_https_private_repository_needs_credentials(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError("fatal: could not read Username for 'https://github.com': terminal prompts disabled"),
            target="github.com/org/repo",
            host="github.com",
        )
        self.assertEqual(reason, "credentials-required")
        self.assertIn("git@github.com", message)

    def test_unresolvable_host(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError("fatal: unable to access 'https://git.internal/': Could not resolve host: git.internal"),
            host="git.internal",
        )
        self.assertEqual(reason, "host-unresolved")
        self.assertIn("git.internal", message)
        # A container not sharing the user's VPN is the usual cause.
        self.assertIn("container", message)

    def test_unreachable_host(self) -> None:
        reason, _ = describe_git_failure(
            FakeGitError("ssh: connect to host git.internal port 22: Connection refused")
        )
        self.assertEqual(reason, "host-unreachable")

    def test_unverified_host_key(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError("Host key verification failed.\nfatal: Could not read from remote repository."),
            host="git.internal",
        )
        self.assertEqual(reason, "host-key-unverified")
        self.assertIn("git.internal", message)

    def test_missing_branch(self) -> None:
        reason, _ = describe_git_failure(
            FakeGitError("fatal: Remote branch release/v9 not found in upstream origin")
        )
        self.assertEqual(reason, "branch-not-found")

    def test_empty_repository(self) -> None:
        reason, message = describe_git_failure(
            FakeGitError("warning: You appear to have cloned an empty repository."),
            target="github.com/org/repo",
        )
        self.assertEqual(reason, "empty-repository")
        self.assertIn("empty", message)

    def test_disk_full(self) -> None:
        reason, _ = describe_git_failure(
            FakeGitError("fatal: write error: No space left on device")
        )
        self.assertEqual(reason, "disk-full")

    def test_not_found_beats_the_generic_auth_signals(self) -> None:
        # GitHub emits both for a private repository; the specific one must win.
        reason, _ = describe_git_failure(
            FakeGitError(
                "remote: Repository not found.\n"
                "fatal: Authentication failed for 'https://github.com/org/repo.git/'"
            )
        )
        self.assertEqual(reason, "repository-not-found")


class FallsBackReadably(unittest.TestCase):
    def test_unrecognised_failure_quotes_git_without_the_command_line(self) -> None:
        message = git_failure_message(
            FakeGitError("fatal: something entirely new went wrong"),
            target="github.com/org/repo",
        )
        self.assertIn("something entirely new went wrong", message)
        # None of GitPython's wrapper noise should reach the user.
        self.assertNotIn("cmdline:", message)
        self.assertNotIn("Cmd('git')", message)
        self.assertNotIn("exit code", message)

    def test_server_temporary_paths_are_not_leaked(self) -> None:
        message = git_failure_message(
            FakeGitError("fatal: could not create work tree dir '/tmp/kicad_analyze_ujfs8p8z/repo'")
        )
        self.assertNotIn("kicad_analyze_ujfs8p8z", message)

    def test_an_error_without_stderr_still_produces_a_message(self) -> None:
        message = git_failure_message(RuntimeError("boom"), target="github.com/org/repo")
        self.assertIn("github.com/org/repo", message)
        self.assertTrue(message.strip())



class AccessFailureDetection(unittest.TestCase):
    """The dialog offers a guided fix off this flag, so it has to track the
    messages `describe_git_failure` actually writes."""

    def test_every_access_reason_is_recognised(self) -> None:
        from app.services.project_import_service import (
            ACCESS_FAILURE_REASONS,
            _is_access_failure,
        )

        samples = {
            "ssh-key-not-authorized": "git@github.com: Permission denied (publickey).",
            "repository-not-found": "remote: Repository not found.",
            "credentials-required": "could not read Username for 'https://github.com'",
            "host-key-unverified": "Host key verification failed.",
        }
        self.assertEqual(set(samples), set(ACCESS_FAILURE_REASONS))

        for reason, stderr in samples.items():
            with self.subTest(reason=reason):
                actual_reason, message = describe_git_failure(FakeGitError(stderr))
                self.assertEqual(actual_reason, reason)
                # The flag is derived from the message, so they must agree.
                self.assertTrue(
                    _is_access_failure(message),
                    f"{reason} message is not detected as an access failure",
                )

    def test_missing_ssh_client_is_not_offered_a_guided_fix(self) -> None:
        """Nothing the user does to their keys or permissions would help."""
        from app.services.project_import_service import _is_access_failure

        _, message = describe_git_failure(
            FakeGitError(IdentifiesTheCause.MISSING_SSH_STDERR)
        )
        self.assertFalse(_is_access_failure(message))

    def test_unrelated_failures_are_not_flagged(self) -> None:
        from app.services.project_import_service import _is_access_failure

        _, message = describe_git_failure(FakeGitError("fatal: write error: No space left on device"))
        self.assertFalse(_is_access_failure(message))
        self.assertFalse(_is_access_failure(None))
        self.assertFalse(_is_access_failure(""))


class ScratchPathRedactionTests(unittest.TestCase):
    """Git names its clone directory in errors; users should not see it."""

    def _pattern_for_host(self, temporary_root: str):
        from unittest.mock import patch

        from app.services import git_failures

        with patch("tempfile.gettempdir", return_value=temporary_root):
            return git_failures._sensitive_path_pattern()

    def test_posix_scratch_paths_are_redacted(self) -> None:
        pattern = self._pattern_for_host("/tmp")

        self.assertEqual(
            pattern.sub("<path>", "fatal: could not read /tmp/prism-x/config"),
            "fatal: could not read <path>",
        )

    def test_a_windows_scratch_path_is_redacted_on_a_windows_host(self) -> None:
        """It carries the service account name, and the POSIX roots never matched it."""
        root = r"C:\Users\prism\AppData\Local\Temp"
        pattern = self._pattern_for_host(root)

        self.assertEqual(
            pattern.sub("<path>", rf"fatal: could not read {root}\prism-x\HEAD"),
            "fatal: could not read <path>",
        )


if __name__ == "__main__":
    unittest.main()
