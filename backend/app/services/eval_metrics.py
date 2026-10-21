import re
from typing import List, Dict, Any, Tuple, Optional


AGRONOMIC_JARGON = [
    "cercospora",
    "chlorosis",
    "necrosis",
    "phytotoxicity",
    "sporulation",
    "etiology",
    "prophylactic",
    "conidiophore",
    "pathogenesis",
    "haustorium",
    "appressorium",
    "sclerotium",
    "teliospore",
    "urediniospore",
    "anamorph",
    "teleomorph",
    "fungistasis",
]

CONFIDENCE_AI_TERMS = [
    "confidence",
    "probability",
    "ai",
    "model",
    "algorithm",
    "percentage",
    "hallucination",
    "llm",
    "neural network",
    "deep learning",
]

ENVIRONMENTAL_KEYWORDS = [
    "runoff",
    "leaching",
    "buffer",
    "pollinator",
    "drift",
]


def count_syllables_in_word(word: str) -> int:
    """Estimates the number of syllables in an English word."""
    word = word.lower().strip()
    if not word:
        return 0
    if len(word) <= 3:
        return 1

    # Remove non-alpha
    clean_word = re.sub(r"[^a-z]", "", word)
    if not clean_word:
        return 1

    # Simple syllable counting heuristic
    vowels = "aeiouy"
    count = 0
    prev_is_vowel = False
    for char in clean_word:
        is_vowel = char in vowels
        if is_vowel and not prev_is_vowel:
            count += 1
        prev_is_vowel = is_vowel

    # Adjust for silent ending 'e'
    if clean_word.endswith("e") and not clean_word.endswith("le") and len(clean_word) > 2:
        if not clean_word.endswith("ee"):
            count -= 1

    return max(1, count)


def compute_flesch_reading_ease(text: str) -> float:
    """
    Computes standard Flesch Reading Ease score:
    206.835 - 1.015 * (total_words / total_sentences) - 84.6 * (total_syllables / total_words)
    Normalized to 0 - 100 scale.
    """
    text = (text or "").strip()
    if not text:
        return 0.0

    # Tokenize words
    words = re.findall(r"\b[a-zA-Z0-9']+\b", text)
    if not words:
        return 0.0

    # Tokenize sentences
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    sentence_count = max(1, len(sentences))
    word_count = len(words)
    syllable_count = sum(count_syllables_in_word(w) for w in words)

    asl = word_count / float(sentence_count)
    asw = syllable_count / float(word_count)

    score = 206.835 - (1.015 * asl) - (84.6 * asw)
    return max(0.0, min(100.0, round(score, 2)))


def compute_clarity_checklist(text: str) -> Dict[str, Any]:
    """
    Evaluates farmer clarity checklist:
    1. At most 120 words
    2. No jargon-list hits
    3. No confidence/AI wording
    """
    text = (text or "").strip()
    words = re.findall(r"\b[a-zA-Z0-9']+\b", text.lower())
    word_count = len(words)
    word_set = set(words)

    # 1. Word count <= 120
    words_ok = word_count <= 120

    # 2. No jargon hits
    jargon_hits = [j for j in AGRONOMIC_JARGON if j in word_set or j in text.lower()]
    no_jargon = len(jargon_hits) == 0

    # 3. No confidence / AI wording
    ai_hits = []
    text_lower = text.lower()
    for term in CONFIDENCE_AI_TERMS:
        if re.search(r"\b" + re.escape(term) + r"\b", text_lower):
            ai_hits.append(term)
    no_ai_words = len(ai_hits) == 0

    passed_count = (1 if words_ok else 0) + (1 if no_jargon else 0) + (1 if no_ai_words else 0)
    checklist_score = round((passed_count / 3.0) * 100.0, 1)

    return {
        "word_count": word_count,
        "words_ok": words_ok,
        "jargon_hits": jargon_hits,
        "no_jargon": no_jargon,
        "ai_hits": ai_hits,
        "no_ai_words": no_ai_words,
        "checklist_score": checklist_score,
    }


def compute_farmer_clarity(text: str) -> float:
    """
    Average of normalized Flesch reading ease and checklist score.
    Returns 0 - 100.
    """
    flesch = compute_flesch_reading_ease(text)
    chk = compute_clarity_checklist(text)
    return round((flesch + chk["checklist_score"]) / 2.0, 1)


def compute_ece(
    confidences: List[float],
    correctness: List[bool],
    n_bins: int = 3,
) -> Tuple[float, float]:
    """
    Computes Expected Calibration Error (ECE) with n_bins (default 3 bins).
    Bins are equal-width partitions over [0, 1].
    Returns (ece, uncertainty_calibration_score):
    ece in [0, 1], uncertainty_calibration_score = 100 - ece * 100.
    """
    if not confidences or not correctness or len(confidences) != len(correctness):
        return 0.0, 100.0

    n = len(confidences)
    # Normalize confidences to [0, 1] if given as percentages
    norm_confs = [c / 100.0 if c > 1.0 else max(0.0, min(1.0, float(c))) for c in confidences]
    binary_y = [1.0 if c else 0.0 for c in correctness]

    bin_boundaries = [i / float(n_bins) for i in range(n_bins + 1)]
    ece = 0.0

    for b in range(n_bins):
        low = bin_boundaries[b]
        high = bin_boundaries[b + 1]

        # In-bin indices
        if b == n_bins - 1:
            indices = [i for i, c in enumerate(norm_confs) if low <= c <= high]
        else:
            indices = [i for i, c in enumerate(norm_confs) if low <= c < high]

        if not indices:
            continue

        bin_size = len(indices)
        avg_conf = sum(norm_confs[i] for i in indices) / float(bin_size)
        avg_acc = sum(binary_y[i] for i in indices) / float(bin_size)

        ece += (bin_size / float(n)) * abs(avg_acc - avg_conf)

    calibration_score = round(max(0.0, min(100.0, (1.0 - ece) * 100.0)), 1)
    return round(ece, 4), calibration_score


def compute_environmental_awareness(text: str, is_relevant: bool = True) -> float:
    """
    Keyword checklist (runoff, leaching, buffer, pollinator, drift) only when relevant to the case.
    Returns percentage 0 - 100.
    """
    if not is_relevant:
        return 100.0

    text_lower = (text or "").lower()
    matches = [k for k in ENVIRONMENTAL_KEYWORDS if k in text_lower]
    return round((len(matches) / float(len(ENVIRONMENTAL_KEYWORDS))) * 100.0, 1)


def check_image_case_accuracy(
    predicted_label: str,
    observations: List[str],
    expected_keywords: List[str],
) -> bool:
    """
    Returns True if issue_label or observations contain one of expected_keywords.
    """
    if not expected_keywords:
        return True

    search_space = (predicted_label or "").lower()
    if observations:
        search_space += " " + " ".join(observations).lower()

    for kw in expected_keywords:
        kw_clean = kw.lower().strip()
        if kw_clean and kw_clean in search_space:
            return True

    return False
