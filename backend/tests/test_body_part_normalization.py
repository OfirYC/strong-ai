"""Regression tests for body part normalization — STR-??: invalid body parts caused Pydantic 422s."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from models import normalize_body_part, Exercise, BodyPart
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
        ("Deltoids", "Shoulders"),
        ("pecs", "Chest"),
        ("lats", "Back"),
        ("lower back", "Back"),
        ("abdominals", "Abs"),
        ("glute", "Glutes"),
        ("hip flexors", "Hips"),
        ("trapezius", "Traps"),
        ("full body", "Full Body"),
        ("gastrocnemius", "Calves"),
    ]
    for raw, expected in cases:
        assert normalize_body_part(raw) == expected, f"{raw!r} → expected {expected!r}"


def test_unknown_value_maps_to_other():
    assert normalize_body_part("ZorgMuscle") == "Other"
    assert normalize_body_part("something weird") == "Other"


def test_exercise_model_coerces_invalid_body_parts():
    """Exercise model must not raise on unknown body part strings."""
    ex = Exercise(
        name="Test Exercise",
        exercise_kind=EXERCISE_KIND,
        primary_body_parts=["Arms", "Deltoids", "Lower Back"],
        secondary_body_parts=["ZorgMuscle"],
    )
    assert ex.primary_body_parts == [BodyPart.BICEPS, BodyPart.SHOULDERS, BodyPart.BACK]
    assert ex.secondary_body_parts == [BodyPart.OTHER]


def test_exercise_model_accepts_valid_body_parts():
    ex = Exercise(
        name="Bench Press",
        exercise_kind=EXERCISE_KIND,
        primary_body_parts=["Chest"],
        secondary_body_parts=["Triceps", "Shoulders"],
    )
    assert ex.primary_body_parts == [BodyPart.CHEST]
    assert ex.secondary_body_parts == [BodyPart.TRICEPS, BodyPart.SHOULDERS]


def test_exercise_model_no_crash_on_completely_unknown():
    """Previously would raise ValidationError — must silently coerce to Other."""
    ex = Exercise(
        name="Mystery Move",
        exercise_kind=EXERCISE_KIND,
        primary_body_parts=["Hip Flexors", "Erector Spinae", "Inner Thigh"],
    )
    for bp in ex.primary_body_parts:
        assert bp in BodyPart
