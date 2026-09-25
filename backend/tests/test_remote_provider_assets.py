from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException  # noqa: E402
from starlette.datastructures import Headers, QueryParams  # noqa: E402

from app.api import remote_provider as rp  # noqa: E402


def _request(query: str = "", if_none_match: str | None = None) -> SimpleNamespace:
    headers = {"if-none-match": if_none_match} if if_none_match else {}
    return SimpleNamespace(query_params=QueryParams(query), headers=Headers(headers))


class ProviderStaticAssetCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.static_dir = Path(tmp.name)
        self.panel_js = b"console.log('panel')"
        (self.static_dir / "panel.js").write_bytes(self.panel_js)
        self.font = b"\x00\x01font-bytes"
        (self.static_dir / "inter-latin-abc12345.woff2").write_bytes(self.font)
        rp._asset_versions.clear()
        patcher = patch.object(rp, "STATIC_DIR", self.static_dir)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _digest(self, name: str) -> str:
        return rp._asset_version(name)

    def test_versioned_query_serves_immutable_with_etag(self) -> None:
        digest = self._digest("panel.js")
        response = asyncio.run(
            rp.provider_static_asset("panel.js", _request(query=f"v={digest}"))
        )
        self.assertEqual(response.headers["cache-control"], "public, max-age=31536000, immutable")
        self.assertEqual(response.headers["etag"], f'"{digest}"')

    def test_stale_or_missing_query_revalidates_and_answers_304(self) -> None:
        digest = self._digest("panel.js")
        fresh = asyncio.run(rp.provider_static_asset("panel.js", _request()))
        self.assertEqual(fresh.headers["cache-control"], "no-cache")
        self.assertEqual(fresh.headers["etag"], f'"{digest}"')
        not_modified = asyncio.run(
            rp.provider_static_asset("panel.js", _request(if_none_match=f'"{digest}"'))
        )
        self.assertEqual(not_modified.status_code, 304)
        self.assertEqual(not_modified.headers["cache-control"], "no-cache")

    def test_mismatched_etag_gets_full_response(self) -> None:
        response = asyncio.run(
            rp.provider_static_asset("panel.js", _request(if_none_match='"deadbeef0000"'))
        )
        self.assertNotEqual(response.status_code, 304)

    def test_vite_hashed_font_name_is_immutable_without_query(self) -> None:
        response = asyncio.run(
            rp.provider_static_asset("inter-latin-abc12345.woff2", _request())
        )
        self.assertEqual(response.headers["cache-control"], "public, max-age=31536000, immutable")

    def test_plain_name_without_hash_never_pins_immutable(self) -> None:
        (self.static_dir / "inter-regular.woff2").write_bytes(b"legacy-font")
        response = asyncio.run(rp.provider_static_asset("inter-regular.woff2", _request()))
        self.assertEqual(response.headers["cache-control"], "no-cache")

    def test_traversal_outside_static_dir_is_forbidden(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(rp.provider_static_asset("../secrets.txt", _request()))
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
