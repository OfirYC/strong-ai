"""
One-time migration: normalize stale enum values across exercises and planned_workouts.

Fixes three classes of prod errors seen in Railway logs (2026-05-26):
  1. exercises.primary_body_parts / secondary_body_parts — free-form strings like "Cardio"
  2. exercises.category — values like "Balance" not in ExerciseCategory enum
  3. planned_workouts.type — values like "recovery" not in PlannedWorkoutType enum

Run once against the target DB:
    cd backend && source venv/bin/activate
    MONGO_URL=<prod-url> python migrate_body_parts.py [--dry-run]

Safe to re-run: documents already clean are skipped.
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))
from models import (
    normalize_body_part, normalize_exercise_category, normalize_planned_workout_type,
    BodyPart, ExerciseCategory, PlannedWorkoutType,
)

VALID_BODY_PARTS = {bp.value for bp in BodyPart}
VALID_CATEGORIES = {c.value for c in ExerciseCategory}
VALID_PLANNED_TYPES = {t.value for t in PlannedWorkoutType}

DRY_RUN = "--dry-run" in sys.argv


async def migrate_exercises(db):
    total = updated = skipped = 0
    async for doc in db.exercises.find(
        {},
        projection={"_id": 1, "name": 1, "primary_body_parts": 1, "secondary_body_parts": 1, "category": 1},
    ):
        total += 1
        name = doc.get("name", "?")

        primary_raw = doc.get("primary_body_parts") or []
        secondary_raw = doc.get("secondary_body_parts") or []
        category_raw = doc.get("category")

        dirty_primary = [p for p in primary_raw if isinstance(p, str) and p not in VALID_BODY_PARTS]
        dirty_secondary = [p for p in secondary_raw if isinstance(p, str) and p not in VALID_BODY_PARTS]
        dirty_category = isinstance(category_raw, str) and category_raw not in VALID_CATEGORIES

        if not dirty_primary and not dirty_secondary and not dirty_category:
            skipped += 1
            continue

        primary_clean = [normalize_body_part(p) if isinstance(p, str) else p for p in primary_raw]
        secondary_clean = [normalize_body_part(p) if isinstance(p, str) else p for p in secondary_raw]
        category_clean = normalize_exercise_category(category_raw) if dirty_category else category_raw

        changes = []
        if dirty_primary:
            changes.append(f"    primary:   {primary_raw} → {primary_clean}")
        if dirty_secondary:
            changes.append(f"    secondary: {secondary_raw} → {secondary_clean}")
        if dirty_category:
            changes.append(f"    category:  {category_raw!r} → {category_clean!r}")

        print(f"  {'[DRY] ' if DRY_RUN else ''}exercise {doc['_id']} '{name}'")
        for c in changes:
            print(c)

        if not DRY_RUN:
            update = {
                "primary_body_parts": primary_clean,
                "secondary_body_parts": secondary_clean,
            }
            if dirty_category:
                update["category"] = category_clean
            await db.exercises.update_one({"_id": doc["_id"]}, {"$set": update})

        updated += 1

    return total, updated, skipped


async def migrate_planned_workouts(db):
    total = updated = skipped = 0
    async for doc in db.planned_workouts.find(
        {"type": {"$exists": True, "$ne": None}},
        projection={"_id": 1, "name": 1, "type": 1},
    ):
        total += 1
        type_raw = doc.get("type")
        if not isinstance(type_raw, str) or type_raw in VALID_PLANNED_TYPES:
            skipped += 1
            continue

        type_clean = normalize_planned_workout_type(type_raw)
        print(f"  {'[DRY] ' if DRY_RUN else ''}planned_workout {doc['_id']} '{doc.get('name', '?')}'")
        print(f"    type: {type_raw!r} → {type_clean!r}")

        if not DRY_RUN:
            await db.planned_workouts.update_one(
                {"_id": doc["_id"]}, {"$set": {"type": type_clean}}
            )
        updated += 1

    return total, updated, skipped


async def migrate():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "workout_tracker")]

    print("=== exercises ===")
    ex_total, ex_updated, ex_skipped = await migrate_exercises(db)
    print(f"\n{'[DRY] ' if DRY_RUN else ''}exercises: scanned {ex_total}, updated {ex_updated}, clean {ex_skipped}.")

    print("\n=== planned_workouts ===")
    pw_total, pw_updated, pw_skipped = await migrate_planned_workouts(db)
    print(f"\n{'[DRY] ' if DRY_RUN else ''}planned_workouts: scanned {pw_total}, updated {pw_updated}, clean {pw_skipped}.")

    client.close()

    if DRY_RUN:
        print("\nRe-run without --dry-run to apply changes.")


if __name__ == "__main__":
    asyncio.run(migrate())
