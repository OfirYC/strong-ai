import { useEffect, useState } from "react";
import { ExerciseHistoryResponse, SetType } from "../types";
import api from "../utils/api";

export interface PreviousSetData {
  weight?: number;
  reps?: number;
  duration?: number; // seconds
  distance?: number; // km
  set_type?: SetType;
}

// Top-level cache so switching screens doesn’t refetch
const historyCache = new Map<string, ExerciseHistoryResponse>();

type MinimalExercise = {
  id: string;
  sets: { set_type?: SetType }[];
};

const WORK_SET_TYPES: SetType[] = [
  "normal",
  "failure",
  "to_failure",
  "amrap",
] as SetType[];

const isWarmup = (t?: SetType) => t === "warmup";
const isCooldown = (t?: SetType) => t === "cooldown";
const isWorkSet = (t?: SetType) => !!t && WORK_SET_TYPES.includes(t);

export function useMultipleExercisesPreviousSets(
  exercises: MinimalExercise[] | null | undefined
) {
  const [previousMap, setPreviousMap] = useState<
    Record<string, (PreviousSetData | null)[]>
  >({});
  const [loading, setLoading] = useState<boolean>(false);

  // Single stable dependency key so we don't duplicate JSON.stringify work
  const depKey = JSON.stringify(
    (exercises ?? []).map(ex => ({
      id: ex.id,
      setTypes: ex.sets?.map(s => s.set_type ?? null),
    }))
  );

  useEffect(() => {
    if (!exercises || exercises.length === 0) return;

    let cancelled = false;
    setLoading(true);

    async function loadAll() {
      const results: Record<string, (PreviousSetData | null)[]> = {};

      for (const ex of exercises ?? []) {
        if (!ex?.id || !ex.sets) continue;

        // Get history (cache first)
        let data = historyCache.get(ex.id);
        if (!data) {
          const res = await api.get(
            `/workouts/history/by-exercise?exercise_id=${ex.id}&days_back=365&limit_workouts=100`
          );
          data = res.data as ExerciseHistoryResponse;
          historyCache.set(ex.id, data);
        }

        const sorted = [...(data.history || [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        const prevForExercise: (PreviousSetData | null)[] = ex.sets.map(
          currentSet => {
            const t = currentSet.set_type;
            if (!t) return null;

            // Find latest workout that contains this type group
            const matchingWorkout = sorted.find(w => {
              const sets = w.sets ?? [];
              const hasWarmup = sets.some(s => isWarmup(s.set_type));
              const hasCooldown = sets.some(s => isCooldown(s.set_type));
              const hasWork = sets.some(s => isWorkSet(s.set_type));

              if (isWarmup(t)) return hasWarmup;
              if (isCooldown(t)) return hasCooldown;
              return hasWork; // normal / failure / etc.
            });

            if (!matchingWorkout) return null;

            const sets = matchingWorkout.sets ?? [];
            const warmups = sets.filter(s => isWarmup(s.set_type));
            const cooldowns = sets.filter(s => isCooldown(s.set_type));
            const worksets = sets.filter(s => isWorkSet(s.set_type));

            // Warmup: index within warmup group
            if (isWarmup(t)) {
              const idx = ex.sets
                .filter(s => isWarmup(s.set_type))
                .indexOf(currentSet);
              if (idx < 0 || idx >= warmups.length) return null;
              const src = warmups[idx];
              return {
                weight: src.weight ?? undefined,
                reps: src.reps ?? undefined,
                duration: src.duration ?? undefined,
                distance: src.distance ?? undefined,
                set_type: src.set_type,
              };
            }

            // Cooldown: index within cooldown group
            if (isCooldown(t)) {
              const idx = ex.sets
                .filter(s => isCooldown(s.set_type))
                .indexOf(currentSet);
              if (idx < 0 || idx >= cooldowns.length) return null;
              const src = cooldowns[idx];
              return {
                weight: src.weight ?? undefined,
                reps: src.reps ?? undefined,
                duration: src.duration ?? undefined,
                distance: src.distance ?? undefined,
                set_type: src.set_type,
              };
            }

            // Work sets (normal/failure/etc.): index within work group
            const currentWorkIdx = ex.sets
              .filter(s => isWorkSet(s.set_type))
              .indexOf(currentSet);

            if (currentWorkIdx < 0 || currentWorkIdx >= worksets.length) {
              return null;
            }

            const src = worksets[currentWorkIdx];
            return {
              weight: src.weight ?? undefined,
              reps: src.reps ?? undefined,
              duration: src.duration ?? undefined,
              distance: src.distance ?? undefined,
              set_type: src.set_type,
            };
          }
        );

        results[ex.id] = prevForExercise;
      }

      if (!cancelled) {
        setPreviousMap(results);
        setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [depKey]); // re-run when ids or set_types change

  return {
    previousMap, // { [exerciseId]: PreviousSetData[] }
    loading,
  };
}
