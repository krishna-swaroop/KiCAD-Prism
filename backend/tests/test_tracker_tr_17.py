"""TR-17: GitHub reply adapter and complete enumeration (F4, F7, F8)."""

from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.contracts import (  # noqa: E402
    Destination,
    GoneConfirmed,
    NotModified,
    PageCursor,
    RemoteComment,
    UncertainAbsence,
)
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials  # noqa: E402
from app.services.trackers.github_comments import (  # noqa: E402
    GitHubCommentAdapter,
    comment_body_hash,
)
from app.services.trackers.http import TrackerHttp  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F4 = json.loads((DOCS / "fixtures" / "F04.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

INSTALLATION_TOKEN = "installation-token-fixture-tr17-not-a-credential"
API = "https://api.github.com"
REPO = "acme/openswitch"
DEST = Destination(
    connectorId="cn_gh1",
    containerKind="repo",
    containerPath=REPO,
    remoteContainerId="987654321",
    generation=2,
)
BOT = {"id": 199001, "login": "prism[bot]", "type": "Bot"}
HUMAN = {"id": 5550001, "login": "arjun-gh", "type": "User"}
H1_BODY = "Re-routed in a1b2c3d."
H2_BODY = "Re-routed in a1b2c3d (both P and N)."


class _Raw:
    def __init__(self, status: int, *, headers=None, content=b"", reason="error", url="") -> None:
        self.status_code = status
        self.headers = headers or {}
        self.content = content
        self.reason = reason
        self.url = url
        self.text = content.decode("utf-8", "replace")

    def json(self):
        if not self.content:
            return {}
        return json.loads(self.content.decode("utf-8"))


class _Clock:
    def __call__(self) -> datetime:
        return datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)


def _rsa_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


def _comment(*, cid=2211003, body=H1_BODY, user=None, updated="2026-09-20T15:10:03Z"):
    return {
        "id": cid,
        "body": body,
        "html_url": f"https://github.com/{REPO}/issues/412#issuecomment-{cid}",
        "issue_url": f"{API}/repos/{REPO}/issues/412",
        "user": user or BOT,
        "created_at": "2026-09-20T15:10:03Z",
        "updated_at": updated,
    }


class GitHubCommentAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pem = _rsa_pem()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = {}

    def _adapter(
        self,
        *,
        bot_user_id: str | None = "199001",
        bot_login: str | None = "prism[bot]",
    ) -> GitHubCommentAdapter:
        creds = GitHubAppCredentials(
            app_id="772215",
            installation_id="88001122",
            private_key_pem=self.pem,
        )
        http = TrackerHttp(extra_hosts=("api.github.com",), sender=self._sender)
        auth = GitHubAppAuth(creds, http=http, clock=_Clock())
        self._enqueue(
            "POST",
            f"{API}/app/installations/88001122/access_tokens",
            201,
            {
                "token": INSTALLATION_TOKEN,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "write"},
            },
        )
        return GitHubCommentAdapter(
            auth,
            http=http,
            bot_user_id=bot_user_id,
            bot_login=bot_login,
        )

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append({"method": method, "url": url, "headers": dict(kwargs.get("headers") or {}), "json": kwargs.get("json")})
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method, url, status, payload=None, *, headers=None) -> None:
        if payload is None:
            content = b""
        else:
            content = json.dumps(payload).encode()
        self._routes.setdefault((method.upper(), url), []).append(
            _Raw(status, content=content, url=url, headers=headers or {})
        )

    def test_fixture_cases_are_present(self) -> None:
        self.assertIn("F4.bot_body_edited_by_human", {case["id"] for case in F4["cases"]})
        self.assertIn("F7.pagination_full", {case["id"] for case in F7["cases"]})
        self.assertIn("F8.local_reply_edit_mirrors", {case["id"] for case in F8["cases"]})
        self.assertIn("F4.external_reply_edit", {case["id"] for case in F4["cases"]})

    def test_create_read_edit_delete_own_comment(self) -> None:
        adapter = self._adapter()
        self._enqueue("POST", f"{API}/repos/{REPO}/issues/412/comments", 201, _comment())
        created = adapter.add_comment(DEST, "412", H1_BODY, "op_add")
        self.assertEqual(created.externalCommentId, "2211003")
        self.assertEqual(created.externalId, "412")
        self.assertEqual(created.author.login, "prism[bot]")
        self.assertTrue(created.author.isBot)
        self.assertIsNone(created.actor)
        self.assertEqual(adapter.comment_hash(created), comment_body_hash(H1_BODY))

        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/2211003", 200, _comment())
        self._enqueue("PATCH", f"{API}/repos/{REPO}/issues/comments/2211003", 200, _comment(body=H2_BODY, updated="2026-09-20T16:02:44Z"))
        edited = adapter.edit_comment(DEST, "2211003", H2_BODY)
        self.assertEqual(edited.body, H2_BODY)
        self.assertNotEqual(comment_body_hash(H1_BODY), comment_body_hash(H2_BODY))

        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/2211003", 200, _comment(body=H2_BODY))
        self._enqueue("DELETE", f"{API}/repos/{REPO}/issues/comments/2211003", 204)
        adapter.delete_comment(DEST, "2211003")
        self.assertTrue(any(call["method"] == "DELETE" for call in self.calls))

    def test_cannot_edit_or_delete_human_authored_comment(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/comments/2211044",
            200,
            _comment(cid=2211044, user=HUMAN, body="Also fixed the N side."),
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.edit_comment(DEST, "2211044", "nope")
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertFalse(any(call["method"] == "PATCH" for call in self.calls))
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/comments/2211044",
            200,
            _comment(cid=2211044, user=HUMAN),
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.delete_comment(DEST, "2211044")
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertFalse(any(call["method"] == "DELETE" for call in self.calls))

    def test_human_edit_of_bot_comment_is_observable(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/comments/2211003",
            200,
            _comment(body=H1_BODY),
            headers={"ETag": 'W/"h1"'},
        )
        first = adapter.get_comment(DEST, "2211003")
        self.assertIsInstance(first, RemoteComment)
        self.assertEqual(first.author.login, "prism[bot]")
        self.assertIsNone(first.actor)
        hash_1 = comment_body_hash(first.body)
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/comments/2211003",
            200,
            _comment(body=H2_BODY, updated="2026-09-20T16:02:44Z"),
            headers={"ETag": 'W/"h2"'},
        )
        second = adapter.get_comment(DEST, "2211003")
        self.assertIsInstance(second, RemoteComment)
        self.assertEqual(second.author.login, "prism[bot]")
        self.assertIsNone(second.actor)
        self.assertNotEqual(hash_1, comment_body_hash(second.body))
        self.assertEqual(second.version.updatedAt, "2026-09-20T16:02:44Z")
        self.assertEqual(second.version.etag, 'W/"h2"')

    def test_failed_listing_is_not_complete_empty(self) -> None:
        adapter = self._adapter()
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/412/comments", 502, {"message": "bad gateway"})
        with self.assertRaises(ProviderError) as caught:
            adapter.list_comments(DEST, "412")
        self.assertEqual(caught.exception.class_, "transient")
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/412/comments", 200, {"not": "a list"})
        with self.assertRaises(ProviderError):
            adapter.list_comments(DEST, "412")

    def test_pagination_completeness_and_find_by_marker(self) -> None:
        adapter = self._adapter()
        page2 = f"{API}/repos/{REPO}/issues/412/comments?page=2"
        page3 = f"{API}/repos/{REPO}/issues/412/comments?page=3"
        marker = "<!-- prism:v1 op=op_add -->"
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/412/comments",
            200,
            [_comment(cid=1, body="a")],
            headers={"Link": f'<{page2}>; rel="next"'},
        )
        page, cursor = adapter.list_comments(DEST, "412")
        self.assertEqual(len(page), 1)
        self.assertFalse(cursor.exhausted)
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/412/comments",
            200,
            [_comment(cid=1, body="a")],
            headers={"Link": f'<{page2}>; rel="next"'},
        )
        self._enqueue(
            "GET",
            page2,
            200,
            [_comment(cid=2, body="b")],
            headers={"Link": f'<{page3}>; rel="next"'},
        )
        self._enqueue(
            "GET",
            page3,
            200,
            [_comment(cid=2211003, body=f"{H1_BODY}\n{marker}")],
        )
        found = adapter.find_comment_by_marker(DEST, "412", marker)
        self.assertIsNotNone(found)
        self.assertEqual(found.externalCommentId, "2211003")
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/412/comments", 200, [])
        missing = adapter.find_comment_by_marker(DEST, "412", marker)
        self.assertIsNone(missing)

    def test_read_outcomes_stay_typed(self) -> None:
        adapter = self._adapter()
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/9", 304, headers={"ETag": 'W/"x"'})
        self.assertIsInstance(adapter.get_comment(DEST, "9", etag='W/"x"'), NotModified)
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/9", 404, {"message": "Not Found"})
        self.assertIsInstance(adapter.get_comment(DEST, "9"), UncertainAbsence)
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/9", 410, {"message": "Gone"})
        self.assertIsInstance(adapter.get_comment(DEST, "9"), GoneConfirmed)

    def test_interrupted_page_does_not_exhaust(self) -> None:
        adapter = self._adapter()
        page2 = f"{API}/repos/{REPO}/issues/412/comments?page=2"
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/412/comments",
            200,
            [_comment(cid=1, body="a")],
            headers={"Link": f'<{page2}>; rel="next"'},
        )
        comments, cursor = adapter.list_comments(DEST, "412")
        self.assertEqual(len(comments), 1)
        self.assertFalse(cursor.exhausted)
        self._enqueue("GET", page2, 502, {"message": "bad gateway"})
        with self.assertRaises(ProviderError):
            adapter.list_comments(DEST, "412", cursor)

    def test_unknown_bot_identity_refuses_own_comment_mutation(self) -> None:
        adapter = self._adapter(bot_user_id="", bot_login="")
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/2211003", 200, _comment())
        with self.assertRaises(ProviderError) as caught:
            adapter.edit_comment(DEST, "2211003", H2_BODY)
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertIn("unknown", caught.exception.message.casefold())
        self.assertFalse(any(call["method"] == "PATCH" for call in self.calls))
        self._enqueue("GET", f"{API}/repos/{REPO}/issues/comments/2211003", 200, _comment())
        with self.assertRaises(ProviderError) as caught:
            adapter.delete_comment(DEST, "2211003")
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertFalse(any(call["method"] == "DELETE" for call in self.calls))

    def test_find_by_marker_requires_bot_identity_and_author_match(self) -> None:
        adapter = self._adapter(bot_user_id="", bot_login="")
        with self.assertRaises(ProviderError) as caught:
            adapter.find_comment_by_marker(DEST, "412", "<!-- prism:v1 op=op_add -->")
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertFalse(any(call["method"] == "GET" for call in self.calls))

        adapter = self._adapter()
        marker = "<!-- prism:v1 op=op_add -->"
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/412/comments",
            200,
            [_comment(cid=9, body=f"forged {marker}", user=HUMAN)],
        )
        self.assertIsNone(adapter.find_comment_by_marker(DEST, "412", marker))


if __name__ == "__main__":
    unittest.main()
