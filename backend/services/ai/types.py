# services/ai/types.py
from typing import Literal, Dict, Any, List
from pydantic import BaseModel
from datetime import datetime

AIEventType = Literal[
    "assistant_token",
    "assistant_message",
    "tool_start",
    "tool_result",
    "tool_error",
    "done",
    "error"
]


class AIEvent(BaseModel):
    job_id: str
    type: AIEventType
    payload: Dict[str, Any]
    created_at: datetime
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
