"""The catalog workflow policy and the frontend contract generated from it."""

import itertools
import subprocess
import sys
import unittest
from pathlib import Path

from app.core.security import AuthenticatedUser
from app.api.catalog_admin import _can_transition_workflow
from app.services.catalog import release_workflow, revision_kernel, workflow_policy
from app.services.catalog.workflow_policy import (
    LEGACY_WORKFLOW_STAGE_MAP,
    WORKFLOW_ROLES,
    WORKFLOW_STAGES,
    WORKFLOW_TRANSITIONS,
    allowed_transitions,
    can_transition,
    normalize_workflow_stage,
    workflow_policy_contract,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
EXPORT_SCRIPT = REPO_ROOT / "scripts" / "export_workflow_policy.py"
GENERATED_MODULE = REPO_ROOT / "frontend" / "src" / "lib" / "catalog-workflow-policy.generated.ts"

# The complete offer table, written out by hand so a wrong edit to the policy
# cannot regenerate itself into passing tests.
EXPECTED_OFFERS = {
    "viewer": {stage: () for stage in WORKFLOW_STAGES},
    "designer": {
        "open": ("in_progress", "archived"),
        "in_progress": ("qa_review", "open", "archived"),
        "qa_review": ("in_progress", "archived"),
        "done": ("released", "qa_review", "archived"),
        "released": ("archived", "open"),
        "archived": ("open",),
    },
    "qa": {
        "open": (),
        "in_progress": (),
        "qa_review": ("done", "in_progress", "archived"),
        "done": (),
        "released": (),
        "archived": (),
    },
    "admin": {
        "open": ("in_progress", "archived"),
        "in_progress": ("qa_review", "open", "archived"),
        "qa_review": ("done", "in_progress", "archived"),
        "done": ("released", "qa_review", "archived"),
        "released": ("archived", "open"),
        "archived": ("open",),
    },
}


class WorkflowPolicyTests(unittest.TestCase):
    def test_every_role_stage_pair_offers_exactly_the_expected_transitions(self) -> None:
        for role, stage in itertools.product(WORKFLOW_ROLES, WORKFLOW_STAGES):
            with self.subTest(role=role, stage=stage):
                self.assertEqual(allowed_transitions(role, stage), EXPECTED_OFFERS[role][stage])

    def test_offers_and_authorization_agree_for_every_combination(self) -> None:
        for role, current, nxt in itertools.product(WORKFLOW_ROLES, WORKFLOW_STAGES, WORKFLOW_STAGES):
            if current == nxt:
                continue
            with self.subTest(role=role, current=current, next=nxt):
                self.assertEqual(can_transition(role, current, nxt), nxt in allowed_transitions(role, current))

    def test_same_stage_reaffirmation(self) -> None:
        for stage in WORKFLOW_STAGES:
            self.assertTrue(can_transition("admin", stage, stage))
            self.assertTrue(can_transition("designer", stage, stage))
            self.assertFalse(can_transition("viewer", stage, stage))
            self.assertEqual(can_transition("qa", stage, stage), stage == "qa_review")
        # Same-stage is never an offer; it is not a move.
        for role, stage in itertools.product(WORKFLOW_ROLES, WORKFLOW_STAGES):
            self.assertNotIn(stage, allowed_transitions(role, stage))

    def test_qa_return_and_approval_and_designer_cannot_self_approve(self) -> None:
        self.assertTrue(can_transition("qa", "qa_review", "done"))
        self.assertTrue(can_transition("qa", "qa_review", "in_progress"))
        self.assertTrue(can_transition("qa", "qa_review", "archived"))
        self.assertFalse(can_transition("qa", "done", "released"))
        self.assertFalse(can_transition("qa", "in_progress", "qa_review"))
        self.assertFalse(can_transition("designer", "qa_review", "done"))
        self.assertTrue(can_transition("designer", "in_progress", "qa_review"))
        self.assertTrue(can_transition("designer", "done", "released"))

    def test_admin_override_follows_the_transition_graph_only(self) -> None:
        for current, nxt in itertools.product(WORKFLOW_STAGES, WORKFLOW_STAGES):
            if current == nxt:
                continue
            self.assertEqual(can_transition("admin", current, nxt), nxt in WORKFLOW_TRANSITIONS[current])

    def test_unknown_stages_and_roles(self) -> None:
        self.assertEqual(allowed_transitions("admin", "bogus"), ())
        self.assertEqual(allowed_transitions("owner", "open"), ())
        self.assertFalse(can_transition("admin", "bogus", "open"))
        self.assertFalse(can_transition("admin", "open", "bogus"))
        self.assertFalse(can_transition("owner", "open", "in_progress"))
        # An unknown same-stage request is not an authorization failure; the
        # release workflow rejects the stage name itself.
        self.assertTrue(can_transition("designer", "bogus", "bogus"))

    def test_legacy_aliases_normalize_onto_current_stages(self) -> None:
        for legacy, current in LEGACY_WORKFLOW_STAGE_MAP.items():
            self.assertIn(current, WORKFLOW_STAGES)
            self.assertEqual(normalize_workflow_stage(legacy), current)
            self.assertEqual(normalize_workflow_stage(f"  {legacy.upper()} "), current)
        for stage in WORKFLOW_STAGES:
            self.assertEqual(normalize_workflow_stage(stage), stage)
        self.assertEqual(normalize_workflow_stage(""), "")
        self.assertEqual(allowed_transitions("qa", normalize_workflow_stage("in_review")), ("done", "in_progress", "archived"))

    def test_graph_is_closed_over_known_stages(self) -> None:
        self.assertEqual(set(WORKFLOW_TRANSITIONS), set(WORKFLOW_STAGES))
        for stage, targets in WORKFLOW_TRANSITIONS.items():
            self.assertEqual(len(targets), len(set(targets)), stage)
            for target in targets:
                self.assertIn(target, WORKFLOW_STAGES)
                self.assertNotEqual(target, stage)


class WorkflowPolicyConsumersTests(unittest.TestCase):
    def test_api_release_workflow_and_kernel_share_one_definition(self) -> None:
        self.assertIs(release_workflow.WORKFLOW_TRANSITIONS, workflow_policy.WORKFLOW_TRANSITIONS)
        self.assertIs(revision_kernel.WORKFLOW_STAGES, workflow_policy.WORKFLOW_STAGES)
        self.assertIs(revision_kernel.normalize_workflow_stage, workflow_policy.normalize_workflow_stage)
        user = AuthenticatedUser(email="qa@example.com", name="QA", role="qa")
        self.assertTrue(_can_transition_workflow(user, "qa_review", "done"))
        self.assertFalse(_can_transition_workflow(user, "done", "released"))


class FrontendContractTests(unittest.TestCase):
    def test_contract_lists_every_role_and_stage(self) -> None:
        contract = workflow_policy_contract()
        self.assertEqual(contract["stages"], list(WORKFLOW_STAGES))
        self.assertEqual(set(contract["allowed"]), set(WORKFLOW_ROLES))
        for role, offers in contract["allowed"].items():
            self.assertEqual(list(offers), list(WORKFLOW_STAGES), role)
            for stage, targets in offers.items():
                self.assertEqual(tuple(targets), EXPECTED_OFFERS[role][stage])

    def test_generated_frontend_module_matches_the_policy(self) -> None:
        """Regenerate with `python3 scripts/export_workflow_policy.py` after a policy change."""
        result = subprocess.run(
            [sys.executable, str(EXPORT_SCRIPT), "--check"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertTrue(GENERATED_MODULE.exists())
        self.assertIn("Do not edit by hand", GENERATED_MODULE.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
