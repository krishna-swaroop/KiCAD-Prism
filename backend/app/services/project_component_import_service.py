from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any

from app.services import project_service, semantic_index_service
from app.services.catalog.field_rules import missing_metadata_findings
from app.services.catalog.metadata_normalization import is_reserved_stamp_key
from app.services.component_catalog_service import catalog_service
from app.services.project_component_asset_extractor import (
    ContentAddressedAssetStager,
    footprint_land_pattern,
)
from app.services.project_component_bundle_assets import (
    BUNDLE_MEMBER_PATHS,
    ProjectBundleAssetIndex,
)

logger = logging.getLogger(__name__)


def _normalized(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _key(name: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).casefold())


def _field(fields: dict[str, Any], *names: str) -> str:
    """The first non-blank value among ``names``, in that order: a blank standard field does not hide an alias that has the value."""

    by_name = {_key(key): str(value or "").strip() for key, value in fields.items()}
    return next((by_name[_key(name)] for name in names if by_name.get(_key(name))), "")


# The standard symbol field for the maker, the part number and the datasheet, and the other names projects use for them.
_STANDARD_FIELDS = (
    ("Manufacturer", ("MFR",)),
    ("Manufacturer Part Number", ("MPN", "Part Number")),
    ("Datasheet", ("Data Sheet", "Datasheet URL", "Datasheet Link")),
)


def _standard_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """Put a value a symbol keeps under another name into the standard field, and drop the other name when it only repeats it.

    A symbol with an empty **Manufacturer Part Number** and the number in **Part Number** becomes a component whose
    standard field holds the number, with no second copy beside it. An alias that says something else is kept.
    """

    out = dict(fields)
    for standard, aliases in _STANDARD_FIELDS:
        value = _field(out, standard, *aliases)
        if not value:
            continue
        present = {_key(key): key for key in out}
        standard_key = present.get(_key(standard), standard)
        out[standard_key] = value
        for alias in aliases:
            alias_key = present.get(_key(alias))
            if alias_key is not None and alias_key != standard_key and str(out[alias_key] or "").strip() in ("", value):
                del out[alias_key]
    return out


def _is_instance_context_field(name: object) -> bool:
    """Return whether a KiCad field describes a placed instance, not the part.

    A project import deliberately groups many placed symbols into one catalog
    candidate.  UUIDs, sheet paths, and sheet names must therefore never become
    catalog metadata or generate a provenance conflict merely because two
    placements are different.  The catalog placement stamp names the revision
    one placement came from, so it is instance context as well.  So are the
    reference designator, the sheet file, a placement's DNP / BOM / board flags,
    and the library the schematic copied the symbol from.
    """

    if is_reserved_stamp_key(name):
        return True
    normalized = _key(name)
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
        "reference",
        "references",
        "sheetfile",
        "dnp",
        "inbom",
        "onboard",
        "excludefrombom",
        "excludefromboard",
        "kicaddnp",
        "kicadinbom",
        "kicadonboard",
        "kicadlibsourcelib",
        "kicadlibsourcepart",
        "kicadlibsourcedescription",
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
            if not _is_instance_context_field(key) and not str(key).startswith("_")
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
    fields = _standard_fields({
        str(key): value
        for key, value in (component.get("fields") or {}).items()
        if not _is_instance_context_field(key) and not str(key).startswith("_")
    })
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
    findings.extend(missing_metadata_findings(required_metadata))
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
        _key(key): key for key in target_fields
    }
    for incoming_key, incoming_value in (incoming_metadata.get("fields") or {}).items():
        normalized_key = _key(incoming_key)
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


def _conflict_subjects(*provenances: list[dict[str, Any]]) -> str:
    """The source projects and references behind a conflict, for its message."""

    subjects: list[str] = []
    seen: set[tuple[str, str]] = set()
    for provenance in provenances:
        for source in _alternative_sources(provenance):
            key = (source.get("projectId", ""), source.get("reference", ""))
            if key in seen:
                continue
            seen.add(key)
            subjects.append(" ".join(part for part in key if part))
    return ", ".join(subjects)


def _asset_land_pattern(asset: dict[str, Any]) -> tuple[tuple[object, ...], ...] | None:
    """The staged footprint's copper land pattern, or ``None`` when it cannot be read."""

    path = str(asset.get("staged_path") or "")
    if not path:
        return None
    try:
        return footprint_land_pattern(Path(path).read_bytes())
    except OSError:
        return None


def _merge_proposal(target: dict[str, Any], incoming: dict[str, Any]) -> None:
    target["findings"].extend(_merge_metadata(target, incoming))
    target["provenance"].extend(incoming["provenance"])
    references = set(target["metadata"].get("references") or [])
    references.update(incoming["metadata"].get("references") or [])
    target["metadata"]["references"] = sorted(references)
    existing_assets = {(item["asset_type"], item["sha256"]) for item in target["assets"]}
    first_by_type = {item["asset_type"]: item for item in target["assets"]}
    for asset in incoming["assets"]:
        identity = (asset["asset_type"], asset["sha256"])
        if identity in existing_assets:
            continue
        existing = first_by_type.get(asset["asset_type"])
        if existing is None:
            target["assets"].append(asset)
            first_by_type[asset["asset_type"]] = asset
            existing_assets.add(identity)
            continue
        if existing["sha256"] == asset["sha256"]:
            existing_assets.add(identity)
            continue
        subjects = _conflict_subjects(list(target["provenance"]), list(incoming["provenance"]))
        if asset["asset_type"] == "symbol":
            target["findings"].append(
                {
                    "code": "conflicting_symbol_assets",
                    "severity": "error",
                    "message": (
                        "Projects contain different symbol content for the same component "
                        f"identity ({subjects})."
                    ),
                }
            )
            target["assets"].append(asset)
        elif asset["asset_type"] == "footprint":
            # Two footprints for one identity conflict only when their copper
            # land pattern differs. A difference outside the pads (silk,
            # courtyard, fab, text, 3D model) is a reviewable variant, and the
            # first copy is kept either way.
            first_pattern = _asset_land_pattern(existing)
            incoming_pattern = _asset_land_pattern(asset)
            if first_pattern is None or incoming_pattern is None or first_pattern != incoming_pattern:
                target["findings"].append(
                    {
                        "code": "conflicting_footprint_land_pattern",
                        "severity": "error",
                        "message": (
                            "Projects contain different copper land patterns for the same "
                            f"component identity ({subjects})."
                        ),
                    }
                )
            else:
                target["findings"].append(
                    {
                        "code": "footprint_variants_cosmetic",
                        "severity": "warning",
                        "message": (
                            "Projects contain footprints that differ only outside the copper "
                            f"land pattern ({subjects})."
                        ),
                    }
                )
        else:
            target["assets"].append(asset)
        existing_assets.add(identity)
    existing_findings = {(item["code"], item["message"]) for item in target["findings"]}
    for finding in incoming["findings"]:
        if (finding["code"], finding["message"]) not in existing_findings:
            target["findings"].append(finding)


def _bundle_asset_index(
    project_id: str,
    commit: str | None,
    stager: ContentAddressedAssetStager,
    *,
    requested_by: str = "",
) -> ProjectBundleAssetIndex:
    """The bundle's asset index for a revision (``commit=None`` is the checkout's HEAD).

    ``bundle_read`` raises ``DesignDataPending`` while a member builds (it
    queues the job) or ``DesignDataFailed`` when it cannot be built; the import
    session lets the former retry. The legacy directory scanner is gone (R1).
    """
    from app.services.design_bundle import consumer

    read = consumer.bundle_read(
        "CATALOG_IMPORT", project_id, commit, BUNDLE_MEMBER_PATHS, requested_by=requested_by
    )
    return ProjectBundleAssetIndex(read, stager=stager)


def run_project_import_session(session_id: str) -> None:
    session = catalog_service.get_project_import_session(session_id)
    if not session:
        return
    from app.services.design_bundle.errors import DesignDataPending

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
            semantic_index = semantic_index_service.get_index(project, source_revision or None)
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
            asset_index = _bundle_asset_index(
                str(project_id),
                source_revision or None,
                stager,
                requested_by=str(session.get("created_by") or ""),
            )
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
    except DesignDataPending:
        # The bundle is building and was queued by the read. The catalog job
        # retries; the session stays in scanning rather than failing.
        catalog_service.update_project_import_session(session_id, status="scanning")
        raise
    except Exception as exc:
        logger.exception("Project component import session %s failed", session_id)
        catalog_service.update_project_import_session(session_id, status="failed", error_message=str(exc))
