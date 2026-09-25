"""Deterministic PDF writer for composed sheets (D2/D5).

Visible default text uses the same Monkey-backed KiCad NewStroke geometry as
the SVG backend. A deterministic invisible Base-14 text layer keeps that vector
lettering searchable until upstream packages its generated NewStroke TTF assets.
Legacy bundled OpenType presets retain their embedded Type0/CIDFontType2 path.
Board artwork is composited separately; KiCad remains the renderer of copper.
"""

from __future__ import annotations

import io
import math
import re
from dataclasses import dataclass
from typing import Mapping, Sequence

from fontTools.ttLib import TTFont

from app.release_studio.documents.fonts import (
    FontAsset,
    is_newstroke,
    newstroke_polylines,
    newstroke_width,
    ttfont,
    typography_preset,
)
from app.release_studio.documents.layout import (
    Artwork,
    Image,
    Line,
    Polyline,
    Rectangle,
    Sheet,
    Text,
    text_width,
)

MM_TO_PT = 72.0 / 25.4


@dataclass(frozen=True, slots=True)
class _FontPlan:
    resource: str
    asset: FontAsset


def _font_plans(typography: str) -> tuple[_FontPlan, ...]:
    preset = typography_preset(typography)
    if is_newstroke(typography):
        return ()
    return (
        _FontPlan("F1", preset.asset("display")),
        _FontPlan("F2", preset.asset("sans")),
        _FontPlan("F3", preset.asset("sans", bold=True)),
    )


def _resource_for(element: Text) -> str:
    if element.family == "display":
        return "F1"
    return "F3" if element.bold else "F2"


def _pt(value: float) -> str:
    """Format a point value; PDF operators are whitespace-separated numbers."""

    rounded = round(float(value), 3)
    if rounded == 0:
        rounded = 0.0
    text = f"{rounded:.3f}".rstrip("0").rstrip(".")
    return text or "0"


def _subset(asset: FontAsset, used: Mapping[int, int]) -> bytes:
    """Embed only the glyphs this sheet actually sets.

    Three whole faces is 383 KiB per sheet, roughly 1.9 MiB duplicated across a
    five-sheet set -- for a drawing whose lettering is digits, capitals, and a
    handful of punctuation.  Subsetting keeps the same glyph *ids*, because the
    content stream addresses glyphs by id through Identity-H.

    Determinism is the constraint that shapes this: `fontTools` is asked to
    retain glyph ids, and the subsetter is fed a sorted id list, so the same
    sheet always produces the same font bytes.  A subsetter failure falls back
    to the verified whole face rather than to a sheet that cannot be read.
    """

    if not used:
        return asset.bytes()
    try:
        from fontTools import subset as fontsubset
    except ImportError:  # pragma: no cover - fontTools is a hard dependency
        return asset.bytes()

    try:
        options = fontsubset.Options()
        options.retain_gids = True
        options.notdef_outline = True
        options.recalc_bounds = False
        options.recalc_timestamp = False
        # `meta` and `DSIG` describe the original file, not the subset, and
        # fontTools warns loudly rather than silently keeping them.
        options.drop_tables += ["DSIG", "meta"]
        font = TTFont(
            io.BytesIO(asset.bytes()), lazy=False, recalcBBoxes=False, recalcTimestamp=False
        )
        subsetter = fontsubset.Subsetter(options=options)
        subsetter.populate(gids=sorted(used))
        subsetter.subset(font)
        out = io.BytesIO()
        font.save(out, reorderTables=False)
        return out.getvalue()
    except Exception:  # noqa: BLE001 - a legible sheet beats a smaller one
        return asset.bytes()


def _text_matrix(
    anchor_x_pt: float, baseline_y_pt: float, rotation_deg: float, offset_pt: float
) -> str:
    """A ``Tm`` placing a run rotated about its anchor point.

    The layout model states rotation the way SVG does -- degrees clockwise on a
    y-down sheet -- while PDF text space is y-up, so the sign of the shear terms
    flips on the way through.  Deriving it here once keeps the two renderings of
    a rotated designator on top of each other.
    """

    radians = math.radians(rotation_deg)
    cos, sin = math.cos(radians), math.sin(radians)
    # The run starts `offset_pt` back along its own baseline from the anchor.
    start_x = anchor_x_pt - cos * offset_pt
    start_y = baseline_y_pt + sin * offset_pt
    return (
        f"{_pt(cos)} {_pt(-sin)} {_pt(sin)} {_pt(cos)} "
        f"{_pt(start_x)} {_pt(start_y)} Tm"
    )


def _anchor_offset(anchor: str, width: float) -> float:
    if anchor == "middle":
        return width / 2
    if anchor == "end":
        return width
    return 0.0


def _paint_operator(ops: list[str], colour: str, fill: str, *, close: bool) -> str:
    """Set the colours a shape paints with and return its painting operator."""

    painted = ""
    if fill and fill != "none":
        fr, fg, fb = _rgb(fill)
        ops.append(f"{_pt(fr)} {_pt(fg)} {_pt(fb)} rg")
        painted = "f"
    if colour and colour != "none":
        r, g, b = _rgb(colour)
        ops.append(f"{_pt(r)} {_pt(g)} {_pt(b)} RG")
        painted = "B" if painted else "S"
    if not painted:
        return "n"
    if close and painted in ("S", "B"):
        return "s" if painted == "S" else "b"
    return painted


def _rgb(colour: str) -> tuple[float, float, float]:
    value = colour.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        return (0.0, 0.0, 0.0)
    return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def _glyph_hex(value: str, asset: FontAsset) -> tuple[str, dict[int, int]]:
    """Encode text as glyph IDs and return the used CID→Unicode mapping."""

    font = ttfont(asset)
    cmap = font.getBestCmap() or {}
    glyph_ids = font.getReverseGlyphMap()
    encoded = bytearray()
    used: dict[int, int] = {}
    missing: list[str] = []
    for char in value:
        glyph_name = cmap.get(ord(char))
        if glyph_name is None:
            missing.append(f"U+{ord(char):04X}")
            continue
        glyph_id = glyph_ids[glyph_name]
        if glyph_id > 0xFFFF:
            raise ValueError(f"glyph id {glyph_id} does not fit Identity-H")
        encoded += glyph_id.to_bytes(2, "big")
        used.setdefault(glyph_id, ord(char))
    if missing:
        raise ValueError(
            f"{asset.filename} cannot render " + ", ".join(sorted(set(missing)))
        )
    return encoded.hex().upper(), used


def render_pdf(sheet: Sheet) -> bytes:
    """Serialize *sheet* to a standalone one-page PDF."""

    return render_pdf_pages([sheet])


def render_pdf_pages(sheets: Sequence[Sheet]) -> bytes:
    """Serialize *sheets* into one PDF, a page each.

    A drawing set that belongs together -- every copper layer of one board, or
    both sides of one assembly -- is one document with pages, not a directory
    of files a reader has to keep in order themselves.

    Fonts are shared: the glyph set is the union across the pages, so a
    fifteen-page fabrication document embeds one subset rather than fifteen.
    Every page must be the same typography for that to hold, which is checked
    rather than assumed.
    """

    if not sheets:
        raise ValueError("a PDF needs at least one page")
    typography = sheets[0].typography
    for sheet in sheets[1:]:
        if sheet.typography != typography:
            raise ValueError(
                "every page of one document must share a typography preset; "
                f"got {typography!r} and {sheet.typography!r}"
            )

    plans = _font_plans(typography)
    used_glyphs: dict[str, dict[int, int]] = {plan.resource: {} for plan in plans}
    pages: list[tuple[bytes, float, float, list[Image]]] = []
    use_search_font = False
    for sheet in sheets:
        page_images: list[Image] = []
        content, page_search_font = _page_content(sheet, plans, used_glyphs, page_images)
        use_search_font = use_search_font or page_search_font
        pages.append(
            (content, sheet.width * MM_TO_PT, sheet.height * MM_TO_PT, page_images)
        )

    return _assemble(pages, plans, used_glyphs, use_search_font=use_search_font)


def _image_object(image: Image) -> bytes:
    """One PDF image XObject: the PNG decoded to Flate-compressed RGB.

    PDF has no PNG filter, so the picture is decoded once here and re-deflated.
    The bytes are a pure function of the source PNG, which keeps the sheet's
    digest stable across renders.
    """

    import zlib

    from PIL import Image as PILImage

    with PILImage.open(io.BytesIO(image.png_bytes)) as source:
        rgb = source.convert("RGB")
        width, height = rgb.size
        payload = zlib.compress(rgb.tobytes(), 9)
    return _stream(
        payload,
        extra=(
            f"/Type /XObject /Subtype /Image /Width {width} /Height {height} "
            "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode"
        ).encode("ascii"),
    )


def _page_content(
    sheet: Sheet,
    plans: tuple["_FontPlan", ...],
    used_glyphs: dict[str, dict[int, int]],
    images: list[Image] | None = None,
) -> tuple[bytes, bool]:
    """Build one page's content stream, recording the glyphs it sets.

    Any :class:`Image` on the page is appended to *images*; the caller turns
    those into XObjects and names them ``/PrismImage<n>`` in page order.
    """

    height_pt = sheet.height * MM_TO_PT
    width_pt = sheet.width * MM_TO_PT
    vector_text = is_newstroke(sheet.typography)
    plan_by_resource = {plan.resource: plan for plan in plans}
    use_search_font = False

    def y(value: float) -> float:
        return height_pt - value * MM_TO_PT

    def x(value: float) -> float:
        return value * MM_TO_PT

    ops: list[str] = ["1 J", "1 j", "1 1 1 rg"]
    ops.append(f"0 0 {_pt(width_pt)} {_pt(height_pt)} re f")

    for element in sheet.elements:
        if isinstance(element, Line):
            r, g, b = _rgb(element.colour)
            ops.append(f"{_pt(r)} {_pt(g)} {_pt(b)} RG")
            ops.append(f"{_pt(element.width * MM_TO_PT)} w")
            ops.append(
                f"{_pt(x(element.x1))} {_pt(y(element.y1))} m "
                f"{_pt(x(element.x2))} {_pt(y(element.y2))} l S"
            )
        elif isinstance(element, Rectangle):
            rect = element.rect
            ops.append(f"{_pt(element.width * MM_TO_PT)} w")
            painted = ""
            if element.fill != "none":
                fr, fg, fb = _rgb(element.fill)
                ops.append(f"{_pt(fr)} {_pt(fg)} {_pt(fb)} rg")
                painted = "f"
            if element.colour != "none":
                r, g, b = _rgb(element.colour)
                ops.append(f"{_pt(r)} {_pt(g)} {_pt(b)} RG")
                painted = "B" if painted else "S"
            ops.append(
                f"{_pt(x(rect.x))} {_pt(y(rect.bottom))} "
                f"{_pt(rect.width * MM_TO_PT)} {_pt(rect.height * MM_TO_PT)} re {painted or 'n'}"
            )
        elif isinstance(element, Polyline):
            if element.points:
                ops.append(f"{_pt(element.width * MM_TO_PT)} w")
                painter = _paint_operator(
                    ops, element.colour, element.fill, close=element.close
                )
                first = element.points[0]
                ops.append(f"{_pt(x(first[0]))} {_pt(y(first[1]))} m")
                for px, py in element.points[1:]:
                    ops.append(f"{_pt(x(px))} {_pt(y(py))} l")
                ops.append(painter)
        elif isinstance(element, Text):
            baseline = element.y
            # A rotated run is drawn by rotating the page about the run's anchor
            # and then drawing it as if it were level, so the vector and glyph
            # paths below need no rotation logic of their own.
            if element.rotation:
                radians = math.radians(element.rotation)
                cos, sin = math.cos(radians), math.sin(radians)
                pivot_x, pivot_y = x(element.x), y(baseline)
                ops.append("q")
                ops.append(
                    f"{_pt(cos)} {_pt(-sin)} {_pt(sin)} {_pt(cos)} "
                    f"{_pt(pivot_x - cos * pivot_x - sin * pivot_y)} "
                    f"{_pt(pivot_y + sin * pivot_x - cos * pivot_y)} cm"
                )
            if vector_text:
                r, g, b = _rgb(element.colour)
                ops.append(f"{_pt(r)} {_pt(g)} {_pt(b)} RG")
                ops.append(
                    f"{_pt(newstroke_width(element.size, bold=element.bold) * MM_TO_PT)} w"
                )
                rows = element.value.splitlines() or [""]
                for row_index, row in enumerate(rows):
                    row_y = baseline + row_index * element.size * 1.2
                    for line in newstroke_polylines(
                        row,
                        x=element.x,
                        y=row_y,
                        size=element.size,
                        anchor=element.anchor,
                    ):
                        if len(line) < 2:
                            continue
                        first = line[0]
                        ops.append(f"{_pt(x(first[0]))} {_pt(y(first[1]))} m")
                        for px, py in line[1:]:
                            ops.append(f"{_pt(x(px))} {_pt(y(py))} l")
                        ops.append("S")

                    # The visible glyphs above are authoritative. This hidden
                    # WinAnsi layer exists solely for search/copy and never
                    # affects appearance or host font selection.
                    encoded = row.encode("cp1252", errors="replace").hex().upper()
                    width = text_width(
                        row,
                        element.size,
                        family=element.family,
                        bold=element.bold,
                        typography=sheet.typography,
                    )
                    start = element.x - _anchor_offset(element.anchor, width)
                    ops.extend(
                        [
                            "BT",
                            "3 Tr",
                            f"/FText {_pt(element.size * MM_TO_PT)} Tf",
                            f"1 0 0 1 {_pt(x(start))} {_pt(y(row_y))} Tm",
                            f"<{encoded}> Tj",
                            "0 Tr",
                            "ET",
                        ]
                    )
                    use_search_font = True
                if element.rotation:
                    ops.append("Q")
                continue

            resource = _resource_for(element)
            plan = plan_by_resource[resource]
            glyph_hex, mapping = _glyph_hex(element.value, plan.asset)
            used_glyphs[resource].update(mapping)
            width = text_width(
                element.value,
                element.size,
                family=element.family,
                bold=element.bold,
                typography=sheet.typography,
            )
            start = element.x - _anchor_offset(element.anchor, width)
            r, g, b = _rgb(element.colour)
            ops.extend(
                [
                    "BT",
                    f"{_pt(r)} {_pt(g)} {_pt(b)} rg",
                    f"/{resource} {_pt(element.size * MM_TO_PT)} Tf",
                    f"1 0 0 1 {_pt(x(start))} {_pt(y(baseline))} Tm",
                    f"<{glyph_hex}> Tj",
                    "ET",
                ]
            )
            if element.rotation:
                ops.append("Q")
        elif isinstance(element, Image):
            if images is None:
                continue
            rect = element.fitted()
            name = f"PrismImage{len(images)}"
            images.append(element)
            # An image XObject draws into the unit square, so the matrix is the
            # placement: width and height in points, origin at the bottom-left.
            ops.extend(
                [
                    "q",
                    f"{_pt(rect.width * MM_TO_PT)} 0 0 {_pt(rect.height * MM_TO_PT)} "
                    f"{_pt(x(rect.x))} {_pt(y(rect.bottom))} cm",
                    f"/{name} Do",
                    "Q",
                ]
            )
        elif isinstance(element, Artwork):
            ops.append("0.6 0.6 0.6 RG")
            ops.append(f"{_pt(0.2 * MM_TO_PT)} w")
            rect = element.rect
            ops.append(
                f"{_pt(x(rect.x))} {_pt(y(rect.bottom))} "
                f"{_pt(rect.width * MM_TO_PT)} {_pt(rect.height * MM_TO_PT)} re S"
            )
        else:  # pragma: no cover - guarded by the layout element union
            raise TypeError(f"unrenderable sheet element: {type(element).__name__}")

    return "\n".join(ops).encode("ascii"), use_search_font


def _pdf_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.+-]", "-", value) or "PrismFont"


def _name(font, name_id: int, fallback: str) -> str:
    table = font["name"]
    for record in table.names:
        if record.nameID == name_id:
            try:
                return record.toUnicode()
            except UnicodeDecodeError:
                continue
    return fallback


def _font_metrics(asset: FontAsset) -> dict[str, object]:
    font = ttfont(asset)
    units = float(font["head"].unitsPerEm)

    def scale(value: float) -> int:
        return int(round(value * 1000.0 / units))

    head = font["head"]
    hhea = font["hhea"]
    os2 = font["OS/2"]
    post = font["post"]
    glyph_order = font.getGlyphOrder()
    widths = {
        glyph_id: scale(font["hmtx"].metrics[name][0])
        for glyph_id, name in enumerate(glyph_order)
    }
    return {
        "postscript": _pdf_name(_name(font, 6, asset.key)),
        "bbox": [scale(head.xMin), scale(head.yMin), scale(head.xMax), scale(head.yMax)],
        "ascent": scale(hhea.ascent),
        "descent": scale(hhea.descent),
        "cap_height": scale(getattr(os2, "sCapHeight", hhea.ascent)),
        "italic_angle": float(post.italicAngle),
        "flags": 32 | (1 if post.isFixedPitch else 0),
        "widths": widths,
    }


def _utf16_hex(codepoint: int) -> str:
    return chr(codepoint).encode("utf-16-be").hex().upper()


def _to_unicode(mapping: dict[int, int]) -> bytes:
    rows = [f"<{gid:04X}> <{_utf16_hex(codepoint)}>" for gid, codepoint in sorted(mapping.items())]
    blocks: list[str] = []
    for index in range(0, len(rows), 100):
        chunk = rows[index:index + 100]
        blocks.append(f"{len(chunk)} beginbfchar\n" + "\n".join(chunk) + "\nendbfchar")
    body = "\n".join(blocks)
    return (
        "/CIDInit /ProcSet findresource begin\n"
        "12 dict begin\n"
        "begincmap\n"
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
        "/CMapName /Prism-ToUnicode def\n"
        "/CMapType 2 def\n"
        "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n"
        f"{body}\n"
        "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n"
    ).encode("ascii")


def _stream(payload: bytes, *, extra: bytes = b"") -> bytes:
    suffix = (b" " + extra.strip()) if extra.strip() else b""
    return (
        b"<< /Length " + str(len(payload)).encode("ascii") + suffix
        + b" >>\nstream\n" + payload + b"\nendstream"
    )


def _assemble(
    pages: Sequence[tuple[bytes, float, float, Sequence[Image]]],
    plans: tuple[_FontPlan, ...],
    used_glyphs: dict[str, dict[int, int]],
    *,
    use_search_font: bool = False,
) -> bytes:
    """Build the PDF object graph with fixed ordering and no volatile metadata.

    *pages* is ``(content, width pt, height pt, images)`` each.
    """

    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    font_ids: dict[str, int] = {}
    for plan in plans:
        metrics = _font_metrics(plan.asset)
        font_bytes = _subset(plan.asset, used_glyphs[plan.resource])
        font_file_id = add(
            _stream(font_bytes, extra=b"/Length1 " + str(len(font_bytes)).encode("ascii"))
        )
        bbox = " ".join(str(value) for value in metrics["bbox"])
        descriptor_id = add(
            (
                f"<< /Type /FontDescriptor /FontName /{metrics['postscript']} "
                f"/Flags {metrics['flags']} /FontBBox [{bbox}] "
                f"/ItalicAngle {_pt(metrics['italic_angle'])} /Ascent {metrics['ascent']} "
                f"/Descent {metrics['descent']} /CapHeight {metrics['cap_height']} "
                f"/StemV 80 /FontFile2 {font_file_id} 0 R >>"
            ).encode("ascii")
        )
        unicode_payload = _to_unicode(used_glyphs[plan.resource])
        unicode_id = add(_stream(unicode_payload))
        widths: dict[int, int] = metrics["widths"]  # type: ignore[assignment]
        used_widths = " ".join(
            f"{gid} [{widths[gid]}]" for gid in sorted(used_glyphs[plan.resource])
        )
        cidfont_id = add(
            (
                f"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{metrics['postscript']} "
                "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
                f"/FontDescriptor {descriptor_id} 0 R /DW 1000 /W [{used_widths}] "
                "/CIDToGIDMap /Identity >>"
            ).encode("ascii")
        )
        font_ids[plan.resource] = add(
            (
                f"<< /Type /Font /Subtype /Type0 /BaseFont /{metrics['postscript']} "
                f"/Encoding /Identity-H /DescendantFonts [{cidfont_id} 0 R] "
                f"/ToUnicode {unicode_id} 0 R >>"
            ).encode("ascii")
        )

    if use_search_font:
        font_ids["FText"] = add(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
            b"/Encoding /WinAnsiEncoding >>"
        )

    resources = b"<< /Font << " + b" ".join(
        b"/" + resource.encode("ascii") + b" " + str(font_ids[resource]).encode("ascii") + b" 0 R"
        for resource in sorted(font_ids)
    ) + b" >> >>"

    content_ids = [add(_stream(content)) for content, _w, _h, _images in pages]
    image_ids: list[list[int]] = [
        [add(_image_object(image)) for image in page_images]
        for _content, _w, _h, page_images in pages
    ]
    # The page tree object is written after its children, so its id is known in
    # advance rather than back-patched.
    pages_id = len(objects) + len(pages) + 1
    page_ids: list[int] = []
    for index, ((_content, width_pt, height_pt, _images), content_id) in enumerate(
        zip(pages, content_ids)
    ):
        page_resources = resources
        if image_ids[index]:
            xobjects = b" ".join(
                b"/PrismImage" + str(slot).encode("ascii") + b" "
                + str(object_id).encode("ascii") + b" 0 R"
                for slot, object_id in enumerate(image_ids[index])
            )
            page_resources = (
                resources[: -len(b" >>")] + b" /XObject << " + xobjects + b" >> >>"
            )
        page_ids.append(
            add(
                b"<< /Type /Page /Parent " + str(pages_id).encode("ascii") + b" 0 R"
                b" /MediaBox [0 0 " + _pt(width_pt).encode("ascii") + b" "
                + _pt(height_pt).encode("ascii") + b"]"
                b" /Resources " + page_resources
                + b" /Contents " + str(content_id).encode("ascii") + b" 0 R >>"
            )
        )
    kids = b" ".join(str(page_id).encode("ascii") + b" 0 R" for page_id in page_ids)
    add(
        b"<< /Type /Pages /Kids [" + kids + b"] /Count "
        + str(len(page_ids)).encode("ascii") + b" >>"
    )
    catalog_id = add(b"<< /Type /Catalog /Pages " + str(pages_id).encode("ascii") + b" 0 R >>")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += str(index).encode("ascii") + b" 0 obj\n" + body + b"\nendobj\n"

    xref_at = len(out)
    count = len(objects) + 1
    out += b"xref\n0 " + str(count).encode("ascii") + b"\n"
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode("ascii")
    out += (
        b"trailer\n<< /Size " + str(count).encode("ascii")
        + b" /Root " + str(catalog_id).encode("ascii") + b" 0 R"
        b" /ID [<00000000000000000000000000000000>"
        b" <00000000000000000000000000000000>] >>\n"
        b"startxref\n" + str(xref_at).encode("ascii") + b"\n%%EOF\n"
    )
    return bytes(out)


def append_pdf_pages(base: bytes, extra: bytes) -> bytes:
    """Append *extra* pages onto *base* and canonicalize the result."""

    from pypdf import PdfReader, PdfWriter

    from app.release_studio.canonical import canonicalize_pdf

    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(base)))
    writer.append(PdfReader(io.BytesIO(extra)))
    merged = io.BytesIO()
    writer.write(merged)
    return canonicalize_pdf(merged.getvalue())
