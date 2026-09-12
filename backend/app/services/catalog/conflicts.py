"""Typed catalog write conflicts.

HTTP 409 vs 400 is classified by this type, not by scanning the human message.
Callers may change wording without changing the machine code or status.
"""

from __future__ import annotations


REVISION_CONFLICT_CODE = "revision_conflict"
ASSET_REFERENCED_CODE = "asset_referenced"
MANIFEST_CONFLICT_CODE = "manifest_conflict"

DEFAULT_REVISION_CONFLICT_MESSAGE = (
    "Component revision conflict: refresh the component before saving"
)
DEFAULT_ASSET_REFERENCED_MESSAGE = (
    "Asset is referenced by a representation; remove or reassign it first"
)
DEFAULT_MANIFEST_CONFLICT_MESSAGE = (
    "Component manifest conflict: refresh the component before changing workflow"
)


class CatalogConflict(ValueError):
    """A concurrent or referential catalog write that must not be applied."""

    def __init__(
        self,
        message: str = DEFAULT_REVISION_CONFLICT_MESSAGE,
        *,
        code: str = REVISION_CONFLICT_CODE,
    ) -> None:
        super().__init__(message)
        self.code = code


def revision_conflict(message: str = DEFAULT_REVISION_CONFLICT_MESSAGE) -> CatalogConflict:
    return CatalogConflict(message, code=REVISION_CONFLICT_CODE)


def asset_referenced_conflict(
    message: str = DEFAULT_ASSET_REFERENCED_MESSAGE,
) -> CatalogConflict:
    return CatalogConflict(message, code=ASSET_REFERENCED_CODE)


def manifest_conflict(message: str = DEFAULT_MANIFEST_CONFLICT_MESSAGE) -> CatalogConflict:
    return CatalogConflict(message, code=MANIFEST_CONFLICT_CODE)


__all__ = [
    "ASSET_REFERENCED_CODE",
    "CatalogConflict",
    "DEFAULT_ASSET_REFERENCED_MESSAGE",
    "DEFAULT_MANIFEST_CONFLICT_MESSAGE",
    "DEFAULT_REVISION_CONFLICT_MESSAGE",
    "MANIFEST_CONFLICT_CODE",
    "REVISION_CONFLICT_CODE",
    "asset_referenced_conflict",
    "manifest_conflict",
    "revision_conflict",
]
