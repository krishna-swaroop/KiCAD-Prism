"""Regression tests for response compression.

The compressor itself is starlette's; these tests are a contract on it, because
older starlette releases get several of these wrong and `fastapi` resolves at
image-build time. If a downgrade slips past the floors in requirements.txt,
these fail loudly instead of silently corrupting ranged downloads.

* small responses stay uncompressed with their Content-Length intact (this only
  works because the middleware is registered innermost, so it sees the real
  response rather than an already-wrapped streaming body);
* 206 Partial Content is never compressed, or ranged downloads reassemble
  garbage;
* already-compressed media types are skipped;
* the compression level is the cheaper 6, not the blocking 9;
* a streamed body is passed through chunk by chunk rather than buffered, so a
  35 MB board download does not become a 35 MB spike in a worker's heap.
"""

from __future__ import annotations

import asyncio
import gzip
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from starlette.middleware.gzip import GZipMiddleware  # noqa: E402

from app.core.gzip_config import GZIP_EXCLUDED_CONTENT_TYPES  # noqa: E402


def _run(
    *,
    status: int = 200,
    headers: list[tuple[bytes, bytes]] | None = None,
    body: bytes = b"",
    accept_gzip: bool = True,
    minimum_size: int = 1024,
    compresslevel: int = 6,
) -> tuple[dict[bytes, bytes], bytes]:
    """Drive one response through the middleware; return its headers and body."""

    response_headers = headers or [(b"content-type", b"application/json")]

    async def application(scope, receive, send):
        await send(
            {"type": "http.response.start", "status": status, "headers": response_headers}
        )
        await send({"type": "http.response.body", "body": body, "more_body": False})

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.request"}

    request_headers = [(b"accept-encoding", b"gzip")] if accept_gzip else []
    middleware = GZipMiddleware(
        application,
        minimum_size=minimum_size,
        compresslevel=compresslevel,
        exclude_content_types=GZIP_EXCLUDED_CONTENT_TYPES,
    )
    asyncio.run(
        middleware({"type": "http", "headers": request_headers}, receive, send)
    )

    out_headers: dict[bytes, bytes] = {}
    out_body = b""
    for message in sent:
        if message["type"] == "http.response.start":
            out_headers = {k.lower(): v for k, v in message["headers"]}
        elif message["type"] == "http.response.body":
            out_body += message.get("body", b"")
    return out_headers, out_body


class GzipMiddlewareTests(unittest.TestCase):
    def test_small_response_is_not_compressed_and_keeps_content_length(self) -> None:
        # A real response carries its own Content-Length; passthrough must leave
        # it intact rather than deleting it and forcing a chunked reply.
        headers, body = _run(
            headers=[
                (b"content-type", b"application/json"),
                (b"content-length", b"58"),
            ],
            body=b"x" * 58,
        )
        self.assertNotIn(b"content-encoding", headers)
        self.assertEqual(headers.get(b"content-length"), b"58")
        self.assertEqual(body, b"x" * 58)

    def test_large_response_is_compressed_with_content_length(self) -> None:
        headers, body = _run(body=b"x" * 20000)
        self.assertEqual(headers.get(b"content-encoding"), b"gzip")
        self.assertEqual(headers.get(b"content-length"), str(len(body)).encode())
        self.assertEqual(gzip.decompress(body), b"x" * 20000)
        self.assertIn(b"accept-encoding", headers.get(b"vary", b"").lower())

    def test_no_accept_encoding_passes_through(self) -> None:
        headers, body = _run(body=b"x" * 20000, accept_gzip=False)
        self.assertNotIn(b"content-encoding", headers)
        self.assertEqual(body, b"x" * 20000)

    def test_206_partial_content_is_not_compressed(self) -> None:
        headers, body = _run(
            status=206,
            headers=[
                (b"content-type", b"application/octet-stream"),
                (b"content-range", b"bytes 0-4095/176000"),
            ],
            body=b"x" * 4096,
            minimum_size=100,
        )
        self.assertNotIn(b"content-encoding", headers)
        self.assertEqual(body, b"x" * 4096)

    def test_already_encoded_response_is_left_alone(self) -> None:
        headers, body = _run(
            headers=[
                (b"content-type", b"application/json"),
                (b"content-encoding", b"br"),
            ],
            body=b"x" * 4096,
            minimum_size=100,
        )
        self.assertEqual(headers.get(b"content-encoding"), b"br")
        self.assertEqual(body, b"x" * 4096)

    def test_binary_media_types_are_skipped(self) -> None:
        for media in (b"image/png", b"video/mp4", b"application/zip", b"application/pdf"):
            with self.subTest(media=media):
                headers, _ = _run(
                    headers=[(b"content-type", media)],
                    body=b"x" * 4096,
                    minimum_size=100,
                )
                self.assertNotIn(b"content-encoding", headers)

    def test_board_and_text_media_types_are_compressed(self) -> None:
        for media in (
            b"application/octet-stream",
            b"application/json",
            b"text/plain",
            b"image/svg+xml",
        ):
            with self.subTest(media=media):
                headers, _ = _run(
                    headers=[(b"content-type", media)],
                    body=b"x" * 4096,
                    minimum_size=100,
                )
                self.assertEqual(headers.get(b"content-encoding"), b"gzip")

    def test_compress_level_is_six(self) -> None:
        # A distinctive payload so the level actually shows in the output size.
        payload = bytes(range(256)) * 200
        _, body6 = _run(body=payload, minimum_size=10, compresslevel=6)
        expected = gzip.compress(payload, 6)
        # Same level ⇒ same compressed length (mtime aside, which we do not set).
        self.assertEqual(len(body6), len(expected))


class StreamingResponseTests(unittest.TestCase):
    def test_a_streamed_body_is_not_buffered_whole(self) -> None:
        """FileResponse and StreamingResponse arrive in chunks, and must leave in
        chunks. Buffering them turns a constant-memory download into a spike the
        size of the file, which is how a 35 MB board became ~97 MB of heap in a
        hand-rolled version of this middleware."""

        chunk = b"(segment (start 1 2) (end 3 4))\n" * 1000

        async def streaming_application(scope, receive, send):
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-type", b"text/csv; charset=utf-8")],
                }
            )
            for _ in range(20):
                await send(
                    {"type": "http.response.body", "body": chunk, "more_body": True}
                )
            await send({"type": "http.response.body", "body": b"", "more_body": False})

        sent: list[dict] = []

        async def send(message):
            sent.append(message)

        async def receive():
            return {"type": "http.request"}

        middleware = GZipMiddleware(
            streaming_application,
            minimum_size=1024,
            compresslevel=6,
            exclude_content_types=GZIP_EXCLUDED_CONTENT_TYPES,
        )
        asyncio.run(
            middleware(
                {"type": "http", "headers": [(b"accept-encoding", b"gzip")]},
                receive,
                send,
            )
        )

        body_messages = [m for m in sent if m["type"] == "http.response.body"]
        self.assertGreater(
            len(body_messages),
            1,
            "the whole body was collapsed into one message, so it was buffered",
        )
        start = next(m for m in sent if m["type"] == "http.response.start")
        headers = {k.lower(): v for k, v in start["headers"]}
        self.assertEqual(headers.get(b"content-encoding"), b"gzip")
        # A streamed response cannot carry a Content-Length it no longer knows.
        self.assertNotIn(b"content-length", headers)


class MiddlewareRegistrationOrderTests(unittest.TestCase):
    def test_gzip_is_registered_inside_security_headers(self) -> None:
        # The whole small-response fix depends on gzip sitting innermost, so pin
        # that it is added before apply_security_headers in the app source.
        source = (
            Path(__file__).resolve().parents[1] / "app" / "main.py"
        ).read_text(encoding="utf-8")
        gzip_at = source.index("GZipMiddleware,")
        security_at = source.index('middleware("http")(apply_security_headers)')
        self.assertLess(
            gzip_at,
            security_at,
            "GZipMiddleware must be registered before apply_security_headers so it "
            "ends up innermost; otherwise minimum_size never applies.",
        )


if __name__ == "__main__":
    unittest.main()
