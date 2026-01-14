// store/workoutsStore.ts
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import type { WorkoutSession } from "../types";
import api from "../utils/api";

type WorkoutsStore = {
  byId: Record<string, WorkoutSession>;
  loading: boolean;

  refetchById: (id: string) => Promise<void>;

  getById: (id: string) => Promise<WorkoutSession | undefined>;
  getManyByIds: (
    ids: string[],
    opts?: { force?: boolean }
  ) => Promise<Record<string, WorkoutSession>>;

  upsert: (w: WorkoutSession) => void;
  upsertMany: (ws: WorkoutSession[]) => void;
  patch: (id: string, partial: Partial<WorkoutSession>) => void;
  remove: (id: string) => void;
};

const inFlightById = new Map<string, Promise<WorkoutSession | undefined>>();
const inFlightMany = new Map<string, Promise<Record<string, WorkoutSession>>>();

export const useWorkoutsStoreInternal = create<WorkoutsStore>((set, get) => ({
  byId: {},
  loading: false,

  refetchById: async id => {
    const res = await api.get(`/workouts/${id}`);
    const w = res.data as WorkoutSession;
    set(s => ({ byId: { ...s.byId, [id]: w } }));
  },

  getById: async id => {
    const cached = get().byId[id];
    if (cached) return cached;

    const existing = inFlightById.get(id);
    if (existing) return existing;

    const p = (async () => {
      set({ loading: true });
      try {
        const res = await api.get(`/workouts/${id}`);
        const w = res.data as WorkoutSession;
        set(s => ({ byId: { ...s.byId, [id]: w } }));
        return w;
      } finally {
        set({ loading: false });
        inFlightById.delete(id);
      }
    })();

    inFlightById.set(id, p);
    return p;
  },
  getManyByIds: async (ids: string[]) => {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return {};

    const cached = get().byId;
    const missing = unique.filter(id => !cached[id]);

    if (!missing.length) {
      const out: Record<string, WorkoutSession> = {};
      unique.forEach(id => cached[id] && (out[id] = cached[id]));
      return out;
    }

    const res = await api.get(`/workouts/batch/${missing.join(",")}`);
    const arr = res.data as WorkoutSession[];

    const map: Record<string, WorkoutSession> = {};
    arr.forEach(w => (map[w.id] = w));

    set(s => ({ byId: { ...s.byId, ...map } }));

    return { ...cached, ...map };
  },

  upsert: w =>
    set(s => ({
      byId: {
        ...s.byId,
        [w.id]: { ...(s.byId[w.id] ?? {}), ...w },
      },
    })),

  upsertMany: ws =>
    set(s => {
      if (!ws?.length) return s;
      const next = { ...s.byId };
      for (const w of ws) next[w.id] = { ...(next[w.id] ?? {}), ...w };
      return { byId: next };
    }),

  patch: (id, partial) =>
    set(s => {
      const prev = s.byId[id];
      if (!prev) return s;
      return { byId: { ...s.byId, [id]: { ...prev, ...partial } } };
    }),

  remove: id =>
    set(s => {
      const next = { ...s.byId };
      delete next[id];
      return { byId: next };
    }),
}));

type Options = {
  // Optional: list-level utilities for screens (similar spirit to templatesStore)
  search?: string;
  sort?: (a: WorkoutSession, b: WorkoutSession) => number;

  // Common filters
  hasEnded?: boolean; // true = completed (ended_at set), false = in-progress
  plannedWorkoutId?: string; // filter by planned_workout_id
  templateId?: string; // filter by template_id
};

export function useWorkouts(opts?: Options) {
  const byId = useWorkoutsStoreInternal(s => s.byId);
  const loading = useWorkoutsStoreInternal(s => s.loading);

  const refetchById = useWorkoutsStoreInternal(s => s.refetchById);
  const getById = useWorkoutsStoreInternal(s => s.getById);
  const getManyByIds = useWorkoutsStoreInternal(s => s.getManyByIds);

  const upsert = useWorkoutsStoreInternal(s => s.upsert);
  const upsertMany = useWorkoutsStoreInternal(s => s.upsertMany);
  const patch = useWorkoutsStoreInternal(s => s.patch);
  const remove = useWorkoutsStoreInternal(s => s.remove);

  const list = useMemo(() => {
    let arr = Object.values(byId);

    if (typeof opts?.hasEnded === "boolean") {
      arr = arr.filter(w => (opts.hasEnded ? !!w.ended_at : !w.ended_at));
    }

    if (opts?.plannedWorkoutId) {
      arr = arr.filter(w => w.planned_workout_id === opts.plannedWorkoutId);
    }

    if (opts?.templateId) {
      arr = arr.filter(w => w.template_id === opts.templateId);
    }

    const search = opts?.search?.trim();
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(w => {
        const name = (w.name ?? "").toLowerCase();
        const notes = (w.notes ?? "").toLowerCase();
        return name.includes(q) || notes.includes(q);
      });
    }

    if (opts?.sort) arr = [...arr].sort(opts.sort);

    return arr;
  }, [
    byId,
    opts?.hasEnded,
    opts?.plannedWorkoutId,
    opts?.templateId,
    opts?.search,
    opts?.sort,
  ]);

  return {
    byId,
    loading,
    refetchById,
    getById,
    getManyByIds,
    upsert,
    upsertMany,
    patch,
    remove,
    list,
  };
}

export function useWorkout(workoutId: string | null | undefined) {
  const byId = useWorkoutsStoreInternal(s => s.byId);
  const getById = useWorkoutsStoreInternal(s => s.getById);

  const [loading, setLoading] = useState(false);

  const workout = workoutId ? byId[workoutId] : undefined;

  useEffect(() => {
    if (!workoutId) return;
    if (byId[workoutId]) return;

    let cancelled = false;
    setLoading(true);

    getById(workoutId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workoutId, byId, getById]);

  return { workout: workout ?? null, loading };
}

// optional: export store for bootstrapping without subscribing
export const workoutsStore = useWorkoutsStoreInternal;
