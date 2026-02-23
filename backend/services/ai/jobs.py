# services/ai/jobs.py

from datetime import datetime
from bson import ObjectId


async def create_job(db, user_id: str, payload: dict, kind: str = "chat") -> str:
    doc = {
        "user_id": ObjectId(user_id),
        "status": "running",
        "created_at": datetime.utcnow(),
        "input": payload,
        "kind": kind,
        "completed_at": None,
        "conversation_id": ObjectId(payload.get("conversation_id")),
    }
    result = await db.ai_jobs.insert_one(doc)
    return str(result.inserted_id)


async def mark_completed(db, job_id: str):
    await db.ai_jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": "completed", "completed_at": datetime.utcnow()}},
    )


async def mark_failed(db, job_id: str):
    await db.ai_jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": "failed", "completed_at": datetime.utcnow()}},
    )
