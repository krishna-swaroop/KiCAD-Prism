"""Gerber-level fabrication comparison."""

from __future__ import annotations

import builtins
import json
import math
import pathlib
import re
import tempfile
import unittest

from app.services.fabrication_compare_service import (
    compare_directories,
    diff_layer,
    parse_excellon,
    parse_gerber,
    read_layers,
    render_layer_svg,
)


def gerber(body: str, *, apertures: str = "%ADD10C,0.250000*%\n", stamp: str = "2026-01-01T00:00:00+00:00") -> str:
    """A minimal KiCad-shaped layer file."""

    return (
        "%TF.GenerationSoftware,KiCad,Pcbnew,10.0.4*%\n"
        f"%TF.CreationDate,{stamp}*%\n"
        "G04 Created by KiCad*\n"
        "%FSLAX46Y46*%\n"
        "%MOMM*%\n"
        "%LPD*%\n"
        "G01*\n"
        f"{apertures}"
        "D10*\n"
        f"{body}"
        "M02*\n"
    )




ROUND_RECT_MACRO = (
    "%AMRoundRect*\n"
    "0 Rectangle with rounded corners*\n"
    "4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*\n"
    "1,1,$1+$1,$2,$3*\n"
    "1,1,$1+$1,$4,$5*\n"
    "1,1,$1+$1,$6,$7*\n"
    "1,1,$1+$1,$8,$9*%\n"
)




def export_dir(root, name, layers, *, stem="board"):
    """A directory shaped like `kicad-cli pcb export gerbers` output."""

    directory = root / name
    directory.mkdir()
    attributes = []
    for layer, (suffix, function, body) in layers.items():
        filename = f"{stem}-{layer}{suffix}"
        (directory / filename).write_text(gerber(body))
        attributes.append({"Path": filename, "FileFunction": function})
    (directory / f"{stem}-job.gbrjob").write_text(
        json.dumps({"FilesAttributes": attributes})
    )
    return directory




PAD = "X100000000Y100000000D03*\n"


PAD_MOVED = "X140000000Y100000000D03*\n"




def excellon(tools: str, body: str, *, stamp: str = "2026-01-01T00:00:00", units: str = "METRIC") -> str:
    return (
        "M48\n"
        f"; DRILL file KiCad 10.0.4 date {stamp}\n"
        "FMAT,2\n"
        f"{units}\n"
        f"{tools}"
        "%\n"
        "G90\n"
        "G05\n"
        f"{body}"
        "M30\n"
    )




PLATED_VIA = "; #@! TA.AperFunction,Plated,PTH,ViaDrill\nT1C0.300\n"


NON_PLATED = "; #@! TA.AperFunction,NonPlated,NPTH,ComponentDrill\nT1C0.300\n"




BOUNDS = (0.0, 0.0, 20.0, 20.0)




class approx:
    """Stand-in for `pytest.approx`, so the comparisons read unchanged.

    These tests run under unittest — CI invokes `python -m unittest discover`
    and has no pytest installed. Reimplementing the one operator they borrowed
    kept the conversion mechanical, rather than rewriting eighty comparisons by
    hand and hoping each tolerance survived.
    """

    def __init__(self, expected, abs=None, rel=1e-6):
        self.expected = expected
        self.abs = abs
        self.rel = rel

    def __eq__(self, other):
        if not isinstance(other, (int, float)):
            return NotImplemented
        tolerance = (
            self.abs if self.abs is not None
            else max(builtins.abs(self.expected) * self.rel, 1e-12)
        )
        return builtins.abs(other - self.expected) <= tolerance

    def __repr__(self):
        return f"approx({self.expected!r})"


class FabricationCompareTests(unittest.TestCase):
    """Gerber and Excellon comparison, read back in board coordinates."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = pathlib.Path(self._tmp.name)

    def test_parses_flashes_and_traces_into_board_millimetres(self):
        layer = parse_gerber(gerber(
            "X100000000Y100000000D02*\n"
            "X105000000Y100000000D01*\n"
            "X110000000Y110000000D03*\n"
        ))

        assert [op.kind for op in layer.ops] == ["draw", "flash"]
        assert layer.ops[0].points == ((100.0, 100.0), (105.0, 100.0))
        assert layer.ops[1].points == ((110.0, 110.0),)



    def test_regenerating_the_same_board_reports_no_fabrication_change(self):
        body = (
            "X100000000Y100000000D02*\n"
            "X105000000Y100000000D01*\n"
        )
        base = parse_gerber(gerber(body, stamp="2026-01-01T00:00:00+00:00"))
        head = parse_gerber(gerber(body, stamp="2026-08-03T11:22:33+00:00"))

        assert diff_layer(base, head) == []



    def test_renumbered_apertures_are_not_a_fabrication_change(self):
        """KiCad is free to assign different D-codes to the same aperture.

        Keying operations by D-code would report every regeneration as a full-board
        rewrite, which is exactly the noise that makes a byte diff useless here.
        """

        base = parse_gerber(gerber(
            "X100000000Y100000000D03*\n",
            apertures="%ADD10C,0.250000*%\n",
        ))
        head = parse_gerber(
            "%TF.CreationDate,2026-08-03T00:00:00+00:00*%\n"
            "%FSLAX46Y46*%\n"
            "%MOMM*%\n"
            "%LPD*%\n"
            "G01*\n"
            "%ADD11C,0.400000*%\n"
            "%ADD42C,0.250000*%\n"
            "D42*\n"
            "X100000000Y100000000D03*\n"
            "M02*\n"
        )

        assert diff_layer(base, head) == []



    def test_a_resized_pad_is_one_changed_region_at_the_pad(self):
        base = parse_gerber(gerber(
            "X100000000Y100000000D03*\n",
            apertures="%ADD10C,0.250000*%\n",
        ))
        head = parse_gerber(gerber(
            "X100000000Y100000000D03*\n",
            apertures="%ADD10C,0.600000*%\n",
        ))

        regions = diff_layer(base, head)

        assert len(regions) == 1
        region = regions[0].as_dict()
        assert region["kind"] == "changed"
        assert region["addedOps"] == 1
        assert region["removedOps"] == 1
        # The marker spans the larger of the two pads, anchored bottom-left.
        assert region["x"] == approx(99.7)
        assert region["y"] == approx(99.7)
        assert region["width"] == approx(0.6)



    def test_a_pad_moved_across_the_board_is_a_removal_and_an_addition(self):
        base = parse_gerber(gerber("X100000000Y100000000D03*\n"))
        head = parse_gerber(gerber("X140000000Y100000000D03*\n"))

        regions = diff_layer(base, head)

        assert [region.kind for region in regions] == ["removed", "added"]
        assert regions[0].x == approx(99.875)
        assert regions[1].x == approx(139.875)



    def test_a_trace_whose_start_moved_is_detected(self):
        """The move that positions a trace is not itself an operation.

        Recording only the endpoint of each draw would make a trace that was
        re-anchored at one end look identical, which is a silent miss on exactly
        the kind of edit a fabrication review exists to catch.
        """

        base = parse_gerber(gerber(
            "X100000000Y100000000D02*\n"
            "X105000000Y100000000D01*\n"
        ))
        head = parse_gerber(gerber(
            "X102000000Y100000000D02*\n"
            "X105000000Y100000000D01*\n"
        ))

        assert len(diff_layer(base, head)) == 1



    def test_nearby_changes_merge_into_one_reviewable_region(self):
        base = parse_gerber(gerber("X100000000Y100000000D02*\nX101000000Y100000000D01*\n"))
        head = parse_gerber(gerber(
            "X100000000Y100000000D02*\n"
            "X101000000Y100000000D01*\n"
            "X101100000Y100000000D01*\n"
            "X101200000Y100000000D01*\n"
        ))

        regions = diff_layer(base, head)

        assert len(regions) == 1
        assert regions[0].added == 2
        assert regions[0].removed == 0



    def test_regions_are_numbered_top_down_then_left_to_right(self):
        base = parse_gerber(gerber(""))
        head = parse_gerber(gerber(
            "X150000000Y100000000D03*\n"
            "X100000000Y200000000D03*\n"
            "X150000000Y200000000D03*\n"
        ))

        regions = diff_layer(base, head)

        assert [region.index for region in regions] == [1, 2, 3]
        positions = [(round(region.y), round(region.x)) for region in regions]
        assert positions == [(200, 100), (200, 150), (100, 150)]



    def test_polygon_regions_are_compared_by_outline(self):
        """A pour is one operation carrying its whole outline.

        Comparing it as an atom makes any single moved vertex mark the entire
        plane, so the marker covers the board and identifies nothing.
        """

        def poured(y: str) -> str:
            return gerber(
                "G36*\n"
                "X100000000Y100000000D02*\n"
                "X110000000Y100000000D01*\n"
                f"X110000000Y{y}D01*\n"
                f"X100000000Y{y}D01*\n"
                "X100000000Y100000000D01*\n"
                "G37*\n"
            )

        assert diff_layer(parse_gerber(poured("110000000")), parse_gerber(poured("110000000"))) == []

        regions = diff_layer(parse_gerber(poured("110000000")), parse_gerber(poured("112000000")))

        assert regions
        # Markers land on the outline, not over the 10 x 12 mm pour: none of them
        # covers a meaningful share of its area, and the top edge that actually
        # moved is among them.
        assert max(region.width * region.height for region in regions) < 12.0
        assert any(round(region.y + region.height) == 112 for region in regions)



    def test_a_diffuse_change_is_many_local_markers_not_one_covering_the_board(self):
        """Merging is bounded so it cannot chain across a dense board.

        Changed copper within the merge distance of its neighbour would otherwise
        grow one marker over the whole plane, which says only that the layer
        differs and points at nothing.
        """

        def dotted(step: int) -> str:
            return gerber("".join(
                f"X{100000000 + index * step:09d}Y100000000D03*\n"
                for index in range(60)
            ))

        regions = diff_layer(parse_gerber(dotted(400000)), parse_gerber(gerber("")))

        assert len(regions) > 1
        for region in regions:
            assert region.width <= 8.0
            assert region.height <= 8.0



    def test_rounded_rectangle_pads_are_measured_from_their_outline(self):
        """The macro's vertex *count* is not a coordinate.

        Reading it as one inflates every rounded-rect pad to a several-millimetre
        marker, which swallows its neighbours when regions are merged and makes the
        difference markers useless on any dense board.
        """

        layer = parse_gerber(gerber(
            "X100000000Y100000000D03*\n",
            apertures=(
                ROUND_RECT_MACRO
                + "%ADD10RoundRect,0.2375X0.25X0.2375X-0.25X0.2375X-0.25X-0.2375X0.25X0.2375*%\n"
            ),
        ))

        aperture = next(iter(layer.apertures.values()))
        assert aperture.macro == "RoundRect"
        assert not aperture.approximate
        assert aperture.half_extent[0] == approx(0.582, abs=0.01)
        assert layer.warnings == []



    def test_an_unevaluatable_macro_is_flagged_rather_than_guessed(self):
        layer = parse_gerber(gerber(
            "X100000000Y100000000D03*\n",
            apertures=(
                "%AMWeird*\n"
                "9,1,$1,$2*%\n"
                "%ADD10Weird,1.0X2.0*%\n"
            ),
        ))

        assert next(iter(layer.apertures.values())).approximate
        assert layer.warnings



    def test_dark_and_clear_polarity_are_different_operations(self):
        base = parse_gerber(gerber("X100000000Y100000000D03*\n"))
        head = parse_gerber(gerber("%LPC*%\nX100000000Y100000000D03*\n"))

        assert len(diff_layer(base, head)) == 1



    def test_layer_names_survive_a_board_rename(self):
        """The board stem is part of every filename but not of the layer identity."""

        base = export_dir(self.tmp_path, "base", {"F_Cu": (".gtl", "Copper,L1,Top", PAD)}, stem="old-name")
        head = export_dir(self.tmp_path, "head", {"F_Cu": (".gtl", "Copper,L1,Top", PAD)}, stem="new-name")

        result = compare_directories(base, head)

        assert [layer["name"] for layer in result["layers"]] == ["F.Cu"]
        assert result["summary"]["changedLayers"] == 0



    def test_user_layers_are_not_collapsed_by_their_shared_file_function(self):
        """KiCad gives every user layer the function `Other,User`.

        Pairing on function would fold User.1 through User.4 into a single review
        entry and hide a change on all but one of them.
        """

        layers = {
            f"User_{index}": (".gbr", "Other,User", PAD)
            for index in range(1, 5)
        }
        base = export_dir(self.tmp_path, "base", layers)
        changed = dict(layers)
        changed["User_3"] = (".gbr", "Other,User", PAD_MOVED)
        head = export_dir(self.tmp_path, "head", changed)

        result = compare_directories(base, head)

        assert len(result["layers"]) == 4
        changed_layers = [
            layer["name"] for layer in result["layers"] if layer["status"] == "changed"
        ]
        assert changed_layers == ["User.3"]



    def test_a_layer_only_one_revision_plots_is_reported_as_the_change(self):
        base = export_dir(self.tmp_path, "base", {
            "F_Cu": (".gtl", "Copper,L1,Top", PAD),
            "F_Paste": (".gtp", "SolderPaste,Top", PAD),
        })
        head = export_dir(self.tmp_path, "head", {"F_Cu": (".gtl", "Copper,L1,Top", PAD)})

        result = compare_directories(base, head)

        paste = next(layer for layer in result["layers"] if layer["name"] == "F.Paste")
        assert paste["status"] == "removed"
        assert paste["regions"] == []
        assert any("F.Paste" in warning for warning in result["warnings"])



    def test_changed_layers_sort_ahead_of_unchanged_ones(self):
        base = export_dir(self.tmp_path, "base", {
            "B_Cu": (".gbl", "Copper,L2,Bot", PAD),
            "F_Cu": (".gtl", "Copper,L1,Top", PAD),
        })
        head = export_dir(self.tmp_path, "head", {
            "B_Cu": (".gbl", "Copper,L2,Bot", PAD),
            "F_Cu": (".gtl", "Copper,L1,Top", PAD_MOVED),
        })

        result = compare_directories(base, head)

        assert [layer["name"] for layer in result["layers"]] == ["F.Cu", "B.Cu"]



    def test_regions_are_reported_in_kicad_board_coordinates(self):
        """Gerber plots the board at negative Y; every other Prism coordinate is
        KiCad board space, and a region that disagreed would cross-probe to a
        mirrored position."""

        base = export_dir(self.tmp_path, "base", {"F_Cu": (".gtl", "Copper,L1,Top", "")})
        head = export_dir(self.tmp_path, "head", {
            "F_Cu": (".gtl", "Copper,L1,Top", "X100000000Y-50000000D03*\n"),
        })

        region = compare_directories(base, head)["layers"][0]["regions"][0]

        assert region["x"] == approx(99.875)
        assert region["y"] == approx(49.875)



    def test_a_directory_without_a_job_file_still_yields_named_layers(self):
        directory = self.tmp_path / "loose"
        directory.mkdir()
        (directory / "board-F_Cu.gtl").write_text(gerber(PAD))

        layers = read_layers(directory)

        assert [layer.name for layer in layers] == ["F.Cu"]


    # ── NC drill ───────────────────────────────────────────────────────────────


    def test_drill_hits_carry_their_tool_diameter_and_plating(self):
        layer = parse_excellon(excellon(PLATED_VIA, "T1\nX10.0Y-20.0\nX12.0Y-20.0\n"))

        assert [op.kind for op in layer.ops] == ["flash", "flash"]
        assert layer.ops[0].points == ((10.0, -20.0),)
        aperture = layer.apertures[layer.ops[0].aperture]
        assert aperture.macro == "Plated,PTH,ViaDrill"
        assert aperture.half_extent == (0.15, 0.15)



    def test_regenerating_the_same_drill_program_is_not_a_change(self):
        body = "T1\nX10.0Y-20.0\n"
        base = parse_excellon(excellon(PLATED_VIA, body, stamp="2026-01-01T00:00:00"))
        head = parse_excellon(excellon(PLATED_VIA, body, stamp="2026-08-03T09:15:00"))

        assert diff_layer(base, head) == []



    def test_a_hole_that_stops_being_plated_is_a_fabrication_change(self):
        """Same circle, same place, different fabrication instruction.

        A plated hole becoming non-plated does not move and does not resize, so
        comparing geometry alone would report the board as unchanged while the fab
        house builds something electrically different.
        """

        body = "T1\nX10.0Y-20.0\n"
        base = parse_excellon(excellon(PLATED_VIA, body))
        head = parse_excellon(excellon(NON_PLATED, body))

        assert len(diff_layer(base, head)) == 1



    def test_a_resized_drill_is_one_region_at_the_hole(self):
        base = parse_excellon(excellon(PLATED_VIA, "T1\nX10.0Y-20.0\n"))
        head = parse_excellon(excellon(
            "; #@! TA.AperFunction,Plated,PTH,ViaDrill\nT1C0.500\n",
            "T1\nX10.0Y-20.0\n",
        ))

        regions = diff_layer(base, head)

        assert len(regions) == 1
        assert regions[0].kind == "changed"
        assert regions[0].width == approx(0.5)



    def test_canned_slots_are_compared_along_their_whole_length(self):
        def slot(end: str) -> str:
            return parse_excellon(excellon(PLATED_VIA, f"T1\nX10.0Y-20.0G85X{end}Y-20.0\n"))

        assert slot("12.0").ops[0].points == ((10.0, -20.0), (12.0, -20.0))
        assert diff_layer(slot("12.0"), slot("12.0")) == []
        assert len(diff_layer(slot("12.0"), slot("13.0"))) == 1



    def test_routed_slots_record_the_path_the_tool_cuts(self):
        routed = parse_excellon(excellon(
            PLATED_VIA,
            "T1\nG00X10.0Y-20.0\nM15\nG01X14.0Y-20.0\nM16\n",
        ))

        cut = [op for op in routed.ops if op.kind == "draw"]
        assert len(cut) == 1
        assert cut[0].points == ((10.0, -20.0), (14.0, -20.0))



    def test_imperial_drill_programs_are_converted_to_millimetres(self):
        layer = parse_excellon(
            excellon(PLATED_VIA, "T1\nX1.0Y-2.0\n", units="INCH"),
        )

        assert layer.ops[0].points[0] == (approx(25.4), approx(-50.8))



    def test_zero_suppressed_coordinates_are_scaled_by_the_format(self):
        layer = parse_excellon(excellon(PLATED_VIA, "T1\nX010000Y-020000\n"))

        assert layer.ops[0].points == ((10.0, -20.0),)



    def test_the_drill_program_is_compared_beside_the_plotted_layers(self):
        def package(root, name, drill_body):
            directory = export_dir(root, name, {"F_Cu": (".gtl", "Copper,L1,Top", PAD)})
            (directory / "board.drl").write_text(excellon(PLATED_VIA, drill_body))
            return directory

        base = package(self.tmp_path, "base", "T1\nX10.0Y-20.0\n")
        head = package(self.tmp_path, "head", "T1\nX10.0Y-20.0\nX14.0Y-20.0\n")

        result = compare_directories(base, head)

        drill = next(layer for layer in result["layers"] if layer["name"] == "Drill")
        assert drill["function"] == "NCDrill"
        assert drill["status"] == "changed"
        assert [region["kind"] for region in drill["regions"]] == ["added"]
        # Bottom-left of the marker: the hit is at y=20, the 0.3 mm tool spans it.
        assert drill["regions"][0]["y"] == approx(19.85)



    def test_separate_plated_and_non_plated_programs_stay_separate(self):
        for name in ("base", "head"):
            directory = export_dir(self.tmp_path, name, {"F_Cu": (".gtl", "Copper,L1,Top", PAD)})
            (directory / "board-PTH.drl").write_text(excellon(PLATED_VIA, "T1\nX10.0Y-20.0\n"))
            (directory / "board-NPTH.drl").write_text(excellon(NON_PLATED, "T1\nX30.0Y-20.0\n"))

        result = compare_directories(self.tmp_path / "base", self.tmp_path / "head")

        names = {layer["name"] for layer in result["layers"]}
        assert {"Drill (PTH)", "Drill (NPTH)"} <= names


    # ── Rendering ──────────────────────────────────────────────────────────────

    from app.services.fabrication_compare_service import render_layer_svg  # noqa: E402


    def test_a_flash_is_drawn_at_its_board_position(self):
        """Gerber Y grows upward and SVG downward.

        Rendering without the flip mirrors the artwork against the difference
        markers, which are already in KiCad board millimetres.
        """

        svg = render_layer_svg(
            parse_gerber(gerber("X010000000Y-005000000D03*\n")), BOUNDS,
        )

        assert '<circle cx="10" cy="5" r="0.125"' in svg



    def test_clear_polarity_paints_the_background_rather_than_the_layer(self):
        svg = render_layer_svg(
            parse_gerber(gerber("%LPC*%\nX010000000Y-005000000D03*\n")),
            BOUNDS,
            colour="#00ff00",
            background="#000000",
        )

        assert '<circle cx="10" cy="5" r="0.125" fill="#000000"/>' in svg



    def test_a_trace_is_stroked_at_the_aperture_width(self):
        svg = render_layer_svg(
            parse_gerber(gerber(
                "X001000000Y-001000000D02*\nX005000000Y-001000000D01*\n",
                apertures="%ADD10C,0.400000*%\n",
            )),
            BOUNDS,
        )

        assert 'points="1,1 5,1"' in svg
        assert 'stroke-width="0.4"' in svg



    def test_arcs_are_flattened_onto_their_true_radius(self):
        """A chord is indistinguishable at review zoom; a wrong sweep is not."""

        svg = render_layer_svg(
            parse_gerber(gerber(
                "X010000000Y-005000000D02*\n"
                "G03X005000000Y-010000000I-005000000J0D01*\n"
            )),
            BOUNDS,
        )

        points = re.search(r'points="([^"]+)"', svg)
        assert points
        coordinates = [
            tuple(float(value) for value in pair.split(","))
            for pair in points.group(1).split(" ")
        ]
        # Every flattened point sits on the arc's 5 mm radius about (5, 5).
        assert len(coordinates) > 4
        for x, y in coordinates:
            assert math.isclose(math.hypot(x - 5.0, y - 5.0), 5.0, abs_tol=1e-3)



    def test_a_rounded_rectangle_pad_renders_its_macro_outline(self):
        svg = render_layer_svg(
            parse_gerber(gerber(
                "X010000000Y-005000000D03*\n",
                apertures=(
                    ROUND_RECT_MACRO
                    + "%ADD10RoundRect,0.2375X0.25X0.2375X-0.25X0.2375X-0.25X-0.2375X0.25X0.2375*%\n"
                ),
            )),
            BOUNDS,
        )

        # The outline primitive plus one circle per rounded corner.
        assert svg.count("<polygon") == 1
        assert svg.count("<circle") == 4



    def test_both_revisions_render_into_one_shared_board_view(self):
        """Per-layer framing would make the panes disagree the moment a layer is
        sparse, and the composite would stop registering."""

        base = export_dir(self.tmp_path, "base", {
            "Edge_Cuts": (".gm1", "Profile,NP", "X000000000Y0D02*\nX020000000Y0D01*\n"),
            "F_Cu": (".gtl", "Copper,L1,Top", PAD),
        })
        head = export_dir(self.tmp_path, "head", {
            "Edge_Cuts": (".gm1", "Profile,NP", "X000000000Y0D02*\nX020000000Y0D01*\n"),
            "F_Cu": (".gtl", "Copper,L1,Top", PAD_MOVED),
        })

        result = compare_directories(base, head, self.tmp_path / "render")

        copper = next(layer for layer in result["layers"] if layer["name"] == "F.Cu")
        renders = [pathlib.Path(path) for path in copper["render"].values()]
        assert len(renders) == 2
        view_boxes = set()
        for path in renders:
            assert path.is_file()
            match = re.search(r'viewBox="([^"]+)"', path.read_text())
            assert match
            view_boxes.add(match.group(1))
        assert len(view_boxes) == 1
        assert result["bounds"] is not None



    def test_inner_copper_layers_are_compared(self):
        """KiCad writes inner copper with Protel extensions `.g1`, `.g2`, ….

        An allowlist of the outer-layer extensions silently drops every inner layer
        of a multilayer board — most of its copper — and the reviewer is never told
        those layers went uncompared.
        """

        def package(name, inner_body):
            directory = export_dir(self.tmp_path, name, {
                "F_Cu": (".gtl", "Copper,L1,Top", PAD),
            })
            (directory / "board-In1_Cu.g1").write_text(gerber(inner_body))
            return directory

        result = compare_directories(
            package("base", PAD),
            package("head", PAD_MOVED),
        )

        inner = next(layer for layer in result["layers"] if layer["name"] == "In1.Cu")
        assert inner["status"] == "changed"
        assert inner["regions"]



    def test_a_drill_program_keeps_its_name_without_a_job_file(self):
        """`<board>.drl` has no layer suffix, so the board-stem fallback must not
        fire for it: the two revisions stopped pairing and the drill program was
        reported as existing in only one of them."""

        for name in ("base", "head"):
            directory = self.tmp_path / name
            directory.mkdir()
            (directory / "USB-PD-Trigger-Board-F_Cu.gtl").write_text(gerber(PAD))
            (directory / "USB-PD-Trigger-Board.drl").write_text(
                excellon(PLATED_VIA, "T1\nX10.0Y-20.0\n"),
            )

        result = compare_directories(self.tmp_path / "base", self.tmp_path / "head")

        names = [layer["name"] for layer in result["layers"]]
        assert names.count("Drill") == 1
        assert result["warnings"] == []

