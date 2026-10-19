"""
RAG API routes for AgriAdvisor AI.
Provides search, statistics, document management, and chunk retrieval endpoints.
Strictly role-authorized: admin and agronomist for search/stats/chunks, admin for documents.
Farmer role receives 403 Forbidden.
"""

import os
import csv
import time
import logging
from collections import deque
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Query,
    BackgroundTasks,
    status,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.models.models import User, RAGDocument
from app.api.deps import require_role
from app.rag.chroma import get_agronomy_collection
from app.rag.chunker import format_citation
from app.services.ai.factory import get_retriever

logger = logging.getLogger("agriadvisor.rag.api")

router = APIRouter(prefix="/rag", tags=["RAG"])

# In-memory retrieval latency tracking for the last 50 queries
_retrieval_latencies: deque = deque(maxlen=50)


def _get_rag_dir() -> Path:
    candidates = [
        Path(settings.CHROMA_PATH).resolve().parent / "rag_pdfs",
        Path("backend/data/rag_pdfs").resolve(),
        Path("data/rag_pdfs").resolve(),
    ]
    for p in candidates:
        if p.exists():
            return p
    return candidates[0]


def run_background_ingest(filename: str):
    """Executes single-document ingestion in a background task."""
    try:
        from scripts.ingest_rag import ingest_manifest
        rag_dir = _get_rag_dir()
        manifest_path = rag_dir / "manifest.csv"
        ingest_manifest(manifest_path=str(manifest_path) if manifest_path.exists() else None, only_file=filename)
        logger.info(f"Background ingestion completed for {filename}")
    except Exception as e:
        logger.error(f"Error during background ingestion of {filename}: {e}", exc_info=True)


@router.get("/search")
def search_rag(
    q: str = Query("", description="Agronomic search query"),
    k: int = Query(settings.RAG_TOP_K, ge=1, le=20, description="Top-k chunks to retrieve"),
    source_type: Optional[str] = Query(None, description="Optional source type filter"),
    current_user: User = Depends(require_role("admin", "agronomist")),
) -> List[Dict[str, Any]]:
    """
    Search agronomy documents by semantic similarity.
    Accessible to admins and agronomists.
    """
    start_t = time.perf_counter()
    retriever = get_retriever()
    results = retriever.retrieve_guidance(query=q, top_k=k, source_type=source_type)
    elapsed_ms = (time.perf_counter() - start_t) * 1000.0
    _retrieval_latencies.append(elapsed_ms)
    return results


@router.get("/stats")
def get_rag_stats(
    current_user: User = Depends(require_role("admin", "agronomist")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    RAG system statistics:
    - total documents
    - total chunks in collection
    - last refresh timestamp
    - average retrieval ms over the last 50 searches in memory
    - index coverage (documents with at least 1 chunk / manifest rows)
    """
    # 1. Total chunks from ChromaDB
    try:
        col = get_agronomy_collection()
        total_chunks = col.count()
    except Exception as e:
        logger.warning(f"Failed to query Chroma count: {e}")
        total_chunks = 0

    # 2. Documents from DB
    docs = db.query(RAGDocument).all()
    doc_count = len(docs)
    docs_with_chunks = sum(1 for d in docs if (d.chunk_count or 0) > 0)

    # 3. Last refresh
    last_refresh_str = "Never"
    if docs:
        latest = max(docs, key=lambda d: getattr(d, "updated_at", None) or d.created_at)
        dt = getattr(latest, "updated_at", None) or latest.created_at
        if dt:
            last_refresh_str = dt.strftime("%Y-%m-%d %H:%M UTC")

    # 4. Manifest rows count
    rag_dir = _get_rag_dir()
    manifest_path = rag_dir / "manifest.csv"
    manifest_rows_count = 0
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                manifest_rows_count = sum(1 for r in reader if (r.get("filename") or "").strip())
        except Exception as e:
            logger.debug(f"Could not read manifest for stats: {e}")

    # 5. Coverage
    if manifest_rows_count > 0:
        cov_pct = round((docs_with_chunks / manifest_rows_count) * 100.0, 1)
        coverage_str = f"{cov_pct}%"
    elif doc_count > 0:
        coverage_str = "100.0%"
    else:
        coverage_str = "0.0%"

    # 6. Average retrieval latency
    avg_ms = round(sum(_retrieval_latencies) / len(_retrieval_latencies), 1) if _retrieval_latencies else 0.0

    return {
        "documents": doc_count,
        "documentsIndexed": doc_count,
        "chunks": total_chunks,
        "totalChunks": total_chunks,
        "last_refresh": last_refresh_str,
        "lastRefresh": last_refresh_str,
        "average_retrieval_ms": avg_ms,
        "avg_retrieval_ms": avg_ms,
        "avgRetrievalMs": avg_ms,
        "coverage": coverage_str,
        "indexCoverage": coverage_str,
    }


@router.get("/documents")
def get_rag_documents(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Lists all indexed RAG documents with metadata. Admin only.
    """
    records = db.query(RAGDocument).order_by(RAGDocument.id.asc()).all()
    out = []
    for r in records:
        out.append({
            "id": r.id,
            "filename": r.filename,
            "title": r.title,
            "source_type": r.source_type,
            "year": r.year,
            "authors": r.authors,
            "publisher": r.publisher,
            "chunk_count": r.chunk_count,
            "file_path": r.file_path,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": getattr(r, "updated_at", None).isoformat() if getattr(r, "updated_at", None) else (r.created_at.isoformat() if r.created_at else None),
        })
    return out


@router.get("/chunks/{chunk_id}")
def get_rag_chunk(
    chunk_id: str,
    current_user: User = Depends(require_role("admin", "agronomist")),
) -> Dict[str, Any]:
    """
    Fetches a specific chunk by ID from ChromaDB.
    Returns chunk text, citation label, page number, and source document metadata.
    """
    try:
        col = get_agronomy_collection()
        res = col.get(ids=[chunk_id], include=["documents", "metadatas"])
    except Exception as e:
        logger.error(f"Error querying chunk {chunk_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error retrieving chunk: {e}",
        )

    if not res or not res.get("ids") or len(res["ids"]) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chunk '{chunk_id}' not found in agronomy index.",
        )

    text = res["documents"][0] if res.get("documents") else ""
    meta = res["metadatas"][0] if res.get("metadatas") else {}
    publisher = meta.get("publisher", "")
    page = int(meta.get("page", 1))
    citation = format_citation(publisher, page)

    return {
        "chunk_id": chunk_id,
        "id": chunk_id,
        "text": text,
        "source": citation,
        "citation": citation,
        "page": page,
        "title": meta.get("title", ""),
        "year": meta.get("year"),
        "authors": meta.get("authors", ""),
        "publisher": publisher,
        "source_type": meta.get("source_type", "extension_guide"),
    }


@router.post("/documents")
async def upload_rag_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    source_type: str = Form("extension_guide"),
    year: Optional[int] = Form(None),
    authors: Optional[str] = Form(None),
    publisher: Optional[str] = Form(None),
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Uploads a new agronomy PDF document and queues it for ingestion.
    Validates PDF magic bytes and enforces 20 MB size limit.
    Admin only.
    """
    MAX_SIZE = 20 * 1024 * 1024  # 20 MB
    content = await file.read(MAX_SIZE + 1)
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum permitted limit of 20 MB.",
        )

    if not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format: Not a valid PDF (magic bytes mismatch).",
        )

    rag_dir = _get_rag_dir()
    rag_dir.mkdir(parents=True, exist_ok=True)
    clean_filename = Path(file.filename).name
    pdf_path = rag_dir / clean_filename

    # Write file to disk
    with open(pdf_path, "wb") as f_out:
        f_out.write(content)

    # Append to manifest.csv if not already tracked
    manifest_path = rag_dir / "manifest.csv"
    existing_files = set()
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    fn = (r.get("filename") or "").strip().lower()
                    if fn:
                        existing_files.add(fn)
        except Exception as e:
            logger.warning(f"Error reading manifest: {e}")

    if clean_filename.lower() not in existing_files:
        try:
            file_exists = manifest_path.exists()
            with open(manifest_path, "a", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["filename", "title", "source_type", "year", "authors", "publisher"])
                writer.writerow([clean_filename, title, source_type, year or "", authors or "", publisher or ""])
        except Exception as e:
            logger.error(f"Failed to update manifest.csv: {e}")

    # Upsert RAGDocument in DB
    doc_record = (
        db.query(RAGDocument)
        .filter((RAGDocument.filename == clean_filename) | (RAGDocument.title == title))
        .first()
    )
    if not doc_record:
        doc_record = RAGDocument(
            title=title,
            source_type=source_type,
            year=year,
            authors=authors,
            publisher=publisher,
            filename=clean_filename,
            file_path=str(pdf_path),
            chunk_count=0,
        )
        db.add(doc_record)
    else:
        doc_record.title = title
        doc_record.source_type = source_type
        doc_record.year = year
        doc_record.authors = authors
        doc_record.publisher = publisher
        doc_record.filename = clean_filename
        doc_record.file_path = str(pdf_path)
    db.commit()

    # Dispatch ingestion in background task
    background_tasks.add_task(run_background_ingest, clean_filename)

    return {
        "message": f"Document '{clean_filename}' uploaded successfully and queued for ingestion.",
        "filename": clean_filename,
        "title": title,
    }
