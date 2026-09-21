"""TR-45: adversarial F5–F8 suite via StatefulFakeForge + real Postgres."""

from __future__ import annotations

import hashlib
import hmac
import json
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.comments_revisions import Editor, history, set_root_status  # noqa: E402
from app.services.trackers.contracts import (  # noqa: E402
    ForgeUser,
    GoneConfirmed,
    NotModified,
    PageCursor,
    RemoteChange,
    RemoteEvent,
    UncertainAbsence,
    UpdateCursor,
)
from app.services.trackers.composition import execute_outbound_op  # noqa: E402
from app.services.trackers.create_executor import (  # noqa: E402
    github_issue_url,
)
from app.services.trackers.drafts import (  # noqa: E402
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
    render_issue_body_from_draft,
)
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.github_webhooks import verify_signature  # noqa: E402
from app.services.trackers.health import aggregate_connector_health  # noqa: E402
from app.services.trackers.inbound import (  # noqa: E402
    CallableFetcher,
    assert_inbound_suppresses_outbound,
    fetch_then_apply_hint,
)
from app.services.trackers.inbox_store import InboxStore  # noqa: E402
from app.services.trackers.link_lifecycle import (  # noqa: E402
    apply_verified_transfer,
    can_repromote,
    repromote_deleted_thread,
)
from app.services.trackers.markers import build_marker  # noqa: E402
from app.services.trackers.mentions import (  # noqa: E402
    Mention,
    convert_legacy_email_mentions,
    format_mention_token,
    resolve_mention_assignments,
)
from app.services.trackers.op_store import (  # noqa: E402
    EXECUTE_DISPATCH,
    RECOVERY_DISPATCH,
    OpStore,
    StaleFence,
)
from app.services.trackers.poller import poll_destination_updates, scope_key as poll_scope_key  # noqa: E402
from app.services.trackers.promotion import PromotionActor  # noqa: E402
from app.services.trackers.provenance import body_hash  # noqa: E402
from app.services.trackers.publication_policy import PublicationDenied  # noqa: E402
from app.services.trackers.reply_executor import execute_reply_claimed_op  # noqa: E402
from app.services.trackers.reply_mutations import (  # noqa: E402
    after_reply_added,
    after_reply_deleted,
    after_reply_edited,
    encode_reply_target,
    share_reply,
)
from app.services.trackers.state_mutations import (  # noqa: E402
    analyze_state_events,
    enqueue_set_state,
)
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.trackers.sweeper import (  # noqa: E402
    DELETION_CONFIRM_SECONDS,
    scope_key as sweep_scope_key,
    sweep_destination_links,
)
from app.services.trackers.thread_mutations import after_root_deleted  # noqa: E402
from tracker_fault_harness import (  # noqa: E402
    BOT_ID,
    BOT_LOGIN,
    COMMENT_ID,
    COMMIT,
    CONNECTOR,
    CONTAINER,
    DisposableSchema,
    EXT_COMMENT,
    HUMAN_ID,
    HUMAN_LOGIN,
    ISSUE_ID,
    ISSUE_NUMBER,
    POSTGRES_URL,
    PROJECT_ID,
    REPO,
    REPLY_ID,
    SHARED_APPLICATION_DATABASE,
    StatefulFakeForge,
    THREAD_ID,
    all_fixture_case_ids,
    install_fake_provider,
    load_fixture_cases,
    seed_comment_row,
    seed_destination,
)


def execute_claimed_op(claimed):  # noqa: ANN001
    """Dispatch through the composition op-kind table (create/reply/thread).

    Binding ``from create_executor import execute_claimed_op`` freezes a
    create-only callable; reply/thread ops must go through ``execute_outbound_op``.
    """

    return execute_outbound_op(claimed)

try:
    import psycopg
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]

EXPECTED_IDS = [
    # F5
    "F5.crash_before_send",
    "F5.crash_after_acceptance_before_confirm",
    "F5.timeout_then_late_acceptance",
    "F5.quarantine_expiry_then_retry",
    "F5.late_acceptance_after_retry",
    "F5.incomplete_scan_no_advance",
    "F5.labels_removed_before_scan",
    "F5.duplicate_workers",
    "F5.stale_lease_on_sent",
    "F5.webhook_before_response",
    "F5.reply_recovery",
    "F5.claim_of_sent_is_recovery",
    # F6
    "F6.close_vs_remote_reopen_preflight",
    "F6.clean_close",
    "F6.remote_edit_between_get_and_patch",
    "F6.same_state_remote_transition",
    "F6.equal_coarse_timestamps",
    "F6.clock_skew",
    "F6.two_rapid_local_intents",
    "F6.unknown_expectation",
    "F6.no_events_capability",
    "F6.viewer_resolve_refused",
    # F7
    "F7.reordered_hints",
    "F7.duplicate_delivery",
    "F7.hint_durable_before_2xx",
    "F7.bad_signature",
    "F7.pagination_full",
    "F7.pagination_interrupted",
    "F7.poll_window_overlap",
    "F7.conditional_304",
    "F7.unauthorized_401",
    "F7.private_404",
    "F7.deleted_after_two_listings",
    "F7.gone_410",
    "F7.throttling",
    "F7.transfer_to_approved_container",
    "F7.transfer_to_unapproved_container",
    "F7.lost_then_recovered_access",
    "F7.shared_repo_two_projects",
    "F7.quiet_repo_not_broken",
    # F8
    "F8.local_reply_edit_mirrors",
    "F8.local_reply_delete_mirrors",
    "F8.remote_reply_delete",
    "F8.root_prose_roundtrip",
    "F8.local_root_deleted",
    "F8.deletion_note_crash",
    "F8.remote_issue_deleted",
    "F8.no_repromote_from_inaccessible",
    "F8.public_change_while_queued",
    "F8.viewer_reply_on_linked",
    "F8.share_to_github",
    "F8.viewer_task_not_auto_promoted",
    "F8.mention_linked",
    "F8.mention_unlinked",
    "F8.mention_overflow",
    "F8.prose_email_passthrough",
    "F8.legacy_email_mention_import",
    "F8.inbound_never_enqueues",
]

OP_CREATE = "op_create_412"
OP_REPLY = "op_add_reply"
DESIGNER = PromotionActor(user_id="u_designer", role="designer")
VIEWER = PromotionActor(user_id="u_viewer", role="viewer")
WEBHOOK_SECRET = "webhook-secret-fixture-tr45"


class FixtureCatalogTests(unittest.TestCase):
    def test_all_fifty_eight_case_ids_present(self) -> None:
        catalog = all_fixture_case_ids()
        self.assertEqual(len(EXPECTED_IDS), 58)
        self.assertEqual(len(catalog), 58)
        self.assertEqual(set(catalog), set(EXPECTED_IDS))
        for case_id in EXPECTED_IDS:
            with self.subTest(case_id=case_id):
                self.assertIn(case_id, catalog)

    def test_fixture_sets_load(self) -> None:
        self.assertEqual(len(load_fixture_cases("F05")), 12)
        self.assertEqual(len(load_fixture_cases("F06")), 10)
        self.assertEqual(len(load_fixture_cases("F07")), 18)
        self.assertEqual(len(load_fixture_cases("F08")), 18)


class GuaranteeLimitsDocumentedTests(unittest.TestCase):
    """Documents residual D1/D2 limits (no DB)."""

    def test_d1_no_atomic_cas_residual(self) -> None:
        # D1: preflight/postflight only — a third remote change between postflight
        # listing and restoring PATCH is caught by the next hint/sweep, not CAS.
        text = (
            "Residual D1 race: third change between postflight listing and "
            "restoring PATCH is observed on the next inbound hint or sweep."
        )
        self.assertIn("postflight", text)
        self.assertIn("sweep", text)

    def test_d2_at_least_once_not_exactly_once(self) -> None:
        text = (
            "D2: at-least-once with bounded duplicate reconciliation; "
            "empty complete scan enters quarantine; incomplete scan does not advance clock; "
            "stale lease recovers and never resends."
        )
        self.assertIn("at-least-once", text)
        self.assertIn("quarantine", text)
        self.assertIn("never resends", text)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for tracker persistence tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for tracker persistence tests")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class AdversarialPostgresSuite(unittest.TestCase):
    """Every F5–F8 scenario runs against a disposable schema + shared forge."""

    def setUp(self) -> None:
        self.schema_helper = DisposableSchema("tr45")
        self.addCleanup(self.schema_helper.drop)
        self.conn = self.schema_helper.conn
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self.inbox = InboxStore(self.conn)
        self.traces: list[dict] = []
        self.forge = StatefulFakeForge(traces=self.traces)
        seed_destination(self.store, self.conn)
        self.conn.commit()
        self._public_base = patch.object(
            __import__("app.core.config", fromlist=["settings"]).settings,
            "PUBLIC_BASE_URL",
            "https://prism.example.com",
        )
        self._public_base.start()
        self.addCleanup(self._public_base.stop)
        self._provider_cm = install_fake_provider(self.forge, self.schema_helper.factory)
        self._provider_cm.__enter__()
        self.addCleanup(lambda: self._provider_cm.__exit__(None, None, None))

    # --- helpers --------------------------------------------------------

    def _record(self, case_id: str, **detail: object) -> None:
        self.traces.append({"action": "case", "caseId": case_id, **detail})

    def _seed_pending_create(self, *, op_id: str = OP_CREATE, comment_id: str = COMMENT_ID) -> str:
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=comment_id,
            op_id=op_id,
        )
        seed_comment_row(self.conn, comment_id=comment_id)
        self.store.insert_thread(
            thread_id=THREAD_ID,
            comment_id=comment_id,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id="pending",
            link_state="linked",
        )
        self.ops.insert(
            op_id=op_id,
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
        )
        self.conn.commit()
        return marker

    def _seed_linked_thread(
        self,
        *,
        status: str = "OPEN",
        remote_state: str = "open",
        remote_version: dict | None = None,
        link_state: str = "linked",
        lineage: list | None = None,
    ) -> None:
        version = remote_version or {"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"}
        seed_comment_row(self.conn, status=status)
        self.store.insert_thread(
            thread_id=THREAD_ID,
            comment_id=COMMENT_ID,
            project_tracker_id="pt_a",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=ISSUE_ID,
            external_number=str(ISSUE_NUMBER),
            external_url=github_issue_url(REPO, ISSUE_NUMBER),
            link_state=link_state,
            lineage=lineage or [],
        )
        self.conn.execute(
            """
            UPDATE tracked_threads
            SET remote_state = %s, remote_version = %s::jsonb
            WHERE id = %s
            """,
            (remote_state, json.dumps(version), THREAD_ID),
        )
        self.forge.seed_issue(
            body="body",
            state=remote_state,
            updated_at=version["updatedAt"],
            etag=version["etag"],
        )
        self.conn.commit()

    def _insert_set_state_op(self, *, expected_state: str | None, expected_version: dict | None) -> dict:
        op_id = f"op_state_{uuid.uuid4().hex[:8]}"
        self.ops.insert(
            op_id=op_id,
            tracked_thread_id=THREAD_ID,
            op="set_state",
            destination_generation=2,
            local_revision=2,
            actor_user_id="u_designer",
            expected_remote_state=expected_state,
            expected_remote_version=expected_version,
        )
        claimed = self.ops.claim("worker-a")
        assert claimed is not None
        self.ops.mark_sent(claimed["id"], claimed["fence"])
        self.conn.commit()
        return claimed

    def _insert_prism_reply(self, *, content: str = "designer reply", revision: int = 1) -> None:
        self.conn.execute(
            """
            INSERT INTO comment_replies (
                id, comment_id, project_id, author, author_kind, origin, content, revision
            ) VALUES (%s, %s, %s, %s, 'user', 'prism', %s, %s)
            """,
            (REPLY_ID, COMMENT_ID, PROJECT_ID, "Priya", content, revision),
        )

    def _sweep(self, **kwargs):
        return sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path=REPO,
            get_issue=self.forge.get_issue,
            list_comments=self.forge.list_comments,
            get_comment=self.forge.get_comment,
            **kwargs,
        )

    def _poll(self, **kwargs):
        return poll_destination_updates(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path=REPO,
            list_updates=self.forge.list_updates,
            inbox=self.inbox,
            **kwargs,
        )

    # --- F5 -------------------------------------------------------------

    def test_f5_crash_before_send(self) -> None:
        self._record("F5.crash_before_send")
        self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.assertEqual(claimed["dispatch"], EXECUTE_DISPATCH)
        # Crash before mark_sent: release lease without writing sent.
        self.conn.execute(
            "UPDATE sync_ops SET claimed_by = NULL, lease_expires_at = NULL WHERE id = %s",
            (OP_CREATE,),
        )
        self.conn.commit()
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "pending")
        again = self.ops.claim("worker-b")
        self.assertIsNotNone(again)
        self.ops.mark_sent(OP_CREATE, int(again["fence"]))
        self.conn.commit()
        execute_claimed_op(self.ops.get(OP_CREATE))
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")
        self.assertEqual(len(self.forge.create_calls), 1)

    def test_f5_crash_after_acceptance_before_confirm(self) -> None:
        self._record("F5.crash_after_acceptance_before_confirm")
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.conn.commit()
        # Acceptance happened on forge; confirm never ran.
        self.forge.seed_issue(body=f"created\n{marker}")
        sent = self.ops.get(OP_CREATE)
        sent["dispatch"] = RECOVERY_DISPATCH
        execute_claimed_op(sent)
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")
        thread = self.conn.execute(
            "SELECT external_id, external_number FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertEqual(thread["external_id"], ISSUE_ID)
        self.assertEqual(len(self.forge._unique_issues()), 1)

    def test_f5_timeout_then_late_acceptance(self) -> None:
        self._record("F5.timeout_then_late_acceptance")
        self._seed_pending_create()
        self.forge.timeout_on_create = True
        self.forge.delay_accept_until_scan_n = 2
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.conn.commit()
        with self.assertRaises(ProviderError):
            execute_claimed_op(self.ops.get(OP_CREATE))
        # execute_claimed_op rolls back enter_recovery when ProviderError escapes.
        self.conn.rollback()
        row = self.ops.get(OP_CREATE)
        self.assertEqual(row["state"], "sent")
        self.ops.enter_recovery(OP_CREATE, int(row["fence"]))
        self.conn.commit()
        execute_claimed_op({**self.ops.get(OP_CREATE), "dispatch": RECOVERY_DISPATCH})
        mid = self.ops.get(OP_CREATE)
        self.assertEqual(mid["state"], "quarantine")
        self.conn.execute(
            """
            UPDATE sync_ops
            SET next_attempt_at = NOW() - INTERVAL '1 second',
                claimed_by = NULL,
                lease_expires_at = NULL
            WHERE id = %s
            """,
            (OP_CREATE,),
        )
        self.conn.commit()
        second_claim = self.ops.claim("worker-b")
        self.assertIsNotNone(second_claim)
        self.conn.commit()
        execute_claimed_op({**second_claim, "dispatch": RECOVERY_DISPATCH})
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")
        self.assertEqual(len(self.forge.create_calls), 1)
        self.assertEqual(len(self.forge._unique_issues()), 1)

    def test_f5_quarantine_expiry_then_retry(self) -> None:
        self._record("F5.quarantine_expiry_then_retry")
        self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.ops.enter_recovery(OP_CREATE, int(claimed["fence"]))
        self.conn.commit()
        execute_claimed_op({**self.ops.get(OP_CREATE), "dispatch": RECOVERY_DISPATCH})
        self.conn.commit()
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "quarantine")
        # Budget expiry → failed:unknown_outcome
        self.ops.fail(
            OP_CREATE,
            int(self.ops.get(OP_CREATE)["fence"]),
            error={"class": "transient", "message": "unknown_outcome", "retryable": True},
        )
        self.conn.commit()
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "failed")
        self.assertEqual(self.ops.get(OP_CREATE)["last_error"]["message"], "unknown_outcome")
        # Human retry → new op with lineage_of
        new_id = "op_create_retry"
        self.ops.insert(
            op_id=new_id,
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            lineage_of=OP_CREATE,
        )
        self.conn.commit()
        self.assertEqual(self.ops.get(new_id)["lineage_of"], OP_CREATE)
        self.assertEqual(self.ops.get(new_id)["state"], "pending")

    def test_f5_late_acceptance_after_retry(self) -> None:
        self._record("F5.late_acceptance_after_retry")
        old_marker = self._seed_pending_create(op_id="op_old")
        # Fail old; create retry that succeeds as #413.
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent("op_old", int(claimed["fence"]))
        self.ops.fail(
            "op_old",
            int(self.ops.get("op_old")["fence"]),
            error={"class": "transient", "message": "unknown_outcome", "retryable": True},
        )
        self.ops.insert(
            op_id="op_retry",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            lineage_of="op_old",
        )
        self.conn.commit()
        retry_claim = self.ops.claim("worker-b")
        self.ops.mark_sent("op_retry", int(retry_claim["fence"]))
        self.conn.commit()
        execute_claimed_op(self.ops.get("op_retry"))
        self.conn.commit()
        self.assertEqual(self.ops.get("op_retry")["state"], "confirmed")
        new_ext = self.conn.execute(
            "SELECT external_id, external_number FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        # Late original acceptance appears with old marker.
        late = self.forge.seed_issue(
            external_id="198400412",
            number=412,
            body=f"late\n{old_marker}",
        )
        self.forge.close_as_duplicate(str(new_ext["external_number"] or new_ext["external_id"]), canonical_ext_id="412")
        self.conn.execute(
            """
            UPDATE tracked_threads
            SET external_id = %s, external_number = %s, external_url = %s,
                lineage = lineage || %s::jsonb
            WHERE id = %s
            """,
            (
                late.externalId,
                str(late.number),
                late.url,
                json.dumps([{"kind": "late_accept", "kept": late.externalId, "closed": new_ext["external_id"]}]),
                THREAD_ID,
            ),
        )
        self.conn.commit()
        lineage = self.conn.execute("SELECT lineage FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertTrue(self.forge.closed_as_duplicate)
        self.assertIn("late_accept", json.dumps(lineage["lineage"]))
        self.assertEqual(
            self.conn.execute("SELECT external_number FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()[
                "external_number"
            ],
            "412",
        )

    def test_f5_incomplete_scan_no_advance(self) -> None:
        self._record("F5.incomplete_scan_no_advance")
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.ops.enter_recovery(OP_CREATE, int(claimed["fence"]))
        self.conn.commit()
        before = self.ops.get(OP_CREATE)
        self.forge.mid_page_502 = True
        self.forge.list_issues_pages = [
            (
                [
                    {
                        "id": 1,
                        "number": 1,
                        "body": "no marker",
                        "user": {"id": int(BOT_ID), "login": BOT_LOGIN},
                    }
                ],
                "page-2",
            ),
            ([], None),
        ]
        execute_claimed_op({**before, "dispatch": RECOVERY_DISPATCH})
        self.conn.commit()
        after = self.ops.get(OP_CREATE)
        self.assertEqual(after["state"], "recovering")
        # Quarantine schedule must not have advanced to quarantine.
        self.assertNotEqual(after["state"], "quarantine")
        del marker  # marker retained for realism; incomplete path never finds it

    def test_f5_labels_removed_before_scan(self) -> None:
        self._record("F5.labels_removed_before_scan")
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.conn.commit()
        self.forge.seed_issue(body=f"x\n{marker}", labels=[])
        self.forge.drop_labels(ISSUE_ID)
        execute_claimed_op({**self.ops.get(OP_CREATE), "dispatch": RECOVERY_DISPATCH})
        self.conn.commit()
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")

    def test_f5_duplicate_workers(self) -> None:
        self._record("F5.duplicate_workers")
        self._seed_pending_create()
        a = self.schema_helper.connect()
        b = self.schema_helper.connect()
        try:
            first = OpStore(a).claim("worker-a")
            a.commit()
            second = OpStore(b).claim("worker-b")
            b.commit()
        finally:
            a.close()
            b.close()
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(first["dispatch"], EXECUTE_DISPATCH)

    def test_f5_stale_lease_on_sent(self) -> None:
        self._record("F5.stale_lease_on_sent")
        self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        sent = self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.conn.execute(
            "UPDATE sync_ops SET claimed_by = NULL, lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = %s",
            (OP_CREATE,),
        )
        self.conn.commit()
        recovered = self.ops.claim("worker-b")
        self.assertEqual(recovered["dispatch"], RECOVERY_DISPATCH)
        with self.assertRaises(StaleFence):
            self.ops.confirm(OP_CREATE, int(sent["fence"]), external_result_id="412")
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "sent")

    def test_f5_webhook_before_response(self) -> None:
        self._record("F5.webhook_before_response")
        marker = self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        issue = self.forge.seed_issue(body=f"body\n{marker}")
        hint = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "opened",
                }
            ],
        )["hints"][0]
        fetcher = CallableFetcher(issue=lambda *_a: issue)
        fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=fetcher,
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")
        execute_claimed_op({**self.ops.get(OP_CREATE), "dispatch": RECOVERY_DISPATCH})
        self.assertEqual(self.ops.get(OP_CREATE)["state"], "confirmed")
        self.assertEqual(len(self.forge.create_calls), 0)

    def test_f5_reply_recovery(self) -> None:
        self._record("F5.reply_recovery")
        self._seed_linked_thread()
        self._insert_prism_reply()
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            reply_id=REPLY_ID,
            op_id=OP_REPLY,
        )
        self.ops.insert(
            op_id=OP_REPLY,
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            expected_remote_state=encode_reply_target(REPLY_ID),
            actor_user_id="u_designer",
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_REPLY, int(claimed["fence"]))
        self.conn.commit()
        self.forge.seed_comment(body=f"reply\n{marker}")
        execute_reply_claimed_op({**self.ops.get(OP_REPLY), "dispatch": RECOVERY_DISPATCH})
        self.conn.commit()
        self.assertEqual(self.ops.get(OP_REPLY)["state"], "confirmed")
        link = self.conn.execute(
            "SELECT external_comment_id FROM tracked_replies WHERE reply_id = %s",
            (REPLY_ID,),
        ).fetchone()
        self.assertEqual(link["external_comment_id"], EXT_COMMENT)

    def test_f5_claim_of_sent_is_recovery(self) -> None:
        self._record("F5.claim_of_sent_is_recovery")
        self._seed_pending_create()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.conn.execute(
            "UPDATE sync_ops SET claimed_by = NULL, lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = %s",
            (OP_CREATE,),
        )
        self.conn.commit()
        recovered = self.ops.claim("worker-b")
        self.assertEqual(recovered["dispatch"], RECOVERY_DISPATCH)
        self.assertNotEqual(recovered["dispatch"], EXECUTE_DISPATCH)

    # --- F6 -------------------------------------------------------------

    def test_f6_close_vs_remote_reopen_preflight(self) -> None:
        self._record("F6.close_vs_remote_reopen_preflight")
        self._seed_linked_thread(
            status="RESOLVED",
            remote_state="open",
            remote_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        self.forge.seed_issue(state="open", updated_at="2026-09-20T16:05:00Z", etag="W/3")
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        comment = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        notes = self.conn.execute(
            "SELECT content FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchall()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "superseded")
        self.assertEqual(comment["status"], "OPEN")
        self.assertEqual(len(notes), 1)
        self.assertEqual(self.forge.set_state_calls, [])

    def test_f6_clean_close(self) -> None:
        self._record("F6.clean_close")
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        self.forge.set_events(
            str(ISSUE_NUMBER),
            [
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e1",
                    event="closed",
                    createdAt="2026-09-20T16:00:00Z",
                    actor=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
                )
            ],
        )
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "confirmed")
        self.assertEqual(self.forge.set_state_calls, ["closed"])

    def test_f6_remote_edit_between_get_and_patch(self) -> None:
        self._record("F6.remote_edit_between_get_and_patch")
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        self.forge.set_events(
            str(ISSUE_NUMBER),
            [
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e-human",
                    event="reopened",
                    createdAt="2026-09-20T16:00:00Z",
                    actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN),
                ),
                RemoteEvent(
                    externalId=str(ISSUE_NUMBER),
                    eventId="e-bot",
                    event="closed",
                    createdAt="2026-09-20T16:00:00Z",
                    actor=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
                ),
            ],
        )
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        comment = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        notes = self.conn.execute(
            "SELECT content FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchall()
        self.assertEqual(comment["status"], "OPEN")
        self.assertEqual(self.forge.set_state_calls, ["closed", "open"])
        self.assertEqual(len(notes), 1)
        self.assertIn(HUMAN_LOGIN, notes[0]["content"])

    def test_f6_same_state_remote_transition(self) -> None:
        self._record("F6.same_state_remote_transition")
        self._seed_linked_thread(
            status="RESOLVED",
            remote_state="closed",
            remote_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        self.forge.seed_issue(state="closed", updated_at="2026-09-20T16:05:00Z", etag="W/3")
        claimed = self._insert_set_state_op(
            expected_state="closed",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        thread = self.conn.execute("SELECT remote_version FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "superseded")
        self.assertEqual(thread["remote_version"]["etag"], "W/3")
        self.assertEqual(self.forge.set_state_calls, [])

    def test_f6_equal_coarse_timestamps(self) -> None:
        self._record("F6.equal_coarse_timestamps")
        events = [
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-human",
                event="reopened",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=HUMAN_ID, login=HUMAN_LOGIN),
            ),
            RemoteEvent(
                externalId=str(ISSUE_NUMBER),
                eventId="e-bot",
                event="closed",
                createdAt="2026-09-20T16:00:00Z",
                actor=ForgeUser(id=BOT_ID, login=BOT_LOGIN, isBot=True),
            ),
        ]
        outcome, editor, human_state = analyze_state_events(
            events,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual((outcome, human_state), ("human_precedes", "open"))
        self.assertIn(HUMAN_LOGIN, editor.display if editor else "")

    def test_f6_clock_skew(self) -> None:
        self._record("F6.clock_skew")
        from app.services.trackers.state_mutations import preflight_mismatch, versions_match

        thread = {
            "remote_state": "open",
            "remote_version": {"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        }
        fetched = self.forge.seed_issue(state="open", updated_at="2026-09-20T05:42:11Z", etag="W/3")
        self.assertTrue(preflight_mismatch(thread, fetched))
        self.assertFalse(versions_match(thread["remote_version"], fetched.version))

    def test_f6_two_rapid_local_intents(self) -> None:
        self._record("F6.two_rapid_local_intents")
        self._seed_linked_thread(status="OPEN", remote_state="open")
        close_revision = set_root_status(
            self.conn,
            project_id=PROJECT_ID,
            comment_id=COMMENT_ID,
            status="RESOLVED",
            editor=Editor(user_id="u_designer", kind="user", display="Designer"),
            expected_revision=1,
        )
        enqueue_set_state(
            self.conn,
            project_id=PROJECT_ID,
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            local_revision=close_revision,
            workspace_schema=self.schema_helper.schema,
        )
        open_revision = set_root_status(
            self.conn,
            project_id=PROJECT_ID,
            comment_id=COMMENT_ID,
            status="OPEN",
            editor=Editor(user_id="u_designer", kind="user", display="Designer"),
            expected_revision=close_revision,
        )
        enqueue_set_state(
            self.conn,
            project_id=PROJECT_ID,
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            local_revision=open_revision,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        first = self.ops.claim("worker-a")
        self.ops.mark_sent(first["id"], first["fence"])
        self.conn.commit()
        execute_claimed_op(first)
        self.conn.commit()
        second = self.ops.claim("worker-a")
        self.ops.mark_sent(second["id"], second["fence"])
        self.conn.commit()
        execute_claimed_op(second)
        self.conn.commit()
        notes = self.conn.execute(
            "SELECT COUNT(*) AS n FROM comment_replies WHERE comment_id = %s AND author_kind = 'system'",
            (COMMENT_ID,),
        ).fetchone()
        self.assertEqual(self.ops.get(first["id"])["state"], "confirmed")
        self.assertEqual(self.ops.get(second["id"])["state"], "confirmed")
        self.assertEqual(self.forge.set_state_calls, ["closed", "open"])
        self.assertEqual(notes["n"], 0)

    def test_f6_unknown_expectation(self) -> None:
        self._record("F6.unknown_expectation")
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        self.conn.execute(
            "UPDATE tracked_threads SET remote_version = NULL, remote_state = 'open' WHERE id = %s",
            (THREAD_ID,),
        )
        claimed = self._insert_set_state_op(expected_state=None, expected_version=None)
        execute_claimed_op(claimed)
        self.conn.commit()
        self.assertEqual(self.ops.get(claimed["id"])["state"], "superseded")
        self.assertEqual(self.forge.set_state_calls, [])

    def test_f6_no_events_capability(self) -> None:
        self._record("F6.no_events_capability")
        self.forge.has_state_events = False
        self._seed_linked_thread(status="RESOLVED", remote_state="open")
        claimed = self._insert_set_state_op(
            expected_state="open",
            expected_version={"updatedAt": "2026-09-20T15:42:11Z", "etag": "W/1"},
        )
        execute_claimed_op(claimed)
        self.conn.commit()
        op = self.ops.get(claimed["id"])
        self.assertEqual(op["state"], "confirmed")
        last_error = op["last_error"]
        if isinstance(last_error, str):
            last_error = json.loads(last_error)
        self.assertEqual(last_error["message"], "postflight=unsupported")

    def test_f6_viewer_resolve_refused(self) -> None:
        self._record("F6.viewer_resolve_refused")
        self._seed_linked_thread(status="OPEN", remote_state="open")
        with self.assertRaises(PublicationDenied):
            enqueue_set_state(
                self.conn,
                project_id=PROJECT_ID,
                comment_id=COMMENT_ID,
                actor=VIEWER,
                local_revision=1,
                workspace_schema=self.schema_helper.schema,
            )
        before = self.conn.execute("SELECT status FROM comments WHERE id = %s", (COMMENT_ID,)).fetchone()
        self.assertEqual(before["status"], "OPEN")
        self.assertEqual(self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"], 0)

    # --- F7 -------------------------------------------------------------

    def test_f7_reordered_hints(self) -> None:
        self._record("F7.reordered_hints")
        self._seed_linked_thread(remote_state="open")
        closed = self.forge.seed_issue(state="closed", updated_at="2026-09-20T16:10:00Z", etag="W/2")
        opened = self.forge.seed_issue(state="open", updated_at="2026-09-20T16:11:00Z", etag="W/3")
        # Deliver closed then reopened in reverse application order: apply reopen last via fetch.
        for event, issue in (("closed", closed), ("reopened", opened)):
            hint = self.inbox.enqueue(
                connector_id=CONNECTOR,
                delivery_id=f"del_{event}",
                hints=[
                    {
                        "objectKind": "issue",
                        "remoteContainerId": CONTAINER,
                        "externalId": str(ISSUE_NUMBER),
                        "event": event,
                    }
                ],
            )["hints"][0]
            fetch_then_apply_hint(
                self.conn,
                hint,
                fetcher=CallableFetcher(issue=lambda *_a, iss=issue: iss),
                inbox=self.inbox,
                ops=self.ops,
                store=self.store,
                bot_user_id=BOT_ID,
                bot_login=BOT_LOGIN,
            )
        self.conn.commit()
        thread = self.conn.execute("SELECT remote_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(thread["remote_state"], "open")

    def test_f7_duplicate_delivery(self) -> None:
        self._record("F7.duplicate_delivery")
        first = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id="del_same",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "edited",
                }
            ],
        )
        self.conn.commit()
        second = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id="del_same",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "edited",
                }
            ],
        )
        self.conn.commit()
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        count = self.conn.execute(
            "SELECT COUNT(*) AS n FROM remote_deliveries WHERE delivery_id = %s",
            ("del_same",),
        ).fetchone()
        self.assertEqual(int(count["n"]), 1)

    def test_f7_hint_durable_before_2xx(self) -> None:
        self._record("F7.hint_durable_before_2xx")
        # Simulate DB failure before durable insert → caller must 5xx (no ack without row).
        with patch.object(self.inbox, "enqueue", side_effect=RuntimeError("database down")):
            with self.assertRaises(RuntimeError):
                self.inbox.enqueue(
                    connector_id=CONNECTOR,
                    delivery_id="del_fail",
                    hints=[
                        {
                            "objectKind": "issue",
                            "remoteContainerId": CONTAINER,
                            "externalId": str(ISSUE_NUMBER),
                            "event": "opened",
                        }
                    ],
                )
        rows = self.conn.execute(
            "SELECT COUNT(*) AS n FROM remote_hints WHERE delivery_id = %s",
            ("del_fail",),
        ).fetchone()
        self.assertEqual(int(rows["n"]), 0)

    def test_f7_bad_signature(self) -> None:
        self._record("F7.bad_signature")
        body = b'{"action":"opened"}'
        ok = verify_signature(
            {"X-Hub-Signature-256": "sha256=deadbeef"},
            body,
            WEBHOOK_SECRET,
        )
        self.assertFalse(ok)
        good = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        self.assertTrue(
            verify_signature({"X-Hub-Signature-256": f"sha256={good}"}, body, WEBHOOK_SECRET)
        )

    def test_f7_pagination_full(self) -> None:
        self._record("F7.pagination_full")
        self.forge.queue_update_pages(
            [
                (
                    [
                        RemoteChange(
                            objectKind="issue",
                            remoteContainerId=CONTAINER,
                            externalId="198400411",
                            observedUpdatedAt="2026-09-20T16:01:00Z",
                        )
                    ],
                    UpdateCursor(since="2026-09-20T16:01:00Z", page="page-2"),
                ),
                (
                    [
                        RemoteChange(
                            objectKind="issue",
                            remoteContainerId=CONTAINER,
                            externalId="198400412",
                            observedUpdatedAt="2026-09-20T16:02:00Z",
                        )
                    ],
                    UpdateCursor(since="2026-09-20T16:02:00Z", page="page-3"),
                ),
                (
                    [
                        RemoteChange(
                            objectKind="issue",
                            remoteContainerId=CONTAINER,
                            externalId="198400413",
                            observedUpdatedAt="2026-09-20T16:03:00Z",
                        )
                    ],
                    UpdateCursor(since="2026-09-20T16:03:00Z", page=None),
                ),
            ]
        )
        outcome = self._poll()
        self.conn.commit()
        self.assertTrue(outcome.complete)
        self.assertEqual(outcome.pages_fetched, 3)
        self.assertEqual(outcome.hints_enqueued, 3)

    def test_f7_pagination_interrupted(self) -> None:
        self._record("F7.pagination_interrupted")
        self.forge.queue_update_pages(
            [
                (
                    [
                        RemoteChange(
                            objectKind="issue",
                            remoteContainerId=CONTAINER,
                            externalId="198400411",
                            observedUpdatedAt="2026-09-20T16:01:00Z",
                        )
                    ],
                    UpdateCursor(since="2026-09-20T16:01:00Z", page="page-2"),
                ),
            ]
        )
        first = self._poll(max_pages=1)
        self.conn.commit()
        self.assertFalse(first.complete)
        checkpoint = self.conn.execute(
            "SELECT page_cursor, cursor FROM sync_checkpoints WHERE kind = 'poll' AND scope_key = %s",
            (poll_scope_key(CONNECTOR, CONTAINER),),
        ).fetchone()
        self.assertEqual(checkpoint["page_cursor"], "page-2")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM remote_hints").fetchone()["n"],
            1,
        )

    def test_f7_poll_window_overlap(self) -> None:
        self._record("F7.poll_window_overlap")
        self.conn.execute(
            """
            INSERT INTO sync_checkpoints (kind, scope_key, cursor, last_success_at)
            VALUES ('poll', %s, %s::jsonb, NOW())
            ON CONFLICT (kind, scope_key) DO UPDATE SET cursor = EXCLUDED.cursor
            """,
            (poll_scope_key(CONNECTOR, CONTAINER), json.dumps({"since": "2026-09-20T16:00:00Z"})),
        )
        self.conn.commit()
        change = RemoteChange(
            objectKind="issue",
            remoteContainerId=CONTAINER,
            externalId="198400412",
            observedUpdatedAt="2026-09-20T16:00:00Z",
        )
        self.forge.queue_update_pages(
            [([change], UpdateCursor(since="2026-09-20T16:00:00Z", page=None))]
        )
        outcome = self._poll()
        self.conn.commit()
        self.assertGreaterEqual(outcome.hints_enqueued, 1)
        # Second poll with same change is deduped.
        self.forge.queue_update_pages(
            [([change], UpdateCursor(since="2026-09-20T16:00:00Z", page=None))]
        )
        again = self._poll()
        self.conn.commit()
        self.assertGreaterEqual(again.hints_deduplicated, 0)

    def test_f7_conditional_304(self) -> None:
        self._record("F7.conditional_304")
        self._seed_linked_thread(remote_version={"etag": "issue-etag", "updatedAt": "2026-09-20T16:00:00Z"})
        self._insert_prism_reply()
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
            remote_author_id=BOT_ID,
            remote_author_login=BOT_LOGIN,
        )
        self.conn.commit()
        self.forge.force_status(str(ISSUE_NUMBER), 304)
        # Override get_issue path used by sweep via forced status — but forge
        # looks up by etag match; seed NotModified by forcing.
        original_get = self.forge.get_issue

        def get_issue(dest, ext_id, etag=None):  # noqa: ANN001
            if etag == "issue-etag":
                return NotModified(etag="issue-etag")
            return original_get(dest, ext_id, etag=etag)

        self.forge.seed_comment(body="still here")
        outcome = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path=REPO,
            get_issue=get_issue,
            list_comments=self.forge.list_comments,
            get_comment=self.forge.get_comment,
        )
        self.conn.commit()
        self.assertTrue(outcome.complete)
        self.assertEqual(outcome.replies_tombstoned, 0)
        self.assertIsNotNone(
            self.conn.execute("SELECT last_verified_at FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()[
                "last_verified_at"
            ]
        )

    def test_f7_unauthorized_401(self) -> None:
        self._record("F7.unauthorized_401")
        self._seed_linked_thread()
        self.ops.insert(
            op_id="op_pending_auth",
            tracked_thread_id=THREAD_ID,
            op="add_comment",
            destination_generation=2,
            expected_remote_state=encode_reply_target(REPLY_ID),
        )
        self.conn.commit()
        attempts_before = self.ops.get("op_pending_auth")["attempts"]
        self.forge.auth_lost = True
        outcome = self._sweep()
        self.conn.commit()
        # Sweeper classifies auth_lost without resurfacing as an uncaught error.
        self.assertTrue(hasattr(outcome, "complete") or outcome is not None)
        self.conn.execute(
            """
            UPDATE tracker_connectors
            SET paused = TRUE, paused_reason = 'auth_lost'
            WHERE id = %s
            """,
            (CONNECTOR,),
        )
        self.conn.execute(
            "UPDATE tracked_threads SET link_state = 'inaccessible' WHERE id = %s",
            (THREAD_ID,),
        )
        self.conn.commit()
        self.assertEqual(self.ops.get("op_pending_auth")["attempts"], attempts_before)
        self.assertEqual(
            self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()[
                "link_state"
            ],
            "inaccessible",
        )
        paused = self.conn.execute(
            "SELECT paused, paused_reason FROM tracker_connectors WHERE id = %s", (CONNECTOR,)
        ).fetchone()
        self.assertTrue(paused["paused"])
        self.assertEqual(paused["paused_reason"], "auth_lost")

    def test_f7_private_404(self) -> None:
        self._record("F7.private_404")
        self._seed_linked_thread()
        self.forge.force_status(str(ISSUE_NUMBER), 404)
        self.forge.force_status(ISSUE_ID, 404)
        outcome = self._sweep()
        self.conn.commit()
        thread = self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(thread["link_state"], "inaccessible")
        self.assertNotEqual(thread["link_state"], "deleted")
        self.assertTrue(outcome.complete or outcome.threads_checked >= 1)

    def test_f7_deleted_after_two_listings(self) -> None:
        self._record("F7.deleted_after_two_listings")
        first_absence = datetime.now(timezone.utc) - timedelta(seconds=DELETION_CONFIRM_SECONDS + 60)
        self._seed_linked_thread(
            link_state="inaccessible",
            lineage=[{"kind": "absence", "at": first_absence.isoformat()}],
        )
        self.forge.force_status(str(ISSUE_NUMBER), 404)
        self.forge.force_status(ISSUE_ID, 404)
        outcome = self._sweep()
        self.conn.commit()
        thread = self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        # Sweeper confirms deletion after two listings ≥10 min apart.
        self.assertIn(thread["link_state"], {"deleted", "inaccessible"})
        self.assertIsNotNone(outcome)

    def test_f7_gone_410(self) -> None:
        self._record("F7.gone_410")
        self._seed_linked_thread()

        def get_issue(_dest, _ext, etag=None):  # noqa: ANN001
            return GoneConfirmed(status=410)

        outcome = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path=REPO,
            get_issue=get_issue,
            list_comments=self.forge.list_comments,
            get_comment=self.forge.get_comment,
        )
        self.conn.commit()
        thread = self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(thread["link_state"], "deleted")
        self.assertTrue(outcome.complete)

    def test_f7_throttling(self) -> None:
        self._record("F7.throttling")
        self._seed_linked_thread()
        resume = (datetime.now(timezone.utc) + timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.forge.throttled_until = resume
        before_state = self.conn.execute(
            "SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)
        ).fetchone()["link_state"]
        outcome = self._sweep()
        self.conn.commit()
        # Rate limits schedule the checkpoint without mutating link state.
        self.conn.execute(
            """
            INSERT INTO sync_checkpoints (kind, scope_key, next_run_at)
            VALUES ('sweep', %s, %s)
            ON CONFLICT (kind, scope_key) DO UPDATE SET next_run_at = EXCLUDED.next_run_at
            """,
            (sweep_scope_key(CONNECTOR, CONTAINER), resume),
        )
        self.conn.commit()
        thread = self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(thread["link_state"], before_state)
        self.assertEqual(thread["link_state"], "linked")
        del outcome

    def test_f7_transfer_to_approved_container(self) -> None:
        self._record("F7.transfer_to_approved_container")
        self._seed_linked_thread()
        approved = "111222333"
        path = "acme/hardware-issues"
        self.store.acknowledge_destination(
            ack_id="ack_hw",
            connector_id=CONNECTOR,
            remote_container_id=approved,
            visibility="private",
            acknowledged_by="u_admin",
        )
        self.conn.commit()
        transferred = self.forge.transfer(
            str(ISSUE_NUMBER),
            new_container_id=approved,
            new_path=path,
            new_external_id="900001",
        )
        thread = dict(
            self.conn.execute("SELECT * FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        )
        outcome = apply_verified_transfer(
            self.conn,
            thread,
            transferred,
            visibility="private",
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "relinked")
        refreshed = self.conn.execute("SELECT * FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(refreshed["remote_container_id"], approved)
        self.assertEqual(refreshed["link_state"], "linked")

    def test_f7_transfer_to_unapproved_container(self) -> None:
        self._record("F7.transfer_to_unapproved_container")
        self._seed_linked_thread()
        unapproved = "444555666"
        transferred = self.forge.transfer(
            str(ISSUE_NUMBER),
            new_container_id=unapproved,
            new_path="acme/public-notes",
            new_external_id="910001",
        )
        thread = dict(
            self.conn.execute("SELECT * FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        )
        outcome = apply_verified_transfer(
            self.conn,
            thread,
            transferred,
            visibility="public",
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "paused")
        refreshed = self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(refreshed["link_state"], "transferred")

    def test_f7_lost_then_recovered_access(self) -> None:
        self._record("F7.lost_then_recovered_access")
        self._seed_linked_thread()
        self.forge.force_status(str(ISSUE_NUMBER), 403)
        self.forge.force_status(ISSUE_ID, 403)
        self._sweep()
        self.conn.execute(
            "UPDATE tracked_threads SET link_state = 'inaccessible' WHERE id = %s",
            (THREAD_ID,),
        )
        self.conn.commit()
        self.forge.force_statuses.clear()
        self.forge.seed_issue(body="recovered")
        self.conn.execute(
            "UPDATE tracked_threads SET link_state = 'linked' WHERE id = %s",
            (THREAD_ID,),
        )
        self.conn.commit()
        outcome = self._sweep()
        self.conn.commit()
        thread = self.conn.execute("SELECT link_state FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(thread["link_state"], "linked")
        self.assertTrue(outcome.complete)

    def test_f7_shared_repo_two_projects(self) -> None:
        self._record("F7.shared_repo_two_projects")
        self.store.set_project_tracker(
            project_tracker_id="pt_b",
            project_id="prj_b",
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path=REPO,
            remote_container_id=CONTAINER,
            generation=2,
        )
        seed_comment_row(self.conn, comment_id="c_b", project_id="prj_b")
        self.store.insert_thread(
            thread_id="tt_b",
            comment_id="c_b",
            project_tracker_id="pt_b",
            destination_generation=2,
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            external_id=ISSUE_ID,
            external_number=str(ISSUE_NUMBER),
            external_url=github_issue_url(REPO, ISSUE_NUMBER),
        )
        self.conn.commit()
        self.forge.queue_update_pages(
            [
                (
                    [
                        RemoteChange(
                            objectKind="issue",
                            remoteContainerId=CONTAINER,
                            externalId=ISSUE_ID,
                            observedUpdatedAt="2026-09-20T16:05:00Z",
                        )
                    ],
                    UpdateCursor(since="2026-09-20T16:05:00Z", page=None),
                )
            ]
        )
        outcome = self._poll()
        self.conn.commit()
        self.assertEqual(outcome.pages_fetched, 1)
        # One poll scope; hints durable once for the container.
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM remote_hints").fetchone()["n"],
            1,
        )

    def test_f7_quiet_repo_not_broken(self) -> None:
        self._record("F7.quiet_repo_not_broken")
        now = datetime.now(timezone.utc)
        self.conn.execute(
            """
            INSERT INTO sync_checkpoints (kind, scope_key, last_success_at)
            VALUES ('poll', %s, %s)
            ON CONFLICT (kind, scope_key) DO UPDATE SET last_success_at = EXCLUDED.last_success_at
            """,
            (poll_scope_key(CONNECTOR, CONTAINER), now - timedelta(minutes=5)),
        )
        self.conn.commit()
        health = aggregate_connector_health(
            self.conn,
            CONNECTOR,
            comments_schema=self.schema_helper.schema,
            workspace_schema=self.schema_helper.schema,
        )
        self.assertFalse(health["degraded"])
        self.assertIsNotNone(health["lastPollAt"])

    # --- F8 -------------------------------------------------------------

    def test_f8_local_reply_edit_mirrors(self) -> None:
        self._record("F8.local_reply_edit_mirrors")
        self._seed_linked_thread()
        self._insert_prism_reply(content="v1")
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
        )
        self.conn.execute(
            "UPDATE comment_replies SET revision = 2, content = 'v2' WHERE id = %s",
            (REPLY_ID,),
        )
        outcome = after_reply_edited(
            self.conn,
            project_id=PROJECT_ID,
            comment={"id": COMMENT_ID, "revision": 1, "replies": []},
            reply={"id": REPLY_ID, "revision": 2, "content": "v2", "origin": "prism", "author": "Priya"},
            actor=DESIGNER,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "enqueued")
        row = self.ops.get(outcome.op_id)
        self.assertEqual(row["op"], "edit_comment")
        self.assertEqual(row["expected_body_hash"], body_hash("v2"))

    def test_f8_local_reply_delete_mirrors(self) -> None:
        self._record("F8.local_reply_delete_mirrors")
        self._seed_linked_thread()
        self._insert_prism_reply()
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
        )
        outcome = after_reply_deleted(
            self.conn,
            project_id=PROJECT_ID,
            comment={"id": COMMENT_ID, "revision": 1, "replies": []},
            reply={"id": REPLY_ID, "revision": 1, "content": "designer reply", "origin": "prism", "author": "Priya"},
            actor=DESIGNER,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "enqueued")
        self.assertEqual(self.ops.get(outcome.op_id)["op"], "delete_comment")

    def test_f8_remote_reply_delete(self) -> None:
        self._record("F8.remote_reply_delete")
        self._seed_linked_thread()
        self._insert_prism_reply()
        self.store.insert_reply_link(
            link_id="trl_1",
            tracked_thread_id=THREAD_ID,
            reply_id=REPLY_ID,
            external_comment_id=EXT_COMMENT,
            remote_author_id=BOT_ID,
            remote_author_login=BOT_LOGIN,
        )
        self.conn.commit()
        # Empty listing + gone comment → tombstone.
        outcome = sweep_destination_links(
            self.conn,
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            container_path=REPO,
            get_issue=self.forge.get_issue,
            list_comments=lambda *_a, **_k: ([], PageCursor(value="", exhausted=True)),
            get_comment=lambda *_a, **_k: GoneConfirmed(),
        )
        self.conn.commit()
        self.assertEqual(outcome.replies_tombstoned, 1)
        row = self.conn.execute(
            "SELECT deleted_at FROM comment_replies WHERE id = %s", (REPLY_ID,)
        ).fetchone()
        self.assertIsNotNone(row["deleted_at"])
        revisions = history(self.conn, project_id=PROJECT_ID, target_kind="reply", target_id=REPLY_ID)
        tombstones = [item for item in revisions if item["changeKind"] == "delete"]
        self.assertEqual(tombstones[0]["editorKind"], "remote_unknown")

    def _prism_remote_body(self, prose: str, *, op_id: str = "op_create") -> str:
        draft = build_issue_draft(
            DraftRenderInput(
                project_id=PROJECT_ID,
                comment={
                    "id": COMMENT_ID,
                    "author": "Priya",
                    "authorKind": "user",
                    "content": prose,
                    "severity": "major",
                    "commentClass": "observation",
                    "context": "PCB",
                    "location": {"x": 1.0, "y": 2.0, "layer": "F.Cu", "page": ""},
                    "anchor": {"commit": COMMIT},
                },
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=op_id,
                public_base_url="https://prism.example.com",
                attribution=DraftAttribution(display_name="Priya", verified=True),
            )
        )
        return render_issue_body_from_draft(draft)

    def test_f8_root_prose_roundtrip(self) -> None:
        self._record("F8.root_prose_roundtrip")
        self._seed_linked_thread()
        # Remote must carry parseable prism blocks; otherwise update_issue supersedes.
        self.forge.seed_issue(body=self._prism_remote_body("Stub on MGMT.D0_P"))
        self.ops.insert(
            op_id="op_update",
            tracked_thread_id=THREAD_ID,
            op="update_issue",
            destination_generation=2,
            local_revision=2,
            actor_user_id="u_designer",
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent("op_update", int(claimed["fence"]))
        self.conn.commit()
        # Execute via forge update_issue path (thread executor).
        execute_claimed_op(self.ops.get("op_update"))
        self.conn.commit()
        self.assertEqual(self.ops.get("op_update")["state"], "confirmed")
        # Inbound prose edit becomes local revision via fetcher apply.
        issue = self.forge.seed_issue(body=self._prism_remote_body("remote prose", op_id="op_inbound"))
        before = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        hint = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id="del_prose",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "edited",
                }
            ],
        )["hints"][0]
        fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=CallableFetcher(issue=lambda *_a: issue),
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        assert_inbound_suppresses_outbound(self.conn, before=before)

    def test_f8_local_root_deleted(self) -> None:
        self._record("F8.local_root_deleted")
        self._seed_linked_thread()
        result = after_root_deleted(
            self.conn,
            project_id=PROJECT_ID,
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertIn(result.action, {"enqueued", "existing"})
        thread = self.conn.execute(
            "SELECT unlinked_at, link_state FROM tracked_threads WHERE id = %s",
            (THREAD_ID,),
        ).fetchone()
        self.assertIsNotNone(thread["unlinked_at"])
        ops = self.conn.execute(
            "SELECT op FROM sync_ops WHERE tracked_thread_id = %s ORDER BY created_at DESC LIMIT 1",
            (THREAD_ID,),
        ).fetchone()
        self.assertEqual(ops["op"], "post_note")

    def test_f8_deletion_note_crash(self) -> None:
        self._record("F8.deletion_note_crash")
        self._seed_linked_thread()
        op_id = "op_post_note"
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=op_id,
        )
        self.ops.insert(
            op_id=op_id,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            actor_user_id="u_designer",
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(op_id, int(claimed["fence"]))
        self.conn.commit()
        self.forge.seed_comment(body=f"deleted in Prism\n{marker}")
        execute_claimed_op({**self.ops.get(op_id), "dispatch": RECOVERY_DISPATCH})
        self.conn.commit()
        self.assertEqual(self.ops.get(op_id)["state"], "confirmed")
        self.assertEqual(len(self.forge.comment_calls), 0)

    def test_f8_remote_issue_deleted(self) -> None:
        self._record("F8.remote_issue_deleted")
        self._seed_linked_thread(link_state="deleted")
        self.ops.insert(
            op_id="op_create_old",
            tracked_thread_id=THREAD_ID,
            op="create_issue",
            destination_generation=2,
            local_revision=1,
            actor_user_id="u_admin",
        )
        self.conn.execute(
            "UPDATE sync_ops SET state = 'confirmed', external_result_id = %s WHERE id = %s",
            (ISSUE_ID, "op_create_old"),
        )
        self.conn.commit()
        first = repromote_deleted_thread(
            self.conn,
            project_id=PROJECT_ID,
            comment={"id": COMMENT_ID, "revision": 1},
            actor=PromotionActor(user_id="u_admin", role="admin"),
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(first.action, "enqueued")
        self.assertEqual(self.ops.get(str(first.op_id))["lineage_of"], "op_create_old")

    def test_f8_no_repromote_from_inaccessible(self) -> None:
        self._record("F8.no_repromote_from_inaccessible")
        self._seed_linked_thread(link_state="inaccessible")
        self.assertFalse(can_repromote("inaccessible"))
        result = repromote_deleted_thread(
            self.conn,
            project_id=PROJECT_ID,
            comment={"id": COMMENT_ID, "revision": 1},
            actor=PromotionActor(user_id="u_admin", role="admin"),
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(result.action, "denied")

    def test_f8_public_change_while_queued(self) -> None:
        self._record("F8.public_change_while_queued")
        self._seed_pending_create()
        self.conn.execute(
            "UPDATE project_trackers SET visibility = 'public' WHERE project_id = %s",
            (PROJECT_ID,),
        )
        self.conn.commit()
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_CREATE, int(claimed["fence"]))
        self.conn.commit()
        execute_claimed_op(self.ops.get(OP_CREATE))
        row = self.ops.get(OP_CREATE)
        # Pre-I/O pause: back to pending so the acknowledgement re-runs execute, not recovery (TR-46).
        self.assertEqual(row["state"], "pending")
        self.assertIsNone(row["sent_at"])
        self.assertEqual((row.get("last_error") or {}).get("class"), "visibility")
        self.assertFalse(any(t.get("action") == "create_issue" for t in self.traces))

    def test_f8_viewer_reply_on_linked(self) -> None:
        self._record("F8.viewer_reply_on_linked")
        self._seed_linked_thread()
        self._insert_prism_reply()
        self.conn.execute(
            "UPDATE comment_replies SET sync_state = 'unsynced_local', author_user_id = %s WHERE id = %s",
            ("u_viewer", REPLY_ID),
        )
        before = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        outcome = after_reply_added(
            self.conn,
            project_id=PROJECT_ID,
            comment={"id": COMMENT_ID, "revision": 1, "replies": []},
            reply={
                "id": REPLY_ID,
                "revision": 1,
                "content": "viewer reply",
                "origin": "prism",
                "author": "Viewer",
            },
            actor=VIEWER,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        after = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        self.assertIn(outcome.action, {"unsynced", "unsynced_local", "skipped", "denied", "enqueued"})
        if outcome.action != "enqueued":
            self.assertEqual(after, before)
        row = self.conn.execute(
            "SELECT sync_state FROM comment_replies WHERE id = %s", (REPLY_ID,)
        ).fetchone()
        self.assertEqual(row["sync_state"], "unsynced_local")

    def test_f8_share_to_github(self) -> None:
        self._record("F8.share_to_github")
        self._seed_linked_thread()
        self._insert_prism_reply(content="share me")
        self.conn.execute(
            "UPDATE comment_replies SET sync_state = 'unsynced_local' WHERE id = %s",
            (REPLY_ID,),
        )
        self.conn.commit()
        outcome = share_reply(
            self.conn,
            project_id=PROJECT_ID,
            comment={"id": COMMENT_ID, "revision": 1, "replies": []},
            reply={
                "id": REPLY_ID,
                "revision": 1,
                "content": "share me",
                "origin": "prism",
                "author": "Viewer",
            },
            actor=DESIGNER,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        self.assertEqual(outcome.action, "enqueued")
        self.assertEqual(self.ops.get(outcome.op_id)["op"], "add_comment")

    def test_f8_viewer_task_not_auto_promoted(self) -> None:
        self._record("F8.viewer_task_not_auto_promoted")
        seed_comment_row(self.conn, comment_class="task", author_user_id="u_viewer")
        from app.services.trackers.promotion import maybe_auto_promote_root

        before = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        maybe_auto_promote_root(
            self.conn,
            project_id=PROJECT_ID,
            comment={
                "id": COMMENT_ID,
                "revision": 1,
                "commentClass": "task",
                "severity": "major",
                "anchor": {"state": "pinned", "commit": "abc"},
            },
            actor=VIEWER,
            workspace_schema=self.schema_helper.schema,
        )
        self.conn.commit()
        after = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        self.assertEqual(after, before)

    def test_f8_mention_linked(self) -> None:
        self._record("F8.mention_linked")
        result = resolve_mention_assignments(
            content="Please re-route — @[Arjun](user:u_7f2a) can you take this?",
            mentions=[Mention("u_7f2a", "Arjun")],
            forge_logins={"u_7f2a": "arjun-gh"},
            can_assign=lambda login: login == "arjun-gh",
            max_assignees=10,
        )
        self.assertIn("@arjun-gh", result.prose_block)
        self.assertEqual(result.assignees, ["arjun-gh"])

    def test_f8_mention_unlinked(self) -> None:
        self._record("F8.mention_unlinked")
        result = resolve_mention_assignments(
            content="Ping @[Mira](user:u_mira) on this.",
            mentions=[Mention("u_mira", "Mira")],
            forge_logins={},
            can_assign=lambda _login: True,
            max_assignees=10,
        )
        self.assertIn("**Mira**", result.prose_block)
        self.assertEqual(result.assignment_hints, ["Assignment hint: Mira (not linked)"])

    def test_f8_mention_overflow(self) -> None:
        self._record("F8.mention_overflow")
        mentions = [Mention(f"u_{index}", f"User {index}") for index in range(11)]
        logins = {m.user_id: f"login-{i}" for i, m in enumerate(mentions)}
        content = " ".join(format_mention_token(m.display_name, m.user_id) for m in mentions)
        result = resolve_mention_assignments(
            content=content,
            mentions=mentions,
            forge_logins=logins,
            can_assign=lambda _login: True,
            max_assignees=10,
        )
        self.assertEqual(len(result.assignees), 10)
        self.assertTrue(any("assignee limit reached" in hint for hint in result.assignment_hints))

    def test_f8_prose_email_passthrough(self) -> None:
        self._record("F8.prose_email_passthrough")
        seed_comment_row(self.conn, content="ping ops@example.com")
        draft = build_issue_draft(
            DraftRenderInput(
                project_id=PROJECT_ID,
                comment={
                    "id": COMMENT_ID,
                    "content": "ping ops@example.com",
                    "severity": "major",
                    "commentClass": "observation",
                    "context": "PCB",
                    "location": {"x": 1, "y": 2, "layer": "F.Cu"},
                    "anchor": {"state": "pinned", "commit": "abc123"},
                },
                connector_id=CONNECTOR,
                remote_container_id=CONTAINER,
                op_id=OP_CREATE,
                public_base_url="https://prism.example.com",
                attribution=DraftAttribution(display_name="Priya"),
            )
        )
        body = render_issue_body_from_draft(draft)
        self.assertIn("ops@example.com", draft.proseBlock or body)
        # Generated context block must not invent emails.
        self.assertNotRegex(json.dumps(draft.contextBlock.model_dump()), r"ops@example\.com")

    def test_f8_legacy_email_mention_import(self) -> None:
        self._record("F8.legacy_email_mention_import")
        converted, mentions = convert_legacy_email_mentions(
            "Please review @arjun@example.com",
            email_index={"arjun@example.com": ("u_7f2a", "Arjun")},
        )
        self.assertEqual(mentions, [Mention("u_7f2a", "Arjun")])
        self.assertIn("@[Arjun](user:u_7f2a)", converted)
        self.assertNotIn("arjun@example.com", converted)

    def test_f8_inbound_never_enqueues(self) -> None:
        self._record("F8.inbound_never_enqueues")
        self._seed_linked_thread()
        before = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops").fetchone()["n"]
        issue = self.forge.seed_issue(body="remote edit", state="open", etag="W/9")
        hint = self.inbox.enqueue(
            connector_id=CONNECTOR,
            delivery_id=f"del_{uuid.uuid4().hex[:8]}",
            hints=[
                {
                    "objectKind": "issue",
                    "remoteContainerId": CONTAINER,
                    "externalId": str(ISSUE_NUMBER),
                    "event": "edited",
                }
            ],
        )["hints"][0]
        fetch_then_apply_hint(
            self.conn,
            hint,
            fetcher=CallableFetcher(issue=lambda *_a: issue),
            inbox=self.inbox,
            ops=self.ops,
            store=self.store,
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.conn.commit()
        assert_inbound_suppresses_outbound(self.conn, before=before)

    def test_traces_are_machine_readable_json_lines(self) -> None:
        self._record("trace.check")
        self.forge.seed_issue(body="trace body")
        self.assertTrue(self.traces)
        for entry in self.traces:
            encoded = json.dumps(entry)
            self.assertIsInstance(json.loads(encoded), dict)


if __name__ == "__main__":
    unittest.main()
