import os
import yaml
import logging
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, Base, engine
from app.models.models import (
    User,
    Farm,
    Field,
    Case,
    Observation,
    SoilResult,
    WeatherSnapshot,
    Recommendation,
    GuardrailResult,
    Review,
    Report,
    ChemicalRule,
    PromptTemplate,
    AuditLog,
)

logger = logging.getLogger("agriadvisor.seed")


def seed_database(db: Session):
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    # 1. Seed Chemical Rules from YAML
    yaml_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chemical_rules.yaml")
    if os.path.exists(yaml_path) and db.query(ChemicalRule).count() == 0:
        with open(yaml_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            for rule_data in data.get("rules", []):
                cr = ChemicalRule(**rule_data)
                db.add(cr)
        db.commit()
        logger.info("Seeded chemical rules from YAML.")

    # 2. Seed Prompt Templates
    if db.query(PromptTemplate).count() == 0:
        templates = [
            PromptTemplate(
                step="image_analysis",
                title="Image Analysis Template",
                subtitle="Crop image observation prompt — instructs model to report only visible evidence.",
                template="You are an agricultural image analysis assistant. Analyze the provided crop image and report ONLY what is visually observable.\n\nCrop context: {{crop_type}} at {{growth_stage}}\nField ID: {{field_id}}",
                variables=["{{crop_type}}", "{{growth_stage}}", "{{field_id}}"],
            ),
            PromptTemplate(
                step="recommendation",
                title="Agronomic Recommendation Prompt",
                subtitle="Synthesizes observations, soil tests, and weather into tiered candidate actions.",
                template="Synthesize observations, soil nitrate levels, and 7-day weather for {{crop_type}} at {{growth_stage}}.",
                variables=["{{crop_type}}", "{{growth_stage}}", "{{soil_n}}"],
            ),
            PromptTemplate(
                step="safety_check",
                title="Chemical & Environmental Safety Guardrail",
                subtitle="Cross-checks recommendations against EPA labels and buffer zones.",
                template="Verify chemical inputs against maximum dose and organic farm restrictions: {{chemical_name}}.",
                variables=["{{chemical_name}}", "{{target_rate}}"],
            ),
            PromptTemplate(
                step="environmental",
                title="Nitrate Leaching & Soil Health Assessment",
                subtitle="Estimates leaching risk based on soil texture class.",
                template="Evaluate nitrate leaching index given soil series {{soil_type}}.",
                variables=["{{soil_type}}", "{{drainage_class}}"],
            ),
        ]
        for t in templates:
            db.add(t)
        db.commit()
        logger.info("Seeded prompt templates.")

    # 3. Seed 3 Users with Roles: farmer, agronomist, admin (via seed_users)
    from app.scripts.seed_users import seed_users
    seed_users(db)

    farmer = db.query(User).filter(User.username == "farmer").first()
    agronomist = db.query(User).filter(User.username == "agronomist").first()
    admin = db.query(User).filter(User.username == "admin").first()

    # 4. Seed Demo Farm: Westfield Farm & Fields
    westfield = db.query(Farm).filter(Farm.name == "Westfield Farm").first()
    if not westfield:
        westfield = Farm(
            name="Westfield Farm",
            operator_name="James Donovan",
            location="Ames, Iowa 50011",
            total_acreage=847.0,
            latitude=42.0308,
            longitude=-93.6319,
            primary_crops=["Corn", "Soybean"],
            irrigation_system="Center pivot",
            is_organic=False,
        )
        db.add(westfield)
        db.commit()
        db.refresh(westfield)

        fields = [
            Field(
                farm_id=westfield.id,
                name="North 40 — Block C",
                acreage=38.0,
                soil_type="Silty clay loam",
                current_crop="Dent Corn",
                crop_variety="Pioneer P1197AM",
                last_fertilizer="Apr 30 — 120 lb/ac anhydrous NH3",
            ),
            Field(
                farm_id=westfield.id,
                name="South 80",
                acreage=80.0,
                soil_type="Silt loam",
                current_crop="Soybean",
                crop_variety="Asgrow A2834",
                last_fertilizer="May 10 — Inoculant & P/K",
            ),
            Field(
                farm_id=westfield.id,
                name="Creek Bottom",
                acreage=24.0,
                soil_type="Clay",
                current_crop="Fallow",
                last_fertilizer="None",
            ),
        ]
        for f in fields:
            db.add(f)
        db.commit()
        logger.info("Seeded Westfield Farm and fields.")

    # 5. Seed Sample Case C-2848
    target_field = db.query(Field).filter(Field.farm_id == westfield.id).first()
    existing_case = db.query(Case).filter(Case.case_number == "C-2848").first()

    if not existing_case and target_field:
        sample_case = Case(
            case_number="C-2848",
            farm_id=westfield.id,
            field_id=target_field.id,
            user_id=farmer.id,
            crop="Dent Corn (Pioneer P1197AM)",
            growth_stage="V8 (8-leaf)",
            status="APPROVED",
            confidence=72.0,
            uncertainty="Medium",
            summary="Lower leaf interveinal chlorosis at V8 stage. Soil test shows 18 ppm NO3-N (marginal).",
        )
        db.add(sample_case)
        db.commit()
        db.refresh(sample_case)

        # Observations
        observations = [
            Observation(case_id=sample_case.id, description="Interveinal chlorosis visible on lower leaves", confidence=78.0, uncertainty="Medium", note="Visible evidence only"),
            Observation(case_id=sample_case.id, description="Yellowing pattern consistent with N or S deficiency", confidence=65.0, uncertainty="Medium", note="Texture artifacts reduce certainty"),
            Observation(case_id=sample_case.id, description="No visible lesions, spots, or pest damage", confidence=91.0, uncertainty="Low", note="High confidence — clear negative"),
            Observation(case_id=sample_case.id, description="Canopy density appears normal for V8 stage", confidence=82.0, uncertainty="Low", note="Compared to reference imagery"),
        ]
        for o in observations:
            db.add(o)

        # Soil Result
        soil = SoilResult(
            case_id=sample_case.id,
            n_value="18 ppm NO3-N",
            n_status="Marginal",
            n_citation="ISU Ext. PM 1714",
            ph_value="pH 6.2",
            ph_status="Adequate",
            ph_citation="ISU Ext. PM 1688",
            pk_value="P & K Sufficient",
            pk_status="Adequate",
        )
        db.add(soil)

        # Weather Snapshot
        weather = WeatherSnapshot(
            case_id=sample_case.id,
            temp_max_c=29.0,
            temp_min_c=14.0,
            rainfall_7d_mm=12.0,
            humidity=68.0,
            wind_kmh=18.0,
            uv_index=7.0,
            rainfall_status="Below Average",
            temp_status="Optimal",
            raw_data={"source": "Open-Meteo"},
        )
        db.add(weather)

        # Recommendations
        recs = [
            Recommendation(
                case_id=sample_case.id,
                rank=1,
                category="Crop",
                title="In-field tissue test before any application",
                confidence=88.0,
                uncertainty="Low",
                evidence="Soil test alone (18 ppm N) insufficient to distinguish N vs S deficiency.",
                assumptions="Agronomist can collect sample within 48h.",
                citation="Iowa State University Extension PM 1688",
                is_visible_to_farmer=True,
            ),
            Recommendation(
                case_id=sample_case.id,
                rank=2,
                category="Fertilizer",
                title="Apply foliar nitrogen — 20 lb/ac urea solution",
                confidence=72.0,
                uncertainty="Medium",
                evidence="Low soil N (18 ppm), Interveinal chlorosis pattern, V8 timing critical window.",
                assumptions="Chlorosis is N-driven, not sulfur or water deficiency.",
                citation="University of Nebraska-Lincoln Extension G1872",
                chemical_name="Urea",
                chemical_dose=20.0,
                chemical_unit="lb N/ac",
                is_visible_to_farmer=True,
            ),
            Recommendation(
                case_id=sample_case.id,
                rank=3,
                category="Fertilizer",
                title="Monitor for 7 days — no immediate action",
                confidence=45.0,
                uncertainty="High",
                evidence="Symptoms mild; rainfall event forecast next week.",
                assumptions="7-day rainfall forecast is accurate.",
                citation="ISU Agronomy Extension",
                why_line="Why: Soil moisture uncertainty is High (no sensor data). Defer 24h if rain holds to prevent runoff & nitrate leaching.",
                is_visible_to_farmer=False,
            ),
        ]
        for r in recs:
            db.add(r)

        # Guardrail Result
        gr = GuardrailResult(
            case_id=sample_case.id,
            rule_name="Chemical Dose Limit: Synthetic Foliar Urea",
            rule_category="Chemical Safety",
            status="PASSED",
            details="Proposed rate of 20 lb N/ac within maximum threshold (30 lb N/ac).",
        )
        db.add(gr)

        # Review
        review = Review(
            case_id=sample_case.id,
            reviewer_id=agronomist.id,
            status="APPROVED",
            notes="Confirmed visual signs align with soil nitrate depression. Diagnostic leaf test prioritized before side-dressing.",
        )
        db.add(review)

        # Report
        report = Report(
            case_id=sample_case.id,
            lang="en",
            headline="What's happening with your corn?",
            description="Your North 40 corn field is showing signs of nitrogen shortage. The yellowing between the leaf veins on lower leaves is a classic sign. Your soil test shows nitrogen (18 ppm) is lower than ideal for this growth stage.",
            steps=[
                {"number": 1, "title": "Collect a leaf tissue sample today", "instruction": "Take 15 leaves from corn stalk below whorl. Send to ISU Lab."},
                {"number": 2, "title": "Irrigate with 1.0 inch within 48 hours", "instruction": "Your crop needs moisture. Check Thursday rain before starting pivot."},
                {"number": 3, "title": "Wait for tissue test before fertilizing", "instruction": "Dr. Chen advises confirming deficiency type before applying nitrogen."},
            ],
            warnings=[
                "Do not apply fertilizer without confirming issue type.",
                "If rain forecast changes, reassess irrigation timing.",
            ],
            confidence_explanation="Why not higher? The AI can't tell from images alone if it's N or sulfur deficiency. Tissue test removes this uncertainty.",
            audio_url="https://actions.google.com/sounds/v1/weather/light_rain.ogg",
        )
        db.add(report)

        # Audit Log
        audit = AuditLog(
            case_id=sample_case.id,
            user_id=farmer.id,
            action="SEED_CASE",
            from_state="DRAFT",
            to_state="APPROVED",
            details="Demo Case C-2848 seeded successfully.",
        )
        db.add(audit)

        db.commit()
        logger.info("Seeded sample case C-2848.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_database(db)
        print("Database seeded successfully!")
    finally:
        db.close()
