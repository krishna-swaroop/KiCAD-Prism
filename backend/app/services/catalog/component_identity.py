"""Component identity: one normalization and one lookup for every caller.

A component is identified by ``(identity_kind, scope, part number)``: the
normalized manufacturer and manufacturer part number for an orderable part,
or the identity source and internal part number for a provisional one. The
``components`` row carries those normalized columns and the unique indexes in
``postgres_schema.py`` enforce them across active *and* retired components,
because a retired component keeps its identity.

The writer's uniqueness check, import acceptance and import preflight
(folder discovery) all ask :func:`find_identity_holder`, so a part that cannot
be created is never reported as new.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from app.services.catalog.metadata_normalization import (
    IDENTITY_KIND_MPN,
    IDENTITY_KIND_PROVISIONAL_IPN,
    normalize_identity_value,
)


@dataclass(frozen=True)
class ComponentIdentity:
    """A normalized identity key, comparable with the ``components`` columns."""

    kind: str
    manufacturer: str
    source: str
    part_number: str

    @classmethod
    def of(
        cls,
        *,
        manufacturer: str,
        mpn: str,
        identity_kind: str = IDENTITY_KIND_MPN,
        identity_source: str = "",
        source_internal_part_number: str = "",
    ) -> "ComponentIdentity":
        if identity_kind == IDENTITY_KIND_PROVISIONAL_IPN:
            return cls(
                kind=identity_kind,
                manufacturer="",
                source=identity_source,
                part_number=normalize_identity_value(source_internal_part_number),
            )
        return cls(
            kind=identity_kind,
            manufacturer=normalize_identity_value(manufacturer),
            source="",
            part_number=normalize_identity_value(mpn),
        )

    @classmethod
    def for_part(cls, manufacturer: Any, mpn: Any) -> "ComponentIdentity | None":
        """The orderable identity of a manufacturer part, or ``None`` when incomplete."""

        identity = cls.of(manufacturer=str(manufacturer or ""), mpn=str(mpn or ""))
        return identity if identity.manufacturer and identity.part_number else None

    @property
    def lock_scope(self) -> str:
        """The first half of the advisory-lock key for this identity."""

        return self.manufacturer if self.kind == IDENTITY_KIND_MPN else self.source


def find_identity_holder(
    conn: Any,
    identity: ComponentIdentity,
    *,
    exclude_component_id: str = "",
) -> dict[str, Any] | None:
    """The component, active or retired, that holds ``identity``."""

    row = conn.execute(
        """
        SELECT id, is_active, current_revision_id
        FROM components
        WHERE identity_kind = %s
          AND normalized_manufacturer = %s
          AND normalized_part_number = %s
          AND identity_source = %s
          AND id <> %s
        LIMIT 1
        """,
        (
            identity.kind,
            identity.manufacturer,
            identity.part_number,
            identity.source,
            exclude_component_id,
        ),
    ).fetchone()
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "is_active": bool(row["is_active"]),
        "current_revision_id": str(row["current_revision_id"] or ""),
    }


def match_part_identities(
    conn: Any,
    identities: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any] | None]:
    """Resolve ``{"manufacturer", "mpn"}`` requests, in order, to the component holding each.

    An incomplete request, or one no component holds, resolves to ``None``.
    """

    keys = [ComponentIdentity.for_part(item.get("manufacturer"), item.get("mpn")) for item in identities]
    wanted = sorted({(key.manufacturer, key.part_number) for key in keys if key is not None})
    found: dict[tuple[str, str], dict[str, Any]] = {}
    if wanted:
        rows = conn.execute(
            """
            SELECT component.id, component.is_active,
                   component.normalized_manufacturer, component.normalized_part_number,
                   revision.id AS revision_id, revision.version, revision.name,
                   revision.manufacturer, revision.mpn
            FROM components component
            JOIN component_revisions revision ON revision.id = component.current_revision_id
            WHERE component.identity_kind = %s
              AND (component.normalized_manufacturer, component.normalized_part_number)
                  IN (SELECT * FROM unnest(%s::text[], %s::text[]))
            """,
            (
                IDENTITY_KIND_MPN,
                [manufacturer for manufacturer, _ in wanted],
                [part_number for _, part_number in wanted],
            ),
        ).fetchall()
        for row in rows:
            found[(str(row["normalized_manufacturer"]), str(row["normalized_part_number"]))] = {
                "component_id": str(row["id"]),
                "revision_id": str(row["revision_id"]),
                "version": int(row["version"] or 0),
                "name": str(row["name"] or row["mpn"] or ""),
                "manufacturer": str(row["manufacturer"] or ""),
                "manufacturer_part_number": str(row["mpn"] or ""),
                "is_active": bool(row["is_active"]),
            }
    return [None if key is None else found.get((key.manufacturer, key.part_number)) for key in keys]


# Characters a compact part number leaves out: white space, underscores and the hyphen-like dashes
# (hyphen, non-breaking hyphen, figure dash, en dash, em dash, minus sign), by code point.
_COMPACT_IGNORED = "[[:space:]_" + "".join(map(chr, (0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212))) + "-]+"


def active_components_by_compact_number(conn: Any, numbers: Sequence[str]) -> list[dict[str, str]]:
    """Active manufacturer-part components whose part number, upper-cased without white space, underscores or dashes, is one of
    ``numbers`` (given in that form). Only identities, for callers that compare makers themselves."""

    wanted = sorted({str(item) for item in numbers if item})
    if not wanted:
        return []
    rows = conn.execute(
        """
        SELECT component.id, revision.manufacturer, revision.mpn
        FROM components component
        JOIN component_revisions revision ON revision.id = component.current_revision_id
        WHERE component.identity_kind = %s AND component.is_active = 1
          AND upper(regexp_replace(component.normalized_part_number, %s, '', 'g')) = ANY(%s)
        """,
        (IDENTITY_KIND_MPN, _COMPACT_IGNORED, wanted),
    ).fetchall()
    return [{"id": str(row["id"]), "manufacturer": str(row["manufacturer"] or ""), "mpn": str(row["mpn"] or "")} for row in rows]


__all__ = ["ComponentIdentity", "active_components_by_compact_number", "find_identity_holder", "match_part_identities"]
