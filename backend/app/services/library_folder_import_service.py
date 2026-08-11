from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.component_catalog_service import catalog_service
from app.services.local_artifact_store import artifact_store
from app.services.kicad_library_discovery import discover_library, footprint_name_from_text


SUPPORTED_SUFFIXES = {
    ".kicad_sym",
    ".kicad_mod",
    ".step",
    ".stp",
    ".wrl",
    ".lib",
    ".mod",
    ".mdl",
    ".cir",
    ".sub",
    ".subckt",
    ".spice",
}
MODEL_SUFFIXES = {".step", ".stp", ".wrl"}
SPICE_SUFFIXES = {".lib", ".mod", ".mdl", ".cir", ".sub", ".subckt", ".spice"}


def configured_import_roots() -> dict[str, Path]:
    roots: dict[str, Path] = {}
    for index, entry in enumerate(settings.CATALOG_IMPORT_ROOTS.split(","), start=1):
        entry = entry.strip()
        if not entry:
            continue
        name, separator, raw_path = entry.partition("=")
        if not separator:
            raw_path = name
            name = f"root-{index}"
        path = Path(raw_path).expanduser().resolve()
        if path.is_dir():
            roots[name.strip() or f"root-{index}"] = path
    return roots


def resolve_server_import_path(root_name: str, subpath: str) -> Path:
    root = configured_import_roots().get(root_name)
    if root is None:
        raise ValueError("Configured import root not found")
    candidate = (root / subpath).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("Import path escapes the configured root") from exc
    if not candidate.is_dir():
        raise ValueError("Import directory not found")
    return candidate


def capture_server_snapshot(snapshot_id: str, root_name: str, subpath: str) -> None:
    source = resolve_server_import_path(root_name, subpath)
    for path in sorted(item for item in source.rglob("*") if item.is_file()):
        if path.suffix.lower() not in SUPPORTED_SUFFIXES and path.name not in {"sym-lib-table", "fp-lib-table"}:
            continue
        artifact = artifact_store.put_file(
            path,
            artifact_kind="source",
            max_bytes=settings.CATALOG_IMPORT_MAX_FILE_BYTES,
        )
        artifact_store.add_snapshot_file(snapshot_id, path.relative_to(source).as_posix(), artifact)
    artifact_store.complete_snapshot(snapshot_id)


def _properties(symbol_block: str) -> dict[str, str]:
    pattern = re.compile(r'\(property\s+"((?:\\.|[^"])*)"\s+"((?:\\.|[^"])*)"')
    return {
        key.replace(r'\"', '"').replace(r"\\", "\\"): value.replace(r'\"', '"').replace(r"\\", "\\")
        for key, value in pattern.findall(symbol_block)
    }


def _field(properties: dict[str, str], *names: str) -> str:
    normalized = {re.sub(r"[^a-z0-9]", "", key.casefold()): value for key, value in properties.items()}
    for name in names:
        value = normalized.get(re.sub(r"[^a-z0-9]", "", name.casefold()), "").strip()
        if value:
            return value
    return ""


def _footprint_identity(relative_path: str) -> tuple[str, str]:
    path = Path(relative_path)
    library = next(
        (parent.name.removesuffix(".pretty") for parent in path.parents if parent.suffix.lower() == ".pretty"),
        path.parent.name or "Prism_Imported",
    )
    return library, path.stem


def _resolve_footprint(
    footprint_ref: str,
    footprint_files: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    normalized = footprint_ref.strip()
    candidates = [normalized.casefold(), normalized.rsplit(":", 1)[-1].casefold()]
    return next((footprint_files[key] for key in candidates if key in footprint_files), None)


def _resolve_linked_file(
    raw_path: str,
    *,
    footprint_relative_path: str,
    files_by_relative: dict[str, dict[str, Any]],
    files_by_name: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    expanded = re.sub(r"^\$\{[^}]+\}/?", "", raw_path).replace("\\", "/")
    relative = (Path(footprint_relative_path).parent / expanded).as_posix()
    for candidate in (expanded.lstrip("/"), relative):
        if candidate.casefold() in files_by_relative:
            return files_by_relative[candidate.casefold()]
    matches = files_by_name.get(Path(raw_path).name.casefold(), [])
    return matches[0] if len(matches) == 1 else None


def _staged_asset(
    *,
    session_id: str,
    artifact: dict[str, Any],
    asset_type: str,
    filename: str,
    target_library: str,
    target_name: str,
) -> dict[str, Any]:
    destination = (
        catalog_service.store_root
        / "imports"
        / session_id
        / "assets"
        / "sha256"
        / str(artifact["sha256"])[:2]
        / str(artifact["sha256"])
        / Path(filename).name
    )
    artifact_store.materialize(str(artifact["sha256"]), destination)
    return {
        "asset_type": asset_type,
        "filename": Path(filename).name,
        "staged_path": str(destination),
        "sha256": str(artifact["sha256"]),
        "size_bytes": int(artifact["size_bytes"]),
        "target_library": target_library,
        "target_name": target_name,
        "source_path": str(artifact["relative_path"]),
    }


def _store_generated(payload: bytes) -> dict[str, Any]:
    artifact = artifact_store.put_stream(io.BytesIO(payload), artifact_kind="source")
    return {
        "sha256": artifact.sha256,
        "size_bytes": artifact.size_bytes,
        "object_path": str(artifact.path),
    }


def build_folder_proposals(
    snapshot_id: str,
    session_id: str,
    approved_component_ids: set[str] | None = None,
    footprint_resolutions: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    snapshot = artifact_store.get_snapshot(snapshot_id)
    if not snapshot or snapshot.get("status") != "ready":
        raise ValueError("Folder snapshot is not ready")
    files = artifact_store.snapshot_files(snapshot_id)
    for item in files:
        item["suffix"] = Path(str(item["relative_path"])).suffix.lower()
    files_by_relative = {str(item["relative_path"]).casefold(): item for item in files}
    files_by_name: dict[str, list[dict[str, Any]]] = {}
    for item in files:
        files_by_name.setdefault(Path(str(item["relative_path"])).name.casefold(), []).append(item)

    discovery = discover_library(
        files,
        [{"relative_path": item["relative_path"], "size_bytes": item["size_bytes"]} for item in files],
    )
    discovery_by_id = {str(item["id"]): item for item in discovery["components"]}
    footprints: dict[str, dict[str, Any]] = {}
    footprints_by_path: dict[str, dict[str, Any]] = {}
    for item in files:
        if item["suffix"] != ".kicad_mod":
            continue
        library, fallback_name = _footprint_identity(str(item["relative_path"]))
        footprint_text = Path(str(item["object_path"])).read_text(encoding="utf-8", errors="replace")
        name = footprint_name_from_text(footprint_text, fallback_name)
        enriched = {**item, "target_library": library, "target_name": name}
        footprints_by_path[str(item["relative_path"]).casefold()] = enriched
        footprints[f"{library}:{name}".casefold()] = enriched
        footprints.setdefault(name.casefold(), enriched)
        footprints.setdefault(fallback_name.casefold(), enriched)

    proposals: list[dict[str, Any]] = []
    for source in files:
        if source["suffix"] != ".kicad_sym":
            continue
        text = Path(str(source["object_path"])).read_text(encoding="utf-8", errors="replace")
        blocks = catalog_service._extract_top_level_symbol_blocks(text)  # type: ignore[attr-defined]
        block_names = {name for name, _ in blocks}
        for symbol_name, symbol_block in blocks:
            unit_base = re.sub(r"_\d+_\d+$", "", symbol_name)
            if unit_base != symbol_name and unit_base in block_names:
                continue
            discovery_id = hashlib.sha256(
                f"{source['relative_path']}\0{symbol_name}".encode()
            ).hexdigest()
            if approved_component_ids is not None and discovery_id not in approved_component_ids:
                continue
            discovered_component = discovery_by_id.get(discovery_id, {})
            try:
                symbol_payload = catalog_service._single_symbol_payload(text, symbol_name)  # type: ignore[attr-defined]
            except ValueError:
                continue
            symbol_artifact = _store_generated(symbol_payload)
            library = Path(str(source["relative_path"])).stem or "Prism_Imported"
            properties = _properties(symbol_block)
            footprint_ref = _field(properties, "Footprint")
            selected_footprint = (discovered_component.get("footprint") or {}).get("selected")
            selected_path = (footprint_resolutions or {}).get(discovery_id) or str(
                (selected_footprint or {}).get("relative_path") or ""
            )
            footprint = footprints_by_path.get(selected_path.casefold())
            if footprint is None:
                footprint = _resolve_footprint(footprint_ref, footprints) if footprint_ref else None
            value = _field(properties, "Value") or symbol_name
            manufacturer = _field(properties, "Manufacturer", "Manufacturer Name", "MFR")
            mpn = _field(properties, "Manufacturer Part Number", "MPN", "Part Number")
            description = _field(properties, "Description")
            datasheet = _field(properties, "Datasheet", "Data Sheet")
            findings: list[dict[str, str]] = []
            required = {
                "description": description,
                "datasheet": datasheet,
                "manufacturer": manufacturer,
                "manufacturer_part_number": mpn,
            }
            for field_name, field_value in required.items():
                if not field_value:
                    findings.append({
                        "code": f"missing_metadata_{field_name}",
                        "severity": "error",
                        "message": f"Required component metadata is missing: {field_name.replace('_', ' ')}.",
                    })
            assets = [
                _staged_asset(
                    session_id=session_id,
                    artifact={**symbol_artifact, "relative_path": source["relative_path"]},
                    asset_type="symbol",
                    filename=f"{symbol_name}.kicad_sym",
                    target_library=library,
                    target_name=symbol_name,
                )
            ]
            if footprint:
                assets.append(
                    _staged_asset(
                        session_id=session_id,
                        artifact=footprint,
                        asset_type="footprint",
                        filename=Path(str(footprint["relative_path"])).name,
                        target_library=str(footprint["target_library"]),
                        target_name=str(footprint["target_name"]),
                    )
                )
                footprint_text = Path(str(footprint["object_path"])).read_text(encoding="utf-8", errors="replace")
                for model_ref in re.findall(r'\(model\s+"([^"]+)"', footprint_text):
                    model = _resolve_linked_file(
                        model_ref,
                        footprint_relative_path=str(footprint["relative_path"]),
                        files_by_relative=files_by_relative,
                        files_by_name=files_by_name,
                    )
                    if model and model["suffix"] in MODEL_SUFFIXES:
                        assets.append(
                            _staged_asset(
                                session_id=session_id,
                                artifact=model,
                                asset_type="3dmodel",
                                filename=Path(str(model["relative_path"])).name,
                                target_library=str(footprint["target_library"]),
                                target_name=Path(str(model["relative_path"])).stem,
                            )
                        )
                    else:
                        findings.append({
                            "code": "unresolved_3d_model",
                            "severity": "warning",
                            "message": f"Footprint model reference could not be resolved: {model_ref}",
                        })
            else:
                findings.append({
                    "code": "missing_footprint_mapping",
                    "severity": "error",
                    "message": "The symbol footprint property does not resolve to a footprint in this snapshot.",
                })

            spice_name = Path(_field(properties, "Spice_Model", "Spice Model")).name.casefold()
            if spice_name:
                for spice in files_by_name.get(spice_name, []):
                    if spice["suffix"] in SPICE_SUFFIXES:
                        assets.append(
                            _staged_asset(
                                session_id=session_id,
                                artifact=spice,
                                asset_type="spice",
                                filename=Path(str(spice["relative_path"])).name,
                                target_library=library,
                                target_name=Path(str(spice["relative_path"])).stem,
                            )
                        )
            identity = [manufacturer.casefold(), mpn.casefold()] if manufacturer and mpn else [library, symbol_name, symbol_artifact["sha256"]]
            proposals.append({
                "dedupe_key": hashlib.sha256("\0".join(identity).encode("utf-8")).hexdigest(),
                "reference": symbol_name,
                "metadata": {
                    "reference": symbol_name,
                    "references": [symbol_name],
                    "value": value,
                    "footprint": footprint_ref,
                    "manufacturer": manufacturer,
                    "manufacturer_part_number": mpn,
                    "description": description,
                    "datasheet": datasheet,
                    "fields": properties,
                },
                "assets": assets,
                "provenance": [{
                    "source": "folder_snapshot",
                    "snapshotId": snapshot_id,
                    "manifestSha256": str(snapshot.get("manifest_sha256") or ""),
                    "symbolPath": str(source["relative_path"]),
                }],
                "findings": findings,
            })
    return proposals


def run_folder_import_session(
    session_id: str,
    snapshot_id: str,
    server_source: dict[str, str] | None = None,
    approved_component_ids: set[str] | None = None,
    footprint_resolutions: dict[str, str] | None = None,
) -> None:
    try:
        catalog_service.update_project_import_session(session_id, status="scanning")
        if server_source:
            capture_server_snapshot(snapshot_id, server_source["root_name"], server_source.get("subpath", ""))
        proposals = build_folder_proposals(
            snapshot_id,
            session_id,
            approved_component_ids,
            footprint_resolutions,
        )
        catalog_service.stage_project_import_proposals(session_id, proposals)
    except Exception as exc:
        catalog_service.update_project_import_session(session_id, status="failed", error_message=str(exc))
        raise
