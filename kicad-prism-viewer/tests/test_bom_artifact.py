from __future__ import annotations

import json
import sys
import types
from dataclasses import dataclass

from pipeline.topology_compiler.bom import BOM_SCHEMA, PRIMARY_COLUMNS, build_bom_artifact


@dataclass(frozen=True)
class FakeComponent:
    designator: str
    value: str
    footprint: str
    library_ref: str
    description: str
    sheet: str
    dnp: bool
    parameters: dict[str, str]
    canonical_fields: dict[str, str]
    field_sources: dict[str, str]


@dataclass(frozen=True)
class FakeLine:
    item: int
    quantity: int
    designators: tuple[str, ...]
    dnp: bool
    fields: dict[str, str]


class FakeAliasConfig:
    def __init__(self, canonical_fields=None):
        self.canonical_fields = canonical_fields or {
            "value": ("Value",),
            "footprint": ("Footprint",),
            "description": ("Description",),
            "manufacturer_part_number": ("MPN",),
        }


class FakeManufacturingDesign:
    @classmethod
    def from_file(cls, path):
        return cls()

    def to_bom(self, variant=None):
        return [
            {
                "designator": "R2",
                "value": "10k",
                "footprint": "R_0402",
                "description": "Pull-up",
                "parameters": {"MPN": "RC0402-10K", "Custom Field": "Alpha"},
                "dnp": False,
                "sheet": "/",
                "library_ref": "Device:R",
            },
            {
                "designator": "R1",
                "value": "10k",
                "footprint": "R_0402",
                "description": "Pull-up",
                "parameters": {"MPN": "RC0402-10K", "Custom Field": "Alpha"},
                "dnp": False,
                "sheet": "/",
                "library_ref": "Device:R",
            },
        ]


def fake_normalize_bom_components(rows, aliases):
    components = []
    for row in rows:
        parameters = dict(row["parameters"])
        components.append(
            FakeComponent(
                designator=row["designator"],
                value=row["value"],
                footprint=row["footprint"],
                library_ref=row["library_ref"],
                description=row["description"],
                sheet=row["sheet"],
                dnp=row["dnp"],
                parameters=parameters,
                canonical_fields={
                    "value": row["value"],
                    "footprint": row["footprint"],
                    "description": row["description"],
                    "manufacturer_part_number": parameters["MPN"],
                    "Custom Field": parameters["Custom Field"],
                },
                field_sources={"manufacturer_part_number": "parameter:MPN"},
            )
        )
    return components


def fake_group_bom_components(components, **kwargs):
    return [
        FakeLine(
            item=1,
            quantity=len(components),
            designators=tuple(sorted(component.designator for component in components)),
            dnp=False,
            fields={},
        )
    ]


def fake_designator_sort_key(reference, prefix_order=()):
    return (0, reference)


def install_fake_kicad_cruncher(monkeypatch):
    package = types.ModuleType("kicad_cruncher")
    bom_module = types.ModuleType("kicad_cruncher.bom_pnp_model")
    bom_module.FieldAliasConfig = FakeAliasConfig
    bom_module.normalize_bom_components = fake_normalize_bom_components
    bom_module.group_bom_components = fake_group_bom_components
    bom_module.designator_sort_key = fake_designator_sort_key
    design_module = types.ModuleType("kicad_cruncher.kicad_manufacturing_design")
    design_module.KiCadManufacturingDesign = FakeManufacturingDesign
    monkeypatch.setitem(sys.modules, "kicad_cruncher", package)
    monkeypatch.setitem(sys.modules, "kicad_cruncher.bom_pnp_model", bom_module)
    monkeypatch.setitem(sys.modules, "kicad_cruncher.kicad_manufacturing_design", design_module)


def test_bom_artifact_schema_columns_grouping_and_extra_fields(tmp_path, monkeypatch):
    install_fake_kicad_cruncher(monkeypatch)
    project = tmp_path / "fixture.kicad_pro"
    project.write_text("{}", encoding="utf-8")

    summary = build_bom_artifact(project, tmp_path)
    payload = json.loads((tmp_path / "bom" / "bom.json").read_text(encoding="utf-8"))

    assert summary["schema"] == BOM_SCHEMA
    assert payload["schema"] == BOM_SCHEMA
    assert payload["displayColumns"] == list(PRIMARY_COLUMNS)
    assert payload["rows"][0]["fields"]["Reference"] == "R1, R2"
    assert payload["rows"][0]["fields"]["Qty"] == "2"
    assert payload["rows"][0]["fields"]["Manufacturer Part Number"] == "RC0402-10K"
    assert "Custom Field" in payload["extraColumns"]
    assert payload["componentIndex"]["R1"]["rowId"] == "bom-row-0001"


def test_bom_artifact_accepts_reused_assembly_without_from_file(tmp_path, monkeypatch):
    install_fake_kicad_cruncher(monkeypatch)
    monkeypatch.setattr(FakeManufacturingDesign, "from_file", classmethod(lambda cls, path: (_ for _ in ()).throw(AssertionError("reparse"))))
    project = tmp_path / "fixture.kicad_pro"
    project.write_text("{}", encoding="utf-8")
    timings = {}

    summary = build_bom_artifact(
        project,
        tmp_path,
        raw_components=FakeManufacturingDesign().to_bom(),
        timings=timings,
    )

    assert summary["components"] == 2
    assert "bom_normalize_group_ms" in timings
    assert "bom_design_reuse_ms" not in timings


def test_a_dnp_component_reports_yes_in_its_own_dnp_column(tmp_path, monkeypatch):
    """KiCad writes a DNP part's `dnp` property with no value at all.

    The per-component DNP cell used to be re-derived from that field, which is
    dropped as empty before it ever reaches the column, so every DNP component
    read as populated even though the payload's own boolean was right beside
    it.  The row-level cell was always correct, so the two disagreed.
    """
    install_fake_kicad_cruncher(monkeypatch)
    project = tmp_path / "fixture.kicad_pro"
    project.write_text("{}", encoding="utf-8")

    raw = FakeManufacturingDesign().to_bom()
    raw[0] = {**raw[0], "dnp": True, "parameters": {**raw[0]["parameters"], "dnp": ""}}

    build_bom_artifact(project, tmp_path, raw_components=raw)
    payload = json.loads((tmp_path / "bom" / "bom.json").read_text(encoding="utf-8"))

    by_reference = {component["reference"]: component for component in payload["components"]}

    assert by_reference["R2"]["dnp"] is True
    assert by_reference["R2"]["fields"]["DNP"] == "Yes"
    assert by_reference["R1"]["dnp"] is False
    assert by_reference["R1"]["fields"]["DNP"] == "No"
    assert payload["counts"]["dnpComponents"] == 1
