# services/ai/tools/shared.py

import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
from constants import EXERCISE_KIND_RULES


def _format_kind_rules(rules: Dict[str, Dict[str, Any]]) -> str:
    lines: List[str] = []
    for kind in sorted(rules.keys()):
        rule = rules[kind] or {}
        fields = ", ".join(rule.get("fields", []) or [])
        desc = rule.get("description", "") or ""
        lines.append(f"- {kind}: {desc} | fields: {fields}")
    return "\n".join(lines)


EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())

DEFAULT_EXERCISE_KIND = (
    "Machine/Other"
    if "Machine/Other" in EXERCISE_KIND_RULES
    else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
)

kind_rules = _format_kind_rules(EXERCISE_KIND_RULES)


def _safe_object_id(value: str) -> Optional[ObjectId]:
    if not value or not ObjectId.is_valid(value):
        return None
    return ObjectId(value)


async def _get_exercise_kind_map(exercise_ids: List[str], db, user_id: str) -> Dict[str, str]:
    valid_oids: List[ObjectId] = []
    for ex_id in exercise_ids:
        if ObjectId.is_valid(ex_id):
            valid_oids.append(ObjectId(ex_id))

    kind_map: Dict[str, str] = {}
    if not valid_oids:
        return kind_map

    query = {
        "_id": {"$in": valid_oids},
        "$or": [{"user_id": {"$exists": False}}, {"user_id": None}, {"user_id": user_id}],
    }

    docs = await db.exercises.find(query).to_list(len(valid_oids))
    for d in docs:
        kind_map[str(d["_id"])] = d.get("exercise_kind") or DEFAULT_EXERCISE_KIND

    return kind_map


def _normalize_set_fields_by_kind(
    kind: str,
    reps: Optional[int],
    weight: Optional[float],
    duration: Optional[float],
    distance: Optional[float],
) -> Dict[str, Any]:
    kind = kind or DEFAULT_EXERCISE_KIND
    if kind not in EXERCISE_KIND_RULES:
        kind = DEFAULT_EXERCISE_KIND

    allowed = set((EXERCISE_KIND_RULES.get(kind) or {}).get("fields", []) or [])
    out: Dict[str, Any] = {}

    if "reps" in allowed:
        out["reps"] = int(reps) if reps is not None else 10
    if "weight" in allowed and weight is not None:
        out["weight"] = float(weight)
    if "duration" in allowed and duration is not None:
        out["duration"] = float(duration)
    if "distance" in allowed and distance is not None:
        out["distance"] = float(distance)

    is_time_or_distance_only = (("duration" in allowed) or ("distance" in allowed)) and ("reps" not in allowed)
    if is_time_or_distance_only and ("duration" not in out and "distance" not in out):
        out["duration"] = 600.0 if "distance" in allowed else 30.0

    if not out:
        out = {"reps": int(reps) if reps is not None else 10}
        if weight is not None:
            out["weight"] = float(weight)

    return out


async def _build_template_exercises_from_compact(
    exercises: List[Dict[str, Any]],
    db,
    user_id: str,
) -> List[Dict[str, Any]]:

    ex_ids = [e.get("exercise_id") for e in exercises if e.get("exercise_id")]
    kind_map = await _get_exercise_kind_map(ex_ids, db, user_id)

    template_exercises: List[Dict[str, Any]] = []

    for i, ex in enumerate(exercises):
        ex_id = ex.get("exercise_id")
        if not ex_id:
            continue

        kind = kind_map.get(ex_id) or DEFAULT_EXERCISE_KIND
        if kind not in EXERCISE_KIND_RULES:
            kind = DEFAULT_EXERCISE_KIND

        raw_sets = ex.get("sets")
        notes = ex.get("notes")

        sets_arr: List[Dict[str, Any]] = []

        if isinstance(raw_sets, list):
            for set_item in raw_sets:
                if not isinstance(set_item, dict):
                    continue

                set_type = set_item.get("set_type", "normal")
                if set_type not in ("normal", "warmup", "cooldown", "failure"):
                    set_type = "normal"

                rest_timer = set_item.get("rest_timer")

                normalized = _normalize_set_fields_by_kind(
                    kind,
                    set_item.get("reps"),
                    set_item.get("weight"),
                    set_item.get("duration"),
                    set_item.get("distance"),
                )

                set_dict: Dict[str, Any] = {"set_type": set_type, **normalized}

                if rest_timer is not None:
                    try:
                        set_dict["rest_timer"] = int(rest_timer)
                    except (TypeError, ValueError):
                        set_dict["rest_timer"] = None

                sets_arr.append(set_dict)

            if not sets_arr:
                rule_fields = set((EXERCISE_KIND_RULES.get(kind) or {}).get("fields", []) or [])
                is_time_or_distance_only = (
                    ("duration" in rule_fields) or ("distance" in rule_fields)
                ) and ("reps" not in rule_fields)
                num_sets = 1 if is_time_or_distance_only else 3

                base_fields = _normalize_set_fields_by_kind(kind, None, None, None, None)
                for _ in range(num_sets):
                    sets_arr.append({"set_type": "normal", "rest_timer": None, **base_fields})
        else:
            rule_fields = set((EXERCISE_KIND_RULES.get(kind) or {}).get("fields", []) or [])
            is_time_or_distance_only = (
                ("duration" in rule_fields) or ("distance" in rule_fields)
            ) and ("reps" not in rule_fields)
            num_sets = 1 if is_time_or_distance_only else 3

            base_fields = _normalize_set_fields_by_kind(kind, None, None, None, None)

            for _ in range(num_sets):
                sets_arr.append({"set_type": "normal", "rest_timer": None, **base_fields})

        num_sets = len(sets_arr)
        first_set = sets_arr[0] if sets_arr else {}

        template_exercises.append(
            {
                "exercise_id": ex_id,
                "order": i,
                "sets": sets_arr,
                "notes": notes,
                "default_sets": num_sets,
                "default_reps": first_set.get("reps"),
                "default_weight": first_set.get("weight"),
                "default_duration": first_set.get("duration"),
                "default_distance": first_set.get("distance"),
            }
        )

    return template_exercises
