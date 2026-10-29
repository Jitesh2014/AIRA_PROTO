import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

load_dotenv()

# Connect to Qdrant
client = QdrantClient(
    url=os.getenv("QDRANT_CLOUD_URL"),
    api_key=os.getenv("QDRANT_API_KEY")
)

# Load model
model = SentenceTransformer("BAAI/bge-m3")

# Query
query = "loops"
query_vector = model.encode([query], normalize_embeddings=True)[0]

# Search legacy collection
try:
    results = client.query_points(
        collection_name="grade6_computer_science",
        query=query_vector.tolist(),
        limit=10,
        with_payload=True,
    )
    points = results.points if hasattr(results, "points") else results
    print(f" Found {len(points)} results in Qdrant")
    for p in points[:3]:
        print(f"  - {p.payload.get('title', 'N/A')} (Ch. {p.payload.get('chapter', 'N/A')})")
except Exception as e:
    print(f" Error: {e}")