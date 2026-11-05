"""Running a supply service call from a route.

Supply's refusals are typed (``app.services.supply.errors``), so the one
``DomainError`` handler answers them and routes do not translate errors.
``run`` keeps the bridges for what is not typed yet: a bare ``ValueError`` or
``LookupError`` a service still raises for the caller, the credential keyring
and a provider that failed.
"""

from __future__ import annotations

import asyncio
from typing import Callable, TypeVar

from app.core.errors import DomainError, NotFound, Unavailable, UpstreamFailure, caller_error
from app.services.supply.providers.base import ProviderError
from app.services.trackers.secrets import SecretStoreLocked

T = TypeVar("T")


def _keyring(error: SecretStoreLocked) -> Unavailable:
    # "Not set" and "locked" need different fixes, and neither message carries key material.
    if "disabled" in str(error):
        return Unavailable("Credential encryption is not set up: TRACKER_CREDENTIAL_ROOT_KEY is empty on the server", code="keyring_locked")
    return Unavailable("Credential encryption is locked", code="keyring_locked")


async def run_supply(
    call: Callable[[], T],
    *,
    invalid: str | None = None,
    invalid_status: int = 400,
    missing: bool = False,
    upstream: bool | str = False,
) -> T:
    """``call`` in a worker thread, its untyped refusals answered like typed ones.

    ``invalid`` names the code a bare ``ValueError`` gets (status ``invalid_status``),
    ``missing`` answers a bare ``LookupError`` 404, and ``upstream`` answers a
    provider failure 502 with the provider's message (``True``) or this one.
    Anything else propagates, and its text never reaches the client.
    """

    try:
        return await asyncio.to_thread(call)
    except DomainError:
        raise
    except SecretStoreLocked as error:
        raise _keyring(error) from error
    except ProviderError as error:
        if upstream is False:
            raise
        raise UpstreamFailure(str(error) if upstream is True else upstream, code=error.code) from error
    except LookupError as error:
        if not missing:
            raise
        raise NotFound() from error
    except ValueError as error:
        if invalid is None:
            raise
        refusal = caller_error(error, invalid_status)
        refusal.code = invalid
        raise refusal from error

