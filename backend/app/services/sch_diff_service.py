"""
Schematic Diff Service

Parses .kicad_sch files from two commits, diffs them by UUID, and returns
a structured change set suitable for the interactive schematic diff viewer.
"""

import logging
import re
import threading
from collections import OrderedDict
from pathlib import Path

from git import Repo

from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# S-expression parser (lightweight, enough for kicad_sch)
# ---------------------------------------------------------------------------


def _parse_sexp(text: str) -> list:
    """
    Parse an s-expression string into nested Python lists.
    Atoms become strings; lists become Python lists.
    """
    tokens = _tokenize(text)
    pos, result = _read_expr(tokens, 0)
    return result


def _tokenize(text: str):
    token_re = re.compile(
        r'"(?:[^"\\]|\\.)*"'  # quoted string
        r"|[()]"  # parens
        r'|[^\s()"]+'  # atom
    )
    return token_re.findall(text)


def _read_expr(tokens: list, pos: int):
    if pos >= len(tokens):
        return pos, None
    tok = tokens[pos]
    if tok == "(":
        pos += 1  # consume '('
        lst = []
        while pos < len(tokens) and tokens[pos] != ")":
            pos, child = _read_expr(tokens, pos)
            if child is not None:
                lst.append(child)
        pos += 1  # consume ')'
        return pos, lst
    elif tok == ")":
        return pos, None
    else:
        # Strip surrounding quotes if present
        if tok.startswith('"') and tok.endswith('"'):
            tok = tok[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        return pos + 1, tok


# ---------------------------------------------------------------------------
# Schematic element extraction
# ---------------------------------------------------------------------------


def _get(lst: list, key: str, default=None):
    """Find first sub-list whose first element matches key."""
    for item in lst:
        if isinstance(item, list) and item and item[0] == key:
            return item
    return default


def _get_all(lst: list, key: str) -> list:
    return [item for item in lst if isinstance(item, list) and item and item[0] == key]


def _uuid(lst: list) -> str | None:
    for key in ("uuid", "tstamp"):
        u = _get(lst, key)
        if u and len(u) > 1:
            return u[1]
    return None


def _at(lst: list) -> tuple:
    """Return (x, y) from an (at x y ...) node."""
    a = _get(lst, "at")
    if a and len(a) >= 3:
        try:
            return float(a[1]), float(a[2])
        except (ValueError, TypeError):
            pass
    return 0.0, 0.0


def _property(lst: list, name: str) -> str | None:
    for item in _get_all(lst, "property"):
        if len(item) >= 3 and item[1] == name:
            return item[2]
    return None


def _at_with_rot(lst: list) -> tuple:
    """Return (x, y, rotation_deg) from an (at x y [rot]) node."""
    a = _get(lst, "at")
    if a and len(a) >= 3:
        try:
            x = float(a[1])
            y = float(a[2])
            rot = float(a[3]) if len(a) >= 4 else 0.0
            return x, y, rot
        except (ValueError, TypeError):
            pass
    return 0.0, 0.0, 0.0


def _flag(lst: list, key: str) -> bool:
    """Return True if a bare atom or sub-list with key is present."""
    for item in lst:
        if item == key:
            return True
        if isinstance(item, list) and item and item[0] == key:
            return True
    return False


def _extract_symbols(tree: list) -> dict:
    """Return {uuid: item_dict} for all symbol instances."""
    result = {}
    for item in _get_all(tree, "symbol"):
        uid = _uuid(item)
        if not uid:
            continue
        x, y, rot = _at_with_rot(item)
        mirror_node = _get(item, "mirror")
        mirror = mirror_node[1] if mirror_node and len(mirror_node) > 1 else ""
        unit_node = _get(item, "unit")
        unit = int(unit_node[1]) if unit_node and len(unit_node) > 1 else 1
        in_bom_node = _get(item, "in_bom")
        in_bom = (
            in_bom_node[1] if in_bom_node and len(in_bom_node) > 1 else "yes"
        ) == "yes"
        on_board_node = _get(item, "on_board")
        on_board = (
            on_board_node[1] if on_board_node and len(on_board_node) > 1 else "yes"
        ) == "yes"
        dnp_node = _get(item, "dnp")
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
            "reference": _property(item, "Reference") or "",
            "value": _property(item, "Value") or "",
            "footprint": _property(item, "Footprint") or "",
            "lib_id": (_get(item, "lib_id") or [None, ""])[1],
        }
    return result


def _extract_labels(tree: list) -> dict:
    """Return {uuid: item_dict} for net labels, global labels, hierarchical labels."""
    result = {}
    for kind in ("label", "global_label", "hierarchical_label", "net_label"):
        for item in _get_all(tree, kind):
            uid = _uuid(item)
            if not uid:
                continue
            x, y = _at(item)
            # label text is typically the second atom
            text = item[1] if len(item) > 1 and isinstance(item[1], str) else ""
            result[uid] = {
                "type": kind,
                "uuid": uid,
                "x": x,
                "y": y,
                "text": text,
            }
    return result


def _extract_texts(tree: list) -> dict:
    """Return {uuid: item_dict} for text annotations."""
    result = {}
    for item in _get_all(tree, "text"):
        uid = _uuid(item)
        if not uid:
            continue
        x, y = _at(item)
        text = item[1] if len(item) > 1 and isinstance(item[1], str) else ""
        result[uid] = {
            "type": "text",
            "uuid": uid,
            "x": x,
            "y": y,
            "text": text,
        }
    return result


def _extract_sheets(tree: list) -> dict:
    """Return {uuid: item_dict} for hierarchical sheet pins."""
    result = {}
    for item in _get_all(tree, "sheet"):
        uid = _uuid(item)
        if not uid:
            continue
        x, y = _at(item)
        sheet_file = _property(item, "Sheet file") or ""
        sheet_name = _property(item, "Sheet name") or ""
        result[uid] = {
            "type": "sheet",
            "uuid": uid,
            "x": x,
            "y": y,
            "sheet_file": sheet_file,
            "sheet_name": sheet_name,
        }
    return result


def _extract_wires(tree: list) -> dict:
    """Extract wires, buses, bus_entries, junctions, no_connects.

    KiCad v6+ tags these with their own UUIDs, so we prefer the UUID as the
    identity key — that makes a moved wire show up as a `changed` entry rather
    than a paired `added`+`removed`. We fall back to a geometry hash only for
    items missing a UUID (old files, hand-edited content).
    """
    result = {}
    # Two-point elements: wire, bus, bus_entry
    for kind in ("wire", "bus", "bus_entry"):
        for item in _get_all(tree, kind):
            pts = _get(item, "pts")
            if not pts:
                continue
            xys = _get_all(pts, "xy")
            coords = []
            for xy in xys:
                if len(xy) >= 3:
                    try:
                        coords.append((float(xy[1]), float(xy[2])))
                    except (ValueError, TypeError):
                        pass
            if len(coords) < 2:
                continue
            # Normalise direction so the geometry hash is stable, but only as
            # a fallback identity when the wire has no UUID.
            if coords[0] > coords[1]:
                coords[0], coords[1] = coords[1], coords[0]
            sx, sy = coords[0]
            ex, ey = coords[1]
            uid = _uuid(item) or f"{kind}:{sx:.4f},{sy:.4f}-{ex:.4f},{ey:.4f}"
            result[uid] = {
                "type": kind,
                "uuid": uid,
                "x": (sx + ex) / 2,
                "y": (sy + ey) / 2,
                "start_x": sx,
                "start_y": sy,
                "end_x": ex,
                "end_y": ey,
                "net": "",
            }
    # Point elements: junction, no_connect
    for kind in ("junction", "no_connect"):
        for item in _get_all(tree, kind):
            x, y = _at(item)
            uid = _uuid(item) or f"{kind}:{x:.4f},{y:.4f}"
            result[uid] = {
                "type": kind,
                "uuid": uid,
                "x": x,
                "y": y,
                "net": "",
            }
    return result


def _extract_all(tree: list) -> dict:
    items = {}
    items.update(_extract_symbols(tree))
    items.update(_extract_labels(tree))
    items.update(_extract_texts(tree))
    items.update(_extract_sheets(tree))
    items.update(_extract_wires(tree))
    return items


# ---------------------------------------------------------------------------
# Diff computation
# ---------------------------------------------------------------------------

_COMPARABLE_KEYS = {
    "symbol": [
        "reference",
        "value",
        "footprint",
        "lib_id",
        "x",
        "y",
        "rotation",
        "mirror",
        "unit",
        "in_bom",
        "on_board",
        "dnp",
    ],
    "label": ["text", "x", "y"],
    "global_label": ["text", "x", "y"],
    "hierarchical_label": ["text", "x", "y"],
    "net_label": ["text", "x", "y"],
    "text": ["text", "x", "y"],
    "sheet": ["sheet_file", "sheet_name", "x", "y"],
    "wire": ["start_x", "start_y", "end_x", "end_y"],
    "bus": ["start_x", "start_y", "end_x", "end_y"],
    "bus_entry": ["start_x", "start_y", "end_x", "end_y"],
    "junction": ["x", "y"],
    "no_connect": ["x", "y"],
}


def _item_changes(old: dict, new: dict) -> dict:
    """Return {field: {old, new}} for fields that differ."""
    changes = {}
    keys = _COMPARABLE_KEYS.get(old["type"], [])
    for k in keys:
        ov, nv = old.get(k), new.get(k)
        if ov != nv:
            changes[k] = {"old": ov, "new": nv}
    return changes


def _extract_sch_items(content: str, parser: str) -> dict:
    """Parse + extract schematic items as {uuid: item}, selecting the parser.

    'native' uses the in-house s-expression extractor; 'monkey' uses the
    kicad_monkey adapter. Both return the identical item-dict shape so the
    diff algorithm downstream is parser-agnostic.
    """
    if parser == "monkey":
        # Imported lazily so the native path has no dependency on kicad_monkey.
        from app.services import monkey_extract_service

        return monkey_extract_service.extract_all_sch(content)
    return _extract_all(_parse_sexp(content))


def diff_schematics(old_content: str, new_content: str, parser: str = "native") -> dict:
    """
    Compare two .kicad_sch file contents and return a structured diff.

    `parser` selects the parsing backend ('native' or 'monkey'); the diff
    algorithm itself is identical for both.

    Returns:
        {
            added:   [item_dict, ...],
            removed: [item_dict, ...],
            changed: [{item: item_dict, changes: {field: {old,new}}}, ...],
        }
    """
    old_items = _extract_sch_items(old_content, parser)
    new_items = _extract_sch_items(new_content, parser)
    return _diff_sch_items(old_items, new_items)


def _diff_sch_items(old_items: dict, new_items: dict) -> dict:
    """Diff two already-extracted schematic item-sets (keyed by uuid).

    Split out from ``diff_schematics`` so callers that already hold parsed
    item-sets (e.g. the AST-cached path) can diff without re-parsing.
    """
    old_uuids = set(old_items)
    new_uuids = set(new_items)

    added = [new_items[uid] for uid in (new_uuids - old_uuids)]
    removed = [old_items[uid] for uid in (old_uuids - new_uuids)]
    changed = []

    for uid in old_uuids & new_uuids:
        changes = _item_changes(old_items[uid], new_items[uid])
        if changes:
            changed.append(
                {"item": new_items[uid], "old_item": old_items[uid], "changes": changes}
            )

    # Pair moved wires/buses/bus_entries: items in `added`+`removed` of the
    # same kind that share an endpoint are treated as `changed` (a single
    # moved segment) rather than two separate add/remove markers.
    added, removed, moved = _pair_moved_segments(added, removed)
    changed.extend(moved)

    return {
        "added": added,
        "removed": removed,
        "changed": changed,
    }


_SEGMENT_KINDS = {"wire", "bus", "bus_entry"}


def _pair_moved_segments(added: list, removed: list) -> tuple:
    """
    Match segments in `removed` to segments in `added` that share an endpoint
    (same x/y within tolerance). Matched pairs are converted to `changed`
    entries so the diff overlay can show old geometry in the old view and
    new geometry in the new view, instead of rendering both as separate
    add/remove markers in both views.
    """
    EPS = 0.01  # mm — endpoint snap tolerance

    def endpoints(it: dict) -> tuple:
        return (
            (it.get("start_x"), it.get("start_y")),
            (it.get("end_x"), it.get("end_y")),
        )

    def share_endpoint(a: dict, b: dict) -> bool:
        for ax, ay in endpoints(a):
            if ax is None:
                continue
            for bx, by in endpoints(b):
                if bx is None:
                    continue
                if abs(ax - bx) < EPS and abs(ay - by) < EPS:
                    return True
        return False

    rem_segs = [i for i, it in enumerate(removed) if it.get("type") in _SEGMENT_KINDS]
    add_segs = [i for i, it in enumerate(added) if it.get("type") in _SEGMENT_KINDS]

    used_added: set = set()
    used_removed: set = set()
    moved: list = []

    for ri in rem_segs:
        if ri in used_removed:
            continue
        r_item = removed[ri]
        for ai in add_segs:
            if ai in used_added:
                continue
            a_item = added[ai]
            if a_item.get("type") != r_item.get("type"):
                continue
            if not share_endpoint(r_item, a_item):
                continue
            changes = {}
            for k in ("start_x", "start_y", "end_x", "end_y"):
                if r_item.get(k) != a_item.get(k):
                    changes[k] = {"old": r_item.get(k), "new": a_item.get(k)}
            moved.append({"item": a_item, "old_item": r_item, "changes": changes})
            used_added.add(ai)
            used_removed.add(ri)
            break

    new_added = [it for i, it in enumerate(added) if i not in used_added]
    new_removed = [it for i, it in enumerate(removed) if i not in used_removed]
    return new_added, new_removed, moved


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


_COMMIT_HASH_RE = re.compile(r"^[0-9a-fA-F]{4,40}$")


def is_valid_commit_hash(commit: str) -> bool:
    """True if `commit` is a plausible git object id (4-40 hex chars)."""
    return bool(commit) and bool(_COMMIT_HASH_RE.match(commit))


def validate_commit_hash(commit: str) -> str:
    """Return `commit` if it is a valid hex object id, else raise ValueError.

    This is the trust boundary for any commit identifier that reaches
    `git show`/`git ls-tree`. Rejecting non-hex input prevents ref/option
    injection (e.g. values starting with '-' or containing rev-syntax) from
    untrusted query parameters.
    """
    if not is_valid_commit_hash(commit):
        raise ValueError(f"Invalid commit hash: {commit!r}")
    return commit


def _is_safe_rel_path(rel_path: str) -> bool:
    """True if `rel_path` is a repo-root-relative path with no traversal.

    Rejects absolute paths, '..' escapes, and option-like leading dashes so
    a crafted path can't escape the tree or be parsed as a git option.
    """
    if not rel_path or rel_path.startswith(("/", "-")) or "\\" in rel_path:
        return False
    parts = rel_path.split("/")
    return ".." not in parts and "" not in parts[:-1]


def list_tree_paths(repo_root: Path, commit: str) -> list[str]:
    """Return all blob (file) paths in a commit's tree, repo-root-relative.

    GitPython equivalent of `git ls-tree -r --name-only <commit>`. Validates
    the commit at the trust boundary and fails soft (empty list) on any error,
    matching the previous subprocess behaviour. Shared by the schematic and
    PCB diff services.
    """
    if not is_valid_commit_hash(commit):
        logger.debug("Rejected unsafe commit for tree listing: %s", commit)
        return []
    try:
        tree = Repo(repo_root).commit(commit).tree
        return [item.path for item in tree.traverse() if item.type == "blob"]
    except Exception as err:
        logger.debug("Could not enumerate tree at %s: %s", commit, err)
        return []


def _git_root(project_path: Path) -> Path:
    """Return the git repository root for project_path."""
    try:
        repo = Repo(project_path, search_parent_directories=True)
        if repo.working_tree_dir:
            return Path(repo.working_tree_dir)
    except Exception as err:
        logger.debug(
            "Falling back to project path for git root %s: %s", project_path, err
        )
    return project_path


def _read_file_at_commit(repo_root: Path, commit: str, rel_path: str) -> str | None:
    """Return file content at a given commit using a path relative to the repo root."""
    # Trust boundary: reject anything that isn't a hex object id or a clean
    # repo-relative path before it reaches git.
    if not is_valid_commit_hash(commit) or not _is_safe_rel_path(rel_path):
        logger.debug("Rejected unsafe commit/path: %s:%s", commit, rel_path)
        return None
    try:
        blob = Repo(repo_root).commit(commit).tree / rel_path
        # Mirror the previous `git show` behaviour: tolerate undecodable bytes
        # rather than failing the whole diff on one odd file.
        return blob.data_stream.read().decode("utf-8", "replace")
    except Exception as err:
        # Missing path (KeyError), bad commit, or any git error → fail soft,
        # exactly as the subprocess version did.
        logger.debug("Could not read %s at %s: %s", rel_path, commit, err)
    return None


def _blob_sha_at_commit(repo, commit: str, rel_path: str) -> str | None:
    """Return the git object SHA of the blob at (commit, rel_path), or None.

    This is near-instant (tree lookup, no content read). If two commits have the
    same blob SHA for a path, the file is byte-identical and needs no diffing —
    letting us skip reading + parsing unchanged sheets entirely.
    """
    if not is_valid_commit_hash(commit) or not _is_safe_rel_path(rel_path):
        return None
    try:
        blob = repo.commit(commit).tree / rel_path
        return blob.hexsha
    except Exception:
        return None


# Bounded, in-memory cache of parsed sheet item-sets keyed by (blob_sha, parser).
# Git blobs are content-addressed and immutable, so the parse of a given blob
# never changes — safe to reuse across requests and across the two diff sides.
# Capped (LRU-ish via OrderedDict) so it never grows unbounded / touches disk.
_SCH_AST_CACHE: "OrderedDict[tuple[str, str], dict]" = OrderedDict()
_SCH_AST_CACHE_MAX = 128
_SCH_AST_LOCK = threading.Lock()


def _extract_sch_items_cached(blob_sha: str | None, content: str, parser: str) -> dict:
    """Parse+extract sheet items, caching by blob SHA (immutable git content).

    Thread-safe: the diff runs sheets in parallel, so the cache is guarded. The
    (CPU-bound) parse happens OUTSIDE the lock so parses still overlap; only the
    small dict bookkeeping is serialized.
    """
    if blob_sha is None:
        return _extract_sch_items(content, parser)
    key = (blob_sha, parser)
    with _SCH_AST_LOCK:
        hit = _SCH_AST_CACHE.get(key)
        if hit is not None:
            _SCH_AST_CACHE.move_to_end(key)
            return hit
    items = _extract_sch_items(content, parser)
    with _SCH_AST_LOCK:
        _SCH_AST_CACHE[key] = items
        _SCH_AST_CACHE.move_to_end(key)
        while len(_SCH_AST_CACHE) > _SCH_AST_CACHE_MAX:
            _SCH_AST_CACHE.popitem(last=False)
    return items


def _find_all_sch_paths(
    repo_root: Path, commit: str, sub_path: str | None = None
) -> list:
    """Return repo-root-relative .kicad_sch paths in the commit tree.

    When sub_path is set (Type-2 project) only paths inside that subtree are
    returned, so sibling boards in the same monorepo are not included.
    """
    paths = [p for p in list_tree_paths(repo_root, commit) if p.endswith(".kicad_sch")]
    if sub_path:
        prefix = sub_path.rstrip("/") + "/"
        paths = [p for p in paths if p == sub_path or p.startswith(prefix)]
    return paths


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def get_schematic_diff(
    project_id: str,
    commit1: str,
    commit2: str,
    parser: str = "native",
    include_content: bool = True,
    manifest_only: bool = False,
) -> dict | None:
    """
    Return interactive diff data for all schematic sheets between two commits.

    When ``include_content`` is False the raw sheet text is omitted and only
    ``rel_path`` + presence flags are sent, so the client can lazy-fetch each
    sheet from the cacheable per-commit file endpoint instead of receiving the
    full (often multi-MB) content inline.

    When ``manifest_only`` is True the sheets are enumerated (a cheap tree walk
    + blob-SHA lookup) but nothing is parsed and every ``diff`` is empty. The
    client uses this to begin fetching + parsing the sheet files in the viewer
    IMMEDIATELY, in parallel with the full (parsing) diff request whose markers
    arrive a beat later. This hides the structural-diff cost behind the parse.

    Returns:
        {
            commit1: str,
            commit2: str,
            sheets: [
                {
                    filename: str,          # bare filename, e.g. "top.kicad_sch"
                    rel_path: str,          # repo-relative path for lazy fetch
                    has_old: bool,
                    has_new: bool,
                    old_content: str|None,  # None when include_content=False
                    new_content: str|None,  # None when include_content=False
                    diff: { added, removed, changed },  # empty lists if one side missing
                },
                ...
            ],
        }
    or None if the project or no schematics can be found.
    """
    # Trust boundary: commit ids come from query parameters.
    if not is_valid_commit_hash(commit1) or not is_valid_commit_hash(commit2):
        return None

    row = workspace.get_project_by_id(project_id)
    if not row:
        return None

    project_path = Path(row["path"])
    repo_root = _git_root(project_path)
    sub_path: str | None = row.get("sub_path")

    paths1 = set(_find_all_sch_paths(repo_root, commit1, sub_path))
    paths2 = set(_find_all_sch_paths(repo_root, commit2, sub_path))
    all_paths = paths1 | paths2

    if not all_paths:
        return None

    # Manifest fast path: just the file list + presence flags, no parse, empty
    # diffs. Lets the client kick off the viewer's fetch+parse immediately while
    # the full diff computes in parallel.
    if manifest_only:
        manifest_sheets = []
        for rel_path in sorted(all_paths):
            in1 = rel_path in paths1
            in2 = rel_path in paths2
            manifest_sheets.append(
                {
                    "filename": rel_path.split("/")[-1],
                    "rel_path": rel_path,
                    "has_old": in2,
                    "has_new": in1,
                    "old_content": None,
                    "new_content": None,
                    "diff": {"added": [], "removed": [], "changed": []},
                }
            )
        return {"commit1": commit1, "commit2": commit2, "sheets": manifest_sheets}

    # Open the repo ONCE (Repo() is expensive; the old code re-opened it per
    # file per commit — 40+ opens for a 10-sheet diff).
    try:
        repo = Repo(repo_root)
    except Exception:
        return None

    def _process_sheet(rel_path: str) -> dict | None:
        filename = rel_path.split("/")[-1]
        in1 = rel_path in paths1
        in2 = rel_path in paths2

        sha1 = _blob_sha_at_commit(repo, commit1, rel_path) if in1 else None
        sha2 = _blob_sha_at_commit(repo, commit2, rel_path) if in2 else None

        # Fast path: identical blob SHA at both commits ⇒ byte-for-byte
        # unchanged ⇒ skip reading + parsing entirely, empty diff.
        if in1 and in2 and sha1 is not None and sha1 == sha2:
            content = (
                _read_file_at_commit(repo_root, commit1, rel_path)
                if include_content
                else None
            )
            return {
                "filename": filename,
                "rel_path": rel_path,
                "has_old": True,
                "has_new": True,
                "old_content": content,
                "new_content": content,
                "diff": {"added": [], "removed": [], "changed": []},
            }

        # commit1 = newer, commit2 = older (parent)
        new_content = (
            _read_file_at_commit(repo_root, commit1, rel_path) if in1 else None
        )
        old_content = (
            _read_file_at_commit(repo_root, commit2, rel_path) if in2 else None
        )

        if old_content and new_content:
            new_items = _extract_sch_items_cached(sha1, new_content, parser)
            old_items = _extract_sch_items_cached(sha2, old_content, parser)
            diff = _diff_sch_items(old_items, new_items)
        elif new_content:
            items = list(_extract_sch_items_cached(sha1, new_content, parser).values())
            diff = {"added": items, "removed": [], "changed": []}
        elif old_content:
            items = list(_extract_sch_items_cached(sha2, old_content, parser).values())
            diff = {"added": [], "removed": items, "changed": []}
        else:
            return None

        return {
            "filename": filename,
            "rel_path": rel_path,
            "has_old": old_content is not None,
            "has_new": new_content is not None,
            "old_content": old_content if include_content else None,
            "new_content": new_content if include_content else None,
            "diff": diff,
        }

    # Sheets processed serially. NOTE: a ThreadPool was tried here — the git
    # blob reads release the GIL and would overlap — but GitPython's shared
    # Repo uses a persistent `git cat-file` subprocess that is NOT thread-safe
    # (concurrent access corrupts its stream). With skip-unchanged + the AST
    # cache already eliminating the bulk of the work, the serial path is fast
    # (~1.6s) and safe; parallelism gave no measurable win here.
    sheets = [
        r for r in (_process_sheet(p) for p in sorted(all_paths)) if r is not None
    ]

    if not sheets:
        return None

    return {
        "commit1": commit1,
        "commit2": commit2,
        "sheets": sheets,
    }
