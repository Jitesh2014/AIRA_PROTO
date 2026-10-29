# rag-service/src/qdrant_store.py

import os
import uuid
from typing import Dict, List, Optional

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)

load_dotenv()

COLLECTION_NAME = "grade6_computer_science"
LEGACY_COLLECTION = os.getenv("QDRANT_LEGACY_COLLECTION", "grade6_computer_science")
FILTER_INDEX_FIELDS = ("school_id", "book_id", "subject", "class", "chapter")


def _chapter_match_value(chapter: str, as_integer: bool = False):
    """Legacy collection stores chapter as integer; tenant collection uses strings."""
    # Clean the chapter value
    if isinstance(chapter, str):
        # Remove "chapter" prefix if present
        chapter = chapter.replace("chapter", "").strip()
    
    if as_integer and str(chapter).isdigit():
        return MatchValue(value=int(chapter))
    return MatchValue(value=str(chapter))


def _title_from_payload(payload: Dict) -> str:
    title = payload.get("title") or ""
    if title:
        return str(title)

    metadata = payload.get("metadata") or {}
    if isinstance(metadata, dict):
        source = metadata.get("source") or metadata.get("file") or ""
        if source:
            return os.path.basename(str(source)).replace(".pdf", "").replace("_", " ")

    return "Grade 6 Computer Science"


class QdrantStore:
    def __init__(self, use_cloud: bool | None = None, url: str | None = None, api_key: str | None = None):
        if use_cloud is None:
            use_cloud = os.getenv("QDRANT_USE_CLOUD", "true").lower() == "true"

        self.use_cloud = use_cloud
        self.collection_name = COLLECTION_NAME

        if use_cloud:
            self.url = url or os.getenv("QDRANT_CLOUD_URL")
            self.api_key = api_key or os.getenv("QDRANT_API_KEY")

            if not self.url or not self.api_key:
                raise ValueError(
                    "Missing Qdrant Cloud credentials. Set QDRANT_CLOUD_URL and QDRANT_API_KEY"
                )

            self.client = QdrantClient(url=self.url, api_key=self.api_key, timeout=60)
            print(f"Connected to Qdrant Cloud: {self.url}")
        else:
            self.client = QdrantClient(host="localhost", port=6333)
            print("Connected to local Qdrant")

    def create_collection(self, vector_size: int) -> None:
        try:
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]

            if self.collection_name not in collection_names:
                print(f"Creating collection: {self.collection_name}")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                    optimizers_config={
                        "default_segment_number": 2,
                        "indexing_threshold": 20000
                    }
                )
                print(f"✅ Created collection: {self.collection_name}")
            else:
                print(f"✅ Collection already exists: {self.collection_name}")

            self.ensure_payload_indexes()

        except Exception as e:
            error_msg = str(e).lower()
            if "already exists" in error_msg:
                print(f"✅ Collection {self.collection_name} already exists")
                self.ensure_payload_indexes()
            else:
                print(f"❌ Error creating collection: {e}")
                raise

    def ensure_payload_indexes(self) -> None:
        for field in FILTER_INDEX_FIELDS:
            try:
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema=PayloadSchemaType.KEYWORD,
                )
                print(f"  Payload index ready: {field}")
            except Exception as e:
                message = str(e).lower()
                if "already exists" in message or "already exist" in message:
                    continue
                print(f"  Payload index note ({field}): {e}")

    def upsert_chunks(self, chunks: List[Dict]) -> None:
        points = []

        for chunk in chunks:
            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=chunk["embedding"],
                    payload={
                        "school_id": chunk["school_id"],
                        "book_id": chunk["book_id"],
                        "chapter": str(chunk["chapter"]),
                        "chunk_id": chunk["chunk_id"],
                        "text": chunk["text"],
                        "type": chunk.get("type", "text"),
                        "title": chunk.get("title", ""),
                        "subject": chunk.get("subject", ""),
                        "class": chunk.get("class", ""),
                        "pages": chunk.get("pages", ""),
                    },
                )
            )

        batch_size = 100
        total_batches = (len(points) - 1) // batch_size + 1

        for i in range(0, len(points), batch_size):
            self.client.upsert(
                collection_name=self.collection_name,
                points=points[i : i + batch_size],
            )
            print(f"  Upserted batch {i // batch_size + 1}/{total_batches}")

        print(f"Upserted {len(points)} chunks")

    def _build_filter(
        self,
        school_id: str,
        book_id: Optional[str] = None,
        subject: Optional[str] = None,
        class_name: Optional[str] = None,
        chapter: Optional[str] = None,
    ) -> Filter:
        must = [FieldCondition(key="school_id", match=MatchValue(value=school_id))]

        if book_id:
            must.append(FieldCondition(key="book_id", match=MatchValue(value=book_id)))
        if subject:
            must.append(FieldCondition(key="subject", match=MatchValue(value=subject)))
        if class_name:
            must.append(FieldCondition(key="class", match=MatchValue(value=class_name)))

        if chapter:
            # Clean the chapter value — remove "chapter" prefix if present
            chapter_str = str(chapter).replace("chapter", "").strip()

            if chapter_str.isdigit():
                chapter_int = int(chapter_str)
                print(f"  Chapter filter: {chapter_str} (int={chapter_int} OR str='{chapter_str}')")
                # FIX: Use should (OR) not must (AND) — a point matches either int or string
                must.append(
                    Filter(
                        should=[
                            FieldCondition(key="chapter", match=MatchValue(value=chapter_int)),
                            FieldCondition(key="chapter", match=MatchValue(value=chapter_str)),
                        ]
                    )
                )
            else:
                print(f"  Chapter filter: str='{chapter_str}'")
                must.append(
                    FieldCondition(key="chapter", match=MatchValue(value=chapter_str))
                )

        return Filter(must=must)

    def _chapter_only_filter(
        self, chapter: Optional[str], as_integer: bool = True
    ) -> Optional[Filter]:
        if not chapter:
            return None
        return Filter(
            must=[
                FieldCondition(
                    key="chapter",
                    match=_chapter_match_value(chapter, as_integer=as_integer),
                )
            ]
        )

    def _map_point(self, point) -> Dict:
        payload = point.payload or {}
        return {
            "text": payload.get("text", ""),
            "chapter": str(payload.get("chapter", "")),
            "chunk_id": str(payload.get("chunk_id", "")),
            "title": _title_from_payload(payload),
            "book_id": str(payload.get("book_id", "")),
            "pages": str(payload.get("pages", "")),
            "score": point.score,
        }

    def _legacy_has_data(self) -> bool:
        if not LEGACY_COLLECTION:
            return False
        try:
            info = self.client.get_collection(LEGACY_COLLECTION)
            return (info.points_count or 0) > 0
        except Exception:
            return False

    def _search_tenant(
        self,
        query_vector: List[float],
        school_id: str,
        top_k: int,
        book_id: Optional[str],
        subject: Optional[str],
        class_name: Optional[str],
        chapter: Optional[str] = None,
    ) -> List[Dict]:
        try:
            info = self.client.get_collection(self.collection_name)
            if (info.points_count or 0) == 0:
                return []
        except Exception:
            return []

        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=self._build_filter(
                school_id, book_id, subject, class_name, chapter
            ),
            limit=top_k,
            with_payload=True,
        )
        points = results.points if hasattr(results, "points") else results
        return [self._map_point(point) for point in points]

    def ensure_legacy_payload_indexes(self) -> None:
        if not LEGACY_COLLECTION or not self._legacy_has_data():
            return
        for field in ("chapter",):
            try:
                self.client.create_payload_index(
                    collection_name=LEGACY_COLLECTION,
                    field_name=field,
                    field_schema=PayloadSchemaType.INTEGER,
                )
            except Exception as e:
                message = str(e).lower()
                if "already exists" not in message and "already exist" not in message:
                    print(f"  Legacy payload index note ({field}): {e}")

    def _search_legacy(
        self,
        query_vector: List[float],
        top_k: int,
        chapter: Optional[str] = None,
    ) -> List[Dict]:
        if not LEGACY_COLLECTION:
            return []
        
        try:
            query_filter = None
            
            if chapter:
                try:
                    chapter_int = int(chapter)
                    query_filter = Filter(
                        must=[
                            FieldCondition(
                                key="chapter",
                                match=MatchValue(value=chapter_int)
                            )
                        ]
                    )
                    print(f"  Legacy filter: chapter = {chapter_int} (integer)")
                except ValueError:
                    query_filter = Filter(
                        must=[
                            FieldCondition(
                                key="chapter",
                                match=MatchValue(value=str(chapter))
                            )
                        ]
                    )
                    print(f"  Legacy filter: chapter = {str(chapter)} (string)")
            
            results = self.client.query_points(
                collection_name=LEGACY_COLLECTION,
                query=query_vector,
                query_filter=query_filter,
                limit=top_k,
                with_payload=True,
            )
            
            points = results.points if hasattr(results, "points") else results
            
            if points:
                print(f"  Legacy found {len(points)} points")
                return [self._map_point(point) for point in points]
            else:
                if chapter:
                    print(f"  Trying legacy search without chapter filter...")
                    results_no_filter = self.client.query_points(
                        collection_name=LEGACY_COLLECTION,
                        query=query_vector,
                        query_filter=None,
                        limit=top_k,
                        with_payload=True,
                    )
                    points_no_filter = results_no_filter.points if hasattr(results_no_filter, "points") else results_no_filter
                    
                    if points_no_filter:
                        print(f"  Legacy found {len(points_no_filter)} points (no filter)")
                        return [self._map_point(point) for point in points_no_filter]
                
                print(f"  Legacy found 0 points")
                return []
                
        except Exception as e:
            print(f"Legacy search error: {e}")
            return []

    def search(
        self,
        query_vector: List[float],
        school_id: str,
        top_k: int = 5,
        book_id: Optional[str] = None,
        subject: Optional[str] = None,
        class_name: Optional[str] = None,
        chapter: Optional[str] = None,
    ) -> List[Dict]:
        try:
            results = self._search_tenant(
                query_vector,
                school_id,
                top_k,
                book_id,
                subject,
                class_name,
                chapter,
            )
            if results:
                print(f" Found {len(results)} results in tenant collection")
                return results

            if self._legacy_has_data():
                print(f"  Querying legacy collection: {LEGACY_COLLECTION}")
                
                legacy_results = self._search_legacy(
                    query_vector,
                    top_k,
                    chapter,
                )
                
                if legacy_results:
                    print(f" Found {len(legacy_results)} results in legacy collection")
                    return legacy_results

            return []
        except Exception as e:
            print(f"Search error: {e}")
            return []

    def delete_book_vectors(self, school_id: str, book_id: str) -> None:
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=self._build_filter(school_id, book_id),
            )
            print(f"Deleted vectors for school={school_id} book={book_id}")
        except Exception as e:
            print(f"Error deleting book vectors: {e}")
            raise

    def get_collection_info(self) -> Optional[Dict]:
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "points_count": info.points_count,
                "status": str(info.status),
            }
        except Exception:
            return None

    def ping(self) -> bool:
        try:
            self.client.get_collections()
            return True
        except Exception:
            return False

    def get_legacy_catalog(self) -> List[Dict]:
        if not self._legacy_has_data():
            return []

        chapters: Dict[str, Dict] = {}
        offset = None

        while True:
            points, offset = self.client.scroll(
                collection_name=LEGACY_COLLECTION,
                limit=500,
                offset=offset,
                with_payload=["chapter", "metadata", "title"],
                with_vectors=False,
            )

            for point in points:
                payload = point.payload or {}
                chapter = str(payload.get("chapter", "?"))

                if chapter not in chapters:
                    metadata = payload.get("metadata") or {}
                    source = ""
                    if isinstance(metadata, dict):
                        source = metadata.get("source") or ""

                    chapters[chapter] = {
                        "chapter": chapter,
                        "title": _title_from_payload(payload),
                        "subject": "Computer Science",
                        "class": "6",
                        "source_file": os.path.basename(str(source)) if source else "",
                        "chunks": 0,
                    }

                chapters[chapter]["chunks"] += 1

            if offset is None:
                break

        def sort_key(entry: Dict) -> tuple:
            ch = entry["chapter"]
            return (0, int(ch)) if ch.isdigit() else (1, ch)

        return sorted(chapters.values(), key=sort_key)