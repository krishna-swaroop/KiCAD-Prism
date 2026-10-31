"""Where parts are used: the parts on each project's BOM.

Read from the projects' semantic indexes that already exist; nothing here builds one, so a
refresh is cheap and a project nobody has opened yet is simply absent. A project's rows are
replaced only when its source revision changed. The base design and each named design variant are stored; a part counts as
in use when either has it.

A usage row is a part number key and a manufacturer spelling key, so it can be matched to a
supply part later, however the part got into Prism. ``MATCHES_PART`` is that match as SQL.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Iterable, Mapping, Sequence

from app.services.supply.bom_fields import identity_of, is_fitted, lcsc_of, prism_id_of
from app.services.supply.identity import alias_key, match_key

MAX_REFERENCES_TEXT = 500

# Every stored line of every design: the base design (variant '') and the named variants.
ALL_USES = "supply_bom_usage"

# A usage row `u` is a use of the part `p` (manufacturer `m`) when the numbers match and the
# manufacturer is blank, is the part's own name, or is a spelling of it (confirmed, or one the part has been seen under).
# The manufacturer half of the match: blank, the part's own name, or a spelling of it (confirmed, or one the part was seen under).
MATCHES_MAKER = """(
        u.alias_key = '' OR u.alias_key = m.name_key OR EXISTS (
            SELECT 1 FROM supply_manufacturer_aliases a
            WHERE a.alias_key = u.alias_key AND a.manufacturer_id = p.manufacturer_id AND a.status = 'confirmed'
        ) OR EXISTS (
            SELECT 1 FROM supply_part_spellings ps WHERE ps.part_id = p.id AND ps.alias_key = u.alias_key
        )
    )"""
MATCHES_PART = """
    (u.match_key = p.match_key OR EXISTS (SELECT 1 FROM supply_part_numbers pn WHERE pn.part_id = p.id AND pn.match_key = u.match_key)) AND """ + MATCHES_MAKER + """
"""


# With the caller's role twice as parameters ([role, role]); None means every project, for internal callers.
VISIBLE = "(%s::text IS NULL OR %s = ANY(up.visible_roles))"
ALL_ROLES: tuple[str, ...] = ("admin", "designer", "qa")


def visible_project_ids(role: str | None) -> set[str] | None:
    """The projects ``role`` may see, by the workspace's folder rules (the same rule a project's own page applies). None, meaning every
    project, for internal callers that pass no role. Aggregate answers filter by this before they read a project's name or settings."""

    if role is None:
        return None
    from app.services.workspace_service import workspace

    return {str(row["id"]) for row in workspace.get_all_projects(role)}


def role_params(role: str | None) -> list[str | None]:
    return [role, role]


def part_projects_sql(only_parts: bool) -> str:
    """The (part_id, project_id) pairs of BOM uses a project the role may see has, as one set: the part's own number and the other
    numbers it is sold under are joined to the BOM lines by equality, so the number indexes serve it whatever the size. With
    ``only_parts`` the first two parameters are the part ids (twice); the role parameters follow."""

    limit = "WHERE p.id = ANY(%s)" if only_parts else ""
    limit_numbers = "WHERE pn.part_id = ANY(%s)" if only_parts else ""
    return f"""
        SELECT DISTINCT p.id AS part_id, u.project_id
        FROM (SELECT p.id AS part_id, p.match_key FROM supply_parts p {limit}
              UNION SELECT pn.part_id, pn.match_key FROM supply_part_numbers pn {limit_numbers}) k
        JOIN {ALL_USES} u ON u.match_key = k.match_key
        JOIN supply_parts p ON p.id = k.part_id JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN supply_bom_usage_projects up ON up.project_id = u.project_id
        WHERE {MATCHES_MAKER} AND {VISIBLE}
    """


def projects_of_parts(conn, part_ids: list[str], role: str | None) -> dict[str, set[str]]:
    """The projects (that ``role`` may see) whose BOM uses each part."""

    found: dict[str, set[str]] = {}
    if part_ids:
        for row in conn.execute(part_projects_sql(True), [part_ids, part_ids, *role_params(role)]).fetchall():
            found.setdefault(row["part_id"], set()).add(row["project_id"])
    return found


@dataclass(frozen=True, slots=True)
class UsageLine:
    key: str
    manufacturer: str
    mpn: str
    alias_key: str
    match_key: str
    quantity: int
    references: str
    lcsc: str = ""
    datasheet: str = ""
    prism_id: str = ""
    value: str = ""
    footprint: str = ""


Identities = Callable[[Iterable[str]], Mapping[str, tuple[str, str]]]

# Part of the stored revision key. Raise it when what is stored from an index changes (a new kind of row), so every project
# is read again once. With the index's own revision key it is the fingerprint of what the rows were made from.
USAGE_VERSION = 6
MAX_VARIANTS = 30


def variant_names(payload: Mapping[str, Any]) -> list[str]:
    """The design variants a semantic index lists, in its order."""

    assembly = payload.get("assembly") or {}
    names = [str(item.get("name") or "") for item in assembly.get("variants") or [] if isinstance(item, Mapping)]
    return [name for name in dict.fromkeys(names) if name][:MAX_VARIANTS]


def variant_components(payload: Mapping[str, Any], name: str) -> list[Mapping[str, Any]]:
    """The index's components as the named variant has them: its DNP and In BOM flags and its field overrides.

    The same projection the BOM table makes on screen. A name the index does not list gives the components as they are.
    """

    assembly = payload.get("assembly") or {}
    variant = next((item for item in assembly.get("variants") or [] if isinstance(item, Mapping) and item.get("name") == name), None)
    components = payload.get("components") or []
    if variant is None:
        return list(components)
    defaults = (assembly.get("default") or {}).get("components") or {}
    overrides = variant.get("components") or {}
    projected = []
    for component in components:
        uid = component.get("componentUid")
        base, over = defaults.get(uid) or {}, overrides.get(uid) or {}
        fields = {**(component.get("fields") or {}), **(over.get("fields") or {})}
        fields["DNP"] = "Yes" if over.get("dnp", base.get("dnp", False)) else "No"
        fields["In BOM"] = "No" if over.get("excludeFromBom", base.get("excludeFromBom", False)) else "Yes"
        projected.append({**component, "fields": fields})
    return projected


def lines_from_components(components: Iterable[Mapping[str, Any]], identities: Identities | None = None) -> list[UsageLine]:
    """The distinct parts among the fitted components, with how many go on one board.

    A fitted component with neither a part number nor an LCSC number is still a line, one per value and footprint, so a page that
    counts the BOM never counts it as checked.

    A symbol carrying a ``Prism ID`` that ``identities`` knows takes the library component's manufacturer
    and part number, whatever its own fields say (plan 6.4, step 1).
    """

    fitted = [component for component in components if is_fitted(component.get("fields") or {})]
    library: Mapping[str, tuple[str, str]] = {}
    if identities is not None:
        library = identities({prism_id_of(component.get("fields") or {}) for component in fitted} - {""})
    found: dict[str, dict[str, Any]] = {}
    for component in fitted:
        fields = component.get("fields") or {}
        placed = library.get(prism_id_of(fields))
        # A component without a part number yet says nothing; the symbol's own fields stay.
        manufacturer, mpn = placed if placed and placed[1].strip() else identity_of(fields)
        number = match_key(mpn)
        lcsc = lcsc_of(fields)
        # A symbol with only an LCSC number, or with no number at all, is kept as a line of its own: it has no part yet, and says so.
        if number:
            key = f"{alias_key(manufacturer)}|{number}"
        elif lcsc:
            key = f"lcsc:{lcsc}"
        else:
            key = f"none:{str(fields.get('Value') or '').strip()}|{str(fields.get('Footprint') or '').strip()}"
        line = found.setdefault(key, {
            "manufacturer": manufacturer, "mpn": mpn if number else "", "alias": alias_key(manufacturer), "number": number, "refs": [],
            "lcsc": "", "datasheet": "", "prism_id": "", "value": "", "footprint": "",
        })
        line["refs"].append(str(component.get("reference") or ""))
        line["lcsc"] = line["lcsc"] or lcsc
        line["datasheet"] = line["datasheet"] or _datasheet_of(fields)
        line["prism_id"] = line["prism_id"] or prism_id_of(fields)
        line["value"] = line["value"] or str(fields.get("Value") or "").strip()[:200]
        line["footprint"] = line["footprint"] or str(fields.get("Footprint") or "").strip()[:200]
    return [
        UsageLine(key, line["manufacturer"], line["mpn"], line["alias"], line["number"], len(line["refs"]),
                  " ".join(sorted(ref for ref in line["refs"] if ref))[:MAX_REFERENCES_TEXT], line["lcsc"], line["datasheet"][:500],
                  line["prism_id"][:100], line["value"], line["footprint"])
        for key, line in found.items()
    ]


def _datasheet_of(fields: Mapping[str, Any]) -> str:
    """The symbol's datasheet address; KiCad writes ``~`` for none."""

    value = str(fields.get("Datasheet") or "").strip()
    return "" if value in ("", "~") else value


def store_project(
    conn,
    project_id: str,
    project_name: str,
    revision_key: str,
    lines: list[UsageLine],
    now: datetime,
    visible_roles: Sequence[str] = ALL_ROLES,
    variant_lines: Mapping[str, list[UsageLine]] | None = None,
) -> bool:
    """Replace a project's rows. Returns False, doing nothing, when this revision is already stored.

    ``variant_lines`` are the lines of each named design variant; the base design's are ``lines``.
    """

    current = conn.execute("SELECT revision_key FROM supply_bom_usage_projects WHERE project_id = %s", (project_id,)).fetchone()
    if current and current["revision_key"] == revision_key:
        conn.execute(
            "UPDATE supply_bom_usage_projects SET project_name = %s, visible_roles = %s WHERE project_id = %s",
            (project_name, list(visible_roles), project_id),
        )
        return False
    conn.execute("DELETE FROM supply_bom_usage WHERE project_id = %s", (project_id,))
    conn.execute(
        """
        INSERT INTO supply_bom_usage_projects (project_id, project_name, revision_key, line_count, updated_at, visible_roles)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (project_id) DO UPDATE SET project_name = EXCLUDED.project_name, revision_key = EXCLUDED.revision_key,
            line_count = EXCLUDED.line_count, updated_at = EXCLUDED.updated_at, visible_roles = EXCLUDED.visible_roles
        """,
        (project_id, project_name, revision_key, len(lines), now, list(visible_roles)),
    )
    for variant, designed in (("", lines), *(variant_lines or {}).items()):
        for line in designed:
            conn.execute(
                "INSERT INTO supply_bom_usage (project_id, variant, line_key, manufacturer, mpn, alias_key, match_key, quantity, refs, lcsc, "
                "datasheet, prism_id, value, footprint) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (project_id, variant, line.key, line.manufacturer, line.mpn, line.alias_key, line.match_key, line.quantity,
                 line.references, line.lcsc, line.datasheet, line.prism_id, line.value, line.footprint),
            )
    return True


def refresh(
    conn,
    projects: Iterable[Any],
    existing_index: Callable[[Any], Mapping[str, Any] | None],
    now: datetime,
    visible_roles: Mapping[str, Sequence[str]] | None = None,
    identities: Identities | None = None,
) -> dict[str, int]:
    """Bring usage up to date with the semantic indexes that exist.

    ``projects`` have ``id`` and ``name``; ``existing_index`` returns a project's index or None.
    Projects that are gone from the registry lose their rows. ``visible_roles`` says, per project id,
    which supply roles may see it; a project not in it is visible to all.
    """

    seen: set[str] = set()
    updated = skipped = missing = 0
    for project in projects:
        seen.add(str(project.id))
        try:
            payload = existing_index(project)
        except Exception:  # an unreadable index is one project's problem, not the refresh's
            payload = None
        if not payload:
            missing += 1
            continue
        lines = lines_from_components(payload.get("components") or [], identities)
        named = {name: lines_from_components(variant_components(payload, name), identities) for name in variant_names(payload)}
        revision = f"{payload.get('sourceRevisionKey') or ''}|u{USAGE_VERSION}"
        roles = (visible_roles or {}).get(str(project.id), ALL_ROLES)
        if store_project(conn, str(project.id), str(project.name), revision, lines, now, roles, named):
            updated += 1
        else:
            skipped += 1
    gone = [row["project_id"] for row in conn.execute("SELECT project_id FROM supply_bom_usage_projects").fetchall() if row["project_id"] not in seen]
    for project_id in gone:
        conn.execute("DELETE FROM supply_bom_usage_projects WHERE project_id = %s", (project_id,))
    return {"updated": updated, "unchanged": skipped, "without_index": missing, "removed": len(gone)}


def refresh_one(
    conn,
    project: Any,
    existing_index: Callable[[Any], Mapping[str, Any] | None],
    now: datetime,
    visible_roles: Sequence[str] = ALL_ROLES,
    identities: Identities | None = None,
) -> str:
    """Read one project's usage from its semantic index, leaving every other project alone.

    Returns ``updated``, ``unchanged`` or ``without_index`` (nothing to read: the index has not been built).
    """

    try:
        payload = existing_index(project)
    except Exception:  # an unreadable index is this project's problem
        payload = None
    if not payload:
        return "without_index"
    lines = lines_from_components(payload.get("components") or [], identities)
    named = {name: lines_from_components(variant_components(payload, name), identities) for name in variant_names(payload)}
    revision = f"{payload.get('sourceRevisionKey') or ''}|u{USAGE_VERSION}"
    return "updated" if store_project(conn, str(project.id), str(project.name), revision, lines, now, visible_roles, named) else "unchanged"


def project_variants(conn, project_id: str) -> list[str]:
    """The design variants stored for a project."""

    return [
        row["variant"] for row in conn.execute(
            "SELECT DISTINCT variant FROM supply_bom_usage WHERE project_id = %s AND variant <> '' ORDER BY variant", (project_id,)
        ).fetchall()
    ]


def project_rows(conn, project_id: str, variant: str = "") -> list[dict[str, Any]]:
    """The stored BOM lines of a project (manufacturer, number, quantity per board); empty when it was never read.

    ``variant`` names a design variant; empty is the base design.
    """

    rows = conn.execute(
        "SELECT line_key, manufacturer, mpn, quantity, refs, lcsc, datasheet, prism_id, value, footprint FROM supply_bom_usage "
        "WHERE project_id = %s AND variant = %s ORDER BY line_key", (project_id, variant),
    ).fetchall()
    return [
        {"key": row["line_key"], "manufacturer": row["manufacturer"], "mpn": row["mpn"], "quantity": int(row["quantity"]),
         "references": row["refs"], "lcsc": row["lcsc"], "datasheet": row["datasheet"], "prism_id": row["prism_id"],
         "value": row["value"], "footprint": row["footprint"]}
        for row in rows
    ]


def used_in(conn, part_id: str, role: str | None = None) -> list[dict[str, Any]]:
    """The projects whose BOM carries this part and that ``role`` may see, most parts first.

    The base design's count is the one shown. A project that only a design variant fits the part in shows that variant's
    count and names the variants (``only_in_variants``).
    """

    rows = conn.execute(
        f"""
        SELECT u.project_id, up.project_name, u.variant, SUM(u.quantity) AS quantity, LEFT(string_agg(u.refs, ' '), 500) AS refs
        FROM supply_parts p
        JOIN supply_manufacturers m ON m.id = p.manufacturer_id
        JOIN {ALL_USES} u ON {MATCHES_PART}
        JOIN supply_bom_usage_projects up ON up.project_id = u.project_id
        WHERE p.id = %s AND {VISIBLE}
        GROUP BY u.project_id, up.project_name, u.variant
        """,
        [part_id, *role_params(role)],
    ).fetchall()
    by_project: dict[str, dict[str, Any]] = {}
    for row in rows:
        entry = by_project.setdefault(row["project_id"], {"name": row["project_name"], "base": None, "variants": {}})
        if row["variant"] == "":
            entry["base"] = row
        else:
            entry["variants"][row["variant"]] = row
    found = []
    for project_id, entry in by_project.items():
        shown = entry["base"] or max(entry["variants"].values(), key=lambda item: int(item["quantity"]))
        found.append({
            "project_id": project_id, "project_name": entry["name"], "quantity": int(shown["quantity"]), "references": shown["refs"],
            "only_in_variants": [] if entry["base"] else sorted(entry["variants"]),
        })
    return sorted(found, key=lambda item: (-item["quantity"], item["project_name"].lower()))
