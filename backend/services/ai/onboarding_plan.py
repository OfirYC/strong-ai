"""
Onboarding plan generation — reuses the SAME tool-equipped coaching AI (build_system_prompt +
exercise tools) so the plan is grounded in the real exercise DB and the exercise-kind rules.
The model orders the days by relevance to the user and writes a psychologically-tailored
one-line description per day, then submits the finished plan via a structured tool call.
"""
import json
import logging

from .config import DEFAULT_MODEL
from .openai_client import client
from .prompts.system import build_system_prompt
from .tools.registry import execute_tool
from .tools.exercise import ExerciseSearch

log = logging.getLogger(__name__)

MAX_ROUNDS = 5

ACTIVITY_LABEL = {
    "lifting": "lifts weights regularly",
    "cardio": "does cardio / running",
    "mixed": "trains a bit of everything",
    "inactive": "is not training right now",
}
GOAL_LABEL = {
    "muscle": "gain muscle",
    "strength": "get stronger",
    "lean": "lose fat & get lean",
    "endurance": "build endurance & conditioning",
    "general": "just stay fit",
}
AGE_LABEL = {
    "new": "brand new (never trained)",
    "1-2y": "beginner (under 1 year)",
    "2-5y": "intermediate (1-3 years)",
    "5y+": "advanced (3+ years)",
}
EQUIP_LABEL = {
    "full_gym": "a full gym",
    "dumbbells": "dumbbells at home",
    "bodyweight": "bodyweight only",
    "bands": "resistance bands",
}

SUBMIT_PLAN_TOOL = {
    "type": "function",
    "function": {
        "name": "submit_workout_plan",
        "description": (
            "Submit the finished onboarding workout plan. Call this EXACTLY ONCE, as the very "
            "last step, with the complete plan. Days MUST be ordered most-relevant-first."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "e.g. 'Your 4-day muscle-building plan'"},
                "subtitle": {"type": "string", "description": "short line: equipment + any injury adaptations"},
                "days": {
                    "type": "array",
                    "description": "Ordered MOST RELEVANT to the user first.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "e.g. 'Push', 'Upper', 'Full Body A'"},
                            "focus": {"type": "string", "description": "muscle groups, e.g. 'Chest · Shoulders · Triceps'"},
                            "emoji": {"type": "string", "description": "one fitting emoji"},
                            "weekday": {
                                "type": "integer",
                                "description": (
                                    "Day of week to schedule this session on: 0=Monday, 1=Tuesday … 6=Sunday. "
                                    "Spread the week's sessions with rest days between hard ones; don't stack "
                                    "two demanding days back-to-back. Each weekday used at most once."
                                ),
                            },
                            "type": {
                                "type": "string",
                                "enum": ["strength", "run", "cardio", "mobility", "hiit", "other"],
                                "description": "Session type, for the calendar.",
                            },
                            "description": {
                                "type": "string",
                                "description": (
                                    "ONE SHORT punchy line (max ~9 words) that motivates THIS user for this "
                                    "specific day — distinct per day. Do NOT repeat the injury caveat (it's "
                                    "shown elsewhere). e.g. 'Maximize your arm and chest size.' or "
                                    "'Burn fat while keeping your legs strong.'"
                                ),
                            },
                            "exercises": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "sets": {"type": "integer"},
                                        "reps": {"type": "string", "description": "e.g. '8-12'"},
                                    },
                                    "required": ["name", "sets", "reps"],
                                },
                            },
                        },
                        "required": ["name", "focus", "emoji", "weekday", "type", "description", "exercises"],
                    },
                },
            },
            "required": ["title", "subtitle", "days"],
        },
    },
}


def _context_from_answers(a: dict) -> dict:
    """Shape the onboarding answers into the user_context build_system_prompt expects."""
    return {
        "profile": {
            "sex": a.get("sex"),
            "height_cm": a.get("heightCm"),
            "weight_kg": a.get("weightKg"),
            "training_age": a.get("trainingAge"),
        },
        "insights": {
            "goals": ", ".join(
                GOAL_LABEL.get(g, g)
                for g in (a.get("goals") or ([a.get("goal")] if a.get("goal") else []))
                if g
            ),
            "injury_tags": [l for l in (a.get("limitations") or []) if l != "other"]
            + ([a["customLimitation"].strip()] if (a.get("customLimitation") or "").strip() else []),
        },
        "recent_workouts": [],
    }


def _task_message(a: dict) -> str:
    limits = [l for l in (a.get("limitations") or []) if l and l not in ("none", "other")]
    custom = (a.get("customLimitation") or "").strip()
    if custom:
        limits.append(custom)  # free-text "something else" injury
    injuries = ", ".join(l.replace("_", " ") for l in limits) if limits else "none"
    subs = [s.replace("_", " ") for s in (a.get("subGoals") or [])]
    sub_goals = ", ".join(subs) if subs else "no specific priority"
    goal_list = a.get("goals") or ([a.get("goal")] if a.get("goal") else [])
    goals_str = ", ".join(GOAL_LABEL.get(g, g) for g in goal_list if g) or "get fit"
    days = a.get("daysPerWeek") or 3
    bmi = None
    h, w = a.get("heightCm"), a.get("weightKg")
    if h and w:
        bmi = round(w / ((h / 100) ** 2), 1)
    return (
        "Generate this NEW user's first workout plan from their onboarding answers.\n\n"
        f"- Sex: {a.get('sex')}\n"
        f"- Height/Weight: {h}cm / {w}kg" + (f" (BMI {bmi})\n" if bmi else "\n") +
        f"- Trains now: {ACTIVITY_LABEL.get(a.get('currentActivity'), a.get('currentActivity'))}\n"
        f"- Experience: {AGE_LABEL.get(a.get('trainingAge'), a.get('trainingAge'))}\n"
        f"- Goal(s): {goals_str}\n"
        f"- Priorities (weight these heavily): {sub_goals}\n"
        f"- Days per week: {days}\n"
        f"- Equipment: {EQUIP_LABEL.get(a.get('equipment'), a.get('equipment'))}\n"
        f"- Injuries to work around: {injuries}\n\n"
        "Requirements — make it feel expertly, SPECIFICALLY tailored to this exact person:\n"
        f"1. Exactly {days} training days, split appropriately for that frequency and their level.\n"
        "2. Program for their goal(s)' REAL training modality — if they picked MULTIPLE goals, blend them "
        "intelligently (e.g. muscle+endurance = concurrent/hybrid; strength+lean = strength in a deficit). "
        "An endurance/running goal MUST include actual "
        "running work (speed intervals, tempo, easy + long runs) plus supporting strength, NOT a bodybuilding "
        "split; a strength goal centers the big compound lifts; hypertrophy uses a muscle split; etc.\n"
        "3. INJURIES — don't just avoid them, ARMOR them. For each injury, proactively BULLETPROOF that area: "
        "dedicate targeted prehab/strengthening to it (e.g. knees → VMO / terminal-knee-extension / tibialis / "
        "hip & glute work; lower back → dead-bug/core bracing + hip-hinge patterning; shoulders → cuff & scap "
        "work) AND add a short joint-specific warm-up, so the plan actively FIXES their weak point instead of "
        "tiptoeing around it. Still substitute anything that would aggravate it. This can be its own short "
        "segment or a dedicated 'armor' focus — make them feel it's handled.\n"
        "4. Give their PRIORITIES extra attention — more volume / better exercise selection for those "
        "muscles or lifts, biased earlier in the week.\n"
        "5. Sets/reps appropriate to their goal and experience.\n"
        "6. ORDER THE DAYS most-relevant-first: the day that moves the needle most on their goal, priorities, "
        "and injury-proofing goes first.\n"
        "7. For each day write a SHORT `description` (max ~9 words), distinct per day, that motivates THIS "
        "user and nods to their priorities/armor where it fits. No injury caveat (shown elsewhere).\n"
        f"8. SCHEDULE it: give each day a `weekday` (0=Mon … 6=Sun) and a `type`. Spread the {days} sessions "
        "across the week with rest days between demanding sessions (e.g. 4 days → Mon/Tue/Thu/Sat), suited to "
        "their goal. Each weekday used once; array order stays most-relevant-first (weekday is independent).\n\n"
        "HOW TO WORK — BE FAST (this blocks a loading screen):\n"
        "- Issue ALL the exercise__search calls you need in ONE single turn, as PARALLEL tool calls (one search "
        "per muscle group / movement pattern / 'running' / prehab area). NEVER search one at a time across "
        "multiple turns — that is slow and not allowed.\n"
        "- The search results already contain everything you need (name, kind, muscles). Do NOT fetch further "
        "details.\n"
        "- Immediately after that single batch of searches, call submit_workout_plan EXACTLY ONCE with the full "
        "plan. Never write prose to the user. Target: finish in two turns."
    )


def _serialize_tool_calls(tool_calls) -> list:
    return [
        {
            "id": tc.id,
            "type": "function",
            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
        }
        for tc in tool_calls
    ]


async def generate_onboarding_plan(db, user_id: str, answers: dict) -> dict:
    """Run the tool-equipped AI to produce a structured, ordered, described plan."""
    user_context = _context_from_answers(answers)
    system_prompt = build_system_prompt(user_context)
    system_prompt += (
        "\n\n## ONBOARDING PLAN MODE\n"
        "You are building a brand-new user's FIRST plan from their onboarding answers, using the real exercise DB. "
        "Make it feel expertly, specifically tailored to THIS person — their goal's real modality, their "
        "priorities, and their injuries (which you ARMOR with prehab, not just avoid). "
        "Work FAST: batch every exercise__search into a SINGLE turn (parallel tool calls), never search one at a "
        "time, and finish by calling submit_workout_plan exactly once — never reply with prose."
    )

    tools = [ExerciseSearch().openai_schema, SUBMIT_PLAN_TOOL]
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": _task_message(answers)},
    ]

    for _ in range(MAX_ROUNDS):
        resp = await client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=messages,
            tools=tools,
            temperature=0.6,
            stream=False,
            reasoning_effort="minimal",  # plan-gen needs good selection, not deep deliberation — keeps it fast
        )
        msg = resp.choices[0].message
        tool_calls = msg.tool_calls or []

        if not tool_calls:
            messages.append({"role": "assistant", "content": msg.content or ""})
            messages.append({"role": "user", "content": "Call submit_workout_plan now with the final plan."})
            continue

        messages.append(
            {"role": "assistant", "content": msg.content or None, "tool_calls": _serialize_tool_calls(tool_calls)}
        )

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            if name == "submit_workout_plan":
                if not args.get("days"):
                    raise ValueError("submit_workout_plan called without days")
                return args

            result = await execute_tool(name, args, db, user_id)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

    raise RuntimeError("AI did not submit a plan within the round limit")
