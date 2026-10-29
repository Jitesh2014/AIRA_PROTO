"""Fix common teacher typos before embedding queries."""

import re
from typing import Tuple

TYPO_FIXES = [
    (re.compile(r"\bchap+e*r+\b", re.I), "chapter"),
    (re.compile(r"\bchapteer\b", re.I), "chapter"),
    (re.compile(r"\bchpter\b", re.I), "chapter"),
    (re.compile(r"\bsumm?ar[iy]ze?\b", re.I), "summarize"),
    (re.compile(r"\bques+tions?\b", re.I), "questions"),
    (re.compile(r"\bgenrate\b", re.I), "generate"),
]


def normalize_teacher_query(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    for pattern, replacement in TYPO_FIXES:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


def extract_chapter_number(text: str) -> str | None:
    patterns = [
        re.compile(r"\bchapter\s*[#:]?\s*(\d+)\b", re.I),
        re.compile(r"\bch\.?\s*(\d+)\b", re.I),
        re.compile(r"\bunit\s*[#:]?\s*(\d+)\b", re.I),
    ]
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


def prepare_retrieval_query(question: str, chapter: str | None = None) -> str:
    normalized = normalize_teacher_query(question)
    lower = normalized.lower()

    if re.search(r"\bremainder\s+problem\b", lower):
        normalized = (
            f"{normalized} — PROJECT THE REMAINDER PROBLEM MakeCode "
            "divisible modulus remainder operator steps"
        )
    elif re.search(r"\bremainder\b", lower) and chapter == "4":
        normalized = f"{normalized} — Remainders project MakeCode modulus"

    if chapter and f"chapter {chapter}" not in lower:
        return f"{normalized} — chapter {chapter}"
    return normalized
