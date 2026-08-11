"""
How Prism authenticates to Git servers, and how an operator can see whether it
works.

Prism holds one SSH key for the whole workspace. That key is meant to belong to
a dedicated machine user -- a service account granted read access to the
repositories the workspace imports -- rather than to a person. This matters and
was never stated anywhere in the product: a GitHub *deploy key* can only ever be
attached to a single repository, so a workspace that pastes its key as a deploy
key silently cannot import a second private GitHub repository, and finds out
only when an import fails.

Everything here is about making that arrangement visible: what the key is, which
hosts are trusted, and whether a given repository can actually be read.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.services.git_failures import describe_git_failure
from app.services.git_remote_url import ParsedRemote

logger = logging.getLogger(__name__)

SUBPROCESS_TIMEOUT_SECONDS = 20


class MissingSSHToolError(RuntimeError):
    """An operation needs an OpenSSH binary that is not installed.

    Worth its own type because the bare OSError for this reads
    ``[Errno 2] No such file or directory: 'ssh-keygen'``, which tells an
    operator nothing about which feature broke or how to restore it.
    """

    def __init__(self, tool: str) -> None:
        super().__init__(
            f"'{tool}' is not installed on the Prism server, so this action is "
            "unavailable. Install the openssh-client package in the backend "
            "image and restart it."
        )
        self.tool = tool


def _require_tool(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise MissingSSHToolError(tool)
    return path


def openssh_tools() -> dict[str, bool]:
    """Which OpenSSH binaries this deployment actually has.

    Surfaced so the UI can say a feature is unavailable and why, rather than
    letting a FileNotFoundError reach the user.
    """
    return {tool: shutil.which(tool) is not None for tool in ("ssh", "ssh-keygen", "ssh-keyscan")}


def warn_if_openssh_missing(component: str) -> list[str]:
    """Log which OpenSSH binaries are absent, and return their names.

    Every process that clones needs its own copy: the API and the workers run
    from the same image but are rebuilt independently, so one of them can end up
    without `ssh` while the others have it. That failure only shows up when
    somebody imports a repository, and it looks like a permissions problem. Say
    it at startup instead, where it is a one-line fix.
    """
    missing = sorted(tool for tool, present in openssh_tools().items() if not present)
    if missing:
        logger.warning(
            "%s has no %s. SSH Git remotes will fail here until openssh-client "
            "is installed in this image. If other Prism containers do have it, "
            "this image is stale — rebuild it.",
            component,
            ", ".join(missing),
        )
    return missing

# Hosts Prism knows how to talk about. Anything else is treated as a
# self-hosted server: still supported, just without the tailored instructions.
FORGES: dict[str, dict[str, str]] = {
    "github.com": {
        "name": "GitHub",
        "deploy_key_path": "/settings/keys",
        "account_key_url": "https://github.com/settings/keys",
    },
    "gitlab.com": {
        "name": "GitLab",
        "deploy_key_path": "/-/settings/repository",
        "account_key_url": "https://gitlab.com/-/user_settings/ssh_keys",
    },
    "bitbucket.org": {
        "name": "Bitbucket",
        "deploy_key_path": "/admin/access-keys/",
        "account_key_url": "https://bitbucket.org/account/settings/ssh-keys/",
    },
}


def ssh_dir() -> Path:
    return (Path.home() / ".ssh").resolve()


def private_key_path() -> Path:
    return ssh_dir() / "id_ed25519"


def public_key_path() -> Path:
    return ssh_dir() / "id_ed25519.pub"


def known_hosts_path() -> Path:
    return ssh_dir() / "known_hosts"


@dataclass(frozen=True)
class KeyInfo:
    """What Prism can say about its own machine-user key."""

    exists: bool
    public_key: Optional[str] = None
    fingerprint: Optional[str] = None
    key_type: Optional[str] = None
    comment: Optional[str] = None
    created_at: Optional[str] = None


def fingerprint_of_public_key(line: str) -> Optional[str]:
    """SHA256 fingerprint of an OpenSSH public key line.

    This is the same value ``ssh-keygen -lf`` prints, computed directly: the
    base64 key blob hashed with SHA-256 and re-encoded without padding. Doing it
    in Python rather than shelling out means fingerprints still work on a server
    that has no OpenSSH binaries installed.
    """
    parts = line.split()
    if len(parts) < 2:
        return None
    try:
        blob = base64.b64decode(parts[1], validate=True)
    except Exception:
        return None
    digest = hashlib.sha256(blob).digest()
    return "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")


def generate_key(comment: str) -> KeyInfo:
    """Create the workspace's Ed25519 key, replacing any existing one.

    Written with `cryptography` rather than by running ``ssh-keygen``. The
    backend image ships without openssh-client, so shelling out failed with
    ``[Errno 2] No such file or directory: 'ssh-keygen'`` and key generation
    could not work in a container at all.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ed25519

    directory = ssh_dir()
    directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)

    private = ed25519.Ed25519PrivateKey.generate()
    private_bytes = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = private.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    )
    public_line = public_bytes.decode("ascii")
    if comment.strip():
        public_line = f"{public_line} {comment.strip()}"

    private_path = private_key_path()
    # Create the private key unreadable by anyone else from the outset; ssh
    # refuses to use a key whose file is group or world readable.
    descriptor = os.open(private_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(private_bytes)
    os.chmod(private_path, 0o600)

    public_key_path().write_text(public_line + "\n", encoding="utf-8")
    os.chmod(public_key_path(), 0o644)

    logger.info("Generated a new Ed25519 key for the workspace")
    return describe_key()


def describe_key() -> KeyInfo:
    """Read the workspace key and its fingerprint.

    The fingerprint is what a forge shows next to an authorised key, so it is
    the only way an operator can confirm the key they pasted is the key Prism
    is actually using.
    """
    public_key = public_key_path()
    if not public_key.is_file():
        return KeyInfo(exists=False)

    try:
        content = public_key.read_text(encoding="utf-8").strip()
    except OSError as error:
        logger.error("Could not read public key: %s", error)
        return KeyInfo(exists=False)

    parts = content.split()
    key_type = parts[0] if parts else None
    comment = parts[2] if len(parts) > 2 else None

    created_at = None
    try:
        created_at = _isoformat(public_key.stat().st_mtime)
    except OSError:
        pass

    return KeyInfo(
        exists=True,
        public_key=content,
        fingerprint=fingerprint_of_public_key(content),
        key_type=key_type,
        comment=comment,
        created_at=created_at,
    )


def _isoformat(timestamp: float) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Host key trust
# ---------------------------------------------------------------------------


def trusted_hosts() -> list[str]:
    """Hosts whose SSH host key Prism has pinned."""
    path = known_hosts_path()
    if not path.is_file():
        return []
    hosts: set[str] = set()
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            first = line.split()[0]
            if first.startswith("|"):
                # Hashed entry: the host name is not recoverable by design.
                continue
            for name in first.split(","):
                hosts.add(name.strip().lstrip("[").split("]")[0])
    except OSError as error:
        logger.warning("Could not read known_hosts: %s", error)
    return sorted(hosts)


def _known_hosts_lines() -> list[str]:
    path = known_hosts_path()
    if not path.is_file():
        return []
    try:
        return [
            line.strip()
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
    except OSError as error:
        logger.warning("Could not read known_hosts: %s", error)
        return []


def _line_matches_host(line: str, host: str) -> bool:
    """Whether a known_hosts line covers ``host``.

    Understands OpenSSH's hashed form (``|1|salt|hash``, an HMAC-SHA1 of the
    host name keyed by the salt) as well as plain names, so this replaces
    ``ssh-keygen -F`` without losing anything.
    """
    pattern = line.split()[0] if line.split() else ""
    if not pattern:
        return False

    if pattern.startswith("|1|"):
        try:
            _, _, salt_b64, hash_b64 = pattern.split("|", 3)
            salt = base64.b64decode(salt_b64)
        except Exception:
            return False
        digest = hmac.new(salt, host.encode("utf-8"), hashlib.sha1).digest()
        return hmac.compare_digest(base64.b64encode(digest).decode("ascii"), hash_b64)

    for name in pattern.split(","):
        candidate = name.strip()
        # `[host]:port` for a non-default SSH port.
        if candidate.startswith("["):
            candidate = candidate[1:].split("]")[0]
        if candidate.casefold() == host.casefold():
            return True
    return False


def is_host_trusted(host: str) -> bool:
    """Whether ssh already has a pinned key for ``host``.

    Reads known_hosts directly rather than running ``ssh-keygen -F``: the
    backend image has no openssh-client, and this check gates whether SSH
    remotes are usable at all, so it must not depend on a binary that may be
    absent.
    """
    if not host:
        return False
    return any(_line_matches_host(line, host) for line in _known_hosts_lines())


@dataclass(frozen=True)
class HostKeyCandidate:
    host: str
    fingerprints: list[str]
    entries: str


def scan_host_key(host: str, port: int = 22) -> HostKeyCandidate:
    """Fetch a host's SSH key so an administrator can confirm its fingerprint.

    Deliberately does not write anything. Scanning and trusting are separate
    steps, because a scan is exactly as trustworthy as the network it ran over;
    an administrator has to compare the fingerprint against what the Git server's
    operator publishes before it is pinned.
    """
    _require_safe_host(host)
    # Fetching a key requires speaking SSH to the host, which is the one thing
    # here that cannot be done in Python; missing tooling is reported as such.
    command = [_require_tool("ssh-keyscan")]
    if port != 22:
        command += ["-p", str(port)]
    command.append(host)
    try:
        scan = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except (subprocess.SubprocessError, OSError) as error:
        raise RuntimeError(f"Could not reach {host}: {error}") from error

    entries = "\n".join(
        line for line in scan.stdout.splitlines() if line.strip() and not line.startswith("#")
    )
    if not entries:
        raise RuntimeError(
            f"No SSH host key was offered by {host}. "
            "Check the host name and that the server accepts SSH connections."
        )
    return HostKeyCandidate(host=host, fingerprints=_fingerprints_of(entries), entries=entries)


def _fingerprints_of(entries: str) -> list[str]:
    """Fingerprint each known_hosts line, computed in Python.

    A known_hosts line is ``<host-pattern> <key-type> <base64-blob>``, so the
    public key part is the last two fields.
    """
    fingerprints: list[str] = []
    for line in entries.splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        key_type, blob = fields[1], fields[2]
        fingerprint = fingerprint_of_public_key(f"{key_type} {blob}")
        if fingerprint:
            fingerprints.append(f"{fingerprint} ({key_type})")
    return fingerprints


def trust_host(candidate: HostKeyCandidate) -> None:
    """Pin a scanned host key."""
    path = known_hosts_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.is_file() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    path.write_text(existing + candidate.entries + "\n", encoding="utf-8")
    os.chmod(path, 0o644)
    logger.info("Pinned SSH host key for %s", candidate.host)


def forget_host(host: str) -> bool:
    """Remove a pinned host key. Returns whether anything was removed."""
    _require_safe_host(host)
    path = known_hosts_path()
    if not path.is_file():
        return False
    lines = _known_hosts_lines()
    kept = [line for line in lines if not _line_matches_host(line, host)]
    if len(kept) == len(lines):
        return False
    path.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    os.chmod(path, 0o644)
    logger.info("Removed pinned SSH host key for %s", host)
    return True


_HOST_RE = re.compile(r"^[A-Za-z0-9._\-]+$")


def _require_safe_host(host: str) -> None:
    """Host names reach ssh-keyscan's argv, so they are validated like URLs."""
    candidate = (host or "").strip()
    if not candidate or candidate.startswith("-") or not _HOST_RE.match(candidate):
        raise ValueError(f"Invalid host name: {host!r}")


# SHA256 fingerprints published by the operators of the hosted forges.
#
# These are the values Prism checks a scanned host key against before pinning
# it, which is what makes startup bootstrapping safe: a scan on its own is only
# as trustworthy as the network it ran over, but a scan checked against a
# fingerprint published out of band is not. Verify these against the vendor's
# own documentation when updating them:
#   GitHub  https://docs.github.com/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
#   GitLab  https://docs.gitlab.com/user/gitlab_com/#ssh-host-keys-fingerprints
#
# A wrong or stale value here does not silently weaken anything: the host simply
# fails to bootstrap, and an administrator pins it explicitly after checking the
# fingerprint themselves.
PUBLISHED_HOST_FINGERPRINTS: dict[str, frozenset[str]] = {
    "github.com": frozenset(
        {
            "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU",  # ssh-ed25519
            "SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s",  # ssh-rsa
            "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM",  # ecdsa-sha2-nistp256
        }
    ),
    "gitlab.com": frozenset(
        {
            "SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8",  # ssh-ed25519
            "SHA256:ROQFvPThGrW4RuWLoL9tq9I9zJ42fK4XywyRtbOz/EQ",  # ssh-rsa
            "SHA256:HbW3g8zUjNSksFbqTiUWPWg2Bq1x8xdGUrliXFzSnUw",  # ecdsa-sha2-nistp256
        }
    ),
}


def bootstrap_known_hosts() -> dict[str, str]:
    """Pin the hosted forges' host keys, verifying them before trusting them.

    Returns a host -> outcome map for logging. Hosts already pinned are left
    alone: re-pinning would let a changed key in silently, and a host key that
    has genuinely changed is something an administrator must look at.
    """
    outcomes: dict[str, str] = {}
    for host, expected in PUBLISHED_HOST_FINGERPRINTS.items():
        if is_host_trusted(host):
            outcomes[host] = "already-trusted"
            continue
        try:
            candidate = scan_host_key(host)
        except Exception as error:
            outcomes[host] = f"scan-failed: {error}"
            continue

        scanned = {fingerprint.split()[0] for fingerprint in candidate.fingerprints}
        if not scanned & expected:
            # Either the vendor rotated a key or something answered in its
            # place. Both need a human.
            outcomes[host] = "fingerprint-mismatch"
            logger.error(
                "Refusing to trust %s: scanned fingerprints %s do not match any "
                "published fingerprint. Pin the host manually after verifying it.",
                host,
                sorted(scanned),
            )
            continue

        # Keep only the entries whose fingerprint we verified.
        verified = _entries_matching(candidate, expected)
        if not verified:
            outcomes[host] = "fingerprint-mismatch"
            continue
        trust_host(HostKeyCandidate(host=host, fingerprints=[], entries=verified))
        outcomes[host] = "pinned"
    return outcomes


def _entries_matching(candidate: HostKeyCandidate, expected: frozenset[str]) -> str:
    """Keep only the scanned lines whose own fingerprint is published."""
    kept: list[str] = []
    for line in candidate.entries.splitlines():
        if not line.strip():
            continue
        fingerprints = {value.split()[0] for value in _fingerprints_of(line)}
        if fingerprints & expected:
            kept.append(line)
    return "\n".join(kept)


# ---------------------------------------------------------------------------
# Access checks
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AccessResult:
    """The answer to 'can Prism read this repository right now?'"""

    reachable: bool
    authorized: bool
    reason: str
    message: str
    default_branch: Optional[str] = None


def check_repository_access(parsed: ParsedRemote, *, git_env: Optional[dict] = None) -> AccessResult:
    """Ask the Git server whether Prism may read a repository.

    Uses ``ls-remote``, which is the cheapest question that still exercises
    authentication end to end: no clone, no disk, one round trip.
    """
    from git import Git  # imported here so the module stays importable without git

    git = Git()
    if git_env:
        git.update_environment(**git_env)
    try:
        output = git.ls_remote("--symref", parsed.url, "HEAD")
    except Exception as error:
        reason, message = describe_git_failure(
            error,
            target=f"{parsed.host}/{parsed.path.strip('/').removesuffix('.git')}",
            host=parsed.host,
        )
        unreachable = reason in {"host-unresolved", "host-unreachable", "host-key-unverified"}
        return AccessResult(
            reachable=not unreachable,
            authorized=False,
            reason=reason,
            message=message,
        )

    default_branch = None
    for line in output.splitlines():
        if line.startswith("ref:"):
            default_branch = line.split()[1].removeprefix("refs/heads/")
            break

    return AccessResult(
        reachable=True,
        authorized=True,
        reason="ok",
        message="Prism can read this repository.",
        default_branch=default_branch,
    )


# ---------------------------------------------------------------------------
# Forge-specific guidance
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ForgeGuidance:
    """Where to put Prism's key for a particular repository."""

    forge: str
    deploy_key_url: Optional[str]
    account_key_url: Optional[str]
    instructions: str


def guidance_for(parsed: ParsedRemote) -> ForgeGuidance:
    """Describe how to grant Prism read access to one repository."""
    host = parsed.host.casefold()
    repo_path = parsed.path.strip("/").removesuffix(".git")
    forge = FORGES.get(host)

    if not forge:
        return ForgeGuidance(
            forge=host,
            deploy_key_url=None,
            account_key_url=None,
            instructions=(
                f"Add Prism's public key to {host} as a read-only deploy key on "
                f"{repo_path}, or to a machine user that has read access to it. "
                "Most self-hosted Git servers offer both under the repository's "
                "settings."
            ),
        )

    scheme = "https"
    deploy_key_url = f"{scheme}://{host}/{repo_path}{forge['deploy_key_path']}"
    return ForgeGuidance(
        forge=forge["name"],
        deploy_key_url=deploy_key_url,
        account_key_url=forge["account_key_url"],
        instructions=(
            f"On {forge['name']}, add Prism's public key to {repo_path} as a "
            f"read-only deploy key. A deploy key grants access to that one "
            f"repository only.\n\n"
            f"If this workspace imports several private repositories, add the key "
            f"to a dedicated machine user instead and give that user read access "
            f"to each one — {forge['name']} allows a deploy key to be used by only "
            f"one repository."
        ),
    )
