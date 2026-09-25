"""Consistency checks for the design-variant oracle fixtures (VAR-01).

These tests do not exercise any Prism code.  They pin three things so the
resolver tickets (VAR-04/06/09/10/11) can rely on the fixture set:

1. every fixture, expectation and evidence file still matches the SHA-256
   recorded in ``manifest.json`` (the evidence was produced by the KiCad
   executable named there and is not reproducible without it);
2. the expectation files load and follow the wire vocabulary frozen in the
   contract packet (key sets, differential encoding, physical classes);
3. the expectations agree with the committed native evidence wherever KiCad
   10.0.6 can observe the value: XML netlist ``<variants>`` blocks, BOM CSVs,
   position files, IPC-2581 BOM extracts and GLB node lists.  Values that no
   export observes are listed under ``evidence.source-derived`` in the
   expectation file and are skipped here on purpose.
"""

from __future__ import annotations

import csv
import hashlib
import json
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "fixtures" / "design_variants"
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

FLAGS = ("dnp", "excludeFromBom", "excludeFromBoard", "excludeFromSim", "excludeFromPosFiles")
FOOTPRINT_FLAGS = ("dnp", "excludeFromBom", "excludeFromPosFiles")
PHYSICAL = {"visible", "hidden", "ambiguous", "absent"}
NETLIST_PROPERTY = {
    "dnp": "dnp",
    "exclude_from_bom": "excludeFromBom",
    "exclude_from_sim": "excludeFromSim",
    "exclude_from_pos_files": "excludeFromPosFiles",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expectation(name: str) -> dict:
    return json.loads((ROOT / "expected" / f"{name}.json").read_text(encoding="utf-8"))


def evidence(name: str, file: str) -> Path:
    return ROOT / "evidence" / name / file


def netlist_components(path: Path) -> dict[str, dict]:
    """``ref -> {properties: {name: value|None}, variants: {name: (props, fields)}}``."""
    result: dict[str, dict] = {}
    for comp in ET.parse(path).getroot().iter("comp"):
        variants = {}
        for variant in comp.iter("variant"):
            variants[variant.get("name")] = (
                {p.get("name"): p.get("value") for p in variant.findall("property")},
                {f.get("name"): (f.text or "") for f in variant.iter("field")},
            )
        result[comp.get("ref")] = {
            "properties": {p.get("name"): p.get("value") for p in comp.findall("property")},
            "variants": variants,
        }
    return result


def pos_rows(path: Path) -> dict[tuple[str, str], str]:
    """``(reference, package) -> value``."""
    with path.open(encoding="utf-8", newline="") as handle:
        return {(row["Ref"], row["Package"]): row["Val"] for row in csv.DictReader(handle)}


def bom_rows(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return {row["Reference"]: row for row in csv.DictReader(handle)}


def evidence_for(name: str, subcommand: str, variant: str | None, *flags: str) -> Path:
    """Locate the output the manifest recorded for one kicad-cli invocation.

    ``subcommand`` is e.g. ``"pos"``; ``variant`` ``None`` means no
    ``--variant`` argument; ``flags`` must all be present (``--exclude-dnp``).
    """
    for command in MANIFEST["fixtures"][name]["commands"]:
        argv = command["argv"]
        if argv[3] != subcommand or not command.get("output"):
            continue
        given = argv[argv.index("--variant") + 1] if "--variant" in argv else None
        if given != variant:
            continue
        if all(flag in argv for flag in flags) and not any(
            flag in argv for flag in ("--exclude-dnp", "--include-excluded-from-bom") if flag not in flags
        ):
            return ROOT / command["output"]
    raise AssertionError(f"no recorded output for {name} {subcommand} variant={variant!r} flags={flags}")


def effective_flag(expected: dict, variant: dict, kind: str, key: str, flag: str) -> bool:
    """Effective value under ``variant`` from the differential maps (packet 2.7)."""
    default = expected["default"][kind].get(key, {}).get(flag, False)
    return variant[kind].get(key, {}).get(flag, default)


class ManifestIntegrityTests(unittest.TestCase):
    def test_kicad_version_is_the_oracle_version(self):
        self.assertEqual(MANIFEST["kicad"]["version"], "10.0.6")
        self.assertIn("Version: 10.0.6", MANIFEST["kicad"]["about"])
        self.assertEqual(MANIFEST["contract"], {"packet": "CONTRACT_PACKET_v1.md", "version": "1.0"})

    def test_every_recorded_file_matches_its_hash(self):
        recorded: dict[str, str] = dict(MANIFEST["expected"])
        for fixture in MANIFEST["fixtures"].values():
            recorded.update(fixture["files"])
            for command in fixture["commands"]:
                if command.get("output"):
                    recorded[command["output"]] = command["sha256"]
        self.assertTrue(recorded)
        for relative, digest in recorded.items():
            with self.subTest(file=relative):
                self.assertEqual(sha256(ROOT / relative), digest)

    def test_no_unrecorded_files(self):
        recorded = set(MANIFEST["expected"])
        for fixture in MANIFEST["fixtures"].values():
            recorded.update(fixture["files"])
            recorded.update(c["output"] for c in fixture["commands"] if c.get("output"))
        on_disk = {
            str(p.relative_to(ROOT))
            for p in ROOT.rglob("*")
            if p.is_file() and p.name not in {"manifest.json", "README.md"}
        }
        self.assertEqual(on_disk - recorded, set())

    def test_native_refusals_are_recorded_for_kicad11_and_malformed_sources(self):
        # KiCad 10.0.6 must not load KiCad 11 tokens (packet N22) nor the unbalanced schematic.
        k11 = MANIFEST["fixtures"]["kicad11_tokens"]["commands"]
        self.assertTrue(k11)
        self.assertTrue(all(c["exitCode"] != 0 for c in k11))
        broken = MANIFEST["fixtures"]["malformed"]["commands"]
        sch = [c for c in broken if c["argv"][1] == "sch"]
        pcb = [c for c in broken if c["argv"][1] == "pcb"]
        self.assertTrue(sch and all(c["exitCode"] != 0 for c in sch))
        self.assertTrue(pcb and all(c["exitCode"] == 0 for c in pcb))


class ExpectationShapeTests(unittest.TestCase):
    NAMES = sorted(p.stem for p in (ROOT / "expected").glob("*.json"))

    def test_all_fixture_directories_have_expectations(self):
        self.assertEqual(sorted(MANIFEST["fixtures"]), self.NAMES)

    def test_vocabulary(self):
        for name in self.NAMES:
            expected = expectation(name)
            with self.subTest(fixture=name):
                self.assertEqual(expected["schema"], "prism.variant_fixture_expectations_a0")
                self.assertEqual(expected["contract"]["version"], "1.0")
                names = [entry["name"] for entry in expected["catalog"]]
                self.assertEqual(len(names), len(set(names)), "catalog names are exact-unique")
                for entry in expected["catalog"]:
                    self.assertEqual(set(entry), {"name", "description", "sources"})
                    self.assertTrue(set(entry["sources"]) <= {"project", "pcb", "schematic", "footprint"})
                    self.assertTrue(entry["sources"])
                default = expected["default"]
                for occurrence in default["occurrences"].values():
                    self.assertTrue({"reference"} <= set(occurrence) <= {"reference", *FLAGS})
                    self.assertTrue(all(occurrence[f] is True for f in FLAGS if f in occurrence))
                for component in default["components"].values():
                    self.assertTrue(set(component) <= set(FLAGS))
                    self.assertTrue(all(v is True for v in component.values()))
                for footprint in default["footprints"].values():
                    self.assertTrue({"reference"} <= set(footprint) <= {"reference", *FOOTPRINT_FLAGS})
                self.assertEqual([v["name"] for v in expected["variants"]], names)
                for variant in expected["variants"]:
                    for override in variant["occurrences"].values():
                        self.assertTrue(set(override) <= {*FLAGS, "fields"})
                    for override in variant["components"].values():
                        self.assertTrue(set(override) <= {*FLAGS, "fields"})
                    for override in variant["footprints"].values():
                        self.assertTrue(set(override) <= {*FOOTPRINT_FLAGS, "fields"})
                    self.assertTrue(set(variant["physical"].values()) <= PHYSICAL)
                    self.assertEqual(set(variant["physical"]), set(default["physical"]))

    def test_variant_maps_are_differential_against_default(self):
        for name in self.NAMES:
            expected = expectation(name)
            for variant in expected["variants"]:
                for kind in ("occurrences", "components", "footprints"):
                    for key, override in variant[kind].items():
                        for flag, value in override.items():
                            if flag == "fields":
                                continue
                            with self.subTest(fixture=name, variant=variant["name"], key=key, flag=flag):
                                self.assertNotEqual(
                                    value, expected["default"][kind].get(key, {}).get(flag, False),
                                    "an override equal to the effective default must be omitted",
                                )


class NativeAgreementTests(unittest.TestCase):
    """Every value KiCad 10.0.6 can observe must match the expectation."""

    def assert_schematic_matches_netlist(self, name: str) -> None:
        expected = expectation(name)
        comps = netlist_components(evidence(name, "netlist_default.xml"))
        identity = expected["identity"]["occurrences"]
        variant_names = {v["name"] for v in expected["variants"]}
        for reference, comp in comps.items():
            # Base flags: the XML carries a valueless property when the effective default is true.
            for xml_name, flag in NETLIST_PROPERTY.items():
                if flag == "excludeFromPosFiles":
                    continue  # not sheet-folded natively either; covered per variant below
                with self.subTest(fixture=name, reference=reference, flag=flag, variant=None):
                    self.assertEqual(
                        xml_name in comp["properties"],
                        expected["default"]["components"].get(reference, {}).get(flag, False),
                    )
            for variant_name, (props, fields) in comp["variants"].items():
                self.assertIn(variant_name, variant_names, "netlist names a variant missing from the catalog")
                variant = next(v for v in expected["variants"] if v["name"] == variant_name)
                for xml_name, value in props.items():
                    flag = NETLIST_PROPERTY[xml_name]
                    with self.subTest(fixture=name, reference=reference, flag=flag, variant=variant_name):
                        self.assertEqual(value == "1", effective_flag(expected, variant, "components", reference, flag))
                for field, value in fields.items():
                    with self.subTest(fixture=name, reference=reference, field=field, variant=variant_name):
                        self.assertEqual(value, variant["components"][reference]["fields"][field])
        # Every expected schematic difference must be visible natively, unless declared source-derived.
        derived = "\n".join(expected.get("evidence", {}).get("source-derived", []))
        for variant in expected["variants"]:
            for reference, override in variant["components"].items():
                props, fields = comps.get(reference, {"variants": {}})["variants"].get(variant["name"], ({}, {}))
                for flag, value in override.items():
                    if flag == "fields":
                        for field, text in value.items():
                            with self.subTest(fixture=name, reference=reference, field=field, variant=variant["name"]):
                                self.assertEqual(fields.get(field), text)
                        continue
                    if flag == "excludeFromBoard":
                        self.assertIn("excludeFromBoard", derived)
                        continue
                    xml_name = next(k for k, v in NETLIST_PROPERTY.items() if v == flag)
                    with self.subTest(fixture=name, reference=reference, flag=flag, variant=variant["name"]):
                        self.assertEqual(props.get(xml_name), "1" if value else "0")
        # Occurrence identities point at symbols the netlist knows (non-virtual references only).
        for occurrence in identity.values():
            if occurrence["reference"].startswith("#"):
                continue
            self.assertIn(occurrence["reference"], comps)

    def assert_bom_csv_matches(self, name: str) -> None:
        expected = expectation(name)
        disagreements = {
            (d["file"], d["reference"], d["column"]): d
            for d in expected.get("evidence", {}).get("knownDisagreements", [])
        }
        column = {"dnp": "DNP", "excludeFromBom": "ExcludeFromBOM", "excludeFromSim": "ExcludeFromSim",
                  "excludeFromBoard": "ExcludeFromBoard"}
        for variant in [None, *expected["variants"]]:
            stem = "default" if variant is None else variant["name"]
            path = evidence_for(name, "bom", None if variant is None else variant["name"], "--include-excluded-from-bom")
            file = str(path.relative_to(ROOT / "evidence" / name))
            rows = bom_rows(path)
            for reference, row in rows.items():
                for flag, header in column.items():
                    if variant is None:
                        value = expected["default"]["components"].get(reference, {}).get(flag, False)
                    else:
                        value = effective_flag(expected, variant, "components", reference, flag)
                    key = (f"evidence/{name}/{file}", reference, header)
                    if key in disagreements:
                        with self.subTest(fixture=name, file=file, reference=reference, column=header):
                            self.assertEqual(row[header], disagreements[key]["native"])
                        continue
                    with self.subTest(fixture=name, file=file, reference=reference, column=header):
                        self.assertEqual(bool(row[header]), value)
                if variant is not None:
                    fields = variant["components"].get(reference, {}).get("fields", {})
                    for field, text in fields.items():
                        if field in row:
                            with self.subTest(fixture=name, file=file, reference=reference, field=field):
                                self.assertEqual(row[field], text)
            # --exclude-dnp drops exactly the effective-DNP rows; excluded-from-BOM rows disappear
            # without --include-excluded-from-bom (packet D1 keeps them apart).
            populated = bom_rows(evidence_for(name, "bom", None if variant is None else variant["name"], "--exclude-dnp"))
            for reference in rows:
                dnp = expected["default"]["components"].get(reference, {}).get("dnp", False) if variant is None \
                    else effective_flag(expected, variant, "components", reference, "dnp")
                excluded = expected["default"]["components"].get(reference, {}).get("excludeFromBom", False) if variant is None \
                    else effective_flag(expected, variant, "components", reference, "excludeFromBom")
                key = (f"evidence/{name}/{file}", reference, "DNP")
                if key in disagreements:
                    continue
                with self.subTest(fixture=name, file=file, reference=reference, populated=True):
                    self.assertEqual(reference in populated, not dnp and not excluded)

    def assert_board_matches(self, name: str) -> None:
        expected = expectation(name)
        footprints = expected["identity"]["footprints"]
        by_key = {(meta["reference"], meta["package"]): uuid for uuid, meta in footprints.items()}
        header_names = {entry["name"].lower() for entry in expected["catalog"] if "pcb" in entry["sources"]}
        for variant in [None, *expected["variants"]]:
            stem = "default" if variant is None else variant["name"]
            all_rows = pos_rows(evidence_for(name, "pos", None if variant is None else variant["name"]))
            populated = pos_rows(evidence_for(name, "pos", None if variant is None else variant["name"], "--exclude-dnp"))

            def flag(uuid: str, which: str, variant=variant) -> bool:
                if variant is None:
                    return expected["default"]["footprints"].get(uuid, {}).get(which, False)
                return effective_flag(expected, variant, "footprints", uuid, which)

            # Exports that select the variant on the BOARD (glb, ipc2581) silently fall back to
            # the default when the name is not in the board's (variants …) header (packet N18);
            # the position exporter resolves per footprint record and honours any name.
            in_header = variant is None or variant["name"].lower() in header_names

            def board_flag(uuid: str, which: str) -> bool:
                return flag(uuid, which, variant if in_header else None)

            for key, uuid in by_key.items():
                with self.subTest(fixture=name, variant=stem, footprint=key):
                    self.assertEqual(key not in all_rows, flag(uuid, "excludeFromPosFiles"))
                    if key in all_rows:
                        self.assertEqual(key not in populated, flag(uuid, "dnp"))
                        if variant is not None:
                            value = variant["footprints"].get(uuid, {}).get("fields", {}).get("Value")
                            if value is not None:
                                self.assertEqual(all_rows[key], value)
            self.assertEqual(set(all_rows) - set(by_key), set(), "position file lists an unknown footprint")

            # IPC-2581: populate = !dnp && !excludeFromBom per RefDes; the BomItem category is decided
            # by the first footprint of a grouped item, so it is only checked for single-RefDes items.
            bom = json.loads(evidence_for(name, "ipc2581", None if variant is None else variant["name"]).read_text(encoding="utf-8"))["bom"]
            seen = {}
            for item in bom:
                for refdes in item["refDes"]:
                    seen[(refdes["name"].split("_")[0], refdes["packageRef"])] = (
                        refdes["populate"] == "true", item["category"], len(item["refDes"]))
            for key, uuid in by_key.items():
                with self.subTest(fixture=name, variant=stem, footprint=key, export="ipc2581"):
                    self.assertIn(key, seen)
                    populate, category, group_size = seen[key]
                    self.assertEqual(populate, not board_flag(uuid, "dnp") and not board_flag(uuid, "excludeFromBom"))
                    if group_size == 1:
                        self.assertEqual(category == "ELECTRICAL", not board_flag(uuid, "excludeFromBom"))

            # GLB with --no-dnp: a reference node exists iff at least one of its footprints is populated.
            nodes = set(json.loads(evidence_for(name, "glb", None if variant is None else variant["name"]).read_text(encoding="utf-8"))["nodes"])
            references = {meta["reference"] for meta in footprints.values()}
            for reference in references:
                any_populated = any(not board_flag(uuid, "dnp") for uuid, meta in footprints.items() if meta["reference"] == reference)
                with self.subTest(fixture=name, variant=stem, reference=reference, export="glb"):
                    self.assertEqual(reference in nodes, any_populated)
            # Physical classification (packet 2.6) is Prism's rule; check it is consistent with the flags.
            physical = expected["default"]["physical"] if variant is None else variant["physical"]
            for reference, cls in physical.items():
                group = [uuid for uuid, meta in footprints.items() if meta["reference"] == reference]
                with self.subTest(fixture=name, variant=stem, reference=reference, export="physical"):
                    if not group:
                        self.assertEqual(cls, "absent")
                    elif len(group) > 1:
                        self.assertEqual(cls, "ambiguous")
                    else:
                        self.assertEqual(cls, "hidden" if flag(group[0], "dnp") else "visible")

    def test_oracle_schematic(self):
        self.assert_schematic_matches_netlist("oracle")
        self.assert_bom_csv_matches("oracle")

    def test_oracle_board(self):
        self.assert_board_matches("oracle")

    def test_oracle_rev2(self):
        self.assert_schematic_matches_netlist("oracle_rev2")
        self.assert_bom_csv_matches("oracle_rev2")
        self.assert_board_matches("oracle_rev2")

    def test_legacy_in_bom(self):
        self.assert_schematic_matches_netlist("legacy_in_bom")
        self.assert_bom_csv_matches("legacy_in_bom")

    def test_sch_only(self):
        self.assert_schematic_matches_netlist("sch_only")
        self.assert_bom_csv_matches("sch_only")

    def test_case_fold(self):
        self.assert_schematic_matches_netlist("case_fold")
        self.assert_bom_csv_matches("case_fold")
        self.assert_board_matches("case_fold")

    def test_pcb_only(self):
        self.assert_board_matches("pcb_only")

    def test_malformed_board_still_exports(self):
        self.assert_board_matches("malformed")

    def test_no_variants(self):
        expected = expectation("no_variants")
        self.assertEqual(expected["catalog"], [])
        comps = netlist_components(evidence("no_variants", "netlist_default.xml"))
        self.assertTrue(all(not c["variants"] for c in comps.values()))

    def test_rule_area_is_a_documented_divergence(self):
        # Native: R11 inside the DNP rule area is DNP; Prism (D2) reports it as not DNP with a diagnostic.
        comps = netlist_components(evidence("rule_area", "netlist_default.xml"))
        self.assertIn("dnp", comps["R11"]["properties"])
        self.assertNotIn("dnp", comps["R13"]["properties"])
        expected = expectation("rule_area")
        self.assertEqual(expected["default"]["components"], {})
        self.assertEqual([d["code"] for d in expected["diagnostics"]], ["rule-area-flags-unsupported"])

    def test_unknown_variant_name_yields_default_output_natively(self):
        # `Nope` is in no registry: KiCad silently exports the default (packet N9/N18).
        self.assertEqual(pos_rows(evidence_for("oracle", "pos", "Nope")), pos_rows(evidence_for("oracle", "pos", None)))
        self.assertEqual(
            bom_rows(evidence_for("oracle", "bom", "Nope", "--include-excluded-from-bom")),
            bom_rows(evidence_for("oracle", "bom", None, "--include-excluded-from-bom")),
        )


if __name__ == "__main__":
    unittest.main()
