import json
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional

from bson import ObjectId

from .base import BaseTool
from .template import build_template_exercises_from_compact

# ---------------------------------------------------------------------------
# SET SCHEMA
# The backend normalizes fields automatically based on exercise kind.
# Just send what you know — omit anything you don't.
# ---------------------------------------------------------------------------
_SETS_ITEMS_SCHEMA = {
    "type": "object",
    "description": (
        "A single set. Include only the fields you know: reps, weight, duration, distance. "
        "The backend will automatically normalize fields based on the exercise kind — "
        "you do not need to get this perfect. "
        "Never send 0 or null for a field — omit it entirely if you don't have a value."
    ),
    "properties": {
        "set_type": {
            "type": "string",
            "enum": ["normal", "warmup", "cooldown", "failure"],
            "description": "Omit if normal — only include for warmup, cooldown, or failure sets.",
        },
        "reps": {"type": "integer"},
        "weight": {"type": "number", "description": "kg"},
        "duration": {"type": "number", "description": "seconds"},
        "distance": {"type": "number", "description": "km"},
        "rest_timer": {
            "type": "integer",
            "description": "Rest time in seconds after this set. Omit if not needed.",
        },
    },
}

# ---------------------------------------------------------------------------
# EXERCISE SCHEMA
# All tracking data lives inside sets. No top-level reps/weight/etc.
# ---------------------------------------------------------------------------
_EXERCISES_ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "exercise_id": {
            "type": "string",
            "description": "ID of the exercise from exercise__search results.",
        },
        "sets": {
            "type": "array",
            "description": "Array of set objects. Include only fields you know per set.",
            "items": _SETS_ITEMS_SCHEMA,
        },
        "notes": {
            "type": "string",
            "description": "Optional coaching notes for this exercise. Omit if none.",
        },
    },
    "required": ["exercise_id", "sets"],
}

# ---------------------------------------------------------------------------
# RECURRENCE PROPS
# Only include these when the user explicitly wants a recurring series.
# ---------------------------------------------------------------------------
_RECURRENCE_PROPS = {
    "is_recurring": {
        "type": "boolean",
        "description": (
            "Set to true ONLY if the user explicitly wants this workout to repeat on a schedule. "
            "OMIT ENTIRELY for one-off workouts — do not send false."
        ),
    },
    "recurrence_type": {
        "type": "string",
        "enum": ["daily", "weekly", "monthly"],
        "description": (
            "Recurrence pattern. ONLY include if is_recurring=true. "
            "OMIT ENTIRELY otherwise."
        ),
    },
    "recurrence_days": {
        "type": "array",
        "items": {"type": "integer"},
        "description": (
            "Weekdays for weekly recurrence [0=Mon..6=Sun]. "
            "ONLY include if recurrence_type='weekly'. "
            "OMIT ENTIRELY otherwise."
        ),
    },
    "recurrence_end_date": {
        "type": "string",
        "description": (
            "End date for the series (YYYY-MM-DD). "
            "ONLY include if is_recurring=true AND the user specified an end date. "
            "OMIT ENTIRELY if indefinite or if not recurring."
        ),
    },
}

# ---------------------------------------------------------------------------
# TEMPLATE / EXERCISES PROPS
# Exactly one of template_id OR exercises should be provided, never both.
# ---------------------------------------------------------------------------
_EXERCISES_FIELD = {
    "type": "array",
    "description": (
        "Inline exercise definitions. "
        "ONLY provide if you do NOT have a template_id to use. "
        "OMIT ENTIRELY if template_id is provided — do not send an empty array. "
        "If provided without template_id, you MUST also set create_template_from_exercises."
    ),
    "items": _EXERCISES_ITEMS_SCHEMA,
}

_CREATE_TEMPLATE_FIELD = {
    "type": "boolean",
    "description": (
        "ONLY include when exercises are provided without a template_id. "
        "OMIT ENTIRELY if template_id is provided or no exercises are given. "
        "true = auto-create a reusable template from these exercises and link it. "
        "false = store exercises inline for this workout only (no template created)."
    ),
}

_TEMPLATE_OR_EXERCISES_PROPS = {
    "template_id": {
        "type": "string",
        "description": (
            "ID of an existing template to use for this workout. "
            "If provided, OMIT exercises and create_template_from_exercises entirely."
        ),
    },
    "exercises": _EXERCISES_FIELD,
    "create_template_from_exercises": _CREATE_TEMPLATE_FIELD,
}


# ---------------------------------------------------------------------------
# SHARED HELPER
# ---------------------------------------------------------------------------
async def _resolve_template_or_exercises(
    args: Dict[str, Any],
    db,
    user_id: str,
    workout_name: str,
    is_update: bool = False,
) -> tuple[Optional[str], Optional[List], Optional[str], Optional[str]]:
    """
    Resolves template_id and inline_exercises from args.
    Returns (template_id, inline_exercises, created_template_id, error)
    """
    template_id_arg = args.get("template_id") or None
    exercises = args.get("exercises") or None
    created_template_id: Optional[str] = None

    if template_id_arg:
        # template_id takes full priority — ignore any exercises
        return template_id_arg, None, None, None

    if exercises:
        create_template = args.get("create_template_from_exercises")
        if create_template is None:
            return (
                None,
                None,
                None,
                (
                    "create_template_from_exercises is required when exercises are provided without template_id. "
                    "Set to true to create a reusable template, or false for a one-time inline workout."
                ),
            )

        template_exercises = await build_template_exercises_from_compact(
            exercises, db, user_id
        )

        if create_template:
            label = f"{workout_name} (Modified)" if is_update else workout_name
            template_doc = {
                "user_id": user_id,
                "name": label,
                "notes": "Created by AI Coach",
                "exercises": template_exercises,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            result = await db.templates.insert_one(template_doc)
            created_template_id = str(result.inserted_id)
            return created_template_id, None, created_template_id, None
        else:
            return None, template_exercises, None, None

    # Neither provided — no-op for updates, caller handles for creates
    return None, None, None, None


# ---------------------------------------------------------------------------
# UTILITY: expand recurring rules into synthetic occurrences
# ---------------------------------------------------------------------------
def _expand_parents_to_synthetic(parents, start_date, end_date):
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    synthetic = {}

    for pw in parents:
        parent_id = str(pw["_id"])
        recurrence_type = pw.get("recurrence_type")
        recurrence_days = pw.get("recurrence_days") or []
        recurrence_end_str = pw.get("recurrence_end_date")

        rule_start = date.fromisoformat(pw["date"])
        actual_end = end

        if recurrence_end_str:
            actual_end = min(end, date.fromisoformat(recurrence_end_str))

        cur = max(start, rule_start)

        while cur <= actual_end:
            include = False
            if recurrence_type == "daily":
                include = True
            elif recurrence_type == "weekly":
                include = cur.weekday() in recurrence_days
            elif recurrence_type == "monthly":
                include = cur.day == rule_start.day

            if include:
                inst = pw.copy()
                inst["date"] = cur.isoformat()
                inst["recurrence_parent_id"] = parent_id
                inst["is_recurring"] = False
                inst["is_override"] = False
                inst["original_date"] = None
                inst["id"] = f"{parent_id}:{inst['date']}"
                inst["status"] = "planned"
                inst["workout_session_id"] = None
                synthetic[(parent_id, inst["date"])] = inst

            cur += timedelta(days=1)

    return synthetic


def _expand_and_overlay(parents, non_recurring, start_date, end_date):
    overrides = [x for x in non_recurring if x.get("is_override")]
    standalone = [x for x in non_recurring if not x.get("is_override")]

    synthetic_map = _expand_parents_to_synthetic(parents, start_date, end_date)

    override_map = {}
    for o in overrides:
        parent_id = str(o.get("recurrence_parent_id"))
        original_date = o.get("original_date")
        if parent_id and original_date:
            override_map[(parent_id, original_date)] = o

    final = []
    for key, synthetic in synthetic_map.items():
        if key in override_map:
            o = override_map[key].copy()
            o["id"] = str(o["_id"])
            final.append(o)
        else:
            final.append(synthetic)

    for s in standalone:
        s2 = s.copy()
        s2["id"] = str(s2["_id"])
        final.append(s2)

    final.sort(key=lambda x: (x["date"], x.get("order", 0)))
    return final


# ---------------------------------------------------------------------------
# TOOLS
# ---------------------------------------------------------------------------


class ScheduleGet(BaseTool):
    name = "schedule__get"
    description = (
        "Fetch scheduled workouts for a date range.\n\n"
        "Returns three separate collections:\n"
        "- rules: recurring series definitions. Each has a series_id, recurrence config, and start_date.\n"
        "- overrides: one-time modifications to a specific occurrence of a recurring series.\n"
        "- one_offs: standalone non-recurring scheduled workouts.\n\n"
        "NOTE: This tool does NOT return expanded occurrences of recurring rules. "
        "To reason about what is scheduled on a specific date, expand the rules manually using their "
        "recurrence_type, recurrence_days, and recurrence_end_date, then check if an override exists "
        "for that (series_id, date) pair.\n\n"
        "To modify a single occurrence of a series, use schedule__patch_occurrence.\n"
        "To modify the series rule itself (affecting all future occurrences), use schedule__update_workout."
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

        query = {
            "user_id": user_id,
            "$or": [
                {
                    "is_recurring": {"$ne": True},
                    "is_override": {"$ne": True},
                    "date": {"$gte": start_date, "$lte": end_date},
                },
                {
                    "is_recurring": True,
                    "date": {"$lte": end_date},
                    "$or": [
                        {"recurrence_end_date": {"$exists": False}},
                        {"recurrence_end_date": None},
                        {"recurrence_end_date": ""},
                        {"recurrence_end_date": {"$gte": start_date}},
                    ],
                },
                {
                    "is_override": True,
                    "date": {"$gte": start_date, "$lte": end_date},
                },
            ],
        }

        docs = await db.planned_workouts.find(query).to_list(2000)

        rules = []
        overrides = []
        one_offs = []

        for doc in docs:
            doc_id = str(doc["_id"])

            base = {
                "workout_id": doc_id,
                "date": doc.get("date"),
                "name": doc.get("name"),
                "template_id": doc.get("template_id"),
                "type": doc.get("type"),
                "notes": doc.get("notes"),
                "status": doc.get("status"),
                "inline_exercises": doc.get("inline_exercises"),
            }

            if doc.get("is_recurring"):
                rules.append(
                    {
                        "series_id": doc_id,
                        "name": doc.get("name"),
                        "start_date": doc.get("date"),
                        "recurrence_type": doc.get("recurrence_type"),
                        "recurrence_days": doc.get("recurrence_days"),
                        "recurrence_end_date": doc.get("recurrence_end_date"),
                        "template_id": doc.get("template_id"),
                        "type": doc.get("type"),
                        "notes": doc.get("notes"),
                    }
                )
                continue

            if doc.get("is_override"):
                overrides.append(
                    {
                        **base,
                        "series_id": doc.get("recurrence_parent_id"),
                        "original_date": doc.get("original_date"),
                    }
                )
                continue

            one_offs.append(base)

        return json.dumps(
            {"rules": rules, "overrides": overrides, "one_offs": one_offs},
            default=str,
        )


class ScheduleAddWorkout(BaseTool):
    name = "schedule__add_workout"
    description = (
        "Schedule a new workout on a specific date. Works for both one-off workouts and recurring series.\n\n"
        "IMPORTANT — this tool is ONLY for creating new scheduled workouts (one-offs or series rules). "
        "Do NOT use this to modify a single occurrence of an existing recurring series — "
        "use schedule__patch_occurrence for that.\n\n"
        "WORKOUT CONTENT — provide exactly one of:\n"
        "  A) template_id only: reference an existing template (preferred when available).\n"
        "  B) exercises + create_template_from_exercises=true: define inline and auto-create a reusable template.\n"
        "  C) exercises + create_template_from_exercises=false: one-time inline workout, no template created.\n\n"
        "RECURRING SERIES — only if the user explicitly wants recurrence:\n"
        "  Set is_recurring=true, provide recurrence_type, and for weekly also recurrence_days.\n"
        "  Optionally set recurrence_end_date if the user specified one."
    )
    parameters = {
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "description": "Workout date (YYYY-MM-DD). For recurring series, this is the series start date.",
            },
            "name": {
                "type": "string",
                "description": "Workout name (e.g. 'Push Day A', 'Long Run').",
            },
            **_TEMPLATE_OR_EXERCISES_PROPS,
            "type": {
                "type": "string",
                "description": "Workout category (e.g. 'strength', 'run', 'mobility'). Omit if unknown.",
            },
            "notes": {
                "type": "string",
                "description": "Optional notes. Omit if none.",
            },
            **_RECURRENCE_PROPS,
        },
        "required": ["date", "name"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        workout_date = args.get("date")
        name = (args.get("name") or "").strip()

        if not workout_date or not name:
            return json.dumps({"error": "date and name are required"})

        existing = await db.planned_workouts.find_one(
            {"user_id": user_id, "date": workout_date, "name": name}
        )
        if existing:
            return json.dumps(
                {
                    "already_exists": True,
                    "id": str(existing["_id"]),
                    "template_id": existing.get("template_id"),
                    "message": "A workout with this name already exists on that date.",
                }
            )

        template_id, inline_exercises, created_template_id, error = (
            await _resolve_template_or_exercises(args, db, user_id, name)
        )
        if error:
            return json.dumps({"error": error})

        is_recurring = bool(args.get("is_recurring", False))

        planned_workout: Dict[str, Any] = {
            "user_id": user_id,
            "date": workout_date,
            "name": name,
            "template_id": template_id,
            "inline_exercises": inline_exercises,
            "type": args.get("type"),
            "notes": args.get("notes"),
            "status": "planned",
            "order": 0,
            "is_recurring": is_recurring,
            "is_override": False,
            "original_date": None,
            "recurrence_parent_id": None,
            "created_at": datetime.utcnow(),
        }

        if is_recurring:
            planned_workout["recurrence_type"] = args.get("recurrence_type")
            planned_workout["recurrence_days"] = args.get("recurrence_days")
            planned_workout["recurrence_end_date"] = args.get("recurrence_end_date")

        insert_res = await db.planned_workouts.insert_one(planned_workout)

        msg = f"Scheduled '{name}' for {workout_date}"
        if created_template_id:
            msg += f" (created template {created_template_id})"
        elif inline_exercises is not None:
            msg += " (one-time inline workout; no template created)"
        elif template_id:
            msg += f" (using template {template_id})"
        if is_recurring:
            msg += f" — recurring {args.get('recurrence_type')}"

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
        "Update a scheduled workout or recurring series rule.\n\n"
        "Use this tool to modify:\n"
        "  - A one-off scheduled workout (change date, name, template, exercises, notes, status, etc.)\n"
        "  - A recurring series rule (change recurrence config, template, name — affects all future occurrences)\n\n"
        "IMPORTANT — do NOT use this to modify a single occurrence of a recurring series. "
        "Use schedule__patch_occurrence for that.\n\n"
        "WORKOUT CONTENT — optionally update content by providing exactly one of:\n"
        "  A) template_id only: switch to an existing template.\n"
        "  B) exercises + create_template_from_exercises=true: create a new template from exercises.\n"
        "  C) exercises + create_template_from_exercises=false: overwrite with inline exercises only.\n"
        "  D) Neither: leave existing content unchanged.\n\n"
        "Only fields explicitly provided will be updated. Omit fields you do not want to change."
    )
    parameters = {
        "type": "object",
        "properties": {
            "workout_id": {
                "type": "string",
                "description": "ID of the scheduled workout or series rule to update (from schedule__get).",
            },
            "date": {
                "type": "string",
                "description": "New date (YYYY-MM-DD). Omit if unchanged.",
            },
            "name": {"type": "string", "description": "New name. Omit if unchanged."},
            **_TEMPLATE_OR_EXERCISES_PROPS,
            "type": {
                "type": "string",
                "description": "Workout category. Omit if unchanged.",
            },
            "notes": {
                "type": "string",
                "description": "Updated notes. Omit if unchanged.",
            },
            "status": {
                "type": "string",
                "enum": ["planned", "in_progress", "completed", "skipped"],
                "description": "Updated status. Only meaningful for one-off workouts. Omit if unchanged.",
            },
            "order": {
                "type": "integer",
                "description": "Sort order within the day. Omit if unchanged.",
            },
            **_RECURRENCE_PROPS,
        },
        "required": ["workout_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        workout_id = args.get("workout_id")
        if not workout_id or not ObjectId.is_valid(workout_id):
            return json.dumps(
                {"error": f"Valid workout_id is required. Received: {workout_id}"}
            )
        oid = ObjectId(workout_id)

        existing_workout = await db.planned_workouts.find_one(
            {"_id": oid, "user_id": user_id}
        )
        if not existing_workout:
            return json.dumps({"error": "Scheduled workout not found."})

        update_fields: Dict[str, Any] = {}

        for field in ["date", "name", "type", "notes", "status", "order"]:
            if field in args:
                val = args[field]
                if isinstance(val, str) and not val.strip():
                    continue
                update_fields[field] = val

        for field in [
            "is_recurring",
            "recurrence_type",
            "recurrence_days",
            "recurrence_end_date",
        ]:
            if field in args:
                update_fields[field] = (
                    bool(args[field]) if field == "is_recurring" else args[field]
                )

        workout_name = (
            args.get("name") or existing_workout.get("name") or "Workout"
        ).strip()
        template_id, inline_exercises, created_template_id, error = (
            await _resolve_template_or_exercises(
                args, db, user_id, workout_name, is_update=True
            )
        )
        if error:
            return json.dumps({"error": error})

        if template_id is not None:
            update_fields["template_id"] = template_id
            update_fields["inline_exercises"] = None
        elif inline_exercises is not None:
            update_fields["template_id"] = None
            update_fields["inline_exercises"] = inline_exercises

        if not update_fields:
            return json.dumps({"error": "No fields to update."})

        update_fields["updated_at"] = datetime.utcnow()

        res = await db.planned_workouts.update_one(
            {"_id": oid, "user_id": user_id}, {"$set": update_fields}
        )
        if res.matched_count == 0:
            return json.dumps({"error": "Scheduled workout not found."})

        return json.dumps(
            {
                "success": True,
                "message": "Workout updated successfully.",
                "template_id": update_fields.get(
                    "template_id", existing_workout.get("template_id")
                ),
                "created_template_id": created_template_id,
            },
            default=str,
        )


class ScheduleDeleteWorkout(BaseTool):
    name = "schedule__delete_workout"
    description = (
        "Delete a scheduled workout or recurring series rule.\n\n"
        "- For a one-off workout: permanently removes it from the schedule.\n"
        "- For a recurring series rule: permanently removes the entire series "
        "(all future occurrences will no longer appear). "
        "If you only want to remove a single occurrence, use schedule__patch_occurrence with status=skipped instead.\n\n"
        "WARNING: If the workout_id belongs to an override document (from schedule__get overrides[]), "
        "deleting it will RESTORE the original series occurrence for that date — it will NOT cancel it. "
        "If the user wants to cancel or skip that occurrence, use schedule__patch_occurrence with status=skipped instead.\n\n"
        "Use the workout_id (or series_id for rules) from schedule__get."
    )
    parameters = {
        "type": "object",
        "properties": {
            "workout_id": {
                "type": "string",
                "description": "ID of the workout or series rule to delete.",
            }
        },
        "required": ["workout_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        workout_id = args.get("workout_id")
        if not workout_id or not ObjectId.is_valid(workout_id):
            return json.dumps(
                {"error": f"Valid workout_id is required. Received: {workout_id}"}
            )
        oid = ObjectId(workout_id)

        res = await db.planned_workouts.delete_one({"_id": oid, "user_id": user_id})
        if res.deleted_count == 0:
            return json.dumps(
                {
                    "success": True,
                    "already_deleted": True,
                    "message": "Workout not found or already deleted.",
                }
            )

        return json.dumps(
            {"success": True, "message": f"Deleted workout {workout_id}."}
        )


class SchedulePatchOccurrence(BaseTool):
    name = "schedule__patch_occurrence"
    description = (
        "Modify or cancel a single occurrence of a recurring series without affecting the rest of the series.\n\n"
        "Use this when the user wants to:\n"
        "  - Cancel or skip one occurrence — use status=skipped. "
        "This is the CORRECT tool when the user says 'cancel', 'skip', or 'remove' a single occurrence of a recurring series. "
        "Do NOT use schedule__delete_workout for this.\n"
        "  - Move one occurrence to a different date (set new_date)\n"
        "  - Change the workout content for one occurrence (set template_id or exercises)\n"
        "  - Any combination of the above for a single date\n\n"
        "This tool creates a one-time override for that occurrence. "
        "All other occurrences of the series remain unchanged.\n\n"
        "To modify the series rule itself (affecting all occurrences), use schedule__update_workout instead.\n"
        "To permanently remove the entire series, use schedule__delete_workout instead.\n"
        "To cancel a one-off (non-recurring) workout, use schedule__delete_workout instead.\n\n"
        "NOTE: If an override already exists for this (series_id, date) pair, it will be replaced."
    )
    parameters = {
        "type": "object",
        "properties": {
            "series_id": {
                "type": "string",
                "description": "The series_id of the recurring rule (from schedule__get rules[].series_id).",
            },
            "date": {
                "type": "string",
                "description": "The date of the specific occurrence to modify (YYYY-MM-DD).",
            },
            "new_date": {
                "type": "string",
                "description": (
                    "Move this occurrence to a different date (YYYY-MM-DD). "
                    "Omit if not moving it."
                ),
            },
            "status": {
                "type": "string",
                "enum": ["planned", "in_progress", "completed", "skipped"],
                "description": "Set to 'skipped' to skip this occurrence. Omit to leave as planned.",
            },
            "name": {
                "type": "string",
                "description": "Override the workout name for this occurrence only. Omit if unchanged.",
            },
            **_TEMPLATE_OR_EXERCISES_PROPS,
            "type": {
                "type": "string",
                "description": "Override workout category for this occurrence only. Omit if unchanged.",
            },
            "notes": {
                "type": "string",
                "description": "Override notes for this occurrence only. Omit if unchanged.",
            },
        },
        "required": ["series_id", "date"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        series_id = args.get("series_id")
        original_date = args.get("date")
        new_date = args.get("new_date") or original_date

        if not series_id or not ObjectId.is_valid(series_id):
            return json.dumps(
                {"error": f"Valid series_id is required. Received: {series_id}"}
            )

        if not original_date:
            return json.dumps({"error": "date is required."})

        # Verify the series exists and belongs to this user
        series = await db.planned_workouts.find_one(
            {
                "_id": ObjectId(series_id),
                "user_id": user_id,
                "is_recurring": True,
            }
        )
        if not series:
            return json.dumps({"error": "Recurring series not found."})

        # Resolve workout content (falls back to series template if nothing provided)
        override_name = (args.get("name") or series.get("name") or "Workout").strip()
        template_id, inline_exercises, created_template_id, error = (
            await _resolve_template_or_exercises(
                args, db, user_id, override_name, is_update=True
            )
        )
        if error:
            return json.dumps({"error": error})

        # Fall back to series content if nothing was overridden
        resolved_template_id = (
            template_id if template_id is not None else series.get("template_id")
        )
        resolved_inline = inline_exercises  # None means use template

        # Remove any existing override for this occurrence before inserting new one
        await db.planned_workouts.delete_one(
            {
                "user_id": user_id,
                "is_override": True,
                "recurrence_parent_id": series_id,
                "original_date": original_date,
            }
        )

        override_doc: Dict[str, Any] = {
            "user_id": user_id,
            "date": new_date,
            "name": override_name,
            "template_id": resolved_template_id,
            "inline_exercises": resolved_inline,
            "type": args.get("type") or series.get("type"),
            "notes": args.get("notes") or series.get("notes"),
            "status": args.get("status", "planned"),
            "order": 0,
            "is_recurring": False,
            "is_override": True,
            "original_date": original_date,
            "recurrence_parent_id": series_id,
            "created_at": datetime.utcnow(),
        }

        insert_res = await db.planned_workouts.insert_one(override_doc)

        action_parts = []
        if args.get("status") == "skipped":
            action_parts.append("skipped")
        if new_date != original_date:
            action_parts.append(f"moved to {new_date}")
        if created_template_id:
            action_parts.append(f"new template created ({created_template_id})")
        elif template_id:
            action_parts.append(f"template overridden ({template_id})")
        elif inline_exercises is not None:
            action_parts.append("inline exercises set")

        action_summary = (
            ", ".join(action_parts) if action_parts else "occurrence overridden"
        )
        msg = f"Occurrence on {original_date} of series '{series.get('name')}': {action_summary}."

        return json.dumps(
            {
                "success": True,
                "override_id": str(insert_res.inserted_id),
                "series_id": series_id,
                "original_date": original_date,
                "new_date": new_date,
                "created_template_id": created_template_id,
                "message": msg,
            }
        )
