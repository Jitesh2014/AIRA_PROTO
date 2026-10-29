import redis
import json
import hashlib
from typing import List, Dict, Optional
import os

class RedisCache:
    def __init__(self):
        self.ttl = 3600  # 1 hour
        self.client = None
        self._connect()
    
    def _connect(self):
        """Connect to Redis (Cloud or Local)"""
        try:
            redis_url = os.getenv("REDIS_URL")
            if redis_url:
                self.client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=10,
                    socket_timeout=10
                )
                self.client.ping()
                print(f"Redis cache connected — {redis_url}")
                return
            
            self.client = redis.Redis(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", 6379)),
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            self.client.ping()
            print("Redis cache connected — local")
            
        except Exception as e:
            print(f"Redis cache not available: {e}")
            self.client = None
    
    def is_connected(self) -> bool:
        return self.client is not None
    

    
    def get_rag_results(self, cache_key: str) -> Optional[List[Dict]]:
        """Get cached RAG results by cache key"""
        if not self.client:
            return None
        
        try:
            key = f"rag:{cache_key}"
            cached = self.client.get(key)
            if cached:
                print(f" RAG Cache hit: {cache_key[:20]}...")
                return json.loads(cached)
            else:
                print(f" RAG Cache miss: {cache_key[:20]}...")
                return None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    
    def set_rag_results(self, cache_key: str, results: List[Dict]):
        """Cache RAG results by cache key"""
        if not self.client:
            return
        
        try:
            key = f"rag:{cache_key}"
            self.client.setex(key, self.ttl, json.dumps(results))
            print(f" Cached RAG results: {len(results)} chunks")
        except Exception as e:
            print(f"Cache set error: {e}")
    
    def get_llm_answer(self, query: str) -> Optional[str]:
        """Get cached LLM answer"""
        if not self.client:
            return None
        
        try:
            key = self._get_key(query, "answer")
            cached = self.client.get(key)
            if cached:
                if not cached.startswith('Error') and not cached.startswith('API Error'):
                    print(f"Answer Cache hit")
                    return cached
                else:
                    self.client.delete(key)
                    return None
        except:
            pass
        return None
    
    def set_llm_answer(self, query: str, answer: str):
        """Cache LLM answer"""
        if not self.client:
            return
        
        if answer.startswith('Error') or answer.startswith('API Error') or 'error' in answer.lower():
            return
        
        try:
            key = self._get_key(query, "answer")
            self.client.setex(key, self.ttl, answer)
            print(f" Cached LLM answer")
        except:
            pass
    
    def _get_key(self, query: str, prefix: str = "rag") -> str:
        """Generate cache key"""
        query_hash = hashlib.md5(query.encode()).hexdigest()
        return f"{prefix}:query:{query_hash}"
    
    def get_cache_stats(self):
        """Get cache statistics"""
        if not self.client:
            return {"status": "disconnected", "total": 0}
        
        try:
            keys = self.client.keys("*")
            rag_keys = [k for k in keys if k.startswith("rag:")]
            answer_keys = [k for k in keys if k.startswith("answer:")]
            return {
                "status": "connected",
                "rag_cache": len(rag_keys),
                "answer_cache": len(answer_keys),
                "total": len(keys)
            }
        except:
            return {"status": "error", "total": 0}
    
    def clear_all(self):
        """Clear all cache"""
        if not self.client:
            return
        
        try:
            keys = self.client.keys("*")
            if keys:
                self.client.delete(*keys)
                print(f" Cleared {len(keys)} cache entries")
        except:
            pass