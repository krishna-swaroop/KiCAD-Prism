"""A read-only client for InvenTree's REST API, and for any server that serves the same subset (Vision).

It reads what a stock sync needs: the server's identity, the category tree, the parts of one category with their
manufacturer part numbers, the stock records of that category, and the location tree. Shapes follow InvenTree's
schema (v566): ``Authorization: Token <key>``, ``limit``/``offset`` paging with ``{count, results}``.

Requests go through ``SafeHttpClient``: HTTPS only, to the source's own host, at public addresses, or at private ones for
a host the operator lists in ``SUPPLY_INVENTORY_PRIVATE_HOSTS``. The client never writes and never logs the token. Errors
are the providers' ``ProviderError`` subclasses.

Only the filters InvenTree and Vision both serve are sent: Vision answers any other with ``400``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator
from urllib.parse import urlsplit

from app.services.supply.http_client import SafeHttpClient
from app.services.supply.providers.base import ProviderError

PAGE = 500
# A server answering more pages than this is not serving one category of parts; stop rather than read without end.
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


@dataclass(frozen=True, slots=True)
class Part:
    pk: int
    name: str
    ipn: str
    units: str
    # (manufacturer name, MPN) of each manufacturer part.
    mpns: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True, slots=True)
class Location:
    pk: int
    pathstring: str
    external: bool


@dataclass(frozen=True, slots=True)
class StockRecord:
    pk: int
    part: int
    quantity: float
    allocated: float
    status: int
    status_text: str
    location: int | None
    batch: str
    updated: str


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
            rows = [row for row in answer["results"] if isinstance(row, dict)]
            yield from rows
            offset += len(rows)
            if not rows or offset >= answer["count"]:
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

    def parts(self, category: int) -> dict[int, Part]:
        """The parts of a category and its subcategories, each with its manufacturer part numbers."""

        parts: dict[int, Part] = {}
        for row in self._pages("part/", {"category": str(category), "cascade": "true"}):
            pk = _pk(row.get("pk"))
            if pk is not None:
                parts[pk] = Part(pk=pk, name=_text(row.get("full_name")) or _text(row.get("name")), ipn=_text(row.get("IPN")), units=_text(row.get("units")))
        mpns: dict[int, list[tuple[str, str]]] = {}
        # No manufacturer_detail filter: Vision refuses it, and serves the detail anyway. The maker is only a hint.
        for row in self._pages("company/part/manufacturer/", {}):
            part = _pk(row.get("part"))
            mpn = _text(row.get("MPN"))
            if part in parts and mpn:
                detail = row.get("manufacturer_detail")
                maker = _text(detail.get("name")) if isinstance(detail, dict) else ""
                mpns.setdefault(part, []).append((maker, mpn))
        return {pk: Part(pk=p.pk, name=p.name, ipn=p.ipn, units=p.units, mpns=tuple(mpns.get(pk, ()))) for pk, p in parts.items()}

    def locations(self) -> dict[int, Location]:
        found = {}
        for row in self._pages("stock/location/", {}):
            pk = _pk(row.get("pk"))
            if pk is not None:
                found[pk] = Location(pk=pk, pathstring=_text(row.get("pathstring")) or _text(row.get("name")), external=row.get("external") is True)
        return found

    def stock(self, category: int) -> list[StockRecord]:
        """Every in-stock record of the category's parts."""

        records = []
        for row in self._pages("stock/", {"category": str(category), "in_stock": "true"}):
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
