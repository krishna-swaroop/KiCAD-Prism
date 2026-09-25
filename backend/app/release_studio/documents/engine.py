"""Compose the documentation sheets into released members (D6-D8, D10).

This is the Documentation Engine's seam with Stage 1: it is a *member producer*.
It adds files to the dossier under the ``documentation`` domain and changes
nothing about the digest graph, the policy engine, or the approval model.

Artwork acquisition is optional by design.  Without ``kicad-cli`` the sheets
still compose -- frame, tables, notes, and a stated absence where the artwork
would be -- because a build that cannot plot copper should still produce the
document set and say what is missing, rather than fail.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from app.release_studio.documents import notes as note_templates
from app.release_studio.documents import sheets as sheet_templates
from app.release_studio.documents import tables as table_templates
from app.release_studio.documents.acquisition import (
    DRILL_ARTWORK_KEY,
    AcquisitionRequest,
    acquire_views,
    fabrication_layers,
    layer_artwork_key,
    layer_page_key,
)
from app.release_studio.documents.artwork import (
    AcquiredArtwork,
    assembly_density_warnings,
    assembly_projection_mix,
    assembly_projection_warnings,
    composite_pdf,
    content_view,
)
from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY, typography_preset
from app.release_studio.documents.inputs import DocumentInputs
from app.release_studio.documents.layout import Rect, Sheet
from app.release_studio.documents.pdf import append_pdf_pages, render_pdf_pages
from app.release_studio.documents.svg import render_svg

logger = logging.getLogger(__name__)

DOCUMENT_DOMAIN = "documentation"

#: Assembly views come from `kicad-cruncher pcb-svg`, which fits one designator
#: into each component's own bounds over a hidden-line-removed outline.
ASSEMBLY_SIDES: tuple[str, ...] = ("top", "bottom")

#: Testpoint views use a derived board containing only TP footprints, with
#: legacy references normalized through Monkey before Cruncher renders them.
TESTPOINT_SIDES: tuple[str, ...] = ("top", "bottom")


@dataclass(frozen=True, slots=True)
class DocumentPage:
    """One composed sheet: a page of a document, and its in-memory SVG.

    The SVG is the same layout model as the PDF page. It is kept for tests and
    for anyone inspecting ``DocumentSet.outputs``; it is not a released member.
    """

    key: str
    title: str
    svg_path: str
    svg_bytes: bytes
    scale: float
    artwork_digest: str = ""


@dataclass(frozen=True, slots=True)
class DocumentOutput:
    """One released document: a single PDF over one or more pages.

    Drawings that belong together are one document -- every copper layer of a
    board, or both sides of an assembly -- because that is how a reader files
    and prints them.  Each page still has an in-memory SVG of the same layout
    for tests; the PDF is the released drawing.
    """

    key: str
    title: str
    pdf_path: str
    pdf_bytes: bytes
    pages: tuple[DocumentPage, ...] = ()

    @property
    def scale(self) -> float:
        """The ratio the first page was placed at."""

        return self.pages[0].scale if self.pages else 1.0


@dataclass(frozen=True, slots=True)
class DocumentSet:
    outputs: tuple[DocumentOutput, ...]
    warnings: tuple[str, ...] = ()
    #: The standard sheet size the whole set was composed on.
    sheet_size: str = ""

    def files(self) -> dict[str, bytes]:
        """Released path -> bytes, ready to become dossier members.

        Only PDFs are released. Page SVGs carry the same layout model and are
        available via :meth:`page_svg` for tests; they are not dossier members.
        """

        return {output.pdf_path: output.pdf_bytes for output in self.outputs}

    def page_svg(self, key: str) -> bytes:
        """In-memory SVG for one page, or ``KeyError`` if that page was not composed."""

        for output in self.outputs:
            for page in output.pages:
                if page.key == key:
                    return page.svg_bytes
        raise KeyError(key)

    def page_svgs(self) -> dict[str, bytes]:
        """Every in-memory page SVG, keyed by page key."""

        return {
            page.key: page.svg_bytes
            for output in self.outputs
            for page in output.pages
        }


def compose(
    *,
    context: Mapping[str, Any],
    stats: Mapping[str, Any],
    stackup: Mapping[str, Any],
    variants: Mapping[str, Any],
    placements: Sequence[Mapping[str, Any]],
    members: Sequence[Mapping[str, Any]],
    testpoints: Mapping[str, Any] | None = None,
    population: Mapping[str, Any] | None = None,
    #: Every reference designator on the board, used to assert that the staged
    #: testpoint drawing and its released schedule select the same parts.
    designators: Sequence[str] = (),
    board: Path | None = None,
    cli_path: str | None = None,
    cruncher_path: str | None = None,
    workdir: Path | None = None,
    sheet_size: str | None = None,
    notes: Mapping[str, Any] | None = None,
    fields: Mapping[str, Any] | None = None,
    typography: str = DEFAULT_TYPOGRAPHY,
    revision_history: Sequence[Mapping[str, Any]] | None = None,
    impedance_rows: Sequence[Mapping[str, Any]] | None = None,
    stackup_pdf: bytes | None = None,
    bom_headers: Sequence[str] | None = None,
    bom_rows: Sequence[Sequence[str]] | None = None,
    on_progress: Callable[[str, str, float], None] | None = None,
    acquirer: Callable[..., AcquiredArtwork] | None = None,
    drill_acquirer: Callable[..., AcquiredArtwork] | None = None,
    assembly_acquirer: Callable[..., Mapping[str, AcquiredArtwork]] | None = None,
    board_render_acquirer: Callable[..., Any] | None = None,
    testpoint_acquirer: Callable[..., Mapping[str, AcquiredArtwork]] | None = None,
) -> DocumentSet:
    """Compose the full document set.

    ``sheet_size`` is chosen from the standard ladder to suit the board unless a
    caller pins one; ``notes`` and ``fields`` are the configuration's own text
    (D5); ``acquirer`` is injectable so the templates can be exercised without a
    KiCad installation.
    """

    return compose_documents(
        DocumentInputs.from_compose_kwargs(
            context=context,
            stats=stats,
            stackup=stackup,
            variants=variants,
            placements=placements,
            members=members,
            testpoints=testpoints,
            population=population,
            designators=designators,
            notes=notes,
            fields=fields,
            typography=typography,
            revision_history=revision_history,
            impedance_rows=impedance_rows,
            stackup_pdf=stackup_pdf,
            bom_headers=bom_headers,
            bom_rows=bom_rows,
            sheet_size=sheet_size,
            board=board,
            cli_path=cli_path,
            cruncher_path=cruncher_path,
            workdir=workdir,
        ),
        on_progress=on_progress,
        acquirer=acquirer,
        drill_acquirer=drill_acquirer,
        assembly_acquirer=assembly_acquirer,
        board_render_acquirer=board_render_acquirer,
        testpoint_acquirer=testpoint_acquirer,
    )


def compose_documents(
    inputs: DocumentInputs,
    *,
    on_progress: Callable[[str, str, float], None] | None = None,
    acquirer: Callable[..., AcquiredArtwork] | None = None,
    drill_acquirer: Callable[..., AcquiredArtwork] | None = None,
    assembly_acquirer: Callable[..., Mapping[str, AcquiredArtwork]] | None = None,
    board_render_acquirer: Callable[..., Any] | None = None,
    testpoint_acquirer: Callable[..., Mapping[str, AcquiredArtwork]] | None = None,
) -> DocumentSet:
    """Compose sheets from typed inputs and one acquisition pass.

    Sheet order, the shared package scale, warning propagation, and the
    released PDF members stay here. Artwork subprocesses live in
    :func:`acquire_views`.
    """

    # Validate before acquiring artwork so an invalid technical configuration
    # cannot perform work and then degrade into a default-looking document.
    typography = inputs.typography
    typography_preset(typography)
    logger.info("Release Studio composing documents with typography %s", typography)

    def report(step: str, message: str, percent: float) -> None:
        if on_progress is not None:
            on_progress(step, message, percent)

    context = inputs.context
    stats = inputs.stats
    stackup = inputs.stackup
    variants = inputs.variants
    placements = inputs.placements
    members = inputs.members
    fields = inputs.fields
    sheet_size = inputs.sheet_size
    revision_history = inputs.revision_history
    impedance_rows = inputs.impedance_rows
    stackup_pdf = inputs.stackup_pdf
    population = inputs.population
    testpoints = inputs.testpoints
    bom_headers = inputs.bom_headers
    bom_rows = inputs.bom_rows

    warnings: list[str] = []

    substitutions = note_templates.substitution_context(context, fields=fields, stats=stats)
    sheet_notes, note_warnings = note_templates.resolve_notes(
        inputs.notes,
        substitutions,
        defaults=sheet_templates.DEFAULT_NOTES,
        typography=typography,
    )
    title_fields, field_warnings = note_templates.resolve_fields(
        fields, substitutions, typography=typography
    )
    warnings.extend(note_warnings)
    warnings.extend(field_warnings)

    layer_pages = fabrication_layers(stackup)
    acquired = acquire_views(
        AcquisitionRequest(
            board=inputs.board,
            workdir=inputs.workdir,
            layer_pages=layer_pages,
            variant=str(context.get("variant") or ""),
            cli_path=inputs.cli_path,
            cruncher_path=inputs.cruncher_path,
            designators=tuple(inputs.designators or ()),
            acquirer=acquirer,
            drill_acquirer=drill_acquirer,
            assembly_acquirer=assembly_acquirer,
            board_render_acquirer=board_render_acquirer,
            testpoint_acquirer=testpoint_acquirer,
        )
    )
    warnings.extend(acquired.warnings)
    art = dict(acquired.layers)
    assembly = dict(acquired.assembly)
    testpoint = dict(acquired.testpoints)
    board_render = acquired.board_render

    for side, drawing in assembly.items():
        side_count = sum(
            1 for item in placements if str(item.get("side") or "").lower() == side
        )
        warnings.extend(assembly_density_warnings(side, side_count))
        warnings.extend(
            assembly_projection_warnings(side, assembly_projection_mix(drawing.svg_text))
        )

    title_height = sheet_templates.title_block_height(context, title_fields)
    extent_width, extent_height = board_extent(stats)
    if sheet_size is None:
        sheet_size = _select_size(stats, title_height)
    # One ratio for the whole package. A reader who scales a dimension off the
    # fabrication sheet and applies it to the assembly sheet has to get the same
    # number, so the scale is a property of the set rather than of each sheet.
    scale = sheet_templates.set_scale(
        extent_width, extent_height, sheet_size, title_height
    )

    # Placement uses content bounds when an acquired SVG reports a drawing-sheet
    # frame (or otherwise dwarfs the board).  Package size already ignored those
    # frames; placement must too or the board sits tiny inside an empty window.
    art = {
        # The drill map is exempt. It is a page, not a layer plot: KiCad draws
        # the board *and* a hole legend beside it, so it is legitimately several
        # times the board's size, and `acquire_drill_map` has already trimmed
        # the viewport to that ink. Cropping it to a board-sized window centred
        # on the page keeps a patch of the middle and throws the map away.
        key: (
            drawing
            if key == DRILL_ARTWORK_KEY
            else content_view(drawing, extent_width, extent_height)
        )
        for key, drawing in art.items()
    }
    assembly = {
        side: content_view(drawing, extent_width, extent_height)
        for side, drawing in assembly.items()
    }
    testpoint = {
        side: content_view(drawing, extent_width, extent_height)
        for side, drawing in testpoint.items()
    }
    assembly_mix = {
        side: assembly_projection_mix(drawing.svg_text)
        for side, drawing in assembly.items()
    }

    outputs: list[DocumentOutput] = []

    report("documents-cover", "Composing the cover page", 70.0)
    cover, cover_overflow = sheet_templates.technical_cover(
        context, stats, stackup, variants, members, size=sheet_size,
        notes=sheet_notes["cover"], fields=title_fields, typography=typography,
        revision_history=revision_history,
        placements=placements,
        render=board_render,
        release_fields=fields,
    )
    _append_document(
        outputs,
        [(cover, "cover", 1.0, None, None)]
        + _continuation_pages(
            cover_overflow,
            context=context,
            prefix="cover",
            title="RELEASE COVER — CONTINUED",
            sheet_size=sheet_size,
            fields=title_fields,
            typography=typography,
            warnings=warnings,
        ),
        "cover",
        "RELEASE COVER",
        warnings,
    )

    report("documents-fabrication", "Composing fabrication drawings", 72.0)
    copper_layers = [layer for layer in layer_pages if layer.endswith(".Cu")]
    overview_layer = copper_layers[0] if copper_layers else None
    overview = art.get(layer_artwork_key(overview_layer)) if overview_layer else None
    fabrication, fab_scale, fab_overflow = sheet_templates.fabrication_sheet(
        context, stats, stackup, overview, size=sheet_size, scale=scale,
        notes=sheet_notes["fabrication"], fields=title_fields, typography=typography,
    )
    fabrication_pages = [
        (
            fabrication,
            "fabrication",
            fab_scale,
            overview,
            _artwork_window(fabrication),
        )
    ]
    # One page per plotted layer, so the document is the whole board rather
    # than its outline plus a schedule that names layers a reader cannot see.
    # The first copper layer already occupies the opening page.
    for layer in layer_pages:
        if layer == overview_layer:
            continue
        drawing = art.get(layer_artwork_key(layer))
        if drawing is None:
            # Without a plot there is nothing this page could show that the
            # first one does not already say.
            continue
        sheet, used, _overflow = sheet_templates.fabrication_sheet(
            context, stats, stackup, drawing, size=sheet_size, scale=scale,
            notes=sheet_notes["fabrication"], fields=title_fields,
            typography=typography, layer=layer,
        )
        fabrication_pages.append(
            (sheet, layer_page_key(layer), used, drawing, _artwork_window(sheet))
        )
    fabrication_pages.extend(
        _continuation_pages(
            fab_overflow,
            context=context,
            prefix="schedules",
            title="FABRICATION SCHEDULES",
            sheet_size=sheet_size,
            fields=title_fields,
            typography=typography,
            warnings=warnings,
        )
    )
    if impedance_rows:
        report("documents-impedance", "Typesetting the controlled impedance table", 73.0)
        impedance_sheet, impedance_overflow = sheet_templates.continuation_sheet(
            context,
            [table_templates.impedance_spec_table(impedance_rows)],
            key="impedance",
            title="CONTROLLED IMPEDANCE",
            size=sheet_size,
            fields=title_fields,
            typography=typography,
        )
        fabrication_pages.append((impedance_sheet, "impedance", 1.0, None, None))
        fabrication_pages.extend(
            _continuation_pages(
                impedance_overflow,
                context=context,
                prefix="impedance",
                title="CONTROLLED IMPEDANCE — CONTINUED",
                sheet_size=sheet_size,
                fields=title_fields,
                typography=typography,
                warnings=warnings,
            )
        )
    _append_document(
        outputs, fabrication_pages, "fabrication", "FABRICATION DRAWING", warnings
    )
    if stackup_pdf:
        report("documents-stackup", "Appending the manufacturer stackup PDF", 74.0)
        for index, output in enumerate(outputs):
            if output.key != "fabrication":
                continue
            try:
                outputs[index] = replace(
                    output,
                    pdf_bytes=append_pdf_pages(output.pdf_bytes, stackup_pdf),
                )
            except Exception as exc:  # noqa: BLE001 - keep Prism pages if the vendor PDF is unreadable
                warnings.append(f"manufacturer stackup PDF could not be appended: {exc}")
            break

    report("documents-assembly", "Composing assembly drawings", 75.0)
    assembly_pages = []
    for side in ASSEMBLY_SIDES:
        key = f"assembly-{side}"
        sheet, used = sheet_templates.assembly_sheet(
            context, side, assembly.get(side), placements, size=sheet_size, scale=scale,
            notes=sheet_notes[key], fields=title_fields, typography=typography,
            projection_mix=assembly_mix.get(side),
            population=population or {},
        )
        assembly_pages.append(
            (sheet, key, used, assembly.get(side), _artwork_window(sheet))
        )
    _append_document(
        outputs, assembly_pages, "assembly", "ASSEMBLY DRAWING", warnings
    )

    report("documents-testpoint", "Composing testpoint drawings", 76.0)
    testpoint_pages = []
    for side in TESTPOINT_SIDES:
        key = f"testpoint-{side}"
        sheet, used, overflow = sheet_templates.testpoint_sheet(
            context, side, testpoint.get(side), testpoints or {}, size=sheet_size, scale=scale,
            notes=sheet_notes[key], fields=title_fields, typography=typography,
        )
        testpoint_pages.append(
            (sheet, key, used, testpoint.get(side), _artwork_window(sheet))
        )
        testpoint_pages.extend(
            _continuation_pages(
                overflow,
                context=context,
                prefix=key,
                title=f"TESTPOINT SCHEDULE — {side.upper()}",
                sheet_size=sheet_size,
                fields=title_fields,
                typography=typography,
                warnings=warnings,
            )
        )
    _append_document(
        outputs, testpoint_pages, "testpoint", "TESTPOINT DRAWING", warnings
    )

    # The package ratio is shared by the sheets that draw the board itself, so
    # a reader can measure across them. The drill map is not one of those: it
    # carries a hole legend alongside the board, so forcing the board's ratio
    # onto it overruns the window and the sheet then states a ratio its own
    # artwork does not honour. It fits itself and reports what it used.
    report("documents-drill", "Composing the drill drawing", 77.0)
    drill, drill_scale, drill_overflow = sheet_templates.drill_sheet(
        context, stats, stackup, art.get("drill"), size=sheet_size, scale=None,
        notes=sheet_notes["drill"], fields=title_fields, typography=typography,
    )
    _append_document(
        outputs,
        [(drill, "drill", drill_scale, art.get("drill"), _artwork_window(drill))]
        + _continuation_pages(
            drill_overflow,
            context=context,
            prefix="drill",
            title="DRILL SCHEDULE",
            sheet_size=sheet_size,
            fields=title_fields,
            typography=typography,
            warnings=warnings,
        ),
        "drill",
        "DRILL DRAWING",
        warnings,
    )

    if bom_headers and bom_rows:
        report("documents-bom", "Typesetting the bill of materials", 78.0)
        bom_sheet, bom_overflow = sheet_templates.continuation_sheet(
            context,
            [table_templates.bom_schedule_table(bom_headers, bom_rows)],
            key="bom",
            title="BILL OF MATERIALS",
            size=sheet_size,
            fields=title_fields,
            typography=typography,
        )
        _append_document(
            outputs,
            [(bom_sheet, "bom", 1.0, None, None)]
            + _continuation_pages(
                bom_overflow,
                context=context,
                prefix="bom",
                title="BILL OF MATERIALS — CONTINUED",
                sheet_size=sheet_size,
                fields=title_fields,
                typography=typography,
                warnings=warnings,
            ),
            "bom",
            "BILL OF MATERIALS",
            warnings,
        )

    report("documents", "Documentation set complete", 79.0)
    return DocumentSet(
        outputs=tuple(outputs), warnings=tuple(warnings), sheet_size=sheet_size
    )


_MM_VALUE = re.compile(r"-?\d+(?:\.\d+)?")


def _mm_value(value: Any) -> float:
    """Read a millimetre figure out of an R5 projection value.

    The projections hand back KiCad's own formatting -- ``"38.0000 mm"`` -- and
    the tables deliberately pass that through untouched.  Sizing needs the
    number, so it is parsed here rather than by changing what the tables show.
    """

    if isinstance(value, (int, float)):
        return float(value)
    match = _MM_VALUE.search(str(value or ""))
    return float(match.group(0)) if match else 0.0


def board_extent(stats: Mapping[str, Any]) -> tuple[float, float]:
    """The board outline from statistics, in millimetres.

    Package paper size follows the board alone.  Acquired SVG frames often
    report the project's drawing-sheet paper (A3/A2/…) rather than the ink; if
    those frames chose the package size, a 132 mm board would land on A2 at
    1:1 with most of the artwork window empty.  Placement still prefers content
    bounds via :func:`content_view` when a frame looks page-sized.
    """

    board = stats.get("board") if isinstance(stats, Mapping) else None
    width = _mm_value((board or {}).get("width"))
    height = _mm_value((board or {}).get("height"))
    return width, height


def _select_size(stats: Mapping[str, Any], title_height: float) -> str:
    """Pick one standard sheet size for the whole set, from the board alone."""

    width, height = board_extent(stats)
    if width <= 0 or height <= 0:
        # Nothing is known about the board -- no projections and no artwork.
        # Sizing from a guess would be worse than stating a conventional
        # default, so the set keeps the historical one.
        return sheet_templates.DEFAULT_SIZE
    return sheet_templates.select_sheet_size(width, height, title_height=title_height)


def _artwork_window(sheet: Sheet) -> Rect | None:
    from app.release_studio.documents.layout import Artwork

    for element in sheet.elements:
        if isinstance(element, Artwork):
            return element.rect
    return None


def _serialize(
    pages: Sequence[tuple[Sheet, str, float, AcquiredArtwork | None, Rect | None]],
    key: str,
    title: str,
    warnings: list[str] | None = None,
) -> DocumentOutput:
    """Render *pages* into one PDF. Page SVGs stay in memory for tests."""

    sheets = [sheet for sheet, _k, _s, _a, _w in pages]
    pdf_bytes = render_pdf_pages(sheets)

    for index, (_sheet, page_key, scale, art, window) in enumerate(pages):
        if art is None or window is None:
            continue
        try:
            pdf_bytes = composite_pdf(pdf_bytes, art, window, scale, page_index=index)
        except Exception as exc:  # noqa: BLE001 - the furniture-only PDF still stands
            # The SVG page still carries the artwork, so this is a divergence
            # between two renderings of one sheet and has to be stated rather
            # than left to a log line nobody reads.
            logger.warning("Artwork could not be composited into %s: %s", page_key, exc)
            if warnings is not None:
                warnings.append(f"{key}.pdf page {index + 1} carries no artwork: {exc}")

    return DocumentOutput(
        key=key,
        title=title,
        pdf_path=f"documentation/{key}.pdf",
        pdf_bytes=pdf_bytes,
        pages=tuple(
            DocumentPage(
                key=page_key,
                title=sheet.title,
                svg_path=f"documentation/{page_key}.svg",
                svg_bytes=render_svg(sheet).encode("utf-8"),
                scale=scale,
                artwork_digest=art.digest if art else "",
            )
            for sheet, page_key, scale, art, _window in pages
        ),
    )


def _append_document(
    outputs: list[DocumentOutput],
    pages: Sequence[tuple[Sheet, str, float, AcquiredArtwork | None, Rect | None]],
    key: str,
    title: str,
    warnings: list[str],
) -> None:
    """Isolate a renderer failure to one document instead of the whole set."""

    if not pages:
        return
    try:
        outputs.append(_serialize(pages, key, title, warnings))
    except (KeyError, OSError, RuntimeError, TypeError, ValueError) as exc:
        logger.warning("Release Studio document %s could not be composed: %s", key, exc)
        warnings.append(f"{key} was not composed: {exc}")
#: Ceiling on continuation pages per originating document.
#:
#: Each lays its tables across the whole body in three columns, so one absorbs
#: a very large schedule and two is already implausible.  The cap guards
#: against a table that cannot shrink below one row per page turning into an
#: unbounded document; it is not a content decision.
MAX_CONTINUATION_SHEETS = 4


def _continuation_pages(
    carried: Sequence,
    *,
    context: Mapping[str, Any],
    prefix: str,
    title: str,
    sheet_size: str,
    fields: Sequence,
    typography: str,
    warnings: list[str],
) -> list[tuple[Sheet, str, float, None, None]]:
    """Pages carrying tables the originating sheet could not hold.

    They are pages of the same document rather than separate files: a schedule
    continued on its own PDF is a schedule a reader can lose.
    """

    pages: list[tuple[Sheet, str, float, None, None]] = []
    remaining = list(carried)
    index = 0
    while remaining and index < MAX_CONTINUATION_SHEETS:
        index += 1
        key = f"{prefix}-{index}"
        sheet, remaining = sheet_templates.continuation_sheet(
            context,
            remaining,
            key=key,
            title=f"{title} — SHEET {index}",
            size=sheet_size,
            fields=fields,
            typography=typography,
        )
        pages.append((sheet, key, 1.0, None, None))
    if remaining:
        # Nothing here can carry it, and silence would be the old defect in a
        # new place: the sheet set has to say the dossier holds more than it
        # drew.
        warnings.append(
            f"{prefix}: {len(remaining)} table(s) did not fit in "
            f"{MAX_CONTINUATION_SHEETS} continuation sheets; the released data "
            "files remain complete"
        )
    return pages
