"""TR-09: provider protocols and frozen tracker DTOs (F3, F4, F7).

The fakes in this module are the conformance fixtures later adapters replay.
They import only ``app.services.trackers`` — not FastAPI routers or the UI.
"""

from __future__ import annotations

import ast
import hashlib
import hmac
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402

from app.services.trackers.capabilities import (  # noqa: E402
    ProviderCapabilities,
    github_com_capabilities,
    redact_secret,
    require_capability,
)
from app.services.trackers.contracts import (  # noqa: E402
    PROTOCOL_CONFORMANCE_CASES,
    Container,
    Destination,
    ForgeUser,
    GoneConfirmed,
    IdentityToken,
    IssueDraft,
    Moved,
    NotModified,
    PageCursor,
    RemoteChange,
    RemoteComment,
    RemoteEvent,
    RemoteHint,
    RemoteIssue,
    UncertainAbsence,
    UpdateCursor,
    assert_no_owner_repo,
)
from app.services.trackers.errors import (  # noqa: E402
    PROVIDER_ERROR_CLASSES,
    ProviderError,
    classify_read_status,
)

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
EXAMPLES = json.loads((DOCS / "dto-examples.json").read_text(encoding="utf-8"))
TRACKER = EXAMPLES["tracker"]


def _destination() -> Destination:
    return Destination.model_validate(TRACKER["Destination"])


def _issue(**overrides) -> RemoteIssue:
    payload = dict(TRACKER["RemoteIssue"])
    payload.update(overrides)
    return RemoteIssue.model_validate(payload)


def _comment(**overrides) -> RemoteComment:
    payload = dict(TRACKER["RemoteComment"])
    payload.update(overrides)
    return RemoteComment.model_validate(payload)


class _FakeIdentity:
    def authorize_url(self, state: str, pkce_challenge: str) -> str:
        return f"https://example.test/authorize?state={state}&code_challenge={pkce_challenge}&code_challenge_method=S256"

    def exchange(self, code: str, pkce_verifier: str) -> IdentityToken:
        if not pkce_verifier:
            raise ProviderError("invalid_request", "PKCE verifier required")
        return IdentityToken(accessToken="tok_live", refreshToken="ref_live", scopes=["read:user"])

    def refresh(self, token: IdentityToken) -> IdentityToken:
        return IdentityToken(accessToken="tok_refreshed", refreshToken=token.refreshToken, scopes=token.scopes)

    def whoami(self, token: IdentityToken) -> ForgeUser:
        if token.accessToken.startswith("tok_"):
            return ForgeUser(id="5550001", login="arjun-gh", isBot=False, displayName="Arjun")
        raise ProviderError("auth_lost", "token rejected", status=401)


class _FakeWebhooks:
    def register(self, dest: Destination, url: str, secret: str) -> str:
        return f"hook-{dest.remoteContainerId}"

    def verify(self, headers: dict[str, str], raw_body: bytes, secret: str) -> bool:
        digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        offered = headers.get("X-Hub-Signature-256", "")
        return hmac.compare_digest(offered, f"sha256={digest}")

    def parse(self, headers: dict[str, str], body: bytes) -> list[RemoteHint]:
        payload = json.loads(body.decode("utf-8"))
        actor = payload.get("actor")
        return [
            RemoteHint(
                connectorId=payload["connectorId"],
                deliveryId=headers["X-Delivery-Id"],
                objectKind=payload["objectKind"],
                remoteContainerId=payload["remoteContainerId"],
                externalId=str(payload["externalId"]),
                event=payload["event"],
                receivedAt=payload["receivedAt"],
                externalCommentId=payload.get("externalCommentId"),
                actor=ForgeUser.model_validate(actor) if actor else None,
            )
        ]


class _FakeTracker:
    """In-process IssueTracker. Status tables are the shared F7 fixtures."""

    kind = "fake"

    def __init__(self) -> None:
        self.dest = _destination()
        self.issue = _issue()
        self.comment = _comment()
        self._reads: dict[tuple[str, Optional[str]], int] = {}

    def capabilities(self) -> ProviderCapabilities:
        return github_com_capabilities()

    def get_container(self, dest: Destination) -> Container:
        return Container(
            remoteContainerId=dest.remoteContainerId,
            path=dest.containerPath,
            visibility=dest.visibility or "unknown",
        )

    def create_issue(self, dest: Destination, draft: IssueDraft, op_id: str) -> RemoteIssue:
        assert dest.generation == self.dest.generation
        return self.issue.model_copy(update={"body": self.issue.body + f"\n{draft.marker}"})

    def find_by_marker(self, dest: Destination, marker: str, since: Optional[str] = None):
        if marker in self.issue.body or marker in (self.issue.body or ""):
            if self.issue.author.isBot:
                return self.issue
        return None

    def get_issue(self, dest: Destination, ext_id: str, etag: Optional[str] = None):
        status = self._reads.get((ext_id, etag), 200)
        kind = classify_read_status(status, retry_after=False)
        if kind == "ok":
            return self.issue
        if kind == "not_modified":
            return NotModified(etag=etag)
        if kind == "not_found_uncertain":
            return UncertainAbsence()
        if kind == "gone_confirmed":
            return GoneConfirmed()
        if kind == "moved":
            return Moved(new_ref="acme/hardware-issues#9", new_container_id="111")
        raise ProviderError(kind, f"read failed ({status})", status=status)

    def update_issue(self, dest, ext_id, patch) -> RemoteIssue:
        return self.issue

    def set_state(self, dest, ext_id, state, note) -> RemoteIssue:
        return self.issue.model_copy(update={"state": "closed" if state == "closed" else "open"})

    def add_comment(self, dest, ext_id, body, op_id) -> RemoteComment:
        return self.comment.model_copy(update={"body": body})

    def edit_comment(self, dest, ext_cid, body) -> RemoteComment:
        return self.comment.model_copy(update={"body": body})

    def delete_comment(self, dest, ext_cid) -> None:
        return None

    def get_comment(self, dest, ext_cid, etag=None):
        return self.comment

    def list_comments(self, dest, issue, cursor=None):
        if cursor and cursor.value == "page-2":
            return [self.comment], PageCursor(value="page-3", exhausted=True)
        return [self.comment], PageCursor(value="page-2", exhausted=False)

    def find_comment_by_marker(self, dest, issue, marker):
        if marker in self.comment.body:
            return self.comment
        return None

    def list_updates(self, dest, since_cursor: UpdateCursor):
        change = RemoteChange.model_validate(TRACKER["RemoteChange"])
        return [change], UpdateCursor(since=change.observedUpdatedAt or since_cursor.since, page=None)

    def list_events(self, dest, ext_id):
        event = dict(TRACKER["RemoteEvent"])
        return [RemoteEvent.model_validate(event), RemoteEvent.model_validate({**event, "eventId": "no-actor", "actor": None})]

    def ensure_labels(self, dest, labels) -> None:
        return None

    def can_assign(self, dest, forge_login: str) -> bool:
        return True


class FrozenDtoTests(unittest.TestCase):
    def test_destination_matches_the_frozen_example_and_forbids_owner_repo(self) -> None:
        dest = _destination()
        self.assertEqual(dest.model_dump(), TRACKER["Destination"])
        assert_no_owner_repo(dest)
        self.assertNotIn("owner", Destination.model_fields)
        self.assertNotIn("repo", Destination.model_fields)
        with self.assertRaises(ValidationError):
            Destination.model_validate({**TRACKER["Destination"], "owner": "acme", "repo": "openswitch"})

    def test_capabilities_and_error_classes_match_the_packet(self) -> None:
        caps = ProviderCapabilities.model_validate(TRACKER["ProviderCapabilities"])
        self.assertEqual(caps.to_dto(), TRACKER["ProviderCapabilities"])
        self.assertEqual(list(PROVIDER_ERROR_CLASSES), TRACKER["ProviderError_classes"])
        error = ProviderError(
            TRACKER["ProviderError"]["class"],
            TRACKER["ProviderError"]["message"],
            resume_at=TRACKER["ProviderError"]["resumeAt"],
            status=TRACKER["ProviderError"]["status"],
        )
        self.assertEqual(error.to_dto()["class"], "rate_limited")
        self.assertTrue(error.retryable)
        self.assertEqual(error.to_dto()["resumeAt"], TRACKER["ProviderError"]["resumeAt"])

    def test_remote_issue_and_comment_round_trip(self) -> None:
        issue = _issue()
        comment = _comment()
        self.assertEqual(issue.author.login, "prism[bot]")
        self.assertTrue(issue.author.isBot)
        self.assertIsNone(issue.actor)
        self.assertEqual(comment.author.login, "arjun-gh")
        self.assertFalse(comment.author.isBot)
        assert_no_owner_repo(issue)
        assert_no_owner_repo(comment)

    def test_issue_draft_keeps_the_opaque_marker(self) -> None:
        draft = IssueDraft.model_validate(TRACKER["IssueDraft"])
        self.assertIn("prism:v1", draft.marker)
        self.assertEqual(draft.contextBlock.commit, "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695")


class ClassificationTests(unittest.TestCase):
    def test_conformance_cases_do_not_collapse(self) -> None:
        seen = {}
        for case in PROTOCOL_CONFORMANCE_CASES:
            kind = classify_read_status(case["status"], retry_after=case["retry_after"])
            self.assertEqual(kind, case["expect_kind"], case["id"])
            seen[case["id"]] = kind
        self.assertNotEqual(seen["F7.conditional_304"], "ok")
        self.assertNotEqual(seen["F7.private_404"], "gone_confirmed")
        self.assertNotEqual(seen["F7.gone_410"], "not_found_uncertain")
        self.assertNotEqual(seen["F7.throttling"], "forbidden")
        self.assertNotEqual(seen["F7.transfer_to_approved_container"], "ok")

    def test_provider_error_redacts_length_and_rejects_unknown_class(self) -> None:
        long = ProviderError("transient", "token=ghs_live " + ("x" * 400), status=502)
        self.assertLessEqual(len(long.message), 300)
        self.assertNotIn("ghs_live", repr(long))
        with self.assertRaises(ValueError):
            ProviderError("not_found", "nope")  # not a frozen class; would collapse 404

    def test_identity_token_never_prints_the_secret(self) -> None:
        token = IdentityToken(accessToken="gho_secret", refreshToken="ghr_secret")
        self.assertNotIn("gho_secret", repr(token))
        self.assertNotIn("ghr_secret", str(token))
        self.assertEqual(redact_secret(token.accessToken), "<redacted>")


class FakeAdapterTests(unittest.TestCase):
    """Adapters can implement the protocols without API/UI imports (acceptance)."""

    def test_fakes_do_not_import_api_or_frontend(self) -> None:
        # Full-suite discover imports API tests first, so this process's
        # sys.modules is not the tracker import graph. Inspect sources and
        # re-import tracker packages in an isolated interpreter.
        backend_root = Path(__file__).resolve().parents[1]
        forbidden_prefixes = ("app.api", "frontend", "fastapi", "starlette")
        sources = list((backend_root / "app" / "services" / "trackers").glob("*.py"))
        sources.append(Path(__file__))
        for path in sources:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            names: list[str] = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    names.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names.append(node.module)
            leaked = [
                name
                for name in names
                if any(
                    name == prefix or name.startswith(prefix + ".")
                    for prefix in forbidden_prefixes
                )
            ]
            self.assertEqual(leaked, [], msg=str(path))

        env = os.environ.copy()
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = str(backend_root) + (os.pathsep + existing if existing else "")
        probe = (
            "import sys\n"
            "from app.services.trackers import capabilities, contracts, errors\n"
            "imported = [n for n in sys.modules if n.startswith('app.api') or n.startswith('frontend')]\n"
            "raise SystemExit(1 if imported else 0)\n"
        )
        completed = subprocess.run(
            [sys.executable, "-c", probe],
            env=env,
            cwd=str(backend_root.parent),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr or completed.stdout)

    def test_identity_pkce_and_whoami(self) -> None:  # F3.oauth_pkce_required
        ident = _FakeIdentity()
        url = ident.authorize_url("state-1", "challenge")
        self.assertIn("code_challenge=challenge", url)
        token = ident.exchange("code", "verifier")
        user = ident.whoami(token)
        self.assertEqual((user.id, user.login, user.isBot), ("5550001", "arjun-gh", False))

    def test_webhook_verifies_raw_bytes_and_allows_null_actor(self) -> None:  # F7.bad_signature analogue
        hooks = _FakeWebhooks()
        dest = _destination()
        body = json.dumps({
            "connectorId": dest.connectorId,
            "objectKind": "comment",
            "remoteContainerId": dest.remoteContainerId,
            "externalId": "412",
            "event": "created",
            "receivedAt": "2026-09-20T15:42:12Z",
            "actor": None,
        }).encode("utf-8")
        secret = "whsec"
        digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        self.assertTrue(hooks.verify({"X-Hub-Signature-256": f"sha256={digest}"}, body, secret))
        self.assertFalse(hooks.verify({"X-Hub-Signature-256": "sha256=dead"}, body, secret))
        hints = hooks.parse({"X-Delivery-Id": "d1"}, body)
        self.assertIsNone(hints[0].actor)
        self.assertEqual(hints[0].externalId, "412")

    def test_get_issue_outcomes_stay_distinct(self) -> None:
        tracker = _FakeTracker()
        dest = tracker.dest
        tracker._reads[("412", None)] = 200
        self.assertIsInstance(tracker.get_issue(dest, "412"), RemoteIssue)
        tracker._reads[("412", "etag")] = 304
        self.assertIsInstance(tracker.get_issue(dest, "412", etag="etag"), NotModified)
        tracker._reads[("missing", None)] = 404
        self.assertIsInstance(tracker.get_issue(dest, "missing"), UncertainAbsence)
        tracker._reads[("gone", None)] = 410
        self.assertIsInstance(tracker.get_issue(dest, "gone"), GoneConfirmed)
        tracker._reads[("moved", None)] = 301
        moved = tracker.get_issue(dest, "moved")
        self.assertIsInstance(moved, Moved)
        self.assertTrue(moved.new_ref)
        tracker._reads[("auth", None)] = 401
        with self.assertRaises(ProviderError) as ctx:
            tracker.get_issue(dest, "auth")
        self.assertEqual(ctx.exception.class_, "auth_lost")

    def test_marker_miss_is_not_deletion(self) -> None:  # D2 / F4.copied_marker analogue
        tracker = _FakeTracker()
        self.assertIsNone(tracker.find_by_marker(tracker.dest, "<!-- prism:v1 forged -->"))
        self.assertIsNone(tracker.find_comment_by_marker(tracker.dest, "412", "no-such-marker"))

    def test_unknown_event_actor_stays_none(self) -> None:  # F4.unknown_editor_via_poll
        tracker = _FakeTracker()
        events = tracker.list_events(tracker.dest, "412")
        self.assertIsNotNone(events[0].actor)
        self.assertEqual(events[0].actor.login, "arjun-gh")
        self.assertIsNone(events[1].actor)

    def test_list_comments_is_cursor_paginated(self) -> None:  # F7.pagination_full analogue
        tracker = _FakeTracker()
        page1, cursor = tracker.list_comments(tracker.dest, "412")
        self.assertEqual(len(page1), 1)
        self.assertFalse(cursor.exhausted)
        page2, done = tracker.list_comments(tracker.dest, "412", cursor)
        self.assertTrue(done.exhausted)
        self.assertEqual(page2[0].externalCommentId, "2211044")

    def test_get_container_visibility_is_explicit(self) -> None:  # F3.unknown_visibility analogue
        tracker = _FakeTracker()
        unknown = tracker.get_container(tracker.dest.model_copy(update={"visibility": None}))
        self.assertEqual(unknown.visibility, "unknown")
        private = tracker.get_container(tracker.dest)
        self.assertEqual(private.visibility, "private")

    def test_capability_missing_does_not_look_like_success(self) -> None:
        caps = github_com_capabilities().model_copy(update={"canEditIssueBody": False})
        with self.assertRaises(ProviderError) as ctx:
            require_capability(caps, "canEditIssueBody")
        self.assertEqual(ctx.exception.class_, "capability_missing")


if __name__ == "__main__":
    unittest.main()
