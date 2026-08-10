"""Host-safe and live validation for the durable Release Studio R0 fixtures."""

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tests import release_studio_support as support
from tests.release_studio_support import (
    EXPECTED_KICAD_IMAGE,
    EXECUTOR_IMAGE_ENV,
    FIXTURE_NAMES,
    fixture_entrypoint,
    fixture_manifest,
    fixture_recording,
    fixture_root,
    kicad_cli_executable,
    requires_kicad_cli,
    run_kicad_cli,
)


_SHEETFILE_RE = re.compile(r'\(property\s+"Sheetfile"\s+"([^"]+)"')
_REFERENCE_RE = re.compile(
    r'\((?:property\s+"Reference"|fp_text\s+reference)\s+"([^"]+)"'
)
_ABSOLUTE_PATH_RE = re.compile(r"(?:^|[\s\"(])(?:/Users/|/home/|[A-Za-z]:[\\/])")
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _assert_balanced_kicad_sexpr(path: Path) -> str:
    """Check the real KiCad source envelope without depending on KiCad locally."""

    text = path.read_text(encoding="utf-8")
    depth = 0
    in_string = False
    in_binary = False
    escaped = False
    for index, character in enumerate(text):
        if in_binary:
            if character == "|":
                in_binary = False
            continue
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character == "|":
            in_binary = True
        elif character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth < 0:
                raise AssertionError(f"unexpected closing parenthesis at {path}:{index}")

    if in_string or in_binary or depth != 0:
        raise AssertionError(f"unbalanced KiCad S-expression: {path}")

    root = re.search(r"^\s*\((kicad_pcb|kicad_sch)\b", text)
    if root is None:
        raise AssertionError(f"{path} has no KiCad board/schematic root")
    return root.group(1)


def _resolve_local_path(root: Path, relative_path: str) -> Path:
    candidate = (root / relative_path).resolve()
    if not candidate.is_relative_to(root.resolve()):
        raise AssertionError(f"entrypoint escapes fixture root: {relative_path}")
    return candidate


def _parse_kicad_sexpr(text: str) -> list[object]:
    """Parse the small KiCad S-expression subset needed by host-safe tests."""

    position = 0

    def skip_space() -> None:
        nonlocal position
        while position < len(text) and text[position].isspace():
            position += 1

    def parse_atom() -> str:
        nonlocal position
        if text[position] == '"':
            position += 1
            characters: list[str] = []
            escaped = False
            while position < len(text):
                character = text[position]
                position += 1
                if escaped:
                    characters.append({"n": "\n", "r": "\r", "t": "\t"}.get(character, character))
                    escaped = False
                elif character == "\\":
                    escaped = True
                elif character == '"':
                    return "".join(characters)
                else:
                    characters.append(character)
            raise AssertionError("unterminated KiCad quoted atom")

        start = position
        while position < len(text) and text[position] not in "()\t\r\n ":
            position += 1
        if start == position:
            raise AssertionError(f"unexpected S-expression character at offset {position}")
        return text[start:position]

    def parse_expression() -> object:
        nonlocal position
        skip_space()
        if position >= len(text):
            raise AssertionError("unexpected end of KiCad S-expression")
        if text[position] != "(":
            if text[position] == ")":
                raise AssertionError(f"unexpected closing parenthesis at offset {position}")
            return parse_atom()

        position += 1
        expression: list[object] = []
        while True:
            skip_space()
            if position >= len(text):
                raise AssertionError("unterminated KiCad S-expression")
            if text[position] == ")":
                position += 1
                return expression
            expression.append(parse_expression())

    root = parse_expression()
    skip_space()
    if position != len(text):
        raise AssertionError(f"trailing KiCad S-expression data at offset {position}")
    if not isinstance(root, list):
        raise AssertionError("KiCad S-expression root is not a list")
    return root


def _sexpr_children(node: list[object], tag: str) -> list[list[object]]:
    return [
        child for child in node[1:]
        if isinstance(child, list) and child and child[0] == tag
    ]


def _sexpr_value(node: list[object], tag: str) -> str | None:
    child = next(iter(_sexpr_children(node, tag)), None)
    if child is None or len(child) < 2 or not isinstance(child[1], str):
        return None
    return child[1]


def _sexpr_property_value(node: list[object], name: str) -> str | None:
    for property_node in _sexpr_children(node, "property"):
        if (
            len(property_node) >= 3
            and property_node[1] == name
            and isinstance(property_node[2], str)
        ):
            return property_node[2]
    return None


def _synthetic_board_variants() -> tuple[list[str], dict[str, dict[str, bool]]]:
    board_text = fixture_entrypoint("synthetic", "board").read_text(encoding="utf-8")
    board = _parse_kicad_sexpr(board_text)
    if not board or board[0] != "kicad_pcb":
        raise AssertionError("synthetic board has no kicad_pcb root")

    board_variants = next(iter(_sexpr_children(board, "variants")), None)
    if board_variants is None:
        raise AssertionError("synthetic board has no top-level variants block")
    names = [
        name
        for variant in _sexpr_children(board_variants, "variant")
        if (name := _sexpr_value(variant, "name")) is not None
    ]

    assignments: dict[str, dict[str, bool]] = {}
    for footprint in _sexpr_children(board, "footprint"):
        reference = None
        for property_node in _sexpr_children(footprint, "property"):
            if len(property_node) >= 3 and property_node[1] == "Reference":
                reference = property_node[2]
                break
        if reference is None:
            for fp_text in _sexpr_children(footprint, "fp_text"):
                if len(fp_text) >= 3 and fp_text[1] == "reference":
                    reference = fp_text[2]
                    break
        if not isinstance(reference, str):
            continue
        variant_assignments: dict[str, bool] = {}
        for variant in _sexpr_children(footprint, "variant"):
            name = _sexpr_value(variant, "name")
            dnp = _sexpr_value(variant, "dnp")
            if name is not None and dnp in {"yes", "no"}:
                variant_assignments[name] = dnp == "yes"
        if variant_assignments:
            assignments[reference] = variant_assignments
    return names, assignments


def _synthetic_schematic_variants() -> dict[str, dict[str, bool]]:
    schematic_text = fixture_entrypoint("synthetic", "schematic").read_text(
        encoding="utf-8"
    )
    schematic = _parse_kicad_sexpr(schematic_text)
    if not schematic or schematic[0] != "kicad_sch":
        raise AssertionError("synthetic schematic has no kicad_sch root")

    assignments: dict[str, dict[str, bool]] = {}
    for symbol in _sexpr_children(schematic, "symbol"):
        reference = _sexpr_property_value(symbol, "Reference")
        if reference is None:
            continue
        for instances in _sexpr_children(symbol, "instances"):
            for project in _sexpr_children(instances, "project"):
                for path in _sexpr_children(project, "path"):
                    path_reference = _sexpr_value(path, "reference")
                    if path_reference != reference:
                        continue
                    variant_assignments: dict[str, bool] = {}
                    for variant in _sexpr_children(path, "variant"):
                        name = _sexpr_value(variant, "name")
                        dnp = _sexpr_value(variant, "dnp")
                        if name is not None and dnp in {"yes", "no"}:
                            variant_assignments[name] = dnp == "yes"
                    if variant_assignments:
                        assignments[reference] = variant_assignments
    return assignments


class ReleaseStudioFixtureTests(unittest.TestCase):
    def test_fixture_roots_are_stable_and_complete(self) -> None:
        root_entries = {
            path.name for path in support.RELEASE_STUDIO_ROOT.iterdir() if path.is_dir()
        }
        self.assertEqual(root_entries, {*FIXTURE_NAMES, "cli-recordings"})
        self.assertEqual(tuple(FIXTURE_NAMES), ("synthetic", "usb-pd", "cynthion"))

    def test_every_fixture_has_parseable_local_entrypoints(self) -> None:
        for name in FIXTURE_NAMES:
            root = fixture_root(name)
            manifest_path = fixture_manifest(name)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["fixture"], name)
            self.assertEqual(manifest["schema_version"], 1)

            entrypoints = manifest["entrypoints"]
            for kind in ("project", "board", "schematic", "jobset"):
                self.assertIn(kind, entrypoints)
                path = _resolve_local_path(root, entrypoints[kind])
                self.assertTrue(path.is_file(), path)

            project_path = _resolve_local_path(root, entrypoints["project"])
            project = json.loads(project_path.read_text(encoding="utf-8"))
            self.assertEqual(project["meta"]["filename"], project_path.name)

            self.assertEqual(
                _assert_balanced_kicad_sexpr(
                    _resolve_local_path(root, entrypoints["board"])
                ),
                "kicad_pcb",
            )
            self.assertEqual(
                _assert_balanced_kicad_sexpr(
                    _resolve_local_path(root, entrypoints["schematic"])
                ),
                "kicad_sch",
            )

            jobset = json.loads(
                _resolve_local_path(root, entrypoints["jobset"]).read_text(encoding="utf-8")
            )
            self.assertIsInstance(jobset.get("jobs"), list)
            self.assertTrue(jobset["jobs"])
            for job in jobset["jobs"]:
                self.assertRegex(job["id"], _UUID_RE)
                self.assertIsInstance(job["type"], str)
                self.assertNotEqual(job["type"], "special_execute")

    def test_hierarchical_schematic_files_are_local_and_parseable(self) -> None:
        for name in FIXTURE_NAMES:
            root = fixture_root(name)
            root_schematic = fixture_entrypoint(name, "schematic")
            pending = [root_schematic]
            visited: set[Path] = set()
            while pending:
                schematic = pending.pop()
                if schematic in visited:
                    continue
                visited.add(schematic)
                self.assertEqual(_assert_balanced_kicad_sexpr(schematic), "kicad_sch")
                text = schematic.read_text(encoding="utf-8")
                for relative_path in _SHEETFILE_RE.findall(text):
                    candidates = (
                        _resolve_local_path(root, relative_path),
                        _resolve_local_path(schematic.parent, relative_path),
                    )
                    child = next((candidate for candidate in candidates if candidate.is_file()), None)
                    self.assertIsNotNone(child, f"missing sheet {relative_path} from {schematic}")
                    pending.append(child)  # type: ignore[arg-type]

            declared_children = fixture_manifest(name)
            manifest = json.loads(declared_children.read_text(encoding="utf-8"))
            for relative_path in manifest["entrypoints"].get("child_schematics", []):
                self.assertTrue(_resolve_local_path(root, relative_path).is_file())

    def test_synthetic_declares_exactly_three_dnp_assembly_variants(self) -> None:
        manifest = json.loads(fixture_manifest("synthetic").read_text(encoding="utf-8"))
        variants = manifest["variants"]
        expected_names = ["default", "dnp-led", "assembly-reduced"]
        self.assertEqual(len(variants), len(expected_names))
        self.assertEqual([variant["name"] for variant in variants], expected_names)
        self.assertEqual(len({variant["name"] for variant in variants}), len(variants))
        self.assertIn("default", {variant["name"] for variant in variants})

        project = json.loads(
            fixture_entrypoint("synthetic", "project").read_text(encoding="utf-8")
        )
        project_variants = project.get("schematic", {}).get("variants")
        self.assertIsInstance(project_variants, list)
        self.assertEqual(
            [variant["name"] for variant in project_variants], expected_names
        )

        board_names, board_assignments = _synthetic_board_variants()
        self.assertEqual(board_names, expected_names)
        self.assertEqual(
            board_assignments["D1"],
            {"default": False, "dnp-led": True, "assembly-reduced": True},
        )
        self.assertEqual(
            board_assignments["R1"],
            {"default": False, "dnp-led": False, "assembly-reduced": True},
        )
        self.assertEqual(
            _synthetic_schematic_variants(),
            {
                "D1": {"default": False, "dnp-led": True, "assembly-reduced": True},
                "R1": {"default": False, "dnp-led": False, "assembly-reduced": True},
            },
        )

        board_text = fixture_entrypoint("synthetic", "board").read_text(encoding="utf-8")
        references = set(_REFERENCE_RE.findall(board_text))
        self.assertGreaterEqual(references, {"J1", "R1", "D1"})
        for variant in variants:
            self.assertTrue(variant["assembly"])
            self.assertIsInstance(variant["dnp"], list)
            self.assertTrue(set(variant["dnp"]).issubset(references))
        self.assertEqual(next(v for v in variants if v["name"] == "default")["dnp"], [])
        self.assertEqual(next(v for v in variants if v["name"] == "dnp-led")["dnp"], ["D1"])

    def test_recordings_are_scrubbed_deterministic_inputs(self) -> None:
        for name in FIXTURE_NAMES:
            recording_path = fixture_recording(name)
            recording = json.loads(recording_path.read_text(encoding="utf-8"))
            self.assertEqual(recording["schema_version"], 1)
            self.assertEqual(recording["fixture"], name)
            self.assertEqual(recording["tool"], {"name": "kicad-cli", "version": "10.0.4"})
            self.assertTrue(recording["commands"])
            for command in recording["commands"]:
                self.assertEqual(command["argv"][0:1], ["kicad-cli"])
                self.assertEqual(command["exit_code"], 0)
                self.assertIsInstance(command["stdout"], list)
                self.assertIsInstance(command["stderr"], list)
                normalized_output = command["normalized_output"]
                self.assertTrue(
                    normalized_output.get("board_parsed")
                    or normalized_output.get("schematic_parsed")
                    or normalized_output.get("jobset_parsed")
                )
                for argument in command["argv"]:
                    self.assertIsNone(_ABSOLUTE_PATH_RE.search(argument), argument)
                    self.assertNotIn("${HOME}", argument)
                    self.assertNotIn("/tmp/", argument)

            serialized = recording_path.read_text(encoding="utf-8")
            self.assertNotIn("recorded_at", serialized)
            self.assertNotIn("timestamp", serialized)
            self.assertNotIn("secret", serialized.lower())

    def test_fixture_sources_have_no_machine_specific_paths_or_external_job_commands(self) -> None:
        for name in FIXTURE_NAMES:
            for path in fixture_root(name).rglob("*"):
                if not path.is_file() or path.suffix.lower() in {".step", ".stp", ".wrl"}:
                    continue
                text = path.read_text(encoding="utf-8", errors="replace")
                self.assertIsNone(_ABSOLUTE_PATH_RE.search(text), path)
                self.assertNotIn("special_execute", text, path)
                self.assertNotIn("KICAD9_3RD_PARTY", text, path)

    def test_default_host_missing_cli_skips_but_executor_missing_cli_fails(self) -> None:
        class DefaultHostProbe(unittest.TestCase):
            @requires_kicad_cli()
            def test_live(self) -> None:
                pass

        class ExecutorProbe(unittest.TestCase):
            @requires_kicad_cli()
            def test_live(self) -> None:
                pass

        with patch.dict(os.environ, clear=False):
            os.environ.pop(EXECUTOR_IMAGE_ENV, None)
            os.environ.pop("KICAD_CLI", None)
            with patch.object(support.shutil, "which", return_value=None):
                default_result = unittest.TestResult()
                DefaultHostProbe("test_live").run(default_result)
        self.assertEqual(len(default_result.skipped), 1)
        self.assertFalse(default_result.failures)

        with patch.dict(
            os.environ,
            {EXECUTOR_IMAGE_ENV: EXPECTED_KICAD_IMAGE},
            clear=False,
        ):
            os.environ.pop("KICAD_CLI", None)
            with patch.object(support.shutil, "which", return_value=None):
                executor_result = unittest.TestResult()
                ExecutorProbe("test_live").run(executor_result)
        self.assertEqual(len(executor_result.failures), 1)
        self.assertFalse(executor_result.skipped)

    @requires_kicad_cli()
    def test_live_cli_parses_all_three_fixture_entrypoints(self) -> None:
        cli = kicad_cli_executable()
        with tempfile.TemporaryDirectory() as temporary:
            output_root = Path(temporary)
            live_roots: dict[str, Path] = {}
            for name in FIXTURE_NAMES:
                live_root = output_root / f"fixture-{name}"
                shutil.copytree(fixture_root(name), live_root)
                live_roots[name] = live_root
                jobset = live_root / fixture_entrypoint(name, "jobset").relative_to(
                    fixture_root(name)
                )
                project = live_root / fixture_entrypoint(name, "project").relative_to(
                    fixture_root(name)
                )
                jobset_result = run_kicad_cli(
                    "jobset",
                    "run",
                    "--stop-on-error",
                    "--file",
                    jobset.name,
                    project.name,
                    cwd=live_root,
                )
                self.assertEqual(
                    jobset_result.returncode,
                    0,
                    f"{name} jobset execution failed with {cli}:\n"
                    f"{jobset_result.stdout}\n{jobset_result.stderr}",
                )

                board = live_root / fixture_entrypoint(name, "board").relative_to(
                    fixture_root(name)
                )
                board_report = output_root / f"{name}-drc.json"
                board_result = run_kicad_cli(
                    "pcb",
                    "drc",
                    "--output",
                    str(board_report),
                    str(board),
                    cwd=live_root,
                )
                self.assertEqual(
                    board_result.returncode,
                    0,
                    f"{name} board parse failed with {cli}:\n"
                    f"{board_result.stdout}\n{board_result.stderr}",
                )
                self.assertTrue(board_report.is_file(), board_result.stderr)

                schematic = live_root / fixture_entrypoint(name, "schematic").relative_to(
                    fixture_root(name)
                )
                schematic_pdf = output_root / f"{name}.pdf"
                schematic_result = run_kicad_cli(
                    "sch",
                    "export",
                    "pdf",
                    "-o",
                    str(schematic_pdf),
                    str(schematic),
                    cwd=live_root,
                )
                self.assertEqual(
                    schematic_result.returncode,
                    0,
                    f"{name} schematic parse failed with {cli}:\n"
                    f"{schematic_result.stdout}\n{schematic_result.stderr}",
                )
                self.assertTrue(schematic_pdf.is_file(), schematic_result.stderr)

            def export_population(variant: str) -> set[str]:
                output = output_root / f"synthetic-{variant}.csv"
                result = run_kicad_cli(
                    "sch",
                    "export",
                    "bom",
                    "--variant",
                    variant,
                    "--exclude-dnp",
                    "--output",
                    str(output),
                    str(
                        live_roots["synthetic"]
                        / fixture_entrypoint("synthetic", "schematic").relative_to(
                            fixture_root("synthetic")
                        )
                    ),
                    cwd=live_roots["synthetic"],
                )
                self.assertEqual(
                    result.returncode,
                    0,
                    f"named synthetic variant {variant!r} BOM export failed with "
                    f"{cli}:\n{result.stdout}\n{result.stderr}",
                )
                self.assertTrue(output.is_file(), result.stderr)
                with output.open(newline="", encoding="utf-8") as stream:
                    rows = list(csv.DictReader(stream))
                return {
                    reference.strip()
                    for row in rows
                    for reference in row["Refs"].split(",")
                    if reference.strip()
                }

            self.assertEqual(export_population("default"), {"D1", "R1"})
            self.assertEqual(export_population("dnp-led"), {"R1"})
            self.assertEqual(export_population("assembly-reduced"), set())


if __name__ == "__main__":
    unittest.main()
