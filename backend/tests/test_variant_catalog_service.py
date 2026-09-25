"""Variant catalog discovery tests (VAR-07).

The fixture directories under ``tests/fixtures/design_variants`` double as
input projects here: every one has an anchor in its expectation file, and the
expectation's ``catalog`` block is the frozen native-derived answer. The temp
Git tests cover the parts the fixtures cannot: commit isolation, a monorepo
with two anchored projects, and PCB-only projects without a ``.kicad_pro``.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.services import semantic_index_service, variant_catalog_service

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "design_variants"
CATALOG_CODES = {
    variant_catalog_service.CASE_MISMATCH_CODE,
    variant_catalog_service.SOURCE_UNPARSEABLE_CODE,
}
FIXTURES = (
    "no_variants",
    "oracle",
    "pcb_only",
    "sch_only",
    "legacy_in_bom",
    "rule_area",
    "kicad11_tokens",
    "malformed",
    "oracle_rev2",
    "case_fold",
)


def expectation(name: str) -> dict:
    return json.loads(
        (FIXTURE_ROOT / "expected" / f"{name}.json").read_text(encoding="utf-8")
    )


def fixture_project(directory: str, anchor: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"prj_{directory}", path=str(FIXTURE_ROOT / directory), project_file=anchor
    )


def diagnostic_projection(diagnostic: dict) -> dict:
    return {
        key: diagnostic[key]
        for key in ("code", "source", "path", "detail")
        if key in diagnostic
    }


def catalog_diagnostics(payload: dict) -> list[dict]:
    return [d for d in payload["diagnostics"] if d["code"] in CATALOG_CODES]


SCHEMATIC = """(kicad_sch
(version 20260306)
(generator "eeschema")
(uuid "11111111-1111-5111-8111-111111111111")
(lib_symbols)
(symbol
(lib_id "Device:R")
(at 20 20 0)
(unit 1)
(exclude_from_sim no)
(in_bom yes)
(on_board yes)
(in_pos_files yes)
(dnp no)
(uuid "22222222-2222-5222-8222-222222222222")
(property "Reference" "R1" (at 0 0 0) (effects (font (size 1.27 1.27))))
(property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))
(property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27))))
(pin "1" (uuid "33333333-3333-5333-8333-333333333333"))
(instances
(project "{stem}"
(path "/11111111-1111-5111-8111-111111111111" (reference "R1") (unit 1)
(variant (name "{variant}") (dnp yes))
)
)
)
)
(sheet_instances (path "/" (page "1")))
(embedded_fonts no)
)
"""

BOARD = """(kicad_pcb
(version 20260306)
(generator "pcbnew")
(paper "A4")
{variants}
(footprint "R_0603"
(layer "F.Cu")
(uuid "44444444-4444-5444-8444-444444444444")
(at 0 0)
(property "Reference" "R1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
(property "Value" "10k" (at 0 0 0) (layer "F.Fab") (effects (font (size 1 1))))
(attr smd)
{variant}
)
(embedded_fonts no)
)
"""


class FixtureCatalogTests(unittest.TestCase):
    """Every committed expectation is the answer for its own directory."""

    def test_catalog_matches_the_frozen_expectation(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                project = fixture_project(name, expected["project"])
                result = variant_catalog_service.discover_variant_catalog(project)

                self.assertEqual(
                    result["schema"], "prism.project_variants_a0", name
                )
                self.assertEqual(result["projectId"], f"prj_{name}", name)
                self.assertIsNone(result["commit"], name)
                self.assertEqual(result["variants"], expected["catalog"], name)

    def test_only_catalog_diagnostics_are_emitted(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                project = fixture_project(name, expected["project"])
                result = variant_catalog_service.discover_variant_catalog(project)

                expected_codes = [
                    d["code"]
                    for d in expected.get("diagnostics", [])
                    if d["code"] in CATALOG_CODES
                ]
                self.assertEqual(
                    [d["code"] for d in result["diagnostics"]],
                    expected_codes,
                    name,
                )

    def test_source_unparseable_and_case_fold_details_match(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                project = fixture_project(name, expected["project"])
                result = variant_catalog_service.discover_variant_catalog(project)

                self.assertEqual(
                    [
                        diagnostic_projection(d)
                        for d in catalog_diagnostics(result)
                    ],
                    [
                        diagnostic_projection(d)
                        for d in expected.get("diagnostics", [])
                        if d["code"] in CATALOG_CODES
                    ],
                    name,
                )

    def test_identity_matches_the_semantic_index_rules(self) -> None:
        for name in FIXTURES:
            with self.subTest(fixture=name):
                expected = expectation(name)
                anchor = expected["project"]
                project = fixture_project(name, anchor)
                if anchor.endswith(".kicad_pro"):
                    key, _ = semantic_index_service._revision_identity(
                        project, None
                    )
                else:
                    fixture_dir = (FIXTURE_ROOT / name).resolve()
                    key = semantic_index_service._revision_key(
                        semantic_index_service._source_entries_on_disk(
                            fixture_dir
                        ),
                        project_file_rel=anchor,
                    )
                result = variant_catalog_service.discover_variant_catalog(project)
                self.assertEqual(result["sourceRevisionKey"], key, name)
                self.assertIsNone(result["commit"], name)


class TempProjectTests(unittest.TestCase):
    """Temp trees cover commit isolation, monorepos and PCB-only projects."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def _init_repo(self) -> None:
        for command in (
            ["git", "init", "-q"],
            ["git", "add", "-A"],
            ["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "one"],
        ):
            subprocess.run(command, cwd=self.root, check=True)

    def _write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def _project(self, relative: str, anchor: str) -> SimpleNamespace:
        directory = relative.rsplit("/", 1)[0] if "/" in relative else "."
        return SimpleNamespace(
            id="prj_tmp",
            path=str(self.root / directory),
            project_file=anchor,
        )

    def test_a_commit_does_not_leak_working_tree_names(self) -> None:
        self._write(
            "boards/main/main.kicad_pro",
            json.dumps({"schematic": {"variants": [{"name": "Old"}]}}),
        )
        self._write(
            "boards/main/main.kicad_sch",
            SCHEMATIC.format(stem="main", variant="OnlyOld"),
        )
        self._write("boards/main/main.kicad_pcb", BOARD.format(variants="", variant=""))
        self._init_repo()

        committed = self._write(
            "boards/main/main.kicad_pro",
            json.dumps({"schematic": {"variants": [{"name": "New"}]}}),
        )
        self.assertIsNotNone(committed)
        self._write(
            "boards/main/main.kicad_sch",
            SCHEMATIC.format(stem="main", variant="OnlyNew"),
        )

        project = self._project("boards/main/main.kicad_pro", "main.kicad_pro")
        from_commit = variant_catalog_service.discover_variant_catalog(project, "HEAD")
        from_disk = variant_catalog_service.discover_variant_catalog(project)

        self.assertEqual(
            [entry["name"] for entry in from_commit["variants"]],
            ["Old", "OnlyOld"],
        )
        self.assertEqual(
            [entry["name"] for entry in from_disk["variants"]],
            ["New", "OnlyNew"],
        )
        self.assertIsNotNone(from_commit["commit"])
        self.assertIsNone(from_disk["commit"])
        self.assertNotEqual(
            from_commit["sourceRevisionKey"], from_disk["sourceRevisionKey"]
        )

    def test_a_commit_identity_is_stable_for_the_same_content(self) -> None:
        self._write(
            "boards/main/main.kicad_pro",
            json.dumps({"schematic": {"variants": [{"name": "Lite"}]}}),
        )
        self._write(
            "boards/main/main.kicad_sch",
            SCHEMATIC.format(stem="main", variant="Lite"),
        )
        self._write("boards/main/main.kicad_pcb", BOARD.format(variants="", variant=""))
        self._init_repo()
        project = self._project("boards/main/main.kicad_pro", "main.kicad_pro")

        first = variant_catalog_service.discover_variant_catalog(project, "HEAD")
        second = variant_catalog_service.discover_variant_catalog(project, "HEAD")
        self.assertEqual(first["sourceRevisionKey"], second["sourceRevisionKey"])

    def test_a_monorepo_anchor_keeps_sibling_projects_out(self) -> None:
        self._write(
            "alpha.kicad_pro",
            json.dumps({"schematic": {"variants": [{"name": "AlphaLite"}]}}),
        )
        self._write("alpha.kicad_sch", SCHEMATIC.format(stem="alpha", variant="AlphaRec"))
        self._write("alpha.kicad_pcb", BOARD.format(variants="", variant=""))
        self._write(
            "beta.kicad_pro",
            json.dumps({"schematic": {"variants": [{"name": "BetaLite"}]}}),
        )
        self._write("beta.kicad_sch", SCHEMATIC.format(stem="beta", variant="BetaRec"))
        self._write("beta.kicad_pcb", BOARD.format(variants="", variant=""))

        alpha = variant_catalog_service.discover_variant_catalog(
            self._project("alpha.kicad_pro", "alpha.kicad_pro")
        )
        beta = variant_catalog_service.discover_variant_catalog(
            self._project("beta.kicad_pro", "beta.kicad_pro")
        )

        self.assertEqual(
            [entry["name"] for entry in alpha["variants"]],
            ["AlphaLite", "AlphaRec"],
        )
        self.assertEqual(
            [entry["name"] for entry in beta["variants"]],
            ["BetaLite", "BetaRec"],
        )

    def test_a_pcb_only_project_without_a_project_file(self) -> None:
        self._write(
            "board_only.kicad_pcb",
            BOARD.format(
                variants='(variants (variant (name "BoardOnly") (description "header only")))',
                variant='\n(variant (name "FpOnly"))',
            ),
        )
        project = self._project("board_only.kicad_pcb", "board_only.kicad_pcb")
        result = variant_catalog_service.discover_variant_catalog(project)

        self.assertEqual(result["commit"], None)
        self.assertEqual(
            [entry["name"] for entry in result["variants"]],
            ["BoardOnly", "FpOnly"],
        )
        self.assertEqual(result["variants"][0]["description"], "header only")
        self.assertEqual(result["variants"][0]["sources"], ["pcb"])
        self.assertEqual(result["variants"][1]["sources"], ["footprint"])

    def test_a_board_anchor_isolates_a_commit_from_working_tree_edits(self) -> None:
        self._write(
            "board_only.kicad_pcb",
            BOARD.format(
                variants='(variants (variant (name "Committed")))', variant=""
            ),
        )
        self._init_repo()
        self._write(
            "board_only.kicad_pcb",
            BOARD.format(variants='(variants (variant (name "Working")))', variant=""),
        )

        project = self._project("board_only.kicad_pcb", "board_only.kicad_pcb")
        committed = variant_catalog_service.discover_variant_catalog(project, "HEAD")
        from_disk = variant_catalog_service.discover_variant_catalog(project)

        self.assertEqual(
            [entry["name"] for entry in committed["variants"]], ["Committed"]
        )
        self.assertEqual(
            [entry["name"] for entry in from_disk["variants"]], ["Working"]
        )

    def test_malformed_and_escaped_sources(self) -> None:
        self._write(
            "board.kicad_pro",
            json.dumps({"schematic": {"variants": [{"name": "ProjName"}]}}),
        )
        self._write(
            "board.kicad_pcb",
            BOARD.format(
                variants=(
                    '(variants (variant (name "Esc\\"aped") '
                    '(description "Say \\"hi\\"")))'
                ),
                variant="",
            ),
        )
        self._write(
            "board.kicad_sch",
            SCHEMATIC.format(stem="board", variant="SchName") + "(unbalanced",
        )
        project = self._project("board.kicad_pro", "board.kicad_pro")
        result = variant_catalog_service.discover_variant_catalog(project)

        self.assertEqual(
            [entry["name"] for entry in result["variants"]],
            ["ProjName", 'Esc"aped'],
        )
        self.assertEqual(result["variants"][1]["description"], 'Say "hi"')
        self.assertEqual(
            [
                (d["code"], d["source"], d.get("path"))
                for d in result["diagnostics"]
            ],
            [
                (
                    variant_catalog_service.SOURCE_UNPARSEABLE_CODE,
                    "schematic",
                    "board.kicad_sch",
                )
            ],
        )

    def test_schematic_hierarchy_order_drives_catalog_order(self) -> None:
        self._write(
            "main.kicad_pro",
            json.dumps({"schematic": {}}),
        )
        self._write(
            "main.kicad_sch",
            SCHEMATIC.format(stem="main", variant="RootName").replace(
                "(sheet_instances",
                '(sheet (property "Sheetname" "Child") '
                '(property "Sheetfile" "child.kicad_sch") '
                '(uuid "55555555-5555-5555-8555-555555555555"))\n(sheet_instances',
            ),
        )
        self._write("child.kicad_sch", SCHEMATIC.format(stem="child", variant="ChildName"))
        project = self._project("main.kicad_pro", "main.kicad_pro")
        result = variant_catalog_service.discover_variant_catalog(project)
        self.assertEqual(
            [entry["name"] for entry in result["variants"]],
            ["RootName", "ChildName"],
        )


if __name__ == "__main__":
    unittest.main()
