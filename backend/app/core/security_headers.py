"""Baseline browser security headers for a deployment that hosts customer PCB IP.

Kept out of ``app.main`` so the policy can be tested without importing the
application, which validates the authentication configuration at import time and
exits the process when it is unsafe.
"""

from __future__ import annotations

from typing import Mapping

from app.core.config import settings

#: Headers that never depend on how the deployment is configured.
STATIC_SECURITY_HEADERS: Mapping[str, str] = {
    "X-Content-Type-Options": "nosniff",
    # Prism frames its own content: the Assembly Assistant renders the generated
    # interactive BOM from /api/projects/{id}/ibom inside a same-origin iframe.
    # DENY blocked that and broke the tab, so the policy is same-origin rather
    # than none. frame-ancestors is the directive browsers actually enforce
    # today; X-Frame-Options stays for anything that still only understands it.
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "frame-ancestors 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
}

HSTS_VALUE = "max-age=31536000; includeSubDomains"


def security_headers() -> dict[str, str]:
    """The headers to apply to a response, given the current configuration."""
    headers = dict(STATIC_SECURITY_HEADERS)
    # Sending HSTS over plain HTTP would pin a browser to a scheme this
    # deployment does not serve, so it follows the same signal as the secure
    # cookie flag.
    if settings.SESSION_COOKIE_SECURE:
        headers["Strict-Transport-Security"] = HSTS_VALUE
    return headers


async def apply_security_headers(request, call_next):
    """HTTP middleware applying :func:`security_headers` to every response."""
    response = await call_next(request)
    for name, value in security_headers().items():
        response.headers.setdefault(name, value)
    return response
