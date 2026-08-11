from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from app.services import kicad_footprint_normalizer


def _balanced_end(text: str, start: int) -> int | None:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index + 1
    return None


def _iter_blocks(text: str, head: str) -> Iterator[str]:
    pattern = re.compile(rf"\({re.escape(head)}(?=\s|\))")
    for match in pattern.finditer(text):
        end = _balanced_end(text, match.start())
        if end is not None:
            yield text[match.start():end]


def _direct_children(block: str) -> list[tuple[str, int, int, str]]:
    children: list[tuple[str, int, int, str]] = []
    depth = 0
    in_string = False
    escaped = False
    child_start: int | None = None
    for index, char in enumerate(block):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "(":
            if depth == 1:
                child_start = index
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 1 and child_start is not None:
                raw = block[child_start:index + 1]
                head_match = re.match(r"\(([A-Za-z0-9_\-]+)", raw)
                children.append((head_match.group(1) if head_match else "", child_start, index + 1, raw))
                child_start = None
    return children


def _remove_direct_children(block: str, heads: set[str]) -> str:
    spans = [(start, end) for head, start, end, _ in _direct_children(block) if head in heads]
    for start, end in reversed(spans):
        block = block[:start] + block[end:]
    return block


def _replace_quoted(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _find_symbol_definition(schematic_text: str, symbol_uuid: str) -> tuple[str, str] | None:
    uuid_marker = f'(uuid "{_replace_quoted(symbol_uuid)}")'
    instance = next(
        (block for block in _iter_blocks(schematic_text, "symbol") if "(lib_id " in block and uuid_marker in block),
        None,
    )
    if not instance:
        return None
    lib_id_match = re.search(r'\(lib_id\s+"([^"]+)"\)', instance)
    if not lib_id_match:
        return None
    lib_id = lib_id_match.group(1)
    definition_prefix = f'(symbol "{lib_id}"'
    definition = next(
        (block for block in _iter_blocks(schematic_text, "symbol") if block.startswith(definition_prefix)),
        None,
    )
    return (lib_id, definition) if definition else None


def _symbol_library_payload(lib_id: str, definition: str) -> tuple[str, bytes]:
    symbol_name = lib_id.rsplit(":", 1)[-1]
    renamed = definition.replace(f'(symbol "{lib_id}"', f'(symbol "{_replace_quoted(symbol_name)}"', 1)
    payload = (
        '(kicad_symbol_lib (version 20231120) (generator "kicad-prism")\n'
        f"  {renamed}\n"
        ")\n"
    ).encode("utf-8")
    return symbol_name, payload


def _sanitize_pad(block: str) -> str:
    return _remove_direct_children(block, {"net", "uuid"})


def _sanitize_footprint(block: str, footprint_ref: str) -> tuple[str, bytes, list[str]]:
    target_name = footprint_ref.rsplit(":", 1)[-1] or "ImportedFootprint"
    model_paths = re.findall(r'\(model\s+"([^"]+)"', block)
    sanitized = _remove_direct_children(block, {"at", "uuid", "path", "locked", "tstamp"})
    sanitized = re.sub(
        r'(\(property\s+"Reference"\s+")[^"]*(")',
        r'\1REF**\2',
        sanitized,
        count=1,
    )
    pad_spans = []
    for match in re.finditer(r"\(pad(?=\s|\))", sanitized):
        end = _balanced_end(sanitized, match.start())
        if end is not None:
            pad_spans.append((match.start(), end, sanitized[match.start():end]))
    for start, end, pad in reversed(pad_spans):
        sanitized = sanitized[:start] + _sanitize_pad(pad) + sanitized[end:]
    first_line_end = sanitized.find("\n")
    header = '\n\t(version 20240108)\n\t(generator "kicad-prism")'
    if first_line_end >= 0:
        sanitized = sanitized[:first_line_end] + header + sanitized[first_line_end:]
    else:
        sanitized = sanitized[:-1] + header + "\n)"
    sanitized = re.sub(r'^\(footprint\s+"[^"]+"', f'(footprint "{_replace_quoted(target_name)}"', sanitized, count=1)
    return target_name, (sanitized.rstrip() + "\n").encode("utf-8"), model_paths


def _write_staged_asset(
    stager: "ContentAddressedAssetStager",
    *,
    asset_type: str,
    filename: str,
    payload: bytes,
    target_library: str,
    target_name: str,
    source_path: str,
) -> dict[str, Any]:
    digest = hashlib.sha256(payload).hexdigest()
    destination = stager.stage(filename=filename, payload=payload, digest=digest)
    return {
        "asset_type": asset_type,
        "filename": filename,
        "staged_path": str(destination),
        "sha256": digest,
        "size_bytes": len(payload),
        "target_library": target_library,
        "target_name": target_name,
        "source_path": source_path,
    }


@dataclass
class ContentAddressedAssetStager:
    """Stage immutable import bytes once per digest while retaining logical names.

    KiCad 3D asset admission currently derives the destination filename from the
    staged path. Therefore aliases with different logical filenames remain distinct
    directory entries, but are hard-linked to the first digest object whenever the
    filesystem supports it. Repeated digest+filename assets share the exact path.
    """

    root: Path
    _objects_by_digest: dict[str, Path] = field(default_factory=dict)

    def stage(self, *, filename: str, payload: bytes, digest: str | None = None) -> Path:
        digest = digest or hashlib.sha256(payload).hexdigest()
        safe_filename = Path(filename).name or "asset"
        destination = self.root / "sha256" / digest[:2] / digest / safe_filename
        cached = self._objects_by_digest.get(digest)
        if cached == destination and destination.is_file():
            return destination
        if destination.is_file():
            if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
                destination.write_bytes(payload)
            self._objects_by_digest.setdefault(digest, destination)
            return destination

        destination.parent.mkdir(parents=True, exist_ok=True)
        if cached and cached.is_file():
            try:
                os.link(cached, destination)
            except OSError:
                destination.write_bytes(payload)
        else:
            destination.write_bytes(payload)
        self._objects_by_digest.setdefault(digest, destination)
        return destination


def _resolve_model_path(
    raw_path: str,
    *,
    project_root: Path,
    pcb_path: Path,
    files_by_name: dict[str, tuple[Path, ...]] | None = None,
) -> Path | None:
    expanded = raw_path
    expanded = expanded.replace("${KIPRJMOD}", str(project_root))
    variable = re.match(r"^\$\{([^}]+)\}(.*)$", expanded)
    if variable:
        root = os.environ.get(variable.group(1), "")
        if root:
            expanded = str(Path(root) / variable.group(2).lstrip("/\\"))
    candidate = Path(expanded).expanduser()
    candidates = [candidate] if candidate.is_absolute() else [pcb_path.parent / candidate, project_root / candidate]
    for item in candidates:
        if item.is_file():
            return item.resolve()
    basename = Path(raw_path).name
    if basename:
        indexed = (files_by_name or {}).get(basename, ())
        local = indexed[0] if indexed else None
        if local is None and files_by_name is None:
            local = next((path for path in project_root.rglob(basename) if path.is_file()), None)
        if local:
            return local.resolve()
    return None


@dataclass(frozen=True)
class _IndexedSymbol:
    lib_id: str
    symbol_name: str
    payload: bytes
    source_path: Path


@dataclass(frozen=True)
class _IndexedFootprint:
    block: str
    source_path: Path


class ProjectAssetSnapshotIndex:
    """Reusable asset lookup for one immutable project snapshot.

    Construction performs one recursive project walk and reads every schematic and
    PCB source at most once. Component extraction afterwards is dictionary lookup
    plus payload sanitization, making a whole-project import linear in project files
    and semantic components instead of multiplying both dimensions.
    """

    def __init__(
        self,
        project_root: Path,
        *,
        stager: ContentAddressedAssetStager,
    ) -> None:
        self.project_root = project_root.resolve()
        self.stager = stager
        self.symbols_by_uuid: dict[str, _IndexedSymbol] = {}
        self.symbols_by_reference: dict[str, _IndexedSymbol] = {}
        self.footprints_by_uuid: dict[str, _IndexedFootprint] = {}
        self.footprints_by_reference: dict[str, _IndexedFootprint] = {}
        self.files_by_name: dict[str, tuple[Path, ...]] = {}
        self._model_path_cache: dict[tuple[str, Path], Path | None] = {}
        self._payload_cache: dict[Path, bytes] = {}
        self._build()

    @staticmethod
    def _reference_from_block(block: str) -> str:
        match = re.search(r'\(property\s+"Reference"\s+"([^"]*)"', block)
        return match.group(1) if match else ""

    def _build(self) -> None:
        project_files = sorted(path for path in self.project_root.rglob("*") if path.is_file())
        by_name: dict[str, list[Path]] = {}
        for path in project_files:
            by_name.setdefault(path.name, []).append(path)
        self.files_by_name = {name: tuple(paths) for name, paths in by_name.items()}

        for schematic_path in (path for path in project_files if path.suffix == ".kicad_sch"):
            text = schematic_path.read_text(encoding="utf-8", errors="ignore")
            definitions: dict[str, str] = {}
            instances: list[str] = []
            for block in _iter_blocks(text, "symbol"):
                lib_id_match = re.search(r'\(lib_id\s+"([^"]+)"\)', block)
                if lib_id_match:
                    instances.append(block)
                    continue
                definition_match = re.match(r'\(symbol\s+"([^"]+)"', block)
                if definition_match:
                    definitions.setdefault(definition_match.group(1), block)
            for instance in instances:
                lib_id_match = re.search(r'\(lib_id\s+"([^"]+)"\)', instance)
                uuid_match = re.search(r'\(uuid\s+"([^"]+)"\)', instance)
                if not lib_id_match:
                    continue
                lib_id = lib_id_match.group(1)
                definition = definitions.get(lib_id)
                if not definition:
                    continue
                symbol_name, payload = _symbol_library_payload(lib_id, definition)
                indexed = _IndexedSymbol(lib_id, symbol_name, payload, schematic_path)
                if uuid_match:
                    self.symbols_by_uuid.setdefault(uuid_match.group(1), indexed)
                reference = self._reference_from_block(instance)
                if reference:
                    self.symbols_by_reference.setdefault(reference, indexed)

        for pcb_path in (path for path in project_files if path.suffix == ".kicad_pcb"):
            text = pcb_path.read_text(encoding="utf-8", errors="ignore")
            for block in _iter_blocks(text, "footprint"):
                indexed = _IndexedFootprint(block, pcb_path)
                for footprint_uuid in re.findall(r'\(uuid\s+"([^"]+)"\)', block):
                    # Matching any UUID preserves the previous marker-in-block lookup.
                    self.footprints_by_uuid.setdefault(footprint_uuid, indexed)
                reference = self._reference_from_block(block)
                if reference:
                    self.footprints_by_reference.setdefault(reference, indexed)

    def _model_path(self, raw_path: str, pcb_path: Path) -> Path | None:
        key = (raw_path, pcb_path)
        if key not in self._model_path_cache:
            self._model_path_cache[key] = _resolve_model_path(
                raw_path,
                project_root=self.project_root,
                pcb_path=pcb_path,
                files_by_name=self.files_by_name,
            )
        return self._model_path_cache[key]

    def _payload(self, path: Path) -> bytes:
        resolved = path.resolve()
        if resolved not in self._payload_cache:
            self._payload_cache[resolved] = resolved.read_bytes()
        return self._payload_cache[resolved]

    def extract_component_assets(
        self,
        component: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], list[dict[str, str]], dict[str, str]]:
        assets: list[dict[str, Any]] = []
        findings: list[dict[str, str]] = []
        resolved: dict[str, str] = {}
        reference = str(component.get("reference") or "")
        schematic_refs = list(component.get("schematicRefs") or [])
        symbol_uuid = next(
            (str(item.get("symbolUuid") or "") for item in schematic_refs if item.get("symbolUuid")),
            "",
        )
        symbol_result = self.symbols_by_uuid.get(symbol_uuid) if symbol_uuid else None
        if symbol_result is None and reference:
            symbol_result = self.symbols_by_reference.get(reference)

        if symbol_result:
            lib_id = symbol_result.lib_id
            symbol_name = symbol_result.symbol_name
            library_name = lib_id.rsplit(":", 1)[0] if ":" in lib_id else "Prism_Project_Symbols"
            assets.append(
                _write_staged_asset(
                    self.stager,
                    asset_type="symbol",
                    filename=f"{symbol_name}.kicad_sym",
                    payload=symbol_result.payload,
                    target_library=library_name,
                    target_name=symbol_name,
                    source_path=str(symbol_result.source_path.relative_to(self.project_root)),
                )
            )
            resolved["symbol_lib_id"] = lib_id
        else:
            findings.append(
                {
                    "code": "symbol_not_resolved",
                    "severity": "error",
                    "message": f"Embedded symbol for {reference} was not found.",
                }
            )

        footprint_uuid = next(
            (
                str(item.get("footprintUuid") or "")
                for item in component.get("pcbRefs") or []
                if item.get("footprintUuid")
            ),
            "",
        )
        footprint_ref = str(component.get("footprint") or "")
        footprint_result = self.footprints_by_uuid.get(footprint_uuid) if footprint_uuid else None
        if footprint_result is None and reference:
            footprint_result = self.footprints_by_reference.get(reference)
        if footprint_result:
            target_name, payload, model_paths = _sanitize_footprint(footprint_result.block, footprint_ref)
            pcb_path = footprint_result.source_path

            # A part placed on the back of the board is stored mirrored. Library
            # footprints are front-side by convention, so undo the placement flip
            # before the bytes become an immutable catalog asset.
            normalized = kicad_footprint_normalizer.normalize_to_front(payload, target_name)
            if normalized.changed:
                payload = normalized.payload
                findings.append(
                    {
                        "code": "footprint_side_normalized",
                        "severity": "warning",
                        "message": (
                            f"{reference} is placed on the back of the board. Its footprint was "
                            "flipped to the front so the library copy matches KiCad convention."
                        ),
                    }
                )
            elif normalized.error:
                findings.append(
                    {
                        "code": "footprint_side_normalization_failed",
                        "severity": "warning",
                        "message": (
                            f"{reference} is placed on the back of the board and its footprint could "
                            f"not be flipped to the front ({normalized.error}). It will import mirrored."
                        ),
                    }
                )

            library_name = (
                footprint_ref.rsplit(":", 1)[0] if ":" in footprint_ref else "Prism_Project_Footprints"
            )
            assets.append(
                _write_staged_asset(
                    self.stager,
                    asset_type="footprint",
                    filename=f"{target_name}.kicad_mod",
                    payload=payload,
                    target_library=library_name,
                    target_name=target_name,
                    source_path=str(pcb_path.relative_to(self.project_root)),
                )
            )
            resolved["footprint_lib_id"] = footprint_ref
            for model_path in model_paths:
                source = self._model_path(model_path, pcb_path)
                if not source:
                    findings.append(
                        {
                            "code": "model_not_resolved",
                            "severity": "warning",
                            "message": f"3D model could not be resolved: {model_path}",
                        }
                    )
                    continue
                assets.append(
                    _write_staged_asset(
                        self.stager,
                        asset_type="3dmodel",
                        filename=source.name,
                        payload=self._payload(source),
                        target_library=library_name,
                        target_name=source.name,
                        source_path=model_path,
                    )
                )
        elif footprint_ref:
            findings.append(
                {
                    "code": "footprint_not_resolved",
                    "severity": "error",
                    "message": f"Embedded footprint for {reference} was not found.",
                }
            )

        return assets, findings, resolved


def build_project_asset_index(
    project_root: Path,
    *,
    staging_dir: Path | None = None,
    stager: ContentAddressedAssetStager | None = None,
) -> ProjectAssetSnapshotIndex:
    if stager is None:
        if staging_dir is None:
            raise ValueError("staging_dir or stager is required")
        stager = ContentAddressedAssetStager(staging_dir)
    return ProjectAssetSnapshotIndex(project_root, stager=stager)


def extract_component_assets(
    project_root: Path,
    component: dict[str, Any],
    *,
    staging_dir: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, str]], dict[str, str]]:
    """Compatibility wrapper for callers extracting a single component."""

    return build_project_asset_index(project_root, staging_dir=staging_dir).extract_component_assets(component)
