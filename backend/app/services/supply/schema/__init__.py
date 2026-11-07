"""The supply tables as they stand, every one prefixed ``supply_``, in the component catalog's schema.

This is the whole schema, not a history of steps: nothing has been released with supply tables, so the steps that built
them were folded into these modules before the first release. From the first release on, a change is a new catalog
ledger step (:mod:`app.services.catalog_schema_migrations`), never an edit here.

The catalog ledger runs :func:`create_supply_tables` as its ``supply_tables`` step and :func:`create_catalog_links`
once the catalog tables supply refers to exist; tests run :func:`create_supply_tables` in a disposable schema. Table
names are unqualified: the caller has set the search path. Every statement is idempotent, so running it twice changes
nothing.
"""

from __future__ import annotations

from app.services.supply.schema import derived, market, parts, sources, work

# In order: a table refers only to tables made before it.
_AREAS = (sources, parts, market, work, derived)


def create_supply_tables(conn) -> None:
    """Every supply table, its indexes, functions and triggers, then the spellings and suffixes Prism starts with."""

    for area in _AREAS:
        for statement in area.TABLES:
            conn.execute(statement, prepare=False)
    for area in (sources, parts, work, derived):
        for statement in (*area.FUNCTIONS, *area.TRIGGERS):
            conn.execute(statement, prepare=False)
    seed(conn)


def create_catalog_links(conn) -> None:
    """What ties supply to catalog tables: foreign keys to components, and the rollups' change marks on components,
    their parts and local stock."""

    for statement in (*work.CATALOG_LINKS, *derived.CATALOG_TRIGGERS):
        conn.execute(statement, prepare=False)


def add_catalogue_failure_state(conn) -> None:
    """The catalogue import's own failure state (catalog ledger step ``supply_catalogue_failure``).

    A catalogue failure used to be kept in ``last_error_code`` like a provider call, so a successful poll erased it.
    These columns hold it apart. The backfill moves a failure recorded by an older build, leaving no such code behind
    for a poll to read as its own. Tests run this after :func:`create_supply_tables`, as the ledger does.
    """

    conn.execute("ALTER TABLE supply_connectors ADD COLUMN IF NOT EXISTS catalogue_failed_at TIMESTAMPTZ", prepare=False)
    conn.execute(
        "ALTER TABLE supply_connectors ADD COLUMN IF NOT EXISTS catalogue_error TEXT NOT NULL DEFAULT ''",
        prepare=False,
    )
    conn.execute(
        "UPDATE supply_connectors SET catalogue_failed_at = last_error_at, last_error_code = '', "
        "last_error_at = NULL WHERE last_error_code = 'catalogue'",
        prepare=False,
    )


def seed(conn) -> None:
    """The usual manufacturer spellings and part-number suffixes in code that the tables do not have yet. A group's head
    is its first spelling. Rows a person changed are kept."""

    from app.services.supply import makers, number_suffixes
    from app.services.supply.identity import alias_key

    for group in makers.default_spellings():
        head = alias_key(group[0])
        for spelling in group:
            text = spelling.title() if spelling.islower() and len(spelling) > 3 else spelling.upper() if len(spelling) <= 3 else spelling
            conn.execute(
                "INSERT INTO supply_maker_seeds (alias_key, group_key, alias_text) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (alias_key(spelling), head, text),
            )
    for key, kind in number_suffixes.DEFAULTS:
        conn.execute(
            "INSERT INTO supply_number_suffixes (suffix_key, suffix_text, kind) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (key, key, kind)
        )
