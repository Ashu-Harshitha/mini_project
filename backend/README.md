# AgriAdvisor AI — Backend API

FastAPI backend for **AgriAdvisor AI** (Smart Agriculture Advisor). Features role-based access control, real chemical guardrail engine, unified confidence calculations, 8-stage case state machine, Open-Meteo weather integration, and ChromaDB vector retrieval stub.

---

## Tech Stack
- **Framework**: Python 3.11+, FastAPI, Pydantic v2
- **Database & ORM**: SQLAlchemy 2.0, Alembic, PostgreSQL / SQLite
- **Security & Auth**: Firebase Admin SDK (token verification, role custom claims)
- **Vector Search**: ChromaDB client wrapper stub
- **Containerization**: Docker & Docker Compose (`postgres`, `chroma`, `api`)

---

## Getting Started

### 1. Local Setup with Virtual Environment
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Migrations & Seed Data
```bash
# Run database migrations
alembic upgrade head

# Seed demo users (farmer, agronomist, admin), Westfield Farm, and Case C-2848:
python -m app.scripts.seed
```

### 4. Run the API Server
```bash
uvicorn app.main:app --reload --port 8000
```
- Interactive Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Alternative ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Run with Docker Compose
To run PostgreSQL, ChromaDB, and the FastAPI application together:
```bash
docker-compose up --build
```
- API will be accessible on port `8000`.
- PostgreSQL on port `5432`.
- ChromaDB on port `8001`.

---

## Running Automated Tests
Run pytest across all state machine, confidence formula, and guardrail rules:
```bash
pytest
```

---

## Core Systems

### 1. Case State Machine
Enforced by `app/services/case_state.py`.
```
DRAFT -> ANALYZING -> ANALYZED -> PENDING_REVIEW -> APPROVED | APPROVED_WITH_EDITS | REJECTED -> DELIVERED -> OUTCOME_REPORTED
                                                \
                                                 -> BLOCKED (safety guardrail stop)
```
- Illegal transitions are rejected with `409 Conflict`.
- Every transition is immutably recorded in `audit_log`.

### 2. Unified Confidence Formula
`app/core/confidence.py`:
$$\text{final\_confidence} = 0.4 \times \text{model} + 0.3 \times \text{retrieval} + 0.3 \times \text{data\_completeness}$$
- **Low Uncertainty**: $\ge 80\%$
- **Medium Uncertainty**: $60\% - 79\%$
- **High Uncertainty**: $< 60\%$

### 3. Real Guardrails Engine
`app/guardrails/engine.py` reading rules from `chemical_rules` (seeded from `data/chemical_rules.yaml`):
1. **Dose Limit**: Flags treatments exceeding maximum label dosage or growth stage window. Chemical inputs mandate agronomist approval.
2. **Organic Farm**: Blocks non-organic inputs on certified organic farms (`status=BLOCKED`).
3. **Confidence Gates**: Confidence $< 80\%$ cannot auto-approve; confidence $< 50\%$ hides recommendation from farmer (`is_visible_to_farmer=False`).
4. **Citation Check**: Recommendations lacking extension/university citations are flagged.
All evaluations are saved to `guardrail_results`.
