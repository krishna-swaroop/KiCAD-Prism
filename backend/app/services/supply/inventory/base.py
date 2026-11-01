"""The contract between Prism and a local inventory source, beside the distributor contract (``providers/base.py``).

An ``InventorySourceSpec`` says what kind of source it is: one Prism reads on a schedule (an InvenTree-compatible server),
one that pushes its stock to Prism (``push.py``), or one that is fed by the catalog's CSV upload. A read source has a ``factory`` that turns its address and token into an
``InventoryReader``; ``read`` returns every part with its numbers, the locations and the stock records in one
``InventoryRead``. Matching the parts to library components, and storing the stock, is Prism's (``sync.py``).

Readers never write, never log the token, and raise ``ProviderError`` subclasses (a short or malformed answer is a failed
read, never a smaller inventory).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Mapping, Protocol, runtime_checkable

_KIND = re.compile(r"^[a-z][a-z0-9_]{1,31}$")


# A server's own id for a record: InvenTree's are numbers, a push names its parts as it likes.
RemoteId = int | str


@dataclass(frozen=True, slots=True)
class Part:
    pk: RemoteId
    name: str
    ipn: str
    units: str
    # (manufacturer name, MPN) of each manufacturer part.
    mpns: tuple[tuple[str, str], ...] = ()
    # (supplier name, the supplier's part number) of each supplier part: a distributor's SKU, matched to Prism's listings.
    skus: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True, slots=True)
class Location:
    pk: RemoteId
    pathstring: str
    external: bool


@dataclass(frozen=True, slots=True)
class StockRecord:
    pk: RemoteId
    part: RemoteId
    quantity: float
    allocated: float
    status: int
    status_text: str
    location: RemoteId | None
    batch: str
    updated: str


@dataclass(frozen=True, slots=True)
class InventoryRead:
    """What one read of a source returned: the whole inventory, or one category of it when the source follows one."""

    server: str
    api_version: int | None
    parts: Mapping[RemoteId, Part]
    locations: Mapping[RemoteId, Location]
    stock: list[StockRecord]


@runtime_checkable
class InventoryReader(Protocol):
    def read(self, category: int | None) -> InventoryRead:
        """Every part, location and in-stock record; only those of ``category`` and its subcategories when one is given."""

    def close(self) -> None: ...


@dataclass(frozen=True, slots=True)
class InventorySourceSpec:
    kind: str
    label: str
    # The ``inventory_levels.source`` its stock rows carry.
    level_source: str
    # Builds a reader from the source's address and token. None for a source Prism does not read (it is fed).
    factory: Callable[[str, str], InventoryReader] | None = None
    # The source can be narrowed to one of its categories; without one it is read whole.
    categories: bool = False
    # The source pushes its stock with a token of its own (``POST /api/supply/inventory-sources/{id}/levels``).
    pushed: bool = False

    def __post_init__(self) -> None:
        if not _KIND.match(self.kind) or not _KIND.match(self.level_source):
            raise ValueError(f"invalid inventory source kind: {self.kind!r}")

    @property
    def pulled(self) -> bool:
        """Prism reads it on a schedule."""

        return self.factory is not None
