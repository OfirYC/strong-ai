"""AI Chat service with tool support for workout coaching"""
import json
import logging
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timedelta

from pydantic import BaseModel
from bson import ObjectId

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import existing OpenAI client from ai_profile
from services.ai_profile import client
from models import UserProfile, ProfileInsights, PlannedWorkoutCreate


class ChatMessage(BaseModel):
  """Chat message model"""
  role: Literal["system", "user", "assistant", "tool"]
  content: str
  tool_name: Optional[str] = None
  tool_call_id: Optional[str] = None

  class Config:
      use_enum_values = True


class ChatRequest(BaseModel):
  """Request model for chat endpoint"""
  messages: List[ChatMessage]


class ChatResponse(BaseModel):
  """Response model for chat endpoint"""
  messages: List[ChatMessage]


# Tool definitions for OpenAI
TOOLS = [
  {
      "type": "function",
      "function": {
          "name": "get_user_context",
          "description": "Fetches the complete user profile context including personal info, goals, injuries, insights, and training history summary. Use this to understand the user's full background.",
          "parameters": {
              "type": "object",
              "properties": {},
              "required": []
          }
      }
  },
  {
      "type": "function",
      "function": {
          "name": "get_exercises",
          "description": "Fetches ALL available exercises from the database in ONE call. Call this ONCE without any filters to get the full list, then pick what you need from the results. Do NOT call this multiple times for individual exercises.",
          "parameters": {
              "type": "object",
              "properties": {
                  "body_part": {
                      "type": "string",
                      "description": "Optional: Filter by body part (e.g., 'Chest', 'Back', 'Legs')"
                  }
              },
              "required": []
          }
      }
  },
  {
      "type": "function",
      "function": {
          "name": "create_exercises_batch",
          "description": "Creates multiple new exercises at once. Use this to create ALL missing exercises in a single call instead of one by one.",
          "parameters": {
              "type": "object",
              "properties": {
                  "exercises": {
                      "type": "array",
                      "description": "Array of exercises to create",
                      "items": {
                          "type": "object",
                          "properties": {
                              "name": {"type": "string", "description": "Exercise name"},
                              "exercise_kind": {
                                  "type": "string",
                                  "enum": [
                                      "Barbell",
                                      "Dumbbell",
                                      "Cable",
                                      "Machine",
                                      "Bodyweight",
                                      "Kettlebell",
                                      "Band",
                                      "Other",
                                  ],
                              },
                              "primary_body_parts": {
                                  "type": "array",
                                  "items": {"type": "string"},
                              },
                              "secondary_body_parts": {
                                  "type": "array",
                                  "items": {"type": "string"},
                              },
                              "category": {
                                  "type": "string",
                                  "enum": [
                                      "Strength",
                                      "Cardio",
                                      "Mobility",
                                      "Core",
                                      "Full Body",
                                  ],
                              },
                          },
                          "required": [
                              "name",
                              "exercise_kind",
                              "primary_body_parts",
                              "category",
                          ],
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
          "name": "create_exercise",
          "description": "Creates a single new exercise. Prefer create_exercises_batch when creating multiple exercises.",
          "parameters": {
              "type": "object",
              "properties": {
                  "name": {
                      "type": "string",
                      "description": "Exercise name (e.g., 'Romanian Deadlift', 'Hip Thrust')",
                  },
                  "exercise_kind": {
                      "type": "string",
                      "enum": [
                          "Barbell",
                          "Dumbbell",
                          "Cable",
                          "Machine",
                          "Bodyweight",
                          "Kettlebell",
                          "Band",
                          "Other",
                      ],
                      "description": "Type of equipment used",
                  },
                  "primary_body_parts": {
                      "type": "array",
                      "items": {"type": "string"},
                      "description": "Primary muscles worked (e.g., ['Legs'], ['Back'], ['Chest', 'Shoulders'])",
                  },
                  "secondary_body_parts": {
                      "type": "array",
                      "items": {"type": "string"},
                      "description": "Secondary muscles worked (optional)",
                  },
                  "category": {
                      "type": "string",
                      "enum": ["Strength", "Cardio", "Mobility", "Core", "Full Body"],
                      "description": "Exercise category",
                  },
              },
              "required": ["name", "exercise_kind", "primary_body_parts", "category"],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "get_workout_history",
          "description": "Retrieves recent completed workout sessions with summaries. Use this to see what workouts the user has done recently.",
          "parameters": {
              "type": "object",
              "properties": {
                  "days_back": {
                      "type": "integer",
                      "description": "Number of days to look back",
                      "default": 14,
                  },
                  "limit": {
                      "type": "integer",
                      "description": "Maximum number of workouts to return",
                      "default": 20,
                  },
              },
              "required": [],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "get_schedule",
          "description": "Fetches planned/scheduled workouts for a date range. Use this to see what the user has planned.",
          "parameters": {
              "type": "object",
              "properties": {
                  "start_date": {
                      "type": "string",
                      "description": "Start date in YYYY-MM-DD format",
                  },
                  "end_date": {
                      "type": "string",
                      "description": "End date in YYYY-MM-DD format",
                  },
              },
              "required": ["start_date", "end_date"],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "update_profile_insights",
          "description": "Updates specific fields in the user's profile insights (injuries, strengths, weaknesses, etc.). Use this when the user shares new information about their training, injuries, or goals.",
          "parameters": {
              "type": "object",
              "properties": {
                  "injury_tags": {
                      "type": "array",
                      "items": {"type": "string"},
                      "description": "Updated list of injury tags",
                  },
                  "current_issues": {
                      "type": "array",
                      "items": {"type": "string"},
                      "description": "Updated list of current issues",
                  },
                  "strength_tags": {
                      "type": "array",
                      "items": {"type": "string"},
                      "description": "Updated list of strengths",
                  },
                  "weak_point_tags": {
                      "type": "array",
                      "items": {"type": "string"},
                      "description": "Updated list of weak points",
                  },
                  "psych_profile": {
                      "type": "string",
                      "description": "Updated psychological profile",
                  },
              },
              "required": [],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "create_planned_workout",
          "description": """Creates a new planned/scheduled workout for a specific date. 

IMPORTANT: You must provide EITHER 'template_id' (for existing templates) OR 'exercises' array (to create a new template automatically).

When you provide 'exercises', the system will:
1. Create a new reusable workout template with those exercises
2. Link it to the planned workout
3. The user can then reuse this template in the future

Always use get_exercises first to get the correct exercise IDs before creating a workout with exercises.""",
          "parameters": {
              "type": "object",
              "properties": {
                  "date": {
                      "type": "string",
                      "description": "Workout date in YYYY-MM-DD format",
                  },
                  "name": {
                      "type": "string",
                      "description": "Workout name (also used as template name if exercises are provided)",
                  },
                  "template_id": {
                      "type": "string",
                      "description": "ID of an existing workout template to use. Use this if the user wants to schedule an existing routine.",
                  },
                  "exercises": {
                      "type": "array",
                      "description": "Array of exercises to include. When provided, a new template will be created automatically. Get exercise IDs from get_exercises first!",
                      "items": {
                          "type": "object",
                          "properties": {
                              "exercise_id": {
                                  "type": "string",
                                  "description": "ID of the exercise (from get_exercises)",
                              },
                              "sets": {
                                  "type": "integer",
                                  "description": "Number of sets (default: 3)",
                              },
                              "reps": {
                                  "type": "integer",
                                  "description": "Target reps per set (default: 10)",
                              },
                              "weight": {
                                  "type": "number",
                                  "description": "Target weight in kg (optional)",
                              },
                              "notes": {
                                  "type": "string",
                                  "description": "Notes for this exercise (optional)",
                              },
                          },
                          "required": ["exercise_id"],
                      },
                  },
                  "type": {
                      "type": "string",
                      "description": "Workout type (e.g., 'strength', 'cardio', 'mobility')",
                  },
                  "notes": {
                      "type": "string",
                      "description": "Additional notes or instructions",
                  },
                  "is_recurring": {
                      "type": "boolean",
                      "description": "Whether this is a recurring workout",
                      "default": False,
                  },
                  "recurrence_type": {
                      "type": "string",
                      "enum": ["daily", "weekly", "monthly"],
                      "description": "Type of recurrence (required if is_recurring=true)",
                  },
                  "recurrence_days": {
                      "type": "array",
                      "items": {"type": "integer"},
                      "description": "For weekly: array of weekday indices [0=Mon, 1=Tue, ..., 6=Sun]",
                  },
                  "recurrence_end_date": {
                      "type": "string",
                      "description": "End date for recurring workouts in YYYY-MM-DD format (null = indefinite)",
                  },
              },
              "required": ["date", "name"],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "get_user_templates",
          "description": "Fetches the user's existing workout templates. Use this to see what routines the user has already created, so you can schedule them instead of creating new ones.",
          "parameters": {
              "type": "object",
              "properties": {},
              "required": [],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "update_planned_workout",
          "description": """Updates an existing planned workout. Can modify date, name, type, notes, status, template, or exercises.

To change the workout's exercises, you can either:
1. Provide a different template_id (to use an existing template)
2. Provide a new exercises array (will create a new template and link it)

If changing exercises, the old template remains unchanged (user may want to keep it for other workouts).""",
          "parameters": {
              "type": "object",
              "properties": {
                  "workout_id": {
                      "type": "string",
                      "description": "ID of the planned workout to update",
                  },
                  "date": {
                      "type": "string",
                      "description": "New workout date in YYYY-MM-DD format",
                  },
                  "name": {
                      "type": "string",
                      "description": "New workout name",
                  },
                  "template_id": {
                      "type": "string",
                      "description": "ID of a different existing template to use",
                  },
                  "exercises": {
                      "type": "array",
                      "description": "New exercises array - will create a new template automatically",
                      "items": {
                          "type": "object",
                          "properties": {
                              "exercise_id": {"type": "string"},
                              "sets": {"type": "integer"},
                              "reps": {"type": "integer"},
                              "weight": {"type": "number"},
                              "notes": {"type": "string"},
                          },
                          "required": ["exercise_id"],
                      },
                  },
                  "type": {
                      "type": "string",
                      "description": "New workout type",
                  },
                  "notes": {
                      "type": "string",
                      "description": "New notes",
                  },
                  "status": {
                      "type": "string",
                      "enum": ["planned", "in_progress", "completed", "skipped"],
                      "description": "New status",
                  },
                  "order": {
                      "type": "integer",
                      "description": "New display order",
                  },
              },
              "required": ["workout_id"],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "delete_planned_workout",
          "description": "Permanently deletes a planned/scheduled workout from the user's schedule. Use this when the user wants to completely remove a workout from their schedule (not just skip it).",
          "parameters": {
              "type": "object",
              "properties": {
                  "workout_id": {
                      "type": "string",
                      "description": "ID of the planned workout to delete",
                  }
              },
              "required": ["workout_id"],
          },
      },
  },
  {
      "type": "function",
      "function": {
          "name": "update_template",
          "description": """Updates an existing workout template's exercises. Use this to modify the exercises in a reusable template.

IMPORTANT: This modifies the template itself, which affects ALL future workouts using this template. 
Only use this when the user explicitly wants to change the template, not just a single scheduled workout.

For changing just one scheduled workout's exercises, use update_planned_workout with a new exercises array instead.""",
          "parameters": {
              "type": "object",
              "properties": {
                  "template_id": {
                      "type": "string",
                      "description": "ID of the template to update",
                  },
                  "name": {
                      "type": "string",
                      "description": "New template name (optional)",
                  },
                  "notes": {
                      "type": "string",
                      "description": "New template notes (optional)",
                  },
                  "exercises": {
                      "type": "array",
                      "description": "New exercises array - REPLACES all existing exercises",
                      "items": {
                          "type": "object",
                          "properties": {
                              "exercise_id": {
                                  "type": "string",
                                  "description": "ID of the exercise (from get_exercises)",
                              },
                              "sets": {
                                  "type": "integer",
                                  "description": "Number of sets (default: 3)",
                              },
                              "reps": {
                                  "type": "integer",
                                  "description": "Target reps per set (default: 10)",
                              },
                              "weight": {
                                  "type": "number",
                                  "description": "Target weight in kg (optional)",
                              },
                              "notes": {
                                  "type": "string",
                                  "description": "Notes for this exercise (optional)",
                              },
                          },
                          "required": ["exercise_id"],
                      },
                  },
              },
              "required": ["template_id"],
          },
      },
  },
]


async def execute_tool(tool_name: str, arguments: Dict[str, Any], db, user_id: str) -> str:
  """
  Execute a tool function and return the result as a string.
  """
  try:
      if tool_name == "get_user_context":
          # Fetch user profile
          user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
          if not user_doc:
              return json.dumps({"error": "User not found"})

          profile_data = user_doc.get("profile", {})
          if not profile_data:
              profile_doc = await db.profiles.find_one({"user_id": user_id})
              profile_data = profile_doc if profile_doc else {}

          insights_data = profile_data.get("insights", {})
          if not insights_data:
              insights_doc = await db.profile_insights.find_one({"user_id": user_id})
              insights_data = insights_doc if insights_doc else {}

          context = {
              "user": {"email": user_doc.get("email")},
              "profile": profile_data,
              "insights": insights_data,
          }

          if context["profile"] and "_id" in context["profile"]:
              context["profile"]["id"] = str(context["profile"]["_id"])
              del context["profile"]["_id"]
          if context["insights"] and "_id" in context["insights"]:
              context["insights"]["id"] = str(context["insights"]["_id"])
              del context["insights"]["_id"]

          return json.dumps(context, default=str)

      elif tool_name == "get_workout_history":
          days_back = arguments.get("days_back", 14)
          limit = arguments.get("limit", 20)

          end_date = datetime.utcnow()
          start_date = end_date - timedelta(days=days_back)

          workouts = (
              await db.workouts.find(
                  {
                      "user_id": user_id,
                      "ended_at": {"$ne": None},
                      "started_at": {"$gte": start_date, "$lte": end_date},
                  }
              )
              .sort("started_at", -1)
              .limit(limit)
              .to_list(limit)
          )

          summaries = []
          for w in workouts:
              total_volume = 0
              for ex in w.get("exercises", []):
                  for set_data in ex.get("sets", []):
                      if set_data.get("weight") and set_data.get("reps"):
                          total_volume += set_data["weight"] * set_data["reps"]

              summaries.append(
                  {
                      "id": str(w["_id"]),
                      "name": w.get("name", "Workout"),
                      "started_at": w["started_at"].isoformat()
                      if w.get("started_at")
                      else None,
                      "ended_at": w["ended_at"].isoformat()
                      if w.get("ended_at")
                      else None,
                      "total_volume": round(total_volume, 2),
                      "exercise_count": len(w.get("exercises", [])),
                      "notes": w.get("notes"),
                  }
              )

          return json.dumps(summaries)

      elif tool_name == "get_schedule":
          start_date = arguments.get("start_date")
          end_date = arguments.get("end_date")

          if not start_date or not end_date:
              return json.dumps({"error": "start_date and end_date are required"})

          planned_workouts = await db.planned_workouts.find(
              {"user_id": user_id}
          ).to_list(1000)

          from server import expand_recurring_workouts, enrich_planned_workouts_with_sessions

          for pw in planned_workouts:
              pw["id"] = str(pw["_id"])

          expanded = expand_recurring_workouts(planned_workouts, start_date, end_date)
          enriched = await enrich_planned_workouts_with_sessions(expanded, user_id)

          schedule = []
          for pw in enriched:
              is_recurring = pw.get("is_recurring", False)
              deletable_id = (
                  pw.get("recurrence_parent_id") if is_recurring else pw.get("id")
              )

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

      elif tool_name == "update_profile_insights":
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
          for field in [
              "injury_tags",
              "current_issues",
              "strength_tags",
              "weak_point_tags",
              "psych_profile",
          ]:
              if field in arguments:
                  update_fields[field] = arguments[field]

          if update_fields:
              await db.profile_insights.update_one(
                  {"user_id": user_id},
                  {"$set": update_fields},
                  upsert=True,
              )

          updated = await db.profile_insights.find_one({"user_id": user_id})
          if updated and "_id" in updated:
              updated["id"] = str(updated["_id"])
              del updated["_id"]

          return json.dumps(updated or {}, default=str)

      elif tool_name == "get_exercises":
          body_part = arguments.get("body_part")

          base_query: Dict[str, Any] = {
              "$or": [
                  {"user_id": {"$exists": False}},
                  {"user_id": None},
                  {"user_id": user_id},
              ]
          }

          if body_part:
              base_query["$and"] = [
                  {
                      "$or": [
                          {"primary_body_parts": {"$regex": body_part, "$options": "i"}},
                          {"secondary_body_parts": {"$regex": body_part, "$options": "i"}},
                      ]
                  }
              ]

          exercises = await db.exercises.find(base_query).to_list(500)

          result = []
          for ex in exercises:
              result.append(
                  {
                      "id": str(ex["_id"]),
                      "name": ex.get("name"),
                      "exercise_kind": ex.get("exercise_kind"),
                      "primary_body_parts": ex.get("primary_body_parts", []),
                      "category": ex.get("category"),
                  }
              )

          return json.dumps(result)

      elif tool_name == "create_exercises_batch":
          exercises_to_create = arguments.get("exercises", [])

          if not exercises_to_create:
              return json.dumps({"error": "No exercises provided"})

          results = []
          for ex_data in exercises_to_create:
              name = ex_data.get("name")
              if not name:
                  continue

              existing = await db.exercises.find_one(
                  {"name": {"$regex": f"^{name}$", "$options": "i"}}
              )

              if existing:
                  results.append(
                      {
                          "name": name,
                          "id": str(existing["_id"]),
                          "status": "exists",
                      }
                  )
              else:
                  exercise_doc = {
                      "name": name,
                      "exercise_kind": ex_data.get("exercise_kind", "Other"),
                      "primary_body_parts": ex_data.get("primary_body_parts", []),
                      "secondary_body_parts": ex_data.get("secondary_body_parts", []),
                      "category": ex_data.get("category", "Strength"),
                      "is_custom": True,
                      "user_id": user_id,
                      "created_at": datetime.utcnow(),
                  }
                  result = await db.exercises.insert_one(exercise_doc)
                  results.append(
                      {
                          "name": name,
                          "id": str(result.inserted_id),
                          "status": "created",
                      }
                  )

          return json.dumps(
              {
                  "success": True,
                  "exercises": results,
                  "message": f"Processed {len(results)} exercises",
              }
          )

      elif tool_name == "get_user_templates":
          templates = await db.templates.find({"user_id": user_id}).to_list(100)

          result = []
          for t in templates:
              result.append(
                  {
                      "id": str(t["_id"]),
                      "name": t.get("name"),
                      "notes": t.get("notes"),
                      "exercise_count": len(t.get("exercises", [])),
                  }
              )

          return json.dumps(result)

      elif tool_name == "create_exercise":
          name = arguments.get("name")
          exercise_kind = arguments.get("exercise_kind")
          primary_body_parts = arguments.get("primary_body_parts", [])
          category = arguments.get("category")

          if not name or not exercise_kind or not primary_body_parts or not category:
              return json.dumps(
                  {
                      "error": "name, exercise_kind, primary_body_parts, and category are required"
                  }
              )

          existing = await db.exercises.find_one(
              {"name": {"$regex": f"^{name}$", "$options": "i"}}
          )

          if existing:
              return json.dumps(
                  {
                      "exists": True,
                      "id": str(existing["_id"]),
                      "name": existing["name"],
                      "message": f"Exercise '{existing['name']}' already exists",
                  }
              )

          exercise_doc = {
              "name": name,
              "exercise_kind": exercise_kind,
              "primary_body_parts": primary_body_parts,
              "secondary_body_parts": arguments.get("secondary_body_parts", []),
              "category": category,
              "is_custom": True,
              "user_id": user_id,
              "created_at": datetime.utcnow(),
          }

          result = await db.exercises.insert_one(exercise_doc)

          return json.dumps(
              {
                  "success": True,
                  "id": str(result.inserted_id),
                  "name": name,
                  "message": f"Created new exercise '{name}'",
              }
          )

      elif tool_name == "create_planned_workout":
          if "date" not in arguments or "name" not in arguments:
              return json.dumps({"error": "date and name are required"})

          workout_date = arguments["date"]
          workout_name = arguments["name"]

          existing = await db.planned_workouts.find_one(
              {"user_id": user_id, "date": workout_date, "name": workout_name}
          )

          if existing:
              return json.dumps(
                  {
                      "already_exists": True,
                      "id": str(existing["_id"]),
                      "template_id": existing.get("template_id"),
                      "message": (
                          f"Workout '{workout_name}' already exists for {workout_date}. "
                          f"Use update_planned_workout to modify it."
                      ),
                  }
              )

          template_id = arguments.get("template_id")
          exercises = arguments.get("exercises")

          if exercises and not template_id:
              template_exercises = []
              for i, ex in enumerate(exercises):
                  exercise_id = ex.get("exercise_id")
                  if not exercise_id:
                      continue

                  num_sets = ex.get("sets", 3)
                  reps = ex.get("reps", 10)
                  weight = ex.get("weight")
                  notes = ex.get("notes")

                  sets = []
                  for _ in range(num_sets):
                      set_item = {"reps": reps, "is_warmup": False}
                      if weight:
                          set_item["weight"] = weight
                      sets.append(set_item)

                  template_exercises.append(
                      {
                          "exercise_id": exercise_id,
                          "order": i,
                          "sets": sets,
                          "notes": notes,
                          "default_sets": num_sets,
                          "default_reps": reps,
                          "default_weight": weight,
                      }
                  )

              template_doc = {
                  "user_id": user_id,
                  "name": arguments["name"],
                  "notes": arguments.get("notes") or "Created by AI Coach",
                  "exercises": template_exercises,
                  "created_at": datetime.utcnow(),
                  "updated_at": datetime.utcnow(),
              }

              template_result = await db.templates.insert_one(template_doc)
              template_id = str(template_result.inserted_id)

          planned_workout = {
              "user_id": user_id,
              "date": arguments["date"],
              "name": arguments["name"],
              "template_id": template_id,
              "type": arguments.get("type"),
              "notes": arguments.get("notes"),
              "status": "planned",
              "order": 0,
              "is_recurring": arguments.get("is_recurring", False),
              "created_at": datetime.utcnow(),
          }

          if planned_workout["is_recurring"]:
              planned_workout["recurrence_type"] = arguments.get("recurrence_type")
              planned_workout["recurrence_days"] = arguments.get("recurrence_days")
              planned_workout["recurrence_end_date"] = arguments.get(
                  "recurrence_end_date"
              )

          result = await db.planned_workouts.insert_one(planned_workout)

          message = f"Created planned workout '{arguments['name']}' for {arguments['date']}"
          if exercises and template_id:
              message += (
                  f". Also created a new reusable template (ID: {template_id}) "
                  f"with {len(exercises)} exercises."
              )

          return json.dumps(
              {
                  "success": True,
                  "id": str(result.inserted_id),
                  "template_id": template_id,
                  "message": message,
              }
          )

      elif tool_name == "update_planned_workout":
          workout_id = arguments.get("workout_id")

          if not workout_id or not ObjectId.is_valid(workout_id):
              return json.dumps({"error": "Valid workout_id is required"})

          update_fields: Dict[str, Any] = {}
          for field in ["date", "name", "type", "notes", "status", "order"]:
              if field in arguments:
                  update_fields[field] = arguments[field]

          if "template_id" in arguments:
              update_fields["template_id"] = arguments["template_id"]

          exercises = arguments.get("exercises")
          if exercises:
              existing_workout = await db.planned_workouts.find_one(
                  {"_id": ObjectId(workout_id), "user_id": user_id}
              )

              if not existing_workout:
                  return json.dumps({"error": "Planned workout not found"})

              workout_name = arguments.get("name") or existing_workout.get(
                  "name", "Workout"
              )

              template_exercises = []
              for i, ex in enumerate(exercises):
                  exercise_id = ex.get("exercise_id")
                  if not exercise_id:
                      continue

                  num_sets = ex.get("sets", 3)
                  reps = ex.get("reps", 10)
                  weight = ex.get("weight")
                  notes = ex.get("notes")

                  sets = []
                  for _ in range(num_sets):
                      set_item = {"reps": reps, "is_warmup": False}
                      if weight:
                          set_item["weight"] = weight
                      sets.append(set_item)

                  template_exercises.append(
                      {
                          "exercise_id": exercise_id,
                          "order": i,
                          "sets": sets,
                          "notes": notes,
                          "default_sets": num_sets,
                          "default_reps": reps,
                          "default_weight": weight,
                      }
                  )

              template_doc = {
                  "user_id": user_id,
                  "name": f"{workout_name} (Modified)",
                  "notes": "Created from workout modification",
                  "exercises": template_exercises,
                  "created_at": datetime.utcnow(),
                  "updated_at": datetime.utcnow(),
              }

              template_result = await db.templates.insert_one(template_doc)
              update_fields["template_id"] = str(template_result.inserted_id)

          if not update_fields:
              return json.dumps({"error": "No fields to update"})

          result = await db.planned_workouts.update_one(
              {"_id": ObjectId(workout_id), "user_id": user_id},
              {"$set": update_fields},
          )

          if result.matched_count == 0:
              return json.dumps({"error": "Planned workout not found"})

          message = f"Updated planned workout {workout_id}"
          if exercises:
              message += f". Created new template with {len(exercises)} exercises."

          return json.dumps(
              {
                  "success": True,
                  "message": message,
                  "template_id": update_fields.get("template_id"),
              }
          )

      elif tool_name == "delete_planned_workout":
          workout_id = arguments.get("workout_id")
          logger.info(f"[DEBUG] delete_planned_workout called with workout_id: {workout_id}")

          if not workout_id or not ObjectId.is_valid(workout_id):
              logger.warning(f"[DEBUG] Invalid workout_id: {workout_id}")
              return json.dumps(
                  {"error": f"Valid workout_id is required. Received: {workout_id}"}
              )

          logger.info(
              f"[DEBUG] Attempting to delete workout with _id={workout_id}, user_id={user_id}"
          )
          result = await db.planned_workouts.delete_one(
              {"_id": ObjectId(workout_id), "user_id": user_id}
          )

          logger.info(f"[DEBUG] Delete result: deleted_count={result.deleted_count}")

          if result.deleted_count == 0:
              return json.dumps(
                  {
                      "success": True,
                      "already_deleted": True,
                      "message": (
                          f"Workout {workout_id} was already deleted or doesn't exist. "
                          f"No action needed."
                      ),
                  }
              )

          return json.dumps(
              {
                  "success": True,
                  "message": f"Successfully deleted planned workout {workout_id}",
              }
          )

      elif tool_name == "update_template":
          template_id = arguments.get("template_id")

          if not template_id or not ObjectId.is_valid(template_id):
              return json.dumps({"error": "Valid template_id is required"})

          update_fields: Dict[str, Any] = {"updated_at": datetime.utcnow()}

          if "name" in arguments:
              update_fields["name"] = arguments["name"]

          if "notes" in arguments:
              update_fields["notes"] = arguments["notes"]

          exercises = arguments.get("exercises")
          if exercises:
              template_exercises = []
              for i, ex in enumerate(exercises):
                  exercise_id = ex.get("exercise_id")
                  if not exercise_id:
                      continue

                  num_sets = ex.get("sets", 3)
                  reps = ex.get("reps", 10)
                  weight = ex.get("weight")
                  notes = ex.get("notes")

                  sets = []
                  for _ in range(num_sets):
                      set_item = {"reps": reps, "is_warmup": False}
                      if weight:
                          set_item["weight"] = weight
                      sets.append(set_item)

                  template_exercises.append(
                      {
                          "exercise_id": exercise_id,
                          "order": i,
                          "sets": sets,
                          "notes": notes,
                          "default_sets": num_sets,
                          "default_reps": reps,
                          "default_weight": weight,
                      }
                  )

              update_fields["exercises"] = template_exercises

          if len(update_fields) == 1:
              return json.dumps({"error": "No fields to update"})

          result = await db.templates.update_one(
              {"_id": ObjectId(template_id), "user_id": user_id},
              {"$set": update_fields},
          )

          if result.matched_count == 0:
              return json.dumps({"error": "Template not found"})

          message = f"Updated template {template_id}"
          if exercises:
              message += f" with {len(exercises)} exercises"

          return json.dumps({"success": True, "message": message})

      else:
          return json.dumps({"error": f"Unknown tool: {tool_name}"})

  except Exception as e:
      logger.exception(f"Tool execution error: {tool_name}")
      return json.dumps({"error": str(e)})


def build_system_prompt(user_context: Dict[str, Any]) -> str:
  """
  Build the system prompt with compact user profile context.
  """
  profile = user_context.get("profile", {})
  insights = user_context.get("insights", {})

  sex = profile.get("sex", "not specified")
  dob = profile.get("date_of_birth")
  age = "not specified"
  if dob:
      try:
          if isinstance(dob, str):
              dob_dt = datetime.fromisoformat(dob.replace("Z", "+00:00"))
          else:
              dob_dt = dob
          age = str((datetime.utcnow() - dob_dt).days // 365)
      except Exception:
          pass

  height = profile.get("height_cm")
  weight = profile.get("weight_kg")
  height_weight = f"{height}cm / {weight}kg" if height and weight else "not specified"

  training_age = profile.get("training_age", "not specified")
  goals = profile.get("goals", "not specified")

  injury_tags = insights.get("injury_tags", [])
  current_issues = insights.get("current_issues", [])
  strength_tags = insights.get("strength_tags", [])
  weak_point_tags = insights.get("weak_point_tags", [])
  psych_profile = insights.get("psych_profile", "")

  prompt = f"""You are an expert strength and conditioning coach assistant inside a workout tracking app. You help users with:
- Workout planning and programming
- Exercise selection and technique
- Injury management and recovery
- Progress analysis and adjustments
- Motivation and accountability

TONE & COMMUNICATION STYLE:
- Direct: very - get straight to the point
- Fluff: none - cut the unnecessary words
- Vibe: confident, friendly, casual
- Slang: allowed (light), Israeli style okay
- Detail level: medium-high - enough to be clear, not so much it's overwhelming
- Priority: actionable steps first, science second
- Avoid: generic safety advice, unnecessary disclaimers
- Personality: high-performance coach + no-bullshit friend
- Pacing: fast and efficient
- Goal: give clear direction, remove confusion, reduce uncertainty

USER PROFILE CONTEXT:
- Sex: {sex}
- Age: {age}
- Height/Weight: {height_weight}
- Training Age: {training_age}
- Goals: {goals}
- Injuries: {', '.join(injury_tags) if injury_tags else 'None reported'}
- Current Issues: {', '.join(current_issues) if current_issues else 'None'}
- Strengths: {', '.join(strength_tags) if strength_tags else 'Not specified'}
- Weak Points: {', '.join(weak_point_tags) if weak_point_tags else 'Not specified'}
- Psychological Profile: {psych_profile if psych_profile else 'Not specified'}

IMPORTANT GUIDELINES:
1. Always consider the user's injuries and current issues when giving advice
2. Be concise but thorough - focus on actionable advice
3. ALWAYS respond with text - never send empty messages. If you're working on something, say so.
4. You can create, modify, and DELETE workout schedules using the provided tools

WORKOUT CREATION - SIMPLE EFFICIENT WORKFLOW:
When creating a workout, follow these steps IN ORDER:

STEP 1: Call get_exercises() ONCE with no filters to get ALL available exercises
STEP 2: Look through the results and note which exercises you need are MISSING
STEP 3: If any exercises are missing, call create_exercises_batch() ONCE with ALL missing exercises
STEP 4: Call create_planned_workout() ONCE with all the exercise IDs

IMPORTANT EFFICIENCY RULES:
- Call get_exercises ONCE to get everything, don't search one by one
- Use create_exercises_batch to create ALL missing exercises in ONE call
- Call create_planned_workout exactly ONCE per workout
- Include ALL exercises you told the user about

AVAILABLE TOOLS:
- get_exercises: Get ALL available exercises in one call
- create_exercises_batch: Create multiple missing exercises at once
- create_exercise: Create a single exercise (prefer batch)
- get_user_templates: See user's existing workout routines
- create_planned_workout: Create a scheduled workout with exercises array
- update_planned_workout: Modify a scheduled workout
- delete_planned_workout: Remove a workout from schedule
- get_schedule: Get scheduled workouts (use deletable_id for deletes)
- update_profile_insights: Update user profile

When deleting workouts, use the "deletable_id" from get_schedule results.

Never call the same tool twice in a single response with exactly the same arguments.
If a tool returns 'already_exists' or 'already_deleted', treat that as success and do not retry immediately."""
  return prompt


async def generate_ai_chat_response(
  user_id: str,
  messages: List[ChatMessage],
  db,
) -> List[ChatMessage]:
  """
  Generate AI chat response with tool support.

  This version:
  - Stores full internal conversation (including tools) in db.ai_chat_states.
  - Deduplicates tool calls per round by (tool_name, arguments).
  - Returns only user + assistant text messages to the client.
  """
  import uuid

  request_id = str(uuid.uuid4())[:8]
  logger.info(
      f"[REQ-{request_id}] Starting AI chat for user {user_id} with "
      f"{len(messages)} display messages"
  )

  # 1. Fetch user context for system prompt
  user_doc = await db.users.find_one({"_id": ObjectId(user_id)})

  profile_data = user_doc.get("profile", {}) if user_doc else {}
  if not profile_data:
      profile_doc = await db.profiles.find_one({"user_id": user_id})
      profile_data = profile_doc if profile_doc else {}

  insights_data = profile_data.get("insights", {})
  if not insights_data:
      insights_doc = await db.profile_insights.find_one({"user_id": user_id})
      insights_data = insights_doc if insights_doc else {}

  user_context = {
      "user": user_doc or {},
      "profile": profile_data,
      "insights": insights_data,
  }

  system_prompt = build_system_prompt(user_context)

  # 2. Load internal conversation state from DB if present
  state = await db.ai_chat_states.find_one({"user_id": user_id})
  if state and "internal_messages" in state and state["internal_messages"]:
      current_messages: List[Dict[str, Any]] = list(state["internal_messages"])
      logger.info(
          f"[REQ-{request_id}] Loaded internal state from DB "
          f"(len={len(current_messages)})"
      )
  else:
      current_messages = [{"role": "system", "content": system_prompt}]
      logger.info(
          f"[REQ-{request_id}] No existing state, starting new conversation "
          f"with system prompt only"
      )

  # 3. Append the latest user message from the client history
  #    Assumes each call adds exactly one new user message at the end.
  latest_user_msg = None
  for msg in reversed(messages):
      if msg.role == "user":
          latest_user_msg = msg
          break

  if latest_user_msg is None:
      logger.warning(
          f"[REQ-{request_id}] No user message found in incoming messages; "
          f"nothing to send to OpenAI."
      )
      # Just return messages as-is (no new AI response)
      return messages

  logger.info(
      f"[REQ-{request_id}] Latest user message: "
      f"{latest_user_msg.content[:120]!r}"
  )

  current_messages.append(
      {
          "role": "user",
          "content": latest_user_msg.content,
      }
  )

  logger.info(
      f"[REQ-{request_id}] Current_messages count before tools: "
      f"{len(current_messages)}"
  )

  # 4. Multi-round tool loop
  max_tool_rounds = 5
  final_content: str = ""

  for round_num in range(max_tool_rounds):
      logger.info(f"[REQ-{request_id}] === ROUND {round_num + 1} START ===")
      logger.info(
          f"[REQ-{request_id}] Sending {len(current_messages)} messages to OpenAI"
      )

      try:
          response = client.chat.completions.create(
              model="openai/gpt-5.1",
              messages=current_messages,
              tools=TOOLS,
              temperature=0.7,
          )
      except Exception as e:
          logger.error(f"[REQ-{request_id}] OpenAI API ERROR: {str(e)}")
          raise

      assistant_message = response.choices[0].message
      content_preview = (assistant_message.content or "")[:200]
      logger.info(
          f"[REQ-{request_id}] Assistant content preview: {content_preview!r}"
      )
      logger.info(
          f"[REQ-{request_id}] Assistant tool_calls: "
          f"{len(assistant_message.tool_calls) if assistant_message.tool_calls else 0}"
      )

      tool_calls = assistant_message.tool_calls or []

      if tool_calls:
          # Deduplicate tool calls by (name, arguments)
          seen = set()
          unique_tool_calls = []
          for tc in tool_calls:
              key = (tc.function.name, tc.function.arguments)
              if key in seen:
                  logger.info(
                      f"[REQ-{request_id}] Skipping duplicate tool call {key}"
                  )
                  continue
              seen.add(key)
              unique_tool_calls.append(tc)

          logger.info(
              f"[REQ-{request_id}] ROUND {round_num + 1} - "
              f"Processing {len(unique_tool_calls)} unique tool calls: "
              f"{[tc.function.name for tc in unique_tool_calls]}"
          )

          # Add assistant message with tool_calls to conversation
          current_messages.append(
              {
                  "role": "assistant",
                  "content": assistant_message.content or "",
                  "tool_calls": [
                      {
                          "id": tc.id,
                          "type": "function",
                          "function": {
                              "name": tc.function.name,
                              "arguments": tc.function.arguments,
                          },
                      }
                      for tc in unique_tool_calls
                  ],
              }
          )

          # Execute each tool and append results
          for tool_call in unique_tool_calls:
              tool_name = tool_call.function.name
              try:
                  arguments = json.loads(tool_call.function.arguments)
              except json.JSONDecodeError as e:
                  logger.error(
                      f"[REQ-{request_id}] TOOL ARG PARSE ERROR for {tool_name}: {str(e)}; "
                      f"raw={tool_call.function.arguments!r}"
                  )
                  arguments = {}

              logger.info(f"[REQ-{request_id}] TOOL CALL: {tool_name}")
              logger.info(
                  f"[REQ-{request_id}] TOOL ARGS: {json.dumps(arguments)[:500]}"
              )

              try:
                  tool_result = await execute_tool(
                      tool_name, arguments, db, user_id
                  )
                  logger.info(
                      f"[REQ-{request_id}] TOOL RESULT ({tool_name}): "
                      f"{tool_result[:300]}..."
                  )
              except Exception as e:
                  logger.error(
                      f"[REQ-{request_id}] TOOL EXECUTION ERROR: "
                      f"{tool_name} - {str(e)}"
                  )
                  tool_result = json.dumps({"error": str(e)})

              logger.info(
                  f"[AI TOOL RESULT] {tool_name}: {tool_result[:200]}..."
              )

              current_messages.append(
                  {
                      "role": "tool",
                      "content": tool_result,
                      "tool_call_id": tool_call.id,
                  }
              )

          logger.info(
              f"[REQ-{request_id}] === ROUND {round_num + 1} END - "
              f"continuing to next round ==="
          )
          continue  # next round, now that tool results are in conversation

      # No tool calls -> final natural language response
      final_content = assistant_message.content or ""
      logger.info(
          f"[REQ-{request_id}] === ROUND {round_num + 1} END - "
          f"no tool calls, final response ==="
      )
      break

  # 5. If all rounds used and still no final_content, force a non-tool answer
  if not final_content:
      logger.info(
          f"[REQ-{request_id}] All rounds used or no final content, "
          f"forcing final non-tool call"
      )
      try:
          final_response = client.chat.completions.create(
              model="openai/gpt-5.1",
              messages=current_messages,
              tools=TOOLS,
              tool_choice="none",
              temperature=0.7,
          )
          final_content = final_response.choices[0].message.content or ""
          logger.info(
              f"[REQ-{request_id}] Forced final content preview: "
              f"{final_content[:300]!r}"
          )
      except Exception as e:
          logger.error(f"[REQ-{request_id}] Final call error: {str(e)}")
          final_content = ""

  # 6. Fallback if still empty
  if not final_content or final_content.strip() == "":
      logger.warning(
          f"[REQ-{request_id}] WARNING: Empty final_content, using fallback message"
      )
      final_content = (
          "I wasn’t able to generate a proper response just now. "
          "Try rephrasing or asking again and I’ll adjust."
      )

  # 7. Append final assistant response to display messages
  user_messages = [m for m in messages if m.role not in ["system", "tool"]]
  user_messages.append(ChatMessage(role="assistant", content=final_content))

  logger.info(
      f"[REQ-{request_id}] Returning {len(user_messages)} messages to client"
  )

  # 8. Persist internal state to DB
  try:
      await db.ai_chat_states.update_one(
          {"user_id": user_id},
          {
              "$set": {
                  "internal_messages": current_messages,
                  "updated_at": datetime.utcnow(),
              }
          },
          upsert=True,
      )
      logger.info(f"[REQ-{request_id}] Updated ai_chat_states in DB")
  except Exception as e:
      logger.error(
          f"[REQ-{request_id}] Failed to update ai_chat_states: {str(e)}"
      )

  return user_messages
