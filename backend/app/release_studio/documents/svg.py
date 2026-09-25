"""Deterministic SVG serializer for composed sheets (D1).

The output carries no date, no generator banner, and no generated identifiers,
so two renders of the same :class:`~app.release_studio.documents.layout.Sheet`
are byte-identical.  That is what lets a composed drawing be a released member
with a stable ``released_digest`` rather than something re-derived on demand.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

from app.release_studio.documents.fonts import (
    is_newstroke,
    newstroke_polylines,
    newstroke_width,
    svg_font_css,
)
from app.release_studio.documents.layout import (
    Artwork,
    Image,
    Line,
    Polyline,
    Rectangle,
    Sheet,
    Text,
    fmt,
)

_FONT_FAMILY = {
    "display": "PrismDisplay",
    "sans": "PrismBody",
    "mono": "PrismBody",
}


def render_svg(sheet: Sheet) -> str:
    """Serialize *sheet* to a standalone SVG document."""

    font_css = svg_font_css(sheet.typography)
    parts: list[str] = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{fmt(sheet.width)}mm" height="{fmt(sheet.height)}mm" '
        f'viewBox="0 0 {fmt(sheet.width)} {fmt(sheet.height)}" '
        f'data-typography="{escape(sheet.typography)}">',
        # A title is content, not metadata: it survives canonicalization and
        # identifies the sheet to anyone opening the file directly.
        f"<title>{escape(sheet.title)}</title>",
        *( [f"<defs><style>{font_css}</style></defs>"] if font_css else [] ),
        f'<rect x="0" y="0" width="{fmt(sheet.width)}" height="{fmt(sheet.height)}" '
        'fill="#ffffff"/>',
    ]
    for element in sheet.elements:
        parts.append(_render_element(element, sheet.typography))
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def _render_element(element, typography: str) -> str:
    if isinstance(element, Line):
        return (
            f'<line x1="{fmt(element.x1)}" y1="{fmt(element.y1)}" '
            f'x2="{fmt(element.x2)}" y2="{fmt(element.y2)}" '
            f'stroke="{element.colour}" stroke-width="{fmt(element.width)}"/>'
        )
    if isinstance(element, Rectangle):
        rect = element.rect
        return (
            f'<rect x="{fmt(rect.x)}" y="{fmt(rect.y)}" '
            f'width="{fmt(rect.width)}" height="{fmt(rect.height)}" '
            f'fill="{element.fill}" stroke="{element.colour}" '
            f'stroke-width="{fmt(element.width)}"/>'
        )
    if isinstance(element, Text):
        if is_newstroke(typography):
            return _render_newstroke_text(element, typography)
        weight_value = 400 if element.family == "display" else (600 if element.bold else 400)
        weight = f' font-weight="{weight_value}"'
        transform = (
            f' transform="rotate({fmt(element.rotation)} {fmt(element.x)} {fmt(element.y)})"'
            if element.rotation
            else ""
        )
        return (
            f'<text x="{fmt(element.x)}" y="{fmt(element.y)}" '
            f'font-family="{_FONT_FAMILY[element.family]}" '
            f'font-size="{fmt(element.size)}" text-anchor="{element.anchor}" '
            f'fill="{element.colour}"{weight}{transform}>{escape(element.value)}</text>'
        )
    if isinstance(element, Polyline):
        points = " ".join(f"{fmt(x)},{fmt(y)}" for x, y in element.points)
        tag = "polygon" if element.close else "polyline"
        return (
            f'<{tag} points="{points}" fill="{element.fill}" '
            f'stroke="{element.colour}" stroke-width="{fmt(element.width)}"/>'
        )
    if isinstance(element, Image):
        return _render_image(element)
    if isinstance(element, Artwork):
        return _render_artwork(element)
    raise TypeError(f"unrenderable sheet element: {type(element).__name__}")


def _render_newstroke_text(element: Text, typography: str) -> str:
    """Emit visible KiCad NewStroke geometry with accessible source text."""

    escaped = escape(element.value, {'"': "&quot;"})
    rows = element.value.splitlines() or [""]
    baseline_y = element.y
    transform = (
        f' transform="rotate({fmt(element.rotation)} {fmt(element.x)} {fmt(baseline_y)})"'
        if element.rotation
        else ""
    )
    parts = [
        f'<g data-renderer="kicad-monkey.newstroke" data-text="{escaped}" '
        f'aria-label="{escaped}"{transform}>',
        f"<title>{escape(element.value)}</title>",
    ]
    width = newstroke_width(element.size, bold=element.bold)
    for row_index, row in enumerate(rows):
        polylines = newstroke_polylines(
            row,
            x=element.x,
            y=baseline_y + row_index * element.size * 1.2,
            size=element.size,
            anchor=element.anchor,
        )
        for line in polylines:
            points = " ".join(f"{fmt(x)},{fmt(y)}" for x, y in line)
            parts.append(
                f'<polyline points="{points}" fill="none" '
                f'stroke="{element.colour}" stroke-width="{fmt(width)}" '
                'stroke-linecap="round" stroke-linejoin="round"/>'
            )
    parts.append("</g>")
    return "\n".join(parts)


def _render_image(image: Image) -> str:
    """Embed the picture as a data URI so the sheet stays one self-contained file."""

    import base64

    encoded = base64.b64encode(image.png_bytes).decode("ascii")
    rect = image.fitted()
    return (
        f'<image x="{fmt(rect.x)}" y="{fmt(rect.y)}" '
        f'width="{fmt(rect.width)}" height="{fmt(rect.height)}" '
        f'preserveAspectRatio="xMidYMid meet" '
        f'xlink:href="data:image/png;base64,{encoded}" '
        f'href="data:image/png;base64,{encoded}"/>'
    )


def _render_artwork(artwork: Artwork) -> str:
    """Place acquired artwork inside a clipped, transformed group.

    The artwork keeps its own coordinate system; only the group transform maps
    it onto the sheet, so the placed geometry is exactly what ``kicad-cli``
    emitted rather than something re-projected by us.
    """

    rect = artwork.rect
    clip_id = f"clip-{artwork.source_digest[:16]}"
    body = artwork.svg_body or ""
    return "\n".join(
        [
            f'<clipPath id="{clip_id}"><rect x="{fmt(rect.x)}" y="{fmt(rect.y)}" '
            f'width="{fmt(rect.width)}" height="{fmt(rect.height)}"/></clipPath>',
            f'<g clip-path="url(#{clip_id})">',
            f'<g transform="translate({fmt(artwork.offset_x)},{fmt(artwork.offset_y)}) '
            f'scale({fmt(artwork.scale)})">',
            body,
            "</g></g>",
        ]
    )
