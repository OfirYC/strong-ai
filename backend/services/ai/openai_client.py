# services/ai/openai_client.py

import os
from pathlib import Path
from dotenv import load_dotenv
from openai import AsyncOpenAI
from services.ai.config import DEFAULT_MODEL, DEFAULT_TEMPERATURE

ROOT_DIR = Path(__file__).parent.parent.parent
load_dotenv(ROOT_DIR / ".env")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY is required")

client = AsyncOpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL
)

# ---------------------------------------------------
# Streaming Chat
# ---------------------------------------------------

async def stream_chat(messages: list, tools: list):
    """
    Returns an async generator of streaming chat chunks.
    Compatible with runner.
    """

    return await client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=messages,
        tools=tools,
        temperature=DEFAULT_TEMPERATURE,
        stream=True,
    )
