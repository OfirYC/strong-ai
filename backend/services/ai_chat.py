"""
AI Chat service with tool support for workout coaching

Key model concepts (user-facing):
- Exercise: a single movement (e.g., Pull-Up, Lat Pulldown, Calf Stretch)
- Template: reusable routine (saved workout plan with ordered exercises + default sets/fields/notes)
- Schedule: calendar entries that reference a template (one-time or recurring)
- Workout History: completed sessions (what the user actually did)

Tool naming convention:
<domain>__<action> or <domain>__<subdomain>__<action>
Only [a-zA-Z0-9_-] allowed (OpenAI function name constraint).

IMPORTANT MODEL ALIGNMENT:
exercise_kind must match DB model (dynamic from EXERCISE_KIND_RULES in constants).
Set fields depend on exercise_kind via EXERCISE_KIND_RULES (dynamic).
"""

import json
import logging
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel
from bson import ObjectId

from constants import EXERCISE_KIND_RULES

# ---------------------------
# Dynamic kind helpers
# ---------------------------

def _format_kind_rules(rules: Dict[str, Dict[str, Any]]) -> str:
    lines: List[str] = []
    for kind in sorted(rules.keys()):
        rule = rules[kind] or {}
        fields = ", ".join(rule.get("fields", []) or [])
        desc = rule.get("description", "") or ""
        lines.append(f"- {kind}: {desc} | fields: {fields}")
    return "\n".join(lines)


EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())

# Stable fallback when unknown kinds appear
DEFAULT_EXERCISE_KIND = (
    "Machine/Other"
    if "Machine/Other" in EXERCISE_KIND_RULES
    else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
)

kind_rules = _format_kind_rules(EXERCISE_KIND_RULES)

# ---------------------------
# Set up logging
# ---------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import existing OpenAI client from ai_profile
from services.ai_profile import client


class ChatMessage(BaseModel):
    """Chat message model"""
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tool_name: Optional[str] = None
    tool_call_id: Optional[str] = None
    # For assistant messages that contain tool_calls
    tool_calls: Optional[List[Dict[str, Any]]] = None

    class Config:
        use_enum_values = True


class ChatRequest(BaseModel):
    """Request model for chat endpoint"""
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    """Response model for chat endpoint"""
    messages: List[ChatMessage]


# ---------------------------
# Tool definitions for OpenAI
# ---------------------------

TOOLS: List[Dict[str, Any]] = [
    # PROFILE
    {
        "type": "function",
        "function": {
            "name": "profile__get_context",
            "description": (
                "Fetch the complete user profile context (goals, injuries, insights). "
                "Use when you need background to personalize advice."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "profile__update_insights",
            "description": (
                "Update specific fields in the user's profile insights (injuries, strengths, weaknesses, etc.). "
                "Use when user shares new lasting info."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "injury_tags": {"type": "array", "items": {"type": "string"}},
                    "current_issues": {"type": "array", "items": {"type": "string"}},
                    "strength_tags": {"type": "array", "items": {"type": "string"}},
                    "weak_point_tags": {"type": "array", "items": {"type": "string"}},
                    "psych_profile": {"type": "string"},
                },
                "required": [],
            },
        },
    },

    # EXERCISES
    {
        "type": "function",
        "function": {
            "name": "exercise__get_all",
            "description": (
                "Fetch ALL available exercises in ONE call (global + user custom). "
                "Use once, then pick exercise IDs from results. Avoid repeated calls."
            ),
            "parameters": {
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
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "exercise__create_batch",
            "description": (
                "Create multiple new exercises at once. Use this to create ALL missing exercises in a single call. "
                "IMPORTANT: choose exercise_kind correctly (Duration vs Cardio vs Reps Only etc). "
                "exercise_kind must be one of the known kinds from the system."
            ),
            "parameters": {
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
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "exercise__create_single",
            "description": "Create a single new exercise. Prefer exercise__create_batch when creating multiple.",
            "parameters": {
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
            },
        },
    },

    # TEMPLATES
    {
        "type": "function",
        "function": {
            "name": "template__get_all",
            "description": "Fetch the user's existing workout templates (reusable routines).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "template__create",
            "description": (
                "Create a reusable workout TEMPLATE only (no scheduling). "
                "Use this when user wants a routine to do 'by feel' / 2-3x/week without fixed days "
                "or wants a quick-start routine saved in their library.\n\n"
                "IMPORTANT: Set fields must match exercise_kind via system rules."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Template name"},
                    "notes": {"type": "string", "description": "Template notes/instructions"},
                    "exercises": {
                        "type": "array",
                        "description": "Ordered exercise list. Each exercise can have 'sets' as an array of set objects (preferred) or an integer count.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "exercise_id": {"type": "string"},
                                "sets": {
                                    "oneOf": [
                                        {
                                            "type": "array",
                                            "description": "Array of set objects (preferred). Each set has set_type, reps, weight, duration, distance as needed.",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "set_type": {"type": "string", "enum": ["normal", "warmup", "cooldown", "failure"], "default": "normal"},
                                                    "reps": {"type": "integer"},
                                                    "weight": {"type": "number"},
                                                    "duration": {"type": "number"},
                                                    "distance": {"type": "number"}
                                                }
                                            }
                                        },
                                        {"type": "integer", "description": "Number of sets (legacy - will create N identical sets)"}
                                    ]
                                },
                                "reps": {"type": "integer", "description": "Default reps per set (used when sets is an integer)"},
                                "weight": {"type": "number", "description": "Default weight in kg (used when sets is an integer)"},
                                "duration": {"type": "number", "description": "Default duration in seconds (used when sets is an integer)"},
                                "distance": {"type": "number", "description": "Default distance in km (used when sets is an integer)"},
                                "notes": {"type": "string"},
                            },
                            "required": ["exercise_id"],
                        },
                    },
                },
                "required": ["name", "exercises"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "template__update",
            "description": (
                "Update a TEMPLATE (affects all future schedules using it). "
                "Only use if user explicitly wants to change the template itself."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "template_id": {"type": "string"},
                    "name": {"type": "string"},
                    "notes": {"type": "string"},
                    "exercises": {
                        "type": "array",
                        "description": "REPLACES the whole template exercise list (compact form)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "exercise_id": {"type": "string"},
                                "sets": {"type": "integer"},
                                "reps": {"type": "integer"},
                                "weight": {"type": "number"},
                                "duration": {"type": "number"},
                                "distance": {"type": "number"},
                                "notes": {"type": "string"},
                            },
                            "required": ["exercise_id"],
                        },
                    },
                },
                "required": ["template_id"],
            },
        },
    },

    # SCHEDULE
    {
        "type": "function",
        "function": {
            "name": "schedule__get",
            "description": (
                "Fetch planned/scheduled workouts for a date range (including recurring expansion). "
                "Use this to see what is on the user's calendar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule__add_workout",
            "description": (
                "Create a scheduled workout on a specific date (optionally recurring). "
                "Provide EITHER template_id OR exercises (which will auto-create a template)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "name": {"type": "string", "description": "Workout name"},
                    "template_id": {"type": "string", "description": "Use an existing template"},
                    "exercises": {
                        "type": "array",
                        "description": "If provided, auto-creates a template then schedules it (compact form)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "exercise_id": {"type": "string"},
                                "sets": {"type": "integer"},
                                "reps": {"type": "integer"},
                                "weight": {"type": "number"},
                                "duration": {"type": "number"},
                                "distance": {"type": "number"},
                                "notes": {"type": "string"},
                            },
                            "required": ["exercise_id"],
                        },
                    },
                    "type": {"type": "string", "description": "strength/run/mobility/etc"},
                    "notes": {"type": "string"},
                    "is_recurring": {"type": "boolean", "default": False},
                    "recurrence_type": {"type": "string", "enum": ["daily", "weekly", "monthly"]},
                    "recurrence_days": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Weekly: [0=Mon..6=Sun]",
                    },
                    "recurrence_end_date": {"type": "string", "description": "YYYY-MM-DD or null for indefinite"},
                },
                "required": ["date", "name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule__update_workout",
            "description": (
                "Update a scheduled workout entry (date/name/type/notes/status/template). "
                "If exercises provided, creates a NEW template and links it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "workout_id": {"type": "string"},
                    "date": {"type": "string"},
                    "name": {"type": "string"},
                    "template_id": {"type": "string"},
                    "exercises": {
                        "type": "array",
                        "description": "If provided, creates a new template and attaches it (compact form)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "exercise_id": {"type": "string"},
                                "sets": {"type": "integer"},
                                "reps": {"type": "integer"},
                                "weight": {"type": "number"},
                                "duration": {"type": "number"},
                                "distance": {"type": "number"},
                                "notes": {"type": "string"},
                            },
                            "required": ["exercise_id"],
                        },
                    },
                    "type": {"type": "string"},
                    "notes": {"type": "string"},
                    "status": {"type": "string", "enum": ["planned", "in_progress", "completed", "skipped"]},
                    "order": {"type": "integer"},
                },
                "required": ["workout_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule__delete_workout",
            "description": (
                "Delete a scheduled workout from the calendar. "
                "Use the deletable_id from schedule__get."
            ),
            "parameters": {
                "type": "object",
                "properties": {"workout_id": {"type": "string"}},
                "required": ["workout_id"],
            },
        },
    },

    # WORKOUT HISTORY
    {
        "type": "function",
        "function": {
            "name": "workout_history__get_all",
            "description": (
                "Get recent completed workouts (summaries). "
                "Use to understand recent training load and what the user actually did."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days_back": {"type": "integer", "default": 30},
                    "limit": {"type": "integer", "default": 30},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "workout_history__get_by_exercise",
            "description": (
                "Get recent performance stats for a specific exercise_id from workout history.\n"
                "Returns best stats based on exercise_kind rules (e.g., strength: best_weight/best_e1rm; "
                "duration: best_duration; cardio: best_distance/best_pace when possible)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "exercise_id": {"type": "string"},
                    "days_back": {"type": "integer", "default": 120},
                    "limit_workouts": {"type": "integer", "default": 60},
                },
                "required": ["exercise_id"],
            },
        },
    },
]


# ---------------------------
# Helpers
# ---------------------------

def _safe_object_id(value: str) -> Optional[ObjectId]:
    if not value or not ObjectId.is_valid(value):
        return None
    return ObjectId(value)


async def _get_exercise_kind_map(exercise_ids: List[str], db, user_id: str) -> Dict[str, str]:
    """
    Fetch exercise_kind for a list of exercise_ids. Returns map: id -> kind.
    Defaults to DEFAULT_EXERCISE_KIND if not found.
    """
    valid_oids: List[ObjectId] = []
    for ex_id in exercise_ids:
        if ObjectId.is_valid(ex_id):
            valid_oids.append(ObjectId(ex_id))

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


def _normalize_set_fields_by_kind(
    kind: str,
    reps: Optional[int],
    weight: Optional[float],
    duration: Optional[float],
    distance: Optional[float],
) -> Dict[str, Any]:
    """
    Enforce model-consistent set fields using EXERCISE_KIND_RULES.
    Unknown kinds fall back to DEFAULT_EXERCISE_KIND.
    """
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

    # If this is time/distance-only and user didn't provide anything, give a default duration.
    is_time_or_distance_only = (("duration" in allowed) or ("distance" in allowed)) and ("reps" not in allowed)
    if is_time_or_distance_only and ("duration" not in out and "distance" not in out):
        # Cardio-like (distance allowed) => 10 minutes, duration-only => 30s
        out["duration"] = 600.0 if "distance" in allowed else 30.0

    # Final safety: always return something
    if not out:
        out = {"reps": int(reps) if reps is not None else 10}
        if weight is not None:
            out["weight"] = float(weight)

    return out


async def _build_template_exercises_from_compact(
    exercises: List[Dict[str, Any]],
    db,
    user_id: str,
) -> List[Dict[str, Any]]:
    """
    Convert compact exercise spec into stored template format (TemplateExerciseItem + TemplateSetItem),
    correctly populating reps/weight vs duration vs distance based on exercise_kind from DB.

    Input item supports:
    - exercise_id (required)
    - sets (optional)
    - reps, weight, duration, distance (optional)
    - notes (optional)
    """
    ex_ids = [e.get("exercise_id") for e in exercises if e.get("exercise_id")]
    kind_map = await _get_exercise_kind_map(ex_ids, db, user_id)

    template_exercises: List[Dict[str, Any]] = []

    for i, ex in enumerate(exercises):
        ex_id = ex.get("exercise_id")
        if not ex_id:
            continue

        kind = kind_map.get(ex_id) or DEFAULT_EXERCISE_KIND
        if kind not in EXERCISE_KIND_RULES:
            kind = DEFAULT_EXERCISE_KIND

        raw_sets = ex.get("sets")

        if raw_sets is None:
            rule_fields = set((EXERCISE_KIND_RULES.get(kind) or {}).get("fields", []) or [])
            is_time_or_distance_only = (("duration" in rule_fields) or ("distance" in rule_fields)) and ("reps" not in rule_fields)
            num_sets = 1 if is_time_or_distance_only else 3
        else:
            try:
                num_sets = int(raw_sets)
            except Exception:
                num_sets = 1
            num_sets = num_sets if num_sets > 0 else 1

        reps = ex.get("reps")
        weight = ex.get("weight")
        duration = ex.get("duration")
        distance = ex.get("distance")
        notes = ex.get("notes")

        base_fields = _normalize_set_fields_by_kind(kind, reps, weight, duration, distance)

        sets_arr: List[Dict[str, Any]] = []
        for _ in range(num_sets):
            sets_arr.append({"set_type": "normal", **base_fields})

        template_exercises.append(
            {
                "exercise_id": ex_id,
                "order": i,
                "sets": sets_arr,
                "notes": notes,
                "default_sets": num_sets,
                "default_reps": base_fields.get("reps"),
                "default_weight": base_fields.get("weight"),
                "default_duration": base_fields.get("duration"),
                "default_distance": base_fields.get("distance"),
            }
        )

    return template_exercises


# ---------------------------
# Tool execution
# ---------------------------

async def execute_tool(tool_name: str, arguments: Dict[str, Any], db, user_id: str) -> str:
    """
    Execute a tool function and return the result as a JSON string.
    """
    try:
        # ---------------------------
        # PROFILE
        # ---------------------------
        if tool_name == "profile__get_context":
            user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return json.dumps({"error": "User not found"})

            profile_data = user_doc.get("profile", {}) or {}
            if not profile_data:
                profile_doc = await db.profiles.find_one({"user_id": user_id})
                profile_data = profile_doc or {}

            insights_data = profile_data.get("insights", {}) or {}
            if not insights_data:
                insights_doc = await db.profile_insights.find_one({"user_id": user_id})
                insights_data = insights_doc or {}

            context = {"user": {"email": user_doc.get("email")}, "profile": profile_data, "insights": insights_data}

            if context["profile"] and "_id" in context["profile"]:
                context["profile"]["id"] = str(context["profile"]["_id"])
                del context["profile"]["_id"]
            if context["insights"] and "_id" in context["insights"]:
                context["insights"]["id"] = str(context["insights"]["_id"])
                del context["insights"]["_id"]

            return json.dumps(context, default=str)

        if tool_name == "profile__update_insights":
            insights_doc = await db.profile_insights.find_one({"user_id": user_id})
            if not insights_doc:
                insights_doc = {
                    "user_id": user_id,
                    "injury_tags": [],
                    "current_issues": [],
                    "strength_tags": [],
                    "weak_point_tags": [],
                    "training_phases": [],
                    "psych_profile": "",
                }

            update_fields: Dict[str, Any] = {}
            for field in ["injury_tags", "current_issues", "strength_tags", "weak_point_tags", "psych_profile"]:
                if field in arguments:
                    update_fields[field] = arguments[field]

            if update_fields:
                await db.profile_insights.update_one({"user_id": user_id}, {"$set": update_fields}, upsert=True)

            updated = await db.profile_insights.find_one({"user_id": user_id})
            if updated and "_id" in updated:
                updated["id"] = str(updated["_id"])
                del updated["_id"]

            return json.dumps(updated or {}, default=str)

        # ---------------------------
        # EXERCISES
        # ---------------------------
        if tool_name == "exercise__get_all":
            query = (arguments.get("query") or "").strip()
            limit = int(arguments.get("limit", 800) or 800)
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

        if tool_name == "exercise__create_batch":
            exercises_to_create = arguments.get("exercises", []) or []
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

        if tool_name == "exercise__create_single":
            name = (arguments.get("name") or "").strip()
            exercise_kind = arguments.get("exercise_kind") or DEFAULT_EXERCISE_KIND
            primary_body_parts = arguments.get("primary_body_parts", []) or []

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
                "secondary_body_parts": arguments.get("secondary_body_parts", []) or [],
                "category": arguments.get("category", "Strength"),
                "instructions": arguments.get("instructions"),
                "image": arguments.get("image"),
                "is_custom": True,
                "user_id": user_id,
                "created_at": datetime.utcnow(),
            }
            insert_res = await db.exercises.insert_one(exercise_doc)
            return json.dumps({"success": True, "id": str(insert_res.inserted_id), "name": name})

        # ---------------------------
        # TEMPLATES
        # ---------------------------
        if tool_name == "template__get_all":
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
                # Print the full result object nicely and readability on the console
                logger.info(f"[TemplateResultWExerciseIDs] Template result: {result}")
            return json.dumps(result)

        if tool_name == "template__create":
            name = (arguments.get("name") or "").strip()
            exercises = arguments.get("exercises", []) or []
            notes = arguments.get("notes") or "Created by AI Coach"

            if not name or not exercises:
                return json.dumps({"error": "name and exercises are required"})

            template_exercises = await _build_template_exercises_from_compact(exercises, db, user_id)
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

        if tool_name == "template__update":
            template_id = arguments.get("template_id")
            oid = _safe_object_id(template_id)
            if not oid:
                return json.dumps({"error": "Valid template_id is required"})

            update_fields = {"updated_at": datetime.utcnow()}
            if "name" in arguments and arguments["name"]:
                update_fields["name"] = arguments["name"]
            if "notes" in arguments and arguments["notes"] is not None:
                update_fields["notes"] = arguments["notes"]

            if "exercises" in arguments and arguments["exercises"]:
                template_exercises = await _build_template_exercises_from_compact(arguments["exercises"], db, user_id)
                update_fields["exercises"] = template_exercises

            if len(update_fields) == 1:
                return json.dumps({"error": "No fields to update"})

            res = await db.templates.update_one({"_id": oid, "user_id": user_id}, {"$set": update_fields})
            if res.matched_count == 0:
                return json.dumps({"error": "Template not found"})
            return json.dumps({"success": True, "message": "Template updated"})

        # ---------------------------
        # SCHEDULE
        # ---------------------------
        if tool_name == "schedule__get":
            start_date = arguments.get("start_date")
            end_date = arguments.get("end_date")
            if not start_date or not end_date:
                return json.dumps({"error": "start_date and end_date are required"})

            planned_workouts = await db.planned_workouts.find({"user_id": user_id}).to_list(2000)

            # Import expansion logic from server
            from server import expand_recurring_workouts, enrich_planned_workouts_with_sessions

            for pw in planned_workouts:
                pw["id"] = str(pw["_id"])

            enriched = await enrich_planned_workouts_with_sessions(planned_workouts, user_id)

            schedule = []
            for pw in enriched:
                is_recurring = bool(pw.get("is_recurring", False))
                deletable_id = pw.get("recurrence_parent_id") if is_recurring else pw.get("id")

                schedule.append(
                    {
                        "id": pw.get("id"),
                        "deletable_id": deletable_id,
                        "date": pw.get("date"),
                        "name": pw.get("name"),
                        "status": pw.get("status"),
                        "type": pw.get("type"),
                        "notes": pw.get("notes"),
                        "template_id": pw.get("template_id"),
                        "is_recurring": is_recurring,
                        "is_recurring_instance": is_recurring,
                    }
                )

            return json.dumps(schedule)

        if tool_name == "schedule__add_workout":
            if "date" not in arguments or "name" not in arguments:
                return json.dumps({"error": "date and name are required"})

            workout_date = arguments["date"]
            workout_name = arguments["name"]

            existing = await db.planned_workouts.find_one({"user_id": user_id, "date": workout_date, "name": workout_name})
            if existing:
                return json.dumps(
                    {
                        "already_exists": True,
                        "id": str(existing["_id"]),
                        "template_id": existing.get("template_id"),
                        "message": "Workout already exists for that date/name",
                    }
                )

            template_id = arguments.get("template_id") or ""
            exercises = arguments.get("exercises") or None

            created_template_id = None
            if exercises and not template_id:
                template_exercises = await _build_template_exercises_from_compact(exercises, db, user_id)
                template_doc = {
                    "user_id": user_id,
                    "name": workout_name,
                    "notes": arguments.get("notes") or "Created by AI Coach",
                    "exercises": template_exercises,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                template_res = await db.templates.insert_one(template_doc)
                template_id = str(template_res.inserted_id)
                created_template_id = template_id

            planned_workout = {
                "user_id": user_id,
                "date": workout_date,
                "name": workout_name,
                "template_id": template_id if template_id else None,
                "type": arguments.get("type"),
                "notes": arguments.get("notes"),
                "status": "planned",
                "order": 0,
                "is_recurring": bool(arguments.get("is_recurring", False)),
                "created_at": datetime.utcnow(),
            }

            if planned_workout["is_recurring"]:
                planned_workout["recurrence_type"] = arguments.get("recurrence_type")
                planned_workout["recurrence_days"] = arguments.get("recurrence_days")
                planned_workout["recurrence_end_date"] = arguments.get("recurrence_end_date")

            insert_res = await db.planned_workouts.insert_one(planned_workout)

            msg = f"Scheduled '{workout_name}' for {workout_date}"
            if created_template_id:
                msg += f" (auto-created template {created_template_id})"

            return json.dumps(
                {
                    "success": True,
                    "id": str(insert_res.inserted_id),
                    "template_id": template_id if template_id else None,
                    "created_template_id": created_template_id,
                    "message": msg,
                }
            )

        if tool_name == "schedule__update_workout":
            workout_id = arguments.get("workout_id")
            oid = _safe_object_id(workout_id)
            if not oid:
                return json.dumps({"error": "Valid workout_id is required"})

            update_fields: Dict[str, Any] = {}
            for field in ["date", "name", "type", "notes", "status", "order"]:
                if field in arguments:
                    update_fields[field] = arguments[field]

            if "template_id" in arguments and arguments["template_id"] is not None:
                update_fields["template_id"] = arguments["template_id"]

            exercises = arguments.get("exercises") or None
            if exercises:
                existing_workout = await db.planned_workouts.find_one({"_id": oid, "user_id": user_id})
                if not existing_workout:
                    return json.dumps({"error": "Scheduled workout not found"})

                workout_name = (arguments.get("name") or existing_workout.get("name") or "Workout").strip()
                template_exercises = await _build_template_exercises_from_compact(exercises, db, user_id)

                template_doc = {
                    "user_id": user_id,
                    "name": f"{workout_name} (Modified)",
                    "notes": "Created from scheduled workout modification",
                    "exercises": template_exercises,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                template_res = await db.templates.insert_one(template_doc)
                update_fields["template_id"] = str(template_res.inserted_id)

            if not update_fields:
                return json.dumps({"error": "No fields to update"})

            res = await db.planned_workouts.update_one({"_id": oid, "user_id": user_id}, {"$set": update_fields})
            if res.matched_count == 0:
                return json.dumps({"error": "Scheduled workout not found"})

            return json.dumps(
                {"success": True, "message": "Schedule updated", "template_id": update_fields.get("template_id")}
            )

        if tool_name == "schedule__delete_workout":
            workout_id = arguments.get("workout_id")
            logger.info(f"[DEBUG] schedule__delete_workout called with workout_id: {workout_id}")

            oid = _safe_object_id(workout_id)
            if not oid:
                return json.dumps({"error": f"Valid workout_id is required. Received: {workout_id}"})

            res = await db.planned_workouts.delete_one({"_id": oid, "user_id": user_id})
            if res.deleted_count == 0:
                return json.dumps({"success": True, "already_deleted": True, "message": "Workout already deleted/no-op"})

            return json.dumps({"success": True, "message": f"Deleted scheduled workout {workout_id}"})

        # ---------------------------
        # WORKOUT HISTORY
        # ---------------------------
        if tool_name == "workout_history__get_all":
            days_back = int(arguments.get("days_back", 30) or 30)
            limit = int(arguments.get("limit", 30) or 30)
            days_back = max(1, min(days_back, 365))
            limit = max(1, min(limit, 200))

            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days_back)

            workouts = (
                await db.workouts.find(
                    {"user_id": user_id, "ended_at": {"$ne": None}, "started_at": {"$gte": start_date, "$lte": end_date}}
                )
                .sort("started_at", -1)
                .limit(limit)
                .to_list(limit)
            )

            summaries = []
            for w in workouts:
                total_volume = 0.0
                ex_count = 0
                set_count = 0

                for ex in w.get("exercises", []) or []:
                    ex_count += 1
                    for set_data in ex.get("sets", []) or []:
                        set_count += 1
                        wt = set_data.get("weight")
                        reps = set_data.get("reps")
                        if wt is not None and reps is not None:
                            try:
                                total_volume += float(wt) * float(reps)
                            except Exception:
                                pass

                summaries.append(
                    {
                        "id": str(w["_id"]),
                        "name": w.get("name", "Workout"),
                        "started_at": w.get("started_at").isoformat() if w.get("started_at") else None,
                        "ended_at": w.get("ended_at").isoformat() if w.get("ended_at") else None,
                        "exercise_count": ex_count,
                        "set_count": set_count,
                        "total_volume_kg": round(total_volume, 2),
                        "notes": w.get("notes"),
                    }
                )

            return json.dumps(summaries)

        if tool_name == "workout_history__get_by_exercise":
            exercise_id = arguments.get("exercise_id")
            if not exercise_id:
                return json.dumps({"error": "exercise_id is required"})

            days_back = int(arguments.get("days_back", 120) or 120)
            limit_workouts = int(arguments.get("limit_workouts", 60) or 60)
            days_back = max(1, min(days_back, 730))
            limit_workouts = max(1, min(limit_workouts, 300))

            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days_back)

            # Get exercise kind for correct stat logic
            ex_kind = DEFAULT_EXERCISE_KIND
            if ObjectId.is_valid(exercise_id):
                ex_doc = await db.exercises.find_one({"_id": ObjectId(exercise_id)})
                if ex_doc and ex_doc.get("exercise_kind"):
                    ex_kind = ex_doc["exercise_kind"]
            if ex_kind not in EXERCISE_KIND_RULES:
                ex_kind = DEFAULT_EXERCISE_KIND

            allowed = set((EXERCISE_KIND_RULES.get(ex_kind) or {}).get("fields", []) or [])

            workouts = (
                await db.workouts.find(
                    {"user_id": user_id, "ended_at": {"$ne": None}, "started_at": {"$gte": start_date, "$lte": end_date}}
                )
                .sort("started_at", -1)
                .limit(limit_workouts)
                .to_list(limit_workouts)
            )

            samples: List[Dict[str, Any]] = []
            for w in workouts:
                w_date = w.get("started_at")
                for ex in w.get("exercises", []) or []:
                    if str(ex.get("exercise_id")) != str(exercise_id):
                        continue
                    for s in ex.get("sets", []) or []:
                        samples.append(
                            {
                                "date": w_date.isoformat() if w_date else None,
                                "reps": s.get("reps"),
                                "weight": s.get("weight"),
                                "duration": s.get("duration"),
                                "distance": s.get("distance"),
                                "calories": s.get("calories"),
                            }
                        )

            # Strength-like: has reps; may have weight
            if "reps" in allowed and "duration" not in allowed and "distance" not in allowed:
                def epley_1rm(wt: float, reps_i: int) -> float:
                    return wt * (1.0 + reps_i / 30.0)

                max_weight = None
                max_reps = None
                best_e1rm = None
                best_set = None

                for s in samples:
                    reps_v = s.get("reps")
                    wt_v = s.get("weight")

                    if reps_v is None:
                        continue

                    try:
                        reps_i = int(reps_v)
                    except Exception:
                        continue

                    if max_reps is None or reps_i > max_reps:
                        max_reps = reps_i

                    if wt_v is not None:
                        try:
                            wt_f = float(wt_v)
                        except Exception:
                            continue
                        if max_weight is None or wt_f > max_weight:
                            max_weight = wt_f

                        est = epley_1rm(wt_f, reps_i) if reps_i > 0 else wt_f
                        if best_e1rm is None or est > best_e1rm:
                            best_e1rm = est
                            best_set = {"date": s.get("date"), "weight": wt_f, "reps": reps_i}
                    else:
                        # Reps-only strength: track best reps
                        if best_set is None or reps_i > (best_set.get("reps") or 0):
                            best_set = {"date": s.get("date"), "reps": reps_i}

                return json.dumps(
                    {
                        "exercise_id": exercise_id,
                        "exercise_kind": ex_kind,
                        "window_days": days_back,
                        "workouts_scanned": len(workouts),
                        "samples": len(samples),
                        "max_weight": max_weight,
                        "max_reps": max_reps,
                        "best_e1rm": round(best_e1rm, 2) if best_e1rm is not None else None,
                        "best_set": best_set,
                        "recent_sets": samples[:15],
                    }
                )

            # Duration-only
            if "duration" in allowed and "reps" not in allowed and "distance" not in allowed:
                max_duration = None
                best_set = None
                for s in samples:
                    dur = s.get("duration")
                    if dur is None:
                        continue
                    try:
                        dur_f = float(dur)
                    except Exception:
                        continue
                    if max_duration is None or dur_f > max_duration:
                        max_duration = dur_f
                        best_set = {"date": s.get("date"), "duration": dur_f}
                return json.dumps(
                    {
                        "exercise_id": exercise_id,
                        "exercise_kind": ex_kind,
                        "window_days": days_back,
                        "workouts_scanned": len(workouts),
                        "samples": len(samples),
                        "max_duration_seconds": max_duration,
                        "best_set": best_set,
                        "recent_sets": samples[:15],
                    }
                )

            # Cardio-ish: duration and/or distance (and no reps)
            if ("duration" in allowed or "distance" in allowed) and ("reps" not in allowed):
                max_distance = None
                best_pace = None  # seconds per km (lower is better)
                best_distance_set = None
                best_pace_set = None

                for s in samples:
                    dist = s.get("distance")
                    dur = s.get("duration")

                    dist_f = None
                    dur_f = None
                    try:
                        if dist is not None:
                            dist_f = float(dist)
                        if dur is not None:
                            dur_f = float(dur)
                    except Exception:
                        pass

                    if dist_f is not None:
                        if max_distance is None or dist_f > max_distance:
                            max_distance = dist_f
                            best_distance_set = {"date": s.get("date"), "distance_km": dist_f, "duration_seconds": dur_f}

                    if dist_f is not None and dur_f is not None and dist_f > 0:
                        pace = dur_f / dist_f
                        if best_pace is None or pace < best_pace:
                            best_pace = pace
                            best_pace_set = {
                                "date": s.get("date"),
                                "distance_km": dist_f,
                                "duration_seconds": dur_f,
                                "pace_sec_per_km": pace,
                            }

                return json.dumps(
                    {
                        "exercise_id": exercise_id,
                        "exercise_kind": ex_kind,
                        "window_days": days_back,
                        "workouts_scanned": len(workouts),
                        "samples": len(samples),
                        "max_distance_km": max_distance,
                        "best_pace_sec_per_km": round(best_pace, 2) if best_pace is not None else None,
                        "best_distance_set": best_distance_set,
                        "best_pace_set": (
                            {**best_pace_set, "pace_sec_per_km": round(best_pace_set["pace_sec_per_km"], 2)}
                            if best_pace_set
                            else None
                        ),
                        "recent_sets": samples[:15],
                    }
                )

            # Fallback
            return json.dumps(
                {
                    "exercise_id": exercise_id,
                    "exercise_kind": ex_kind,
                    "window_days": days_back,
                    "workouts_scanned": len(workouts),
                    "samples": len(samples),
                    "recent_sets": samples[:15],
                }
            )

        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        logger.exception(f"Tool execution error: {tool_name}")
        return json.dumps({"error": str(e)})


# ---------------------------
# System prompt builder
# ---------------------------

def build_system_prompt(user_context: Dict[str, Any]) -> str:
    profile = user_context.get("profile", {}) or {}
    insights = user_context.get("insights", {}) or {}

    sex = profile.get("sex", "not specified")
    dob = profile.get("date_of_birth")
    age = "not specified"
    if dob:
        try:
            dob_dt = datetime.fromisoformat(dob.replace("Z", "+00:00")) if isinstance(dob, str) else dob
            age = str((datetime.utcnow() - dob_dt).days // 365)
        except Exception:
            pass

    height = profile.get("height_cm")
    weight = profile.get("weight_kg")
    height_weight = f"{height}cm / {weight}kg" if height and weight else "not specified"

    training_age = profile.get("training_age", "not specified")
    goals = profile.get("goals", "not specified")

    injury_tags = insights.get("injury_tags", []) or []
    current_issues = insights.get("current_issues", []) or []
    strength_tags = insights.get("strength_tags", []) or []
    weak_point_tags = insights.get("weak_point_tags", []) or []
    psych_profile = insights.get("psych_profile", "") or ""

    return f"""You are an expert strength and conditioning coach inside a workout tracking app.

APP ARCHITECTURE (short):
- Exercises are movements (each has an id + exercise_kind).
- Templates are reusable routines (ordered exercises + default sets/fields/notes).
- Schedule are calendar entries that reference a template (one-time or recurring).
- Workout history are completed sessions (what the user actually performed).

EXERCISE KIND RULES (IMPORTANT):
exercise_kind must be one of:
{", ".join(EXERCISE_KIND_ENUM)}

Per-kind rules (source of truth = EXERCISE_KIND_RULES):
{kind_rules}

Exercise Naming / scope rules:
- When creating new exercises, always make them generic and reuseable
- Do not include workout-specific parameters in the exercise name. The exercise name should describe only the movement and general protocol style. 
- All specifics; reps,duration,distance,pace,rest intervals,progression schemes,targets, must live in an individual workout/template.
- Treat the exercises as the pattern, not the personalized prescription. The perscription is always encoded in the set fields and notes, not the exercise’s name

When creating templates/scheduled workouts:
- Only send fields allowed for that exercise_kind.
- If you send incompatible fields, backend will coerce based on exercise_kind, but you should still try to be correct.

**Workout/Template Naming Rules**

- All name fields (for both templates, scheduled workouts etc) must be generic and protocol-only

- names describe only the **movement pattern or style**,  Do **NOT** include:
    - Day or Time
    - Perscription Details: sets, reps, total reps, duration, distance, pace, weight, etc

- All perscription must live only in exercise fields/notes field

TONE:
- Direct, concise, actionable
- Confident coach vibe
- Avoid generic disclaimers; only warn when truly needed

USER CONTEXT:
- Sex: {sex}
- Age: {age}
- Height/Weight: {height_weight}
- Training Age: {training_age}
- Goals: {goals}
- Injuries: {", ".join(injury_tags) if injury_tags else "None"}
- Current Issues: {", ".join(current_issues) if current_issues else "None"}
- Strengths: {", ".join(strength_tags) if strength_tags else "Not specified"}
- Weak Points: {", ".join(weak_point_tags) if weak_point_tags else "Not specified"}
- Psychological Profile: {psych_profile if psych_profile else "Not specified"}

CRITICAL RULES:
1) ALWAYS return text (never empty). If you are about to use tools, still write a short sentence.
2) Scheduling vs Template:
   - If user wants fixed days / calendar: use schedule__add_workout.
   - If user wants a routine to do "by feel" (no fixed day): use template__create (quick-start library).
3) Efficiency:
   - Call exercise__get_all once per planning task. Prefer batch creation for missing exercises.
4) History usage:
   - If user asks for personalization based on their level, call workout_history__get_by_exercise using the closest relevant exercise.
   - You can infer relatedness (e.g., pull-ups -> lat pulldown) without pre-tagging patterns.

DELETES:
- To delete scheduled workouts, always call schedule__get first and use deletable_id with schedule__delete_workout.
"""


# ---------------------------
# Main chat function
# ---------------------------

async def generate_ai_chat_response(user_id: str, messages: List[ChatMessage], db) -> List[ChatMessage]:
    """
    Generate AI chat response with tool support.

    - Keeps full conversation history INCLUDING assistant tool_call messages and tool result messages.
    - Returns those messages to the frontend so they can be sent back next time.
    - Deduplicates tool calls per round and limits certain tools to once per round.
    - Guarantees a non-empty final response string.
    """
    import uuid

    request_id = str(uuid.uuid4())[:8]
    logger.info(f"[REQ-{request_id}] Starting AI chat for user {user_id} with {len(messages)} messages")

    # 1) Fetch user context
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})

    profile_data = user_doc.get("profile", {}) if user_doc else {}
    if not profile_data:
        profile_doc = await db.profiles.find_one({"user_id": user_id})
        profile_data = profile_doc or {}

    insights_data = profile_data.get("insights", {})
    if not insights_data:
        insights_doc = await db.profile_insights.find_one({"user_id": user_id})
        insights_data = insights_doc or {}

    user_context = {"user": user_doc or {}, "profile": profile_data, "insights": insights_data}
    system_prompt = build_system_prompt(user_context)

    # 2) Build internal history (keep tools, strip client system)
    history_messages: List[ChatMessage] = [m for m in messages if m.role != "system"]

    logger.info(f"[REQ-{request_id}] History messages count (no system): {len(history_messages)}")
    for i, msg in enumerate(history_messages):
        logger.info(
            f"[REQ-{request_id}] Hist[{i}] role={msg.role}, content_preview={(msg.content[:100] if msg.content else 'EMPTY')}..."
        )

    current_messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]

    for msg in history_messages:
        if msg.role == "assistant" and msg.tool_calls:
            current_messages.append({"role": "assistant", "content": msg.content, "tool_calls": msg.tool_calls})
        elif msg.role == "tool":
            current_messages.append({"role": "tool", "content": msg.content, "tool_call_id": msg.tool_call_id})
        else:
            current_messages.append({"role": msg.role, "content": msg.content})

    logger.info(f"[REQ-{request_id}] OpenAI messages count: {len(current_messages)}")

    # 3) Tool loop
    max_tool_rounds = 6
    final_content = ""

    SINGLE_CALL_TOOLS = {
        "schedule__add_workout",
        "schedule__update_workout",
        "schedule__delete_workout",
        "template__create",
        "template__update",
        "profile__update_insights",
    }

    for round_num in range(max_tool_rounds):
        logger.info(f"[REQ-{request_id}] === ROUND {round_num + 1} START ===")
        logger.info(f"[REQ-{request_id}] Sending {len(current_messages)} messages to OpenAI")

        try:
            response = client.chat.completions.create(
                model="openai/gpt-5.1",
                messages=current_messages,
                tools=TOOLS,
                temperature=0.7,
            )
            logger.info(f"[REQ-{request_id}] OpenAI response received")
        except Exception as e:
            logger.error(f"[REQ-{request_id}] OpenAI API ERROR: {str(e)}")
            history_messages.append(
                ChatMessage(
                    role="assistant",
                    content="I hit an error while trying to respond. Try again or rephrase what you want to do.",
                )
            )
            logger.info(f"[REQ-{request_id}] Returning {len(history_messages)} messages after error")
            return history_messages

        assistant_message = response.choices[0].message
        assistant_text = assistant_message.content or ""
        tool_calls_raw = assistant_message.tool_calls or []

        logger.info(f"[REQ-{request_id}] Assistant content: {(assistant_text[:200] if assistant_text else 'NONE/EMPTY')}")
        logger.info(f"[REQ-{request_id}] Assistant tool_calls: {len(tool_calls_raw)}")

        if tool_calls_raw:
            # 3a) Dedup + limit tools per round
            seen_call_keys = set()
            used_single_call_tools = set()
            tool_calls_to_process = []

            for tc in tool_calls_raw:
                name = tc.function.name
                args_str = tc.function.arguments or ""
                key = (name, args_str)

                if key in seen_call_keys:
                    logger.info(f"[REQ-{request_id}] Skipping duplicate tool call: {key}")
                    continue
                seen_call_keys.add(key)

                if name in SINGLE_CALL_TOOLS:
                    if name in used_single_call_tools:
                        logger.info(f"[REQ-{request_id}] Skipping extra call to single-call tool {name} in this round")
                        continue
                    used_single_call_tools.add(name)

                tool_calls_to_process.append(tc)

            if not tool_calls_to_process:
                logger.info(f"[REQ-{request_id}] No tool calls left after dedup/limits; forcing tool_choice='none'")
                try:
                    final_response = client.chat.completions.create(
                        model="openai/gpt-5.1",
                        messages=current_messages,
                        tools=TOOLS,
                        tool_choice="none",
                        temperature=0.7,
                    )
                    final_content = final_response.choices[0].message.content or ""
                except Exception as e:
                    logger.error(f"[REQ-{request_id}] Final (no-tool) call error: {str(e)}")
                    final_content = ""
                break

            logger.info(
                f"[REQ-{request_id}] ROUND {round_num + 1} - Processing {len(tool_calls_to_process)} tool calls: "
                f"{[tc.function.name for tc in tool_calls_to_process]}"
            )

            assistant_tool_calls_payload = [
                {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in tool_calls_to_process
            ]

            # Store assistant tool-call message in history
            history_messages.append(ChatMessage(role="assistant", content=assistant_text, tool_calls=assistant_tool_calls_payload))

            # Add assistant tool_call message to OpenAI-side history
            current_messages.append({"role": "assistant", "content": assistant_text, "tool_calls": assistant_tool_calls_payload})

            # Execute tools
            for tool_call in tool_calls_to_process:
                tool_name = tool_call.function.name
                try:
                    arguments = json.loads(tool_call.function.arguments or "{}")
                except json.JSONDecodeError as e:
                    logger.error(f"[REQ-{request_id}] TOOL ARG PARSE ERROR: {tool_name} - {str(e)}")
                    arguments = {}

                logger.info(f"[REQ-{request_id}] TOOL CALL: {tool_name}")
                logger.info(f"[REQ-{request_id}] TOOL ARGS: {json.dumps(arguments)[:500]}")

                try:
                    tool_result = await execute_tool(tool_name, arguments, db, user_id)
                    logger.info(f"[REQ-{request_id}] TOOL RESULT ({tool_name}): {tool_result[:1000]}...")
                except Exception as e:
                    logger.error(f"[REQ-{request_id}] TOOL EXECUTION ERROR: {tool_name} - {str(e)}")
                    tool_result = json.dumps({"error": str(e)})

                logger.info(f"[AI TOOL RESULT] {tool_name}: {tool_result[:1000]}...")

                # Tool result message for OpenAI
                current_messages.append({"role": "tool", "content": tool_result, "tool_call_id": tool_call.id})

                # Tool result message for history
                history_messages.append(
                    ChatMessage(role="tool", content=tool_result, tool_name=tool_name, tool_call_id=tool_call.id)
                )

            logger.info(f"[REQ-{request_id}] === ROUND {round_num + 1} END - continuing to next round ===")
            continue

        # 3b) No tool calls => final response
        final_content = assistant_text
        logger.info(f"[REQ-{request_id}] === ROUND {round_num + 1} END - no tool calls, final response ===")
        break

    # 4) If all rounds consumed and no final content, force one last no-tool call
    if not final_content:
        logger.info(f"[REQ-{request_id}] No final content; forcing plain response (tool_choice='none')")
        try:
            final_response = client.chat.completions.create(
                model="openai/gpt-5.1",
                messages=current_messages,
                tools=TOOLS,
                tool_choice="none",
                temperature=0.7,
            )
            final_content = final_response.choices[0].message.content or ""
            logger.info(f"[REQ-{request_id}] Forced final content preview: {(final_content[:200] if final_content else 'EMPTY')}")
        except Exception as e:
            logger.error(f"[REQ-{request_id}] Forced final call error: {str(e)}")
            final_content = ""

    # 5) Safety net for blank messages
    if not final_content or final_content.strip() == "":
        logger.warning(f"[REQ-{request_id}] Empty final_content, using fallback")
        final_content = "I couldn’t generate a proper response just now, but nothing was changed. Try again."

    # 6) Append final assistant message
    history_messages.append(ChatMessage(role="assistant", content=final_content))
    logger.info(f"[REQ-{request_id}] Returning {len(history_messages)} messages to client")
    return history_messages
