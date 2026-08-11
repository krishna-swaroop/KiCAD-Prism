from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Mapping

from .vendor_paths import ensure_reference_paths


BOM_SCHEMA = "prism.bom_a0"

PRIMARY_COLUMNS: tuple[str, ...] = (
    "Reference",
    "Qty",
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

DISPLAY_TO_CANONICAL: dict[str, str] = {
    "Value": "value",
    "Description": "description",
    "Datasheet": "datasheet",
    "Manufacturer": "manufacturer",
    "Manufacturer Part Number": "manufacturer_part_number",
    "Vendor": "vendor",
    "Vendor Part Number": "vendor_part_number",
    "Footprint": "footprint",
    "Mass (g)": "mass_g",
    "RQjC (C/W)": "rqjc_c/w",
    "RQjC_top (C/W)": "rqjc_top_c/w",
    "Temp_max (C)": "temp_max_c",
    "Temp_min (C)": "temp_min_c",
    "Power Dissipation (W)": "power_dissipation_w",
    "Rate": "rate",
}

PRISM_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "manufacturer": (
        "Manufacturer",
        "Mfr",
        "MFG",
        "Manufacturer Name",
        "Manufacturer_Name",
        "Mfr Name",
    ),
    "manufacturer_part_number": (
        "Manufacturer Part Number",
        "Manufacturer_Part_Number",
        "MPN",
        "Mfr Part Number",
        "Mfr_Part_Number",
        "Mfr PN",
        "MFG PN",
        "Part Number",
    ),
    "datasheet": ("Datasheet", "Data Sheet", "DataSheet", "URL", "Document"),
    "vendor": ("Vendor", "Vendor Name", "Vendor_Name", "Supplier", "Distributor", "Source"),
    "vendor_part_number": (
        "Vendor Part Number",
        "Vendor_Part_Number",
        "Vendor PN",
        "Vendor_PN",
        "VPN",
        "Supplier Part Number",
        "Supplier_Part_Number",
        "Supplier PN",
        "Distributor Part Number",
        "DigiKey Part Number",
        "Digi-Key Part Number",
        "Mouser Part Number",
    ),
    "mass_g": ("Mass (g)", "Mass", "Weight (g)", "Weight"),
    "rqjc_c/w": (
        "RQjC (C/W)",
        "RθJC",
        "RthJC",
        "Theta JC",
        "Thermal Resistance Junction-to-Case",
    ),
    "rqjc_top_c/w": (
        "RQjC_top (C/W)",
        "RθJC_top",
        "RthJC_top",
        "Theta JC Top",
    ),
    "temp_max_c": (
        "Temp_max (C)",
        "Temp Max",
        "Tmax",
        "Operating Temperature Max",
    ),
    "temp_min_c": (
        "Temp_min (C)",
        "Temp Min",
        "Tmin",
        "Operating Temperature Min",
    ),
    "power_dissipation_w": (
        "Power Dissipation (W)",
        "Power Dissipation",
        "Power",
        "Pd",
        "Ptot",
    ),
    "rate": ("Rate", "Rating", "Voltage Rating", "Current Rating"),
}


def build_bom_artifact(
    project_file: Path,
    output_dir: Path,
    *,
    variant: str | None = None,
    manufacturing_design: Any | None = None,
    raw_components: list[dict[str, object]] | None = None,
    timings: dict[str, float] | None = None,
    progress=None,
) -> dict[str, object]:
    """Compile a Prism BOM artifact using kicad_cruncher as the semantic source."""
    _ensure_reference_paths()
    from kicad_cruncher.bom_pnp_model import (  # type: ignore
        FieldAliasConfig,
        designator_sort_key,
        group_bom_components,
        normalize_bom_components,
    )
    from kicad_cruncher.kicad_manufacturing_design import (  # type: ignore
        KiCadManufacturingDesign,
    )

    def log(message: str) -> None:
        if progress:
            progress(message)

    if raw_components is None:
        if manufacturing_design is None:
            log("BOM: load manufacturing design with kicad_cruncher")
            started = time.perf_counter()
            manufacturing_design = KiCadManufacturingDesign.from_file(project_file)
            if timings is not None:
                timings["bom_design_reuse_ms"] = timings.get("bom_design_reuse_ms", 0.0) + _elapsed_ms(started)
        started = time.perf_counter()
        raw_components = manufacturing_design.to_bom(variant)
        if timings is not None:
            timings["bom_assembly_ms"] = timings.get("bom_assembly_ms", 0.0) + _elapsed_ms(started)
    aliases = FieldAliasConfig(_alias_mapping(FieldAliasConfig()))
    started = time.perf_counter()
    normalized = normalize_bom_components(raw_components, aliases)
    grouped = group_bom_components(
        normalized,
        group_fields=("manufacturer", "manufacturer_part_number", "value", "footprint"),
        split_dnp=True,
    )
    if timings is not None:
        timings["bom_normalize_group_ms"] = timings.get("bom_normalize_group_ms", 0.0) + _elapsed_ms(started)

    component_by_ref = {component.designator: component for component in normalized}
    row_ids_by_ref: dict[str, str] = {}
    rows = []
    for line in grouped:
        row_id = f"bom-row-{line.item:04d}"
        for designator in line.designators:
            row_ids_by_ref[designator] = row_id
        rows.append(_row_payload(row_id, line, component_by_ref))

    components = [
        _component_payload(component, row_ids_by_ref.get(component.designator, ""))
        for component in sorted(normalized, key=lambda item: designator_sort_key(item.designator))
    ]
    extra_columns = _extra_columns(components)
    component_index = {
        component["reference"]: {
            "componentId": component["id"],
            "rowId": component["rowId"],
        }
        for component in components
    }
    payload = {
        "schema": BOM_SCHEMA,
        "source": {
            "project": str(project_file),
            "variant": variant,
            "generator": "kicad_cruncher",
            "sourceTimestamp": _source_timestamp(project_file),
            "inputHash": _input_hash(project_file),
        },
        "displayColumns": list(PRIMARY_COLUMNS),
        "extraColumns": extra_columns,
        "components": components,
        "rows": rows,
        "componentIndex": component_index,
        "counts": {
            "components": len(components),
            "rows": len(rows),
            "dnpComponents": sum(1 for component in components if component["dnp"]),
        },
    }

    bom_dir = output_dir / "bom"
    bom_dir.mkdir(parents=True, exist_ok=True)
    bom_path = bom_dir / "bom.json"
    bom_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    log(f"BOM: wrote {len(rows)} grouped rows, {len(components)} components")
    return {
        "schema": BOM_SCHEMA,
        "path": "bom/bom.json",
        "rows": len(rows),
        "components": len(components),
        "displayColumns": list(PRIMARY_COLUMNS),
        "extraColumns": extra_columns,
    }


def _ensure_reference_paths() -> None:
    ensure_reference_paths()


def _alias_mapping(default_aliases) -> dict[str, tuple[str, ...]]:
    mapping = dict(default_aliases.canonical_fields)
    for name, aliases in PRISM_FIELD_ALIASES.items():
        existing = mapping.get(name, ())
        mapping[name] = tuple(dict.fromkeys((*existing, *aliases)))
    return mapping


def _row_payload(row_id: str, line, component_by_ref: Mapping[str, object]) -> dict[str, object]:
    designators = list(line.designators)
    source_components = [component_by_ref[designator] for designator in designators if designator in component_by_ref]
    fields = _merged_fields(source_components)
    row_fields = {
        column: _column_value(
            column, fields, dnp=bool(line.dnp), line=line, designators=designators
        )
        for column in PRIMARY_COLUMNS
    }
    return {
        "id": row_id,
        "item": line.item,
        "qty": line.quantity,
        "references": designators,
        "componentIds": [f"cmp-{designator}" for designator in designators],
        "dnp": bool(line.dnp),
        "fields": row_fields,
        "canonicalFields": fields,
    }


def _component_payload(component, row_id: str) -> dict[str, object]:
    fields = _component_fields(component)
    return {
        "id": f"cmp-{component.designator}",
        "reference": component.designator,
        "rowId": row_id,
        "dnp": bool(component.dnp),
        "sheet": component.sheet,
        "libraryRef": component.library_ref,
        "fields": {
            column: _column_value(
                column,
                fields,
                dnp=bool(component.dnp),
                designators=[component.designator],
            )
            for column in PRIMARY_COLUMNS
        },
        "canonicalFields": fields,
        "parameters": dict(sorted(component.parameters.items())),
        "fieldSources": dict(sorted(component.field_sources.items())),
    }


def _component_fields(component) -> dict[str, str]:
    fields = dict(component.canonical_fields)
    fields.setdefault("value", component.value)
    fields.setdefault("footprint", component.footprint)
    fields.setdefault("description", component.description)
    for name, value in component.parameters.items():
        fields.setdefault(name, value)
    return {name: value for name, value in sorted(fields.items()) if value}


def _merged_fields(components: list[object]) -> dict[str, str]:
    if not components:
        return {}
    keys = sorted({key for component in components for key in _component_fields(component)})
    merged: dict[str, str] = {}
    for key in keys:
        values = [value for component in components if (value := _component_fields(component).get(key))]
        unique = list(dict.fromkeys(values))
        if not unique:
            continue
        merged[key] = unique[0] if len(unique) == 1 else " | ".join(unique)
    return merged


def _column_value(
    column: str,
    fields: Mapping[str, str],
    *,
    dnp: bool,
    line=None,
    designators: list[str] | None = None,
) -> str:
    if column == "Reference":
        return ", ".join(designators or [])
    if column == "Qty":
        return str(line.quantity if line is not None else 1)
    if column == "DNP":
        # The resolved flag, never the raw field.  KiCad writes a DNP part's
        # `dnp` property with no value at all, and `_component_fields` drops
        # empty values, so reading the field reported every DNP component as
        # populated.
        return "Yes" if dnp else "No"
    key = DISPLAY_TO_CANONICAL.get(column, column)
    return str(fields.get(key, ""))


def _extra_columns(components: list[dict[str, object]]) -> list[str]:
    seen = set()
    for component in components:
        fields = component.get("canonicalFields", {})
        if isinstance(fields, Mapping):
            seen.update(str(name) for name in fields)
        parameters = component.get("parameters", {})
        if isinstance(parameters, Mapping):
            seen.update(str(name) for name in parameters)
    primary_keys = set(DISPLAY_TO_CANONICAL.values())
    primary_keys.update({"reference", "qty", "dnp"})
    primary_labels = {name.casefold() for name in PRIMARY_COLUMNS}
    primary_labels.update(key.casefold() for key in primary_keys)
    for aliases in PRISM_FIELD_ALIASES.values():
        primary_labels.update(alias.casefold() for alias in aliases)
    return sorted(
        (
            name
            for name in seen
            if name not in primary_keys
            and name.casefold() not in primary_labels
        ),
        key=str.casefold,
    )


def _input_hash(project_file: Path) -> str:
    digest = hashlib.sha256()
    digest.update(str(project_file.resolve()).encode("utf-8"))
    for suffix in (".kicad_pro", ".kicad_sch", ".kicad_pcb"):
        candidate = project_file.with_suffix(suffix)
        if candidate.exists():
            digest.update(candidate.name.encode("utf-8"))
            digest.update(candidate.read_bytes())
    return digest.hexdigest()[:16]


def _source_timestamp(project_file: Path) -> str:
    newest = 0.0
    for suffix in (".kicad_pro", ".kicad_sch", ".kicad_pcb"):
        candidate = project_file.with_suffix(suffix)
        if candidate.exists():
            newest = max(newest, candidate.stat().st_mtime)
    return str(int(newest or project_file.stat().st_mtime))


def _elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0
