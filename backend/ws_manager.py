# ws_manager.py
import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Set
from collections import defaultdict
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
        self._job_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        # Optional: dedup repeated sends in a short window (prevents double-notify)
        self._recent: Dict[str, float] = {}  # key -> ts
        self._recent_ttl_sec = 2.0

    # -------------------------
    # User sockets
    # -------------------------
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
        key = (
            f"{user_id}:{event.get('type')}:{event.get('entity')}:"
            f"{event.get('action')}:{event.get('id')}:{event.get('updated_at')}"
        )
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
            except Exception as e:
                print(f"WSManager: Failed to send to ws: {e}")
                dead.append(ws)

        # cleanup dead sockets
        if dead:
            async with self._lock:
                cur = self._user_sockets.get(user_id, set())
                for ws in dead:
                    cur.discard(ws)
                if len(cur) == 0:
                    self._user_sockets.pop(user_id, None)

    # -------------------------
    # Job sockets (your existing API)
    # -------------------------
    async def register_job_socket(self, job_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._job_connections[job_id].add(ws)

    async def unregister_job_socket(self, job_id: str, ws: WebSocket) -> None:
        print(f"WSManager: Unregistering job socket for job_id={job_id}")
        async with self._lock:
            sockets = self._job_connections.get(job_id)
            if sockets:
                sockets.discard(ws)
                if not sockets:
                    self._job_connections.pop(job_id, None)

    async def broadcast_job(self, job_id: str, event: dict) -> None:
        async with self._lock:
            sockets = list(self._job_connections.get(job_id, set()))

        if not sockets:
            print(f"WSManager: No sockets to broadcast for job_id={job_id}", self._job_connections)
            return

        dead: list[WebSocket] = []

        for ws in sockets:
            try:
                await ws.send_text(json.dumps(event, default=str))
            except Exception as e:
                print(f"WSManager: send_json failed for job_id={job_id}: {type(e).__name__}: {e}")
                dead.append(ws)

        if dead:
            async with self._lock:
                cur = self._job_connections.get(job_id, set())
                for ws in dead:
                    cur.discard(ws)
                if not cur:
                    self._job_connections.pop(job_id, None)

    # -------------------------
    # Aliases to match server.py expectations
    # server.py calls: connect_job / disconnect_job
    # AIEmitter should call: emit_to_job
    # -------------------------
    async def connect_job(self, job_id: str, ws: WebSocket) -> None:
        # Your /ws/ai/jobs/{job_id} endpoint expects this to accept() too.
        await ws.accept()
        print(f"WSManager: Registering job socket for job_id={job_id}")
        await self.register_job_socket(job_id, ws)
        print(f"WSManager: Registered job socket for job_id={job_id}", self._job_connections)

    async def disconnect_job(self, job_id: str, ws: WebSocket) -> None:
        print(f"WSManager: Unregistering job socket for job_id={job_id}")
        await self.unregister_job_socket(job_id, ws)

    async def emit_to_job(self, job_id: str, event: dict) -> None:
        await self.broadcast_job(job_id, event)


ws_manager = WSManager()