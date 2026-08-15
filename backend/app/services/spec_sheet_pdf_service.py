"""Render a project's board specifications as a styled, themed PDF spec sheet.

The per-project Manufacturing tab is driven by a user-defined schema; this turns the
same schema and the saved values into a clean fabrication spec sheet a team can hand
to a fab house. It reuses the spec-config parser so the sheet's sections and fields
match the form exactly, and honours the same rules the form applies: an optional
section that is switched off is omitted, and a field whose ``when`` gate is not
satisfied by the current values is skipped.

Built with ReportLab (the project's PDF library), styled to the app's palette.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services import manufacturing_service as mfg
from app.services.spec_config_service import ParsedSpecConfig, SpecCondition, parse_spec_config
from app.services.workspace_service import workspace

# The app's palette, translated to print. Primary is the same blue the UI uses.
_PRIMARY = colors.HexColor("#2563EB")
_INK = colors.HexColor("#0F1729")
_MUTED = colors.HexColor("#64748B")
_HAIRLINE = colors.HexColor("#E2E8F0")
_ZEBRA = colors.HexColor("#F7F9FC")

_LOGO = (
    Path(__file__).resolve().parents[3]
    / "frontend" / "src" / "assets" / "branding" / "kicad-prism"
    / "kicad-prism-logo-horizontal-1600x366.png"
)


def _satisfied(condition: dict[str, Any] | None, values: dict[str, Any]) -> bool:
    """Mirror the front-end gate evaluation so the sheet shows the same fields."""
    if not condition:
        return True
    cond = SpecCondition(
        key=condition["key"], op=condition["op"], values=list(condition.get("values") or [])
    )
    raw = values.get(cond.key)
    actual = "" if raw is None else str(raw)
    targets = cond.values

    if cond.op == "=":
        return actual == (targets[0] if targets else "")
    if cond.op == "!=":
        return actual != (targets[0] if targets else "")
    if cond.op == "in":
        return actual in targets
    try:
        a, b = float(actual), float(targets[0])
    except (ValueError, IndexError):
        return False
    return {
        ">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b,
    }.get(cond.op, True)


def _display_value(field: dict[str, Any], values: dict[str, Any]) -> str:
    """The value to print: the stored value, else the schema default, else a dash."""
    raw = values.get(field["key"])
    if raw is None or raw == "":
        raw = field.get("default")
    if raw is None or raw == "":
        return "—"
    if field["type"] == "bool":
        return "Yes" if raw in (True, "true", "True", 1, "1") else "No"
    return str(raw)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "SheetTitle", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=20, textColor=_INK, spaceAfter=2, leading=24,
        ),
        "subtitle": ParagraphStyle(
            "SheetSubtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, textColor=_MUTED, spaceAfter=0, leading=13,
        ),
        "section": ParagraphStyle(
            "SectionHead", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=10, textColor=_PRIMARY, spaceBefore=12, spaceAfter=4,
            leading=12,
        ),
        "field": ParagraphStyle(
            "FieldLabel", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, textColor=_MUTED, leading=12,
        ),
        "value": ParagraphStyle(
            "FieldValue", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=9, textColor=_INK, leading=12, alignment=TA_LEFT,
        ),
        "footer": ParagraphStyle(
            "Footer", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, textColor=_MUTED, leading=10, alignment=TA_RIGHT,
        ),
    }


def _header(project_name: str, styles: dict[str, ParagraphStyle]) -> list[Any]:
    flow: list[Any] = []
    if _LOGO.is_file():
        img = Image(str(_LOGO))
        img.drawHeight = 9 * mm
        img.drawWidth = 9 * mm * (1600 / 366)
        img.hAlign = "LEFT"
        flow.append(img)
        flow.append(Spacer(1, 6 * mm))
    flow.append(Paragraph("Board specification sheet", styles["title"]))
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    flow.append(Paragraph(f"{project_name} &nbsp;·&nbsp; generated {generated}", styles["subtitle"]))
    flow.append(Spacer(1, 3 * mm))
    # A primary rule under the header.
    rule = Table([[""]], colWidths=[170 * mm], rowHeights=[1.4])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _PRIMARY)]))
    flow.append(rule)
    return flow


def _section_table(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [
        [Paragraph(label, styles["field"]), Paragraph(value, styles["value"])]
        for label, value in rows
    ]
    table = Table(data, colWidths=[70 * mm, 100 * mm])
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, _HAIRLINE),
        ("LINEAFTER", (0, 0), (0, -1), 0.4, _HAIRLINE),
        ("BOX", (0, 0), (-1, -1), 0.6, _HAIRLINE),
    ]
    for i in range(len(data)):
        if i % 2 == 1:
            style.append(("BACKGROUND", (0, i), (-1, i), _ZEBRA))
    table.setStyle(TableStyle(style))
    return table


def build_spec_sheet(project_id: str) -> bytes:
    """Render the project's spec sheet to PDF bytes. Raises if the project is unknown."""
    project = workspace.get_project_by_id(project_id)
    if not project:
        raise ValueError("Project not found.")

    spec = mfg.get_board_spec(project_id)
    values = spec.get("specs") or {}
    active = set(spec.get("active_sections") or [])
    parsed: ParsedSpecConfig = parse_spec_config(spec.get("spec_config") or "")

    styles = _styles()
    project_name = project.get("display_name") or project.get("name") or project_id
    flow: list[Any] = _header(str(project_name), styles)

    any_section = False
    for section in parsed.to_dict()["sections"]:
        # An optional section switched off is left out entirely.
        if section["optional"] and section["title"] not in active:
            continue
        # A whole section can carry a gate too.
        if not _satisfied(section.get("when"), values):
            continue

        rows = [
            (field["label"], _display_value(field, values))
            for field in section["fields"]
            if _satisfied(field.get("when"), values)
        ]
        if not rows:
            continue

        any_section = True
        flow.append(Paragraph(section["title"].upper(), styles["section"]))
        flow.append(_section_table(rows, styles))

    if not any_section:
        flow.append(Spacer(1, 8 * mm))
        flow.append(Paragraph("No specifications have been recorded for this board yet.", styles["subtitle"]))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title=f"{project_name} — Board specification",
        author="KiCAD Prism",
    )

    def _footer(canvas, doc_) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(_MUTED)
        canvas.drawRightString(
            A4[0] - 20 * mm, 10 * mm,
            f"KiCAD Prism · {project_name} · page {doc_.page}",
        )
        canvas.restoreState()

    doc.build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
