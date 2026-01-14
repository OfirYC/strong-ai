// store/templatesStore.ts
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import type { WorkoutTemplate } from "../types";
import api from "../utils/api";

type TemplatesStore = {
  byId: Record<string, WorkoutTemplate>;
  loading: boolean;

  refetchAll: () => Promise<void>;
  refetchById: (id: string) => Promise<void>;

  getAll: (opts?: { force?: boolean; minCount?: number }) => Promise<
    Record<string, WorkoutTemplate>
  >;
  getById: (id: string) => Promise<WorkoutTemplate | undefined>;

  upsert: (tpl: WorkoutTemplate) => void;
  patch: (id: string, partial: Partial<WorkoutTemplate>) => void;
  remove: (id: string) => void;
};

let inFlightAll: Promise<Record<string, WorkoutTemplate>> | null = null;
const inflightById = new Map<string, Promise<WorkoutTemplate | undefined>>();

export const useTemplatesStoreInternal = create<TemplatesStore>((set, get) => ({
  byId: {},
  loading: false,

  refetchAll: async () => {
    set({ loading: true });
    try {
      const res = await api.get("/templates");
      const next: Record<string, WorkoutTemplate> = {};
      for (const tpl of res.data as WorkoutTemplate[]) next[tpl.id] = tpl;
      set({ byId: next });
    } finally {
      set({ loading: false });
    }
  },

  refetchById: async id => {
    const res = await api.get(`/templates/${id}`);
    set(s => ({ byId: { ...s.byId, [id]: res.data as WorkoutTemplate } }));
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
        const res = await api.get("/templates");
        const next: Record<string, WorkoutTemplate> = {};
        for (const tpl of res.data as WorkoutTemplate[]) next[tpl.id] = tpl;
        set({ byId: next });
        return next;
      } finally {
        set({ loading: false });
        inFlightAll = null;
      }
    })();

    return inFlightAll;
  },

  getById: async (id: string) => {
    const cached = get().byId[id];
    if (cached) return cached;

    const existing = inflightById.get(id);
    if (existing) return existing;

    const p = (async () => {
      try {
        const res = await api.get(`/templates/${id}`);
        const tpl = res.data as WorkoutTemplate;
        set(s => ({ byId: { ...s.byId, [id]: tpl } }));
        return tpl;
      } finally {
        inflightById.delete(id);
      }
    })();

    inflightById.set(id, p);
    return p;
  },

  upsert: tpl => set(s => ({ byId: { ...s.byId, [tpl.id]: tpl } })),

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
  search?: string;
  sort?: (a: WorkoutTemplate, b: WorkoutTemplate) => number;
};

export function useTemplates(opts?: Options) {
  const byId = useTemplatesStoreInternal(s => s.byId);
  const loading = useTemplatesStoreInternal(s => s.loading);

  const refetchAll = useTemplatesStoreInternal(s => s.refetchAll);
  const refetchById = useTemplatesStoreInternal(s => s.refetchById);
  const getAll = useTemplatesStoreInternal(s => s.getAll);
  const getById = useTemplatesStoreInternal(s => s.getById);

  const upsert = useTemplatesStoreInternal(s => s.upsert);
  const patch = useTemplatesStoreInternal(s => s.patch);
  const remove = useTemplatesStoreInternal(s => s.remove);

  useEffect(() => {
    getAll(); // initial load if not cached already
  }, []);

  const list = useMemo(() => {
    let arr = Object.values(byId);

    const search = opts?.search?.trim();
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(tpl => (tpl.name ?? "").toLowerCase().includes(q));
    }

    if (opts?.sort) arr = [...arr].sort(opts.sort);

    return arr;
  }, [byId, opts?.search, opts?.sort]);

  return {
    byId,
    loading,
    refetchAll,
    refetchById,
    getAll,
    getById,
    upsert,
    patch,
    remove,
    list,
  };
}

export function useTemplate(templateId: string | null | undefined) {
  const byId = useTemplatesStoreInternal(s => s.byId);
  const getById = useTemplatesStoreInternal(s => s.getById);

  const [loading, setLoading] = useState(false);

  const template = templateId ? byId[templateId] : undefined;

  useEffect(() => {
    if (!templateId) return;
    if (byId[templateId]) return;

    let cancelled = false;
    setLoading(true);

    getById(templateId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [templateId, byId, getById]);

  return { template: template ?? null, loading };
}

// optional: export store for bootstrapping without subscribing
export const templatesStore = useTemplatesStoreInternal;
