# services/ai/embeddings.py

import os
from pathlib import Path
from dotenv import load_dotenv
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent.parent.parent
load_dotenv(ROOT_DIR / ".env")

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

# Direct OpenAI key preferred for embeddings; OpenRouter as fallback
_api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
_base_url = None if os.getenv("OPENAI_API_KEY") else os.getenv(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)

_client = AsyncOpenAI(api_key=_api_key, base_url=_base_url)

# Set ATLAS_VECTOR_SEARCH=true in .env when deploying to Atlas
VECTOR_SEARCH_ENABLED = os.getenv("ATLAS_VECTOR_SEARCH", "false").lower() == "true"


async def embed_text(text: str) -> list[float]:
    resp = await _client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text[:8000],
    )
    return resp.data[0].embedding


def cosine_similarity(a: list[float], b: list[float]) -> float:
    import numpy as np
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom else 0.0
