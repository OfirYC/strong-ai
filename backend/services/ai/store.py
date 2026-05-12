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


def format_messages_for_api(msgs):
    return [
        {
            "id": str(m["_id"]),
            "conversation_id": str(m["conversation_id"]),
            "role": m["role"],
            "content": m.get("content"),
            "tool_calls": m.get("tool_calls"),
            "tool_call_id": m.get("tool_call_id"),
            "created_at": m["created_at"],
        }
        for m in msgs
    ]


async def fetch_messages_formatted(
    db, user_id: str, conversation_id: str, limit: int = 200
):
    cur = (
        db.chat_messages.find(
            {
                "conversation_id": ObjectId(conversation_id),
                "user_id": ObjectId(user_id),
            }
        )
        .sort("created_at", 1)
        .limit(limit)
    )
    return format_messages_for_api(await cur.to_list(length=limit))


async def build_notes_context(db, user_id: str, max_chars: int = 400) -> str:
    """
    Inject only always-relevant notes (injuries + active goals) into every
    system prompt. Everything else is retrieved on demand via search_notes.
    """
    docs = await db.notes.find(
        {"user_id": user_id, "tag": {"$in": ["injury", "goal"]}}
    ).sort("created_at", -1).to_list(30)

    if not docs:
        return ""

    lines = []
    for d in docs:
        tag = d.get("tag", "")
        content = d.get("content", "").strip()
        writer = d.get("writer", "user")
        prefix = "AI" if writer == "ai" else "User"
        if len(content) > 200:
            content = content[:197] + "…"
        lines.append(f"[{tag}][{prefix}] {content}")

    block = "\n".join(lines)
    if len(block) > max_chars:
        block = block[: max_chars - 3] + "…"

    return f"<critical_notes>\n{block}\n</critical_notes>"
