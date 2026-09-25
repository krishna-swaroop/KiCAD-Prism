"""GitLab issue publishing: issue/note adapters, recovery pages and webhooks."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers import providers  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    Destination,
    ForbiddenRead,
    IssueContextBlock,
    IssueDraft,
    UncertainAbsence,
    UpdateCursor,
)
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_recovery import RecoveryKind, recover_create_issue  # noqa: E402
from app.services.trackers.gitlab_auth import GitLabBotAuth, GitLabBotCredentials  # noqa: E402
from app.services.trackers.gitlab_comments import GitLabCommentAdapter, split_comment_id  # noqa: E402
from app.services.trackers.gitlab_issues import GitLabIssueAdapter, project_ref  # noqa: E402
from app.services.trackers import gitlab_webhooks as hooks  # noqa: E402
from app.services.trackers.http import TrackerHttp  # noqa: E402
from app.services.trackers.markers import build_marker  # noqa: E402

ROOT = "https://git.example.com/api/v4"
PROJECT = f"{ROOT}/projects/77"
TOKEN = "glpat-fixture-not-a-credential"
BOT = {"id": 900, "username": "project_77_bot_1a2b", "name": "Prism"}
HUMAN = {"id": 42, "username": "ana", "name": "Ana"}
DEST = Destination(
    connectorId="cn_gl", containerKind="repo", containerPath="hw/openswitch", remoteContainerId="77", generation=1
)


class _Raw:
    def __init__(self, status: int, payload=None, *, headers=None, url: str = "") -> None:
        self.status_code = status
        self.headers = headers or {}
        self.content = json.dumps(payload if payload is not None else {}).encode()
        self.reason = "error"
        self.url = url
        self.text = self.content.decode()

    def json(self):
        return json.loads(self.content.decode())


def _issue(iid: int = 5, *, state: str = "opened", description: str = "Body", author=None) -> dict:
    return {
        "id": 5000 + iid,
        "iid": iid,
        "project_id": 77,
        "title": "Fix the TVS diode",
        "description": description,
        "state": state,
        "labels": ["prism", "severity:major"],
        "assignees": [],
        "author": author or BOT,
        "updated_at": f"2026-09-25T10:0{iid}:00Z",
        "web_url": f"https://git.example.com/hw/openswitch/-/issues/{iid}",
    }


def _note(note_id: int = 11, *, body: str = "A reply", author=None, system: bool = False) -> dict:
    return {
        "id": note_id,
        "body": body,
        "author": author or HUMAN,
        "system": system,
        "noteable_id": 5005,
        "noteable_type": "Issue",
        "created_at": "2026-09-25T10:00:00Z",
        "updated_at": "2026-09-25T10:00:00Z",
    }


class _Forge:
    """Fake GitLab: routes by (method, url without query) and records calls."""

    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.routes: dict[tuple[str, str], list[_Raw]] = {}

    def on(self, method: str, url: str, status: int, payload=None, *, headers=None) -> None:
        self.routes.setdefault((method, url), []).append(_Raw(status, payload, headers=headers, url=url))

    def send(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append({
            "method": method,
            "url": url,
            "json_body": kwargs.get("json"),
            "params": kwargs.get("params"),
            "headers": kwargs.get("headers"),
        })
        queued = self.routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, {"message": "404 Not found"}, url=url)
        return queued.pop(0)


class GitLabAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.forge = _Forge()
        http = TrackerHttp(extra_hosts=("git.example.com",), sender=self.forge.send)
        creds = GitLabBotCredentials(access_token=TOKEN, instance_kind="self-hosted", base_url="https://git.example.com")
        self.auth = GitLabBotAuth(creds, http=http)
        self.issues = GitLabIssueAdapter(self.auth, http=http, bot_user_id="900", bot_login=BOT["username"])
        self.notes = GitLabCommentAdapter(self.auth, http=http, bot_user_id="900", bot_login=BOT["username"])

    def test_create_issue_sends_description_marker_and_labels(self) -> None:
        self.forge.on("POST", f"{PROJECT}/issues", 201, _issue())
        draft = IssueDraft(
            title="Fix the TVS diode",
            proseBlock="Body",
            contextBlock=IssueContextBlock(board="openswitch"),
            marker="<!-- prism:x -->",
            labels=["prism", "severity:major"],
        )
        issue = self.issues.create_issue(DEST, draft, "op_1")
        sent = self.forge.calls[0]
        self.assertEqual(sent["json_body"]["description"], "Body\n\n<!-- prism:x -->")
        self.assertEqual(sent["json_body"]["labels"], "prism,severity:major")
        self.assertEqual(sent["headers"]["PRIVATE-TOKEN"], TOKEN)
        self.assertEqual((issue.externalId, issue.number, issue.state), ("5005", 5, "open"))
        self.assertEqual(issue.url, "https://git.example.com/hw/openswitch/-/issues/5")

    def test_pending_destination_is_addressed_by_encoded_path(self) -> None:
        pending = DEST.model_copy(update={"remoteContainerId": "pending:hw/boards/openswitch"})
        self.assertEqual(project_ref(pending), "hw%2Fboards%2Fopenswitch")
        self.assertEqual(project_ref(DEST), "77")

    def test_missing_and_forbidden_reads_are_not_issues(self) -> None:
        self.forge.on("GET", f"{PROJECT}/issues/9", 404, {"message": "404 Not found"})
        self.forge.on("GET", f"{PROJECT}/issues/8", 403, {"message": "403 Forbidden"})
        self.assertIsInstance(self.issues.get_issue(DEST, "9"), UncertainAbsence)
        self.assertIsInstance(self.issues.get_issue(DEST, "8"), ForbiddenRead)

    def test_close_uses_a_state_event(self) -> None:
        self.forge.on("PUT", f"{PROJECT}/issues/5", 200, _issue(state="closed"))
        issue = self.issues.set_state(DEST, "5", "closed", "")
        self.assertEqual(self.forge.calls[0]["json_body"], {"state_event": "close"})
        self.assertEqual(issue.state, "closed")

    def test_updates_skip_the_epoch_cursor_and_follow_link_pages(self) -> None:
        next_url = f"{PROJECT}/issues?page=2"
        self.forge.on("GET", f"{PROJECT}/issues", 200, [_issue(1), _issue(2)], headers={"link": f'<{next_url}>; rel="next"'})
        changes, cursor = self.issues.list_updates(DEST, UpdateCursor(since="1970-01-01T00:00:00Z"))
        self.assertNotIn("updated_after", self.forge.calls[0]["params"])
        self.assertEqual([change.externalId for change in changes], ["5001", "5002"])
        self.assertEqual(cursor.page, next_url)
        self.assertEqual(cursor.since, "2026-09-25T10:02:00Z")

    def test_state_events_use_close_and_reopen_names(self) -> None:
        self.forge.on("GET", f"{PROJECT}/issues/5/resource_state_events", 200, [
            {"id": 1, "state": "closed", "created_at": "2026-09-25T10:00:00Z", "user": HUMAN},
            {"id": 2, "state": "reopened", "created_at": "2026-09-25T10:05:00Z", "user": BOT},
        ])
        events = self.issues.list_events(DEST, "5")
        self.assertEqual([(e.event, e.actor.login) for e in events], [("closed", "ana"), ("reopened", BOT["username"])])
        self.assertTrue(events[1].actor.isBot)

    def test_find_by_marker_ignores_a_copied_marker(self) -> None:
        marker = "<!-- prism:op=op_1 -->"
        self.forge.on("GET", f"{PROJECT}/issues", 200, [
            _issue(1, description=f"copied {marker}", author=HUMAN),
            _issue(2, description=f"ours {marker}"),
        ])
        found = self.issues.find_by_marker(DEST, marker)
        self.assertEqual(found.number, 2)
        self.assertEqual(self.forge.calls[0]["params"]["author_id"], "900")

    def test_note_ids_carry_their_issue(self) -> None:
        self.forge.on("POST", f"{PROJECT}/issues/5/notes", 201, _note(11, author=BOT))
        remote = self.notes.add_comment(DEST, "5", "Reply", "op_2", issue_id="5005")
        self.assertEqual(remote.externalCommentId, "5:11")
        self.assertEqual((remote.externalId, remote.externalNumber), ("5005", 5))
        self.assertEqual(remote.url, "https://git.example.com/hw/openswitch/-/issues/5#note_11")
        self.assertEqual(split_comment_id("5:11"), ("5", "11"))
        with self.assertRaises(ProviderError):
            split_comment_id("11")

    def test_listing_drops_system_notes(self) -> None:
        self.forge.on("GET", f"{PROJECT}/issues/5/notes", 200, [_note(11), _note(12, body="closed", system=True)])
        comments, cursor = self.notes.list_comments(DEST, "5")
        self.assertEqual([c.externalCommentId for c in comments], ["5:11"])
        self.assertTrue(cursor.exhausted)

    def test_bot_edits_only_its_own_notes(self) -> None:
        self.forge.on("GET", f"{PROJECT}/issues/5/notes/11", 200, _note(11))
        with self.assertRaises(ProviderError) as caught:
            self.notes.edit_comment(DEST, "5:11", "hijack")
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertFalse([call for call in self.forge.calls if call["method"] == "PUT"])

    def test_system_note_reads_as_absent(self) -> None:
        self.forge.on("GET", f"{PROJECT}/issues/5/notes/12", 200, _note(12, system=True))
        self.assertIsInstance(self.notes.get_comment(DEST, "5:12"), UncertainAbsence)

    def test_recovery_finds_a_lost_issue_by_its_marker(self) -> None:
        op = {"id": "op_91a4c0de", "sent_at": None}
        marker = build_marker(connector_id="cn_gl", container_id="77", comment_id="c_1", op_id="op_91a4c0de")
        page_two = f"{PROJECT}/issues?page=2"
        self.forge.on("GET", f"{PROJECT}/issues", 200, [_issue(1)], headers={"link": f'<{page_two}>; rel="next"'})
        self.forge.on("GET", page_two, 200, [_issue(3, description=f"Body\n\n{marker}")])
        outcome = recover_create_issue(
            op,
            dest=DEST,
            comment_id="c_1",
            fetch_page=providers.issue_page_fetcher_for(self.issues, DEST),
            bot_user_id="900",
        )
        self.assertEqual(outcome.kind, RecoveryKind.FOUND)
        self.assertEqual((outcome.match.external_id, outcome.match.number), ("5003", 3))


class GitLabWebhookTests(unittest.TestCase):
    def test_token_is_compared_exactly(self) -> None:
        self.assertTrue(hooks.verify_token({"x-gitlab-token": "s3cret"}, b"{}", "s3cret"))
        self.assertFalse(hooks.verify_token({"x-gitlab-token": "s3cre"}, b"{}", "s3cret"))
        self.assertFalse(hooks.verify_token({}, b"{}", "s3cret"))
        self.assertFalse(hooks.verify_token({"x-gitlab-token": ""}, b"{}", ""))

    def test_delivery_id_prefers_the_retry_stable_key(self) -> None:
        headers = {"idempotency-key": "k-1", "x-gitlab-event-uuid": "u-1"}
        self.assertEqual(hooks.delivery_id(headers, b"{}"), "k-1")
        self.assertEqual(hooks.delivery_id({"x-gitlab-event-uuid": "u-1"}, b"{}"), "u-1")
        self.assertTrue(hooks.delivery_id({}, b'{"a":1}').startswith("sha256:"))

    def test_issue_and_note_hooks_become_hints(self) -> None:
        issue_hint = hooks.parse_gitlab_event(
            "Issue Hook",
            {"project": {"id": 77}, "object_attributes": {"iid": 5, "action": "close"}, "user": HUMAN},
            connector_id="cn_gl",
            delivery_id="d1",
        )[0]
        self.assertEqual((issue_hint["externalId"], issue_hint["event"]), ("5", "closed"))
        note_hint = hooks.parse_gitlab_event(
            "Note Hook",
            {
                "project": {"id": 77},
                "issue": {"iid": 5, "id": 5005},
                "object_attributes": {"id": 11, "noteable_type": "Issue"},
                "user": HUMAN,
            },
            connector_id="cn_gl",
            delivery_id="d2",
        )[0]
        self.assertEqual((note_hint["externalId"], note_hint["externalCommentId"]), ("5", "5:11"))

    def test_system_and_merge_request_notes_are_ignored(self) -> None:
        base = {"project": {"id": 77}, "issue": {"iid": 5}, "user": HUMAN}
        system = dict(base, object_attributes={"id": 12, "noteable_type": "Issue", "system": True})
        mr_note = dict(base, object_attributes={"id": 13, "noteable_type": "MergeRequest"})
        for payload in (system, mr_note):
            self.assertEqual(hooks.parse_gitlab_event("Note Hook", payload, connector_id="cn_gl", delivery_id="d"), [])


class GitLabKitTests(unittest.TestCase):
    def test_gitlab_publishes_issues_with_a_bot_token(self) -> None:
        kit = providers.kit_for("gitlab")
        self.assertEqual(kit.credential_payload({"access_token": TOKEN}), {"accessToken": TOKEN})
        connector = {"id": "cn_gl", "provider": "gitlab", "instance_kind": "gitlab.com", "base_url": "",
                     "bot_forge_user_id": "900", "bot_login": BOT["username"]}
        issue = providers.issue_adapter_for(connector, {"accessToken": TOKEN})
        comment = providers.comment_adapter_for(connector, issue)
        self.assertIsInstance(issue, GitLabIssueAdapter)
        self.assertIsInstance(comment, GitLabCommentAdapter)
        self.assertEqual(issue.auth.url("/user"), "https://gitlab.com/api/v4/user")


if __name__ == "__main__":
    unittest.main()


class ProjectRepositoryMatchTests(unittest.TestCase):
    def test_gitlab_paths_keep_nested_groups(self) -> None:
        from app.services.trackers.publication_policy import repo_path_for_host

        self.assertEqual(
            repo_path_for_host("https://gitlab.pixxel.io/hw/boards/openswitch.git", "gitlab.pixxel.io", provider="gitlab"),
            "hw/boards/openswitch",
        )
        self.assertEqual(
            repo_path_for_host("git@gitlab.pixxel.io:hw/openswitch.git", "gitlab.pixxel.io", provider="gitlab"),
            "hw/openswitch",
        )

    def test_a_remote_on_another_host_is_not_this_connections(self) -> None:
        from app.services.trackers.publication_policy import repo_path_for_host

        self.assertIsNone(repo_path_for_host("https://github.com/acme/openswitch", "gitlab.com", provider="gitlab"))
        self.assertIsNone(repo_path_for_host("https://github.com/acme/boards/openswitch", "github.com"))
        self.assertEqual(repo_path_for_host("https://www.github.com/acme/openswitch", "github.com"), "acme/openswitch")
