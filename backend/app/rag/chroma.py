"""
ChromaDB PersistentClient initialization and collection management.
Collection 'agronomy_docs' with cosine similarity and DefaultEmbeddingFunction (all-MiniLM-L6-v2).
"""

import os
import logging
from typing import Optional, Any
import chromadb
from chromadb.utils import embedding_functions
from app.core.config import settings

logger = logging.getLogger("agriadvisor.rag.chroma")

COLLECTION_NAME = "agronomy_docs"


def get_chroma_client(path: Optional[str] = None) -> chromadb.ClientAPI:
    """Returns a PersistentClient pointing to CHROMA_PATH."""
    chroma_path = path or settings.CHROMA_PATH
    # Resolve relative paths relative to backend root
    if not os.path.isabs(chroma_path):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        chroma_path = os.path.normpath(os.path.join(base_dir, chroma_path))

    os.makedirs(chroma_path, exist_ok=True)
    return chromadb.PersistentClient(path=chroma_path)


def get_embedding_function(custom_ef: Optional[Any] = None) -> Any:
    """Returns DefaultEmbeddingFunction (all-MiniLM-L6-v2) or a supplied test double."""
    if custom_ef is not None:
        return custom_ef
    return embedding_functions.DefaultEmbeddingFunction()


def get_agronomy_collection(
    client: Optional[chromadb.ClientAPI] = None,
    embedding_function: Optional[Any] = None,
    path: Optional[str] = None,
) -> Any:
    """
    Gets or creates the 'agronomy_docs' Chroma collection with cosine distance metric.
    """
    c = client or get_chroma_client(path=path)
    ef = get_embedding_function(embedding_function)
    return c.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
        embedding_function=ef,
    )


def reset_agronomy_collection(
    client: Optional[chromadb.ClientAPI] = None,
    embedding_function: Optional[Any] = None,
    path: Optional[str] = None,
) -> Any:
    """Deletes existing collection if present and recreates it."""
    c = client or get_chroma_client(path=path)
    try:
        c.delete_collection(name=COLLECTION_NAME)
        logger.info(f"Deleted existing Chroma collection '{COLLECTION_NAME}'.")
    except Exception as e:
        logger.debug(f"Collection '{COLLECTION_NAME}' did not exist or could not be deleted: {e}")

    return get_agronomy_collection(client=c, embedding_function=embedding_function, path=path)
