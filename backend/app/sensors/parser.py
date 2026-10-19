import re
import os
import uuid
import datetime
import logging
from typing import List, Dict, Any, Tuple, Optional
import pymupdf  # PyMuPDF

from app.core.config import settings
from app.sensors.generator import SIMULATED_RANGES

logger = logging.getLogger("agriadvisor.sensors.parser")

PHYSICAL_LIMITS = {
    "soil_moisture_pct": (0.0, 100.0),
    "n_mgkg": (0.0, 1000.0),
    "p_mgkg": (0.0, 1000.0),
    "k_mgkg": (0.0, 1000.0),
    "temp_c": (-20.0, 60.0),
    "humidity_pct": (0.0, 100.0),
    "ph": (3.0, 10.0),
    "leaf_wetness_pct": (0.0, 100.0),
}

METRIC_SIMULATED_KEYS = {
    "soil_moisture_pct": "moisture",
    "n_mgkg": "n_mgkg",
    "p_mgkg": "p_mgkg",
    "k_mgkg": "k_mgkg",
    "temp_c": "temp",
    "humidity_pct": "humidity",
    "ph": "ph",
    "leaf_wetness_pct": "leaf_wetness",
}

COLUMN_PATTERNS = {
    "timestamp": [r"timestamp", r"time", r"date", r"measured_at", r"datetime"],
    "soil_moisture_pct": [r"soil\s*moist", r"moist", r"vwc", r"\bsm\b"],
    "n_mgkg": [r"\bn\b", r"nitrogen", r"\bn\s*\(", r"n_mgkg"],
    "p_mgkg": [r"\bp\b", r"phosphorus", r"\bp\s*\(", r"p_mgkg"],
    "k_mgkg": [r"\bk\b", r"potassium", r"\bk\s*\(", r"k_mgkg"],
    "temp_c": [r"air\s*temp", r"temperature", r"\btemp\b", r"temp_c"],
    "humidity_pct": [r"humidity", r"relative\s*humidity", r"\brh\b", r"humidity_pct"],
    "ph": [r"soil\s*ph", r"\bph\b"],
    "leaf_wetness_pct": [r"leaf\s*wet", r"wetness"],
}

ALL_COLUMNS = [
    "timestamp",
    "soil_moisture_pct",
    "n_mgkg",
    "p_mgkg",
    "k_mgkg",
    "temp_c",
    "humidity_pct",
    "ph",
    "leaf_wetness_pct",
]


def parse_timestamp_str(s: str) -> Optional[datetime.datetime]:
    if not s:
        return None
    s = s.strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def match_header_columns(header_row: List[str]) -> Tuple[Dict[str, int], List[str]]:
    """
    Matches header texts to canonical column names, supporting fuzzy/case-insensitive matching
    and arbitrary column ordering.
    """
    col_mapping: Dict[str, int] = {}
    matched_indices = set()

    for canonical_col, patterns in COLUMN_PATTERNS.items():
        found_idx = None
        for idx, text in enumerate(header_row):
            if idx in matched_indices:
                continue
            cleaned = str(text or "").lower().strip()
            for pat in patterns:
                if re.search(pat, cleaned, re.IGNORECASE):
                    found_idx = idx
                    break
            if found_idx is not None:
                break

        if found_idx is not None:
            col_mapping[canonical_col] = found_idx
            matched_indices.add(found_idx)

    missing_cols = [c for c in ALL_COLUMNS if c not in col_mapping]
    return col_mapping, missing_cols


def validate_and_clean_value(metric: str, raw_val: Any, row_idx: int, warnings: List[str]) -> Optional[float]:
    """
    Validates physical limits (nulled with warning if violated)
    and simulated ranges (kept with warning if violated).
    """
    if raw_val is None or str(raw_val).strip() == "" or str(raw_val).strip().lower() in ("null", "none", "-", "nan"):
        return None

    cleaned_str = str(raw_val).strip()
    # Remove units like %, mg/kg, C, etc.
    cleaned_str = re.sub(r"[^\d\.\-+]", "", cleaned_str)
    if not cleaned_str or cleaned_str in ("+", "-", "."):
        return None
    try:
        val = float(cleaned_str)
    except ValueError:
        warnings.append(f"Row {row_idx}: Could not parse numeric value '{raw_val}' for {metric}.")
        return None

    # Check physical limits
    phys_min, phys_max = PHYSICAL_LIMITS.get(metric, (-999999.0, 999999.0))
    if val < phys_min or val > phys_max:
        warnings.append(
            f"Row {row_idx}: {metric} value {val} outside physical bounds ({phys_min} to {phys_max}). Value nulled."
        )
        return None

    # Check simulated range
    sim_key = METRIC_SIMULATED_KEYS.get(metric)
    if sim_key and sim_key in SIMULATED_RANGES:
        sim_min, sim_max = SIMULATED_RANGES[sim_key]
        if val < sim_min or val > sim_max:
            warnings.append(
                f"Row {row_idx}: {metric} value {val} is outside expected simulated range ({sim_min} to {sim_max})."
            )

    return val


def parse_sensor_pdf(
    pdf_bytes: bytes,
    filename: Optional[str] = None,
    save_to_uploads: bool = True,
) -> Dict[str, Any]:
    """
    Deterministic-first sensor PDF parser:
    1. PyMuPDF page.find_tables()
    2. Regex over text lines
    3. Gemini LLM fallback (if AI_MODE=gemini and image-only)
    """
    warnings: List[str] = []

    # 1. Security & format checks
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("Invalid PDF format: file missing %PDF header magic bytes.")

    max_mb = getattr(settings, "MAX_SENSOR_PDF_MB", 5.0)
    if len(pdf_bytes) > max_mb * 1024 * 1024:
        raise ValueError(f"Sensor report PDF exceeds maximum allowed size of {max_mb} MB.")

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Failed to open PDF document: {e}")

    if doc.is_encrypted:
        raise ValueError("Encrypted or password-protected PDFs are rejected.")

    if len(doc) > 10:
        raise ValueError("Sensor report PDF exceeds 10 pages limit.")

    # Save to uploads/sensor/ with random name if requested
    stored_path = None
    if save_to_uploads:
        upload_base = getattr(settings, "UPLOAD_DIR", "./uploads")
        sensor_dir = os.path.join(upload_base, "sensor")
        os.makedirs(sensor_dir, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex}.pdf"
        stored_path = os.path.join(sensor_dir, unique_name)
        with open(stored_path, "wb") as f:
            f.write(pdf_bytes)

    # Metadata extraction (Kit ID, field name, etc.)
    device_label = None
    first_page_text = doc[0].get_text() if len(doc) > 0 else ""
    kit_match = re.search(r"Sensor\s*Kit\s*ID[:\s]*([A-Za-z0-9\-_]+)", first_page_text, re.IGNORECASE)
    if kit_match:
        device_label = kit_match.group(1).strip()

    parse_method = None
    raw_rows: List[Dict[str, Any]] = []
    missing_columns: List[str] = []

    # ----------------------------------------------------
    # ATTEMPT 1: PyMuPDF find_tables()
    # ----------------------------------------------------
    col_mapping: Optional[Dict[str, int]] = None
    all_table_data_rows: List[List[str]] = []

    for page_idx, page in enumerate(doc):
        try:
            tabs = page.find_tables()
            for tab in tabs:
                extracted = tab.extract()
                if not extracted or len(extracted) < 1:
                    continue

                for r_idx, row in enumerate(extracted):
                    cleaned_cells = [str(c or "").strip() for c in row]
                    if not any(cleaned_cells):
                        continue

                    if col_mapping is None:
                        # Try to match header
                        matched_map, missing = match_header_columns(cleaned_cells)
                        if "timestamp" in matched_map and len(matched_map) >= 3:
                            col_mapping = matched_map
                            missing_columns = missing
                            continue

                    if col_mapping is not None:
                        all_table_data_rows.append(cleaned_cells)
        except Exception as e:
            logger.debug(f"find_tables exception on page {page_idx}: {e}")

    if col_mapping and all_table_data_rows:
        parse_method = "table"
        for row in all_table_data_rows:
            row_dict: Dict[str, Any] = {}
            for col_name, idx in col_mapping.items():
                if idx < len(row):
                    row_dict[col_name] = row[idx]
                else:
                    row_dict[col_name] = None
            raw_rows.append(row_dict)

    # ----------------------------------------------------
    # ATTEMPT 2: Regex text extraction
    # ----------------------------------------------------
    if not raw_rows:
        logger.info("find_tables produced no valid rows. Attempting regex line parsing.")
        full_text = ""
        for page in doc:
            full_text += page.get_text() + "\n"

        ts_regex = re.compile(
            r"(\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}(?::\d{2})?|\d{2}[-/]\d{2}[-/]\d{4} \d{2}:\d{2}(?::\d{2})?)"
        )
        lines = full_text.splitlines()

        for line in lines:
            line_str = line.strip()
            ts_m = ts_regex.search(line_str)
            if not ts_m:
                continue

            ts_str = ts_m.group(1)
            # Find all numbers in the remainder of the line
            remainder = line_str[ts_m.end():]
            num_tokens = re.findall(r"[-+]?\d*\.?\d+", remainder)
            if len(num_tokens) >= 4:
                row_dict = {
                    "timestamp": ts_str,
                    "soil_moisture_pct": num_tokens[0] if len(num_tokens) > 0 else None,
                    "n_mgkg": num_tokens[1] if len(num_tokens) > 1 else None,
                    "p_mgkg": num_tokens[2] if len(num_tokens) > 2 else None,
                    "k_mgkg": num_tokens[3] if len(num_tokens) > 3 else None,
                    "temp_c": num_tokens[4] if len(num_tokens) > 4 else None,
                    "humidity_pct": num_tokens[5] if len(num_tokens) > 5 else None,
                    "ph": num_tokens[6] if len(num_tokens) > 6 else None,
                    "leaf_wetness_pct": num_tokens[7] if len(num_tokens) > 7 else None,
                }
                raw_rows.append(row_dict)

        if raw_rows:
            parse_method = "regex"
            missing_columns = []

    # ----------------------------------------------------
    # ATTEMPT 3: Gemini structured output (if image-only and gemini enabled)
    # ----------------------------------------------------
    total_extracted_text = "".join(p.get_text().strip() for p in doc)
    is_image_only = len(total_extracted_text) < 20

    if not raw_rows and getattr(settings, "AI_MODE", "mock").lower() == "gemini" and is_image_only:
        logger.info("PDF is image-only, falling back to Gemini structured parser.")
        try:
            from app.services.ai.gemini_client import get_gemini_client
            client = get_gemini_client()
            # Render first page as PNG for OCR
            pix = doc[0].get_pixmap(dpi=150)
            png_bytes = pix.tobytes("png")
            # Gemini structured call
            prompt = (
                "Extract the tabular field sensor telemetry from this sensor report image. "
                "Output JSON with columns: timestamp, soil_moisture_pct, n_mgkg, p_mgkg, k_mgkg, temp_c, humidity_pct, ph, leaf_wetness_pct."
            )
            llm_res = client.generate_structured_from_image(
                prompt=prompt,
                image_bytes=png_bytes,
                mime_type="image/png",
            )
            if llm_res and isinstance(llm_res, list):
                raw_rows = llm_res
                parse_method = "gemini"
        except Exception as gemini_err:
            warnings.append(f"Gemini OCR fallback failed: {gemini_err}")

    if not raw_rows and parse_method is None:
        parse_method = "regex"

    # ----------------------------------------------------
    # VALIDATION & CLEANING PER ROW
    # ----------------------------------------------------
    valid_readings: List[Dict[str, Any]] = []
    rows_dropped = 0
    total_input_rows = len(raw_rows)

    # Cap at 500 rows limit
    if total_input_rows > 500:
        warnings.append(f"PDF contained {total_input_rows} rows; capped at maximum 500 rows.")
        raw_rows = raw_rows[:500]

    for idx, row in enumerate(raw_rows, start=1):
        raw_ts = row.get("timestamp")
        parsed_dt = parse_timestamp_str(str(raw_ts))
        if not parsed_dt:
            rows_dropped += 1
            warnings.append(f"Row {idx}: Dropped due to unparsable timestamp '{raw_ts}'.")
            continue

        reading: Dict[str, Any] = {
            "measured_at": parsed_dt,
            "soil_moisture_pct": validate_and_clean_value("soil_moisture_pct", row.get("soil_moisture_pct"), idx, warnings),
            "n_mgkg": validate_and_clean_value("n_mgkg", row.get("n_mgkg"), idx, warnings),
            "p_mgkg": validate_and_clean_value("p_mgkg", row.get("p_mgkg"), idx, warnings),
            "k_mgkg": validate_and_clean_value("k_mgkg", row.get("k_mgkg"), idx, warnings),
            "temp_c": validate_and_clean_value("temp_c", row.get("temp_c"), idx, warnings),
            "humidity_pct": validate_and_clean_value("humidity_pct", row.get("humidity_pct"), idx, warnings),
            "ph": validate_and_clean_value("ph", row.get("ph"), idx, warnings),
            "leaf_wetness_pct": validate_and_clean_value("leaf_wetness_pct", row.get("leaf_wetness_pct"), idx, warnings),
        }

        # If every metric is null, drop the row
        metric_vals = [v for k, v in reading.items() if k != "measured_at"]
        if all(v is None for v in metric_vals):
            rows_dropped += 1
            warnings.append(f"Row {idx}: Dropped because all sensor metrics were null or unparsable.")
            continue

        valid_readings.append(reading)

    rows_ok = len(valid_readings)
    total_evaluated = rows_ok + rows_dropped
    drop_pct = (rows_dropped / float(total_evaluated)) if total_evaluated > 0 else 1.0

    needs_confirmation = (len(missing_columns) > 0) or (drop_pct > 0.20) or (rows_ok == 0)

    period_start = min((r["measured_at"] for r in valid_readings), default=None)
    period_end = max((r["measured_at"] for r in valid_readings), default=None)

    return {
        "rows_ok": rows_ok,
        "rows_dropped": rows_dropped,
        "warnings": warnings,
        "missing_columns": missing_columns,
        "needs_confirmation": needs_confirmation,
        "parse_method": parse_method or "table",
        "file_path": stored_path,
        "device_label": device_label,
        "period_start": period_start,
        "period_end": period_end,
        "readings": valid_readings,
    }
