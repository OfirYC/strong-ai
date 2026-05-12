# services/ai/tools/notes_tools.py

from datetime import datetime
from typing import Any, Dict

from bson import ObjectId

from services.ai.tools.base import BaseTool
from services.ai.embeddings import embed_text, cosine_similarity, VECTOR_SEARCH_ENABLED


class CreateNoteTool(BaseTool):
    name = "create_note"
    description = (
        "Save an observation or insight about the user to long-term memory. "
        "Use when you learn something meaningful: injuries, goals, preferences, "
        "training patterns, PRs, or anything worth remembering across sessions. "
        "Be concise and factual."
    )
    parameters = {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The note content. Max 300 chars.",
            },
            "tag": {
                "type": "string",
                "enum": ["goal", "injury", "preference", "observation", "other"],
                "description": "Category tag for the note.",
            },
        },
        "required": ["content"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db      = ctx["db"]
        user_id = ctx["user_id"]
        now     = datetime.utcnow()
        content = args["content"][:300].strip()

        result = await db.notes.insert_one({
            "user_id":    user_id,
            "content":    content,
            "writer":     "ai",
            "tag":        args.get("tag"),
            "created_at": now,
            "updated_at": now,
        })

        if VECTOR_SEARCH_ENABLED:
            try:
                vector = await embed_text(content)
                await db.notes.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"embedding": vector}},
                )
            except Exception:
                pass

        return f"Note created: {result.inserted_id}"


class UpdateNoteTool(BaseTool):
    name = "update_note"
    description = (
        "Update an existing AI note when information changes or needs correction. "
        "Use list_notes first to get the note ID."
    )
    parameters = {
        "type": "object",
        "properties": {
            "note_id": {
                "type": "string",
                "description": "The _id of the note to update.",
            },
            "content": {
                "type": "string",
                "description": "New content for the note.",
            },
            "tag": {
                "type": "string",
                "enum": ["goal", "injury", "preference", "observation", "other"],
            },
        },
        "required": ["note_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db      = ctx["db"]
        user_id = ctx["user_id"]

        note_id = args.get("note_id", "")
        if not ObjectId.is_valid(note_id):
            return "Error: invalid note_id"

        updates: Dict[str, Any] = {"updated_at": datetime.utcnow()}
        if "content" in args:
            updates["content"] = args["content"][:300].strip()
        if "tag" in args:
            updates["tag"] = args["tag"]

        result = await db.notes.update_one(
            {"_id": ObjectId(note_id), "user_id": user_id, "writer": "ai"},
            {"$set": updates},
        )
        if result.matched_count == 0:
            return f"Error: note {note_id} not found or not an AI note"

        if VECTOR_SEARCH_ENABLED and "content" in updates:
            try:
                vector = await embed_text(updates["content"])
                await db.notes.update_one(
                    {"_id": ObjectId(note_id)},
                    {"$set": {"embedding": vector}},
                )
            except Exception:
                pass

        return f"Note {note_id} updated."


class DeleteNoteTool(BaseTool):
    name = "delete_note"
    description = (
        "Delete an AI note that is no longer relevant or accurate. "
        "Only AI-authored notes can be deleted by the AI."
    )
    parameters = {
        "type": "object",
        "properties": {
            "note_id": {
                "type": "string",
                "description": "The _id of the note to delete.",
            },
        },
        "required": ["note_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db      = ctx["db"]
        user_id = ctx["user_id"]

        note_id = args.get("note_id", "")
        if not ObjectId.is_valid(note_id):
            return "Error: invalid note_id"

        result = await db.notes.delete_one(
            {"_id": ObjectId(note_id), "user_id": user_id, "writer": "ai"},
        )
        if result.deleted_count == 0:
            return f"Error: note {note_id} not found or not an AI note"
        return f"Note {note_id} deleted."


class SearchNotesTool(BaseTool):
    name = "search_notes"
    description = (
        "Search your memory for notes relevant to a topic or query. "
        "Use this proactively before answering anything that could be informed by "
        "past context: training history, preferences, injuries, goals, observations. "
        "Prefer this over list_notes when you have a specific topic in mind."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Keywords or phrase to search note content for.",
            },
            "tags": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["goal", "injury", "preference", "observation", "other"],
                },
                "description": "Optional: filter to specific tag(s).",
            },
            "limit": {
                "type": "integer",
                "description": "Max notes to return (default 10).",
                "default": 10,
            },
        },
        "required": ["query"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        query = args.get("query", "").strip()
        tags = args.get("tags")
        limit = min(int(args.get("limit", 10)), 30)

        docs = []

        if query:
            try:
                query_vector = await embed_text(query)

                if VECTOR_SEARCH_ENABLED:
                    # --- Atlas $vectorSearch (production) -------------------
                    pre_filter: Dict[str, Any] = {"user_id": {"$eq": user_id}}
                    if tags:
                        pre_filter["tag"] = {"$in": tags}
                    pipeline = [
                        {
                            "$vectorSearch": {
                                "index": "notes_embedding",
                                "path": "embedding",
                                "queryVector": query_vector,
                                "numCandidates": limit * 5,
                                "limit": limit,
                                "filter": pre_filter,
                            }
                        }
                    ]
                    docs = await db.notes.aggregate(pipeline).to_list(limit)
                else:
                    # --- Python cosine similarity (local dev) ---------------
                    mongo_filter: Dict[str, Any] = {"user_id": user_id}
                    if tags:
                        mongo_filter["tag"] = {"$in": tags}
                    candidates = await db.notes.find(mongo_filter).to_list(500)
                    scored = [
                        (cosine_similarity(query_vector, d["embedding"]), d)
                        for d in candidates
                        if d.get("embedding")
                    ]
                    scored.sort(key=lambda x: x[0], reverse=True)
                    docs = [d for _, d in scored[:limit]]
            except Exception:
                pass  # fall through to text search

        # --- text-search fallback (no embeddings yet) -----------------------
        if not docs:
            mongo_filter = {"user_id": user_id}
            if tags:
                mongo_filter["tag"] = {"$in": tags}
            if query:
                mongo_filter["content"] = {"$regex": query, "$options": "i"}
            docs = await db.notes.find(mongo_filter).sort("created_at", -1).to_list(limit)

        # If still empty and we had both query+tags, relax to tags-only
        if not docs and query and tags:
            docs = await db.notes.find(
                {"user_id": user_id, "tag": {"$in": tags}}
            ).sort("created_at", -1).to_list(limit)

        if not docs:
            return f"No notes found matching '{query}'."

        lines = [
            f"[{d['_id']}] tag={d.get('tag') or 'none'} ({d.get('writer','?')}) — {d.get('content','')[:200]}"
            for d in docs
        ]
        return "\n".join(lines)


class ListNotesTool(BaseTool):
    name = "list_notes"
    description = (
        "List all notes. Use search_notes instead when you have a specific topic. "
        "Useful before update_note or delete_note to get valid IDs."
    )
    parameters = {
        "type": "object",
        "properties": {
            "tag": {
                "type": "string",
                "enum": ["goal", "injury", "preference", "observation", "other"],
                "description": "Optional: filter by tag.",
            },
        },
        "required": [],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db      = ctx["db"]
        user_id = ctx["user_id"]

        mongo_filter: Dict[str, Any] = {"user_id": user_id}
        if args.get("tag"):
            mongo_filter["tag"] = args["tag"]

        docs = await db.notes.find(mongo_filter).sort("created_at", -1).to_list(50)

        if not docs:
            return "No notes found."

        lines = [
            f"[{d['_id']}] ({d.get('writer','?')}) "
            f"tag={d.get('tag') or 'none'} — {d.get('content','')[:120]}"
            for d in docs
        ]
        return "\n".join(lines)