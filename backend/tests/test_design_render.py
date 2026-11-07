"""Unit rules for ``render_view``: coordinates, highlight boxes, cache key, PNG caps.

The integration test beside this one runs kicad-cli; these tests need neither
KiCad nor a database.
"""

from __future__ import annotations

import io
import random
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import derived_assets
from app.services.design_render import geometry, plots, service


class CoordinateMappingTests(unittest.TestCase):
    def test_kicad_cli_page_mm_is_one_svg_unit(self) -> None:
        # kicad-cli 10 with --exclude-drawing-sheet and --page-size-mode 1.
        self.assertEqual(plots.page_mm_to_svg(0, 0), (0, 0))
        self.assertEqual(plots.page_mm_to_svg(20, 20), (20, 20))

    def test_view_box_parses_the_page_frame(self) -> None:
        svg = '<svg width="297mm" height="210mm" viewBox="0.0000 0.0000 297.0022 210.0072"></svg>'
        box = plots.parse_view_box(svg)
        self.assertAlmostEqual(box.max_x, 297.0022)
        self.assertAlmostEqual(box.max_y, 210.0072)

    def test_a_plot_without_a_view_box_is_refused(self) -> None:
        with self.assertRaises(plots.PlotError):
            plots.parse_view_box("<svg></svg>")

    def test_output_size_keeps_the_requested_width_and_the_region_aspect(self) -> None:
        width, height = plots.output_size(geometry.Box(0, 0, 40, 20), 800)
        self.assertEqual((width, height), (800, 400))

    def test_width_is_bounded(self) -> None:
        with self.assertRaises(ValueError):
            plots.output_size(geometry.Box(0, 0, 10, 10), plots.MIN_WIDTH - 1)
        with self.assertRaises(ValueError):
            plots.output_size(geometry.Box(0, 0, 10, 10), plots.MAX_WIDTH + 1)


class HighlightBoxTests(unittest.TestCase):
    def _footprint(self, **overrides):
        value = {
            "uuid": "88322bda-6cf9-5219-94c9-e6fbd6d08eb1",
            "reference": "R1",
            "side": "front",
            "positionNm": {"xNm": 10_000_000, "yNm": 20_000_000},
            "rotationDeg": 0,
            "courtyardBounds": {
                "minNm": {"xNm": -1_000_000, "yNm": -2_000_000},
                "maxNm": {"xNm": 3_000_000, "yNm": 4_000_000},
            },
            "pads": [
                {
                    "number": "1",
                    "positionNm": {"xNm": 9_000_000, "yNm": 20_000_000},
                    "size": {"xNm": 2_000_000, "yNm": 1_000_000},
                }
            ],
        }
        value.update(overrides)
        return value

    def test_rotation_maps_the_local_courtyard_into_the_board_frame(self) -> None:
        box = geometry.courtyard_box(self._footprint(rotationDeg=90))
        self.assertEqual(box, geometry.Box(8, 17, 14, 21))

    def test_a_back_side_footprint_uses_the_same_transform(self) -> None:
        front = geometry.courtyard_box(self._footprint(rotationDeg=90))
        back = geometry.courtyard_box(self._footprint(rotationDeg=90, side="back"))
        self.assertEqual(front, back)

    def test_without_a_courtyard_the_pads_extent_is_used(self) -> None:
        box = geometry.footprint_box(self._footprint(courtyardBounds=None, rotationDeg=90))
        self.assertEqual(box, geometry.Box(8.5, 19, 9.5, 21))

    def test_a_schematic_component_is_its_anchor_plus_a_margin(self) -> None:
        document = {
            "path": "board/plain.kicad_sch",
            "objects": [
                {
                    "kind": "symbol",
                    "uuid": "11111111-1111-5111-8111-111111111111",
                    "refdes": "R1",
                    "at": {"xNm": 20_000_000, "yNm": 20_000_000},
                },
                {
                    "kind": "pin",
                    "uuid": "22222222-2222-5222-8222-222222222222",
                    "parentUuid": "11111111-1111-5111-8111-111111111111",
                    "number": "1",
                    "refdes": "R1",
                    "at": {"xNm": 20_000_000, "yNm": 20_000_000},
                },
            ],
        }
        box = geometry.component_highlight_schematic(document, "R1").box
        self.assertEqual(box, geometry.Box(17.46, 17.46, 22.54, 22.54))

    def test_a_net_box_unions_its_pin_boxes(self) -> None:
        document = {
            "objects": [
                {"kind": "symbol", "uuid": "a", "refdes": "R1", "at": {"xNm": 10_000_000, "yNm": 10_000_000}},
                {"kind": "pin", "parentUuid": "a", "number": "1", "at": {"xNm": 10_000_000, "yNm": 10_000_000}},
                {"kind": "symbol", "uuid": "b", "refdes": "R2", "at": {"xNm": 30_000_000, "yNm": 20_000_000}},
                {"kind": "pin", "parentUuid": "b", "number": "1", "at": {"xNm": 30_000_000, "yNm": 20_000_000}},
            ]
        }
        box = geometry.net_highlight_schematic(
            document,
            [{"reference": "R1", "pin": "1"}, {"reference": "R2", "pin": "1"}],
            "N1",
        ).box
        self.assertEqual(box, geometry.Box(7.46, 7.46, 32.54, 22.54))

    def test_an_unknown_highlight_is_not_found(self) -> None:
        self.assertFalse(geometry.component_highlight({}, "X99").found)
        self.assertFalse(geometry.component_highlight_schematic({"objects": []}, "X99").found)


class RegionTests(unittest.TestCase):
    def test_fit_adds_fifteen_percent_of_the_longest_side(self) -> None:
        box = geometry.fit_region(
            [geometry.Box(-1, -1, 1, 1), geometry.Box(3, 3, 5, 5)],
            geometry.Box(0, 0, 100, 100),
        )
        self.assertAlmostEqual(box.min_x, -1.9)
        self.assertAlmostEqual(box.min_y, -1.9)
        self.assertAlmostEqual(box.max_x, 5.9)
        self.assertAlmostEqual(box.max_y, 5.9)

    def test_fit_enforces_a_minimum_size(self) -> None:
        box = geometry.fit_region([geometry.Box(10, 10, 10, 10)], geometry.Box(0, 0, 100, 100))
        self.assertGreaterEqual(box.width, geometry.MIN_REGION_MM)
        self.assertGreaterEqual(box.height, geometry.MIN_REGION_MM)

    def test_no_highlight_uses_the_whole_frame(self) -> None:
        whole = geometry.Box(0, 0, 60, 40)
        self.assertEqual(geometry.fit_region([], whole), whole)


class CacheKeyTests(unittest.TestCase):
    def test_defaults_order_and_case_do_not_split_the_cache(self) -> None:
        first = service.normalize_request(
            {"view": "pcb", "highlight": {"components": ["R2", "R1", "R1"]}, "revision": "main"}
        )
        second = service.normalize_request(
            {
                "view": "PCB",
                "layers": "front",
                "side": "top",
                "width": 1200,
                "highlight": {"components": ["R1", "R2"], "nets": []},
            }
        )
        self.assertEqual(first, second)
        self.assertEqual(service.render_id("p1", "a" * 40, first), service.render_id("p1", "a" * 40, second))

    def test_region_is_normalised_to_nanometres(self) -> None:
        normalized = service.normalize_request(
            {"view": "pcb", "region": {"x": 1.0000004, "y": 2, "width": 3.0000004, "height": 4}}
        )
        self.assertEqual(normalized["region"], {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0})

    def test_an_invalid_width_or_region_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            service.normalize_request({"view": "pcb", "width": 255})
        with self.assertRaises(ValueError):
            service.normalize_request(
                {"view": "pcb", "region": {"x": 0, "y": 0, "width": 0, "height": 1}}
            )

    def test_fields_the_view_ignores_are_pinned_to_defaults(self) -> None:
        self.assertEqual(
            service.normalize_request({"view": "schematic", "layers": "back", "side": "bottom"})["layers"],
            "front",
        )
        self.assertEqual(service.normalize_request({"view": "pcb", "side": "bottom"})["side"], "top")
        self.assertEqual(service.normalize_request({"view": "3d", "layers": "all"})["layers"], "front")

    def test_commit_and_project_are_part_of_the_id(self) -> None:
        request = service.normalize_request({"view": "schematic"})
        self.assertNotEqual(
            service.render_id("p1", "a" * 40, request), service.render_id("p1", "b" * 40, request)
        )
        self.assertNotEqual(
            service.render_id("p1", "a" * 40, request), service.render_id("p2", "a" * 40, request)
        )


class PngCapTests(unittest.TestCase):
    def test_a_large_png_is_shrunk_under_the_cap(self) -> None:
        try:
            from PIL import Image
        except ImportError:  # pragma: no cover - Pillow is a runtime dependency
            self.skipTest("Pillow is not installed")
        width = height = 1400
        random.seed(7)
        pixels = bytes(random.randrange(256) for _ in range(width * height * 4))
        image = Image.frombytes("RGBA", (width, height), pixels)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        original = buffer.getvalue()
        self.assertGreater(len(original), plots.MAX_RENDER_BYTES)

        png, size_x, size_y = plots.cap_png(original, width, height)
        self.assertLessEqual(len(png), plots.MAX_RENDER_BYTES)
        self.assertLess(size_x, width)
        self.assertGreaterEqual(size_x, plots.MIN_WIDTH)
        self.assertEqual(size_y, round(size_x * height / width))

    def test_a_small_png_is_unchanged(self) -> None:
        png, width, height = plots.cap_png(b"small", 800, 600)
        self.assertEqual((png, width, height), (b"small", 800, 600))

    def test_minimum_width_is_honoured(self) -> None:
        self.assertEqual(plots.MIN_WIDTH, 256)
        self.assertEqual(plots.MAX_WIDTH, 2048)


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(
            mock.patch.object(derived_assets, "derived_root", return_value=self.root)
        )

    def test_a_render_is_a_png_beside_its_record(self) -> None:
        path, size = derived_assets.store_render(
            "/repo/board", "a" * 64, b"\x89PNG", {"renderId": "a" * 64, "createdAt": 1}
        )
        self.assertEqual(size, 4)
        self.assertTrue(path.is_file())
        self.assertEqual(derived_assets.find_render("/repo/board", "a" * 64)["renderId"], "a" * 64)
        self.assertEqual(derived_assets.find_render_png("/repo/board", "a" * 64), path)

    def test_the_oldest_renders_are_pruned_past_the_budget(self) -> None:
        for index, render_id in enumerate(("0" * 64, "1" * 64, "2" * 64), start=1):
            derived_assets.store_render(
                "/repo/board",
                render_id,
                b"\x89PNG",
                {"renderId": render_id, "createdAt": index},
            )
        self.assertEqual(derived_assets.prune_renders("/repo/board", keep=2), 1)
        self.assertIsNone(derived_assets.find_render("/repo/board", "0" * 64))
        self.assertIsNotNone(derived_assets.find_render("/repo/board", "1" * 64))
        self.assertIsNotNone(derived_assets.find_render("/repo/board", "2" * 64))

    def test_the_default_budget_is_one_hundred(self) -> None:
        self.assertEqual(derived_assets.RENDER_BUDGET, 100)


class RetryStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(
            mock.patch.object(derived_assets, "derived_root", return_value=self.root)
        )
        self.project_path = str(self.root / "board")
        self.anchor = "plain.kicad_pro"
        self.project = SimpleNamespace(
            id="p1", path=self.project_path, project_file=self.anchor
        )
        self.row = {
            "id": "p1",
            "path": self.project_path,
            "project_file_rel": self.anchor,
        }
        self.enterContext(
            mock.patch.object(
                service.workspace, "get_project_by_id", return_value=self.row
            )
        )
        self.render_id = "a" * 64
        self.payload = {
            "project_id": "p1",
            "project_file_rel": self.anchor,
            "commit": "b" * 40,
            "render_id": self.render_id,
            "request": {"view": "pcb"},
        }

    def _context(self, job_id: str = "job-1") -> SimpleNamespace:
        return SimpleNamespace(payload=self.payload, job_id=job_id)

    def test_a_retryable_failure_leaves_the_record_retrying(self) -> None:
        retryable = service.RetryableJobError("bundle is still building")
        with (
            mock.patch.object(service, "_render", side_effect=retryable),
            self.assertRaises(service.RetryableJobError),
        ):
            service.run_render_view_job(self._context())

        record = derived_assets.find_render(
            self.project_path, self.render_id, anchor=self.anchor
        )
        self.assertEqual(record["status"], "running")

        # A record written `failed` by an earlier attempt is not final while
        # the job itself is still active.
        record["status"] = "failed"
        derived_assets.write_render_record(
            self.project_path, self.render_id, record, anchor=self.anchor
        )
        job = SimpleNamespace(get=lambda _job_id: {"status": "retry_wait"})
        with mock.patch("app.services.job_service.jobs", job):
            answered = service.get_render(self.project, self.render_id)
        self.assertEqual(answered["status"], "retry_wait")


if __name__ == "__main__":
    unittest.main()
