import io
import math
import random
import datetime
from typing import List, Dict, Any, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.pdfgen import canvas


SIMULATED_RANGES = {
    "moisture": (15.0, 45.0),
    "n_mgkg": (20.0, 150.0),
    "p_mgkg": (20.0, 150.0),
    "k_mgkg": (20.0, 150.0),
    "temp": (15.0, 40.0),
    "humidity": (40.0, 90.0),
    "ph": (4.5, 8.5),
    "leaf_wetness": (0.0, 100.0),
}


def generate_sensor_readings(
    scenario: str = "healthy",
    hours: int = 48,
    interval_minutes: int = 60,
    seed: int = 1,
    start_time: Optional[datetime.datetime] = None,
) -> List[Dict[str, Any]]:
    """
    Generates realistic simulated field sensor readings.
    Deterministic based on seed.
    """
    rng = random.Random(seed)
    scenario = (scenario or "healthy").lower().strip()

    if start_time is None:
        end_time = datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0)
        start_time = end_time - datetime.timedelta(hours=hours)

    total_steps = max(1, int((hours * 60) / interval_minutes))
    readings: List[Dict[str, Any]] = []

    # Scenario parameters
    if scenario == "healthy":
        base_n = 90.0
        base_p = 55.0
        base_k = 90.0
        base_moisture = 34.0
        base_ph = 6.4
        base_temp = 25.0
        temp_amplitude = 6.0
        humidity_base = 65.0
    elif scenario == "n_deficiency":
        base_n = 28.0  # N 20-38
        base_p = 50.0
        base_k = 90.0
        base_moisture = 28.0  # moisture 24-32
        base_ph = 6.5
        base_temp = 26.0
        temp_amplitude = 6.0
        humidity_base = 60.0
    elif scenario == "dry":
        base_n = 70.0
        base_p = 50.0
        base_k = 85.0
        base_moisture = 18.0  # moisture 15-20
        base_ph = 6.6
        base_temp = 29.0
        temp_amplitude = 8.0
        humidity_base = 48.0
    elif scenario == "fungal_risk":
        # humidity 80-90, temp 20-28, leaf wetness 70-100 for 8+ hours a day
        base_n = 80.0
        base_p = 50.0
        base_k = 85.0
        base_moisture = 35.0
        base_ph = 6.4
        base_temp = 24.0
        temp_amplitude = 3.0  # temp stays 21-27
        humidity_base = 85.0
    elif scenario == "random":
        base_n = rng.uniform(30.0, 130.0)
        base_p = rng.uniform(30.0, 120.0)
        base_k = rng.uniform(40.0, 130.0)
        base_moisture = rng.uniform(20.0, 40.0)
        base_ph = rng.uniform(5.5, 7.5)
        base_temp = rng.uniform(20.0, 32.0)
        temp_amplitude = rng.uniform(4.0, 8.0)
        humidity_base = rng.uniform(50.0, 80.0)
    else:
        # Default healthy fallback
        base_n = 85.0
        base_p = 50.0
        base_k = 85.0
        base_moisture = 32.0
        base_ph = 6.4
        base_temp = 25.0
        temp_amplitude = 6.0
        humidity_base = 65.0

    for i in range(total_steps):
        t = start_time + datetime.timedelta(minutes=i * interval_minutes)
        hour = t.hour + t.minute / 60.0

        # Sine wave peaking at 15:00 (mid-afternoon)
        # sin((hour - 9) / 24 * 2pi): peaks at hour=15 (sin=1), troughs at hour=3 (sin=-1)
        temp_cycle = math.sin((hour - 9.0) / 24.0 * 2.0 * math.pi)
        temp_noise = rng.uniform(-0.6, 0.6)
        temp_c = round(base_temp + (temp_amplitude * temp_cycle) + temp_noise, 1)

        # Humidity inverse to temperature
        if scenario == "fungal_risk":
            # humidity strictly 80-90%
            humidity_noise = rng.uniform(-2.0, 2.0)
            humidity_pct = round(max(80.0, min(90.0, 85.0 - (3.0 * temp_cycle) + humidity_noise)), 1)
        else:
            hum_noise = rng.uniform(-2.0, 2.0)
            hum_val = humidity_base - (15.0 * temp_cycle) + hum_noise
            humidity_pct = round(max(40.0, min(90.0, hum_val)), 1)

        # Leaf wetness: high at night and early morning (e.g. 21:00 to 07:00), low midday
        if scenario == "fungal_risk":
            # leaf wetness 70-100 for 8+ hours a day (e.g., 20:00 to 08:00 = 12 hours)
            if hour >= 20.0 or hour <= 8.5:
                leaf_wetness_pct = round(rng.uniform(75.0, 98.0), 1)
            else:
                leaf_wetness_pct = round(rng.uniform(40.0, 68.0), 1)
        else:
            if hour >= 22.0 or hour <= 7.0:
                leaf_wetness_pct = round(max(0.0, min(100.0, 75.0 + rng.uniform(-10.0, 20.0))), 1)
            elif 7.0 < hour <= 10.0:
                leaf_wetness_pct = round(max(0.0, min(100.0, 45.0 - (hour - 7.0) * 12.0 + rng.uniform(-5.0, 5.0))), 1)
            else:
                leaf_wetness_pct = round(max(0.0, min(100.0, 10.0 + rng.uniform(-5.0, 8.0))), 1)

        # Soil moisture: slowly decaying over time with slight noise
        decay_rate = 0.08 * (i / float(total_steps))
        moisture_noise = rng.uniform(-0.3, 0.3)
        if scenario == "dry":
            soil_moisture = round(max(15.0, min(20.0, base_moisture - (decay_rate * 2.0) + moisture_noise)), 1)
        elif scenario == "n_deficiency":
            soil_moisture = round(max(24.0, min(32.0, base_moisture - decay_rate + moisture_noise)), 1)
        elif scenario == "healthy":
            soil_moisture = round(max(28.0, min(38.0, base_moisture - decay_rate + moisture_noise)), 1)
        else:
            soil_moisture = round(max(15.0, min(45.0, base_moisture - decay_rate + moisture_noise)), 1)

        # Nutrients (N, P, K) with small sensor fluctuations
        if scenario == "n_deficiency":
            n_val = round(max(20.0, min(38.0, base_n + rng.uniform(-2.0, 2.0))), 1)
        elif scenario == "healthy":
            n_val = round(max(70.0, min(110.0, base_n + rng.uniform(-4.0, 4.0))), 1)
        else:
            n_val = round(max(20.0, min(150.0, base_n + rng.uniform(-3.0, 3.0))), 1)

        p_val = round(max(20.0, min(150.0, base_p + rng.uniform(-2.0, 2.0))), 1)
        k_val = round(max(20.0, min(150.0, base_k + rng.uniform(-3.0, 3.0))), 1)

        # Soil pH
        if scenario == "healthy":
            ph_val = round(max(6.0, min(6.8, base_ph + rng.uniform(-0.1, 0.1))), 2)
        else:
            ph_val = round(max(4.5, min(8.5, base_ph + rng.uniform(-0.15, 0.15))), 2)

        readings.append({
            "timestamp": t.strftime("%Y-%m-%d %H:%M"),
            "soil_moisture_pct": soil_moisture,
            "n_mgkg": n_val,
            "p_mgkg": p_val,
            "k_mgkg": k_val,
            "temp_c": temp_c,
            "humidity_pct": humidity_pct,
            "ph": ph_val,
            "leaf_wetness_pct": leaf_wetness_pct,
        })

    return readings


class NumberedCanvas(canvas.Canvas):
    """Canvas callback to draw running page footer."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_footer(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#475569"))
        footer_text = "SIMULATED DATA - project demonstration"
        self.drawCentredString(letter[0] / 2.0, 24, footer_text)
        self.setFont("Helvetica", 7)
        self.drawRightString(letter[0] - 30, 24, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def build_sensor_pdf(
    readings: List[Dict[str, Any]],
    field_name: str = "North Field 1",
    sensor_kit_id: str = "AGRI-SN-8820",
    report_date: Optional[str] = None,
) -> bytes:
    """
    Renders sensor readings into an AgriAdvisor Field Sensor Report PDF.
    """
    if not report_date:
        report_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=28,
        rightMargin=28,
        topMargin=32,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=21,
        textColor=colors.HexColor("#065f46"),
    )
    meta_style = ParagraphStyle(
        "MetaText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
    )
    col_header_style = ParagraphStyle(
        "ColHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        alignment=1,
        textColor=colors.white,
    )
    cell_style = ParagraphStyle(
        "CellText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9,
        alignment=1,
        textColor=colors.HexColor("#0f172a"),
    )

    story = []

    # Title & Header
    story.append(Paragraph("AgriAdvisor Field Sensor Report", title_style))
    story.append(Spacer(1, 6))

    header_text = (
        f"<b>Field:</b> {field_name}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;"
        f"<b>Sensor Kit ID:</b> {sensor_kit_id}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;"
        f"<b>Report date:</b> {report_date}"
    )
    story.append(Paragraph(header_text, meta_style))
    story.append(Spacer(1, 10))

    # ONE Table with required columns:
    # Timestamp | Soil Moisture (%) | N (mg/kg) | P (mg/kg) | K (mg/kg) | Air Temp (C) | Humidity (%) | Soil pH | Leaf Wetness (%)
    headers = [
        "Timestamp",
        "Soil Moisture (%)",
        "N (mg/kg)",
        "P (mg/kg)",
        "K (mg/kg)",
        "Air Temp (C)",
        "Humidity (%)",
        "Soil pH",
        "Leaf Wetness (%)",
    ]

    table_data = [[Paragraph(h, col_header_style) for h in headers]]

    for r in readings:
        row = [
            Paragraph(str(r.get("timestamp", "")), cell_style),
            Paragraph(str(r.get("soil_moisture_pct", "")), cell_style),
            Paragraph(str(r.get("n_mgkg", "")), cell_style),
            Paragraph(str(r.get("p_mgkg", "")), cell_style),
            Paragraph(str(r.get("k_mgkg", "")), cell_style),
            Paragraph(str(r.get("temp_c", "")), cell_style),
            Paragraph(str(r.get("humidity_pct", "")), cell_style),
            Paragraph(str(r.get("ph", "")), cell_style),
            Paragraph(str(r.get("leaf_wetness_pct", "")), cell_style),
        ]
        table_data.append(row)

    # Column widths (total printable width: 612 - 56 = 556 pt)
    col_widths = [92, 58, 52, 52, 52, 58, 62, 56, 74]

    report_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    report_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ("TOPPADDING", (0, 0), (-1, 0), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 2),
            ("TOPPADDING", (0, 1), (-1, -1), 2),
        ])
    )
    story.append(report_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()


def generate_sensor_pdf(
    scenario: str = "healthy",
    hours: int = 48,
    interval_minutes: int = 60,
    seed: int = 1,
    field_name: str = "North Field 1",
    sensor_kit_id: str = "AGRI-SN-8820",
    start_time: Optional[datetime.datetime] = None,
) -> bytes:
    """Convenience generator combining data generation and PDF rendering."""
    readings = generate_sensor_readings(
        scenario=scenario,
        hours=hours,
        interval_minutes=interval_minutes,
        seed=seed,
        start_time=start_time,
    )
    return build_sensor_pdf(
        readings,
        field_name=field_name,
        sensor_kit_id=sensor_kit_id,
        report_date=start_time.strftime("%Y-%m-%d %H:%M") if start_time else None,
    )
