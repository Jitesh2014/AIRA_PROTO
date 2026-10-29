import re
from typing import List, Dict

def clean_chunk_text(text: str) -> str:
    if not text:
        return ""
    
    # 1. REMOVE ALL COPYRIGHT TEXT VARIANTS
    text = re.sub(r"©?\s*SuperTeacher\s*Edureforms\s*Pvt\.?\s*Ltd\.?", "", text, flags=re.I)
    text = re.sub(r"©?\s*SuperTeacher\s*Edureforms\s*Pvt\.?", "", text, flags=re.I)
    text = re.sub(r"SuperTeacher\s*Edureforms\s*Pvt\.?\s*Ltd\.?", "", text, flags=re.I)
    text = re.sub(r"SuperTeacher\s*Edureforms\s*Pvt\.?", "", text, flags=re.I)
    text = re.sub(r"Edureforms", "", text, flags=re.I)
    
    # 2. REMOVE ALL COMMON OCR ARTIFACTS
    text = re.sub(r"Recall\s+Recall", "", text)
    text = re.sub(r"for More\.{2,}", "", text, flags=re.I)
    text = re.sub(r"For More\.{2,}", "", text, flags=re.I)
    text = re.sub(r"for More\.\.\.", "", text, flags=re.I)
    text = re.sub(r"For More\.\.\.", "", text, flags=re.I)
    text = re.sub(r"Page\s+\d+", "", text, flags=re.I)
    text = re.sub(r"\[PAGE\s+\d+\]", "", text, flags=re.I)
    text = re.sub(r"\[CHAPTER_START\].*?\[CHAPTER_END\]", "", text, flags=re.I | re.S)
    text = re.sub(r"^\s*Grade\s+6\s*$", "", text, flags=re.M | re.I)
    text = re.sub(r"END OF CHAPTER\s*\d*", "", text, flags=re.I)
    text = re.sub(r"CHAPTER\s*\d+\s*:\s*.*", "", text, flags=re.I)
    text = re.sub(r"LEARNING OBJECTIVES.*", "", text, flags=re.I)
    text = re.sub(r"Source:.*", "", text, flags=re.I)
    text = re.sub(r"Total Pages:.*", "", text, flags=re.I)
    text = re.sub(r"Tables Found:.*", "", text, flags=re.I)
    text = re.sub(r"Formulas Found:.*", "", text, flags=re.I)
    text = re.sub(r"Code Blocks Found:.*", "", text, flags=re.I)
    
    # 3. FIX OCR TYPOS
    text = re.sub(r"ﬁ", "fi", text)
    text = re.sub(r"ﬂ", "fl", text)
    text = re.sub(r"[’‘]", "'", text)
    text = re.sub(r"[“”]", '"', text)
    text = re.sub(r"ø", "o", text)
    text = re.sub(r"Ÿ", "'", text)
    text = re.sub(r"Å|Ã|¸", "", text)
    text = re.sub(r"î¢e|e|e", "The", text)
    text = re.sub(r"Å¸", "•", text)
    
    # 4. REMOVE MATH EXPRESSIONS
    # Any "number / number * number" patterns and "number + number * number" patterns
    text = re.sub(r"\b\d+\s*/\s*\d+\s*\*\s*\d+\b", "", text)
    text = re.sub(r"\b\d+\s*\+\s*\d+\s*\*\s*\d+\b", "", text)
    text = re.sub(r"\b\d+\s*[\/\+\*\-]\s*\d+(\s*[\/\+\*\-]\s*\d+)?\b", "", text)
    
    # 5. CLEAN SPACING
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n{2,}", "\n\n", text)
    text = text.strip()
    return text

def best_snippet(text: str, query: str, max_len: int = 300) -> str:
    if not text:
        return ""
    
    # Split into sentences
    sentences = re.split(r'[.!?]+', text)
    query_words = set((query or "").lower().split())
    
    # Score each sentence
    scored = []
    for sent in sentences:
        sent = sent.strip()
        if len(sent) < 10:
            continue
        sent_words = set(sent.lower().split())
        score = len(sent_words & query_words)
        if score > 0:
            scored.append((score, sent))
    
    # Get best sentence
    if scored:
        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
        if len(best) > max_len:
            best = best[:max_len] + "..."
        best = best[0].upper() + best[1:] if best else best
        if not best.endswith('.'):
            best += '.'
        return best
    
    # Fallback: first meaningful sentence
    for sent in sentences:
        sent = sent.strip()
        if len(sent) > 20:
            if len(sent) > max_len:
                sent = sent[:max_len] + "..."
            sent = sent[0].upper() + sent[1:] if sent else sent
            if not sent.endswith('.'):
                sent += '.'
            return sent
    
    return text[:max_len] + "..." if len(text) > max_len else text

def format_context(results: List[Dict], max_sources: int = 5) -> str:
    formatted = []
    for i, r in enumerate(results[:max_sources]):
        title = r.get("title") or "Material"
        chapter = r.get("chapter") or ""
        pages = r.get("pages") or ""
        text = r.get("text") or r.get("text_clean") or ""
        
        source_info = f"[Source {i + 1} — {title}"
        if chapter:
            source_info += f", Ch. {chapter}"
        if pages:
            source_info += f", p. {pages}"
        source_info += "]"
        
        cleaned_text = clean_chunk_text(text)
        formatted.append(f"{source_info}\n{cleaned_text}")
    return "\n\n".join(formatted)