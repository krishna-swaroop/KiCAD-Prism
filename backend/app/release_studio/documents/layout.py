"""Sheet layout model for the Documentation Engine (D1).

One model, two backends: :mod:`app.release_studio.documents.svg` and
:mod:`app.release_studio.documents.pdf` both consume the structures here, so a
sheet is described once and the two renderings cannot drift apart in content.

Everything is in **millimetres** with the origin at the sheet's top-left and
``y`` increasing downwards, which is how drawing sheets are described and how
SVG works.  The PDF backend flips into PDF's bottom-left origin at emit time,
so nothing above that boundary has to think about it.

Determinism is a property of this module: no timestamps, no identity-derived
ordering, and every number formatted through :func:`fmt` so the same layout
always serializes to the same bytes.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Iterable, Literal, Sequence

from app.release_studio.documents.fonts import (
    DEFAULT_TYPOGRAPHY,
    advance_width,
    typography_preset,
)

# ISO A and ANSI sheet sizes in millimetres, landscape (width, height).
SHEET_SIZES: dict[str, tuple[float, float]] = {
    "A5": (210.0, 148.0),
    "A4": (297.0, 210.0),
    "A3": (420.0, 297.0),
    "A2": (594.0, 420.0),
    "A1": (841.0, 594.0),
    "A0": (1189.0, 841.0),
    "A": (279.4, 215.9),
    "B": (431.8, 279.4),
    "C": (558.8, 431.8),
    "D": (863.6, 558.8),
}

#: The sizes a sheet is allowed to be chosen from, smallest first.
#:
#: Only ISO A sizes: a released drawing is printed and filed by people who have
#: A-series paper, and mixing in ANSI sizes would make the choice depend on
#: which ladder a board happened to land on.  ``A5`` is excluded -- it cannot
#: hold a title block plus a table column at a legible font size.
SHEET_LADDER: tuple[str, ...] = ("A4", "A3", "A2", "A1", "A0")

#: Placement ratios a drawing is allowed to state, largest first.
#:
#: The ISO 5455 preferred series.  A drawing states its scale and a reader
#: measures against it, so ratios like ``1:1.187`` -- which is what "shrink
#: until it fits" produces -- are unusable; the placement is quantized to the
#: standard series and the sheet grows instead when none of them fit.  Note
#: that 4:1 and 1:4 are deliberately absent: they are not in the series.
PREFERRED_SCALES: tuple[float, ...] = (
    10.0, 5.0, 2.0, 1.0, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
)


def preferred_scale(view_width: float, view_height: float, window: "Rect") -> float:
    """The largest preferred ratio at which *view* fits inside *window*.

    Falls back to an exact fit only when the artwork is too large for even the
    smallest preferred reduction, which on an A0 sheet means a board over ten
    metres across.  The ratio is reported either way, so a sheet never claims a
    scale it was not placed at.
    """

    if view_width <= 0 or view_height <= 0:
        raise ValueError("artwork has no extent to scale")
    for ratio in PREFERRED_SCALES:
        if view_width * ratio <= window.width and view_height * ratio <= window.height:
            return ratio
    return min(window.width / view_width, window.height / view_height)

Anchor = Literal["start", "middle", "end"]
Family = Literal["display", "sans", "mono"]


def fmt(value: float) -> str:
    """Format a millimetre value identically in every backend.

    Three decimals is finer than any plotter cares about and coarse enough that
    floating-point noise in the last bit cannot change the emitted text.  The
    ``-0`` case is normalized because ``round(-0.0001, 3)`` is ``-0.0``, which
    would otherwise make two equal layouts serialize differently.
    """

    rounded = round(float(value), 3)
    if rounded == 0:
        rounded = 0.0
    text = f"{rounded:.3f}".rstrip("0").rstrip(".")
    return text or "0"


@dataclass(frozen=True, slots=True)
class Rect:
    x: float
    y: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    def inset(self, amount: float) -> "Rect":
        return Rect(
            self.x + amount,
            self.y + amount,
            max(0.0, self.width - 2 * amount),
            max(0.0, self.height - 2 * amount),
        )


@dataclass(frozen=True, slots=True)
class Line:
    x1: float
    y1: float
    x2: float
    y2: float
    width: float = 0.25
    colour: str = "#000000"


@dataclass(frozen=True, slots=True)
class Rectangle:
    rect: Rect
    width: float = 0.25
    colour: str = "#000000"
    fill: str = "none"


@dataclass(frozen=True, slots=True)
class Text:
    x: float
    y: float
    value: str
    size: float = 2.5
    anchor: Anchor = "start"
    family: Family = "sans"
    bold: bool = False
    colour: str = "#000000"
    #: Degrees clockwise about ``(x, y)``.  A dimension reads along its own
    #: line, which is the only reason this is not always zero.
    rotation: float = 0.0


@dataclass(frozen=True, slots=True)
class Polyline:
    points: tuple[tuple[float, float], ...]
    width: float = 0.25
    colour: str = "#000000"
    fill: str = "none"
    close: bool = False


@dataclass(frozen=True, slots=True)
class Image:
    """A raster picture placed in a rect, preserving its aspect ratio.

    The only raster on a released sheet.  Everything else is vector because a
    drawing is measured against; this is a photograph of the board, which is
    not, and a reader recognises a board faster from a picture of it than from
    any table on the cover.
    """

    rect: Rect
    png_bytes: bytes
    width_px: int
    height_px: int
    #: Identifies the exact bytes placed, the way `Artwork.source_digest` does.
    source_digest: str = ""
    label: str = ""

    def fitted(self) -> Rect:
        """The picture's own rect inside :attr:`rect`, centred, aspect kept."""

        if self.width_px <= 0 or self.height_px <= 0:
            return self.rect
        scale = min(
            self.rect.width / self.width_px, self.rect.height / self.height_px
        )
        width = self.width_px * scale
        height = self.height_px * scale
        return Rect(
            self.rect.x + (self.rect.width - width) / 2,
            self.rect.y + (self.rect.height - height) / 2,
            width,
            height,
        )


@dataclass(frozen=True, slots=True)
class Artwork:
    """A placed block of externally produced vector artwork.

    The Documentation Engine never re-implements KiCad's plotter: board artwork
    is acquired from ``kicad-cli`` and *placed*.  ``scale`` and the offsets map
    the artwork's own coordinate space onto the sheet, and ``source_digest``
    identifies the exact bytes placed so a sheet's provenance is checkable.
    """

    rect: Rect
    scale: float
    offset_x: float
    offset_y: float
    source_digest: str
    svg_body: str = ""
    label: str = ""


Element = Line | Rectangle | Text | Polyline | Image | Artwork


@dataclass(frozen=True, slots=True)
class Sheet:
    """One composed drawing sheet."""

    key: str
    title: str
    size: str
    typography: str = DEFAULT_TYPOGRAPHY
    elements: tuple[Element, ...] = ()

    @property
    def width(self) -> float:
        return SHEET_SIZES[self.size][0]

    @property
    def height(self) -> float:
        return SHEET_SIZES[self.size][1]

    @property
    def frame(self) -> Rect:
        return Rect(0.0, 0.0, self.width, self.height)


class SheetBuilder:
    """Accumulates elements in draw order.

    Draw order is emission order, so a sheet's appearance is a property of the
    code that describes it rather than of a sort applied afterwards.
    """

    def __init__(
        self,
        key: str,
        title: str,
        size: str = "A3",
        *,
        typography: str = DEFAULT_TYPOGRAPHY,
    ) -> None:
        if size not in SHEET_SIZES:
            raise ValueError(f"unknown sheet size: {size!r}")
        typography_preset(typography)
        self.key = key
        self.title = title
        self.size = size
        self.typography = typography
        self._elements: list[Element] = []

    @property
    def width(self) -> float:
        return SHEET_SIZES[self.size][0]

    @property
    def height(self) -> float:
        return SHEET_SIZES[self.size][1]

    def add(self, element: Element) -> None:
        self._elements.append(element)

    def extend(self, elements: Iterable[Element]) -> None:
        self._elements.extend(elements)

    def line(self, x1: float, y1: float, x2: float, y2: float, **kwargs) -> None:
        self.add(Line(x1, y1, x2, y2, **kwargs))

    def rect(self, rect: Rect, **kwargs) -> None:
        self.add(Rectangle(rect, **kwargs))

    def text(self, x: float, y: float, value: str, **kwargs) -> None:
        self.add(Text(x, y, value, **kwargs))

    def build(self) -> Sheet:
        return Sheet(
            key=self.key,
            title=self.title,
            size=self.size,
            typography=self.typography,
            elements=tuple(self._elements),
        )


# ---------------------------------------------------------------------------
# Text metrics
# ---------------------------------------------------------------------------

def text_width(
    value: str,
    size: float,
    *,
    family: Family = "sans",
    bold: bool = False,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> float:
    """Advance width from the exact bundled OpenType metrics, in millimetres."""

    return advance_width(
        value, size, role=family, bold=bold, typography=typography
    )


def fit_text(
    value: str,
    limit: float,
    size: float,
    *,
    family: Family = "sans",
    bold: bool = False,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> str:
    """Truncate *value* with an ellipsis so it fits *limit* millimetres.

    A table cell that silently overflows its column is worse than one that
    admits it was too narrow, so truncation is visible rather than clipped.
    """

    if text_width(
        value, size, family=family, bold=bold, typography=typography
    ) <= limit:
        return value
    ellipsis = "…"
    trimmed = value
    while trimmed and text_width(
        trimmed + ellipsis,
        size,
        family=family,
        bold=bold,
        typography=typography,
    ) > limit:
        trimmed = trimmed[:-1]
    return (trimmed + ellipsis) if trimmed else ""


#: Soft wrap points preferred for table cells (paths, digests, notes).
_CELL_BREAK_CHARS = frozenset("/\\-_ .,:;")

#: Hard ceiling on wrapped lines in one table cell.  Past this the last line
#: is ellipsized -- a schedule that grows without bound is not a drawing.
MAX_CELL_LINES = 4


def wrap_cell(
    value: str,
    limit: float,
    size: float,
    *,
    family: Family = "mono",
    bold: bool = False,
    typography: str = DEFAULT_TYPOGRAPHY,
    max_lines: int = MAX_CELL_LINES,
) -> list[str]:
    """Wrap *value* into at most *max_lines* that each fit *limit* millimetres.

    Prefers breaks at path separators and punctuation so
    ``fabrication/gerbers/F_Cu.gbr`` wraps on ``/`` rather than mid-token.
    Falls back to character splits when a single token is wider than *limit*.
    """

    text = str(value or "")
    if not text:
        return [""]
    if text_width(text, size, family=family, bold=bold, typography=typography) <= limit:
        return [text]

    tokens = _cell_tokens(text)
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = f"{current}{token}" if current else token
        if text_width(candidate, size, family=family, bold=bold, typography=typography) <= limit:
            current = candidate
            continue
        if current:
            lines.append(current)
            current = ""
            if len(lines) >= max_lines:
                break
        if text_width(token, size, family=family, bold=bold, typography=typography) <= limit:
            current = token
            continue
        # Token itself is wider than the column: hard-split by character.
        chunk = ""
        for char in token:
            next_chunk = f"{chunk}{char}"
            if chunk and text_width(
                next_chunk, size, family=family, bold=bold, typography=typography
            ) > limit:
                lines.append(chunk)
                chunk = char
                if len(lines) >= max_lines:
                    chunk = ""
                    break
            else:
                chunk = next_chunk
        current = chunk
        if len(lines) >= max_lines:
            break

    if current and len(lines) < max_lines:
        lines.append(current)
    if not lines:
        return [fit_text(text, limit, size, family=family, bold=bold, typography=typography)]
    if len(lines) > max_lines:
        lines = lines[:max_lines]
    # If content remains after the budget, ellipsize the last kept line.
    consumed = "".join(lines)
    if consumed != text and lines:
        lines[-1] = fit_text(
            lines[-1], limit, size, family=family, bold=bold, typography=typography
        )
    return lines


def _cell_tokens(value: str) -> list[str]:
    """Split *value* into tokens that prefer path/punctuation boundaries."""

    tokens: list[str] = []
    buf = ""
    for char in value:
        buf += char
        if char in _CELL_BREAK_CHARS:
            tokens.append(buf)
            buf = ""
    if buf:
        tokens.append(buf)
    return tokens or [value]


# ---------------------------------------------------------------------------
# Shared furniture
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TitleBlockField:
    label: str
    value: str


def draw_frame(builder: SheetBuilder, *, margin: float = 10.0) -> Rect:
    """Draw the sheet border and return the usable interior rectangle."""

    outer = Rect(0.0, 0.0, builder.width, builder.height)
    inner = outer.inset(margin)
    builder.rect(inner, width=0.5)
    return inner


def draw_title_block(
    builder: SheetBuilder,
    area: Rect,
    *,
    title: str,
    fields: Sequence[TitleBlockField],
    height: float = 30.0,
    width: float = 110.0,
) -> Rect:
    """Draw a title block in *area*'s bottom-right; return the space left above.

    The fields are supplied by the caller and rendered in the given order --
    the engine never invents a date or an author, because a sheet that carries
    build-time metadata is not reproducible.
    """

    block = Rect(area.right - width, area.bottom - height, width, height)
    builder.rect(block, width=0.5)

    title_height = 8.0
    builder.line(block.x, block.y + title_height, block.right, block.y + title_height, width=0.35)
    builder.text(
        block.x + 2.0,
        block.y + title_height - 2.5,
        fit_text(
            title,
            width - 4.0,
            3.5,
            family="display",
            typography=builder.typography,
        ),
        size=3.5,
        family="display",
    )

    rows = max(1, len(fields))
    row_height = (height - title_height) / rows
    for index, entry in enumerate(fields):
        top = block.y + title_height + index * row_height
        if index:
            builder.line(block.x, top, block.right, top, width=0.2, colour="#666666")
        baseline = top + row_height - 1.6
        builder.text(
            block.x + 2.0,
            baseline,
            entry.label,
            size=2.2,
            family="display",
            colour="#444444",
        )
        builder.text(
            block.right - 2.0,
            baseline,
            fit_text(
                entry.value,
                width - 34.0,
                2.6,
                family="mono",
                typography=builder.typography,
            ),
            size=2.6,
            anchor="end",
            family="mono",
        )

    return Rect(area.x, area.y, area.width, block.y - area.y)


#: Smallest text a released drawing may carry.  ISO 3098 puts the floor for
#: printed technical lettering at 1.8 mm, and a table nobody can read is not a
#: cheaper way to fit content -- it is a missing table.
MIN_TABLE_FONT = 1.8


@dataclass(frozen=True, slots=True)
class Table:
    """A simple column-aligned table."""

    columns: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]
    widths: tuple[float, ...]
    align: tuple[Anchor, ...] = ()
    font_size: float = 2.4
    row_height: float = 4.2
    title: str = ""
    #: Set on the tail of a :meth:`split` table so a continuation sheet can say
    #: it is one -- ``LAYER STACKUP (CONTINUED)`` rather than a second table
    #: that looks like a different stackup.
    continued: bool = False
    bordered: bool = False
    max_cell_lines: int = MAX_CELL_LINES
    cell_family: Family = "mono"

    @property
    def heading(self) -> str:
        """The title as drawn, marked when this is the tail of a split."""

        if not self.title:
            return ""
        return f"{self.title} (CONTINUED)" if self.continued else self.title

    def header_height(self) -> float:
        return self.row_height + (5.0 if self.title else 0.0)

    def height(self, typography: str = DEFAULT_TYPOGRAPHY) -> float:
        return self.header_height() + sum(
            self.row_extent(row, typography) for row in self.rows
        )

    def row_extent(self, row: Sequence[str], typography: str = DEFAULT_TYPOGRAPHY) -> float:
        """How tall one data row must be once its cells are wrapped."""

        lines = 1
        for value, width in zip(row, self.widths):
            wrapped = wrap_cell(
                str(value),
                _cell_wrap_width(width, self.font_size, bordered=self.bordered),
                self.font_size,
                family=self.cell_family,
                typography=typography,
                max_lines=self.max_cell_lines,
            )
            lines = max(lines, len(wrapped))
        if lines <= 1:
            return self.row_height
        return self.row_height + (lines - 1) * self.font_size * 1.35

    def width(self) -> float:
        return sum(self.widths)

    def scaled(self, factor: float) -> "Table":
        """The same table drawn at *factor*.

        Column widths, text size and row pitch all move together, so a scaled
        table is the same table smaller -- not a table whose columns no longer
        fit their contents.
        """

        if factor >= 1.0:
            return self
        return replace(
            self,
            widths=tuple(width * factor for width in self.widths),
            font_size=self.font_size * factor,
            row_height=self.row_height * factor,
        )

    def _with_rows(self, rows: Sequence[Sequence[str]], *, continued: bool) -> "Table":
        return replace(self, rows=tuple(tuple(row) for row in rows), continued=continued)

    def split(
        self, budget: float, typography: str = DEFAULT_TYPOGRAPHY
    ) -> tuple["Table | None", "Table | None"]:
        """Divide this table so the head fits in *budget* millimetres.

        Rows are carried onto a continuation sheet, never dropped.  A released
        schedule that stops at "and 4 more" is not a schedule -- the reader
        cannot build the board from it, and the rows exist in the dossier
        regardless, so there is nothing to gain by hiding them.

        Returns ``(None, self)`` when not even one row fits, so the caller
        moves the whole table on rather than emitting a bare header.
        """

        cursor = self.header_height()
        for index, row in enumerate(self.rows):
            extent = self.row_extent(row, typography)
            if cursor + extent > budget:
                if index == 0:
                    return None, self
                return (
                    self._with_rows(self.rows[:index], continued=self.continued),
                    self._with_rows(self.rows[index:], continued=True),
                )
            cursor += extent
        return self, None


def _column_height(tables: Sequence[Table], gap: float) -> float:
    if not tables:
        return 0.0
    return sum(table.height() for table in tables) + gap * (len(tables) - 1)


#: How finely the fit search narrows the scale factor.  Twelve halvings take
#: the interval below a thousandth, which is far below one drawn millimetre.
_FIT_STEPS = 12


def _fits(columns: Sequence[Sequence[Table]], factor: float, area: "Rect", gap: float) -> bool:
    """Would every column fit *area* at *factor*, measured rather than predicted?"""

    for column in columns:
        if not column:
            continue
        if _column_height([table.scaled(factor) for table in column], gap) > area.height:
            return False
    return True


def fit_columns(
    columns: Sequence[Sequence[Table]],
    area: "Rect",
    *,
    gap: float = 6.0,
    column_gap: float = 10.0,
    min_font: float = MIN_TABLE_FONT,
) -> tuple[list[list[Table]], float]:
    """Scale *columns* of stacked tables to sit inside *area*.

    The sheet size is chosen for the **board**; the tables then have to live on
    the sheet the board earned.  Growing the paper because a stackup gained
    rows would hand a small board an A1 sheet that is nine-tenths white, so the
    tables shrink instead -- one factor for all of them, so the sheet still
    reads as one document -- down to a legibility floor.

    Rows are never dropped here.  What does not fit at the floor is returned by
    :func:`split_columns` for a continuation sheet to carry.
    """

    fitted, _overflow, factor = split_columns(
        columns, area, gap=gap, column_gap=column_gap, min_font=min_font
    )
    return fitted, factor


def split_columns(
    columns: Sequence[Sequence[Table]],
    area: "Rect",
    *,
    gap: float = 6.0,
    column_gap: float = 10.0,
    min_font: float = MIN_TABLE_FONT,
) -> tuple[list[list[Table]], list[Table], float]:
    """Fit what *area* can hold and hand back the rest.

    Returns ``(fitted, overflow, factor)``.  ``overflow`` is a flat list of
    tables -- whole ones, and the tails of any that were divided mid-way -- in
    the order they should continue on the next sheet.

    The scale factor is found by **measuring** each candidate rather than
    predicting from unscaled heights.  Scaling narrows the columns as well as
    the type, so a cell that fitted on one line at full size can wrap onto two
    when shrunk; a predicted height therefore understates the real one, and a
    column that overshoots by a millimetre used to answer by deleting rows.
    """

    present = [list(column) for column in columns if column]
    if not present:
        return [list(column) for column in columns], [], 1.0

    widths = [max(table.width() for table in column) for column in present]
    needed_width = sum(widths) + column_gap * (len(present) - 1)
    if needed_width <= 0 or area.width <= 0 or area.height <= 0:
        return [list(column) for column in columns], [], 1.0

    # Width has no remedy but to shrink -- there is nowhere else for a column to
    # go -- so it sets the ceiling. Height is then searched down to the
    # legibility floor, below which shrinking stops buying anything a reader
    # can use and the remainder continues on another sheet instead.
    smallest = min(table.font_size for column in present for table in column)
    floor = min(1.0, min_font / smallest)
    ceiling = min(1.0, area.width / needed_width)
    low = min(floor, ceiling)

    if _fits(columns, ceiling, area, gap):
        factor = ceiling
    else:
        factor = low
        lo, hi = low, ceiling
        for _ in range(_FIT_STEPS):
            middle = (lo + hi) / 2
            if _fits(columns, middle, area, gap):
                factor, lo = middle, middle
            else:
                hi = middle

    fitted: list[list[Table]] = []
    overflow: list[Table] = []
    for column in columns:
        scaled = [table.scaled(factor) for table in column]
        kept: list[Table] = []
        cursor = 0.0
        spilling = False
        for table in scaled:
            if spilling:
                overflow.append(table)
                continue
            budget = area.height - cursor - (gap if kept else 0.0)
            head, tail = table.split(budget)
            if head is not None:
                kept.append(head)
                cursor += head.height() + (gap if len(kept) > 1 else 0.0)
            if tail is not None:
                overflow.append(tail)
                spilling = True
        fitted.append(kept)
    return fitted, overflow, factor


def fit_tables(
    tables: Sequence[Table],
    area: "Rect",
    *,
    gap: float = 6.0,
    min_font: float = MIN_TABLE_FONT,
) -> tuple[list[Table], float]:
    """Scale one stacked column of tables to sit inside *area*."""

    fitted, factor = fit_columns([tables], area, gap=gap, min_font=min_font)
    return fitted[0], factor


#: Gutter kept clear at a cell's trailing edge, as a fraction of the drawn font
#: size, so a right-aligned value cannot sit flush against the next column's
#: left-aligned one and read as one word -- `0.0895I-TERA MT40`.
#:
#: Proportional rather than a fixed millimetre value because the tables scale:
#: a gutter that is comfortable at 2.4 mm text is invisible at 1.8 mm, which is
#: exactly the size a crowded stackup table gets shrunk to.
_CELL_GUTTER_RATIO = 0.5


def _cell_gutter(font_size: float) -> float:
    return font_size * _CELL_GUTTER_RATIO


def _cell_inset(font_size: float, *, bordered: bool) -> float:
    """Leading inset. Unbordered tables keep text at the column origin."""

    return _cell_gutter(font_size) if bordered else 0.0


def _cell_wrap_width(width: float, font_size: float, *, bordered: bool) -> float:
    gutter = _cell_gutter(font_size)
    reserved = 2 * gutter if bordered else gutter
    return max(width - reserved, 1.0)


def _cell_anchor(
    offset: float,
    width: float,
    align: Anchor,
    font_size: float,
    *,
    bordered: bool = False,
) -> float:
    inset = _cell_inset(font_size, bordered=bordered)
    if align == "end":
        return offset + width - _cell_gutter(font_size)
    if align == "middle":
        return offset + width / 2
    return offset + inset


def draw_table(builder: SheetBuilder, table: Table, origin: tuple[float, float]) -> float:
    """Draw *table* with its top-left at *origin*; return the y after it."""

    x0, y0 = origin
    cursor = y0

    if table.title:
        builder.text(
            x0, cursor + 3.2, table.heading, size=3.0, family="display"
        )
        cursor += 5.0

    aligns = table.align or tuple("start" for _ in table.columns)
    total_width = sum(table.widths)
    grid_top = cursor
    header_baseline = cursor + table.row_height - 1.4
    offset = x0
    for column, width, align in zip(table.columns, table.widths, aligns):
        builder.text(
            _cell_anchor(offset, width, align, table.font_size, bordered=table.bordered),
            header_baseline,
            fit_text(
                column,
                _cell_wrap_width(width, table.font_size, bordered=table.bordered),
                table.font_size,
                bold=True,
                typography=builder.typography,
            ),
            size=table.font_size,
            anchor=align,
            bold=True,
        )
        offset += width
    cursor += table.row_height
    if not table.bordered:
        builder.line(x0, cursor - 0.8, x0 + total_width, cursor - 0.8, width=0.3)

    row_stops = [cursor]
    for row in table.rows:
        offset = x0
        row_height = table.row_extent(row, builder.typography)
        line_pitch = table.font_size * 1.35
        for value, width, align in zip(row, table.widths, aligns):
            lines = wrap_cell(
                str(value),
                _cell_wrap_width(width, table.font_size, bordered=table.bordered),
                table.font_size,
                family=table.cell_family,
                typography=builder.typography,
                max_lines=table.max_cell_lines,
            )
            for line_index, line in enumerate(lines):
                builder.text(
                    _cell_anchor(offset, width, align, table.font_size, bordered=table.bordered),
                    cursor + table.font_size + line_index * line_pitch,
                    line,
                    size=table.font_size,
                    anchor=align,
                    family=table.cell_family,
                )
            offset += width
        cursor += row_height
        row_stops.append(cursor)

    if table.bordered:
        builder.rect(Rect(x0, grid_top, total_width, cursor - grid_top), width=0.3)
        builder.line(x0, row_stops[0], x0 + total_width, row_stops[0], width=0.3)
        for stop in row_stops[1:-1]:
            builder.line(x0, stop, x0 + total_width, stop, width=0.2, colour="#666666")
        col_x = x0
        for width in table.widths[:-1]:
            col_x += width
            builder.line(col_x, grid_top, col_x, cursor, width=0.2, colour="#666666")

    return cursor


def notes_height(
    notes: Sequence[str],
    *,
    width: float,
    size: float = 2.4,
    title: str = "NOTES",
    typography: str = DEFAULT_TYPOGRAPHY,
) -> float:
    """How tall :func:`draw_notes` will be for this text at this width.

    Reserved space has to be measured rather than assumed: a flat allowance is
    either too small -- and the notes run into the title block -- or too large,
    and it steals room from the schedule above for no reason.
    """

    height = 5.5 if title else 0.0
    for note in notes:
        lines = _wrap(note, width - 6.0, size, typography=typography)
        height += len(lines) * size * 1.5 + size * 0.5
    return height


def draw_notes(
    builder: SheetBuilder,
    notes: Sequence[str],
    origin: tuple[float, float],
    *,
    width: float,
    size: float = 2.4,
    title: str = "NOTES",
) -> float:
    """Draw a numbered note block, wrapping each note to *width*."""

    x0, y0 = origin
    cursor = y0
    if title:
        builder.text(x0, cursor + 3.2, title, size=3.0, family="display")
        cursor += 5.5

    for index, note in enumerate(notes, start=1):
        prefix = f"{index}."
        builder.text(x0, cursor + size, prefix, size=size)
        for line in _wrap(note, width - 6.0, size, typography=builder.typography):
            builder.text(x0 + 6.0, cursor + size, line, size=size)
            cursor += size * 1.5
        cursor += size * 0.5
    return cursor


def _wrap(
    value: str,
    width: float,
    size: float,
    *,
    typography: str = DEFAULT_TYPOGRAPHY,
) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and text_width(candidate, size, typography=typography) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]
