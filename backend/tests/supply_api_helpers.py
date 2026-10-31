"""One ASGI request for the supply API tests, without adding httpx to the test lock."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace


def request(app, method: str, path: str, *, user, body=None, raw: bytes | None = None, query: str = "",
            content_type: str = "application/json", headers: dict[str, str] | None = None):
    from app.core.security import get_current_user

    payload = raw if raw is not None else (b"" if body is None else json.dumps(body).encode())
    messages: list[dict] = []
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": payload, "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        asyncio.run(app({
            "type": "http", "http_version": "1.1", "method": method, "scheme": "http",
            "path": path, "raw_path": path.encode(), "query_string": query.encode(),
            "headers": [(b"content-type", content_type.encode()), (b"content-length", str(len(payload)).encode()),
                        *((name.lower().encode(), value.encode()) for name, value in (headers or {}).items())],
            "client": ("test", 1), "server": ("test", 80), "root_path": "",
        }, receive, send))
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    start = next(m for m in messages if m["type"] == "http.response.start")
    data = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    headers = {key.decode().lower(): value.decode() for key, value in start["headers"]}
    return SimpleNamespace(
        status=start["status"],
        headers=headers,
        text=data.decode("utf-8", "replace"),
        json=json.loads(data) if data and headers.get("content-type", "").startswith("application/json") else None,
    )


def reading(conn, listing_id: str, at, stock: int, *, price=None, currency: str = "EUR", moq: int = 1, **columns) -> None:
    """Keep a reading of a listing. With ``price``, also the price breaks in force from then: a price is kept as breaks
    (``price_breaks``), never on the reading."""

    values = {"listing_id": listing_id, "sampled_at": at, "stock": stock, "moq": moq, **columns}
    conn.execute(
        f"INSERT INTO supply_samples ({', '.join(values)}) VALUES ({', '.join(['%s'] * len(values))}) ON CONFLICT DO NOTHING",
        tuple(values.values()),
    )
    if price is not None:
        conn.execute(
            "INSERT INTO supply_price_breaks_history (listing_id, since, breaks, currency, moq, order_multiple) "
            "VALUES (%s, %s, %s::jsonb, %s, %s, 1) ON CONFLICT DO NOTHING",
            (listing_id, at, json.dumps([[max(moq, 1), str(price)]]), currency, moq),
        )
