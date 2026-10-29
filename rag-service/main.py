import asyncio
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from src.embedder import Embedder
from src.indexer import index_book_pdf
from src.qdrant_store import QdrantStore
from src.rag_retrieve import RAGRetriever

load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print("Preloading BGE-M3 in background (Railway health check can pass first)...")

    async def preload() -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, get_services)
        print("RAG model ready — full query capacity available.")

    task = asyncio.create_task(preload())
    yield
    task.cancel()


app = FastAPI(title="AIRA RAG Service", version="0.1.0", lifespan=lifespan)

_retriever: Optional[RAGRetriever] = None
_embedder: Optional[Embedder] = None
_vector_store: Optional[QdrantStore] = None


def verify_api_key(x_rag_key: Optional[str] = Header(default=None)) -> None:
    expected = os.getenv("RAG_API_KEY", "").strip()
    if expected and x_rag_key != expected:
        raise HTTPException(status_code=401, detail="Invalid RAG API key")


def get_services() -> tuple[RAGRetriever, Embedder, QdrantStore]:
    global _retriever, _embedder, _vector_store

    if _retriever is None:
        _retriever = RAGRetriever()
        _embedder = _retriever.embedder
        _vector_store = _retriever.vector_store

    return _retriever, _embedder, _vector_store


class QueryRequest(BaseModel):
    question: Optional[str] = None
    query: Optional[str] = None
    school_id: str
    book_id: Optional[str] = None
    subject: Optional[str] = None
    class_name: Optional[str] = Field(default=None, alias="class")
    chapter: Optional[str] = None
    top_k: int = 10

    model_config = {"populate_by_name": True}


class QuerySource(BaseModel):
    book_title: str
    chapter: str
    pages: str
    snippet: str
    score: float
    book_id: str


class QueryResponse(BaseModel):
    results: list[QuerySource]
    top_score: float
    context: str
    summary: str = ""


@app.get("/health")
async def health():
    from src.qdrant_store import LEGACY_COLLECTION
    from src.redis_cache import is_redis_connected

    qdrant_ok = False
    try:
        store = QdrantStore()
        qdrant_ok = store.ping()
    except Exception:
        qdrant_ok = False

    legacy_points = 0
    try:
        store = QdrantStore()
        from src.qdrant_store import LEGACY_COLLECTION as LC

        if store._legacy_has_data():
            info = store.client.get_collection(LC)
            legacy_points = info.points_count or 0
    except Exception:
        pass

    return {
        "status": "ok",
        "service": "aira-rag",
        "qdrant_connected": qdrant_ok,
        "redis_connected": is_redis_connected(),
        "model_loaded": _retriever is not None,
        "legacy_collection": LEGACY_COLLECTION,
        "legacy_points": legacy_points,
    }


@app.get("/catalog")
async def catalog(x_rag_key: Optional[str] = Header(default=None)):
    verify_api_key(x_rag_key)
    from src.qdrant_store import LEGACY_COLLECTION, QdrantStore

    vector_store = QdrantStore()
    chapters = vector_store.get_legacy_catalog()
    total_chunks = sum(int(c.get("chunks") or 0) for c in chapters)

    return {
        "collection": LEGACY_COLLECTION,
        "total_chunks": total_chunks,
        "chapters": chapters,
    }


@app.post("/query")
async def query(
    body: QueryRequest,
    x_rag_key: Optional[str] = Header(default=None),
):
    verify_api_key(x_rag_key)
    retriever, _, _ = get_services()

    query_text = body.question or body.query
    if not query_text:
        raise HTTPException(status_code=400, detail="Either 'question' or 'query' is required")

    results = retriever.retrieve(
        query=query_text,
        school_id=body.school_id,
        top_k=body.top_k,
        book_id=body.book_id,
        subject=body.subject,
        class_name=body.class_name,
        chapter=body.chapter,
    )

    from src.text_cleanup import best_snippet, clean_chunk_text

    sources = [
        QuerySource(
            book_title=r.get("title") or "Material",
            chapter=str(r.get("chapter") or ""),
            pages=str(r.get("pages") or ""),
            snippet=best_snippet(
                r.get("text_clean") or clean_chunk_text(r.get("text") or ""),
                query=query_text,
            ),
            score=float(r.get("score") or 0),
            book_id=str(r.get("book_id") or ""),
        )
        for r in results
    ]

    top_score = max((s.score for s in sources), default=0.0)
    summary = retriever.build_summary(query_text, results)

    return QueryResponse(
        results=sources,
        top_score=top_score,
        context=retriever.format_context(results),
        summary=summary,
    )


@app.post("/index")
async def index_book(
    file: UploadFile = File(...),
    school_id: str = Form(...),
    book_id: str = Form(...),
    title: str = Form(...),
    subject: str = Form(""),
    class_name: str = Form("", alias="class"),
    chapter: str = Form(""),
    content_type: str = Form("book"),
    x_rag_key: Optional[str] = Header(default=None),
):
    verify_api_key(x_rag_key)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")

    _, embedder, vector_store = get_services()

    suffix = ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        chunk_count = index_book_pdf(
            tmp_path,
            school_id=school_id,
            book_id=book_id,
            metadata={
                "title": title,
                "subject": subject,
                "class": class_name,
                "chapter": chapter,
                "contentType": content_type,
            },
            embedder=embedder,
            vector_store=vector_store,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return {
        "ok": True,
        "chunks_indexed": chunk_count,
        "extraction_method": "digital",
    }


@app.delete("/books/{book_id}")
async def delete_book_vectors(
    book_id: str,
    school_id: str,
    x_rag_key: Optional[str] = Header(default=None),
):
    verify_api_key(x_rag_key)
    _, _, vector_store = get_services()
    vector_store.delete_book_vectors(school_id, book_id)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8100"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
