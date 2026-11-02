"""How Prism reaches a Git remote: environment, credentials, and transport.

One adapter for every process that talks to a remote (import, sync, release
configuration publishing, System Builder tracking, jobset pushes). It owns the
noninteractive environment with pinned host keys, the per-invocation HTTPS
credentials, the ``ls-remote`` reading of a remote's branches, and the HTTPS to SSH
retry for private GitHub repositories. Moved here unchanged from
``project_import_service``.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional

from git import Git

from app.core.config import settings
from app.services.git_credentials import credential_for_url, git_credentials
from app.services.git_failures import GitAccessError, as_access_error
from app.services.git_remote_url import ParsedRemote, RemoteUrlPolicy, parse_remote_url

logger = logging.getLogger(__name__)


def remote_url_policy() -> RemoteUrlPolicy:
    """Build the clone-URL policy for this deployment."""
    return RemoteUrlPolicy.build(
        allowed_hosts=settings.IMPORT_ALLOWED_HOSTS,
        allow_insecure_http=settings.IMPORT_ALLOW_INSECURE_HTTP,
    )


def default_branch_from_symref(output: str) -> Optional[str]:
    """The branch ``HEAD`` names in ``git ls-remote --symref <url> HEAD`` output."""
    for line in output.splitlines():
        if line.startswith("ref:"):
            return line.split()[1].removeprefix("refs/heads/")
    return None


def describe_target(parsed: ParsedRemote) -> str:
    """How a repository should be named in a message to the user."""
    return f"{parsed.host}/{parsed.path.strip('/').removesuffix('.git')}"


def _inject_git_credentials(env: dict) -> None:
    """Supply each HTTPS credential to one Git invocation, and leave nothing behind.

    The GitHub token used to be written into the container's ``~/.gitconfig``
    at startup, so it sat in cleartext on the filesystem, in the writable layer
    of a committed image, and in any support bundle that captured the home
    directory -- and it applied to every process in the container, not only the
    ones meant to reach GitHub. ``GIT_CONFIG_*`` expresses the same rewrite for
    the duration of a single command: one ``insteadOf`` per credential, so each
    token reaches only the URLs that start with its own prefix
    (``git_credentials``). When several prefixes match, Git picks the longest.
    """
    credentials = git_credentials()
    if not credentials:
        return
    # The parent environment may already carry GIT_CONFIG_* entries; append.
    try:
        index = int(env.get("GIT_CONFIG_COUNT", "0") or "0")
    except ValueError:
        index = 0
    for credential in credentials:
        env[f"GIT_CONFIG_KEY_{index}"] = f"url.{credential.authenticated_prefix()}.insteadOf"
        env[f"GIT_CONFIG_VALUE_{index}"] = credential.url_prefix
        index += 1
        if credential.path_scoped:
            # curl keeps credentials on a redirect within the same host, so a
            # redirect from /team/ to /other/ would carry /team/'s token out of
            # its prefix. Redirects to another host or port already drop it.
            env[f"GIT_CONFIG_KEY_{index}"] = f"http.{credential.url_prefix}.followRedirects"
            env[f"GIT_CONFIG_VALUE_{index}"] = "false"
            index += 1
    env["GIT_CONFIG_COUNT"] = str(index)


def warn_if_credential_in_cleartext(url: str) -> None:
    """Log, without the token, when a credential is about to cross plain HTTP."""
    credential = credential_for_url(url)
    if credential is not None and credential.insecure:
        logger.warning(
            "Sending %s to %s over plain HTTP (IMPORT_ALLOW_INSECURE_HTTP); "
            "anyone on the network path can read it.",
            credential.token_name,
            credential.url_prefix,
        )


def git_env() -> dict:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    # Host keys must already be pinned. This used to be `accept-new`, which
    # trusts whatever key the first connection is offered -- a window in which a
    # host on the path can present its own key and read every repository the
    # workspace pulls. Trusting a new host is now a deliberate administrator
    # action, taken after comparing the fingerprint against what the Git server's
    # operator publishes.
    env["GIT_SSH_COMMAND"] = "ssh -o StrictHostKeyChecking=yes -o BatchMode=yes"
    _inject_git_credentials(env)
    return env


def list_remote_branches(parsed: ParsedRemote) -> tuple[List[str], Optional[str]]:
    """Return the remote's branch names and its default branch.

    Uses ``ls-remote`` rather than a clone: enumerating refs costs one round
    trip and no disk, so the dialog can offer a branch picker before the user
    has committed to importing anything.
    """
    warn_if_credential_in_cleartext(parsed.url)
    git = Git()
    git.update_environment(**git_env())
    try:
        head_output = git.ls_remote("--symref", parsed.url, "HEAD")
    except Exception as error:
        # This is the first thing that touches the remote, so it is where a
        # wrong URL or a missing permission shows up. Reporting it here gives a
        # far better message than letting the clone fail later.
        raise as_access_error(
            error, target=describe_target(parsed), host=parsed.host
        ) from error

    default_branch = default_branch_from_symref(head_output)

    try:
        heads_output = git.ls_remote("--heads", parsed.url)
    except Exception:
        return ([default_branch] if default_branch else []), default_branch

    branches = []
    for line in heads_output.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].startswith("refs/heads/"):
            branches.append(parts[1].removeprefix("refs/heads/"))
    branches.sort(key=lambda name: (name != default_branch, name.casefold()))
    return branches, default_branch


def _github_ssh_equivalent(parsed: ParsedRemote) -> Optional[ParsedRemote]:
    """Return the workspace-SSH spelling of one GitHub HTTPS remote.

    GitHub's Clone menu presents HTTPS first, while Prism's deployment uses a
    shared machine-user SSH key for private repositories.  Requiring every
    designer to understand that deployment detail made imports appear tied to
    the laptop or role of the person pasting the URL.  Keep HTTPS as the first
    attempt (so public repositories and ``GITHUB_TOKEN`` continue to work), but
    provide the equivalent SSH address when that attempt needs credentials.
    """
    if parsed.scheme != "https" or parsed.host.casefold() != "github.com":
        return None
    if parsed.port not in (None, 443):
        return None
    path = parsed.path.strip("/")
    if not path:
        return None
    if not path.endswith(".git"):
        path += ".git"
    return parse_remote_url(f"git@github.com:{path}", remote_url_policy())


def resolve_remote_access(
    parsed: ParsedRemote,
) -> tuple[ParsedRemote, List[str], Optional[str]]:
    """Resolve a readable transport and return its branch information.

    A private GitHub repository addressed by HTTPS normally responds with a
    credentials error even when Prism's workspace SSH identity is authorized.
    In that narrow case, retry the same canonical repository over SSH.  Other
    failures retain their original meaning and SSH URLs remain untouched.
    """
    try:
        branches, default_branch = list_remote_branches(parsed)
        return parsed, branches, default_branch
    except GitAccessError as https_error:
        if https_error.reason not in {"credentials-required", "repository-not-found"}:
            raise
        ssh_remote = _github_ssh_equivalent(parsed)
        if ssh_remote is None:
            raise

        print(
            f"HTTPS access to {describe_target(parsed)} needs credentials; "
            "retrying with Prism's workspace SSH identity",
            flush=True,
        )
        try:
            branches, default_branch = list_remote_branches(ssh_remote)
        except GitAccessError as ssh_error:
            # SSH-specific diagnostics (missing/untrusted client or an
            # unauthorized key) are more actionable than the original generic
            # HTTPS credential prompt.  A not-found response after the SSH
            # attempt also correctly covers a typo or a key lacking this one
            # repository's permission.
            if ssh_error.reason in {
                "ssh-unavailable",
                "host-key-unverified",
                "ssh-key-not-authorized",
                "repository-not-found",
            }:
                raise ssh_error from https_error
            raise https_error from ssh_error
        return ssh_remote, branches, default_branch
