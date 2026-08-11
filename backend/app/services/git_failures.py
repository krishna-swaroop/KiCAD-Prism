"""
Turn git's exit codes into something a user can act on.

GitPython raises `GitCommandError`, whose string form is the command line and an
exit status:

    Cmd('git') failed due to: exit code(128)
      cmdline: git clone -v --depth=1 --single-branch ... https://host/org/repo.git /tmp/...

That tells the person importing a repository nothing about what went wrong or
what to do next, and it leaks the server's temporary paths into the UI. The
useful information is always in git's stderr; this module reads it and produces
a sentence about the cause plus a sentence about the fix.

Kept free of app imports so the mapping can be tested on its own.
"""

from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass
from typing import Optional

__all__ = ["GitAccessError", "describe_git_failure", "git_failure_message"]


class GitAccessError(RuntimeError):
    """A git operation failed for a reason the user can address."""

    def __init__(self, message: str, *, reason: str = "unknown") -> None:
        super().__init__(message)
        self.reason = reason


@dataclass(frozen=True)
class _Rule:
    reason: str
    # Any of these substrings in git's stderr identifies the failure.
    signals: tuple[str, ...]
    template: str


# Ordered: the first match wins, so put the specific cases before the general
# ones. "Repository not found" must beat the generic authentication signals,
# because GitHub returns it for private repositories the caller cannot see.
_RULES: tuple[_Rule, ...] = (
    # First, because this one is Prism's fault and not the remote's. git runs
    # GIT_SSH_COMMAND through a shell, so a missing binary surfaces as the
    # shell's "not found" followed by git's stock "make sure you have the
    # correct access rights" — which sends the reader off checking keys and
    # permissions that were never the problem.
    _Rule(
        reason="ssh-unavailable",
        signals=(
            "ssh: not found",
            "ssh: command not found",
            "cannot run ssh",
            "cannot spawn ssh",
        ),
        template=(
            "The Prism server has no SSH client, so it cannot use an SSH Git "
            "remote at all.\n\n"
            "This is a problem with the Prism deployment, not with {target} or "
            "with your key. An administrator needs to install the "
            "openssh-client package in the backend and worker images and "
            "restart them. Until then, an HTTPS URL will still work for public "
            "repositories."
        ),
    ),
    _Rule(
        reason="ssh-key-not-authorized",
        signals=("permission denied (publickey", "permission denied, please try again"),
        template=(
            "The Git server refused Prism's SSH key for {target}.\n\n"
            "Add Prism's public key to the repository as a read-only deploy key, "
            "then try again. You can copy the key from Settings, under Git & SSH."
        ),
    ),
    _Rule(
        reason="host-key-unverified",
        signals=("host key verification failed",),
        template=(
            "Prism could not verify the SSH host key for {host}.\n\n"
            "The server's host key is not trusted yet. An administrator needs to add "
            "{host} to the known hosts on the Prism server."
        ),
    ),
    _Rule(
        reason="repository-not-found",
        signals=(
            "repository not found",
            "does not appear to be a git repository",
            "not found: ",
            "the project you were looking for could not be found",
        ),
        template=(
            "{target} could not be found, or Prism has no access to it.\n\n"
            "If the repository is private, this is what a missing permission looks "
            "like: the Git server hides private repositories rather than saying "
            "access is denied. Check the URL is right, then grant Prism read access "
            "to the repository."
        ),
    ),
    _Rule(
        reason="credentials-required",
        signals=(
            "could not read username",
            "could not read password",
            "terminal prompts disabled",
            "authentication failed",
        ),
        template=(
            "{target} needs credentials that Prism does not have.\n\n"
            "Prism never prompts for a password and does not store one. Use an SSH "
            "URL (git@{host}:org/repo.git) and grant Prism's key read access to the "
            "repository."
        ),
    ),
    _Rule(
        reason="host-unresolved",
        signals=(
            "could not resolve host",
            "name or service not known",
            "temporary failure in name resolution",
        ),
        template=(
            "Prism could not resolve {host}.\n\n"
            "Check the host name. If this is an internal Git server, the Prism "
            "server needs to be able to reach it — a container may not share your "
            "machine's DNS or VPN."
        ),
    ),
    _Rule(
        reason="host-unreachable",
        signals=(
            "connection refused",
            "connection timed out",
            "operation timed out",
            "network is unreachable",
            "failed to connect",
            "port 22",
        ),
        template=(
            "Prism could not reach {host}.\n\n"
            "The host resolves but is not accepting connections. If this is an "
            "internal Git server, check that the Prism server is on the same "
            "network, and that outbound SSH is not blocked."
        ),
    ),
    _Rule(
        reason="branch-not-found",
        signals=("remote branch", "not found in upstream"),
        template=(
            "That branch does not exist on {target}.\n\n"
            "Pick a different branch, or check whether it has been renamed or "
            "deleted upstream."
        ),
    ),
    _Rule(
        reason="empty-repository",
        signals=("you appear to have cloned an empty repository", "empty repository"),
        template=(
            "{target} is empty.\n\n"
            "There is nothing to import yet. Push your KiCad project to the "
            "repository first."
        ),
    ),
    _Rule(
        reason="disk-full",
        signals=("no space left on device",),
        template=(
            "The Prism server ran out of disk space while cloning {target}.\n\n"
            "An administrator needs to free space on the Prism data volume."
        ),
    ),
)

def _sensitive_path_pattern() -> "re.Pattern[str]":
    """Match the scratch paths git names in its errors, on any platform.

    Git reports the server-side clone directory when a fetch fails, which tells
    a user about the layout of the Prism host. On Windows that path also
    contains the account name the service runs as, and the two POSIX roots
    below never matched it. Including the platform's own temporary root keeps
    this correct wherever the backend runs.
    """

    roots = {"/tmp", "/var/folders", tempfile.gettempdir()}
    alternatives = "|".join(sorted(re.escape(root) for root in roots))
    return re.compile(rf"(?:{alternatives})[/\\]\S+")


_SENSITIVE_PATH_RE = _sensitive_path_pattern()


def _stderr_of(error: BaseException) -> str:
    """Best-effort read of git's stderr from a GitPython error."""
    parts: list[str] = []
    for attribute in ("stderr", "stdout"):
        value = getattr(error, attribute, None)
        if value:
            parts.append(value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value))
    if not parts:
        parts.append(str(error))
    return "\n".join(parts)


def describe_git_failure(
    error: BaseException,
    *,
    target: str = "the repository",
    host: str = "the Git server",
) -> tuple[str, str]:
    """Return ``(reason, message)`` for a failed git command."""
    stderr = _stderr_of(error).casefold()
    for rule in _RULES:
        if any(signal in stderr for signal in rule.signals):
            return rule.reason, rule.template.format(target=target, host=host)

    # Nothing recognised. Surface git's own words, which are more useful than a
    # generic apology, but strip the server-side paths out of them.
    detail = _SENSITIVE_PATH_RE.sub("…", _stderr_of(error)).strip()
    # GitPython prefixes its own repr; keep only what git actually printed.
    lines = [
        line.strip()
        for line in detail.splitlines()
        if line.strip()
        and not line.strip().startswith("cmdline:")
        and not line.strip().startswith("Cmd('git')")
    ]
    summary = " ".join(lines)[:400] or "git exited with an error."
    return "unknown", (
        f"Prism could not read {target}.\n\nThe Git server said: {summary}"
    )


def git_failure_message(
    error: BaseException,
    *,
    target: str = "the repository",
    host: str = "the Git server",
) -> str:
    return describe_git_failure(error, target=target, host=host)[1]


def as_access_error(
    error: BaseException,
    *,
    target: str = "the repository",
    host: str = "the Git server",
) -> GitAccessError:
    reason, message = describe_git_failure(error, target=target, host=host)
    return GitAccessError(message, reason=reason)


def maybe_host(value: Optional[str]) -> str:
    return value or "the Git server"
