"""A listing's page at its distributor: the one its last reading gave, else one built from the distributor's own number."""

from __future__ import annotations

from urllib.parse import quote

from app.services.supply.models import https_link

# Distributors whose product page is known from their number alone, for a listing not read yet. The number fills a path
# segment, so a number with a slash gets no page; DigiKey's is its search, which opens the product when the number is exact.
_PAGES = {
    "lcsc": "https://www.lcsc.com/product-detail/{}.html",
    "tme": "https://www.tme.eu/en/details/{}/",
    "jlcpcb": "https://jlcpcb.com/partdetail/{}",
    "mouser": "https://www.mouser.com/ProductDetail/{}",
    "digikey": "https://www.digikey.com/en/products/result?keywords={}",
}


def page_url(provider: str, sku: str, read_url: str | None = None) -> str:
    if https_link(read_url):
        return https_link(read_url)
    pattern = _PAGES.get(provider)
    sku = (sku or "").strip()
    if not pattern or not sku or "/" in sku:
        return ""
    return pattern.format(quote(sku.lower() if provider == "tme" else sku, safe=""))
