"""Serving an asset's stored bytes to the browser.

The renderer that replaces stored SVG previews (issue #200) needs the library
file itself. The existing download path returns the *placement* payload KiCad
consumes, which is a different thing, so these tests pin the distinction.
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app.api import catalog_admin  # noqa: E402
from app.api import remote_provider as rp  # noqa: E402
from app.core.roles import CATALOG_READ_ROLES  # noqa: E402
from app.core.security import AuthenticatedUser, require_catalog_reader  # noqa: E402


SYMBOL = b'(kicad_symbol_lib (version 20231120) (symbol "R"))'


class AssetSourceResolution(unittest.TestCase):
    """`catalog_asset_source` on the domain service."""

    def setUp(self) -> None:
        from app.services.catalog.asset_files import (  # noqa: PLC0415
            content_type_for_asset,
        )

        self._content_type_for_asset = content_type_for_asset
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.store = Path(tmp.name) / "components"
        (self.store / "symbols").mkdir(parents=True)
        self.asset = self.store / "symbols" / "R_Small.kicad_sym"
        self.asset.write_bytes(SYMBOL)
        self.outside = Path(tmp.name) / "elsewhere.kicad_sym"
        self.outside.write_bytes(b"(kicad_symbol_lib)")

    def _service(self, row: dict[str, object] | None):
        """A stand-in for the domain service with one row in `assets`."""
        from app.services.component_catalog_domain import (  # noqa: PLC0415
            ComponentCatalogDomainService,
        )

        class _Cursor:
            def fetchone(self_inner):
                return row

        class _Conn:
            def execute(self_inner, *_args, **_kwargs):
                return _Cursor()

            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *_exc):
                return False

        service = ComponentCatalogDomainService(store_root=self.store)
        service.initialize = lambda: None
        service._connect = lambda: _Conn()
        return service

    def test_returns_the_stored_file_not_a_placement_payload(self) -> None:
        service = self._service(
            {"canonical_path": str(self.asset), "asset_type": "symbol"}
        )
        resolved = service.catalog_asset_source("asset-1")
        self.assertIsNotNone(resolved)
        path, content_type, filename = resolved
        self.assertEqual(path.read_bytes(), SYMBOL)
        self.assertEqual(content_type, "application/x-kicad-symbol")
        self.assertEqual(filename, "R_Small.kicad_sym")

    def test_refuses_a_path_outside_the_store(self) -> None:
        # A row whose canonical_path escaped the store must not become an
        # arbitrary file read through an authenticated endpoint.
        service = self._service(
            {"canonical_path": str(self.outside), "asset_type": "symbol"}
        )
        self.assertIsNone(service.catalog_asset_source("asset-1"))

    def test_refuses_a_traversal_through_the_store(self) -> None:
        escape = self.store / "symbols" / ".." / ".." / "elsewhere.kicad_sym"
        service = self._service(
            {"canonical_path": str(escape), "asset_type": "symbol"}
        )
        self.assertIsNone(service.catalog_asset_source("asset-1"))

    def test_missing_row_and_missing_file_both_resolve_to_nothing(self) -> None:
        self.assertIsNone(self._service(None).catalog_asset_source("nope"))
        gone = self.store / "symbols" / "absent.kicad_sym"
        service = self._service(
            {"canonical_path": str(gone), "asset_type": "symbol"}
        )
        self.assertIsNone(service.catalog_asset_source("asset-1"))


class AssetContentRoutes(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.asset = Path(tmp.name) / "R_Small.kicad_sym"
        self.asset.write_bytes(SYMBOL)
        self.user = AuthenticatedUser(
            email="designer@example.com", name="Designer", role="designer"
        )

    def test_admin_route_serves_the_file(self) -> None:
        resolved = (self.asset, "application/x-kicad-symbol", self.asset.name)
        with patch.object(
            catalog_admin.catalog_service, "catalog_asset_source", return_value=resolved
        ):
            response = catalog_admin.get_catalog_asset_content("asset-1", user=self.user)
        self.assertEqual(response.media_type, "application/x-kicad-symbol")
        self.assertEqual(response.headers["cache-control"], "private, max-age=300")
        self.assertIn("R_Small.kicad_sym", response.headers["content-disposition"])

    def test_admin_route_404s_for_an_unknown_asset(self) -> None:
        with patch.object(
            catalog_admin.catalog_service, "catalog_asset_source", return_value=None
        ):
            with self.assertRaises(HTTPException) as raised:
                catalog_admin.get_catalog_asset_content("nope", user=self.user)
        self.assertEqual(raised.exception.status_code, 404)

    def test_panel_route_serves_the_file(self) -> None:
        resolved = (self.asset, "application/x-kicad-symbol", self.asset.name)
        with patch.object(
            rp.catalog_service, "catalog_asset_source", return_value=resolved
        ):
            response = asyncio.run(rp.get_asset_content("asset-1", user=self.user))
        self.assertEqual(response.media_type, "application/x-kicad-symbol")

    def test_panel_route_404s_for_an_unknown_asset(self) -> None:
        with patch.object(
            rp.catalog_service, "catalog_asset_source", return_value=None
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(rp.get_asset_content("nope", user=self.user))
        self.assertEqual(raised.exception.status_code, 404)


class AssetContentAuthorization(unittest.TestCase):
    """The admin route is catalog-read; the panel route is remote-symbol-read."""

    def test_every_catalog_reader_role_is_allowed(self) -> None:
        for role in sorted(CATALOG_READ_ROLES):
            user = AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            self.assertIs(asyncio.run(require_catalog_reader(user=user)), user)

    def test_a_viewer_is_refused(self) -> None:
        # `viewer` authenticates fine and reads projects, but the catalog is a
        # separate grant -- authentication is not object authorization.
        viewer = AuthenticatedUser(
            email="viewer@example.com", name="Viewer", role="viewer"
        )
        self.assertNotIn("viewer", CATALOG_READ_ROLES)
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(require_catalog_reader(user=viewer))
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
