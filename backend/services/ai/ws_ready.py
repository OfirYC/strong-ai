# services/ai/ws_ready.py
import asyncio
from typing import Dict

# job_id -> Event that is set once a websocket connects
JOB_WS_READY: Dict[str, asyncio.Event] = {}

def get_or_create_event(job_id: str) -> asyncio.Event:
    ev = JOB_WS_READY.get(job_id)
    if ev is None:
        ev = asyncio.Event()
        JOB_WS_READY[job_id] = ev
    return ev

def mark_ws_ready(job_id: str) -> None:
    get_or_create_event(job_id).set()

def cleanup(job_id: str) -> None:
    JOB_WS_READY.pop(job_id, None)