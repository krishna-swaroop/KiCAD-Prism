"""Cache hit rates and sizes for the ops diagnostics (ADR §11, OPS-04c).

Hit and miss counts come from the per-minute ``ws_ops_counters`` rows OPS-02
writes; sizes come from PostgreSQL (the git read cache's rows and payload
bytes, the bundle store's ``archive_bytes``) and from the cache directories on
disk. A disk walk is bounded by both a file count and a deadline, reports
``partial`` when it stops early, and its answer is memoized for five minutes so
a diagnostics call cannot turn into a filesystem sweep. Directory names are
relative labels; an absolute host path is never returned.
"""

from __future__ import annotations

import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.redaction import redact_value
from app.services.ops.timefmt import iso_z as _iso
from app.services.workspace_connection import connect

#: How long one directory measurement is reused by this process.
MEASURE_TTL_SECONDS = 300

#: A walk stops after this many files or after this many seconds, whichever
#: comes first, and reports ``partial``.
MAX_WALK_FILES = 200_000
MAX_WALK_SECONDS = 5.0

#: The counters OPS-02 writes, and the cache directory each one describes.
_COUNTER_CACHES: tuple[tuple[str, str | None], ...] = (
    ("git_read_cache", None),
    ("render_cache", "renders"),
    ("bundle.upgrade_cache", "upgrade-cache"),
    ("bundle.refill_cache", "refill-cache"),
    ("bundle.models_cache", "bundle-models-cache"),
)

#: Cache directories with no hit/miss counter of their own.
_DISK_ONLY_CACHES: tuple[str, ...] = (
    "hlr-cache",
    "bundles",
    "thumbnails",
    "design-compare-cache",
)

_measurements: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}
_measurements_lock = threading.Lock()


def _design_compare_root() -> Path:
    """The comparison cache root, mirroring ``design_compare_service``'s default."""

    configured = settings.PRISM_DESIGN_COMPARE_CACHE.strip()
    if configured:
        return Path(configured).expanduser()
    return Path(tempfile.gettempdir()) / "prism_design_compare_cache"


def _cache_directories() -> list[tuple[str, Path]]:
    """The labelled cache directories this deployment uses, resolved at call time."""

    from app.services import derived_assets
    from app.services.design_bundle import kicad_steps, stage_models
    from app.services.design_bundle import store as bundle_store

    derived = derived_assets.derived_root()
    return [
        ("bundles", bundle_store.root()),
        ("refill-cache", kicad_steps.refill_cache_root()),
        ("upgrade-cache", kicad_steps.upgrade_cache_root()),
        ("bundle-models-cache", stage_models.cache_root()),
        ("hlr-cache", stage_models.hlr_cache_root()),
        ("renders", derived / "renders"),
        ("thumbnails", derived / "thumbnails"),
        ("design-compare-cache", _design_compare_root()),
    ]


def _measure_directory(
    path: Path,
    *,
    max_files: int | None = None,
    max_seconds: float | None = None,
) -> dict[str, Any]:
    """Bytes and regular-file count under ``path``, bounded in files and time."""

    file_limit = MAX_WALK_FILES if max_files is None else max_files
    second_limit = MAX_WALK_SECONDS if max_seconds is None else max_seconds
    started = time.monotonic()
    files = 0
    total = 0
    partial = False
    pending = [str(path)]

    while pending:
        if time.monotonic() - started >= second_limit:
            partial = True
            break
        current = pending.pop()
        try:
            entries = os.scandir(current)
        except OSError:
            continue
        with entries:
            for entry in entries:
                if time.monotonic() - started >= second_limit:
                    partial = True
                    pending.clear()
                    break
                try:
                    if entry.is_dir(follow_symlinks=False):
                        pending.append(entry.path)
                        continue
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    total += entry.stat(follow_symlinks=False).st_size
                except OSError:
                    continue
                files += 1
                if files >= file_limit:
                    partial = True
                    pending.clear()
                    break

    return {"bytes": total, "files": files, "partial": partial}


def _disk_measurement(label: str, path: Path) -> dict[str, Any]:
    """``_measure_directory`` memoized per process for ``MEASURE_TTL_SECONDS``."""

    key = (label, str(path))
    now = time.monotonic()
    with _measurements_lock:
        cached = _measurements.get(key)
        if cached is not None and now - cached[0] < MEASURE_TTL_SECONDS:
            return dict(cached[1])

    measured = _measure_directory(path)
    with _measurements_lock:
        _measurements[key] = (time.monotonic(), measured)
    return dict(measured)


def clear_measurements() -> None:
    """Forget memoized directory measurements."""

    with _measurements_lock:
        _measurements.clear()


def _counters(conn: Any, window_minutes: int) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT name, SUM(value) AS value
        FROM ws_ops_counters
        WHERE minute >= NOW() - (%s * INTERVAL '1 minute')
        GROUP BY name
        """,
        (window_minutes,),
    ).fetchall()
    return {str(row["name"]): int(row["value"] or 0) for row in rows}


def _git_cache_table(conn: Any) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT COUNT(*) AS rows,
               COALESCE(SUM(pg_column_size(payload)), 0)::BIGINT AS bytes,
               MIN(last_accessed_at) AS oldest_access,
               MAX(last_accessed_at) AS newest_access
        FROM ws_git_read_cache
        """
    ).fetchone()
    return {
        "table_rows": int(row["rows"] or 0),
        "table_bytes": int(row["bytes"] or 0),
        "oldest_access": _iso(row["oldest_access"]),
        "newest_access": _iso(row["newest_access"]),
    }


def _bundle_store(conn: Any) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT COUNT(*) AS archives,
               COALESCE(SUM(archive_bytes), 0)::BIGINT AS archive_bytes
        FROM ws_design_bundles
        """
    ).fetchone()
    return {
        "archives": int(row["archives"] or 0),
        "archive_bytes": int(row["archive_bytes"] or 0),
    }


def _hit_rate(hits: int, misses: int) -> float | None:
    total = hits + misses
    return (hits / total) if total else None


def cache_stats(window_minutes: int = 60) -> dict[str, Any]:
    """Hit rates and sizes for every cache the deployment runs."""

    window = max(1, min(7 * 24 * 60, int(window_minutes)))
    with connect() as conn:
        counters = _counters(conn, window)
        git_table = _git_cache_table(conn)
        bundle_store = _bundle_store(conn)

    directories = {label: _disk_measurement(label, path) for label, path in _cache_directories()}
    entries: list[dict[str, Any]] = []

    for cache_name, directory in _COUNTER_CACHES:
        hits = counters.get(f"{cache_name}.hit", 0)
        misses = counters.get(f"{cache_name}.miss", 0)
        entry: dict[str, Any] = {
            "name": cache_name,
            "hits": hits,
            "misses": misses,
            "hit_rate": _hit_rate(hits, misses),
            "table_rows": None,
            "table_bytes": None,
            "oldest_access": None,
            "newest_access": None,
        }
        if cache_name == "git_read_cache":
            entry.update(git_table)
        disk = directories.get(directory or "")
        if disk is not None:
            entry.update(
                {
                    "disk_bytes": disk["bytes"],
                    "disk_files": disk["files"],
                    "disk_partial": disk["partial"],
                }
            )
        entries.append(entry)

    for cache_name in _DISK_ONLY_CACHES:
        disk = directories.get(cache_name)
        if disk is None:
            continue
        entries.append(
            {
                "name": cache_name,
                "hits": None,
                "misses": None,
                "hit_rate": None,
                "table_rows": None,
                "table_bytes": None,
                "oldest_access": None,
                "newest_access": None,
                "disk_bytes": disk["bytes"],
                "disk_files": disk["files"],
                "disk_partial": disk["partial"],
            }
        )

    result = {
        "window_minutes": window,
        "caches": entries,
        "bundle_store": bundle_store,
    }
    return redact_value(result)


__all__ = [
    "MAX_WALK_FILES",
    "MAX_WALK_SECONDS",
    "MEASURE_TTL_SECONDS",
    "cache_stats",
    "clear_measurements",
    "connect",
]
