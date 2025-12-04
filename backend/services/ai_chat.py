"""AI Chat service with tool support for workout coaching"""
import json
import sys
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
            "description": "Fetches available exercises from the database. Use this BEFORE creating a planned workout so you can select the correct exercise IDs. You can filter by body part, category, or search by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search query to filter exercises by name (optional)"
                    },
                    "body_part": {
                        "type": "string",
                        "description": "Filter by primary body part (e.g., 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core')"
                    },
                    "category": {
                        "type": "string",
                        "description": "Filter by category (e.g., 'Strength', 'Cardio')"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of exercises to return",
                        "default": 50
                    }
                },
                "required": []
            }
        }
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
                        "default": 14
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of workouts to return",
                        "default": 20
                    }
                },
                "required": []
            }
        }
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
                        "description": "Start date in YYYY-MM-DD format"
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD format"
                    }
                },
                "required": ["start_date", "end_date"]
            }
        }
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
                        "description": "Updated list of injury tags"
                    },
                    "current_issues": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Updated list of current issues"
                    },
                    "strength_tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Updated list of strengths"
                    },
                    "weak_point_tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Updated list of weak points"
                    },
                    "psych_profile": {
                        "type": "string",
                        "description": "Updated psychological profile"
                    }
                },
                "required": []
            }
        }
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
                        "description": "Workout date in YYYY-MM-DD format"
                    },
                    "name": {
                        "type": "string",
                        "description": "Workout name (also used as template name if exercises are provided)"
                    },
                    "template_id": {
                        "type": "string",
                        "description": "ID of an existing workout template to use. Use this if the user wants to schedule an existing routine."
                    },
                    "exercises": {
                        "type": "array",
                        "description": "Array of exercises to include. When provided, a new template will be created automatically. Get exercise IDs from get_exercises first!",
                        "items": {
                            "type": "object",
                            "properties": {
                                "exercise_id": {
                                    "type": "string",
                                    "description": "ID of the exercise (from get_exercises)"
                                },
                                "sets": {
                                    "type": "integer",
                                    "description": "Number of sets (default: 3)"
                                },
                                "reps": {
                                    "type": "integer",
                                    "description": "Target reps per set (default: 10)"
                                },
                                "weight": {
                                    "type": "number",
                                    "description": "Target weight in kg (optional)"
                                },
                                "notes": {
                                    "type": "string",
                                    "description": "Notes for this exercise (optional)"
                                }
                            },
                            "required": ["exercise_id"]
                        }
                    },
                    "type": {
                        "type": "string",
                        "description": "Workout type (e.g., 'strength', 'cardio', 'mobility')"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Additional notes or instructions"
                    },
                    "is_recurring": {
                        "type": "boolean",
                        "description": "Whether this is a recurring workout",
                        "default": False
                    },
                    "recurrence_type": {
                        "type": "string",
                        "enum": ["daily", "weekly", "monthly"],
                        "description": "Type of recurrence (required if is_recurring=true)"
                    },
                    "recurrence_days": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "For weekly: array of weekday indices [0=Mon, 1=Tue, ..., 6=Sun]"
                    },
                    "recurrence_end_date": {
                        "type": "string",
                        "description": "End date for recurring workouts in YYYY-MM-DD format (null = indefinite)"
                    }
                },
                "required": ["date", "name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_templates",
            "description": "Fetches the user's existing workout templates. Use this to see what routines the user has already created, so you can schedule them instead of creating new ones.",
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
                        "description": "ID of the planned workout to update"
                    },
                    "date": {
                        "type": "string",
                        "description": "New workout date in YYYY-MM-DD format"
                    },
                    "name": {
                        "type": "string",
                        "description": "New workout name"
                    },
                    "template_id": {
                        "type": "string",
                        "description": "ID of a different existing template to use"
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
                                "notes": {"type": "string"}
                            },
                            "required": ["exercise_id"]
                        }
                    },
                    "type": {
                        "type": "string",
                        "description": "New workout type"
                    },
                    "notes": {
                        "type": "string",
                        "description": "New notes"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["planned", "in_progress", "completed", "skipped"],
                        "description": "New status"
                    },
                    "order": {
                        "type": "integer",
                        "description": "New display order"
                    }
                },
                "required": ["workout_id"]
            }
        }
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
                        "description": "ID of the planned workout to delete"
                    }
                },
                "required": ["workout_id"]
            }
        }
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
                        "description": "ID of the template to update"
                    },
                    "name": {
                        "type": "string",
                        "description": "New template name (optional)"
                    },
                    "notes": {
                        "type": "string",
                        "description": "New template notes (optional)"
                    },
                    "exercises": {
                        "type": "array",
                        "description": "New exercises array - REPLACES all existing exercises",
                        "items": {
                            "type": "object",
                            "properties": {
                                "exercise_id": {
                                    "type": "string",
                                    "description": "ID of the exercise (from get_exercises)"
                                },
                                "sets": {
                                    "type": "integer",
                                    "description": "Number of sets (default: 3)"
                                },
                                "reps": {
                                    "type": "integer",
                                    "description": "Target reps per set (default: 10)"
                                },
                                "weight": {
                                    "type": "number",
                                    "description": "Target weight in kg (optional)"
                                },
                                "notes": {
                                    "type": "string",
                                    "description": "Notes for this exercise (optional)"
                                }
                            },
                            "required": ["exercise_id"]
                        }
                    }
                },
                "required": ["template_id"]
            }
        }
    }
]


async def execute_tool(tool_name: str, arguments: Dict[str, Any], db, user_id: str) -> str:
    """
    Execute a tool function and return the result as a string.
    
    Args:
        tool_name: Name of the tool to execute
        arguments: Tool arguments
        db: MongoDB database instance
        user_id: Current user ID
        
    Returns:
        String result of the tool execution
    """
    try:
        if tool_name == "get_user_context":
            # Fetch user profile
            user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return json.dumps({"error": "User not found"})
            
            # Check if profile is nested in user document or separate collection
            profile_data = user_doc.get("profile", {})
            if not profile_data:
                # Fall back to separate profiles collection
                profile_doc = await db.profiles.find_one({"user_id": user_id})
                profile_data = profile_doc if profile_doc else {}
            
            # Check if insights are nested or separate
            insights_data = profile_data.get("insights", {})
            if not insights_data:
                # Fall back to separate insights collection
                insights_doc = await db.profile_insights.find_one({"user_id": user_id})
                insights_data = insights_doc if insights_doc else {}
            
            # Build context
            context = {
                "user": {
                    "email": user_doc.get("email")
                },
                "profile": profile_data,
                "insights": insights_data
            }
            
            # Clean up MongoDB IDs
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
            
            # Calculate date range
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days_back)
            
            # Query completed workouts
            workouts = await db.workouts.find({
                "user_id": user_id,
                "ended_at": {"$ne": None},
                "started_at": {"$gte": start_date, "$lte": end_date}
            }).sort("started_at", -1).limit(limit).to_list(limit)
            
            # Build compact summaries
            summaries = []
            for w in workouts:
                # Calculate total volume
                total_volume = 0
                for ex in w.get("exercises", []):
                    for set_data in ex.get("sets", []):
                        if set_data.get("weight") and set_data.get("reps"):
                            total_volume += set_data["weight"] * set_data["reps"]
                
                summaries.append({
                    "id": str(w["_id"]),
                    "name": w.get("name", "Workout"),
                    "started_at": w["started_at"].isoformat() if w.get("started_at") else None,
                    "ended_at": w["ended_at"].isoformat() if w.get("ended_at") else None,
                    "total_volume": round(total_volume, 2),
                    "exercise_count": len(w.get("exercises", [])),
                    "notes": w.get("notes")
                })
            
            return json.dumps(summaries)
        
        elif tool_name == "get_schedule":
            start_date = arguments.get("start_date")
            end_date = arguments.get("end_date")
            
            if not start_date or not end_date:
                return json.dumps({"error": "start_date and end_date are required"})
            
            # Fetch planned workouts
            planned_workouts = await db.planned_workouts.find({
                "user_id": user_id
            }).to_list(1000)
            
            # Import expansion logic
            from server import expand_recurring_workouts, enrich_planned_workouts_with_sessions
            
            # Convert ObjectIds to strings
            for pw in planned_workouts:
                pw["id"] = str(pw["_id"])
            
            # Expand and enrich
            expanded = expand_recurring_workouts(planned_workouts, start_date, end_date)
            enriched = await enrich_planned_workouts_with_sessions(expanded, user_id)
            
            # Build compact response with clear deletable IDs
            schedule = []
            for pw in enriched:
                is_recurring = pw.get("is_recurring", False)
                # For recurring workouts, the deletable_id is the parent (deletes whole series)
                # For one-time workouts, deletable_id is the workout's own id
                deletable_id = pw.get("recurrence_parent_id") if is_recurring else pw.get("id")
                
                schedule.append({
                    "id": pw.get("id"),
                    "deletable_id": deletable_id,  # Use THIS id for delete_planned_workout
                    "date": pw.get("date"),
                    "name": pw.get("name"),
                    "status": pw.get("status"),
                    "type": pw.get("type"),
                    "notes": pw.get("notes"),
                    "template_id": pw.get("template_id"),
                    "is_recurring": is_recurring,
                    "is_recurring_instance": is_recurring  # True = this is just one instance of a series
                })
            
            return json.dumps(schedule)
        
        elif tool_name == "update_profile_insights":
            # Fetch existing insights
            insights_doc = await db.profile_insights.find_one({"user_id": user_id})
            
            if not insights_doc:
                # Create new insights if none exist
                insights_doc = {
                    "user_id": user_id,
                    "injury_tags": [],
                    "current_issues": [],
                    "strength_tags": [],
                    "weak_point_tags": [],
                    "training_phases": [],
                    "psych_profile": ""
                }
            
            # Merge updates
            update_fields = {}
            for field in ["injury_tags", "current_issues", "strength_tags", "weak_point_tags", "psych_profile"]:
                if field in arguments:
                    update_fields[field] = arguments[field]
            
            if update_fields:
                await db.profile_insights.update_one(
                    {"user_id": user_id},
                    {"$set": update_fields},
                    upsert=True
                )
            
            # Fetch and return updated insights
            updated = await db.profile_insights.find_one({"user_id": user_id})
            if updated and "_id" in updated:
                updated["id"] = str(updated["_id"])
                del updated["_id"]
            
            return json.dumps(updated or {}, default=str)
        
        elif tool_name == "get_exercises":
            # Build query filter
            query = {}
            
            search = arguments.get("search")
            body_part = arguments.get("body_part")
            category = arguments.get("category")
            limit = arguments.get("limit", 50)
            
            if search:
                query["name"] = {"$regex": search, "$options": "i"}
            
            if body_part:
                query["$or"] = [
                    {"primary_body_parts": {"$regex": body_part, "$options": "i"}},
                    {"secondary_body_parts": {"$regex": body_part, "$options": "i"}}
                ]
            
            if category:
                query["category"] = {"$regex": category, "$options": "i"}
            
            # Fetch exercises (both global and user's custom)
            exercises = await db.exercises.find({
                "$or": [
                    {"user_id": {"$exists": False}},
                    {"user_id": None},
                    {"user_id": user_id}
                ],
                **query
            }).limit(limit).to_list(limit)
            
            # Build compact response
            result = []
            for ex in exercises:
                result.append({
                    "id": str(ex["_id"]),
                    "name": ex.get("name"),
                    "exercise_kind": ex.get("exercise_kind"),
                    "primary_body_parts": ex.get("primary_body_parts", []),
                    "secondary_body_parts": ex.get("secondary_body_parts", []),
                    "category": ex.get("category"),
                    "is_custom": ex.get("is_custom", False)
                })
            
            return json.dumps(result)
        
        elif tool_name == "get_user_templates":
            # Fetch user's workout templates
            templates = await db.templates.find({
                "user_id": user_id
            }).to_list(100)
            
            # Build compact response
            result = []
            for t in templates:
                result.append({
                    "id": str(t["_id"]),
                    "name": t.get("name"),
                    "notes": t.get("notes"),
                    "exercise_count": len(t.get("exercises", []))
                })
            
            return json.dumps(result)
        
        elif tool_name == "create_planned_workout":
            # Validate required fields
            if "date" not in arguments or "name" not in arguments:
                return json.dumps({"error": "date and name are required"})
            
            template_id = arguments.get("template_id")
            exercises = arguments.get("exercises")
            
            # If exercises are provided but no template_id, create a new template first
            if exercises and not template_id:
                # Build template exercises
                template_exercises = []
                for i, ex in enumerate(exercises):
                    exercise_id = ex.get("exercise_id")
                    if not exercise_id:
                        continue
                    
                    num_sets = ex.get("sets", 3)
                    reps = ex.get("reps", 10)
                    weight = ex.get("weight")
                    notes = ex.get("notes")
                    
                    # Build sets array with the specified number of sets
                    sets = []
                    for _ in range(num_sets):
                        set_item = {
                            "reps": reps,
                            "is_warmup": False
                        }
                        if weight:
                            set_item["weight"] = weight
                        sets.append(set_item)
                    
                    template_exercises.append({
                        "exercise_id": exercise_id,
                        "order": i,
                        "sets": sets,
                        "notes": notes,
                        "default_sets": num_sets,
                        "default_reps": reps,
                        "default_weight": weight
                    })
                
                # Create the template
                template_doc = {
                    "user_id": user_id,
                    "name": arguments["name"],
                    "notes": arguments.get("notes") or "Created by AI Coach",
                    "exercises": template_exercises,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                template_result = await db.templates.insert_one(template_doc)
                template_id = str(template_result.inserted_id)
            
            # Build planned workout document
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
                "created_at": datetime.utcnow()
            }
            
            # Add recurring fields if applicable
            if planned_workout["is_recurring"]:
                planned_workout["recurrence_type"] = arguments.get("recurrence_type")
                planned_workout["recurrence_days"] = arguments.get("recurrence_days")
                planned_workout["recurrence_end_date"] = arguments.get("recurrence_end_date")
            
            # Insert into database
            result = await db.planned_workouts.insert_one(planned_workout)
            
            # Build success message
            message = f"Created planned workout '{arguments['name']}' for {arguments['date']}"
            if exercises and template_id:
                message += f". Also created a new reusable template (ID: {template_id}) with {len(exercises)} exercises."
            
            return json.dumps({
                "success": True,
                "id": str(result.inserted_id),
                "template_id": template_id,
                "message": message
            })
        
        elif tool_name == "update_planned_workout":
            workout_id = arguments.get("workout_id")
            
            if not workout_id or not ObjectId.is_valid(workout_id):
                return json.dumps({"error": "Valid workout_id is required"})
            
            # Build update document
            update_fields = {}
            for field in ["date", "name", "type", "notes", "status", "order"]:
                if field in arguments:
                    update_fields[field] = arguments[field]
            
            # Handle template_id change
            if "template_id" in arguments:
                update_fields["template_id"] = arguments["template_id"]
            
            # Handle exercises array - create new template if provided
            exercises = arguments.get("exercises")
            if exercises:
                # Get the planned workout to use its name for the new template
                existing_workout = await db.planned_workouts.find_one({
                    "_id": ObjectId(workout_id),
                    "user_id": user_id
                })
                
                if not existing_workout:
                    return json.dumps({"error": "Planned workout not found"})
                
                workout_name = arguments.get("name") or existing_workout.get("name", "Workout")
                
                # Build template exercises
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
                    
                    template_exercises.append({
                        "exercise_id": exercise_id,
                        "order": i,
                        "sets": sets,
                        "notes": notes,
                        "default_sets": num_sets,
                        "default_reps": reps,
                        "default_weight": weight
                    })
                
                # Create new template
                template_doc = {
                    "user_id": user_id,
                    "name": f"{workout_name} (Modified)",
                    "notes": "Created from workout modification",
                    "exercises": template_exercises,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                template_result = await db.templates.insert_one(template_doc)
                update_fields["template_id"] = str(template_result.inserted_id)
            
            if not update_fields:
                return json.dumps({"error": "No fields to update"})
            
            # Update in database
            result = await db.planned_workouts.update_one(
                {"_id": ObjectId(workout_id), "user_id": user_id},
                {"$set": update_fields}
            )
            
            if result.matched_count == 0:
                return json.dumps({"error": "Planned workout not found"})
            
            message = f"Updated planned workout {workout_id}"
            if exercises:
                message += f". Created new template with {len(exercises)} exercises."
            
            return json.dumps({
                "success": True,
                "message": message,
                "template_id": update_fields.get("template_id")
            })
        
        elif tool_name == "delete_planned_workout":
            workout_id = arguments.get("workout_id")
            logger.info(f"[DEBUG] delete_planned_workout called with workout_id: {workout_id}")
            
            if not workout_id or not ObjectId.is_valid(workout_id):
                logger.warning(f"[DEBUG] Invalid workout_id: {workout_id}")
                return json.dumps({"error": f"Valid workout_id is required. Received: {workout_id}"})
            
            # Delete from database
            logger.info(f"[DEBUG] Attempting to delete workout with _id={workout_id}, user_id={user_id}")
            result = await db.planned_workouts.delete_one({
                "_id": ObjectId(workout_id),
                "user_id": user_id
            })
            
            logger.info(f"[DEBUG] Delete result: deleted_count={result.deleted_count}")
            
            if result.deleted_count == 0:
                return json.dumps({"error": f"Planned workout not found or already deleted. workout_id={workout_id}"})
            
            return json.dumps({
                "success": True,
                "message": f"Deleted planned workout {workout_id}"
            })
        
        elif tool_name == "update_template":
            template_id = arguments.get("template_id")
            
            if not template_id or not ObjectId.is_valid(template_id):
                return json.dumps({"error": "Valid template_id is required"})
            
            # Build update document
            update_fields = {"updated_at": datetime.utcnow()}
            
            if "name" in arguments:
                update_fields["name"] = arguments["name"]
            
            if "notes" in arguments:
                update_fields["notes"] = arguments["notes"]
            
            # Handle exercises array
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
                    
                    template_exercises.append({
                        "exercise_id": exercise_id,
                        "order": i,
                        "sets": sets,
                        "notes": notes,
                        "default_sets": num_sets,
                        "default_reps": reps,
                        "default_weight": weight
                    })
                
                update_fields["exercises"] = template_exercises
            
            if len(update_fields) == 1:  # Only updated_at
                return json.dumps({"error": "No fields to update"})
            
            # Update in database
            result = await db.templates.update_one(
                {"_id": ObjectId(template_id), "user_id": user_id},
                {"$set": update_fields}
            )
            
            if result.matched_count == 0:
                return json.dumps({"error": "Template not found"})
            
            message = f"Updated template {template_id}"
            if exercises:
                message += f" with {len(exercises)} exercises"
            
            return json.dumps({
                "success": True,
                "message": message
            })
        
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
    
    except Exception as e:
        return json.dumps({"error": str(e)})


def build_system_prompt(user_context: Dict[str, Any]) -> str:
    """
    Build the system prompt with compact user profile context.
    
    Args:
        user_context: User profile and insights data
        
    Returns:
        System prompt string
    """
    profile = user_context.get("profile", {})
    insights = user_context.get("insights", {})
    
    # Extract compact profile info
    sex = profile.get("sex", "not specified")
    dob = profile.get("date_of_birth")
    age = "not specified"
    if dob:
        try:
            if isinstance(dob, str):
                dob = datetime.fromisoformat(dob.replace('Z', '+00:00'))
            age = str((datetime.utcnow() - dob).days // 365)
        except Exception:
            pass
    
    height = profile.get("height_cm")
    weight = profile.get("weight_kg")
    height_weight = f"{height}cm / {weight}kg" if height and weight else "not specified"
    
    training_age = profile.get("training_age", "not specified")
    goals = profile.get("goals", "not specified")
    
    # Extract insights
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
2. Use the provided tools to fetch workout history, schedules, and detailed profile info when needed
3. Be concise but thorough - focus on actionable advice
4. Ask clarifying questions when needed
5. You can create, modify, and DELETE workout schedules using the provided tools
6. When the user shares new information about injuries, progress, or goals, update their profile insights
7. Be encouraging and supportive while being realistic about capabilities and limitations

WORKOUT CREATION WORKFLOW (CRITICAL):
When creating a scheduled workout, you MUST follow this process:

1. FIRST: Check if the user has existing templates using get_user_templates
   - If they want to schedule an existing routine, use its template_id

2. IF CREATING A NEW WORKOUT WITH EXERCISES:
   a. Call get_exercises to fetch available exercises with their IDs
   b. Select appropriate exercises based on the user's goals/injuries
   c. Use create_planned_workout with the 'exercises' array (NOT just name/notes)
   
   Example exercises array format:
   [
     {{"exercise_id": "abc123", "sets": 4, "reps": 8, "weight": 60, "notes": "Focus on form"}},
     {{"exercise_id": "def456", "sets": 3, "reps": 12}}
   ]
   
3. TEMPLATE AUTO-CREATION: When you provide an exercises array, the system will:
   - Automatically create a reusable workout template
   - Link it to the planned workout
   - The user can then reuse this template for future workouts
   
4. ALWAYS inform the user that a new template was created and can be reused

NEVER create a planned workout without either:
- A template_id (for existing routines)
- An exercises array (to auto-create a new template)

This ensures all scheduled workouts have viewable exercise details.

WORKOUT MODIFICATION WORKFLOW:
When the user wants to change a scheduled workout's exercises:

1. For ONE scheduled workout only:
   - Use update_planned_workout with a new 'exercises' array
   - This creates a NEW template and links it to that workout
   - Original template stays unchanged (user may want it for other workouts)

2. For ALL workouts using a template (permanent change):
   - Use update_template with the template_id
   - WARNING: This affects ALL future workouts using this template
   - Only use when user explicitly wants to modify the template itself

3. To change which template a workout uses:
   - Use update_planned_workout with a different 'template_id'

WORKOUT DELETION (IMPORTANT):
- When using get_schedule, each workout has TWO IDs:
  - "id": The workout instance ID
  - "deletable_id": Use THIS ID for delete_planned_workout!
- For recurring workouts: deletable_id = parent ID (deletes the ENTIRE recurring series)
- For one-time workouts: deletable_id = same as id
- ALWAYS use the "deletable_id" field when calling delete_planned_workout
- To skip ONE instance of a recurring workout, use update_planned_workout with status="skipped" instead

AVAILABLE TOOLS:
- get_exercises: Fetch available exercises with IDs (can filter by body_part, category, search)
- get_user_templates: See user's existing workout routines with template IDs
- get_user_context: Get full user profile and training history
- get_workout_history: View recent completed workouts
- get_schedule: Check scheduled workouts - returns "deletable_id" for delete operations
- update_profile_insights: Update user profile with new information
- create_planned_workout: Schedule workouts (with template_id OR exercises array)
- update_planned_workout: Modify scheduled workout (date, name, exercises, template_id, status)
- delete_planned_workout: Permanently remove a workout - USE "deletable_id" from get_schedule!
- update_template: Edit a template's exercises (affects ALL workouts using it)

WORKFLOW FOR COMMON REQUESTS:
- "Delete my chest workout" → get_schedule → use "deletable_id" from result → delete_planned_workout(workout_id=deletable_id)
- "Change tomorrow's workout to legs" → get_schedule → get_exercises (legs) → update_planned_workout with exercises
- "Add more sets to my Push Day template" → get_user_templates → update_template
- "Skip today's workout" → get_schedule → update_planned_workout with status="skipped"

Use these tools proactively to provide personalized, context-aware coaching."""

    return prompt


async def generate_ai_chat_response(
    user_id: str,
    messages: List[ChatMessage],
    db
) -> List[ChatMessage]:
    """
    Generate AI chat response with tool support.
    
    Args:
        user_id: Current user ID
        messages: Chat history
        db: MongoDB database instance
        
    Returns:
        Updated message list including AI response
    """
    # Fetch user context for system prompt
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    
    # Check if profile is nested in user document or separate collection
    profile_data = user_doc.get("profile", {}) if user_doc else {}
    if not profile_data:
        profile_doc = await db.profiles.find_one({"user_id": user_id})
        profile_data = profile_doc if profile_doc else {}
    
    # Check if insights are nested or separate
    insights_data = profile_data.get("insights", {})
    if not insights_data:
        insights_doc = await db.profile_insights.find_one({"user_id": user_id})
        insights_data = insights_doc if insights_doc else {}
    
    user_context = {
        "user": user_doc or {},
        "profile": profile_data,
        "insights": insights_data
    }
    
    # Build system prompt
    system_prompt = build_system_prompt(user_context)
    
    # Filter out any existing system messages and tool messages from client
    # Tool messages should never come from the client - they're internal to processing
    user_messages = [m for m in messages if m.role not in ["system", "tool"]]
    
    # Convert to OpenAI format
    openai_messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    for msg in user_messages:
        if msg.role == "tool":
            openai_messages.append({
                "role": "tool",
                "content": msg.content,
                "tool_call_id": msg.tool_call_id
            })
        else:
            openai_messages.append({
                "role": msg.role,
                "content": msg.content
            })
    
    # Call OpenAI with tools - support multiple rounds of tool calls
    max_tool_rounds = 3  # Limit rounds to prevent timeouts
    max_tools_per_round = 4  # Limit tools per round
    current_messages = openai_messages.copy()
    
    for round_num in range(max_tool_rounds):
        response = client.chat.completions.create(
            model="openai/gpt-5.1",
            messages=current_messages,
            tools=TOOLS,
            temperature=0.7
        )
        
        assistant_message = response.choices[0].message
        
        # Check if tool calls were made
        if assistant_message.tool_calls:
            # Limit tool calls per round to prevent excessive API calls
            tool_calls_to_process = assistant_message.tool_calls[:max_tools_per_round]
            
            logger.info(f"[AI ROUND {round_num + 1}] Tool calls: {[tc.function.name for tc in tool_calls_to_process]} (limited from {len(assistant_message.tool_calls)})")
            
            # Add assistant message with tool calls to conversation
            current_messages.append({
                "role": "assistant",
                "content": assistant_message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    }
                    for tc in tool_calls_to_process
                ]
            })
            
            # Execute each tool call and add results
            for tool_call in tool_calls_to_process:
                tool_name = tool_call.function.name
                arguments = json.loads(tool_call.function.arguments)
                
                logger.info(f"[AI TOOL CALL] Tool: {tool_name}, Arguments: {arguments}")
                
                # Execute tool
                tool_result = await execute_tool(tool_name, arguments, db, user_id)
                
                logger.info(f"[AI TOOL RESULT] {tool_name}: {tool_result[:200]}...")
                
                # Add tool result to conversation
                current_messages.append({
                    "role": "tool",
                    "content": tool_result,
                    "tool_call_id": tool_call.id
                })
            
            # Continue to next round to let AI process tool results
            continue
        else:
            # No more tool calls - we have our final response
            break
    
    # Add final assistant response to user_messages
    user_messages.append(ChatMessage(
        role="assistant",
        content=assistant_message.content or ""
    ))
    
    return user_messages
