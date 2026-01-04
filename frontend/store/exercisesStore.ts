// store/exercisesStore.ts
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { Exercise } from "../types";
import api from "../utils/api";

type ExercisesStore = {
  byId: Record<string, Exercise>;
  loading: boolean;

  refetchAll: () => Promise<void>;
  refetchById: (id: string) => Promise<void>;

  getAll: (opts?: {
    force?: boolean;
    minCount?: number;
  }) => Promise<Record<string, Exercise>>;

  upsert: (exercise: Exercise) => void;
  patch: (id: string, partial: Partial<Exercise>) => void;
};

let inFlightAll: Promise<Record<string, Exercise>> | null = null;

const useExercisesStoreInternal = create<ExercisesStore>((set, get) => ({
  byId: {},
  loading: false,

  refetchAll: async () => {
    set({ loading: true });
    try {
      const res = await api.get("/exercises");
      const next: Record<string, Exercise> = {};
      for (const ex of res.data) next[ex.id] = ex;
      set({ byId: next });
    } finally {
      set({ loading: false });
    }
  },

  refetchById: async id => {
    const res = await api.get(`/exercises/${id}`);
    set(s => ({ byId: { ...s.byId, [id]: res.data } }));
  },

  getAll: async opts => {
    const force = !!opts?.force;
    const minCount = opts?.minCount ?? 1;

    const cached = get().byId;
    if (!force && Object.keys(cached).length >= minCount) return cached;

    if (inFlightAll) return inFlightAll;

    inFlightAll = (async () => {
      set({ loading: true });
      try {
        const res = await api.get("/exercises");
        const next: Record<string, Exercise> = {};
        for (const ex of res.data) next[ex.id] = ex;
        set({ byId: next });
        return next;
      } finally {
        set({ loading: false });
        inFlightAll = null;
      }
    })();

    return inFlightAll;
  },

  upsert: exercise =>
    set(s => ({ byId: { ...s.byId, [exercise.id]: exercise } })),

  patch: (id, partial) =>
    set(s => {
      const prev = s.byId[id];
      if (!prev) return s;
      return { byId: { ...s.byId, [id]: { ...prev, ...partial } } };
    }),
}));

type Options = {
  search?: string;
  muscleGroup?: string;
  sort?: (a: Exercise, b: Exercise) => number;
};

export function useExercises(opts?: Options) {
  const byId = useExercisesStoreInternal(s => s.byId);
  const loading = useExercisesStoreInternal(s => s.loading);

  const refetchAll = useExercisesStoreInternal(s => s.refetchAll);
  const refetchById = useExercisesStoreInternal(s => s.refetchById);
  const getAll = useExercisesStoreInternal(s => s.getAll);
  const upsert = useExercisesStoreInternal(s => s.upsert);
  const patch = useExercisesStoreInternal(s => s.patch);

  useEffect(() => {
    getAll(); // initial load if not cached already
  }, []);

  const list = useMemo(() => {
    let arr = Object.values(byId);

    const mg = opts?.muscleGroup;
    if (mg && mg !== "All") {
      arr = arr.filter(ex => ex.primary_body_parts?.includes(mg));
    }

    const search = opts?.search?.trim();
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(ex => ex.name.toLowerCase().includes(q));
    }

    if (opts?.sort) arr = [...arr].sort(opts.sort);

    return arr;
  }, [byId, opts?.search, opts?.muscleGroup, opts?.sort]);

  return {
    byId,
    loading,
    refetchAll,
    refetchById,
    getAll,
    upsert,
    patch,
    list,
  };
}

// optional: export store for bootstrapping without subscribing
export const exercisesStore = useExercisesStoreInternal;
