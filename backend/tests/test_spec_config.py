from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.spec_config_service import (  # noqa: E402
    DEFAULT_SPEC_CONFIG,
    JLCPCB_SPEC_CONFIG,
    PCBWAY_SPEC_CONFIG,
    SEED_MANUFACTURERS,
    parse_spec_config,
)


class SpecConfigParseTests(unittest.TestCase):
    def test_default_config_parses_cleanly(self) -> None:
        parsed = parse_spec_config(DEFAULT_SPEC_CONFIG)
        self.assertEqual(parsed.errors, [])
        self.assertEqual(
            [s.title for s in parsed.sections],
            ["Stackup & physical", "Finish & cosmetic", "Process"],
        )

    def test_field_types_and_choice(self) -> None:
        parsed = parse_spec_config(
            "[S]\n"
            "count: int\n"
            "size: number\n"
            "name: text\n"
            "flag: bool\n"
            "finish: choice(ENIG, HASL)\n"
        )
        self.assertEqual(parsed.errors, [])
        fields = {f.key: f for f in parsed.sections[0].fields}
        self.assertEqual(fields["count"].type, "int")
        self.assertEqual(fields["size"].type, "number")
        self.assertEqual(fields["flag"].type, "bool")
        self.assertEqual(fields["finish"].type, "choice")
        self.assertEqual(fields["finish"].options, ["ENIG", "HASL"])

    def test_choice_options_keep_commas_and_parentheses(self) -> None:
        # Real JLCPCB labels carry their own commas and parentheses; a naive
        # split on "," tore these apart and dropped half of an option.
        parsed = parse_spec_config(
            "[S]\n"
            "finish: choice(OSP, HASL(with lead), LeadFree HASL, ENIG) = ENIG | Surface finish\n"
            "emi: choice(Without, Both sides ( Black ,18um ), Single side ( Black ,18um )) | EMI film\n"
            "side: choice(Top only, Top + Bottom(On Single Stencil)) | Stencil side\n"
        )
        self.assertEqual(parsed.errors, [])
        fields = {f.key: f for f in parsed.sections[0].fields}
        self.assertEqual(
            fields["finish"].options,
            ["OSP", "HASL(with lead)", "LeadFree HASL", "ENIG"],
        )
        self.assertEqual(
            fields["emi"].options,
            ["Without", "Both sides ( Black ,18um )", "Single side ( Black ,18um )"],
        )
        self.assertEqual(
            fields["side"].options,
            ["Top only", "Top + Bottom(On Single Stencil)"],
        )

    def test_defaults_are_coerced_to_the_field_type(self) -> None:
        parsed = parse_spec_config(
            "[S]\n"
            "layers: int = 4\n"
            "thick: number = 1.6\n"
            "controlled: bool = yes\n"
            "material: text = FR-4\n"
        )
        fields = {f.key: f for f in parsed.sections[0].fields}
        self.assertEqual(fields["layers"].default, 4)
        self.assertEqual(fields["thick"].default, 1.6)
        self.assertIs(fields["controlled"].default, True)
        self.assertEqual(fields["material"].default, "FR-4")

    def test_label_override_and_humanised_default(self) -> None:
        parsed = parse_spec_config(
            "[S]\n"
            "board_thickness_mm: number | Board thickness (mm)\n"
            "layer_count: int\n"
        )
        fields = {f.key: f for f in parsed.sections[0].fields}
        self.assertEqual(fields["board_thickness_mm"].label, "Board thickness (mm)")
        self.assertEqual(fields["layer_count"].label, "Layer count")  # humanised

    def test_fields_before_a_section_go_in_a_default_one(self) -> None:
        parsed = parse_spec_config("loose: text\n[Named]\ninside: int\n")
        self.assertEqual(parsed.errors, [])
        self.assertEqual(parsed.sections[0].title, "Specifications")
        self.assertEqual(parsed.sections[0].fields[0].key, "loose")
        self.assertEqual(parsed.sections[1].title, "Named")

    def test_comments_and_blank_lines_ignored(self) -> None:
        parsed = parse_spec_config("# header\n\n[S]\n\n# note\nx: int  # trailing\n")
        self.assertEqual(parsed.errors, [])
        self.assertEqual(len(parsed.sections[0].fields), 1)

    def test_errors_are_collected_not_raised(self) -> None:
        parsed = parse_spec_config(
            "[S]\n"
            "1bad: int\n"        # bad key
            "x: banana\n"        # unknown type
            "y: choice()\n"      # empty choice
            "no_colon_here\n"    # missing colon
            "dup: int\n"
            "dup: text\n"        # duplicate
        )
        self.assertEqual(len(parsed.errors), 5)
        # The one valid field still parsed.
        self.assertEqual([f.key for f in parsed.sections[0].fields], ["dup"])

    def test_empty_config_yields_no_sections(self) -> None:
        parsed = parse_spec_config("# just a comment\n")
        self.assertEqual(parsed.sections, [])
        self.assertEqual(parsed.errors, [])

    def test_optional_section_marked_with_leading_plus(self) -> None:
        parsed = parse_spec_config(
            "[Base]\nlayer_count: int\n[+Assembly]\nqty: int\n"
        )
        self.assertEqual(parsed.errors, [])
        base, assembly = parsed.sections
        self.assertFalse(base.optional)
        self.assertEqual(base.title, "Base")
        self.assertTrue(assembly.optional)
        self.assertEqual(assembly.title, "Assembly")  # the + is stripped from the name

    def test_jlcpcb_has_optional_assembly_and_stencil(self) -> None:
        parsed = parse_spec_config(JLCPCB_SPEC_CONFIG)
        optional = {s.title for s in parsed.sections if s.optional}
        self.assertEqual(optional, {"Assembly", "Stencil"})

    def test_advanced_config_is_distinct_and_parses(self) -> None:
        from app.services.spec_config_service import JLCPCB_ADVANCED_SPEC_CONFIG

        parsed = parse_spec_config(JLCPCB_ADVANCED_SPEC_CONFIG)
        self.assertEqual(parsed.errors, [])
        keys = {f.key for s in parsed.sections for f in s.fields}
        # It carries advanced-only fields the standard config does not.
        self.assertIn("specify_stackup", keys)
        self.assertIn("backdrill", keys)
        self.assertIn("press_fit_hole", keys)
        # And its richer material grades come straight from the advanced form.
        material = next(
            f for s in parsed.sections for f in s.fields if f.key == "material_type"
        )
        self.assertIn("Shengyi S1000-2M - TG170", material.options)

    def test_pcbway_schemas_parse_and_are_distinct(self) -> None:
        from app.services.spec_config_service import (
            PCBWAY_ADVANCED_SPEC_CONFIG,
            PCBWAY_FLEX_SPEC_CONFIG,
            PCBWAY_SPEC_CONFIG,
        )

        for cfg in (PCBWAY_SPEC_CONFIG, PCBWAY_ADVANCED_SPEC_CONFIG, PCBWAY_FLEX_SPEC_CONFIG):
            self.assertEqual(parse_spec_config(cfg).errors, [])

        # Standard carries PCBWay's real option strings (parens intact).
        std = parse_spec_config(PCBWAY_SPEC_CONFIG)
        finish = next(f for s in std.sections for f in s.fields if f.key == "surface_finish")
        self.assertIn("Immersion gold(ENIG)", finish.options)

        # Flex is its own schema with FPC-only fields.
        flex_keys = {f.key for s in parse_spec_config(PCBWAY_FLEX_SPEC_CONFIG).sections for f in s.fields}
        self.assertIn("coverlay", flex_keys)
        self.assertIn("stiffener", flex_keys)

    def test_when_clause_equality(self) -> None:
        parsed = parse_spec_config("[S]\nm: text\nx: int when m = FR-4\n")
        self.assertEqual(parsed.errors, [])
        field = parsed.sections[0].fields[1]
        self.assertIsNotNone(field.when)
        self.assertEqual(field.when.key, "m")
        self.assertEqual(field.when.op, "=")
        self.assertEqual(field.when.values, ["FR-4"])

    def test_when_clause_operators_and_in_list(self) -> None:
        parsed = parse_spec_config(
            "[S]\n"
            "layers: int\n"
            "mat: text\n"
            "a: int when layers > 2\n"
            "b: int when mat != FR-4\n"
            "c: int when mat in (Flex, Rigid-Flex)\n"
        )
        self.assertEqual(parsed.errors, [])
        by_key = {f.key: f.when for f in parsed.sections[0].fields}
        self.assertEqual((by_key["a"].op, by_key["a"].values), (">", ["2"]))
        self.assertEqual((by_key["b"].op, by_key["b"].values), ("!=", ["FR-4"]))
        self.assertEqual((by_key["c"].op, by_key["c"].values), ("in", ["Flex", "Rigid-Flex"]))

    def test_when_coexists_with_default_and_label(self) -> None:
        parsed = parse_spec_config(
            "[S]\nm: text\ncolor: choice(A, B) = A when m = FR-4 | Mask color\n"
        )
        self.assertEqual(parsed.errors, [])
        field = parsed.sections[0].fields[1]
        self.assertEqual(field.default, "A")
        self.assertEqual(field.label, "Mask color")
        self.assertEqual(field.when.values, ["FR-4"])

    def test_section_level_when(self) -> None:
        parsed = parse_spec_config("[+Impedance] when imp = yes\nz: number\n")
        self.assertEqual(parsed.errors, [])
        section = parsed.sections[0]
        self.assertTrue(section.optional)
        self.assertIsNotNone(section.when)
        self.assertEqual(section.when.key, "imp")

    def test_malformed_when_is_an_error(self) -> None:
        parsed = parse_spec_config("[S]\nx: int when\n")
        # `when` with nothing after it leaves an empty body: reported, not crashed.
        self.assertTrue(any("when" in e.lower() for e in parsed.errors))

    def test_jlcpcb_gates_inner_copper_and_fr4_features(self) -> None:
        parsed = parse_spec_config(JLCPCB_SPEC_CONFIG)
        self.assertEqual(parsed.errors, [])
        gated = {f.key: f.when for s in parsed.sections for f in s.fields if f.when}
        # Inner copper and min via are gated on layer count (multilayer only).
        self.assertEqual(gated["inner_copper_weight_oz"].key, "layer_count")
        self.assertEqual(gated["min_via_hole"].key, "layer_count")
        self.assertEqual(gated["gold_fingers"].values, ["FR-4"])
        # Flex-only options are gated on the material being Flex.
        self.assertEqual(gated["stiffener"].values, ["Flex"])
        # Panel layout only shows for a panel delivery.
        self.assertEqual(gated["panel_columns"].op, "!=")

    def test_jlcpcb_layer_count_is_a_choice_and_delivery_is_carrier_only(self) -> None:
        parsed = parse_spec_config(JLCPCB_SPEC_CONFIG)
        by_key = {f.key: f for s in parsed.sections for f in s.fields}
        self.assertEqual(by_key["layer_count"].type, "choice")
        self.assertIn("4", by_key["layer_count"].options)
        delivery = next(s for s in parsed.sections if s.title == "Delivery")
        self.assertEqual([f.key for f in delivery.fields], ["carrier"])

    def test_builtin_templates_parse_cleanly(self) -> None:
        from app.services.spec_config_service import JLCPCB_ADVANCED_SPEC_CONFIG

        for config in (DEFAULT_SPEC_CONFIG, JLCPCB_SPEC_CONFIG, PCBWAY_SPEC_CONFIG, JLCPCB_ADVANCED_SPEC_CONFIG):
            parsed = parse_spec_config(config)
            self.assertEqual(parsed.errors, [], msg=f"errors: {parsed.errors}")
            self.assertGreater(sum(len(s.fields) for s in parsed.sections), 0)

    def test_seed_manufacturers_are_named_and_configured(self) -> None:
        names = {m["name"] for m in SEED_MANUFACTURERS}
        self.assertEqual(names, {"JLCPCB", "PCBWay"})
        for entry in SEED_MANUFACTURERS:
            self.assertTrue(entry["templates"])
            for template in entry["templates"]:
                self.assertTrue(template["name"])
                self.assertTrue(template["config"].strip())
        # JLCPCB ships standard, advanced, and flexible templates.
        jlcpcb = next(m for m in SEED_MANUFACTURERS if m["name"] == "JLCPCB")
        keys = {t["key"] for t in jlcpcb["templates"]}
        self.assertEqual(keys, {"jlcpcb:standard", "jlcpcb:advanced", "jlcpcb:flex"})
        # The flex template carries custom-capability metadata beyond KiCad's
        # tracked rule fields.
        flex = next(t for t in jlcpcb["templates"] if t["key"] == "jlcpcb:flex")
        self.assertIn("capability_meta", flex)
        self.assertIn("max_board_width_mm", flex["capability_meta"])

    def test_capabilities_split_into_kicad_tracked_and_custom(self) -> None:
        from app.services.pcb_rules_service import is_kicad_tracked
        from app.services.spec_config_service import (
            JLCPCB_FLEX_CAPABILITIES,
            JLCPCB_FLEX_META,
            PCBWAY_STANDARD_CAPABILITIES,
            PCBWAY_META,
        )

        for caps, meta in (
            (JLCPCB_FLEX_CAPABILITIES, JLCPCB_FLEX_META),
            (PCBWAY_STANDARD_CAPABILITIES, PCBWAY_META),
        ):
            tracked = {k for k in caps if is_kicad_tracked(k)}
            custom = {k for k in caps if not is_kicad_tracked(k)}
            self.assertTrue(tracked, "expected some KiCad-tracked minimums")
            self.assertTrue(custom, "expected some custom capabilities")
            # Every custom capability has display metadata; tracked ones do not need it.
            self.assertEqual(custom, set(meta.keys()))
            for entry in meta.values():
                self.assertIn("label", entry)


if __name__ == "__main__":
    unittest.main()
