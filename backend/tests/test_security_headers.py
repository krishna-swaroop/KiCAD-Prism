"""Regression tests for the baseline browser security headers.

The Assembly Assistant renders the generated interactive BOM inside a
same-origin iframe. An earlier hardening pass set ``X-Frame-Options: DENY``,
which blocked Prism from framing its own content and broke that tab entirely.
These tests pin the policy at same-origin so it cannot tighten back to DENY
without a failing test, and so it cannot loosen to allow embedding by a
third-party site either.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Response  # noqa: E402

from app.core import security_headers as headers_module  # noqa: E402


def applied_headers() -> dict:
    """Run the middleware over a bare response and return the headers it set."""

    async def call_next(_request):
        return Response(status_code=200)

    response = asyncio.run(headers_module.apply_security_headers(object(), call_next))
    return {key.lower(): value for key, value in response.headers.items()}


class FramingPolicyTests(unittest.TestCase):
    def test_same_origin_framing_is_allowed(self) -> None:
        headers = applied_headers()
        self.assertEqual(headers.get("x-frame-options"), "SAMEORIGIN")
        self.assertEqual(headers.get("content-security-policy"), "frame-ancestors 'self'")

    def test_third_party_framing_is_still_refused(self) -> None:
        headers = applied_headers()
        self.assertNotIn("allow-from", headers.get("x-frame-options", "").lower())
        self.assertNotIn("*", headers.get("content-security-policy", ""))


class BaselineHeaderTests(unittest.TestCase):
    def test_baseline_headers_are_present(self) -> None:
        headers = applied_headers()
        self.assertEqual(headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(headers.get("referrer-policy"), "strict-origin-when-cross-origin")
        self.assertEqual(headers.get("cross-origin-opener-policy"), "same-origin")
        self.assertIn("geolocation=()", headers.get("permissions-policy", ""))

    def test_a_handler_may_override_a_default(self) -> None:
        """setdefault, not assignment: a route can still set its own value."""

        async def call_next(_request):
            response = Response(status_code=200)
            response.headers["X-Frame-Options"] = "DENY"
            return response

        response = asyncio.run(headers_module.apply_security_headers(object(), call_next))
        self.assertEqual(response.headers["x-frame-options"], "DENY")


class HstsTests(unittest.TestCase):
    def test_hsts_is_sent_when_the_deployment_is_https(self) -> None:
        with patch.object(headers_module.settings, "SESSION_COOKIE_SECURE_OVERRIDE", True):
            self.assertIn("max-age=", applied_headers().get("strict-transport-security", ""))

    def test_hsts_is_withheld_over_plain_http(self) -> None:
        # Pinning a browser to HTTPS from a deployment that only serves HTTP
        # locks users out until the header expires.
        with patch.object(headers_module.settings, "SESSION_COOKIE_SECURE_OVERRIDE", False):
            self.assertNotIn("strict-transport-security", applied_headers())


if __name__ == "__main__":
    unittest.main()
