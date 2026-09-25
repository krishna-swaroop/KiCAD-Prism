"""Catalog workflow policy: stages, legacy aliases, transitions, and who may take them.

This is the single backend definition. The API authorizes against it, the
release workflow validates against it, persistence normalizes stage names with
it, and the frontend's presentation of offered transitions is generated from
it (``scripts/export_workflow_policy.py``) and checked for drift in
``backend/tests/test_workflow_policy.py``. Adding a stage or changing a role's
rights is an edit here plus a regeneration, not a hunt across modules.

The server stays authoritative: the generated frontend contract only decides
which buttons to show. Two-person approval, review notes, and release gates are
enforced in ``release_workflow.py`` regardless of what the client offers.
"""

from __future__ import annotations

from typing import Any, Mapping

WORKFLOW_STAGES: tuple[str, ...] = ("open", "in_progress", "qa_review", "done", "released", "archived")

# Stage names accepted from older clients and stored rows, mapped onto the
# current vocabulary. Current names normalize to themselves.
LEGACY_WORKFLOW_STAGE_MAP: Mapping[str, str] = {
    "draft": "open",
    "in_review": "qa_review",
    "qa_approved": "done",
    "released": "released",
    "deprecated": "archived",
}

# Next stages reachable from each stage, in the order a client should offer
# them. Membership is the server rule; order is presentation.
WORKFLOW_TRANSITIONS: Mapping[str, tuple[str, ...]] = {
    "open": ("in_progress", "archived"),
    "in_progress": ("qa_review", "open", "archived"),
    "qa_review": ("done", "in_progress", "archived"),
    "done": ("released", "qa_review", "archived"),
    "released": ("archived", "open"),
    "archived": ("open",),
}

WORKFLOW_ROLES: tuple[str, ...] = ("viewer", "designer", "qa", "admin")

# Transitions QA may take, all from qa_review: approve, return for changes, retire.
_QA_REVIEW_DECISIONS: frozenset[str] = frozenset({"done", "in_progress", "archived"})


def normalize_workflow_stage(stage: str) -> str:
    normalized = (stage or "").strip().lower()
    return LEGACY_WORKFLOW_STAGE_MAP.get(normalized, normalized)


def is_workflow_stage(stage: str) -> bool:
    return stage in WORKFLOW_STAGES


def can_transition(role: str, current_stage: str, next_stage: str) -> bool:
    """Whether ``role`` may move a revision from ``current_stage`` to ``next_stage``.

    Stage names must already be normalized. A same-stage request is a no-op
    re-affirmation that designers and admins may always make; QA may only make
    it while the revision is in review. Whether a stage name exists is the
    release workflow's validation, not an authorization question, so an
    unknown same-stage request passes here and is rejected there; an unknown
    stage has no transitions, so every other move from or to it is refused.
    """
    if current_stage == next_stage:
        return role in {"admin", "designer"} or (role == "qa" and current_stage == "qa_review")
    if next_stage not in WORKFLOW_TRANSITIONS.get(current_stage, ()):
        return False
    if role == "admin":
        return True
    if role == "designer":
        # A designer may send work to review but never approve it; approval
        # is QA's decision (or an administrator's override).
        return not (current_stage == "qa_review" and next_stage == "done")
    if role == "qa":
        return current_stage == "qa_review" and next_stage in _QA_REVIEW_DECISIONS
    return False


def allowed_transitions(role: str, current_stage: str) -> tuple[str, ...]:
    """The next stages ``role`` may offer from ``current_stage``, in display order."""
    return tuple(
        next_stage
        for next_stage in WORKFLOW_TRANSITIONS.get(current_stage, ())
        if can_transition(role, current_stage, next_stage)
    )


def workflow_policy_contract() -> dict[str, Any]:
    """The JSON-able presentation contract a client derives its offers from."""
    return {
        "stages": list(WORKFLOW_STAGES),
        "legacyAliases": dict(LEGACY_WORKFLOW_STAGE_MAP),
        "transitions": {stage: list(WORKFLOW_TRANSITIONS[stage]) for stage in WORKFLOW_STAGES},
        "allowed": {
            role: {stage: list(allowed_transitions(role, stage)) for stage in WORKFLOW_STAGES}
            for role in WORKFLOW_ROLES
        },
    }


__all__ = [
    "LEGACY_WORKFLOW_STAGE_MAP",
    "WORKFLOW_ROLES",
    "WORKFLOW_STAGES",
    "WORKFLOW_TRANSITIONS",
    "allowed_transitions",
    "can_transition",
    "is_workflow_stage",
    "normalize_workflow_stage",
    "workflow_policy_contract",
]
