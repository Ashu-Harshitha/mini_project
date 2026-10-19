from typing import List, Dict, Any, Optional
from app.services.ai.interfaces import ImageAnalyzer, Recommender, Retriever, Translator, TTS


class MockImageAnalyzer(ImageAnalyzer):
    def analyze_image(
        self,
        file_path: str,
        crop: str,
        growth_stage: str,
        case_id: Optional[int] = None,
        field_id: Optional[Any] = None,
        farmer_description: Optional[str] = None,
        db: Optional[Any] = None,
    ) -> Dict[str, Any]:
        return {
            "observations": [
                {
                    "text": "Interveinal chlorosis visible on lower leaves",
                    "description": "Interveinal chlorosis visible on lower leaves",
                    "confidence": 78.0,
                    "uncertainty": "Medium",
                    "note": "Visible evidence only",
                },
                {
                    "text": "Yellowing pattern consistent with N or S deficiency",
                    "description": "Yellowing pattern consistent with N or S deficiency",
                    "confidence": 65.0,
                    "uncertainty": "Medium",
                    "note": "Texture artifacts reduce certainty",
                },
                {
                    "text": "No visible lesions, spots, or pest damage",
                    "description": "No visible lesions, spots, or pest damage",
                    "confidence": 91.0,
                    "uncertainty": "Low",
                    "note": "High confidence — clear negative",
                },
                {
                    "text": "Canopy density appears normal for V8 stage",
                    "description": "Canopy density appears normal for V8 stage",
                    "confidence": 82.0,
                    "uncertainty": "Low",
                    "note": "Compared to reference imagery",
                },
            ],
            "uncertainty_level": "Medium",
            "image_quality_notes": "Good focus and lighting on leaf canopy",
            "issue_hint": "nitrogen_deficiency",
        }


class MockRecommender(Recommender):
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
    ) -> Dict[str, Any]:
        latest_vals = {}
        if sensor_summary:
            latest_vals = sensor_summary.get("latest") or sensor_summary.get("latest_values") or {}
        real_moisture = latest_vals.get("soil_moisture_pct")
        conflict = False
        assumptions_note = "Agronomist can collect representative sample within 48h."

        if farmer_description and real_moisture is not None:
            lower_desc = farmer_description.lower()
            if ("dry" in lower_desc or "drought" in lower_desc) and real_moisture > 30.0:
                conflict = True
            elif ("wet" in lower_desc or "flood" in lower_desc) and real_moisture < 20.0:
                conflict = True

        if conflict:
            assumptions_note = "Sensor facts conflict with farmer description or image evidence. Confidence lowered."

        retrieved_chunks = []
        if retriever:
            retrieved_chunks = retriever.retrieve_guidance(
                crop=crop,
                growth_stage=growth_stage,
                observations=observations,
                soil_data=soil_data,
                weather_data=weather_data,
                farmer_description=farmer_description,
                farmer_language=farmer_language,
                sensor_summary=sensor_summary,
                interpretation=interpretation,
                top_k=4,
            )

        cid = (retrieved_chunks[0].get("chunk_id") or retrieved_chunks[0].get("id")) if retrieved_chunks else "mock_chunk_1"
        citation_label = retrieved_chunks[0].get("citation") if retrieved_chunks else "Iowa State University Extension PM 1688"

        recs = [
            {
                "rank": 1,
                "category": "Crop",
                "title": "In-field tissue test before any application",
                "action": "In-field tissue test before any application",
                "confidence": 75.0 if conflict else 88.0,
                "uncertainty": "Medium" if conflict else "Low",
                "evidence": "Soil test alone (18 ppm N) insufficient to distinguish N vs S deficiency at V8 stage.",
                "assumptions": assumptions_note,
                "citation": citation_label,
                "chunk_ids": [cid] if cid else [],
                "why": "Distinguish between nitrogen and sulfur deficiency under current vegetative stage.",
                "why_line": "Why: Distinguish between nitrogen and sulfur deficiency under current vegetative stage.",
                "chemical_name": None,
                "chemical_dose": None,
                "chemical_unit": None,
                "is_visible_to_farmer": True,
            },
            {
                "rank": 2,
                "category": "Fertilizer",
                "title": "Apply foliar nitrogen — 20 lb/ac urea solution",
                "action": "Apply foliar nitrogen — 20 lb/ac urea solution",
                "confidence": 62.0 if conflict else 72.0,
                "uncertainty": "Medium",
                "evidence": "Low soil nitrate (18 ppm), interveinal chlorosis pattern, critical V8 rapid vegetative growth window.",
                "assumptions": assumptions_note if conflict else "Chlorosis is N-driven, not sulfur or water deficiency.",
                "citation": "University of Nebraska-Lincoln Extension G1872",
                "chunk_ids": [cid] if cid else [],
                "why": "Rapid canopy uptake to address acute nitrogen chlorosis at V8 rapid growth window.",
                "why_line": "Why: Rapid canopy uptake to address acute nitrogen chlorosis at V8 rapid growth window.",
                "chemical_name": "Urea",
                "chemical_dose": 20.0,
                "chemical_unit": "lb N/ac",
                "is_visible_to_farmer": True,
            },
        ]

        if real_moisture is not None:
            recs.append({
                "rank": 3,
                "category": "Irrigation",
                "title": f"Irrigation cycle managed at {real_moisture}% soil moisture",
                "action": f"Apply scheduled irrigation cycle based on verified field moisture ({real_moisture}%)",
                "confidence": 70.0 if conflict else 85.0,
                "uncertainty": "Medium" if conflict else "Low",
                "evidence": f"Field sensor moisture measured at {real_moisture}%.",
                "assumptions": assumptions_note if conflict else "Soil moisture sensor telemetry reflects active root zone condition.",
                "citation": "ISU Agronomy Extension Corn Nitrogen Management",
                "chunk_ids": [cid] if cid else [],
                "why": f"Verified field moisture is {real_moisture}%. Maintain optimal moisture band for {crop} at {growth_stage}.",
                "why_line": f"Why: Field sensor moisture is {real_moisture}%. Maintain root zone target.",
                "chemical_name": None,
                "chemical_dose": None,
                "chemical_unit": None,
                "is_visible_to_farmer": True,
            })
        else:
            recs.append({
                "rank": 3,
                "category": "Irrigation",
                "title": "Inspect soil moisture before applying next irrigation cycle",
                "action": "Inspect soil moisture before applying next irrigation cycle",
                "confidence": 45.0,
                "uncertainty": "High",
                "evidence": "Symptoms mild; rainfall event forecast next week.",
                "assumptions": "7-day rainfall forecast is accurate.",
                "citation": "ISU Agronomy Extension Corn Nitrogen Management",
                "why": "Soil moisture uncertainty is High. Defer 24h if rain holds to prevent runoff & nitrate leaching.",
                "why_line": "Why: Soil moisture uncertainty is High. Defer 24h if rain holds to prevent runoff & nitrate leaching.",
                "chemical_name": None,
                "chemical_dose": None,
                "chemical_unit": None,
                "is_visible_to_farmer": False,
            })

        return {
            "issue_label": "Nitrogen Deficiency chlorosis",
            "issue_category": "nitrogen_deficiency",
            "confidence": 56.0 if conflict else (75.5 if real_moisture is not None else 68.3),
            "uncertainty": "High" if conflict else "Medium",
            "recommendations": recs,
        }


class MockRetriever(Retriever):
    def retrieve_guidance(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        # Returns [] by default until RAG exists, or static mock chunks if query provided
        return []


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
