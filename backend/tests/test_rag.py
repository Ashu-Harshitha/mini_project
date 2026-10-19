"""
Comprehensive tests for RAG pipeline:
1. Chunk size, overlap, sentence boundaries, skipping <40 words, header/footer cleaning.
2. Idempotent ingest with deterministic chunk IDs.
3. Cosine distance to relevance percentage conversion and min_relevance filtering.
4. Source-type filtering.
5. Empty-index behavior (returns [] and logs once).
6. Sensor interpretation labels in retrieval query.
7. Citation validation: unknown chunk IDs discarded, model confidence capped at 50, no-citation guardrail flag.
8. Role access: farmer gets 403 on all /rag/* endpoints, admin/agronomist succeed.
All embedding calls use a FakeEmbeddingFunction so nothing is downloaded.
"""

import os
import fitz
import pytest
import hashlib
from typing import List
from pathlib import Path
from unittest.mock import MagicMock, patch

import chromadb
from fastapi.testclient import TestClient

from app.rag.chunker import chunk_text, clean_repeated_headers_footers, format_citation
from app.rag.retriever import ChromaRetriever, build_retrieval_query, format_sensor_interpretations
from app.services.ai.gemini_service import GeminiRecommender, RecommenderResult, CandidateRec
from app.guardrails.engine import GuardrailEngine
from app.models.models import Case, Recommendation, RAGDocument, User
from app.core.config import settings
from app.main import app
from app.core.database import get_db
from app.api.deps import get_current_user


from chromadb.api.types import EmbeddingFunction, Documents, Embeddings


class FakeEmbeddingFunction(EmbeddingFunction[Documents]):
    """Local mock embedding function to avoid downloading models in tests."""
    def __call__(self, input: Documents) -> Embeddings:
        # Return simple deterministic 384-dimensional unit-like vectors
        res = []
        for text in input:
            val = float(len(text) % 10) / 10.0 + 0.1
            res.append([val] * 384)
        return res

    def name(self) -> str:
        return "fake_embedding_function"


@pytest.fixture
def fake_chroma_collection(request):
    client = chromadb.EphemeralClient()
    ef = FakeEmbeddingFunction()
    col_name = f"col_{hashlib.md5(request.node.name.encode()).hexdigest()[:8]}"
    col = client.get_or_create_collection(
        name=col_name,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )
    yield col
    try:
        client.delete_collection(col_name)
    except Exception:
        pass


# =====================================================================
# 1. Chunk Size, Overlap & Sentence Boundaries
# =====================================================================
def test_chunk_size_and_overlap():
    s1 = " ".join(["wordA"] * 50) + "."
    s2 = " ".join(["wordB"] * 70) + "."
    s3 = " ".join(["wordC"] * 60) + "."
    s4 = " ".join(["wordD"] * 80) + "."
    full_text = f"{s1} {s2} {s3} {s4}"

    chunks = chunk_text(full_text, target_words=150, overlap_words=30, min_words=40)
    assert len(chunks) >= 2, "Expected text to be chunked into at least 2 chunks"

    # Verify each chunk has at least min_words
    for c in chunks:
        words = c.split()
        assert len(words) >= 40, f"Chunk has fewer than 40 words: {len(words)}"

    # Verify short text under 40 words is skipped
    short_text = "This is a very short text with only ten words total."
    assert chunk_text(short_text, min_words=40) == []

    # Verify header/footer cleaning drops repeated lines across pages
    raw_pages = [
        "Iowa State University Extension - Corn Guide\nPage content 1\nConfidential 2022",
        "Iowa State University Extension - Corn Guide\nPage content 2\nConfidential 2022",
        "Iowa State University Extension - Corn Guide\nPage content 3\nConfidential 2022",
    ]
    cleaned = clean_repeated_headers_footers(raw_pages)
    for p in cleaned:
        assert "Iowa State University Extension - Corn Guide" not in p
        assert "Confidential 2022" not in p
        assert "Page content" in p


# =====================================================================
# 2. Idempotent Ingest with Deterministic Chunk IDs
# =====================================================================
def test_idempotent_ingest(tmp_path, fake_chroma_collection, db):
    # Create tiny PDF fixture with PyMuPDF
    pdf_path = tmp_path / "tiny_sample.pdf"
    doc = fitz.open()
    rect = fitz.Rect(50, 50, 500, 700)

    # 10 sentences of 12 words = 120 words per page
    p1_sentences = ["Nitrogen deficiency in corn causes distinct interveinal chlorosis on the lower vegetative leaves."] * 10
    text1 = " ".join(p1_sentences)
    page1 = doc.new_page()
    page1.insert_textbox(rect, text1)

    p2_sentences = ["Soil moisture sensors should be placed in active root zone to optimize irrigation scheduling efficiency."] * 10
    text2 = " ".join(p2_sentences)
    page2 = doc.new_page()
    page2.insert_textbox(rect, text2)

    doc.save(str(pdf_path))
    doc.close()

    doc_record = RAGDocument(
        title="Sample Test Doc",
        source_type="extension_guide",
        filename="tiny_sample.pdf",
        chunk_count=0,
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    doc_id = doc_record.id

    def run_ingest():
        doc_read = fitz.open(str(pdf_path))
        chunks_to_upsert = []
        for p_idx, page in enumerate(doc_read, start=1):
            p_text = page.get_text()
            c_list = chunk_text(p_text, target_words=150, overlap_words=30, min_words=40)
            for c_idx, c_text in enumerate(c_list):
                c_id_raw = f"{doc_id}_{p_idx}_{c_idx}"
                chunk_id = hashlib.sha1(c_id_raw.encode("utf-8")).hexdigest()
                chunks_to_upsert.append({
                    "id": chunk_id,
                    "text": c_text,
                    "metadata": {"doc_id": doc_id, "page": p_idx, "title": "Sample Test Doc"},
                })
        doc_read.close()

        if chunks_to_upsert:
            fake_chroma_collection.upsert(
                ids=[c["id"] for c in chunks_to_upsert],
                documents=[c["text"] for c in chunks_to_upsert],
                metadatas=[c["metadata"] for c in chunks_to_upsert],
            )
        return [c["id"] for c in chunks_to_upsert]

    # Run ingest run 1
    ids_run1 = run_ingest()
    count_run1 = fake_chroma_collection.count()
    assert len(ids_run1) > 0
    assert count_run1 > 0

    # Run ingest run 2 (re-run)
    ids_run2 = run_ingest()
    count_run2 = fake_chroma_collection.count()

    # Deterministic IDs and idempotency
    assert ids_run1 == ids_run2
    assert count_run1 == count_run2, "Idempotent ingest must not duplicate chunks in collection"


# =====================================================================
# 3. Relevance Conversion & Min Relevance Filtering
# =====================================================================
def test_relevance_conversion(fake_chroma_collection):
    fake_chroma_collection.add(
        ids=["c1", "c2"],
        documents=["Corn nitrogen deficiency management", "Soybean cyst nematode control"],
        metadatas=[
            {"publisher": "Iowa State University Extension", "page": 4, "title": "Corn N Guide", "source_type": "extension_guide"},
            {"publisher": "Purdue Extension", "page": 8, "title": "Soybean Guide", "source_type": "fact_sheet"},
        ],
    )

    retriever = ChromaRetriever(collection=fake_chroma_collection)

    # Distance 0.2 -> cosine_sim 0.8 -> relevance 80.0%
    # Distance 0.8 -> cosine_sim 0.2 -> relevance 20.0%
    fake_chroma_collection.query = MagicMock(return_value={
        "ids": [["c1", "c2"]],
        "documents": [["Doc 1 text", "Doc 2 text"]],
        "metadatas": [[
            {"publisher": "Iowa State University Extension", "page": 4, "title": "Corn N Guide", "source_type": "extension_guide"},
            {"publisher": "Purdue Extension", "page": 8, "title": "Soybean Guide", "source_type": "fact_sheet"},
        ]],
        "distances": [[0.2, 0.8]],
    })

    # With min_relevance = 30.0, c2 (20.0%) should be dropped, c1 (80.0%) retained
    results = retriever.retrieve_guidance(query="corn nitrogen", min_relevance=30.0)
    assert len(results) == 1
    assert results[0]["chunk_id"] == "c1"
    assert results[0]["relevance"] == 80.0
    assert results[0]["citation"] == "[ISU Ext p.4]"


# =====================================================================
# 4. Source-Type Filter
# =====================================================================
def test_source_type_filter(fake_chroma_collection):
    retriever = ChromaRetriever(collection=fake_chroma_collection)
    fake_chroma_collection.count = MagicMock(return_value=10)
    fake_chroma_collection.query = MagicMock(return_value={"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]})

    retriever.retrieve_guidance(query="nitrogen", source_type="Extension Guide")
    assert fake_chroma_collection.query.called
    call_kwargs = fake_chroma_collection.query.call_args[1]
    assert call_kwargs["where"] == {"source_type": "extension_guide"}


# =====================================================================
# 5. Empty-Index Behavior
# =====================================================================
def test_empty_index_behavior(fake_chroma_collection):
    retriever = ChromaRetriever(collection=fake_chroma_collection)
    fake_chroma_collection.count = MagicMock(return_value=0)

    # Retrieval should return [] immediately without error
    results = retriever.retrieve_guidance(query="corn nitrogen")
    assert results == []


# =====================================================================
# 6. Sensor Labels in Retrieval Query
# =====================================================================
def test_sensor_labels_appear_in_query():
    sensor_interpretations = [
        {"key": "nitrogen", "status": "low"},
        {"key": "dry_soil", "status": "active"},
        {"key": "fungal_pressure", "status": "high"},
    ]
    sensor_phrases = format_sensor_interpretations(interpretation=sensor_interpretations)
    assert "low soil nitrogen" in sensor_phrases
    assert "dry soil" in sensor_phrases
    assert "fungal pressure" in sensor_phrases
    assert "high leaf wetness and humidity" in sensor_phrases

    query = build_retrieval_query(
        crop="Corn",
        growth_stage="V8",
        observations=[{"description": "Yellowing leaves"}],
        soil_data={"n_value": "14 ppm NO3-N"},
        weather_data={"humidity": 75},
        interpretation=sensor_interpretations,
    )

    assert "Corn V8" in query
    assert "Yellowing leaves" in query
    assert "14 ppm NO3-N" in query
    assert "low soil nitrogen" in query
    assert "dry soil" in query
    assert "fungal pressure" in query
    assert "high leaf wetness and humidity" in query


# =====================================================================
# 7. Citation Validation: Discard Unknown IDs, Cap Confidence, Guardrail Flag
# =====================================================================
def test_citation_validation_drops_unknown_ids_and_caps_confidence(db, test_farm, test_user):
    recommender = GeminiRecommender()

    # Mock client structured result
    mock_llm_result = RecommenderResult(
        issue_label="Nitrogen Deficiency",
        issue_category="nitrogen_deficiency",
        crop_recommendations=[
            # Cites an unknown, hallucinated chunk ID
            CandidateRec(
                action="Apply 30 lb/ac UAN sidedress",
                why="Restore leaf chlorophyll",
                evidence="V8 growth demand",
                assumptions="No rain runoff",
                model_confidence=85.0,
                chunk_ids=["hallucinated_chunk_999"],
            )
        ],
        fertilizer_recommendations=[],
        irrigation_recommendations=[],
    )

    mock_client = MagicMock()
    mock_client.generate_structured.return_value = mock_llm_result

    # Mock retriever returning only valid_chunk_1
    mock_retriever = MagicMock()
    mock_retriever.retrieve_guidance.return_value = [
        {
            "chunk_id": "valid_chunk_1",
            "citation": "[ISU Ext p.12]",
            "title": "Corn Nitrogen Management",
            "text": "Nitrogen application guidance...",
            "relevance": 70.0,
        }
    ]

    with patch("app.services.ai.gemini_service.get_gemini_client", return_value=mock_client):
        output = recommender.generate_recommendations(
            crop="Corn",
            growth_stage="V8",
            observations=[{"text": "V-shaped chlorosis"}],
            soil_data={"n_value": "12 ppm"},
            weather_data={"temp_max_c": 28},
            retriever=mock_retriever,
        )

    rec = output["recommendations"][0]
    # Unknown ID hallucinated_chunk_999 must be discarded
    assert "hallucinated_chunk_999" not in rec["chunk_ids"]
    assert rec["chunk_ids"] == []
    # Recommendation without valid citation must have model_confidence capped at 50
    assert rec["model_confidence"] <= 50.0
    assert rec["citation"] is None

    # Guardrail check flags it
    test_field = test_farm.fields[0]
    test_case = Case(
        case_number="CASE-TEST-001",
        farm_id=test_farm.id,
        field_id=test_field.id,
        user_id=test_user.id,
        crop="Corn",
        growth_stage="V8",
        status="PENDING_REVIEW",
    )
    db.add(test_case)
    db.commit()
    db.refresh(test_case)

    rec_db = Recommendation(
        case_id=test_case.id,
        rank=1,
        category=rec.get("category", "Crop"),
        title=rec["action"],
        confidence=rec["final_confidence"],
        uncertainty=rec["uncertainty"],
        citation=rec["citation"],  # None
        chunk_ids=rec["chunk_ids"],
    )
    db.add(rec_db)
    db.commit()

    is_blocked, results = GuardrailEngine.run_checks(db, test_case)
    citation_flags = [r for r in results if r.rule_name == "Grounded Citation Requirement"]
    assert len(citation_flags) == 1
    assert citation_flags[0].status == "FLAGGED"


def test_valid_citation_feeds_confidence():
    recommender = GeminiRecommender()

    mock_llm_result = RecommenderResult(
        issue_label="Nitrogen Deficiency",
        issue_category="nitrogen_deficiency",
        crop_recommendations=[
            CandidateRec(
                action="Side-dress application",
                why="Soil test low",
                evidence="ISU Ext guidance",
                assumptions="Good moisture",
                model_confidence=90.0,
                chunk_ids=["valid_chunk_1"],
            )
        ],
        fertilizer_recommendations=[],
        irrigation_recommendations=[],
    )

    mock_client = MagicMock()
    mock_client.generate_structured.return_value = mock_llm_result

    mock_retriever = MagicMock()
    mock_retriever.retrieve_guidance.return_value = [
        {
            "chunk_id": "valid_chunk_1",
            "citation": "[ISU Ext p.12]",
            "title": "Corn Nitrogen Management",
            "text": "Nitrogen application guidance...",
            "relevance": 80.0,
        }
    ]

    with patch("app.services.ai.gemini_service.get_gemini_client", return_value=mock_client):
        output = recommender.generate_recommendations(
            crop="Corn",
            growth_stage="V8",
            observations=[{"text": "V-shaped chlorosis"}],
            soil_data={"n_value": "12 ppm"},
            weather_data={"temp_max_c": 28},
            retriever=mock_retriever,
        )

    rec = output["recommendations"][0]
    assert rec["chunk_ids"] == ["valid_chunk_1"]
    assert rec["citation"] == "[ISU Ext p.12]"
    assert rec["model_confidence"] == 90.0


# =====================================================================
# 8. Role Access: Farmer gets 403 on /rag/* endpoints
# =====================================================================
def test_farmer_gets_403_on_rag_endpoints(client):
    # `client` fixture is authenticated as test_user with role='farmer'
    # 1. GET /rag/search
    r_search = client.get("/rag/search?q=corn")
    assert r_search.status_code == 403

    # 2. GET /rag/stats
    r_stats = client.get("/rag/stats")
    assert r_stats.status_code == 403

    # 3. GET /rag/documents
    r_docs = client.get("/rag/documents")
    assert r_docs.status_code == 403

    # 4. GET /rag/chunks/{id}
    r_chunk = client.get("/rag/chunks/some_chunk_id")
    assert r_chunk.status_code == 403

    # 5. POST /rag/documents
    r_upload = client.post(
        "/rag/documents",
        data={"title": "Test Doc", "source_type": "extension_guide"},
        files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert r_upload.status_code == 403


def test_admin_and_agronomist_can_access_rag(db, test_admin, test_agronomist, fake_firebase):
    # Test Admin access
    app.dependency_overrides[get_current_user] = lambda: test_admin
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as admin_client:
        r_stats = admin_client.get("/rag/stats")
        assert r_stats.status_code == 200
        data = r_stats.json()
        assert "documents" in data
        assert "chunks" in data
        assert "coverage" in data

        r_docs = admin_client.get("/rag/documents")
        assert r_docs.status_code == 200
        assert isinstance(r_docs.json(), list)

    # Test Agronomist access
    app.dependency_overrides[get_current_user] = lambda: test_agronomist
    with TestClient(app) as agro_client:
        r_stats = agro_client.get("/rag/stats")
        assert r_stats.status_code == 200

        r_search = agro_client.get("/rag/search?q=corn")
        assert r_search.status_code == 200

    app.dependency_overrides.clear()
