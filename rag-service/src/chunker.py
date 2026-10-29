import re
from typing import Dict, List


class Chunker:
    def __init__(self, chunk_size: int = 500, overlap: int = 50):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk_text(
        self, text: str, chapter_num: str, metadata: Dict | None = None
    ) -> List[Dict]:
        chunks: List[Dict] = []
        chunk_id = 0
        meta = metadata or {}

        special_pattern = (
            r"(\[TABLE START\].*?\[TABLE END\]"
            r"|\[FORMULA\].*?\[/FORMULA\]"
            r"|\[CODE\].*?\[/CODE\])"
        )
        parts = re.split(special_pattern, text, flags=re.DOTALL)
        current_chunk = ""

        for part in parts:
            is_special = (
                part.startswith("[TABLE")
                or part.startswith("[FORMULA")
                or part.startswith("[CODE]")
            )

            if is_special:
                if current_chunk.strip():
                    for regular_chunk in self._split_regular_text(
                        current_chunk.strip(), chapter_num, meta
                    ):
                        regular_chunk["chunk_id"] = chunk_id
                        chunks.append(regular_chunk)
                        chunk_id += 1
                    current_chunk = ""

                chunks.append(
                    {
                        "chapter": chapter_num,
                        "chunk_id": chunk_id,
                        "text": part.strip(),
                        "type": "special",
                        "metadata": meta,
                    }
                )
                chunk_id += 1
            else:
                current_chunk += part

        if current_chunk.strip():
            for regular_chunk in self._split_regular_text(
                current_chunk.strip(), chapter_num, meta
            ):
                regular_chunk["chunk_id"] = chunk_id
                chunks.append(regular_chunk)
                chunk_id += 1

        return chunks

    def _split_regular_text(
        self, text: str, chapter_num: str, metadata: Dict
    ) -> List[Dict]:
        if not text.strip():
            return []

        paragraphs = re.split(r"\n\s*\n", text)
        chunks: List[Dict] = []
        current_chunk = ""

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            if len(para) > self.chunk_size:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                for sentence in sentences:
                    if len(current_chunk) + len(sentence) > self.chunk_size and current_chunk:
                        chunks.append(
                            {
                                "chapter": chapter_num,
                                "text": current_chunk.strip(),
                                "type": "text",
                                "metadata": metadata,
                            }
                        )
                        words = current_chunk.split()
                        current_chunk = (
                            " ".join(words[-self.overlap :])
                            if len(words) > self.overlap
                            else ""
                        )
                    current_chunk += sentence + " "
            else:
                if len(current_chunk) + len(para) > self.chunk_size and current_chunk:
                    chunks.append(
                        {
                            "chapter": chapter_num,
                            "text": current_chunk.strip(),
                            "type": "text",
                            "metadata": metadata,
                        }
                    )
                    words = current_chunk.split()
                    current_chunk = (
                        " ".join(words[-self.overlap :])
                        if len(words) > self.overlap
                        else ""
                    )
                current_chunk += para + "\n\n"

        if current_chunk.strip():
            chunks.append(
                {
                    "chapter": chapter_num,
                    "text": current_chunk.strip(),
                    "type": "text",
                    "metadata": metadata,
                }
            )

        return chunks
