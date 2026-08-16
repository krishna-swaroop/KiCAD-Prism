"""Render a production run as a styled, themed PDF report.

Where the fab spec sheet documents a board's intended specifications, this documents
one actual production run: its identity (project, board, manufacturer, release,
commit), quantities, the frozen spec snapshot it was ordered against, and every
defect logged against it with its evidence. Photo evidence is embedded inline;
PDF reports are listed as attachments (they cannot be inlined as a page here).

It follows the fab spec sheet's visual language (see ``spec_sheet_pdf_service``):
same palette, logo header, primary rule, sectioned zebra tables.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services import derived_assets, manufacturing_service as mfg
from app.services.spec_config_service import ParsedSpecConfig, SpecCondition, parse_spec_config
from app.services.workspace_service import workspace

# Shared palette with the fab spec sheet, so the two documents read as a set.
_PRIMARY = colors.HexColor("#2563EB")
_INK = colors.HexColor("#0F1729")
_MUTED = colors.HexColor("#64748B")
_HAIRLINE = colors.HexColor("#E2E8F0")
_ZEBRA = colors.HexColor("#F7F9FC")

# Severity dots, so a scan surfaces the worst defects.
_SEVERITY_COLORS = {
    "critical": colors.HexColor("#DC2626"),
    "major": colors.HexColor("#EA580C"),
    "minor": colors.HexColor("#CA8A04"),
    "aesthetic": colors.HexColor("#64748B"),
}

_RUN_STATUS_LABELS = {
    "draft": "Draft",
    "ordered": "Ordered",
    "in_production": "In production",
    "received": "Received",
    "closed": "Closed",
}

_DEFECT_STATUS_LABELS = {"open": "Open", "resolved": "Resolved", "accepted": "Accepted"}

_LOGO = (
    Path(__file__).resolve().parents[3]
    / "frontend" / "src" / "assets" / "branding" / "kicad-prism"
    / "kicad-prism-logo-horizontal-1600x366.png"
)


def _esc(text: str) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _defect_label(category: str) -> str:
    return category.replace("_", " ").strip().capitalize() or "Other"


def _satisfied(condition: dict[str, Any] | None, values: dict[str, Any]) -> bool:
    """Mirror the form's gate evaluation so the snapshot shows the same fields."""
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
    return {">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b}.get(cond.op, True)


def _display_value(field: dict[str, Any], values: dict[str, Any]) -> str:
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
        "eyebrow": ParagraphStyle(
            "Eyebrow", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, textColor=_PRIMARY, spaceAfter=2, leading=10,
        ),
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=22, textColor=_INK, spaceAfter=3, leading=26, alignment=TA_LEFT,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, textColor=_MUTED, spaceAfter=0, leading=13,
        ),
        "section": ParagraphStyle(
            "SectionHead", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=10, textColor=_PRIMARY, spaceBefore=12, spaceAfter=4, leading=12,
        ),
        "field": ParagraphStyle(
            "FieldLabel", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, textColor=_MUTED, leading=12,
        ),
        "value": ParagraphStyle(
            "FieldValue", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=9, textColor=_INK, leading=12, alignment=TA_LEFT,
        ),
        "defectTitle": ParagraphStyle(
            "DefectTitle", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=10, textColor=_INK, leading=13,
        ),
        "defectMeta": ParagraphStyle(
            "DefectMeta", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, textColor=_MUTED, leading=12,
        ),
        "defectBody": ParagraphStyle(
            "DefectBody", parent=base["Normal"], fontName="Helvetica",
            fontSize=9, textColor=_INK, leading=13,
        ),
        "caption": ParagraphStyle(
            "Caption", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, textColor=_MUTED, leading=10, alignment=TA_LEFT,
        ),
    }


def _header(run: dict[str, Any], *, board: str | None, styles: dict[str, ParagraphStyle]) -> list[Any]:
    flow: list[Any] = []
    if _LOGO.is_file():
        img = Image(str(_LOGO))
        img.drawHeight = 9 * mm
        img.drawWidth = 9 * mm * (1600 / 366)
        img.hAlign = "LEFT"
        flow.append(img)
        flow.append(Spacer(1, 6 * mm))

    project_name = str(run.get("project_name") or run.get("project_id") or "Run")
    flow.append(Paragraph("PRODUCTION RUN REPORT", styles["eyebrow"]))
    flow.append(Paragraph(_esc(project_name), styles["title"]))

    bits: list[str] = []
    if board:
        bits.append(f"<b>Board:</b> {_esc(board)}")
    if run.get("manufacturer_name"):
        bits.append(f"<b>Manufacturer:</b> {_esc(run['manufacturer_name'])}")
    if run.get("spec_name"):
        bits.append(f"<b>Spec:</b> {_esc(run['spec_name'])}")
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    bits.append(f"<b>Generated:</b> {generated}")
    flow.append(Paragraph(" &nbsp;·&nbsp; ".join(bits), styles["subtitle"]))

    flow.append(Spacer(1, 3 * mm))
    rule = Table([[""]], colWidths=[170 * mm], rowHeights=[1.4])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _PRIMARY)]))
    flow.append(rule)
    return flow


def _section_table(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [
        [Paragraph(_esc(label), styles["field"]), Paragraph(_esc(value), styles["value"])]
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


def _fmt_date(value: Any) -> str:
    if not value:
        return "—"
    text = str(value)
    # Stored as ISO; show date + minute, drop the rest.
    return text.replace("T", " ")[:16]


def _snapshot_sections(run: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    """The frozen spec the run was ordered against, rendered as sectioned tables."""
    snapshot = run.get("spec_snapshot") or {}
    values = snapshot.get("specs") or {}
    active = set(snapshot.get("active_sections") or [])
    spec_config = snapshot.get("spec_config") or ""
    if not spec_config.strip():
        return []
    parsed: ParsedSpecConfig = parse_spec_config(spec_config)

    flow: list[Any] = []
    for section in parsed.to_dict()["sections"]:
        if section["optional"] and section["title"] not in active:
            continue
        if not _satisfied(section.get("when"), values):
            continue
        rows = [
            (field["label"], _display_value(field, values))
            for field in section["fields"]
            if _satisfied(field.get("when"), values)
        ]
        if not rows:
            continue
        flow.append(Paragraph(_esc(section["title"]).upper(), styles["section"]))
        flow.append(_section_table(rows, styles))
    return flow


def _evidence_flow(run_id: str, evidence: list[dict[str, Any]], styles: dict[str, ParagraphStyle]) -> list[Any]:
    """Embed photo evidence inline; list PDF reports (and unreadable files) as attachments."""
    flow: list[Any] = []
    for item in evidence:
        digest = item.get("digest", "")
        filename = item.get("filename") or digest[:12]
        path = derived_assets.find_evidence(run_id, digest)
        is_image = str(item.get("media_type", "")).startswith("image/")
        if is_image and path is not None:
            try:
                reader = ImageReader(str(path))
                iw, ih = reader.getSize()
                max_w = 80 * mm
                draw_w = min(max_w, iw)
                draw_h = draw_w * (ih / iw) if iw else 40 * mm
                # Cap tall images so one photo does not swallow a page.
                max_h = 90 * mm
                if draw_h > max_h:
                    draw_h = max_h
                    draw_w = draw_h * (iw / ih) if ih else max_w
                img = Image(str(path), width=draw_w, height=draw_h)
                img.hAlign = "LEFT"
                flow.append(KeepTogether([img, Paragraph(_esc(filename), styles["caption"])]))
                flow.append(Spacer(1, 2 * mm))
                continue
            except Exception:  # noqa: BLE001 - a bad image should not sink the report
                pass
        # A report or an unreadable image: list it as an attachment.
        kind = "Report" if item.get("kind") == "report" else "Attachment"
        flow.append(Paragraph(f"• {_esc(kind)}: {_esc(filename)}", styles["defectMeta"]))
    return flow


def _defect_flow(run_id: str, defect: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    severity = str(defect.get("severity") or "minor")
    dot = _SEVERITY_COLORS.get(severity, _MUTED)
    title = Paragraph(
        f'<font color="#{dot.hexval()[2:]}">●</font> &nbsp;{_esc(_defect_label(str(defect.get("category") or "other")))}',
        styles["defectTitle"],
    )
    meta_bits = [
        f"Severity: {severity.capitalize()}",
        f"Status: {_DEFECT_STATUS_LABELS.get(str(defect.get('status')), str(defect.get('status') or ''))}",
        f"Units affected: {defect.get('quantity_affected', 0)}",
    ]
    if defect.get("logged_by"):
        meta_bits.append(f"By: {defect['logged_by']}")
    meta_bits.append(f"Logged: {_fmt_date(defect.get('created_at'))}")
    meta = Paragraph(" &nbsp;·&nbsp; ".join(_esc(b) for b in meta_bits), styles["defectMeta"])

    inner: list[Any] = [title, Spacer(1, 1 * mm), meta]
    if defect.get("description"):
        inner.append(Spacer(1, 1.5 * mm))
        inner.append(Paragraph(_esc(defect["description"]), styles["defectBody"]))

    # The header/meta/description sit in a hairline card. Evidence (which may hold
    # large images) follows the card as siblings, so no image is boxed inside a
    # Table cell it could overflow.
    card = Table([[inner]], colWidths=[170 * mm])
    card.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, _HAIRLINE),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    flow: list[Any] = [card]
    evidence = defect.get("evidence") or []
    if evidence:
        flow.append(Spacer(1, 2 * mm))
        flow.extend(_evidence_flow(run_id, evidence, styles))
    flow.append(Spacer(1, 3 * mm))
    return flow


def build_run_report(run_id: str) -> bytes:
    """Render a full run report (info, spec snapshot, defects, evidence) to PDF bytes."""
    run = mfg.get_run(run_id)
    if not run:
        raise ValueError("Run not found.")

    project = workspace.get_project_by_id(run.get("project_id") or "") or {}
    relative_path = str(run.get("relative_path") or project.get("relative_path") or ".")
    parent_repo = str(project.get("parent_repo") or "")
    if relative_path not in ("", "."):
        board = f"{parent_repo}/{relative_path}" if parent_repo else relative_path
    else:
        board = project.get("name") and str(project["name"])

    styles = _styles()
    flow: list[Any] = _header(run, board=board, styles=styles)

    # Run summary.
    defects = run.get("defects") or []
    affected = sum(int(d.get("quantity_affected") or 0) for d in defects)
    open_defects = sum(1 for d in defects if d.get("status") == "open")
    summary_rows = [
        ("Status", _RUN_STATUS_LABELS.get(str(run.get("status")), str(run.get("status") or "—"))),
        ("Quantity ordered", str(run.get("quantity_ordered", 0))),
        ("Good units", f"{run.get('quantity_good', 0)} / {run.get('quantity_ordered', 0)}"),
        ("Defects", f"{len(defects)} ({open_defects} open)"),
        ("Units affected", str(affected)),
    ]
    if run.get("release_tag"):
        summary_rows.append(("Release", str(run["release_tag"])))
    if run.get("commit_sha"):
        summary_rows.append(("Commit", str(run["commit_sha"])[:12]))
    summary_rows.append(("Created", _fmt_date(run.get("created_at"))))
    if run.get("created_by"):
        summary_rows.append(("Created by", str(run["created_by"])))
    if run.get("notes"):
        summary_rows.append(("Notes", str(run["notes"])))

    flow.append(Paragraph("RUN SUMMARY", styles["section"]))
    flow.append(_section_table(summary_rows, styles))

    # The frozen spec the run was ordered against.
    snapshot = _snapshot_sections(run, styles)
    if snapshot:
        flow.append(Paragraph("MANUFACTURER SPEC AT TIME OF RUN", styles["section"]))
        flow.extend(snapshot)

    # Defects and their evidence.
    flow.append(Paragraph(f"DEFECTS ({len(defects)})", styles["section"]))
    if not defects:
        flow.append(Paragraph("No defects were logged against this run.", styles["subtitle"]))
    else:
        for defect in defects:
            flow.extend(_defect_flow(run_id, defect, styles))

    project_name = str(run.get("project_name") or run.get("project_id") or "Run")
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title=f"{project_name} — Run report",
        author="KiCAD Prism",
    )

    def _footer(canvas, doc_) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(_MUTED)
        canvas.drawRightString(
            A4[0] - 20 * mm, 10 * mm,
            f"KiCAD Prism · {project_name} · run report · page {doc_.page}",
        )
        canvas.restoreState()

    doc.build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
