"""Which listings count for a part, in one place, so every reader of stock, price and history agrees.

* A listing counts when its match is ``exact`` or a person's (``manual``): ``STATES`` in Python, ``supply_counted(match_state)``
  in SQL (a database function made from ``STATES``, inlined by the planner, so indexes on ``match_state`` still serve).
* Its figures count toward stock when its connector is enabled and it is read: where a pick limits what a provider reads, the
  listings not picked are not read, so their figures are old (``listing_sql``).
* A part's price at a distributor with a pick is the picked listing's (``priced_sql``).

Marketplace stock is left out by the readers (it is a column of the reading, not of the listing).
"""

from __future__ import annotations

STATES = ("exact", "manual")

# The database's copy of ``STATES``, made by the supply schema. Simple enough for Postgres to inline into the calling query.
FUNCTION = (
    "CREATE OR REPLACE FUNCTION supply_counted(state TEXT) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT state IN ("
    + ", ".join(f"'{state}'" for state in STATES)
    + ") $$"
)


def state_sql(listing: str = "l") -> str:
    """SQL for "this listing's match counts"."""

    return f"supply_counted({listing}.match_state)"


def read_sql(listing: str = "l", connector: str = "c") -> str:
    """SQL for "this listing is read": every listing, except where a pick limits what is read (the others are not read, so their
    figures are old) and the part has a pick elsewhere at that connector."""

    from app.services.supply import budget

    limited = ", ".join(f"'{key}'" for key in budget.providers_limited_by_picks() if key.replace("_", "").isalnum())
    return (
        f"({connector}.provider <> ALL(ARRAY[{limited}]::text[]) OR NOT EXISTS (SELECT 1 FROM supply_packaging_picks pk "
        f"WHERE pk.part_id = {listing}.part_id AND pk.connector_id = {listing}.connector_id AND pk.listing_id <> {listing}.id))"
    )


def listing_sql(listing: str = "l", connector: str = "c") -> str:
    """SQL for "this listing's figures count toward the part": a counted match, at an enabled connector, and read. ``connector``
    must be joined."""

    return f"({state_sql(listing)} AND {connector}.enabled AND {read_sql(listing, connector)})"


def priced_sql(listing: str = "l") -> str:
    """SQL for "this listing prices the part at its distributor": no other listing of the part there is picked."""

    return (
        f"NOT EXISTS (SELECT 1 FROM supply_packaging_picks pk WHERE pk.part_id = {listing}.part_id "
        f"AND pk.connector_id = {listing}.connector_id AND pk.listing_id <> {listing}.id)"
    )
