"""Catalog filesystem paths and process-local runtime state."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
import threading
from typing import Any

from app.core.config import settings


DEFAULT_STORE_DIRNAME = ".kicad-prism"
DBL_EXPORT_DIRNAME = "kicad-dbl"
KLC_VALIDATION_DIRNAME = "klc"

# The asset browser reuses one sorted directory walk per asset type for this
# long, so repeated dialog opens do not rescan the whole store.
_ASSET_BROWSE_CACHE_TTL_SECONDS = 30.0


@dataclass(frozen=True)
class CatalogPaths:
    """Resolved filesystem locations used by a catalog runtime."""

    store_root: Path
    db_path: Path
    export_root: Path
    validation_root: Path


class CatalogRuntime:
    """Own catalog paths, lifecycle state, and process-local caches."""

    initialization_lock: threading.Lock
    initialized: bool
    kicad_cli: str | None
    kicad_cli_version: str | None
    category_cache: list[dict[str, Any]] | None
    category_cache_ts: float
    category_cache_ttl: float
    fts_available: bool
    browse_cache: dict[str, tuple[float, list[str]]]
    browse_cache_locks: dict[str, threading.Lock]
    browse_cache_lock: threading.Lock
    browse_cache_generation: int

    def __init__(
        self,
        store_root: Path | None = None,
        database_path: Path | None = None,
    ) -> None:
        prism_root = Path(settings.KICAD_PROJECTS_ROOT) / DEFAULT_STORE_DIRNAME
        resolved_store_root = Path(store_root or prism_root / "components").resolve()
        default_export_root = (
            resolved_store_root.parent / "exports" / DBL_EXPORT_DIRNAME
            if store_root
            else prism_root / "exports" / DBL_EXPORT_DIRNAME
        )
        self._paths = CatalogPaths(
            store_root=resolved_store_root,
            db_path=Path(database_path if database_path is not None else "/dev/null"),
            export_root=Path(settings.CATALOG_DBL_EXPORT_DIR or default_export_root).resolve(),
            validation_root=(
                resolved_store_root.parent / "validation" / KLC_VALIDATION_DIRNAME
            ).resolve(),
        )

        self.initialization_lock = threading.Lock()
        self.initialized = False
        self.kicad_cli = None
        self.kicad_cli_version = None
        self.category_cache = None
        self.category_cache_ts = 0.0
        self.category_cache_ttl = 60.0
        self.fts_available = False

        self.browse_cache = {}
        # One lock per asset type. Walking the footprint tree takes seconds on
        # a large store, and a shared lock would make that block a symbol browse
        # that could have been answered from cache. Serializing within a type is
        # still wanted: it collapses a burst of concurrent misses into one walk.
        self.browse_cache_locks = {}
        self.browse_cache_lock = threading.Lock()
        # Bumped on every store write so a walk that started before it does not
        # reinstate the listing it took.
        self.browse_cache_generation = 0

    @property
    def paths(self) -> CatalogPaths:
        return self._paths

    @property
    def store_root(self) -> Path:
        return self._paths.store_root

    @store_root.setter
    def store_root(self, value: Path) -> None:
        self._paths = replace(self._paths, store_root=Path(value))

    @property
    def db_path(self) -> Path:
        return self._paths.db_path

    @db_path.setter
    def db_path(self, value: Path) -> None:
        self._paths = replace(self._paths, db_path=Path(value))

    @property
    def export_root(self) -> Path:
        return self._paths.export_root

    @export_root.setter
    def export_root(self, value: Path) -> None:
        self._paths = replace(self._paths, export_root=Path(value))

    @property
    def validation_root(self) -> Path:
        return self._paths.validation_root

    @validation_root.setter
    def validation_root(self, value: Path) -> None:
        self._paths = replace(self._paths, validation_root=Path(value))

    def close(self) -> None:
        with self.initialization_lock:
            self.initialized = False

    def ensure_storage_dirs(self) -> None:
        """Create the canonical store, preview, revision, export, and validation trees."""
        for path in (
            self.store_root / "symbols",
            self.store_root / "footprints",
            self.store_root / "3dmodels",
            self.store_root / "spice",
            self.store_root / "previews" / "symbols",
            self.store_root / "previews" / "footprints",
            self.store_root / "revisions",
            self.export_root,
            self.validation_root,
        ):
            path.mkdir(parents=True, exist_ok=True)

    def browse_cache_lock_for(self, asset_type: str) -> threading.Lock:
        with self.browse_cache_lock:
            return self.browse_cache_locks.setdefault(asset_type, threading.Lock())

    def invalidate_browse_cache(self) -> None:
        """Drop stored-file listings after the store on disk changes."""
        with self.browse_cache_lock:
            self.browse_cache.clear()
            self.browse_cache_generation += 1


__all__ = [
    "CatalogPaths",
    "CatalogRuntime",
    "DEFAULT_STORE_DIRNAME",
    "DBL_EXPORT_DIRNAME",
    "KLC_VALIDATION_DIRNAME",
    "_ASSET_BROWSE_CACHE_TTL_SECONDS",
]
