"""Provider lookup. Built-ins register at import; plugins load on request.

Plugins use the ``prism.supply_providers`` entry point. Each entry point
loads a ``ProviderSpec`` or a callable returning one or several. A plugin
that fails to load is logged and skipped; it never stops startup.
"""

from __future__ import annotations

import logging
import threading
from importlib.metadata import entry_points
from typing import Iterable

from app.services.supply.providers import arrow, avnet, csv_provider, digikey, fake, farnell, jlcpcb, lcsc, mouser, tme
from app.services.supply.providers.base import ProviderSpec

logger = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "prism.supply_providers"


class UnknownProvider(KeyError):
    """No provider is registered under this key."""


_specs: dict[str, ProviderSpec] = {}
_plugins_loaded = False
_lock = threading.Lock()


def register(spec: ProviderSpec, *, replace: bool = False) -> None:
    with _lock:
        if spec.key in _specs and not replace:
            raise ValueError(f"provider already registered: {spec.key}")
        _specs[spec.key] = spec


def unregister(key: str) -> None:
    with _lock:
        _specs.pop(key, None)


def get_spec(key: str) -> ProviderSpec:
    try:
        return _specs[key]
    except KeyError:
        raise UnknownProvider(key) from None


def is_simulated(key: str) -> bool:
    """Whether a provider only makes figures up (the Simulated market): its prices and stock are test data, marked wherever they show."""

    spec = _specs.get(key)
    return bool(spec and spec.dev_only)


def list_specs(*, include_dev: bool = False) -> list[ProviderSpec]:
    return sorted(
        (spec for spec in _specs.values() if include_dev or not spec.dev_only),
        key=lambda spec: spec.label.lower(),
    )


def _as_specs(loaded: object) -> Iterable[ProviderSpec]:
    if callable(loaded) and not isinstance(loaded, ProviderSpec):
        loaded = loaded()
    if isinstance(loaded, ProviderSpec):
        return (loaded,)
    return tuple(loaded)  # type: ignore[arg-type]


def load_plugins() -> list[str]:
    """Register every plugin provider once. Returns the keys it added."""

    global _plugins_loaded
    if _plugins_loaded:
        return []
    _plugins_loaded = True
    added: list[str] = []
    for entry in entry_points(group=ENTRY_POINT_GROUP):
        try:
            for spec in _as_specs(entry.load()):
                register(spec)
                added.append(spec.key)
        except Exception:
            logger.exception("Skipping supply provider plugin %r", entry.name)
    return added


register(fake.SPEC)
register(csv_provider.SPEC)
register(tme.SPEC)
register(mouser.SPEC)
register(digikey.SPEC)
register(farnell.SPEC)
register(lcsc.SPEC)
register(jlcpcb.SPEC)
register(avnet.SPEC)

register(arrow.SPEC)
