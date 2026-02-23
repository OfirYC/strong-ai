import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from bson import ObjectId

from .base import BaseTool
from constants import EXERCISE_KIND_RULES

logger = logging.getLogger(__name__)

EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())
DEFAULT_EXERCISE_KIND = (
    "Machine/Other" if "Machine/Other" in EXERCISE_KIND_RULES else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
)

# Shared set-field parameters used in both template and schedule tools
_SETS_ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "set_type": {
            "type": "string",
            "enum": ["normal", "warmup", "cooldown", "failure"],
            "default": "normal",
        },
        "reps": {"type": "integer"},
        "weight": {"type": "number"},
        "duration": {"type": "number"},
        "distance": {"type": "number"},
        "rest_timer": {
            "type": "integer",
            "description": "Optional rest time in seconds after this set.",
        },
    },
}

_EXERCISES_ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "exercise_id": {"type": "string"},
        "sets": {
            "type": "array",
            "description": "Array of set objects. Each set has set_type, reps, weight, duration, distance, rest_timer as needed.",
            "items": _SETS_ITEMS_SCHEMA,
        },
        "reps": {"type": "integer", "description": "Optional default reps per set."},
        "weight": {"type": "number", "description": "Optional default weight in kg."},
        "duration": {"type": "number", "description": "Optional default duration in seconds."},
        "distance": {"type": "number", "description": "Optional default distance in km."},
        "notes": {"type": "string"},
    },
    "required": ["exercise_id", "sets"],
}


# ---------------------------------------------------------------------------
# Helpers (shared with schedule tools)
# ---------------------------------------------------------------------------

async def get_exercise_kind_map(exercise_ids: List[str], db, user_id: str) -> Dict[str, str]:
    valid_oids = [ObjectId(eid) for eid in exercise_ids if ObjectId.is_valid(eid)]
    kind_map: Dict[str, str] = {}
    if not valid_oids:
        return kind_map

    query = {
        "_id": {"$in": valid_oids},
        "$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": user_id}],
    }
    docs = await db.exercises.find(query).to_list(len(valid_oids))
    for d in docs:
        kind_map[str(d["_id"])] = d.get("exercise_kind") or DEFAULT_EXERCISE_KIND
    return kind_map


def normalize_set_fields_by_kind(
    kind: str,
    reps: Optional[int],
    weight: Optional[float],
    duration: Optional[float],
    distance: Optional[float],
) -> Dict[str, Any]:
    kind = kind or DEFAULT_EXERCISE_KIND
    if kind not in EXERCISE_KIND_RULES:
        kind = DEFAULT_EXERCISE_KIND

    allowed = set((EXERCISE_KIND_RULES.get(kind) or {}).get("fields", []) or [])
    out: Dict[str, Any] = {}

    if "reps" in allowed:
        out["reps"] = int(reps) if reps is not None else 10
    if "weight" in allowed and weight is not None:
        out["weight"] = float(weight)
    if "duration" in allowed and duration is not None:
        out["duration"] = float(duration)
    if "distance" in allowed and distance is not None:
        out["distance"] = float(distance)

    is_time_or_distance_only = (("duration" in allowed) or ("distance" in allowed)) and ("reps" not in allowed)
    if is_time_or_distance_only and ("duration" not in out and "distance" not in out):
        out["duration"] = 600.0 if "distance" in allowed else 30.0

    if not out:
        out = {"reps": int(reps) if reps is not None else 10}
        if weight is not None:
            out["weight"] = float(weight)

    return out


async def build_template_exercises_from_compact(
    exercises: List[Dict[str, Any]],
    db,
    user_id: str,
) -> List[Dict[str, Any]]:
    ex_ids = [e.get("exercise_id") for e in exercises if e.get("exercise_id")]
    kind_map = await get_exercise_kind_map(ex_ids, db, user_id)

    template_exercises: List[Dict[str, Any]] = []

    for i, ex in enumerate(exercises):
        ex_id = ex.get("exercise_id")
        if not ex_id:
            continue

        kind = kind_map.get(ex_id) or DEFAULT_EXERCISE_KIND
        if kind not in EXERCISE_KIND_RULES:
            kind = DEFAULT_EXERCISE_KIND

        raw_sets = ex.get("sets")
        notes = ex.get("notes")
        sets_arr: List[Dict[str, Any]] = []

        if isinstance(raw_sets, list):
            for set_item in raw_sets:
                if not isinstance(set_item, dict):
                    continue
                set_type = set_item.get("set_type", "normal")
                if set_type not in ("normal", "warmup", "cooldown", "failure"):
                    set_type = "normal"
                rest_timer = set_item.get("rest_timer")
                normalized = normalize_set_fields_by_kind(
                    kind,
                    set_item.get("reps"),
                    set_item.get("weight"),
                    set_item.get("duration"),
                    set_item.get("distance"),
                )
                set_dict: Dict[str, Any] = {"set_type": set_type, **normalized}
                if rest_timer is not None:
                    try:
                        set_dict["rest_timer"] = int(rest_timer)
                    except (TypeError, ValueError):
                        set_dict["rest_timer"] = None
                sets_arr.append(set_dict)

            if not sets_arr:
                sets_arr = _default_sets(kind)
        else:
            sets_arr = _default_sets(kind)

        first_set = sets_arr[0] if sets_arr else {}
        template_exercises.append(
            {
                "exercise_id": ex_id,
                "order": i,
                "sets": sets_arr,
                "notes": notes,
                "default_sets": len(sets_arr),
                "default_reps": first_set.get("reps"),
                "default_weight": first_set.get("weight"),
                "default_duration": first_set.get("duration"),
                "default_distance": first_set.get("distance"),
            }
        )

    return template_exercises


def _default_sets(kind: str) -> List[Dict[str, Any]]:
    rule_fields = set((EXERCISE_KIND_RULES.get(kind) or {}).get("fields", []) or [])
    is_time_or_distance_only = (("duration" in rule_fields) or ("distance" in rule_fields)) and ("reps" not in rule_fields)
    num_sets = 1 if is_time_or_distance_only else 3
    base_fields = normalize_set_fields_by_kind(kind, None, None, None, None)
    return [{"set_type": "normal", "rest_timer": None, **base_fields} for _ in range(num_sets)]


# ---------------------------------------------------------------------------
# Tool classes
# ---------------------------------------------------------------------------

class TemplateGetAll(BaseTool):
    name = "template__get_all"
    description = "Fetch the user's existing workout templates (reusable routines)."
    parameters = {"type": "object", "properties": {}, "required": []}

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        templates = await db.templates.find({"user_id": user_id}).to_list(200)
        result = []
        for t in templates:
            result.append(
                {
                    "id": str(t["_id"]),
                    "name": t.get("name"),
                    "notes": t.get("notes"),
                    "exercise_count": len(t.get("exercises", [])),
                    "exercise_ids": [e.get("exercise_id") for e in t.get("exercises", []) if e.get("exercise_id")],
                }
            )
        return json.dumps(result)


class TemplateCreate(BaseTool):
    name = "template__create"
    description = (
        "Create a reusable workout TEMPLATE only (no scheduling). "
        "Use this when user wants a routine to do 'by feel' / 2-3x/week without fixed days "
        "or wants a quick-start routine saved in their library.\n\n"
        "IMPORTANT: Set fields must match exercise_kind via system rules."
    )
    parameters = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Template name"},
            "notes": {"type": "string", "description": "Template notes/instructions"},
            "exercises": {
                "type": "array",
                "description": "Ordered exercise list. Each exercise must have 'sets' as an array of set objects",
                "items": _EXERCISES_ITEMS_SCHEMA,
            },
        },
        "required": ["name", "exercises"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        name = (args.get("name") or "").strip()
        exercises = args.get("exercises", []) or []
        notes = args.get("notes") or "Created by AI Coach"

        if not name or not exercises:
            return json.dumps({"error": "name and exercises are required"})

        template_exercises = await build_template_exercises_from_compact(exercises, db, user_id)
        if not template_exercises:
            return json.dumps({"error": "No valid exercises provided"})

        template_doc = {
            "user_id": user_id,
            "name": name,
            "notes": notes,
            "exercises": template_exercises,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        insert_res = await db.templates.insert_one(template_doc)
        return json.dumps({"success": True, "template_id": str(insert_res.inserted_id), "message": "Template created"})


class TemplateUpdate(BaseTool):
    name = "template__update"
    description = (
        "Update a TEMPLATE (affects all future schedules using it). "
        "Only use if user explicitly wants to change the template itself."
    )
    parameters = {
        "type": "object",
        "properties": {
            "template_id": {"type": "string"},
            "name": {"type": "string"},
            "notes": {"type": "string"},
            "exercises": {
                "type": "array",
                "description": "REPLACES the whole template exercise list. Each exercise must provide 'sets' as an array of set objects.",
                "items": _EXERCISES_ITEMS_SCHEMA,
            },
        },
        "required": ["template_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        template_id = args.get("template_id")
        if not template_id or not ObjectId.is_valid(template_id):
            return json.dumps({"error": "Valid template_id is required"})
        oid = ObjectId(template_id)

        update_fields: Dict[str, Any] = {"updated_at": datetime.utcnow()}
        if args.get("name"):
            update_fields["name"] = args["name"]
        if args.get("notes") is not None:
            update_fields["notes"] = args["notes"]
        if args.get("exercises"):
            update_fields["exercises"] = await build_template_exercises_from_compact(args["exercises"], db, user_id)

        if len(update_fields) == 1:
            return json.dumps({"error": "No fields to update"})

        res = await db.templates.update_one({"_id": oid, "user_id": user_id}, {"$set": update_fields})
        if res.matched_count == 0:
            return json.dumps({"error": "Template not found"})
        return json.dumps({"success": True, "message": "Template updated"})