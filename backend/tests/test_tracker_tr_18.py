"""TR-18: issue and reply marker recovery (F4, F5)."""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import comments_schema_migrations  # noqa: E402
from app.services.trackers.contracts import Destination  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_auth import GitHubAppAuth, GitHubAppCredentials  # noqa: E402
from app.services.trackers.github_issues import GitHubIssueAdapter  # noqa: E402
from app.services.trackers.github_recovery import (  # noqa: E402
    RecoveryKind,
    make_issue_page_fetcher,
    mount_recovery,
    next_quarantine_at,
    quarantine_delay_minutes,
    recover_create_issue,
    recover_op,
    scan_issue_pages,
)
from app.services.trackers.http import TrackerHttp  # noqa: E402
from app.services.trackers.inbox_store import InboxStore, apply_schema as apply_inbox_schema  # noqa: E402
from app.services.trackers.markers import (  # noqa: E402
    build_marker,
    extract_markers,
    parse_marker,
    validate_marker,
)
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.scheduler import (  # noqa: E402
    DISPATCH_KIND,
    hints_applier_mounted,
    mount_hints_applier,
    reset_scheduler_throttle,
    schedule_due_tracker_jobs,
)
from app.services.trackers.store import TrackerStore  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F4 = json.loads((DOCS / "fixtures" / "F04.json").read_text(encoding="utf-8"))
F5 = json.loads((DOCS / "fixtures" / "F05.json").read_text(encoding="utf-8"))

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
APPLICATION_POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
API = "https://api.github.com"
REPO = "acme/openswitch"
DEST = Destination(
    connectorId="cn_gh1",
    containerKind="repo",
    containerPath=REPO,
    remoteContainerId="987654321",
    generation=2,
)
COMMENT_ID = "c_8f3a1b2c"
REPLY_ID = "r_91a4c0de"
OP_ID = "op_91a4c0de"
BOT_ID = "199001"
HUMAN_ID = "5550001"
MARKER = build_marker(
    connector_id=DEST.connectorId,
    container_id=DEST.remoteContainerId,
    comment_id=COMMENT_ID,
    op_id=OP_ID,
)
def _identity(url: str):
    from urllib.parse import urlsplit

    parsed = urlsplit(url)
    return (parsed.username or "", (parsed.hostname or "").lower(), parsed.port, parsed.path.lstrip("/"))


SHARED_APPLICATION_DATABASE = bool(
    POSTGRES_URL
    and APPLICATION_POSTGRES_URL
    and _identity(POSTGRES_URL) == _identity(APPLICATION_POSTGRES_URL)
)


def _dsn() -> str:
    return POSTGRES_URL.replace("postgresql+psycopg://", "postgresql://", 1)


class _Raw:
    def __init__(self, status: int, *, headers=None, content=b"", url="") -> None:
        self.status_code = status
        self.headers = headers or {}
        self.content = content
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


def _issue_payload(*, number=412, issue_id=198400412, body=None, user_id=BOT_ID, labels=None):
    return {
        "id": issue_id,
        "number": number,
        "title": "[MAJOR] Stub",
        "body": body if body is not None else f"prose\n\n{MARKER}",
        "state": "open",
        "html_url": f"https://github.com/{REPO}/issues/{number}",
        "updated_at": "2026-09-20T15:42:11Z",
        "user": {"id": int(user_id), "login": "prism[bot]" if user_id == BOT_ID else "arjun-gh", "type": "Bot" if user_id == BOT_ID else "User"},
        "labels": labels if labels is not None else [{"name": "prism"}],
        "assignees": [],
        "repository": {"id": 987654321, "full_name": REPO},
    }


class MarkerTests(unittest.TestCase):
    def test_fixture_cases_are_present(self) -> None:
        ids = {case["id"] for case in F4["cases"]}
        self.assertIn("F4.copied_marker", ids)
        self.assertIn("F4.forged_marker", ids)
        f5_ids = {case["id"] for case in F5["cases"]}
        self.assertIn("F5.incomplete_scan_no_advance", f5_ids)
        self.assertIn("F5.labels_removed_before_scan", f5_ids)

    def test_build_parse_and_validate_round_trip(self) -> None:
        text = build_marker(
            connector_id="cn_gh1",
            container_id="987654321",
            comment_id=COMMENT_ID,
            op_id=OP_ID,
        )
        parsed = parse_marker(text)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.connector_id, "cn_gh1")
        self.assertEqual(parsed.comment_id, COMMENT_ID)
        found = extract_markers(f"intro\n{text}\noutro")
        self.assertEqual(len(found), 1)
        ok = validate_marker(
            parsed,
            connector_id="cn_gh1",
            container_id="987654321",
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            author_user_id=BOT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertTrue(ok.accepted)
        self.assertEqual(ok.reason, "match")

    def test_forged_connector_is_rejected(self) -> None:  # F4.forged_marker
        parsed = parse_marker(
            build_marker(
                connector_id="cn_gh2",
                container_id=DEST.remoteContainerId,
                comment_id=COMMENT_ID,
                op_id=OP_ID,
            )
        )
        assert parsed is not None
        result = validate_marker(
            parsed,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            author_user_id=BOT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertFalse(result.accepted)
        self.assertEqual(result.reason, "connector_mismatch")

    def test_copied_marker_rejects_human_author(self) -> None:  # F4.copied_marker
        parsed = parse_marker(MARKER)
        assert parsed is not None
        result = validate_marker(
            parsed,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            author_user_id=HUMAN_ID,
            bot_user_id=BOT_ID,
        )
        self.assertFalse(result.accepted)
        self.assertEqual(result.reason, "author_not_bot")


class RecoveryScanTests(unittest.TestCase):
    def test_labels_removed_issue_is_still_found(self) -> None:  # F5.labels_removed_before_scan
        pages = {
            None: (
                [_issue_payload(number=412, labels=[])],
                None,
            )
        }

        def fetch(cursor):
            return pages[cursor]

        outcome = scan_issue_pages(
            fetch,
            marker_text=MARKER,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertEqual(outcome.kind, RecoveryKind.FOUND)
        self.assertEqual(outcome.match.external_id, "198400412")

    def test_copied_marker_issue_is_ignored_with_audit(self) -> None:  # F4.copied_marker
        pages = {
            None: (
                [_issue_payload(number=500, issue_id=500, user_id=HUMAN_ID, body=f"copied\n{MARKER}")],
                None,
            )
        }

        audited: list[tuple[str, dict]] = []

        def audit(action, detail):  # noqa: ANN001
            audited.append((action, dict(detail)))

        outcome = scan_issue_pages(
            lambda cursor: pages[cursor],
            marker_text=MARKER,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            bot_user_id=BOT_ID,
            audit=audit,
        )
        self.assertEqual(outcome.kind, RecoveryKind.NOT_FOUND)
        self.assertEqual(len(outcome.rejected), 1)
        self.assertEqual(outcome.rejected[0].reason, "author_not_bot")
        self.assertEqual(audited[0][0], "recovery_marker_rejected")

    def test_incomplete_scan_does_not_claim_not_found(self) -> None:  # F5.incomplete_scan_no_advance
        calls = {"n": 0}

        def fetch(cursor):  # noqa: ANN001
            calls["n"] += 1
            if cursor is None:
                return ([_issue_payload(number=1, issue_id=1, body="no marker")], "page-2")
            raise ProviderError("transient", "upstream 502", status=502)

        outcome = scan_issue_pages(
            fetch,
            marker_text=MARKER,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertEqual(outcome.kind, RecoveryKind.INCOMPLETE)
        self.assertEqual(calls["n"], 2)

    def test_duplicate_bot_markers_are_ambiguous(self) -> None:
        pages = {
            None: (
                [
                    _issue_payload(number=412, issue_id=412, body=f"a\n{MARKER}"),
                    _issue_payload(number=413, issue_id=413, body=f"b\n{MARKER}"),
                ],
                None,
            )
        }
        outcome = scan_issue_pages(
            lambda cursor: pages[cursor],
            marker_text=MARKER,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertEqual(outcome.kind, RecoveryKind.AMBIGUOUS)

    def test_delayed_acceptance_empty_then_found(self) -> None:  # F5.timeout_then_late_acceptance analogue
        first = scan_issue_pages(
            lambda _cursor: ([], None),
            marker_text=MARKER,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertEqual(first.kind, RecoveryKind.NOT_FOUND)
        second = scan_issue_pages(
            lambda _cursor: ([_issue_payload()], None),
            marker_text=MARKER,
            connector_id=DEST.connectorId,
            container_id=DEST.remoteContainerId,
            op_id=OP_ID,
            comment_id=COMMENT_ID,
            bot_user_id=BOT_ID,
        )
        self.assertEqual(second.kind, RecoveryKind.FOUND)

    def test_quarantine_schedule_matches_d2(self) -> None:
        self.assertEqual(quarantine_delay_minutes(0), 1)
        self.assertEqual(quarantine_delay_minutes(1), 5)
        self.assertEqual(quarantine_delay_minutes(2), 15)
        self.assertEqual(quarantine_delay_minutes(3), 60)
        self.assertEqual(quarantine_delay_minutes(9), 60)
        now = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(next_quarantine_at(0, now=now), now + timedelta(minutes=1))


class GitHubAdapterRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pem = _rsa_pem()
        self.calls: list[dict] = []
        self._routes: dict[tuple[str, str], list[_Raw]] = {}

    def _adapter(self) -> GitHubIssueAdapter:
        creds = GitHubAppCredentials(app_id="772215", installation_id="88001122", private_key_pem=self.pem)
        http = TrackerHttp(extra_hosts=("api.github.com",), sender=self._sender)
        auth = GitHubAppAuth(creds, http=http, clock=_Clock())
        self._enqueue(
            "POST",
            f"{API}/app/installations/88001122/access_tokens",
            201,
            {"token": "installation-token", "expires_at": "2026-09-20T16:00:00Z", "permissions": {"issues": "write"}},
        )
        return GitHubIssueAdapter(auth, http=http, bot_user_id=BOT_ID, bot_login="prism[bot]")

    def _sender(self, method, url, **kwargs):  # noqa: ANN001
        self.calls.append({"method": method, "url": url, "params": kwargs.get("params")})
        queued = self._routes.get((method.upper(), url))
        if not queued:
            return _Raw(404, content=b'{"message":"not found"}', url=url)
        return queued.pop(0)

    def _enqueue(self, method, url, status, payload=None, *, headers=None) -> None:
        content = json.dumps(payload).encode() if payload is not None else b""
        self._routes.setdefault((method.upper(), url), []).append(_Raw(status, content=content, url=url, headers=headers or {}))

    def test_recover_create_issue_via_adapter_fetcher(self) -> None:
        adapter = self._adapter()
        self._enqueue(
            "GET",
            f"{API}/repos/{REPO}/issues",
            200,
            [_issue_payload()],
        )
        op = {"id": OP_ID, "op": "create_issue", "sent_at": datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)}
        outcome = recover_create_issue(
            op,
            dest=DEST,
            comment_id=COMMENT_ID,
            fetch_page=make_issue_page_fetcher(adapter, DEST, since="2026-09-20T14:50:00Z"),
            bot_user_id=BOT_ID,
        )
        self.assertEqual(outcome.kind, RecoveryKind.FOUND)
        params = self.calls[-1]["params"]
        self.assertEqual(params["creator"], "prism[bot]")
        self.assertEqual(params["state"], "all")
        self.assertNotIn("labels", params)


class HintsApplierMountTests(unittest.TestCase):
    def test_import_mounts_hints_applier(self) -> None:
        mount_hints_applier(False)
        self.assertFalse(hints_applier_mounted())
        mount_recovery()
        self.assertTrue(hints_applier_mounted())


class FakeJobs:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def enqueue(self, kind, payload=None, **kwargs):  # noqa: ANN001
        job = {
            "kind": kind,
            "payload": dict(payload or {}),
            "artifact_key": kwargs.get("artifact_key"),
            "status": "queued",
            "deduplicated": False,
        }
        self.rows.append(job)
        return job


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class RecoveryPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_scheduler_throttle()
        mount_recovery()
        self.schema = f"tr18_{uuid.uuid4().hex[:12]}"
        self.conn = psycopg.connect(_dsn(), row_factory=dict_row)
        self.addCleanup(self._cleanup)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.execute(
            """
            CREATE TABLE comments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'OPEN',
                context TEXT NOT NULL DEFAULT 'PCB',
                location_x REAL NOT NULL DEFAULT 0,
                location_y REAL NOT NULL DEFAULT 0,
                location_layer TEXT NOT NULL DEFAULT '',
                location_page TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE comment_replies (
                id TEXT PRIMARY KEY,
                comment_id TEXT NOT NULL REFERENCES comments(id),
                project_id TEXT NOT NULL,
                author TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                content TEXT NOT NULL DEFAULT ''
            );
            """,
            prepare=False,
        )
        comments_schema_migrations.apply_comments_migrations(self.conn)
        migrate_workspace_tracker_tables(self.conn)
        apply_op_schema(self.conn)
        apply_inbox_schema(self.conn)
        self.conn.commit()
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)
        self.jobs = FakeJobs()

    def _cleanup(self) -> None:
        try:
            self.conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    @staticmethod
    @contextmanager
    def _factory(conn):
        yield conn

    def _seed(self) -> None:
        self.store.upsert_connector(
            connector_id=DEST.connectorId,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login="prism[bot]",
        )
        self.store.set_project_tracker(
            project_tracker_id="pt_1",
            project_id="proj_1",
            connector_id=DEST.connectorId,
            container_kind="repo",
            container_path=REPO,
            remote_container_id=DEST.remoteContainerId,
            generation=1,
        )
        self.conn.execute(
            "INSERT INTO comments(id, project_id, author, content) VALUES (%s,%s,%s,%s)",
            (COMMENT_ID, "proj_1", "Priya", "stub"),
        )
        self.store.insert_thread(
            thread_id="thr_1",
            comment_id=COMMENT_ID,
            project_tracker_id="pt_1",
            destination_generation=1,
            connector_id=DEST.connectorId,
            remote_container_id=DEST.remoteContainerId,
            external_id="",
        )
        self.ops.insert(
            op_id=OP_ID,
            tracked_thread_id="thr_1",
            op="create_issue",
            destination_generation=1,
        )
        self.conn.commit()

    def test_hint_only_destinations_enqueue_when_applier_mounted(self) -> None:
        self.store.upsert_connector(connector_id=DEST.connectorId, provider="github", instance_kind="github.com")
        self.conn.commit()
        self.inbox.enqueue(
            connector_id=DEST.connectorId,
            delivery_id="del_tr18",
            hints=[{"objectKind": "issue", "remoteContainerId": DEST.remoteContainerId, "externalId": "412", "event": "opened"}],
        )
        self.conn.commit()
        scheduled = schedule_due_tracker_jobs(
            job_service=self.jobs,
            connect=lambda: self._factory(self.conn),
            comments_schema=self.schema,
            workspace_schema=self.schema,
            force=True,
        )
        self.assertEqual(len(scheduled), 1)
        self.assertEqual(scheduled[0]["kind"], DISPATCH_KIND)

    def test_incomplete_scan_leaves_op_recovering(self) -> None:
        self._seed()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_ID, int(claimed["fence"]))
        self.ops.enter_recovery(OP_ID, int(claimed["fence"]))
        self.conn.commit()
        outcome = recover_op(
            self.ops.get(OP_ID),
            dest=DEST,
            comment_id=COMMENT_ID,
            reply_id=None,
            issue_fetch_page=lambda cursor: (_raise_502() if cursor else ([], "page-2")),
            comment_fetch_page=None,
            bot_user_id=BOT_ID,
        )
        self.assertEqual(outcome.kind, RecoveryKind.INCOMPLETE)
        row = self.ops.get(OP_ID)
        self.assertEqual(row["state"], "recovering")


def _raise_502():
    raise ProviderError("transient", "upstream 502", status=502)


if __name__ == "__main__":
    unittest.main()
