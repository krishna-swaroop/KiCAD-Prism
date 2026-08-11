"""R5 board fact projections and their read-only/live boundaries."""

from __future__ import annotations

import copy
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.release_studio.projections import (
    build_board_projections,
    project_board_stats,
    project_stackup,
    project_variants,
)
from tests.release_studio_support import (
    fixture_entrypoint,
    fixture_root,
    requires_kicad_cli,
    run_kicad_cli,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _assert_owned_stats_dates_absent(
    test_case: unittest.TestCase,
    value: object,
    *,
    wrapper: bool = False,
) -> None:
    test_case.assertIsInstance(value, dict)
    metadata = value.get("metadata")
    if isinstance(metadata, dict):
        test_case.assertNotIn("date", metadata)
    if wrapper:
        stats = value.get("stats")
        test_case.assertIsInstance(stats, dict)
        stats_metadata = stats.get("metadata")
        if isinstance(stats_metadata, dict):
            test_case.assertNotIn("date", stats_metadata)


class ReleaseStudioProjectionTests(unittest.TestCase):
    def test_board_stats_reuses_r4_boundary_without_mutating_input(self) -> None:
        raw = {
            "metadata": {
                "date": "2026-08-11T00:00:00Z",
                "generator": "KiCad 10.0.4",
            },
            "board": {
                "has_outline": True,
                "width": "30 mm",
                "height": "15 mm",
                "board_thickness": "1.6 mm",
            },
            "nested": {"metadata": {"date": "nested volatile value", "keep": True}},
        }
        original = copy.deepcopy(raw)

        projected = project_board_stats(raw)

        self.assertEqual(raw, original)
        self.assertEqual(projected["metadata"], {"generator": "KiCad 10.0.4"})
        self.assertEqual(
            projected["nested"],
            {"metadata": {"date": "nested volatile value", "keep": True}},
        )
        self.assertEqual(projected["board"]["board_thickness"], "1.6 mm")
        _assert_owned_stats_dates_absent(self, projected)

    def test_known_r4_wrapper_canonicalizes_only_owned_stats_paths(self) -> None:
        wrapper = {
            "metadata": {"date": "wrapper date", "owner": "R4"},
            "stats": {
                "metadata": {"date": "raw stats date", "generator": "KiCad 10.0.4"},
                "board": {"board_thickness": "1.6 mm"},
            },
            "nested": {"metadata": {"date": "unrelated date", "keep": True}},
        }
        original = copy.deepcopy(wrapper)

        projected = project_board_stats(wrapper)

        self.assertEqual(wrapper, original)
        _assert_owned_stats_dates_absent(self, projected, wrapper=True)
        self.assertEqual(projected["stats"]["metadata"]["generator"], "KiCad 10.0.4")
        self.assertEqual(
            projected["nested"]["metadata"],
            {"date": "unrelated date", "keep": True},
        )

    def test_object_json_text_does_not_probe_path_for_filename_length(self) -> None:
        raw_text = json.dumps(
            {
                "metadata": {"date": "volatile", "generator": "KiCad 10.0.4"},
                "board": {"board_thickness": "1.6 mm"},
            }
        )

        with patch("pathlib.Path.is_file", side_effect=OSError("filename too long")):
            projected = project_board_stats(raw_text)

        _assert_owned_stats_dates_absent(self, projected)

    def test_stackup_uses_authoritative_cynthion_layer_order_and_thickness(self) -> None:
        board = fixture_entrypoint("cynthion", "board")

        projection = project_stackup(board)

        self.assertTrue(projection["present"])
        self.assertEqual(
            projection["copper_layers"],
            ["F.Cu", "In1.Cu", "In2.Cu", "In3.Cu", "In4.Cu", "B.Cu"],
        )
        self.assertEqual(
            projection["dielectric_layers"],
            ["dielectric 1", "dielectric 2", "dielectric 3", "dielectric 4", "dielectric 5"],
        )
        self.assertEqual(projection["layers"][1]["type"], "Top Solder Paste")
        dielectric_1 = next(
            layer for layer in projection["layers"] if layer["name"] == "dielectric 1"
        )
        self.assertEqual(dielectric_1["material"], "3313")
        self.assertEqual(dielectric_1["thickness"], 0.0994)
        self.assertEqual(dielectric_1["epsilon_r"], 4.05)
        self.assertEqual(projection["board_thickness"], 1.5584)
        self.assertEqual(projection["total_thickness"], 1.5584)
        self.assertEqual(projection["total_thickness_status"], "available")
        self.assertEqual(projection["settings"]["copper_finish"], "None")
        self.assertEqual(projection["settings"]["dielectric_constraints"], False)
        self.assertGreater(projection["via_count"], 0)
        self.assertEqual(projection["via_type_counts"]["blind"], 0)

    def test_derived_stackup_preserves_explicit_via_span_and_missing_values(self) -> None:
        source_board = fixture_entrypoint("cynthion", "board")
        original_digest = _sha256(source_board)
        via = """
  (via blind
    (at 10 10)
    (size 0.45)
    (drill 0.2)
    (layers "F.Cu" "In2.Cu")
  )
"""
        with tempfile.TemporaryDirectory() as temporary:
            derived_board = Path(temporary) / source_board.name
            source_text = source_board.read_text(encoding="utf-8")
            closing = source_text.rfind(")")
            derived_board.write_text(
                source_text[:closing] + via + source_text[closing:],
                encoding="utf-8",
            )

            projection = project_stackup(derived_board)

        self.assertEqual(_sha256(source_board), original_digest)
        self.assertEqual(projection["via_type_counts"]["blind"], 1)
        self.assertEqual(
            next(
                span
                for span in projection["via_spans"]
                if span["via_type"] == "blind"
            ),
            {
                "via_type": "blind",
                "start_layer": "F.Cu",
                "stop_layer": "In2.Cu",
                "span_layers": ["F.Cu", "In1.Cu", "In2.Cu"],
                "span_layer_count": 3,
                "backdrill": None,
                "tertiary_drill": None,
                "count": 1,
            },
        )

    def test_missing_stackup_is_explicit_and_not_derived_from_board_thickness(self) -> None:
        projection = project_stackup(fixture_entrypoint("synthetic", "board"))

        self.assertFalse(projection["present"])
        self.assertEqual(projection["source"], "board.layers")
        self.assertIsNone(projection["total_thickness"])
        self.assertEqual(projection["total_thickness_status"], "unsupported")
        f_cu = next(layer for layer in projection["layers"] if layer["name"] == "F.Cu")
        self.assertEqual(f_cu["kind"], "copper")
        self.assertIsNone(f_cu["thickness"])

    def test_synchronized_variants_union_sources_with_stable_default(self) -> None:
        board = fixture_entrypoint("synthetic", "board")
        project = fixture_entrypoint("synthetic", "project")
        schematic = fixture_entrypoint("synthetic", "schematic")

        projection = project_variants(board, project, schematic)

        self.assertFalse(projection["diverged"])
        self.assertEqual(
            projection["ordering"], ["default", "dnp-led", "assembly-reduced"]
        )
        self.assertEqual(
            projection["default"],
            {"name": "default", "sources": ["board", "project", "schematic"]},
        )
        self.assertEqual(
            projection["source_membership"],
            {"board": True, "project": True, "schematic": True},
        )
        dnp_led = next(
            variant for variant in projection["variants"] if variant["name"] == "dnp-led"
        )
        self.assertEqual(dnp_led["sources"], ["board", "project", "schematic"])
        self.assertEqual(dnp_led["declarations"]["board"]["assignments"]["D1"], True)
        self.assertEqual(dnp_led["declarations"]["schematic"]["assignments"]["D1"], True)

    def test_desynchronized_project_declaration_is_union_and_divergence(self) -> None:
        board = fixture_entrypoint("synthetic", "board")
        schematic = fixture_entrypoint("synthetic", "schematic")
        project_source = fixture_entrypoint("synthetic", "project")
        original_digests = {
            path: _sha256(path) for path in (board, schematic, project_source)
        }

        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / project_source.name
            payload = json.loads(project_source.read_text(encoding="utf-8"))
            payload["schematic"]["variants"].append(
                {"name": "project-only", "description": "Declared only in the project"}
            )
            project.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

            projection = project_variants(board, project, schematic)

        self.assertTrue(projection["diverged"])
        self.assertIn("project-only", projection["ordering"])
        project_only = next(
            variant for variant in projection["variants"] if variant["name"] == "project-only"
        )
        self.assertEqual(project_only["sources"], ["project"])
        self.assertEqual(
            project_only["source_membership"],
            {"board": False, "project": True, "schematic": False},
        )
        self.assertTrue(
            any(
                difference["left"] == "board" and difference["right"] == "project"
                and "project-only" in difference["missing_in_left"]
                for difference in projection["divergence_reasons"]
            )
        )
        self.assertEqual(
            {path: _sha256(path) for path in (board, schematic, project_source)},
            original_digests,
        )

    def test_projections_are_deterministic_and_do_not_open_sources_for_writing(self) -> None:
        board = fixture_entrypoint("synthetic", "board")
        project = fixture_entrypoint("synthetic", "project")
        schematic = fixture_entrypoint("synthetic", "schematic")
        raw_stats = {
            "metadata": {"date": "volatile", "generator": "KiCad 10.0.4"},
            "board": {"board_thickness": "1.6 mm", "has_outline": True},
        }

        with patch("pathlib.Path.open", autospec=True, side_effect=Path.open) as open_mock:
            first = build_board_projections(
                board,
                project,
                schematic,
                board_stats=raw_stats,
            )
            second = build_board_projections(
                board,
                project,
                schematic,
                board_stats=raw_stats,
            )

        self.assertEqual(
            json.dumps(first, sort_keys=True, separators=(",", ":")),
            json.dumps(second, sort_keys=True, separators=(",", ":")),
        )
        _assert_owned_stats_dates_absent(self, first["board_stats"])
        for call in open_mock.call_args_list:
            mode = call.kwargs.get("mode", "r")
            self.assertNotIn("w", mode)
            self.assertNotIn("a", mode)
            self.assertNotIn("+", mode)

    def test_missing_board_stats_is_explicitly_unsupported(self) -> None:
        projection = build_board_projections(fixture_entrypoint("synthetic", "board"))

        self.assertEqual(projection["board_stats"]["status"], "unsupported")
        self.assertEqual(
            projection["board_stats"]["source"],
            "kicad-cli pcb export stats --format json",
        )


class ReleaseStudioProjectionLiveTests(unittest.TestCase):
    @requires_kicad_cli()
    def test_kicad_10_0_4_board_stats_feed_projection_without_date(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            live_root = Path(temporary) / "cynthion"
            shutil.copytree(fixture_root("cynthion"), live_root)
            board = live_root / fixture_entrypoint("cynthion", "board").relative_to(
                fixture_root("cynthion")
            )
            stats_path = Path(temporary) / "board-stats.json"
            result = run_kicad_cli(
                "pcb",
                "export",
                "stats",
                "--format",
                "json",
                "--output",
                str(stats_path),
                str(board),
                cwd=live_root,
            )
            self.assertEqual(
                result.returncode,
                0,
                f"board stats export failed:\n{result.stdout}\n{result.stderr}",
            )
            raw = json.loads(stats_path.read_text(encoding="utf-8"))
            projected = project_board_stats(stats_path)

        self.assertIn("metadata", raw)
        self.assertIn("date", raw["metadata"])
        self.assertEqual(projected["metadata"]["generator"], raw["metadata"]["generator"])
        self.assertEqual(projected["board"], raw["board"])
        self.assertNotIn("date", projected["metadata"])
        _assert_owned_stats_dates_absent(self, projected)


if __name__ == "__main__":
    unittest.main()
