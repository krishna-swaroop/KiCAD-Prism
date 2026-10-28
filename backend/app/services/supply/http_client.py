"""Guarded HTTP for supply providers.

Every request goes through ``egress.validate_url`` first, on every redirect
hop, and the connection is made to an address that passed the check. The name
is not resolved a second time, so a DNS answer that changes between check and
connect cannot redirect the request. Certificates are verified against the
original host name.

The environment's proxy settings are ignored on purpose: a proxy would resolve
the name itself and bypass the pin. A proxy is used only when
``SUPPLY_HTTPS_PROXY`` is set. Then the proxy resolves names, so the host
allowlist still applies but the address check cannot, and the operator is
trusting the proxy for that part.

Error messages carry the host and path only. Query strings often hold API keys,
so they never appear in messages or logs.
"""

from __future__ import annotations

import json as jsonlib
import re
from dataclasses import dataclass
from typing import Any, Callable, Collection, Mapping, Protocol, Sequence
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit

import requests
from requests.adapters import HTTPAdapter

from app.services.supply.egress import EgressDenied, Resolver, ValidatedTarget, system_resolver, validate_url
from app.services.supply.providers.base import (
    AuthError,
    Blocked,
    EgressBlocked,
    HostDenied,
    NotFound,
    ProviderError,
    RateLimited,
    ResponseTooLarge,
    Unavailable,
)

DEFAULT_MAX_BYTES = 5 * 1024 * 1024
DEFAULT_TIMEOUT = (5.0, 20.0)
MAX_REDIRECTS = 3
MAX_RETRY_AFTER_SECONDS = 3600
USER_AGENT = "KiCAD-Prism-Supply/1"
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
# Kept when a redirect leaves the original host. Everything else is dropped.
_PORTABLE_HEADERS = frozenset({"accept", "user-agent"})


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes

    @property
    def is_page(self) -> bool:
        """A web page, which no API of ours answers with: a block, a challenge or a login wall."""

        if "html" in self.headers.get("content-type", "").lower():
            return True
        return self.body[:512].lstrip().lower().startswith((b"<!doctype html", b"<html"))

    def json(self) -> Any:
        if self.is_page:
            raise Blocked("the service answered a web page where data was expected")
        try:
            return jsonlib.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ProviderError("the response was not valid JSON") from None


class ConnectFailed(Exception):
    """No validated address accepted the connection."""


class Transport(Protocol):
    def send(
        self,
        *,
        method: str,
        target: ValidatedTarget,
        headers: Mapping[str, str],
        body: bytes | None,
        timeout: tuple[float, float],
        max_bytes: int,
    ) -> HttpResponse:
        """Send to ``target``, connecting only to ``target.addresses``.

        Raises ``ConnectFailed``, ``ResponseTooLarge`` or ``requests.Timeout``.
        """


class _PinnedAdapter(HTTPAdapter):
    """Connect to an IP while verifying the certificate and SNI for ``host``."""

    def __init__(self, host: str) -> None:
        self._host = host
        super().__init__()

    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        pool_kwargs["server_hostname"] = self._host
        pool_kwargs["assert_hostname"] = self._host
        super().init_poolmanager(connections, maxsize, block=block, **pool_kwargs)


class RequestsTransport:
    """Sends with ``requests``. Connections are kept open per address for the life of the transport (a job), so a run of
    calls to one host does not set up a new TLS connection each time."""

    def __init__(self, proxy: str = "") -> None:
        self._proxy = proxy.strip()
        self._sessions: dict[tuple[str, str], requests.Session] = {}

    def _session(self, host: str, address: str) -> requests.Session:
        session = self._sessions.get((host, address))
        if session is None:
            session = requests.Session()
            session.trust_env = False
            session.mount("https://", _PinnedAdapter(host))
            self._sessions[(host, address)] = session
        return session

    def close(self) -> None:
        for session in self._sessions.values():
            session.close()
        self._sessions.clear()

    @property
    def proxied(self) -> bool:
        return bool(self._proxy)

    def send(self, *, method, target, headers, body, timeout, max_bytes) -> HttpResponse:
        if self._proxy:
            return self._send_via_proxy(method, target, headers, body, timeout, max_bytes)
        parts = urlsplit(target.url)
        for address in target.addresses:
            netloc = f"[{address}]" if ":" in address else address
            pinned = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))
            session = self._session(target.host, address)
            try:
                response = session.request(
                    method, pinned, headers={**headers, "Host": target.host}, data=body,
                    timeout=timeout, allow_redirects=False, stream=True,
                )
            except requests.ConnectionError:
                session.close()
                self._sessions.pop((target.host, address), None)
                continue
            with response:
                return HttpResponse(
                    status=response.status_code,
                    headers={key.lower(): value for key, value in response.headers.items()},
                    body=_read_capped(response, max_bytes),
                )
        raise ConnectFailed(target.host)


    def _send_via_proxy(self, method, target, headers, body, timeout, max_bytes) -> HttpResponse:
        """Send through the configured proxy. The proxy resolves the name; the certificate is still verified."""

        with requests.Session() as session:
            session.trust_env = False
            session.proxies = {"https": self._proxy}
            try:
                response = session.request(
                    method, target.url, headers=headers, data=body,
                    timeout=timeout, allow_redirects=False, stream=True,
                )
            except requests.ConnectionError:
                raise ConnectFailed(target.host) from None
            with response:
                return HttpResponse(
                    status=response.status_code,
                    headers={key.lower(): value for key, value in response.headers.items()},
                    body=_read_capped(response, max_bytes),
                )


def _read_capped(response: requests.Response, max_bytes: int) -> bytes:
    declared = response.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        raise ResponseTooLarge("the response is too large")
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(65536):
        total += len(chunk)
        if total > max_bytes:
            raise ResponseTooLarge("the response is too large")
        chunks.append(chunk)
    return b"".join(chunks)


def _label(url: str) -> str:
    """Host and path only; never the query."""

    parts = urlsplit(url)
    return f"{parts.hostname}{parts.path}"


# Headers that report a limit, what is left of it, or when it resets. Only these are kept, as short text, never the rest.
_LIMIT_HINTS = ("ratelimit", "rate-limit", "quota", "remaining", "retry-after")
_LIMIT_VALUE = re.compile(r"^[\w .,:;/+=()-]{1,64}$")
# A provider that answers a refusal with a negative count or the 1970 epoch says nothing; such values are left out.
_LIMIT_NONSENSE = re.compile(r"^(-\d+|1970-01-01.*)$")
MAX_LIMIT_HEADERS = 12


def limit_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """The headers of an answer that say something about rate limits, by lower-case name."""

    found: dict[str, str] = {}
    for name, value in headers.items():
        key = name.lower()
        text = str(value).strip()
        if any(hint in key for hint in _LIMIT_HINTS) and _LIMIT_VALUE.match(text) and not _LIMIT_NONSENSE.match(text):
            found[key] = str(value).strip()
        if len(found) >= MAX_LIMIT_HEADERS:
            break
    return found


def _retry_after(headers: Mapping[str, str]) -> int | None:
    value = headers.get("retry-after", "").strip()
    if not value.isdigit():
        return None
    return min(int(value), MAX_RETRY_AFTER_SECONDS)


class SafeHttpClient:
    """``allowed_hosts=None`` allows any public host (links a distributor hands back)."""

    def __init__(
        self,
        allowed_hosts: Collection[str] | None,
        *,
        transport: Transport | None = None,
        resolve: Resolver = system_resolver,
        max_bytes: int = DEFAULT_MAX_BYTES,
        timeout: tuple[float, float] = DEFAULT_TIMEOUT,
        max_redirects: int = MAX_REDIRECTS,
        host_denied: Callable[[str], bool] | None = None,
        private_hosts: Collection[str] = (),
    ) -> None:
        self._host_denied = host_denied
        self._private_hosts = tuple(private_hosts)
        self._allowed = None if allowed_hosts is None else tuple(allowed_hosts)
        if transport is None:
            from app.core.config import settings

            transport = RequestsTransport(settings.SUPPLY_HTTPS_PROXY)
        self._transport = transport
        self._resolve = resolve
        self._max_bytes = max_bytes
        self._timeout = timeout
        self._max_redirects = max_redirects
        # What the last answer that reported any limits said (see ``limit_headers``).
        self.last_limits: dict[str, str] = {}
        # Called with the limit headers of every answer that has any, and the address that answered.
        self.on_limits: Callable[[dict[str, str], str], None] | None = None

    def request(
        self,
        method: str,
        url: str,
        *,
        # A sequence of pairs repeats a key (symbols[]=a&symbols[]=b), as some APIs want.
        params: Mapping[str, str] | Sequence[tuple[str, str]] | None = None,
        headers: Mapping[str, str] | None = None,
        json: Any = None,
        form: Mapping[str, str] | None = None,
    ) -> HttpResponse:
        if json is not None and form is not None:
            raise ValueError("pass json or form, not both")
        method = method.upper()
        if params:
            separator = "&" if urlsplit(url).query else "?"
            url = f"{url}{separator}{urlencode(params)}"
        send_headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})}
        body: bytes | None = None
        if json is not None:
            body = jsonlib.dumps(json).encode("utf-8")
            send_headers.setdefault("Content-Type", "application/json")
        elif form is not None:
            body = urlencode(form).encode("utf-8")
            send_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

        for _hop in range(self._max_redirects + 1):
            if self._host_denied is not None and self._host_denied((urlsplit(url).hostname or "").lower()):
                raise HostDenied(_label(url))
            response = self._send_once(method, url, send_headers, body)
            if response.status not in _REDIRECT_STATUSES:
                found = limit_headers(response.headers)
                if found:
                    self.last_limits = found
                    if self.on_limits is not None:
                        self.on_limits(found, url)
                return self._checked(response, url)
            location = response.headers.get("location", "")
            if not location:
                raise ProviderError("redirect without a location")
            next_url = urljoin(url, location)
            if urlsplit(next_url).hostname != urlsplit(url).hostname:
                send_headers = {
                    key: value for key, value in send_headers.items() if key.lower() in _PORTABLE_HEADERS
                }
            if response.status == 303 or (response.status in (301, 302) and method == "POST"):
                method, body = "GET", None
                send_headers = {k: v for k, v in send_headers.items() if k.lower() != "content-type"}
            url = next_url
        raise ProviderError("too many redirects")

    def close(self) -> None:
        close = getattr(self._transport, "close", None)
        if close is not None:
            close()

    def request_json(self, method: str, url: str, **kwargs: Any) -> Any:
        return self.request(method, url, **kwargs).json()

    def _send_once(self, method: str, url: str, headers: Mapping[str, str], body: bytes | None) -> HttpResponse:
        try:
            target = validate_url(
                url, allowed_hosts=self._allowed, resolve=self._resolve,
                check_addresses=not getattr(self._transport, "proxied", False),
                private_hosts=self._private_hosts,
            )
        except EgressDenied as exc:
            raise EgressBlocked(str(exc)) from None
        try:
            return self._transport.send(
                method=method, target=target, headers=headers, body=body,
                timeout=self._timeout, max_bytes=self._max_bytes,
            )
        except ConnectFailed:
            raise Unavailable(f"cannot connect to {target.host}") from None
        except requests.Timeout:
            raise Unavailable(f"timed out calling {_label(url)}") from None
        except requests.RequestException:
            raise Unavailable(f"request to {_label(url)} failed") from None

    @staticmethod
    def _checked(response: HttpResponse, url: str) -> HttpResponse:
        status = response.status
        if status in (401, 403, 429) and response.is_page:
            raise Blocked(f"{_label(url)} answered a web page (HTTP {status})")
        if status in (401, 403):
            raise AuthError(f"{_label(url)} rejected the credentials (HTTP {status})")
        if status == 429:
            raise RateLimited(f"{_label(url)} is rate limiting (HTTP 429)", retry_after_seconds=_retry_after(response.headers))
        if status == 408 or status >= 500:
            raise Unavailable(f"{_label(url)} is unavailable (HTTP {status})")
        if status == 404:
            raise NotFound(f"{_label(url)} has nothing there (HTTP 404)")
        if status >= 400:
            raise ProviderError(f"{_label(url)} rejected the request (HTTP {status})")
        return response
