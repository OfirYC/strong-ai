import json
from datetime import datetime
from typing import Dict, Any, List

from bson import ObjectId

from .base import BaseTool
from constants import EXERCISE_KIND_RULES
from models import ExerciseCreate
from body_parts import MUSCLE_MAP, get_all_descendants


EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())

# Precomputed: slug display name (lower) → list of matching slugs (slug + all descendants)
# Used to match a search query like "chest" or "quads" against muscle_loads
_SLUG_SEARCH_MAP: Dict[str, List[str]] = {}
for _slug, _node in MUSCLE_MAP.items():
    _key = _node["name"].lower()
    _slugs = [_slug] + get_all_descendants(_slug)
    _SLUG_SEARCH_MAP.setdefault(_key, []).extend(_slugs)
    # also index by slug itself
    _SLUG_SEARCH_MAP.setdefault(_slug, []).extend(_slugs)


def _muscle_slugs_for_query(query: str) -> List[str]:
    """Return all muscle slugs that match a query string (name or slug prefix)."""
    q = query.lower().strip()
    matches: List[str] = []
    for key, slugs in _SLUG_SEARCH_MAP.items():
        if q in key or key in q:
            matches.extend(slugs)
    return list(set(matches))
DEFAULT_EXERCISE_KIND = (
    "Machine/Other"
    if "Machine/Other" in EXERCISE_KIND_RULES
    else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
)


# ==============================
# LLM-FACING SAFE SEARCH TOOL
# ==============================

class ExerciseSearch(BaseTool):
    name = "exercise__search"
    description = (
        "Search exercises by name or body part. "
        "Returns a small list of matching exercises for selection. "
        "Use this instead of fetching all exercises."
    )

    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search term (exercise name or body part)"
            },
            "limit": {
                "type": "integer",
                "description": "Max results (default 20, max 50)",
                "default": 20
            }
        },
        "required": ["query"]
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        query = (args.get("query") or "").strip()
        if not query:
            return json.dumps({"error": "query is required"})

        limit = min(max(int(args.get("limit", 20)), 1), 50)

        base_query: Dict[str, Any] = {
            "$and": [
                {
                    "$or": [
                        {"user_id": {"$exists": False}},
                        {"user_id": None},
                        {"user_id": user_id},
                    ]
                },
                {
                    "$or": [
                        {"name": {"$regex": query, "$options": "i"}},
                        {"muscle_loads.slug": {"$in": _muscle_slugs_for_query(query)}},
                    ]
                },
            ]
        }

        exercises = await db.exercises.find(base_query).to_list(limit)

        items = [
            {
                "id": str(ex["_id"]),
                "name": ex.get("name"),
                "exercise_kind": ex.get("exercise_kind"),
                "category": ex.get("category"),
                "muscle_loads": [
                    {"slug": ml["slug"], "role": ml["role"]}
                    for ml in (ex.get("muscle_loads") or [])[:5]
                    if ml.get("slug")
                ],
            }
            for ex in exercises
        ]

        return json.dumps({
            "returned": len(items),
            "items": items
        })


# ===================================
# SAFE DETAIL FETCH (OPT-IN DETAILS)
# ===================================

class ExerciseGetByIds(BaseTool):
    name = "exercise__get_by_ids"
    description = (
        "Fetch specific exercises by ID. "
        "By default returns minimal fields. "
        "Set include_instructions=true only if detailed instructions are required."
    )

    parameters = {
        "type": "object",
        "properties": {
            "ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Exercise IDs to fetch (max 50)"
            },
            "include_instructions": {
                "type": "boolean",
                "description": "Include instructions field",
                "default": False
            }
        },
        "required": ["ids"]
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]

        raw_ids = args.get("ids", [])[:50]  # HARD CAP
        include_instructions = bool(args.get("include_instructions", False))

        object_ids = []
        for i in raw_ids:
            try:
                object_ids.append(ObjectId(i))
            except Exception:
                continue

        if not object_ids:
            return json.dumps({"error": "No valid IDs provided"})

        exercises = await db.exercises.find(
            {"_id": {"$in": object_ids}}
        ).to_list(len(object_ids))

        items = []

        for ex in exercises:
            item = {
                "id": str(ex["_id"]),
                "name": ex.get("name"),
                "exercise_kind": ex.get("exercise_kind"),
                "category": ex.get("category"),
                "muscle_loads": [
                    {"slug": ml["slug"], "role": ml["role"]}
                    for ml in (ex.get("muscle_loads") or [])[:5]
                    if ml.get("slug")
                ],
            }

            if include_instructions:
                item["instructions"] = ex.get("instructions")

            items.append(item)

        return json.dumps({"items": items})


# ===================================
# CREATION TOOL (SAFE ALREADY)
# ===================================

class ExerciseCreateBatch(BaseTool):
    name = "exercise__create_batch"
    description = (
        "Create multiple new exercises at once. "
        "Use this to create ALL missing exercises in a single call."
    )

    parameters = {
        "type": "object",
        "properties": {
            "exercises": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "exercise_kind": {"type": "string", "enum": EXERCISE_KIND_ENUM},
                        "category": {"type": "string"},
                        "instructions": {"type": "string"},
                        "muscle_loads": {
                            "type": "array",
                            "description": "Muscle loads for this exercise. Use slugs from the MUSCLE LOADS section in your system prompt.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "slug": {"type": "string", "description": "Muscle slug from the MUSCLE_TREE"},
                                    "role": {"type": "string", "enum": ["primary", "secondary", "stabilizer"]},
                                    "load_pct": {"type": "number", "description": "0–100, contribution within this role"},
                                },
                                "required": ["slug", "role", "load_pct"],
                            },
                        },
                    },
                    "required": ["name", "exercise_kind"],
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

            existing = await db.exercises.find_one(
                {"name": {"$regex": f"^{name}$", "$options": "i"}}
            )

            if existing:
                results.append({
                    "name": name,
                    "id": str(existing["_id"]),
                    "status": "exists"
                })
                continue

            exercise_create = ExerciseCreate(
                name=name,
                exercise_kind=exercise_kind,
                category=ex_data.get("category", "Strength"),
                instructions=ex_data.get("instructions"),
                muscle_loads=ex_data.get("muscle_loads") or [],
                is_custom=True,
            )
            exercise_doc = exercise_create.model_dump(exclude={"id"})
            exercise_doc["user_id"] = user_id
            exercise_doc["created_at"] = datetime.utcnow()

            insert_res = await db.exercises.insert_one(exercise_doc)

            results.append({
                "name": name,
                "id": str(insert_res.inserted_id),
                "status": "created"
            })

        return json.dumps({
            "success": True,
            "exercises": results,
            "processed": len(results)
        })