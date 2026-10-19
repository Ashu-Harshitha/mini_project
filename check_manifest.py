import csv, os
from pathlib import Path

# Automatically locate rag_pdfs whether run from root, backend/, or rag_pdfs/
candidates = [
    Path(__file__).resolve().parent / "backend" / "data" / "rag_pdfs",
    Path(__file__).resolve().parent / "data" / "rag_pdfs",
    Path(__file__).resolve().parent,
    Path("backend/data/rag_pdfs").resolve(),
    Path("data/rag_pdfs").resolve(),
    Path(".").resolve(),
]

base = None
for candidate in candidates:
    if (candidate / "manifest.csv").exists():
        base = candidate
        break

if not base:
    base = Path("backend/data/rag_pdfs").resolve()

rows = list(csv.DictReader(open(base / "manifest.csv", encoding="utf-8")))
missing = [r["filename"] for r in rows if not (base / r[f"filename"]).exists()]
extra = [f for f in os.listdir(base) if f.endswith(".pdf") and f not in {r["filename"] for r in rows}]
print(len(rows), "rows | missing files:", missing, "| PDFs not in manifest:", extra)
