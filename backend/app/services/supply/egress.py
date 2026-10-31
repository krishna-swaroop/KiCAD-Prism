"""Outbound URL checks for supply fetches.

Prism calls addresses a provider's configuration names, so every
outbound request is validated first: HTTPS only, port 443, no credentials in
the URL, no literal IP hosts, a host on the allowlist when one applies, and
every address the name resolves to must be public. A host an administrator
lists as private (an inventory server on their own network) may also use any
port and a private address. Callers re-run the check on each redirect.

``validate_url`` returns the addresses it checked. The HTTP client must
connect to one of those addresses rather than resolving the name again, or a
DNS answer that changes between check and connect defeats the check.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from typing import Callable, Collection
from urllib.parse import urlsplit

Resolver = Callable[[str], list[str]]


class EgressDenied(ValueError):
    """The URL may not be fetched. The message is safe to log."""


@dataclass(frozen=True, slots=True)
class ValidatedTarget:
    url: str
    host: str
    addresses: tuple[str, ...]
    # The URL's port when it names one other than 443 (only a listed private host may).
    port: int | None = None


def system_resolver(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise EgressDenied(f"cannot resolve {host}") from exc
    return sorted({info[4][0] for info in infos})


def host_allowed(host: str, allowed_hosts: Collection[str]) -> bool:
    """Exact match or subdomain match: ``api.digikey.com`` is allowed by ``digikey.com``."""

    host = host.lower().rstrip(".")
    for entry in allowed_hosts:
        entry = entry.lower().strip().rstrip(".")
        if entry and (host == entry or host.endswith("." + entry)):
            return True
    return False


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _is_private_network(address: str) -> bool:
    """A private or loopback address, never link-local (cloud metadata), multicast, reserved or unspecified."""

    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        return False
    return ip.is_private or ip.is_loopback


def validate_url(
    url: str,
    *,
    allowed_hosts: Collection[str] | None = None,
    resolve: Resolver = system_resolver,
    check_addresses: bool = True,
    private_hosts: Collection[str] = (),
) -> ValidatedTarget:
    """Check ``url`` and return the addresses it resolved to.

    ``allowed_hosts=None`` means any public host, for links a distributor
    hands back. Provider API calls always pass their own host list.

    ``check_addresses=False`` is for traffic that goes through a configured proxy:
    the proxy resolves the name, so there are no addresses to check here.

    A host in ``private_hosts`` (an operator's own inventory server) may also
    resolve to a private network address and use any port.
    """

    parts = urlsplit(url.strip())
    if parts.scheme != "https":
        raise EgressDenied("only https URLs are allowed")
    if parts.username is not None or parts.password is not None:
        raise EgressDenied("credentials in the URL are not allowed")
    try:
        port = parts.port
    except ValueError as exc:
        raise EgressDenied("invalid port") from exc
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise EgressDenied("URL has no host")
    private_ok = bool(private_hosts) and host_allowed(host, private_hosts)
    if port not in (None, 443) and not private_ok:
        raise EgressDenied("only port 443 is allowed")
    port = None if port == 443 else port
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise EgressDenied("IP address hosts are not allowed")
    if allowed_hosts is not None and not host_allowed(host, allowed_hosts):
        raise EgressDenied(f"host is not on the allowlist: {host}")

    if not check_addresses:
        return ValidatedTarget(url=url.strip(), host=host, addresses=(), port=port)
    addresses = resolve(host)
    if not addresses:
        raise EgressDenied(f"cannot resolve {host}")
    for address in addresses:
        if not (_is_public(address) or (private_ok and _is_private_network(address))):
            raise EgressDenied(f"{host} resolves to a non-public address")
    return ValidatedTarget(url=url.strip(), host=host, addresses=tuple(addresses), port=port)
