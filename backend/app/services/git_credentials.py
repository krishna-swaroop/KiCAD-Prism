"""HTTPS Git credentials, each bound to one URL prefix.

``GITHUB_TOKEN`` always covers ``https://github.com/``. ``PRISM_GIT_CREDENTIALS``
adds more, as a JSON array of ``{"url_prefix", "token_name"}`` objects with an
optional ``username``; the token is read from the environment variable the
entry names, so the setting itself holds no secret.

A prefix is the scheme, host, optional port and optional path of the remotes
it applies to, ending in ``/``. The trailing slash is what makes the match
exact: Git's ``insteadOf`` is a plain string prefix, so ``https://github.com``
without it would also match ``https://github.com.evil.test/``. Scheme, host and
port are compared as written, so ``http://`` never matches an ``https://``
prefix and ``:8443`` never matches the default port.

Release publishing has its own registry (``forge_hosts``); this one is only
Git transport: clone, fetch, ``ls-remote`` and push.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import quote, urlsplit

from app.core.config import configured_value, settings

GITHUB_PREFIX = "https://github.com/"

_ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_FIELDS = {"url_prefix", "token_name", "username"}


class GitCredentialConfigError(ValueError):
    """PRISM_GIT_CREDENTIALS is not a valid credential list."""


@dataclass(frozen=True)
class GitCredential:
    url_prefix: str
    token_name: str
    token: str = field(repr=False)
    username: Optional[str] = None

    @property
    def path_scoped(self) -> bool:
        """True when the prefix names a path, not a whole server."""
        return urlsplit(self.url_prefix).path != "/"

    @property
    def insecure(self) -> bool:
        return self.url_prefix.startswith("http://")

    def authenticated_prefix(self) -> str:
        """``url_prefix`` with the token as its userinfo, for ``insteadOf``."""
        scheme, rest = self.url_prefix.split("://", 1)
        secret = quote(self.token, safe="")
        userinfo = f"{quote(self.username, safe='')}:{secret}" if self.username else secret
        return f"{scheme}://{userinfo}@{rest}"


def _normalize_prefix(value: object, index: int) -> str:
    where = f"PRISM_GIT_CREDENTIALS entry {index}"
    if not isinstance(value, str) or not value.strip():
        raise GitCredentialConfigError(f"{where} needs a url_prefix")
    candidate = value.strip()
    try:
        split = urlsplit(candidate)
        port = split.port
    except ValueError as error:
        raise GitCredentialConfigError(f"{where} url_prefix is not a valid URL") from error
    scheme = split.scheme.casefold()
    if scheme not in {"https", "http"}:
        raise GitCredentialConfigError(f"{where} url_prefix must start with https:// (or http://)")
    if not split.hostname or "*" in split.netloc:
        raise GitCredentialConfigError(f"{where} url_prefix needs a host")
    if split.username is not None or split.password is not None or "@" in split.netloc:
        raise GitCredentialConfigError(
            f"{where} url_prefix must not contain credentials; name the token with token_name"
        )
    if split.query or split.fragment or "?" in candidate or "#" in candidate:
        raise GitCredentialConfigError(f"{where} url_prefix must not have a query or fragment")
    if not split.path.endswith("/"):
        raise GitCredentialConfigError(
            f"{where} url_prefix must end with '/', so it cannot match a longer host name"
        )
    if scheme == "http" and not settings.IMPORT_ALLOW_INSECURE_HTTP:
        raise GitCredentialConfigError(
            f"{where} url_prefix is http://, which needs IMPORT_ALLOW_INSECURE_HTTP=true"
        )
    host = split.hostname
    if ":" in host:
        host = f"[{host}]"
    netloc = f"{host}:{port}" if port is not None else host
    return f"{scheme}://{netloc}{split.path}"


def _parse_entry(item: object, index: int) -> GitCredential:
    where = f"PRISM_GIT_CREDENTIALS entry {index}"
    if not isinstance(item, dict):
        raise GitCredentialConfigError(f"{where} must be an object")
    unknown = set(item) - _FIELDS
    if unknown:
        raise GitCredentialConfigError(
            f"{where} has unsupported fields: {', '.join(sorted(unknown))}"
        )
    prefix = _normalize_prefix(item.get("url_prefix"), index)
    token_name = item.get("token_name")
    if not isinstance(token_name, str) or not _ENV_NAME_RE.fullmatch(token_name.strip()):
        raise GitCredentialConfigError(
            f"{where} token_name must be an environment variable name"
        )
    token_name = token_name.strip()
    username = item.get("username")
    if username is not None and (not isinstance(username, str) or not username.strip()):
        raise GitCredentialConfigError(f"{where} username must be a non-empty string")
    token = configured_value(token_name).strip()
    if not token:
        raise GitCredentialConfigError(
            f"{where} names {token_name} for {prefix}, but {token_name} is not set"
        )
    return GitCredential(
        url_prefix=prefix,
        token_name=token_name,
        token=token,
        username=username.strip() if username else None,
    )


def parse_git_credentials(raw: str) -> list[GitCredential]:
    """The entries ``raw`` (PRISM_GIT_CREDENTIALS) lists, validated."""
    if not raw.strip():
        return []
    try:
        items = json.loads(raw)
    except json.JSONDecodeError as error:
        # The position, not the message: json echoes nothing secret, but keep
        # the setting's text out of errors anyway.
        raise GitCredentialConfigError(
            f"PRISM_GIT_CREDENTIALS is not valid JSON (line {error.lineno}, column {error.colno})"
        ) from None
    if not isinstance(items, list):
        raise GitCredentialConfigError("PRISM_GIT_CREDENTIALS must be a JSON array of objects")
    credentials: list[GitCredential] = []
    seen: set[str] = set()
    for index, item in enumerate(items):
        credential = _parse_entry(item, index)
        if credential.url_prefix == GITHUB_PREFIX:
            raise GitCredentialConfigError(
                f"PRISM_GIT_CREDENTIALS entry {index} cannot redefine {GITHUB_PREFIX}; "
                "set GITHUB_TOKEN instead"
            )
        if credential.url_prefix in seen:
            raise GitCredentialConfigError(
                f"PRISM_GIT_CREDENTIALS lists {credential.url_prefix} more than once"
            )
        seen.add(credential.url_prefix)
        credentials.append(credential)
    return credentials


def git_credentials() -> list[GitCredential]:
    """Every credential this deployment has: GitHub's default, then the list."""
    credentials: list[GitCredential] = []
    github_token = settings.GITHUB_TOKEN.strip()
    if github_token:
        credentials.append(
            GitCredential(url_prefix=GITHUB_PREFIX, token_name="GITHUB_TOKEN", token=github_token)
        )
    credentials.extend(parse_git_credentials(settings.PRISM_GIT_CREDENTIALS))
    return credentials


def credential_for_url(url: str) -> Optional[GitCredential]:
    """The credential Git will use for ``url``: the longest matching prefix."""
    matches = [item for item in git_credentials() if url.startswith(item.url_prefix)]
    return max(matches, key=lambda item: len(item.url_prefix), default=None)


def configuration_warnings() -> list[str]:
    """Credentials that will travel in cleartext. Never names a token's value."""
    return [
        f"PRISM_GIT_CREDENTIALS sends {item.token_name} to {item.url_prefix} over "
        "plain HTTP, where anyone on the network path can read it."
        for item in git_credentials()
        if item.insecure
    ]


def verify_git_credentials_or_exit(process: str) -> None:
    """Refuse to start ``process`` with a credential list Git cannot use.

    A broken list found at the first clone would show up as a failed import
    with a misleading credentials message; at startup it names the entry.
    """
    try:
        git_credentials()
    except GitCredentialConfigError as error:
        print(f"\n{process} did not start: {error}\n", file=sys.stderr, flush=True)
        raise SystemExit(3) from None
