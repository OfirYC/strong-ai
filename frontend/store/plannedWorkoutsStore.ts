// store/plannedWorkoutsStore.ts
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import api from "../utils/api";

// Keep this aligned with your backend + components (CalendarModal + RoutinesScreen)
export type PlannedWorkoutStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "skipped";

export interface PlannedWorkout {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  name: string;
  template_id?: string;
  type?: string;
  notes?: string;
  status: PlannedWorkoutStatus;
  workout_session_id?: string;
  order: number;
  is_recurring: boolean;
  recurrence_type?: string;
  recurrence_days?: number[];
  recurrence_end_date?: string;
  recurrence_parent_id?: string;

  // Used by CalendarModal for inline planned workouts
  inline_exercises?: any[];
}

type PlannedWorkoutsStore = {
  byId: Record<string, PlannedWorkout>;
  loading: boolean;

  // date & range caches (so we can skip refetch)
  loadedDates: Record<string, true>; // YYYY-MM-DD
  loadedRanges: Record<string, true>; // "YYYY-MM-DD..YYYY-MM-DD" (inclusive)

  // Imperative refetch (always hits network)
  refetchByDate: (date: string) => Promise<void>;
  refetchRange: (startDate: string, endDate: string) => Promise<void>;
  refetchById: (id: string) => Promise<void>;

  // Cache-aware getters (like templatesStore)
  getByDate: (
    date: string,
    opts?: { force?: boolean }
  ) => Promise<PlannedWorkout[]>;
  getRange: (
    startDate: string,
    endDate: string,
    opts?: { force?: boolean }
  ) => Promise<Record<string, PlannedWorkout[]>>;

  getById: (id: string) => Promise<PlannedWorkout | undefined>;

  // Mutations
  upsert: (pw: PlannedWorkout) => void;
  upsertMany: (pws: PlannedWorkout[]) => void;
  patch: (id: string, partial: Partial<PlannedWorkout>) => void;
  remove: (id: string) => void;

  // Selectors
  selectByDate: (date: string) => PlannedWorkout[];
  selectGroupedByDateInRange: (
    startDate: string,
    endDate: string
  ) => Record<string, PlannedWorkout[]>;
};

const rangeKey = (start: string, end: string) => `${start}..${end}`;

// Similar to templatesStore: gate concurrent calls
let inFlightDate = new Map<string, Promise<PlannedWorkout[]>>();
let inFlightRange = new Map<
  string,
  Promise<Record<string, PlannedWorkout[]>>
>();
const inFlightById = new Map<string, Promise<PlannedWorkout | undefined>>();

function groupByDate(items: PlannedWorkout[]) {
  const grouped: Record<string, PlannedWorkout[]> = {};
  for (const pw of items) {
    if (!grouped[pw.date]) grouped[pw.date] = [];
    grouped[pw.date].push(pw);
  }
  return grouped;
}

function sortForDate(items: PlannedWorkout[]) {
  // stable: order asc, then id
  return [...items].sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

export const usePlannedWorkoutsStoreInternal = create<PlannedWorkoutsStore>(
  (set, get) => ({
    byId: {},
    loading: false,
    loadedDates: {},
    loadedRanges: {},

    refetchByDate: async date => {
      set({ loading: true });
      try {
        const res = await api.get(`/planned-workouts?date=${date}`);
        const items = (res.data ?? []) as PlannedWorkout[];

        // Upsert + mark loaded
        get().upsertMany(items);
        set(s => ({
          loadedDates: { ...s.loadedDates, [date]: true },
        }));
      } finally {
        set({ loading: false });
      }
    },

    refetchRange: async (startDate, endDate) => {
      set({ loading: true });
      try {
        const res = await api.get(
          `/planned-workouts?start_date=${startDate}&end_date=${endDate}`
        );
        const items = (res.data ?? []) as PlannedWorkout[];

        get().upsertMany(items);
        set(s => ({
          loadedRanges: {
            ...s.loadedRanges,
            [rangeKey(startDate, endDate)]: true,
          },
        }));
      } finally {
        set({ loading: false });
      }
    },

    refetchById: async id => {
      const res = await api.get(`/planned-workouts/${id}`);
      get().upsert(res.data as PlannedWorkout);
    },

    getByDate: async (date, opts) => {
      const force = !!opts?.force;

      const state = get();
      if (!force && state.loadedDates[date]) {
        return state.selectByDate(date);
      }

      const existing = inFlightDate.get(date);
      if (existing) return existing;

      const p = (async () => {
        set({ loading: true });
        try {
          const res = await api.get(`/planned-workouts?date=${date}`);
          const items = (res.data ?? []) as PlannedWorkout[];
          get().upsertMany(items);
          set(s => ({ loadedDates: { ...s.loadedDates, [date]: true } }));
          return get().selectByDate(date);
        } finally {
          set({ loading: false });
          inFlightDate.delete(date);
        }
      })();

      inFlightDate.set(date, p);
      return p;
    },

    getRange: async (startDate, endDate, opts) => {
      const force = !!opts?.force;
      const key = rangeKey(startDate, endDate);

      const state = get();
      if (!force && state.loadedRanges[key]) {
        return state.selectGroupedByDateInRange(startDate, endDate);
      }

      const existing = inFlightRange.get(key);
      if (existing) return existing;

      const p = (async () => {
        set({ loading: true });
        try {
          const res = await api.get(
            `/planned-workouts?start_date=${startDate}&end_date=${endDate}`
          );
          const items = (res.data ?? []) as PlannedWorkout[];
          get().upsertMany(items);
          set(s => ({ loadedRanges: { ...s.loadedRanges, [key]: true } }));
          return get().selectGroupedByDateInRange(startDate, endDate);
        } finally {
          set({ loading: false });
          inFlightRange.delete(key);
        }
      })();

      inFlightRange.set(key, p);
      return p;
    },

    getById: async (id: string) => {
      const cached = get().byId[id];
      if (cached) return cached;

      const existing = inFlightById.get(id);
      if (existing) return existing;

      const p = (async () => {
        try {
          const res = await api.get(`/planned-workouts/${id}`);
          const pw = res.data as PlannedWorkout;
          get().upsert(pw);
          return pw;
        } finally {
          inFlightById.delete(id);
        }
      })();

      inFlightById.set(id, p);
      return p;
    },

    upsert: pw =>
      set(s => ({
        byId: { ...s.byId, [pw.id]: pw },
      })),

    upsertMany: pws =>
      set(s => {
        if (!pws?.length) return s;

        // Merge byId
        const nextById = { ...s.byId };
        for (const pw of pws) nextById[pw.id] = pw;

        return { ...s, byId: nextById };
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

    selectByDate: date => {
      const byId = get().byId;
      const items = Object.values(byId).filter(pw => pw.date === date);
      return sortForDate(items);
    },

    selectGroupedByDateInRange: (startDate, endDate) => {
      const byId = get().byId;
      const items = Object.values(byId).filter(pw => {
        // YYYY-MM-DD lexical comparison works
        return pw.date >= startDate && pw.date <= endDate;
      });

      const grouped = groupByDate(items);
      for (const d of Object.keys(grouped))
        grouped[d] = sortForDate(grouped[d]);
      return grouped;
    },
  })
);

type Options = {
  // Works like templatesStore "list", but for a specific day
  date?: string; // YYYY-MM-DD

  // Or for a range (Calendar)
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD

  // Optional filters
  status?: PlannedWorkoutStatus | PlannedWorkoutStatus[];
  search?: string;
  sort?: (a: PlannedWorkout, b: PlannedWorkout) => number;
};

export function usePlannedWorkouts(opts?: Options) {
  const byId = usePlannedWorkoutsStoreInternal(s => s.byId);
  const loading = usePlannedWorkoutsStoreInternal(s => s.loading);

  const refetchByDate = usePlannedWorkoutsStoreInternal(s => s.refetchByDate);
  const refetchRange = usePlannedWorkoutsStoreInternal(s => s.refetchRange);
  const refetchById = usePlannedWorkoutsStoreInternal(s => s.refetchById);

  const getByDate = usePlannedWorkoutsStoreInternal(s => s.getByDate);
  const getRange = usePlannedWorkoutsStoreInternal(s => s.getRange);
  const getById = usePlannedWorkoutsStoreInternal(s => s.getById);

  const upsert = usePlannedWorkoutsStoreInternal(s => s.upsert);
  const upsertMany = usePlannedWorkoutsStoreInternal(s => s.upsertMany);
  const patch = usePlannedWorkoutsStoreInternal(s => s.patch);
  const remove = usePlannedWorkoutsStoreInternal(s => s.remove);

  useEffect(() => {
    // Mirrors templatesStore: do an initial load if caller provided date/range.
    if (opts?.date) {
      getByDate(opts.date).catch(() => {});
      return;
    }
    if (opts?.startDate && opts?.endDate) {
      getRange(opts.startDate, opts.endDate).catch(() => {});
      return;
    }
  }, [opts?.date, opts?.startDate, opts?.endDate]);

  const list = useMemo(() => {
    let arr = Object.values(byId) as PlannedWorkout[];

    // constrain to date or range if provided
    if (opts?.date) {
      arr = arr.filter(pw => pw.date === opts.date);
    } else if (opts?.startDate && opts?.endDate) {
      arr = arr.filter(
        pw => pw.date >= opts.startDate! && pw.date <= opts.endDate!
      );
    }

    // status filter
    const status = opts?.status;
    if (status) {
      const allowed = Array.isArray(status) ? status : [status];
      arr = arr.filter(pw => allowed.includes(pw.status));
    }

    // search filter (name + notes)
    const search = opts?.search?.trim();
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(pw => {
        const name = (pw.name ?? "").toLowerCase();
        const notes = (pw.notes ?? "").toLowerCase();
        return name.includes(q) || notes.includes(q);
      });
    }

    // sort
    if (opts?.sort) {
      arr = [...arr].sort(opts.sort);
    } else {
      // sensible default: date asc, order asc, id
      arr = [...arr].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const ao =
          typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
        const bo =
          typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
    }

    return arr;
  }, [
    byId,
    opts?.date,
    opts?.startDate,
    opts?.endDate,
    opts?.status,
    opts?.search,
    opts?.sort,
  ]);

  return {
    byId,
    loading,

    refetchByDate,
    refetchRange,
    refetchById,

    getByDate,
    getRange,
    getById,

    upsert,
    upsertMany,
    patch,
    remove,

    list,
  };
}

export function usePlannedWorkout(plannedWorkoutId: string | null | undefined) {
  const byId = usePlannedWorkoutsStoreInternal(s => s.byId);
  const getById = usePlannedWorkoutsStoreInternal(s => s.getById);

  const [loading, setLoading] = useState(false);

  const plannedWorkout = plannedWorkoutId ? byId[plannedWorkoutId] : undefined;

  useEffect(() => {
    if (!plannedWorkoutId) return;
    if (byId[plannedWorkoutId]) return;

    let cancelled = false;
    setLoading(true);

    getById(plannedWorkoutId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [plannedWorkoutId, byId, getById]);

  return { plannedWorkout: plannedWorkout ?? null, loading };
}

// optional: export store for bootstrapping without subscribing
export const plannedWorkoutsStore = usePlannedWorkoutsStoreInternal;
