#!/usr/bin/env python3
"""
Hammer KiCAD-Prism's Remote Symbol Panel under concurrent load.

Simulates KiCad-like users:
  - panel discovery / static assets
  - category browse + search queries
  - part detail + preview fetches
  - place flow: part manifest → signed asset downloads (symbol/footprint/3d/spice)
  - occasional inline-bundle fallback place path

Auth (either):
  - Bearer token (KiCad-shaped provider access token), via --bearer-token
  - OAuth2 client_credentials service client (--client-id/--client-secret)

Usage (from loadtest container or host):
  python3 scripts/benchmark_remote_panel_load.py \\
    --base-url http://frontend \\
    --users 20 \\
    --duration 180 \\
    --bearer-token "$PRISM_LOADTEST_BEARER_TOKEN"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

try:
    import aiohttp
except ImportError:
    print("Install aiohttp: pip install aiohttp", file=sys.stderr)
    sys.exit(1)


@dataclass
class CatalogPart:
    """Minimal catalog entry used as the random-query pool."""

    id: str
    mpn: str
    name: str
    category: str = ""

    @property
    def query_term(self) -> str:
        """Prefer MPN so search hits the full-text path for a unique part."""
        return self.mpn or self.name or self.id


@dataclass
class RequestMetric:
    endpoint: str
    status: int
    latency_ms: float
    bytes_in: int
    error: str | None = None


@dataclass
class BenchmarkResult:
    config: dict[str, Any]
    started_at: str
    finished_at: str
    duration_seconds: float
    total_requests: int
    failed_requests: int
    requests_per_second: float
    bytes_downloaded: int
    latency_ms: dict[str, float]
    endpoint_stats: dict[str, dict[str, Any]]
    place_stats: dict[str, Any] = field(default_factory=dict)


def resolve_url(base_url: str, url: str) -> str:
    """Rewrite absolute Prism URLs onto the loadtest base (host → docker DNS)."""
    if not url:
        return ""
    if url.startswith("/"):
        return f"{base_url.rstrip('/')}{url}"
    parsed = urlparse(url)
    if parsed.scheme and parsed.netloc:
        return f"{base_url.rstrip('/')}{parsed.path}" + (f"?{parsed.query}" if parsed.query else "")
    return url


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = min(len(sorted_vals) - 1, int(round((p / 100) * (len(sorted_vals) - 1))))
    return sorted_vals[idx]


async def fetch(
    session: aiohttp.ClientSession,
    url: str,
    metrics: list[RequestMetric],
    endpoint: str,
    *,
    expect_json: bool = False,
    timeout: float = 120.0,
) -> bytes | dict[str, Any] | list[Any] | None:
    start = time.perf_counter()
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
            body = await resp.read()
            latency_ms = (time.perf_counter() - start) * 1000
            metrics.append(
                RequestMetric(
                    endpoint=endpoint,
                    status=resp.status,
                    latency_ms=latency_ms,
                    bytes_in=len(body),
                    error=None if resp.status < 400 else body[:240].decode("utf-8", "replace"),
                )
            )
            if resp.status >= 400:
                return None
            if expect_json:
                return json.loads(body)
            return body
    except Exception as exc:  # noqa: BLE001
        latency_ms = (time.perf_counter() - start) * 1000
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=latency_ms,
                bytes_in=0,
                error=str(exc),
            )
        )
        return None


async def obtain_access_token(
    session: aiohttp.ClientSession,
    base_url: str,
    client_id: str,
    client_secret: str,
    scope: str,
) -> str:
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": scope,
    }
    async with session.post(
        f"{base_url.rstrip('/')}/api/oauth/token",
        data=data,
        timeout=aiohttp.ClientTimeout(total=30),
    ) as resp:
        body = await resp.read()
        if resp.status >= 400:
            raise RuntimeError(
                f"OAuth token request failed ({resp.status}): {body[:300].decode('utf-8', 'replace')}"
            )
        payload = json.loads(body)
        token = str(payload.get("access_token") or "")
        if not token:
            raise RuntimeError(f"OAuth token response missing access_token: {payload}")
        return token


async def _paginate_category(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
    category: str,
    *,
    page_size: int = 500,
) -> list[CatalogPart]:
    parts: list[CatalogPart] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        payload = await fetch(
            session,
            f"{base_url}/api/remote-provider/components-by-category"
            f"?category={quote(category)}&page={page}&page_size={page_size}",
            metrics,
            "setup.components_by_category",
            expect_json=True,
            timeout=180.0,
        )
        if not isinstance(payload, dict):
            break
        total_pages = max(1, int(payload.get("pages") or 1))
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            component_id = str(item.get("id") or "").strip()
            if not component_id:
                continue
            parts.append(
                CatalogPart(
                    id=component_id,
                    mpn=str(item.get("mpn") or "").strip(),
                    name=str(item.get("name") or "").strip(),
                    category=category,
                )
            )
        page += 1
    return parts


async def discover_catalog(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
    *,
    concurrency: int = 6,
) -> tuple[list[str], list[CatalogPart]]:
    """Index every released remote-provider component (id + MPN) for uniform random queries."""
    categories_payload = await fetch(
        session,
        f"{base_url}/api/remote-provider/categories",
        metrics,
        "setup.categories",
        expect_json=True,
    )
    category_rows = [
        c
        for c in ((categories_payload or {}).get("categories") or [])
        if isinstance(c, dict) and c.get("name")
    ]
    categories = [str(c["name"]) for c in category_rows]
    expected_total = sum(int(c.get("count") or 0) for c in category_rows)
    print(
        f"Indexing full catalog across {len(categories)} categories "
        f"(reported count ≈ {expected_total})...",
        flush=True,
    )

    sem = asyncio.Semaphore(concurrency)
    catalog: list[CatalogPart] = []
    seen: set[str] = set()

    async def load_one(category: str) -> None:
        async with sem:
            parts = await _paginate_category(session, base_url, metrics, category)
        for part in parts:
            if part.id in seen:
                continue
            seen.add(part.id)
            catalog.append(part)

    await asyncio.gather(*(load_one(category) for category in categories))
    catalog.sort(key=lambda part: part.id)

    with_mpn = sum(1 for part in catalog if part.mpn)
    print(
        f"Indexed {len(catalog)} components ({with_mpn} with MPN) for random query pool.",
        flush=True,
    )
    return categories, catalog


async def fetch_previews(
    session: aiohttp.ClientSession,
    base_url: str,
    component: dict[str, Any],
    metrics: list[RequestMetric],
) -> None:
    for key, endpoint in (
        ("symbol_preview_url", "remote.preview.symbol"),
        ("footprint_preview_url", "remote.preview.footprint"),
    ):
        preview_url = resolve_url(base_url, str(component.get(key) or ""))
        if preview_url:
            await fetch(session, preview_url, metrics, endpoint)


async def place_with_asset_downloads(
    session: aiohttp.ClientSession,
    base_url: str,
    component_id: str,
    metrics: list[RequestMetric],
    place_stats: dict[str, int],
) -> None:
    manifest = await fetch(
        session,
        f"{base_url}/api/remote-provider/parts/{component_id}",
        metrics,
        "remote.part_manifest",
        expect_json=True,
    )
    if not isinstance(manifest, dict):
        place_stats["manifest_failed"] += 1
        return

    assets = [a for a in (manifest.get("assets") or []) if isinstance(a, dict)]
    if not assets:
        place_stats["manifest_empty"] += 1
        return

    place_stats["manifest_ok"] += 1
    downloaded = 0
    failed = 0
    for asset in assets:
        asset_type = str(asset.get("asset_type") or "unknown")
        download_url = resolve_url(base_url, str(asset.get("download_url") or ""))
        if not download_url:
            failed += 1
            continue
        body = await fetch(
            session,
            download_url,
            metrics,
            f"remote.asset.{asset_type}",
            timeout=180.0,
        )
        if body is None:
            failed += 1
        else:
            downloaded += 1
            place_stats["asset_bytes"] += len(body) if isinstance(body, (bytes, bytearray)) else 0

    place_stats["assets_downloaded"] += downloaded
    place_stats["assets_failed"] += failed
    if failed:
        place_stats["place_partial"] += 1
    else:
        place_stats["place_ok"] += 1


async def place_inline_fallback(
    session: aiohttp.ClientSession,
    base_url: str,
    component_id: str,
    metrics: list[RequestMetric],
    place_stats: dict[str, int],
) -> None:
    payload = await fetch(
        session,
        f"{base_url}/api/remote-provider/components/{component_id}/inline",
        metrics,
        "remote.inline_bundle",
        expect_json=True,
        timeout=180.0,
    )
    if payload is None:
        place_stats["inline_failed"] += 1
    else:
        place_stats["inline_ok"] += 1


async def resolve_component_via_mpn_search(
    session: aiohttp.ClientSession,
    base_url: str,
    part: CatalogPart,
    metrics: list[RequestMetric],
) -> dict[str, Any] | None:
    """Search by MPN (or name fallback), forcing a cold-ish catalog lookup path."""
    query = part.query_term
    search_payload = await fetch(
        session,
        f"{base_url}/api/remote-provider/search?q={quote(query)}&page_size=20",
        metrics,
        "remote.search.mpn",
        expect_json=True,
    )
    if not isinstance(search_payload, dict):
        return None

    items = [item for item in (search_payload.get("items") or []) if isinstance(item, dict)]
    if not items:
        return {"id": part.id, "mpn": part.mpn, "name": part.name}

    # Prefer exact MPN / id match so we exercise search + still place the intended part.
    for item in items:
        if part.mpn and str(item.get("mpn") or "").strip() == part.mpn:
            return item
        if str(item.get("id") or "") == part.id:
            return item
    return items[0]


async def simulate_remote_panel_burst(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
    categories: list[str],
    catalog: list[CatalogPart],
    place_stats: dict[str, int],
    *,
    warm_panel: bool,
) -> None:
    if warm_panel:
        await fetch(session, f"{base_url}/.well-known/kicad-remote-provider", metrics, "panel.discovery")
        await fetch(session, f"{base_url}/remote-provider/panel", metrics, "panel.html")
        await fetch(session, f"{base_url}/remote-provider/assets/panel.js", metrics, "panel.js")

    await fetch(
        session,
        f"{base_url}/api/remote-provider/categories",
        metrics,
        "remote.categories",
        expect_json=True,
    )

    # Occasional category browse still happens in real panels, but keep it light.
    if categories and random.random() < 0.35:
        category = random.choice(categories)
        # Random page within the first few pages to avoid always hitting page 1.
        page = random.randint(1, 3)
        await fetch(
            session,
            f"{base_url}/api/remote-provider/components-by-category"
            f"?category={quote(category)}&page={page}&page_size=100",
            metrics,
            "remote.components_by_category",
            expect_json=True,
        )

    if not catalog:
        return

    # Each burst asks for several uniformly random catalog MPNs — not a hot subset.
    for _ in range(random.randint(3, 6)):
        part = random.choice(catalog)
        resolved = await resolve_component_via_mpn_search(session, base_url, part, metrics)
        component_id = str((resolved or {}).get("id") or part.id)
        if not component_id:
            continue

        detail = await fetch(
            session,
            f"{base_url}/api/remote-provider/components/{component_id}",
            metrics,
            "remote.component_detail",
            expect_json=True,
        )
        preview_source = detail if isinstance(detail, dict) else resolved
        if isinstance(preview_source, dict):
            await fetch_previews(session, base_url, preview_source, metrics)

        # ~80% signed asset place path (KiCad download), ~20% inline fallback.
        if random.random() < 0.8:
            await place_with_asset_downloads(session, base_url, component_id, metrics, place_stats)
        else:
            await place_inline_fallback(session, base_url, component_id, metrics, place_stats)


async def simulate_user(
    user_id: int,
    base_url: str,
    headers: dict[str, str],
    metrics: list[RequestMetric],
    categories: list[str],
    catalog: list[CatalogPart],
    place_stats: dict[str, int],
    stop_at: float,
) -> None:
    connector = aiohttp.TCPConnector(limit=12, ttl_dns_cache=60)
    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        first = True
        while time.time() < stop_at:
            await simulate_remote_panel_burst(
                session,
                base_url,
                metrics,
                categories,
                catalog,
                place_stats,
                warm_panel=first or random.random() < 0.15,
            )
            first = False
            await asyncio.sleep(random.uniform(0.4, 1.6))


def summarize_metrics(metrics: list[RequestMetric]) -> tuple[dict[str, float], dict[str, dict[str, Any]], int]:
    ok = [m for m in metrics if m.status and m.status < 400]
    overall = {
        "p50": pct([m.latency_ms for m in ok], 50),
        "p95": pct([m.latency_ms for m in ok], 95),
        "p99": pct([m.latency_ms for m in ok], 99),
        "max": max((m.latency_ms for m in ok), default=0.0),
        "mean": statistics.mean([m.latency_ms for m in ok]) if ok else 0.0,
    }
    by_endpoint: dict[str, list[RequestMetric]] = {}
    for metric in metrics:
        by_endpoint.setdefault(metric.endpoint, []).append(metric)

    endpoint_stats: dict[str, dict[str, Any]] = {}
    for endpoint, items in sorted(by_endpoint.items()):
        good = [m for m in items if m.status and m.status < 400]
        endpoint_stats[endpoint] = {
            "count": len(items),
            "errors": len(items) - len(good),
            "p50_ms": round(pct([m.latency_ms for m in good], 50), 1),
            "p95_ms": round(pct([m.latency_ms for m in good], 95), 1),
            "mean_ms": round(statistics.mean([m.latency_ms for m in good]), 1) if good else 0.0,
            "bytes_total": sum(m.bytes_in for m in good),
        }
    return overall, endpoint_stats, sum(m.bytes_in for m in ok)


async def run_benchmark(args: argparse.Namespace) -> BenchmarkResult:
    base_url = args.base_url.rstrip("/")
    metrics: list[RequestMetric] = []
    place_stats = {
        "manifest_ok": 0,
        "manifest_failed": 0,
        "manifest_empty": 0,
        "place_ok": 0,
        "place_partial": 0,
        "assets_downloaded": 0,
        "assets_failed": 0,
        "asset_bytes": 0,
        "inline_ok": 0,
        "inline_failed": 0,
    }

    if args.bearer_token:
        token = args.bearer_token.strip()
    else:
        async with aiohttp.ClientSession() as bootstrap:
            token = await obtain_access_token(
                bootstrap,
                base_url,
                args.client_id,
                args.client_secret,
                args.scope,
            )
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        categories, catalog = await discover_catalog(session, base_url, metrics)

    if not catalog:
        print("Warning: no catalog components discovered.", file=sys.stderr)
    else:
        with_mpn = sum(1 for part in catalog if part.mpn)
        print(
            f"Ready: {len(categories)} categories, {len(catalog)} components "
            f"({with_mpn} with MPN) — users will query uniformly at random.",
            flush=True,
        )

    started = time.time()
    started_at = datetime.now(timezone.utc).isoformat()
    stop_at = started + args.duration

    user_tasks = [
        asyncio.create_task(
            simulate_user(
                user_id=i,
                base_url=base_url,
                headers=headers,
                metrics=metrics,
                categories=categories,
                catalog=catalog,
                place_stats=place_stats,
                stop_at=stop_at,
            )
        )
        for i in range(args.users)
    ]
    await asyncio.gather(*user_tasks)

    finished = time.time()
    finished_at = datetime.now(timezone.utc).isoformat()
    elapsed = max(finished - started, 1e-6)
    overall, endpoint_stats, bytes_downloaded = summarize_metrics(metrics)
    failed = sum(1 for m in metrics if not m.status or m.status >= 400)

    return BenchmarkResult(
        config={
            "base_url": base_url,
            "users": args.users,
            "duration_seconds": args.duration,
            "scope": args.scope,
            "categories": len(categories),
            "catalog_components": len(catalog),
            "catalog_components_with_mpn": sum(1 for part in catalog if part.mpn),
            "profile": "remote_panel_full_catalog_random_mpn",
        },
        started_at=started_at,
        finished_at=finished_at,
        duration_seconds=round(elapsed, 2),
        total_requests=len(metrics),
        failed_requests=failed,
        requests_per_second=round(len(metrics) / elapsed, 2),
        bytes_downloaded=bytes_downloaded,
        latency_ms=overall,
        endpoint_stats=endpoint_stats,
        place_stats=place_stats,
    )


def print_report(result: BenchmarkResult) -> None:
    print("\n=== KiCAD-Prism Remote Panel Load Test ===")
    print(json.dumps(result.config, indent=2))
    print(f"\nDuration: {result.duration_seconds}s")
    print(
        f"Requests: {result.total_requests} ({result.requests_per_second}/s), "
        f"failures: {result.failed_requests}"
    )
    print(f"Bytes downloaded: {result.bytes_downloaded / (1024 * 1024):.2f} MiB")
    print(
        "Latency (ms): "
        f"p50={result.latency_ms['p50']:.1f}, "
        f"p95={result.latency_ms['p95']:.1f}, "
        f"p99={result.latency_ms['p99']:.1f}, "
        f"max={result.latency_ms['max']:.1f}"
    )
    print("\n--- Place / asset downloads ---")
    print(json.dumps(result.place_stats, indent=2))
    print("\n--- Per-endpoint ---")
    for endpoint, stats in result.endpoint_stats.items():
        print(
            f"{endpoint:36s} n={stats['count']:5d} err={stats['errors']:4d} "
            f"p50={stats['p50_ms']:7.1f} p95={stats['p95_ms']:7.1f} "
            f"bytes={stats['bytes_total'] / (1024 * 1024):7.2f}MiB"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Remote panel concurrent load test for KiCAD-Prism.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("PRISM_BASE_URL", "http://frontend"),
        help="Prism base URL (docker: http://frontend or http://backend:8000)",
    )
    parser.add_argument("--users", type=int, default=int(os.environ.get("PRISM_LOADTEST_USERS", "20")))
    parser.add_argument(
        "--duration",
        type=int,
        default=int(os.environ.get("PRISM_LOADTEST_DURATION", "180")),
        help="Test duration in seconds",
    )
    parser.add_argument(
        "--bearer-token",
        default=os.environ.get("PRISM_LOADTEST_BEARER_TOKEN", ""),
        help="Pre-minted Bearer token (preferred for KiCad-like load)",
    )
    parser.add_argument(
        "--client-id",
        default=os.environ.get("PRISM_LOADTEST_CLIENT_ID", ""),
        help="OAuth service client id (alternative to --bearer-token)",
    )
    parser.add_argument(
        "--client-secret",
        default=os.environ.get("PRISM_LOADTEST_CLIENT_SECRET", ""),
        help="OAuth service client secret",
    )
    parser.add_argument(
        "--scope",
        default=os.environ.get("PRISM_LOADTEST_SCOPE", "remote_symbols.read api:read"),
    )
    parser.add_argument("--output", default=os.environ.get("PRISM_LOADTEST_OUTPUT", ""))
    args = parser.parse_args()

    if not args.bearer_token and (not args.client_id or not args.client_secret):
        print(
            "Provide --bearer-token or --client-id/--client-secret "
            "(env: PRISM_LOADTEST_BEARER_TOKEN or PRISM_LOADTEST_CLIENT_ID/_SECRET).",
            file=sys.stderr,
        )
        sys.exit(2)

    result = asyncio.run(run_benchmark(args))
    print_report(result)

    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(
            json.dumps(
                {
                    "benchmark": {
                        "config": result.config,
                        "started_at": result.started_at,
                        "finished_at": result.finished_at,
                        "duration_seconds": result.duration_seconds,
                        "total_requests": result.total_requests,
                        "failed_requests": result.failed_requests,
                        "requests_per_second": result.requests_per_second,
                        "bytes_downloaded": result.bytes_downloaded,
                        "latency_ms": result.latency_ms,
                        "endpoint_stats": result.endpoint_stats,
                        "place_stats": result.place_stats,
                    }
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nWrote report: {args.output}")


if __name__ == "__main__":
    main()
