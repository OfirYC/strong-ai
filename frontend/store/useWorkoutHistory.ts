// hooks/useWorkoutHistory.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../utils/api";

/**
 * Types should match your backend response models.
 * If you already have these in ../types, import them instead of redefining.
 */

export type WorkoutExerciseSummary = {
  exercise_id: string;
  name: string;
  exercise_kind: string;
  set_count: number;
  best_set_display: string;
  estimated_1rm?: number | null;
};

export type WorkoutSummary = {
  id: string;
  name?: string | null;
  started_at: string; // or Date if you parse
  ended_at?: string | null;
  duration_seconds: number;
  exercise_count: number;
  set_count: number;
  total_volume_kg: number;
  pr_count: number;
  exercises: WorkoutExerciseSummary[];
  template_id?: string | null;
};

export type ExerciseHistorySet = {
  reps: number;
  weight: number;
  duration?: number | null;
  distance?: number | null;
  set_type: string; // SetType if you have it
  rest_timer?: number | null;
};

export type ExerciseHistoryEntry = {
  workout_id: string;
  workout_name: string;
  date: string | null;
  sets: ExerciseHistorySet[];
};

export type WorkoutHistoryByExerciseResponse = {
  exercise_id: string;
  exercise_kind: string;
  window_days: number;
  workouts_scanned: number;
  history: ExerciseHistoryEntry[];
  max_weight: number | null;
  max_reps: number | null;
  best_e1rm: number | null;
};

/**
 * ---------- CACHES ----------
 * Keep them module-level so switching screens does not refetch.
 */
const historyListCache = new Map<string, WorkoutSummary[]>();
const historyByExerciseCache = new Map<string, WorkoutHistoryByExerciseResponse>();

/**
 * In-flight de-dupe (avoid multiple identical requests at once)
 */
const inflight = new Map<string, Promise<any>>();

function makeKey(parts: Array<string | number | undefined | null>) {
  return parts.map((p) => String(p ?? "")).join("|");
}

async function dedupedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fn()
    .then((res) => res)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}

/**
 * ---------- HOOK: /workouts/history ----------
 */
export function useWorkoutHistory(limit = 50) {
  const cacheKey = useMemo(() => makeKey(["workouts_history", limit]), [limit]);

  const [data, setData] = useState<WorkoutSummary[]>(
    () => historyListCache.get(cacheKey) ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !historyListCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  // prevent setState after unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchHistory = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = !!opts?.force;

      // Fast path: cached & not forced
      if (!force && historyListCache.has(cacheKey)) {
        const cached = historyListCache.get(cacheKey) ?? [];
        if (aliveRef.current) {
          setData(cached);
          setLoading(false);
          setError(null);
        }
        return cached;
      }

      if (aliveRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const key = makeKey(["fetch", cacheKey]);
        const res = await dedupedFetch(key, async () => {
          // Your api helper likely does api.get("/workouts/history", { params })
          const r = await api.get("/workouts/history", { params: { limit } });
          return r.data as WorkoutSummary[];
        });

        historyListCache.set(cacheKey, res);

        if (aliveRef.current) {
          setData(res);
          setLoading(false);
          setError(null);
        }
        return res;
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "Failed to load workout history";
        if (aliveRef.current) {
          setError(msg);
          setLoading(false);
        }
        return [];
      }
    },
    [cacheKey, limit]
  );

  // Load on mount / when params change
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const refresh = useCallback(() => fetchHistory({ force: true }), [fetchHistory]);

  return { data, loading, error, refresh };
}

/**
 * ---------- HOOK: /workouts/history/by-exercise ----------
 */
export function useWorkoutHistoryByExercise(args: {
  exerciseId?: string;
  daysBack?: number;
  limitWorkouts?: number;
}) {
  const exerciseId = args.exerciseId;
  const daysBack = args.daysBack ?? 120;
  const limitWorkouts = args.limitWorkouts ?? 60;

  const cacheKey = useMemo(
    () => makeKey(["workouts_history_by_exercise", exerciseId, daysBack, limitWorkouts]),
    [exerciseId, daysBack, limitWorkouts]
  );

  const [data, setData] = useState<WorkoutHistoryByExerciseResponse | null>(
    () => (exerciseId ? historyByExerciseCache.get(cacheKey) ?? null : null)
  );
  const [loading, setLoading] = useState<boolean>(() => {
    if (!exerciseId) return false;
    return !historyByExerciseCache.has(cacheKey);
  });
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchByExercise = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!exerciseId) {
        if (aliveRef.current) {
          setData(null);
          setLoading(false);
          setError(null);
        }
        return null;
      }

      const force = !!opts?.force;

      if (!force && historyByExerciseCache.has(cacheKey)) {
        const cached = historyByExerciseCache.get(cacheKey) ?? null;
        if (aliveRef.current) {
          setData(cached);
          setLoading(false);
          setError(null);
        }
        return cached;
      }

      if (aliveRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const key = makeKey(["fetch", cacheKey]);
        const res = await dedupedFetch(key, async () => {
          const r = await api.get("/workouts/history/by-exercise", {
            params: {
              exercise_id: exerciseId,
              days_back: daysBack,
              limit_workouts: limitWorkouts,
            },
          });
          return r.data as WorkoutHistoryByExerciseResponse;
        });

        historyByExerciseCache.set(cacheKey, res);

        if (aliveRef.current) {
          setData(res);
          setLoading(false);
          setError(null);
        }
        return res;
      } catch (e: any) {
        const msg =
          e?.response?.data?.detail || e?.message || "Failed to load exercise history";
        if (aliveRef.current) {
          setError(msg);
          setLoading(false);
        }
        return null;
      }
    },
    [exerciseId, daysBack, limitWorkouts, cacheKey]
  );

  useEffect(() => {
    fetchByExercise();
  }, [fetchByExercise]);

  const refresh = useCallback(() => fetchByExercise({ force: true }), [fetchByExercise]);

  return { data, loading, error, refresh };
}

/**
 * ---------- OPTIONAL: utilities ----------
 * If you ever want to hard-clear caches.
 */
export function clearWorkoutHistoryCaches() {
  historyListCache.clear();
  historyByExerciseCache.clear();
  inflight.clear();
}
