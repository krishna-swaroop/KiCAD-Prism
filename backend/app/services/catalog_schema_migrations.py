"""Versioned, additive migrations for the component catalog schema.

The workspace schema has carried a migration ladder since it was introduced.
The catalog instead had a single version string, and an installation whose
database did not carry that exact string was told at startup to run
``scripts/reset_prism_postgres.py`` with destructive confirmation. That made the
first catalog schema change in any release equivalent to discarding every
component, revision, release record, review decision and asset row on the
installation -- and it would have surfaced for the first time on somebody's
production database, mid-upgrade, after the old stack had already been stopped.

Migrations here follow the same contract as every other schema
(:mod:`app.services.schema_ledger`): numbered, additive and idempotent, applied
once under the catalog's advisory lock and recorded in
``catalog_schema_versions``. An upgrade may only add. Anything that removes or
narrows waits for a later release, once the version that needed it is out of
support, so that rolling the application back does not require restoring data.

The catalog is forward-only (D8, 2026-10-11): step 0 is the baseline that used
to be reconciled on every start (base tables, epoch row, metadata registry and
its built-in seed, the component-head projections). It runs once and is
recorded like any other step, so a later change to any of it -- including a new
built-in metadata field -- needs a new step. The legacy ``catalog_schema_migrations``
version row an older Prism required is no longer written, so rolling back to a
release from before the ledger is not supported.

Two things still run on every start, outside the ledger, because they are a
guard and derived state rather than migrations: the epoch guard (a refusal)
and the projections' definition-version reconciliation, together with the
search indexes and integrity guards
(``ComponentCatalogPostgresService.initialize``).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.services.catalog.harness_fields import GROUP as HARNESS_GROUP, HARNESS_FIELDS
from app.services.catalog.metadata_schema import CatalogMetadataSchema
from app.services.catalog.normalization import utc_now_iso
from app.services.catalog.postgres_projections import (
    ensure_component_heads_projection,
    ensure_remote_component_heads_projection,
)
from app.services.catalog.postgres_schema import CATALOG_SCHEMA_EPOCH, create_base_schema
from app.services.schema_ledger import Ledger, Renumbered, Step


Migration = Callable[[Any], None]

# Bumping this rewrites the listed columns, so a database that already carries
# the marker must not be made to do the work again.
PORTABLE_TYPES_MARKER = "postgres_portable_types_version"
PORTABLE_TYPES_VERSION = "catalog-portable-types-v1"


def _baseline(conn: Any) -> None:
    """The catalog surface the numbered steps build on.

    Every statement is ``IF NOT EXISTS`` / ``ON CONFLICT``, so a database that
    reconciled this on every start before D8 records it without change. The
    projections come before step 1, which widens a head column.
    """
    create_base_schema(conn)
    conn.execute(
        "INSERT INTO catalog_meta(key, value) VALUES (%s, %s) "
        "ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
        ("catalog_schema_epoch", CATALOG_SCHEMA_EPOCH),
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_component_sequence "
        "ON catalog_audit_events(component_id, sequence)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_component_usage_current "
        "ON component_usage(component_id, is_current, last_seen_at DESC)"
    )
    CatalogMetadataSchema().ensure_schema(conn)
    ensure_component_heads_projection(conn)
    ensure_remote_component_heads_projection(conn)


def _portable_column_types(conn: Any) -> None:
    """Widen columns whose original types came from the SQLite-era schema.

    Catalog storage started on SQLite, where a column's declared type is close
    to advisory. PostgreSQL is not so forgiving: stock quantities need to hold
    fractional values, byte counts and audit sequences overflow a 32-bit
    integer, and OAuth expiry timestamps are seconds since the epoch.
    """
    for table, column, target in (
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


def _component_kinds(conn: Any) -> None:
    """System Builder P2 (CONTRACTS_P2 §3): ``part`` | ``module`` | ``assembly``.

    Every existing component is a ``part``. Module and assembly revisions carry
    their connector ``interface`` and (assemblies) the ``source_ref`` of the
    system snapshot they were published from, both as JSON text like the rest
    of the catalog's JSON columns.
    """
    conn.execute(
        "ALTER TABLE components ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'part'"
    )
    conn.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'components_kind_check'
            ) THEN
                ALTER TABLE components
                    ADD CONSTRAINT components_kind_check CHECK (kind IN ('part', 'module', 'assembly'));
            END IF;
        END $$
        """
    )
    conn.execute(
        "ALTER TABLE component_revisions ADD COLUMN IF NOT EXISTS interface_json TEXT NOT NULL DEFAULT '{}'"
    )
    conn.execute(
        "ALTER TABLE component_revisions ADD COLUMN IF NOT EXISTS source_ref_json TEXT NOT NULL DEFAULT '{}'"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS components_kind_idx ON components (kind)")


def _mates_with(conn: Any) -> None:
    """System Builder P2 (CONTRACTS_P2 §18): parts that mate, stored once per pair with ``part_a < part_b``."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS catalog_mates_with (
            part_a     TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            part_b     TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            created_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            PRIMARY KEY (part_a, part_b),
            CHECK (part_a < part_b)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS catalog_mates_with_b_idx ON catalog_mates_with (part_b)")


def _model_glb(conn: Any) -> None:
    """System Builder P2 (CONTRACTS_P2 §18.2): GLBs converted from STEP models, and per-part model alignment.

    A GLB is cached by ``key`` = sha256(STEP sha256 + converter), so it is shared by every part that
    carries the same STEP and replaced only when the converter changes.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS catalog_model_glb (
            key         TEXT PRIMARY KEY,
            step_sha256 TEXT NOT NULL,
            converter   TEXT NOT NULL,
            glb_sha256  TEXT NOT NULL,
            glb_path    TEXT NOT NULL,
            bounds_json TEXT NOT NULL,
            materials   INTEGER NOT NULL,
            size_bytes  INTEGER NOT NULL,
            created_at  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS catalog_model_alignment (
            component_id   TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            asset_id       TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
            alignment_json TEXT NOT NULL,
            updated_by     TEXT NOT NULL DEFAULT '',
            updated_at     TEXT NOT NULL,
            PRIMARY KEY (component_id, asset_id)
        )
        """
    )


def _agent_tokens_registry(conn: Any) -> None:
    """Track issued KiCad agent sign-in tokens so they can be listed and revoked.

    The token value is never stored; the jti is the handle the revocation list
    keys on when a row is revoked from the web console.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_tokens (
            jti TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            scopes TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            last_used_at TEXT,
            revoked_at TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS agent_tokens_email_idx ON agent_tokens (email)"
    )


def _module_connectors(conn: Any) -> None:
    """System Builder P2 (CONTRACTS_P2 §3.6): the connector part placed for each unit of a module's symbol.

    Keyed by the unit's letter like model alignment is keyed by asset: a placement belongs to the
    component, not to a revision.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS catalog_module_connectors (
            component_id   TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            unit_key       TEXT NOT NULL,
            part_id        TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            placement_json TEXT NOT NULL,
            updated_by     TEXT NOT NULL DEFAULT '',
            updated_at     TEXT NOT NULL,
            PRIMARY KEY (component_id, unit_key)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS catalog_module_connectors_part_idx ON catalog_module_connectors (part_id)")


def _revision_assets_asset_index(conn: Any) -> None:
    """Retention's reverse lookup, asset -> revision, without scanning every revision link.

    ``LocalArtifactStore`` created this on every start before the single ledger,
    so most databases already have it.
    """
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_revision_assets_asset "
        "ON revision_assets(asset_id, revision_id)"
    )


def _asset_file_purges(conn: Any) -> None:
    """Append-only ledger of asset files that artifact maintenance deleted on purpose.

    The asset row and its hash stay; this row is what lets audit verification
    and asset reads tell an intended purge from a lost file. The integrity
    guards reject UPDATE and DELETE on it.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS catalog_asset_file_purges (
            id             TEXT PRIMARY KEY,
            asset_id       TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
            sha256         TEXT NOT NULL,
            canonical_path TEXT NOT NULL,
            reason         TEXT NOT NULL,
            job_id         TEXT NOT NULL DEFAULT '',
            purged_at      TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS catalog_asset_file_purges_asset_idx ON catalog_asset_file_purges (asset_id)"
    )


def _module_connector_part_revision(conn: Any) -> None:
    """System Builder P2 (CONTRACTS_P2 §3.6): the connector part's revision a module placement draws.

    Placing a connector records its part's current revision, so a later revision of that part (a new
    footprint or model) does not move the module's ports until the connector is placed again. Existing
    placements take the part's current revision: what they draw today.
    """
    conn.execute("ALTER TABLE catalog_module_connectors ADD COLUMN IF NOT EXISTS part_revision_id TEXT")
    conn.execute(
        """
        UPDATE catalog_module_connectors placed SET part_revision_id = part.current_revision_id
        FROM components part WHERE part.id = placed.part_id AND placed.part_revision_id IS NULL
        """
    )


def _asset_file_purge_events(conn: Any) -> None:
    """Quarantine before purge (issue #698, D1): each ledger row records one event.

    Rows written before this step deleted their file at once and keep
    ``event = 'purged'``. ``quarantine_path`` is where a ``quarantined`` file
    waits out the grace period; ``quarantine_id`` names the ``quarantined`` row
    a ``restored``, ``deleted`` or ``quarantine_failed`` row closes
    (``catalog/step_quarantine.py``). Adding columns does not fire the
    append-only guards.
    """
    conn.execute(
        "ALTER TABLE catalog_asset_file_purges ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT 'purged'"
    )
    conn.execute(
        "ALTER TABLE catalog_asset_file_purges ADD COLUMN IF NOT EXISTS quarantine_path TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "ALTER TABLE catalog_asset_file_purges ADD COLUMN IF NOT EXISTS quarantine_id TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS catalog_asset_file_purges_quarantine_idx "
        "ON catalog_asset_file_purges (quarantine_id) WHERE quarantine_id <> ''"
    )


def _project_catalog_placements(conn: Any) -> None:
    """Which catalog revision each project commit placed (issue #698, from the #695 stamp).

    One scan row and its placement rows per ``(project, commit)``, replaced as
    a whole when the commit is scanned again (``catalog/project_placements.py``).
    ``basis`` says how a row was found: ``stamp`` (the placed symbol's
    ``Prism_Component``/``Prism_Revision``), ``inferred_metadata`` (an unstamped
    symbol whose fields match exactly one ever-released revision) or
    ``identity`` (the component is known, its revision is not:
    ``catalog_revision_id`` is ``''``). No foreign keys: a stamp records what
    the file says, even a component this catalog does not have.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS project_catalog_scans (
            project_id      TEXT NOT NULL,
            source_revision TEXT NOT NULL,
            status          TEXT NOT NULL,
            symbol_count    INTEGER NOT NULL DEFAULT 0,
            stamped_count   INTEGER NOT NULL DEFAULT 0,
            inferred_count  INTEGER NOT NULL DEFAULT 0,
            untracked_count INTEGER NOT NULL DEFAULT 0,
            error           TEXT NOT NULL DEFAULT '',
            scanned_at      TEXT NOT NULL,
            PRIMARY KEY (project_id, source_revision)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS project_catalog_placements (
            project_id          TEXT NOT NULL,
            source_revision     TEXT NOT NULL,
            component_id        TEXT NOT NULL,
            catalog_revision_id TEXT NOT NULL DEFAULT '',
            basis               TEXT NOT NULL,
            references_json     TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (project_id, source_revision, component_id, catalog_revision_id, basis)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_catalog_placements_revision "
        "ON project_catalog_placements (component_id, catalog_revision_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_catalog_scans_project "
        "ON project_catalog_scans (project_id, scanned_at DESC)"
    )


def _retire_module_and_assembly(conn: Any) -> None:
    """System Builder v2, stage 0 (``docs/architecture/adr-system-builder-v2.md`` §6): retire the v1 kinds.

    The catalog never hard-deletes a component otherwise; this is the one, approved exception, for the
    ``module`` and ``assembly`` kinds System Builder v1 published. Their components go with everything
    that cascades from them (revisions, assets links, audit, mates), the module connector placements go
    with their table, and only parts remain. System Builder v2 brings its own entry kind.
    """
    conn.execute("DROP TABLE IF EXISTS catalog_module_connectors")
    conn.execute("DELETE FROM components WHERE kind IN ('module', 'assembly')")
    conn.execute("ALTER TABLE components DROP CONSTRAINT IF EXISTS components_kind_check")
    conn.execute("ALTER TABLE components ADD CONSTRAINT components_kind_check CHECK (kind = 'part')")


def _system_entries(conn: Any) -> None:
    """System Builder v2 stage 1c (CONTRACTS.md §11.1): the ``system`` kind and its IPN identity.

    A published system is a catalog component of kind ``system`` whose identity is a final IPN
    in the ``system`` scope: not the parts' ``provisional_ipn``, which stands in until an MPN
    exists and blocks release. The two check constraints make both rules structural: an IPN
    identity can only sit on a system component, and no other kind can be added by accident.
    """
    conn.execute("ALTER TABLE components DROP CONSTRAINT IF EXISTS components_kind_check")
    conn.execute(
        """
        ALTER TABLE components
            ADD CONSTRAINT components_kind_check CHECK (kind IN ('part', 'system'))
        """
    )
    conn.execute(
        "ALTER TABLE components DROP CONSTRAINT IF EXISTS components_identity_kind_check"
    )
    conn.execute(
        """
        ALTER TABLE components
            ADD CONSTRAINT components_identity_kind_check
            CHECK (identity_kind IN ('mpn', 'provisional_ipn', 'ipn'))
        """
    )
    conn.execute(
        "ALTER TABLE components DROP CONSTRAINT IF EXISTS components_ipn_system_only"
    )
    conn.execute(
        """
        ALTER TABLE components
            ADD CONSTRAINT components_ipn_system_only
            CHECK (identity_kind <> 'ipn' OR kind = 'system')
        """
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_components_identity_ipn "
        "ON components(identity_source, normalized_part_number) "
        "WHERE identity_kind = 'ipn'"
    )


def _harness_fields(conn: Any) -> None:
    """System Builder v2 stage 4a (CONTRACTS.md §16.1): the ``harness`` metadata fields.

    Seeded as built-in definitions stored in ``extra_fields``, after every existing field.
    A database that already has a field with one of these keys keeps its own.
    """
    row = conn.execute(
        "SELECT COALESCE(MAX(display_order), -1) AS value FROM catalog_field_definitions"
    ).fetchone()
    order = int(row["value"] if row and row["value"] is not None else -1) + 1
    now = utc_now_iso()
    for index, field in enumerate(HARNESS_FIELDS):
        conn.execute(
            """
            INSERT INTO catalog_field_definitions (
                id, field_key, label, description, field_group, field_type, unit,
                enum_values_json, storage_kind, storage_key, built_in, required,
                display_order, archived, created_by, updated_by, created_at, updated_at
            ) VALUES (%s, %s, %s, '', %s, %s, %s, %s, 'extra', %s, 1, 0, %s, 0, 'system', 'system', %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (
                f"builtin:{field.key}",
                field.key,
                field.label,
                HARNESS_GROUP,
                field.field_type,
                field.unit,
                json.dumps(list(field.enum_values)),
                field.key,
                order + index,
                now,
                now,
            ),
        )


def _retire_system_entries(conn: Any) -> None:
    """System Builder was removed on 2026-10-23 (archive tag ``archive/system-builder-v2``).

    The second approved exception to the never-hard-delete rule, after migration 13: published
    ``system`` components go with everything that cascades from them (revisions, asset links,
    audit, mates), and their ``system_entry`` assets with them. Only parts remain and only parts
    can be added. The IPN identity existed for systems alone, so it goes too.
    """
    conn.execute("DELETE FROM components WHERE kind = 'system'")
    conn.execute("DELETE FROM assets WHERE asset_type = 'system_entry'")
    conn.execute("ALTER TABLE components DROP CONSTRAINT IF EXISTS components_kind_check")
    conn.execute("ALTER TABLE components ADD CONSTRAINT components_kind_check CHECK (kind = 'part')")
    conn.execute("ALTER TABLE components DROP CONSTRAINT IF EXISTS components_ipn_system_only")
    conn.execute("ALTER TABLE components DROP CONSTRAINT IF EXISTS components_identity_kind_check")
    conn.execute(
        """
        ALTER TABLE components
            ADD CONSTRAINT components_identity_kind_check
            CHECK (identity_kind IN ('mpn', 'provisional_ipn'))
        """
    )
    conn.execute("DROP INDEX IF EXISTS idx_components_identity_ipn")


def _supply_tables(conn: Any) -> None:
    """The supply module's tables (stock, prices and their history from distributors), all prefixed ``supply_``."""
    from app.services.supply.schema import create_supply_tables

    # The supply schema takes a plain psycopg connection (it passes ``prepare=``); the ledger may hand the catalog's wrapper.
    create_supply_tables(getattr(conn, "_connection", conn))


def _component_parts(conn: Any) -> None:
    """Which manufacturer parts a component may be built with: its main part (from the current revision's
    manufacturer and MPN) and alternates a designer proposed and QA decided. Kept outside revisions, like stock."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS component_parts (
            component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            part_id TEXT NOT NULL REFERENCES supply_parts(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('main', 'alternate')),
            approval TEXT NOT NULL DEFAULT 'approved' CHECK (approval IN ('pending', 'approved', 'rejected')),
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            decided_by TEXT NOT NULL DEFAULT '',
            decided_at TIMESTAMPTZ,
            PRIMARY KEY (component_id, part_id),
            CHECK (role = 'alternate' OR approval = 'approved')
        )
        """
    )
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_component_parts_main ON component_parts (component_id) WHERE role = 'main'")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_component_parts_part ON component_parts (part_id)")


def _inventory_sources(conn: Any) -> None:
    """Local inventory servers (InvenTree, or any server serving its read API) whose stock fills ``inventory_levels``.

    A sync replaces its source's ``inventory_levels`` rows. Parts it could not match to a component wait in
    ``inventory_unmatched`` until a person links them (``inventory_links``)."""
    for column in (
        "source_id TEXT NOT NULL DEFAULT ''",
        "allocated DOUBLE PRECISION NOT NULL DEFAULT 0",
        "location_path TEXT NOT NULL DEFAULT ''",
        "external BOOLEAN NOT NULL DEFAULT FALSE",
        "batch TEXT NOT NULL DEFAULT ''",
        "source_updated_at TEXT NOT NULL DEFAULT ''",
    ):
        conn.execute(f"ALTER TABLE inventory_levels ADD COLUMN IF NOT EXISTS {column}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_inventory_levels_source ON inventory_levels (source_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory_sources (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('inventree', 'push')),
            display_name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            category_id INTEGER,
            credential_envelope TEXT NOT NULL DEFAULT '',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            interval_hours INTEGER NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 1 AND 168),
            server TEXT NOT NULL DEFAULT '',
            api_version INTEGER,
            last_sync_at TIMESTAMPTZ,
            last_status TEXT NOT NULL DEFAULT '',
            last_error TEXT NOT NULL DEFAULT '',
            matched INTEGER NOT NULL DEFAULT 0,
            unmatched INTEGER NOT NULL DEFAULT 0,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory_links (
            source_id TEXT NOT NULL REFERENCES inventory_sources(id) ON DELETE CASCADE,
            remote_part TEXT NOT NULL,
            component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
            linked_by TEXT NOT NULL,
            linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (source_id, remote_part)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory_unmatched (
            source_id TEXT NOT NULL REFERENCES inventory_sources(id) ON DELETE CASCADE,
            remote_part TEXT NOT NULL,
            ipn TEXT NOT NULL DEFAULT '',
            mpn TEXT NOT NULL DEFAULT '',
            manufacturer TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT '',
            quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
            records INTEGER NOT NULL DEFAULT 0,
            reason TEXT NOT NULL,
            seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (source_id, remote_part)
        )
        """
    )
    # Unmatched local stock a person set aside (consumables, tools): kept apart from ``inventory_unmatched``, which every
    # read replaces, so the choice holds across reads until someone restores it.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory_ignored (
            source_id TEXT NOT NULL REFERENCES inventory_sources(id) ON DELETE CASCADE,
            remote_part TEXT NOT NULL,
            ignored_by TEXT NOT NULL,
            ignored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (source_id, remote_part)
        )
        """
    )


def _supply_catalog_links(conn: Any) -> None:
    """Supply's foreign keys to components and its rollups' change marks on catalog tables, which exist only from the steps
    before."""
    from app.services.supply.schema import create_catalog_links

    create_catalog_links(getattr(conn, "_connection", conn))


MIGRATIONS: tuple[tuple[int, str, Migration], ...] = (
    (0, "baseline", _baseline),
    (1, "portable_column_types", _portable_column_types),
    (2, "import_proposal_draft_column", _import_proposal_draft_column),
    (3, "component_kinds", _component_kinds),
    (4, "mates_with", _mates_with),
    (5, "model_glb", _model_glb),
    (6, "agent_tokens_registry", _agent_tokens_registry),
    (7, "module_connectors", _module_connectors),
    (8, "revision_assets_asset_index", _revision_assets_asset_index),
    (9, "asset_file_purges", _asset_file_purges),
    (10, "module_connector_part_revision", _module_connector_part_revision),
    (11, "asset_file_purge_events", _asset_file_purge_events),
    (12, "project_catalog_placements", _project_catalog_placements),
    (13, "retire_module_and_assembly", _retire_module_and_assembly),
    (14, "system_entries", _system_entries),
    (15, "harness_fields", _harness_fields),
    (16, "retire_system_entries", _retire_system_entries),
    (17, "supply_tables", _supply_tables),
    (18, "component_parts", _component_parts),
    (19, "inventory_sources", _inventory_sources),
    (20, "supply_catalog_links", _supply_catalog_links),
)

# Migrations that a long-lived branch database recorded under an earlier number.
# The ledger keys on version, so without this the old row would hide another
# migration's version and the new one would fail on the unique name.
RENUMBERED: tuple[tuple[str, int, int], ...] = (
    ("agent_tokens_registry", 3, 6),
)


def _adopt_legacy_markers(conn: Any) -> set[int]:
    """Record work an earlier Prism already did outside the ledger.

    Both migrations below predate this module and ran on every startup, guarded
    by their own marker or by ``IF NOT EXISTS``. Re-running the column widening
    would rewrite whole tables for nothing, so an installation that already
    carries its marker is credited with the migration instead.
    """
    adopted: set[int] = set()
    # A fresh database has no catalog_meta until step 0 creates it.
    meta = conn.execute("SELECT to_regclass(%s) AS relation", ("catalog_meta",)).fetchone()
    if not meta or not meta["relation"]:
        return adopted
    marker = conn.execute(
        "SELECT value FROM catalog_meta WHERE key = %s",
        (PORTABLE_TYPES_MARKER,),
    ).fetchone()
    if marker and str(marker["value"]) == PORTABLE_TYPES_VERSION:
        adopted.add(1)
    return adopted


CATALOG_LEDGER = Ledger(
    name="catalog",
    schema="catalog",
    table="catalog_schema_versions",
    steps=tuple(Step(version, name, body) for version, name, body in MIGRATIONS),
    # Catalog jobs and the reset/survivor scripts take this lock; keep it.
    lock="prism-component-catalog-schema",
    renumbered=tuple(Renumbered(name, old, new) for name, old, new in RENUMBERED),
    adopt=_adopt_legacy_markers,
)
