"""Inventory source kinds, beside the provider registry: what a source is and how Prism reads it.

InvenTree (and servers that serve the same API) is read on a schedule. A push source sends its whole stock itself, with a
token of its own. The catalog's CSV upload is fed: it has no source row and no reader, only the stock rows it writes. A new kind (Part-DB, say) is one reader module and one ``register`` line.
"""

from __future__ import annotations

from app.services.supply.inventory.base import InventorySourceSpec


class UnknownKind(KeyError):
    """No inventory source kind is registered under this key."""


_specs: dict[str, InventorySourceSpec] = {}


def register(spec: InventorySourceSpec) -> None:
    if spec.kind in _specs:
        raise ValueError(f"inventory source kind already registered: {spec.kind}")
    _specs[spec.kind] = spec


def get_spec(kind: str) -> InventorySourceSpec:
    try:
        return _specs[kind]
    except KeyError:
        raise UnknownKind(kind) from None


def list_specs() -> list[InventorySourceSpec]:
    return sorted(_specs.values(), key=lambda spec: spec.label.lower())


def _inventree(url: str, token: str):
    from app.services.supply.inventory.inventree import InvenTreeClient

    return InvenTreeClient(url, token)


register(InventorySourceSpec(kind="inventree", label="InvenTree", level_source="inventree", factory=_inventree, categories=True))
register(InventorySourceSpec(kind="push", label="Push", level_source="push", pushed=True))
register(InventorySourceSpec(kind="csv", label="CSV upload", level_source="csv"))
