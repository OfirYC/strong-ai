// store/prsStore.ts
import { create } from "zustand";
import api from "../utils/api";
import type { PRRecord } from "../types";

type PRsStore = {
  byId: Record<string, PRRecord>;
  loading: boolean;

  refetchAll: () => Promise<void>;

  getAll: (opts?: {
    force?: boolean;
    minCount?: number;
  }) => Promise<Record<string, PRRecord>>;

  getByExerciseId: (
    exerciseId: string,
    opts?: { force?: boolean; minCount?: number }
  ) => Promise<PRRecord[]>;

  getByWorkoutId: (
    workoutId: string,
    opts?: { force?: boolean; minCount?: number }
  ) => Promise<PRRecord[]>;

  upsertMany: (prs: PRRecord[]) => void;
};

let inFlightAll: Promise<Record<string, PRRecord>> | null = null;
const inflightByExerciseId = new Map<string, Promise<PRRecord[]>>();

export const usePRsStoreInternal = create<PRsStore>((set, get) => ({
  byId: {},
  loading: false,

  refetchAll: async () => {
    set({ loading: true });
    try {
      const res = await api.get("/prs");
      const next: Record<string, PRRecord> = {};
      for (const pr of res.data as PRRecord[]) next[pr.id] = pr;
      set({ byId: next });
    } finally {
      set({ loading: false });
    }
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
        const res = await api.get("/prs");
        const next: Record<string, PRRecord> = {};
        for (const pr of res.data as PRRecord[]) next[pr.id] = pr;
        set({ byId: next });
        return next;
      } finally {
        set({ loading: false });
        inFlightAll = null;
      }
    })();

    return inFlightAll;
  },

  getByWorkoutId: async (workoutId, opts) => {
    const all = await get().getAll(opts);
    return Object.values(all).filter(pr => pr.workout_id === workoutId);
  },

  getByExerciseId: async (exerciseId, opts) => {
    const force = !!opts?.force;
    const minCount = opts?.minCount ?? 1;

    const cached = Object.values(get().byId).filter(
      pr => pr.exercise_id === exerciseId
    );

    if (!force && cached.length >= minCount) return cached;

    const existing = inflightByExerciseId.get(exerciseId);
    if (existing) return existing;

    const p = (async () => {
      try {
        set({ loading: true });
        const res = await api.get(`/prs?exercise_id=${exerciseId}`);
        const prs = res.data as PRRecord[];

        set(s => {
          const next = { ...s.byId };
          for (const pr of prs) next[pr.id] = pr;
          return { byId: next };
        });

        return prs;
      } finally {
        set({ loading: false });
        inflightByExerciseId.delete(exerciseId);
      }
    })();

    inflightByExerciseId.set(exerciseId, p);
    return p;
  },

  upsertMany: prs =>
    set(s => {
      const next = { ...s.byId };
      for (const pr of prs) next[pr.id] = pr;
      return { byId: next };
    }),
}));

// hook
export function usePRs() {
  const byId = usePRsStoreInternal(s => s.byId);
  const loading = usePRsStoreInternal(s => s.loading);

  const refetchAll = usePRsStoreInternal(s => s.refetchAll);
  const getAll = usePRsStoreInternal(s => s.getAll);
  const getByExerciseId = usePRsStoreInternal(s => s.getByExerciseId);
  const upsertMany = usePRsStoreInternal(s => s.upsertMany);
    const getByWorkoutId = usePRsStoreInternal(s => s.getByWorkoutId);
  return {
    byId,
    loading,
    refetchAll,
    getAll,
    getByExerciseId,
    getByWorkoutId,
    upsertMany,
  };
}

// optional direct store export
export const prsStore = usePRsStoreInternal;
