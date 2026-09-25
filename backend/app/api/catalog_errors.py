"""HTTP translation for catalog write errors.

409 vs 400 is decided by ``CatalogConflict``, not by scanning exception text.
Conflict responses carry ``{"code", "message"}`` so clients can distinguish
retryable head movement from referential conflicts without reading prose.
Unexpected exceptions are not converted here.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.services.catalog.conflicts import CatalogConflict


def raise_catalog_value_error(exc: ValueError) -> None:
    """Raise 409 for typed conflicts and 400 for other validation errors."""

    if isinstance(exc, CatalogConflict):
        raise HTTPException(
            status_code=409,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    raise HTTPException(status_code=400, detail=str(exc)) from exc
