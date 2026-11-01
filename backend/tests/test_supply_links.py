"""A distributor's product link reaches a page only as an https address. No database."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.models import MAX_LINK, https_link  # noqa: E402


class HttpsLinkTests(unittest.TestCase):
    def test_only_an_https_address_is_kept(self) -> None:
        self.assertEqual(https_link(" https://www.mouser.com/ProductDetail/x "), "https://www.mouser.com/ProductDetail/x")
        self.assertEqual(https_link("HTTPS://example.com/a"), "HTTPS://example.com/a")
        for unsafe in ("javascript:alert(1)", "http://example.com/a", "data:text/html,x", "//example.com/a", "", None,
                       "https://example.com/a b", "https://" + "a" * MAX_LINK):
            self.assertEqual(https_link(unsafe), "", unsafe)


if __name__ == "__main__":
    unittest.main()
