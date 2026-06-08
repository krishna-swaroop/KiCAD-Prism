from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import logging
import posixpath
import re
import tempfile
from pathlib import Path
from typing import Any, Iterable, Optional

from git import Repo
from git.exc import BadName

from app.services import path_config_service
from app.services.workspace_service import workspace

logger = logging.getLogger(__name__)

ANALYSIS_SCHEMA = "kicad_prism.analysis.v1"
CHANGE_AWARE_DIFF_SCHEMA = "kicad_prism.change_aware_diff.v1"

_COMMIT_RE = re.compile(r"^[0-9a-fA-F]{4,40}$")
_CACHE_MAX_ENTRIES = 32
_analysis_cache: dict[tuple[str, tuple[tuple[str, int, int], ...]], dict[str, Any]] = {}


@dataclass(frozen=True)
class DesignFileSet:
    project_root: Path
    project: Optional[Path]
    schematic: Optional[Path]
    pcb: Optional[Path]


def clear_analysis_cache(project_path: Optional[str] = None) -> None:
    global _analysis_cache
    if project_path is None:
        _analysis_cache = {}
        return
    root = str(Path(project_path).resolve())
    _analysis_cache = {
        key: value for key, value in _analysis_cache.items() if key[0] != root
    }


def is_valid_commit_hash(value: str) -> bool:
    return bool(_COMMIT_RE.fullmatch(value or ""))


def validate_commit_hash(value: str) -> str:
    if not is_valid_commit_hash(value):
        raise ValueError("Invalid commit hash")
    return value


def _normalize_git_path(path: Optional[str]) -> str:
    if not path or path == ".":
        return ""
    normalized = posixpath.normpath(str(path).replace("\\", "/"))
    if normalized in ("", "."):
        return ""
    if normalized.startswith("/") or normalized == ".." or normalized.startswith("../"):
        raise ValueError("Invalid project path")
    return normalized


def _relative_to(root: Path, path: Optional[Path]) -> Optional[str]:
    if path is None:
        return None
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.name


def _file_identity(path: Path) -> tuple[str, int, int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return (str(path.resolve()), int(stat.st_mtime_ns), int(stat.st_size))


def _fingerprint(files: DesignFileSet) -> tuple[tuple[str, int, int], ...]:
    paths: list[Path] = []
    config_path = files.project_root / ".prism.json"
    paths.append(config_path)
    for candidate in (files.project, files.schematic, files.pcb):
        if candidate is not None:
            paths.append(candidate)
    paths.extend(
        path
        for path in files.project_root.rglob("*.kicad_sch")
        if not any(part.startswith(".") for part in path.relative_to(files.project_root).parts)
    )
    identities = [_file_identity(path) for path in sorted(set(paths), key=lambda item: str(item))]
    return tuple(identity for identity in identities if identity is not None)


def resolve_design_files(project_path: str | Path) -> DesignFileSet:
    root = Path(project_path).resolve()
    resolved = path_config_service.resolve_paths(str(root))
    schematic = Path(resolved.schematic).resolve() if resolved.schematic else None
    pcb = Path(resolved.pcb).resolve() if resolved.pcb else None
    project = _select_project_file(root, schematic, pcb)
    return DesignFileSet(project_root=root, project=project, schematic=schematic, pcb=pcb)


def _select_project_file(root: Path, schematic: Optional[Path], pcb: Optional[Path]) -> Optional[Path]:
    candidates = sorted(root.glob("*.kicad_pro"), key=lambda item: item.name.casefold())
    if not candidates:
        return None
    preferred_stems = [
        path.stem.casefold()
        for path in (schematic, pcb)
        if path is not None
    ]
    for stem in preferred_stems:
        for candidate in candidates:
            if candidate.stem.casefold() == stem:
                return candidate.resolve()
    if len(candidates) == 1:
        return candidates[0].resolve()
    for candidate in candidates:
        if candidate.stem.casefold() == root.name.casefold():
            return candidate.resolve()
    return candidates[0].resolve()


def analyze_project(project_path: str | Path) -> dict[str, Any]:
    files = resolve_design_files(project_path)
    cache_key = (str(files.project_root), _fingerprint(files))
    cached = _analysis_cache.get(cache_key)
    if cached is not None:
        return deepcopy(cached)

    analysis = _build_analysis(files)
    _analysis_cache[cache_key] = deepcopy(analysis)
    while len(_analysis_cache) > _CACHE_MAX_ENTRIES:
        _analysis_cache.pop(next(iter(_analysis_cache)))
    return analysis


def _build_analysis(files: DesignFileSet) -> dict[str, Any]:
    diagnostics: list[dict[str, Any]] = []
    design = None
    design_json: dict[str, Any] = {}
    netlist_json: dict[str, Any] = {}

    if not files.project:
        diagnostics.append(_diagnostic("missing_project", "warning", "No .kicad_pro file was found."))
    if not files.schematic:
        diagnostics.append(_diagnostic("missing_schematic", "warning", "No root .kicad_sch file was resolved."))
    if not files.pcb:
        diagnostics.append(_diagnostic("missing_pcb", "info", "No .kicad_pcb file was resolved."))

    try:
        design = _load_design(files)
    except Exception as exc:
        logger.exception("Failed to load KiCad design from %s", files.project_root)
        diagnostics.append(_diagnostic("parse_failed", "error", str(exc)))

    if design is not None:
        try:
            design_json = design.to_json(include_indexes=True)
            _augment_design_json_with_schematic_positions(design_json, design, files)
        except Exception as exc:
            diagnostics.append(_diagnostic("design_json_failed", "error", str(exc)))
        try:
            netlist_json = design.to_kicad_netlist_json()
        except Exception as exc:
            diagnostics.append(_diagnostic("netlist_json_failed", "error", str(exc)))

    sheets = _sheet_instances(files, design)
    diagnostics.extend(_semantic_diagnostics(design_json, sheets, files))

    return {
        "schema": ANALYSIS_SCHEMA,
        "files": {
            "project": _relative_to(files.project_root, files.project),
            "schematic": _relative_to(files.project_root, files.schematic),
            "pcb": _relative_to(files.project_root, files.pcb),
        },
        "sheets": sheets,
        "diagnostics": diagnostics,
        "design_json": design_json,
        "netlist_json": netlist_json,
    }


def _load_design(files: DesignFileSet):
    from kicad_monkey import KiCadDesign, KiCadProject

    same_stem_schematic = files.project.with_suffix(".kicad_sch") if files.project else None
    same_stem_pcb = files.project.with_suffix(".kicad_pcb") if files.project else None
    schematic_matches_project = (
        files.schematic is None
        or same_stem_schematic is not None
        and same_stem_schematic.resolve() == files.schematic.resolve()
    )
    pcb_matches_project = (
        files.pcb is None
        or same_stem_pcb is not None
        and same_stem_pcb.resolve() == files.pcb.resolve()
    )
    can_use_project_loader = (
        files.project is not None
        and schematic_matches_project
        and pcb_matches_project
        and (
            same_stem_schematic is not None
            and same_stem_schematic.is_file()
            or same_stem_pcb is not None
            and same_stem_pcb.is_file()
        )
    )

    if can_use_project_loader:
        design = KiCadDesign.from_project_file(files.project)
    elif files.schematic:
        design = KiCadDesign.from_schematic_file(files.schematic)
    elif files.pcb:
        design = KiCadDesign.from_pcb_file(files.pcb)
    else:
        return None

    if files.project is not None:
        try:
            design.project = KiCadProject.from_file(files.project)
            design.project_path = files.project
        except Exception:
            logger.exception("Failed to load KiCad project metadata from %s", files.project)
    if files.pcb is not None:
        design.pcb_path = files.pcb
        design._pcb = None
    return design


def _sheet_instances(files: DesignFileSet, design: Any) -> list[dict[str, Any]]:
    if design is None:
        return []
    out: list[dict[str, Any]] = []
    try:
        instances = design.schematic_instances()
    except Exception:
        logger.exception("Failed to enumerate schematic instances for %s", files.project_root)
        return []
    for item in instances:
        source = getattr(item, "source_path", None)
        source_path = Path(source) if source else None
        out.append({
            "instance_index": int(getattr(item, "instance_index", 0) or 0),
            "sheet_number": int(getattr(item, "sheet_number", 0) or 0),
            "sheet_count": int(getattr(item, "sheet_count", 0) or 0),
            "sheet_name": str(getattr(item, "sheet_name", "") or ""),
            "sheet_path": str(getattr(item, "sheet_path", "") or ""),
            "sheet_path_uuids": str(getattr(item, "sheet_path_uuids", "") or ""),
            "sheet_instance_path": getattr(item, "sheet_instance_path", None),
            "source_file": _relative_to(files.project_root, source_path),
            "filename": source_path.name if source_path else "",
            "is_top_level": bool(getattr(item, "is_top_level", False)),
            "parent_sheet_path": getattr(item, "parent_sheet_path", None),
        })
    return out


def _augment_design_json_with_schematic_positions(design_json: dict[str, Any], design: Any, files: DesignFileSet) -> None:
    by_reference: dict[str, dict[str, Any]] = {}
    by_uuid: dict[str, dict[str, Any]] = {}
    for symbol, sheet_path, schematic in _walk_schematic_symbols(design):
        reference = _string_or_none(getattr(symbol, "reference", None) or _property_value(symbol, "Reference"))
        uuid = _string_or_none(getattr(symbol, "uuid", None))
        source_path = Path(getattr(schematic, "source_path", "") or "")
        metadata = {
            "uuid": uuid,
            "svg_id": uuid,
            "x": _number_or_none(getattr(symbol, "at_x", None)),
            "y": _number_or_none(getattr(symbol, "at_y", None)),
            "sheet": _string_or_none(sheet_path),
            "sheet_file": _relative_to(files.project_root, source_path) if source_path else None,
            "sheet_filename": source_path.name if source_path else None,
        }
        metadata = {key: value for key, value in metadata.items() if value not in (None, "")}
        if reference:
            by_reference[reference] = metadata
        if uuid:
            by_uuid[uuid] = metadata

    for component in design_json.get("components") or []:
        reference = _string_or_none(component.get("designator"))
        uuid = _string_or_none(component.get("svg_id") or (component.get("parameters") or {}).get("kicad_instance_uuid"))
        metadata = (by_uuid.get(uuid or "") or by_reference.get(reference or "") or {}).copy()
        if not metadata:
            continue
        for key, value in metadata.items():
            component.setdefault(key, value)


def _walk_schematic_symbols(design: Any):
    try:
        for entry in design.top_schematic.walk_symbols():
            if isinstance(entry, tuple) and len(entry) >= 3:
                yield entry[0], entry[1], entry[2]
            else:
                yield entry, "", design.top_schematic
        return
    except Exception:
        pass

    schematics = getattr(design, "schematics", []) or []
    if callable(schematics):
        try:
            schematics = schematics()
        except Exception:
            schematics = []
    for schematic in schematics:
        for symbol in getattr(schematic, "symbols", []) or []:
            yield symbol, "", schematic


def _property_value(item: Any, key: str) -> Optional[str]:
    getter = getattr(item, "get_property_value", None)
    if callable(getter):
        try:
            return _string_or_none(getter(key))
        except Exception:
            return None
    return None


def _semantic_diagnostics(design_json: dict[str, Any], sheets: list[dict[str, Any]], files: DesignFileSet) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    hierarchy = design_json.get("schematic_hierarchy") or {}
    for row in hierarchy.get("unresolved") or []:
        diagnostics.append(_diagnostic(
            "unresolved_sheet",
            "warning",
            f"Sheet '{row.get('name') or row.get('child_filename')}' points to unresolved file '{row.get('child_filename')}'.",
            path=row.get("child_filename"),
        ))

    seen_sources = {
        sheet.get("source_file")
        for sheet in sheets
        if sheet.get("source_file")
    }
    if files.schematic and _relative_to(files.project_root, files.schematic) not in seen_sources:
        diagnostics.append(_diagnostic("root_sheet_not_in_hierarchy", "warning", "Resolved root schematic was not present in the hierarchy."))
    return diagnostics


def get_design_json(project_path: str | Path) -> dict[str, Any]:
    return deepcopy(analyze_project(project_path).get("design_json") or {})


def diff_design_json(old_design: dict[str, Any], new_design: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": CHANGE_AWARE_DIFF_SCHEMA,
        "components": _diff_maps(
            _component_map(old_design),
            _component_map(new_design),
            fields=("value", "footprint", "library_ref", "parameters", "sheet", "x", "y"),
        ),
        "nets": _diff_maps(
            _net_map(old_design),
            _net_map(new_design),
            fields=("terminals", "net_class", "aliases"),
        ),
        "sheets": _diff_maps(
            _sheet_map(old_design),
            _sheet_map(new_design),
            fields=("filename", "path", "title", "revision", "date"),
        ),
        "placements": _diff_maps(
            _placement_map(old_design),
            _placement_map(new_design),
            fields=("layer", "footprint", "center_x", "center_y", "rotation"),
        ),
    }


def get_change_aware_diff(project_id: str, commit1: str, commit2: str) -> dict[str, Any]:
    commit1 = validate_commit_hash(commit1)
    commit2 = validate_commit_hash(commit2)
    row = workspace.get_project_by_id(project_id)
    if not row:
        raise ValueError("Project not found")

    repo_root = Path(row.get("parent_repo_path") or row.get("path") or "").resolve()
    if not repo_root:
        raise ValueError("Project repository path is not available")
    repo = Repo(repo_root)
    old_commit = _resolve_commit(repo, commit2)
    new_commit = _resolve_commit(repo, commit1)
    relative_prefix = _normalize_git_path(row.get("relative_path"))

    with tempfile.TemporaryDirectory(prefix="prism_semantic_diff_") as tmp:
        tmp_root = Path(tmp)
        old_dir = tmp_root / "old"
        new_dir = tmp_root / "new"
        _snapshot_tree(old_commit, relative_prefix, old_dir)
        _snapshot_tree(new_commit, relative_prefix, new_dir)

        old_design = get_design_json(old_dir)
        new_design = get_design_json(new_dir)
        design_diff = diff_design_json(old_design, new_design)

        return {
            "schema": CHANGE_AWARE_DIFF_SCHEMA,
            "commit1": commit1,
            "commit2": commit2,
            "schematic": {
                "files": _paired_source_files(old_commit, new_commit, relative_prefix, ".kicad_sch"),
                "diff": _normalise_schematic_diff(design_diff),
            },
            "pcb": {
                "files": _paired_source_files(old_commit, new_commit, relative_prefix, ".kicad_pcb"),
                "diff": _normalise_pcb_diff(design_diff),
            },
            "raw_design_diff": design_diff,
        }


def _resolve_commit(repo: Repo, commit_hash: str):
    try:
        return repo.commit(commit_hash)
    except BadName as error:
        raise ValueError(f"Commit not found: {commit_hash}") from error


def _tree_at_prefix(commit, relative_prefix: str):
    if not relative_prefix:
        return commit.tree
    try:
        entry = commit.tree / relative_prefix
    except KeyError as error:
        raise ValueError("Project path was not found at one of the selected commits") from error
    if entry.type != "tree":
        raise ValueError("Project path is not a directory at one of the selected commits")
    return entry


def _snapshot_tree(commit, relative_prefix: str, destination: Path) -> None:
    root = _tree_at_prefix(commit, relative_prefix)
    destination.mkdir(parents=True, exist_ok=True)
    for entry in root.traverse():
        if entry.type != "blob":
            continue
        rel_path = Path(entry.path).relative_to(root.path) if root.path else Path(entry.path)
        if any(part.startswith(".git") for part in rel_path.parts):
            continue
        target = destination / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(entry.data_stream.read())


def _blob_paths(commit, relative_prefix: str, suffix: str) -> list[str]:
    root = _tree_at_prefix(commit, relative_prefix)
    paths: list[str] = []
    for entry in root.traverse():
        if entry.type != "blob" or not entry.path.endswith(suffix):
            continue
        rel_path = Path(entry.path).relative_to(root.path).as_posix() if root.path else entry.path
        paths.append(rel_path)
    return sorted(paths, key=str.casefold)


def _read_blob(commit, relative_prefix: str, rel_path: str) -> Optional[str]:
    tree_path = posixpath.join(relative_prefix, rel_path) if relative_prefix else rel_path
    try:
        entry = commit.tree / tree_path
    except KeyError:
        return None
    if entry.type != "blob":
        return None
    return entry.data_stream.read().decode("utf-8", errors="replace")


def _paired_source_files(old_commit, new_commit, relative_prefix: str, suffix: str) -> list[dict[str, Any]]:
    paths = sorted(
        set(_blob_paths(old_commit, relative_prefix, suffix)) |
        set(_blob_paths(new_commit, relative_prefix, suffix)),
        key=str.casefold,
    )
    return [
        {
            "filename": path,
            "old_content": _read_blob(old_commit, relative_prefix, path),
            "new_content": _read_blob(new_commit, relative_prefix, path),
        }
        for path in paths
    ]


def _component_map(design_json: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in design_json.get("components") or []:
        designator = row.get("designator")
        if not designator:
            continue
        out[str(designator)] = {
            "type": "symbol",
            "reference": str(designator),
            "uuid": row.get("uuid") or row.get("svg_id") or (row.get("parameters") or {}).get("kicad_instance_uuid"),
            "sheet_file": row.get("sheet_file") or row.get("sheet_filename"),
            "value": row.get("value", ""),
            "footprint": row.get("footprint", ""),
            "lib_id": row.get("library_ref", ""),
            "library_ref": row.get("library_ref", ""),
            "parameters": row.get("parameters") or {},
            "sheet": row.get("sheet") or row.get("sheet_path") or "",
            "x": _number_or_none(row.get("x") or row.get("center_x")),
            "y": _number_or_none(row.get("y") or row.get("center_y")),
        }
    return out


def _net_map(design_json: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in design_json.get("nets") or []:
        name = str(row.get("name", ""))
        if not name:
            continue
        terminals = [
            f"{term.get('designator')}:{term.get('pin')}"
            for term in row.get("terminals") or []
        ]
        out[name] = {
            "type": "wire",
            "name": name,
            "text": name,
            "net_name": name,
            "terminals": sorted(terminals),
            "net_class": row.get("net_class", ""),
            "aliases": sorted(row.get("aliases") or []),
        }
    return out


def _sheet_map(design_json: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(row.get("sheet_path") or row.get("path") or row.get("filename")): {
            "type": "sheet",
            "sheet_name": row.get("title") or row.get("name") or row.get("filename") or "",
            "sheet_file": row.get("filename", ""),
            "filename": row.get("filename", ""),
            "path": row.get("path", ""),
            "title": row.get("title", ""),
            "revision": row.get("revision", ""),
            "date": row.get("date", ""),
        }
        for row in design_json.get("sheets") or []
        if row.get("sheet_path") or row.get("path") or row.get("filename")
    }


def _placement_map(design_json: dict[str, Any]) -> dict[str, dict[str, Any]]:
    placements = ((design_json.get("pnp") or {}).get("placements") or [])
    return {
        str(row.get("designator")): {
            "type": "footprint",
            "reference": str(row.get("designator")),
            "layer": row.get("layer", ""),
            "footprint": row.get("footprint", ""),
            "x": _number_or_none(row.get("center_x")),
            "y": _number_or_none(row.get("center_y")),
            "center_x": _number_or_none(row.get("center_x")),
            "center_y": _number_or_none(row.get("center_y")),
            "rotation": _number_or_none(row.get("rotation")),
        }
        for row in placements
        if row.get("designator")
    }


def _diff_maps(old: dict[str, dict[str, Any]], new: dict[str, dict[str, Any]], *, fields: tuple[str, ...]) -> dict[str, Any]:
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed: list[dict[str, Any]] = []
    for key in sorted(set(old) & set(new)):
        diffs = {
            field: {"old": old[key].get(field), "new": new[key].get(field)}
            for field in fields
            if old[key].get(field) != new[key].get(field)
        }
        if diffs:
            changed.append({"id": key, "diffs": diffs, "old": old[key], "new": new[key]})
    return {
        "summary": {"added": len(added), "removed": len(removed), "changed": len(changed)},
        "added": [{"id": key, "new": new[key]} for key in added],
        "removed": [{"id": key, "old": old[key]} for key in removed],
        "changed": changed,
    }


def _normalise_schematic_diff(design_diff: dict[str, Any]) -> dict[str, Any]:
    return _normalise_diff_sections(design_diff, ("components", "nets", "sheets"))


def _normalise_pcb_diff(design_diff: dict[str, Any]) -> dict[str, Any]:
    return _normalise_diff_sections(design_diff, ("placements", "nets"))


def _normalise_diff_sections(design_diff: dict[str, Any], sections: Iterable[str]) -> dict[str, Any]:
    added: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    changed: list[dict[str, Any]] = []
    for section in sections:
        payload = design_diff.get(section) or {}
        for row in payload.get("added") or []:
            added.append(_normalise_item(row["id"], row.get("new") or {}, section))
        for row in payload.get("removed") or []:
            removed.append(_normalise_item(row["id"], row.get("old") or {}, section))
        for row in payload.get("changed") or []:
            changed.append({
                "item": _normalise_item(row["id"], row.get("new") or {}, section),
                "old_item": _normalise_item(row["id"], row.get("old") or {}, section),
                "changes": row.get("diffs") or {},
            })
    return {
        "added": added,
        "removed": removed,
        "changed": changed,
        "summary": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
        },
    }


def _normalise_item(item_id: str, payload: dict[str, Any], section: str) -> dict[str, Any]:
    item = dict(payload)
    item["id"] = item.get("id") or item_id
    item["uuid"] = item.get("uuid") or item.get("svg_id") or item_id
    if "type" not in item:
        item["type"] = {
            "components": "symbol",
            "placements": "footprint",
            "nets": "wire",
            "sheets": "sheet",
        }.get(section, "other")
    if section == "nets":
        item.setdefault("net_name", item_id)
        item.setdefault("text", item_id)
    if section in {"components", "placements"}:
        item.setdefault("reference", item_id)
    return item


def _diagnostic(kind: str, severity: str, message: str, **extra: Any) -> dict[str, Any]:
    out = {"kind": kind, "severity": severity, "message": message}
    out.update({key: value for key, value in extra.items() if value not in (None, "", [])})
    return out


def _number_or_none(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _string_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
