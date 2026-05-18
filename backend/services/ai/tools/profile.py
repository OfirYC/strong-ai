import json
from typing import Dict, Any
from bson import ObjectId

from .base import BaseTool


class ProfileGetContext(BaseTool):
    name = "profile__get_context"
    description = (
        "Fetch the complete user profile context (goals, injuries, insights). "
        "Use when you need background to personalize advice."
    )
    parameters = {"type": "object", "properties": {}, "required": []}

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

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


class ProfileUpdateInsights(BaseTool):
    name = "profile__update_insights"
    description = (
        "Update specific fields in the user's profile insights (injuries, strengths, weaknesses, etc.) "
        "and high-level profile fields like goals and background story. "
        "Use when user shares new lasting info."
    )
    parameters = {
        "type": "object",
        "properties": {
            "injury_tags": {"type": "array", "items": {"type": "string"}},
            "current_issues": {"type": "array", "items": {"type": "string"}},
            "strength_tags": {"type": "array", "items": {"type": "string"}},
            "weak_point_tags": {"type": "array", "items": {"type": "string"}},
            "psych_profile": {"type": "string"},
            "goals": {
                "type": "string",
                "description": "High-level training goals summary text.",
            },
            "background_story": {
                "type": "string",
                "description": "Freeform background story the user shared.",
            },
        },
        "required": [],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

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
                "goals": "",
                "background_story": "",
            }

        update_fields: Dict[str, Any] = {}
        for field in ["injury_tags", "current_issues", "strength_tags", "weak_point_tags", "psych_profile", "goals", "background_story"]:
            if field in args:
                update_fields[field] = args[field]

        if update_fields:
            await db.profile_insights.update_one(
                {"user_id": user_id}, {"$set": update_fields}, upsert=True
            )

        updated = await db.profile_insights.find_one({"user_id": user_id})
        if updated and "_id" in updated:
            updated["id"] = str(updated["_id"])
            del updated["_id"]

        return json.dumps(updated or {}, default=str)