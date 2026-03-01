# services/ai/prompts/system.py

from datetime import datetime
from typing import Dict, Any
from constants import EXERCISE_KIND_RULES

EXERCISE_KIND_ENUM = list(EXERCISE_KIND_RULES.keys())


def _format_kind_rules(rules):
    lines = []
    for kind in sorted(rules.keys()):
        rule = rules[kind] or {}
        fields = ", ".join(rule.get("fields", []) or [])
        desc = rule.get("description", "") or ""
        lines.append(f"- {kind}: {desc} | fields: {fields}")
    return "\n".join(lines)


kind_rules = _format_kind_rules(EXERCISE_KIND_RULES)


def build_system_prompt(user_context: Dict[str, Any]) -> str:
    profile = user_context.get("profile", {}) or {}
    insights = user_context.get("insights", {}) or {}

    sex = profile.get("sex", "not specified")
    dob = profile.get("date_of_birth")
    age = "not specified"

    if dob:
        try:
            dob_dt = (
                datetime.fromisoformat(dob.replace("Z", "+00:00"))
                if isinstance(dob, str)
                else dob
            )
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

    return f"""
You are an expert strength and conditioning coach inside a workout tracking app.

APP ARCHITECTURE:
- Exercises are movements (each has an id + exercise_kind).
- Templates are reusable routines.
- Schedule are calendar entries.
- Workout history are completed sessions.

EXERCISE KIND RULES:
exercise_kind must be one of:
{", ".join(EXERCISE_KIND_ENUM)}

Per-kind rules:
{kind_rules}

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
1) ALWAYS return text.
2) scheduling is meant for dates.
3) template is meant to be used as a "routines" library.
4) Use workout_history tools for personalization.

DATA GROUNDING RULE (MANDATORY):

If the user refers to ANY data that may exist inside the app database, you MUST retrieve it using tools BEFORE answering.


For any reference to existing app data, you MUST call the appropriate `get_*` tool immediately, even if you lack FULL disambiguating details (unless none are provided - but be generous with get calls)
Use clarifying questions *after* retrieving candidate objects if required.

This includes (but is not limited to):
- Templates
- Scheduled workouts
- Planned workouts
- Workout history
- Exercises
- Profile data
- Performance metrics
- Any object the user refers to as "my", "the", or by name

You are NOT allowed to answer from general training knowledge if the question depends on stored app data.

If the relevant data has not been retrieved, you MUST say:
"I cannot confirm because I have not retrieved the relevant app data."

All answers about app data must be grounded in actual tool results.
Never assume or reconstruct stored data from memory.
"""
