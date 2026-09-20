"""Reusable forge HTTP transport (TR-11, C3).

Release Studio keeps its own error mapping in ``forge_publish_service`` by
calling ``send`` with that module's ``requests.request`` (so existing tests
that patch it still apply) and translating 404 into “no such release”.

Tracker adapters use ``TrackerHttp``: allowlisted hosts, TLS verification,
bounded timeouts, Link/ETag/Retry-After headers, and typed ``ProviderError``
outcomes. Redirects are never followed with credentials. The transport never
retries; a POST/PUT/PATCH/DELETE timeout is ``transient`` with
``retryable=False`` so callers treat it as an ambiguous in-flight write (D2).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional
from urllib.parse import urlsplit

import requests

from app.services.forge_hosts import allowed_request_hosts
from app.services.trackers.errors import ProviderError, classify_read_status

TRACKER_TIMEOUT: tuple[float, float] = (5.0, 30.0)
RELEASE_TIMEOUT = 60
MAX_BODY_BYTES = 2 * 1024 * 1024
_LINK_PART = re.compile(r'<([^>]+)>\s*;\s*rel="?([^";,]+)"?', re.I)
Sender = Callable[..., Any]


@dataclass(frozen=True)
class ForgeHttpResponse:
    """Status, headers and body without collapsing provider outcomes."""

    status: int
    headers: dict[str, str]
    content: bytes
    url: str
    reason: str = ""
    raw: Any = None

    @property
    def status_code(self) -> int:
        return self.status

    @property
    def text(self) -> str:
        if self.content:
            return self.content.decode("utf-8", "replace")
        return str(getattr(self.raw, "text", "") or "")

    @property
    def etag(self) -> Optional[str]:
        return self.headers.get("etag") or None

    @property
    def retry_after(self) -> Optional[str]:
        return self.headers.get("retry-after") or None

    @property
    def location(self) -> Optional[str]:
        return self.headers.get("location") or None

    def json(self) -> Any:
        if self.raw is not None and hasattr(self.raw, "json"):
            try:
                return self.raw.json()
            except ValueError:
                raise
            except Exception:
                pass
        if not self.content:
            return {}
        return json.loads(self.content.decode("utf-8"))

    def links(self) -> dict[str, str]:
        return parse_link_header(self.headers.get("link") or "")

    def next_page(self) -> Optional[str]:
        return self.links().get("next")


def parse_link_header(value: str) -> dict[str, str]:
    """RFC 5988 ``Link`` relations, lowercased (``next``, ``last``, …)."""

    relations: dict[str, str] = {}
    for part in str(value or "").split(","):
        match = _LINK_PART.search(part)
        if match:
            relations[match.group(2).casefold()] = match.group(1).strip()
    return relations


def send(
    method: str,
    url: str,
    *,
    headers: Mapping[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    data: bytes | None = None,
    params: dict[str, Any] | None = None,
    timeout: float | tuple[float, float] = RELEASE_TIMEOUT,
    allow_redirects: bool = False,
    sender: Sender | None = None,
    verify: bool = True,
    max_body: int = MAX_BODY_BYTES,
) -> ForgeHttpResponse:
    """One HTTP attempt. Never retries. Never follows redirects unless asked.

    ``sender`` defaults to ``requests.request``. Release Studio passes the
    ``requests.request`` bound in *that* module so unit tests keep patching it.
    """

    dispatch = sender or requests.request
    response = dispatch(
        method,
        url,
        headers=dict(headers or {}),
        json=json_body,
        data=data,
        params=params,
        timeout=timeout,
        allow_redirects=allow_redirects,
        verify=verify,
    )
    headers_out = _headers_of(response)
    content = _content_of(response)
    if max_body and len(content) > max_body:
        raise requests.RequestException("forge response exceeded the configured body limit")
    return ForgeHttpResponse(
        status=int(getattr(response, "status_code", 0) or 0),
        headers=headers_out,
        content=content,
        url=str(getattr(response, "url", None) or url),
        reason=str(getattr(response, "reason", "") or ""),
        raw=response,
    )


class TrackerHttp:
    """Allowlisted tracker calls that classify 304/401/403/404/410/429/3xx."""

    def __init__(
        self,
        *,
        forge_hosts_raw: str = "",
        extra_hosts: tuple[str, ...] = (),
        timeout: float | tuple[float, float] = TRACKER_TIMEOUT,
        max_body: int = MAX_BODY_BYTES,
        verify: bool = True,
        sender: Sender | None = None,
    ) -> None:
        allowed = set(allowed_request_hosts(forge_hosts_raw))
        allowed.update(host.casefold() for host in extra_hosts if host)
        self._allowed = frozenset(allowed)
        self.timeout = timeout
        self.max_body = max_body
        self.verify = verify
        self._sender = sender or requests.request

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
        data: bytes | None = None,
        params: dict[str, Any] | None = None,
        etag: str | None = None,
    ) -> ForgeHttpResponse:
        self.require_allowed_url(url)
        hdrs = {str(key): str(value) for key, value in dict(headers or {}).items()}
        if etag:
            hdrs["If-None-Match"] = etag
        try:
            return send(
                method,
                url,
                headers=hdrs,
                json_body=json_body,
                data=data,
                params=params,
                timeout=self.timeout,
                allow_redirects=False,
                sender=self._sender,
                verify=self.verify,
                max_body=self.max_body,
            )
        except requests.Timeout as exc:
            if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
                raise ProviderError(
                    "transient",
                    "Request timed out; outcome unknown.",
                    retryable=False,
                ) from exc
            raise ProviderError("transient", "Request timed out.", retryable=True) from exc
        except requests.RequestException as exc:
            raise ProviderError("transient", "Forge could not be reached.") from exc

    def require_allowed_url(self, url: str) -> None:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").casefold()
        if parsed.scheme.casefold() != "https" or not host:
            raise ProviderError("invalid_request", "Tracker HTTP requires an https URL.")
        if parsed.username or parsed.password:
            raise ProviderError("invalid_request", "Tracker HTTP URLs cannot embed credentials.")
        if host not in self._allowed:
            raise ProviderError("forbidden", "Forge host is not allowlisted.")

    def classify(self, response: ForgeHttpResponse) -> str:
        retry_after = bool(response.retry_after) or _looks_like_secondary_limit(response)
        return classify_read_status(response.status, retry_after=retry_after)

    def outcome(self, response: ForgeHttpResponse) -> ForgeHttpResponse:
        """Return 2xx/304 as-is; raise a distinct ``ProviderError`` otherwise.

        3xx is ``moved`` only when Location is on an allowlisted host. The
        original Authorization header is never replayed onto Location.
        """

        kind = self.classify(response)
        if kind in {"ok", "not_modified"} or (200 <= response.status < 300):
            return response
        if kind == "moved":
            location = response.location or ""
            if not location:
                raise ProviderError("moved", "Forge redirected without a Location.", status=response.status)
            try:
                self.require_allowed_url(location)
            except ProviderError:
                raise ProviderError(
                    "forbidden",
                    "Forge redirected to a host that is not allowlisted.",
                    status=response.status,
                    new_ref=location,
                    retryable=False,
                ) from None
            raise ProviderError(
                "moved",
                "Forge resource moved.",
                status=response.status,
                new_ref=location,
            )
        resume = response.retry_after
        raise ProviderError(
            kind if kind in {
                "rate_limited",
                "auth_lost",
                "forbidden",
                "not_found_uncertain",
                "gone_confirmed",
                "transient",
                "invalid_request",
            } else "transient",
            _sanitized_reason(response, kind),
            status=response.status,
            resume_at=resume,
        )


def _looks_like_secondary_limit(response: ForgeHttpResponse) -> bool:
    if response.status != 403:
        return False
    if response.retry_after:
        return True
    text = response.text.casefold()
    return "secondary rate limit" in text or "exceeded a secondary rate limit" in text


def _sanitized_reason(response: ForgeHttpResponse, kind: str) -> str:
    return {
        "rate_limited": "Forge rate limit; retry after the advertised resume time.",
        "auth_lost": "Forge credentials were rejected.",
        "forbidden": "Forge refused access.",
        "not_found_uncertain": "Forge returned 404; deletion is not proven.",
        "gone_confirmed": "Forge confirmed the resource is gone.",
        "transient": "Forge request failed transiently.",
        "invalid_request": "Forge rejected the request.",
    }.get(kind, "Forge request failed.")


def _headers_of(response: Any) -> dict[str, str]:
    raw = getattr(response, "headers", None) or {}
    try:
        items = raw.items()
    except Exception:
        return {}
    return {str(key).casefold(): str(value) for key, value in items if value is not None}


def _content_of(response: Any) -> bytes:
    content = getattr(response, "content", None)
    if content is not None:
        return bytes(content)
    text = getattr(response, "text", None)
    if text is None:
        return b""
    return str(text).encode("utf-8", "replace")
