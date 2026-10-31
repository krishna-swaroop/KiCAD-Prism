"""What every adapter that calls a web API shares, so an adapter only maps the distributor's answers.

``HttpProvider`` holds the HTTP client (it reaches only the spec's ``hosts``, and reports the limits a service states), the
pacer the connectors of one account share, the clocks, and ``calls``: every request it made, token requests and repeats
included, which the poller and the discoverer charge to the budget beyond what they paid for up front.
``ClientCredentials`` is the OAuth 2.0 client-credentials token most of them use, kept until shortly before it expires;
``HttpProvider.authorised`` asks for a new one once when the service refuses the one it had.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Callable, Mapping

from app.services.supply import clock as supply_clock
from app.services.supply import pacing
from app.services.supply.http_client import SafeHttpClient
from app.services.supply.providers.base import AuthError, ProviderConfig

# A token is renewed this long before the service says it expires, so a call never carries one that lapses on the way.
TOKEN_MARGIN_SECONDS = 60


class HttpProvider:
    def __init__(
        self,
        config: ProviderConfig,
        *,
        hosts: tuple[str, ...],
        pace_seconds: float,
        client: SafeHttpClient | None = None,
        clock: Callable[[], datetime] | None = None,
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = client or SafeHttpClient(hosts)
        if config.on_limits is not None:
            self._client.on_limits = config.on_limits
        self._clock = clock or supply_clock.now
        self._monotonic = monotonic
        self._sleep = sleep
        self._pacer = pacing.pacer_for(config.account, pace_seconds, monotonic=monotonic, sleep=sleep)
        # Every request made, answered or not.
        self.calls = 0

    def seconds(self) -> float:
        """The provider's monotonic clock, for what expires (a token)."""

        return self._monotonic()

    def request(self, method: str, url: str, *, paced: bool = True, **kwargs: Any) -> Any:
        """One request, spaced from the account's others (``paced``), its JSON answer."""

        if paced:
            self._pacer.wait()
        self.calls += 1
        return self._client.request_json(method, url, **kwargs)

    def authorised(self, token: "ClientCredentials", method: str, url: str, headers: Callable[[str], Mapping[str, str]], **kwargs: Any) -> Any:
        """A request carrying ``token`` (``headers`` builds the headers from it). When the service refuses it, the token may have
        lapsed or been revoked early: one new token and the request again, then the refusal stands."""

        first = headers(token.get(self))
        try:
            return self.request(method, url, headers=first, **kwargs)
        except AuthError:
            return self.request(method, url, headers=headers(token.get(self, renew=True)), **kwargs)


class ClientCredentials:
    """An OAuth 2.0 client-credentials token. ``form`` is what the token request posts (with ``grant_type``), ``headers`` what it
    sends (a Basic header, for a service that wants the credentials there); ``missing`` says which credentials are missing, when
    any are, so the first call fails with an ``AuthError`` the poller acts on."""

    def __init__(
        self, url: str, *, form: Mapping[str, str], headers: Mapping[str, str] | None = None, missing: str = "",
        label: str = "The service", default_life: float = 600, margin: float = TOKEN_MARGIN_SECONDS,
    ) -> None:
        self._url = url
        self._form = {"grant_type": "client_credentials", **form}
        self._headers = dict(headers or {})
        self._missing = missing
        self._label = label
        self._default_life = default_life
        self._margin = margin
        self._token = ""
        self._expires_at = 0.0

    def get(self, provider: HttpProvider, *, renew: bool = False) -> str:
        if self._missing:
            raise AuthError(self._missing)
        if renew or not self._token or provider.seconds() >= self._expires_at:
            answer = provider.request("POST", self._url, paced=False, form=self._form, headers=self._headers or None)
            token = answer.get("access_token") if isinstance(answer, dict) else None
            if not token:
                raise AuthError(f"{self._label} did not issue an access token")
            self._token = str(token)
            life = float(answer.get("expires_in") or self._default_life)
            self._expires_at = provider.seconds() + max(life - self._margin, 1)
        return self._token
