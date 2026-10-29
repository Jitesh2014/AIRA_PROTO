from typing import Dict

from src.chunker import Chunker
from src.embedder import Embedder
from src.pdf_processor import PDFProcessor, pages_from_text
from src.qdrant_store import QdrantStore


def index_book_pdf(
    pdf_path: str,
    school_id: str,
    book_id: str,
    metadata: Dict,
    embedder: Embedder,
    vector_store: QdrantStore,
) -> int:
    vector_store.delete_book_vectors(school_id, book_id)

    processor = PDFProcessor(pdf_path)
    try:
        chapters = processor.extract_chapters(metadata)
        chunker = Chunker(chunk_size=500, overlap=50)
        chunks = []

        for chapter_info in chapters:
            chapter = chapter_info["chapter"]
            chapter_title = chapter_info["title"]
            base_meta = {
                "school_id": school_id,
                "book_id": book_id,
                "title": chapter_title,
                "subject": metadata.get("subject", ""),
                "class": metadata.get("class", ""),
            }

            chapter_chunks = chunker.chunk_text(
                chapter_info["text"], chapter, base_meta
            )

            for chunk in chapter_chunks:
                chunk["school_id"] = school_id
                chunk["book_id"] = book_id
                chunk["title"] = chapter_title
                chunk["subject"] = base_meta["subject"]
                chunk["class"] = base_meta["class"]
                chunk["pages"] = pages_from_text(chunk["text"])

            chunks.extend(chapter_chunks)

        if not chunks:
            return 0

        embedded = embedder.embed_chunks(chunks)
        vector_store.create_collection(embedder.dimension)
        vector_store.upsert_chunks(embedded)
        return len(embedded)
    finally:
        processor.close()
