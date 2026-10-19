"""
RAG Probe script: Queries ChromaDB with benchmark agronomic questions
and prints top-4 results to help tune RAG_MIN_RELEVANCE.

Usage:
    python -m scripts.rag_probe
"""

import sys
from pathlib import Path

# Fix Windows console encoding
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.rag.retriever import ChromaRetriever
from app.core.config import settings

BENCHMARK_QUERIES = [
    "corn V8 nitrogen deficiency interveinal chlorosis",
    "northern corn leaf blight symptoms",
    "sulfur vs nitrogen deficiency corn",
    "irrigation scheduling corn",
    "foliar nitrogen rate corn",
    "gray leaf spot management",
    "fungal disease high humidity leaf wetness corn",
    "low soil moisture irrigation corn",
]


def run_probe(top_k: int = 4, min_relevance: float = 0.0):
    retriever = ChromaRetriever()
    print("\n" + "=" * 90)
    print(" " * 32 + "AGRONOMIC RAG PROBE BENCHMARK")
    print("=" * 90)
    print(f"Top-K: {top_k} | Config RAG_MIN_RELEVANCE: {settings.RAG_MIN_RELEVANCE} | Probe Threshold: {min_relevance}\n")

    for idx, query in enumerate(BENCHMARK_QUERIES, start=1):
        print("-" * 90)
        print(f"[{idx}/8] QUERY: \"{query}\"")
        print("-" * 90)

        results = retriever.retrieve_guidance(query=query, top_k=top_k, min_relevance=min_relevance)
        if not results:
            print("  (No results retrieved)")
            continue

        for rank, res in enumerate(results, start=1):
            relevance = res.get("relevance", 0.0)
            title = res.get("title") or res.get("metadata", {}).get("title", "Untitled")
            page = res.get("page") or res.get("metadata", {}).get("page", 1)
            citation = res.get("citation", "")
            raw_text = res.get("text", "")
            # First 100 characters cleaned of extra whitespace/newlines
            preview = " ".join(raw_text.split())[:100]

            print(f"  #{rank} [{relevance:5.1f}% rel] {citation:<16} Page {page:<3} | {title[:32]}")
            print(f"     Preview: \"{preview}...\"")

    print("\n" + "=" * 90 + "\n")


def main():
    run_probe()


if __name__ == "__main__":
    main()
