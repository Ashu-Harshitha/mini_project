import argparse
import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf(scenario, output_path):
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=20
    )
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=styles['Normal'],
        textColor=colors.HexColor("#ef4444"),
        alignment=1, 
        fontName="Helvetica-Bold",
        fontSize=14
    )

    story.append(Paragraph(f"Field Sensor Report ({scenario.replace('_', ' ').title()})", title_style))
    story.append(Spacer(1, 10))
    
    nitrogen_value = "18" if scenario == "n_deficiency" else "75"
    nitrogen_status = "Low" if scenario == "n_deficiency" else "Adequate"
    
    data = [
        [Paragraph("<b>Sensor Metric</b>", styles['Normal']), 
         Paragraph("<b>Value</b>", styles['Normal']), 
         Paragraph("<b>Unit</b>", styles['Normal']), 
         Paragraph("<b>Status</b>", styles['Normal'])],
        ["Soil Moisture", "28", "%", "Adequate"],
        ["Nitrogen (N)", nitrogen_value, "mg/kg", nitrogen_status],
        ["Phosphorus (P)", "65", "mg/kg", "Adequate"],
        ["Potassium (K)", "110", "mg/kg", "Adequate"],
        ["Air Temperature", "26.5", "°C", "Adequate"],
        ["Humidity", "62", "%", "Adequate"],
        ["Soil pH", "6.2", "", "Adequate"],
        ["Leaf Wetness", "15", "%", "Adequate"]
    ]
    
    table = Table(data, colWidths=[150, 80, 80, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
    ]))
    
    story.append(table)
    story.append(Spacer(1, 40))
    story.append(Paragraph("SIMULATED DATA", footer_style))
    
    doc.build(story)
    print(f"Successfully generated {output_path} under scenario '{scenario}'")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate simulated soil sensor reports.")
    parser.add_argument("--scenario", required=True, help="e.g., n_deficiency")
    parser.add_argument("--out", required=True, help="Output file path, e.g., sample_n.pdf")
    
    args = parser.parse_args()
    generate_pdf(args.scenario, args.out)