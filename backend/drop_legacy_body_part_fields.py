"""
Drop primary_body_parts and secondary_body_parts from all exercise documents.

These fields are no longer used — muscle_loads is the single source of truth.
The Pydantic models already ignore them; this is a cosmetic DB cleanup.

Usage:
    cd backend && source venv/bin/activate
    python drop_legacy_body_part_fields.py --dry-run   # preview
    python drop_legacy_body_part_fields.py             # apply

Safe to re-run: only documents that still have either field are touched.
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

DRY_RUN = "--dry-run" in sys.argv


async def drop():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "workout_tracker")]

    # Count how many docs still have these fields
    has_field = await db.exercises.count_documents({
        "$or": [
            {"primary_body_parts": {"$exists": True}},
            {"secondary_body_parts": {"$exists": True}},
        ]
    })

    print(f"Documents with legacy body part fields: {has_field}")

    if has_field == 0:
        print("Nothing to do — fields already absent.")
        client.close()
        return

    if DRY_RUN:
        print(f"[DRY RUN] Would $unset primary_body_parts + secondary_body_parts on {has_field} documents.")
        print("Re-run without --dry-run to apply.")
    else:
        result = await db.exercises.update_many(
            {"$or": [
                {"primary_body_parts": {"$exists": True}},
                {"secondary_body_parts": {"$exists": True}},
            ]},
            {"$unset": {"primary_body_parts": "", "secondary_body_parts": ""}},
        )
        print(f"Done — {result.modified_count} documents updated.")

    client.close()


if __name__ == "__main__":
    asyncio.run(drop())
