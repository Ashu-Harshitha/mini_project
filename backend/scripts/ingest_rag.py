"""
RAG Ingestion Pipeline for agronomic PDF documents into ChromaDB.

Usage:
    python -m scripts.ingest_rag [--reset] [--only FILE]
"""

import os
import sys
import csv
import hashlib
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

import fitz  # PyMuPDF
from sqlalchemy.orm import Session

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.models import RAGDocument
from app.rag.chroma import get_chroma_client, get_agronomy_collection, reset_agronomy_collection
from app.rag.chunker import chunk_text, clean_repeated_headers_footers

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ingest_rag")


def locate_rag_dir() -> Path:
    """Finds backend/data/rag_pdfs containing manifest.csv."""
    candidates = [
        Path("data/rag_pdfs"),
        Path("backend/data/rag_pdfs"),
        backend_dir / "data" / "rag_pdfs",
        backend_dir.parent / "backend" / "data" / "rag_pdfs",
    ]
    for candidate in candidates:
        if (candidate / "manifest.csv").exists():
            return candidate.resolve()
    return (backend_dir / "data" / "rag_pdfs").resolve()


def ingest_documents(
    reset: bool = False,
    only_file: Optional[str] = None,
    embedding_function: Optional[Any] = None,
    db_session: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    Ingests all PDFs listed in manifest.csv into Chroma collection 'agronomy_docs'.
    """
    rag_dir = locate_rag_dir()
    manifest_path = rag_dir / "manifest.csv"

    if not manifest_path.exists():
        logger.error(f"Manifest not found at {manifest_path}")
        return {"error": "manifest_not_found"}

    # 1. Initialize DB and Chroma
    db = db_session or SessionLocal()
    client = get_chroma_client()
    if reset:
        logger.info("Resetting Chroma collection 'agronomy_docs' and database chunk counts...")
        collection = reset_agronomy_collection(client=client, embedding_function=embedding_function)
        try:
            db.query(RAGDocument).update({RAGDocument.chunk_count: 0})
            db.commit()
        except Exception as e:
            logger.warning(f"Error resetting RAGDocument chunk counts: {e}")
            db.rollback()
    else:
        collection = get_agronomy_collection(client=client, embedding_function=embedding_function)

    # 2. Read manifest
    with open(manifest_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        manifest_rows = list(reader)

    # 3. Check for PDFs in directory not in manifest
    all_disk_pdfs = {f for f in os.listdir(rag_dir) if f.lower().endswith(".pdf")}
    manifest_files = {r["filename"].strip() for r in manifest_rows if r.get("filename")}
    untracked_pdfs = sorted(list(all_disk_pdfs - manifest_files))
    for u in untracked_pdfs:
        logger.warning(f"WARN: PDF '{u}' is present in {rag_dir} but missing from manifest.csv")

    summary_records = []
    total_chunks_indexed = 0
    total_words_indexed = 0
    skipped_docs_count = 0

    # 4. Ingest each row
    for row in manifest_rows:
        filename = (row.get("filename") or "").strip()
        title = (row.get("title") or filename).strip()
        source_type = (row.get("source_type") or "extension_guide").strip()
        authors = (row.get("authors") or "").strip()
        publisher = (row.get("publisher") or "").strip()
        year_val = None
        try:
            year_val = int(row.get("year", 0)) if row.get("year") else None
        except ValueError:
            year_val = None

        if only_file and filename.lower() != only_file.lower():
            continue

        pdf_path = rag_dir / filename

        # Check: manifest row without file on disk
        if not pdf_path.exists():
            logger.warning(f"WARN: Manifest row references missing file: {filename}")
            summary_records.append({
                "filename": filename,
                "title": title,
                "pages": 0,
                "words": 0,
                "chunks": 0,
                "status": "MISSING_FILE",
            })
            skipped_docs_count += 1
            continue

        # Open PDF via PyMuPDF
        try:
            doc = fitz.open(str(pdf_path))
        except Exception as e:
            logger.error(f"Failed to open PDF {filename}: {e}")
            summary_records.append({
                "filename": filename,
                "title": title,
                "pages": 0,
                "words": 0,
                "chunks": 0,
                "status": f"CORRUPT: {e}",
            })
            skipped_docs_count += 1
            continue

        page_count = len(doc)
        raw_pages_text: List[str] = []
        doc_total_words = 0

        for page in doc:
            p_text = page.get_text() or ""
            raw_pages_text.append(p_text)
            doc_total_words += len(p_text.split())

        doc.close()

        # Check: average words per page < 50
        avg_wpp = doc_total_words / max(1, page_count)
        if avg_wpp < 50.0:
            logger.warning(
                f"WARN: '{filename}' averages only {avg_wpp:.1f} words/page (< 50 wpp). "
                f"Likely scanned image without extractable text; skipped from index."
            )
            summary_records.append({
                "filename": filename,
                "title": title,
                "pages": page_count,
                "words": doc_total_words,
                "chunks": 0,
                "status": "SKIPPED (<50 wpp)",
            })
            skipped_docs_count += 1
            continue

        # Clean repeated header and footer lines across pages
        cleaned_pages = clean_repeated_headers_footers(raw_pages_text)

        # Upsert RAGDocument DB record
        doc_record = (
            db.query(RAGDocument)
            .filter((RAGDocument.filename == filename) | (RAGDocument.title == title))
            .first()
        )
        if not doc_record:
            doc_record = RAGDocument(
                title=title,
                source_type=source_type,
                year=year_val,
                authors=authors,
                publisher=publisher,
                filename=filename,
                file_path=str(pdf_path),
                chunk_count=0,
            )
            db.add(doc_record)
            db.flush()
        else:
            doc_record.title = title
            doc_record.source_type = source_type
            doc_record.year = year_val
            doc_record.authors = authors
            doc_record.publisher = publisher
            doc_record.filename = filename
            doc_record.file_path = str(pdf_path)

        doc_id = doc_record.id

        # Chunk per page
        chunks_to_upsert: List[Dict[str, Any]] = []
        for page_idx, page_content in enumerate(cleaned_pages, start=1):
            page_chunks = chunk_text(page_content, target_words=150, overlap_words=30, min_words=40)
            for c_idx, c_text in enumerate(page_chunks):
                # Deterministic chunk ID: sha1(doc_id + page + index)
                c_id_raw = f"{doc_id}_{page_idx}_{c_idx}"
                chunk_id = hashlib.sha1(c_id_raw.encode("utf-8")).hexdigest()
                metadata = {
                    "doc_id": int(doc_id),
                    "title": str(title),
                    "source_type": str(source_type),
                    "year": int(year_val) if year_val else 0,
                    "authors": str(authors),
                    "publisher": str(publisher),
                    "page": int(page_idx),
                }
                chunks_to_upsert.append({
                    "id": chunk_id,
                    "text": c_text,
                    "metadata": metadata,
                })

        # Batch upsert 64 into ChromaDB
        for i in range(0, len(chunks_to_upsert), 64):
            batch = chunks_to_upsert[i : i + 64]
            collection.upsert(
                ids=[b["id"] for b in batch],
                documents=[b["text"] for b in batch],
                metadatas=[b["metadata"] for b in batch],
            )

        # Update DB record chunk count
        doc_record.chunk_count = len(chunks_to_upsert)
        db.commit()

        total_chunks_indexed += len(chunks_to_upsert)
        total_words_indexed += doc_total_words
        summary_records.append({
            "filename": filename,
            "title": title[:36] + "..." if len(title) > 36 else title,
            "pages": page_count,
            "words": doc_total_words,
            "chunks": len(chunks_to_upsert),
            "status": "INDEXED",
        })
        logger.info(f"Indexed '{filename}': {page_count} pages -> {len(chunks_to_upsert)} chunks.")

    if db_session is None:
        db.close()

    # 5. Print summary table
    print("\n" + "=" * 80)
    print(" " * 28 + "RAG INGESTION SUMMARY")
    print("=" * 80)
    print(f"{'Filename':<30} | {'Pages':<5} | {'Words':<7} | {'Chunks':<6} | {'Status'}")
    print("-" * 80)
    for s in summary_records:
        print(f"{s['filename']:<30} | {s['pages']:<5} | {s['words']:<7} | {s['chunks']:<6} | {s['status']}")
    print("-" * 80)
    print(
        f"Total Files Processed: {len(summary_records)} | "
        f"Indexed Chunks: {total_chunks_indexed} | "
        f"Words: {total_words_indexed} | "
        f"Skipped/Missing: {skipped_docs_count}"
    )
    if untracked_pdfs:
        print(f"Untracked PDFs in folder: {len(untracked_pdfs)} ({', '.join(untracked_pdfs)})")
    print("=" * 80 + "\n")

    return {
        "processed": len(summary_records),
        "total_chunks": total_chunks_indexed,
        "total_words": total_words_indexed,
        "skipped": skipped_docs_count,
        "untracked": untracked_pdfs,
    }


def main():
    parser = argparse.ArgumentParser(description="Ingest agronomy PDFs into ChromaDB RAG index")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate Chroma collection and reset counts")
    parser.add_argument("--only", type=str, default=None, help="Only ingest a single file specified by filename")
    args = parser.parse_args()

    ingest_documents(reset=args.reset, only_file=args.only)


if __name__ == "__main__":
    main()
