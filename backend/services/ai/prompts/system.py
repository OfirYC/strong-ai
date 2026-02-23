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
    height_weight = (
        f"{height}cm / {weight}kg"
        if height and weight
        else "not specified"
    )

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
2) Use scheduling tools if fixed date.
3) Use template tools if routine library.
4) Use workout_history tools for personalization.
"""
