from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from app.services import project_service, semantic_index_service
from app.services.component_catalog_service import catalog_service
from app.services.project_component_asset_extractor import (
    ContentAddressedAssetStager,
    build_project_asset_index,
)

logger = logging.getLogger(__name__)


def _normalized(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _field(fields: dict[str, Any], *names: str) -> str:
    normalized_names = {re.sub(r"[^a-z0-9]", "", name.casefold()) for name in names}
    for key, value in fields.items():
        if re.sub(r"[^a-z0-9]", "", str(key).casefold()) in normalized_names:
            return str(value or "").strip()
    return ""


def _is_instance_context_field(name: object) -> bool:
    """Return whether a KiCad field describes a placed instance, not the part.

    A project import deliberately groups many placed symbols into one catalog
    candidate.  UUIDs, sheet paths, and sheet names must therefore never become
    catalog metadata or generate a provenance conflict merely because two
    placements are different.
    """

    normalized = re.sub(r"[^a-z0-9]", "", str(name).casefold())
    return normalized in {
        "uuid",
        "symboluuid",
        "instanceuuid",
        "kicadinstanceuuid",
        "sheetname",
        "sheetpath",
        "sheetpathuuid",
        "sheetpathuuids",
        "kicadsheetpathnames",
        "kicadsheetpathuuids",
        "hierarchicalsheetpath",
    }


def _dedupe_key(component: dict[str, Any], *, project_id: str) -> str:
    fields = dict(component.get("fields") or {})
    manufacturer = _field(fields, "Manufacturer", "MFR")
    mpn = _field(fields, "Manufacturer Part Number", "MPN", "Part Number")
    if manufacturer and mpn:
        identity: object = ["mpn", _normalized(manufacturer), _normalized(mpn)]
    else:
        filtered_fields = {
            str(key): value
            for key, value in fields.items()
            if (
                _normalized(key) not in {"reference", "references"}
                and not _is_instance_context_field(key)
                and not str(key).startswith("_")
            )
        }
        identity = [
            "project-content",
            str(project_id),
            _normalized(component.get("value")),
            _normalized(component.get("footprint")),
            filtered_fields,
        ]
    canonical = json.dumps(identity, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _matches_selection(component: dict[str, Any], selection: dict[str, Any]) -> bool:
    if selection.get("component_uid") and component.get("componentUid") == selection["component_uid"]:
        return True
    if selection.get("reference") and component.get("reference") == selection["reference"]:
        return True
    schematic_uuid = str(selection.get("schematic_uuid") or "")
    if schematic_uuid and any(
        str(item.get("symbolUuid") or "") == schematic_uuid for item in component.get("schematicRefs") or []
    ):
        return True
    footprint_uuid = str(selection.get("pcb_footprint_uuid") or "")
    return bool(
        footprint_uuid
        and any(str(item.get("footprintUuid") or "") == footprint_uuid for item in component.get("pcbRefs") or [])
    )


def _proposal(
    component: dict[str, Any],
    *,
    project_id: str,
    source_revision: str,
    assets: list[dict[str, Any]] | None = None,
    extraction_findings: list[dict[str, str]] | None = None,
    resolved: dict[str, str] | None = None,
) -> dict[str, Any]:
    fields = {
        str(key): value
        for key, value in (component.get("fields") or {}).items()
        if not _is_instance_context_field(key) and not str(key).startswith("_")
    }
    reference = str(component.get("reference") or "")
    footprint = str(component.get("footprint") or "")
    findings: list[dict[str, str]] = []
    if not footprint:
        findings.append(
            {
                "code": "missing_footprint_mapping",
                "severity": "warning",
                "message": "The project symbol does not declare a footprint mapping.",
            }
        )
    required_metadata = {
        "value": str(component.get("value") or fields.get("Value") or ""),
        "description": _field(fields, "Description"),
        "datasheet": _field(fields, "Datasheet", "Data Sheet", "Datasheet URL", "Datasheet Link"),
        "manufacturer": _field(fields, "Manufacturer", "MFR"),
        "manufacturer_part_number": _field(fields, "Manufacturer Part Number", "MPN", "Part Number"),
    }
    for key, value in required_metadata.items():
        if not value.strip():
            findings.append(
                {
                    "code": f"missing_metadata_{key}",
                    "severity": "error",
                    "message": f"Required component metadata is missing: {key.replace('_', ' ')}.",
                }
            )
    findings.extend(extraction_findings or [])
    return {
        "dedupe_key": _dedupe_key(component, project_id=project_id),
        "component_uid": str(component.get("componentUid") or ""),
        "reference": reference,
        "metadata": {
            "reference": reference,
            "references": [reference] if reference else [],
            "value": required_metadata["value"],
            "footprint": footprint,
            "manufacturer": required_metadata["manufacturer"],
            "manufacturer_part_number": _field(fields, "Manufacturer Part Number", "MPN", "Part Number"),
            "description": required_metadata["description"],
            "datasheet": required_metadata["datasheet"],
            "fields": fields,
            **(resolved or {}),
        },
        "assets": assets or [],
        "provenance": [
            {
                "projectId": project_id,
                "sourceRevision": source_revision,
                "reference": reference,
                "componentUid": str(component.get("componentUid") or ""),
                "schematicRefs": list(component.get("schematicRefs") or []),
                "pcbRefs": list(component.get("pcbRefs") or []),
                "extractor": semantic_index_service.generator_cache_tag(),
            }
        ],
        "findings": findings,
    }


def _alternative_sources(provenance: list[dict[str, Any]]) -> list[dict[str, str]]:
    keys = ("projectId", "sourceRevision", "reference", "componentUid")
    return [
        {key: str(source.get(key) or "") for key in keys if source.get(key)}
        for source in provenance
    ]


def _record_alternative(
    metadata: dict[str, Any],
    field_name: str,
    value: Any,
    provenance: list[dict[str, Any]],
) -> None:
    alternatives = metadata.setdefault("alternatives", {})
    entries = alternatives.setdefault(field_name, [])
    entry = next((item for item in entries if _normalized(item.get("value")) == _normalized(value)), None)
    if entry is None:
        entry = {"value": value, "sources": []}
        entries.append(entry)
    existing_sources = {
        json.dumps(source, sort_keys=True, separators=(",", ":")) for source in entry["sources"]
    }
    for source in _alternative_sources(provenance):
        identity = json.dumps(source, sort_keys=True, separators=(",", ":"))
        if identity not in existing_sources:
            entry["sources"].append(source)
            existing_sources.add(identity)


def _metadata_conflict_finding(field_name: str) -> dict[str, str]:
    code_name = re.sub(r"[^a-z0-9]+", "_", field_name.casefold()).strip("_")
    return {
        "code": f"conflicting_metadata_{code_name}",
        "severity": "warning",
        "message": (
            f"Projects provide different non-empty values for {field_name}. "
            "Review the provenance-linked alternatives before import."
        ),
    }


def _merge_metadata(target: dict[str, Any], incoming: dict[str, Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    target_metadata = target["metadata"]
    incoming_metadata = incoming["metadata"]
    target_provenance = list(target["provenance"])
    incoming_provenance = list(incoming["provenance"])

    for field_name in ("value", "description", "datasheet", "footprint"):
        target_value = target_metadata.get(field_name)
        incoming_value = incoming_metadata.get(field_name)
        alternatives = target_metadata.get("alternatives", {}).get(field_name)
        if not _normalized(target_value) and _normalized(incoming_value):
            target_metadata[field_name] = incoming_value
        elif (
            _normalized(target_value)
            and _normalized(incoming_value)
            and _normalized(target_value) != _normalized(incoming_value)
        ):
            if not alternatives:
                _record_alternative(target_metadata, field_name, target_value, target_provenance)
            _record_alternative(target_metadata, field_name, incoming_value, incoming_provenance)
            findings.append(_metadata_conflict_finding(field_name))
        elif alternatives and _normalized(target_value) == _normalized(incoming_value):
            _record_alternative(target_metadata, field_name, incoming_value, incoming_provenance)

    excluded_fields = {
        "reference",
        "references",
        "value",
        "footprint",
        "description",
        "datasheet",
        "datasheeturl",
        "manufacturer",
        "mfr",
        "manufacturerpartnumber",
        "mpn",
        "partnumber",
    }
    target_fields = target_metadata.setdefault("fields", {})
    target_fields_by_name = {
        re.sub(r"[^a-z0-9]", "", str(key).casefold()): key for key in target_fields
    }
    for incoming_key, incoming_value in (incoming_metadata.get("fields") or {}).items():
        normalized_key = re.sub(r"[^a-z0-9]", "", str(incoming_key).casefold())
        if (
            normalized_key in excluded_fields
            or _is_instance_context_field(incoming_key)
            or str(incoming_key).startswith("_")
        ):
            continue
        target_key = target_fields_by_name.get(normalized_key, incoming_key)
        target_value = target_fields.get(target_key)
        field_name = f"fields.{target_key}"
        alternatives = target_metadata.get("alternatives", {}).get(field_name)
        if not _normalized(target_value) and _normalized(incoming_value):
            target_fields[target_key] = incoming_value
            target_fields_by_name[normalized_key] = target_key
        elif (
            _normalized(target_value)
            and _normalized(incoming_value)
            and _normalized(target_value) != _normalized(incoming_value)
        ):
            if not alternatives:
                _record_alternative(target_metadata, field_name, target_value, target_provenance)
            _record_alternative(target_metadata, field_name, incoming_value, incoming_provenance)
            findings.append(_metadata_conflict_finding(field_name))
        elif alternatives and _normalized(target_value) == _normalized(incoming_value):
            _record_alternative(target_metadata, field_name, incoming_value, incoming_provenance)

    for field_name, entries in (incoming_metadata.get("alternatives") or {}).items():
        for entry in entries:
            _record_alternative(
                target_metadata,
                str(field_name),
                entry.get("value"),
                list(entry.get("sources") or incoming_provenance),
            )
    return findings


def _merge_proposal(target: dict[str, Any], incoming: dict[str, Any]) -> None:
    target["findings"].extend(_merge_metadata(target, incoming))
    target["provenance"].extend(incoming["provenance"])
    references = set(target["metadata"].get("references") or [])
    references.update(incoming["metadata"].get("references") or [])
    target["metadata"]["references"] = sorted(references)
    existing_assets = {(item["asset_type"], item["sha256"]) for item in target["assets"]}
    types_by_hash = {item["asset_type"]: item["sha256"] for item in target["assets"]}
    for asset in incoming["assets"]:
        identity = (asset["asset_type"], asset["sha256"])
        if identity in existing_assets:
            continue
        existing_hash = types_by_hash.get(asset["asset_type"])
        if (
            existing_hash
            and existing_hash != asset["sha256"]
            and asset["asset_type"] in {"symbol", "footprint"}
        ):
            target["findings"].append(
                {
                    "code": f"conflicting_{asset['asset_type']}_assets",
                    "severity": "error",
                    "message": (
                        f"Projects contain different {asset['asset_type']} content "
                        "for the same component identity."
                    ),
                }
            )
        target["assets"].append(asset)
        existing_assets.add(identity)
    existing_findings = {(item["code"], item["message"]) for item in target["findings"]}
    for finding in incoming["findings"]:
        if (finding["code"], finding["message"]) not in existing_findings:
            target["findings"].append(finding)


def run_project_import_session(session_id: str) -> None:
    session = catalog_service.get_project_import_session(session_id)
    if not session:
        return
    try:
        catalog_service.update_project_import_session(session_id, status="scanning")
        grouped: dict[str, dict[str, Any]] = {}
        selection = dict(session.get("selection") or {})
        stager = ContentAddressedAssetStager(
            catalog_service.store_root / "imports" / session_id / "assets"
        )
        for project_id in session.get("project_ids") or []:
            project = project_service.get_project_by_id(str(project_id))
            if not project:
                raise ValueError(f"Project not found while scanning: {project_id}")
            source_revision = str((session.get("project_revisions") or {}).get(project_id) or "")
            semantic_index = semantic_index_service.get_or_build(project, source_revision or None)
            components = list(semantic_index.get("components") or [])
            if session["scope"] == "component":
                components = [
                    component for component in components if _matches_selection(component, selection)
                ]
                if not components:
                    raise ValueError(
                        "The selected project component could not be resolved at the captured revision"
                    )
            if not components:
                continue
            with semantic_index_service._project_file_for_revision(
                project, source_revision or None
            ) as (project_file, _):
                project_root = project_file.parent
                asset_index = build_project_asset_index(project_root, stager=stager)
                for component in components:
                    assets, findings, resolved = asset_index.extract_component_assets(component)
                    candidate = _proposal(
                        component,
                        project_id=str(project_id),
                        source_revision=source_revision,
                        assets=assets,
                        extraction_findings=findings,
                        resolved=resolved,
                    )
                    existing = grouped.get(candidate["dedupe_key"])
                    if existing:
                        _merge_proposal(existing, candidate)
                    else:
                        grouped[candidate["dedupe_key"]] = candidate
        proposals = list(grouped.values())
        # Where-used is a semantic observation, not a side effect of admitting an
        # asset into the managed library. Update known component usage on every scan
        # so release reviewers see project impact even when proposals remain pending.
        catalog_service.index_project_component_usage(proposals)
        catalog_service.stage_project_import_proposals(session_id, proposals)
    except Exception as exc:
        logger.exception("Project component import session %s failed", session_id)
        catalog_service.update_project_import_session(session_id, status="failed", error_message=str(exc))
