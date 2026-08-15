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

    def test_jlcpcb_has_optional_assembly_and_technical(self) -> None:
        parsed = parse_spec_config(JLCPCB_SPEC_CONFIG)
        optional = {s.title for s in parsed.sections if s.optional}
        self.assertEqual(optional, {"Assembly", "Technical"})

    def test_builtin_templates_parse_cleanly(self) -> None:
        for config in (DEFAULT_SPEC_CONFIG, JLCPCB_SPEC_CONFIG, PCBWAY_SPEC_CONFIG):
            parsed = parse_spec_config(config)
            self.assertEqual(parsed.errors, [], msg=f"errors: {parsed.errors}")
            self.assertGreater(sum(len(s.fields) for s in parsed.sections), 0)

    def test_seed_manufacturers_are_named_and_configured(self) -> None:
        names = {m["name"] for m in SEED_MANUFACTURERS}
        self.assertEqual(names, {"JLCPCB", "PCBWay"})
        for entry in SEED_MANUFACTURERS:
            self.assertTrue(entry["template_name"])
            self.assertTrue(entry["template_config"].strip())


if __name__ == "__main__":
    unittest.main()
