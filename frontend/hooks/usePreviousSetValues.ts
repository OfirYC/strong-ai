import { useEffect, useState, useCallback } from "react";
import { ExerciseHistoryResponse, SetType } from "../types";
import api from "../utils/api";

export interface PreviousSetData {
  weight?: number;
  reps?: number;
  duration?: number; // seconds
  distance?: number; // km
  set_type?: SetType;
  rest_timer?: number; // seconds
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

const mapHistorySetToPrevious = (src: any): PreviousSetData => ({
  weight: src?.weight ?? undefined,
  reps: src?.reps ?? undefined,
  duration: src?.duration ?? undefined,
  distance: src?.distance ?? undefined,
  set_type: src?.set_type,
  rest_timer: src?.rest_timer ?? undefined,
});

/**
 * For each current set:
 * - Figure out its index within *its own type group* in the CURRENT workout
 *   (e.g. 3rd warmup, 2nd cooldown, 5th work set, etc.).
 * - Scan history from newest → oldest and pick the FIRST workout that has
 *   AT LEAST that many sets of that type.
 * - Use that workout's set at the same index.
 *
 * This matches your “most previous set of similar setType at similar index”.
 * If the most recent workout doesn’t have enough sets of that type,
 * it falls back to older workouts.
 */
function computePreviousForExercise(
  ex: MinimalExercise,
  data: ExerciseHistoryResponse
): (PreviousSetData | null)[] {
  const sorted = [...(data.history || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const currentWarmups = ex.sets.filter(s => isWarmup(s.set_type));
  const currentCooldowns = ex.sets.filter(s => isCooldown(s.set_type));
  const currentWorksets = ex.sets.filter(s => isWorkSet(s.set_type));

  return ex.sets.map(currentSet => {
    const t = currentSet.set_type;
    if (!t) return null;

    // Helper: given a predicate and an index in that type group,
    // find the most recent workout that has that index.
    const findMatchingSet = (
      isTypeFn: (t?: SetType) => boolean,
      idxInType: number
    ): PreviousSetData | null => {
      if (idxInType < 0) return null;

      const matchingWorkout = sorted.find(w => {
        const sets = w.sets ?? [];
        const group = sets.filter(s => isTypeFn(s.set_type));
        return group.length > idxInType;
      });

      if (!matchingWorkout) return null;

      const group = (matchingWorkout.sets ?? []).filter(s =>
        isTypeFn(s.set_type)
      );
      const src = group[idxInType];
      return src ? mapHistorySetToPrevious(src) : null;
    };

    // Warmup
    if (isWarmup(t)) {
      const idx = currentWarmups.indexOf(currentSet);
      return findMatchingSet(isWarmup, idx);
    }

    // Cooldown
    if (isCooldown(t)) {
      const idx = currentCooldowns.indexOf(currentSet);
      return findMatchingSet(isCooldown, idx);
    }

    // Work set (normal / failure / to_failure / amrap)
    if (isWorkSet(t)) {
      const idx = currentWorksets.indexOf(currentSet);
      return findMatchingSet(isWorkSet, idx);
    }

    return null;
  });
}

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

  const loadExerciseHistory = useCallback(
    async (exerciseId: string): Promise<ExerciseHistoryResponse | null> => {
      if (!exerciseId) return null;

      let data = historyCache.get(exerciseId);
      if (!data) {
        const res = await api.get(
          `/workouts/history/by-exercise?exercise_id=${exerciseId}&days_back=365&limit_workouts=100`
        );
        data = res.data as ExerciseHistoryResponse;
        historyCache.set(exerciseId, data);
      }

      return data;
    },
    []
  );

  /**
   * On-demand loader for a single exercise.
   *
   * arg:
   *   - true  -> return LAST workout's sets array (for pre-adding an exercise)
   *   - array -> use that as the current sets layout
   *   - undefined -> use sets from the hook's `exercises` prop
   *
   * IMPORTANT: when arg === true we DO NOT touch `previousMap`,
   * so the hook's own logic still uses your "most recent by type+index"
   * behavior when you later add more sets.
   */
  const loadExercisePreviousSets = useCallback(
    async (
      exerciseId: string,
      arg?: boolean | { set_type?: SetType }[]
    ): Promise<(PreviousSetData | null)[] | null> => {
      if (!exerciseId) return null;

      const history = await loadExerciseHistory(exerciseId);
      if (!history) return null;

      const useLastWorkoutSets = typeof arg === "boolean" ? arg : false;
      const setsOverride = Array.isArray(arg) ? arg : undefined;

      // Mode 1: use LAST workout's sets array directly (for Add Exercise)
      if (useLastWorkoutSets) {
        const sorted = [...(history.history || [])].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const lastWorkout = sorted[0];
        if (!lastWorkout || !lastWorkout.sets) return null;

        // Just map to PreviousSetData and return; don't touch state.
        return (lastWorkout.sets ?? []).map(s => mapHistorySetToPrevious(s));
      }

      // Mode 2: normal behavior – use override or current exercise's sets
      const baseExercise: MinimalExercise | undefined =
        setsOverride
          ? { id: exerciseId, sets: setsOverride }
          : exercises?.find(e => e.id === exerciseId);

      if (!baseExercise || !baseExercise.sets) {
        return null;
      }

      const prevForExercise = computePreviousForExercise(baseExercise, history);

      // Cache for this exercise id
      setPreviousMap(prev => ({
        ...prev,
        [exerciseId]: prevForExercise,
      }));

      return prevForExercise;
    },
    [exercises, loadExerciseHistory]
  );

  useEffect(() => {
    if (!exercises || exercises.length === 0) return;

    let cancelled = false;
    setLoading(true);

    async function loadAll() {
      const results: Record<string, (PreviousSetData | null)[]> = {};

      for (const ex of exercises ?? []) {
        if (!ex?.id || !ex.sets) continue;

        const data = await loadExerciseHistory(ex.id);
        if (!data) continue;

        results[ex.id] = computePreviousForExercise(ex, data);
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
  }, [depKey, loadExerciseHistory]);

  return {
    previousMap, // { [exerciseId]: PreviousSetData[] }
    loading,
    loadExercisePreviousSets,
  };
}
