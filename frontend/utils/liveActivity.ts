// liveActivity.ts
import { Platform } from "react-native";
import * as LiveActivity from "expo-live-activity";

export type WorkoutLiveModel = {
  workoutName: string;
  timerStartDateInMilliseconds: number;
  exerciseCount: number;
  completedSets: number;
  totalSets: number;

  currentExerciseName?: string;

  // Current set info
  currentSet?: number;
  currentWeight?: number;
  currentReps?: number;
  currentDurationSeconds?: number;   // ✅ NEW
  currentDistanceKm?: number;        // ✅ NEW
  isSetComplete?: boolean;

  // rest mode
  restEndAtMs?: number;
  restStartedAtMs?: number;
  workoutStartTimeMs: number;
};


const isSupported = () => Platform.OS === "ios";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function buildSetsText(model: WorkoutLiveModel) {
  if (model.totalSets > 0)
    return `${model.completedSets}/${model.totalSets} sets`;
  return `${model.completedSets} sets`;
}

function buildSubtitleActive(model: WorkoutLiveModel) {
  const setsText = buildSetsText(model);
  const exerciseText =
    model.exerciseCount > 0 ? plural(model.exerciseCount, "exercise") : null;

  // Prefer "Set x/y • ExerciseName" over adding too many chips
  const parts = [setsText].filter(Boolean);

  // Keep it short: 1–2 chunks max
  return parts.slice(0, 2).join(" • ");
}

function buildSubtitleRest(model: WorkoutLiveModel) {
  // Keep rest subtitle super stable
  return `Rest • ${buildSetsText(model)}`;
}

function buildState(model: WorkoutLiveModel) {
  const title = model.workoutName || "Penis";

  const isRest = model.restEndAtMs != null;
  console.log("Model", JSON.stringify(model, null, 2));
const payload = {
  subtitle: isRest ? buildSubtitleRest(model) : buildSubtitleActive(model),
  workoutStartDateInMilliseconds: model.workoutStartTimeMs,

  timerStartDateInMilliseconds: isRest
    ? (model.restStartedAtMs ??
        Math.max(0, model.restEndAtMs! - 60_000))
    : model.timerStartDateInMilliseconds,

  currentSet: model.currentSet,
  totalSets: model.totalSets,
  currentWeight: model.currentWeight,
  currentReps: model.currentReps,
  completedSets: model.completedSets,
  isSetComplete: model.isSetComplete,

  exerciseName: model.currentExerciseName,

  // ✅ NEW FIELDS (must match Swift names EXACTLY)
  durationInSeconds: model.currentDurationSeconds,
  distanceInKm: model.currentDistanceKm,
};


  const subtitle = JSON.stringify(payload);

  if (isRest) {
    const endMs = model.restEndAtMs!;
    const startMs =
      model.restStartedAtMs ??
      // fallback (not ideal): assume 60s rest if you can't provide start
      Math.max(0, endMs - 60_000);

    return {
      title,
      subtitle: subtitle,

      // ✅ what Swift expects now
      timerStartDateInMilliseconds: startMs,
      timerEndDateInMilliseconds: endMs,
      progressBar: { date: endMs },
    };
  }

  // Active mode (no countdown)
  const progress =
    model.totalSets > 0 ? model.completedSets / model.totalSets : 0;

  return {
    title,
    subtitle,
    progress,
    imageName: "barbell",
    dynamicIslandImageName: "barbell",
  };
}

function buildConfig() {
  return {
    backgroundColor: "#FFFFFF",
    titleColor: "#111111",
    subtitleColor: "#6B7280", // iOS-ish secondary gray
    progressViewTint: "#0A84FF", // iOS system blue
    progressViewLabelColor: "#FFFFFF",
    deepLinkUrl: "/workout/active",
    timerType: "digital",
    padding: 14,
    paddingDetails: { horizontal: 16, top: 14, bottom: 14 },
    imagePosition: "left",
    imageAlign: "center",
    imageWidth: 22,
    imageHeight: 22,
    contentFit: "contain",
  };
}

export async function startWorkoutLiveActivity(model: WorkoutLiveModel) {
  if (!isSupported()) return null;

  const state = buildState(model);
  console.log("State", Object.keys(state));

  const config = buildConfig();
  const id = await LiveActivity.startActivity(state as any, config as any);

  return (id ?? null) as string | null;
}

export async function updateWorkoutLiveActivity(
  activityId: string,
  model: WorkoutLiveModel,
) {
  if (!isSupported()) return;

  const state = buildState(model);
  console.log(`[LA]: State`, state);

  await LiveActivity.updateActivity(activityId, state as any);
}

export async function stopWorkoutLiveActivity(activityId: string) {
  if (!isSupported()) return;

  await LiveActivity.stopActivity(activityId, {
    title: "Workout finished",
  } as any);
}
