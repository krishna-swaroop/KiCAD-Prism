"""Which manufacturer parts a catalog component may be built with (the catalog's ``component_parts`` table).

A component's **main** part is its current revision's manufacturer and MPN; ``sync_main`` keeps the row in step when
the revision changes. **Alternates** are proposed by a designer and decided by QA. Until approved, an alternate is shown
but never counted. Approved alternates count wherever the main part does (``counted_parts``).

Supply facts (offers, stock, health) hang off ``supply_parts``; this table says which of those parts belong to which
component. The rows live outside component revisions, as stock does: revisions are hashed, and this list changes.

Only library parts are followed (decision D12): a part is in the library when it is a component's main part or an
approved alternate. Watches, project tracking, change notices and polling ask ``library_part`` / ``in_library``; a
number with no library component can still be looked up once (``oneoff.py``), and those results expire. A schema
without the catalog (the supply-only test schemas) has no library to require, so there every part counts.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import psycopg

from app.services.supply import clock, parts
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.identity import _DASH_CODES, alias_key, match_key
from app.services.supply.errors import Clash, Refused

SYSTEM = "system"
MAIN, ALTERNATE = "main", "alternate"
PENDING, APPROVED, REJECTED = "pending", "approved", "rejected"


class ComponentPartError(Refused):
    """The request is not valid. The message is safe to show."""

    code = "component_part_error"


class NotInLibrary(ComponentPartError):
    """The part has no library component, so it cannot be followed."""

    code = "not_in_library"

    def __init__(self, mpn: str) -> None:
        super().__init__(f"{mpn.strip()} is not in the Component Database. Add it there to follow it.")


# match_key in SQL, to find the components that may name a number before syncing their main parts.
_SQL_MATCH_KEY = "upper(regexp_replace(normalize(r.mpn, NFKC), '[[:space:]_\\-" + "".join(map(chr, _DASH_CODES)) + "]+', '', 'g'))"


def library_present(conn) -> bool:
    """Whether this schema holds the catalog (supply-only test schemas do not)."""

    row = conn.execute("SELECT to_regclass('component_parts') IS NOT NULL AS present").fetchone()
    return bool(row and row["present"])


def parts_of(conn, component_id: str) -> list[dict[str, Any]]:
    """The component's main part first, then its alternates (approved, pending, rejected), oldest first."""

    rows = conn.execute(
        """
        SELECT cp.part_id, cp.role, cp.approval, cp.created_by, cp.created_at, cp.decided_by, cp.decided_at,
               p.mpn, m.name AS manufacturer
        FROM component_parts cp
        JOIN supply_parts p ON p.id = cp.part_id
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        WHERE cp.component_id = %s
        ORDER BY cp.role = 'main' DESC, array_position(ARRAY['approved', 'pending', 'rejected'], cp.approval), cp.created_at
        """,
        (component_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def counted_parts(conn, component_ids: Iterable[str]) -> dict[str, list[str]]:
    """Part ids that count for each component: its main part and its approved alternates, main first."""

    wanted = sorted({str(item) for item in component_ids if item})
    if not wanted:
        return {}
    rows = conn.execute(
        """
        SELECT component_id, part_id FROM component_parts
        WHERE component_id = ANY(%s) AND approval = 'approved'
        ORDER BY component_id, role = 'main' DESC, created_at
        """,
        (wanted,),
    ).fetchall()
    found: dict[str, list[str]] = {}
    for row in rows:
        found.setdefault(row["component_id"], []).append(row["part_id"])
    return found


def alternates_for(conn, leads: Mapping[str, Iterable[str]]) -> dict[str, list[str]]:
    """The approved alternates each BOM part may be built with, keyed by the part a line resolved to.

    ``leads`` maps that part to the components its lines name by Prism ID. A part no line places is taken as the
    component whose main part it is, when exactly one component has it as main. Empty in a schema without the catalog.
    """

    if not leads or not library_present(conn):
        return {}
    named = {part_id: {str(item) for item in components if item} for part_id, components in leads.items()}
    loose = sorted(part_id for part_id, components in named.items() if not components)
    if loose:
        owners: dict[str, list[str]] = {}
        for row in conn.execute(
            "SELECT part_id, component_id FROM component_parts WHERE role = 'main' AND part_id = ANY(%s)", (loose,)
        ).fetchall():
            owners.setdefault(row["part_id"], []).append(row["component_id"])
        for part_id, components in owners.items():
            if len(components) == 1:
                named[part_id] = set(components)
    counted = counted_parts(conn, {component for components in named.values() for component in components})
    found: dict[str, list[str]] = {}
    for part_id, components in named.items():
        # Lines naming different components can land on one part (bought once for all of them): only an alternate every one of
        # those components approved may stand in, so one component's approval never widens to another.
        lists = [[other for other in counted.get(component, []) if other != part_id] for component in sorted(components)]
        others = [other for other in dict.fromkeys(lists[0]) if all(other in rest for rest in lists[1:])] if lists else []
        if others:
            found[part_id] = others
    return found


def components_of(conn, part_ids: Iterable[str]) -> dict[str, list[str]]:
    """The components each part counts for (as main or approved alternate)."""

    wanted = sorted({str(item) for item in part_ids if item})
    if not wanted:
        return {}
    rows = conn.execute(
        "SELECT part_id, component_id FROM component_parts WHERE part_id = ANY(%s) AND approval = 'approved' ORDER BY part_id, component_id",
        (wanted,),
    ).fetchall()
    found: dict[str, list[str]] = {}
    for row in rows:
        found.setdefault(row["part_id"], []).append(row["component_id"])
    return found


def _set_main(conn, component_id: str, part_id: str | None) -> bool:
    """Make ``part_id`` the component's main part (or remove the main part). True when something changed."""

    current = conn.execute(
        "SELECT part_id FROM component_parts WHERE component_id = %s AND role = 'main'", (component_id,)
    ).fetchone()
    if current and current["part_id"] == part_id:
        return False
    if current:
        conn.execute("DELETE FROM component_parts WHERE component_id = %s AND role = 'main'", (component_id,))
        # Alternates were approved against the old main part: QA looks at them again against the new one.
        reopened = conn.execute(
            "UPDATE component_parts SET approval = 'pending', decided_by = '', decided_at = NULL "
            "WHERE component_id = %s AND role = 'alternate' AND approval = 'approved' AND part_id IS DISTINCT FROM %s",
            (component_id, part_id),
        ).rowcount
        if reopened:
            write_audit(conn, SYSTEM, "component.alternates_reopened", component_id,
                        {"from": current["part_id"], "to": part_id, "alternates": int(reopened)}, subject_kind="component")
    if part_id is None:
        return current is not None
    # A part that was an alternate becomes the main part: the revision now names it.
    conn.execute(
        """
        INSERT INTO component_parts (component_id, part_id, role, approval, created_by, decided_by, decided_at)
        VALUES (%s, %s, 'main', 'approved', %s, %s, %s)
        ON CONFLICT (component_id, part_id) DO UPDATE
            SET role = 'main', approval = 'approved', decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at
        """,
        (component_id, part_id, SYSTEM, SYSTEM, clock.now()),
    )
    return True


def sync_main(conn, component_ids: Iterable[str] | None = None, *, actor: str = SYSTEM) -> dict[str, int]:
    """Keep every active component's main part equal to its current revision's manufacturer and MPN.

    ``component_ids`` limits the work to those components; ``None`` syncs all of them. A number several makers share,
    with no maker to tell them apart, is left for a person (counted as ``ambiguous``).
    """

    counts = {"changed": 0, "ambiguous": 0}
    if not library_present(conn):
        return counts
    wanted = None if component_ids is None else sorted({str(item) for item in component_ids if item})
    rows = conn.execute(
        """
        SELECT c.id, r.manufacturer, r.mpn
        FROM components c JOIN component_revisions r ON r.id = c.current_revision_id
        WHERE c.is_active = 1 AND (%s::text[] IS NULL OR c.id = ANY(%s::text[]))
        ORDER BY c.id
        """,
        (wanted, wanted),
    ).fetchall()
    for row in rows:
        part_id = None
        if match_key(row["mpn"]):
            try:
                with conn.transaction():
                    part_id = parts.ensure_part(conn, row["manufacturer"], row["mpn"], actor).id
            except parts.UnknownManufacturer:
                counts["ambiguous"] += 1
                continue
        counts["changed"] += int(_set_main(conn, row["id"], part_id))
    return counts


def propose_alternate(conn, component_id: str, manufacturer: str, mpn: str, actor: str) -> dict[str, Any]:
    """Propose a manufacturer part as an alternate. It counts once QA approves it."""

    actor = actor_text(actor)
    if not match_key(mpn):
        raise ComponentPartError("An alternate needs a part number.")
    try:
        with conn.transaction():
            part = parts.ensure_part(conn, manufacturer, mpn, actor, may_create=False)
    except parts.UnknownManufacturer as exc:
        raise ComponentPartError(str(exc)) from exc
    existing = conn.execute(
        "SELECT role, approval FROM component_parts WHERE component_id = %s AND part_id = %s", (component_id, part.id)
    ).fetchone()
    if existing and existing["role"] == MAIN:
        raise ComponentPartError("That is the component's main part.")
    if existing and existing["approval"] != REJECTED:
        raise ComponentPartError("That part is already an alternate of this component.")
    try:
        with conn.transaction():
            conn.execute(
                """
                INSERT INTO component_parts (component_id, part_id, role, approval, created_by, created_at)
                VALUES (%s, %s, 'alternate', 'pending', %s, %s)
                ON CONFLICT (component_id, part_id) DO UPDATE
                    SET approval = 'pending', created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, decided_by = '', decided_at = NULL
                """,
                (component_id, part.id, actor, clock.now()),
            )
    except psycopg.errors.ForeignKeyViolation as exc:
        raise ComponentPartError("There is no such component.") from exc
    write_audit(conn, actor, "component_part.propose", component_id, {"part_id": part.id, "mpn": part.mpn}, subject_kind="component")
    return {"part_id": part.id, "manufacturer": part.manufacturer_name, "mpn": part.mpn, "approval": PENDING}


def decide(conn, component_id: str, part_id: str, approve: bool, actor: str, *, main_part_id: str | None = None) -> dict[str, Any]:
    """Approve or reject an alternate. A decision can be changed later; the main part is not decided here.

    ``main_part_id`` is the main part the decider was shown ("" for none): an alternate is judged against the main part, so
    a decision taken on a screen from before the main part changed is refused. None skips the check."""

    actor = actor_text(actor)
    if main_part_id is not None:
        current = conn.execute(
            "SELECT part_id FROM component_parts WHERE component_id = %s AND role = 'main' FOR UPDATE", (component_id,)
        ).fetchone()
        if (current["part_id"] if current else "") != main_part_id:
            raise Clash("The component's main part changed since this was shown. Look at the alternate again.")
    approval = APPROVED if approve else REJECTED
    row = conn.execute(
        """
        UPDATE component_parts SET approval = %s, decided_by = %s, decided_at = %s
        WHERE component_id = %s AND part_id = %s AND role = 'alternate'
        RETURNING part_id
        """,
        (approval, actor, clock.now(), component_id, part_id),
    ).fetchone()
    if row is None:
        raise ComponentPartError("That part is not an alternate of this component.")
    write_audit(conn, actor, f"component_part.{approval}", component_id, {"part_id": part_id}, subject_kind="component")
    return {"part_id": part_id, "approval": approval}


def remove_alternate(conn, component_id: str, part_id: str, actor: str) -> None:
    actor = actor_text(actor)
    row = conn.execute(
        "DELETE FROM component_parts WHERE component_id = %s AND part_id = %s AND role = 'alternate' RETURNING part_id",
        (component_id, part_id),
    ).fetchone()
    if row is None:
        raise ComponentPartError("That part is not an alternate of this component.")
    write_audit(conn, actor, "component_part.remove", component_id, {"part_id": part_id}, subject_kind="component")


def in_library(conn, part_ids: Iterable[str]) -> set[str]:
    """The parts among these that are in the library (every one of them in a schema without the catalog)."""

    wanted = sorted({str(item) for item in part_ids if item})
    if not wanted or not library_present(conn):
        return set(wanted)
    rows = conn.execute(
        "SELECT DISTINCT part_id FROM component_parts WHERE part_id = ANY(%s) AND approval = 'approved'", (wanted,)
    ).fetchall()
    return {row["part_id"] for row in rows}


def library_part(conn, manufacturer: str, mpn: str, actor: str, *, may_create: bool = True) -> parts.PartRecord:
    """The library part for a manufacturer and part number, or ``NotInLibrary``.

    The components whose current revision names the number have their main part synced first, so a component added
    since the last hourly sync counts at once. One library part with the number is that part whatever the maker is
    spelled as; several, and the maker must tell them apart (``parts.AmbiguousNumber``).
    """

    if not library_present(conn):
        return parts.ensure_part(conn, manufacturer, mpn, actor, may_create=may_create)
    key = match_key(mpn)
    if not key:
        raise NotInLibrary(mpn)
    named = conn.execute(
        f"""
        SELECT c.id, r.mpn FROM components c JOIN component_revisions r ON r.id = c.current_revision_id
        WHERE c.is_active = 1 AND {_SQL_MATCH_KEY} = %s
        """,
        (key,),
    ).fetchall()
    ids = [row["id"] for row in named if match_key(row["mpn"]) == key]
    if ids:
        sync_main(conn, ids)
    rows = conn.execute(
        """
        SELECT DISTINCT p.id FROM supply_parts p JOIN component_parts cp ON cp.part_id = p.id
        WHERE p.match_key = %s AND cp.approval = 'approved' ORDER BY p.id
        """,
        (key,),
    ).fetchall()
    library = [row["id"] for row in rows]
    if not library:
        raise NotInLibrary(mpn)
    found = parts.find_part(conn, manufacturer, mpn)
    if found and found.id in library:
        return found
    if len(library) == 1:
        if alias_key(manufacturer):
            parts.record_spelling(conn, library[0], manufacturer.strip(), "bom")
        return parts.get_part(conn, library[0])
    raise parts.AmbiguousNumber(f"Several makers have the part number {mpn.strip()}. Name the maker to tell them apart.")


def components_holding(conn, part_ids: Iterable[str]) -> dict[str, list[dict[str, Any]]]:
    """For each part, the active components it counts for (main part or approved alternate), with name, maker, number and
    workflow stage from the current revision."""

    wanted = sorted({str(item) for item in part_ids if item})
    if not wanted or not library_present(conn):
        return {}
    rows = conn.execute(
        """
        SELECT cp.part_id, cp.role, c.id, r.name, r.manufacturer, r.mpn, r.release_status
        FROM component_parts cp JOIN components c ON c.id = cp.component_id JOIN component_revisions r ON r.id = c.current_revision_id
        WHERE cp.part_id = ANY(%s) AND cp.approval = 'approved' AND c.is_active = 1
        ORDER BY cp.part_id, cp.role = 'main' DESC, lower(r.name)
        """,
        (wanted,),
    ).fetchall()
    found: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        found.setdefault(row["part_id"], []).append({
            "id": row["id"], "name": row["name"], "manufacturer": row["manufacturer"], "mpn": row["mpn"], "workflow_stage": row["release_status"],
            "role": row["role"],
        })
    return found
