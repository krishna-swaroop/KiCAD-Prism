from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator

from app.core.config import settings


def postgres_dsn() -> str:
    value = settings.PRISM_DATABASE_URL.strip()
    if not value:
        raise RuntimeError("PRISM_DATABASE_URL is required")
    return value.replace("postgresql+psycopg://", "postgresql://", 1)


# Probe every 10s and give up after 3 unanswered probes, so a dead peer is
# noticed roughly 30s after the keepalive idle period elapses. These are not
# worth a setting each; the idle period is the one that has to be tuned to sit
# under whatever sits between Prism and PostgreSQL.
_KEEPALIVE_INTERVAL_SECONDS = 10
_KEEPALIVE_FAILED_PROBES = 3


def connection_kwargs(conninfo: str) -> dict[str, Any]:
    """Connection defaults that anything explicit in the DSN still overrides.

    Prism increasingly runs with PostgreSQL somewhere else — a managed
    instance, another host in the compose network, the other side of a NAT.
    In that arrangement an idle connection can be discarded by a middlebox
    without either end being notified, and the pool then hands the dead
    connection to a request, which fails. TCP keepalives make the kernel find
    out, and a connect timeout keeps an unreachable host from turning into a
    hung request.
    """

    from psycopg.rows import dict_row

    try:
        from psycopg.conninfo import conninfo_to_dict

        supplied = set(conninfo_to_dict(conninfo))
    except Exception:
        # A DSN psycopg cannot parse will fail later with a better message than
        # anything raised here; fall back to applying every default.
        supplied = set()

    defaults = {
        "connect_timeout": settings.PRISM_DATABASE_CONNECT_TIMEOUT_SECONDS,
        "keepalives": 1,
        "keepalives_idle": settings.PRISM_DATABASE_KEEPALIVE_IDLE_SECONDS,
        "keepalives_interval": _KEEPALIVE_INTERVAL_SECONDS,
        "keepalives_count": _KEEPALIVE_FAILED_PROBES,
    }
    kwargs: dict[str, Any] = {
        key: value for key, value in defaults.items() if key not in supplied
    }
    kwargs["row_factory"] = dict_row
    kwargs["autocommit"] = False
    return kwargs


class PostgresDatabase:
    """Process-local PostgreSQL pool shared by Prism state services."""

    def __init__(self) -> None:
        self._pool: Any | None = None
        self._lock = threading.Lock()
        self._metrics_lock = threading.Lock()
        self._wait_count = 0
        self._wait_total_seconds = 0.0
        self._wait_max_seconds = 0.0

    def pool(self) -> Any:
        if self._pool is not None:
            return self._pool
        with self._lock:
            if self._pool is None:
                try:
                    from psycopg_pool import ConnectionPool
                except ImportError as exc:  # pragma: no cover - deployment guard
                    raise RuntimeError(
                        "PostgreSQL persistence requires psycopg and psycopg-pool"
                    ) from exc
                dsn = postgres_dsn()
                pool = ConnectionPool(
                    conninfo=dsn,
                    min_size=settings.PRISM_DATABASE_POOL_MIN_SIZE,
                    max_size=settings.PRISM_DATABASE_POOL_MAX_SIZE,
                    kwargs=connection_kwargs(dsn),
                    # Verify a connection is still alive before handing it to a
                    # caller. This costs a round trip per checkout and buys the
                    # pool the ability to replace a connection that was dropped
                    # while idle, instead of failing the request that draws it.
                    check=ConnectionPool.check_connection,
                    max_lifetime=settings.PRISM_DATABASE_POOL_MAX_LIFETIME_SECONDS,
                    open=False,
                    name="kicad-prism-state",
                )
                pool.open(wait=True)
                self._pool = pool
        return self._pool

    @contextmanager
    def connection(self) -> Iterator[Any]:
        started = time.perf_counter()
        with self.pool().connection() as connection:
            waited = time.perf_counter() - started
            with self._metrics_lock:
                self._wait_count += 1
                self._wait_total_seconds += waited
                self._wait_max_seconds = max(self._wait_max_seconds, waited)
            yield connection

    def metrics_snapshot(self) -> dict[str, Any]:
        pool = self.pool()
        with self._metrics_lock:
            count = self._wait_count
            total = self._wait_total_seconds
            maximum = self._wait_max_seconds
        try:
            pool_stats = dict(pool.get_stats())
        except Exception:
            pool_stats = {}
        return {
            "connectionWaitCount": count,
            "connectionWaitMeanMs": (total / count * 1000) if count else 0.0,
            "connectionWaitMaxMs": maximum * 1000,
            "pool": pool_stats,
        }

    @contextmanager
    def transaction(self) -> Iterator[Any]:
        with self.connection() as connection:
            with connection.transaction():
                yield connection

    def close(self) -> None:
        with self._lock:
            if self._pool is not None:
                self._pool.close()
                self._pool = None


database = PostgresDatabase()
