import os
import re
import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.services.ai.gemini_client import get_gemini_client

logger = logging.getLogger("agriadvisor.soil_parser")


class SoilDataOutput(BaseModel):
    n_ppm: Optional[float] = None
    p_ppm: Optional[float] = None
    k_ppm: Optional[float] = None
    ph: Optional[float] = Field(None, ge=3.0, le=10.0)
    sample_date: Optional[str] = None
    needs_confirmation: bool = False


def parse_soil_pdf(file_path: str, case_id: Optional[int] = None, db: Optional[Session] = None) -> SoilDataOutput:
    """
    Parses a soil test PDF using PyMuPDF (fitz).
    Pages without text are rendered to PNG and sent to Gemini.
    Returns {n_ppm, p_ppm, k_ppm, ph, sample_date} with range validation (pH 3-10),
    null for missing values, and a needs_confirmation flag.
    """
    if not os.path.exists(file_path):
        logger.warning(f"Soil report file not found at: {file_path}")
        return SoilDataOutput(needs_confirmation=True)

    extracted_text = ""
    rendered_images = []

    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_text = page.get_text().strip()
            if len(page_text) > 20:
                extracted_text += f"\n--- Page {page_idx+1} ---\n" + page_text
            else:
                # Page without text: render to PNG
                pix = page.get_pixmap(dpi=150)
                png_bytes = pix.tobytes("png")
                rendered_images.append(png_bytes)
        doc.close()
    except Exception as e:
        logger.error(f"Error reading PDF with PyMuPDF: {e}")

    gemini = get_gemini_client()
    result_dict: Dict[str, Any] = {}

    # If AI mode is gemini and we have images or extracted text, use Gemini structured output
    if gemini.ai_mode == "gemini" and gemini._client:
        prompt = (
            "You are an agronomic soil laboratory report parser. Extract the following soil nutrient values:\n"
            "- n_ppm: Nitrate Nitrogen in ppm (float or null)\n"
            "- p_ppm: Phosphorus in ppm (Bray P1 or Mehlich-3) (float or null)\n"
            "- k_ppm: Potassium in ppm (float or null)\n"
            "- ph: Soil pH (float between 3.0 and 10.0 or null)\n"
            "- sample_date: Sample collection date as YYYY-MM-DD string or null\n"
            "If any value is missing, illegible, or ambiguous, return null for that field.\n\n"
        )
        if extracted_text:
            prompt += f"Report Text:\n{extracted_text}"

        try:
            parsed = gemini.generate_structured(
                step="soil_pdf",
                prompt=prompt,
                response_schema=SoilDataOutput,
                case_id=case_id,
                images=rendered_images if rendered_images else None,
                canonical_inputs={"extracted_text": extracted_text},
                db=db,
            )
            result_dict = parsed.model_dump()
        except Exception as e:
            logger.warning(f"Gemini soil PDF extraction failed: {e}. Falling back to text parser.")

    # Fallback text parsing if result_dict is empty
    if not result_dict or all(v is None for k, v in result_dict.items() if k != "needs_confirmation"):
        result_dict = _extract_soil_from_text(extracted_text)

    # Range validation for pH (3.0 to 10.0)
    raw_ph = result_dict.get("ph")
    if raw_ph is not None:
        try:
            ph_val = float(raw_ph)
            if not (3.0 <= ph_val <= 10.0):
                logger.warning(f"pH value {ph_val} out of valid range [3.0, 10.0]. Setting to null.")
                result_dict["ph"] = None
                result_dict["needs_confirmation"] = True
            else:
                result_dict["ph"] = ph_val
        except (ValueError, TypeError):
            result_dict["ph"] = None
            result_dict["needs_confirmation"] = True

    # Check for missing values requiring confirmation
    key_fields = ["n_ppm", "p_ppm", "k_ppm", "ph"]
    if any(result_dict.get(f) is None for f in key_fields):
        result_dict["needs_confirmation"] = True

    return SoilDataOutput(**result_dict)


def _extract_soil_from_text(text: str) -> Dict[str, Any]:
    """Basic regex fallback extractor for standard soil report text."""
    res = {
        "n_ppm": None,
        "p_ppm": None,
        "k_ppm": None,
        "ph": None,
        "sample_date": None,
        "needs_confirmation": False,
    }
    if not text:
        res["needs_confirmation"] = True
        return res

    # Nitrate N (ppm)
    n_match = re.search(r"(?:NO3-N|Nitrate|Nitrogen)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(?:ppm)?", text, re.I)
    if n_match:
        res["n_ppm"] = float(n_match.group(1))

    # Phosphorus (ppm)
    p_match = re.search(r"(?:Phosphorus|Bray|P1|P)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(?:ppm)?", text, re.I)
    if p_match:
        res["p_ppm"] = float(p_match.group(1))

    # Potassium (ppm)
    k_match = re.search(r"(?:Potassium|K)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(?:ppm)?", text, re.I)
    if k_match:
        res["k_ppm"] = float(k_match.group(1))

    # pH
    ph_match = re.search(r"(?:pH|Soil pH)[\s:]*([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if ph_match:
        res["ph"] = float(ph_match.group(1))

    # Sample date
    date_match = re.search(r"(?:Date|Sampled)[\s:]*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}/[0-9]{2}/[0-9]{4})", text, re.I)
    if date_match:
        res["sample_date"] = date_match.group(1)

    return res
