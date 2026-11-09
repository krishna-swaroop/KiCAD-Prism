#!/usr/bin/env python3
"""Build a frozen, synthetic Supply dataset and measure the pages that read it.

Two subcommands share one dedicated database:

    seed  creates the schema the app would create, then inserts a deterministic
          set of manufacturers, parts, listings, offers, stock history, tiers,
          projects, BOM lines, alerts and unmatched inventory rows.
    run   measures the Supply read models against that data: SQL statements,
          cold and warm latency, worker peak memory, and browser heap and DOM
          size when a URL is given.

The database name must start with ``bench_``. Nothing here can be pointed at an
application database.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import resource
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit


TABLES = (
    "supply_manufacturers",
    "supply_parts",
    "supply_connectors",
    "supply_listings",
    "supply_offers",
    "supply_samples_daily",
    "supply_samples",
    "supply_price_breaks_history",
    "supply_part_tiers",
    "supply_bom_usage_projects",
    "supply_bom_usage",
    "supply_tracked_projects",
    "supply_attention",
    "inventory_sources",
    "inventory_unmatched",
)

PAGES = (
    "?section=supply&supplyView=dashboard",
    "?section=supply&supplyView=tracking",
    "?section=supply&supplyView=projects",
    "?section=supply&supplyView=insights",
    "?section=library-manager&libraryView=review",
)

ROLES = "{admin,designer,qa}"


def bench_database_name(url: str) -> str:
    """The database name in ``url``, refusing anything that is not a bench database."""

    path = urlsplit(url).path.strip("/")
    if not path:
        raise SystemExit(
            "Refusing to run: the URL names no database. Point --database-url at a database whose name starts with 'bench_'."
        )
    name = path.split("/")[0]
    if not name.startswith("bench_"):
        raise SystemExit(
            f"Refusing to run: database {name!r} does not start with 'bench_'. Point --database-url at a bench_ database."
        )
    return name


def percentile(values: list[float], p: float) -> float:
    """The nearest-rank percentile of ``values``; 0 for an empty list."""

    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(-(-p * len(ordered) // 100)) - 1))
    return ordered[index]


def rss_bytes(ru_maxrss: int, platform_name: str) -> int:
    """Normalise ``resource.getrusage`` peak RSS to bytes.

    macOS reports bytes; Linux reports KiB. Other platforms are treated like
    Linux because that is the only other shape these runs have used.
    """

    return int(ru_maxrss) if platform_name == "darwin" else int(ru_maxrss) * 1024


def peak_rss_bytes() -> int:
    return rss_bytes(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, sys.platform)


def _prepare_environment(url: str) -> None:
    """Point app imports at the bench database and keep catalog scratch out of ``data/``."""

    normalised = url.replace("postgresql+psycopg://", "postgresql://", 1)
    os.environ["PRISM_DATABASE_URL"] = normalised
    os.environ.pop("TEST_POSTGRES_URL", None)
    os.environ.setdefault("KICAD_PROJECTS_ROOT", tempfile.mkdtemp(prefix="prism-supply-bench-"))


def _store():
    from app.services.supply.store import supply_store

    return supply_store


def _seed(url: str, args: argparse.Namespace) -> None:
    _prepare_environment(url)

    from app.services.component_catalog_service import catalog_service
    from app.api import supply_connectors

    catalog_service.initialize()
    supply_connectors.service.store.initialize()

    store = supply_connectors.service.store
    with store.connection() as conn:
        existing = conn.execute(
            "SELECT (SELECT COUNT(*) FROM supply_manufacturers) + (SELECT COUNT(*) FROM supply_parts) AS n"
        ).fetchone()["n"]
        if existing:
            raise SystemExit(
                f"Database {bench_database_name(url)!r} is already seeded. Drop and recreate it to seed again."
            )
        _insert_fixture(conn, args)
        conn.execute("ANALYZE")

    with store.connection() as conn:
        print("\nSeeded rows:")
        for table in TABLES:
            count = conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]
            print(f"  {count:9d}  {table}")


def _insert_fixture(conn, args: argparse.Namespace) -> None:
    seed = str(args.seed)
    parts = int(args.parts)
    projects = int(args.projects)
    lines = int(args.lines)
    days = int(args.history_days)
    unmatched = int(args.unmatched)
    alerts = int(args.alerts)

    print(f"Seeding {parts} parts, {projects} projects and {days} days of history...", flush=True)

    conn.execute(
        """
        INSERT INTO supply_manufacturers (id, name, name_key)
        SELECT 'm' || lpad(g::text, 4, '0'),
               'Bench Manufacturer ' || lpad(g::text, 4, '0'),
               'bench manufacturer ' || lpad(g::text, 4, '0')
        FROM generate_series(1, 600) g
        """
    )

    # Part identity is derived from the row number and the maker from the seed,
    # so two seeds with the same parameters differ only in data.
    conn.execute(
        """
        INSERT INTO supply_parts (id, manufacturer_id, mpn, match_key)
        SELECT 'p' || lpad(g::text, 6, '0'),
               'm' || lpad((1 + abs(hashtext(%(seed)s || ':maker:' || g)) %% 600)::text, 4, '0'),
               'MPN-' || lpad(g::text, 6, '0'),
               'MPN' || lpad(g::text, 6, '0')
        FROM generate_series(1, %(parts)s) g
        """,
        {"seed": seed, "parts": parts},
    )

    # The two fake storefronts share one account and its budget, as connectors on one set of credentials do.
    conn.execute(
        """
        INSERT INTO supply_accounts (id, provider, account_key, daily_budget)
        VALUES ('acct-fake', 'fake', 'bench-account', 0), ('acct-csv', 'csv', '', 0)
        """
    )
    conn.execute(
        """
        INSERT INTO supply_connectors (id, provider, storefront, display_name, currency, account_id, enabled)
        VALUES
            ('conn-fake-xa', 'fake', 'XA', 'Bench Fake XA', 'USD', 'acct-fake', TRUE),
            ('conn-fake-xb', 'fake', 'XB', 'Bench Fake XB', 'USD', 'acct-fake', TRUE),
            ('conn-csv', 'csv', '', 'Bench CSV', 'USD', 'acct-csv', TRUE)
        """
    )

    conn.execute(
        """
        INSERT INTO supply_listings
            (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, packaging,
             match_state, match_reason, matched_by, first_seen_at, last_seen_at)
        SELECT 'l-' || c.storefront || '-' || p.id,
               c.id,
               c.storefront || '-' || p.mpn,
               p.id,
               p.mpn,
               m.name,
               'cut_tape',
               'exact',
               'bench',
               'discovery',
               NOW() - (%(days)s || ' days')::interval,
               NOW()
        FROM supply_parts p
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        CROSS JOIN supply_connectors c
        WHERE c.provider = 'fake'
        """,
        {"days": days},
    )

    conn.execute(
        """
        INSERT INTO supply_listings
            (id, connector_id, sku, part_id, raw_mpn, raw_manufacturer, packaging,
             match_state, match_reason, matched_by, first_seen_at, last_seen_at)
        SELECT 'l-csv-' || p.id,
               'conn-csv',
               'CSV-' || p.mpn,
               p.id,
               p.mpn,
               m.name,
               'cut_tape',
               'exact',
               'bench',
               'discovery',
               NOW() - (%(days)s || ' days')::interval,
               NOW()
        FROM supply_parts p
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE p.id IN (SELECT id FROM supply_parts ORDER BY id LIMIT 2)
        """,
        {"days": days},
    )

    conn.execute(
        """
        WITH listing AS (
            SELECT l.id,
                   abs(hashtext(%(seed)s || ':stock:' || l.id)) %% 20000 AS stock,
                   abs(hashtext(%(seed)s || ':moq:' || l.id)) %% 10 AS moq,
                   abs(hashtext(%(seed)s || ':mult:' || l.id)) AS mult,
                   abs(hashtext(%(seed)s || ':lead:' || l.id)) %% 60 AS lead,
                   abs(hashtext(%(seed)s || ':life:' || l.id)) AS life,
                   CASE abs(hashtext(%(seed)s || ':pack:' || l.id)) %% 4
                       WHEN 0 THEN 'tape_reel' WHEN 1 THEN 'tray' WHEN 2 THEN 'tube' ELSE 'cut_tape'
                   END AS packaging
            FROM supply_listings l
        )
        INSERT INTO supply_offers
            (listing_id, fetched_at, stock, incoming, moq, order_multiple, packaging,
             price_breaks, currency, lead_time_days, lifecycle, discontinued, rohs,
             marketplace, product_url)
        SELECT id,
               NOW(),
               stock,
               '[]'::jsonb,
               1 + moq,
               CASE WHEN mult %% 4 = 0 THEN 10 WHEN mult %% 2 = 0 THEN 5 ELSE 1 END,
               packaging,
               jsonb_build_array(
                   jsonb_build_array(1, to_char(0.30 + (mult %% 70) / 100.0, 'FM9999990.00')),
                   jsonb_build_array(100, to_char(0.15 + (mult %% 40) / 100.0, 'FM9999990.00'))
               ),
               'USD',
               lead,
               CASE WHEN life %% 97 = 0 THEN 'obsolete' WHEN life %% 25 = 0 THEN 'nrnd' ELSE 'active' END,
               FALSE,
               TRUE,
               FALSE,
               ''
        FROM listing
        """,
        {"seed": seed},
    )

    # A sawtooth: stock falls each day and restocks at the start of every cycle.
    # History is placed relative to the run day so every run has the same age profile.
    conn.execute(
        """
        WITH listing AS (
            SELECT l.id,
                   14 + abs(hashtext(%(seed)s || ':period:' || l.id)) %% 21 AS period,
                   2 + abs(hashtext(%(seed)s || ':drain:' || l.id)) %% 18 AS drain,
                   200 + abs(hashtext(%(seed)s || ':base:' || l.id)) %% 1800 AS base
            FROM supply_listings l
        )
        INSERT INTO supply_samples_daily (listing_id, day, stock)
        SELECT li.id,
               CURRENT_DATE - (d - 1),
               s.stock
        FROM listing li
        CROSS JOIN generate_series(1, %(days)s) d
        CROSS JOIN LATERAL (
            SELECT GREATEST(0, li.base - ((d - 1) %% li.period) * li.drain) AS stock
        ) s
        """,
        {"seed": seed, "days": days},
    )

    # Prices are kept as price breaks: each listing's offer breaks, in force over the whole history.
    conn.execute(
        """
        INSERT INTO supply_price_breaks_history (listing_id, since, breaks, currency, moq, order_multiple)
        SELECT listing_id, (CURRENT_DATE - %(days)s)::timestamp AT TIME ZONE 'UTC', price_breaks, currency, moq, order_multiple
        FROM supply_offers
        """,
        {"days": days},
    )

    conn.execute(
        """
        INSERT INTO supply_samples
            (listing_id, sampled_at, stock, incoming_qty,
             lead_time_days, lifecycle, discontinued, marketplace, moq, order_multiple)
        SELECT sd.listing_id,
               sd.day + time '12:00',
               sd.stock,
               0,
               o.lead_time_days,
               o.lifecycle,
               o.discontinued,
               sd.marketplace,
               o.moq,
               o.order_multiple
        FROM supply_samples_daily sd
        JOIN supply_offers o ON o.listing_id = sd.listing_id
        WHERE sd.day > CURRENT_DATE - 3
        """
    )

    conn.execute(
        """
        INSERT INTO supply_part_tiers (part_id, tier, rate, reasons)
        SELECT p.id,
               CASE WHEN abs(hashtext(%(seed)s || ':tier:' || p.id)) %% 10 = 0 THEN 1 ELSE 2 END,
               CASE WHEN abs(hashtext(%(seed)s || ':tier:' || p.id)) %% 10 = 0 THEN 'daily' ELSE 'weekly' END,
               '[]'::jsonb
        FROM supply_parts p
        """,
        {"seed": seed},
    )

    conn.execute(
        """
        INSERT INTO supply_bom_usage_projects
            (project_id, project_name, revision_key, line_count, updated_at, visible_roles)
        SELECT 'prj-bench-' || lpad(g::text, 4, '0'),
               'Bench Board ' || lpad(g::text, 4, '0'),
               'bench-rev-1',
               %(lines)s,
               NOW(),
               %(roles)s::text[]
        FROM generate_series(1, %(projects)s) g
        """,
        {"lines": lines, "projects": projects, "roles": ROLES},
    )

    conn.execute(
        """
        INSERT INTO supply_bom_usage
            (project_id, line_key, manufacturer, mpn, alias_key, match_key, quantity, refs)
        SELECT 'prj-bench-' || lpad(g::text, 4, '0'),
               'L' || g || '-' || p.n,
               m.name,
               p.mpn,
               m.name_key,
               p.match_key,
               1 + (p.n %% 4),
               'R' || p.n
        FROM generate_series(1, %(projects)s) g
        CROSS JOIN LATERAL (
            SELECT sp.*, row_number() OVER () AS n
            FROM (
                SELECT * FROM supply_parts p2
                ORDER BY md5(%(seed)s || p2.id || g::text)
                LIMIT %(lines)s
            ) sp
        ) p
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        """,
        {"seed": seed, "projects": projects, "lines": lines},
    )

    conn.execute(
        """
        INSERT INTO supply_tracked_projects
            (project_id, variants, tracked_by, tracked_at, build_quantity)
        SELECT project_id, '{""}', 'bench@example.com', NOW(), 100
        FROM supply_bom_usage_projects
        """
    )

    conn.execute(
        """
        INSERT INTO supply_attention
            (part_id, kind, severity, state, first_seen_at, seen_count, opened_at,
             last_event_at, detail)
        SELECT p.id,
               'bench_' || ((g - 1) / %(parts)s)::text,
               CASE WHEN g %% 17 = 0 THEN 'fatal' WHEN g %% 5 = 0 THEN 'error' ELSE 'warning' END,
               'open',
               NOW() - (g %% 30) * interval '1 day',
               2,
               NOW() - (g %% 30) * interval '1 day',
               NOW() - (g %% 7) * interval '1 day',
               '{}'::jsonb
        FROM generate_series(1, %(alerts)s) g
        JOIN supply_parts p ON p.id = 'p' || lpad((1 + ((g - 1) %% %(parts)s))::text, 6, '0')
        """,
        {"seed": seed, "alerts": alerts, "parts": parts},
    )

    conn.execute(
        """
        INSERT INTO inventory_sources
            (id, kind, display_name, base_url, category_id, credential_envelope,
             enabled, interval_hours, created_by)
        VALUES ('inv-bench', 'inventree', 'Bench Inventory', 'https://inventory.invalid',
                1, '', TRUE, 24, 'bench@example.com')
        """
    )

    conn.execute(
        """
        INSERT INTO inventory_unmatched
            (source_id, remote_part, ipn, mpn, manufacturer, name, quantity,
             records, reason, seen_at)
        SELECT 'inv-bench',
               'REM-' || lpad(g::text, 6, '0'),
               'IPN-' || lpad(g::text, 6, '0'),
               'UNMATCHED-' || lpad(g::text, 6, '0'),
               'Bench Manufacturer ' || lpad((1 + g %% 600)::text, 4, '0'),
               'Bench unmatched part ' || g,
               (g %% 500) + 1,
               1,
               'no component',
               NOW() - (g %% 30) * interval '1 day'
        FROM generate_series(1, %(unmatched)s) g
        """,
        {"unmatched": unmatched},
    )


class CountingCursor:
    """A cursor that counts each statement before running it."""

    def __init__(self, cursor: Any, counter: list[int]) -> None:
        self._cursor = cursor
        self._counter = counter

    def execute(self, *args: Any, **kwargs: Any) -> Any:
        self._counter[0] += 1
        return self._cursor.execute(*args, **kwargs)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)

    def __enter__(self) -> "CountingCursor":
        self._cursor.__enter__()
        return self

    def __exit__(self, *exc: Any) -> Any:
        return self._cursor.__exit__(*exc)


class CountingConnection:
    """A connection whose statements, direct or through a cursor, are counted."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn
        self.counter = [0]

    def execute(self, *args: Any, **kwargs: Any) -> Any:
        self.counter[0] += 1
        return self._conn.execute(*args, **kwargs)

    def cursor(self, *args: Any, **kwargs: Any) -> CountingCursor:
        return CountingCursor(self._conn.cursor(*args, **kwargs), self.counter)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


def _timed(conn: Any, call: Callable[[Any], Any]) -> tuple[float, int]:
    counted = CountingConnection(conn)
    started = time.perf_counter()
    call(counted)
    return time.perf_counter() - started, counted.counter[0]


def _scenarios(conn: Any) -> dict[str, Callable[[Any], Any]]:
    from app.services.supply import dashboard, insights_page, parts_view, project_supply, review
    from app.services.supply.inventory import sync as inventory_sync

    project_id = conn.execute(
        "SELECT project_id FROM supply_tracked_projects ORDER BY project_id LIMIT 1"
    ).fetchone()["project_id"]
    part_id = conn.execute("SELECT id FROM supply_parts ORDER BY id LIMIT 1").fetchone()["id"]
    source_id = conn.execute("SELECT id FROM inventory_sources ORDER BY id LIMIT 1").fetchone()["id"]

    return {
        "dashboard.build": dashboard.build,
        "parts.ranked_watched": lambda c: parts_view.ranked_parts(c, scope="watched"),
        "parts.part_groups": lambda c: parts_view.part_groups(c, scope="watched"),
        "insights.build": insights_page.build,
        "project.overview": lambda c: project_supply.overview(c, project_id),
        "review.queue": review.review_queue,
        "inventory.unmatched": lambda c: inventory_sync.unmatched(c, source_id)[:50],
        "parts.detail": lambda c: parts_view.part_detail(c, part_id),
    }


def _measure_scenario(store: Any, name: str, call: Callable[[Any], Any], repeats: int) -> dict[str, Any]:
    print(f"  {name}...", flush=True)

    # The cold run starts from no kept summary or rollup, and rolls back
    # everything it wrote so the fixture stays frozen.
    with store.connection() as conn:
        conn.execute("DELETE FROM supply_part_summaries")
        conn.execute("DELETE FROM supply_project_rollups")
        cold_seconds, cold_statements = _timed(conn, call)
        conn.rollback()

    # Warm the caches the timed runs read, then time them.
    with store.connection() as conn:
        _timed(conn, call)

    samples: list[float] = []
    statements: list[int] = []
    for _ in range(repeats):
        with store.connection() as conn:
            seconds, count = _timed(conn, call)
        samples.append(seconds * 1000.0)
        statements.append(count)

    return {
        "cold_ms": round(cold_seconds * 1000.0, 1),
        "warm_ms": {
            "p50": round(percentile(samples, 50), 1),
            "p95": round(percentile(samples, 95), 1),
            "max": round(max(samples), 1),
            "samples": [round(value, 1) for value in samples],
        },
        "statements": {"cold": cold_statements, "warm": statements},
        # The process's peak so far: it only grows, so a scenario that raises it is the one that needed the memory.
        "process_peak_rss_bytes": peak_rss_bytes(),
    }


def _worker(url: str) -> None:
    _prepare_environment(url)
    from app.services.supply import tasks
    from app.services.supply.store import supply_store

    # Every periodic task once, as the supply tasks job runs them when they are due.
    ran = tasks.run_due(supply_store, force=True)
    print(json.dumps({"compacted": sum(1 for worked in ran.values() if worked)}))


def _run_worker(url: str) -> dict[str, Any]:
    print("  housekeeping in a child process...", flush=True)
    before = rss_bytes(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss, sys.platform)
    started = time.perf_counter()
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "_worker", "--database-url", url],
        capture_output=True,
        text=True,
        check=False,
    )
    elapsed = time.perf_counter() - started
    after = rss_bytes(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss, sys.platform)
    if result.returncode != 0:
        raise SystemExit(f"Worker failed:\n{result.stderr.strip()}")
    compacted = json.loads(result.stdout.strip().splitlines()[-1])["compacted"]
    return {
        "wall_ms": round(elapsed * 1000.0, 1),
        "peak_rss_bytes": max(before, after),
        "compacted": compacted,
    }


class DevTools:
    """A small Chrome DevTools Protocol client over one websocket."""

    def __init__(self, ws: Any) -> None:
        self._ws = ws
        self._next_id = 0
        self._responses: dict[int, asyncio.Future] = {}
        self._events: dict[str, list[asyncio.Future]] = {}
        self._reader_task: asyncio.Task | None = None

    async def start(self) -> None:
        self._reader_task = asyncio.create_task(self._read())

    async def _read(self) -> None:
        async for raw in self._ws:
            message = json.loads(raw)
            if "id" in message:
                future = self._responses.pop(message["id"], None)
                if future is not None and not future.done():
                    future.set_result(message)
                continue
            method = message.get("method", "")
            waiters = self._events.get(method, [])
            while waiters:
                future = waiters.pop()
                if not future.done():
                    future.set_result(message)

    def expect(self, method: str) -> asyncio.Future:
        future = asyncio.get_event_loop().create_future()
        self._events.setdefault(method, []).append(future)
        return future

    async def send(self, method: str, params: dict[str, Any] | None = None, session: str | None = None) -> dict[str, Any]:
        self._next_id += 1
        message: dict[str, Any] = {"id": self._next_id, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        future = asyncio.get_event_loop().create_future()
        self._responses[self._next_id] = future
        await self._ws.send(json.dumps(message))
        answer = await asyncio.wait_for(future, timeout=60)
        if "error" in answer:
            raise RuntimeError(f"{method}: {answer['error']}")
        return answer.get("result", {})

    async def close(self) -> None:
        if self._reader_task is not None:
            self._reader_task.cancel()


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _chrome_path(chosen: str | None) -> str:
    if chosen:
        return chosen
    candidates = (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "google-chrome",
        "chromium",
    )
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    for candidate in candidates[2:]:
        if any(Path(directory).joinpath(candidate).exists() for directory in os.environ.get("PATH", "").split(":")):
            return candidate
    raise SystemExit("Chrome not found. Pass --chrome with the path to a Chrome executable.")


async def _wait_for_devtools(port: int, timeout: float = 30.0) -> dict[str, Any]:
    import urllib.request

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            await asyncio.sleep(0.25)
    raise SystemExit("Chrome did not open its DevTools endpoint in time.")


async def _browser_metrics(url: str, chrome: str | None) -> dict[str, Any]:
    import websockets

    port = _free_port()
    profile = tempfile.mkdtemp(prefix="prism-supply-chrome-")
    process = subprocess.Popen(
        [
            _chrome_path(chrome),
            "--headless=new",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-gpu",
            "--window-size=1440,900",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        version = await _wait_for_devtools(port)
        pages: dict[str, Any] = {}
        async with websockets.connect(version["webSocketDebuggerUrl"], max_size=None) as ws:
            client = DevTools(ws)
            await client.start()
            target = await client.send("Target.createTarget", {"url": "about:blank"})
            attached = await client.send(
                "Target.attachToTarget", {"targetId": target["targetId"], "flatten": True}
            )
            session = attached["sessionId"]
            await client.send("Page.enable", session=session)
            await client.send("Performance.enable", session=session)
            for query in PAGES:
                target_url = f"{url}{'&' if '?' in url else '?'}{query.lstrip('?')}"
                loaded = client.expect("Page.loadEventFired")
                await client.send("Page.navigate", {"url": target_url}, session=session)
                try:
                    await asyncio.wait_for(loaded, timeout=30)
                except asyncio.TimeoutError:
                    pass
                await asyncio.sleep(3)
                metrics = await client.send("Performance.getMetrics", session=session)
                values = {item["name"]: item["value"] for item in metrics.get("metrics", [])}
                pages[query] = {
                    "JSHeapUsedSize": int(values.get("JSHeapUsedSize", 0)),
                    "Nodes": int(values.get("Nodes", 0)),
                    "LayoutCount": int(values.get("LayoutCount", 0)),
                }
            await client.close()
        return {"url": url, "pages": pages}
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        import shutil

        shutil.rmtree(profile, ignore_errors=True)


def _fixture_from_database(conn: Any, seed: int) -> dict[str, Any]:
    return {
        "seed": seed,
        "parts": int(conn.execute("SELECT COUNT(*) AS n FROM supply_parts").fetchone()["n"]),
        "projects": int(conn.execute("SELECT COUNT(*) AS n FROM supply_bom_usage_projects").fetchone()["n"]),
        "lines": int(
            conn.execute("SELECT COALESCE(MAX(line_count), 0) AS n FROM supply_bom_usage_projects").fetchone()["n"]
        ),
        "history_days": int(
            conn.execute("SELECT COUNT(DISTINCT day) AS n FROM supply_samples_daily").fetchone()["n"]
        ),
        "unmatched": int(conn.execute("SELECT COUNT(*) AS n FROM inventory_unmatched").fetchone()["n"]),
        "alerts": int(conn.execute("SELECT COUNT(*) AS n FROM supply_attention WHERE state = 'open'").fetchone()["n"]),
    }


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parents[1], text=True
        ).strip()
    except Exception:
        return ""


def _copy_database(url: str) -> str:
    """A throwaway copy of the bench database for the worker, made before this process opens a connection to it (a template copy
    needs none open). Housekeeping writes (it compacts samples, keeps snapshots and rollups), so it never runs on the fixture."""

    import psycopg

    name = bench_database_name(url)
    copy = f"{name}_worker_{os.getpid()}"
    parts = urlsplit(url.replace("postgresql+psycopg://", "postgresql://", 1))
    with psycopg.connect(parts._replace(path="/postgres").geturl(), autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{copy}" TEMPLATE "{name}"')
    return parts._replace(path=f"/{copy}").geturl()


def _drop_copy(copy_url: str) -> None:
    import psycopg

    parts = urlsplit(copy_url)
    name = bench_database_name(copy_url)
    if "_worker_" not in name:
        raise SystemExit(f"Refusing to drop {name!r}: only the worker's own copies are dropped.")
    with psycopg.connect(parts._replace(path="/postgres").geturl(), autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}"')


def _run(url: str, args: argparse.Namespace) -> None:
    worker_url = _copy_database(url)
    _prepare_environment(url)
    store = _store()

    with store.connection() as conn:
        if not conn.execute("SELECT COUNT(*) AS n FROM supply_parts").fetchone()["n"]:
            raise SystemExit("The database has no supply parts. Run the seed subcommand first.")
        fixture = _fixture_from_database(conn, args.seed)
        scenarios = _scenarios(conn)

    print(
        f"Benchmarking {fixture['parts']} parts, {fixture['projects']} projects, "
        f"{args.repeats} repeats...",
        flush=True,
    )
    results = {
        name: _measure_scenario(store, name, call, args.repeats)
        for name, call in scenarios.items()
    }
    try:
        worker = _run_worker(worker_url)
    finally:
        _drop_copy(worker_url)

    browser = None
    if args.browser_url:
        print("  browser pages...", flush=True)
        browser = asyncio.run(_browser_metrics(args.browser_url, args.chrome))

    report = {
        "benchmark": "supply",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "commit": _git_commit(),
        "machine": {
            "platform": platform.platform(),
            "cpu_count": os.cpu_count(),
            "python": platform.python_version(),
        },
        "fixture": {**fixture, "database": bench_database_name(url)},
        "scenarios": results,
        "worker": worker,
        "browser": browser,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    _print_report(report)
    print(f"\nWrote {out}")


def _print_report(report: dict[str, Any]) -> None:
    print("\n| Scenario | Cold ms | p50 ms | p95 ms | Max ms | SQL/run | Process peak MB |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for name, item in report["scenarios"].items():
        statements = item["statements"]["warm"]
        print(
            f"| {name} | {item['cold_ms']:.1f} | {item['warm_ms']['p50']:.1f} | "
            f"{item['warm_ms']['p95']:.1f} | {item['warm_ms']['max']:.1f} | "
            f"{max(statements) if statements else item['statements']['cold']} | "
            f"{item['process_peak_rss_bytes'] / (1024 * 1024):.1f} |"
        )
    worker = report["worker"]
    print(
        f"| housekeeping (worker) | {worker['wall_ms']:.1f} | - | - | - | - | "
        f"{worker['peak_rss_bytes'] / (1024 * 1024):.1f} |"
    )

    browser = report.get("browser")
    if browser:
        print("\n| Page | JS heap MB | DOM nodes | Layouts |")
        print("| --- | ---: | ---: | ---: |")
        for page, values in browser["pages"].items():
            print(
                f"| {page} | {values['JSHeapUsedSize'] / (1024 * 1024):.1f} | "
                f"{values['Nodes']} | {values['LayoutCount']} |"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed and benchmark a large synthetic Supply dataset.")
    sub = parser.add_subparsers(dest="command", required=True)

    seed = sub.add_parser("seed", help="Create the schema and insert the deterministic fixture.")
    seed.add_argument("--database-url", required=True, help="A database whose name starts with bench_.")
    seed.add_argument("--parts", type=int, default=20000)
    seed.add_argument("--projects", type=int, default=50)
    seed.add_argument("--lines", type=int, default=200, help="BOM lines per project.")
    seed.add_argument("--history-days", type=int, default=90)
    seed.add_argument("--unmatched", type=int, default=1000, help="Unmatched inventory rows.")
    seed.add_argument("--alerts", type=int, default=500, help="Open alerts.")
    seed.add_argument("--seed", type=int, default=1)

    run = sub.add_parser("run", help="Measure the Supply read models against the seeded data.")
    run.add_argument("--database-url", required=True, help="A database whose name starts with bench_.")
    run.add_argument("--repeats", type=int, default=10)
    run.add_argument("--out", default="loadtest/results/supply-benchmark.json")
    run.add_argument("--browser-url", default="", help="A running Prism URL with sign-in off.")
    run.add_argument("--chrome", default="", help="Path to a Chrome executable.")
    run.add_argument("--seed", type=int, default=1, help="The seed recorded in the report.")

    worker = sub.add_parser("_worker", help=argparse.SUPPRESS)
    worker.add_argument("--database-url", required=True)

    args = parser.parse_args(argv)
    bench_database_name(args.database_url)
    if args.command == "_worker":
        _worker(args.database_url)
        return 0

    if args.command == "seed":
        _seed(args.database_url, args)
    else:
        _run(args.database_url, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
