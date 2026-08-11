#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path


CONFIRMATION = "RESET-KICAD-PRISM"
SCHEMAS = ("operations", "comments", "catalog", "workspace")
LEGACY_PUBLIC_CATALOG_TABLES = (
    "asset_preview_versions",
    "asset_previews",
    "asset_validation_findings",
    "asset_validation_runs",
    "assets",
    "catalog_artifact_references",
    "catalog_artifacts",
    "catalog_audit_events",
    "catalog_field_definition_events",
    "catalog_field_definitions",
    "catalog_grid_preferences",
    "catalog_import_snapshot_files",
    "catalog_import_snapshots",
    "catalog_job_events",
    "catalog_jobs",
    "catalog_meta",
    "catalog_metadata_batch_items",
    "catalog_metadata_batches",
    "catalog_schema_migrations",
    "component_release_records",
    "component_review_decisions",
    "component_revisions",
    "component_usage",
    "components",
    "oauth_auth_codes",
    "oauth_revoked_tokens",
    "oauth_service_clients",
    "project_component_import_proposals",
    "project_component_import_sessions",
    "revision_assets",
    "revision_preview_outputs",
    "revision_previews",
    "revision_validation_evidence_links",
)


def _dsn() -> str:
    value = os.environ.get("PRISM_DATABASE_URL", "").strip()
    if not value:
        raise SystemExit("PRISM_DATABASE_URL is required")
    return value.replace("postgresql+psycopg://", "postgresql://", 1)


def _artifact_roots(projects_root: Path) -> list[Path]:
    state = projects_root / ".kicad-prism"
    configured = os.environ.get("CATALOG_ARTIFACT_ROOT", "").strip()
    roots = [
        Path(configured).expanduser() if configured else state / "artifacts",
        state / "components",
        state / "validation",
        state / "exports" / "kicad-dbl",
        state / "semantic-index",
        state / "semantic-visualizer",
        state / "project-properties",
    ]
    return [path.resolve() for path in roots]


def _legacy_sqlite_paths(projects_root: Path) -> list[Path]:
    state = projects_root / ".kicad-prism"
    paths = [
        state / "prism.sqlite3",
        state / "prism.sqlite3-wal",
        state / "prism.sqlite3-shm",
        state / "comments.sqlite3",
        state / "catalog-postgres-migration-report.json",
    ]
    backups = state / "backups"
    if backups.is_dir():
        paths.extend(sorted(backups.glob("*.sqlite3")))
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Destructively reset all KiCAD Prism PostgreSQL schemas and derived state."
    )
    parser.add_argument("--confirm", required=True)
    parser.add_argument("--keep-derived-files", action="store_true")
    parser.add_argument(
        "--keep-legacy-sqlite",
        action="store_true",
        help="Keep deprecated prism.sqlite3 / comments.sqlite3 leftovers on disk.",
    )
    args = parser.parse_args()

    if os.environ.get("PRISM_ALLOW_DESTRUCTIVE_RESET", "").strip().lower() != "true":
        raise SystemExit("Set PRISM_ALLOW_DESTRUCTIVE_RESET=true to enable this command")
    if args.confirm != CONFIRMATION:
        raise SystemExit(f"Pass --confirm {CONFIRMATION} exactly")

    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("psycopg is required") from exc

    with psycopg.connect(_dsn(), autocommit=True) as connection:
        connection.execute("SELECT pg_advisory_lock(hashtext(%s))", ("prism-destructive-reset",))
        try:
            for schema in SCHEMAS:
                connection.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
            for schema in reversed(SCHEMAS):
                connection.execute(f'CREATE SCHEMA "{schema}"')
            # Pre-reset migrations wrote catalog tables into public; drop leftovers.
            for table in LEGACY_PUBLIC_CATALOG_TABLES:
                connection.execute(f'DROP TABLE IF EXISTS public."{table}" CASCADE')
        finally:
            connection.execute("SELECT pg_advisory_unlock(hashtext(%s))", ("prism-destructive-reset",))

    projects_root = Path(os.environ.get("KICAD_PROJECTS_ROOT", "data/projects")).expanduser().resolve()
    if not args.keep_derived_files:
        for path in _artifact_roots(projects_root):
            if path.exists():
                shutil.rmtree(path)
    if not args.keep_legacy_sqlite:
        for path in _legacy_sqlite_paths(projects_root):
            if path.exists():
                path.unlink()

    print("KiCAD Prism PostgreSQL state reset completed. Project source checkouts were preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
