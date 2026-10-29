from typing import Dict, List

import numpy as np
from sentence_transformers import SentenceTransformer
from tqdm import tqdm


class Embedder:
    def __init__(self, model_name: str = "BAAI/bge-m3"):
        print(f"Loading embedding model: {model_name}")
        self.model = SentenceTransformer(model_name)
        self.dimension = 1024

    def embed_chunks(self, chunks: List[Dict], batch_size: int = 32) -> List[Dict]:
        texts = [chunk["text"] for chunk in chunks]
        print(f"Generating embeddings for {len(texts)} chunks...")
        embeddings = []

        for i in tqdm(range(0, len(texts), batch_size)):
            batch = texts[i : i + batch_size]
            batch_embeddings = self.model.encode(batch, normalize_embeddings=True)
            embeddings.extend(batch_embeddings)

        for chunk, emb in zip(chunks, embeddings):
            chunk["embedding"] = emb.tolist()

        return chunks

    def embed_query(self, query: str) -> np.ndarray:
        return self.model.encode([query], normalize_embeddings=True)[0]
