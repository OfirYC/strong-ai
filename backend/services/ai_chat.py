"""AI Chat service with tool support for workout coaching"""
import json
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timedelta
from pydantic import BaseModel
from bson import ObjectId

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
            "description": "Creates a new planned/scheduled workout for a specific date. Can create one-time or recurring schedules.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Workout date in YYYY-MM-DD format"
                    },
                    "name": {
                        "type": "string",
                        "description": "Workout name"
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
            "name": "update_planned_workout",
            "description": "Updates an existing planned workout. Can modify date, name, type, notes, status, or order.",
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
            
            profile_doc = await db.profiles.find_one({"user_id": user_id})
            insights_doc = await db.profile_insights.find_one({"user_id": user_id})
            
            # Build context
            context = {
                "user": {
                    "email": user_doc.get("email")
                },
                "profile": profile_doc if profile_doc else {},
                "insights": insights_doc if insights_doc else {}
            }
            
            # Clean up MongoDB IDs
            for key in ["profile", "insights"]:
                if context[key] and "_id" in context[key]:
                    context[key]["id"] = str(context[key]["_id"])
                    del context[key]["_id"]
            
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
            
            # Build compact response
            schedule = []
            for pw in enriched:
                schedule.append({
                    "id": pw.get("id"),
                    "date": pw.get("date"),
                    "name": pw.get("name"),
                    "status": pw.get("status"),
                    "type": pw.get("type"),
                    "notes": pw.get("notes"),
                    "template_id": pw.get("template_id"),
                    "is_recurring": pw.get("is_recurring", False)
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
        
        elif tool_name == "create_planned_workout":
            # Validate required fields
            if "date" not in arguments or "name" not in arguments:
                return json.dumps({"error": "date and name are required"})
            
            # Build planned workout document
            planned_workout = {
                "user_id": user_id,
                "date": arguments["date"],
                "name": arguments["name"],
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
            
            return json.dumps({
                "success": True,
                "id": str(result.inserted_id),
                "message": f"Created planned workout '{arguments['name']}' for {arguments['date']}"
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
            
            if not update_fields:
                return json.dumps({"error": "No fields to update"})
            
            # Update in database
            result = await db.planned_workouts.update_one(
                {"_id": ObjectId(workout_id), "user_id": user_id},
                {"$set": update_fields}
            )
            
            if result.matched_count == 0:
                return json.dumps({"error": "Planned workout not found"})
            
            return json.dumps({
                "success": True,
                "message": f"Updated planned workout {workout_id}"
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
        except:
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
    
    prompt = f"""You are an expert strength and conditioning coach assistant inside a workout tracking app. You help users with:
- Workout planning and programming
- Exercise selection and technique
- Injury management and recovery
- Progress analysis and adjustments
- Motivation and accountability

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

IMPORTANT GUIDELINES:
1. Always consider the user's injuries and current issues when giving advice
2. Use the provided tools to fetch workout history, schedules, and detailed profile info when needed
3. Be concise but thorough - focus on actionable advice
4. Ask clarifying questions when needed
5. You can create and modify workout schedules using the provided tools
6. When the user shares new information about injuries, progress, or goals, update their profile insights
7. Be encouraging and supportive while being realistic about capabilities and limitations

You have access to tools to:
- Get full user context and training history
- View recent workout history
- Check scheduled workouts
- Update profile insights with new information
- Create and modify workout schedules

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
    profile_doc = await db.profiles.find_one({"user_id": user_id})
    insights_doc = await db.profile_insights.find_one({"user_id": user_id})
    
    user_context = {
        "user": user_doc or {},
        "profile": profile_doc or {},
        "insights": insights_doc or {}
    }
    
    # Build system prompt
    system_prompt = build_system_prompt(user_context)
    
    # Filter out any existing system messages from client
    user_messages = [m for m in messages if m.role != "system"]
    
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
    
    # Call OpenAI with tools
    response = client.chat.completions.create(
        model="openai/gpt-4o-mini",
        messages=openai_messages,
        tools=TOOLS,
        temperature=0.7
    )
    
    assistant_message = response.choices[0].message
    
    # Check if tool calls were made
    if assistant_message.tool_calls:
        # Store tool calls for the second API call
        tool_calls_data = []
        
        # Execute each tool call
        for tool_call in assistant_message.tool_calls:
            tool_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)
            
            # Execute tool
            tool_result = await execute_tool(tool_name, arguments, db, user_id)
            
            # Store for second call
            tool_calls_data.append({
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": tool_call.function.arguments
                },
                "result": tool_result
            })
        
        # Make second call with tool results
        # We need to include the assistant message with tool_calls and then the tool results
        openai_messages_with_tools = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add all previous user/assistant messages
        for msg in user_messages:
            openai_messages_with_tools.append({
                "role": msg.role,
                "content": msg.content
            })
        
        # Add assistant message with tool calls
        openai_messages_with_tools.append({
            "role": "assistant",
            "content": assistant_message.content,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": tc["type"],
                    "function": tc["function"]
                }
                for tc in tool_calls_data
            ]
        })
        
        # Add tool results
        for tc in tool_calls_data:
            openai_messages_with_tools.append({
                "role": "tool",
                "content": tc["result"],
                "tool_call_id": tc["id"]
            })
        
        # Make final call
        final_response = client.chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=openai_messages_with_tools,
            temperature=0.7
        )
        
        final_message = final_response.choices[0].message
        
        # Don't add tool messages to user_messages - they're internal to AI processing
        # Only add the final assistant response
        user_messages.append(ChatMessage(
            role="assistant",
            content=final_message.content or ""
        ))
    else:
        # No tool calls, just add the response
        user_messages.append(ChatMessage(
            role="assistant",
            content=assistant_message.content or ""
        ))
    
    return user_messages
