"""HTTP translation for catalog write errors.

409 vs 400 is decided by ``CatalogConflict``, not by scanning exception text.
Unexpected exceptions are not converted here.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.services.catalog.conflicts import CatalogConflict


def raise_catalog_value_error(exc: ValueError) -> None:
    """Raise 409 for typed conflicts and 400 for other validation errors."""

    status = 409 if isinstance(exc, CatalogConflict) else 400
    raise HTTPException(status_code=status, detail=str(exc)) from exc
