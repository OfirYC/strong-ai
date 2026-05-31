"""Regression tests for body part normalization helpers and category/planned-workout-type coercion."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import (
    normalize_body_part,
    normalize_exercise_category,
    normalize_planned_workout_type,
    Exercise,
    ExerciseCategory,
    PlannedWorkoutType,
    BodyPart,
)
from constants import EXERCISE_KIND_RULES


EXERCISE_KIND = next(iter(EXERCISE_KIND_RULES))


def test_valid_body_parts_pass_through():
    for bp in BodyPart:
        assert normalize_body_part(bp.value) == bp.value


def test_aliases_map_to_valid_values():
    cases = [
        ("Arms", "Biceps"),
        ("arms", "Biceps"),
        ("deltoids", "Shoulders"),
        ("pecs", "Chest"),
        ("lats", "Back"),
        ("lower back", "Back"),
        ("abdominals", "Abs"),
        ("glute", "Glutes"),
        ("gastrocnemius", "Calves"),
    ]
    for raw, expected in cases:
        assert normalize_body_part(raw) == expected, f"{raw!r} → expected {expected!r}"


def test_unknown_body_part_maps_to_other():
    assert normalize_body_part("ZorgMuscle") == "Other"
    assert normalize_body_part("something weird") == "Other"


def test_exercise_category_coercion():
    assert normalize_exercise_category("Balance") == "Stability"
    assert normalize_exercise_category("Strength") == "Strength"
    assert normalize_exercise_category("rehab") == "Recovery"
    assert normalize_exercise_category("UnknownThing") == "Strength"


def test_planned_workout_type_coercion():
    assert normalize_planned_workout_type("recovery") == "other"
    assert normalize_planned_workout_type("cardio") == "cardio"
    assert normalize_planned_workout_type("swim") == "cardio"
    assert normalize_planned_workout_type("unknown") == "other"


def test_exercise_model_creates_without_body_parts():
    """Exercise model no longer requires primary_body_parts."""
    ex = Exercise(
        name="Bench Press",
        exercise_kind=EXERCISE_KIND,
        muscle_loads=[],
    )
    assert ex.name == "Bench Press"
    assert ex.muscle_loads == []
    assert not ex.is_tagged


def test_exercise_category_validator_on_model():
    """Exercise model coerces invalid category at read time."""
    ex = Exercise(
        name="BOSU Balance",
        exercise_kind=EXERCISE_KIND,
        category="Balance",
    )
    assert ex.category == ExerciseCategory.STABILITY
