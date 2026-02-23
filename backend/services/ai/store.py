from datetime import datetime
from bson import ObjectId


async def create_conversation(db, user_id: str, title: str = "AI Coach"):
    now = datetime.utcnow()
    doc = {
        "user_id": ObjectId(user_id),
        "title": title,
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "active_job_id": None,
    }
    res = await db.conversations.insert_one(doc)
    return str(res.inserted_id)


async def touch_conversation(db, conversation_id: str, job_id: str | None = None):
    now = datetime.utcnow()
    update = {"updated_at": now, "last_message_at": now}
    if job_id is not None:
        update["active_job_id"] = ObjectId(job_id)
    await db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": update},
    )


async def add_message(
    db,
    user_id: str,
    conversation_id: str,
    role: str,
    content: str,
    tool_call_id: str | None = None,
    tool_name: str | None = None,
    tool_calls: list | None = None,  # 👈 add this
):
    doc = {
        "user_id": ObjectId(user_id),
        "conversation_id": ObjectId(conversation_id),
        "role": role,
        "content": content,
        "tool_call_id": tool_call_id,
        "tool_name": tool_name,
        "tool_calls": tool_calls,  # 👈 persist tool_calls
        "created_at": datetime.utcnow(),
    }
    await db.chat_messages.insert_one(doc)


async def list_messages(db, user_id: str, conversation_id: str, limit: int = 200):
    cur = (
        db.chat_messages.find(
            {"conversation_id": ObjectId(conversation_id), "user_id": ObjectId(user_id)}
        )
        .sort("created_at", 1)
        .limit(limit)
    )
    msgs = await cur.to_list(length=limit)

    # return OpenAI format
    out = []
    for m in msgs:
        d = {"role": m["role"], "content": m.get("content")}

        if m["role"] == "assistant" and m.get("tool_calls"):
            d["tool_calls"] = m["tool_calls"]

        if m["role"] == "tool" and m.get("tool_call_id"):
            d["tool_call_id"] = m["tool_call_id"]
        out.append(d)
    return out
