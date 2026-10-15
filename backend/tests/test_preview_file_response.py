"""Catalog previews stored gzipped are served as stored, never compressed twice."""

from __future__ import annotations

import asyncio
import gzip
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException, Request  # noqa: E402
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402

from app.api._helpers import preview_file_response  # noqa: E402
from app.services.catalog.preview_files import compress_in_place  # noqa: E402

SVG = b"<svg xmlns='http://www.w3.org/2000/svg'>" + b"<rect/>" * 400 + b"</svg>"


def _serve(path: Path, accept_encoding: str) -> tuple[dict[str, str], bytes]:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/preview",
        "query_string": b"",
        "headers": [(b"accept-encoding", accept_encoding.encode())],
    }

    async def app(scope, receive, send):
        response = preview_file_response(Request(scope), path, "image/svg+xml", {"Cache-Control": "private"})
        await response(scope, receive, send)

    messages: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(GZipMiddleware(app, minimum_size=16)(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return headers, body


class PreviewFileResponseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, True)
        self.path = self.root / "preview.svg"

    def test_a_gzipped_preview_is_sent_as_stored_or_decompressed(self) -> None:
        self.path.write_bytes(SVG)
        self.assertGreater(compress_in_place(self.path), 0)
        self.assertFalse(self.path.exists())
        packed = self.path.with_name("preview.svg.gz").read_bytes()

        headers, body = _serve(self.path, "gzip, deflate")
        self.assertEqual(headers["content-encoding"], "gzip")
        self.assertEqual(headers["content-type"], "image/svg+xml")
        self.assertEqual(body, packed)  # the stored bytes, not compressed again
        self.assertEqual(gzip.decompress(body), SVG)

        headers, body = _serve(self.path, "identity")
        self.assertNotIn("content-encoding", headers)
        self.assertEqual(body, SVG)

    def test_a_plain_preview_is_still_served_and_a_missing_one_is_404(self) -> None:
        self.path.write_bytes(SVG)
        headers, body = _serve(self.path, "gzip")
        self.assertEqual(gzip.decompress(body), SVG)  # compressed by the middleware, as before
        self.path.unlink()
        with self.assertRaises(HTTPException) as raised:
            _serve(self.path, "gzip")
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
