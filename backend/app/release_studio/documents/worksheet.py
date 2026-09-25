"""Adapter from Monkey's public KiCad worksheet IR to Prism's sheet model.

Monkey owns ``.kicad_wks`` parsing, variable expansion, repeat behavior, page
visibility, and the default KiCad drawing-sheet geometry. Prism only translates
the emitted public Plotter operations into the shared SVG/PDF layout model.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from app.release_studio.documents.layout import (
    Line,
    Polyline,
    Rect,
    Rectangle,
    Text,
    TitleBlockField,
)

_NM_PER_MM = 1_000_000.0


def default_worksheet_elements(
    *,
    width_mm: float,
    height_mm: float,
    paper_name: str,
    title: str,
    key: str,
    context: Mapping[str, Any],
    extra_fields: Sequence[TitleBlockField] = (),
) -> tuple[Line | Polyline | Rectangle | Text, ...]:
    """Emit the pinned Monkey default worksheet as Prism layout elements."""

    from kicad_monkey import drawing_sheet_to_ops, load_default_drawing_sheet

    extras = " · ".join(
        f"{field.label}: {field.value}" for field in extra_fields if field.value
    )
    comments = {
        1: f"Document: {context.get('document_name') or context.get('document_number') or '—'}",
        2: f"Commit: {str(context.get('commit_sha') or '')[:12] or '—'}",
        3: f"Variant: {context.get('variant') or 'default'}",
        4: extras,
    }
    ops = drawing_sheet_to_ops(
        load_default_drawing_sheet(),
        paper_width_nm=int(round(width_mm * _NM_PER_MM)),
        paper_height_nm=int(round(height_mm * _NM_PER_MM)),
        title_block={
            "title": title,
            "date": str(context.get("release_date") or context.get("commit_date") or "—"),
            "rev": str(context.get("revision") or "—"),
            "company": "Prism Release Studio",
            "comments": comments,
        },
        sheet_index=1,
        sheet_count=1,
        paper_name=paper_name,
        filename=f"{context.get('document_name') or context.get('document_number') or key}.pdf",
        sheet_path=f"/{key}",
        sheet_name=key,
        kicad_version=str(context.get("kicad_version") or "KiCad"),
    )
    return tuple(_convert_op(op) for op in ops if _supported_op(op))


def _supported_op(op: Any) -> bool:
    kind = op.kind.value if hasattr(op.kind, "value") else str(op.kind)
    return kind in {"PlotPoly", "Rect", "Text"}


def _convert_op(op: Any) -> Line | Polyline | Rectangle | Text:
    kind = op.kind.value if hasattr(op.kind, "value") else str(op.kind)
    payload = op.payload
    colour = _colour(payload.get("stroke_color") or payload.get("color"))

    if kind == "PlotPoly":
        points = tuple(
            (_mm(point[0]), _mm(point[1])) for point in payload.get("points", ())
        )
        width = max(0.01, _mm(payload.get("width_nm", 0)))
        if len(points) == 2:
            return Line(
                points[0][0],
                points[0][1],
                points[1][0],
                points[1][1],
                width=width,
                colour=colour,
            )
        return Polyline(
            points=points,
            width=width,
            colour=colour,
            close=bool(points and points[0] == points[-1]),
        )

    if kind == "Rect":
        x1 = _mm(payload.get("x1", 0))
        y1 = _mm(payload.get("y1", 0))
        x2 = _mm(payload.get("x2", 0))
        y2 = _mm(payload.get("y2", 0))
        return Rectangle(
            Rect(min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1)),
            width=max(0.01, _mm(payload.get("width_nm", 0))),
            colour=colour,
        )

    if kind == "Text":
        anchor = {
            "GR_TEXT_H_ALIGN_CENTER": "middle",
            "GR_TEXT_H_ALIGN_RIGHT": "end",
        }.get(str(payload.get("h_align") or ""), "start")
        return Text(
            x=_mm(payload.get("x", 0)),
            y=_mm(payload.get("y", 0)),
            value=str(payload.get("text") or ""),
            size=max(0.1, _mm(payload.get("size_y_nm", 0))),
            anchor=anchor,
            family="display" if payload.get("bold") else "sans",
            bold=bool(payload.get("bold")),
            colour=_colour(payload.get("color") or payload.get("stroke_color")),
        )

    raise ValueError(f"unsupported Monkey worksheet operation: {kind}")


def _mm(value: Any) -> float:
    return float(value or 0) / _NM_PER_MM


def _colour(value: Any) -> str:
    text = str(value or "#000000").strip()
    if not text.startswith("#"):
        return "#000000"
    if len(text) == 9:
        return text[:7]
    return text if len(text) in {4, 7} else "#000000"


__all__ = ["default_worksheet_elements"]
