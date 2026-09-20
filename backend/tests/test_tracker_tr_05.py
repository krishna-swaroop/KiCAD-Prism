"""TR-05: immutable design anchors on comment create (F2).

Canvas and comparison creates go through ``comment_anchor_service`` against a
real git fixture. HEAD is never stored unless the client sent that SHA.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import comments as comments_api  # noqa: E402
from tests.test_tracker_tr_01 import (  # noqa: E402
    POSTGRES_URL,
    SHARED_APPLICATION_DATABASE,
    DisposableSchemaStore,
    psycopg,
)
from tests.test_tracker_tr_03 import body, run, session  # noqa: E402


def git(cwd: str, *args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", cwd, *args],
        text=True,
        stderr=subprocess.DEVNULL,
    ).strip()


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


class TwoCommitPcb:
    """Project with commits A then B. HEAD is B unless the test rewinds it."""

    def __init__(self, root: Path, *, nested: str | None = None) -> None:
        self.root = root
        self.project_dir = root / nested if nested else root
        self.project_dir.mkdir(parents=True, exist_ok=True)
        self.project_file = "board.kicad_pro" if not nested else "carrier.kicad_pro"
        pro = self.project_dir / self.project_file
        pcb = self.project_dir / self.project_file.replace(".kicad_pro", ".kicad_pcb")
        sch = self.project_dir / self.project_file.replace(".kicad_pro", ".kicad_sch")
        write(pro, "{}\n")
        write(pcb, "(kicad_pcb (version 20240101) A)\n")
        write(sch, "(kicad_sch (version 20240101) (uuid a1) (sheet (property \"Sheetname\" \"Port\") (property \"Sheetfile\" \"Port.kicad_sch\")))\n")
        write(self.project_dir / "Port.kicad_sch", "(kicad_sch (version 20240101) (uuid port))\n")
        git(str(root), "init", "-b", "main")
        git(str(root), "config", "user.email", "test@example.com")
        git(str(root), "config", "user.name", "Test")
        git(str(root), "add", ".")
        git(str(root), "commit", "-m", "A")
        self.sha_a = git(str(root), "rev-parse", "HEAD")
        write(pcb, "(kicad_pcb (version 20240101) B)\n")
        git(str(root), "add", ".")
        git(str(root), "commit", "-m", "B")
        self.sha_b = git(str(root), "rev-parse", "HEAD")
        self.project = SimpleNamespace(
            id="prj_test",
            path=str(self.project_dir),
            project_file=self.project_file,
        )


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for comments route tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required")
@unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
class ImmutableAnchorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"comments_tr05_{uuid.uuid4().hex[:12]}"
        self.store = DisposableSchemaStore(self.schema)
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.fixture = TwoCommitPcb(Path(self.tempdir.name))
        self.project = self.fixture.project
        patches = [
            patch.object(comments_api, "comments_store", self.store),
            patch.object(comments_api, "get_project_for_role_or_404", return_value=self.project),
            patch.object(comments_api, "_load_mention_indexes", return_value=({}, {})),
            patch.object(comments_api, "_promote_min_role", return_value="designer"),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.addCleanup(self._drop_schema)

    def _drop_schema(self) -> None:
        with self.store._connect() as conn:
            conn.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
            conn.commit()

    def _create(self, user, **overrides):
        payload = {
            "context": "PCB",
            "location": {"x": 1, "y": 2, "layer": "F.Cu"},
            "content": "on A",
        }
        payload.update(overrides)
        return run(comments_api.create_comment("prj_test", comments_api.CreateCommentRequest(**payload), user))

    def test_two_commit_pcb_pins_displayed_revision_not_head(self) -> None:  # F2.two_commit_pcb
        user = session("viewer", user_id="u_v")
        created = self._create(user, revision={"commit": self.fixture.sha_a})
        self.assertEqual(created["anchor"]["commit"], self.fixture.sha_a)
        self.assertEqual(created["anchor"]["state"], "pinned")
        self.assertEqual(created["anchor"]["source"], "client")
        self.assertNotEqual(created["anchor"]["commit"], self.fixture.sha_b)
        self.assertEqual(git(self.fixture.root.as_posix(), "rev-parse", "HEAD"), self.fixture.sha_b)

        listed = run(comments_api.get_comments("prj_test", user))
        self.assertEqual(listed["comments"][0]["anchor"]["commit"], self.fixture.sha_a)

    def test_short_sha_is_rejected(self) -> None:  # F2.short_sha_rejected
        user = session("viewer")
        response = self._create(user, revision={"commit": "3f2c9a1"})
        self.assertIsInstance(response, JSONResponse)
        self.assertEqual(response.status_code, 422)
        self.assertIn("40", body(response)["detail"])
        self.assertEqual(self.store.get_comments_file("prj_test", self.project.path)["comments"], [])

    def test_unknown_commit_is_rejected_without_a_row(self) -> None:  # F2.unknown_commit_rejected
        user = session("viewer")
        unknown = "ab" * 20
        response = self._create(user, revision={"commit": unknown})
        self.assertIsInstance(response, JSONResponse)
        self.assertEqual((response.status_code, body(response)["code"]), (422, "unknown_revision"))
        self.assertEqual(self.store.get_comments_file("prj_test", self.project.path)["comments"], [])

    def test_worktree_is_unpinned_and_does_not_read_head(self) -> None:  # F2.worktree_anchor
        user = session("viewer")
        created = self._create(user, revision={"worktree": True, "sourceRevisionKey": "src:worktree"})
        self.assertEqual(created["anchor"]["state"], "unpinned")
        self.assertIsNone(created["anchor"]["commit"])
        self.assertEqual(created["anchor"]["sourceRevisionKey"], "src:worktree")
        self.assertEqual(created["anchor"]["source"], "client")
        self.assertEqual(created["tracker"]["notPromotableReason"], "unpinned_anchor")
        self.assertEqual(git(self.fixture.root.as_posix(), "rev-parse", "HEAD"), self.fixture.sha_b)

    def test_omitted_revision_stays_unpinned_even_when_git_head_exists(self) -> None:  # F2.missing_legacy_revision analogue
        user = session("viewer")
        created = self._create(user)
        self.assertEqual(created["anchor"]["state"], "unpinned")
        self.assertIsNone(created["anchor"]["commit"])
        self.assertEqual(created["tracker"]["notPromotableReason"], "unpinned_anchor")

    def test_multi_sheet_stores_occurrence_path_not_filename(self) -> None:  # F2.multi_sheet_repeated_instance
        user = session("viewer")
        created = run(comments_api.create_comment(
            "prj_test",
            comments_api.CreateCommentRequest(
                context="SCH",
                location={"x": 4, "y": 5, "page": "/Port2/"},
                content="second instance",
                revision={"commit": self.fixture.sha_a},
            ),
            user,
        ))
        self.assertEqual(created["location"]["page"], "/Port2/")
        self.assertNotEqual(created["location"]["page"], "Port.kicad_sch")
        self.assertEqual(created["anchor"]["commit"], self.fixture.sha_a)

    def test_comparison_keeps_ordered_pair_and_selected_side(self) -> None:  # F2.comparison_ordered_pair
        user = session("viewer")
        forward = run(comments_api.create_comparison_comment(
            "prj_test",
            comments_api.CreateComparisonCommentRequest(
                baseCommit=self.fixture.sha_a, compareCommit=self.fixture.sha_b,
                domain="PCB", content="on compare", selectedSide="compare",
            ),
            user,
        ))
        swapped = run(comments_api.create_comparison_comment(
            "prj_test",
            comments_api.CreateComparisonCommentRequest(
                baseCommit=self.fixture.sha_b, compareCommit=self.fixture.sha_a,
                domain="PCB", content="swapped", selectedSide="compare",
            ),
            user,
        ))
        self.assertEqual(
            (forward["anchor"]["baseCommit"], forward["anchor"]["compareCommit"], forward["anchor"]["selectedSide"]),
            (self.fixture.sha_a, self.fixture.sha_b, "compare"),
        )
        self.assertEqual(forward["anchor"]["commit"], self.fixture.sha_b)
        self.assertNotEqual(
            (forward["anchor"]["baseCommit"], forward["anchor"]["compareCommit"]),
            (swapped["anchor"]["baseCommit"], swapped["anchor"]["compareCommit"]),
        )
        self.assertEqual(forward["anchor"]["state"], "pinned")
        on_base = run(comments_api.create_comparison_comment(
            "prj_test",
            comments_api.CreateComparisonCommentRequest(
                baseCommit=self.fixture.sha_a, compareCommit=self.fixture.sha_b,
                domain="PCB", content="on base", selectedSide="base",
            ),
            user,
        ))
        self.assertEqual(on_base["anchor"]["commit"], self.fixture.sha_a)
        self.assertNotEqual(
            forward["anchor"]["sourceRevisionKey"],
            on_base["anchor"]["sourceRevisionKey"],
        )

    def test_source_file_resolves_without_full_commit_checkout(self) -> None:
        from app.services import comment_anchor_service

        user = session("viewer")
        with patch.object(
            comment_anchor_service.project_source_snapshot,
            "project_source_snapshot",
            side_effect=AssertionError("full checkout must not run"),
        ):
            created = self._create(user, revision={"commit": self.fixture.sha_a})
        self.assertEqual(created["anchor"]["state"], "pinned")
        with self.store._connect() as conn:
            row = conn.execute(
                "SELECT file_path FROM comments WHERE project_id = %s ORDER BY id DESC LIMIT 1",
                ("prj_test",),
            ).fetchone()
        self.assertEqual(row["file_path"], "board.kicad_pcb")

    def test_admin_manual_pin_of_unpinned_legacy_row(self) -> None:  # F2.admin_manual_pin
        designer = session("designer", user_id="u_d")
        admin = session("admin", user_id="u_a")
        created = self._create(designer)
        self.assertEqual(created["anchor"]["state"], "unpinned")
        refused = run(comments_api.pin_comment(
            "prj_test", created["id"], comments_api.PinCommentRequest(commit=self.fixture.sha_a), designer,
        ))
        self.assertEqual((refused.status_code, body(refused)["code"]), (403, "legacy_admin_only"))

        pinned = run(comments_api.pin_comment(
            "prj_test", created["id"], comments_api.PinCommentRequest(commit=self.fixture.sha_a, expectedRevision=1), admin,
        ))
        self.assertEqual((pinned["anchor"]["commit"], pinned["anchor"]["source"], pinned["anchor"]["state"]),
                         (self.fixture.sha_a, "manual", "pinned"))
        self.assertNotIn("notPromotableReason", (pinned.get("tracker") or {}))
        history = self.store.get_history("prj_test", "root", created["id"])
        self.assertEqual([h["changeKind"] for h in history], ["create", "edit"])
        self.assertEqual(history[-1]["editorUserId"], "u_a")

        again = run(comments_api.pin_comment(
            "prj_test", created["id"], comments_api.PinCommentRequest(commit=self.fixture.sha_b), admin,
        ))
        self.assertEqual((again.status_code, body(again)["code"]), (422, "anchor_immutable"))
        current = self.store.get_comment("prj_test", self.project.path, created["id"])
        self.assertEqual(current["anchor"]["commit"], self.fixture.sha_a)

    def test_comparison_without_selected_side_defaults_to_compare(self) -> None:
        """Omitted selectedSide pins the compare revision and rejects manual rewrite."""
        viewer = session("viewer", user_id="u_v")
        admin = session("admin", user_id="u_a")
        created = run(comments_api.create_comparison_comment(
            "prj_test",
            comments_api.CreateComparisonCommentRequest(
                baseCommit=self.fixture.sha_a, compareCommit=self.fixture.sha_b,
                domain="PCB", content="pair only",
            ),
            viewer,
        ))
        self.assertEqual(created["anchor"]["state"], "pinned")
        self.assertEqual(created["anchor"]["source"], "client")
        self.assertEqual(created["anchor"]["commit"], self.fixture.sha_b)
        self.assertEqual(created["anchor"]["selectedSide"], "compare")
        self.assertEqual(
            (created["anchor"]["baseCommit"], created["anchor"]["compareCommit"]),
            (self.fixture.sha_a, self.fixture.sha_b),
        )
        revision_before = created["revision"]

        refused = run(comments_api.pin_comment(
            "prj_test", created["id"], comments_api.PinCommentRequest(commit=self.fixture.sha_a), admin,
        ))
        self.assertIsInstance(refused, JSONResponse)
        self.assertEqual((refused.status_code, body(refused)["code"]), (422, "anchor_immutable"))
        current = self.store.get_comment("prj_test", self.project.path, created["id"])
        self.assertEqual(current["anchor"]["source"], "client")
        self.assertEqual(current["anchor"]["commit"], self.fixture.sha_b)
        self.assertEqual(current["anchor"]["state"], "pinned")
        self.assertEqual(current["revision"], revision_before)
        self.assertEqual(
            (current["anchor"]["baseCommit"], current["anchor"]["compareCommit"]),
            (self.fixture.sha_a, self.fixture.sha_b),
        )

    def test_patch_still_cannot_move_the_anchor(self) -> None:  # F2.anchor_immutable_on_patch
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            comments_api.UpdateCommentRequest(content="x", revision={"commit": self.fixture.sha_a})

    def test_variant_metadata_is_stored_not_invented(self) -> None:
        user = session("viewer")
        created = self._create(
            user,
            revision={"commit": self.fixture.sha_a},
            metadata={"variant": "REV_B"},
        )
        stored = self.store.get_comment("prj_test", self.project.path, created["id"])
        self.assertEqual(stored["metadata"]["variant"], "REV_B")
        self.assertIsNone(created["anchor"].get("variant"))


class MonorepoAnchorTests(unittest.TestCase):
    @unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for comments route tests")
    @unittest.skipUnless(psycopg is not None, "psycopg is required")
    @unittest.skipIf(SHARED_APPLICATION_DATABASE, "TEST_POSTGRES_URL must not target PRISM_DATABASE_URL")
    def test_monorepo_records_project_relative_path(self) -> None:  # F2.monorepo_project_anchor
        schema = f"comments_tr05_{uuid.uuid4().hex[:12]}"
        store = DisposableSchemaStore(schema)
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        fixture = TwoCommitPcb(Path(tempdir.name), nested="hw/boards/carrier")
        patches = [
            patch.object(comments_api, "comments_store", store),
            patch.object(comments_api, "get_project_for_role_or_404", return_value=fixture.project),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

        def drop():
            with store._connect() as conn:
                conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
                conn.commit()

        self.addCleanup(drop)
        created = run(comments_api.create_comment(
            "prj_test",
            comments_api.CreateCommentRequest(
                context="PCB",
                location={"x": 1, "y": 2},
                content="nested",
                revision={"commit": fixture.sha_a},
            ),
            session("viewer"),
        ))
        self.assertEqual(created["anchor"]["projectFile"], "hw/boards/carrier/carrier.kicad_pro")
        self.assertEqual(created["anchor"]["commit"], fixture.sha_a)
        self.assertEqual(fixture.project.id, "prj_test")


if __name__ == "__main__":
    unittest.main()
