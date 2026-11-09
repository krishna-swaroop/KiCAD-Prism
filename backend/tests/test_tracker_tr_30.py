"""TR-30: mirror root edits and promoted-thread deletion (F4, F8)."""

from __future__ import annotations

import json
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tracker_fault_harness import StatefulFakeForge, github_issue_url, install_fake_provider  # noqa: E402
from app.services.comments_revisions import Editor, tombstone_root  # noqa: E402
from app.services.trackers.drafts import (  # noqa: E402
    DraftAttribution,
    DraftRenderInput,
    build_issue_draft,
    render_issue_body_from_draft,
)
from app.services.trackers.markers import build_marker  # noqa: E402
from app.services.trackers.migrations import migrate_workspace_tracker_tables  # noqa: E402
from app.services.trackers.op_store import RECOVERY_DISPATCH, OpStore, apply_schema as apply_op_schema  # noqa: E402
from app.services.trackers.promotion import PromotionActor  # noqa: E402
from app.services.trackers.provenance import body_hash  # noqa: E402
from app.services.trackers.store import TrackerStore  # noqa: E402
from app.services.trackers.thread_executor import execute_thread_claimed_op, recover_thread_op  # noqa: E402
from app.services.trackers.thread_mutations import (  # noqa: E402
    DELETION_NOTE,
    after_root_content_edited,
    after_root_deleted,
    apply_inbound_root_prose,
    compose_outbound_issue_body,
    parse_issue_body_blocks,
)
from app.services.comments_schema_migrations import COMMENTS_LEDGER  # noqa: E402
from support.postgres import requires_scratch_postgres, scratch_schema, seed_comment  # noqa: E402

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F4 = json.loads((DOCS / "fixtures" / "F04.json").read_text(encoding="utf-8"))
F8 = json.loads((DOCS / "fixtures" / "F08.json").read_text(encoding="utf-8"))

CONNECTOR = "cn_gh1"
CONTAINER = "987654321"
REPO = "acme/openswitch"
ISSUE_ID = "198400412"
ISSUE_NUMBER = 412
BOT_ID = "199001"
BOT_LOGIN = "prism[bot]"
COMMENT_ID = "c_root"
THREAD_ID = "tt_root"
OP_UPDATE = "op_update_root"
OP_NOTE = "op_post_note"
DESIGNER = PromotionActor(user_id="u_designer", role="designer")


def _build_remote_body(prose: str, *, op_id: str = "op_create") -> str:
    draft = build_issue_draft(
        DraftRenderInput(
            project_id="prj_a",
            comment={
                "id": COMMENT_ID,
                "author": "Priya",
                "authorKind": "user",
                "content": prose,
                "severity": "major",
                "commentClass": "observation",
                "context": "PCB",
                "location": {"x": 1.0, "y": 2.0, "layer": "F.Cu", "page": ""},
                "anchor": {"commit": "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695"},
            },
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            op_id=op_id,
            public_base_url="https://prism.example",
            attribution=DraftAttribution(display_name="Priya", verified=True),
        )
    )
    return render_issue_body_from_draft(draft)


class FixtureContractTests(unittest.TestCase):

    def test_github_issue_url_uses_repo_number(self) -> None:
        url = github_issue_url(REPO, ISSUE_NUMBER)
        self.assertEqual(url, f"https://github.com/{REPO}/issues/{ISSUE_NUMBER}")
        self.assertNotIn(ISSUE_ID, url)


class BodyBlockTests(unittest.TestCase):
    def test_parse_and_compose_preserve_context_and_marker(self) -> None:
        remote = _build_remote_body("original prose")
        blocks = parse_issue_body_blocks(remote)
        self.assertIsNotNone(blocks)
        composed = compose_outbound_issue_body(local_prose="edited prose", remote_body=remote)
        self.assertIsNotNone(composed)
        reparsed = parse_issue_body_blocks(composed or "")
        self.assertIsNotNone(reparsed)
        self.assertEqual(reparsed.prose, "edited prose")
        self.assertEqual(reparsed.context, blocks.context)
        self.assertEqual(reparsed.marker.raw, blocks.marker.raw)

    def test_diverged_body_returns_none(self) -> None:
        self.assertIsNone(parse_issue_body_blocks("human rewrote everything"))


@requires_scratch_postgres("tracker persistence tests")
class ThreadMutationPostgresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "tr30", ledgers=(COMMENTS_LEDGER,), then=(migrate_workspace_tracker_tables, apply_op_schema,))
        self.schema, self.conn = self.scratch.name, self.scratch.conn
        self.store = TrackerStore(self.conn)
        self.ops = OpStore(self.conn)
        self._seed_destination()
        self._seed_linked_thread()

        @contextmanager
        def factory():
            conn = self.scratch.connect()
            try:
                yield conn
            finally:
                conn.close()

        self.forge = StatefulFakeForge()
        provider = install_fake_provider(self.forge, factory)
        provider.__enter__()
        self.addCleanup(provider.__exit__, None, None, None)

    def _seed_destination(self) -> None:
        self.store.upsert_connector(
            connector_id=CONNECTOR,
            provider="github",
            instance_kind="github.com",
            bot_forge_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
            credential_envelope="test-envelope",
        )
        self.store.set_project_tracker(
            project_tracker_id="pt_a",
            project_id="prj_a",
            connector_id=CONNECTOR,
            container_kind="repo",
            container_path=REPO,
            remote_container_id=CONTAINER,
            generation=2,
            visibility="private",
        )
        self.store.acknowledge_destination(
            ack_id="ack_priv",
            connector_id=CONNECTOR,
            remote_container_id=CONTAINER,
            visibility="private",
            acknowledged_by="u_admin",
        )

    def _seed_linked_thread(self, *, prose: str = "Root comment") -> None:
        seed_comment(
            self.conn,
            COMMENT_ID,
            "prj_a",
            author="Priya",
            author_kind="user",
            content=prose,
            severity="major",
            comment_class="observation",
            context="PCB",
            location_x=1.0,
            location_y=2.0,
            location_layer="F.Cu",
            anchor_commit="3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695",
            anchor_state="pinned",
            anchor_source="openswitch.kicad_pro",
            revision=2,
        )
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
            link_state="linked",
        )

    def _comment_dict(self, *, content: str = "edited locally", revision: int = 2) -> dict:
        return {"id": COMMENT_ID, "content": content, "revision": revision}

    def test_local_root_edit_enqueues_update_issue(self) -> None:  # F8.root_prose_roundtrip
        outcome = after_root_content_edited(
            self.conn,
            project_id="prj_a",
            comment=self._comment_dict(),
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "enqueued")
        row = self.conn.execute(
            "SELECT op, state FROM sync_ops WHERE id = %s",
            (outcome.op_id,),
        ).fetchone()
        self.assertEqual(row["op"], "update_issue")
        self.assertEqual(row["state"], "pending")

    def test_execute_update_issue_rewrites_only_prose_block(self) -> None:
        remote_body = _build_remote_body("remote prose")
        remote_blocks = parse_issue_body_blocks(remote_body)
        self.assertIsNotNone(remote_blocks)
        self.conn.execute(
            "UPDATE comments SET content = %s WHERE id = %s",
            ("edited locally", COMMENT_ID),
        )
        self.ops.insert(
            op_id=OP_UPDATE,
            tracked_thread_id=THREAD_ID,
            op="update_issue",
            destination_generation=2,
            local_revision=2,
            expected_body_hash=body_hash("edited locally"),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_UPDATE, int(claimed["fence"]))
        self.conn.commit()
        self.forge.seed_issue(body=remote_body)

        with patch("app.core.config.settings.PUBLIC_BASE_URL", "https://prism.example"):
            execute_thread_claimed_op(self.ops.get(OP_UPDATE))

        self.assertEqual(self.ops.get(OP_UPDATE)["state"], "confirmed")
        [(issue_ref, issue_patch)] = self.forge.update_patches
        self.assertEqual(issue_ref, str(ISSUE_NUMBER))
        self.assertIn("edited locally", issue_patch.proseBlock)
        self.assertIn(remote_blocks.marker.raw, issue_patch.proseBlock)
        self.assertIn(remote_blocks.context, issue_patch.proseBlock)

    def test_inbound_prose_edit_applies_without_anchor_or_severity_change(self) -> None:
        remote_body = _build_remote_body("remote edited prose")
        thread = dict(self.conn.execute("SELECT * FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone())
        outcome = apply_inbound_root_prose(
            self.conn,
            thread=thread,
            issue_body=remote_body,
            ops=self.ops,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            event_actor_login="human",
            bot_user_id=BOT_ID,
            bot_login=BOT_LOGIN,
        )
        self.assertEqual(outcome, "applied")
        row = self.conn.execute(
            "SELECT content, severity, anchor_commit FROM comments WHERE id = %s",
            (COMMENT_ID,),
        ).fetchone()
        self.assertEqual(row["content"], "remote edited prose")
        self.assertEqual(row["severity"], "major")
        self.assertEqual(row["anchor_commit"], "3f2c9a1b7e4d5c6a8b9f0e1d2c3b4a5968778695")

    def test_local_root_delete_enqueues_post_note_and_unlinks(self) -> None:  # F8.local_root_deleted
        tombstone_root(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            editor=Editor(user_id="u_designer", kind="user", display="Priya"),
            expected_revision=2,
        )
        outcome = after_root_deleted(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertIn(outcome.action, {"enqueued", "existing"})
        row = self.conn.execute(
            "SELECT op, state FROM sync_ops WHERE op = 'post_note'"
        ).fetchone()
        thread = self.conn.execute("SELECT unlinked_at, lineage FROM tracked_threads WHERE id = %s", (THREAD_ID,)).fetchone()
        self.assertEqual(row["op"], "post_note")
        self.assertIsNotNone(thread["unlinked_at"])
        self.assertTrue(thread["lineage"])

    def test_post_note_is_idempotent_when_pending(self) -> None:
        tombstone_root(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            editor=Editor(user_id="u_designer", kind="user", display="Priya"),
            expected_revision=2,
        )
        self.ops.insert(
            op_id=OP_NOTE,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        outcome = after_root_deleted(
            self.conn,
            project_id="prj_a",
            comment_id=COMMENT_ID,
            actor=DESIGNER,
            workspace_schema=self.schema,
        )
        self.assertEqual(outcome.action, "existing")
        self.assertEqual(outcome.op_id, OP_NOTE)
        count = self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'post_note'").fetchone()["n"]
        self.assertEqual(count, 1)

    def test_execute_post_note_posts_comment_not_delete(self) -> None:
        self.ops.insert(
            op_id=OP_NOTE,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_NOTE, int(claimed["fence"]))
        self.conn.commit()
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_NOTE,
        )
        del marker
        self.forge.seed_issue()
        execute_thread_claimed_op(self.ops.get(OP_NOTE))
        self.assertIn(ISSUE_ID, self.forge.issues, "a deletion note never deletes the remote issue")
        self.assertEqual(self.forge.comment_calls, [OP_NOTE])
        [note_id] = self.forge.comments_by_issue[str(ISSUE_NUMBER)]
        self.assertIn(DELETION_NOTE, self.forge.comments[note_id].body)
        self.assertEqual(self.ops.get(OP_NOTE)["state"], "confirmed")

    def test_deletion_note_recovery_confirms_without_duplicate(self) -> None:  # F8.deletion_note_crash
        self.ops.insert(
            op_id=OP_NOTE,
            tracked_thread_id=THREAD_ID,
            op="post_note",
            destination_generation=2,
            expected_body_hash=body_hash(DELETION_NOTE),
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_NOTE, int(claimed["fence"]))
        self.conn.commit()
        marker = build_marker(
            connector_id=CONNECTOR,
            container_id=CONTAINER,
            comment_id=COMMENT_ID,
            op_id=OP_NOTE,
        )
        self.forge.seed_issue()
        self.forge.seed_comment(external_comment_id="9002", body=f"{DELETION_NOTE}\n\n{marker}")
        recover_thread_op(self.conn, {**self.ops.get(OP_NOTE), "dispatch": RECOVERY_DISPATCH})
        self.assertEqual(self.forge.comment_calls, [], "recovery must not post a second note")
        self.assertEqual(self.ops.get(OP_NOTE)["state"], "confirmed")
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM sync_ops WHERE op = 'post_note'").fetchone()["n"],
            1,
        )

    def test_human_title_edit_skips_title_rewrite(self) -> None:  # F4.human_title_edit
        self.conn.execute(
            "UPDATE tracked_threads SET last_title_hash = %s WHERE id = %s",
            (body_hash("Prism title"), THREAD_ID),
        )
        remote_body = _build_remote_body("prose")
        self.ops.insert(
            op_id=OP_UPDATE,
            tracked_thread_id=THREAD_ID,
            op="update_issue",
            destination_generation=2,
            local_revision=2,
        )
        claimed = self.ops.claim("worker-a")
        self.ops.mark_sent(OP_UPDATE, int(claimed["fence"]))
        self.conn.commit()

        self.forge.seed_issue(body=remote_body, title="Human changed title")
        with patch("app.core.config.settings.PUBLIC_BASE_URL", "https://prism.example"):
            execute_thread_claimed_op(self.ops.get(OP_UPDATE))
        [(_ref, issue_patch)] = self.forge.update_patches
        self.assertIsNone(issue_patch.title)
        self.assertEqual(self.ops.get(OP_UPDATE)["state"], "confirmed")


if __name__ == "__main__":
    unittest.main()
