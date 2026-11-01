"""Health and status from findings and sub-scores, and the roll-up over many parts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from app.services.supply.assessment.checks import Finding
from app.services.supply.assessment.risk import SubScore
from app.services.supply.assessment.settings import AssessmentSettings
from app.services.supply.vocabulary import Status

# The status sets the band a number sits in; the details (sub-scores and how many findings) set the place in it. A fatal part is 0.
BANDS = {Status.OK: (7.0, 10.0), Status.WARNING: (4.0, 6.9), Status.ERROR: (0.1, 3.9)}
# Each finding beyond the first takes this share of the band's width.
EXTRA_FINDING_SHARE = 0.1
# How much each risk area counts in the place a part takes inside its band. Relative; fixed in code (a workspace setting would only
# move a figure inside the band the status gives it).
WEIGHTS = {"lifecycle": 0.25, "sourcing": 0.2, "inventory": 0.3, "market": 0.1, "compliance": 0.15}


@dataclass(frozen=True, slots=True)
class Health:
    score: float
    status: Status


def _unwaived(findings: Iterable[Finding]) -> list[Finding]:
    return [f for f in findings if not (f.waiver and f.waiver.get("holds"))]


def health(findings: Sequence[Finding], scores: Sequence[SubScore], settings: AssessmentSettings, *, has_data: bool) -> Health:
    """The status is the worst unwaived finding (fatal, error, warning, else ok; unknown when there is no data and nothing to report).
    The number sits in that status's band (``BANDS``: ok 7 to 10, warning 4 to 6.9, error 0.1 to 3.9, fatal 0), lower the worse the
    weighted sub-scores are and the more findings there are beyond the first, so the number never disagrees with the status.
    """

    open_findings = _unwaived(findings)
    if not has_data and not open_findings:
        return Health(0.0, Status.UNKNOWN)
    if any(f.severity is Status.FATAL for f in open_findings):
        return Health(0.0, Status.FATAL)
    status = (
        Status.ERROR if any(f.severity is Status.ERROR for f in open_findings)
        else Status.WARNING if any(f.severity is Status.WARNING for f in open_findings) else Status.OK
    )
    total_weight = sum(WEIGHTS.get(s.name, 0.0) for s in scores) or 1.0
    penalty = sum(WEIGHTS.get(s.name, 0.0) * (s.score - 1) / 4 for s in scores) / total_weight
    penalty += EXTRA_FINDING_SHARE * max(0, len(open_findings) - 1)
    low, high = BANDS[status]
    return Health(round(high - (high - low) * min(1.0, penalty), 1), status)


def rollup(parts: Sequence[tuple[float, int, Status]]) -> Health:
    """The quantity-weighted mean of (health, quantity, status), capped at the top of the worst line's band: 3.9 for an error or a
    fatal line, 6.9 for a warning."""

    scored = [(score, max(quantity, 1), status) for score, quantity, status in parts if status is not Status.UNKNOWN]
    if not scored:
        return Health(0.0, Status.UNKNOWN)
    weight = sum(quantity for _, quantity, _ in scored)
    mean = sum(score * quantity for score, quantity, _ in scored) / weight
    if any(status is Status.FATAL for _, _, status in scored):
        return Health(round(min(mean, BANDS[Status.ERROR][1]), 1), Status.FATAL)
    worst = Status.OK
    for _, _, status in scored:
        if status is Status.ERROR:
            worst = Status.ERROR
        elif status is Status.WARNING and worst is Status.OK:
            worst = Status.WARNING
    if worst is not Status.OK:
        mean = min(mean, BANDS[worst][1])
    return Health(round(mean, 1), worst)
