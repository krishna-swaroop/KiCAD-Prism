"""
Validation and normalisation for user-supplied Git remote URLs.

Every string that reaches ``git clone`` has to come through here first. Git
accepts far more than "a URL": remote-helper transports such as ``ext::`` run an
arbitrary shell command, ``file://`` and bare paths reach the worker's own
filesystem, and a leading ``-`` is parsed as an option rather than an operand.
Prism exposes the import field to anyone with the designer role, so an
unvalidated string there is a shell on the worker and read access to every
repository already checked out.

This module deliberately imports nothing from the application config, so the
policy can be exercised in tests without constructing the settings singleton.
Callers pass their own policy in.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import urlsplit

__all__ = [
    "RemoteUrlError",
    "RemoteUrlPolicy",
    "ParsedRemote",
    "parse_remote_url",
    "validate_remote_url",
    "normalize_remote_url",
]


class RemoteUrlError(ValueError):
    """Raised when a remote URL is malformed or not permitted."""


# ``<transport>::<address>`` is git's remote-helper syntax. ``ext::`` is the
# dangerous one -- it executes its argument as a shell command -- but no helper
# transport is something an import field needs, so the whole form is rejected.
# The pattern is anchored so an IPv6 literal (``https://[::1]/repo.git``) does
# not trip it: there, the first colon is followed by ``//``, not another colon.
_REMOTE_HELPER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9+.\-]*::")

# scp-like syntax: ``user@host:path/to/repo.git``. Git treats a colon before the
# first slash as the host/path separator. A colon *after* a slash is part of the
# path and does not make the string scp-like.
_SCP_LIKE_RE = re.compile(r"^(?P<user>[^/@]+)@(?P<host>\[[^\]]+\]|[^/:]+):(?P<path>.+)$")

_DEFAULT_PORTS = {"https": 443, "http": 80, "ssh": 22}

# Control characters would be passed straight through to git's argv.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


@dataclass(frozen=True)
class RemoteUrlPolicy:
    """What this deployment is willing to clone from."""

    # Hosts the workspace may import from. Empty means "any host", which is the
    # default because most self-hosted deployments have exactly one operator.
    allowed_hosts: frozenset[str] = frozenset()
    # Plaintext HTTP is off unless an operator deliberately turns it on for an
    # internal Git server that has no TLS.
    allow_insecure_http: bool = False

    @classmethod
    def build(
        cls,
        *,
        allowed_hosts: Optional[Iterable[str]] = None,
        allow_insecure_http: bool = False,
    ) -> "RemoteUrlPolicy":
        hosts = frozenset(
            host.strip().casefold() for host in (allowed_hosts or []) if host.strip()
        )
        return cls(allowed_hosts=hosts, allow_insecure_http=allow_insecure_http)


@dataclass(frozen=True)
class ParsedRemote:
    """A remote URL that has passed validation."""

    # The exact string to hand to git. Whitespace-trimmed, otherwise unchanged,
    # so credentials-free URLs round-trip byte for byte.
    url: str
    scheme: str
    host: str
    port: Optional[int]
    path: str

    @property
    def dedup_key(self) -> str:
        """Identity of the *repository*, independent of how it is addressed.

        ``git@github.com:org/repo.git`` and ``https://github.com/org/repo``
        name the same thing and must not import twice.
        """
        host = self.host.casefold()
        if self.port is not None and self.port != _DEFAULT_PORTS.get(self.scheme):
            host = f"{host}:{self.port}"
        path = self.path.strip("/")
        if path.endswith(".git"):
            path = path[: -len(".git")]
        # Casefolding the path merges ``org/Repo`` with ``org/repo``. Git paths
        # are case-sensitive in principle, but every forge Prism targets treats
        # them as equivalent, and a duplicate import is the worse failure.
        return f"{host}/{path}".casefold()

    @property
    def repo_name(self) -> str:
        segment = self.path.rstrip("/").rsplit("/", 1)[-1]
        if segment.endswith(".git"):
            segment = segment[: -len(".git")]
        return segment


def parse_remote_url(raw: str, policy: Optional[RemoteUrlPolicy] = None) -> ParsedRemote:
    """Validate ``raw`` and return its parsed form, or raise ``RemoteUrlError``."""
    policy = policy or RemoteUrlPolicy()

    if not isinstance(raw, str):
        raise RemoteUrlError("Repository URL must be a string.")

    candidate = raw.strip()
    if not candidate:
        raise RemoteUrlError("Enter a repository URL.")

    if _CONTROL_CHARS_RE.search(candidate):
        raise RemoteUrlError("Repository URL contains control characters.")

    # git parses a leading dash as an option, so `--upload-pack=...` in the URL
    # field would become an argument rather than a remote.
    if candidate.startswith("-"):
        raise RemoteUrlError("Repository URL may not start with '-'.")

    if _REMOTE_HELPER_RE.match(candidate):
        transport = candidate.split("::", 1)[0]
        raise RemoteUrlError(
            f"The '{transport}::' transport is not allowed. "
            "Use an https:// or ssh:// URL, or scp-style git@host:org/repo.git."
        )

    scp_match = _SCP_LIKE_RE.match(candidate)
    if scp_match and "://" not in candidate:
        host = scp_match.group("host")
        path = scp_match.group("path")
        _reject_credentials(scp_match.group("user"))
        _check_host(host, policy)
        if not path.strip("/"):
            raise RemoteUrlError("Repository URL is missing a repository path.")
        return ParsedRemote(
            url=candidate, scheme="ssh", host=host, port=None, path=path
        )

    split = urlsplit(candidate)
    scheme = split.scheme.casefold()

    if not scheme:
        raise RemoteUrlError(
            "Repository URL needs a scheme. "
            "Use https://host/org/repo.git, ssh://git@host/org/repo.git, "
            "or git@host:org/repo.git."
        )

    allowed_schemes = {"https", "ssh"}
    if policy.allow_insecure_http:
        allowed_schemes.add("http")

    if scheme not in allowed_schemes:
        if scheme in {"file", "git"}:
            detail = (
                "local paths cannot be imported"
                if scheme == "file"
                else "the git:// protocol is unauthenticated and unencrypted"
            )
            raise RemoteUrlError(f"'{scheme}://' URLs are not allowed: {detail}.")
        if scheme == "http":
            raise RemoteUrlError(
                "Plaintext http:// is disabled. Use https:// or ssh://, or enable "
                "IMPORT_ALLOW_INSECURE_HTTP for an internal Git server without TLS."
            )
        raise RemoteUrlError(f"'{scheme}://' URLs are not allowed.")

    if not split.hostname:
        raise RemoteUrlError("Repository URL is missing a host.")

    _reject_credentials(split.username, split.password)

    try:
        port = split.port
    except ValueError as error:  # urlsplit defers port validation to access
        raise RemoteUrlError("Repository URL has an invalid port.") from error

    host = split.hostname
    _check_host(host, policy)

    if not split.path.strip("/"):
        raise RemoteUrlError("Repository URL is missing a repository path.")

    return ParsedRemote(
        url=candidate, scheme=scheme, host=host, port=port, path=split.path
    )


def _reject_credentials(username: Optional[str], password: Optional[str] = None) -> None:
    """Refuse URLs carrying a secret.

    A token embedded in the URL would be stored in ``ws_repositories.url`` in
    cleartext and rendered back in the project list. SSH keys on the worker are
    the supported way to reach a private repository.
    """
    if password:
        raise RemoteUrlError(
            "Remove the credentials from the URL. Prism stores repository URLs "
            "in cleartext, so a token in the URL would be exposed. Configure an "
            "SSH deploy key on the server and use an ssh:// URL instead."
        )
    # A bare username is how ssh URLs address the git account and carries no
    # secret, so `git@host` and `ssh://git@host/...` stay valid.
    if username and ":" in username:
        raise RemoteUrlError("Remove the credentials from the URL.")


def _check_host(host: str, policy: RemoteUrlPolicy) -> None:
    if not policy.allowed_hosts:
        return
    if host.casefold() not in policy.allowed_hosts:
        allowed = ", ".join(sorted(policy.allowed_hosts))
        raise RemoteUrlError(
            f"'{host}' is not an allowed repository host. This workspace allows: {allowed}."
        )


def validate_remote_url(raw: str, policy: Optional[RemoteUrlPolicy] = None) -> str:
    """Return the URL to hand to git, raising ``RemoteUrlError`` if not permitted."""
    return parse_remote_url(raw, policy).url


def normalize_remote_url(raw: str, policy: Optional[RemoteUrlPolicy] = None) -> str:
    """Return the deduplication key for a remote URL."""
    return parse_remote_url(raw, policy).dedup_key
