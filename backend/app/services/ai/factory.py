from app.core.config import settings
from app.services.ai.interfaces import ImageAnalyzer, Recommender, Retriever, Translator, TTS
from app.services.ai.mock_service import (
    MockImageAnalyzer,
    MockRecommender,
    MockRetriever,
    MockTranslator,
    MockTTS,
)
from app.services.ai.openai_service import (
    OpenAIImageAnalyzer,
    OpenAIRecommender,
    OpenAIRetriever,
    OpenAITranslator,
    OpenAITTS,
)


def get_image_analyzer() -> ImageAnalyzer:
    if settings.AI_MODE == "openai":
        return OpenAIImageAnalyzer()
    return MockImageAnalyzer()


def get_recommender() -> Recommender:
    if settings.AI_MODE == "openai":
        return OpenAIRecommender()
    return MockRecommender()


def get_retriever() -> Retriever:
    if settings.AI_MODE == "openai":
        return OpenAIRetriever()
    return MockRetriever()


def get_translator() -> Translator:
    if settings.AI_MODE == "openai":
        return OpenAITranslator()
    return MockTranslator()


def get_tts() -> TTS:
    if settings.AI_MODE == "openai":
        return OpenAITTS()
    return MockTTS()
