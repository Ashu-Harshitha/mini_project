"""
scripts/try_pipeline.py

Manual test script that:
1. Creates or verifies a test farmer user, farm, and field.
2. Creates a sample leaf image file in ./uploads if missing.
3. Creates a new diagnostic case with the sample image and farmer description.
4. Executes the diagnostic AI pipeline (run_case_pipeline).
5. Prints the complete structured results for verification.
"""
import os
import sys
import datetime

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.models import User, Farm, Field, Case, CaseFile, Observation, SoilResult, Recommendation, GuardrailResult
from app.services.case_state import CaseState
from app.services.ai.pipeline import run_case_pipeline


def main():
    print("=" * 60)
    print("AgriAdvisor AI: Running Diagnostic Pipeline Tryout")
    print("=" * 60)

    db = SessionLocal()
    try:
        # 1. Ensure test farmer
        farmer = db.query(User).filter(User.username == "test_farmer_pipeline").first()
        if not farmer:
            farmer = User(
                username="test_farmer_pipeline",
                firebase_uid="uid-pipeline-farmer",
                email="farmer.pipeline@agriadvisor.app",
                full_name="Rajesh Patel",
                role="farmer",
                language="en",
                active=True,
            )
            db.add(farmer)
            db.commit()
            db.refresh(farmer)
            print(f"[+] Created test farmer: {farmer.full_name} (ID: {farmer.id})")
        else:
            print(f"[i] Using existing farmer: {farmer.full_name} (ID: {farmer.id})")

        # 2. Ensure test farm and field
        farm = db.query(Farm).filter(Farm.name == "Green Valley Farms").first()
        if not farm:
            farm = Farm(
                name="Green Valley Farms",
                operator_name="Rajesh Patel",
                location="Des Moines, IA",
                total_acreage=450.0,
                latitude=41.5868,
                longitude=-93.6250,
                primary_crops=["Corn", "Soybean"],
                irrigation_system="Center pivot",
                is_organic=False,
            )
            db.add(farm)
            db.commit()
            db.refresh(farm)
            print(f"[+] Created test farm: {farm.name} (ID: {farm.id})")
        else:
            print(f"[i] Using test farm: {farm.name} (ID: {farm.id})")

        field = db.query(Field).filter(Field.farm_id == farm.id).first()
        if not field:
            field = Field(
                farm_id=farm.id,
                name="North 40 Corn Plot",
                acreage=40.0,
                soil_type="Silt loam",
                current_crop="Corn",
                crop_variety="Pioneer P1197",
            )
            db.add(field)
            db.commit()
            db.refresh(field)
            print(f"[+] Created test field: {field.name} (ID: {field.id})")
        else:
            print(f"[i] Using test field: {field.name} (ID: {field.id})")

        # 3. Ensure sample leaf image exists
        upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
        os.makedirs(upload_dir, exist_ok=True)
        sample_img_path = os.path.join(upload_dir, "sample_corn_leaf.jpg")

        if not os.path.exists(sample_img_path):
            # Write a minimal valid 1x1 JPEG
            minimal_jpeg = (
                b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00"
                b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
                b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
                b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342"
                b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4"
                b"\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00"
                b"\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
                b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
            )
            with open(sample_img_path, "wb") as f:
                f.write(minimal_jpeg)
            print(f"[+] Generated sample image at: {sample_img_path}")
        else:
            print(f"[i] Using sample image at: {sample_img_path}")

        # 4. Create case
        import random
        case_num = f"C-TRY-{random.randint(1000, 9999)}"
        case = Case(
            case_number=case_num,
            farm_id=farm.id,
            field_id=field.id,
            user_id=farmer.id,
            crop="Corn",
            growth_stage="V8",
            status=CaseState.ANALYZING,
            confidence=0.0,
            uncertainty="Medium",
            description="Lower leaves are exhibiting severe yellowing and chlorosis along the leaf midribs. Plants appear stunted across the quadrant.",
            description_lang="en",
        )
        db.add(case)
        db.commit()
        db.refresh(case)

        # Attach sample image
        case_file = CaseFile(
            case_id=case.id,
            file_type="crop_image",
            file_path=sample_img_path,
            file_name="sample_corn_leaf.jpg",
            file_size=os.path.getsize(sample_img_path),
            mime_type="image/jpeg",
        )
        db.add(case_file)
        db.commit()
        print(f"[+] Initialized Case {case.case_number} (ID: {case.id}) with image and symptom description.")

        # 5. Run AI Pipeline
        print("\n[*] Executing run_case_pipeline()...")
        run_case_pipeline(case.id, user_id=farmer.id, db=db)

        # 6. Fetch and print results
        db.refresh(case)
        print("\n" + "=" * 60)
        print(f"CASE DIAGNOSTIC RESULTS: {case.case_number}")
        print("=" * 60)
        print(f"Status:               {case.status}")
        print(f"AI Degraded Mode:     {case.ai_degraded}")
        print(f"Issue Label:          {case.issue_label or 'N/A'}")
        print(f"Issue Category:       {case.issue_category or 'N/A'}")
        print(f"Overall Confidence:   {case.confidence}% ({case.uncertainty} Uncertainty)")
        print(f"Assigned Agronomist:  {case.assigned_agronomist.full_name if case.assigned_agronomist else 'Pending'}")

        # Observations
        observations = db.query(Observation).filter(Observation.case_id == case.id).all()
        print(f"\n--- Visual Observations ({len(observations)}) ---")
        for i, o in enumerate(observations, start=1):
            print(f"  {i}. {o.description} [Confidence: {o.confidence}% | Uncertainty: {o.uncertainty}]")

        # Soil
        soil = db.query(SoilResult).filter(SoilResult.case_id == case.id).first()
        if soil:
            print("\n--- Soil Metrics ---")
            print(f"  Nitrate (N):  {soil.n_value or (str(soil.n_ppm) + ' ppm' if soil.n_ppm else 'N/A')}")
            print(f"  pH:           {soil.ph_value or (str(soil.ph) if soil.ph else 'N/A')}")
            print(f"  Needs Conf:   {soil.needs_confirmation}")

        # Recommendations
        recommendations = (
            db.query(Recommendation)
            .filter(Recommendation.case_id == case.id)
            .order_by(Recommendation.category.asc(), Recommendation.rank.asc())
            .all()
        )
        print(f"\n--- Ranked Recommendations ({len(recommendations)}) ---")
        for r in recommendations:
            vis_flag = "[Farmer-Visible]" if r.is_visible_to_farmer else "[Expert-Only]"
            print(f"  [{r.category}] #{r.rank} {r.title} ({r.confidence}% - {r.uncertainty}) {vis_flag}")
            if r.why:
                print(f"     Why: {r.why}")
            if r.evidence:
                print(f"     Evidence: {r.evidence}")

        # Guardrails
        guardrails = db.query(GuardrailResult).filter(GuardrailResult.case_id == case.id).all()
        if guardrails:
            print(f"\n--- Guardrail Results ({len(guardrails)}) ---")
            for gr in guardrails:
                print(f"  [{gr.status}] {gr.rule_name} ({gr.rule_category}): {gr.details}")
        print("\n[OK] Diagnostic pipeline tryout completed successfully.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
