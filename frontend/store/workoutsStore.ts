// store/workoutsStore.ts
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import type { WorkoutSession } from "../types";
import api from "../utils/api";

/**
 * Canonical cache: byId (WorkoutSession)
 * Paging cache (contiguous prefix only):
 *  - orderedIds[i] is the workout id at index i of the global sort (started_at desc, _id desc)
 *  - prefixCount means indices [0..prefixCount) are fully fetched + orderedIds filled
 *
 * Important rules:
 *  - Only /workouts?start&limit advances prefixCount/orderedIds.
 *  - /workouts/batch/{ids} hydrates byId only (does NOT grant prefix coverage).
 */

type WorkoutsStore = {
  byId: Record<string, WorkoutSession>;
  loading: boolean;

  // Query caches (do NOT affect orderedIds/prefixCount)
  byDateIds: Record<string, string[]>; // key -> workout ids
  byDateRangeIds: Record<string, string[]>; // key -> workout ids

  getByDate: (opts: {
    date: string; // YYYY-MM-DD
    tzOffsetMinutes?: number;
    includeIncomplete?: boolean;
    start?: number;
    limit?: number;
  }) => Promise<WorkoutSession[]>;

  getByDateRange: (opts: {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    tzOffsetMinutes?: number;
    includeIncomplete?: boolean;
    start?: number;
    limit?: number;
  }) => Promise<WorkoutSession[]>;

  // Paging state (offset-based)
  orderedIds: string[];
  prefixCount: number; // contiguous coverage from 0..prefixCount
  totalCount: number | null; // from /workouts/count
  exhausted: boolean; // true if prefixCount reached totalCount or server returned 0
  refetchById: (id: string) => Promise<void>;
  prependToPrefix: (session: WorkoutSession) => void;

  // Count
  ensureCount: (opts?: { force?: boolean }) => Promise<number>;

  // Paging / coverage
  ensurePrefix: (
    targetCount: number,
    opts?: { pageSize?: number }
  ) => Promise<void>;
  ensureNextPage: (opts?: { pageSize?: number }) => Promise<void>;

  // Fetch a slice by offset/limit (ensures prefix then returns)
  getPage: (opts: {
    start: number;
    limit: number;
    pageSize?: number;
  }) => Promise<WorkoutSession[]>;

  // Hydration
  getById: (id: string) => Promise<WorkoutSession | undefined>;
  getManyByIds: (ids: string[]) => Promise<Record<string, WorkoutSession>>;

  // Local mutations
  upsertMany: (sessions: WorkoutSession[]) => void;
  upsert: (session: WorkoutSession) => void;
  patch: (id: string, partial: Partial<WorkoutSession>) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const DEFAULT_PAGE_SIZE = 50;

let inflightCount: Promise<number> | null = null;
let inflightPrefix: Promise<void> | null = null;
const inflightById = new Map<string, Promise<WorkoutSession | undefined>>();
const inflightBatch = new Map<
  string,
  Promise<Record<string, WorkoutSession>>
>();
const inflightByDate = new Map<string, Promise<WorkoutSession[]>>();
const inflightByDateRange = new Map<string, Promise<WorkoutSession[]>>();

const keyByDate = (o: {
  date: string;
  tzOffsetMinutes: number;
  includeIncomplete: boolean;
  start: number;
  limit: number;
}) =>
  `d:${o.date}|tz:${o.tzOffsetMinutes}|inc:${o.includeIncomplete ? 1 : 0}|s:${
    o.start
  }|l:${o.limit}`;

const keyByRange = (o: {
  startDate: string;
  endDate: string;
  tzOffsetMinutes: number;
  includeIncomplete: boolean;
  start: number;
  limit: number;
}) =>
  `r:${o.startDate}->${o.endDate}|tz:${o.tzOffsetMinutes}|inc:${
    o.includeIncomplete ? 1 : 0
  }|s:${o.start}|l:${o.limit}`;

const stableKey = (ids: string[]) => Array.from(new Set(ids)).sort().join(",");

export const useWorkoutsStoreInternal = create<WorkoutsStore>((set, get) => ({
  byId: {},
  byDateIds: {},
  byDateRangeIds: {},

  loading: false,

  orderedIds: [],
  prefixCount: 0,
  totalCount: null,
  exhausted: false,

  ensureCount: async opts => {
    const force = !!opts?.force;

    const cached = get().totalCount;
    if (!force && typeof cached === "number") return cached;

    if (inflightCount) return inflightCount;

    inflightCount = (async () => {
      set({ loading: true });
      try {
        const res = await api.get("/workouts/count");
        const count = (res.data?.count ?? 0) as number;
        set({ totalCount: count });

        // If we already have prefixCount >= count, mark exhausted.
        const st = get();
        if (st.prefixCount >= count) set({ exhausted: true });

        return count;
      } finally {
        set({ loading: false });
        inflightCount = null;
      }
    })();

    return inflightCount;
  },

  ensurePrefix: async (targetCount, opts) => {
    const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;

    // Normalize
    targetCount = Math.max(0, Math.floor(targetCount));

    // Fast-path
    {
      const st = get();
      if (st.exhausted) return;
      if (st.prefixCount >= targetCount) return;
    }

    // Dedupe: only one prefix-expansion at a time (append-only)
    if (inflightPrefix) {
      await inflightPrefix;
      return;
    }

    inflightPrefix = (async () => {
      // Try to know totalCount early (optional, but helps stop conditions)
      try {
        await get().ensureCount();
      } catch {
        // ok if count fails; we'll still stop when server returns 0
      }

      while (true) {
        const st = get();

        if (st.exhausted) return;
        if (st.prefixCount >= targetCount) return;

        // Stop if totalCount known and already reached
        if (
          typeof st.totalCount === "number" &&
          st.prefixCount >= st.totalCount
        ) {
          set({ exhausted: true });
          return;
        }

        const remaining = targetCount - st.prefixCount;
        const fetchLimit = Math.max(1, Math.min(pageSize, remaining));

        set({ loading: true });
        try {
          const res = await api.get(
            `/workouts?start=${st.prefixCount}&limit=${fetchLimit}`
          );
          const sessions = (res.data ?? []) as WorkoutSession[];

          if (!sessions.length) {
            set({ exhausted: true });
            return;
          }

          set(s => {
            const nextById = { ...s.byId };
            const nextOrdered = s.orderedIds.slice();
            let nextPrefix = s.prefixCount;

            for (let i = 0; i < sessions.length; i++) {
              const w = sessions[i];
              nextById[w.id] = w;
              nextOrdered[nextPrefix + i] = w.id;
            }

            nextPrefix += sessions.length;

            const exhaustedNow =
              (typeof s.totalCount === "number" &&
                nextPrefix >= s.totalCount) ||
              false;

            return {
              byId: nextById,
              orderedIds: nextOrdered,
              prefixCount: nextPrefix,
              exhausted: exhaustedNow,
            };
          });

          // If server returned fewer than requested, assume exhausted
          if (sessions.length < fetchLimit) {
            set({ exhausted: true });
            return;
          }
        } finally {
          set({ loading: false });
        }
      }
    })();

    try {
      await inflightPrefix;
    } finally {
      inflightPrefix = null;
    }
  },

  ensureNextPage: async opts => {
    const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
    const st = get();
    if (st.exhausted) return;
    await get().ensurePrefix(st.prefixCount + pageSize, { pageSize });
  },

  prependToPrefix: session =>
    set(s => {
      const nextById = { ...s.byId, [session.id]: session };

      // If we haven't loaded any prefix yet, just seed it.
      if (s.prefixCount === 0) {
        return {
          byId: nextById,
          orderedIds: [session.id],
          prefixCount: 1,
        };
      }

      // If it's already in the prefix, keep ordering stable (optional: move to front).
      const existingIdx = s.orderedIds
        .slice(0, s.prefixCount)
        .indexOf(session.id);
      if (existingIdx !== -1) {
        // move-to-front behavior
        const prefix = s.orderedIds.slice(0, s.prefixCount);
        prefix.splice(existingIdx, 1);
        prefix.unshift(session.id);

        return {
          byId: nextById,
          orderedIds: [...prefix, ...s.orderedIds.slice(s.prefixCount)],
        };
      }

      // Insert at the front of the prefix
      const prefix = s.orderedIds.slice(0, s.prefixCount);
      prefix.unshift(session.id);

      // Keep prefixCount consistent: we added one known item to the prefix.
      // NOTE: this assumes your list endpoint sorts newest-first, which it does.
      return {
        byId: nextById,
        orderedIds: [...prefix, ...s.orderedIds.slice(s.prefixCount)],
        prefixCount: s.prefixCount + 1,
        // totalCount should also increase if you're using count-all
        totalCount:
          typeof s.totalCount === "number" ? s.totalCount + 1 : s.totalCount,
      };
    }),

  getPage: async ({ start, limit, pageSize }) => {
    start = Math.max(0, Math.floor(start));
    limit = Math.max(1, Math.floor(limit));
    const ps = pageSize ?? DEFAULT_PAGE_SIZE;

    // Ensure prefix through endIndex
    const end = start + limit;
    await get().ensurePrefix(end, { pageSize: ps });

    const st = get();

    const ids = st.orderedIds.slice(start, Math.min(end, st.prefixCount));
    return ids.map(id => st.byId[id]).filter(Boolean);
  },

  getById: async id => {
    const cached = get().byId[id];
    if (cached) return cached;

    const existing = inflightById.get(id);
    if (existing) return existing;

    const p = (async () => {
      try {
        const res = await api.get(`/workouts/${id}`);
        const w = res.data as WorkoutSession;
        set(s => ({ byId: { ...s.byId, [id]: w } }));
        return w;
      } finally {
        inflightById.delete(id);
      }
    })();

    inflightById.set(id, p);
    return p;
  },
  refetchById: async id => {
    try {
      const res = await api.get(`/workouts/${id}`);
      const w = res.data as WorkoutSession;
      set(s => ({ byId: { ...s.byId, [id]: w } }));
    } catch {
      // ignore
    }
  },

  getManyByIds: async ids => {
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (!unique.length) return {};

    const cached = get().byId;
    const missing = unique.filter(id => !cached[id]);

    // if all cached, return subset
    if (!missing.length) {
      const out: Record<string, WorkoutSession> = {};
      for (const id of unique) if (cached[id]) out[id] = cached[id];
      return out;
    }

    const key = stableKey(missing);
    const existing = inflightBatch.get(key);
    if (existing) return existing;

    const p = (async () => {
      set({ loading: true });
      try {
        const res = await api.get(`/workouts/batch/${missing.join(",")}`);
        const arr = (res.data ?? []) as WorkoutSession[];
        console.log("Fetched batch workouts:", arr.length);
        if (arr.length) {
          const map: Record<string, WorkoutSession> = {};
          for (const w of arr) map[w.id] = w;
          set(s => ({ byId: { ...s.byId, ...map } }));

          const merged = { ...get().byId, ...map };
          const out: Record<string, WorkoutSession> = {};
          for (const id of unique) if (merged[id]) out[id] = merged[id];
          return out;
        } else {
          return get().byId;
        }
      } finally {
        set({ loading: false });
        inflightBatch.delete(key);
      }
    })();

    inflightBatch.set(key, p);
    return p;
  },

  // Date
  getByDate: async opts => {
    const date = opts.date;
    if (!date) throw new Error("date is required (YYYY-MM-DD)");

    const tzOffsetMinutes = Number.isFinite(opts.tzOffsetMinutes as number)
      ? (opts.tzOffsetMinutes as number)
      : 0;

    const includeIncomplete = opts.includeIncomplete ?? true;
    const start = Math.max(0, Math.floor(opts.start ?? 0));
    const limit = Math.max(
      1,
      Math.min(Math.floor(opts.limit ?? DEFAULT_PAGE_SIZE), 200)
    );

    const k = keyByDate({
      date,
      tzOffsetMinutes,
      includeIncomplete,
      start,
      limit,
    });

    // If we already have ids cached for this exact request, serve from byId
    const cachedIds = get().byDateIds[k];
    if (cachedIds?.length) {
      const st = get();
      return cachedIds.map(id => st.byId[id]).filter(Boolean);
    }

    const existing = inflightByDate.get(k);

    if (existing) return existing;

    const p = (async () => {
      set({ loading: true });
      try {
        const qs = new URLSearchParams();
        qs.set("date", date);
        qs.set("tz_offset_minutes", String(tzOffsetMinutes));
        qs.set("include_incomplete", includeIncomplete ? "true" : "false");
        qs.set("start", String(start));
        qs.set("limit", String(limit));

        const res = await api.get(`/workouts/by-date?${qs.toString()}`);
        const arr = (res.data ?? []) as WorkoutSession[];
        if (arr.length) {
          // hydrate byId
          const map: Record<string, WorkoutSession> = {};
          const ids: string[] = [];
          for (const w of arr) {
            map[w.id] = w;
            ids.push(w.id);
          }

          set(s => ({
            byId: { ...s.byId, ...map },
            byDateIds: { ...s.byDateIds, [k]: ids },
          }));
        } else {
          // cache empty too (prevents refetch storms)
          set(s => ({
            byDateIds: { ...s.byDateIds, [k]: [] },
          }));
        }

        return arr;
      } finally {
        set({ loading: false });
        inflightByDate.delete(k);
      }
    })();

    inflightByDate.set(k, p);
    return p;
  },

  getByDateRange: async opts => {
    const startDate = opts.startDate;
    const endDate = opts.endDate;
    if (!startDate) throw new Error("startDate is required (YYYY-MM-DD)");
    if (!endDate) throw new Error("endDate is required (YYYY-MM-DD)");

    const tzOffsetMinutes = Number.isFinite(opts.tzOffsetMinutes as number)
      ? (opts.tzOffsetMinutes as number)
      : 0;

    const includeIncomplete = opts.includeIncomplete ?? true;
    const start = Math.max(0, Math.floor(opts.start ?? 0));
    const limit = Math.max(
      1,
      Math.min(Math.floor(opts.limit ?? DEFAULT_PAGE_SIZE), 200)
    );

    const k = keyByRange({
      startDate,
      endDate,
      tzOffsetMinutes,
      includeIncomplete,
      start,
      limit,
    });

    const cachedIds = get().byDateRangeIds[k];
    if (cachedIds?.length) {
      const st = get();
      return cachedIds.map(id => st.byId[id]).filter(Boolean);
    }

    const existing = inflightByDateRange.get(k);
    if (existing) return existing;

    const p = (async () => {
      set({ loading: true });
      try {
        const qs = new URLSearchParams();
        qs.set("start_date", startDate);
        qs.set("end_date", endDate);
        qs.set("tz_offset_minutes", String(tzOffsetMinutes));
        qs.set("include_incomplete", includeIncomplete ? "true" : "false");
        qs.set("start", String(start));
        qs.set("limit", String(limit));

        const res = await api.get(`/workouts/by-date-range?${qs.toString()}`);
        const arr = (res.data ?? []) as WorkoutSession[];

        if (arr.length) {
          const map: Record<string, WorkoutSession> = {};
          const ids: string[] = [];
          for (const w of arr) {
            map[w.id] = w;
            ids.push(w.id);
          }

          set(s => ({
            byId: { ...s.byId, ...map },
            byDateRangeIds: { ...s.byDateRangeIds, [k]: ids },
          }));
        } else {
          set(s => ({
            byDateRangeIds: { ...s.byDateRangeIds, [k]: [] },
          }));
        }

        return arr;
      } finally {
        set({ loading: false });
        inflightByDateRange.delete(k);
      }
    })();

    inflightByDateRange.set(k, p);
    return p;
  },

  upsertMany: sessions => {
    set(s => {
      const next = { ...s.byId };
      for (const w of sessions) next[w.id] = w;
      return { byId: next };
    });
  },

  // upsert into byId, and modify orderedIds for history
  // inside create<WorkoutsStore>((set, get) => ({ ... }))

  upsert: session =>
    set(s => {
      const nextById = { ...s.byId, [session.id]: session };

      // Dedup ids (ensure session.id is included exactly once)
      const seen = new Set<string>();
      const ids = [session.id, ...s.orderedIds].filter(id => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // Robust date compare (do NOT rely on string ordering)
      const toMs = (iso?: string) => {
        if (!iso) return 0;
        const t = new Date(iso).getTime();
        return Number.isNaN(t) ? 0 : t;
      };

      // Sort by started_at DESC, then id DESC (ObjectId lexicographic works)
      ids.sort((aId, bId) => {
        const a = nextById[aId];
        const b = nextById[bId];

        const aMs = toMs(a?.started_at);
        const bMs = toMs(b?.started_at);

        if (aMs !== bMs) return bMs - aMs;

        // tie-breaker: _id desc (ObjectId string compare is fine)
        if (aId === bId) return 0;
        return aId > bId ? -1 : 1;
      });

      // IMPORTANT:
      // - We do NOT touch prefixCount here.
      //   prefixCount should only represent "server pages fetched".
      //   This makes upsert safe from breaking pagination.
      return {
        byId: nextById,
        orderedIds: ids,
      };
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

      // If it was in the ordered prefix, we keep orderedIds as-is (holes are ok),
      // because prefix coverage represents “requested indices fetched” not “still exists”.
      // If you want to compact after deletions, do it explicitly in one place.
      return { byId: next };
    }),

  clear: () =>
    set({
      byId: {},
      orderedIds: [],
      prefixCount: 0,
      totalCount: null,
      exhausted: false,
    }),
}));

// Hook
export function useWorkouts() {
  const byId = useWorkoutsStoreInternal(s => s.byId);
  const loading = useWorkoutsStoreInternal(s => s.loading);

  const orderedIds = useWorkoutsStoreInternal(s => s.orderedIds);
  const prefixCount = useWorkoutsStoreInternal(s => s.prefixCount);
  const totalCount = useWorkoutsStoreInternal(s => s.totalCount);
  const exhausted = useWorkoutsStoreInternal(s => s.exhausted);

  const ensureCount = useWorkoutsStoreInternal(s => s.ensureCount);
  const ensurePrefix = useWorkoutsStoreInternal(s => s.ensurePrefix);

  const getPage = useWorkoutsStoreInternal(s => s.getPage);

  const getById = useWorkoutsStoreInternal(s => s.getById);
  const getManyByIds = useWorkoutsStoreInternal(s => s.getManyByIds);

  const getByDate = useWorkoutsStoreInternal(s => s.getByDate);
  const getByDateRange = useWorkoutsStoreInternal(s => s.getByDateRange);
  const upsertMany = useWorkoutsStoreInternal(s => s.upsertMany);
  const upsert = useWorkoutsStoreInternal(s => s.upsert);
  const patch = useWorkoutsStoreInternal(s => s.patch);
  const remove = useWorkoutsStoreInternal(s => s.remove);
  const clear = useWorkoutsStoreInternal(s => s.clear);
  const ensureNextPage = useWorkoutsStoreInternal(s => s.ensureNextPage);
  const prependToPrefix = useWorkoutsStoreInternal(s => s.prependToPrefix);

  const hasMore = useMemo(() => {
    if (exhausted) return false;
    if (typeof totalCount === "number") return prefixCount < totalCount;
    return true;
  }, [exhausted, prefixCount, totalCount]);

  const sessionsPrefix = useMemo(() => {
    const ids = orderedIds.slice(0, prefixCount);
    return ids.map(id => byId[id]).filter(Boolean);
  }, [orderedIds, prefixCount, byId]);

  const historySessions = useMemo(() => {
    return sessionsPrefix.filter(w => !!w.ended_at);
  }, [sessionsPrefix]);

  // Effects
  useEffect(() => {
    // On mount, ensure we know totalCount
    ensureCount().catch(() => {});
  }, [ensureCount]);

  return {
    byId,
    loading,
    prependToPrefix,
    // paging state
    orderedIds,
    prefixCount,
    totalCount,
    exhausted,

    // derived lists
    sessionsPrefix,
    historySessions,

    // methods
    ensureCount,
    ensurePrefix,
    ensureNextPage,
    hasMore,
    getPage,

    getByDate,
    getByDateRange,

    getById,
    getManyByIds,

    upsertMany,
    upsert,
    patch,
    remove,
    clear,
  };
}

/**
 * Convenience hook: stateful single-workout fetch pattern.
 */
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
