"""Discover KiCad files, variants, and BOM presets from a commit — no Prism YAML."""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

from app.release_studio.config.errors import ConfigLoadError

logger = logging.getLogger(__name__)

#: Release-executor sentinel for the native default design (`steps.py` omits
#: `--variant` for it). It is not a KiCad variant name and is never persisted
#: as one, but the Source step always offers it explicitly.
DEFAULT_VARIANT = "default"

_BUILTIN_BOM_PRESETS: tuple[str, ...] = (
    "Grouped By Value",
    "Grouped By Value and Footprint",
    "Attributes",
)
_CURRENT_SETTINGS = "Current project settings"
SOURCE_DEFAULT_KEYS: tuple[str, ...] = (
    "board",
    "schematic",
    "variant",
    "bom_preset",
)


def normalize_source_defaults(raw: Mapping[str, Any] | None) -> dict[str, str]:
    payload = raw or {}
    return {key: str(payload.get(key) or "").strip() for key in SOURCE_DEFAULT_KEYS}


def apply_source_defaults(
    discovered: Mapping[str, Any],
    defaults: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Prefer saved project picks that still exist at this commit."""

    result = dict(discovered)
    saved = normalize_source_defaults(defaults)
    boards = list(result.get("boards") or [])
    schematics = list(result.get("schematics") or [])
    variants = list(result.get("variants") or [])
    presets = list(result.get("bom_presets") or [])
    if saved["board"] in boards:
        result["board"] = saved["board"]
    if saved["schematic"] in schematics:
        result["schematic"] = saved["schematic"]
    saved_variant = saved["variant"]
    if saved_variant == DEFAULT_VARIANT:
        result["variant"] = DEFAULT_VARIANT
    elif saved_variant and saved_variant in variants:
        result["variant"] = saved_variant
    else:
        # A saved named variant this revision no longer has falls back to the
        # explicit default instead of silently switching to a different
        # named variant, whose population the user never chose.
        result["variant"] = variants[0] if variants else DEFAULT_VARIANT
    if saved["bom_preset"] in presets:
        result["default_bom_preset"] = saved["bom_preset"]
    elif not str(result.get("default_bom_preset") or "") and presets:
        result["default_bom_preset"] = presets[0]
    return result


def discover_source(
    repo_root: Path | str, commit_sha: str, relative_path: str | None = None
) -> dict[str, Any]:
    """List boards, schematics, variants, and BOM presets at *commit_sha*.

    ``relative_path`` is the imported project's subdirectory. A monorepo holds
    several projects in one repository, so discovery that ignored it would
    offer a sibling project's board as this project's default.
    """

    root = Path(repo_root)
    files = _scoped(_ls_tree(root, commit_sha), relative_path)
    boards = [path for path in files if path.endswith(".kicad_pcb")]
    schematics = [path for path in files if path.endswith(".kicad_sch")]
    projects = [path for path in files if path.endswith(".kicad_pro")]

    board = _preferred(boards)
    schematic = _sibling(board, schematics, ".kicad_sch") if board else (_preferred(schematics) or "")
    project = _sibling(board, projects, ".kicad_pro") if board else (_preferred(projects) or "")

    presets = list(_BUILTIN_BOM_PRESETS)
    if project:
        presets = _bom_presets(root, commit_sha, project) + presets
        if _CURRENT_SETTINGS not in presets:
            presets.insert(0, _CURRENT_SETTINGS)

    discovered = {
        "boards": boards,
        "schematics": schematics,
        "board": board or "",
        "schematic": schematic or "",
        "project": project or "",
        "variants": _variant_options(root, commit_sha, relative_path, project or board or schematic),
        "bom_presets": presets,
        "default_bom_preset": presets[0] if presets else _CURRENT_SETTINGS,
        "variant": "",
    }
    return apply_source_defaults(discovered)


def _scoped(files: list[str], relative_path: str | None) -> list[str]:
    """Narrow the commit tree to the imported project's subdirectory.

    A project rooted at the repository, and a scope that matches nothing at
    this commit, both fall back to the whole tree: an empty Source stage is a
    worse answer than a wide one.
    """

    prefix = (relative_path or "").strip().strip("/")
    if not prefix or prefix == ".":
        return files
    scoped = [path for path in files if path.startswith(f"{prefix}/")]
    return scoped or files


def _ls_tree(repo_root: Path, commit: str) -> list[str]:
    if not commit or commit.startswith("-") or any(ch.isspace() for ch in commit):
        raise ConfigLoadError(f"invalid commit ref: {commit!r}")
    result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-tree", "-r", "--name-only", commit],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ConfigLoadError(result.stderr.strip() or "could not list the commit tree")
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _preferred(paths: list[str]) -> str | None:
    if not paths:
        return None
    scored = sorted(
        paths,
        key=lambda path: (
            path.count("/"),
            0 if "hardware" in path.lower() else 1,
            path.lower(),
        ),
    )
    return scored[0]


def _sibling(path: str, candidates: list[str], suffix: str) -> str:
    stem = PurePosixPath(path).with_suffix("").as_posix()
    expected = f"{stem}{suffix}"
    if expected in candidates:
        return expected
    directory = str(PurePosixPath(path).parent)
    for item in candidates:
        if str(PurePosixPath(item).parent) == directory:
            return item
    return _preferred(candidates) or ""


def _bom_presets(repo_root: Path, commit: str, project_rel: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "show", f"{commit}:{project_rel}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    schematic = payload.get("schematic") if isinstance(payload, dict) else None
    if not isinstance(schematic, dict):
        return []
    names: list[str] = []
    for item in schematic.get("bom_presets") or []:
        if isinstance(item, dict) and str(item.get("name") or "").strip():
            names.append(str(item["name"]).strip())
        elif isinstance(item, str) and item.strip():
            names.append(item.strip())
    return names


def _variant_options(
    repo_root: Path,
    commit: str,
    relative_path: str | None,
    project_rel: str | None,
) -> list[str]:
    """The explicit default plus every named variant at this commit."""

    return [DEFAULT_VARIANT, *_variants(repo_root, commit, relative_path, project_rel)]


@dataclass(frozen=True)
class _CatalogProject:
    """Minimal project shape the shared catalog discovery reads (VAR-07)."""

    path: str
    project_file: str | None = None


def _scoped_root(repo_root: Path, relative_path: str | None) -> Path:
    prefix = (relative_path or "").strip().strip("/")
    if not prefix or prefix == ".":
        return repo_root.resolve()
    candidate = (repo_root / prefix).resolve()
    return candidate if candidate.is_dir() else repo_root.resolve()


def _catalog_anchor(repo_root: Path, scoped_root: Path, project_rel: str) -> str:
    """The anchor relative to the scoped project directory the catalog reads."""

    try:
        absolute = (repo_root / project_rel).resolve()
        return absolute.relative_to(scoped_root).as_posix()
    except ValueError:
        return PurePosixPath(project_rel).name


def _variants(
    repo_root: Path,
    commit: str,
    relative_path: str | None = None,
    project_rel: str | None = None,
) -> list[str]:
    """Named variants from the shared catalog discovery (VAR-07/08).

    The catalog service is the single source of variant truth for the variants
    endpoint, the semantic index and Release Studio. The line scan this
    replaces read the schematic text only, so project-registry and board-only
    names were missed and names in comments were invented. Discovery stays
    best-effort: variants are optional for a build, so a project whose catalog
    cannot be read offers only the explicit default instead of failing the
    whole Source step.
    """

    if not project_rel:
        return []
    scoped_root = _scoped_root(repo_root, relative_path)
    project = _CatalogProject(
        path=str(scoped_root),
        project_file=_catalog_anchor(repo_root, scoped_root, project_rel),
    )
    from app.services import variant_catalog_service

    try:
        payload = variant_catalog_service.discover_variant_catalog(project, commit)
    except Exception:  # noqa: BLE001 - a missing catalog must not fail Source
        logger.warning(
            "Could not discover variants for Release Studio at %s",
            commit,
            exc_info=True,
        )
        return []
    names: list[str] = []
    for entry in payload.get("variants") or []:
        name = str(entry.get("name") or "").strip()
        if name and name.casefold() != DEFAULT_VARIANT and name not in names:
            names.append(name)
    return names
