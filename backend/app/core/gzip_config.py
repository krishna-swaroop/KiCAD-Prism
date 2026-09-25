"""Response compression settings, shared by the app and its regression tests.

Starlette's own ``GZipMiddleware`` already does everything this deployment
needs, provided the version is new enough: it skips ``206 Partial Content``,
skips already-compressed media types, and streams chunk-by-chunk instead of
buffering a whole response in memory. The floors in ``requirements.txt`` are
what guarantee that, and ``tests/test_gzip_middleware.py`` pins each behaviour
so a downgrade fails loudly rather than silently corrupting range requests.

Only two things are ours: the exclusion list gains ``application/pdf`` (already
compressed, so gzipping spends CPU to make it marginally bigger), and the
compression level is lowered from Starlette's default.
"""

from starlette.middleware.gzip import DEFAULT_EXCLUDED_CONTENT_TYPES

GZIP_EXCLUDED_CONTENT_TYPES = DEFAULT_EXCLUDED_CONTENT_TYPES + ("application/pdf",)

GZIP_MINIMUM_SIZE = 1024

# Level 6 lands within ~1% of level 9's output on a 35 MB board for roughly a
# third of the CPU (881 ms against 2264 ms measured), so the default 9 buys
# almost nothing on the payloads this app serves.
GZIP_COMPRESS_LEVEL = 6
