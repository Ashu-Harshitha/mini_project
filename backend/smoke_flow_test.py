import httpx
import sys

BASE_URL = "http://127.0.0.1:8000/v1"

def run_smoke():
    print("=== STARTING END-TO-END FLOW SMOKE CHECK ===")
    
    # 1. Login / Auth
    farmer_headers = {"Authorization": "Bearer mock-farmer-token-westfield"}
    agronomist_headers = {"Authorization": "Bearer mock-agronomist-token-chen"}

    print("Step 1: Auth check...")
    r = httpx.post(f"{BASE_URL}/auth/sync", json={
        "firebase_uid": "usr-farmer-westfield",
        "email": "james.donovan@westfieldagri.com",
        "full_name": "James Donovan",
        "role": "farmer"
    })
    assert r.status_code == 200, f"auth/sync failed: {r.text}"
    print("[PASS] Auth sync success:", r.json()["email"])

    r = httpx.get(f"{BASE_URL}/auth/me", headers=farmer_headers)
    assert r.status_code == 200, f"auth/me failed: {r.text}"
    user_data = r.json()
    assert user_data["role"] == "farmer", f"expected farmer, got {user_data['role']}"
    print("[PASS] Current user authenticated as:", user_data["full_name"], f"({user_data['role']})")

    # 2. Create Case (Draft)
    print("\nStep 2: Create Case (Draft)...")
    r = httpx.post(f"{BASE_URL}/cases", headers=farmer_headers, json={
        "farm_id": 1,
        "field_id": 1,
        "crop": "Dent Corn (Pioneer P1197AM)",
        "growth_stage": "V8 (8-leaf)",
        "notes": "Lower leaf interveinal chlorosis at V8 stage."
    })
    assert r.status_code == 201, f"create case failed: {r.text}"
    case = r.json()
    case_id = case["id"]
    case_number = case["case_number"]
    assert case["status"] == "DRAFT", f"expected DRAFT, got {case['status']}"
    print(f"[PASS] Case created: ID={case_id}, Number={case_number}, Status={case['status']}")

    # 3. Weather Snapshot
    print("\nStep 3: Weather snapshot...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/weather", headers=farmer_headers)
    assert r.status_code == 201, f"weather failed: {r.text}"
    weather = r.json()
    print(f"[PASS] Weather captured: max={weather['temp_max_c']}°C, rainfall_7d={weather['rainfall_7d_mm']}mm")

    # 4. Analyze Case (DRAFT -> ANALYZING -> ANALYZED)
    print("\nStep 4: Image Analysis & Soil Interpretation...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/analyze", headers=farmer_headers)
    assert r.status_code == 200, f"analyze failed: {r.text}"
    observations = r.json()
    assert len(observations) > 0, "no observations returned"
    print(f"[PASS] Analysis produced {len(observations)} observations. Top: '{observations[0]['description']}'")

    # Verify status is ANALYZED
    r = httpx.get(f"{BASE_URL}/cases/{case_id}", headers=farmer_headers)
    assert r.json()["status"] == "ANALYZED", f"expected ANALYZED, got {r.json()['status']}"
    print("[PASS] Case state successfully transitioned to: ANALYZED")

    # 5. Generate Recommendations (ANALYZED -> PENDING_REVIEW)
    print("\nStep 5: Synthesize Recommendations...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/recommend", headers=farmer_headers)
    assert r.status_code == 200, f"recommend failed: {r.text}"
    recs = r.json()
    assert len(recs) == 3, f"expected 3 recommendations, got {len(recs)}"
    print(f"[PASS] Generated {len(recs)} ranked recommendations:")
    for rec in recs:
        print(f"   Rank {rec['rank']}: {rec['title']} (Conf: {rec['confidence']}%, Band: {rec['uncertainty']})")

    # Verify status is PENDING_REVIEW
    r = httpx.get(f"{BASE_URL}/cases/{case_id}", headers=farmer_headers)
    assert r.json()["status"] == "PENDING_REVIEW", f"expected PENDING_REVIEW, got {r.json()['status']}"
    print("[PASS] Case state successfully transitioned to: PENDING_REVIEW")

    # 6. Risk Check & Guardrails
    print("\nStep 6: Real Guardrail Engine Check...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/risk-check", headers=farmer_headers)
    assert r.status_code == 200, f"risk check failed: {r.text}"
    risk_res = r.json()
    print(f"[PASS] Guardrail check status: {risk_res['status']} (blocked: {risk_res['is_blocked']}, checks: {risk_res['guardrail_checks_count']})")

    # 7. Agronomist Review Queue & Decision
    print("\nStep 7: Agronomist Review...")
    r = httpx.get(f"{BASE_URL}/review/queue", headers=agronomist_headers)
    assert r.status_code == 200, f"review queue failed: {r.text}"
    queue = r.json()
    in_queue = any(c["id"] == case_id for c in queue)
    assert in_queue, f"Case {case_id} not found in agronomist review queue"
    print(f"[PASS] Case {case_number} confirmed present in Agronomist Review Queue ({len(queue)} total cases in queue)")

    # Submit Approval as Agronomist
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/review", headers=agronomist_headers, json={
        "status": "approve",
        "notes": "Visual chlorosis verified against 18 ppm NO3-N marginal soil test. Recommendation 1 approved."
    })
    assert r.status_code == 201, f"submit review failed: {r.text}"
    rev = r.json()
    print(f"[PASS] Agronomist review recorded: Status={rev['status']}")

    # Verify status is APPROVED
    r = httpx.get(f"{BASE_URL}/cases/{case_id}", headers=farmer_headers)
    assert r.json()["status"] == "APPROVED", f"expected APPROVED, got {r.json()['status']}"
    print("[PASS] Case state successfully transitioned to: APPROVED")

    # 8. Farmer Report Generation (APPROVED -> DELIVERED)
    print("\nStep 8: Generate Farmer Guidance Report...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/report?lang=en", headers=farmer_headers)
    assert r.status_code == 201, f"report generation failed: {r.text}"
    report = r.json()
    print(f"[PASS] Farmer Report delivered: '{report['headline']}'")
    print(f"   Audio URL: {report['audio_url']}")
    print(f"   Action Steps count: {len(report['steps'])}")

    # Verify status is DELIVERED
    r = httpx.get(f"{BASE_URL}/cases/{case_id}", headers=farmer_headers)
    assert r.json()["status"] == "DELIVERED", f"expected DELIVERED, got {r.json()['status']}"
    print("[PASS] Case state successfully transitioned to: DELIVERED")

    # 9. Record Post-Harvest Outcome (DELIVERED -> OUTCOME_REPORTED)
    print("\nStep 9: Record Post-Harvest Outcome...")
    r = httpx.post(f"{BASE_URL}/cases/{case_id}/outcome", headers=farmer_headers, json={
        "actual_diagnosis": "Nitrogen shortage confirmed by tissue test",
        "treatments_applied": ["Foliar urea 20 lb N/ac", "1.0 inch irrigation"],
        "yield_impact_rating": 5,
        "harvest_yield": 218.5,
        "notes": "Full green canopy recovered within 5 days, strong ear fill."
    })
    assert r.status_code == 201, f"outcome failed: {r.text}"
    feedback = r.json()
    print(f"[PASS] Outcome recorded: Rating={feedback['yield_impact_rating']}/5, Yield={feedback['harvest_yield']} bu/ac")

    # Verify status is OUTCOME_REPORTED
    r = httpx.get(f"{BASE_URL}/cases/{case_id}", headers=farmer_headers)
    assert r.json()["status"] == "OUTCOME_REPORTED", f"expected OUTCOME_REPORTED, got {r.json()['status']}"
    print("[PASS] Case state successfully transitioned to: OUTCOME_REPORTED")

    # 10. Check Evaluation overview reflects live DB metrics
    print("\nStep 10: Verify Eval Overview...")
    r = httpx.get(f"{BASE_URL}/eval/overview")
    assert r.status_code == 200, f"eval overview failed: {r.text}"
    ev = r.json()
    print(f"[PASS] Live DB Eval Overview: Total Cases={ev['total_cases']}, Resolved={ev['resolved_cases']}, Safety Score={ev['safety_score']}%, Groundedness={ev['groundedness_score']}%")

    print("\n=== ALL FLOW SMOKE CHECKS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    try:
        run_smoke()
    except Exception as e:
        print("FAILED:", e)
        sys.exit(1)
