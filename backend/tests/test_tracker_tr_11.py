"""TR-11: reusable forge HTTP transport (F3, F7)."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.forge_hosts import allowed_request_hosts  # noqa: E402
from app.services.forge_publish_service import ForgePublishError  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.http import (  # noqa: E402
    ForgeHttpResponse,
    TrackerHttp,
    parse_link_header,
    send,
)

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F07 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))
API = "https://api.github.com/repos/acme/openswitch/issues/412"


class _Raw:
    def __init__(self, status: int, *, headers=None, content=b"", reason="error", url=API) -> None:
        self.status_code = status
        self.headers = headers or {}
        self.content = content
        self.reason = reason
        self.url = url
        self.text = content.decode("utf-8", "replace")

    def json(self):
        return json.loads(self.content.decode("utf-8") or "{}")


class TrackerHttpClassificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.calls: list[dict] = []

        def sender(method, url, **kwargs):  # noqa: ANN001
            self.calls.append({"method": method, "url": url, **kwargs})
            return self._next.pop(0)

        self._next: list[_Raw] = []
        self.http = TrackerHttp(sender=sender)

    def _push(self, status: int, **kwargs) -> None:
        self._next.append(_Raw(status, **kwargs))

    def test_allowlist_includes_api_roots_not_just_web_hosts(self) -> None:
        hosts = allowed_request_hosts("")
        self.assertIn("github.com", hosts)
        self.assertIn("api.github.com", hosts)
        self.assertIn("gitlab.com", hosts)

    def test_f7_outcomes_stay_distinct(self) -> None:
        ids = {case["id"] for case in F07["cases"]}
        self.assertIn("F7.conditional_304", ids)
        self.assertIn("F7.private_404", ids)
        self.assertIn("F7.gone_410", ids)
        self.assertIn("F7.throttling", ids)

        cases = [
            (304, {"etag": 'W/"abc"'}, "not_modified"),
            (404, {}, "not_found_uncertain"),
            (410, {}, "gone_confirmed"),
            (401, {}, "auth_lost"),
            (429, {"retry-after": "12"}, "rate_limited"),
            (403, {"retry-after": "30"}, "rate_limited"),
            (403, {}, "forbidden"),
            (301, {"location": "https://api.github.com/repos/acme/hardware-issues/issues/9"}, "moved"),
        ]
        for status, headers, kind in cases:
            self._push(status, headers=headers, content=b"{}")
            response = self.http.request("GET", API)
            self.assertEqual(self.http.classify(response), kind, status)
            if kind == "not_modified":
                self.assertEqual(self.http.outcome(response).status, 304)
                continue
            with self.assertRaises(ProviderError) as caught:
                self.http.outcome(response)
            self.assertEqual(caught.exception.class_, kind)

    def test_unapproved_redirect_does_not_follow_with_the_token(self) -> None:
        self._push(
            302,
            headers={"location": "https://evil.example/steal"},
        )
        response = self.http.request(
            "GET",
            API,
            headers={"Authorization": "Bearer ghs_live"},
        )
        with self.assertRaises(ProviderError) as caught:
            self.http.outcome(response)
        self.assertEqual(caught.exception.class_, "forbidden")
        self.assertEqual(len(self.calls), 1)
        self.assertFalse(self.calls[0]["allow_redirects"])
        self.assertNotIn("evil.example", self.calls[0]["url"])

    def test_post_timeout_is_ambiguous_and_not_retried(self) -> None:
        def sender(method, url, **kwargs):  # noqa: ANN001
            self.calls.append({"method": method, "url": url})
            raise requests.Timeout("read timed out")

        http = TrackerHttp(sender=sender)
        with self.assertRaises(ProviderError) as caught:
            http.request("POST", API, json_body={"title": "x"})
        self.assertEqual(caught.exception.class_, "transient")
        self.assertFalse(caught.exception.retryable)
        self.assertIn("unknown", caught.exception.message.casefold())
        self.assertEqual(len(self.calls), 1)

        self.calls.clear()
        with self.assertRaises(ProviderError) as caught:
            http.request("GET", API)
        self.assertTrue(caught.exception.retryable)
        self.assertEqual(len(self.calls), 1)

    def test_tokens_never_leave_allowlisted_https_hosts(self) -> None:
        with self.assertRaises(ProviderError) as caught:
            self.http.request("GET", "http://api.github.com/repos/acme/openswitch")
        self.assertEqual(caught.exception.class_, "invalid_request")
        with self.assertRaises(ProviderError):
            self.http.request("GET", "https://evil.example/repos/acme/openswitch")
        self.assertEqual(self.calls, [])

    def test_pagination_link_and_etag_are_exposed(self) -> None:
        self._push(
            200,
            headers={
                "ETag": 'W/"1c3e"',
                "Link": '<https://api.github.com/issues?page=2>; rel="next", '
                '<https://api.github.com/issues?page=3>; rel="last"',
            },
            content=b"[]",
        )
        response = self.http.request("GET", API, etag='W/"stale"')
        self.assertEqual(response.etag, 'W/"1c3e"')
        self.assertEqual(response.next_page(), "https://api.github.com/issues?page=2")
        self.assertEqual(self.calls[0]["headers"]["If-None-Match"], 'W/"stale"')
        self.assertEqual(
            parse_link_header(response.headers["link"])["last"],
            "https://api.github.com/issues?page=3",
        )

    def test_send_never_retries_and_keeps_release_timeout_defaults(self) -> None:
        seen = []

        def sender(method, url, **kwargs):  # noqa: ANN001
            seen.append(kwargs)
            return _Raw(200, content=b"{}")

        send("GET", API, sender=sender, timeout=60, allow_redirects=False)
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["timeout"], 60)
        self.assertFalse(seen[0]["allow_redirects"])
        self.assertTrue(seen[0]["verify"])


class ReleaseCompatibilityTests(unittest.TestCase):
    def test_release_404_still_means_missing_release_not_tracker_absence(self) -> None:
        from app.services import forge_publish_service as forge

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", return_value=_Raw(404, content=b"{}")),
        ):
            with self.assertRaisesRegex(ForgePublishError, "no such release"):
                forge._request(
                    "GET",
                    "https://api.github.com/repos/org/board/releases/tags/v1",
                    headers={"Authorization": "Bearer ghp_example"},
                    forge="GitHub",
                )

    def test_release_redirect_still_rejected_without_following(self) -> None:
        from app.services import forge_publish_service as forge

        def sender(method, url, **kwargs):  # noqa: ANN001
            self.assertFalse(kwargs["allow_redirects"])
            return _Raw(302, headers={"location": "https://evil.example"})

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=sender),
        ):
            with self.assertRaisesRegex(ForgePublishError, "unexpected redirect"):
                forge._request(
                    "GET",
                    "https://api.github.com/repos/org/board/releases",
                    headers={"Authorization": "Bearer ghp_example"},
                    forge="GitHub",
                )


if __name__ == "__main__":
    unittest.main()
