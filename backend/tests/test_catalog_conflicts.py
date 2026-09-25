"""Catalog write conflicts are classified by type, not by message text."""

from __future__ import annotations

import sys
from pathlib import Path
import unittest

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.catalog_errors import raise_catalog_value_error  # noqa: E402
from app.services.catalog.conflicts import (  # noqa: E402
    ASSET_REFERENCED_CODE,
    CatalogConflict,
    MANIFEST_CONFLICT_CODE,
    REVISION_CONFLICT_CODE,
    asset_referenced_conflict,
    manifest_conflict,
    revision_conflict,
)


class CatalogConflictTypeTests(unittest.TestCase):
    def test_default_conflict_keeps_revision_machine_code(self) -> None:
        exc = CatalogConflict("head moved")
        self.assertIsInstance(exc, ValueError)
        self.assertEqual(exc.code, REVISION_CONFLICT_CODE)
        self.assertEqual(str(exc), "head moved")
        self.assertEqual(revision_conflict().code, REVISION_CONFLICT_CODE)

    def test_referenced_conflict_uses_its_own_code(self) -> None:
        exc = asset_referenced_conflict()
        self.assertEqual(exc.code, ASSET_REFERENCED_CODE)
        self.assertIn("representation", str(exc))

    def test_manifest_conflict_uses_its_own_code(self) -> None:
        exc = manifest_conflict()
        self.assertEqual(exc.code, MANIFEST_CONFLICT_CODE)
        self.assertIn("manifest", str(exc))


class CatalogConflictHttpTests(unittest.TestCase):
    def test_conflict_status_does_not_depend_on_wording(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            raise_catalog_value_error(CatalogConflict("head moved"))
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            raised.exception.detail,
            {"code": REVISION_CONFLICT_CODE, "message": "head moved"},
        )

    def test_plain_value_error_with_conflict_wording_stays_400(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            raise_catalog_value_error(
                ValueError("Component revision conflict: refresh the component before saving")
            )
        self.assertEqual(raised.exception.status_code, 400)

    def test_validation_stays_400(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            raise_catalog_value_error(ValueError("label is required"))
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "label is required")

    def test_referenced_conflict_is_409(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            raise_catalog_value_error(asset_referenced_conflict("still attached"))
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            raised.exception.detail,
            {"code": ASSET_REFERENCED_CODE, "message": "still attached"},
        )


if __name__ == "__main__":
    unittest.main()
