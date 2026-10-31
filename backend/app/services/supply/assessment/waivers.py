"""Waivers: accepting a finding on a part.

A waiver is a standing ``waive`` decision (``attention.py``) on the part and check, under the one rule for settling
something: someone who writes supply data proposes it with a reason; someone who approves (admin, qa) accepts or rejects
it, and an approver who proposes one approves it in the same step. A waiver is
tied to the condition it was raised against, so it stops holding when the part changes enough that
the finding means something else; it is then shown for another look, not silently kept.

Every change is audited.
"""

from __future__ import annotations

import dataclasses
from typing import Any, Iterable, Mapping, Sequence

from app.services.supply import attention
from app.services.supply.assessment.checks import Finding
from app.services.supply.audit import actor_text, write_audit
from app.services.supply.errors import Missing, Refused

PROPOSED, APPROVED, REJECTED = attention.PROPOSED, attention.APPROVED, attention.REJECTED
MAX_REASON = 500


class WaiverNotFound(Missing):
    """No waiver with this id."""


class WaiverError(Refused):
    """The change does not apply. The message is safe to show."""

    code = "waiver_error"


def _waiver(row: Mapping[str, Any]) -> dict[str, Any]:
    return {"id": row["id"], "part_id": row["part_id"], "check_id": row["kind"], "scope": row["scope"], "reason": row["reason"],
            "state": row["state"], "proposed_by": row["made_by"], "decided_by": row["decided_by"]}


def for_parts(conn, part_ids: Sequence[str]) -> dict[str, list[dict[str, Any]]]:
    """Every open or approved waiver of these parts, by part."""

    return {part_id: [_waiver(row) for row in rows] for part_id, rows in attention.standing(conn, attention.PART, part_ids, attention.WAIVE).items()}
def apply(findings: Iterable[Finding], waivers: Iterable[Mapping[str, Any]]) -> list[Finding]:
    """Attach each finding's waiver. ``holds`` is true only for an approved waiver of the same condition."""

    by_check = {w["check_id"]: w for w in waivers}
    result = []
    for finding in findings:
        waiver = by_check.get(finding.check)
        if waiver is None:
            result.append(finding)
            continue
        same = waiver["scope"] == finding.scope
        result.append(dataclasses.replace(finding, waiver={
            "id": waiver["id"],
            "state": waiver["state"],
            "reason": waiver["reason"],
            "proposed_by": waiver["proposed_by"],
            "decided_by": waiver["decided_by"],
            "holds": waiver["state"] == APPROVED and same,
            # Approved for a condition the part no longer has: needs another look.
            "outdated": waiver["state"] == APPROVED and not same,
        }))
    return result


def _row(conn, waiver_id: str) -> dict[str, Any]:
    try:
        return attention.proposal(conn, waiver_id, attention.WAIVE)
    except LookupError:
        raise WaiverNotFound(waiver_id) from None


def propose(conn, part_id: str, finding: Finding | None, reason: str, actor: str, *, approver: bool) -> dict[str, str]:
    """Raise a waiver for a finding the part has now. ``finding`` is None when it has none. An approver's holds at once
    (``attention.state_for``)."""

    actor = actor_text(actor)
    reason = reason.strip()
    if not reason:
        raise WaiverError("Say why this is acceptable.")
    if len(reason) > MAX_REASON:
        raise WaiverError(f"Keep the reason under {MAX_REASON} characters.")
    if finding is None:
        raise WaiverError("The part has no such finding to waive.")
    existing = next(iter(attention.standing(conn, attention.PART, [part_id], attention.WAIVE, [finding.check]).get(part_id, [])), None)
    if existing is not None:
        if existing["state"] == APPROVED and existing["scope"] != finding.scope:
            # The old approval is for a different condition; this replaces it.
            write_audit(conn, actor, "waiver.replace", existing["id"], {"part_id": part_id, "check": finding.check}, subject_kind="waiver")
        else:
            raise WaiverError("This finding already has a waiver.")
    state = attention.state_for(attention.WAIVE, approver=approver)
    waiver_id = attention.stand(conn, attention.PART, part_id, finding.check, attention.WAIVE, actor, scope=finding.scope, reason=reason, state=state)
    write_audit(conn, actor, "waiver.propose", waiver_id,
                {"part_id": part_id, "check": finding.check, "scope": finding.scope, "state": state}, subject_kind="waiver")
    return {"id": waiver_id, "state": state}


def decide(conn, waiver_id: str, actor: str, *, approve: bool) -> None:
    actor = actor_text(actor)
    row = _row(conn, waiver_id)
    try:
        attention.settle(conn, row, actor, approve=approve)
    except ValueError as exc:
        raise WaiverError("Only a waiver that is waiting can be decided.") from exc
    write_audit(conn, actor, "waiver.approve" if approve else "waiver.reject", waiver_id,
                {"part_id": row["part_id"], "check": row["kind"]}, subject_kind="waiver")


def revoke(conn, waiver_id: str, actor: str, *, approver: bool) -> None:
    """Withdraw a waiver. Its proposer may do it while it waits; an approver may do it any time."""

    actor = actor_text(actor)
    row = _row(conn, waiver_id)
    if not approver and (row["state"] != PROPOSED or row["made_by"] != actor):
        raise WaiverError("Only an approver can revoke a waiver that is approved or was raised by someone else.")
    conn.execute("DELETE FROM supply_attention_decisions WHERE id = %s", (waiver_id,))
    write_audit(conn, actor, "waiver.revoke", waiver_id,
                {"part_id": row["part_id"], "check": row["kind"], "was": row["state"]}, subject_kind="waiver")
