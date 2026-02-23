import json
from datetime import datetime, timedelta
from typing import Dict, Any, List

from bson import ObjectId

from .base import BaseTool
from constants import EXERCISE_KIND_RULES

EXERCISE_KIND_ENUM: List[str] = list(EXERCISE_KIND_RULES.keys())
DEFAULT_EXERCISE_KIND = (
    "Machine/Other" if "Machine/Other" in EXERCISE_KIND_RULES else (EXERCISE_KIND_ENUM[0] if EXERCISE_KIND_ENUM else "Machine/Other")
)


class WorkoutHistoryGetAll(BaseTool):
    name = "workout_history__get_all"
    description = (
        "Get recent completed workouts.\n"
        "- By default (expanded=false) returns lightweight summaries: volume, set count, etc.\n"
        "- If expanded=true, returns FULL workouts including exercises and sets.\n"
        "Use expanded=true only when you specifically need per-exercise/per-set detail."
    )
    parameters = {
        "type": "object",
        "properties": {
            "days_back": {
                "type": "integer",
                "default": 30,
                "description": "How many days back to look (1–365).",
            },
            "limit": {
                "type": "integer",
                "default": 30,
                "description": "Max workouts to return (1–200).",
            },
            "expanded": {
                "type": "boolean",
                "default": False,
                "description": (
                    "If true, return full workout documents including exercises and sets. "
                    "If false (default), return compact summaries only (total volume, set count, etc.)."
                ),
            },
        },
        "required": ["days_back", "limit"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]
  
        days_back = max(1, min(int(args.get("days_back", 30) or 30), 365))
        limit = max(1, min(int(args.get("limit", 30) or 30), 200))
        expanded = bool(args.get("expanded", False))

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
        

        if expanded:
            expanded_workouts = []
            for w in workouts:
                w_copy = dict(w)
                if "_id" in w_copy:
                    w_copy["id"] = str(w_copy.pop("_id"))
                for dt_key in ("started_at", "ended_at", "created_at", "updated_at"):
                    if w_copy.get(dt_key) is not None:
                        try:
                            w_copy[dt_key] = w_copy[dt_key].isoformat()
                        except Exception:
                            pass
                for ex in (w_copy.get("exercises") or []):
                    if isinstance(ex.get("exercise_id"), ObjectId):
                        ex["exercise_id"] = str(ex["exercise_id"])
                expanded_workouts.append(w_copy)
            return json.dumps(expanded_workouts, default=str)

        summaries = []
        for w in workouts:
            total_volume = 0.0
            ex_count = 0
            set_count = 0
            for ex in (w.get("exercises") or []):
                ex_count += 1
                for set_data in (ex.get("sets") or []):
                    set_count += 1
                    wt = set_data.get("weight")
                    reps = set_data.get("reps")
                    if wt is not None and reps is not None:
                        try:
                            total_volume += float(wt) * float(reps)
                        except Exception:
                            pass
            summaries.append(
                {
                    "id": str(w["_id"]),
                    "name": w.get("name", "Workout"),
                    "started_at": w.get("started_at").isoformat() if w.get("started_at") else None,
                    "ended_at": w.get("ended_at").isoformat() if w.get("ended_at") else None,
                    "exercise_count": ex_count,
                    "set_count": set_count,
                    "total_volume_kg": round(total_volume, 2),
                    "notes": w.get("notes"),
                }
            )
        return json.dumps(summaries)


class WorkoutHistoryGetByExercise(BaseTool):
    name = "workout_history__get_by_exercise"
    description = (
        "Get recent performance stats for a specific exercise_id from workout history.\n"
        "Returns best stats based on exercise_kind rules (e.g., strength: best_weight/best_e1rm; "
        "duration: best_duration; cardio: best_distance/best_pace when possible)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "exercise_id": {"type": "string"},
            "days_back": {"type": "integer", "default": 120},
            "limit_workouts": {"type": "integer", "default": 60},
        },
        "required": ["exercise_id"],
    }

    async def execute(self, args: Dict[str, Any], ctx: Dict[str, Any]) -> str:
        db = ctx["db"]
        user_id = ctx["user_id"]

        exercise_id = args.get("exercise_id")
        if not exercise_id:
            return json.dumps({"error": "exercise_id is required"})

        days_back = max(1, min(int(args.get("days_back", 120) or 120), 730))
        limit_workouts = max(1, min(int(args.get("limit_workouts", 60) or 60), 300))

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)

        ex_kind = DEFAULT_EXERCISE_KIND
        if ObjectId.is_valid(exercise_id):
            ex_doc = await db.exercises.find_one({"_id": ObjectId(exercise_id)})
            if ex_doc and ex_doc.get("exercise_kind"):
                ex_kind = ex_doc["exercise_kind"]
        if ex_kind not in EXERCISE_KIND_RULES:
            ex_kind = DEFAULT_EXERCISE_KIND

        allowed = set((EXERCISE_KIND_RULES.get(ex_kind) or {}).get("fields", []) or [])

        workouts = (
            await db.workouts.find(
                {"user_id": user_id, "ended_at": {"$ne": None}, "started_at": {"$gte": start_date, "$lte": end_date}}
            )
            .sort("started_at", -1)
            .limit(limit_workouts)
            .to_list(limit_workouts)
        )

        samples = []
        for w in workouts:
            w_date = w.get("started_at")
            for ex in w.get("exercises", []) or []:
                if str(ex.get("exercise_id")) != str(exercise_id):
                    continue
                for s in ex.get("sets", []) or []:
                    samples.append(
                        {
                            "date": w_date.isoformat() if w_date else None,
                            "reps": s.get("reps"),
                            "weight": s.get("weight"),
                            "duration": s.get("duration"),
                            "distance": s.get("distance"),
                            "calories": s.get("calories"),
                            "rest_timer": s.get("rest_timer"),
                        }
                    )

        base_result = {
            "exercise_id": exercise_id,
            "exercise_kind": ex_kind,
            "window_days": days_back,
            "workouts_scanned": len(workouts),
            "samples": len(samples),
        }

        # Strength-like
        if "reps" in allowed and "duration" not in allowed and "distance" not in allowed:
            def epley_1rm(wt: float, reps_i: int) -> float:
                return wt * (1.0 + reps_i / 30.0)

            max_weight = max_reps = best_e1rm = None
            best_set = None
            for s in samples:
                reps_v = s.get("reps")
                wt_v = s.get("weight")
                if reps_v is None:
                    continue
                try:
                    reps_i = int(reps_v)
                except Exception:
                    continue
                if max_reps is None or reps_i > max_reps:
                    max_reps = reps_i
                if wt_v is not None:
                    try:
                        wt_f = float(wt_v)
                    except Exception:
                        continue
                    if max_weight is None or wt_f > max_weight:
                        max_weight = wt_f
                    est = epley_1rm(wt_f, reps_i) if reps_i > 0 else wt_f
                    if best_e1rm is None or est > best_e1rm:
                        best_e1rm = est
                        best_set = {"date": s.get("date"), "weight": wt_f, "reps": reps_i}
                else:
                    if best_set is None or reps_i > (best_set.get("reps") or 0):
                        best_set = {"date": s.get("date"), "reps": reps_i}

            return json.dumps(
                {
                    **base_result,
                    "max_weight": max_weight,
                    "max_reps": max_reps,
                    "best_e1rm": round(best_e1rm, 2) if best_e1rm is not None else None,
                    "best_set": best_set,
                    "recent_sets": samples[:15],
                }
            )

        # Duration-only
        if "duration" in allowed and "reps" not in allowed and "distance" not in allowed:
            max_duration = None
            best_set = None
            for s in samples:
                dur = s.get("duration")
                if dur is None:
                    continue
                try:
                    dur_f = float(dur)
                except Exception:
                    continue
                if max_duration is None or dur_f > max_duration:
                    max_duration = dur_f
                    best_set = {"date": s.get("date"), "duration": dur_f}
            return json.dumps({**base_result, "max_duration_seconds": max_duration, "best_set": best_set, "recent_sets": samples[:15]})

        # Cardio
        if ("duration" in allowed or "distance" in allowed) and "reps" not in allowed:
            max_distance = best_pace = None
            best_distance_set = best_pace_set = None
            for s in samples:
                dist = s.get("distance")
                dur = s.get("duration")
                dist_f = dur_f = None
                try:
                    if dist is not None:
                        dist_f = float(dist)
                    if dur is not None:
                        dur_f = float(dur)
                except Exception:
                    pass
                if dist_f is not None:
                    if max_distance is None or dist_f > max_distance:
                        max_distance = dist_f
                        best_distance_set = {"date": s.get("date"), "distance_km": dist_f, "duration_seconds": dur_f}
                if dist_f is not None and dur_f is not None and dist_f > 0:
                    pace = dur_f / dist_f
                    if best_pace is None or pace < best_pace:
                        best_pace = pace
                        best_pace_set = {"date": s.get("date"), "distance_km": dist_f, "duration_seconds": dur_f, "pace_sec_per_km": pace}

            return json.dumps(
                {
                    **base_result,
                    "max_distance_km": max_distance,
                    "best_pace_sec_per_km": round(best_pace, 2) if best_pace is not None else None,
                    "best_distance_set": best_distance_set,
                    "best_pace_set": (
                        {**best_pace_set, "pace_sec_per_km": round(best_pace_set["pace_sec_per_km"], 2)}
                        if best_pace_set
                        else None
                    ),
                    "recent_sets": samples[:15],
                }
            )

        return json.dumps({**base_result, "recent_sets": samples[:15]})