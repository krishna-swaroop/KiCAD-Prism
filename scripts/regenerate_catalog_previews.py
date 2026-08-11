#!/usr/bin/env python3
"""Bulk-generate or regenerate catalog symbol/footprint SVG previews."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

ComponentCatalogService: Any = None
PLACE_REQUIRED_ASSET_TYPES = ("symbol", "footprint")
PREVIEW_KIND_SYMBOL = "symbol"
PREVIEW_KIND_FOOTPRINT = "footprint"
PREVIEW_STATUS_READY = "ready"
MAX_REPORTED_ERRORS = 100


def _load_catalog_runtime() -> None:
    global ComponentCatalogService
    try:
        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService  # noqa: PLC0415
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Backend Python dependencies are not available. Run inside the backend container."
        ) from exc
    ComponentCatalogService = ComponentCatalogPostgresService


@dataclass
class PreviewStats:
    assets_seen: int = 0
    assets_generated: int = 0
    assets_skipped: int = 0
    assets_failed: int = 0
    preview_versions_created: int = 0
    components_seen: int = 0
    components_relinked: int = 0
    components_failed: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class GeneratedPreview:
    kind: str
    payload: bytes


@dataclass
class AssetGenerationResult:
    asset_id: str
    previews: list[GeneratedPreview] = field(default_factory=list)
    failed: bool = False
    error: str | None = None


def _record_error(stats: PreviewStats, message: str) -> None:
    if len(stats.errors) < MAX_REPORTED_ERRORS:
        stats.errors.append(message)


def _begin_batch(conn: Any) -> None:
    conn.execute("SET LOCAL prism.catalog_migration = 'on'")


def _default_workers() -> int:
    cpu = os.cpu_count() or 4
    return max(1, min(8, cpu))


def _build_ready_preview_index(service: Any, conn: Any) -> dict[str, set[str]]:
    from app.services.component_catalog_domain import _sha256_file  # noqa: PLC0415

    rows = conn.execute(
        """
        SELECT asset_id, kind, generator_fingerprint, file_path, sha256
        FROM asset_preview_versions
        WHERE status = %s
        """,
        (PREVIEW_STATUS_READY,),
    ).fetchall()
    index: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        kind = str(row["kind"])
        expected = service._preview_generator_identity(kind)["generator_fingerprint"]  # type: ignore[attr-defined]
        if str(row["generator_fingerprint"]) != expected:
            continue
        file_path = Path(str(row["file_path"] or ""))
        if not file_path.is_file():
            continue
        if _sha256_file(file_path) != str(row["sha256"]):
            continue
        index[str(row["asset_id"])].add(kind)
    return index


def _asset_preview_complete(asset: dict[str, Any], ready_index: dict[str, set[str]]) -> bool:
    asset_id = str(asset["id"])
    ready_kinds = ready_index.get(asset_id, set())
    asset_type = str(asset["asset_type"])
    if asset_type == "symbol":
        if PREVIEW_KIND_SYMBOL in ready_kinds:
            return True
        return any(kind.startswith(f"{PREVIEW_KIND_SYMBOL}:unit") for kind in ready_kinds)
    if asset_type == "footprint":
        return PREVIEW_KIND_FOOTPRINT in ready_kinds
    return True


def _generate_asset_previews(service: Any, asset: dict[str, Any]) -> AssetGenerationResult:
    from app.services.component_catalog_domain import _preview_kind  # noqa: PLC0415

    asset_id = str(asset["id"])
    asset_type = str(asset["asset_type"])
    try:
        if asset_type == "symbol":
            status, result = service._generate_symbol_preview_units(asset)  # type: ignore[attr-defined]
            if status != PREVIEW_STATUS_READY or not isinstance(result, list):
                return AssetGenerationResult(
                    asset_id=asset_id,
                    failed=True,
                    error=str(result),
                )
            return AssetGenerationResult(
                asset_id=asset_id,
                previews=[
                    GeneratedPreview(kind=_preview_kind(PREVIEW_KIND_SYMBOL, unit), payload=payload)
                    for unit, payload in result
                ],
            )
        if asset_type == "footprint":
            status, result = service._generate_footprint_preview(asset)  # type: ignore[attr-defined]
            if status != PREVIEW_STATUS_READY or not isinstance(result, bytes):
                return AssetGenerationResult(
                    asset_id=asset_id,
                    failed=True,
                    error=str(result),
                )
            return AssetGenerationResult(
                asset_id=asset_id,
                previews=[GeneratedPreview(kind=PREVIEW_KIND_FOOTPRINT, payload=result)],
            )
        return AssetGenerationResult(asset_id=asset_id)
    except Exception as exc:  # noqa: BLE001
        return AssetGenerationResult(asset_id=asset_id, failed=True, error=str(exc))


def _persist_asset_previews(
    service: Any,
    conn: Any,
    asset: dict[str, Any],
    result: AssetGenerationResult,
    stats: PreviewStats,
) -> None:
    asset_id = str(asset["id"])
    if result.failed:
        stats.assets_failed += 1
        _record_error(
            stats,
            f"asset:{asset_id}:{asset.get('asset_type', '')}: {result.error or 'preview generation failed'}",
        )
        return
    if not result.previews:
        return
    ready_count = 0
    for preview in result.previews:
        stored = service._store_preview_version(  # type: ignore[attr-defined]
            conn,
            asset=asset,
            kind=preview.kind,
            payload=preview.payload,
        )
        if str(stored.get("status")) == PREVIEW_STATUS_READY:
            ready_count += 1
    if ready_count:
        stats.assets_generated += 1
        stats.preview_versions_created += ready_count


def _relink_revision_preview_outputs(
    service: Any,
    conn: Any,
    revision_id: str,
    *,
    now: str,
) -> int:
    changed = 0
    assets = [
        asset
        for asset in service._load_assets_for_revision(conn, revision_id)  # type: ignore[attr-defined]
        if str(asset["asset_type"]) in PLACE_REQUIRED_ASSET_TYPES
    ]
    for asset in assets:
        kind = PREVIEW_KIND_SYMBOL if str(asset["asset_type"]) == "symbol" else PREVIEW_KIND_FOOTPRINT
        preview_rows = conn.execute(
            """
            SELECT id, kind FROM asset_preview_versions
            WHERE asset_id = %s AND (kind = %s OR kind LIKE %s) AND status = 'ready'
            ORDER BY created_at DESC, id DESC
            """,
            (str(asset["id"]), kind, f"{kind}:unit%"),
        ).fetchall()
        latest_by_kind: dict[str, dict[str, Any]] = {}
        for preview in preview_rows:
            latest_by_kind.setdefault(str(preview["kind"]), dict(preview))
        if not latest_by_kind:
            continue
        conn.execute(
            "DELETE FROM revision_preview_outputs WHERE revision_id = %s AND asset_id = %s AND (kind = %s OR kind LIKE %s)",
            (revision_id, str(asset["id"]), kind, f"{kind}:unit%"),
        )
        for preview_kind, preview in latest_by_kind.items():
            conn.execute(
                """
                INSERT INTO revision_preview_outputs (revision_id, asset_id, kind, preview_id, generated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (revision_id, asset_id, kind)
                DO UPDATE SET preview_id = excluded.preview_id, generated_at = excluded.generated_at
                """,
                (revision_id, str(asset["id"]), preview_kind, str(preview["id"]), now),
            )
        changed += 1
    return changed


def _load_target_assets(conn: Any, *, limit: int) -> list[dict[str, Any]]:
    query = """
        SELECT DISTINCT a.*
        FROM assets a
        JOIN revision_assets ra ON ra.asset_id = a.id
        JOIN component_revisions cr ON cr.id = ra.revision_id
        JOIN components c ON c.current_revision_id = cr.id
        WHERE c.is_active = 1
          AND a.asset_type IN ('symbol', 'footprint')
        ORDER BY a.asset_type, a.target_library, a.target_name, a.id
    """
    if limit:
        query += f" LIMIT {int(limit)}"
    return [dict(row) for row in conn.execute(query).fetchall()]


def _load_target_components(conn: Any, *, limit: int) -> list[str]:
    query = """
        SELECT c.id
        FROM components c
        JOIN component_revisions cr ON cr.id = c.current_revision_id
        JOIN revision_assets ra ON ra.revision_id = cr.id
        JOIN assets a ON a.id = ra.asset_id
        WHERE c.is_active = 1
          AND a.asset_type IN ('symbol', 'footprint')
        GROUP BY c.id, c.updated_at
        ORDER BY c.updated_at DESC, c.id
    """
    if limit:
        query += f" LIMIT {int(limit)}"
    return [str(row["id"]) for row in conn.execute(query).fetchall()]


def _regenerate_assets(
    service: Any,
    conn: Any,
    stats: PreviewStats,
    *,
    only_missing: bool,
    commit_batch: int,
    limit: int,
    workers: int,
) -> None:
    assets = _load_target_assets(conn, limit=limit)
    stats.assets_seen = len(assets)
    if not assets:
        return

    ready_index: dict[str, set[str]] = {}
    if only_missing:
        print("Building ready-preview index ...", flush=True)
        ready_index = _build_ready_preview_index(service, conn)
        pending = [asset for asset in assets if not _asset_preview_complete(asset, ready_index)]
        stats.assets_skipped = len(assets) - len(pending)
        print(
            f"Skipping {stats.assets_skipped} assets with ready previews; "
            f"{len(pending)} remaining.",
            flush=True,
        )
    else:
        pending = assets

    if not pending:
        return

    started = time.perf_counter()
    processed = 0

    if workers <= 1:
        for index, asset in enumerate(pending, start=1):
            asset_id = str(asset["id"])
            try:
                result = _generate_asset_previews(service, asset)
                _persist_asset_previews(service, conn, asset, result, stats)
                processed += 1
                if processed % commit_batch == 0 or index == len(pending):
                    conn.commit()
                    _begin_batch(conn)
                    elapsed = max(time.perf_counter() - started, 0.001)
                    print(
                        f"Assets {index}/{len(pending)}: "
                        f"{stats.assets_generated} generated, {stats.assets_skipped} skipped, "
                        f"{stats.assets_failed} failed ({processed / elapsed:.1f} assets/s)",
                        flush=True,
                    )
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                _begin_batch(conn)
                stats.assets_failed += 1
                _record_error(stats, f"asset:{asset_id}: {exc}")
        if processed % commit_batch:
            conn.commit()
            _begin_batch(conn)
        return

    chunk_size = max(commit_batch, workers)
    for chunk_start in range(0, len(pending), chunk_size):
        chunk = pending[chunk_start : chunk_start + chunk_size]
        results_by_asset_id: dict[str, AssetGenerationResult] = {}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            future_map = {pool.submit(_generate_asset_previews, service, asset): asset for asset in chunk}
            for future in as_completed(future_map):
                asset = future_map[future]
                asset_id = str(asset["id"])
                try:
                    results_by_asset_id[asset_id] = future.result()
                except Exception as exc:  # noqa: BLE001
                    results_by_asset_id[asset_id] = AssetGenerationResult(
                        asset_id=asset_id,
                        failed=True,
                        error=str(exc),
                    )

        try:
            for asset in chunk:
                result = results_by_asset_id[str(asset["id"])]
                _persist_asset_previews(service, conn, asset, result, stats)
            conn.commit()
            _begin_batch(conn)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            _begin_batch(conn)
            for asset in chunk:
                stats.assets_failed += 1
                _record_error(stats, f"asset:{asset['id']}: persist failed: {exc}")
            continue

        processed += len(chunk)
        elapsed = max(time.perf_counter() - started, 0.001)
        print(
            f"Assets {min(chunk_start + len(chunk), len(pending))}/{len(pending)}: "
            f"{stats.assets_generated} generated, {stats.assets_skipped} skipped, "
            f"{stats.assets_failed} failed ({processed / elapsed:.1f} assets/s, "
            f"workers={workers})",
            flush=True,
        )


def _relink_components(
    service: Any,
    conn: Any,
    stats: PreviewStats,
    *,
    commit_batch: int,
    limit: int,
) -> None:
    from app.services.component_catalog_domain import _utc_now_iso  # noqa: PLC0415

    component_ids = _load_target_components(conn, limit=limit)
    stats.components_seen = len(component_ids)
    pending = 0
    started = time.perf_counter()

    for index, component_id in enumerate(component_ids, start=1):
        try:
            component = service._component_row(conn, component_id)  # type: ignore[attr-defined]
            if not component:
                continue
            revision_id = str(component["current_revision_id"])
            changed = _relink_revision_preview_outputs(service, conn, revision_id, now=_utc_now_iso())
            if changed:
                stats.components_relinked += 1
            pending += 1
            if pending >= commit_batch:
                conn.commit()
                _begin_batch(conn)
                pending = 0
                elapsed = max(time.perf_counter() - started, 0.001)
                print(
                    f"Components {index}/{stats.components_seen}: "
                    f"{stats.components_relinked} relinked ({index / elapsed:.1f} components/s)",
                    flush=True,
                )
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            _begin_batch(conn)
            pending = 0
            stats.components_failed += 1
            _record_error(stats, f"component:{component_id}: {exc}")

    if pending:
        conn.commit()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bulk regenerate KiCad symbol/footprint SVG previews.")
    parser.add_argument("--database-url", default=os.environ.get("PRISM_DATABASE_URL", ""))
    parser.add_argument(
        "--projects-root",
        default=os.environ.get("KICAD_PROJECTS_ROOT", ""),
        help="Must match the running backend mount (Compose uses /app/projects). "
        "Required when running via standalone docker run.",
    )
    parser.add_argument(
        "--force-regenerate",
        action="store_true",
        help="Regenerate previews even when ready previews already exist.",
    )
    parser.add_argument(
        "--assets-only",
        action="store_true",
        help="Generate asset previews only; skip relinking component revision preview outputs.",
    )
    parser.add_argument(
        "--relink-only",
        action="store_true",
        help="Relink component revision preview outputs from existing asset previews; skip generation.",
    )
    parser.add_argument("--commit-batch", type=int, default=50, help="Commit every N assets/components.")
    parser.add_argument("--workers", type=int, default=_default_workers(), help="Parallel KiCad preview workers.")
    parser.add_argument("--limit", type=int, default=0, help="Process at most this many assets/components.")
    parser.add_argument("--report-json", type=Path, default=None)
    return parser


def _resolve_projects_root(explicit: str) -> str:
    candidate = explicit.strip()
    if not candidate:
        candidate = "/app/projects"
    return str(Path(candidate).resolve())


def _validate_runtime_layout(service: Any, projects_root: str) -> None:
    store_root = Path(service._store_root)  # type: ignore[attr-defined]
    previews_root = store_root / "previews"
    expected_store = Path(projects_root).resolve() / ".kicad-prism" / "components"
    if store_root != expected_store.resolve():
        raise RuntimeError(
            "Catalog store_root does not match --projects-root. "
            f"store_root={store_root}, expected={expected_store}. "
            "Set KICAD_PROJECTS_ROOT (or pass --projects-root) to the same path used by docker compose."
        )
    previews_root.mkdir(parents=True, exist_ok=True)
    probe = previews_root / ".write_probe"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink(missing_ok=True)


def main() -> int:
    args = _build_parser().parse_args()
    if args.assets_only and args.relink_only:
        print("Choose at most one of --assets-only or --relink-only.", file=sys.stderr)
        return 2
    if args.workers < 1:
        print("--workers must be >= 1.", file=sys.stderr)
        return 2

    try:
        _load_catalog_runtime()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    projects_root = _resolve_projects_root(args.projects_root)
    os.environ["KICAD_PROJECTS_ROOT"] = projects_root

    service = ComponentCatalogService(database_url=args.database_url or None)
    stats = PreviewStats()
    service.initialize()
    try:
        _validate_runtime_layout(service, projects_root)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(f"Using projects root: {projects_root}", flush=True)
    print(f"Catalog store root: {service._store_root}", flush=True)  # type: ignore[attr-defined]
    only_missing = not args.force_regenerate

    with service._connect() as conn:  # type: ignore[attr-defined]
        _begin_batch(conn)
        if not args.relink_only:
            print(
                f"Phase 1/2: generating asset previews (workers={args.workers}, "
                f"only_missing={only_missing}) ...",
                flush=True,
            )
            _regenerate_assets(
                service,
                conn,
                stats,
                only_missing=only_missing,
                commit_batch=max(1, args.commit_batch),
                limit=args.limit,
                workers=args.workers,
            )
        if not args.assets_only:
            phase = "Phase 2/2" if not args.relink_only else "Relinking"
            print(f"{phase}: linking previews onto component revisions ...", flush=True)
            _relink_components(
                service,
                conn,
                stats,
                commit_batch=max(1, args.commit_batch),
                limit=args.limit,
            )

    report = asdict(stats)
    report["only_missing"] = only_missing
    report["workers"] = args.workers
    report["projects_root"] = projects_root
    report["store_root"] = str(service._store_root)  # type: ignore[attr-defined]
    report["assets_only"] = bool(args.assets_only)
    report["relink_only"] = bool(args.relink_only)
    if args.report_json:
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        args.report_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if stats.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
