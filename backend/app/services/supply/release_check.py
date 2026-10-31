"""The supply check on a release's BOM before it is published, and the snapshot taken at publish.

The BOM is the one the release build exported (``release_bom.py``): the run's variant and BOM preset, exactly what
ships. ``check`` assesses every distinct part on it (never calling a distributor). It reports the BOM's health and the parts with an error or fatal finding nobody has
waived. It informs the release; it does not block it.

``freeze`` writes what the check said, with each matched component's approved parts, beside the
release record. The record is evidence: it is never part of the release digest.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Mapping, Sequence

from app.services.supply import bom_lookup, clock, compliance_draft, usage
from app.services.supply.assessment import health as health_rules
from app.services.supply.assessment import service as assessment
from app.services.supply.audit import write_audit
from app.services.supply.bom_lookup import BomLine
from app.services.supply.vocabulary import Status
from app.services.supply.errors import Missing

MAX_LISTED = 25
_BLOCKING = ("fatal", "error")


class SnapshotNotFound(Missing):
    """No snapshot for this build."""

    default_detail = "No supply snapshot for this build"


def _open(findings: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return [f for f in findings if not (f["waiver"] and f["waiver"]["holds"])]


def check(conn, lines: Sequence[usage.UsageLine], now: datetime | None = None, without_number: int = 0) -> dict[str, Any]:
    """Assess the distinct parts on a BOM. ``without_number`` counts rows of the BOM that name no part number."""

    result = _assess(conn, lines, now or clock.now())
    result["without_number"] = without_number
    return result


def _assess(conn, lines: Sequence[usage.UsageLine], now: datetime) -> dict[str, Any]:
    bom = [
        BomLine(line.key, line.manufacturer, line.mpn, line.quantity, prism_id=line.prism_id, lcsc=line.lcsc, value=line.value, footprint=line.footprint)
        for line in lines
    ]
    # The lines carry the shipped identity (``release_bom.lines_from_csv``); the library is read only for the components' alternates.
    known = bom_lookup.library_identities(bom, bom_lookup.library_readers(conn).get("identities"))
    resolved = bom_lookup.resolve_lines(bom, conn)
    needs: dict[str, int] = {}
    for line in bom:
        part_id = resolved[line.key][1]
        if part_id:
            needs[part_id] = needs.get(part_id, 0) + line.quantity
    # A line may be built with its component's approved alternates (D2): each is assessed for the line's need, and the best counts.
    alternates = bom_lookup.line_alternates(conn, bom, resolved, known)
    assessed = assessment.assess_parts(
        conn, sorted({*needs, *(other for others in alternates.values() for other in others)}),
        needs | {other: needs[part_id] for part_id, others in alternates.items() for other in others}, now,
    )

    rows = []
    for line in bom:
        state, part_id, _how = resolved[line.key]
        group = [candidate for candidate in [part_id, *alternates.get(part_id, ())] if candidate in assessed] if part_id else []
        chosen = bom_lookup.best_of(group, lambda candidate: assessed[candidate]["status"]) if group else None
        entry = assessed[chosen] if chosen else None
        rows.append({
            "manufacturer": line.manufacturer,
            "mpn": line.mpn,
            "quantity": line.quantity,
            "state": state,
            "part_id": part_id,
            "health": entry["health"] if entry else None,
            "status": entry["status"] if entry else None,
            "findings": [
                {"check": f["check"], "severity": f["severity"], "text": f["text"]}
                for f in _open(entry["findings"])
            ] if entry else [],
            "waived": sum(1 for f in entry["findings"] if f["waiver"] and f["waiver"]["holds"]) if entry else 0,
            # The component's approved parts the line counted, and the alternate its status came from.
            "alternates": group[1:],
            "status_from": chosen if chosen != part_id else None,
        })
    rolled = health_rules.rollup([(r["health"], r["quantity"], Status(r["status"])) for r in rows if r["status"]])
    blocking = [r for r in rows if r["status"] in _BLOCKING]
    return {
        "health": rolled.score if rolled.status is not Status.UNKNOWN else None,
        "status": rolled.status.value,
        "parts": len(rows),
        "tracked": sum(1 for r in rows if r["part_id"]),
        "not_tracked": sum(1 for r in rows if not r["part_id"]),
        "needing_a_look": len(blocking),
        "attention": [r for r in blocking][:MAX_LISTED],
        "lines": rows,
    }


def freeze(
    conn,
    project_id: str,
    build_id: str,
    tag: str,
    commit_sha: str,
    actor: str,
    lines: Sequence[usage.UsageLine],
    now: datetime | None = None,
    without_number: int = 0,
) -> str | None:
    """Record the BOM check as it stands now. Returns the id, or None if already recorded."""

    result = check(conn, lines, now, without_number)
    snapshot_id = uuid.uuid4().hex
    # The draft RoHS and REACH declaration for this BOM, frozen with it. A draft that cannot be built does not stop the snapshot.
    draft: dict[str, Any] | None
    try:
        with conn.transaction():
            draft = compliance_draft.build(conn, [
                {"key": line.key, "manufacturer": line.manufacturer, "mpn": line.mpn, "quantity": line.quantity,
                 "references": line.references, "lcsc": line.lcsc}
                for line in lines
            ])
    except Exception:  # noqa: BLE001 - the snapshot matters more than its draft; a release without one is shown as such
        logging.getLogger(__name__).warning("Compliance draft not frozen for build %s", build_id, exc_info=True)
        draft = None
    created = conn.execute(
        """
        INSERT INTO supply_release_snapshots (id, project_id, build_id, tag, commit_sha, created_by, health, status, assessment, compliance)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
        ON CONFLICT (build_id) DO NOTHING RETURNING id
        """,
        (snapshot_id, project_id, build_id, tag, commit_sha, actor, result["health"], result["status"],
         json.dumps(result), json.dumps(draft) if draft is not None else None),
    ).fetchone()
    if created is None:
        return None
    write_audit(conn, actor, "release.snapshot", snapshot_id,
                {"project_id": project_id, "build_id": build_id, "tag": tag, "status": result["status"]},
                subject_kind="release_snapshot")
    return snapshot_id


def get_snapshot(conn, project_id: str, build_id: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM supply_release_snapshots WHERE project_id = %s AND build_id = %s", (project_id, build_id)
    ).fetchone()
    if row is None:
        raise SnapshotNotFound(build_id)
    return {
        "id": row["id"], "project_id": row["project_id"], "build_id": row["build_id"], "tag": row["tag"],
        "commit_sha": row["commit_sha"], "created_by": row["created_by"], "created_at": row["created_at"].isoformat(),
        "health": float(row["health"]) if row["health"] is not None else None, "status": row["status"],
        "assessment": row["assessment"], "compliance": row["compliance"],
    }
