"""Dual sign-off gates for project releases."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # pragma: no cover - import bootstrap
    sys.path.insert(0, str(REPO_ROOT))

from app.services.release_studio_service import (  # noqa: E402
    build_approval_state,
    electrical_error_kinds,
)


DIGEST = "d" * 64


def _build(**overrides):
    row = {
        "id": "build-1",
        "status": "succeeded",
        "dossier_digest": DIGEST,
    }
    row.update(overrides)
    return row


def _candidate(**overrides):
    row = {"id": "cand-1", "created_by": "designer@example.com", "config_key": "release"}
    row.update(overrides)
    return row


def _approved(slot: str, actor: str) -> dict:
    return {
        "id": f"rev-{slot}",
        "slot": slot,
        "actor": actor,
        "decision": "approved",
        "note": "",
        "dossier_digest": DIGEST,
    }


class ElectricalErrorTests(unittest.TestCase):
    def test_unwaived_errors_are_blocking_and_warnings_are_not(self) -> None:
        self.assertEqual(
            electrical_error_kinds(
                [
                    {"kind": "drc", "counts": {"error": 2, "warning": 4}},
                    {"kind": "erc", "counts": {"warning": 1}},
                ]
            ),
            ["drc"],
        )
        self.assertEqual(
            electrical_error_kinds([{"kind": "drc", "counts": {"warning": 9}}]),
            [],
        )


class ApprovalStateTests(unittest.TestCase):
    def test_author_can_fill_designer_slot_and_qa_cannot(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[],
            vendor_readiness=[],
            designer_row=None,
            qa_row=None,
            publish_row=None,
            actor_email="designer@example.com",
            actor_role="designer",
        )
        self.assertTrue(state["can_approve_designer"])
        self.assertFalse(state["can_approve_qa"])
        self.assertFalse(state["can_publish"])

    def test_qa_can_fill_qa_slot_after_someone_else_authored(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[],
            vendor_readiness=[],
            designer_row=_approved("designer", "designer@example.com"),
            qa_row=None,
            publish_row=None,
            actor_email="qa@example.com",
            actor_role="qa",
        )
        self.assertFalse(state["can_approve_designer"])
        self.assertTrue(state["can_approve_qa"])

    def test_same_person_cannot_fill_qa_without_admin(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[],
            vendor_readiness=[],
            designer_row=_approved("designer", "designer@example.com"),
            qa_row=None,
            publish_row=None,
            actor_email="designer@example.com",
            actor_role="designer",
        )
        self.assertFalse(state["can_approve_qa"])

    def test_both_slots_and_ready_packs_clear_publish(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[],
            vendor_readiness=[{"vendor_id": "jlcpcb", "ready": True}],
            designer_row=_approved("designer", "designer@example.com"),
            qa_row=_approved("qa", "qa@example.com"),
            publish_row=None,
            actor_email="qa@example.com",
            actor_role="qa",
        )
        self.assertTrue(state["both_approved"])
        self.assertTrue(state["can_publish"])

    def test_drc_errors_block_approve_and_publish(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[{"kind": "drc", "counts": {"error": 1}}],
            vendor_readiness=[],
            designer_row=None,
            qa_row=None,
            publish_row=None,
            actor_email="designer@example.com",
            actor_role="designer",
        )
        self.assertEqual(state["electrical_errors"], ["drc"])
        self.assertFalse(state["can_approve_designer"])
        self.assertFalse(state["can_publish"])

    def test_admin_can_approve_unwaived_electrical_errors(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[{"kind": "drc", "counts": {"error": 1}}, {"kind": "erc", "counts": {"error": 4}}],
            vendor_readiness=[],
            designer_row=None,
            qa_row=None,
            publish_row=None,
            actor_email="admin@example.com",
            actor_role="admin",
        )
        self.assertEqual(state["electrical_errors"], ["drc", "erc"])
        self.assertTrue(state["can_approve_designer"])
        self.assertTrue(state["can_approve_qa"])
        self.assertFalse(state["can_publish"])

    def test_admin_overridden_electrical_errors_allow_publish(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[{"kind": "drc", "counts": {"error": 42}}],
            vendor_readiness=[{"vendor_id": "jlcpcb", "ready": True}],
            designer_row=_approved("designer", "admin@example.com"),
            qa_row=_approved("qa", "admin@example.com"),
            publish_row=None,
            actor_email="admin@example.com",
            actor_role="admin",
        )
        self.assertEqual(state["electrical_errors"], ["drc"])
        self.assertTrue(state["both_approved"])
        self.assertTrue(state["can_publish"])
        self.assertEqual(state["blocked_reason"], "")

    def test_incomplete_vendor_pack_blocks_publish(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[],
            vendor_readiness=[{"vendor_id": "jlcpcb", "ready": False}],
            designer_row=_approved("designer", "designer@example.com"),
            qa_row=_approved("qa", "qa@example.com"),
            publish_row=None,
            actor_email="qa@example.com",
            actor_role="qa",
        )
        self.assertFalse(state["can_publish"])
        self.assertIn("vendor pack", state["blocked_reason"])

    def test_published_record_is_immutable(self) -> None:
        state = build_approval_state(
            build=_build(),
            candidate=_candidate(),
            evidence=[],
            vendor_readiness=[],
            designer_row=_approved("designer", "designer@example.com"),
            qa_row=_approved("qa", "qa@example.com"),
            publish_row={"id": "pub-1", "tag": "v1.0.0"},
            actor_email="admin@example.com",
            actor_role="admin",
        )
        self.assertFalse(state["can_approve_designer"])
        self.assertFalse(state["can_withdraw"])
        self.assertFalse(state["can_publish"])


if __name__ == "__main__":
    unittest.main()
