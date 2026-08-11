#!/usr/bin/env python3
"""Shadow-compare the Node object delta against the shipping change set.

M2 of the Design Comparison revamp. Nothing depends on the Node delta yet; the
question is whether it agrees with what Prism ships today, and whether every
disagreement is an improvement rather than a regression.

Both sides are produced from the same cold build, in one command, so the
comparison cannot drift: this script builds base and head through
``design_compare_service`` exactly as the worker does, runs
``scripts/ecad-diff.mjs`` over the snapshots that build produced, and aligns
the two change sets on the native KiCad UUID -- the only identity both sides
carry.

Usage:
  scripts/compare_object_delta.py <project.kicad_pro> --base REV --compare REV
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = (
    REPOSITORY_ROOT
    if (REPOSITORY_ROOT / "app").is_dir()
    else REPOSITORY_ROOT / "backend"
)
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


SCHEMA = "prism.object_delta_agreement_m2"

# The sidecar's vocabulary, which the Node index is mapped onto for
# comparison. `pad`, `group`, `sheet` and `sheet_pin` have no sidecar
# equivalent at all -- they are objects the current pipeline never sees, and
# the plan predicted they would show up here as new detections.
KIND_MAP = {
    "symbol": "symbol",
    "pin": "pin",
    "label": "label",
    "global_label": "label",
    "hierarchical_label": "label",
    "junction": "junction",
    "wire": "wire",
    "bus": "wire",
    "graphic": "graphic",
    "no_connect": "graphic",
    "bus_entry": "graphic",
    "image": "graphic",
    "footprint": "footprint",
    "segment": "track",
    "arc_segment": "arc",
    "via": "via",
    "zone": "zone",
    "footprint_zone": "zone",
}

STATUS_MAP = {"added": "added", "removed": "removed", "modified": "changed"}
SEMANTIC_ENRICHMENT_FIELDS = {"semantic_id", "reference", "net"}


def _load_backend_services() -> tuple[Any, Any, Any]:
    """Load the worker-only dependencies after CLI parsing.

    The agreement classifier is intentionally dependency-free so its tests run
    on the host as well as in the worker image.
    """

    from app.services import design_compare_service, semantic_index_service
    from app.services.design_compare_benchmark import DesignCompareBenchmark

    return design_compare_service, semantic_index_service, DesignCompareBenchmark


def _resolve_project(project_file: Path) -> tuple[Path, Optional[str]]:
    process = subprocess.run(
        ["git", "-C", str(project_file.parent), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        raise SystemExit(process.stderr.strip() or "git command failed")
    repo = Path(process.stdout.strip())
    relative = project_file.parent.relative_to(repo).as_posix()
    return repo, None if relative == "." else relative


def _python_change_set(
    base_revision: Dict[str, Any],
    head_revision: Dict[str, Any],
    domain: str,
    design_compare_service: Any,
) -> list[Dict[str, Any]]:
    """Projected native changes from the geometry sidecar diff.

    A change carries the source id from whichever side it exists on;
    ``_diff_geometry`` keys components on semantic identity, so a component
    can legitimately have a different native uuid on each side.
    """

    changes = design_compare_service._diff_geometry(
        base_revision.get("geometry") or {},
        head_revision.get("geometry") or {},
        domain,
    )
    result: list[Dict[str, Any]] = []
    for change in changes:
        old = change.get("oldGeometry") or {}
        new = change.get("geometry") or {}
        item = new or old
        changed_fields = sorted(
            key
            for key in old.keys() | new.keys()
            if old.get(key) != new.get(key)
        )
        source_ids = dict.fromkeys(
            (change.get("source_id_compare"), change.get("source_id_base"))
        )
        for source_id in source_ids:
            if not source_id:
                continue
            result.append(
                {
                    "uuid": str(source_id),
                    "kind": str(item.get("kind") or "unknown"),
                    "status": str(change.get("kind")),
                    "domain": domain,
                    "changedFields": changed_fields,
                    "sourceIdBase": change.get("source_id_base"),
                    "sourceIdCompare": change.get("source_id_compare"),
                }
            )
    return result


def _node_change_set(delta: Dict[str, Any]) -> Dict[str, Any]:
    """Projected native changes and deliberate suppressions from Node.

    The Node index keys on documentPath + uuid because a reused hierarchical
    sheet's instances share uuids. The sidecar has no document dimension, so
    the comparison has to project down to the uuid -- and the projection's
    collisions are themselves reported, because they are the identity problem
    this whole revamp is about.
    """

    result: list[Dict[str, Any]] = []
    for change in delta.get("changes") or []:
        mapped = KIND_MAP.get(str(change.get("kind")))
        result.append(
            {
                "uuid": str(change.get("uuid")),
                "kind": mapped or str(change.get("kind")),
                "status": STATUS_MAP.get(
                    str(change.get("status")), str(change.get("status"))
                ),
                "inSidecarVocabulary": mapped is not None,
                "nodeKind": str(change.get("kind")),
                "documentPath": change.get("documentPath"),
                "reasons": change.get("reasons") or [],
            }
        )
    ignored = []
    for change in delta.get("ignored") or []:
        mapped = KIND_MAP.get(str(change.get("kind")))
        ignored.append(
            {
                "uuid": str(change.get("uuid")),
                "kind": mapped or str(change.get("kind")),
                "reason": str(change.get("reason")),
                "documentPath": change.get("documentPath"),
            }
        )
    return {"changes": result, "ignored": ignored}


def _project(
    rows: Iterable[Dict[str, Any]],
) -> tuple[Dict[tuple[str, str, str], Dict[str, Any]], int]:
    """Collapse only exact duplicates introduced by the UUID-only projection."""

    projected: Dict[tuple[str, str, str], Dict[str, Any]] = {}
    duplicates = 0
    for row in rows:
        key = (str(row["uuid"]), str(row["kind"]), str(row["status"]))
        if key in projected:
            duplicates += 1
            continue
        projected[key] = row
    return projected, duplicates


def _classification(
    category: str,
    python_row: Optional[Dict[str, Any]],
    node_row: Optional[Dict[str, Any]],
    *,
    python_statuses: set[str],
    node_statuses: set[str],
    ignored: set[tuple[str, str]],
) -> tuple[str, bool]:
    uuid = str((python_row or node_row or {}).get("uuid"))
    kind = str((python_row or node_row or {}).get("kind"))

    if category == "statusMismatch":
        if {"added", "removed"} <= python_statuses and "changed" in node_statuses:
            return "semantic-identity-churn", True
        return "unexplained-status-mismatch", False

    if category == "pythonOnly":
        if (uuid, kind) in ignored:
            return "generated-content-only", True
        changed_fields = set((python_row or {}).get("changedFields") or [])
        if changed_fields and changed_fields <= SEMANTIC_ENRICHMENT_FIELDS:
            return "semantic-enrichment-only", True
        if {"added", "removed"} <= python_statuses and "changed" in node_statuses:
            return "semantic-identity-churn", True
        if kind == "graphic":
            # The sidecar scans nested forms the ecad-viewer parser does not
            # expose (A's six cases are polylines inside `rule_area`). Such an
            # item cannot reach the viewer paint index, so retaining it would
            # preserve a change row that can never focus or highlight.
            return "viewer-parser-unsupported-graphic", True
        return "unexplained-sidecar-only", False

    if node_row and not node_row.get("inSidecarVocabulary", True):
        return "object-kind-without-sidecar", True
    return "parser-authored-content-only", True


def _agreement(
    python_changes: list[Dict[str, Any]],
    node_result: Dict[str, Any],
) -> Dict[str, Any]:
    python_projected, python_duplicates = _project(python_changes)
    node_projected, node_duplicates = _project(node_result["changes"])
    ignored = {
        (str(row["uuid"]), str(row["kind"]))
        for row in node_result.get("ignored") or []
    }
    per_kind: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {"agreed": 0, "statusMismatch": 0, "pythonOnly": 0, "nodeOnly": 0}
    )
    samples: Dict[str, list[Dict[str, Any]]] = defaultdict(list)
    classifications: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "improvement": True, "samples": []}
    )

    exact = python_projected.keys() & node_projected.keys()
    for key in exact:
        per_kind[key[1]]["agreed"] += 1

    python_remaining = {
        key: row for key, row in python_projected.items() if key not in exact
    }
    node_remaining = {
        key: row for key, row in node_projected.items() if key not in exact
    }
    python_by_identity: Dict[tuple[str, str], list[tuple[str, Dict[str, Any]]]] = (
        defaultdict(list)
    )
    node_by_identity: Dict[tuple[str, str], list[tuple[str, Dict[str, Any]]]] = (
        defaultdict(list)
    )
    for (uuid, kind, status), row in python_remaining.items():
        python_by_identity[(uuid, kind)].append((status, row))
    for (uuid, kind, status), row in node_remaining.items():
        node_by_identity[(uuid, kind)].append((status, row))

    all_identities = set(python_by_identity) | set(node_by_identity)
    for identity in sorted(all_identities):
        python_rows = python_by_identity.get(identity, [])
        node_rows = node_by_identity.get(identity, [])
        python_statuses = {status for status, _ in python_rows}
        node_statuses = {status for status, _ in node_rows}
        paired = min(len(python_rows), len(node_rows))

        discrepancies: list[
            tuple[str, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]
        ] = []
        discrepancies.extend(
            ("statusMismatch", python_rows[index][1], node_rows[index][1])
            for index in range(paired)
        )
        discrepancies.extend(
            ("pythonOnly", row, None) for _, row in python_rows[paired:]
        )
        discrepancies.extend(("nodeOnly", None, row) for _, row in node_rows[paired:])

        for category, python_row, node_row in discrepancies:
            kind = identity[1]
            per_kind[kind][category] += 1
            sample = {
                "uuid": identity[0],
                "python": python_row,
                "node": node_row,
            }
            if len(samples[category]) < 20:
                samples[category].append(sample)
            classification, improvement = _classification(
                category,
                python_row,
                node_row,
                python_statuses=python_statuses,
                node_statuses=node_statuses,
                ignored=ignored,
            )
            bucket = classifications[classification]
            bucket["count"] += 1
            bucket["improvement"] = bucket["improvement"] and improvement
            if len(bucket["samples"]) < 10:
                bucket["samples"].append(sample)

    rows = []
    for kind, counts in sorted(per_kind.items()):
        seen_by_python = counts["agreed"] + counts["statusMismatch"] + counts["pythonOnly"]
        rows.append(
            {
                "kind": kind,
                **counts,
                # Agreement is measured against what the *current* pipeline
                # reports, because that is the thing being replaced. Objects
                # only the parser sees are counted separately as detections,
                # not held against it.
                "agreementPct": (
                    round(counts["agreed"] * 100 / seen_by_python, 2)
                    if seen_by_python
                    else None
                ),
            }
        )

    totals = {
        key: sum(counts[key] for counts in per_kind.values())
        for key in ("agreed", "statusMismatch", "pythonOnly", "nodeOnly")
    }
    seen_by_python = totals["agreed"] + totals["statusMismatch"] + totals["pythonOnly"]
    return {
        "byKind": rows,
        "totals": {
            **totals,
            "agreementPct": (
                round(totals["agreed"] * 100 / seen_by_python, 2) if seen_by_python else None
            ),
        },
        "uuidProjectionDuplicates": {
            "python": python_duplicates,
            "node": node_duplicates,
        },
        "classifications": [
            {"classification": name, **bucket}
            for name, bucket in sorted(classifications.items())
        ],
        "unexplained": sum(
            bucket["count"]
            for bucket in classifications.values()
            if not bucket["improvement"]
        ),
        "samples": dict(samples),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project", type=Path)
    parser.add_argument("--base", required=True)
    parser.add_argument("--compare", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--label")
    args = parser.parse_args()

    (
        design_compare_service,
        semantic_index_service,
        DesignCompareBenchmark,
    ) = _load_backend_services()
    project_file = args.project.resolve()
    repo, relative_path = _resolve_project(project_file)
    base = design_compare_service._resolve_revision(repo, args.base)
    head = design_compare_service._resolve_revision(repo, args.compare)

    with tempfile.TemporaryDirectory(prefix="prism-m2-") as cache_name:
        cache_root = Path(cache_name)
        os.environ["PRISM_DESIGN_COMPARE_CACHE"] = str(cache_root)
        design_compare_service._CACHE_ROOT = cache_root
        semantic_index_service._add_kicad_monkey_import_paths()

        recorder = DesignCompareBenchmark(job_id=f"m2-{int(time.time())}")
        project_id = "m2-" + hashlib.sha256(str(project_file).encode()).hexdigest()[:12]

        def heartbeat(message: str, _percent: float | None = None) -> None:
            print(message, flush=True)

        initial, _ = design_compare_service._build_initial_revisions(
            project_id, repo, relative_path, base, head, heartbeat, benchmark=recorder
        )
        revisions, _ = design_compare_service._build_pcb_revisions(
            project_id, base, head, initial, heartbeat, benchmark=recorder
        )

        snapshots = {
            revision: design_compare_service._cache_dir(project_id, revision) / "snapshot"
            for revision in (base, head)
        }
        delta_path = cache_root / "node-delta.json"
        node_started = time.perf_counter()
        subprocess.run(
            [
                "node",
                str(REPOSITORY_ROOT / "scripts" / "ecad-diff.mjs"),
                str(snapshots[base]),
                str(snapshots[head]),
                "--out",
                str(delta_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        node_elapsed_ms = round((time.perf_counter() - node_started) * 1000, 3)
        delta = json.loads(delta_path.read_text(encoding="utf-8"))

        python_changes: list[Dict[str, Any]] = []
        for domain in ("schematic", "pcb"):
            python_changes.extend(
                _python_change_set(
                    revisions[base],
                    revisions[head],
                    domain,
                    design_compare_service,
                )
            )

        report = {
            "schema": SCHEMA,
            "label": args.label,
            "project": str(project_file),
            "base": base,
            "head": head,
            "node": {
                "counts": delta["counts"],
                "byReason": delta["byReason"],
                "timings": delta["timings"],
                "wallClockMs": node_elapsed_ms,
                "peakRssBytes": delta["peakRssBytes"],
            },
            "python": {"changes": len(python_changes)},
            "agreement": _agreement(python_changes, _node_change_set(delta)),
        }

    output = args.output or Path(tempfile.gettempdir()) / f"m2-agreement-{int(time.time())}.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    agreement = report["agreement"]
    print("")
    print(f"{'kind':<12}{'agreed':>8}{'mismatch':>10}{'py only':>9}{'node only':>11}{'agree %':>9}")
    print("-" * 59)
    for row in agreement["byKind"]:
        pct = "—" if row["agreementPct"] is None else f"{row['agreementPct']:.1f}"
        print(
            f"{row['kind']:<12}{row['agreed']:>8}{row['statusMismatch']:>10}"
            f"{row['pythonOnly']:>9}{row['nodeOnly']:>11}{pct:>9}"
        )
    totals = agreement["totals"]
    print("-" * 59)
    print(
        f"{'total':<12}{totals['agreed']:>8}{totals['statusMismatch']:>10}"
        f"{totals['pythonOnly']:>9}{totals['nodeOnly']:>11}"
        f"{totals['agreementPct'] if totals['agreementPct'] is not None else '—':>9}"
    )
    print(f"\nNode delta wall clock: {node_elapsed_ms / 1000:.2f}s")
    duplicates = agreement["uuidProjectionDuplicates"]
    print(
        "uuid projection duplicates: "
        f"python={duplicates['python']}, node={duplicates['node']}"
    )
    print("Disagreement classifications:")
    for row in agreement["classifications"]:
        marker = "improvement" if row["improvement"] else "needs investigation"
        print(f"  {row['classification']}: {row['count']} ({marker})")
    print(f"Unexplained discrepancies: {agreement['unexplained']}")
    print(f"Written to {output}")


if __name__ == "__main__":
    main()
