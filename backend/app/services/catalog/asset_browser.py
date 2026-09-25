"""Browse stored catalog assets with a process-local cache."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.catalog.runtime import (
    CatalogRuntime,
    _ASSET_BROWSE_CACHE_TTL_SECONDS,
)


class CatalogAssetBrowser:
    """Stateless stored-asset browser using an explicitly supplied runtime."""

    @staticmethod
    def browse(
        runtime: CatalogRuntime,
        root: Path,
        asset_type: str,
        q: str,
        limit: int,
        now: float,
    ) -> dict[str, Any]:
        """Return a filtered, bounded listing from the supplied asset root."""
        with runtime.browse_cache_lock_for(asset_type):
            with runtime.browse_cache_lock:
                cached = runtime.browse_cache.get(asset_type)
                generation = runtime.browse_cache_generation
            if cached is None or now - cached[0] > _ASSET_BROWSE_CACHE_TTL_SECONDS:
                if asset_type == "symbol":
                    paths = root.rglob("*.kicad_sym")
                elif asset_type == "footprint":
                    paths = root.rglob("*.kicad_mod")
                elif asset_type == "3dmodel":
                    paths = [*root.rglob("*.step"), *root.rglob("*.stp")]
                else:
                    paths = root.rglob("*")
                files = sorted(path.relative_to(root).as_posix() for path in paths if path.is_file())
                with runtime.browse_cache_lock:
                    # A write that landed while this walk was running already
                    # cleared the cache. Storing the result now would reinstate a
                    # listing taken before that write and hide it for a full TTL,
                    # so leave the cache empty and let the next browse rebuild it.
                    if runtime.browse_cache_generation == generation:
                        runtime.browse_cache[asset_type] = (now, files)
                all_files = files
            else:
                all_files = cached[1]
        needle = q.strip().lower()
        matches = [path for path in all_files if needle in path.lower()] if needle else list(all_files)
        return {"files": matches[: max(1, limit)], "total": len(matches)}


__all__ = ["CatalogAssetBrowser"]
