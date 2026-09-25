"""Variant default/overlay resolution tests (VAR-09).

The fixture directories under ``tests/fixtures/design_variants`` are parsed by
the pinned kicad-monkey and resolved by ``semantic_index_variants``; every map
and diagnostic is compared against the fixture's hand-computed expectation.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from types import SimpleNamespace

from kicad_monkey import KiCadDesign

from app.services import semantic_index_variants, variant_catalog_service
from app.services.kicad_monkey_design_adapter import KiCadMonkeyDesign

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "design_variants"

CATALOG_CODES = {
    variant_catalog_service.CASE_MISMATCH_CODE,
    variant_catalog_service.SOURCE_UNPARSEABLE_CODE,
}
# Keys the fixture expectations pin for builder diagnostics. The packet's
# `severity`/`message` are asserted to exist but not compared verbatim.
DIAGNOSTIC_KEYS = (
    "code",
    "variant",
    "reference",
    "path",
    "detail",
    "footprintUuids",
)

FIXTURES = (
    "no_variants",
    "oracle",
    "pcb_only",
    "sch_only",
    "legacy_in_bom",
    "rule_area",
    "kicad11_tokens",
    "oracle_rev2",
    "case_fold",
)


def expectation(name: str) -> dict:
    return json.loads(
        (FIXTURE_ROOT / "expected" / f"{name}.json").read_text(encoding="utf-8")
    )


def fixture_project(directory: str, anchor: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"prj_{directory}",
        path=str(FIXTURE_ROOT / directory),
        project_file=anchor,
    )


def load_state(directory: str, anchor: str) -> dict:
    project = fixture_project(directory, anchor)
    catalog = variant_catalog_service.discover_variant_catalog(project)["variants"]
    design = KiCadMonkeyDesign(
        KiCadDesign.from_file(FIXTURE_ROOT / directory / anchor)
    )
    return semantic_index_variants.build_assembly_state(
        design,
        project_file=FIXTURE_ROOT / directory / anchor,
        catalog=catalog,
    )


def builder_diagnostics(payload: dict) -> list[dict]:
    return [d for d in payload["diagnostics"] if d["code"] not in CATALOG_CODES]


def diagnostic_projection(diagnostic: dict, *, require_meta: bool = False) -> dict:
    projected = {
        key: diagnostic[key] for key in DIAGNOSTIC_KEYS if key in diagnostic
    }
    if require_meta and ("severity" not in diagnostic or "message" not in diagnostic):
        raise AssertionError(f"diagnostic lacks severity/message: {diagnostic}")
    return projected


def physical_from_state(
    state: dict, identity: dict, variant_name: str | None
) -> dict[str, str]:
    """Packet-2.6 classification derived from the builder's own maps.

    A reference is classified when it has board footprints or appears in some
    assembly map: the fixtures leave references that carry neither (no
    footprint, no effective flag, no override) out of ``physical`` entirely.
    """

    default = state["default"]["footprints"]
    variant = next(
        (entry for entry in state["variants"] if entry["name"] == variant_name),
        None,
    )
    occurrences = identity.get("occurrences") or {}
    footprints = identity.get("footprints") or {}

    def occurrence_reference(occurrence_id: str) -> str:
        return occurrences.get(occurrence_id, {}).get("reference", "")

    references: set[str] = {
        meta["reference"] for meta in footprints.values()
    }
    for entry in state["default"]["occurrences"]:
        references.add(occurrence_reference(entry))
    for entry in state["default"]["components"]:
        references.add(entry)
    for variant_entry in state["variants"]:
        for entry in variant_entry["components"]:
            references.add(entry)
        for entry in variant_entry["occurrences"]:
            references.add(occurrence_reference(entry))
        for uuid in variant_entry["footprints"]:
            if uuid in footprints:
                references.add(footprints[uuid]["reference"])
    references.discard("")

    by_reference: dict[str, list[tuple[str, bool]]] = {}
    for uuid, meta in footprints.items():
        dnp = bool(default.get(uuid, {}).get("dnp", False))
        if variant is not None and "dnp" in variant["footprints"].get(uuid, {}):
            dnp = bool(variant["footprints"][uuid]["dnp"])
        by_reference.setdefault(meta["reference"], []).append((uuid, dnp))

    return semantic_index_variants.physical_visibility(
        {
            reference: by_reference.get(reference, [])
            for reference in references
        }
    )


def design_snapshot(design: KiCadMonkeyDesign) -> list[str]:
    native = design.native
    lines: list[str] = []
    for instance in native.schematic_instances():
        for symbol in instance.schematic.symbols:
            lines.append(f"symbol:{symbol.uuid}")
            for symbol_instance in symbol.instances:
                for record in symbol_instance.variants:
                    lines.append(
                        f"  {symbol_instance.path}:{record.name}:{record.dnp}:"
                        f"{record.in_bom}:{record.exclude_from_sim}:{sorted(record.fields)}"
                    )
    pcb = native.pcb
    if pcb is not None:
        for footprint in pcb.footprints:
            lines.append(f"footprint:{footprint.uuid}")
            for record in footprint.variants:
                lines.append(
                    f"  {record.name}:{record.dnp}:{record.exclude_from_bom}:"
                    f"{record.exclude_from_pos_files}:"
                    f"{[(item.name, item.value) for item in record.fields]}"
                )
    return lines


class FixtureAssemblyTests(unittest.TestCase):
    """Every fixture's expectation is the answer for its own directory."""

    def test_catalog_is_carried_through(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                state = load_state(name, expected["project"])
                self.assertEqual(state["catalog"], expected["catalog"], name)
                self.assertEqual(
                    [entry["name"] for entry in state["variants"]],
                    [entry["name"] for entry in expected["catalog"]],
                    name,
                )

    def test_default_maps_match_the_expectation(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)["default"]
                state = load_state(name, expectation(name)["project"])["default"]
                self.assertEqual(state["occurrences"], expected["occurrences"], name)
                self.assertEqual(state["components"], expected["components"], name)
                self.assertEqual(state["footprints"], expected["footprints"], name)

    def test_variant_maps_match_the_expectation(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                state = load_state(name, expected["project"])
                self.assertEqual(
                    [entry["name"] for entry in state["variants"]],
                    [entry["name"] for entry in expected["variants"]],
                    name,
                )
                for expected_variant in expected["variants"]:
                    actual = next(
                        entry
                        for entry in state["variants"]
                        if entry["name"] == expected_variant["name"]
                    )
                    for key in ("occurrences", "components", "footprints"):
                        self.assertEqual(
                            actual[key],
                            expected_variant[key],
                            f"{name}/{expected_variant['name']}/{key}",
                        )

    def test_physical_classification_matches_the_expectation(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                state = load_state(name, expected["project"])
                self.assertEqual(
                    physical_from_state(state, expected["identity"], None),
                    expected["default"]["physical"],
                    f"{name}/default",
                )
                for expected_variant in expected["variants"]:
                    self.assertEqual(
                        physical_from_state(
                            state, expected["identity"], expected_variant["name"]
                        ),
                        expected_variant["physical"],
                        f"{name}/{expected_variant['name']}",
                    )

    def test_builder_diagnostics_match_the_expectation(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = [
                    d
                    for d in expectation(name).get("diagnostics", [])
                    if d["code"] not in CATALOG_CODES
                ]
                state = load_state(name, expectation(name)["project"])
                self.assertEqual(
                    [
                        diagnostic_projection(d, require_meta=True)
                        for d in builder_diagnostics(state)
                    ],
                    [diagnostic_projection(d) for d in expected],
                    name,
                )

    def test_resolution_never_mutates_the_parsed_design(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                anchor = expectation(name)["project"]
                design = KiCadMonkeyDesign(
                    KiCadDesign.from_file(FIXTURE_ROOT / name / anchor)
                )
                catalog = variant_catalog_service.discover_variant_catalog(
                    fixture_project(name, anchor)
                )["variants"]
                before = design_snapshot(design)
                semantic_index_variants.build_assembly_state(
                    design,
                    project_file=FIXTURE_ROOT / name / anchor,
                    catalog=catalog,
                )
                self.assertEqual(design_snapshot(design), before, name)


class PhysicalVisibilityTests(unittest.TestCase):
    def test_all_four_classes(self) -> None:
        visibility = semantic_index_variants.physical_visibility(
            {
                "absent": [],
                "visible": [("u1", False)],
                "hidden": [("u2", True)],
                "ambiguous": [("u3", False), ("u4", True)],
            }
        )
        self.assertEqual(
            visibility,
            {
                "absent": "absent",
                "visible": "visible",
                "hidden": "hidden",
                "ambiguous": "ambiguous",
            },
        )

    def test_two_populated_alternates_stay_ambiguous(self) -> None:
        visibility = semantic_index_variants.physical_visibility(
            {"Q1": [("u1", False), ("u2", False)]}
        )
        self.assertEqual(visibility["Q1"], "ambiguous")


class UnchangedVariantTests(unittest.TestCase):
    def test_a_variant_with_no_records_emits_empty_overrides(self) -> None:
        state = load_state("oracle", "variants_oracle.kicad_pro")
        unused = next(
            entry for entry in state["variants"] if entry["name"] == "Unused"
        )
        self.assertEqual(unused["occurrences"], {})
        self.assertEqual(unused["components"], {})
        self.assertEqual(unused["footprints"], {})

    def test_an_unknown_name_is_not_in_the_builder_output(self) -> None:
        state = load_state("oracle", "variants_oracle.kicad_pro")
        self.assertNotIn(
            "Nope", [entry["name"] for entry in state["variants"]]
        )


if __name__ == "__main__":
    unittest.main()
