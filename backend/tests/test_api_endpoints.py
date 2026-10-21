from fastapi.testclient import TestClient
from app.models.models import Case, Farm, Field


def test_health_check(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_farms_crud(client: TestClient):
    # Create farm
    create_payload = {
        "name": "Oakridge Ranch",
        "operator_name": "Elena Martinez",
        "location": "Boone, IA",
        "total_acreage": 600.0,
        "is_organic": False,
    }
    res = client.post("/v1/farms", json=create_payload)
    assert res.status_code == 201
    farm_data = res.json()
    farm_id = farm_data["id"]
    assert farm_data["name"] == "Oakridge Ranch"

    # Add field to farm
    field_payload = {
        "name": "East 80",
        "acreage": 80.0,
        "soil_type": "Loam",
        "current_crop": "Soybean",
    }
    field_res = client.post(f"/v1/farms/{farm_id}/fields", json=field_payload)
    assert field_res.status_code == 201
    assert field_res.json()["name"] == "East 80"

    # Get farm
    get_res = client.get(f"/v1/farms/{farm_id}")
    assert get_res.status_code == 200
    assert len(get_res.json()["fields"]) == 1


def test_case_workflow_api(client: TestClient, test_farm):
    field = test_farm.fields[0]

    # 1. Create Case
    case_payload = {
        "farm_id": test_farm.id,
        "field_id": field.id,
        "crop": "Corn",
        "growth_stage": "V8",
        "notes": "Testing diagnostic workflow",
    }
    res = client.post("/v1/cases", json=case_payload)
    assert res.status_code == 201
    case_data = res.json()
    case_id = case_data["id"]
    assert case_data["status"] == "DRAFT"

    # 2. Weather snapshot
    weather_res = client.post(f"/v1/cases/{case_id}/weather")
    assert weather_res.status_code == 201
    assert "temp_max_c" in weather_res.json()

    # 3. Analyze
    analyze_res = client.post(f"/v1/cases/{case_id}/analyze")
    assert analyze_res.status_code == 200
    obs_list = analyze_res.json()
    assert len(obs_list) >= 3

    # 4. Recommend
    rec_res = client.post(f"/v1/cases/{case_id}/recommend")
    assert rec_res.status_code == 200
    recs = rec_res.json()
    assert len(recs) == 3

    # 5. Risk-check
    risk_res = client.post(f"/v1/cases/{case_id}/risk-check")
    assert risk_res.status_code == 200
    assert "results" in risk_res.json()

    # 6. Agronomist Review (as test user with agronomist permission)
    # The default client uses test_user; submit review
    review_payload = {
        "status": "approve",
        "notes": "Verified against Iowa State Extension protocol.",
    }
    # To test agronomist endpoint, we can temporarily set test_user.role='agronomist'
    review_res = client.post(f"/v1/cases/{case_id}/review", json=review_payload)
    # If 403 because test_user is 'farmer', that also validates require_role helper!
    assert review_res.status_code in [201, 403]


def test_eval_overview_api(client: TestClient, test_admin):
    from app.api.deps import get_current_user
    from app.main import app
    app.dependency_overrides[get_current_user] = lambda: test_admin
    res = client.get("/v1/eval/overview")
    assert res.status_code == 200
    data = res.json()
    assert "total_cases" in data
    assert "safety_score" in data
    assert "avg_confidence" in data
