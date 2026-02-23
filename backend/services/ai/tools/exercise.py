import json
from datetime import datetime
from typing import Dict, Any, List

from .base import BaseTool
from constants import EXERCISE_KIND_RULES

EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())
DEFAULT_EXERCISE_KIND = (
    "Machine/Other" if "Machine/Other" in EXERCISE_KIND_RULES else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
)


class ExerciseGetAll(BaseTool):
    name = "exercise__get_all"
    description = (
        "Fetch ALL available exercises in ONE call (global + user custom). "
        "Use once, then pick exercise IDs from results. Avoid repeated calls."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Optional fuzzy query to narrow results (name/body part). Empty = all.",
                "default": "",
            },
            "limit": {
                "type": "integer",
                "description": "Max number of exercises to return (safety cap).",
                "default": 800,
            },
        },
        "required": [],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        query = (args.get("query") or "").strip()
        limit = int(args.get("limit", 800) or 800)
        limit = max(1, min(limit, 1500))

        base_query: Dict[str, Any] = {
            "$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": user_id}]
        }

        if query:
            base_query["$and"] = [
                {
                    "$or": [
                        {"name": {"$regex": query, "$options": "i"}},
                        {"primary_body_parts": {"$regex": query, "$options": "i"}},
                        {"secondary_body_parts": {"$regex": query, "$options": "i"}},
                    ]
                }
            ]

        exercises = await db.exercises.find(base_query).to_list(limit)

        result = []
        for ex in exercises:
            result.append(
                {
                    "id": str(ex["_id"]),
                    "name": ex.get("name"),
                    "exercise_kind": ex.get("exercise_kind"),
                    "primary_body_parts": ex.get("primary_body_parts", []),
                    "secondary_body_parts": ex.get("secondary_body_parts", []),
                    "category": ex.get("category"),
                    "instructions": ex.get("instructions"),
                    "image": ex.get("image"),
                }
            )
        return json.dumps(result)


class ExerciseCreateBatch(BaseTool):
    name = "exercise__create_batch"
    description = (
        "Create multiple new exercises at once. Use this to create ALL missing exercises in a single call. "
        "IMPORTANT: choose exercise_kind correctly (Duration vs Cardio vs Reps Only etc). "
        "exercise_kind must be one of the known kinds from the system."
    )
    parameters = {
        "type": "object",
        "properties": {
            "exercises": {
                "type": "array",
                "description": "Array of exercises to create",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "exercise_kind": {"type": "string", "enum": EXERCISE_KIND_ENUM},
                        "primary_body_parts": {"type": "array", "items": {"type": "string"}},
                        "secondary_body_parts": {"type": "array", "items": {"type": "string"}},
                        "category": {
                            "type": "string",
                            "description": "Free text (e.g., Strength, Mobility, Core, Cardio)",
                        },
                        "instructions": {"type": "string", "description": "Optional coaching cues/instructions"},
                        "image": {"type": "string", "description": "Optional image URL"},
                    },
                    "required": ["name", "exercise_kind", "primary_body_parts"],
                },
            }
        },
        "required": ["exercises"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        exercises_to_create = args.get("exercises", []) or []
        if not exercises_to_create:
            return json.dumps({"error": "No exercises provided"})

        results = []
        for ex_data in exercises_to_create:
            name = (ex_data.get("name") or "").strip()
            if not name:
                continue

            exercise_kind = ex_data.get("exercise_kind") or DEFAULT_EXERCISE_KIND
            if exercise_kind not in EXERCISE_KIND_RULES:
                exercise_kind = DEFAULT_EXERCISE_KIND

            existing = await db.exercises.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
            if existing:
                results.append({"name": name, "id": str(existing["_id"]), "status": "exists"})
                continue

            exercise_doc = {
                "name": name,
                "exercise_kind": exercise_kind,
                "primary_body_parts": ex_data.get("primary_body_parts", []) or [],
                "secondary_body_parts": ex_data.get("secondary_body_parts", []) or [],
                "category": ex_data.get("category", "Strength"),
                "instructions": ex_data.get("instructions"),
                "image": ex_data.get("image"),
                "is_custom": True,
                "user_id": user_id,
                "created_at": datetime.utcnow(),
            }
            insert_res = await db.exercises.insert_one(exercise_doc)
            results.append({"name": name, "id": str(insert_res.inserted_id), "status": "created"})

        return json.dumps({"success": True, "exercises": results, "message": f"Processed {len(results)} exercises"})


class ExerciseCreateSingle(BaseTool):
    name = "exercise__create_single"
    description = "Create a single new exercise. Prefer exercise__create_batch when creating multiple."
    parameters = {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "exercise_kind": {"type": "string", "enum": EXERCISE_KIND_ENUM},
            "primary_body_parts": {"type": "array", "items": {"type": "string"}},
            "secondary_body_parts": {"type": "array", "items": {"type": "string"}},
            "category": {"type": "string"},
            "instructions": {"type": "string"},
            "image": {"type": "string"},
        },
        "required": ["name", "exercise_kind", "primary_body_parts"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        name = (args.get("name") or "").strip()
        exercise_kind = args.get("exercise_kind") or DEFAULT_EXERCISE_KIND
        primary_body_parts = args.get("primary_body_parts", []) or []

        if not name or not primary_body_parts:
            return json.dumps({"error": "name and primary_body_parts are required"})

        if exercise_kind not in EXERCISE_KIND_RULES:
            exercise_kind = DEFAULT_EXERCISE_KIND

        existing = await db.exercises.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
        if existing:
            return json.dumps(
                {"exists": True, "id": str(existing["_id"]), "name": existing["name"], "message": "Exercise exists"}
            )

        exercise_doc = {
            "name": name,
            "exercise_kind": exercise_kind,
            "primary_body_parts": primary_body_parts,
            "secondary_body_parts": args.get("secondary_body_parts", []) or [],
            "category": args.get("category", "Strength"),
            "instructions": args.get("instructions"),
            "image": args.get("image"),
            "is_custom": True,
            "user_id": user_id,
            "created_at": datetime.utcnow(),
        }
        insert_res = await db.exercises.insert_one(exercise_doc)
        return json.dumps({"success": True, "id": str(insert_res.inserted_id), "name": name})