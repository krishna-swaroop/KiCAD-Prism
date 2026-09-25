#!/usr/bin/env python3
"""Reset the Prism component catalog or only CERN database-library imports."""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path


CONFIRMATION = "RESET-PRISM-CATALOG-EPOCH-2"
CERN_CONFIRMATION = "RESET-PRISM-CERN-IMPORTS"
CERN_EXTERNAL_SOURCE = "cern-database-library"
IMMUTABLE_TRIGGER_TABLES = (
    "catalog_audit_events",
    "component_review_decisions",
    "component_release_records",
    "components",
    "component_revisions",
    "asset_previews",
    "asset_preview_versions",
)


def _dsn() -> str:
    value = os.environ.get("PRISM_DATABASE_URL", "").strip()
    if not value:
        raise SystemExit("PRISM_DATABASE_URL is required")
    return value.replace("postgresql+psycopg://", "postgresql://", 1)


def _catalog_artifact_roots(projects_root: Path) -> tuple[Path, ...]:
    state_root = projects_root.resolve() / ".kicad-prism"
    configured_export = os.environ.get("CATALOG_DBL_EXPORT_DIR", "").strip()
    return (
        state_root / "components",
        state_root / "validation" / "klc",
        Path(configured_export).expanduser().resolve()
        if configured_export
        else state_root / "exports" / "kicad-dbl",
    )


def _unlink_files(paths: set[str]) -> list[str]:
    removed: list[str] = []
    for raw_path in sorted(paths):
        if not raw_path:
            continue
        path = Path(raw_path)
        if path.is_file() or path.is_symlink():
            path.unlink()
            removed.append(str(path))
    return removed


def _set_immutable_triggers(connection: object, *, enabled: bool) -> None:
    operation = "ENABLE" if enabled else "DISABLE"
    for table in IMMUTABLE_TRIGGER_TABLES:
        connection.execute(  # type: ignore[attr-defined]
            f"ALTER TABLE {table} {operation} TRIGGER trg_{table}_immutable"
        )


def _delete_cern_imports(connection: object, *, dry_run: bool) -> tuple[int, int, set[str]]:
    connection.execute("SET LOCAL search_path TO catalog, public")  # type: ignore[attr-defined]
    component_rows = connection.execute(  # type: ignore[attr-defined]
        """
        SELECT id
        FROM components
        WHERE external_source = %s
          AND external_id LIKE %s
        ORDER BY id
        """,
        (CERN_EXTERNAL_SOURCE, "cern:%"),
    ).fetchall()
    component_ids = [str(row["id"]) for row in component_rows]
    if not component_ids:
        return 0, 0, set()

    asset_rows = connection.execute(  # type: ignore[attr-defined]
        """
        SELECT DISTINCT a.id
        FROM assets a
        JOIN revision_assets ra ON ra.asset_id = a.id
        JOIN component_revisions cr ON cr.id = ra.revision_id
        WHERE cr.component_id = ANY(%s)
        ORDER BY a.id
        """,
        (component_ids,),
    ).fetchall()
    candidate_asset_ids = [str(row["id"]) for row in asset_rows]

    if dry_run:
        orphan_count = 0
        if candidate_asset_ids:
            orphan_count = int(
                connection.execute(  # type: ignore[attr-defined]
                    """
                    SELECT COUNT(*) AS total
                    FROM assets a
                    WHERE a.id = ANY(%s)
                      AND NOT EXISTS (
                          SELECT 1
                          FROM revision_assets ra
                          JOIN component_revisions cr ON cr.id = ra.revision_id
                          WHERE ra.asset_id = a.id AND NOT (cr.component_id = ANY(%s))
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM revision_representations rr
                          JOIN component_revisions cr ON cr.id = rr.revision_id
                          WHERE (rr.symbol_asset_id = a.id OR rr.footprint_asset_id = a.id)
                            AND NOT (cr.component_id = ANY(%s))
                      )
                    """,
                    (candidate_asset_ids, component_ids, component_ids),
                ).fetchone()["total"]
            )
        return len(component_ids), orphan_count, set()

    connection.execute("SET LOCAL prism.catalog_migration = 'on'")  # type: ignore[attr-defined]
    _set_immutable_triggers(connection, enabled=False)
    connection.execute("DELETE FROM components WHERE id = ANY(%s)", (component_ids,))  # type: ignore[attr-defined]

    orphan_rows = []
    if candidate_asset_ids:
        orphan_rows = connection.execute(  # type: ignore[attr-defined]
            """
            SELECT a.id, a.canonical_path
            FROM assets a
            WHERE a.id = ANY(%s)
              AND NOT EXISTS (SELECT 1 FROM revision_assets ra WHERE ra.asset_id = a.id)
              AND NOT EXISTS (
                  SELECT 1 FROM revision_representations rr
                  WHERE rr.symbol_asset_id = a.id OR rr.footprint_asset_id = a.id
              )
            ORDER BY a.id
            """,
            (candidate_asset_ids,),
        ).fetchall()

    orphan_ids = [str(row["id"]) for row in orphan_rows]
    artifact_paths = {str(row["canonical_path"] or "") for row in orphan_rows}
    if orphan_ids:
        preview_rows = connection.execute(  # type: ignore[attr-defined]
            """
            SELECT file_path FROM asset_previews WHERE asset_id = ANY(%s)
            UNION
            SELECT file_path FROM asset_preview_versions WHERE asset_id = ANY(%s)
            """,
            (orphan_ids, orphan_ids),
        ).fetchall()
        artifact_paths.update(str(row["file_path"] or "") for row in preview_rows)
        connection.execute("DELETE FROM asset_preview_versions WHERE asset_id = ANY(%s)", (orphan_ids,))  # type: ignore[attr-defined]
        connection.execute("DELETE FROM assets WHERE id = ANY(%s)", (orphan_ids,))  # type: ignore[attr-defined]

    _set_immutable_triggers(connection, enabled=True)

    return len(component_ids), len(orphan_ids), artifact_paths


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Reset the whole Prism catalog, or remove only components explicitly marked as CERN "
            "database-library imports. Projects and other PostgreSQL schemas are preserved."
        )
    )
    parser.add_argument("--confirm", required=True)
    parser.add_argument(
        "--cern-only",
        action="store_true",
        help="Delete only components marked as CERN database-library imports and their orphaned assets.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report the scoped CERN deletion without changing data.")
    parser.add_argument(
        "--projects-root",
        type=Path,
        default=Path(os.environ.get("KICAD_PROJECTS_ROOT", ".")),
    )
    parser.add_argument("--keep-derived-files", action="store_true")
    args = parser.parse_args()

    expected_confirmation = CERN_CONFIRMATION if args.cern_only else CONFIRMATION
    if args.confirm != expected_confirmation:
        raise SystemExit(f"Refusing reset: --confirm must be exactly {expected_confirmation}")
    if args.dry_run and not args.cern_only:
        raise SystemExit("--dry-run is supported only with --cern-only")

    try:
        import psycopg
    except ModuleNotFoundError as exc:
        raise SystemExit("psycopg is required; run this with the backend environment") from exc

    with psycopg.connect(_dsn(), autocommit=False) as connection:
        connection.row_factory = psycopg.rows.dict_row
        connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("prism-component-catalog-schema",))
        if args.cern_only:
            component_count, orphan_asset_count, artifact_paths = _delete_cern_imports(
                connection,
                dry_run=args.dry_run,
            )
        else:
            connection.execute("DROP SCHEMA IF EXISTS catalog CASCADE")
            connection.execute("CREATE SCHEMA catalog")
            component_count = 0
            orphan_asset_count = 0
            artifact_paths = set()
        connection.commit()

    removed: list[str] = []
    if args.cern_only:
        if not args.dry_run and not args.keep_derived_files:
            removed = _unlink_files(artifact_paths)
        action = "Would remove" if args.dry_run else "Removed"
        print(
            f"{action} {component_count} CERN-imported components and "
            f"{orphan_asset_count} assets not shared by other components."
        )
        print("Non-CERN components and global DBL/validation artifact roots were preserved.")
    elif not args.keep_derived_files:
        for root in _catalog_artifact_roots(args.projects_root):
            if root.exists():
                shutil.rmtree(root)
                removed.append(str(root))

    if not args.cern_only:
        print("Catalog schema recreated; non-catalog schemas and project repositories were preserved.")
    for path in removed:
        print(f"Removed catalog artifact root: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
