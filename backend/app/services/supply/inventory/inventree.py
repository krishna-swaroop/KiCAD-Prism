"""A read-only client for InvenTree's REST API, and for any server that serves the same subset of it.

It reads what a stock sync needs (``read``, the ``InventoryReader`` contract in ``base.py``): the server's identity, every
part (or those of one category, when the source follows one) with its manufacturer and supplier part numbers, the stock
records, and the location tree. The category tree is read for choosing one. Shapes follow InvenTree's
schema (v566): ``Authorization: Token <key>``, ``limit``/``offset`` paging with ``{count, results}``.

Requests go through ``SafeHttpClient``: HTTPS only, to the source's own host, at public addresses on port 443, or at
private ones and any port for a host the operator lists in ``SUPPLY_INVENTORY_PRIVATE_HOSTS``. The client never writes and never logs the token. Errors
are the providers' ``ProviderError`` subclasses.

Only the filters every compatible server is known to serve are sent: some answer any other with ``400``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator
from urllib.parse import urlsplit

from app.services.supply.http_client import SafeHttpClient
from app.services.supply.inventory.base import InventoryRead, Location, Part, StockRecord
from app.services.supply.providers.base import ProviderError

__all__ = ["Category", "InvenTreeClient", "InvenTreeError", "Location", "Part", "ServerInfo", "StockRecord", "base_url"]

PAGE = 500
# A server answering more pages than this (200,000 rows of one list) is not an inventory; stop rather than read without end.
MAX_PAGES = 400

# InvenTree's base stock statuses. Only OK stock counts as available.
STATUS_OK = 10
STATUS_NAMES = {
    10: "ok", 50: "attention", 55: "damaged", 60: "destroyed", 65: "rejected", 70: "lost", 75: "quarantined", 85: "returned",
}


class InvenTreeError(ProviderError):
    """The server answered something that is not InvenTree's API. The message is safe to show."""

    code = "not_inventree"


@dataclass(frozen=True, slots=True)
class ServerInfo:
    server: str
    api_version: int
    instance: str


@dataclass(frozen=True, slots=True)
class Category:
    pk: int
    name: str
    pathstring: str
    parent: int | None


def base_url(text: str) -> str:
    """The server's root URL, checked: https, a host, no query. ``/api/`` is added by the client."""

    parts = urlsplit(text.strip())
    if parts.scheme != "https" or not parts.hostname:
        raise InvenTreeError("The server address must be an https:// URL.")
    if parts.query or parts.fragment or parts.username or parts.password:
        raise InvenTreeError("The server address cannot carry a query, a fragment or credentials.")
    path = parts.path.rstrip("/")
    if path.endswith("/api"):
        path = path[: -len("/api")]
    return f"https://{parts.netloc}{path}"


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _pk(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value)
    return None


class InvenTreeClient:
    def __init__(self, url: str, token: str, *, client: SafeHttpClient | None = None) -> None:
        self._root = base_url(url)
        self._headers = {"Authorization": f"Token {token}"}
        if client is None:
            from app.core.config import settings

            client = SafeHttpClient((urlsplit(self._root).hostname or "",), private_hosts=settings.SUPPLY_INVENTORY_PRIVATE_HOSTS)
        self._client = client

    def close(self) -> None:
        self._client.close()

    def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        return self._client.request_json("GET", f"{self._root}/api/{path}", params=params, headers=self._headers)

    def _pages(self, path: str, params: dict[str, str]) -> Iterator[dict[str, Any]]:
        """Every row of a list, read with our own offsets so a ``next`` link can never take the token elsewhere."""

        offset = 0
        for _page in range(MAX_PAGES):
            answer = self._get(path, {**params, "limit": str(PAGE), "offset": str(offset)})
            if not isinstance(answer, dict) or not isinstance(answer.get("results"), list) or not isinstance(answer.get("count"), int):
                raise InvenTreeError(f"/api/{path} did not answer a paged list.")
            rows = answer["results"]
            # A short or malformed answer is a failed read, never a smaller inventory: the last good stock is kept.
            if not all(isinstance(row, dict) for row in rows):
                raise InvenTreeError(f"/api/{path} answered rows that are not records.")
            if not rows and offset < answer["count"]:
                raise InvenTreeError(f"/api/{path} stopped at {offset:,} of {answer['count']:,} rows.")
            yield from rows
            offset += len(rows)
            if offset >= answer["count"]:
                return
        raise InvenTreeError(f"/api/{path} has more than {MAX_PAGES * PAGE:,} rows.")

    def server(self) -> ServerInfo:
        answer = self._get("")
        version = _pk(answer.get("apiVersion")) if isinstance(answer, dict) else None
        if version is None:
            raise InvenTreeError("The server did not answer InvenTree's /api/ (no apiVersion).")
        return ServerInfo(server=_text(answer.get("server")), api_version=version, instance=_text(answer.get("instance")))

    def categories(self) -> list[Category]:
        found = []
        for row in self._pages("part/category/", {}):
            pk = _pk(row.get("pk"))
            if pk is not None:
                found.append(Category(pk=pk, name=_text(row.get("name")), pathstring=_text(row.get("pathstring")) or _text(row.get("name")), parent=_pk(row.get("parent"))))
        return found

    def read(self, category: int | None) -> InventoryRead:
        info = self.server()
        return InventoryRead(
            server=info.server, api_version=info.api_version, parts=self.parts(category), locations=self.locations(), stock=self.stock(category),
        )

    def parts(self, category: int | None = None) -> dict[int, Part]:
        """Every part, or those of a category and its subcategories, each with its manufacturer and supplier part numbers."""

        parts: dict[int, Part] = {}
        scope = {"category": str(category), "cascade": "true"} if category is not None else {}
        for row in self._pages("part/", scope):
            pk = _pk(row.get("pk"))
            if pk is not None:
                parts[pk] = Part(pk=pk, name=_text(row.get("full_name")) or _text(row.get("name")), ipn=_text(row.get("IPN")), units=_text(row.get("units")))
        mpns: dict[int, list[tuple[str, str]]] = {}
        # No manufacturer_detail filter: some compatible servers refuse it, and serve the detail anyway. The maker is only a hint.
        for row in self._pages("company/part/manufacturer/", {}):
            part = _pk(row.get("part"))
            mpn = _text(row.get("MPN"))
            if part in parts and mpn:
                detail = row.get("manufacturer_detail")
                maker = _text(detail.get("name")) if isinstance(detail, dict) else ""
                mpns.setdefault(part, []).append((maker, mpn))
        skus: dict[int, list[tuple[str, str]]] = {}
        # Supplier parts: the distributor's number (SKU) under the supplier's name, which is only a hint as the maker is.
        for row in self._pages("company/part/", {}):
            part = _pk(row.get("part"))
            sku = _text(row.get("SKU"))
            if part in parts and sku:
                detail = row.get("supplier_detail")
                skus.setdefault(part, []).append((_text(detail.get("name")) if isinstance(detail, dict) else "", sku))
        return {
            pk: Part(pk=p.pk, name=p.name, ipn=p.ipn, units=p.units, mpns=tuple(mpns.get(pk, ())), skus=tuple(skus.get(pk, ())))
            for pk, p in parts.items()
        }

    def locations(self) -> dict[int, Location]:
        found = {}
        for row in self._pages("stock/location/", {}):
            pk = _pk(row.get("pk"))
            if pk is not None:
                found[pk] = Location(pk=pk, pathstring=_text(row.get("pathstring")) or _text(row.get("name")), external=row.get("external") is True)
        return found

    def stock(self, category: int | None = None) -> list[StockRecord]:
        """Every in-stock record, or those of the category's parts."""

        records = []
        scope = {"category": str(category)} if category is not None else {}
        for row in self._pages("stock/", {**scope, "in_stock": "true"}):
            pk, part = _pk(row.get("pk")), _pk(row.get("part"))
            if pk is None or part is None:
                continue
            status = _pk(row.get("status"))
            records.append(StockRecord(
                pk=pk, part=part, quantity=_number(row.get("quantity")), allocated=_number(row.get("allocated")),
                status=STATUS_OK if status is None else status,
                status_text=_text(row.get("status_text")) or STATUS_NAMES.get(status or STATUS_OK, ""),
                location=_pk(row.get("location")), batch=_text(row.get("batch")), updated=_text(row.get("updated")),
            ))
        return records
