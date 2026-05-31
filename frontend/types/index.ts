// ============= IMPORTS FROM GENERATED TYPES =============
// All interfaces come from the backend — do not manually duplicate them here.
// Run 'yarn generate:types' to update.

export type {
  User,
  Exercise,
  ExerciseKind,
  ExerciseCategory,
  SetType,
  WorkoutSet,
  WorkoutSetItem,
  WorkoutExercise,
  WorkoutExerciseItem,
  TemplateSet,
  TemplateSetItem,
  TemplateExercise,
  TemplateExerciseItem,
  WorkoutTemplate,
  WorkoutTemplateResponse,
  WorkoutSession,
  WorkoutSessionResponse,
  WorkoutExerciseSummary,
  WorkoutSummary,
  PRRecord,
  PRRecordResponse,
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  PlannedWorkout,
  PlannedWorkoutResponse,
  ProfileInsights,
  UserProfile,
} from "@/types/gen";

import type { ExerciseKind, SetType } from "@/types/gen";

// ============= CONST ARRAYS =============
// Derived from generated types — TS will error here if backend adds a new value
// and you haven't added it to the array yet.

export const EXERCISE_KINDS: ExerciseKind[] = [
  "Barbell",
  "Dumbbell",
  "Machine/Other",
  "Weighted Bodyweight",
  "Assisted Bodyweight",
  "Reps Only",
  "Duration",
  "Cardio",
  "Weighted Cardio",
  "Weighted Duration",
  "Band",
  "Cable",
  "Kettlebell",
  "EMOM (Every Minute On The Minute)",
  "ETOT (Every Thirty Seconds on Thirty Seconds)",
];

export const SET_TYPES: SetType[] = ["normal", "warmup", "cooldown", "failure"];

// ============= UI CONFIG =============

export const SET_TYPE_CONFIG: Record<
  SetType,
  { label: string; initial: string; color: string; bgColor: string }
> = {
  normal: {
    label: "Normal",
    initial: "",
    color: "#000000",
    bgColor: "transparent",
  },
  warmup: {
    label: "Warmup",
    initial: "W",
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.15)",
  },
  cooldown: {
    label: "Cooldown",
    initial: "C",
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.15)",
  },
  failure: {
    label: "Failure",
    initial: "F",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.15)",
  },
};

// ============= HELPER FUNCTIONS =============

export function getExerciseFields(kind: ExerciseKind): string[] {
  switch (kind) {
    case "Barbell":
    case "Dumbbell":
    case "Machine/Other":
    case "Weighted Bodyweight":
    case "Assisted Bodyweight":
      return ["weight", "reps"];
    case "Reps Only":
      return ["reps"];
    case "Duration":
      return ["duration"];
    case "Cardio":
      return ["duration", "distance"];
    case "Weighted Cardio":
      return ["duration", "distance", "weight"];
    case "Weighted Duration":
      return ["duration", "weight"];
    case "Band":
    case "Cable":
      return ["weight", "reps"];
    case "Kettlebell":
      return ["weight", "reps"];
    case "EMOM (Every Minute On The Minute)":
    case "ETOT (Every Thirty Seconds on Thirty Seconds)":
      return ["reps", "weight", "duration"];
    default:
      return ["weight", "reps"];
  }
}

export function isDurationBased(kind: ExerciseKind): boolean {
  return [
    "Duration",
    "Cardio",
    "Weighted Cardio",
    "Weighted Duration",
    "EMOM (Every Minute On The Minute)",
    "ETOT (Every Thirty Seconds on Thirty Seconds)",
  ].includes(kind);
}

export function usesWeight(kind: ExerciseKind): boolean {
  return [
    "Barbell",
    "Dumbbell",
    "Machine/Other",
    "Weighted Bodyweight",
    "Assisted Bodyweight",
    "Weighted Cardio",
    "Weighted Duration",
    "Band",
    "Cable",
    "Kettlebell",
    "EMOM (Every Minute On The Minute)",
    "ETOT (Every Thirty Seconds on Thirty Seconds)",
  ].includes(kind);
}

export function usesDistance(kind: ExerciseKind): boolean {
  return ["Cardio", "Weighted Cardio"].includes(kind);
}

export function usesReps(kind: ExerciseKind): boolean {
  return [
    "Barbell",
    "Dumbbell",
    "Machine/Other",
    "Weighted Bodyweight",
    "Assisted Bodyweight",
    "Reps Only",
    "Band",
    "Cable",
    "Kettlebell",
    "EMOM (Every Minute On The Minute)",
    "ETOT (Every Thirty Seconds on Thirty Seconds)",
  ].includes(kind);
}

// ============= FORMAT HELPERS =============

export function formatDuration(seconds: number): string {
  const totalCentiseconds = Math.round(seconds * 100);
  const mins = Math.floor(totalCentiseconds / 6000);
  const secs = Math.floor((totalCentiseconds % 6000) / 100);
  const centis = totalCentiseconds % 100;

  if (centis > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}.${centis
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDurationMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins}m`;
}

export function formatWorkoutDuration(seconds: number): string {
  const totalMins = Math.round(seconds / 60);

  if (totalMins < 60) {
    return `${totalMins}m`;
  }

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const paddedMins = mins.toString().padStart(2, "0");

  return `${hours}h ${paddedMins}m`;
}
