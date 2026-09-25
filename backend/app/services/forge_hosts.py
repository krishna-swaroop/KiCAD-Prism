"""Explicit forge-host registry for Release publishing.

Hosts are never inferred from name substrings. github.com and gitlab.com are
always registered; additional GitLab hosts must be listed in PRISM_FORGE_HOSTS.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal, Mapping
from urllib.parse import urlsplit

ForgeKind = Literal["github", "gitlab"]

_HOST_RE = re.compile(
    r"^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)
_PAIR_RE = re.compile(r"^([^=]+)=([^=]+)$")
_ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class ForgeHost:
    host: str
    kind: ForgeKind
    api_root: str
    token_name: str
    display_name: str


_DEFAULT_HOSTS: tuple[ForgeHost, ...] = (
    ForgeHost(
        host="github.com",
        kind="github",
        api_root="https://api.github.com",
        token_name="GITHUB_TOKEN",
        display_name="GitHub",
    ),
    ForgeHost(
        host="gitlab.com",
        kind="gitlab",
        api_root="https://gitlab.com/api/v4",
        token_name="GITLAB_TOKEN",
        display_name="GitLab",
    ),
)


class ForgeHostConfigError(ValueError):
    """PRISM_FORGE_HOSTS is not a valid forge-host configuration."""


def default_forge_hosts() -> dict[str, ForgeHost]:
    return {item.host: item for item in _DEFAULT_HOSTS}


def parse_forge_hosts(raw: str) -> dict[str, ForgeHost]:
    """Return built-in hosts plus validated configured forge hosts.

    The original comma-separated ``host=gitlab`` form remains supported. A
    JSON array can provide per-host API roots and token environment-variable
    names, for example::

        [{"host":"git.acme.test","kind":"gitlab",
          "api_root":"https://git.acme.test/api/v4",
          "token_name":"ACME_GITLAB_TOKEN"}]
    """

    hosts = default_forge_hosts()
    candidate = str(raw or "").strip()
    if not candidate:
        return hosts
    structured = candidate.startswith("[") or candidate.startswith("{")
    if structured:
        entries = _parse_structured_entries(candidate)
    else:
        entries = [
            {
                "host": part.split("=", 1)[0].strip() if "=" in part else None,
                "kind": part.split("=", 1)[1].strip() if "=" in part else None,
                "api_root": None,
                "token_name": None,
            }
            for part in _split_pairs(candidate)
        ]
        for index, part in enumerate(_split_pairs(candidate), start=1):
            if _PAIR_RE.match(part) is None:
                raise ForgeHostConfigError(
                    f"PRISM_FORGE_HOSTS entry {index} must be host=gitlab"
                )

    for index, entry in enumerate(entries, start=1):
        host = _require_host(entry.get("host"), index=index)
        _require_kind(entry.get("kind"), index=index)
        if host in hosts:
            raise ForgeHostConfigError(
                f"PRISM_FORGE_HOSTS cannot redefine {host}; built-in hosts stay as they are"
            )
        api_root = entry.get("api_root")
        token_name = entry.get("token_name")
        if structured and (api_root is None or token_name is None):
            raise ForgeHostConfigError(
                f"PRISM_FORGE_HOSTS entry {index} must define api_root and token_name"
            )
        if api_root is None:
            api_root = f"https://{host}/api/v4"
        else:
            api_root = _require_api_root(api_root, index=index)
        if token_name is None:
            token_name = "GITLAB_TOKEN"
        else:
            token_name = _require_token_name(token_name, index=index)
        hosts[host] = ForgeHost(
            host=host,
            kind="gitlab",
            api_root=api_root,
            token_name=token_name,
            display_name="GitLab",
        )
    return hosts


def resolve_forge_host(
    hostname: str,
    raw_extra: str,
    *,
    registry: Mapping[str, ForgeHost] | None = None,
) -> ForgeHost | None:
    hosts = registry if registry is not None else parse_forge_hosts(raw_extra)
    return hosts.get(hostname.casefold())


def allowed_request_hosts(raw_extra: str) -> frozenset[str]:
    """Hosts the tracker HTTP client may contact, including registered API roots."""
    hosts = parse_forge_hosts(raw_extra)
    allowed = set(hosts)
    for item in hosts.values():
        hostname = urlsplit(item.api_root).hostname
        if hostname:
            allowed.add(hostname.casefold())
    return frozenset(allowed)


def _parse_structured_entries(raw: str) -> list[dict[str, object]]:
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS structured form must be a JSON array of objects"
        ) from exc
    if not isinstance(payload, list):
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS structured form must be a JSON array of objects"
        )
    entries: list[dict[str, object]] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise ForgeHostConfigError(
                f"PRISM_FORGE_HOSTS entry {index} must be an object"
            )
        if "host" not in item or "kind" not in item:
            raise ForgeHostConfigError(
                f"PRISM_FORGE_HOSTS entry {index} must define host and kind"
            )
        unknown = set(item) - {"host", "kind", "api_root", "token_name"}
        if unknown:
            raise ForgeHostConfigError(
                f"PRISM_FORGE_HOSTS entry {index} contains unsupported fields"
            )
        entries.append(dict(item))
    return entries


def _split_pairs(raw: str) -> list[str]:
    return [part.strip() for part in str(raw or "").split(",") if part.strip()]


def _require_host(value: object, *, index: int | None = None) -> str:
    if not isinstance(value, str):
        entry = f" entry {index}" if index is not None else ""
        raise ForgeHostConfigError(
            f"PRISM_FORGE_HOSTS{entry} host must be a bare hostname"
        )
    host = value.strip().casefold().removeprefix("[").removesuffix("]")
    if host.startswith("http://") or host.startswith("https://") or "/" in host or ":" in host:
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS hosts must be bare hostnames, not URLs"
        )
    if not _HOST_RE.match(host):
        raise ForgeHostConfigError("PRISM_FORGE_HOSTS host is not a valid hostname")
    return host


def _require_kind(value: object, *, index: int | None = None) -> ForgeKind:
    kind = value.strip().casefold() if isinstance(value, str) else ""
    if kind != "gitlab":
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS kinds must be gitlab"
        )
    return "gitlab"


def _require_api_root(value: object, *, index: int | None = None) -> str:
    if not isinstance(value, str):
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS api_root must be an HTTPS URL"
        )
    candidate = value.strip()
    try:
        parsed = urlsplit(candidate)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as exc:
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS api_root must be a valid HTTPS URL"
        ) from exc
    if (
        parsed.scheme.casefold() != "https"
        or not parsed.netloc
        or hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or any(character.isspace() for character in candidate)
    ):
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS api_root must be HTTPS without credentials, query, or fragment"
        )
    _require_host(hostname, index=index)
    return candidate.rstrip("/")


def _require_token_name(value: object, *, index: int | None = None) -> str:
    if not isinstance(value, str) or not _ENV_NAME_RE.fullmatch(value.strip()):
        raise ForgeHostConfigError(
            "PRISM_FORGE_HOSTS token_name must be a valid environment variable name"
        )
    return value.strip()
