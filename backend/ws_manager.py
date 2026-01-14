# ws_manager.py
import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket


@dataclass(frozen=True)
class DbChangeEvent:
    type: str  # "db_change"
    entity: str  # "exercise" | "template" | ...
    action: str  # "upsert" | "delete"
    id: str
    updated_at: str  # ISO string
    payload: Optional[Dict[str, Any]] = None


class WSManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._user_sockets: Dict[str, Set[WebSocket]] = {}
        # Optional: dedup repeated sends in a short window (prevents double-notify)
        self._recent: Dict[str, float] = {}  # key -> ts
        self._recent_ttl_sec = 2.0

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._user_sockets.setdefault(user_id, set()).add(ws)

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            sockets = self._user_sockets.get(user_id)
            if sockets and ws in sockets:
                sockets.remove(ws)
            if sockets and len(sockets) == 0:
                self._user_sockets.pop(user_id, None)

    async def send(self, user_id: str, event: Dict[str, Any]) -> None:
        # small dedup window
        key = f"{user_id}:{event.get('type')}:{event.get('entity')}:{event.get('action')}:{event.get('id')}:{event.get('updated_at')}"
        now = time.time()
        last = self._recent.get(key)
        if last and (now - last) < self._recent_ttl_sec:
            return
        self._recent[key] = now

        async with self._lock:
            sockets = list(self._user_sockets.get(user_id, set()))

        if not sockets:
            return

        msg = json.dumps(event, default=str)

        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)

        # cleanup dead sockets
        if dead:
            async with self._lock:
                cur = self._user_sockets.get(user_id, set())
                for ws in dead:
                    cur.discard(ws)
                if len(cur) == 0:
                    self._user_sockets.pop(user_id, None)


ws_manager = WSManager()
