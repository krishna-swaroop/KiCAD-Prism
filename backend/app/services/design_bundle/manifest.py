"""What a manifest says: member readiness (bundle-format.md §3.3) and its invariants (§3.4).

A consumer declares the member paths it needs; :func:`readiness` answers for
each from the manifest alone plus the state of the bundle's job. A stage only
ever moves from ``pending`` to final for a stored bundle, so a final answer
may be cached.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from app.services.design_bundle.generator import bundle_key

STAGES = ("parse", "board", "models")
FINAL = frozenset({"complete", "partial", "failed", "skipped"})
PROJECTIONS = (
    "projections/board-objects.json", "projections/occurrences.json", "projections/placements.json",
    "projections/project.json", "projections/route-metrics.json", "projections/semantic-index.json",
    "projections/stackup.json", "projections/system-interface.json",
)
ROLE_STAGE = {"design": "parse", "projection": "parse", "refilled-board": "board", "materialization": "board", "component-models": "models"}
SCHEMA_ROLES = frozenset({"design", "materialization", "projection"})
SOURCE_ROLES = {
    ".kicad_pro": "source-project", ".kicad_sch": "source-schematic", ".kicad_pcb": "source-board",
    ".kicad_dru": "source-design-rules", ".kicad_wks": "source-worksheet", ".kicad_jobset": "source-jobset",
    ".kicad_sym": "source-symbol-library", ".lib": "source-symbol-library", ".dcm": "source-symbol-library",
    ".kicad_mod": "source-footprint",
}


def stage_of(path: str) -> str:
    """The stage that writes ``path`` (bundle-format.md §2.1)."""

    if path.startswith(("refilled/", "materialization/")):
        return "board"
    if path.startswith("viewer/"):
        return "models"
    return "parse"


def statuses(manifest: Mapping[str, Any]) -> dict[str, str]:
    return {stage: str(manifest["stages"][stage]["status"]) for stage in STAGES}


def all_final(manifest: Mapping[str, Any]) -> bool:
    return all(status in FINAL for status in statuses(manifest).values())


def next_stage(manifest: Mapping[str, Any]) -> str | None:
    """The first ``pending`` stage, or ``None`` when every stage is final."""

    return next((stage for stage in STAGES if manifest["stages"][stage]["status"] == "pending"), None)


@dataclass(frozen=True)
class Readiness:
    """One member's answer. ``state`` is ``ready``, ``pending``, ``unavailable``,
    ``failed``, ``skipped`` or ``not-applicable``; ``detail`` explains the last four."""

    path: str
    state: str
    stage: str
    detail: str = ""

    @property
    def final(self) -> bool:
        return self.state in ("ready", "failed", "skipped", "not-applicable")


def readiness(manifest: Mapping[str, Any] | None, path: str, *, job_active: bool) -> Readiness:
    """§3.3 for one member path. ``manifest`` is ``None`` before stage parse wrote the archive."""

    stage = stage_of(path)
    if manifest is None:
        return Readiness(path, "pending" if job_active else "unavailable", stage, "" if job_active else "no bundle yet")
    if any(member["path"] == path for member in manifest["members"]):
        return Readiness(path, "ready", stage)
    record = manifest["stages"][stage]
    if record["status"] == "pending":
        if job_active:
            return Readiness(path, "pending", stage)
        return Readiness(path, "unavailable", stage, "the bundle's job ended before this stage; it is retried on the next sync or request")
    failure = next((item for item in record["failed_members"] if item["path"] == path), None)
    if failure is not None:
        return Readiness(path, "failed", stage, f"{failure['code']}: {failure['message']}")
    if record["status"] == "failed":
        error = record.get("error") or {}
        return Readiness(path, "failed", stage, f"{error.get('code', 'failed')}: {error.get('message', '')}")
    if record["status"] == "skipped":
        return Readiness(path, "skipped", stage, str(record.get("skip_reason") or ""))
    return Readiness(path, "not-applicable", stage, "not a member of this bundle")


# --------------------------------------------------------------- invariants


def _source_role(path: str) -> str | None:
    name = path.rsplit("/", 1)[-1].lower()
    if name in ("fp-lib-table", "sym-lib-table"):
        return "source-library-table"
    if name == ".prism.json":
        return "source-prism-settings"
    for suffix, role in SOURCE_ROLES.items():
        if name.endswith(suffix):
            return role
    return "source-3d-model"


def _sorted_unique(items: list[Any]) -> bool:
    return all(items[i] < items[i + 1] for i in range(len(items) - 1))


def violations(manifest: Mapping[str, Any]) -> list[str]:
    """The §3.4 invariants a manifest breaks, as ``I<n>: ...`` lines (empty when it keeps them all)."""

    found: list[str] = []
    members = manifest["members"]
    by_path = {m["path"]: m for m in members}
    paths = [m["path"].encode("utf-8") for m in members]
    stages = manifest["stages"]
    config = manifest["config"]
    if not _sorted_unique(paths):
        found.append("I1: members are not sorted by path without duplicates")
    schemas = {item["path"]: item["schema"] for item in manifest["generator"]["member_schemas"]}
    if schemas.get("bundle.json") != "prism.bundle.manifest.a3":
        found.append("I3: generator.member_schemas lacks bundle.json")
    for member in members:
        role, path = member["role"], member["path"]
        if role.startswith("source-"):
            if member["stage"] != "parse" or not path.startswith("sources/") or _source_role(path) != role:
                found.append(f"I2: {path} has role {role}")
            if "source" not in member or member["source"]["path"] != path[len("sources/"):]:
                found.append(f"I12: {path} lacks its key entry")
        else:
            if ROLE_STAGE.get(role) != member["stage"]:
                found.append(f"I2: {path} is written by the wrong stage")
            if "source" in member:
                found.append(f"I12: {path} carries a source entry")
        if (role in SCHEMA_ROLES) != ("member_schema" in member) or (
            "member_schema" in member and schemas.get(path) != member["member_schema"]
        ):
            found.append(f"I3: {path}'s member_schema")
    for key, role in (("project_file", "source-project"), ("board", "source-board"), ("root_schematic", "source-schematic")):
        if key in config and by_path.get(f"sources/{config[key]}", {}).get("role") != role:
            found.append(f"I4: sources/{config[key]} is not a {role} member")
    parse, board, models = (stages[s]["status"] for s in STAGES)
    if parse not in ("complete", "partial", "failed"):
        found.append("I5: parse is not final")
    expected_board_skip = "earlier-stage-failed" if parse == "failed" else ("no-board" if "board" not in config else None)
    if (board == "skipped") != (expected_board_skip is not None) or (
        board == "skipped" and stages["board"].get("skip_reason") != expected_board_skip
    ):
        found.append("I5: board's skip")
    if (board == "pending" and models != "pending") or (board == "skipped" and models != "skipped") or (
        board == "partial" and (models != "skipped" or stages["models"].get("skip_reason") != "earlier-stage-failed")
    ) or models in ("partial", "failed"):
        found.append("I5: models' status")
    for stage in STAGES:
        record = stages[stage]
        status = record["status"]
        if ("error" in record) != (status == "failed") or ("skip_reason" in record) != (status == "skipped"):
            found.append(f"I6: {stage}'s error or skip_reason")
        if bool(record["failed_members"]) != (status == "partial"):
            found.append(f"I6: {stage}'s failed_members")
        if status in ("pending", "skipped") and record["warnings"]:
            found.append(f"I6: {stage} has warnings")
        failed = [item["path"] for item in record["failed_members"]]
        if any(path in by_path for path in failed) or not _sorted_unique([p.encode() for p in failed]):
            found.append(f"I6: {stage}'s failed members")
        written = [m["path"] for m in members if m["stage"] == stage and not m["role"].startswith("source-")]
        if status in ("pending", "failed", "skipped") and written:
            found.append(f"I7: {stage} is {status} but has members")
        warnings = [(w["code"], w["message"]) for w in record["warnings"]]
        if not _sorted_unique(warnings):
            found.append(f"I10: {stage}'s warnings")
    if parse in ("complete", "partial"):
        fixed = list(PROJECTIONS) + (["design.json"] if "root_schematic" in config else [])
        failed = {item["path"] for item in stages["parse"]["failed_members"]}
        if any(path not in by_path and path not in failed for path in fixed):
            found.append("I7: a parse member is neither written nor failed")
    found.extend(_board_invariants(manifest, by_path))
    if ("bundle_key" in manifest) != ("revision_key" in manifest) or (
        "revision_key" in manifest and manifest["bundle_key"] != bundle_key(manifest["revision_key"], manifest["generator"])
    ):
        found.append("I11: bundle_key")
    return found


def _board_invariants(manifest: Mapping[str, Any], by_path: Mapping[str, Any]) -> list[str]:
    found: list[str] = []
    record = manifest["stages"]["board"]
    status = record["status"]
    saved = manifest["config"].get("zone_fills") == "saved"
    pack = "materialization/board.kmpack" in by_path
    provenance = record.get("fill_provenance")
    if (provenance is not None) != (status in ("complete", "partial")) or (
        provenance is not None and (provenance == "saved") != saved
    ):
        found.append("I8: fill_provenance")
    board_name = str(manifest["config"].get("board", "")).rsplit("/", 1)[-1]
    if (f"refilled/{board_name}" in by_path) != (provenance == "refilled"):
        found.append("I8: refilled board")
    if ("cross_check" in record) != pack or ("fill_check" in record) != (pack and provenance == "refilled"):
        found.append("I8: cross_check or fill_check")
    codes = {w["code"] for w in record["warnings"]}
    if ("saved-fills-used" in codes) != (provenance == "saved") or (provenance == "saved" and "stale-saved-fills" in codes):
        found.append("I8: saved-fills-used")
    check = record.get("cross_check")
    if check is not None:
        state = check["status"]
        lists = (check["warnings"], check["errors"])
        ok = {
            "passed": not lists[0] and not lists[1],
            "passed-with-warnings": bool(lists[0]) and not lists[1],
            "failed": bool(lists[1]),
            "skipped": not any(lists) and not check["mappings"]
            and not (check["components_compared"] or check["pads_compared"] or check["nets_compared"]),
        }[state]
        if not ok or ((state == "skipped") != ("design.json" not in by_path)):
            found.append("I9: cross_check")
    return found
