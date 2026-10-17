from typing import List, Dict, Any
from app.services.ai.interfaces import ImageAnalyzer, Recommender, Retriever, Translator, TTS


class MockImageAnalyzer(ImageAnalyzer):
    def analyze_image(self, file_path: str, crop: str, growth_stage: str) -> List[Dict[str, Any]]:
        # Returns realistic visual evidence matching the PDF
        return [
            {
                "description": "Interveinal chlorosis visible on lower leaves",
                "confidence": 78.0,
                "uncertainty": "Medium",
                "note": "Visible evidence only",
            },
            {
                "description": "Yellowing pattern consistent with N or S deficiency",
                "confidence": 65.0,
                "uncertainty": "Medium",
                "note": "Texture artifacts reduce certainty",
            },
            {
                "description": "No visible lesions, spots, or pest damage",
                "confidence": 91.0,
                "uncertainty": "Low",
                "note": "High confidence — clear negative",
            },
            {
                "description": "Canopy density appears normal for V8 stage",
                "confidence": 82.0,
                "uncertainty": "Low",
                "note": "Compared to reference imagery",
            },
        ]


class MockRecommender(Recommender):
    def generate_recommendations(
        self,
        crop: str,
        growth_stage: str,
        observations: List[Dict[str, Any]],
        soil_data: Dict[str, Any],
        weather_data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        # 3 ranked recommendations matching requirement:
        # confidences 88, 72, 45 with citations
        return [
            {
                "rank": 1,
                "category": "Crop",
                "title": "In-field tissue test before any application",
                "confidence": 88.0,
                "uncertainty": "Low",
                "evidence": "Soil test alone (18 ppm N) insufficient to distinguish N vs S deficiency at V8 stage.",
                "assumptions": "Agronomist can collect representative sample within 48h.",
                "citation": "Iowa State University Extension PM 1688",
                "why_line": None,
                "chemical_name": None,
                "chemical_dose": None,
                "chemical_unit": None,
                "is_visible_to_farmer": True,
            },
            {
                "rank": 2,
                "category": "Fertilizer",
                "title": "Apply foliar nitrogen — 20 lb/ac urea solution",
                "confidence": 72.0,
                "uncertainty": "Medium",
                "evidence": "Low soil nitrate (18 ppm), interveinal chlorosis pattern, critical V8 rapid vegetative growth window.",
                "assumptions": "Chlorosis is N-driven, not sulfur or water deficiency.",
                "citation": "University of Nebraska-Lincoln Extension G1872",
                "why_line": None,
                "chemical_name": "Urea",
                "chemical_dose": 20.0,
                "chemical_unit": "lb N/ac",
                "is_visible_to_farmer": True,
            },
            {
                "rank": 3,
                "category": "Fertilizer",
                "title": "Monitor for 7 days — no immediate action",
                "confidence": 45.0,
                "uncertainty": "High",
                "evidence": "Symptoms mild; rainfall event forecast next week.",
                "assumptions": "7-day rainfall forecast is accurate.",
                "citation": "ISU Agronomy Extension Corn Nitrogen Management",
                "why_line": "Why: Soil moisture uncertainty is High. Defer 24h if rain holds to prevent runoff & nitrate leaching.",
                "chemical_name": None,
                "chemical_dose": None,
                "chemical_unit": None,
                "is_visible_to_farmer": False,  # Note: Confidence < 50 hidden from farmer by default
            },
        ]


class MockRetriever(Retriever):
    def retrieve_guidance(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        return [
            {
                "title": "Nitrogen Deficiency Diagnosis in Corn",
                "source": "Iowa State University Extension PM 1688",
                "relevance": 92.0,
                "snippet": "Nitrogen deficiency in corn typically appears as a V-shaped yellowing beginning at the leaf tip...",
            },
            {
                "title": "In-Season Nitrogen Management for Irrigated Corn",
                "source": "University of Nebraska-Lincoln Extension G1872",
                "relevance": 81.0,
                "snippet": "Foliar application of low-biuret urea solutions at 15-20 lb N/ac can provide emergency rescue...",
            },
            {
                "title": "Distinguishing Nitrogen and Sulfur Deficiency in Corn",
                "source": "International Plant Nutrition Institute (IPNI) Ref #14",
                "relevance": 89.0,
                "snippet": "While nitrogen is mobile in the plant and symptoms start on lower leaves, sulfur is immobile...",
            },
        ][:top_k]


class MockTranslator(Translator):
    def translate(self, text: str, target_lang: str) -> str:
        if target_lang == "hi":
            return f"[हिंदी अनुवाद] {text}"
        elif target_lang == "kn":
            return f"[ಕನ್ನಡ ಅನುವಾದ] {text}"
        return text


class MockTTS(TTS):
    def synthesize_speech(self, text: str, lang: str = "en") -> str:
        return "https://actions.google.com/sounds/v1/weather/light_rain.ogg"
