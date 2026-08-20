#!/usr/bin/env python3
"""Repair database-library components whose `mpn` holds an internal part number.

Older runs of ``import_database_library.py`` wrote the source library's
"Part Number" column into ``component_revisions.mpn``. That column is an
internal part number, not a manufacturer part number, so every imported
component was unqueryable against a distributor and the field labelled
"Manufacturer Part Number" in Library Manager was showing something else.

``import_database_library.py`` now maps the columns correctly, but a deployed
catalog cannot be re-imported: ``--replace-catalog`` truncates release records,
review decisions, the audit trail, component usage, and every generated
preview. This script repairs an existing catalog in place instead.

For each component it can match back to a source-database row it:

  1. clones the current revision (carrying assets, previews and validation
     evidence forward, exactly as an ordinary edit would),
  2. rewrites ``name``, ``mpn``, ``extra_fields``, ``keywords`` and
     ``search_document`` from the source database,
  3. recomputes the manifest hash and records an audit event, and
  4. releases the new revision and points the component at it.

Revisions are never edited in place, so the ``prism_guard_finalized_revision_update``
trigger is respected and no migration escape hatch is needed.

The release step is deliberately direct rather than a walk through
``set_release_status``. This is an administrative data repair, not design work:
there is no author to approve, the parent revision was already released, and
the assets are copied unchanged, so the two-person approval and approval
evidence gates have nothing meaningful to assert. Availability is still checked
so the script cannot promote a component whose files are incomplete.

Windows-friendly: pure Python, no shell or container assumptions. Point it at
the deployed database with ``--database-url`` or ``PRISM_DATABASE_URL``.

Examples::

    python scripts/backfill_database_library_mpn.py C:\\libs\\cern-kicad-libs ^
        --database-url postgresql://user:pass@host:5432/prism --dry-run

    python scripts/backfill_database_library_mpn.py C:\\libs\\cern-kicad-libs ^
        --database-url postgresql://user:pass@host:5432/prism ^
        --report-json backfill-report.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import import_database_library as importer  # noqa: E402

# The importer appends this to a part number when a source table repeats it.
# Matching strips it so a variant row resolves back to its source row.
ALT_SUFFIX_PATTERN = re.compile(r"__ALT\d+$")

# Metadata columns this script owns. Everything else on the revision is carried
# forward untouched by the clone, so a librarian's edits to unrelated fields
# survive the repair.
MANAGED_COLUMNS = ("name", "mpn")

CHANGE_SUMMARY = "Recover manufacturer part number from source database library"


@dataclass
class BackfillStats:
    source_rows: int = 0
    catalog_components: int = 0
    matched: int = 0
    unmatched: int = 0
    already_correct: int = 0
    updated: int = 0
    released: int = 0
    repaired_in_workflow: int = 0
    skipped_not_place_ready: int = 0
    failed: int = 0
    mpn_recovered: int = 0
    mpn_fallback: int = 0
    extra_fields_overwritten: int = 0
    errors: list[str] = field(default_factory=list)
    unmatched_examples: list[str] = field(default_factory=list)


def _record_error(stats: BackfillStats, message: str) -> None:
    if len(stats.errors) < importer.MAX_REPORTED_ERRORS:
        stats.errors.append(message)


def _build_source_index(
    source_conn: sqlite3.Connection,
    tables: list[str],
    stats: BackfillStats,
) -> dict[str, dict[str, Any]]:
    """Map each component's import name to the metadata it should now carry.

    Occurrence numbering mirrors the importer so a repeated part number resolves
    to the same source row it was originally imported from. Duplicate rows share
    a manufacturer part number, but they can differ in the columns preserved as
    extra fields, so reproducing the original pairing matters.
    """
    column_maps = importer._table_column_maps(source_conn, tables)
    part_occurrences: dict[str, int] = {}
    index: dict[str, dict[str, Any]] = {}

    for table in tables:
        column_map = column_maps[table]
        for row in source_conn.execute(f'SELECT * FROM "{table}"'):
            part_number = importer._row_get_cached(row, column_map, *importer.IPN_COLUMNS)
            if not part_number:
                continue
            stats.source_rows += 1
            occurrence = part_occurrences.get(part_number, 0) + 1
            part_occurrences[part_number] = occurrence
            import_name = (
                part_number if occurrence == 1 else f"{part_number}__ALT{occurrence:03d}"
            )
            index[import_name] = importer._metadata_from_row_cached(
                row, table, import_name, column_map
            )
    return index


def _catalog_rows(conn: Any) -> list[dict[str, Any]]:
    """Components that actually came from a database-library import.

    Provenance is taken from the component's first revision, not its current
    one, because repairing a component rewrites `created_by` on the revision it
    creates -- keying off the current revision would make a second run find
    nothing. Names are not evidence of origin: a component imported from a
    symbol library can carry a name that happens to equal a database library's
    part number, and repairing it would rewrite a part the library never owned.
    """
    rows = conn.execute(
        """
        SELECT
            component.id AS component_id,
            component.is_active AS is_active,
            revision.id AS revision_id,
            revision.name AS name,
            revision.mpn AS mpn,
            revision.extra_fields AS extra_fields,
            revision.release_status AS release_status
        FROM components component
        JOIN component_revisions revision ON revision.id = component.current_revision_id
        WHERE component.source = 'import'
          AND component.is_active = 1
          AND EXISTS (
              SELECT 1
              FROM component_revisions origin
              WHERE origin.component_id = component.id
                AND origin.version = 1
                AND origin.created_by = %s
          )
        ORDER BY revision.name
        """,
        (importer.DATABASE_LIBRARY_IMPORT_ACTOR,),
    ).fetchall()
    return [dict(row) for row in rows]


def _match_key(name: str) -> str:
    return ALT_SUFFIX_PATTERN.sub("", name.strip())


def _load_extra_fields(raw: Any) -> dict[str, str]:
    if not raw:
        return {}
    try:
        loaded = json.loads(raw) if isinstance(raw, str) else dict(raw)
    except (TypeError, ValueError):
        return {}
    if not isinstance(loaded, dict):
        return {}
    return {str(key): str(value or "") for key, value in loaded.items()}


def _merge_extra_fields(
    existing: dict[str, str],
    desired: dict[str, str],
    stats: BackfillStats,
) -> dict[str, str]:
    """Source-database values win for the keys this script owns.

    Keys a librarian added by hand are preserved. Overwrites of a differing
    existing value are counted so the report can surface how much hand-entered
    data the source database replaced.
    """
    merged = dict(existing)
    for key, value in desired.items():
        current = merged.get(key, "")
        if current and current != value:
            stats.extra_fields_overwritten += 1
        merged[key] = value
    return merged


def _desired_revision_state(
    row: dict[str, Any],
    source: dict[str, Any],
    stats: BackfillStats,
) -> dict[str, Any]:
    existing_extra = _load_extra_fields(row.get("extra_fields"))
    merged_extra = _merge_extra_fields(existing_extra, source["extra_fields"], stats)
    return {
        "name": source["name"],
        "mpn": source["mpn"],
        "extra_fields": merged_extra,
    }


def _needs_update(row: dict[str, Any], desired: dict[str, Any]) -> bool:
    if any(str(row.get(column) or "") != desired[column] for column in MANAGED_COLUMNS):
        return True
    return _load_extra_fields(row.get("extra_fields")) != desired["extra_fields"]


def _metadata_for_documents(conn: Any, service: Any, revision_id: str) -> dict[str, Any]:
    """Rebuild the payload shape `_keywords` and `_search_document` expect."""
    revision = service._revision_row(conn, revision_id)  # type: ignore[attr-defined]
    if not revision:
        raise ValueError(f"Revision disappeared: {revision_id}")
    payload = {key: revision[key] for key in revision.keys()}
    payload["extra_fields"] = _load_extra_fields(revision["extra_fields"])
    return payload


def _apply_revision_state(
    conn: Any,
    service: Any,
    revision_id: str,
    desired: dict[str, Any],
    now: str,
) -> None:
    """Write the corrected metadata onto a freshly cloned revision.

    The clone has an empty manifest hash, so the finalized-revision guard allows
    this update. Keywords and the search document are derived, so both are
    regenerated from the values that were just written rather than patched.
    """
    conn.execute(
        """
        UPDATE component_revisions
        SET name = %s, mpn = %s, extra_fields = %s, updated_at = %s
        WHERE id = %s
        """,
        (
            desired["name"],
            desired["mpn"],
            json.dumps(desired["extra_fields"], sort_keys=True, separators=(",", ":")),
            now,
            revision_id,
        ),
    )
    payload = _metadata_for_documents(conn, service, revision_id)
    conn.execute(
        """
        UPDATE component_revisions
        SET keywords = %s, search_document = %s, updated_at = %s
        WHERE id = %s
        """,
        (
            json.dumps(service._keywords(payload), separators=(",", ":")),  # type: ignore[attr-defined]
            service._search_document(payload),  # type: ignore[attr-defined]
            now,
            revision_id,
        ),
    )


def _finalize_metadata_only_revision(
    conn: Any,
    service: Any,
    *,
    component_id: str,
    revision_id: str,
    actor: str,
    now: str,
) -> None:
    """Stamp the manifest hash and record the revision, without redrawing previews.

    This is ``_finalize_revision`` minus its preview refresh. That refresh
    re-renders every symbol and footprint SVG, which costs about half a second
    per component and dominates a full-catalog run. It is redundant here:
    ``_clone_revision`` already carried the parent's preview rows forward, and
    this repair changes only metadata, so the new revision points at byte
    identical assets. The manifest hash is computed from metadata and asset
    identity alone and never reads a preview, so skipping the render cannot
    change the hash that gets stamped.
    """
    manifest_hash = service._revision_manifest_hash(conn, revision_id)  # type: ignore[attr-defined]
    conn.execute(
        "UPDATE component_revisions SET manifest_hash = %s, updated_at = %s WHERE id = %s",
        (manifest_hash, now, revision_id),
    )
    service._append_audit_event(  # type: ignore[attr-defined]
        conn,
        component_id=component_id,
        revision_id=revision_id,
        event_type="revision.created",
        actor=actor,
        details={
            "change_kind": "metadata",
            "change_summary": CHANGE_SUMMARY,
            "manifest_hash": manifest_hash,
        },
    )


def _release_revision(
    conn: Any,
    service: Any,
    *,
    component_id: str,
    revision_id: str,
    actor: str,
    now: str,
) -> None:
    """Publish the repaired revision and record why it was published."""
    revision = service._revision_row(conn, revision_id)  # type: ignore[attr-defined]
    manifest_hash = str(revision["manifest_hash"] or "") if revision else ""
    conn.execute(
        "UPDATE component_revisions SET release_status = 'released', updated_at = %s WHERE id = %s",
        (now, revision_id),
    )
    conn.execute(
        """
        UPDATE components
        SET released_revision_id = %s, current_revision_id = %s, updated_at = %s
        WHERE id = %s
        """,
        (revision_id, revision_id, now, component_id),
    )
    assets = service._load_assets_for_revision(conn, revision_id)  # type: ignore[attr-defined]
    validation = service._component_validation_summary(conn, revision_id, assets)  # type: ignore[attr-defined]
    conn.execute(
        """
        INSERT INTO component_release_records (
            id, component_id, revision_id, release_label, manifest_hash, released_by,
            approval_decision_id, validation_json, policy_json, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT(component_id, revision_id, manifest_hash) DO NOTHING
        """,
        (
            str(uuid.uuid4()),
            component_id,
            revision_id,
            f"r{int(revision['version'])}" if revision else "",
            manifest_hash,
            actor,
            "",
            json.dumps(validation, sort_keys=True, separators=(",", ":")),
            json.dumps(
                {"administrative_backfill": True, "reason": CHANGE_SUMMARY},
                sort_keys=True,
                separators=(",", ":"),
            ),
            now,
        ),
    )
    service._append_audit_event(  # type: ignore[attr-defined]
        conn,
        component_id=component_id,
        revision_id=revision_id,
        event_type="revision.released",
        actor=actor,
        details={"manifest_hash": manifest_hash, "change_summary": CHANGE_SUMMARY},
    )


def _is_place_ready(service: Any, conn: Any, revision_id: str) -> tuple[bool, list[str]]:
    # Imported lazily: the catalog runtime is only importable once
    # `_load_catalog_runtime` has put the backend package on the path.
    from app.services.component_catalog_domain import STATE_PLACE_READY  # noqa: PLC0415

    assets = service._load_assets_for_revision(conn, revision_id)  # type: ignore[attr-defined]
    state, missing, _ = service._availability(assets, "released", True)  # type: ignore[attr-defined]
    return state == STATE_PLACE_READY, list(missing)


def _repair_component(
    conn: Any,
    service: Any,
    *,
    row: dict[str, Any],
    desired: dict[str, Any],
    actor: str,
    force: bool,
    stats: BackfillStats,
) -> bool:
    component_id = str(row["component_id"])
    parent_status = str(row["release_status"] or "")
    # Completeness only gates publishing. A component still moving through the
    # workflow is expected to be incomplete, and its metadata is repaired without
    # ever being released, so there is nothing here for the check to protect.
    if parent_status == "released" and not force:
        place_ready, missing = _is_place_ready(service, conn, str(row["revision_id"]))
        if not place_ready:
            stats.skipped_not_place_ready += 1
            _record_error(
                stats,
                f"{row['name']}: not place-ready ({', '.join(missing) or 'unknown'}); "
                "rerun with --force to release anyway",
            )
            return False

    revision = service._clone_revision(  # type: ignore[attr-defined]
        conn,
        component_id,
        actor=actor,
        change_kind="metadata",
        change_summary=CHANGE_SUMMARY,
    )
    revision_id = str(revision["id"])
    now = importer._utc_now_iso()
    _apply_revision_state(conn, service, revision_id, desired, now)
    _finalize_metadata_only_revision(
        conn,
        service,
        component_id=component_id,
        revision_id=revision_id,
        actor=actor,
        now=now,
    )
    if parent_status == "released":
        _release_revision(
            conn,
            service,
            component_id=component_id,
            revision_id=revision_id,
            actor=actor,
            now=now,
        )
        stats.released += 1
    else:
        # Work that was still moving through the workflow keeps moving. Publishing
        # it here would bypass whatever review it was waiting on, and the clone
        # carries the author's content forward, so the only thing to preserve is
        # the stage it was sitting at. `_clone_revision` demotes `done` to
        # `in_progress`, so the stage is restored explicitly rather than inherited.
        conn.execute(
            "UPDATE component_revisions SET release_status = %s, updated_at = %s WHERE id = %s",
            (parent_status, now, revision_id),
        )
        stats.repaired_in_workflow += 1
    stats.updated += 1
    return True


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Recover manufacturer part numbers for previously imported database-library components.",
    )
    parser.add_argument("source_root", type=Path, help="Library root, for example a CERN library checkout.")
    parser.add_argument("--database", type=Path, default=None, help="Source SQLite database. Defaults to autodiscovery in source_root.")
    parser.add_argument("--include-table", action="append", default=[], help="Consider only this source table. Can be repeated.")
    parser.add_argument("--database-url", default=os.environ.get("PRISM_DATABASE_URL", ""), help="Target Prism PostgreSQL URL.")
    parser.add_argument("--store-root", type=Path, default=None, help="Local Prism canonical component store root.")
    parser.add_argument("--actor", default="system:backfill_database_library_mpn", help="Actor recorded on revisions, releases and audit events.")
    parser.add_argument("--dry-run", action="store_true", help="Report what would change without writing to the database.")
    parser.add_argument("--force", action="store_true", help="Release repaired revisions even when component files are incomplete.")
    parser.add_argument("--limit", type=int, default=0, help="Repair at most this many components.")
    parser.add_argument("--commit-batch", type=int, default=500, help="Commit every N repaired components.")
    parser.add_argument("--report-json", type=Path, default=None, help="Optional JSON report path.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any component fails or is skipped.")
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    source_root = args.source_root.expanduser().resolve()
    if not source_root.is_dir():
        print(f"Source root does not exist: {source_root}", file=sys.stderr)
        return 2

    try:
        importer._load_catalog_runtime()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    database_path = (
        args.database.expanduser().resolve()
        if args.database
        else importer._autodiscover_database(source_root)
    )
    if not database_path.is_file():
        print(f"Source database does not exist: {database_path}", file=sys.stderr)
        return 2

    stats = BackfillStats()
    service = importer.ComponentCatalogService(
        store_root=args.store_root, database_url=args.database_url or None
    )

    source_conn = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    source_conn.row_factory = sqlite3.Row
    source_conn.execute("PRAGMA query_only = ON")
    tables = importer._database_tables(source_conn, set(args.include_table or []))
    print(f"Reading {len(tables)} source tables from {database_path} ...", flush=True)
    source_index = _build_source_index(source_conn, tables, stats)
    print(f"Indexed {len(source_index)} source part numbers.", flush=True)

    service.initialize()
    started = time.perf_counter()
    pending = 0

    with service._connect() as conn:  # type: ignore[attr-defined]
        rows = _catalog_rows(conn)
        stats.catalog_components = len(rows)
        print(f"Found {stats.catalog_components} imported components in the catalog.", flush=True)

        planned: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for row in rows:
            source = source_index.get(_match_key(str(row["name"])))
            if source is None:
                stats.unmatched += 1
                if len(stats.unmatched_examples) < 20:
                    stats.unmatched_examples.append(str(row["name"]))
                continue
            stats.matched += 1
            desired = _desired_revision_state(row, source, stats)
            if source["extra_fields"].get(importer.MPN_SOURCE_FIELD_LABEL) == importer.MPN_SOURCE_DATABASE:
                stats.mpn_recovered += 1
            else:
                stats.mpn_fallback += 1
            if not _needs_update(row, desired):
                stats.already_correct += 1
                continue
            planned.append((row, desired))
            if args.limit and len(planned) >= args.limit:
                break

        print(
            f"Matched {stats.matched}, unmatched {stats.unmatched}, "
            f"already correct {stats.already_correct}, to repair {len(planned)}.",
            flush=True,
        )

        if args.dry_run:
            print("Dry run: no changes written.", flush=True)
            for row, desired in planned[:10]:
                print(f"  {row['name']}: mpn {row['mpn']!r} -> {desired['mpn']!r}", flush=True)
        else:
            for row, desired in planned:
                try:
                    if _repair_component(
                        conn,
                        service,
                        row=row,
                        desired=desired,
                        actor=args.actor,
                        force=args.force,
                        stats=stats,
                    ):
                        pending += 1
                except Exception as exc:  # noqa: BLE001 - one bad row must not abort the run
                    conn.rollback()
                    pending = 0
                    stats.failed += 1
                    _record_error(stats, f"{row['name']}: {exc}")
                    continue
                if pending >= max(1, args.commit_batch):
                    conn.commit()
                    pending = 0
                    elapsed = max(time.perf_counter() - started, 0.001)
                    print(
                        f"Committed: {stats.updated} repaired, {stats.failed} failed "
                        f"({stats.updated / elapsed:.1f} components/s)",
                        flush=True,
                    )
            if pending:
                conn.commit()

    source_conn.close()

    summary = asdict(stats)
    print(json.dumps(summary, indent=2), flush=True)
    if args.report_json:
        args.report_json.expanduser().resolve().write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )

    if args.strict and (stats.failed or stats.unmatched or stats.skipped_not_place_ready):
        return 1
    return 1 if stats.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
