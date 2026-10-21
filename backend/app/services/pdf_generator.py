import os
import io
import datetime
import logging
from typing import Dict, Any, Optional
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger("agriadvisor.pdf_generator")

# Set up Jinja2 template environment
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), autoescape=True)


def _generate_reportlab_fallback_farmer_pdf(case: Any, body: Dict[str, Any], lang: str, machine_translated: bool) -> bytes:
    """Fallback generator for farmer PDF using ReportLab if WeasyPrint is not supported on host OS."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("FTitle", parent=styles["Heading1"], fontSize=16, leading=20, textColor=colors.HexColor("#065f46"))
    h2_style = ParagraphStyle("FH2", parent=styles["Heading2"], fontSize=12, leading=15, textColor=colors.HexColor("#065f46"))
    body_style = ParagraphStyle("FBody", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#1e293b"))
    bold_style = ParagraphStyle("FBold", parent=styles["Normal"], fontSize=10, leading=14, fontName="Helvetica-Bold", textColor=colors.HexColor("#0f172a"))
    warn_style = ParagraphStyle("FWarn", parent=styles["Normal"], fontSize=9, leading=13, textColor=colors.HexColor("#78350f"))

    story = []
    story.append(Paragraph(f"AgriAdvisor &mdash; Farmer Guidance Report", title_style))
    story.append(Paragraph(f"Case ID: {case.case_number} &middot; Crop: {case.crop} ({case.growth_stage})", bold_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph("What Is Happening In Your Field", h2_style))
    story.append(Paragraph(body.get("what_is_happening", ""), body_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Recommended Next Steps", h2_style))
    for idx, s in enumerate(body.get("next_steps", []), 1):
        story.append(Paragraph(f"<b>{idx}. {s.get('title', '')}</b> &mdash; {s.get('detail', '')}", body_style))
        story.append(Spacer(1, 4))
    story.append(Spacer(1, 6))

    warnings = body.get("warnings", [])
    if warnings:
        story.append(Paragraph("Safety & Risk Precautions", h2_style))
        for w in warnings:
            story.append(Paragraph(f"&bull; {w}", warn_style))
            story.append(Spacer(1, 2))
        story.append(Spacer(1, 6))

    reviewer = body.get("reviewed_by", "Certified Agronomist")
    rev_at = body.get("reviewed_at", "")[:10]
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"Verified by: <b>{reviewer}</b> &middot; Date: {rev_at}", body_style))
    if machine_translated:
        story.append(Spacer(1, 4))
        story.append(Paragraph("<i>Machine-translated guidance for informational assistance.</i>", body_style))

    doc.build(story)
    return buffer.getvalue()


def _generate_reportlab_fallback_expert_pdf(case: Any, sensor_readings: list, sensor_interpretation: list) -> bytes:
    """Fallback generator for expert PDF using ReportLab if WeasyPrint is not supported on host OS."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("ETitle", parent=styles["Heading1"], fontSize=15, leading=18, textColor=colors.HexColor("#0f172a"))
    h2_style = ParagraphStyle("EH2", parent=styles["Heading2"], fontSize=11, leading=14, textColor=colors.HexColor("#0f172a"))
    body_style = ParagraphStyle("EBody", parent=styles["Normal"], fontSize=8.5, leading=11, textColor=colors.HexColor("#1e293b"))
    bold_style = ParagraphStyle("EBold", parent=styles["Normal"], fontSize=8.5, leading=11, fontName="Helvetica-Bold")

    story = []
    story.append(Paragraph(f"AgriAdvisor &mdash; Expert Agronomic Diagnostic Report", title_style))
    story.append(Paragraph(f"Case Number: {case.case_number} &middot; Status: {case.status}", bold_style))
    story.append(Paragraph(f"Crop: {case.crop} &middot; Field: {case.field.name if case.field else '--'} &middot; Weather Source: {case.weather_source or 'Open-Meteo'}", body_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Diagnostic Observations", h2_style))
    for obs in (case.observations or []):
        story.append(Paragraph(f"&bull; {obs.description} (Confidence: {obs.confidence:.1f}%, Uncertainty: {obs.uncertainty})", body_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Recommendations & Grounding Citations", h2_style))
    for rec in (case.recommendations or []):
        cite = f" [Citation: {rec.citation}]" if rec.citation else ""
        story.append(Paragraph(f"<b>[{rec.category}] {rec.title}</b> &mdash; Conf: {rec.confidence:.1f}%{cite}", body_style))
        if rec.why:
            story.append(Paragraph(f"Why: {rec.why}", body_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Safety Guardrail Results", h2_style))
    for gr in (case.guardrail_results or []):
        story.append(Paragraph(f"&bull; <b>{gr.rule_name}</b>: {gr.status} &mdash; {gr.details or ''}", body_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Field Sensors (SIMULATED)", h2_style))
    story.append(Paragraph("Notice: Simulated IoT probe telemetry for diagnostic testing.", body_style))
    if sensor_readings:
        data = [["Measured", "Moisture %", "N mg/kg", "P mg/kg", "K mg/kg", "Temp C", "pH"]]
        for r in sensor_readings[:5]:
            m_date = r.measured_at.strftime('%Y-%m-%d %H:%M') if r.measured_at else '--'
            data.append([
                m_date,
                f"{r.soil_moisture_pct:.1f}" if r.soil_moisture_pct is not None else '--',
                f"{r.n_mgkg:.1f}" if r.n_mgkg is not None else '--',
                f"{r.p_mgkg:.1f}" if r.p_mgkg is not None else '--',
                f"{r.k_mgkg:.1f}" if r.k_mgkg is not None else '--',
                f"{r.temp_c:.1f}" if r.temp_c is not None else '--',
                f"{r.ph:.1f}" if r.ph is not None else '--',
            ])
        t = Table(data, colWidths=[100, 60, 60, 60, 60, 60, 40])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#0f172a")),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 7.5),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ]))
        story.append(t)
    story.append(Spacer(1, 6))

    story.append(Paragraph("Assignment History", h2_style))
    for a in (case.assignments or []):
        a_date = a.created_at.strftime('%Y-%m-%d %H:%M') if a.created_at else '--'
        from_name = a.from_user.username if a.from_user else 'System'
        to_name = a.to_user.username if a.to_user else 'Agronomist'
        story.append(Paragraph(f"&bull; {a_date}: {from_name} &rarr; {to_name} (Reason: {a.reason})", body_style))

    doc.build(story)
    return buffer.getvalue()


def generate_farmer_pdf(case: Any, report: Any, language: str = "en") -> bytes:
    """
    Renders 1-page Farmer Guidance PDF using WeasyPrint + Jinja2 (Noto Sans fonts),
    with automatic ReportLab fallback for environments without Pango C library.
    """
    body = report.body_json if hasattr(report, "body_json") and isinstance(report.body_json, dict) else {}
    machine_translated = getattr(report, "machine_translated", False)
    date_formatted = datetime.datetime.now().strftime("%Y-%m-%d")

    template = env.get_template("farmer_report.html")
    html_content = template.render(
        case=case,
        body=body,
        language=language,
        machine_translated=machine_translated,
        date_formatted=date_formatted,
    )

    try:
        import weasyprint
        return weasyprint.HTML(string=html_content).write_pdf()
    except (ImportError, OSError) as e:
        logger.info(f"WeasyPrint unavailable on this OS ({e}). Generating valid PDF via ReportLab fallback.")
        return _generate_reportlab_fallback_farmer_pdf(case, body, language, machine_translated)


def generate_expert_pdf(case: Any) -> bytes:
    """
    Renders Expert Diagnostic PDF for agronomists and admins using WeasyPrint + Jinja2,
    with automatic ReportLab fallback for environments without Pango C library.
    """
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    sensor_readings = list(case.sensor_readings or [])
    sensor_interpretation = []
    if case.sensor_summary and isinstance(case.sensor_summary, dict):
        sensor_interpretation = case.sensor_summary.get("interpretation", [])

    template = env.get_template("expert_report.html")
    html_content = template.render(
        case=case,
        now_str=now_str,
        sensor_readings=sensor_readings,
        sensor_interpretation=sensor_interpretation,
    )

    try:
        import weasyprint
        return weasyprint.HTML(string=html_content).write_pdf()
    except (ImportError, OSError) as e:
        logger.info(f"WeasyPrint unavailable on this OS ({e}). Generating valid PDF via ReportLab fallback.")
        return _generate_reportlab_fallback_expert_pdf(case, sensor_readings, sensor_interpretation)
