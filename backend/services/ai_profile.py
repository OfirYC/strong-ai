"""AI-powered profile insights generation using OpenAI via OpenRouter"""
import json
from typing import Optional
from openai import OpenAI
from models import UserProfile, ProfileInsights, TrainingPhase


# OpenRouter configuration
OPENROUTER_API_KEY = "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"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Initialize OpenAI client with OpenRouter
client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL
)


# JSON Schema for ProfileInsights
PROFILE_INSIGHTS_SCHEMA = {
    "type": "object",
    "properties": {
        "injury_tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of injury tags extracted from injury history"
        },
        "current_issues": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Current issues or problems the user is experiencing"
        },
        "strength_tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key strengths extracted from the user's profile"
        },
        "weak_point_tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Weaknesses or areas prone to problems"
        },
        "training_phases": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "description": "Short phase name"},
                    "description": {"type": "string", "description": "Brief description of the phase"}
                },
                "required": ["label", "description"]
            },
            "description": "Distinct training phases from background story"
        },
        "psych_profile": {
            "type": "string",
            "description": "Psychological profile and training tendencies"
        }
    },
    "required": ["injury_tags", "current_issues", "strength_tags", "weak_point_tags", "training_phases", "psych_profile"]
}


async def generate_profile_insights(profile: UserProfile) -> ProfileInsights:
    """
    Generate structured insights from user's freeform profile text using AI.
    
    Args:
        profile: UserProfile with freeform text fields
        
    Returns:
        ProfileInsights with structured data
        
    Raises:
        ValueError: If profile doesn't have enough info
        Exception: If AI call fails or JSON parsing fails
    """
    
    # Check if we have enough information
    has_content = any([
        profile.training_age,
        profile.goals,
        profile.injury_history,
        profile.weaknesses,
        profile.strengths,
        profile.background_story
    ])
    
    if not has_content:
        raise ValueError("Not enough information in profile to generate insights")
    
    # Build the prompt with all available profile data
    user_content = f"""Please analyze this user's training profile and extract structured insights.

Training Age: {profile.training_age or 'Not specified'}

Goals:
{profile.goals or 'Not specified'}

Background Story:
{profile.background_story or 'Not specified'}

Injury History:
{profile.injury_history or 'Not specified'}

Strengths:
{profile.strengths or 'Not specified'}

Weaknesses:
{profile.weaknesses or 'Not specified'}

Extract the following information:
1. injury_tags: List of specific injuries mentioned (e.g., "shin stress fractures", "posterior tibial irritation")
2. current_issues: Current problems or discomforts they're experiencing
3. strength_tags: Key strengths and capabilities
4. weak_point_tags: Weaknesses or injury-prone areas
5. training_phases: Distinct phases in their training journey (with label and description)
6. psych_profile: Their psychological approach to training, tendencies, and mental characteristics

Return the data as valid JSON matching the schema."""

    try:
        # Call OpenAI with function calling for structured output
        response = client.chat.completions.create(
            model="openai/gpt-4o-mini",  # Using GPT-4 mini via OpenRouter
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert fitness coach assistant that analyzes athlete profiles and extracts structured insights. You must return valid JSON matching the provided schema."
                },
                {
                    "role": "user",
                    "content": user_content
                }
            ],
            tools=[{
                "type": "function",
                "function": {
                    "name": "extract_profile_insights",
                    "description": "Extract structured insights from user's training profile",
                    "parameters": PROFILE_INSIGHTS_SCHEMA
                }
            }],
            tool_choice={"type": "function", "function": {"name": "extract_profile_insights"}},
            temperature=0.3  # Lower temperature for more consistent output
        )
        
        # Extract the function call result
        message = response.choices[0].message
        
        if not message.tool_calls:
            raise Exception("AI did not return function call")
        
        function_call = message.tool_calls[0].function
        insights_json = json.loads(function_call.arguments)
        
        # Validate and create ProfileInsights object
        insights = ProfileInsights(**insights_json)
        
        return insights
        
    except json.JSONDecodeError as e:
        raise Exception(f"Failed to parse AI response as JSON: {e}")
    except Exception as e:
        raise Exception(f"Failed to generate insights: {e}")
