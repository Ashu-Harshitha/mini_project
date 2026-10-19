"""
RAG document chunking and text processing.
- Words-based chunking (150 words, 30 overlap)
- Prefer sentence boundaries
- Skip chunks under 40 words
- Drop repeated header/footer lines across pages
- Publisher abbreviation citation formatting
"""

import re
from typing import List, Dict, Set


PUBLISHER_MAP = {
    "iowa state": "ISU Ext",
    "nebraska": "UNL Ext",
    "purdue": "Purdue Ext",
    "cornell": "Cornell Ext",
    "kansas state": "KSU Ext",
    "arizona": "UA Ext",
    "minnesota": "UMN Ext",
    "alberta": "Alberta Ag",
    "oklahoma": "OSU Ext",
    "indian council": "ICAR",
    "icar": "ICAR",
}


def get_publisher_abbreviation(publisher: str) -> str:
    """Returns standard publisher abbreviation, e.g. 'ISU Ext' or 'UNL Ext'."""
    if not publisher:
        return "Extension"
    pub_lower = publisher.lower()
    for key, abbr in PUBLISHER_MAP.items():
        if key in pub_lower:
            return abbr
    # Fallback heuristic
    words = [w for w in re.split(r"[\s,–-]+", publisher) if w and w.lower() not in ("and", "of", "the", "for")]
    if len(words) >= 2:
        return f"{words[0][:4]} Ext"
    return f"{words[0]} Ext" if words else "Extension"


def format_citation(publisher: str, page: int) -> str:
    """Builds citation label like '[ISU Ext p.12]'."""
    abbr = get_publisher_abbreviation(publisher)
    return f"[{abbr} p.{page}]"


def clean_repeated_headers_footers(pages_text: List[str]) -> List[str]:
    """
    Detects lines appearing repeatedly at page boundaries (top/bottom 2 lines)
    across multiple pages and strips them.
    """
    if len(pages_text) <= 1:
        return pages_text

    top_lines: Dict[str, int] = {}
    bottom_lines: Dict[str, int] = {}

    for page in pages_text:
        lines = [line.strip() for line in page.splitlines() if line.strip()]
        if not lines:
            continue
        for line in lines[:2]:
            top_lines[line] = top_lines.get(line, 0) + 1
        for line in lines[-2:]:
            bottom_lines[line] = bottom_lines.get(line, 0) + 1

    # Lines repeated on >= 2 pages (or >= 30% of pages) are considered header/footer
    threshold = max(2, int(len(pages_text) * 0.3))
    header_footer_candidates: Set[str] = set()
    for line, count in top_lines.items():
        if count >= threshold:
            header_footer_candidates.add(line)
    for line, count in bottom_lines.items():
        if count >= threshold:
            header_footer_candidates.add(line)

    cleaned_pages: List[str] = []
    for page in pages_text:
        filtered_lines = [
            line for line in page.splitlines()
            if line.strip() not in header_footer_candidates
        ]
        cleaned_pages.append("\n".join(filtered_lines))

    return cleaned_pages


def split_into_sentences(text: str) -> List[str]:
    """Splits text into sentences while respecting common punctuation boundaries."""
    # Normalize whitespaces
    normalized = re.sub(r"[ \t]+", " ", text).strip()
    if not normalized:
        return []
    # Split on sentence terminals followed by space or newline
    raw_sentences = re.split(r"(?<=[.!?])\s+", normalized)
    sentences = [s.strip() for s in raw_sentences if s.strip()]
    return sentences


def chunk_text(
    text: str,
    target_words: int = 150,
    overlap_words: int = 30,
    min_words: int = 40,
) -> List[str]:
    """
    Chunks text by WORDS (~150 words with ~30 overlap),
    preferring sentence boundaries, and skipping chunks under min_words (40).
    """
    sentences = split_into_sentences(text)
    if not sentences:
        return []

    chunks: List[str] = []
    current_sentences: List[str] = []
    current_word_count = 0

    for sent in sentences:
        sent_words = sent.split()
        sent_word_len = len(sent_words)

        # If a single sentence is excessively long (> target_words), chunk it directly by words
        if sent_word_len > target_words:
            # First flush existing buffer if valid
            if current_word_count >= min_words:
                chunks.append(" ".join(current_sentences))
            current_sentences = []
            current_word_count = 0

            step = max(1, target_words - overlap_words)
            for i in range(0, sent_word_len, step):
                chunk_slice = sent_words[i:i + target_words]
                if len(chunk_slice) >= min_words:
                    chunks.append(" ".join(chunk_slice))
            continue

        if current_word_count + sent_word_len > target_words:
            if current_word_count >= min_words:
                chunks.append(" ".join(current_sentences))

            # Select overlap from the end of current_sentences
            overlap_buffer: List[str] = []
            overlap_count = 0
            for prev_sent in reversed(current_sentences):
                prev_len = len(prev_sent.split())
                if overlap_count + prev_len <= overlap_words or not overlap_buffer:
                    overlap_buffer.insert(0, prev_sent)
                    overlap_count += prev_len
                else:
                    break

            current_sentences = list(overlap_buffer)
            current_sentences.append(sent)
            current_word_count = sum(len(s.split()) for s in current_sentences)
        else:
            current_sentences.append(sent)
            current_word_count += sent_word_len

    # Flush tail chunk if it meets min_words
    if current_word_count >= min_words:
        chunks.append(" ".join(current_sentences))

    return chunks
