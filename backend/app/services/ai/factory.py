from app.core.config import settings
from app.services.ai.interfaces import ImageAnalyzer, Recommender, Retriever, Translator, TTS
from app.services.ai.mock_service import (
    MockImageAnalyzer,
    MockRecommender,
    MockRetriever,
    MockTranslator,
    MockTTS,
)
from app.services.ai.gemini_service import (
    GeminiImageAnalyzer,
    GeminiRecommender,
)


def get_image_analyzer() -> ImageAnalyzer:
    mode = settings.AI_MODE.lower()
    if mode == "gemini":
        return GeminiImageAnalyzer()
    return MockImageAnalyzer()


def get_recommender() -> Recommender:
    mode = settings.AI_MODE.lower()
    if mode == "gemini":
        return GeminiRecommender()
    return MockRecommender()


def get_retriever() -> Retriever:
    try:
        from app.rag.retriever import ChromaRetriever
        return ChromaRetriever()
    except Exception:
        return MockRetriever()


def get_translator() -> Translator:
    return MockTranslator()


def get_tts() -> TTS:
    return MockTTS()
