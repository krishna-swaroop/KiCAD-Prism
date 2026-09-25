"""Stage 2 acceptance: the Documentation Engine.

The decisive properties are that a sheet is *reproducible* -- two renders of
the same inputs are byte-identical, and nothing build-time reaches the page --
and that placed artwork is placed at a stated, measurable scale.
"""

from __future__ import annotations

import io
import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # pragma: no cover - import bootstrap
    sys.path.insert(0, str(REPO_ROOT))

from app.release_studio.documents import compose, render_pdf, render_svg  # noqa: E402
from app.release_studio.documents import artwork as artwork_module  # noqa: E402
from app.release_studio.documents import sheets as sheet_templates  # noqa: E402
from app.release_studio.documents.layout import (  # noqa: E402
    Rect,
    SheetBuilder,
    Table,
    draw_table,
    fit_text,
    fmt,
    text_width,
)


def _page(result, key: str) -> str:
    """Decode the in-memory SVG for one composed page."""

    return result.page_svg(key).decode("utf-8")

try:  # pragma: no cover - exercised by whichever branch the environment takes
    import pikepdf  # noqa: F401

    _HAS_PIKEPDF = True
except ImportError:  # pragma: no cover
    _HAS_PIKEPDF = False

CONTEXT = {
    "title": "Example Board",
    "document_number": "DOC-1",
    "revision": "A",
    "commit_sha": "a" * 40,
    "variant": "default",
    "commit_date": "2026-08-11",
}
# These mirror the *actual* shapes the R5 projections return for a real board:
# `board` holds pre-formatted strings with units, and `drill_holes` is a list of
# hole groups rather than a summary object. Inventing a friendlier shape here is
# exactly what let the engine ship a table that crashed on real input.
STATS = {
    "board": {
        "width": "50.0000 mm",
        "height": "40.0000 mm",
        "area": "2000.00 mm²",
        "board_thickness": "1.6000 mm",
        "min_drill_diameter": "0.3000 mm",
        "min_track_width": "0.2000 mm",
        "min_track_clearance": "0.2000 mm",
    },
    "pads": {"through_hole": 18, "smd": 119, "npth": 2, "castellated": 0, "press_fit": 0},
    "components": {"total": {"front": 37, "back": 0, "total": 37}},
    "drill_holes": [
        {"count": 21, "plated": True, "shape": "Round", "source": "Via",
         "start_layer": "F.Cu", "stop_layer": "B.Cu",
         "x_size": "0.3000 mm", "y_size": "0.3000 mm"},
        {"count": 12, "plated": True, "shape": "Round", "source": "Pad",
         "start_layer": "F.Cu", "stop_layer": "B.Cu",
         "x_size": "0.4000 mm", "y_size": "0.4000 mm"},
    ],
}
STACKUP = {
    "board_thickness": 1.6,
    "copper_layer_count": 2,
    "settings": {
        "copper_finish": "ENIG",
        "dielectric_constraints": True,
        "edge_connector": None,
        "edge_plating": False,
    },
    "layers": [
        {"name": "F.Cu", "kind": "copper", "type": "signal",
         "thickness": None, "material": None, "epsilon_r": None, "user_name": None},
        {"name": "B.Cu", "kind": "copper", "type": "signal",
         "thickness": None, "material": None, "epsilon_r": None, "user_name": None},
    ],
}
VARIANTS = {"variants": ["default", "lite"], "diverged": False}
PLACEMENTS = [{"side": "top"}] * 3 + [{"side": "bottom"}]
MEMBERS = [
    {"path": "fabrication/gerbers/board-F_Cu.gbr", "canonicalizer": "gerber",
     "released_digest": "a" * 64},
]


def _svg_artwork(width_mm: float, height_mm: float, *, units_per_mm: float = 1.0):
    """A minimal stand-in for `kicad-cli pcb export svg` output."""

    vw = width_mm * units_per_mm
    vh = height_mm * units_per_mm
    text = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_mm}mm" '
        f'height="{height_mm}mm" viewBox="0 0 {vw} {vh}">'
        f'<rect x="0" y="0" width="{vw}" height="{vh}" fill="none" stroke="black"/>'
        "</svg>"
    )
    return artwork_module.AcquiredArtwork(
        layers=("Edge.Cuts",),
        svg_text=text,
        pdf_bytes=b"",
        view_x=0.0,
        view_y=0.0,
        view_width=width_mm,
        view_height=height_mm,
        digest="d" * 64,
    )


class LayoutTests(unittest.TestCase):
    def test_number_formatting_is_stable_and_has_no_negative_zero(self) -> None:
        self.assertEqual(fmt(0.0), "0")
        self.assertEqual(fmt(-0.0001), "0")
        self.assertEqual(fmt(1.5), "1.5")
        self.assertEqual(fmt(1.0), "1")
        self.assertEqual(fmt(1.23456), "1.235")

    def test_text_is_truncated_visibly_rather_than_clipped(self) -> None:
        long = "a-very-long-member-path/that-will-not-fit-in-the-column.gbr"
        fitted = fit_text(long, 20.0, 2.4)
        self.assertNotEqual(fitted, long)
        self.assertTrue(fitted.endswith("…"))
        self.assertLessEqual(text_width(fitted, 2.4), 20.0)

    def test_monospace_width_is_proportional_to_length(self) -> None:
        one = text_width("x", 3.0, family="mono")
        ten = text_width("x" * 10, 3.0, family="mono")
        self.assertAlmostEqual(ten, one * 10, places=6)


class SerializerTests(unittest.TestCase):
    def _sheet(self):
        builder = SheetBuilder("t", "Test Sheet", "A4")
        builder.rect(Rect(10, 10, 100, 50))
        builder.text(20, 20, "Hello (world)")
        draw_table(
            builder,
            Table(columns=("A", "B"), rows=(("1", "2"),), widths=(20.0, 20.0)),
            (10.0, 70.0),
        )
        return builder.build()

    def test_svg_and_pdf_are_both_reproducible(self) -> None:
        sheet = self._sheet()
        self.assertEqual(render_svg(sheet), render_svg(sheet))
        self.assertEqual(render_pdf(sheet), render_pdf(sheet))

    def test_no_timestamp_or_generator_metadata_reaches_the_output(self) -> None:
        sheet = self._sheet()
        svg = render_svg(sheet)
        pdf = render_pdf(sheet)
        for banned in ("CreationDate", "ModDate", "Producer", "Creator"):
            self.assertNotIn(banned, svg)
            self.assertNotIn(banned.encode("ascii"), pdf)
        # A fixed /ID is what keeps the trailer from varying per render.
        self.assertIn(b"/ID [<00000000000000000000000000000000>", pdf)

    def test_the_default_pdf_is_searchable_from_its_embedded_face(self) -> None:
        """Geist sets the visible glyphs, so the text layer is the real text."""

        from pypdf import PdfReader

        pdf = render_pdf(self._sheet())
        text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        self.assertIn("Hello (world)", text)
        self.assertIn(b"/Subtype /Type0", pdf)
        self.assertIn(b"/FontFile2", pdf)
        self.assertIn(b"/ToUnicode", pdf)

    def test_a_newstroke_pdf_stays_searchable_behind_its_vectors(self) -> None:
        """NewStroke draws paths, so search relies on a hidden Base-14 layer.

        The shim exists because the pinned Monkey wheel ships stroke data but no
        embeddable NewStroke face; it goes away once upstream packages one.
        """

        from pypdf import PdfReader

        builder = SheetBuilder("t", "Test Sheet", "A4", typography="kicad-newstroke")
        builder.text(20, 20, "Hello (world)")
        pdf = render_pdf(builder.build())
        text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        self.assertIn("Hello (world)", text)
        self.assertIn(b"/Subtype /Type1", pdf)
        self.assertIn(b"/BaseFont /Helvetica", pdf)
        self.assertIn(b"/Encoding /WinAnsiEncoding", pdf)
        self.assertNotIn(b"/FontFile", pdf)

    def test_pdf_declares_the_sheet_size_in_points(self) -> None:
        sheet = self._sheet()
        pdf = render_pdf(sheet)
        match = re.search(rb"/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]", pdf)
        self.assertIsNotNone(match)
        width = float(match.group(1))  # type: ignore[union-attr]
        self.assertAlmostEqual(width, 297.0 * 72.0 / 25.4, places=2)


class ArtworkPlacementTests(unittest.TestCase):
    def test_extents_are_reported_in_millimetres(self) -> None:
        art = _svg_artwork(50.0, 40.0, units_per_mm=10.0)
        x, y, width, height = artwork_module.extents(art.svg_text)
        self.assertAlmostEqual(width, 50.0, places=6)
        self.assertAlmostEqual(height, 40.0, places=6)
        self.assertEqual((x, y), (0.0, 0.0))
        self.assertAlmostEqual(artwork_module.user_units_per_mm(art.svg_text), 10.0, places=6)

    def test_a_one_to_one_placement_measures_the_board(self) -> None:
        """The scale oracle: 50.000 mm of board occupies 50.000 mm of sheet."""

        art = _svg_artwork(50.0, 40.0, units_per_mm=10.0)
        window = Rect(0.0, 0.0, 200.0, 150.0)
        element, used = artwork_module.place(art, window, scale=1.0)

        self.assertEqual(used, 1.0)
        # The artwork is 10 user units per millimetre, so a 1:1 sheet placement
        # is a group scale of 1/10 -- get this wrong and the drawing lies.
        self.assertAlmostEqual(element.scale, 0.1, places=9)
        # 50 board-mm at scale 1.0, centred in a 200 mm window.
        self.assertAlmostEqual(element.offset_x, 75.0, places=6)
        self.assertAlmostEqual(element.offset_y, 55.0, places=6)

    def test_an_omitted_scale_fits_the_window_and_is_reported(self) -> None:
        art = _svg_artwork(100.0, 50.0)
        element, used = artwork_module.place(art, Rect(0.0, 0.0, 50.0, 50.0))
        self.assertAlmostEqual(used, 0.5, places=9)
        self.assertAlmostEqual(element.scale, 0.5, places=9)

    def test_acquisition_strips_the_plot_time_from_artwork(self) -> None:
        """KiCad stamps the plot time into the SVG title; placing it would make
        every composed sheet differ per build, and hashing it would move the
        clip-path id as well."""

        from app.release_studio.documents.artwork import sanitize_artwork

        raw = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" '
            'viewBox="0 0 10 10">\n'
            "<title>SVG Image created as board.svg date 2026-08-11T17:09:53 </title>\n"
            "<!-- Created by KiCad, date 2026-08-11 -->\n"
            '<rect x="0" y="0" width="10" height="10"/>\n'
            "</svg>"
        )
        cleaned = sanitize_artwork(raw)
        self.assertNotIn("2026-08-11", cleaned)
        self.assertNotIn("SVG Image created", cleaned)
        # Semantically null: the geometry survives untouched.
        self.assertIn('<rect x="0" y="0" width="10" height="10"/>', cleaned)

    def test_scale_labels_read_the_way_a_drawing_states_them(self) -> None:
        self.assertEqual(artwork_module.scale_label(1.0), "1:1")
        self.assertEqual(artwork_module.scale_label(0.5), "1:2")
        self.assertEqual(artwork_module.scale_label(2.0), "2:1")

    def test_placed_artwork_keeps_the_source_geometry_verbatim(self) -> None:
        art = _svg_artwork(50.0, 40.0)
        sheet, _scale, _over = sheet_templates.fabrication_sheet(CONTEXT, STATS, STACKUP, art)
        svg = render_svg(sheet)
        # The acquired markup is inlined, not re-projected.
        self.assertIn('<rect x="0" y="0" width="50.0" height="40.0"', svg)
        self.assertIn("clip-path", svg)


class SheetSizingTests(unittest.TestCase):
    """The sheet is chosen for the drawing, not fixed to one board."""

    def _size(self, width: float, height: float) -> str:
        return sheet_templates.select_sheet_size(width, height)

    def test_bigger_boards_get_bigger_sheets(self) -> None:
        ladder = [
            self._size(w, h)
            for w, h in ((50, 40), (200, 150), (300, 250), (500, 400), (900, 700))
        ]
        self.assertEqual(ladder, ["A4", "A3", "A2", "A1", "A0"])

    def test_content_never_makes_the_sheet_grow(self) -> None:
        """A long table is a reason to draw smaller, not to use more paper.

        Sizing the page for the tables gives a 40 mm board an A2 sheet because
        its stackup has rows, which is exactly the waste this avoids.
        """

        few = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        many = compose(
            context=CONTEXT, stats=STATS,
            stackup={**STACKUP, "layers": STACKUP["layers"] * 20},
            variants=VARIANTS, placements=PLACEMENTS,
            members=[
                dict(MEMBERS[0], path=f"fabrication/gerbers/layer-{index}.gbr")
                for index in range(120)
            ],
        )
        self.assertEqual(few.sheet_size, many.sheet_size)

    def test_tables_are_scaled_to_the_sheet_they_land_on(self) -> None:
        from app.release_studio.documents.layout import MIN_TABLE_FONT, Table, fit_columns

        table = Table(
            columns=("A", "B"),
            rows=tuple(("x", "y") for _ in range(40)),
            widths=(60.0, 60.0),
        )
        fitted, factor = fit_columns([[table]], Rect(0.0, 0.0, 60.0, 90.0))
        self.assertLess(factor, 1.0)
        self.assertLessEqual(fitted[0][0].width(), 60.0)
        self.assertLessEqual(fitted[0][0].height(), 90.0)

    def test_height_alone_never_shrinks_text_below_the_legibility_floor(self) -> None:
        """Too tall has a remedy -- dropping rows. Too wide has none."""

        from app.release_studio.documents.layout import MIN_TABLE_FONT, Table, fit_columns

        table = Table(
            columns=("A", "B"),
            rows=tuple(("x", "y") for _ in range(80)),
            widths=(30.0, 30.0),
        )
        fitted, _factor = fit_columns([[table]], Rect(0.0, 0.0, 120.0, 60.0))
        self.assertGreaterEqual(fitted[0][0].font_size, MIN_TABLE_FONT - 1e-9)
        self.assertLessEqual(fitted[0][0].height(), 60.0)

    def test_a_table_too_tall_to_shrink_carries_its_rows_forward(self) -> None:
        from app.release_studio.documents.layout import Table, split_columns

        table = Table(
            columns=("A", "B"),
            rows=tuple((str(index), "y") for index in range(400)),
            widths=(60.0, 60.0),
        )
        fitted, overflow, _factor = split_columns(
            [[table]], Rect(0.0, 0.0, 60.0, 40.0)
        )
        drawn = fitted[0][0]
        self.assertLessEqual(drawn.height(), 40.0)
        # Nothing is dropped: what did not fit is handed on for a continuation
        # sheet, so the released schedule is complete across the set.
        carried = sum(len(item.rows) for item in overflow)
        self.assertEqual(len(drawn.rows) + carried, len(table.rows))
        self.assertTrue(overflow[0].continued)

    def test_a_measured_overshoot_does_not_cost_rows(self) -> None:
        """A column that misses by a millimetre shrinks; it does not truncate."""

        from app.release_studio.documents.layout import Table, split_columns

        table = Table(
            columns=("A",),
            rows=tuple((f"row {index}",) for index in range(30)),
            widths=(40.0,),
        )
        # Just under the natural height, which is what used to trigger a drop.
        area = Rect(0.0, 0.0, 40.0, table.height() * 0.97)
        fitted, overflow, factor = split_columns([[table]], area)
        self.assertEqual(overflow, [])
        self.assertEqual(len(fitted[0][0].rows), 30)
        self.assertLess(factor, 1.0)
        self.assertLessEqual(fitted[0][0].height(), area.height)

    def test_the_ladder_is_monotonic_in_board_size(self) -> None:
        """A larger board never lands on a smaller sheet."""

        order = {size: index for index, size in enumerate(sheet_templates.SHEET_LADDER)}
        previous = -1
        for edge in range(20, 1200, 20):
            index = order[self._size(edge, edge * 0.8)]
            self.assertGreaterEqual(index, previous)
            previous = index

    def test_a_board_larger_than_a0_lands_on_a0_and_is_reduced(self) -> None:
        size = self._size(2000.0, 1500.0)
        self.assertEqual(size, "A0")
        window = sheet_templates.artwork_window(size, sheet_templates.TABLE_WIDTHS["fabrication"])
        from app.release_studio.documents.layout import preferred_scale

        used = preferred_scale(2000.0, 1500.0, window)
        self.assertLess(used, 1.0)
        self.assertAlmostEqual(used, 0.5, places=9)

    def test_the_predicted_body_matches_the_drawn_one(self) -> None:
        """`select_sheet_size` reasons about a sheet it has not drawn yet."""

        from app.release_studio.documents.layout import Artwork

        for size in sheet_templates.SHEET_LADDER:
            sheet, _scale, _over = sheet_templates.fabrication_sheet(
                CONTEXT, STATS, STACKUP, _svg_artwork(20.0, 15.0), size=size
            )
            placed = next(e for e in sheet.elements if isinstance(e, Artwork))
            expected = sheet_templates.artwork_window(
                size, sheet_templates.TABLE_WIDTHS["fabrication"]
            )
            self.assertEqual(
                (placed.rect.x, placed.rect.y, placed.rect.width, placed.rect.height),
                (expected.x, expected.y, expected.width, expected.height),
                f"{size}: the drawn artwork window disagrees with the predicted one",
            )

    def test_placement_ratios_come_from_the_standard_series(self) -> None:
        from app.release_studio.documents.layout import PREFERRED_SCALES, preferred_scale

        window = Rect(0.0, 0.0, 252.0, 233.0)
        for width, height in ((10, 8), (38, 30), (120, 90), (240, 200), (600, 500)):
            used = preferred_scale(float(width), float(height), window)
            self.assertIn(used, PREFERRED_SCALES)

    def test_a_placed_sheet_states_a_standard_ratio(self) -> None:
        art = _svg_artwork(38.0, 30.0)
        sheet, used, _over = sheet_templates.fabrication_sheet(CONTEXT, STATS, STACKUP, art, size="A3")
        self.assertEqual(used, 5.0)
        self.assertIn("SCALE 5:1", render_svg(sheet))

    def test_the_whole_set_shares_one_sheet_size(self) -> None:
        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        self.assertEqual(result.sheet_size, "A4")
        widths = set()
        for payload in result.page_svgs().values():
            match = re.search(rb'width="([0-9.]+)mm"', payload)
            if match:
                widths.add(match.group(1))
        self.assertEqual(len(widths), 1, f"sheets disagree about their size: {widths}")

    def test_package_size_ignores_page_sized_artwork_frames(self) -> None:
        """A page-sized acquired SVG must not promote a small board to A2."""

        from app.release_studio.documents.engine import board_extent, _select_size
        from app.release_studio.documents.artwork import content_view

        page = _svg_artwork(420.0, 297.0)  # A3 paper frame around a 50x40 board
        width, height = board_extent(STATS)
        self.assertEqual((width, height), (50.0, 40.0))
        self.assertEqual(_select_size(STATS, sheet_templates.TITLE_BLOCK_HEIGHT), "A4")
        placed = content_view(page, width, height)
        self.assertLess(placed.view_width, 420.0)
        self.assertLessEqual(placed.view_width, 50.0 + 5.0)

    def test_table_slack_is_capped(self) -> None:
        """Spare body width must not stretch schedules into ultra-wide columns."""

        size = "A2"
        title_height = sheet_templates.TITLE_BLOCK_HEIGHT
        drawn = 132.0  # board mm at 1:1
        width, _window, _area = sheet_templates.sheet_columns(
            size, "fabrication", title_height, drawn
        )
        base = sheet_templates.TABLE_WIDTHS["fabrication"]
        self.assertLessEqual(width, base + sheet_templates._MAX_TABLE_GROWTH + 0.01)

    def test_wrap_cell_breaks_on_path_separators(self) -> None:
        from app.release_studio.documents.layout import wrap_cell

        lines = wrap_cell("fabrication/gerbers/F_Cu.gbr", 28.0, 2.4)
        self.assertGreater(len(lines), 1)
        self.assertLessEqual(len(lines), 4)
        self.assertTrue(any(line.endswith("/") or "/" not in line for line in lines))


def _plot_paths(origin_x: float, origin_y: float, width: float, height: float) -> str:
    """Four subpaths of one outline, in KiCad's two separator styles.

    Stroked outlines are written ``M126.0000 90.0000`` and filled shapes
    ``M 0.0000,0.0000`` -- an offset reader that understands only one of them
    finds nothing at all on an outline-only plot, which is the drill sheet.
    """

    corners = (
        (origin_x, origin_y),
        (origin_x + width, origin_y),
        (origin_x + width, origin_y + height),
        (origin_x, origin_y + height),
    )
    return "".join(
        f'<path d="M{x:.4f} {y:.4f}\nL{x:.4f} {y:.4f}" />'
        if index % 2
        else f'<path d="M {x:.4f},{y:.4f}\n{x:.4f},{y:.4f}"/>'
        for index, (x, y) in enumerate(corners)
    )


def _page_svg(offset_x: float, offset_y: float, width: float, height: float,
              page: tuple[float, float] = (297.0, 210.0)) -> str:
    """A full-page plot of the same geometry `_cropped_svg` crops to."""

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{page[0]}mm" '
        f'height="{page[1]}mm" viewBox="0 0 {page[0]} {page[1]}">'
        + _plot_paths(offset_x, offset_y, width, height)
        + "</svg>"
    )


def _cropped_svg(width: float, height: float, *, units_per_mm: float = 1.0) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" '
        f'height="{height}mm" viewBox="0 0 {width * units_per_mm} {height * units_per_mm}">'
        + _plot_paths(0.0, 0.0, width * units_per_mm, height * units_per_mm)
        + "</svg>"
    )


class ArtworkPageOffsetTests(unittest.TestCase):
    """`pcb export pdf` cannot crop, so the artwork has to be located on its page.

    Without this the PDF composite fits KiCad's *whole page* into the artwork
    window, which draws the board at the ratio of board-to-page -- about eight
    times smaller than the SCALE the sheet prints, and disagreeing with the SVG
    rendering of the very same sheet.
    """

    def test_the_offset_is_the_translation_between_the_two_plots(self) -> None:
        offset = artwork_module.page_offset(
            _cropped_svg(38.0, 30.0), _page_svg(108.6, 95.6, 38.0, 30.0)
        )
        self.assertEqual(offset, (108.6, 95.6))

    def test_both_of_kicads_separator_styles_are_read(self) -> None:
        """An outline-only plot writes `M126.0000 90.0000`, with no comma."""

        pairs = artwork_module._coordinate_pairs(_cropped_svg(38.0, 30.0))
        self.assertEqual(len(pairs), 4)

    def test_differing_user_units_are_reconciled_before_comparing(self) -> None:
        offset = artwork_module.page_offset(
            _cropped_svg(38.0, 30.0, units_per_mm=10.0),
            _page_svg(108.6, 95.6, 38.0, 30.0),
        )
        self.assertIsNotNone(offset)
        self.assertAlmostEqual(offset[0], 108.6, places=3)  # type: ignore[index]

    def test_plots_that_do_not_line_up_yield_no_offset(self) -> None:
        """A wrong offset would be worse than no composite."""

        # Same number of subpaths, but not the same geometry: the deltas
        # disagree, so there is no single translation between the two plots.
        mismatched = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" '
            'viewBox="0 0 297 210">'
            + _plot_paths(108.6, 95.6, 12.0, 9.0)
            + "</svg>"
        )
        self.assertIsNone(artwork_module.page_offset(_cropped_svg(38.0, 30.0), mismatched))
        self.assertIsNone(artwork_module.page_offset(_cropped_svg(38.0, 30.0), "<svg></svg>"))


@unittest.skipUnless(_HAS_PIKEPDF, "pikepdf is required to composite artwork")
class ArtworkCompositeTests(unittest.TestCase):
    def _overlay(self, page_mm: tuple[float, float] = (297.0, 210.0)) -> bytes:
        import pikepdf

        from app.release_studio.documents.pdf import MM_TO_PT

        pdf = pikepdf.new()
        pdf.add_blank_page(page_size=(page_mm[0] * MM_TO_PT, page_mm[1] * MM_TO_PT))
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()

    def _art(self) -> artwork_module.AcquiredArtwork:
        return artwork_module.AcquiredArtwork(
            layers=("Edge.Cuts",),
            svg_text=_cropped_svg(38.0, 30.0),
            pdf_bytes=self._overlay(),
            view_x=0.0, view_y=0.0, view_width=38.0, view_height=30.0,
            digest="d" * 64,
            page_offset_x=108.6,
            page_offset_y=95.6,
        )

    def _cm(self, pdf_bytes: bytes) -> tuple[float, ...]:
        import pikepdf

        with pikepdf.open(io.BytesIO(pdf_bytes)) as document:
            content = pikepdf.Page(document.pages[0]).obj["/Contents"]
            streams = content if isinstance(content, pikepdf.Array) else [content]
            text = b"".join(bytes(stream.read_bytes()) for stream in streams).decode("latin-1")
        match = re.findall(
            r"([-0-9.]+) 0 0 ([-0-9.]+) ([-0-9.]+) ([-0-9.]+) cm\n/PrismArtwork0 Do", text
        )
        self.assertEqual(len(match), 1, "expected exactly one artwork placement")
        return tuple(float(value) for value in match[0])

    def test_the_composite_uses_the_stated_ratio_not_the_page_ratio(self) -> None:
        from app.release_studio.documents.pdf import MM_TO_PT

        sheet, used, _over = sheet_templates.fabrication_sheet(
            CONTEXT, STATS, STACKUP, self._art(), size="A3"
        )
        window = sheet_templates.artwork_window("A3", sheet_templates.TABLE_WIDTHS["fabrication"])
        composed = artwork_module.composite_pdf(
            render_pdf(sheet), self._art(), window, used
        )
        sx, sy, tx, ty = self._cm(composed)

        # The board is drawn at the ratio the sheet states. Fitting the whole
        # A4 overlay page into the window instead would give 252/297 = 0.85.
        self.assertAlmostEqual(sx, used, places=4)
        self.assertAlmostEqual(sy, used, places=4)

        # And the artwork's left edge lands where the SVG backend puts it.
        drawn_width = 38.0 * used
        expected_left = window.x + (window.width - drawn_width) / 2
        placed_left = (sx * 108.6 * MM_TO_PT + tx) / MM_TO_PT
        self.assertAlmostEqual(placed_left, expected_left, places=3)

    def test_an_artwork_of_unknown_page_position_is_refused(self) -> None:
        art = artwork_module.AcquiredArtwork(
            layers=("Edge.Cuts",), svg_text=_cropped_svg(38.0, 30.0),
            pdf_bytes=self._overlay(), view_x=0.0, view_y=0.0,
            view_width=38.0, view_height=30.0, digest="d" * 64,
        )
        sheet, used, _over = sheet_templates.fabrication_sheet(CONTEXT, STATS, STACKUP, art, size="A3")
        window = sheet_templates.artwork_window("A3", sheet_templates.TABLE_WIDTHS["fabrication"])
        with self.assertRaises(artwork_module.ArtworkError):
            artwork_module.composite_pdf(render_pdf(sheet), art, window, used)

    def test_compositing_is_byte_reproducible(self) -> None:
        sheet, used, _over = sheet_templates.fabrication_sheet(
            CONTEXT, STATS, STACKUP, self._art(), size="A3"
        )
        window = sheet_templates.artwork_window("A3", sheet_templates.TABLE_WIDTHS["fabrication"])
        base = render_pdf(sheet)
        first = artwork_module.composite_pdf(base, self._art(), window, used)
        second = artwork_module.composite_pdf(base, self._art(), window, used)
        self.assertEqual(first, second)


class TestpointSheetTests(unittest.TestCase):
    """The testpoint drawing and its schedule must describe the same parts."""

    #: A board whose testpoints are excluded from the position file, which is
    #: the normal case: a testpoint is not placed by a pick-and-place machine.
    #: JTYU-OBC has 81 testpoints and none of them appear in `positions.csv`.
    PROJECTION = {
        "source": "board.footprints",
        "prefix": "TP",
        "testpoints": [
            {"ref": "TP10", "side": "top", "x": 12.5, "y": 30.25,
             "excluded_from_position_file": True},
            {"ref": "TP2", "side": "top", "x": 4.0, "y": 8.0,
             "excluded_from_position_file": True},
            {"ref": "TP3", "side": "bottom", "x": 6.0, "y": 9.0,
             "excluded_from_position_file": True},
        ],
    }

    def test_the_schedule_does_not_come_from_the_position_file(self) -> None:
        from app.release_studio.documents import tables

        # An empty position file must not empty the schedule.
        table = tables.testpoint_table(self.PROJECTION, "top")
        self.assertEqual([row[0] for row in table.rows], ["TP2", "TP10"])

    def test_designators_sort_numerically(self) -> None:
        from app.release_studio.documents import tables

        table = tables.testpoint_table(self.PROJECTION, "top")
        # TP2 before TP10: a lexical sort would put TP10 first and a reader
        # walking the board would skip rows.
        self.assertEqual(table.rows[0][0], "TP2")

    def test_a_side_without_testpoints_says_so(self) -> None:
        from app.release_studio.documents import tables

        table = tables.testpoint_table({"testpoints": []}, "bottom")
        self.assertIn("no testpoints", table.rows[0][0])

    def test_the_sheet_counts_only_its_own_side(self) -> None:
        sheet, _used, _overflow = sheet_templates.testpoint_sheet(
            CONTEXT, "top", None, self.PROJECTION, size="A3"
        )
        text = render_svg(sheet)
        self.assertIn("TESTPOINT DRAWING — TOP", text)
        self.assertIn("TP10", text)
        self.assertNotIn(">TP3<", text)


class ProjectionShapeTests(unittest.TestCase):
    """The tables consume R5's real output, not a shape invented for them."""

    def test_drill_holes_is_a_list_of_groups(self) -> None:
        from app.release_studio.documents.tables import drill_table

        table = drill_table(STACKUP, STATS)
        self.assertEqual(len(table.rows), 2)
        self.assertEqual(table.rows[0][0], "Via")
        self.assertIn("F.Cu", table.rows[0][1])
        self.assertEqual(table.rows[0][2], "0.3000 mm")
        self.assertEqual(table.rows[0][4], "21")

    def test_via_types_and_spans_are_listed_on_the_drill_page(self) -> None:
        from app.release_studio.documents.tables import via_statistics_table

        stackup = {
            **STACKUP,
            "via_count": 7,
            "via_type_counts": {"through": 5, "blind": 2, "buried": 0, "micro": 0},
            "via_spans": [
                {"via_type": "through", "start_layer": "F.Cu", "stop_layer": "B.Cu", "span_layer_count": 2, "count": 5},
                {"via_type": "blind", "start_layer": "F.Cu", "stop_layer": "In1.Cu", "span_layer_count": 2, "count": 2},
            ],
        }
        table = via_statistics_table(stackup)
        self.assertEqual(table.rows[0], ("Through", "F.Cu - B.Cu", "2", "5"))
        self.assertEqual(table.rows[1], ("Blind", "F.Cu - In1.Cu", "2", "2"))

    def test_cover_carries_manufacturing_and_board_finish_specs(self) -> None:
        result = compose(
            context=CONTEXT,
            stats=STATS,
            stackup={**STACKUP, "via_count": 5, "via_type_counts": {"through": 5}},
            variants=VARIANTS,
            placements=PLACEMENTS,
            members=MEMBERS,
            fields={
                "manufacturing_ipc_class": "IPC-6012 Class 2",
                "assembly_ipc_class": "IPC-A-610 Class 2",
                "solder_mask_colour": "Green",
                "silkscreen_colour": "White",
                "via_treatment": "Tented",
            },
        )
        overflow = "".join(
            payload.decode("utf-8")
            for key, payload in result.page_svgs().items()
            if key.startswith("cover")
        )
        for expected in (
            "MANUFACTURING &amp; ASSEMBLY SPEC",
            "IPC-6012 Class 2",
            "IPC-A-610 Class 2",
            "Solder mask colour",
            "Green",
            "Silkscreen colour",
            "White",
            "Via treatment",
            "Tented",
        ):
            self.assertIn(expected, overflow)
        self.assertNotIn("ASSEMBLY IPC CLASS", overflow)
        self.assertNotIn("MANUFACTURING IPC CLASS", overflow)

    def test_a_summary_shaped_drill_projection_does_not_crash_the_sheet(self) -> None:
        from app.release_studio.documents.tables import board_summary

        # Defensive: an older or future projection shape yields an empty
        # schedule rather than an AttributeError mid-render.
        pairs = dict(board_summary({"drill_holes": {"total": 3}}))
        self.assertEqual(pairs["Drilled holes"], "—")

    def test_characteristics_pass_through_kicad_formatted_values(self) -> None:
        from app.release_studio.documents.tables import board_characteristics

        pairs = dict(board_characteristics(STATS, STACKUP))
        # A lowercase ASCII "x", because that is what `wxString::Format` emits.
        self.assertEqual(pairs["Board overall dimensions"], "50.0000 mm x 40.0000 mm")
        self.assertEqual(pairs["Min hole diameter"], "0.3000 mm")
        self.assertEqual(pairs["Min track/spacing"], "0.2000 mm / 0.2000 mm")
        self.assertEqual(pairs["Copper layer count"], "2")
        self.assertEqual(pairs["Copper finish"], "ENIG")
        self.assertEqual(pairs["Impedance control"], "Yes")
        self.assertEqual(pairs["Castellated pads"], "No")
        self.assertEqual(pairs["Plated board edge"], "No")
        self.assertEqual(pairs["Edge card connectors"], "No")

    def test_release_specs_live_in_the_manufacturing_table(self) -> None:
        from app.release_studio.documents.tables import (
            manufacturing_spec,
            release_board_characteristics,
        )

        pairs = dict(
            release_board_characteristics(
                STATS,
                STACKUP,
                {
                    "solder_mask_colour": "Green",
                    "silkscreen_colour": "White",
                    "via_treatment": "Tented",
                },
            )
        )
        self.assertNotIn("Silkscreen colour", pairs)
        spec = dict(
            manufacturing_spec(
                {
                    "manufacturing_ipc_class": "IPC-6012 Class 2",
                    "assembly_ipc_class": "IPC-A-610 Class 2",
                    "solder_mask_colour": "Green",
                    "silkscreen_colour": "White",
                    "via_treatment": "Tented",
                }
            )
        )
        self.assertEqual(spec["Manufacturing IPC class"], "IPC-6012 Class 2")
        self.assertEqual(spec["Assembly IPC class"], "IPC-A-610 Class 2")
        self.assertEqual(spec["Silkscreen colour"], "White")
        self.assertEqual(spec["Via treatment"], "Tented")

    def test_bom_schedule_puts_qty_second_and_adds_manufacturer_columns(self) -> None:
        from app.release_studio.documents.tables import bom_schedule_table

        table = bom_schedule_table(
            ["Reference", "Value", "Datasheet", "Footprint", "Qty", "DNP"],
            [
                [
                    "C1,C8",
                    "10uF",
                    "https://example.com/very/long/datasheet/path/spec.pdf",
                    "Capacitor_SMD:C_1210_3225Metric",
                    "2",
                    "",
                ]
            ],
        )
        self.assertEqual(
            table.columns,
            ("Reference", "Qty", "Value", "Manufacturer", "MPN", "Footprint", "Datasheet", "DNP"),
        )
        self.assertEqual(table.rows[0][1], "2")
        self.assertEqual(table.rows[0][0], "C1,C8")
        self.assertEqual(table.rows[0][3], "—")
        self.assertTrue(table.bordered)
        self.assertEqual(table.max_cell_lines, 2)

    def test_the_summary_carries_what_kicads_table_omits(self) -> None:
        from app.release_studio.documents.tables import (
            KICAD_CHARACTERISTIC_LABELS,
            board_summary,
        )

        pairs = dict(board_summary(STATS))
        self.assertEqual(pairs["Drilled holes"], "33")
        self.assertEqual(pairs["Components"], "37")
        self.assertEqual(pairs["Front / back"], "37 / 0")
        self.assertEqual(pairs["Pads (SMD / TH)"], "119 / 18")
        # The summary is a separate table precisely so the characteristics one
        # keeps its correspondence with KiCad's; a row that drifted into it
        # would break that without any test noticing.
        self.assertFalse(set(pairs) & set(KICAD_CHARACTERISTIC_LABELS))

    def test_revision_history_states_an_untagged_project(self) -> None:
        """A column that vanishes reads as history the sheet failed to load."""

        from app.release_studio.documents import tables

        empty = tables.revision_history_table([])
        self.assertEqual(len(empty.rows), 1)
        self.assertIn("no tagged revisions", empty.rows[0][0])
        table = tables.revision_history_table(
            [
                {
                    "tag": "v1.0.0",
                    "date": "2026-01-02T12:00:00",
                    "commit_hash": "abcdef1",
                    "message": "Initial release\nmore detail",
                }
            ]
        )
        self.assertIsNotNone(table)
        self.assertEqual(table.title, "REVISION HISTORY")
        self.assertEqual(table.rows[0][0], "v1.0.0")
        self.assertEqual(table.rows[0][1], "2026-01-02")
        self.assertEqual(table.rows[0][3], "Initial release")

    def test_the_characteristics_table_reproduces_kicads_own_rows(self) -> None:
        """Stage 2's conformance criterion, against the recorded rendering."""

        from tests.kicad_conformance import CONFORMANCE_DIR, load_conformance
        from app.release_studio.documents.tables import (
            KICAD_CHARACTERISTIC_LABELS,
            board_characteristics,
        )

        fixture = CONFORMANCE_DIR / "board-characteristics.json"
        if not fixture.is_file():
            self.skipTest(f"conformance fixture not packaged: {fixture}")
        recorded = load_conformance("board-characteristics")["labels"]
        self.assertEqual(list(KICAD_CHARACTERISTIC_LABELS), recorded)
        # And the table actually emits them -- in order, with nothing added.
        drawn = [label for label, _value in board_characteristics(STATS, STACKUP)]
        self.assertEqual(drawn, recorded)

    def test_the_recorded_kicad_rendering_is_still_what_kicad_renders(self) -> None:
        """The half that catches a KiCad upgrade, where the source is present."""

        from tests.kicad_conformance import (
            KICAD_SOURCE_ENV,
            characteristic_labels_from_source,
            kicad_source_root,
            load_conformance,
        )

        root = kicad_source_root()
        if root is None:
            self.skipTest(
                f"no pinned KiCad source tree; set {KICAD_SOURCE_ENV} to check "
                "the recorded rendering against it"
            )
        self.assertEqual(
            characteristic_labels_from_source(root),
            load_conformance("board-characteristics")["labels"],
            "KiCad's characteristics table changed: re-record the conformance "
            "fixture and update KICAD_CHARACTERISTIC_LABELS together",
        )

    def test_an_edge_connector_is_rendered_in_kicads_three_words(self) -> None:
        from app.release_studio.documents.tables import board_characteristics

        def connectors(value):
            stackup = {**STACKUP, "settings": {**STACKUP["settings"], "edge_connector": value}}
            return dict(board_characteristics(STATS, stackup))["Edge card connectors"]

        self.assertEqual(connectors(None), "No")
        self.assertEqual(connectors("yes"), "Yes")
        self.assertEqual(connectors("bevelled"), "Yes, Bevelled")

    def test_a_layer_without_a_declared_thickness_renders_a_dash(self) -> None:
        from app.release_studio.documents.tables import stackup_table

        table = stackup_table(STACKUP)
        self.assertEqual(table.rows[0][0], "F.Cu")
        self.assertEqual(table.rows[0][2], "—")


class DocumentSetTests(unittest.TestCase):
    def _compose(self, **overrides):
        payload = dict(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        payload.update(overrides)
        return compose(**payload)

    def test_the_full_sheet_set_is_produced_as_pdfs(self) -> None:
        result = self._compose()
        keys = [output.key for output in result.outputs]
        self.assertEqual(
            keys,
            ["cover", "fabrication", "assembly", "testpoint", "drill"],
        )
        paths = sorted(result.files())
        self.assertEqual(
            paths,
            [
                "documentation/assembly.pdf",
                "documentation/cover.pdf",
                "documentation/drill.pdf",
                "documentation/fabrication.pdf",
                "documentation/testpoint.pdf",
            ],
        )
        self.assertTrue(all(path.endswith(".pdf") for path in paths))
        self.assertIn("cover", result.page_svgs())
        self.assertIn("fabrication", result.page_svgs())

    def test_the_document_set_is_byte_reproducible(self) -> None:
        first = self._compose().files()
        second = self._compose().files()
        self.assertEqual(first, second)

    def test_missing_artwork_degrades_one_sheet_and_is_stated(self) -> None:
        result = self._compose()
        self.assertTrue(any("kicad-cli unavailable" in w for w in result.warnings))
        svg = _page(result, "fabrication")
        self.assertIn("board artwork unavailable", svg)


    def test_the_cover_states_the_commit_date_not_a_render_date(self) -> None:
        svg = _page(self._compose(), "cover")
        self.assertIn("2026-08-11", svg)
        self.assertIn(CONTEXT["commit_sha"][:12], svg)

    def test_the_cover_lists_released_members_with_digests(self) -> None:
        svg = _page(self._compose(), "cover")
        self.assertIn("RELEASED MEMBERS", svg)
        self.assertIn("a" * 16, svg)

    def test_the_assembly_sheets_count_only_their_own_side(self) -> None:
        result = self._compose()
        top = _page(result, "assembly-top")
        bottom = _page(result, "assembly-bottom")
        self.assertIn("ASSEMBLY DRAWING — TOP", top)
        self.assertIn("ASSEMBLY DRAWING — BOTTOM", bottom)
        # Three top placements, one bottom.
        self.assertRegex(top, r">3<")
        self.assertRegex(bottom, r">1<")

    def test_a_variant_disagreement_is_reported_rather_than_resolved(self) -> None:
        result = self._compose(variants={"variants": ["default"], "diverged": True})
        svg = _page(result, "cover")
        self.assertIn("disagree", svg)


    def test_no_build_identity_reaches_a_sheet(self) -> None:
        """A sheet carrying a build id or a render time would not be reproducible."""

        # Scan for identity and time *shapes* rather than words: the notes
        # legitimately mention approvers, and a keyword scan would flag prose
        # while missing an actual leaked id.
        leaks = {
            "record id": re.compile(r"\b(?:build|cand|eval|appr|rel|wv)-[0-9a-f]{12,}\b"),
            "wall-clock time": re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"),
        }
        result = self._compose()
        for key, payload in result.page_svgs().items():
            text = payload.decode("utf-8", errors="replace")
            for label, pattern in leaks.items():
                found = pattern.search(text)
                self.assertIsNone(found, f"{label} leaked into {key}: {found}")
        for path, payload in result.files().items():
            text = payload.decode("utf-8", errors="replace")
            for label, pattern in leaks.items():
                found = pattern.search(text)
                self.assertIsNone(found, f"{label} leaked into {path}: {found}")

    def test_every_sheet_text_survives_the_pdf_backend(self) -> None:
        """The two backends must show the same text, not near-enough text.

        The PDF backend emits glyph IDs, so the ToUnicode map is what makes the
        resulting technical drawing searchable and copyable.
        """

        from pypdf import PdfReader
        from app.release_studio.documents.layout import Text

        sheets = [
            sheet_templates.technical_cover(CONTEXT, STATS, STACKUP, VARIANTS, MEMBERS)[0],
            sheet_templates.fabrication_sheet(CONTEXT, STATS, STACKUP, None)[0],
            sheet_templates.assembly_sheet(CONTEXT, "top", None, PLACEMENTS)[0],
            sheet_templates.drill_sheet(CONTEXT, STATS, STACKUP, None)[0],
        ]
        for sheet in sheets:
            extracted = PdfReader(io.BytesIO(render_pdf(sheet))).pages[0].extract_text()
            for element in sheet.elements:
                if not isinstance(element, Text) or not element.value:
                    continue
                self.assertIn(element.value, extracted, f"{sheet.key}: {element.value!r}")


class TypographyTests(unittest.TestCase):
    def test_a_bundled_face_is_the_default_and_travels_with_the_sheet(self) -> None:
        """The default sheet embeds its face rather than naming a host font."""

        svg = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        ).page_svg("cover").decode("utf-8")
        self.assertIn('data-typography="geist-pixel-square"', svg)
        # Embedded, so the SVG renders identically on a machine that has never
        # heard of Geist.
        self.assertIn("data:font/ttf;base64,", svg)

    def test_newstroke_draws_vectors_instead_of_embedding_a_face(self) -> None:
        svg = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            typography="kicad-newstroke",
        ).page_svg("cover").decode("utf-8")
        self.assertIn('data-typography="kicad-newstroke"', svg)
        self.assertIn('data-renderer="kicad-monkey.newstroke"', svg)
        self.assertNotIn("data:font/ttf;base64,", svg)

    def test_a_legacy_bundled_face_remains_a_technical_configuration_choice(self) -> None:
        common = dict(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        square = compose(**common, typography="kicad-newstroke")
        grid = compose(**common, typography="geist-pixel-grid")
        self.assertNotEqual(square.page_svg("cover"), grid.page_svg("cover"))
        self.assertNotEqual(
            square.files()["documentation/cover.pdf"], grid.files()["documentation/cover.pdf"]
        )

    def test_an_unknown_preset_fails_before_document_generation(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown typography preset"):
            compose(
                context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
                placements=PLACEMENTS, members=MEMBERS, typography="host-font",
            )



class ConfiguredNotesTests(unittest.TestCase):
    """D5: the issuing organization's own text reaches the sheet."""

    def _svg(self, key: str, **overrides) -> str:
        payload = dict(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        payload.update(overrides)
        return compose(**payload).page_svg(key).decode("utf-8")

    def test_configured_notes_replace_the_default_ones(self) -> None:
        svg = self._svg("drill", notes={"drill": ["All holes plated unless noted."]})
        self.assertIn("All holes plated unless noted.", svg)
        self.assertNotIn("finished diameters", svg)

    def test_a_note_can_interpolate_the_revision_and_the_board(self) -> None:
        svg = self._svg(
            "fabrication",
            notes={"fabrication": ["Built to {{release.revision}} at {{board.board_thickness}}."]},
            fields={"ipc_class": "3"},
        )
        self.assertIn("Built to A at 1.6000 mm.", svg)

    def test_a_configured_field_reaches_the_title_block_of_every_sheet(self) -> None:
        for key in ("cover", "fabrication", "assembly-top", "drill"):
            with self.subTest(sheet=key):
                svg = self._svg(key, fields={"ipc_class": "3", "customer": "Acme"})
                self.assertIn("IPC CLASS", svg)
                self.assertIn("Acme", svg)

    def test_fields_are_drawn_in_key_order_not_declaration_order(self) -> None:
        # `technical_config_digest` canonicalizes with sorted keys, so two
        # configurations that differ only in field order share a build key --
        # and must therefore produce the same sheet.
        forward = self._svg("cover", fields={"alpha": "1", "beta": "2"})
        reverse = self._svg("cover", fields={"beta": "2", "alpha": "1"})
        self.assertEqual(forward, reverse)
        self.assertLess(forward.index("ALPHA"), forward.index("BETA"))

    def test_an_unresolvable_note_keeps_the_default_and_says_why(self) -> None:
        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            notes={"drill": ["Class {{fields.missing}}"]},
        )
        svg = _page(result, "drill")
        # Never the raw token: a released drawing must not carry braces.
        self.assertNotIn("{{", svg)
        self.assertIn("finished diameters", svg)
        self.assertTrue(
            any("configured notes for drill were not used" in w for w in result.warnings),
            result.warnings,
        )

    def test_newstroke_sets_the_whole_drawing_vocabulary(self) -> None:
        """`kicad-newstroke` is the face to select when a note needs symbols.

        KiCad's own font covers the drawing vocabulary, which the default text
        face does not.  This is the property that makes it worth keeping as a
        selectable preset rather than deleting it.
        """

        note = "All holes ⌀ 0.3 mm ±0.05, 90° chamfer, Ω-pads ✓"
        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            typography="kicad-newstroke",
            notes={"drill": [note]},
        )
        self.assertEqual(len(result.files()), 5)
        drill = _page(result, "drill")
        for symbol in ("⌀", "±", "°", "Ω", "✓"):
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, drill)
        self.assertEqual([w for w in result.warnings if "notes" in w], [])

    def test_the_default_face_names_the_symbols_it_cannot_set(self) -> None:
        """Geist has no U+2300, and the sheet says so instead of guessing.

        The failure is scoped and legible: the standard note is drawn, the set
        is intact, and the warning names the codepoint so the author can either
        reword the note or select `kicad-newstroke`.
        """

        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            notes={"drill": ["All holes ⌀ 0.3 mm minimum."]},
        )
        self.assertEqual(len(result.files()), 5)
        drill = _page(result, "drill")
        self.assertNotIn("⌀", drill)
        self.assertIn("finished diameters", drill)
        self.assertTrue(
            any("U+2300" in warning for warning in result.warnings), result.warnings
        )

    def test_an_unsupported_note_glyph_falls_back_without_losing_documents(self) -> None:
        """A glyph the face genuinely lacks costs one note, never the set."""

        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            notes={"drill": ["表面処理 immersion gold"]},
        )
        # All five PDFs still present: the degradation is scoped to the note.
        self.assertEqual(len(result.files()), 5)
        drill = _page(result, "drill")
        self.assertNotIn("表面処理", drill)
        self.assertIn("finished diameters", drill)
        self.assertTrue(
            any("U+8868" in warning for warning in result.warnings),
            result.warnings,
        )

    def test_notes_for_a_sheet_that_does_not_exist_are_reported(self) -> None:
        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            notes={"pick-and-place": ["Never rendered"]},
        )
        self.assertTrue(
            any("not a sheet in this set" in w for w in result.warnings), result.warnings
        )

    def test_a_field_naming_the_build_time_cannot_be_interpolated(self) -> None:
        # The substitution namespaces are the guard against a released sheet
        # moving for a reason that has nothing to do with the design.
        result = compose(
            context={**CONTEXT, "built_at": "2026-08-12T09:00:00"},
            stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            fields={"stamp": "{{release.built_at}}"},
        )
        svg = _page(result, "cover")
        self.assertNotIn("2026-08-12T09:00:00", svg)
        self.assertTrue(
            any("title-block field 'stamp' was not drawn" in w for w in result.warnings),
            result.warnings,
        )

    def test_extra_fields_grow_the_title_block_instead_of_overlapping(self) -> None:
        from app.release_studio.documents import sheets as sheet_templates
        from app.release_studio.documents.layout import TitleBlockField

        extra = tuple(TitleBlockField(f"F{index}", "x") for index in range(6))
        plain = sheet_templates.title_block_height(CONTEXT)
        grown = sheet_templates.title_block_height(CONTEXT, extra)
        self.assertGreater(grown, plain)
        # And the body shrinks by exactly as much, so nothing is drawn under it.
        self.assertAlmostEqual(
            sheet_templates.body_rect("A3", plain).height
            - sheet_templates.body_rect("A3", grown).height,
            grown - plain,
        )

#: A stand-in for one `kicad-cruncher pcb-svg` assembly view.
#:
#: Kept as a real-looking SVG so place-as-is tests exercise the same constructs
#: Cruncher emits (paths, groups, circles, rotated designators) without asking
#: Prism to interpret them.
CRUNCHER_VIEW = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" '
    'viewBox="0 0 20 10" data-source="board.kicad_pcb">'
    '<metadata id="pcb-enrichment-a0"></metadata>'
    '<path d="M 0 0 L 20 0 L 20 10 L 0 10 Z" fill="none" stroke="#000000" '
    'stroke-width="0.15" data-feature="board-outline" />'
    '<g style="fill:none; stroke:#000000; stroke-width:0.12">'
    '<line x1="2" y1="2" x2="6" y2="2"/>'
    "</g>"
    '<g transform="translate(10 5) rotate(90)">'
    '<circle cx="0" cy="0" r="0.3" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0"/>'
    "</g>"
    '<polygon points="1,1 3,1 3,2 1,2" fill="#000000" stroke="none" stroke-width="0"/>'
    '<path d="M 4 4 A 1 1 0 0 1 6 4" fill="none" stroke="#000000" stroke-width="0.1"/>'
    '<text x="5" y="5" font-size="1.6" text-anchor="middle" '
    'dominant-baseline="central" fill="#000000" '
    "font-family=\"Consolas, 'Liberation Mono', monospace\" font-weight=\"700\" "
    'transform="rotate(-90 5 5)" data-component="R1">R1</text>'
    "</svg>"
)


def _cruncher_artwork(svg_text: str = CRUNCHER_VIEW) -> artwork_module.AcquiredArtwork:
    """Wrap a Cruncher SVG the same way `acquire_assembly_view` does."""

    import hashlib

    x, y, width, height = artwork_module.extents(svg_text)
    try:
        pdf_bytes = artwork_module.render_pdf_page(svg_text)
        page_offset_x = 0.0
        page_offset_y = 0.0
    except Exception:  # noqa: BLE001 - unit tests may lack cairo
        # Without a PDF page the composite is skipped; the SVG sheet still
        # carries Cruncher's drawing, which is what these tests assert.
        pdf_bytes = b""
        page_offset_x = None
        page_offset_y = None
    return artwork_module.AcquiredArtwork(
        layers=("Assembly.Top",),
        svg_text=svg_text,
        pdf_bytes=pdf_bytes,
        view_x=x,
        view_y=y,
        view_width=width,
        view_height=height,
        digest=hashlib.sha256(svg_text.encode("utf-8")).hexdigest(),
        page_offset_x=page_offset_x,
        page_offset_y=page_offset_y,
    )



class AssemblyProjectionWarningTests(unittest.TestCase):
    """Bounding-box fallback and density must surface as build warnings."""

    def test_the_mix_reads_what_was_drawn_not_what_was_asked_for(self) -> None:
        """`data-projection` is the configured mode; it is the same on every
        component whether or not a model resolved, so it cannot report the
        fallback.  `data-bounds-kind` is the outcome."""

        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<g data-projection="outline" data-bounds-kind="pads"></g>'
            '<g data-projection="outline" data-bounds-kind="pads"></g>'
            "</svg>"
        )
        mix = artwork_module.assembly_projection_mix(svg)
        self.assertEqual(mix, {"pads": 2})
        warnings = artwork_module.assembly_projection_warnings("top", mix)
        self.assertEqual(len(warnings), 1)
        self.assertIn("no component resolved a 3D model", warnings[0])

    def test_a_partial_fallback_warns_above_ten_percent(self) -> None:
        mix = {"model": 9, "pads": 1}
        warnings = artwork_module.assembly_projection_warnings("bottom", mix)
        self.assertEqual(len(warnings), 1)
        self.assertIn("1/10", warnings[0])

    def test_a_view_drawn_entirely_from_models_is_silent(self) -> None:
        self.assertEqual(
            artwork_module.assembly_projection_warnings("top", {"model": 40}), []
        )

    def test_dense_placements_warn_once_the_threshold_is_crossed(self) -> None:
        self.assertEqual(artwork_module.assembly_density_warnings("top", 399), [])
        warnings = artwork_module.assembly_density_warnings("top", 400)
        self.assertEqual(len(warnings), 1)
        self.assertIn("400 placements", warnings[0])

    def test_the_engine_records_projection_and_density_warnings(self) -> None:
        svg = (
            '<?xml version="1.0"?>'
            '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" '
            'viewBox="0 0 20 10">'
            + "".join(
                '<g data-projection="outline" data-bounds-kind="pads"></g>'
                for _ in range(3)
            )
            + "</svg>"
        )
        art = _cruncher_artwork(svg)
        dense = [{"side": "top"}] * 400 + [{"side": "bottom"}]

        def fake(cruncher_path, board, workdir, **kwargs):
            return {f"{kind}-{side}": art
                    for kind in ("assembly", "testpoint")
                    for side in ("top", "bottom")}

        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=dense, members=MEMBERS,
            board=Path("/nonexistent/board.kicad_pcb"),
            cruncher_path="kicad-cruncher",
            workdir=Path("/tmp"),
            assembly_acquirer=fake,
        )
        joined = " | ".join(result.warnings)
        self.assertIn("no component resolved a 3D model", joined)
        self.assertIn("400 placements", joined)

    def test_acquire_assembly_view_binds_kiprjmod_to_the_board_directory(self) -> None:
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        captured: dict[str, object] = {}

        def runner(argv, capture_output=True, text=True, timeout=900, env=None):
            captured["env"] = env
            workdir = Path(argv[argv.index("--output") + 1])
            views = workdir / "views"
            views.mkdir(parents=True, exist_ok=True)
            (views / "board__assembly_top_view.svg").write_text(CRUNCHER_VIEW, encoding="utf-8")

            class Result:
                returncode = 0
                stdout = ""
                stderr = ""

            return Result()

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            board = root / "project" / "board.kicad_pcb"
            board.parent.mkdir(parents=True)
            board.write_text("(kicad_pcb)\n", encoding="utf-8")
            with patch.object(
                artwork_module, "_cruncher_board_viewport", return_value=None
            ):
                artwork_module.acquire_assembly_view(
                    "kicad-cruncher",
                    board,
                    "top",
                    root / "out",
                    runner=runner,
                )
        self.assertIsInstance(captured.get("env"), dict)
        self.assertEqual(captured["env"]["KIPRJMOD"], str(board.parent.resolve()))

    def test_default_projection_asks_for_the_model_outline(self) -> None:
        """Cruncher degrades per component, so asking for the outline is free."""

        import json

        config = json.loads(artwork_module.PCB_SVG_CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["assembly"]["default_projection"], "outline")
        self.assertEqual(config["assembly"]["dnp_projection"], "outline")

    def test_projection_mix_label_is_compact(self) -> None:
        label = artwork_module.assembly_projection_label(
            {"model": 10, "pads": 2, "holes": 1}
        )
        self.assertIn("3D model outline 10", label)
        self.assertIn("hole bounds 1", label)
        self.assertIn("pad bounds 2", label)


class ComposeReproducibilityTests(unittest.TestCase):
    """Composed documentation must be byte-identical across two runs."""

    def test_compose_is_byte_identical_for_unchanged_inputs(self) -> None:
        kwargs = dict(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        first = compose(**kwargs).files()
        second = compose(**kwargs).files()
        self.assertEqual(first, second)


class FabricationDimensionTests(unittest.TestCase):
    """Overall board dimensions are drawn, not just tabulated."""

    def test_the_fabrication_sheet_states_overall_width_and_height(self) -> None:
        sheet, used, _over = sheet_templates.fabrication_sheet(
            CONTEXT,
            STATS,
            STACKUP,
            _svg_artwork(50.0, 40.0),
            size="A3",
            scale=1.0,
        )
        self.assertEqual(used, 1.0)
        rendered = render_svg(sheet)
        self.assertIn("50.0000 mm", rendered)
        self.assertIn("40.0000 mm", rendered)
        # Vertical height is rotated so it reads along the left edge.
        self.assertIn('rotate(-90', rendered)

    def test_dimensions_match_the_characteristics_table_labels(self) -> None:
        sheet, _used, _over = sheet_templates.fabrication_sheet(
            CONTEXT,
            STATS,
            STACKUP,
            _svg_artwork(50.0, 40.0),
            size="A3",
            scale=1.0,
        )
        rendered = render_svg(sheet)
        # Same strings the board-characteristics table already shows -- one
        # source of truth, not a second formatting pass that could drift.
        self.assertEqual(rendered.count("50.0000 mm"), 2)
        self.assertGreaterEqual(rendered.count("40.0000 mm"), 1)


class AssemblySheetTests(unittest.TestCase):
    """Assembly sheets place Cruncher's view as-is, not KiCad's F.Fab layer."""

    def setUp(self) -> None:
        self.art = _cruncher_artwork()

    def test_the_sheet_carries_cruncher_bytes_unchanged(self) -> None:
        sheet, _used = sheet_templates.assembly_sheet(
            CONTEXT, "top", self.art, PLACEMENTS, size="A3", scale=1.0
        )
        rendered = render_svg(sheet)
        self.assertIn(">R1<", rendered)
        self.assertIn('data-component="R1"', rendered)
        # Place-as-is: Cruncher's own markup is what the sheet carries.
        self.assertIn("Consolas", rendered)

    def test_both_backends_accept_the_placed_view(self) -> None:
        sheet, _used = sheet_templates.assembly_sheet(
            CONTEXT, "top", self.art, PLACEMENTS, size="A3", scale=1.0
        )
        self.assertIn("R1", render_svg(sheet))
        self.assertGreater(len(render_pdf(sheet)), 1000)

    def test_a_missing_view_states_its_absence(self) -> None:
        sheet, used = sheet_templates.assembly_sheet(
            CONTEXT, "top", None, PLACEMENTS, size="A3"
        )
        self.assertEqual(used, 1.0)
        self.assertIn("assembly artwork unavailable", render_svg(sheet))

    def test_the_engine_asks_cruncher_for_both_sides(self) -> None:
        asked: list[tuple[str, str]] = []

        def fake(cruncher_path, board, workdir, **kwargs):
            asked.append(cruncher_path)
            return {f"{kind}-{side}": _cruncher_artwork()
                    for kind in ("assembly", "testpoint")
                    for side in ("top", "bottom")}

        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            board=Path("/nonexistent/board.kicad_pcb"),
            cruncher_path="kicad-cruncher",
            workdir=Path("/tmp"),
            assembly_acquirer=fake,
        )
        # One invocation for every view: the board load dominates the cost.
        self.assertEqual(asked, ["kicad-cruncher"])
        # Both sides are pages of one assembly document, each carrying the
        # digest of the exact Cruncher bytes placed on it.
        assembly = next(o for o in result.outputs if o.key == "assembly")
        self.assertEqual(
            [page.key for page in assembly.pages], ["assembly-top", "assembly-bottom"]
        )
        self.assertTrue(all(len(page.artwork_digest) == 64 for page in assembly.pages))

    def test_copper_pages_survive_kicad_calling_the_layers_signal(self) -> None:
        """The stackup's own classification decides copper, not KiCad's type.

        A `.kicad_pcb` describes F.Cu as type "signal"; only the projection's
        `kind` says "copper". Reading `type` first dropped every copper page
        from the fabrication document and left its opening page stating that
        board artwork was unavailable -- on any board whose stackup is
        authored this way, which is most of them.
        """

        from app.release_studio.documents.engine import fabrication_layers

        self.assertEqual(STACKUP["layers"][0]["type"], "signal")
        pages = fabrication_layers(STACKUP)
        self.assertEqual([page for page in pages if page.endswith(".Cu")],
                         ["F.Cu", "B.Cu"])
        # Copper leads: the opening fabrication page is the first copper plot.
        self.assertEqual(pages[0], "F.Cu")

    def test_the_drill_map_is_not_cropped_to_the_board(self) -> None:
        """A drill map is a page -- board plus hole legend -- not a plot.

        Cropping it to a board-sized window centred on the page keeps a patch
        of the middle and discards the map, and the sheet then claims the
        package ratio while showing something drawn at another one.
        """

        from unittest.mock import patch

        import app.release_studio.documents.engine as engine_module

        board_w, board_h = 50.0, 40.0
        # Three times the board, which is what `--generate-map` emits once the
        # legend sits beside the outline.
        map_art = _svg_artwork(150.0, 120.0)
        cropped: list[float] = []
        real_content_view = engine_module.content_view

        def spy(art, width, height):
            cropped.append(art.view_width)
            return real_content_view(art, width, height)

        with patch.object(engine_module, "content_view", spy):
            result = compose(
                context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
                placements=PLACEMENTS, members=MEMBERS,
                board=Path("/nonexistent/board.kicad_pcb"),
                cli_path="kicad-cli",
                workdir=Path("/tmp"),
                acquirer=lambda *_a, **_k: _svg_artwork(board_w, board_h),
                drill_acquirer=lambda *_a, **_k: map_art,
                board_render_acquirer=lambda *_a, **_k: None,
            )

        # Layer plots are still board-cropped; the map never enters that path.
        self.assertNotIn(map_art.view_width, cropped)
        drill = next(output for output in result.outputs if output.key == "drill")
        page = drill.pages[0]
        self.assertNotIn(b"unavailable", page.svg_bytes)
        # It fits itself, so the ratio it states is one its own artwork honours
        # rather than the board ratio the fabrication sheets share.
        self.assertLessEqual(
            page.scale * map_art.view_width, sheet_templates.SHEET_SIZES["A4"][0]
        )

    def test_a_failed_view_degrades_one_sheet_and_says_so(self) -> None:
        def fake(cruncher_path, board, workdir, **kwargs):
            raise artwork_module.ArtworkError("geometer refused the board")

        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            board=Path("/nonexistent/board.kicad_pcb"),
            cruncher_path="kicad-cruncher",
            workdir=Path("/tmp"),
            assembly_acquirer=fake,
        )
        self.assertEqual(len(result.outputs), 5)
        self.assertTrue(
            any("geometer refused the board" in warning for warning in result.warnings),
            result.warnings,
        )

    def test_one_failed_layer_plot_keeps_the_other_documents(self) -> None:
        def acquirer(_cli, _board, layers, _workdir, **_kwargs):
            if "F.Cu" in layers:
                raise artwork_module.ArtworkError("plotter refused F.Cu")
            return _svg_artwork(50.0, 40.0)

        result = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            board=Path("/nonexistent/board.kicad_pcb"),
            cli_path="kicad-cli",
            workdir=Path("/tmp"),
            acquirer=acquirer,
            drill_acquirer=lambda *_a, **_k: _svg_artwork(50.0, 40.0),
            board_render_acquirer=lambda *_a, **_k: None,
        )
        self.assertEqual(
            [output.key for output in result.outputs],
            ["cover", "fabrication", "assembly", "testpoint", "drill"],
        )
        self.assertTrue(
            any("plotter refused F.Cu" in warning for warning in result.warnings),
            result.warnings,
        )
        self.assertIn("board artwork unavailable", _page(result, "fabrication"))
        self.assertIn("fabrication-B_Cu", result.page_svgs())


class AcquisitionBoundaryTests(unittest.TestCase):
    def test_one_failed_job_leaves_the_other_views(self) -> None:
        from app.release_studio.documents.acquisition import (
            AcquisitionRequest,
            acquire_views,
            fabrication_layers,
            layer_artwork_key,
        )

        def acquirer(_cli, _board, layers, _workdir, **_kwargs):
            if "F.Cu" in layers:
                raise artwork_module.ArtworkError("plotter refused F.Cu")
            return _svg_artwork(50.0, 40.0)

        result = acquire_views(
            AcquisitionRequest(
                board=Path("/nonexistent/board.kicad_pcb"),
                workdir=Path("/tmp"),
                layer_pages=fabrication_layers(STACKUP),
                cli_path="kicad-cli",
                acquirer=acquirer,
                drill_acquirer=lambda *_a, **_k: _svg_artwork(50.0, 40.0),
                board_render_acquirer=lambda *_a, **_k: None,
            )
        )
        self.assertTrue(
            any("plotter refused F.Cu" in warning for warning in result.warnings),
            result.warnings,
        )
        self.assertNotIn(layer_artwork_key("F.Cu"), result.layers)
        self.assertIn(layer_artwork_key("B.Cu"), result.layers)
        self.assertIn("drill", result.layers)


class DocumentPipelineTests(unittest.TestCase):
    def test_complete_composition_failure_fails_the_documents_step(self) -> None:
        import tempfile
        from unittest.mock import patch

        from app.release_studio.document_pipeline import with_documents
        from app.release_studio.steps import DOCUMENT_STEP_SPEC

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch(
                "app.release_studio.document_pipeline.compose_documents",
                side_effect=RuntimeError("renderer exploded"),
            ):
                outputs, warnings, _projections = with_documents(
                    [],
                    closure_root=root,
                    config={"board": ""},
                    candidate={"commit_sha": "a" * 40, "variant": ""},
                    output_root=root,
                    cli_path=None,
                    staging=root,
                )
        doc = next(
            output for output in outputs if output.step_id == DOCUMENT_STEP_SPEC.step_id
        )
        self.assertEqual(doc.returncode, 1)
        self.assertIn("compose failed", doc.skipped_reason)
        self.assertTrue(any("no sheets were composed" in warning for warning in warnings))

    def test_missing_acquisitions_still_write_the_document_set(self) -> None:
        import tempfile

        from app.release_studio.document_pipeline import with_documents
        from app.release_studio.steps import DOCUMENT_STEP_SPEC

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            outputs, warnings, _projections = with_documents(
                [],
                closure_root=root,
                config={"board": "", "document_number": "DOC-1"},
                candidate={"commit_sha": "a" * 40, "variant": ""},
                output_root=root,
                cli_path=None,
                staging=root,
            )
        doc = next(
            output for output in outputs if output.step_id == DOCUMENT_STEP_SPEC.step_id
        )
        self.assertEqual(doc.returncode, 0)
        self.assertGreater(len(doc.files), 0)
        self.assertTrue(any("kicad-cli unavailable" in warning for warning in warnings))


class SheetSetConsistencyTests(unittest.TestCase):
    """Properties that hold across the whole package, not one sheet."""

    def _composed(self):
        return compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
            board=Path("/nonexistent/board.kicad_pcb"),
            cruncher_path="kicad-cruncher",
            workdir=Path("/tmp"),
            assembly_acquirer=lambda _path, _board, _dir, **_kw: {
                f"{kind}-{side}": _cruncher_artwork()
                for kind in ("assembly", "testpoint")
                for side in ("top", "bottom")
            },
        )

    def test_every_sheet_states_the_same_ratio(self) -> None:
        result = self._composed()
        stated = set()
        for payload in result.page_svgs().values():
            stated.update(re.findall(rb"SCALE (\d+:\d+)", payload))
            # NewStroke and Geist both emit the ratio as text; the vector path
            # writes it as glyphs, so the accessible copy is read instead.
            stated.update(re.findall(rb'data-text="SCALE ([^"]+)"', payload))
        self.assertLessEqual(
            len(stated), 1, f"the set states more than one scale: {stated}"
        )

    def test_a_table_column_leaves_a_gutter_at_its_trailing_edge(self) -> None:
        from app.release_studio.documents.layout import Text

        builder = SheetBuilder("t", "T", "A3")
        table = Table(
            columns=("Thickness", "Material"),
            rows=(("0.0895", "I-TERA MT40"),),
            widths=(20.0, 40.0),
            align=("end", "start"),
            font_size=1.8,
        )
        draw_table(builder, table, (0.0, 0.0))
        sheet = builder.build()
        values = [element for element in sheet.elements if isinstance(element, Text)]
        thickness = next(element for element in values if element.value == "0.0895")
        material = next(element for element in values if element.value == "I-TERA MT40")
        # The right-aligned number ends before the left-aligned text starts.
        self.assertLess(thickness.x, material.x)
        self.assertGreaterEqual(material.x - thickness.x, 0.5)

    def test_a_bordered_table_insets_text_from_the_grid(self) -> None:
        from app.release_studio.documents.layout import Text

        builder = SheetBuilder("t", "T", "A3")
        table = Table(
            columns=("Reference",),
            rows=(("R1",),),
            widths=(28.0,),
            bordered=True,
            font_size=2.2,
        )
        origin_x = 10.0
        draw_table(builder, table, (origin_x, 0.0))
        sheet = builder.build()
        cell = next(
            element
            for element in sheet.elements
            if isinstance(element, Text) and element.value == "R1"
        )
        self.assertGreaterEqual(cell.x - origin_x, 1.0)

    def test_a_continued_table_says_so_in_its_heading(self) -> None:
        from app.release_studio.documents.layout import Text

        builder = SheetBuilder("t", "T", "A3")
        table = Table(
            title="LAYER STACKUP",
            columns=("Layer",),
            rows=tuple((f"layer {index}",) for index in range(10)),
            widths=(12.0,),
            font_size=2.4,
        )
        _head, tail = table.split(table.header_height() + table.row_height * 2.5)
        draw_table(builder, tail, (0.0, 0.0))
        drawn = {
            element.value
            for element in builder.build().elements
            if isinstance(element, Text)
        }
        # A second block of rows under a bare "LAYER STACKUP" would read as a
        # different stackup rather than the rest of this one.
        self.assertIn("LAYER STACKUP (CONTINUED)", drawn)

    def test_an_embedded_face_carries_only_the_glyphs_the_sheet_sets(self) -> None:
        """Three whole faces per sheet is ~383 KiB of unread outlines."""

        result = self._composed()
        sizes = {
            output.key: len(output.pdf_bytes)
            for output in result.outputs
        }
        for key, size in sizes.items():
            # Whole-face embedding put every sheet above 380 KiB; a subset
            # sheet is a small fraction of that, and a regression here means
            # the subsetter silently fell back to the full face.
            self.assertLess(size, 200_000, f"{key} embeds more font than it sets")

    def test_a_project_without_variants_says_so(self) -> None:
        from app.release_studio.documents import tables

        table = tables.variant_table({"variants": []}, "")
        self.assertEqual(len(table.rows), 1)
        self.assertIn("no variants declared", table.rows[0][0])

    def test_the_cover_does_not_claim_to_list_every_released_byte(self) -> None:
        note = sheet_templates.DEFAULT_NOTES["cover"][0]
        self.assertIn("manifest.json", note)
        self.assertNotIn("The files listed above are the released bytes", note)


class TestpointStagingTests(unittest.TestCase):
    """Legacy and modern boards reach Cruncher through one Monkey contract."""

    class Text:
        def __init__(self, text_type: str, text: str):
            self.text_type = text_type
            self.text = text

    class Footprint:
        def __init__(self, reference: str = "", *, legacy_reference: str = ""):
            self.properties = {"Reference": reference} if reference else {}
            self.fp_texts = (
                [TestpointStagingTests.Text("reference", legacy_reference)]
                if legacy_reference
                else []
            )

        def get_property_value(self, name: str, default: str = "") -> str:
            return self.properties.get(name, default)

        def upsert_property(self, name: str, value: str) -> None:
            self.properties[name] = value

    class Board:
        def __init__(self, footprints):
            self.footprints = list(footprints)
            self.saved_to = None

        def save(self, path: Path) -> None:
            self.saved_to = path
            path.write_text("(kicad_pcb)\n", encoding="utf-8")

    def test_stages_only_testpoints_and_promotes_legacy_references(self) -> None:
        import tempfile

        modern = self.Footprint("TP2")
        legacy = self.Footprint(legacy_reference="TP49")
        ordinary = self.Footprint(legacy_reference="D14")
        parsed = self.Board([ordinary, legacy, modern])

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source" / "board.kicad_pcb"
            source.parent.mkdir()
            source.write_text("original board\n", encoding="utf-8")
            staged, designators = artwork_module._stage_testpoint_board(
                source,
                root / "staging",
                pcb_loader=lambda path: parsed,
            )

            self.assertEqual(source.read_text(encoding="utf-8"), "original board\n")
            self.assertEqual(staged.parent, (root / "staging").resolve())
            self.assertTrue(staged.is_file())

        self.assertEqual(designators, ("TP2", "TP49"))
        self.assertEqual(parsed.footprints, [legacy, modern])
        self.assertEqual(legacy.properties["Reference"], "TP49")
        self.assertEqual(modern.properties["Reference"], "TP2")
        self.assertNotIn(ordinary, parsed.footprints)

    def test_duplicate_testpoint_designators_are_rejected(self) -> None:
        import tempfile

        parsed = self.Board(
            [self.Footprint("TP1"), self.Footprint(legacy_reference="TP1")]
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "board.kicad_pcb"
            source.write_text("original board\n", encoding="utf-8")
            with self.assertRaisesRegex(
                artwork_module.ArtworkError, "duplicate testpoint designator: TP1"
            ):
                artwork_module._stage_testpoint_board(
                    source,
                    root / "staging",
                    pcb_loader=lambda path: parsed,
                )

    def test_staged_board_keeps_the_source_project_model_root(self) -> None:
        import tempfile

        captured = {}

        class Result:
            returncode = 0
            stdout = ""
            stderr = ""

        def runner(argv, **kwargs):
            captured["env"] = kwargs["env"]
            return Result()

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            staged = root / "staging" / "board.testpoints.kicad_pcb"
            staged.parent.mkdir()
            staged.write_text("(kicad_pcb)\n", encoding="utf-8")
            project_dir = root / "source-project"
            artwork_module._run_pcb_svg(
                "kicad-cruncher",
                staged,
                ["testpoint_top_view"],
                root / "out",
                config_path=artwork_module.PCB_SVG_TESTPOINT_CONFIG,
                project_dir=project_dir,
                runner=runner,
                timeout_seconds=1,
            )

        self.assertEqual(captured["env"]["KIPRJMOD"], str(project_dir.resolve()))

    def test_testpoint_views_cannot_bypass_the_staging_board(self) -> None:
        with self.assertRaisesRegex(
            artwork_module.ArtworkError, "unknown view kind: 'testpoint'"
        ):
            artwork_module.acquire_board_views(
                "kicad-cruncher",
                Path("board.kicad_pcb"),
                Path("out"),
                kinds=("testpoint",),
                sides=("top",),
            )

    def test_projection_and_staged_board_must_select_the_same_testpoints(self) -> None:
        from unittest.mock import patch

        with patch.object(
            artwork_module,
            "_stage_testpoint_board",
            return_value=(Path("staging/board.testpoints.kicad_pcb"), ("TP2",)),
        ):
            with self.assertRaisesRegex(
                artwork_module.ArtworkError,
                "testpoint drawing and board projection disagree: missing TP1; unexpected TP2",
            ):
                artwork_module.acquire_testpoint_views(
                    "kicad-cruncher",
                    Path("board.kicad_pcb"),
                    Path("out"),
                    designators=("D1", "TP1"),
                )

    def test_testpoint_viewport_is_resolved_before_cruncher_owns_the_output(self) -> None:
        from unittest.mock import patch

        calls = []
        staged = Path("out/board.testpoints.kicad_pcb")

        def viewport(board, config):
            calls.append(("viewport", board, config))
            return None

        def render(*args, **kwargs):
            calls.append(("render", args[1], kwargs["config_path"]))

        with (
            patch.object(
                artwork_module,
                "_stage_testpoint_board",
                return_value=(staged, ("TP1",)),
            ),
            patch.object(artwork_module, "_cruncher_board_viewport", side_effect=viewport),
            patch.object(artwork_module, "_run_pcb_svg", side_effect=render),
            patch.object(
                artwork_module,
                "_read_assembly_view",
                return_value=object(),
            ),
        ):
            artwork_module.acquire_testpoint_views(
                "kicad-cruncher",
                Path("board.kicad_pcb"),
                Path("out"),
                designators=("TP1",),
                sides=("top",),
            )

        self.assertEqual([call[0] for call in calls], ["viewport", "render"])
        self.assertEqual(calls[0][1], staged)
        self.assertEqual(calls[1][1], staged)


class RendererVersionTests(unittest.TestCase):
    """A rendering change must be a deliberate, versioned change.

    `build_key` includes `renderer_version`, so if composed output moves while
    the version stays put, two builds claim to be the same release and are not.
    These digests are the tripwire: when one fails, either the change was
    unintended, or `RENDERER_VERSION` needs bumping and these digests updating
    in the same commit.
    """

    #: Recorded for RENDERER_VERSION d22 under the pinned kicad-monkey /
    #: kicad-cruncher toolchain, and verified stable across two runs.
    #: The version and these digests move together, never one without the other.
    GOLDEN = {
        "documentation/assembly.pdf":
            "aeb46d242fc8bd1b7281a513ec4ed893250a7fb542393096bb149de602614c25",
        "documentation/cover.pdf":
            "318f57ea262d956f66d7a273dfe9888fcd92fd7f6455c720afc2729cd72d2e6b",
        "documentation/drill.pdf":
            "b46e9c0085d144fb16c3f032672ff646dc84611fe34ed057acd56b723d8f3875",
        "documentation/fabrication.pdf":
            "4156eadf95893486e6cd53c9c20b068857d93fbec10f66adc11d2465215c0a3b",
        "documentation/testpoint.pdf":
            "41491187676d4ecdd07ff98f378d860ed55a08c18e55334df37577d479fcedca",
    }
    GOLDEN_PAGES = {
        "assembly-bottom":
            "91deebc9d59eef79840ed016f6ea244f1772115a342c775805f2733cf561a932",
        "assembly-top":
            "d9d92e8ef4c7cd0f35415eded3ef245037beb0f648bfc226af74785fcd847614",
        "cover":
            "63f4f262e8c6969f167673ea3853677757ac39f7e03e3232779ccaed54b13cbd",
        "cover-1":
            "d1fa8cce518c44e6c2d8a7ac7505e3aa4cea171362809fba618e2b992da229ee",
        "drill":
            "b449b589fbaf31354972b360ad424e4f80177a1e4b72792b4d361991fe9fc61b",
        "fabrication":
            "f73ab9c2b7e50a1691ee1b35a2b2d9c4f9d8a632d97dd8e1b02ff8bd05cbaeb0",
        "testpoint-bottom":
            "a7b0b5954b5ab5fd8599c9033c4869eb2481d52671c600846998d6f80a1a0f94",
        "testpoint-top":
            "b2ef237d4690280b4d5462c54faa6b5a6c66bb9b240c62bf79a6bf6cb60fa3c5",
    }

    #: A placed sheet, so a change to sheet selection, the scale ladder, or
    #: fabrication dimensions trips this too -- the set above carries no
    #: artwork and would not.
    GOLDEN_PLACED = "b39c21c06d0ce672b85e7c14aa216cf4b1a1f606a861f0cb860e3e665896d240"

    def test_a_placed_sheet_matches_its_recorded_digest(self) -> None:
        import hashlib

        sheet, used, _over = sheet_templates.fabrication_sheet(
            CONTEXT, STATS, STACKUP, _svg_artwork(38.0, 30.0, units_per_mm=10.0)
        )
        self.assertEqual(used, 5.0)
        digest = hashlib.sha256(render_svg(sheet).encode("utf-8")).hexdigest()
        self.assertEqual(
            digest,
            self.GOLDEN_PLACED,
            "placed-sheet output moved: bump RENDERER_VERSION and re-record together",
        )

    def test_composed_output_matches_the_recorded_digests(self) -> None:
        import hashlib

        from app.release_studio.documents import RENDERER_VERSION

        self.assertEqual(
            RENDERER_VERSION,
            "release-studio-documents/d22",
            "RENDERER_VERSION changed: re-record GOLDEN in the same commit",
        )

        composed = compose(
            context=CONTEXT, stats=STATS, stackup=STACKUP, variants=VARIANTS,
            placements=PLACEMENTS, members=MEMBERS,
        )
        actual = {
            path: hashlib.sha256(payload).hexdigest()
            for path, payload in composed.files().items()
        }
        self.assertEqual(
            actual,
            self.GOLDEN,
            "composed output moved: bump RENDERER_VERSION and re-record GOLDEN together",
        )
        pages = {
            key: hashlib.sha256(payload).hexdigest()
            for key, payload in composed.page_svgs().items()
        }
        self.assertEqual(
            pages,
            self.GOLDEN_PAGES,
            "in-memory page SVG moved: bump RENDERER_VERSION and re-record GOLDEN_PAGES together",
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()


class CruncherViewportTests(unittest.TestCase):
    """Cruncher canvas policy is applied from Monkey bounds, not SVG ink."""

    CANVAS_W, CANVAS_H = 151.15578, 107.282993

    def _canvas_svg(self) -> str:
        # Keep stroke-width ahead of width in the root tag: the old regex
        # accidentally read that CSS property as the viewport width.
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" style="stroke-width:99" '
            f'width="{self.CANVAS_W}mm" height="{self.CANVAS_H}mm" '
            f'viewBox="0 0 {self.CANVAS_W} {self.CANVAS_H}">'
            '<path d="M 51 25 L 107 25 L 107 81 L 51 81 Z" '
            'fill="none" stroke="#000000" stroke-width="0.15"/>'
            "</svg>"
        )

    def _viewport(self) -> artwork_module._CruncherViewport:
        return artwork_module._CruncherViewport(
            x_mm=49.96788206559665,
            y_mm=24.05880952380952,
            width_mm=58.0,
            height_mm=58.0,
            canvas_width_mm=self.CANVAS_W,
            canvas_height_mm=self.CANVAS_H,
        )

    def test_applies_exact_board_outline_plus_configured_margin(self) -> None:
        cropped = artwork_module._apply_cruncher_viewport(
            self._canvas_svg(), self._viewport()
        )
        x, y, width, height = artwork_module.extents(cropped)
        self.assertAlmostEqual(x, 49.967882, places=6)
        self.assertAlmostEqual(y, 24.05881, places=6)
        self.assertEqual(width, 58.0)
        self.assertEqual(height, 58.0)
        self.assertIn('width="58mm"', cropped)
        self.assertIn('height="58mm"', cropped)

    def test_all_geometry_policy_leaves_upstream_view_unchanged(self) -> None:
        original = self._canvas_svg()
        self.assertEqual(
            artwork_module._apply_cruncher_viewport(original, None), original
        )

    def test_normalized_artwork_needs_no_content_or_pdf_special_case(self) -> None:
        svg = artwork_module._apply_cruncher_viewport(
            self._canvas_svg(), self._viewport()
        )
        x, y, width, height = artwork_module.extents(svg)
        art = artwork_module.AcquiredArtwork(
            layers=("Cruncher.assembly-top",),
            svg_text=svg,
            pdf_bytes=b"",
            view_x=x,
            view_y=y,
            view_width=width,
            view_height=height,
            digest="d" * 64,
            page_offset_x=0.0,
            page_offset_y=0.0,
        )
        self.assertIs(artwork_module.content_view(art, 56.0, 56.0), art)

    def test_configured_margin_is_read_from_the_checked_in_policy(self) -> None:
        import json
        from unittest.mock import patch

        class Box:
            def __init__(self, min_x, min_y, max_x, max_y):
                self.min_x = min_x
                self.min_y = min_y
                self.max_x = max_x
                self.max_y = max_y
                self.width = max_x - min_x
                self.height = max_y - min_y

        pcb = object()
        boxes = [
            Box(53.0321179344, 38.9411904762, 204.1878978487, 146.2241835311),
            Box(104.0, 64.0, 160.0, 120.0),
        ]
        without_cruncher = {
            "kicad_cruncher": None,
            "kicad_cruncher.config_json": None,
        }
        with patch.dict(sys.modules, without_cruncher), patch(
            "kicad_monkey.kicad_pcb.KiCadPcb.from_file", return_value=pcb
        ), patch(
            "kicad_monkey.kicad_pcb_bounds.compute_pcb_svg_bounding_box",
            side_effect=boxes,
        ):
            viewport = artwork_module._cruncher_board_viewport(
                Path("board.kicad_pcb"), artwork_module.PCB_SVG_CONFIG
            )
        self.assertIsNotNone(viewport)
        policy = json.loads(
            artwork_module.PCB_SVG_CONFIG.read_text(encoding="utf-8")
        )
        margin = float(policy["global"]["canvas"]["margin_mm"])
        self.assertEqual(viewport.width_mm, 56.0 + 2.0 * margin)
        self.assertEqual(viewport.height_mm, 56.0 + 2.0 * margin)
