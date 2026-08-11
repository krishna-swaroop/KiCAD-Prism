#!/usr/bin/env python3
"""
Load benchmark for KiCAD-Prism: simulates concurrent users browsing projects,
using the Remote Symbol Panel (search + signed asset downloads), and running
heavy Design Comparison / WebGPU 3D jobs.

Usage:
  python3 scripts/benchmark_concurrent_users.py \
    --base-url http://127.0.0.1:8080 \
    --users 20 --heavy-users 5 \
    --duration 600 \
    --network-delay-ms 45 --network-jitter-ms 25 \
    --session-cookie "$PRISM_BENCHMARK_SESSION_COOKIE" \
    --output /tmp/v3-capacity-hammer.json

VPN-like delay:
  --network-delay-ms / --network-jitter-ms inject one-way latency around each
  HTTP call (excluded from server latency metrics, included in client latency).
  Use a dedicated load environment; see docs/OPERATIONS.md for operational guidance.

Requires: aiohttp (pip install aiohttp)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import random
import statistics
import subprocess
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


SEARCH_TERMS = [
    "",
    "zener",
    "fuse",
    "diode",
    "tps",
    "onsemi",
    "cap",
    "regulator",
    "mosfet",
    "connector",
]

PANEL_PATHS = [
    "/.well-known/kicad-remote-provider",
    "/remote-provider/panel",
]

DEFAULT_JTYU_PROJECT_ID = "prj_82934087bb0d"
DEFAULT_COMPARE_HEAD = "aebbfebf290ab9f4a0f45e2546d229ad47f64cdb"
DEFAULT_COMPARE_BASE = "234e065b94ac1d0ee94d828aad093ab9a317f868"
DEFAULT_WEBGPU_COMMIT = "aebbfebf290ab9f4a0f45e2546d229ad47f64cdb"
FALLBACK_PREVIEW_COMPONENT_IDS = [
    "985319d4-dcd7-4c00-b90f-6743add054d4",
    "393107fc-6314-4992-aece-0046008c3b9d",
    "bee24c61-3b0f-48a9-ba35-aa169e62ad0f",
]

# Tunables set by run_benchmark() for request helpers.
NETWORK_DELAY_MS = 0.0
NETWORK_JITTER_MS = 0.0
NETWORK_LOSS_PCT = 0.0


@dataclass
class RequestMetric:
    endpoint: str
    status: int
    latency_ms: float
    bytes_in: int
    error: str | None = None
    network_delay_ms: float = 0.0

    @property
    def client_latency_ms(self) -> float:
        return self.latency_ms + self.network_delay_ms


@dataclass
class ContainerSample:
    timestamp: float
    name: str
    cpu_percent: float
    mem_mib: float
    mem_limit_mib: float
    net_rx_mib: float
    net_tx_mib: float
    block_read_mib: float
    block_write_mib: float


@dataclass
class BenchmarkResult:
    config: dict[str, Any]
    started_at: str
    finished_at: str
    duration_seconds: float
    total_requests: int
    failed_requests: int
    requests_per_second: float
    latency_ms: dict[str, float]
    client_latency_ms: dict[str, float]
    endpoint_stats: dict[str, dict[str, Any]]
    container_stats: dict[str, dict[str, Any]]
    disk_usage_gb: float | None = None
    job_stats: dict[str, Any] = field(default_factory=dict)
    operational_stats: dict[str, Any] = field(default_factory=dict)
    hardware_profile: dict[str, Any] = field(default_factory=dict)
    place_stats: dict[str, Any] = field(default_factory=dict)


async def apply_network_delay() -> float:
    """Inject one-way VPN-like delay before an HTTP call. Returns delay in ms."""

    if NETWORK_LOSS_PCT > 0 and random.random() * 100.0 < NETWORK_LOSS_PCT:
        await asyncio.sleep(random.uniform(0.05, 0.25))
        raise aiohttp.ClientConnectionError("simulated VPN packet loss")
    if NETWORK_DELAY_MS <= 0 and NETWORK_JITTER_MS <= 0:
        return 0.0
    delay_ms = max(0.0, NETWORK_DELAY_MS + random.uniform(-NETWORK_JITTER_MS, NETWORK_JITTER_MS))
    if delay_ms > 0:
        await asyncio.sleep(delay_ms / 1000.0)
    return delay_ms


def resolve_url(base_url: str, url: str) -> str:
    if not url:
        return ""
    if url.startswith("/"):
        return f"{base_url.rstrip('/')}{url}"
    parsed = urlparse(url)
    if parsed.scheme and parsed.netloc:
        return f"{base_url.rstrip('/')}{parsed.path}" + (f"?{parsed.query}" if parsed.query else "")
    return url


def parse_docker_size(value: str) -> float:
    """Parse docker stats size strings like '437.2MiB' or '1.2GiB' to MiB."""
    value = value.strip()
    if not value or value == "--":
        return 0.0
    units = {
        "B": 1 / (1024 * 1024),
        "KiB": 1 / 1024,
        "MiB": 1.0,
        "GiB": 1024.0,
        "Ki": 1 / 1024,
        "Mi": 1.0,
        "Gi": 1024.0,
        "kB": 1 / 1024,
        "MB": 1.0,
        "GB": 1024.0,
    }
    for suffix, factor in sorted(units.items(), key=lambda item: -len(item[0])):
        if value.endswith(suffix):
            return float(value[: -len(suffix)]) * factor
    return float(value)


def parse_docker_io(value: str) -> tuple[float, float]:
    """Parse '1.2MB / 3.4MB' to (rx_mib, tx_mib)."""
    if not value or value == "--":
        return 0.0, 0.0
    parts = [part.strip() for part in value.split("/")]
    if len(parts) != 2:
        return 0.0, 0.0
    return parse_docker_size(parts[0]), parse_docker_size(parts[1])


def sample_docker_stats() -> list[ContainerSample]:
    try:
        proc = subprocess.run(
            [
                "docker",
                "stats",
                "--no-stream",
                "--format",
                "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
        )
    except (subprocess.SubprocessError, OSError):
        return []

    samples: list[ContainerSample] = []
    now = time.time()
    for line in proc.stdout.splitlines():
        if not line.strip() or "kicad-prism" not in line:
            continue
        parts = line.split("\t")
        if len(parts) != 5:
            continue
        name, cpu_raw, mem_raw, net_raw, block_raw = parts
        cpu = float(cpu_raw.replace("%", "").strip() or "0")
        mem_parts = [part.strip() for part in mem_raw.split("/")]
        mem_mib = parse_docker_size(mem_parts[0]) if mem_parts else 0.0
        mem_limit_mib = parse_docker_size(mem_parts[1]) if len(mem_parts) > 1 else 0.0
        net_rx, net_tx = parse_docker_io(net_raw)
        block_read, block_write = parse_docker_io(block_raw)
        samples.append(
            ContainerSample(
                timestamp=now,
                name=name,
                cpu_percent=cpu,
                mem_mib=mem_mib,
                mem_limit_mib=mem_limit_mib,
                net_rx_mib=net_rx,
                net_tx_mib=net_tx,
                block_read_mib=block_read,
                block_write_mib=block_write,
            )
        )
    return samples


def collect_hardware_profile() -> dict[str, Any]:
    memory_bytes = 0
    try:
        page_size = int(os.sysconf("SC_PAGE_SIZE"))
        pages = int(os.sysconf("SC_PHYS_PAGES"))
        memory_bytes = page_size * pages
    except (AttributeError, OSError, ValueError):
        pass
    profile = {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "logicalCpuCount": os.cpu_count() or 0,
        "memoryGiB": round(memory_bytes / (1024**3), 2) if memory_bytes else None,
        "python": platform.python_version(),
    }
    try:
        docker = subprocess.run(
            [
                "docker",
                "info",
                "--format",
                "{{json .DriverStatus}}|{{.NCPU}}|{{.MemTotal}}|{{.Architecture}}",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
        )
        if docker.returncode == 0 and docker.stdout.strip():
            profile["dockerHost"] = docker.stdout.strip()
    except (subprocess.SubprocessError, OSError):
        pass
    return profile


async def fetch_json(
    session: aiohttp.ClientSession,
    url: str,
    metrics: list[RequestMetric],
    endpoint: str,
) -> dict[str, Any] | list[Any] | None:
    try:
        network_delay_ms = await apply_network_delay()
    except aiohttp.ClientConnectionError as exc:
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=0.0,
                bytes_in=0,
                error=str(exc),
                network_delay_ms=0.0,
            )
        )
        return None
    start = time.perf_counter()
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            body = await resp.read()
            latency_ms = (time.perf_counter() - start) * 1000
            metrics.append(
                RequestMetric(
                    endpoint=endpoint,
                    status=resp.status,
                    latency_ms=latency_ms,
                    bytes_in=len(body),
                    error=None if resp.status < 400 else body[:200].decode("utf-8", "replace"),
                    network_delay_ms=network_delay_ms,
                )
            )
            if resp.status >= 400:
                return None
            return json.loads(body)
    except Exception as exc:  # noqa: BLE001
        latency_ms = (time.perf_counter() - start) * 1000
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=latency_ms,
                bytes_in=0,
                error=str(exc),
                network_delay_ms=network_delay_ms,
            )
        )
        return None


async def fetch_post_json(
    session: aiohttp.ClientSession,
    url: str,
    payload: dict[str, Any],
    metrics: list[RequestMetric],
    endpoint: str,
) -> dict[str, Any] | None:
    try:
        network_delay_ms = await apply_network_delay()
    except aiohttp.ClientConnectionError as exc:
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=0.0,
                bytes_in=0,
                error=str(exc),
                network_delay_ms=0.0,
            )
        )
        return None
    start = time.perf_counter()
    try:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            body = await resp.read()
            latency_ms = (time.perf_counter() - start) * 1000
            metrics.append(
                RequestMetric(
                    endpoint=endpoint,
                    status=resp.status,
                    latency_ms=latency_ms,
                    bytes_in=len(body),
                    error=None if resp.status < 400 else body[:200].decode("utf-8", "replace"),
                    network_delay_ms=network_delay_ms,
                )
            )
            if resp.status >= 400:
                return None
            return json.loads(body)
    except Exception as exc:  # noqa: BLE001
        latency_ms = (time.perf_counter() - start) * 1000
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=latency_ms,
                bytes_in=0,
                error=str(exc),
                network_delay_ms=network_delay_ms,
            )
        )
        return None


async def fetch_delete(
    session: aiohttp.ClientSession,
    url: str,
    metrics: list[RequestMetric],
    endpoint: str,
) -> None:
    try:
        network_delay_ms = await apply_network_delay()
    except aiohttp.ClientConnectionError as exc:
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=0.0,
                bytes_in=0,
                error=str(exc),
            )
        )
        return
    start = time.perf_counter()
    try:
        async with session.delete(url, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            body = await resp.read()
            latency_ms = (time.perf_counter() - start) * 1000
            metrics.append(
                RequestMetric(
                    endpoint=endpoint,
                    status=resp.status,
                    latency_ms=latency_ms,
                    bytes_in=len(body),
                    error=None if resp.status < 400 else body[:200].decode("utf-8", "replace"),
                    network_delay_ms=network_delay_ms,
                )
            )
    except Exception as exc:  # noqa: BLE001
        latency_ms = (time.perf_counter() - start) * 1000
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=latency_ms,
                bytes_in=0,
                error=str(exc),
                network_delay_ms=network_delay_ms,
            )
        )


async def fetch_bytes(
    session: aiohttp.ClientSession,
    url: str,
    metrics: list[RequestMetric],
    endpoint: str,
    *,
    timeout: float = 120.0,
) -> bytes | None:
    try:
        network_delay_ms = await apply_network_delay()
    except aiohttp.ClientConnectionError as exc:
        metrics.append(
            RequestMetric(
                endpoint=endpoint,
                status=0,
                latency_ms=0.0,
                bytes_in=0,
                error=str(exc),
            )
        )
        return None
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
                    error=None if resp.status < 400 else body[:200].decode("utf-8", "replace"),
                    network_delay_ms=network_delay_ms,
                )
            )
            if resp.status >= 400:
                return None
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
                network_delay_ms=network_delay_ms,
            )
        )
        return None


async def fetch_preview_urls(
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
            await fetch_bytes(session, preview_url, metrics, endpoint)


async def poll_job_status(
    session: aiohttp.ClientSession,
    status_url: str,
    metrics: list[RequestMetric],
    endpoint: str,
    *,
    timeout_seconds: float,
    poll_interval: float,
    terminal_statuses: set[str],
) -> dict[str, Any] | None:
    deadline = time.time() + timeout_seconds
    last_payload: dict[str, Any] | None = None
    while time.time() < deadline:
        payload = await fetch_json(session, status_url, metrics, endpoint)
        if not payload:
            return last_payload
        last_payload = payload if isinstance(payload, dict) else None
        status = str((last_payload or {}).get("status") or "").lower()
        if status in terminal_statuses:
            return last_payload
        await asyncio.sleep(poll_interval)
    return last_payload


async def run_design_compare_job(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
    *,
    project_id: str,
    base_commit: str,
    compare_commit: str,
    job_timeout: float,
    poll_interval: float,
) -> str:
    start_payload = await fetch_post_json(
        session,
        f"{base_url}/api/projects/{project_id}/design-compare",
        {
            "base": base_commit,
            "head": compare_commit,
            "include_unchanged": False,
        },
        metrics,
        "projects.design_compare.start",
    )
    if not start_payload or not start_payload.get("job_id"):
        return "failed"
    job_id = str(start_payload["job_id"])
    final = await poll_job_status(
        session,
        f"{base_url}/api/jobs/{job_id}",
        metrics,
        "projects.design_compare.status",
        timeout_seconds=job_timeout,
        poll_interval=poll_interval,
        terminal_statuses={"completed", "failed", "cancelled"},
    )
    status = str((final or {}).get("status") or "").lower()
    if status == "completed":
        result = await fetch_json(
            session,
            f"{base_url}/api/projects/{project_id}/design-compare/{job_id}",
            metrics,
            "projects.design_compare.result",
        )
        if isinstance(result, dict) and result.get("schema") == "prism.design_compare_bundle_v1":
            await asyncio.gather(
                *(
                    fetch_json(
                        session,
                        resolve_url(base_url, str(descriptor.get("url") or "")),
                        metrics,
                        f"projects.design_compare.sidecar.{name}",
                    )
                    for name, descriptor in (result.get("sidecars") or {}).items()
                    if isinstance(descriptor, dict) and descriptor.get("url")
                )
            )
        return "completed"
    if status in {"failed", "cancelled"}:
        return "failed"
    return "timeout"


async def run_webgpu_3d_job(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
    *,
    project_id: str,
    commit: str,
    job_timeout: float,
    poll_interval: float,
) -> str:
    start_payload = await fetch_post_json(
        session,
        f"{base_url}/api/projects/{project_id}/webgpu-3d/generate",
        {"commit": commit, "force": False},
        metrics,
        "projects.webgpu_3d.start",
    )
    if not start_payload or not start_payload.get("job_id"):
        return "failed"
    job_id = str(start_payload["job_id"])
    final = await poll_job_status(
        session,
        f"{base_url}/api/projects/jobs/{job_id}",
        metrics,
        "projects.webgpu_3d.status",
        timeout_seconds=job_timeout,
        poll_interval=poll_interval,
        terminal_statuses={"completed", "failed"},
    )
    status = str((final or {}).get("status") or "").lower()
    if status == "completed":
        commit_query = quote(commit)
        await fetch_json(
            session,
            f"{base_url}/api/projects/{project_id}/webgpu-3d/status?commit={commit_query}",
            metrics,
            "projects.webgpu_3d.readiness",
        )
        bundle_url = str((final or {}).get("bundle_url") or "")
        if bundle_url:
            await fetch_json(session, resolve_url(base_url, bundle_url), metrics, "projects.webgpu_3d.manifest")
        return "completed"
    if status == "failed":
        return "failed"
    return "timeout"


async def place_with_asset_downloads(
    session: aiohttp.ClientSession,
    base_url: str,
    component_id: str,
    metrics: list[RequestMetric],
    place_stats: dict[str, int],
) -> None:
    """KiCad-like place path: part manifest then signed asset downloads."""

    manifest = await fetch_json(
        session,
        f"{base_url}/api/remote-provider/parts/{component_id}",
        metrics,
        "remote.part_manifest",
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
        body = await fetch_bytes(
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
            place_stats["asset_bytes"] += len(body)
    place_stats["assets_downloaded"] += downloaded
    place_stats["assets_failed"] += failed
    if failed:
        place_stats["place_partial"] += 1
    else:
        place_stats["place_ok"] += 1


async def simulate_standard_burst(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
    project_ids: list[str],
    component_ids: list[str],
    categories: list[str],
    place_stats: dict[str, int],
) -> None:
    await fetch_json(session, f"{base_url}/api/workspace/bootstrap", metrics, "workspace.bootstrap")
    await fetch_json(session, f"{base_url}/api/folders/tree", metrics, "folders.tree")

    if project_ids:
        project_id = random.choice(project_ids)
        await fetch_json(
            session,
            f"{base_url}/api/projects/{project_id}/overview",
            metrics,
            "projects.overview",
        )
        await fetch_bytes(
            session,
            f"{base_url}/api/projects/{project_id}/thumbnail",
            metrics,
            "projects.thumbnail",
        )
        await fetch_json(
            session,
            f"{base_url}/api/projects/{project_id}/commits?limit=20",
            metrics,
            "projects.commits",
        )

    for path in PANEL_PATHS:
        await fetch_bytes(session, f"{base_url}{path}", metrics, f"panel{path}")

    await fetch_json(session, f"{base_url}/api/remote-provider/categories", metrics, "remote.categories")

    for _ in range(random.randint(2, 5)):
        query = random.choice(SEARCH_TERMS)
        q = quote(query)
        search_payload = await fetch_json(
            session,
            f"{base_url}/api/remote-provider/search?q={q}&page_size=50",
            metrics,
            "remote.search",
        )
        if isinstance(search_payload, dict):
            for item in (search_payload.get("items") or [])[:3]:
                if isinstance(item, dict):
                    await fetch_preview_urls(session, base_url, item, metrics)

    if categories:
        category = random.choice(categories)
        category_payload = await fetch_json(
            session,
            f"{base_url}/api/remote-provider/components-by-category?category={quote(category)}&page_size=200",
            metrics,
            "remote.components_by_category",
        )
        if isinstance(category_payload, dict):
            for item in (category_payload.get("items") or [])[:3]:
                if isinstance(item, dict):
                    await fetch_preview_urls(session, base_url, item, metrics)

    if component_ids:
        for component_id in random.sample(
            component_ids,
            k=min(random.randint(2, 4), len(component_ids)),
        ):
            detail = await fetch_json(
                session,
                f"{base_url}/api/remote-provider/components/{component_id}",
                metrics,
                "remote.component_detail",
            )
            if isinstance(detail, dict):
                await fetch_preview_urls(session, base_url, detail, metrics)
            # Prefer signed asset downloads (~80%); inline fallback otherwise.
            if random.random() < 0.8:
                await place_with_asset_downloads(
                    session,
                    base_url,
                    component_id,
                    metrics,
                    place_stats,
                )
            else:
                await fetch_json(
                    session,
                    f"{base_url}/api/remote-provider/components/{component_id}/inline",
                    metrics,
                    "remote.inline_bundle",
                )
                place_stats["inline_ok"] += 1


async def simulate_user(
    user_id: int,
    base_url: str,
    metrics: list[RequestMetric],
    project_ids: list[str],
    component_ids: list[str],
    categories: list[str],
    stop_at: float,
    *,
    profile: str,
    heavy_project_id: str,
    design_compare_base: str,
    design_compare_head: str,
    webgpu_commit: str,
    job_timeout: float,
    poll_interval: float,
    design_compare_weight: float,
    job_outcomes: list[dict[str, Any]],
    place_stats: dict[str, int],
    session_headers: dict[str, str],
) -> None:
    connector = aiohttp.TCPConnector(limit=8)
    async with aiohttp.ClientSession(
        connector=connector,
        headers=session_headers,
    ) as session:
        while time.time() < stop_at:
            if profile == "heavy":
                job_kind = (
                    "design_compare"
                    if random.random() < design_compare_weight
                    else "webgpu_3d"
                )
                if job_kind == "design_compare":
                    outcome = await run_design_compare_job(
                        session,
                        base_url,
                        metrics,
                        project_id=heavy_project_id,
                        base_commit=design_compare_base,
                        compare_commit=design_compare_head,
                        job_timeout=job_timeout,
                        poll_interval=poll_interval,
                    )
                    job_outcomes.append(
                        {
                            "user_id": user_id,
                            "profile": profile,
                            "job": "design_compare",
                            "outcome": outcome,
                        }
                    )
                else:
                    outcome = await run_webgpu_3d_job(
                        session,
                        base_url,
                        metrics,
                        project_id=heavy_project_id,
                        commit=webgpu_commit,
                        job_timeout=job_timeout,
                        poll_interval=poll_interval,
                    )
                    job_outcomes.append(
                        {
                            "user_id": user_id,
                            "profile": profile,
                            "job": "webgpu_3d",
                            "outcome": outcome,
                        }
                    )
                # Heavy users also exercise interactive/catalog paths between jobs.
                await simulate_standard_burst(
                    session,
                    base_url,
                    metrics,
                    project_ids,
                    component_ids,
                    categories,
                    place_stats,
                )
            else:
                await simulate_standard_burst(
                    session,
                    base_url,
                    metrics,
                    project_ids,
                    component_ids,
                    categories,
                    place_stats,
                )

            await asyncio.sleep(random.uniform(0.5, 2.5))


async def monitor_containers(
    samples: list[ContainerSample],
    stop_event: asyncio.Event,
    interval: float,
) -> None:
    while not stop_event.is_set():
        samples.extend(sample_docker_stats())
        await asyncio.sleep(interval)


def summarize_metrics(
    metrics: list[RequestMetric],
) -> tuple[dict[str, float], dict[str, float], dict[str, dict[str, Any]]]:
    latencies = [m.latency_ms for m in metrics if m.status and m.status < 400]
    client_latencies = [
        m.client_latency_ms for m in metrics if m.status and m.status < 400
    ]

    def pct(values: list[float], p: float) -> float:
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        idx = min(len(sorted_vals) - 1, int(round((p / 100) * (len(sorted_vals) - 1))))
        return sorted_vals[idx]

    def summary(values: list[float]) -> dict[str, float]:
        return {
            "p50": pct(values, 50),
            "p95": pct(values, 95),
            "p99": pct(values, 99),
            "max": max(values) if values else 0.0,
            "mean": statistics.mean(values) if values else 0.0,
        }

    by_endpoint: dict[str, list[RequestMetric]] = {}
    for metric in metrics:
        by_endpoint.setdefault(metric.endpoint, []).append(metric)

    endpoint_stats: dict[str, dict[str, Any]] = {}
    for endpoint, items in sorted(by_endpoint.items()):
        ok = [m for m in items if m.status and m.status < 400]
        endpoint_stats[endpoint] = {
            "count": len(items),
            "errors": len(items) - len(ok),
            "p50_ms": pct([m.latency_ms for m in ok], 50),
            "p95_ms": pct([m.latency_ms for m in ok], 95),
            "client_p95_ms": pct([m.client_latency_ms for m in ok], 95),
            "mean_ms": statistics.mean([m.latency_ms for m in ok]) if ok else 0.0,
            "bytes_total": sum(m.bytes_in for m in ok),
        }
    return summary(latencies), summary(client_latencies), endpoint_stats


def summarize_container_samples(samples: list[ContainerSample]) -> dict[str, dict[str, Any]]:
    by_name: dict[str, list[ContainerSample]] = {}
    for sample in samples:
        by_name.setdefault(sample.name, []).append(sample)

    summary: dict[str, dict[str, Any]] = {}
    for name, items in sorted(by_name.items()):
        summary[name] = {
            "cpu_percent_avg": round(statistics.mean(s.cpu_percent for s in items), 2),
            "cpu_percent_peak": round(max(s.cpu_percent for s in items), 2),
            "mem_mib_avg": round(statistics.mean(s.mem_mib for s in items), 1),
            "mem_mib_peak": round(max(s.mem_mib for s in items), 1),
            "net_rx_mib_total": round(max(s.net_rx_mib for s in items) - min(s.net_rx_mib for s in items), 2),
            "net_tx_mib_total": round(max(s.net_tx_mib for s in items) - min(s.net_tx_mib for s in items), 2),
            "block_read_mib_total": round(max(s.block_read_mib for s in items) - min(s.block_read_mib for s in items), 2),
            "block_write_mib_total": round(max(s.block_write_mib for s in items) - min(s.block_write_mib for s in items), 2),
            "samples": len(items),
        }
    return summary


def measure_disk_usage_gb(data_dir: Path) -> float | None:
    if not data_dir.exists():
        return None
    total = 0
    for path in data_dir.rglob("*"):
        if path.is_file():
            try:
                total += path.stat().st_size
            except OSError:
                pass
    return round(total / (1024**3), 2)


def summarize_job_outcomes(outcomes: list[dict[str, Any]]) -> dict[str, Any]:
    by_job: dict[str, dict[str, int]] = {}
    for item in outcomes:
        job = str(item.get("job") or "unknown")
        outcome = str(item.get("outcome") or "unknown")
        by_job.setdefault(job, {})
        by_job[job][outcome] = by_job[job].get(outcome, 0) + 1
    return {
        "total_jobs": len(outcomes),
        "by_job": by_job,
        "outcomes": outcomes,
    }


async def discover_catalog_context(
    session: aiohttp.ClientSession,
    base_url: str,
    metrics: list[RequestMetric],
) -> tuple[list[str], list[str], list[str], int]:
    bootstrap = await fetch_json(session, f"{base_url}/api/workspace/bootstrap", metrics, "setup.bootstrap")
    categories_payload = await fetch_json(session, f"{base_url}/api/remote-provider/categories", metrics, "setup.categories")

    project_ids = [p["id"] for p in (bootstrap or {}).get("projects", []) if isinstance(bootstrap, dict)]
    categories = [
        c["name"] for c in (categories_payload or {}).get("categories", []) if isinstance(categories_payload, dict)
    ]

    component_ids: list[str] = []
    preview_component_ids: list[str] = []
    seen: set[str] = set()
    queries = list(SEARCH_TERMS) + (categories[:10] if categories else [])
    random.shuffle(queries)

    for query in queries:
        q = quote(query)
        search_payload = await fetch_json(
            session,
            f"{base_url}/api/remote-provider/search?q={q}&page_size=50",
            metrics,
            "setup.search",
        )
        if not isinstance(search_payload, dict):
            continue
        for item in search_payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            component_id = str(item.get("id") or "")
            if not component_id or component_id in seen:
                continue
            seen.add(component_id)
            component_ids.append(component_id)
            if item.get("symbol_preview_url") or item.get("footprint_preview_url"):
                preview_component_ids.append(component_id)

    if len(preview_component_ids) < 10:
        for component_id in component_ids[:100]:
            detail = await fetch_json(
                session,
                f"{base_url}/api/remote-provider/components/{component_id}",
                metrics,
                "setup.component_detail",
            )
            if isinstance(detail, dict) and (
                detail.get("symbol_preview_url") or detail.get("footprint_preview_url")
            ):
                preview_component_ids.append(component_id)

    if preview_component_ids:
        component_ids = preview_component_ids + [cid for cid in component_ids if cid not in preview_component_ids]
    else:
        for component_id in FALLBACK_PREVIEW_COMPONENT_IDS:
            if component_id not in seen:
                component_ids.insert(0, component_id)
                preview_component_ids.append(component_id)

    return project_ids, categories, component_ids[:200], len(preview_component_ids)


async def run_benchmark(args: argparse.Namespace) -> BenchmarkResult:
    global NETWORK_DELAY_MS, NETWORK_JITTER_MS, NETWORK_LOSS_PCT
    NETWORK_DELAY_MS = float(args.network_delay_ms)
    NETWORK_JITTER_MS = float(args.network_jitter_ms)
    NETWORK_LOSS_PCT = float(args.network_loss_pct)

    base_url = args.base_url.rstrip("/")
    metrics: list[RequestMetric] = []
    container_samples: list[ContainerSample] = []
    session_headers: dict[str, str] = {}
    if args.bearer_token:
        session_headers["Authorization"] = f"Bearer {args.bearer_token}"
    elif args.session_cookie:
        session_headers["Cookie"] = f"kicad_prism_session={args.session_cookie}"

    async with aiohttp.ClientSession(headers=session_headers) as session:
        project_ids, categories, component_ids, preview_component_count = await discover_catalog_context(
            session, base_url, metrics
        )

    if not project_ids:
        print("Warning: no projects found; project-browsing portion will be skipped.", file=sys.stderr)
    if not component_ids:
        print("Warning: no catalog components found; detail/manifest calls will be skipped.", file=sys.stderr)

    stop_event = asyncio.Event()
    monitor_task = asyncio.create_task(
        monitor_containers(container_samples, stop_event, args.sample_interval)
    )

    started = time.time()
    started_at = datetime.now(timezone.utc).isoformat()
    stop_at = started + args.duration
    job_outcomes: list[dict[str, Any]] = []
    place_stats: dict[str, int] = {
        "manifest_ok": 0,
        "manifest_failed": 0,
        "manifest_empty": 0,
        "assets_downloaded": 0,
        "assets_failed": 0,
        "asset_bytes": 0,
        "place_ok": 0,
        "place_partial": 0,
        "inline_ok": 0,
    }

    heavy_users = min(args.heavy_users, args.users)
    user_profiles = ["heavy"] * heavy_users + ["standard"] * (args.users - heavy_users)
    random.shuffle(user_profiles)

    user_tasks = [
        asyncio.create_task(
            simulate_user(
                user_id=i,
                base_url=base_url,
                metrics=metrics,
                project_ids=project_ids,
                component_ids=component_ids,
                categories=categories,
                stop_at=stop_at,
                profile=user_profiles[i],
                heavy_project_id=args.heavy_project_id,
                design_compare_base=args.design_compare_base,
                design_compare_head=args.design_compare_head,
                webgpu_commit=args.webgpu_commit,
                job_timeout=args.job_timeout,
                poll_interval=args.poll_interval,
                design_compare_weight=args.design_compare_weight,
                job_outcomes=job_outcomes,
                place_stats=place_stats,
                session_headers=session_headers,
            )
        )
        for i in range(args.users)
    ]

    await asyncio.gather(*user_tasks)
    stop_event.set()
    try:
        await monitor_task
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: container monitoring stopped early: {exc}", file=sys.stderr)

    finished = time.time()
    finished_at = datetime.now(timezone.utc).isoformat()
    elapsed = finished - started
    async with aiohttp.ClientSession(headers=session_headers) as session:
        operational_payload = await fetch_json(
            session,
            (
                f"{base_url}/api/jobs/benchmark-metrics"
                f"?since={quote(started_at)}"
            ),
            metrics,
            "jobs.benchmark_metrics",
        )
    operational_stats = (
        operational_payload if isinstance(operational_payload, dict) else {}
    )

    overall_latency, client_latency, endpoint_stats = summarize_metrics(metrics)
    container_stats = summarize_container_samples(container_samples)
    failed = sum(1 for m in metrics if not m.status or m.status >= 400)

    data_dir = Path(args.data_dir) if args.data_dir else Path(__file__).resolve().parents[1] / "data" / "projects"

    return BenchmarkResult(
        config={
            "base_url": base_url,
            "users": args.users,
            "heavy_users": heavy_users,
            "duration_seconds": args.duration,
            "sample_interval_seconds": args.sample_interval,
            "job_timeout_seconds": args.job_timeout,
            "poll_interval_seconds": args.poll_interval,
            "heavy_project_id": args.heavy_project_id,
            "design_compare_base": args.design_compare_base,
            "design_compare_head": args.design_compare_head,
            "webgpu_commit": args.webgpu_commit,
            "design_compare_weight": args.design_compare_weight,
            "network_delay_ms": args.network_delay_ms,
            "network_jitter_ms": args.network_jitter_ms,
            "network_loss_pct": args.network_loss_pct,
            "network": "docker_internal" if "kicad-prism-frontend" in base_url or base_url.endswith("//frontend") or "://frontend" in base_url else "localhost",
            "projects": len(project_ids),
            "categories": len(categories),
            "catalog_components": len(component_ids),
            "catalog_components_with_previews": preview_component_count,
        },
        started_at=started_at,
        finished_at=finished_at,
        duration_seconds=round(elapsed, 2),
        total_requests=len(metrics),
        failed_requests=failed,
        requests_per_second=round(len(metrics) / elapsed, 2) if elapsed else 0.0,
        latency_ms=overall_latency,
        client_latency_ms=client_latency,
        endpoint_stats=endpoint_stats,
        container_stats=container_stats,
        disk_usage_gb=measure_disk_usage_gb(data_dir),
        job_stats=summarize_job_outcomes(job_outcomes),
        operational_stats=operational_stats,
        hardware_profile=collect_hardware_profile(),
        place_stats=place_stats,
    )


def recommend_vm_specs(result: BenchmarkResult) -> dict[str, Any]:
    containers = result.container_stats
    total_mem_peak_mib = sum(c.get("mem_mib_peak", 0) for c in containers.values())
    total_cpu_peak = sum(c.get("cpu_percent_peak", 0) for c in containers.values())
    total_net_mib = sum(c.get("net_tx_mib_total", 0) for c in containers.values())
    used_compose_ceilings = False

    # When docker stats are unavailable (common in restricted CI/agent shells),
    # fall back to a conservative but realistic envelope for the default Compose
    # layout (API + prism-worker + catalog-worker + Postgres), not the arithmetic
    # sum of every service ceiling (those do not all peg simultaneously).
    if not containers or (total_mem_peak_mib <= 0 and total_cpu_peak <= 0):
        used_compose_ceilings = True
        total_cpu_peak = 800.0  # ~8 cores sustained under mixed heavy+interactive
        total_mem_peak_mib = 20 * 1024  # ~20 GiB working set with headroom for spikes

    # Headroom over observed peaks; compose-fallback path already embeds headroom.
    if used_compose_ceilings:
        mem_gb_recommended = 32
        cpu_cores_recommended = 16
    else:
        mem_gb_recommended = max(8, round((total_mem_peak_mib * 2) / 1024 + 0.5))
        cpu_cores_recommended = max(4, round((total_cpu_peak / 100) * 1.5 + 0.5))
    disk_gb_recommended = max(80, round((result.disk_usage_gb or 20) * 1.5 + 40))

    # Prefer known EC2 shapes that fit Prism's worker + API split.
    if cpu_cores_recommended <= 4 and mem_gb_recommended <= 16:
        instance_hint = "c7i.xlarge or m7i.xlarge (4 vCPU / 8–16 GiB)"
    elif cpu_cores_recommended <= 8 and mem_gb_recommended <= 32:
        instance_hint = "c7i.2xlarge or m7i.2xlarge (8 vCPU / 16–32 GiB)"
    else:
        instance_hint = "c7i.4xlarge or m7i.4xlarge (16 vCPU / 32–64 GiB)"

    notes = [
        "Specs include headroom over observed Docker peak (or Compose-based envelope when stats are missing).",
        "CPU recommendation assumes 1 vCPU ~= 100% of one core in docker stats.",
        "Disk includes project/catalog/.kicad-prism artifacts plus growth headroom; use local NVMe (gp3/io2), not EFS for the projects volume.",
        "Keep UVICORN_WORKERS=1 for the API until multi-process API tests pass; scale prism-worker concurrency/slots instead.",
        "Separate API and worker CPU ceilings in Compose/systemd so interactive traffic retains capacity during heavy jobs.",
        "OIDC, TLS termination, backups, and monitoring are required before production EC2 exposure.",
    ]
    if used_compose_ceilings:
        notes.insert(
            0,
            "Docker stats were unavailable; sizing uses a Compose-based envelope (16 vCPU / 32 GiB) sized for overlapping API + worker ceilings.",
        )
        notes.insert(
            1,
            "A tuned 8 vCPU / 16 GiB host can work if heavy job slots stay low and cold overlaps are rare — validate with live docker stats.",
        )
    return {
        "observed_peak_total_memory_mib": round(total_mem_peak_mib, 1),
        "observed_peak_total_cpu_percent": round(total_cpu_peak, 1),
        "observed_network_egress_mib_during_test": round(total_net_mib, 2),
        "sizing_basis": "compose_ceilings" if used_compose_ceilings else "docker_stats",
        "recommended_vm_specs": {
            "cpu_cores": cpu_cores_recommended,
            "ram_gb": mem_gb_recommended,
            "disk_gb": disk_gb_recommended,
            "ec2_instance_hint": instance_hint,
            "notes": notes,
        },
    }


def print_report(result: BenchmarkResult, recommendations: dict[str, Any]) -> None:
    print("\n=== KiCAD-Prism Concurrent User Benchmark ===")
    print(json.dumps(result.config, indent=2))
    print(f"\nDuration: {result.duration_seconds}s")
    print(f"Requests: {result.total_requests} ({result.requests_per_second}/s), failures: {result.failed_requests}")
    print(
        "Server latency (ms, excludes injected VPN delay): "
        f"p50={result.latency_ms['p50']:.1f}, "
        f"p95={result.latency_ms['p95']:.1f}, "
        f"p99={result.latency_ms['p99']:.1f}, "
        f"max={result.latency_ms['max']:.1f}"
    )
    print(
        "Client latency (ms, includes injected VPN delay): "
        f"p50={result.client_latency_ms['p50']:.1f}, "
        f"p95={result.client_latency_ms['p95']:.1f}, "
        f"p99={result.client_latency_ms['p99']:.1f}, "
        f"max={result.client_latency_ms['max']:.1f}"
    )
    if result.disk_usage_gb is not None:
        print(f"Project/catalog disk usage: {result.disk_usage_gb} GB")

    print("\n--- Per-endpoint ---")
    for endpoint, stats in result.endpoint_stats.items():
        print(
            f"{endpoint:40s} count={stats['count']:4d} err={stats['errors']:3d} "
            f"p50={stats['p50_ms']:7.1f}ms p95={stats['p95_ms']:7.1f}ms "
            f"client_p95={stats['client_p95_ms']:7.1f}ms "
            f"bytes={stats['bytes_total'] / (1024 * 1024):.2f} MiB"
        )

    print("\n--- Container resource usage ---")
    for name, stats in result.container_stats.items():
        print(
            f"{name:28s} CPU avg/peak={stats['cpu_percent_avg']:5.1f}/{stats['cpu_percent_peak']:5.1f}% "
            f"MEM avg/peak={stats['mem_mib_avg']:7.1f}/{stats['mem_mib_peak']:7.1f} MiB "
            f"net_tx={stats['net_tx_mib_total']:.2f} MiB"
        )

    if result.job_stats.get("total_jobs"):
        print("\n--- Heavy jobs (Design Comparison / WebGPU 3D) ---")
        print(json.dumps(result.job_stats["by_job"], indent=2))
    if result.place_stats:
        print("\n--- Remote panel place / asset downloads ---")
        print(json.dumps(result.place_stats, indent=2))
    if result.operational_stats:
        print("\n--- Queue / pool instrumentation ---")
        print(json.dumps(result.operational_stats, indent=2))
    print("\n--- Hardware profile ---")
    print(json.dumps(result.hardware_profile, indent=2))

    print("\n--- Recommended VM specs ---")
    rec = recommendations["recommended_vm_specs"]
    print(f"CPU:  {rec['cpu_cores']} vCPU")
    print(f"RAM:  {rec['ram_gb']} GB")
    print(f"Disk: {rec['disk_gb']} GB (local SSD/NVMe)")
    print(f"EC2:  {rec['ec2_instance_hint']}")
    for note in rec["notes"]:
        print(f"  - {note}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark KiCAD-Prism under concurrent user load.")
    parser.add_argument(
        "--base-url",
        default="http://kicad-prism-frontend:80",
        help="Prism base URL (use http://kicad-prism-frontend:80 from another Docker container)",
    )
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--heavy-users", type=int, default=5, help="Users running Design Comparison / WebGPU 3D jobs")
    parser.add_argument("--duration", type=int, default=600, help="Test duration in seconds")
    parser.add_argument("--job-timeout", type=float, default=900.0, help="Max seconds to wait for heavy jobs")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Job status polling interval")
    parser.add_argument("--heavy-project-id", default=DEFAULT_JTYU_PROJECT_ID)
    parser.add_argument("--design-compare-base", default=DEFAULT_COMPARE_BASE)
    parser.add_argument("--design-compare-head", default=DEFAULT_COMPARE_HEAD)
    parser.add_argument("--webgpu-commit", default=DEFAULT_WEBGPU_COMMIT)
    parser.add_argument(
        "--design-compare-weight",
        type=float,
        default=0.5,
        help="Probability a heavy user picks Design Comparison vs WebGPU (0–1)",
    )
    parser.add_argument(
        "--network-delay-ms",
        type=float,
        default=45.0,
        help="One-way VPN-like delay injected before each HTTP call (ms). 45ms ≈ 90ms RTT.",
    )
    parser.add_argument(
        "--network-jitter-ms",
        type=float,
        default=25.0,
        help="Uniform jitter applied to network delay (ms)",
    )
    parser.add_argument(
        "--network-loss-pct",
        type=float,
        default=0.1,
        help="Simulated packet-loss percentage (0 disables)",
    )
    parser.add_argument("--sample-interval", type=float, default=2.0, help="Docker stats sampling interval")
    parser.add_argument("--data-dir", default="", help="Path to data/projects for disk sizing")
    parser.add_argument("--output", default="", help="Write JSON report to this path")
    parser.add_argument(
        "--session-cookie",
        default=os.environ.get("PRISM_BENCHMARK_SESSION_COOKIE", ""),
        help="Signed kicad_prism_session value (or PRISM_BENCHMARK_SESSION_COOKIE).",
    )
    parser.add_argument(
        "--bearer-token",
        default=os.environ.get("PRISM_BENCHMARK_BEARER_TOKEN", ""),
        help="OAuth/service bearer token (or PRISM_BENCHMARK_BEARER_TOKEN).",
    )
    args = parser.parse_args()
    if not 0.0 <= args.design_compare_weight <= 1.0:
        parser.error("--design-compare-weight must be between 0 and 1")
    if not args.session_cookie and not args.bearer_token:
        parser.error("Provide --session-cookie or --bearer-token (or the matching env var)")

    result = asyncio.run(run_benchmark(args))
    recommendations = recommend_vm_specs(result)
    print_report(result, recommendations)

    if args.output:
        payload = {
            "benchmark": result.__dict__,
            "recommendations": recommendations,
        }
        Path(args.output).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nWrote report: {args.output}")


if __name__ == "__main__":
    main()
