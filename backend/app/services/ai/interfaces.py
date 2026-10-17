from abc import ABC, abstractmethod
from typing import List, Dict, Any


class ImageAnalyzer(ABC):
    @abstractmethod
    def analyze_image(self, file_path: str, crop: str, growth_stage: str) -> List[Dict[str, Any]]:
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
    ) -> List[Dict[str, Any]]:
        """
        Generates candidate agronomic recommendations ranked with confidence and citations.
        """
        pass


class Retriever(ABC):
    @abstractmethod
    def retrieve_guidance(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        """
        Retrieves grounded agronomic extension documents.
        """
        pass


class Translator(ABC):
    @abstractmethod
    def translate(self, text: str, target_lang: str) -> str:
        """
        Translates guidance text to target language (e.g. 'hi', 'kn').
        """
        pass


class TTS(ABC):
    @abstractmethod
    def synthesize_speech(self, text: str, lang: str = "en") -> str:
        """
        Synthesizes plain-language report audio, returning an audio stream URL.
        """
        pass
