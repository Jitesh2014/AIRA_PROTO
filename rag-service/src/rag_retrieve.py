from src.text_cleanup import clean_chunk_text, format_context
from src.redis_cache import RedisCache
from src.embedder import Embedder
from src.qdrant_store import QdrantStore
from typing import List, Dict, Optional
import hashlib
import re

class RAGRetriever:
    def __init__(self, use_cloud: bool = True):
        self.embedder = Embedder()
        self.vector_store = QdrantStore(use_cloud=use_cloud)
        self.cache = RedisCache()
        self.vector_store.create_collection(self.embedder.dimension)
    
    
    def _extract_topics(self, query: str) -> List[str]:
        """Extract multiple topics from a query"""
        # Split on commas, and, or, &, Chinese/Japanese commas
        topics = re.split(r',|，|、|\s+and\s+|\s+or\s+|\s*&\s*', query, flags=re.IGNORECASE)
        
        # Clean each topic
        cleaned = []
        stopwords = ['explain', 'describe', 'what is', 'tell me about', 'summarize', 'can you', 'please', 'with suitable examples']
        
        for t in topics:
            t = t.strip().lower()
            # Remove stopwords
            for sw in stopwords:
                t = t.replace(sw, '').strip()
            if t and len(t) > 2:
                cleaned.append(t)
        
        # Limit to first 3 topics
        return cleaned[:3]
    
    def _clean_query(self, query: str) -> str:
        """Clean a single query"""
        query = re.sub(r'^(explain|describe|what is|tell me about|summarize|can you|please)\s+', '', query, flags=re.IGNORECASE)
        query = re.sub(r'chapter\s+\d+', '', query, flags=re.IGNORECASE)
        return query.strip()
    
    def retrieve(self, query: str, school_id: str, top_k: int = 20,
                 book_id: Optional[str] = None, subject: Optional[str] = None,
                 class_name: Optional[str] = None, chapter: Optional[str] = None) -> List[Dict]:
            
        
        
        print(" [RAG] RETRIEVE CALLED")
        print(f" Original query: {query}")
        print(f" School ID: {school_id}")
        print(f" Chapter: {chapter}")
        
        
        # Extract topics
        topics = self._extract_topics(query)
        print(f" Extracted topics: {topics}")
        
        # Use topics or fallback
        search_terms = topics if topics else [self._clean_query(query)]
        print(f" Search terms: {search_terms}")
        
        all_results = []
        for term in search_terms:
            print(f"\n Searching for: '{term}'")
            
            # Generate embedding
            query_vector = self.embedder.embed_query(term)
            print(f" Embedding dimension: {len(query_vector)}")
            
            # Search
            results = self.vector_store.search(
                query_vector=query_vector.tolist(),
                school_id=school_id,
                top_k=top_k,
                book_id=book_id,
                subject=subject,
                class_name=class_name,
                chapter=chapter,
            )
            print(f" Results from search: {len(results)}")
            
            if results:
                print(f"  First result preview: {results[0].get('text', '')[:100]}...")
            
            all_results.extend(results)
        
        # Deduplicate
        seen = set()
        unique = []
        for r in all_results:
            text = r.get("text", "")
            if text and text not in seen:
                seen.add(text)
                unique.append(r)
        
        print(f"\n Final unique results: {len(unique)}")
       
        
        # Cache results (optional)
        #cache_key = hashlib.md5(f"{query}:{school_id}:{chapter}".encode()).hexdigest()
        #self.cache.set_rag_results(cache_key, unique)
        
        return unique[:top_k]
    
    def format_context(self, results: List[Dict], max_sources: int = 5) -> str:
        return format_context(results, max_sources)
    
    def build_summary(self, query: str, results: List[Dict]) -> str:
        if not results:
            return "No relevant information found."
        context = self.format_context(results, max_sources=3)
        return context if context and len(context) > 50 else f"I found information about '{query}' in your textbook."