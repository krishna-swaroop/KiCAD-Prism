"""Versioned, additive migrations for the component catalog schema.

The workspace schema has carried a migration ladder since it was introduced.
The catalog instead had a single version string, and an installation whose
database did not carry that exact string was told at startup to run
``scripts/reset_prism_postgres.py`` with destructive confirmation. That made the
first catalog schema change in any release equivalent to discarding every
component, revision, release record, review decision and asset row on the
installation -- and it would have surfaced for the first time on somebody's
production database, mid-upgrade, after the old stack had already been stopped.

Migrations here follow the same contract as
:mod:`app.services.workspace_schema_migrations`: numbered, additive and
idempotent, applied once under the caller's advisory lock and recorded in
``catalog_schema_versions``. An upgrade may only add. Anything that removes or
narrows waits for a later release, once the version that needed it is out of
support, so that rolling the application back does not require restoring data.

Derived state stays out of this ladder on purpose. The component-head
projections, search indexes and integrity guards are rebuilt whenever their
definition version changes, which a run-once ledger cannot express; they keep
their own version markers in ``catalog_meta``.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any


logger = logging.getLogger(__name__)

Migration = Callable[[Any], None]

# Bumping this rewrites the listed columns, so a database that already carries
# the marker must not be made to do the work again.
PORTABLE_TYPES_MARKER = "postgres_portable_types_version"
PORTABLE_TYPES_VERSION = "catalog-portable-types-v1"


def _portable_column_types(conn: Any) -> None:
    """Widen columns whose original types came from the SQLite-era schema.

    Catalog storage started on SQLite, where a column's declared type is close
    to advisory. PostgreSQL is not so forgiving: stock quantities need to hold
    fractional values, byte counts and audit sequences overflow a 32-bit
    integer, and OAuth expiry timestamps are seconds since the epoch.
    """
    for table, column, target in (
        ("components", "stock_quantity", "DOUBLE PRECISION"),
        ("component_heads", "stock_quantity", "DOUBLE PRECISION"),
        ("remote_component_heads", "stock_quantity", "DOUBLE PRECISION"),
        ("assets", "size_bytes", "BIGINT"),
        ("asset_preview_versions", "size_bytes", "BIGINT"),
        ("catalog_audit_events", "sequence", "BIGINT"),
        ("oauth_auth_codes", "exp", "BIGINT"),
        ("oauth_revoked_tokens", "exp", "BIGINT"),
    ):
        conn.execute(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE {target} USING {column}::{target}"
        )
    conn.execute(
        """
        INSERT INTO catalog_meta (key, value)
        VALUES (%s, %s)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (PORTABLE_TYPES_MARKER, PORTABLE_TYPES_VERSION),
    )


def _import_proposal_draft_column(conn: Any) -> None:
    """Keep in-progress import remediation edits across a page reload."""
    conn.execute(
        "ALTER TABLE project_component_import_proposals "
        "ADD COLUMN IF NOT EXISTS draft_json TEXT NOT NULL DEFAULT '{}'"
    )


MIGRATIONS: tuple[tuple[int, str, Migration], ...] = (
    (1, "portable_column_types", _portable_column_types),
    (2, "import_proposal_draft_column", _import_proposal_draft_column),
)


def _adopt_legacy_markers(conn: Any) -> set[int]:
    """Record work an earlier Prism already did outside the ledger.

    Both migrations below predate this module and ran on every startup, guarded
    by their own marker or by ``IF NOT EXISTS``. Re-running the column widening
    would rewrite whole tables for nothing, so an installation that already
    carries its marker is credited with the migration instead.
    """
    adopted: set[int] = set()
    marker = conn.execute(
        "SELECT value FROM catalog_meta WHERE key = %s",
        (PORTABLE_TYPES_MARKER,),
    ).fetchone()
    if marker and str(marker["value"]) == PORTABLE_TYPES_VERSION:
        adopted.add(1)
    return adopted


def apply_catalog_migrations(conn: Any) -> None:
    """Apply versioned, additive catalog migrations under the caller's lock."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS catalog_schema_versions (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    applied = {
        int(row["version"])
        for row in conn.execute("SELECT version FROM catalog_schema_versions").fetchall()
    }
    if not applied:
        for version in _adopt_legacy_markers(conn):
            name = next(entry[1] for entry in MIGRATIONS if entry[0] == version)
            logger.info("Adopting catalog schema migration %s (%s) from its legacy marker", version, name)
            conn.execute(
                "INSERT INTO catalog_schema_versions(version, name) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (version, name),
            )
            applied.add(version)

    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        logger.info("Applying catalog schema migration %s (%s)", version, name)
        migration(conn)
        conn.execute(
            "INSERT INTO catalog_schema_versions(version, name) VALUES (%s, %s)",
            (version, name),
        )


def pending_catalog_migrations(conn: Any) -> list[tuple[int, str]]:
    """Migrations this build would really run, for reporting before an upgrade.

    Read-only, and it accounts for adoption: a migration whose legacy marker is
    already present will be recorded rather than replayed, so listing it here
    would overstate what the upgrade is about to do.
    """
    existing = conn.execute(
        "SELECT to_regclass('catalog.catalog_schema_versions') AS relation"
    ).fetchone()
    applied: set[int] = set()
    if existing and existing["relation"]:
        applied = {
            int(row["version"])
            for row in conn.execute("SELECT version FROM catalog_schema_versions").fetchall()
        }
    if not applied:
        applied |= _adopt_legacy_markers(conn)
    return [(version, name) for version, name, _ in MIGRATIONS if version not in applied]
