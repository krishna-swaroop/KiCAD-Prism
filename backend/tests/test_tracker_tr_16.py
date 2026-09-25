"""TR-16: GitHub issue, destination and label adapter (F3, F4, F7)."""

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
    PROTOCOL_CONFORMANCE_CASES,
    Destination,
    ForbiddenRead,
    GoneConfirmed,
    IssueDraft,
    IssuePatch,
    Moved,
    NotModified,
    RemoteIssue,
    UncertainAbsence,
    UpdateCursor,
)
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_auth import (  # noqa: E402
    GitHubAppAuth,
    GitHubAppCredentials,
)
from app.services.trackers.github_issues import (  # noqa: E402
    ADAPTER_CONFORMANCE_CASES,
    GitHubIssueAdapter,
    conformance_kind,
)
from app.services.trackers.http import TrackerHttp  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
F4 = json.loads((DOCS / "fixtures" / "F04.json").read_text(encoding="utf-8"))
F7 = json.loads((DOCS / "fixtures" / "F07.json").read_text(encoding="utf-8"))

INSTALLATION_TOKEN = "installation-token-fixture-tr16-not-a-credential"
USER_TOKEN = "user-oauth-token-fixture"
API = "https://api.github.com"
REPO = "acme/openswitch"
DEST = Destination(
    connectorId="cn_gh1",
    containerKind="repo",
    containerPath=REPO,
    remoteContainerId="987654321",
    generation=2,
    visibility="private",
)
MARKER = "<!-- prism:v1 connector=cn_gh1 container=987654321 comment=c_8f3a1b2c op=op_91a4c0de -->"


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
    def __init__(self) -> None:
        self.now = datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now


def _rsa_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


def _issue_payload(*, number=412, issue_id=198400412, pull=False, body=None, assignees=None):
    payload = {
        "id": issue_id,
        "number": number,
        "title": "[MAJOR] Stub on MGMT.D0_P",
        "body": body if body is not None else f"prose\n\n{MARKER}",
        "state": "open",
        "html_url": f"https://github.com/{REPO}/issues/{number}",
        "updated_at": "2026-09-20T15:42:11Z",
        "user": {"id": 199001, "login": "prism[bot]", "type": "Bot"},
        "labels": [{"name": "prism"}, {"name": "severity:major"}],
        "assignees": assignees or [],
        "repository": {"id": 987654321, "full_name": REPO},
    }
    if pull:
        payload["pull_request"] = {"url": f"https://api.github.com/repos/{REPO}/pulls/{number}"}
    return payload


class GitHubIssueAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pem = _rsa_pem()
        self.clock = _Clock()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = [] if False else {}

    def _adapter(
        self,
        *,
        kind: str = "github.com",
        base_url: str = "",
        bot_user_id: str | None = "199001",
        bot_login: str | None = "prism[bot]",
    ) -> GitHubIssueAdapter:
        creds = GitHubAppCredentials(
            app_id="772215",
            installation_id="88001122",
            private_key_pem=self.pem,
            instance_kind=kind,
            base_url=base_url,
        )
        host = "ghe.example.com" if kind == "ghes" else "api.github.com"
        http = TrackerHttp(extra_hosts=(host,), sender=self._sender)
        auth = GitHubAppAuth(creds, http=http, clock=self.clock)
        self._enqueue(
            "POST",
            f"{creds.api_root}/app/installations/88001122/access_tokens",
            201,
            {
                "token": INSTALLATION_TOKEN,
                "expires_at": "2026-09-20T16:00:00Z",
                "permissions": {"issues": "write"},
            },
        )
        return GitHubIssueAdapter(
            auth, http=http, bot_user_id=bot_user_id, bot_login=bot_login
        )

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": dict(kwargs.get("headers") or {}),
                "json": kwargs.get("json"),
                "params": kwargs.get("params"),
            }
        )
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method: str, url: str, status: int, payload=None, *, headers=None) -> None:
        if payload is None:
            content = b""
        elif isinstance(payload, (dict, list)):
            content = json.dumps(payload).encode()
        else:
            content = bytes(payload)
        self._routes.setdefault((method.upper(), url), []).append(
            _Raw(status, content=content, url=url, headers=headers or {})
        )

    def test_fixture_cases_are_present(self) -> None:
        self.assertIn("F4.issue_create_pages", {case["id"] for case in F4["cases"]})
        self.assertIn("F3.ghes_base_url", {case["id"] for case in F3["cases"]})
        self.assertIn("F7.conditional_304", {case["id"] for case in F7["cases"]})
        self.assertEqual(ADAPTER_CONFORMANCE_CASES, PROTOCOL_CONFORMANCE_CASES)

    def test_capabilities_do_not_claim_conditional_writes(self) -> None:
        caps = self._adapter().capabilities()
        self.assertTrue(caps.supportsConditionalGet)
        self.assertTrue(caps.hasTransferEvents)
        self.assertEqual(caps.maxAssignees, 10)
        dumped = json.dumps(caps.to_dto())
        self.assertNotIn("If-Match", dumped)
        self.assertNotIn("conditionalWrite", dumped)

    def test_create_maps_immutable_id_separately_from_number_and_url(self) -> None:
        adapter = self._adapter()
        self._enqueue("GET", f"{API}/repos/{REPO}/labels/prism", 200, {"name": "prism"})
        self._enqueue(
            "POST",
            f"{API}/repos/{REPO}/issues",
            201,
            _issue_payload(issue_id=198400412, number=412),
            headers={"ETag": 'W/"1c3e"'},
        )
        draft = IssueDraft(
            title="[MAJOR] Stub on MGMT.D0_P",
            proseBlock="Stub on MGMT.D0_P",
            contextBlock={},
            labels=["prism"],
            assignees=[],
            marker=MARKER,
        )
        issue = adapter.create_issue(DEST, draft, "op_91a4c0de")
        self.assertIsInstance(issue, RemoteIssue)
        self.assertEqual(issue.externalId, "198400412")
        self.assertEqual(issue.number, 412)
        self.assertEqual(issue.url, "https://github.com/acme/openswitch/issues/412")
        self.assertNotEqual(issue.externalId, str(issue.number))
        self.assertEqual(issue.version.etag, 'W/"1c3e"')
        self.assertEqual(issue.version.updatedAt, "2026-09-20T15:42:11Z")
        self.assertTrue(issue.author.isBot)
        post = next(call for call in self.calls if call["method"] == "POST" and call["url"].endswith("/issues"))
        self.assertEqual(post["headers"]["Authorization"], f"Bearer {INSTALLATION_TOKEN}")
        self.assertNotIn(USER_TOKEN, json.dumps(self.calls))

    def test_assignment_failure_does_not_fail_creation(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "POST",
            f"{API}/repos/{REPO}/issues",
            201,
            _issue_payload(),
        )
        self._enqueue("GET", f"{API}/repos/{REPO}/assignees/arjun-gh", 404, {"message": "Not Found"})
        draft = IssueDraft(
            title="t",
            proseBlock="p",
            contextBlock={},
            labels=[],
            assignees=["arjun-gh"],
            marker=MARKER,
        )
        issue = adapter.create_issue(DEST, draft, "op_1")
        self.assertEqual(issue.number, 412)
        self.assertEqual(issue.externalId, "198400412")

    def test_pull_requests_are_excluded_from_discovery_and_reads(self) -> None:
        adapter = self._adapter()
        page1 = f"{API}/repos/{REPO}/issues"
        page2 = f"{API}/repos/{REPO}/issues?page=2"
        self._enqueue(
            "GET",
            page1,
            200,
            [_issue_payload(number=8, issue_id=8, pull=True), _issue_payload(number=9, issue_id=9, body="nope")],
            headers={"Link": f'<{page2}>; rel="next"'},
        )
        self._enqueue(
            "GET",
            page2,
            200,
            [_issue_payload(number=412, issue_id=198400412, body=f"found {MARKER}")],
        )
        found = adapter.find_by_marker(DEST, MARKER)
        self.assertIsNotNone(found)
        self.assertEqual(found.number, 412)
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/8",
            200,
            _issue_payload(number=8, issue_id=8, pull=True),
        )
        read = adapter.get_issue(DEST, "8")
        self.assertIsInstance(read, UncertainAbsence)

    def test_f4_issue_create_pages_follows_link_headers(self) -> None:
        adapter = self._adapter()
        page1 = f"{API}/repos/{REPO}/issues"
        page2 = f"{API}/repos/{REPO}/issues?page=2"
        page3 = f"{API}/repos/{REPO}/issues?page=3"
        self._enqueue("GET", page1, 200, [_issue_payload(number=1, issue_id=1, body="a")], headers={"Link": f'<{page2}>; rel="next"'})
        self._enqueue("GET", page2, 200, [_issue_payload(number=2, issue_id=2, body="b")], headers={"Link": f'<{page3}>; rel="next"'})
        self._enqueue("GET", page3, 200, [_issue_payload(number=412, issue_id=198400412, body=MARKER)])
        found = adapter.find_by_marker(DEST, MARKER)
        self.assertEqual(found.externalId, "198400412")
        gets = [call["url"] for call in self.calls if call["method"] == "GET" and "/issues" in call["url"]]
        self.assertEqual(len(gets), 3)

    def test_protocol_conformance_outcomes(self) -> None:
        adapter = self._adapter()
        cases = [
            (304, {"ETag": 'W/"abc"'}, NotModified),
            (404, {}, UncertainAbsence),
            (410, {}, GoneConfirmed),
            (403, {}, ForbiddenRead),
            (301, {"Location": f"{API}/repos/acme/hardware-issues/issues/9"}, Moved),
        ]
        for status, headers, kind in cases:
            self._enqueue(
                "GET",
                f"{API}/repos/{REPO}/issues/412",
                status,
                {"message": "x"},
                headers=headers,
            )
            result = adapter.get_issue(DEST, "412", etag='W/"abc"')
            self.assertIsInstance(result, kind, status)
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/412",
            401,
            {"message": "Bad credentials"},
        )
        with self.assertRaises(ProviderError) as caught:
            adapter.get_issue(DEST, "412")
        self.assertEqual(caught.exception.class_, "auth_lost")
        retry = next(case for case in PROTOCOL_CONFORMANCE_CASES if case["id"] == "F7.throttling")
        self.assertEqual(conformance_kind(retry["status"], retry_after=True), retry["expect_kind"])

    def test_update_does_not_send_if_match(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "PATCH",
            f"{API}/repos/{REPO}/issues/412",
            200,
            _issue_payload(),
        )
        adapter.update_issue(DEST, "412", IssuePatch(title="new"))
        patch = next(call for call in self.calls if call["method"] == "PATCH")
        headers = {key.casefold(): value for key, value in patch["headers"].items()}
        self.assertNotIn("if-match", headers)

    def test_get_container_resolves_pending_placeholder_by_path(self) -> None:  # TR-46 own-repo default
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}",
            200,
            {"id": 987654321, "full_name": REPO, "private": False},
        )
        pending = DEST.model_copy(update={"remoteContainerId": f"pending:{REPO}", "visibility": None})
        container = adapter.get_container(pending)
        self.assertEqual(container.remoteContainerId, "987654321")
        self.assertEqual(container.path, REPO)
        self.assertEqual(container.visibility, "public")
        self.assertFalse(any("/repositories/pending" in call["url"] for call in self.calls))

    def test_get_container_and_label_ensure(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{API}/repositories/987654321",
            200,
            {"id": 987654321, "full_name": REPO, "private": True},
        )
        container = adapter.get_container(DEST)
        self.assertEqual(container.remoteContainerId, "987654321")
        self.assertEqual(container.path, REPO)
        self.assertEqual(container.visibility, "private")
        self._enqueue("GET", f"{API}/repos/{REPO}/labels/prism", 404, {"message": "Not Found"})
        self._enqueue("POST", f"{API}/repos/{REPO}/labels", 201, {"name": "prism"})
        adapter.ensure_labels(DEST, ["prism"])
        post = next(call for call in self.calls if call["url"].endswith("/labels") and call["method"] == "POST")
        self.assertEqual(post["json"]["name"], "prism")

    def test_can_assign_false_on_404_does_not_raise(self) -> None:
        adapter = self._adapter()
        self._enqueue("GET", f"{API}/repos/{REPO}/assignees/mira", 404, {"message": "Not Found"})
        self.assertFalse(adapter.can_assign(DEST, "mira"))
        self._enqueue("GET", f"{API}/repos/{REPO}/assignees/arjun-gh", 204)
        self.assertTrue(adapter.can_assign(DEST, "arjun-gh"))

    def test_ghes_never_contacts_github_com(self) -> None:
        ghes = "https://ghe.example.com/api/v3"
        adapter = self._adapter(kind="ghes", base_url=ghes)
        self.assertEqual(adapter.capabilities().instanceKind, "ghes")
        self._enqueue(
            "GET",
            f"{ghes}/repositories/987654321",
            200,
            {"id": 987654321, "full_name": REPO, "private": False},
        )
        container = adapter.get_container(DEST)
        self.assertEqual(container.visibility, "public")
        self.assertTrue(all("github.com" not in call["url"] for call in self.calls))

    def test_list_updates_skips_pull_requests_and_preserves_page_cursor(self) -> None:
        adapter = self._adapter()
        next_url = f"{API}/repos/{REPO}/issues?page=2"
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues",
            200,
            [
                _issue_payload(number=1, issue_id=11, pull=True),
                _issue_payload(number=412, issue_id=198400412),
            ],
            headers={"Link": f'<{next_url}>; rel="next"'},
        )
        changes, cursor = adapter.list_updates(DEST, UpdateCursor(since="2026-09-20T00:00:00Z"))
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0].externalId, "198400412")
        self.assertEqual(cursor.page, next_url)

    def test_list_updates_omits_epoch_since_on_fresh_checkpoint(self) -> None:
        # github.com returns an empty list for since=1970-01-01T00:00:00Z, so a
        # fresh checkpoint would never see an issue and never advance (TR-46).
        adapter = self._adapter()
        self._enqueue("GET", f"{API}/repos/{REPO}/issues", 200, [_issue_payload(number=412, issue_id=198400412)])
        changes, cursor = adapter.list_updates(DEST, UpdateCursor(since="1970-01-01T00:00:00Z"))
        self.assertEqual([c.externalId for c in changes], ["198400412"])
        call = next(c for c in self.calls if c["url"].endswith("/issues"))
        self.assertNotIn("since", call.get("params") or {})
        self.assertGreater(cursor.since, "1970-01-01T00:00:00Z")

    def test_conditional_get_sends_if_none_match_only(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues/412",
            304,
            headers={"ETag": 'W/"1c3e"'},
        )
        result = adapter.get_issue(DEST, "412", etag='W/"1c3e"')
        self.assertIsInstance(result, NotModified)
        headers = {key.casefold(): value for key, value in self.calls[-1]["headers"].items()}
        self.assertEqual(headers.get("if-none-match"), 'W/"1c3e"')
        self.assertNotIn("if-match", headers)

    def test_recovery_scan_uses_creator_and_bot_user_id(self) -> None:
        adapter = self._adapter()
        human = _issue_payload(
            number=50,
            issue_id=50,
            body=f"copied {MARKER}",
        )
        human["user"] = {"id": 5550001, "login": "arjun-gh", "type": "User"}
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues",
            200,
            [human, _issue_payload(number=412, issue_id=198400412, body=f"found {MARKER}")],
        )
        found = adapter.find_by_marker(DEST, MARKER)
        self.assertIsNotNone(found)
        self.assertEqual(found.externalId, "198400412")
        params = self.calls[-1]["params"]
        self.assertEqual(params["creator"], "prism[bot]")
        self.assertEqual(params["state"], "all")
        self.assertNotIn("filter", params)

    def test_recovery_without_bot_identity_raises_capability_missing(self) -> None:
        adapter = self._adapter(bot_user_id="", bot_login="")
        with self.assertRaises(ProviderError) as caught:
            adapter.find_by_marker(DEST, MARKER)
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertIn("unknown", caught.exception.message.casefold())
        self.assertFalse(
            any(
                call["method"] == "GET" and "/issues" in call["url"]
                for call in self.calls
                if "access_tokens" not in call["url"]
            )
        )


if __name__ == "__main__":
    unittest.main()
