import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60_000,
});

/* =========================================
   Latency / Call Inspector
   ========================================= */

type RecentEvent =
  | {
      t: string;
      key: string;
      status: number;
      total_ms: number | null;
      server_ms: number | null;
      bytes: number | null;
    }
  | {
      t: string;
      key: string;
      status: number | null;
      total_ms: number | null;
      error: string;
    };

const Metrics = (() => {
  const counts = new Map<string, number>();
  const inflightById = new Map<string, { start: number; key: string }>();
  const inflightByKey = new Map<string, number>();
  const recent: RecentEvent[] = [];

  const MAX_RECENT = 200;

  const method = (cfg: AxiosRequestConfig) =>
    (cfg.method || "get").toUpperCase();

  const url = (cfg: AxiosRequestConfig) => cfg.url || "";

  const key = (cfg: AxiosRequestConfig) => `${method(cfg)} ${url(cfg)}`;

  const now = () => Date.now();

  function incCount(k: string) {
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  function markInflight(k: string, id: string, start: number) {
    inflightById.set(id, { start, key: k });
    inflightByKey.set(k, (inflightByKey.get(k) || 0) + 1);
  }

  function clearInflight(k: string, id: string) {
    inflightById.delete(id);
    const next = (inflightByKey.get(k) || 1) - 1;
    if (next <= 0) inflightByKey.delete(k);
    else inflightByKey.set(k, next);
  }

  function inflightForKey(k: string) {
    return inflightByKey.get(k) || 0;
  }

  function push(evt: RecentEvent) {
    recent.push(evt);
    if (recent.length > MAX_RECENT) recent.shift();
  }

  function dumpCounts(top = 30) {
    console.log("=== API call counts ===");
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .forEach(([k, c]) => console.log(`${c}x  ${k}`));
  }

  function dumpRecent(last = 50) {
    console.log(`=== API recent (${Math.min(last, recent.length)}) ===`);
    recent.slice(-last).forEach((e) => console.log(e));
  }

  function reset() {
    counts.clear();
    inflightById.clear();
    inflightByKey.clear();
    recent.length = 0;
    console.log("API metrics reset");
  }

  return {
    key,
    now,
    incCount,
    markInflight,
    clearInflight,
    inflightForKey,
    push,
    dumpCounts,
    dumpRecent,
    reset,
  };
})();

/* exported helpers (call from any screen / debug button) */
export const dumpApiCounts = (top?: number) =>
  Metrics.dumpCounts(top);

export const dumpApiRecent = (last?: number) =>
  Metrics.dumpRecent(last);

export const resetApiMetrics = () =>
  Metrics.reset();

/* =========================================
   Request interceptor
   ========================================= */

api.interceptors.request.use(async (config) => {
  const k = Metrics.key(config);
  Metrics.incCount(k);

  const start = Metrics.now();
  const reqId = `${start}-${Math.random().toString(16).slice(2)}`;

  config.headers = config.headers ?? {};
  config.headers["X-Request-Id"] = reqId;
  config.headers["X-Request-Start"] = String(start);

  const inflight = Metrics.inflightForKey(k);
  if (inflight > 0) {
    console.log(`[API dup] ${k} inflight=${inflight + 1}`);
  }

  Metrics.markInflight(k, reqId, start);

  // ❗ KEEP CURRENT BEHAVIOR — AsyncStorage read per request
  const userData = await AsyncStorage.getItem("user");
  if (userData) {
    try {
      const user = JSON.parse(userData) as { token?: string };
      if (user?.token) {
        config.headers.Authorization = `Bearer ${user.token}`;
      }
    } catch {
      // ignore
    }
  }

  return config;
});

/* =========================================
   Response interceptor
   ========================================= */

api.interceptors.response.use(
  (res: AxiosResponse) => {
    const cfg = res.config;
    const k = Metrics.key(cfg);
    const start = Number(cfg.headers?.["X-Request-Start"]) || null;
    const totalMs = start ? Metrics.now() - start : null;

    const serverMsRaw =
      res.headers?.["x-server-time-ms"] ??
      res.headers?.["X-Server-Time-Ms"];

    const serverMs =
      serverMsRaw != null ? Number(serverMsRaw) : null;

    const reqId = cfg.headers?.["X-Request-Id"];
    if (reqId) Metrics.clearInflight(k, reqId);

    const bytes = (() => {
      try {
        return JSON.stringify(res.data).length;
      } catch {
        return null;
      }
    })();

    Metrics.push({
      t: new Date().toISOString(),
      key: k,
      status: res.status,
      total_ms: totalMs,
      server_ms: Number.isFinite(serverMs) ? serverMs : null,
      bytes,
    });

    console.log(
      [
        `[API ok] ${k}`,
        `st=${res.status}`,
        totalMs != null ? `total=${totalMs}ms` : null,
        Number.isFinite(serverMs) ? `server=${serverMs}ms` : null,
        bytes != null ? `bytes~${bytes}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    );

    return res;
  },
  (err) => {
    const cfg = err.config as AxiosRequestConfig | undefined;
    const k = cfg ? Metrics.key(cfg) : "UNKNOWN";
    const start = Number(cfg?.headers?.["X-Request-Start"]) || null;
    const totalMs = start ? Metrics.now() - start : null;

    const reqId = cfg?.headers?.["X-Request-Id"];
    if (reqId) Metrics.clearInflight(k, reqId);

    const status: number | null =
      err?.response?.status ?? null;

    Metrics.push({
      t: new Date().toISOString(),
      key: k,
      status,
      total_ms: totalMs,
      error: String(err?.message || "request failed"),
    });

    console.log(
      [
        `[API xx] ${k}`,
        status != null ? `st=${status}` : null,
        totalMs != null ? `total=${totalMs}ms` : null,
        `err=${err?.message}`,
      ]
        .filter(Boolean)
        .join(" | ")
    );

    return Promise.reject(err);
  }
);

export default api;
