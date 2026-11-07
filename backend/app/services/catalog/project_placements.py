"""Which catalog revision a project commit placed, and whether a newer one exists.

A scan (``project_catalog_usage_service``) reads every symbol instance of one
commit (``placement_stamp.placed_symbols``); this collaborator resolves them
to catalog components and revisions, records one row per distinct
``(component, revision, basis)`` with its references, and reports each row
against the catalog as it is now. It takes ``conn`` and never commits.

Resolution of one symbol:

1. **Stamp.** ``Prism_Component``/``Prism_Revision`` as placed (basis
   ``stamp``), recorded as found even if this catalog does not know them.
2. **Inference** for an unstamped symbol (placed before #695, or stamped
   fields removed in KiCad). The component is the one whose released symbol
   asset the ``lib_id`` names as remote placement writes it
   (``remote_<library>:<name>``), else the one holding the instance's
   manufacturer part number. Its revision is the oldest ever-released revision
   whose symbol fields all equal the instance's (``inferred_metadata``), or
   unknown (``identity``, revision ``''``). Inference is recorded in Prism
   only; nothing is written back into the project.
3. Anything else is untracked and only counted.
"""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Any, Iterable

from app.services import kicad_library_reader
from app.services.catalog.component_identity import ComponentIdentity, find_identity_holder
from app.services.catalog.metadata_descriptors import BUILTIN_METADATA_DESCRIPTORS, read_builtin_metadata_value
from app.services.catalog.normalization import json_loads, utc_now_iso
from app.services.catalog.placement_payloads import remote_library_nickname
from app.services.catalog.placement_stamp import PlacedSymbol, is_power_or_virtual

BASIS_STAMP = "stamp"
BASIS_INFERRED = "inferred_metadata"
BASIS_IDENTITY = "identity"

STATUS_CURRENT = "current"
STATUS_UPDATE = "update_available"
STATUS_RETIRED = "retired"
STATUS_UNRELEASED = "unreleased"
STATUS_UNKNOWN_COMPONENT = "unknown_component"
STATUS_UNKNOWN_REVISION = "unknown_revision"
STATUSES = (
    STATUS_UPDATE, STATUS_RETIRED, STATUS_UNRELEASED,
    STATUS_UNKNOWN_REVISION, STATUS_UNKNOWN_COMPONENT, STATUS_CURRENT,
)

_SYMBOL_DESCRIPTORS = tuple(descriptor for descriptor in BUILTIN_METADATA_DESCRIPTORS if descriptor.symbol_label)


def _norm(value: Any) -> str:
    return " ".join(str(value or "").split()).casefold()


class CatalogProjectPlacements:
    """Stateless: resolve, record and report the placements of one project commit."""

    # -- resolution ---------------------------------------------------------

    @staticmethod
    def _released_symbol_names(conn: Any) -> dict[tuple[str, str], set[str]]:
        """``(remote nickname, symbol name)`` of every ever-released symbol asset -> component ids."""
        rows = conn.execute(
            """
            SELECT DISTINCT revision.component_id, asset.target_library, asset.target_name
            FROM component_release_records record
            JOIN component_revisions revision ON revision.id = record.revision_id
            JOIN revision_assets link ON link.revision_id = revision.id
            JOIN assets asset ON asset.id = link.asset_id
            WHERE asset.asset_type = 'symbol'
            """
        ).fetchall()
        names: dict[tuple[str, str], set[str]] = defaultdict(set)
        for row in rows:
            key = (remote_library_nickname(str(row["target_library"])), str(row["target_name"]))
            names[key].add(str(row["component_id"]))
        return names

    @staticmethod
    def _released_revisions(conn: Any, component_ids: Iterable[str]) -> dict[str, list[dict[str, Any]]]:
        """Every ever-released revision of each component, oldest first."""
        rows = conn.execute(
            """
            SELECT DISTINCT revision.*
            FROM component_revisions revision
            JOIN component_release_records record ON record.revision_id = revision.id
            WHERE revision.component_id = ANY(%s::text[])
            ORDER BY revision.component_id, revision.version
            """,
            (sorted(set(component_ids)),),
        ).fetchall()
        revisions: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            revisions[str(row["component_id"])].append(dict(row))
        return revisions

    @staticmethod
    def _fields_match(symbol: PlacedSymbol, revision: dict[str, Any]) -> bool:
        """Whether every symbol field the revision would place equals the instance's."""
        compared = 0
        for descriptor in _SYMBOL_DESCRIPTORS:
            expected = read_builtin_metadata_value(revision, descriptor)
            actual = kicad_library_reader.property_value(symbol.properties, str(descriptor.symbol_label))
            if not expected and not actual:
                continue
            if _norm(expected) != _norm(actual):
                return False
            compared += 1
        for key, value in dict(json_loads(revision.get("extra_fields"), {}) or {}).items():
            actual = kicad_library_reader.property_value(symbol.properties, str(key))
            if (value or actual) and _norm(value) != _norm(actual):
                return False
        return compared > 0

    @staticmethod
    def _identify(conn: Any, symbol: PlacedSymbol, names: dict[tuple[str, str], set[str]]) -> str:
        holders = names.get((symbol.library_nickname, symbol.symbol_name), set())
        if len(holders) == 1:
            return next(iter(holders))
        identity = ComponentIdentity.for_part(
            kicad_library_reader.property_value(symbol.properties, "Manufacturer"),
            kicad_library_reader.property_value(
                symbol.properties, "Manufacturer Part Number", "MPN", "Manufacturer_Part_Number"
            ),
        )
        holder = find_identity_holder(conn, identity) if identity else None
        if holder and (not holders or holder["id"] in holders):
            return str(holder["id"])
        return ""

    @staticmethod
    def resolve(conn: Any, symbols: Iterable[PlacedSymbol]) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Rows ``{component_id, catalog_revision_id, basis, references}`` and the scan counts."""
        parts = [symbol for symbol in symbols if not is_power_or_virtual(symbol)]
        grouped: dict[tuple[str, str, str], list[str]] = defaultdict(list)
        counts = {"symbol_count": len(parts), "stamped_count": 0, "inferred_count": 0, "untracked_count": 0}
        unstamped: list[tuple[PlacedSymbol, str]] = []
        names: dict[tuple[str, str], set[str]] | None = None
        for symbol in parts:
            if symbol.stamp is not None:
                counts["stamped_count"] += 1
                key = (symbol.stamp.component_id, symbol.stamp.revision_id, BASIS_STAMP)
                grouped[key].extend(symbol.references)
                continue
            if names is None:
                names = CatalogProjectPlacements._released_symbol_names(conn)
            component_id = CatalogProjectPlacements._identify(conn, symbol, names)
            if component_id:
                unstamped.append((symbol, component_id))
            else:
                counts["untracked_count"] += 1
        revisions = CatalogProjectPlacements._released_revisions(conn, [cid for _symbol, cid in unstamped])
        for symbol, component_id in unstamped:
            match = next(
                (rev for rev in revisions.get(component_id, []) if CatalogProjectPlacements._fields_match(symbol, rev)),
                None,
            )
            counts["inferred_count"] += 1
            key = (component_id, str(match["id"]), BASIS_INFERRED) if match else (component_id, "", BASIS_IDENTITY)
            grouped[key].extend(symbol.references)
        rows = [
            {
                "component_id": component_id,
                "catalog_revision_id": revision_id,
                "basis": basis,
                "references": sorted(set(references)),
            }
            for (component_id, revision_id, basis), references in sorted(grouped.items())
        ]
        return rows, counts

    # -- persistence --------------------------------------------------------

    @staticmethod
    def record_scan(
        conn: Any, project_id: str, commit: str, rows: list[dict[str, Any]], counts: dict[str, int],
        *, status: str = "ready", error: str = "",
    ) -> None:
        """Replace the commit's rows and scan record; running it again with the same input changes nothing."""
        conn.execute(
            "DELETE FROM project_catalog_placements WHERE project_id = %s AND source_revision = %s",
            (project_id, commit),
        )
        for row in rows:
            conn.execute(
                """
                INSERT INTO project_catalog_placements
                    (project_id, source_revision, component_id, catalog_revision_id, basis, references_json)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (project_id, commit, row["component_id"], row["catalog_revision_id"], row["basis"],
                 json.dumps(row["references"])),
            )
        conn.execute(
            """
            INSERT INTO project_catalog_scans
                (project_id, source_revision, status, symbol_count, stamped_count, inferred_count,
                 untracked_count, error, scanned_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (project_id, source_revision) DO UPDATE SET
                status = EXCLUDED.status, symbol_count = EXCLUDED.symbol_count,
                stamped_count = EXCLUDED.stamped_count, inferred_count = EXCLUDED.inferred_count,
                untracked_count = EXCLUDED.untracked_count, error = EXCLUDED.error,
                scanned_at = EXCLUDED.scanned_at
            """,
            (project_id, commit, status, counts.get("symbol_count", 0), counts.get("stamped_count", 0),
             counts.get("inferred_count", 0), counts.get("untracked_count", 0), error, utc_now_iso()),
        )

    @staticmethod
    def scan_row(conn: Any, project_id: str, commit: str = "") -> dict[str, Any] | None:
        """The commit's scan record, or the newest scan of the project when ``commit`` is ``''``."""
        row = conn.execute(
            """
            SELECT * FROM project_catalog_scans
            WHERE project_id = %s AND (%s = '' OR source_revision = %s)
            ORDER BY scanned_at DESC LIMIT 1
            """,
            (project_id, commit, commit),
        ).fetchone()
        return dict(row) if row else None

    # -- report -------------------------------------------------------------

    @staticmethod
    def report(conn: Any, project_id: str, commit: str) -> dict[str, Any]:
        """Each recorded placement of the commit against the catalog now, with a status."""
        scan = CatalogProjectPlacements.scan_row(conn, project_id, commit)
        rows = conn.execute(
            """
            SELECT placement.*, component.is_active, component.released_revision_id,
                   (component.id IS NOT NULL) AS component_known,
                   EXISTS (
                       SELECT 1 FROM component_release_records ever
                       WHERE ever.component_id = component.id
                   ) AS ever_released,
                   recorded.id AS recorded_id, recorded.version AS recorded_version,
                   latest.version AS latest_version,
                   head.name, head.manufacturer, head.mpn
            FROM project_catalog_placements placement
            LEFT JOIN components component ON component.id = placement.component_id
            LEFT JOIN component_revisions recorded
              ON recorded.id = placement.catalog_revision_id AND recorded.component_id = placement.component_id
            LEFT JOIN component_revisions latest ON latest.id = component.released_revision_id
            LEFT JOIN component_revisions head ON head.id = COALESCE(
                NULLIF(component.released_revision_id, ''), component.current_revision_id
            )
            WHERE placement.project_id = %s AND placement.source_revision = %s
            ORDER BY head.name NULLS LAST, placement.component_id, placement.catalog_revision_id
            """,
            (project_id, commit),
        ).fetchall()
        revisions_per_component: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            revisions_per_component[str(row["component_id"])].add(str(row["catalog_revision_id"]))
        items = []
        for row in rows:
            items.append({
                "componentId": str(row["component_id"]),
                "revisionId": str(row["catalog_revision_id"]),
                "basis": str(row["basis"]),
                "status": CatalogProjectPlacements._status(row),
                "references": json_loads(row["references_json"], []),
                "recordedVersion": row["recorded_version"],
                "latestRevisionId": str(row["released_revision_id"] or ""),
                "latestVersion": row["latest_version"],
                "mixedRevisions": len(revisions_per_component[str(row["component_id"])]) > 1,
                "name": str(row["name"] or ""),
                "manufacturer": str(row["manufacturer"] or ""),
                "mpn": str(row["mpn"] or ""),
            })
        summary = {status: 0 for status in STATUSES}
        for item in items:
            summary[item["status"]] += 1
        return {
            "commit": commit,
            "scan": None if scan is None else {
                "status": scan["status"],
                "scannedAt": scan["scanned_at"],
                "symbolCount": scan["symbol_count"],
                "stampedCount": scan["stamped_count"],
                "inferredCount": scan["inferred_count"],
                "untrackedCount": scan["untracked_count"],
                "error": scan["error"],
            },
            "summary": summary,
            "items": items,
        }

    @staticmethod
    def _status(row: Any) -> str:
        if not row["component_known"]:
            return STATUS_UNKNOWN_COMPONENT
        if not row["is_active"]:
            return STATUS_RETIRED
        if not row["released_revision_id"]:
            # A cleared release id means a released revision was archived, unless
            # the component never released, in which case it is still a draft.
            return STATUS_RETIRED if row["ever_released"] else STATUS_UNRELEASED
        if not row["recorded_id"]:
            return STATUS_UNKNOWN_REVISION
        if str(row["recorded_id"]) == str(row["released_revision_id"]):
            return STATUS_CURRENT
        if row["latest_version"] is not None and int(row["latest_version"]) > int(row["recorded_version"]):
            return STATUS_UPDATE
        return STATUS_CURRENT


__all__ = [
    "BASIS_IDENTITY",
    "BASIS_INFERRED",
    "BASIS_STAMP",
    "STATUSES",
    "CatalogProjectPlacements",
]
