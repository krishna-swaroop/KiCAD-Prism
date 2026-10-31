"""Provider-neutral records that adapters return.

These are plain frozen values. They validate on construction so a bad adapter
fails loudly at the boundary instead of writing odd rows later. Prices are
``Decimal``; times are timezone-aware UTC.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from app.services.supply.vocabulary import Lifecycle, Packaging


def _check_utc(value: datetime, name: str) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


@dataclass(frozen=True, slots=True)
class PriceBreak:
    quantity: int
    unit_price: Decimal

    def __post_init__(self) -> None:
        if self.quantity < 1:
            raise ValueError("price break quantity must be at least 1")
        if self.unit_price < 0:
            raise ValueError("price must not be negative")


@dataclass(frozen=True, slots=True)
class Incoming:
    """Stock a distributor reports as on order, with a date when it gives one."""

    quantity: int
    expected: date | None = None

    def __post_init__(self) -> None:
        if self.quantity < 1:
            raise ValueError("incoming quantity must be at least 1")


@dataclass(frozen=True, slots=True)
class Alternate:
    """A part a distributor suggests in place of the one asked for. Prism has not compared it with the part."""

    manufacturer: str = ""
    mpn: str = ""
    # The distributor's own number, when the part number is not given (Mouser names its suggestion by Mouser number).
    sku: str = ""
    # Short words from the distributor: the package, or how it describes the match.
    note: str = ""

    def __post_init__(self) -> None:
        if not (self.mpn or self.sku):
            raise ValueError("an alternate needs a part number or a distributor number")


@dataclass(frozen=True, slots=True)
class Offer:
    """One distributor listing at one moment."""

    provider: str
    sku: str
    mpn: str
    manufacturer: str
    stock: int
    fetched_at: datetime
    incoming: tuple[Incoming, ...] = ()
    moq: int = 1
    order_multiple: int = 1
    packaging: Packaging = Packaging.UNKNOWN
    # Pieces on a full reel, when the distributor says.
    reel_size: int | None = None
    # True when the packaging was guessed from the SKU or the order terms, not stated.
    packaging_inferred: bool = False
    price_breaks: tuple[PriceBreak, ...] = ()
    currency: str = ""
    lead_time_days: int | None = None
    lifecycle: Lifecycle = Lifecycle.UNKNOWN
    discontinued: bool = False
    rohs: bool | None = None
    # True when the distributor says the part is affected by REACH (it may hold a substance of very high concern).
    reach_affected: bool | None = None
    # The substances of very high concern the answer lists, as written. None: the answer says nothing about them, which
    # is not the same as an empty list.
    substances: tuple[str, ...] | None = None
    marketplace: bool = False
    product_url: str = ""
    # The datasheet address the distributor gives. Part of the answer, so it costs no call to keep.
    datasheet_url: str = ""
    # What the distributor states about the part, as (name, text) pairs: compliance and trade facts such as
    # ``rohs_status`` or ``hts_us``. ``facts.py`` names them and reads them.
    facts: tuple[tuple[str, str], ...] = ()
    # Alternates the distributor lists with the answer. None: this distributor's answer does not carry any (nothing is
    # changed); an empty tuple: it does, and names none (what it named before is dropped).
    alternates: tuple[Alternate, ...] | None = None
    # The largest quantity the price breaks hold for, when the distributor quoted one quantity and said nothing beyond it.
    # None: the last break holds for any larger order, as distributors' price tables do.
    price_up_to: int | None = None

    def __post_init__(self) -> None:
        if not self.provider or not self.sku:
            raise ValueError("provider and sku are required")
        if self.stock < 0:
            raise ValueError("stock must not be negative")
        if self.moq < 1 or self.order_multiple < 1:
            raise ValueError("moq and order multiple must be at least 1")
        if self.lead_time_days is not None and self.lead_time_days < 0:
            raise ValueError("lead time must not be negative")
        if self.currency and (len(self.currency) != 3 or not self.currency.isupper()):
            raise ValueError("currency must be a three letter upper case code")
        if self.price_breaks and not self.currency:
            raise ValueError("price breaks need a currency")
        quantities = [brk.quantity for brk in self.price_breaks]
        if quantities != sorted(set(quantities)):
            raise ValueError("price breaks must be unique and ascending by quantity")
        if self.price_up_to is not None and (not quantities or self.price_up_to < quantities[-1]):
            raise ValueError("price_up_to needs price breaks and must not be below the last one")
        _check_utc(self.fetched_at, "fetched_at")


@dataclass(frozen=True, slots=True)
class PartMatch:
    """A search hit: enough to show a choice and to fetch details for it."""

    provider: str
    sku: str
    mpn: str
    manufacturer: str
    description: str = ""
    product_url: str = ""
    # The manufacturer's datasheet, when the search answer carries one.
    datasheet_url: str = ""
    # The distributor's attributes (name, text), when the search answer carries them.
    parameters: tuple[tuple[str, str], ...] = ()
    # The whole offer, for a provider whose search answer already carries stock and prices (``ProviderSpec.search_reads_offers``).
    offer: "Offer | None" = field(default=None, compare=False, repr=False)

    def __post_init__(self) -> None:
        if not self.provider or not self.sku or not self.mpn:
            raise ValueError("provider, sku and mpn are required")


@dataclass(frozen=True, slots=True)
class PartData:
    """Descriptive data for one part. Parameters keep the provider's own names."""

    match: PartMatch
    description: str = ""
    datasheet_url: str = ""
    package_name: str = ""
    category: str = ""
    parameters: tuple[tuple[str, str], ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ChangeNotice:
    """A product change notice a distributor lists for one of its listings, as it wrote it."""

    provider: str
    sku: str
    kind_text: str
    description: str
    url: str = ""
    published_on: date | None = None

    def __post_init__(self) -> None:
        if not self.provider or not self.sku:
            raise ValueError("provider and sku are required")


@dataclass(frozen=True, slots=True)
class Substances:
    """What a distributor says about substances of very high concern in a listing.

    ``entries`` is the list as written (a name, a CAS number, or both). ``stated`` is False when the answer says
    nothing at all, which is not the same as an empty list.
    """

    entries: tuple[str, ...] = ()
    stated: bool = False
    facts: tuple[tuple[str, str], ...] = field(default_factory=tuple)
