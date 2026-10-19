"""
ChromaDB client wrapper stub for agronomic RAG document index.
Provides index querying and document ingestion interface.
"""

from typing import List, Dict, Any
import logging

logger = logging.getLogger("agriadvisor.chroma")


class ChromaDBClient:
    def __init__(self, host: str = "chroma", port: int = 8000):
        self.host = host
        self.port = port
        self._client = None
        self._collection = None
        self._init_client()

    def _init_client(self):
        try:
            import chromadb
            self._client = chromadb.HttpClient(host=self.host, port=self.port)
            self._collection = self._client.get_or_create_collection(name="agronomic_guidelines")
            logger.info("ChromaDB HTTP client connected successfully.")
        except Exception as e:
            logger.warning(f"ChromaDB connection unavailable or running in stub mode: {e}")
            self._client = None

    def query(self, query_texts: List[str], n_results: int = 4) -> List[Dict[str, Any]]:
        """
        Queries ChromaDB collection or returns mock semantic matches.
        """
        if self._collection:
            try:
                results = self._collection.query(query_texts=query_texts, n_results=n_results)
                return results
            except Exception as e:
                logger.error(f"ChromaDB query failed: {e}")

        # Stub fallback matches
        return [
            {
                "id": "doc-1",
                "document": "Iowa State University Extension PM 1688: Nitrogen Deficiency in Corn.",
                "metadata": {"source": "ISU Extension", "crop": "Corn"},
                "distance": 0.12,
            },
            {
                "id": "doc-2",
                "document": "University of Nebraska-Lincoln G1872: In-Season Nitrogen Management.",
                "metadata": {"source": "UNL Extension", "crop": "Corn"},
                "distance": 0.19,
            },
        ]


# Singleton instance
chroma_client = ChromaDBClient()
