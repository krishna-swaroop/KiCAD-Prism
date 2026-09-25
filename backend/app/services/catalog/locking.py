"""Transaction-scoped locking operations for the catalog domain."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class CatalogLockOperations(Protocol):
    """Structural interface for the catalog's five serialization points."""

    def lock_revision_clone(self, conn: Any, component_id: str) -> None:
        """Serialize revision version allocation and cloning for a component."""

    def lock_audit_append(self, conn: Any, component_id: str) -> None:
        """Serialize audit sequence and hash allocation for a component."""

    def lock_slug_allocation(self, conn: Any, base: str) -> None:
        """Serialize lookup and allocation of a component slug."""

    def lock_component_identity(self, conn: Any, manufacturer: str, mpn: str) -> None:
        """Serialize lookup and creation of a component identity."""

    def lock_component_for_mutation(self, conn: Any, component_id: str) -> None:
        """Serialize mutation of a component row."""


class NoopCatalogLocks:
    """Lock implementation used by the base domain service."""

    def lock_revision_clone(self, conn: Any, component_id: str) -> None:
        _ = (conn, component_id)

    def lock_audit_append(self, conn: Any, component_id: str) -> None:
        _ = (conn, component_id)

    def lock_slug_allocation(self, conn: Any, base: str) -> None:
        _ = (conn, base)

    def lock_component_identity(self, conn: Any, manufacturer: str, mpn: str) -> None:
        _ = (conn, manufacturer, mpn)

    def lock_component_for_mutation(self, conn: Any, component_id: str) -> None:
        _ = (conn, component_id)


class PostgresCatalogLocks:
    """PostgreSQL transaction-scoped locks used by the catalog service."""

    def lock_revision_clone(self, conn: Any, component_id: str) -> None:
        conn.execute(
            "SELECT id FROM components WHERE id = %s FOR UPDATE",
            (component_id,),
        ).fetchone()

    def lock_audit_append(self, conn: Any, component_id: str) -> None:
        conn.execute(
            "SELECT id FROM components WHERE id = %s FOR UPDATE",
            (component_id,),
        ).fetchone()

    def lock_slug_allocation(self, conn: Any, base: str) -> None:
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            (f"catalog-slug:{base}",),
        ).fetchone()

    def lock_component_identity(self, conn: Any, manufacturer: str, mpn: str) -> None:
        normalized = f"{manufacturer.strip().casefold()}\n{mpn.strip().casefold()}"
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            (f"catalog-component-identity:{normalized}",),
        ).fetchone()

    def lock_component_for_mutation(self, conn: Any, component_id: str) -> None:
        conn.execute(
            "SELECT id FROM components WHERE id = %s FOR UPDATE",
            (component_id,),
        ).fetchone()


__all__ = [
    "CatalogLockOperations",
    "NoopCatalogLocks",
    "PostgresCatalogLocks",
]
