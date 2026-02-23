import json
from datetime import datetime
from typing import Dict, Any, List, Optional

from bson import ObjectId

from .base import BaseTool
from .template import build_template_exercises_from_compact

# Shared set/exercise schema (inline to avoid circular issues)
_SETS_ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "set_type": {
            "type": "string",
            "enum": ["normal", "warmup", "cooldown", "failure"],
            "description": "Type of set (default normal if omitted)",
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
            "description": "Array of set objects.",
            "items": _SETS_ITEMS_SCHEMA,
        },
        "reps": {"type": "integer"},
        "weight": {"type": "number"},
        "duration": {"type": "number"},
        "distance": {"type": "number"},
        "notes": {"type": "string"},
    },
    "required": ["exercise_id", "sets"],
}

_RECURRENCE_PROPS = {
    "is_recurring": {"type": "boolean", "description": "Whether this planned workout recurs.", "default": False},
    "recurrence_type": {
        "type": "string",
        "enum": ["daily", "weekly", "monthly"],
        "description": "Recurrence pattern if is_recurring is true.",
    },
    "recurrence_days": {
        "type": "array",
        "items": {"type": "integer"},
        "description": "For weekly recurrence only: list of weekdays [0=Mon..6=Sun].",
    },
    "recurrence_end_date": {
        "type": "string",
        "description": "End date for recurrence in YYYY-MM-DD format, or null for indefinite.",
    },
}

_EXERCISES_FIELD = {
    "type": "array",
    "description": (
        "Compact exercise definitions for this workout. If provided WITHOUT 'template_id', "
        "you MUST also set 'create_template_from_exercises' to true (to save as a reusable template) "
        "or false (to schedule as a one-time inline workout). "
        "Each exercise must provide 'sets' as an array of set objects."
    ),
    "items": _EXERCISES_ITEMS_SCHEMA,
}

_CREATE_TEMPLATE_FIELD = {
    "type": "boolean",
    "description": (
        "Required if 'exercises' is provided and 'template_id' is NOT provided. "
        "If true, auto-create a reusable template from the exercises and link it to this scheduled workout. "
        "If false, schedule this workout as a one-time session with inline_exercises only (no template is created)."
    ),
}


class ScheduleGet(BaseTool):
    name = "schedule__get"
    description = (
        "Fetch planned/scheduled workouts for a date range (including recurring expansion). "
        "Use this to see what is on the user's calendar. "
        "It includes either a template id or inline_exercises for one-time workouts."
    )
    parameters = {
        "type": "object",
        "properties": {
            "start_date": {"type": "string", "description": "YYYY-MM-DD"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD"},
        },
        "required": ["start_date", "end_date"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        start_date = args.get("start_date")
        end_date = args.get("end_date")
        if not start_date or not end_date:
            return json.dumps({"error": "start_date and end_date are required"})

        planned_workouts = await db.planned_workouts.find({"user_id": user_id}).to_list(2000)

        from server import enrich_planned_workouts_with_sessions

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
                    "inline_exercises": pw.get("inline_exercises", []),
                    "is_recurring": is_recurring,
                    "is_recurring_instance": is_recurring,
                }
            )

        return json.dumps(schedule)


class ScheduleAddWorkout(BaseTool):
    name = "schedule__add_workout"
    description = (
        "Create a scheduled workout on a specific date (optionally recurring). "
        "You must provide EITHER template_id OR exercises. "
        "If you provide exercises without template_id, you MUST also specify whether to create a reusable template "
        "or schedule this as a one-time inline workout."
    )
    parameters = {
        "type": "object",
        "properties": {
            "date": {"type": "string", "description": "Workout date in YYYY-MM-DD format"},
            "name": {"type": "string", "description": "Workout name (e.g. 'Push Day A', 'Long Run')"},
            "template_id": {
                "type": "string",
                "description": "Use an existing template. If provided, any 'exercises' field will be ignored.",
            },
            "exercises": _EXERCISES_FIELD,
            "create_template_from_exercises": _CREATE_TEMPLATE_FIELD,
            "type": {
                "type": "string",
                "description": "Workout category (e.g. 'strength', 'run', 'mobility'). Optional.",
            },
            "notes": {"type": "string", "description": "Optional notes for the scheduled workout."},
            **_RECURRENCE_PROPS,
        },
        "required": ["date", "name"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        date = args.get("date")
        name = (args.get("name") or "").strip()
        if not date or not name:
            return json.dumps({"error": "date and name are required"})

        existing = await db.planned_workouts.find_one({"user_id": user_id, "date": date, "name": name})
        if existing:
            return json.dumps(
                {
                    "already_exists": True,
                    "id": str(existing["_id"]),
                    "template_id": existing.get("template_id"),
                    "message": "Workout already exists for that date/name",
                }
            )

        template_id = args.get("template_id") or None
        exercises = args.get("exercises") or None

        created_template_id: Optional[str] = None
        inline_exercises: Optional[List[Dict[str, Any]]] = None

        if template_id is None and exercises:
            create_template_from_exercises = args.get("create_template_from_exercises")
            if create_template_from_exercises is None:
                return json.dumps(
                    {
                        "error": "create_template_from_exercises is required when exercises are provided without template_id",
                        "hint": (
                            "Set create_template_from_exercises=true to auto-create a reusable template, "
                            "or false to schedule this as a one-time inline workout."
                        ),
                    }
                )

            template_exercises = await build_template_exercises_from_compact(exercises, db, user_id)

            if create_template_from_exercises:
                template_doc = {
                    "user_id": user_id,
                    "name": name,
                    "notes": args.get("notes") or "Created by AI Coach",
                    "exercises": template_exercises,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                template_res = await db.templates.insert_one(template_doc)
                template_id = str(template_res.inserted_id)
                created_template_id = template_id
            else:
                inline_exercises = template_exercises

        planned_workout: Dict[str, Any] = {
            "user_id": user_id,
            "date": date,
            "name": name,
            "template_id": template_id,
            "inline_exercises": inline_exercises,
            "type": args.get("type"),
            "notes": args.get("notes"),
            "status": "planned",
            "order": 0,
            "is_recurring": bool(args.get("is_recurring", False)),
            "created_at": datetime.utcnow(),
        }

        if planned_workout["is_recurring"]:
            planned_workout["recurrence_type"] = args.get("recurrence_type")
            planned_workout["recurrence_days"] = args.get("recurrence_days")
            planned_workout["recurrence_end_date"] = args.get("recurrence_end_date")

        insert_res = await db.planned_workouts.insert_one(planned_workout)

        msg = f"Scheduled '{name}' for {date}"
        if created_template_id:
            msg += f" (created template {created_template_id})"
        elif inline_exercises is not None:
            msg += " (one-time inline workout; no template created)"
        elif template_id:
            msg += f" (using existing template {template_id})"

        return json.dumps(
            {
                "success": True,
                "id": str(insert_res.inserted_id),
                "template_id": template_id,
                "created_template_id": created_template_id,
                "message": msg,
            }
        )


class ScheduleUpdateWorkout(BaseTool):
    name = "schedule__update_workout"
    description = (
        "Update a scheduled workout entry (date/name/type/notes/status/template).\n"
        "You can either:\n"
        "  - Link it to an existing template via template_id, OR\n"
        "  - Override it with inline exercises (one-time prescription).\n\n"
        "LOGIC (MIRRORS schedule__add_workout):\n"
        "- If template_id is provided, any 'exercises' field will be ignored and the workout will use that template.\n"
        "- If exercises are provided WITHOUT template_id, you MUST also set 'create_template_from_exercises':\n"
        "    * true  => create a NEW reusable template from these exercises and attach it to this scheduled workout.\n"
        "    * false => store these exercises as inline_exercises ONLY for this workout (no template is created/used).\n"
        "- If neither template_id nor exercises are provided, the existing template/inline_exercises are left unchanged."
    )
    parameters = {
        "type": "object",
        "properties": {
            "workout_id": {
                "type": "string",
                "description": "The id of the planned workout to update (from schedule__get).",
            },
            "date": {"type": "string", "description": "New date in YYYY-MM-DD format (optional)."},
            "name": {"type": "string", "description": "New workout name (optional)."},
            "template_id": {
                "type": "string",
                "description": (
                    "If provided, the scheduled workout will use this template. "
                    "Any 'exercises' field in the same call will be ignored."
                ),
            },
            "exercises": {
                **_EXERCISES_FIELD,
                "description": (
                    "Compact exercise definitions to override this scheduled workout. "
                    "If provided WITHOUT 'template_id', you MUST also set 'create_template_from_exercises' to true or false. "
                    "Each exercise must provide 'sets' as an array of set objects."
                ),
            },
            "create_template_from_exercises": {
                "type": "boolean",
                "description": (
                    "Required if 'exercises' is provided and 'template_id' is NOT provided. "
                    "If true, auto-create a reusable template from the exercises and link it to this scheduled workout. "
                    "If false, overwrite this workout with inline_exercises only (no template is created or linked)."
                ),
            },
            "type": {"type": "string", "description": "Workout category (e.g. 'strength', 'run', 'mobility'). Optional."},
            "notes": {"type": "string", "description": "Optional notes for the scheduled workout."},
            "status": {
                "type": "string",
                "enum": ["planned", "in_progress", "completed", "skipped"],
                "description": "Optional status update for the scheduled workout.",
            },
            "order": {"type": "integer", "description": "Optional ordering index for the workout in the day."},
            **_RECURRENCE_PROPS,
        },
        "required": ["workout_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        workout_id = args.get("workout_id")
        if not workout_id or not ObjectId.is_valid(workout_id):
            return json.dumps({"error": f"Valid workout_id is required. Received: {workout_id}"})
        oid = ObjectId(workout_id)

        existing_workout = await db.planned_workouts.find_one({"_id": oid, "user_id": user_id})
        if not existing_workout:
            return json.dumps({"error": "Scheduled workout not found"})

        update_fields: Dict[str, Any] = {}

        for field in ["date", "name", "type", "notes", "status", "order"]:
            if field in args:
                val = args[field]
                if isinstance(val, str) and not val.strip():
                    continue
                update_fields[field] = val

        for field in ["is_recurring", "recurrence_type", "recurrence_days", "recurrence_end_date"]:
            if field in args:
                update_fields[field] = (bool(args[field]) if field == "is_recurring" else args[field])

        template_id_arg = args.get("template_id")
        exercises = args.get("exercises") or None
        created_template_id: Optional[str] = None

        if template_id_arg:
            update_fields["template_id"] = template_id_arg
            update_fields["inline_exercises"] = None
        elif exercises:
            create_template_from_exercises = args.get("create_template_from_exercises")
            if create_template_from_exercises is None:
                return json.dumps(
                    {
                        "error": "create_template_from_exercises is required when exercises are provided without template_id",
                        "hint": (
                            "Set create_template_from_exercises=true to auto-create a reusable template, "
                            "or false to store these exercises as inline_exercises only for this workout."
                        ),
                    }
                )

            template_exercises = await build_template_exercises_from_compact(exercises, db, user_id)
            workout_name = (args.get("name") or existing_workout.get("name") or "Workout").strip()

            if create_template_from_exercises:
                template_doc = {
                    "user_id": user_id,
                    "name": f"{workout_name} (Modified)",
                    "notes": "Created from scheduled workout modification",
                    "exercises": template_exercises,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                template_res = await db.templates.insert_one(template_doc)
                new_template_id = str(template_res.inserted_id)
                update_fields["template_id"] = new_template_id
                update_fields["inline_exercises"] = None
                created_template_id = new_template_id
            else:
                update_fields["template_id"] = None
                update_fields["inline_exercises"] = template_exercises

        if not update_fields:
            return json.dumps({"error": "No fields to update"})

        update_fields["updated_at"] = datetime.utcnow()

        res = await db.planned_workouts.update_one({"_id": oid, "user_id": user_id}, {"$set": update_fields})
        if res.matched_count == 0:
            return json.dumps({"error": "Scheduled workout not found"})

        return json.dumps(
            {
                "success": True,
                "message": "Schedule updated",
                "template_id": update_fields.get("template_id", existing_workout.get("template_id")),
                "created_template_id": created_template_id,
            },
            default=str,
        )


class ScheduleDeleteWorkout(BaseTool):
    name = "schedule__delete_workout"
    description = (
        "Delete a scheduled workout from the calendar. "
        "Use the deletable_id from schedule__get."
    )
    parameters = {
        "type": "object",
        "properties": {"workout_id": {"type": "string"}},
        "required": ["workout_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        workout_id = args.get("workout_id")
        if not workout_id or not ObjectId.is_valid(workout_id):
            return json.dumps({"error": f"Valid workout_id is required. Received: {workout_id}"})
        oid = ObjectId(workout_id)

        res = await db.planned_workouts.delete_one({"_id": oid, "user_id": user_id})
        if res.deleted_count == 0:
            return json.dumps({"success": True, "already_deleted": True, "message": "Workout already deleted/no-op"})

        return json.dumps({"success": True, "message": f"Deleted scheduled workout {workout_id}"})