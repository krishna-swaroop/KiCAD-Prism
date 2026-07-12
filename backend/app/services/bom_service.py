"""
BOM Diff Service

Builds a Bill of Materials from all .kicad_sch files at each of two commits,
groups identical parts, diffs the two BOMs, and returns a structured change set
for the interactive BOM diff viewer.

Reuses parsing utilities from sch_diff_service to avoid duplication.
"""

import logging
import re
from collections import OrderedDict
from pathlib import Path

from git import Repo

from app.services import sch_diff_service
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)

# Bounded in-memory cache of a commit's aggregated BOM symbols, keyed by
# (commit_sha, sub_path). A commit is immutable, so its BOM never changes — and
# a BOM diff shares one commit between "this vs parent" navigation. Capped, no
# disk.
_BOM_COMMIT_CACHE: "OrderedDict[tuple[str, str | None], list[dict]]" = OrderedDict()
_BOM_COMMIT_CACHE_MAX = 32

# Per-sheet parsed BOM symbols, keyed by blob SHA (immutable). Lets unchanged
# sheets skip re-parsing even when the commit-level cache misses.
_BOM_SHEET_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_BOM_SHEET_CACHE_MAX = 128

# Extra symbol property names to search (case-insensitive fallbacks listed in order)
_MPN_KEYS = ["MPN", "Mpn", "mpn", "Part Number", "PartNumber"]
_MFR_KEYS = ["Manufacturer", "manufacturer", "MFR", "Mfr"]
_DESC_KEYS = ["Description", "description", "Desc", "desc"]
_DS_KEYS = ["Datasheet", "datasheet", "DS"]


def _first_property(item_sexp: list, keys: list[str]) -> str:
    for k in keys:
        v = sch_diff_service._property(item_sexp, k)
        if v:
            return v
    return ""


def _extract_bom_symbols(tree: list) -> dict:
    """
    Like sch_diff_service._extract_symbols but also pulls MPN, manufacturer,
    description, and datasheet from (property ...) nodes.
    Returns {uuid: symbol_dict}.
    """
    result = {}
    for item in sch_diff_service._get_all(tree, "symbol"):
        uid = sch_diff_service._uuid(item)
        if not uid:
            continue

        x, y, rot = sch_diff_service._at_with_rot(item)
        mirror_node = sch_diff_service._get(item, "mirror")
        mirror = mirror_node[1] if mirror_node and len(mirror_node) > 1 else ""
        unit_node = sch_diff_service._get(item, "unit")
        unit = int(unit_node[1]) if unit_node and len(unit_node) > 1 else 1
        in_bom_node = sch_diff_service._get(item, "in_bom")
        in_bom = (
            in_bom_node[1] if in_bom_node and len(in_bom_node) > 1 else "yes"
        ) == "yes"
        on_board_node = sch_diff_service._get(item, "on_board")
        on_board = (
            on_board_node[1] if on_board_node and len(on_board_node) > 1 else "yes"
        ) == "yes"
        dnp_node = sch_diff_service._get(item, "dnp")
        dnp = (dnp_node[1] if dnp_node and len(dnp_node) > 1 else "no") == "yes"

        result[uid] = {
            "type": "symbol",
            "uuid": uid,
            "x": x,
            "y": y,
            "rotation": rot,
            "mirror": mirror,
            "unit": unit,
            "in_bom": in_bom,
            "on_board": on_board,
            "dnp": dnp,
            "reference": sch_diff_service._property(item, "Reference") or "",
            "value": sch_diff_service._property(item, "Value") or "",
            "footprint": sch_diff_service._property(item, "Footprint") or "",
            "lib_id": (sch_diff_service._get(item, "lib_id") or [None, ""])[1],
            "mpn": _first_property(item, _MPN_KEYS),
            "manufacturer": _first_property(item, _MFR_KEYS),
            "description": _first_property(item, _DESC_KEYS),
            "datasheet": _first_property(item, _DS_KEYS),
        }
    return result


def _symbols_from_commit(
    repo_root: Path, commit: str, sub_path: str | None = None
) -> list[dict]:
    """
    Aggregate all BOM-eligible symbols across all .kicad_sch files at a commit.
    - Skips symbols with in_bom=False
    - Deduplicates multi-unit parts: keeps the lowest unit number per reference
    - sub_path constrains the search to the project subtree (Type-2 projects)
    """
    # Commit-level cache: a commit is immutable, so its aggregated BOM is too.
    cache_key = (commit, sub_path)
    cached = _BOM_COMMIT_CACHE.get(cache_key)
    if cached is not None:
        _BOM_COMMIT_CACHE.move_to_end(cache_key)
        return cached

    paths = sch_diff_service._find_all_sch_paths(repo_root, commit, sub_path)
    by_reference: dict[str, dict] = {}

    try:
        repo = Repo(repo_root)
    except Exception:
        repo = None

    for rel_path in paths:
        # Per-sheet cache by immutable blob SHA — skip re-parsing unchanged
        # sheets across commits/requests.
        sha = (
            sch_diff_service._blob_sha_at_commit(repo, commit, rel_path)
            if repo
            else None
        )
        symbols: dict | None = None
        if sha is not None:
            symbols = _BOM_SHEET_CACHE.get(sha)
            if symbols is not None:
                _BOM_SHEET_CACHE.move_to_end(sha)
        if symbols is None:
            content = sch_diff_service._read_file_at_commit(repo_root, commit, rel_path)
            if not content:
                continue
            tree = sch_diff_service._parse_sexp(content)
            symbols = _extract_bom_symbols(tree)
            if sha is not None:
                _BOM_SHEET_CACHE[sha] = symbols
                _BOM_SHEET_CACHE.move_to_end(sha)
                while len(_BOM_SHEET_CACHE) > _BOM_SHEET_CACHE_MAX:
                    _BOM_SHEET_CACHE.popitem(last=False)

        for sym in symbols.values():
            if not sym["in_bom"]:
                continue
            ref = sym["reference"]
            if not ref or ref.startswith("#"):  # skip power/hidden pins
                continue
            existing = by_reference.get(ref)
            if existing is None or sym["unit"] < existing["unit"]:
                by_reference[ref] = sym

    result = list(by_reference.values())
    _BOM_COMMIT_CACHE[cache_key] = result
    _BOM_COMMIT_CACHE.move_to_end(cache_key)
    while len(_BOM_COMMIT_CACHE) > _BOM_COMMIT_CACHE_MAX:
        _BOM_COMMIT_CACHE.popitem(last=False)
    return result


def _ref_sort_key(ref: str) -> tuple:
    """Sort references naturally: C1 < C2 < C10 < R1."""
    m = re.match(r"^([A-Za-z]+)(\d+)(.*)$", ref)
    if m:
        return (m.group(1), int(m.group(2)), m.group(3))
    return (ref, 0, "")


def _diff_boms(
    old_symbols: list[dict], new_symbols: list[dict], include_unchanged: bool
) -> list[dict]:
    """
    Diff at the individual reference level, then re-group into BOM rows.

    Each reference is matched by its designator string across commits.  Changes
    to value/footprint/mpn/etc. are detected per-component.  The resulting
    rows are grouped by (new_value, new_footprint, new_lib_id) so that a batch
    of identical components still appears as one row, but a reference that moved
    to a different group (e.g. value changed) is reported on its own row.
    """
    _COMPARABLE = [
        "value",
        "footprint",
        "lib_id",
        "mpn",
        "manufacturer",
        "description",
        "datasheet",
        "dnp",
    ]

    old_by_ref = {s["reference"]: s for s in old_symbols}
    new_by_ref = {s["reference"]: s for s in new_symbols}

    all_refs = set(old_by_ref) | set(new_by_ref)

    # Per-reference verdict: (kind, new_sym_or_old_if_removed, changes_dict)
    ref_results: list[tuple[str, str, dict, dict]] = []  # (kind, ref, sym, changes)
    for ref in all_refs:
        old_sym = old_by_ref.get(ref)
        new_sym = new_by_ref.get(ref)
        if old_sym is None:
            ref_results.append(("added", ref, new_sym, {}))
        elif new_sym is None:
            ref_results.append(("removed", ref, old_sym, {}))
        else:
            changes = {}
            for field in _COMPARABLE:
                ov, nv = old_sym.get(field), new_sym.get(field)
                if ov != nv:
                    changes[field] = {"old": ov, "new": nv}
            kind = "changed" if changes else "unchanged"
            ref_results.append((kind, ref, new_sym, changes))

    if not include_unchanged:
        ref_results = [(k, r, s, c) for k, r, s, c in ref_results if k != "unchanged"]

    # Re-group by (value, footprint, lib_id) of the representative symbol.
    # Within a group every reference must have the same kind to keep the display
    # clean; if mixed (e.g. one ref changed, others unchanged) we split them.
    # Group key: (kind, value, footprint, lib_id)
    groups: dict[tuple, dict] = {}
    for kind, ref, sym, changes in ref_results:
        value = sym.get("value", "")
        footprint = sym.get("footprint", "")
        lib_id = sym.get("lib_id", "")
        gkey = (kind, value, footprint, lib_id)
        if gkey not in groups:
            groups[gkey] = {
                "kind": kind,
                "references": [],
                "value": value,
                "footprint": footprint,
                "lib_id": lib_id,
                "mpn": sym.get("mpn", ""),
                "manufacturer": sym.get("manufacturer", ""),
                "description": sym.get("description", ""),
                "datasheet": sym.get("datasheet", ""),
                "dnp": sym.get("dnp", False),
                # Accumulate per-field changes across references in the group.
                # Store as sets of (old, new) pairs; render as list of unique changes.
                "_changes_acc": {},
            }
        g = groups[gkey]
        g["references"].append(ref)
        # Accumulate property changes (may differ per ref if e.g. dnp toggled)
        for field, ch in changes.items():
            acc = g["_changes_acc"].setdefault(field, set())
            acc.add((str(ch["old"]), str(ch["new"])))
        # Prefer non-empty metadata
        for field in ("mpn", "manufacturer", "description", "datasheet"):
            if not g[field] and sym.get(field):
                g[field] = sym[field]

    result = []
    for g in groups.values():
        g["references"] = sorted(g["references"], key=_ref_sort_key)
        g["qty"] = len(g["references"])
        # Flatten accumulated changes into simple {field: {old, new}} dicts.
        # If multiple distinct old→new pairs exist for a field, join with " / ".
        changes_out = {}
        for field, pairs in g.pop("_changes_acc").items():
            olds = " / ".join(sorted({p[0] for p in pairs}))
            news = " / ".join(sorted({p[1] for p in pairs}))
            changes_out[field] = {"old": olds or None, "new": news or None}
        g["changes"] = changes_out
        result.append(g)

    kind_order = {"added": 0, "removed": 1, "changed": 2, "unchanged": 3}
    result.sort(
        key=lambda r: (kind_order.get(r["kind"], 9), _ref_sort_key(r["references"][0]))
    )
    return result


def get_bom_diff_response(
    project_id: str, commit1: str, commit2: str, include_unchanged: bool = True
) -> dict | None:
    """
    Return BOM diff between two commits.

    commit1 = newer, commit2 = older.
    include_unchanged=False suppresses unchanged rows (single-commit history view).
    """
    row = workspace.get_project_by_id(project_id)
    if not row:
        return None

    project_path = Path(row["path"])
    repo_root = sch_diff_service._git_root(project_path)
    sub_path: str | None = row.get("sub_path")

    new_symbols = _symbols_from_commit(repo_root, commit1, sub_path)
    old_symbols = _symbols_from_commit(repo_root, commit2, sub_path)

    if not new_symbols and not old_symbols:
        return None

    rows = _diff_boms(old_symbols, new_symbols, include_unchanged=include_unchanged)
    return {
        "commit1": commit1,
        "commit2": commit2,
        "rows": rows,
    }
