"""
Grounded Agronomic Document Retriever backed by ChromaDB and local embeddings.
Implements the Retriever interface from app.services.ai.interfaces.
"""

import logging
from typing import List, Dict, Any, Optional
from app.services.ai.interfaces import Retriever
from app.core.config import settings
from app.rag.chroma import get_agronomy_collection
from app.rag.chunker import format_citation

logger = logging.getLogger("agriadvisor.rag.retriever")

_EMPTY_INDEX_LOGGED = False


def format_sensor_interpretations(
    interpretation: Optional[List[Dict[str, Any]]] = None,
    sensor_summary: Optional[Dict[str, Any]] = None,
    crop: Optional[str] = None,
) -> List[str]:
    """
    Turns sensor interpretation labels and summary anomalies into plain English phrases.
    Example: 'low soil nitrogen', 'dry soil', 'high leaf wetness and humidity', 'fungal pressure'.
    """
    phrases: List[str] = []
    interps = interpretation
    if not interps and sensor_summary:
        try:
            from app.sensors.interpret import interpret_sensor_data
            interps = interpret_sensor_data(sensor_summary, crop=crop)
        except Exception as e:
            logger.debug(f"Could not compute sensor interpretation: {e}")
            interps = []

    if interps:
        for item in interps:
            key = (item.get("key") or "").lower()
            status = (item.get("status") or "").lower()

            if key == "nitrogen":
                if status in ("low", "severely_low"):
                    phrases.append("low soil nitrogen")
                elif status == "high":
                    phrases.append("high soil nitrogen")
            elif key == "soil_moisture":
                if status in ("low", "severely_low"):
                    phrases.append("dry soil")
                elif status in ("high", "severely_high"):
                    phrases.append("waterlogged soil")
            elif key == "dry_soil" and status in ("active", "warning", "critical"):
                phrases.append("dry soil")
            elif key == "waterlogged" and status in ("active", "warning", "critical"):
                phrases.append("waterlogged soil")
            elif key == "fungal_pressure":
                if status in ("high", "watch"):
                    phrases.append("fungal pressure")
                    phrases.append("high leaf wetness and humidity")
            elif key == "heat_stress" and status in ("high", "active"):
                phrases.append("heat stress")
            elif key == "phosphorus" and status in ("low", "severely_low"):
                phrases.append("low soil phosphorus")
            elif key == "potassium" and status in ("low", "severely_low"):
                phrases.append("low soil potassium")
            elif key == "ph":
                if status in ("low", "severely_low"):
                    phrases.append("acidic soil low pH")
                elif status in ("high", "severely_high"):
                    phrases.append("alkaline soil high pH")

    return list(dict.fromkeys(phrases))


def build_retrieval_query(
    query: Optional[str] = None,
    issue_hint: Optional[str] = None,
    observations: Optional[List[Dict[str, Any]]] = None,
    farmer_description: Optional[str] = None,
    farmer_language: Optional[str] = "en",
    crop: Optional[str] = None,
    growth_stage: Optional[str] = None,
    soil_data: Optional[Dict[str, Any]] = None,
    weather_data: Optional[Dict[str, Any]] = None,
    sensor_summary: Optional[Dict[str, Any]] = None,
    interpretation: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Constructs an agronomic retrieval query from all available case telemetry and inputs.
    """
    parts: List[str] = []

    if query and query.strip():
        parts.append(query.strip())

    if issue_hint and issue_hint.strip():
        parts.append(issue_hint.strip())

    if observations:
        obs_texts = []
        for o in observations:
            t = o.get("description") or o.get("text")
            if t:
                obs_texts.append(t.strip())
        if obs_texts:
            parts.append(" ".join(obs_texts))

    desc = farmer_description
    if desc and desc.strip():
        # Translate to English if non-English and not in mock mode
        if farmer_language and farmer_language.lower() != "en" and settings.AI_MODE.lower() != "mock":
            try:
                from app.services.ai.gemini_client import get_gemini_client
                client = get_gemini_client()
                desc = client.translate(desc, "en")
            except Exception as e:
                logger.warning(f"Could not translate farmer description: {e}")
        parts.append(desc.strip())

    if crop or growth_stage:
        crop_stage = f"{crop or ''} {growth_stage or ''}".strip()
        if crop_stage:
            parts.append(crop_stage)

    if soil_data:
        soil_bits = []
        if soil_data.get("n_value"):
            soil_bits.append(str(soil_data["n_value"]))
        elif soil_data.get("n_ppm") is not None:
            soil_bits.append(f"{soil_data['n_ppm']} ppm N")
        if soil_data.get("ph_value"):
            soil_bits.append(str(soil_data["ph_value"]))
        elif soil_data.get("ph") is not None:
            soil_bits.append(f"pH {soil_data['ph']}")
        if soil_bits:
            parts.append(" ".join(soil_bits))

    if weather_data:
        w_bits = []
        if weather_data.get("humidity") is not None:
            w_bits.append(f"humidity {weather_data['humidity']}%")
        if weather_data.get("temp_max_c") is not None:
            w_bits.append(f"temp {weather_data['temp_max_c']}C")
        if weather_data.get("rainfall_7d_mm") is not None:
            w_bits.append(f"rainfall {weather_data['rainfall_7d_mm']}mm")
        if w_bits:
            parts.append(" ".join(w_bits))

    sensor_phrases = format_sensor_interpretations(
        interpretation=interpretation,
        sensor_summary=sensor_summary,
        crop=crop,
    )
    if sensor_phrases:
        parts.append(" ".join(sensor_phrases))

    return " ".join(parts).strip()


class ChromaRetriever(Retriever):
    """
    Retriever implementing the Retriever interface backed by ChromaDB PersistentClient.
    """

    def __init__(self, collection: Optional[Any] = None):
        self._collection = collection

    @property
    def collection(self) -> Any:
        if self._collection is None:
            self._collection = get_agronomy_collection()
        return self._collection

    def retrieve_guidance(
        self,
        query: str = "",
        top_k: Optional[int] = None,
        source_type: Optional[str] = None,
        min_relevance: Optional[float] = None,
        # Extended arguments matching case context
        observations: Optional[List[Dict[str, Any]]] = None,
        farmer_description: Optional[str] = None,
        farmer_language: Optional[str] = "en",
        crop: Optional[str] = None,
        growth_stage: Optional[str] = None,
        soil_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        sensor_summary: Optional[Dict[str, Any]] = None,
        interpretation: Optional[List[Dict[str, Any]]] = None,
        issue_hint: Optional[str] = None,
        **kwargs: Any,
    ) -> List[Dict[str, Any]]:
        global _EMPTY_INDEX_LOGGED

        k = top_k if top_k is not None else settings.RAG_TOP_K
        threshold = min_relevance if min_relevance is not None else settings.RAG_MIN_RELEVANCE

        # 1. Check if index is empty
        try:
            doc_count = self.collection.count()
        except Exception as e:
            logger.warning(f"Failed to check Chroma collection count: {e}")
            return []

        if doc_count == 0:
            if not _EMPTY_INDEX_LOGGED:
                logger.info("Chroma index 'agronomy_docs' is empty. Skipping retrieval.")
                _EMPTY_INDEX_LOGGED = True
            return []

        # 2. Build synthesized query
        effective_query = build_retrieval_query(
            query=query,
            issue_hint=issue_hint,
            observations=observations,
            farmer_description=farmer_description,
            farmer_language=farmer_language,
            crop=crop,
            growth_stage=growth_stage,
            soil_data=soil_data,
            weather_data=weather_data,
            sensor_summary=sensor_summary,
            interpretation=interpretation,
        )

        if not effective_query:
            return []

        # 3. Query ChromaDB
        where_filter = None
        if source_type and source_type.lower() != "all":
            # Normalize source_type filter
            st = source_type.lower().replace(" ", "_")
            where_filter = {"source_type": st}

        n_results = min(k, doc_count)
        try:
            results = self.collection.query(
                query_texts=[effective_query],
                n_results=n_results,
                where=where_filter,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as e:
            logger.error(f"ChromaDB retrieval error: {e}")
            return []

        if not results or not results.get("ids") or not results["ids"][0]:
            return []

        ids = results["ids"][0]
        documents = results["documents"][0]
        metadatas = results["metadatas"][0]
        distances = results.get("distances", [[]])[0]

        output: List[Dict[str, Any]] = []
        for idx in range(len(ids)):
            chunk_id = ids[idx]
            text = documents[idx]
            meta = metadatas[idx] or {}
            dist = distances[idx] if idx < len(distances) else 0.0

            # Relevance conversion: max(0, 1 - cosine_distance) * 100
            cosine_sim = 1.0 - dist
            relevance = round(max(0.0, cosine_sim) * 100.0, 1)

            if relevance < threshold:
                continue

            publisher = meta.get("publisher", "")
            page = meta.get("page", 1)
            citation = format_citation(publisher, page)
            snippet = text[:200] + "..." if len(text) > 200 else text

            output.append({
                "chunk_id": chunk_id,
                "id": chunk_id,
                "text": text,
                "citation": citation,
                "source": citation,
                "relevance": relevance,
                "metadata": meta,
                "title": meta.get("title", ""),
                "authors": meta.get("authors", ""),
                "publisher": publisher,
                "source_type": meta.get("source_type", ""),
                "type": meta.get("source_type", "extension_guide"),
                "year": meta.get("year"),
                "page": page,
                "snippet": snippet,
            })

        return output
