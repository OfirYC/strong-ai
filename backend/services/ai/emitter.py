# services/ai/emitter.py

from datetime import datetime
from bson import ObjectId


class AIEmitter:
    def __init__(self, db, ws_manager):
        self.db = db
        self.ws_manager = ws_manager

    async def emit(self, job_id: str, type_: str, payload: dict):
        event_doc = {
            "job_id": job_id,
            "type": type_,
            "payload": payload,
            "created_at": datetime.utcnow(),
        }

        # Always broadcast
        await self.ws_manager.broadcast_job(job_id, event_doc)
