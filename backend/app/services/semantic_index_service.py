from __future__ import annotations

import contextlib
import datetime
import hashlib
import importlib.metadata
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable, Iterator

from app.core.config import settings
from app.services import semantic_visualizer_service


SCHEMA = "prism.semantic_index_a0"
GENERATOR_NAME = "kicad-prism-semantic-index"
GENERATOR_VERSION = "0.1.0"
_GENERATOR_INPUTS = ("semantic-index", SCHEMA, GENERATOR_VERSION)
GENERATOR_BUILD = hashlib.sha256(
    b"\0".join(
        (
            "|".join(_GENERATOR_INPUTS).encode("utf-8"),
            Path(__file__).read_bytes(),
        )
    )
).hexdigest()[:12]

_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()
SEMANTIC_SOURCE_SUFFIXES = {".kicad_pro", ".kicad_sch", ".kicad_pcb", ".kicad_sym", ".kicad_mod"}

REQUIRED_BOM_FIELDS = (
    "Value",
    "DNP",
    "Description",
    "Datasheet",
    "Manufacturer",
    "Manufacturer Part Number",
    "Vendor",
    "Vendor Part Number",
    "Footprint",
    "Mass (g)",
    "RQjC (C/W)",
    "RQjC_top (C/W)",
    "Temp_max (C)",
    "Temp_min (C)",
    "Power Dissipation (W)",
    "Rate",
)


def semantic_index_root() -> Path:
    root = Path(settings.KICAD_PROJECTS_ROOT) / ".kicad-prism" / "semantic-index"
    root.mkdir(parents=True, exist_ok=True)
    return root


def artifact_dir(project_id: str, source_revision_key: str) -> Path:
    return semantic_index_root() / project_id / source_revision_key / generator_cache_tag()


def artifact_path(project_id: str, source_revision_key: str) -> Path:
    return artifact_dir(project_id, source_revision_key) / "semantic-index.json"


def _blob_id(data: bytes) -> str:
    """Git's object id for a blob: SHA-1 over the object header and content.

    Computing this locally lets a working-tree revision produce the same key as
    the same content read out of a commit, where the ids come from the index for
    free.  SHA-1 is git's choice of object id here, not a security boundary.
    """

    digest = hashlib.sha1(b"blob %d\0" % len(data), usedforsecurity=False)
    digest.update(data)
    return digest.hexdigest()


def _revision_key(entries: Iterable[tuple[str, str]]) -> str:
    """Reduce (project-relative path, blob id) pairs to a cache key."""

    digest = hashlib.sha256()
    for path, blob in sorted(entries):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(blob.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()[:32]


def _source_entries_on_disk(root: Path) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.suffix.lower() not in SEMANTIC_SOURCE_SUFFIXES:
            continue
        entries.append((path.relative_to(root).as_posix(), _blob_id(path.read_bytes())))
    return entries


def _source_entries_in_commit(
    repo_root: Path,
    commit: str,
    project_dir: str,
) -> list[tuple[str, str]]:
    """List the project's semantic sources at a commit, without checking it out.

    Every blob id here is already a hash of that file's content, so the tree
    listing alone identifies the revision as precisely as reading the files
    would — for the cost of one `git ls-tree` instead of an archive extraction.
    """

    args = ["git", "-C", str(repo_root), "ls-tree", "-r", "-z", commit]
    if project_dir:
        args.extend(["--", f"{project_dir}/"])
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise ValueError(
            f"Could not list {commit}: "
            f"{result.stderr.decode('utf-8', errors='replace').strip()}"
        )

    prefix = f"{project_dir}/" if project_dir else ""
    entries: list[tuple[str, str]] = []
    for record in result.stdout.decode("utf-8", errors="replace").split("\0"):
        if not record:
            continue
        metadata, _, path = record.partition("\t")
        parts = metadata.split()
        if len(parts) < 3 or parts[1] != "blob":
            continue
        if not path.startswith(prefix):
            continue
        relative = path[len(prefix):]
        if Path(relative).suffix.lower() not in SEMANTIC_SOURCE_SUFFIXES:
            continue
        entries.append((relative, parts[2]))
    return entries


def source_revision_key_for_project_file(project_file: Path) -> str:
    return _revision_key(_source_entries_on_disk(project_file.resolve().parent))


def _lock(project_id: str, source_revision_key: str) -> threading.Lock:
    key = f"{project_id}:{source_revision_key}:{GENERATOR_BUILD}"
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.Lock())


def _add_kicad_monkey_import_paths() -> None:
    explicit = os.environ.get("KICAD_MONKEY_PYTHONPATH", "").strip()
    candidates = [Path(explicit).expanduser()] if explicit else []
    for parent in Path(__file__).resolve().parents:
        candidates.extend(
            (
                parent / "kicad-monkey" / "src" / "py",
                parent / "kicad_monkey" / "src" / "py",
            )
        )
    candidates.extend((Path("/opt/kicad-monkey/src/py"), Path("/opt/kicad_monkey/src/py")))
    for candidate in candidates:
        if candidate.is_dir() and str(candidate.resolve()) not in sys.path:
            sys.path.insert(0, str(candidate.resolve()))


def _kicad_monkey_version() -> str:
    try:
        return importlib.metadata.version("kicad-monkey")
    except importlib.metadata.PackageNotFoundError:
        return "workspace"


def generator_cache_tag() -> str:
    dependency = _kicad_monkey_version().replace("/", "-").replace(" ", "-")
    return f"{GENERATOR_VERSION}-{GENERATOR_BUILD}-kicad-monkey-{dependency}"


def _revision_identity(project: Any, commit: str | None) -> tuple[str, str | None]:
    """Identify a revision cheaply enough to check the cache before building it.

    Materializing a commit means extracting the whole repository into a
    temporary directory, and the caller used to do that before it knew whether
    the artifact already existed — so every cache hit paid for an archive
    extraction and a full re-read of the sources.  A tree listing answers the
    same question, because git's blob ids are content hashes already.
    """

    if not commit:
        project_file = semantic_visualizer_service.find_kicad_project(project.path)
        return _revision_key(_source_entries_on_disk(project_file.resolve().parent)), None

    repo_root = semantic_visualizer_service._repo_root(Path(project.path))
    resolved_commit = semantic_visualizer_service._resolve_commit(repo_root, commit)
    project_rel = semantic_visualizer_service._project_relative_path(repo_root, Path(project.path))
    project_dir = PurePosixPath(project_rel).parent.as_posix()
    if project_dir == ".":
        project_dir = ""
    entries = _source_entries_in_commit(repo_root, resolved_commit, project_dir)
    return _revision_key(entries), resolved_commit


@contextlib.contextmanager
def _project_file_for_revision(project: Any, commit: str | None) -> Iterator[tuple[Path, str | None]]:
    if not commit:
        yield semantic_visualizer_service.find_kicad_project(project.path), None
        return

    repo_root = semantic_visualizer_service._repo_root(Path(project.path))
    resolved_commit = semantic_visualizer_service._resolve_commit(repo_root, commit)
    project_rel = semantic_visualizer_service._project_relative_path(repo_root, Path(project.path))
    with tempfile.TemporaryDirectory(prefix="semantic-index-commit-") as tmp:
        checkout = Path(tmp) / "checkout"
        semantic_visualizer_service._archive_checkout(repo_root, resolved_commit, checkout)
        project_file = checkout / project_rel
        if not project_file.is_file():
            raise ValueError(f"KiCad project file not found in commit {resolved_commit}: {project_rel}")
        yield project_file, resolved_commit


def _write_artifact(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def _build_and_store(
    project: Any,
    commit: str | None,
    source_revision_key: str,
    path: Path,
) -> dict[str, Any]:
    with _project_file_for_revision(project, commit) as (project_file, resolved_commit):
        payload = build_semantic_index(
            project_file,
            source_revision_key=source_revision_key,
            commit=resolved_commit,
        )
    _write_artifact(path, payload)
    return payload


def get_or_build(project: Any, commit: str | None = None) -> dict[str, Any]:
    source_revision_key, _resolved_commit = _revision_identity(project, commit)
    path = artifact_path(str(project.id), source_revision_key)
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))

    with _lock(str(project.id), source_revision_key):
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
        return _build_and_store(project, commit, source_revision_key, path)


def get_existing(project: Any, commit: str | None = None) -> dict[str, Any] | None:
    source_revision_key, _resolved_commit = _revision_identity(project, commit)
    path = artifact_path(str(project.id), source_revision_key)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def generate(project: Any, commit: str | None = None, *, force: bool = False) -> dict[str, Any]:
    source_revision_key, _resolved_commit = _revision_identity(project, commit)
    path = artifact_path(str(project.id), source_revision_key)
    with _lock(str(project.id), source_revision_key):
        if path.is_file() and not force:
            return json.loads(path.read_text(encoding="utf-8"))
        return _build_and_store(project, commit, source_revision_key, path)


def get_status(project: Any, commit: str | None = None) -> dict[str, Any]:
    source_revision_key, resolved_commit = _revision_identity(project, commit)
    path = artifact_path(str(project.id), source_revision_key)
    return {
        "schema": "prism.semantic_index_status_a0",
        "projectId": str(project.id),
        "sourceRevisionKey": source_revision_key,
        "commit": resolved_commit,
        "available": path.is_file(),
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "build": GENERATOR_BUILD,
            "cacheTag": generator_cache_tag(),
            "kicadMonkeyVersion": _kicad_monkey_version(),
        },
    }


def _stable_uid(prefix: str, *parts: object) -> str:
    identity = "\x1f".join(str(part or "") for part in parts)
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
    return f"{prefix}:{digest}"


def _string(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


# Only quotes and parentheses can change the nesting state of an
# S-expression. A complete quoted string is its own alternative, and comes
# first, so the scan swallows it whole and never sees the parentheses inside
# a value like "Resistor (SMD)". A bare quote therefore only ever matches
# when the string is unterminated.
_SEXPR_SCAN = re.compile(r'"(?:[^"\\]|\\.)*"|["()]')


def _balanced_s_expression_end(text: str, start: int) -> int | None:
    """Find the end offset of a KiCad S-expression without parsing geometry.

    Boards run to tens of megabytes and this is called once per candidate
    form -- millions of structural characters per compare. Driving a single
    `finditer` keeps that walk inside the regex engine; restarting `search`
    at each character cost one interpreter round trip apiece.
    """

    depth = 0
    for match in _SEXPR_SCAN.finditer(text, start):
        token = match.group()
        if token == "(":
            depth += 1
        elif token == ")":
            depth -= 1
            if depth == 0:
                return match.end()
            if depth < 0:  # started past the opening paren
                return None
        elif token == '"':  # unterminated string; nothing sane left to scan
            return None
    return None


_LIB_SYMBOLS_START = re.compile(r"\(lib_symbols(?=\s|\))")


def _library_block_span(text: str) -> tuple[int, int]:
    """Locate a schematic's `(lib_symbols …)`, as a half-open offset range.

    A sheet carries a library definition for each distinct part placed on it,
    and each definition wraps two or three draw units that are themselves
    `(symbol …)` forms.  Those inner forms outnumber the placed symbols several
    times over and hold none of the instance data this overlay reads, but the
    scan below used to walk every one of them to its closing paren before
    discarding it for having no `lib_id`.

    This returns the span so the caller can skip those forms specifically,
    rather than skipping everything ahead of the library block — placed symbols
    happen to follow it in the files KiCad writes today, and quietly dropping
    them if that ever stopped holding would be a much worse bug than the cost
    this avoids.  An empty range means the sheet has no library block.
    """

    match = _LIB_SYMBOLS_START.search(text)
    if match is None:
        return (0, 0)
    end = _balanced_s_expression_end(text, match.start())
    return (match.start(), end) if end is not None else (0, 0)


def _schematic_instance_fields(project_file: Path) -> dict[str, dict[str, str]]:
    """Read standard KiCad symbol properties omitted by kicad-monkey JSON.

    KiCad stores `Datasheet`, `Description`, and the other standard fields on
    each placed symbol.  kicad-monkey currently exports custom parameters but
    not all of those properties.  This intentionally small overlay is keyed by
    the source symbol UUID and leaves connectivity/rendering to kicad-monkey.
    """

    result: dict[str, dict[str, str]] = {}
    symbol_start = re.compile(r"\(symbol(?=\s|\))")
    property_pattern = re.compile(
        r'\(property\s+"((?:\\.|[^"\\])*)"\s+"((?:\\.|[^"\\])*)"'
    )
    uuid_pattern = re.compile(r'\(uuid\s+"((?:\\.|[^"\\])*)"\)')
    for schematic_path in sorted(project_file.parent.rglob("*.kicad_sch")):
        text = schematic_path.read_text(encoding="utf-8", errors="ignore")
        library_start, library_end = _library_block_span(text)
        for match in symbol_start.finditer(text):
            if library_start <= match.start() < library_end:
                continue
            end = _balanced_s_expression_end(text, match.start())
            if end is None:
                continue
            block = text[match.start():end]
            # Library definitions have no lib_id.  Only placed instances carry
            # the UUID/property values that belong to a BOM component.
            if "(lib_id " not in block:
                continue
            uuid_match = uuid_pattern.search(block)
            if not uuid_match:
                continue
            fields = {
                key.replace(r'\"', '"').replace(r"\\", "\\"): value.replace(r'\"', '"').replace(r"\\", "\\")
                for key, value in property_pattern.findall(block)
                if key
            }
            if fields:
                result.setdefault(uuid_match.group(1), fields)
    return result


_TRUTHY_FLAGS = {"1", "true", "yes", "y", "dnp"}


def _resolve_dnp(parameters: dict[str, str], casefolded: dict[str, str]) -> str:
    """Decide whether a component is DNP, from whichever field carries it.

    ``kicad_dnp`` is kicad-monkey's parse of the symbol's own ``(dnp ...)``
    attribute and wins outright.  Failing that, KiCad's netlist marks a DNP
    part with a *valueless* ``dnp`` property — presence is the signal, and it
    is also how DNP inherited from a parent sheet reaches us.  That flag is
    matched on the exact lowercase key so a user field named ``DNP`` left
    blank, which means the opposite, is not mistaken for it.
    """

    explicit = casefolded.get("kicaddnp", "").strip()
    if explicit:
        return "Yes" if explicit.casefold() in _TRUTHY_FLAGS else "No"

    if "dnp" in parameters and not parameters["dnp"].strip():
        return "Yes"

    for alias in ("DNP", "Do Not Populate", "Do Not Fit"):
        value = casefolded.get(re.sub(r"[^a-z0-9]", "", alias.casefold()), "").strip()
        if value:
            return "Yes" if value.casefold() in _TRUTHY_FLAGS else "No"

    return "No"


def _canonical_fields(component: dict[str, Any]) -> dict[str, str]:
    parameters = {
        str(key): _string(value)
        for key, value in (component.get("parameters") or {}).items()
        if str(key)
    }
    casefolded = {
        re.sub(r"[^a-z0-9]", "", key.casefold()): value
        for key, value in parameters.items()
    }

    def pick(name: str, *aliases: str) -> str:
        # A present-but-empty field must not shadow a populated alias; KiCad
        # emits plenty of blank properties, and the first non-blank one is
        # what the panel should show.
        for candidate in (name, *aliases):
            value = casefolded.get(re.sub(r"[^a-z0-9]", "", candidate.casefold()))
            if value:
                return value
        return ""

    dnp = _resolve_dnp(parameters, casefolded)
    required = {
        "Value": _string(component.get("value")) or pick("Value"),
        "DNP": dnp,
        "Description": _string(component.get("description")) or pick("Description"),
        "Datasheet": pick("Datasheet", "Data Sheet", "Datasheet URL", "Datasheet Link"),
        "Manufacturer": pick("Manufacturer", "MFR", "Mfr"),
        "Manufacturer Part Number": pick("Manufacturer Part Number", "MPN", "Mfr Part", "Mfr Part Number"),
        "Vendor": pick("Vendor", "Supplier"),
        "Vendor Part Number": pick("Vendor Part Number", "VPN", "Supplier Part Number", "Supplier PN"),
        "Footprint": _string(component.get("footprint")) or pick("Footprint"),
        "Mass (g)": pick("Mass (g)", "Mass", "Weight (g)"),
        "RQjC (C/W)": pick("RQjC (C/W)", "RθJC (C/W)", "RthJC"),
        "RQjC_top (C/W)": pick("RQjC_top (C/W)", "RθJC_top (C/W)", "RthJC Top"),
        "Temp_max (C)": pick("Temp_max (C)", "Max Temperature", "Tj Max"),
        "Temp_min (C)": pick("Temp_min (C)", "Min Temperature", "Tj Min"),
        "Power Dissipation (W)": pick("Power Dissipation (W)", "Power Dissipation", "Pd (W)"),
        "Rate": pick("Rate", "Rating"),
    }
    extras = {key: value for key, value in parameters.items() if key not in required}
    return {**required, **extras}


def _property_map(footprint: object) -> dict[str, str]:
    result: dict[str, str] = {}
    for prop in getattr(footprint, "properties", ()) or ():
        name = _string(getattr(prop, "name", ""))
        if name:
            result[name] = _string(getattr(prop, "value", ""))
    return result


def _net_table(pcb: object) -> object | None:
    """Snapshot the board's net table, when the installed kicad-monkey has one.

    Without it every ``resolve_net_name`` call rebuilds the whole mapping, so
    projecting a board costs O(elements x nets). Older releases lack
    ``net_table``; there the per-call path below still works, just slowly.
    """

    build = getattr(pcb, "net_table", None)
    if not callable(build):
        return None
    try:
        return build()
    except Exception:  # pragma: no cover - fall back to per-call resolution
        return None


def _net_name(pcb: object, item: object, net_table: object | None = None) -> str:
    net = getattr(item, "net", None)
    if net_table is not None:
        return _string(net_table.name_of(net))
    resolver = getattr(pcb, "resolve_net_name", None)
    if callable(resolver):
        return _string(resolver(net))
    return _string(getattr(net, "name", ""))


def _net_code(item: object) -> int | None:
    ordinal = getattr(getattr(item, "net", None), "ordinal", None)
    return int(ordinal) if isinstance(ordinal, int) else None


def _relative_schematic_page(project_file: Path, source_path: object) -> str:
    if source_path is None:
        return ""
    path = Path(str(source_path))
    try:
        return path.resolve().relative_to(project_file.parent.resolve()).as_posix()
    except (OSError, ValueError):
        return path.name


def _schematic_semantic_projection(
    design: object,
    project_file: Path,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[str, list[dict[str, str]]],
]:
    """Project concrete hierarchy placements and bus objects."""

    get_instances = getattr(design, "schematic_instances", None)
    instances = list(get_instances() or ()) if callable(get_instances) else []
    sheet_instances: list[dict[str, Any]] = []
    buses: list[dict[str, Any]] = []
    placements: dict[str, list[dict[str, str]]] = {}

    def remember(source_uuid: object, placement: dict[str, str]) -> None:
        value = _string(source_uuid)
        if not value:
            return
        rows = placements.setdefault(value, [])
        if placement not in rows:
            rows.append(placement)

    for instance in instances:
        sheet_path = _string(getattr(instance, "sheet_path", "")) or "/"
        instance_path = (
            _string(getattr(instance, "sheet_instance_path", ""))
            or _string(getattr(instance, "sheet_path_uuids", ""))
            or sheet_path
            or "/"
        )
        page = _relative_schematic_page(
            project_file,
            getattr(instance, "source_path", None),
        )
        parent_path = (
            _string(getattr(instance, "parent_sheet_instance_path", ""))
            or _string(getattr(instance, "parent_sheet_path_uuids", ""))
            or _string(getattr(instance, "parent_sheet_path", ""))
        )
        sheet_symbol_uuid = _string(getattr(instance, "sheet_symbol_uid", ""))
        placement = {
            "sheetInstancePath": instance_path,
            "sheetPath": sheet_path,
            "page": page,
        }
        sheet_instances.append(
            {
                "sheetInstanceUid": _stable_uid(
                    "sheet-instance",
                    instance_path,
                    page,
                ),
                "sheetInstancePath": instance_path,
                "sheetPath": sheet_path,
                "page": page,
                "parentSheetInstancePath": parent_path or None,
                "sheetSymbolUuid": sheet_symbol_uuid or None,
                "sheetName": _string(getattr(instance, "sheet_name", "")),
                "isTopLevel": bool(getattr(instance, "is_top_level", False)),
            }
        )

        schematic = getattr(instance, "schematic", None)
        if schematic is None:
            continue
        for collection in (
            "wires",
            "junctions",
            "labels",
            "global_labels",
            "hierarchical_labels",
            "symbols",
        ):
            for item in getattr(schematic, collection, ()) or ():
                remember(getattr(item, "uuid", ""), placement)
                for pin in getattr(item, "pins", ()) or ():
                    remember(getattr(pin, "uuid", ""), placement)

        for kind, collection in (
            ("bus", "buses"),
            ("bus_entry", "bus_entries"),
        ):
            for item in getattr(schematic, collection, ()) or ():
                source_uuid = _string(getattr(item, "uuid", ""))
                remember(source_uuid, placement)
                buses.append(
                    {
                        "busUid": _stable_uid(
                            "bus",
                            kind,
                            instance_path,
                            source_uuid,
                        ),
                        "kind": kind,
                        "sourceUuid": source_uuid,
                        "sheetInstancePath": instance_path,
                        "sheetPath": sheet_path,
                        "page": page,
                        "points": [
                            [float(point[0]), float(point[1])]
                            for point in getattr(item, "points", ()) or ()
                        ],
                        "at": (
                            [
                                float(getattr(item, "at_x")),
                                float(getattr(item, "at_y")),
                            ]
                            if getattr(item, "at_x", None) is not None
                            and getattr(item, "at_y", None) is not None
                            else None
                        ),
                        "size": (
                            [
                                float(getattr(item, "size_x")),
                                float(getattr(item, "size_y")),
                            ]
                            if getattr(item, "size_x", None) is not None
                            and getattr(item, "size_y", None) is not None
                            else None
                        ),
                    }
                )

        for alias in getattr(schematic, "bus_aliases", ()) or ():
            name = _string(getattr(alias, "name", ""))
            buses.append(
                {
                    "busUid": _stable_uid("bus-alias", instance_path, name),
                    "kind": "bus_alias",
                    "name": name,
                    "members": sorted(
                        _string(value)
                        for value in getattr(alias, "members", ()) or ()
                        if _string(value)
                    ),
                    "sheetInstancePath": instance_path,
                    "sheetPath": sheet_path,
                    "page": page,
                }
            )

    pages_by_instance = {
        _string(item.get("sheetInstancePath")): _string(item.get("page"))
        for item in sheet_instances
    }
    for item in sheet_instances:
        parent_path = _string(item.get("parentSheetInstancePath"))
        item["parentPage"] = pages_by_instance.get(parent_path) or None

    return sheet_instances, buses, placements


def _group_schematic_refs(
    graphical: dict[str, Any],
    placements: dict[str, list[dict[str, str]]],
) -> list[dict[str, Any]]:
    bucket_sources = {
        "wireUuids": list(graphical.get("wires") or ()),
        "labelUuids": (
            list(graphical.get("labels") or ())
            + list(graphical.get("ports") or ())
            + list(graphical.get("power_ports") or ())
        ),
        "junctionUuids": (
            list(graphical.get("junctions") or ())
            + list(graphical.get("sheet_entries") or ())
        ),
    }
    counted_labels = {
        _string(value) for value in graphical.get("labels") or () if _string(value)
    }
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    unplaced = {
        "wireUuids": [],
        "labelUuids": [],
        "junctionUuids": [],
        "pinUuids": [],
        "labelInstanceCount": 0,
    }
    for bucket, values in bucket_sources.items():
        for raw_value in values:
            source_uuid = _string(raw_value)
            source_placements = placements.get(source_uuid) or []
            if not source_placements:
                unplaced[bucket].append(source_uuid)
                continue
            for placement in source_placements:
                key = (
                    placement.get("sheetInstancePath") or "/",
                    placement.get("page") or "",
                )
                ref = grouped.setdefault(
                    key,
                    {
                        **placement,
                        "wireUuids": [],
                        "labelUuids": [],
                        "junctionUuids": [],
                        "pinUuids": [],
                        "labelInstanceCount": 0,
                    },
                )
                if source_uuid not in ref[bucket]:
                    ref[bucket].append(source_uuid)
                if bucket == "labelUuids" and source_uuid in counted_labels:
                    ref["labelInstanceCount"] += 1
    refs = list(grouped.values())
    if any(unplaced[bucket] for bucket in bucket_sources):
        unplaced["labelInstanceCount"] = len(list(graphical.get("labels") or ()))
        refs.append(unplaced)
    if not refs:
        refs.append(unplaced)
    return refs


def build_semantic_index(
    project_file: Path,
    *,
    source_revision_key: str,
    commit: str | None = None,
    timing_callback: Callable[[dict[str, Any]], None] | None = None,
    include_pcb: bool = True,
    include_components: bool = True,
) -> dict[str, Any]:
    def timed(phase: str, action: Callable[[], Any], **metadata: Any) -> Any:
        started_ns = time.perf_counter_ns()
        cpu_started_ns = time.thread_time_ns()
        try:
            return action()
        finally:
            if timing_callback is not None:
                timing_callback(
                    {
                        "phase": phase,
                        "elapsedNs": time.perf_counter_ns() - started_ns,
                        "cpuNs": time.thread_time_ns() - cpu_started_ns,
                        "metadata": metadata,
                    }
                )

    timed("configure-imports", _add_kicad_monkey_import_paths)
    try:
        from kicad_monkey import KiCadDesign
    except ImportError as exc:
        raise RuntimeError(
            "kicad-monkey is required to generate semantic-index.json; configure "
            "KICAD_MONKEY_PYTHONPATH or install the package in the backend runtime"
        ) from exc

    design = timed("load-project", lambda: KiCadDesign.from_project_file(project_file))
    compile_netlist = getattr(design, "to_netlist", None)
    netlist = timed("compile-netlist", compile_netlist) if callable(compile_netlist) else None
    # kicad_design_to_json materializes PnP data and therefore accesses the
    # lazily parsed board. Resolve it explicitly so benchmark output separates
    # the parser cost from the much smaller JSON projection cost.
    pcb = timed("load-pcb", lambda: design.pcb) if include_pcb else None

    def materialize_design_json() -> dict[str, Any]:
        try:
            return design.to_json(
                include_indexes=True,
                include_pcb=include_pcb,
            )
        except TypeError as exc:
            # Compatibility with an older installed kicad-monkey. The local
            # optimized tree supports include_pcb=False; upstream releases
            # without it remain functional, although they cannot defer PCB
            # parsing during Stage 1.
            if "include_pcb" not in str(exc):
                raise
            return design.to_json(include_indexes=True)

    design_payload = timed(
        "materialize-design-json",
        materialize_design_json,
        components=len(getattr(netlist, "components", ()) or ()),
        nets=len(getattr(netlist, "nets", ()) or ()),
        includePcb=include_pcb,
    )
    sheet_instances, buses, schematic_placements = timed(
        "project-schematic-instances",
        lambda: _schematic_semantic_projection(design, project_file),
    )
    source_fields_by_uuid = (
        timed(
            "scan-instance-fields",
            lambda: _schematic_instance_fields(project_file),
        )
        if include_components
        else {}
    )

    components: list[dict[str, Any]] = []
    nets: list[dict[str, Any]] = []
    terminals: list[dict[str, Any]] = []
    indexes: dict[str, dict[str, int]] = {
        "componentByReference": {},
        "componentBySchematicUuid": {},
        "componentByPcbFootprintUuid": {},
        "terminalBySchematicPinUuid": {},
        "terminalByPcbPadUuid": {},
        "terminalByReferencePin": {},
        "netByName": {},
        "netByNetCode": {},
        "netBySchematicUuid": {},
        "netByPcbUuid": {},
        "sheetInstanceByPath": {},
        "busByUid": {},
    }
    for index, instance in enumerate(sheet_instances):
        path = _string(instance.get("sheetInstancePath"))
        if path:
            indexes["sheetInstanceByPath"][path] = index
    for index, bus in enumerate(buses):
        uid = _string(bus.get("busUid"))
        if uid:
            indexes["busByUid"][uid] = index

    projection_started_ns = time.perf_counter_ns()
    projection_cpu_started_ns = time.thread_time_ns()
    component_by_reference: dict[str, dict[str, Any]] = {}
    for raw in design_payload.get("components", ()) if include_components else ():
        reference = _string(raw.get("designator") or raw.get("reference"))
        if not reference:
            continue
        symbol_uuid = _string(raw.get("svg_id"))
        raw = dict(raw)
        parameters = dict(raw.get("parameters") or {})
        parameters.update(source_fields_by_uuid.get(symbol_uuid, {}))
        raw["parameters"] = parameters
        hierarchy = raw.get("hierarchy") or {}
        entry = {
            "componentUid": _stable_uid("cmp", reference, symbol_uuid),
            "reference": reference,
            "value": _string(raw.get("value")),
            "footprint": _string(raw.get("footprint")),
            "fields": _canonical_fields(raw),
            "schematicRefs": [
                {
                    "sheetInstancePath": _string(hierarchy.get("sheet_path")) or "/",
                    "page": _string(hierarchy.get("sheet")),
                    "symbolUuid": symbol_uuid,
                }
            ] if symbol_uuid else [],
            "pcbRefs": [],
            "webgpuRefs": [],
        }
        component_index = len(components)
        components.append(entry)
        component_by_reference[reference] = entry
        indexes["componentByReference"][reference] = component_index
        if symbol_uuid:
            indexes["componentBySchematicUuid"][symbol_uuid] = component_index

    if timing_callback is not None:
        timing_callback(
            {
                "phase": "project-components",
                "elapsedNs": time.perf_counter_ns() - projection_started_ns,
                "cpuNs": time.thread_time_ns() - projection_cpu_started_ns,
                "metadata": {"components": len(components)},
            }
        )

    net_by_name: dict[str, dict[str, Any]] = {}
    net_index_by_name: dict[str, int] = {}
    terminal_by_pair: dict[str, dict[str, Any]] = {}
    terminal_index_by_pair: dict[str, int] = {}

    projection_started_ns = time.perf_counter_ns()
    projection_cpu_started_ns = time.thread_time_ns()
    for raw in design_payload.get("nets", ()):
        name = _string(raw.get("name"))
        if not name:
            continue
        graphical = raw.get("graphical") or {}
        schematic_refs = _group_schematic_refs(graphical, schematic_placements)
        net_entry = {
            "netUid": _stable_uid("net", name),
            "name": name,
            "netClass": _string(raw.get("net_class")),
            "aliases": sorted(
                _string(value)
                for value in raw.get("aliases") or ()
                if _string(value)
            ),
            "sourceSheets": sorted(
                _string(value)
                for value in raw.get("source_sheets") or ()
                if _string(value)
            ),
            "schematicRefs": schematic_refs,
            "pcbRefs": [{"trackUuids": [], "arcUuids": [], "viaUuids": [], "zoneUuids": [], "padUuids": []}],
            "webgpuRefs": [],
        }
        net_index = len(nets)
        nets.append(net_entry)
        net_by_name[name] = net_entry
        net_index_by_name[name] = net_index
        indexes["netByName"][name] = net_index
        for schematic_ref in schematic_refs:
            for bucket in ("wireUuids", "labelUuids", "junctionUuids"):
                for source_uuid in schematic_ref[bucket]:
                    indexes["netBySchematicUuid"][_string(source_uuid)] = net_index

        pins_by_pair: dict[str, dict[str, Any]] = {}
        for pin in graphical.get("pins") or ():
            pair = f"{_string(pin.get('designator'))}:{_string(pin.get('pin'))}"
            if pair != ":":
                pins_by_pair[pair] = pin

        # kicad-monkey can expose a native pin in graphical.pins without also
        # repeating it in terminals (notably newly introduced and synthetic
        # unconnected nets). A graphical pin attached to this net is still a
        # real terminal membership; take the stable union so connectivity
        # counts and cross-probing do not incorrectly report 0 -> 0.
        terminals_by_pair: dict[str, dict[str, Any]] = {}
        for raw_terminal in raw.get("terminals") or ():
            reference = _string(raw_terminal.get("designator"))
            pin_number = _string(raw_terminal.get("pin"))
            if not reference or not pin_number:
                continue
            pair = f"{reference}:{pin_number}"
            terminals_by_pair[pair] = raw_terminal
        for pair, pin_graphic in pins_by_pair.items():
            reference, pin_number = pair.split(":", 1)
            terminals_by_pair.setdefault(
                pair,
                {"designator": reference, "pin": pin_number},
            )

        for pair, raw_terminal in terminals_by_pair.items():
            reference = _string(raw_terminal.get("designator"))
            pin_number = _string(raw_terminal.get("pin"))
            pin_graphic = pins_by_pair.get(pair, {})
            pin_uuid = _string(pin_graphic.get("source_pin_id") or pin_graphic.get("svg_id"))
            terminal = {
                "terminalUid": _stable_uid("term", reference, pin_number),
                "componentUid": component_by_reference.get(reference, {}).get("componentUid", _stable_uid("cmp", reference)),
                "reference": reference,
                "pin": pin_number,
                "netUid": net_entry["netUid"],
                "netName": name,
                "schematicPinUuid": pin_uuid,
            }
            terminal_index = len(terminals)
            terminals.append(terminal)
            terminal_by_pair[pair] = terminal
            terminal_index_by_pair[pair] = terminal_index
            indexes["terminalByReferencePin"][pair] = terminal_index
            if pin_uuid:
                pin_placements = schematic_placements.get(pin_uuid) or []
                matching_refs = [
                    ref
                    for ref in schematic_refs
                    if any(
                        ref.get("sheetInstancePath")
                        == placement.get("sheetInstancePath")
                        for placement in pin_placements
                    )
                ]
                for schematic_ref in matching_refs or schematic_refs[:1]:
                    if pin_uuid not in schematic_ref["pinUuids"]:
                        schematic_ref["pinUuids"].append(pin_uuid)
                indexes["terminalBySchematicPinUuid"][pin_uuid] = terminal_index
                indexes["netBySchematicUuid"][pin_uuid] = net_index

    if timing_callback is not None:
        timing_callback(
            {
                "phase": "project-schematic-nets",
                "elapsedNs": time.perf_counter_ns() - projection_started_ns,
                "cpuNs": time.thread_time_ns() - projection_cpu_started_ns,
                "metadata": {"nets": len(nets), "terminals": len(terminals)},
            }
        )

    pcb_started_ns = time.perf_counter_ns()
    pcb_cpu_started_ns = time.thread_time_ns()
    if pcb is not None:
        # One snapshot for the whole board: resolving each element against the
        # board rebuilds the net mapping every time.
        net_table = _net_table(pcb)

        def ensure_pcb_net(name: str, code: int | None) -> tuple[dict[str, Any], int] | tuple[None, None]:
            if not name:
                return None, None
            entry = net_by_name.get(name)
            index = net_index_by_name.get(name)
            if entry is None or index is None:
                entry = {
                    "netUid": _stable_uid("net", name),
                    "name": name,
                    "netCode": code,
                    "netClass": "",
                    "schematicRefs": [],
                    "pcbRefs": [{"trackUuids": [], "arcUuids": [], "viaUuids": [], "zoneUuids": [], "padUuids": []}],
                    "webgpuRefs": [],
                }
                index = len(nets)
                nets.append(entry)
                net_by_name[name] = entry
                net_index_by_name[name] = index
                indexes["netByName"][name] = index
            if code is not None:
                entry["netCode"] = code
                indexes["netByNetCode"][str(code)] = index
            return entry, index

        for footprint in getattr(pcb, "footprints", ()) or ():
            properties = _property_map(footprint)
            reference = properties.get("Reference", "")
            footprint_uuid = _string(getattr(footprint, "uuid", ""))
            component = component_by_reference.get(reference)
            if component is not None:
                component["pcbRefs"].append({"footprintUuid": footprint_uuid})
                component_index = indexes["componentByReference"].get(reference)
                if footprint_uuid and component_index is not None:
                    indexes["componentByPcbFootprintUuid"][footprint_uuid] = component_index
            for pad in getattr(footprint, "pads", ()) or ():
                pad_uuid = _string(getattr(pad, "uuid", ""))
                pin_number = _string(getattr(pad, "number", ""))
                name = _net_name(pcb, pad, net_table)
                code = _net_code(pad)
                net_entry, net_index = ensure_pcb_net(name, code)
                if net_entry is not None and net_index is not None and pad_uuid:
                    net_entry["pcbRefs"][0]["padUuids"].append(pad_uuid)
                    indexes["netByPcbUuid"][pad_uuid] = net_index
                pair = f"{reference}:{pin_number}"
                terminal = terminal_by_pair.get(pair)
                terminal_index = terminal_index_by_pair.get(pair)
                if terminal is None and reference and pin_number:
                    terminal = {
                        "terminalUid": _stable_uid("term", reference, pin_number),
                        "componentUid": component_by_reference.get(reference, {}).get("componentUid", _stable_uid("cmp", reference)),
                        "reference": reference,
                        "pin": pin_number,
                        "netUid": net_entry.get("netUid") if net_entry else None,
                        "netName": name or None,
                        "pcbPadUuid": pad_uuid,
                    }
                    terminal_index = len(terminals)
                    terminals.append(terminal)
                    terminal_by_pair[pair] = terminal
                    terminal_index_by_pair[pair] = terminal_index
                    indexes["terminalByReferencePin"][pair] = terminal_index
                elif terminal is not None:
                    terminal["pcbPadUuid"] = pad_uuid
                    if net_entry is not None:
                        terminal["netUid"] = net_entry["netUid"]
                        terminal["netName"] = name
                if pad_uuid and terminal_index is not None:
                    indexes["terminalByPcbPadUuid"][pad_uuid] = terminal_index

        for collection_name, target_key in (
            ("segments", "trackUuids"),
            ("arcs", "arcUuids"),
            ("vias", "viaUuids"),
            ("zones", "zoneUuids"),
        ):
            for item in getattr(pcb, collection_name, ()) or ():
                source_uuid = _string(getattr(item, "uuid", ""))
                name = _net_name(pcb, item, net_table)
                code = _net_code(item)
                net_entry, net_index = ensure_pcb_net(name, code)
                if net_entry is None or net_index is None or not source_uuid:
                    continue
                net_entry["pcbRefs"][0][target_key].append(source_uuid)
                indexes["netByPcbUuid"][source_uuid] = net_index

    if timing_callback is not None:
        timing_callback(
            {
                "phase": "project-pcb-indexes",
                "elapsedNs": time.perf_counter_ns() - pcb_started_ns,
                "cpuNs": time.thread_time_ns() - pcb_cpu_started_ns,
                "metadata": {
                    "components": len(components),
                    "nets": len(nets),
                    "terminals": len(terminals),
                },
            }
        )

    result = {
        "schema": SCHEMA,
        "sourceRevisionKey": source_revision_key,
        "commit": commit,
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "build": GENERATOR_BUILD,
            "cacheTag": generator_cache_tag(),
            "kicadMonkeyVersion": _kicad_monkey_version(),
        },
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "components": components,
        "nets": nets,
        "terminals": terminals,
        "sheetInstances": sheet_instances,
        "buses": buses,
        "indexes": indexes,
    }
    return result
