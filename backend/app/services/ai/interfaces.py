from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional


class ImageAnalyzer(ABC):
    @abstractmethod
    def analyze_image(
        self,
        file_path: str,
        crop: str,
        growth_stage: str,
        case_id: Optional[int] = None,
        field_id: Optional[Any] = None,
        farmer_description: Optional[str] = None,
        db: Optional[Any] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Analyzes field imagery and returns visual observations with confidence scores.
        """
        pass


class Recommender(ABC):
    @abstractmethod
    def generate_recommendations(
        self,
        crop: str,
        growth_stage: str,
        observations: List[Dict[str, Any]],
        soil_data: Dict[str, Any],
        weather_data: Dict[str, Any],
        case_id: Optional[int] = None,
        farmer_description: Optional[str] = None,
        farmer_language: Optional[str] = "en",
        field_profile: Optional[Dict[str, Any]] = None,
        retriever: Optional[Any] = None,
        db: Optional[Any] = None,
        sensor_summary: Optional[Dict[str, Any]] = None,
        interpretation: Optional[List[Dict[str, Any]]] = None,
        sensor_facts: Optional[str] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Generates candidate agronomic recommendations ranked with confidence and citations.
        """
        pass


class Retriever(ABC):
    @abstractmethod
    def retrieve_guidance(self, query: str, top_k: int = 4, **kwargs: Any) -> List[Dict[str, Any]]:
        """
        Retrieves grounded agronomic extension documents.
        """
        pass


class Translator(ABC):
    @abstractmethod
    def translate(self, text: str, target_lang: str = "en", **kwargs: Any) -> str:
        """
        Translates guidance text to target language (e.g. 'hi', 'kn').
        """
        pass


class TTS(ABC):
    @abstractmethod
    def synthesize_speech(self, text: str, lang: str = "en", **kwargs: Any) -> str:
        """
        Synthesizes plain-language report audio, returning an audio stream URL.
        """
        pass

    def generate_audio_url(self, text: str, lang: str = "en", **kwargs: Any) -> str:
        """
        Alias for synthesize_speech for backwards compatibility.
        """
        return self.synthesize_speech(text, lang=lang, **kwargs)
