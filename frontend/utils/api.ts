import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { storageKey } from "../env";
import type { paths } from "../types/models";
import { useSubscriptionStore } from "../store/subscriptionStore";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

const axiosInstance: AxiosInstance = axios.create({
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
    recent.slice(-last).forEach(e => console.log(e));
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

export const dumpApiCounts = (top?: number) => Metrics.dumpCounts(top);
export const dumpApiRecent = (last?: number) => Metrics.dumpRecent(last);
export const resetApiMetrics = () => Metrics.reset();

/* =========================================
   Interceptors
   ========================================= */

axiosInstance.interceptors.request.use(async config => {
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

  const userData = await AsyncStorage.getItem(storageKey("user"));
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

axiosInstance.interceptors.response.use(
  (res: AxiosResponse) => {
    const cfg = res.config;
    const k = Metrics.key(cfg);
    const start = Number(cfg.headers?.["X-Request-Start"]) || null;
    const totalMs = start ? Metrics.now() - start : null;

    const serverMsRaw =
      res.headers?.["x-server-time-ms"] ?? res.headers?.["X-Server-Time-Ms"];
    const serverMs = serverMsRaw != null ? Number(serverMsRaw) : null;

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
        .join(" | "),
    );

    return res;
  },
  err => {
    const cfg = err.config as AxiosRequestConfig | undefined;
    const k = cfg ? Metrics.key(cfg) : "UNKNOWN";
    const start = Number(cfg?.headers?.["X-Request-Start"]) || null;
    const totalMs = start ? Metrics.now() - start : null;

    const reqId = cfg?.headers?.["X-Request-Id"];
    if (reqId) Metrics.clearInflight(k, reqId);

    const status: number | null = err?.response?.status ?? null;

    // 402 = backend require_pro gate rejected a non-Pro user. Reflect it in the
    // subscription store so the paywall renders instead of a generic error.
    if (status === 402) {
      try {
        useSubscriptionStore.getState().setIsPro(false);
      } catch {
        // store not ready / unavailable — ignore
      }
    }

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
        .join(" | "),
    );

    return Promise.reject(err);
  },
);

/* =========================================
   Type helpers — extract request/response
   types directly from the generated paths
   ========================================= */

type ResponseBody<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : never;

type RequestBody<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

type QueryParams<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  parameters: { query?: infer Q };
}
  ? Q
  : never;

type PathParams<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  parameters: { path: infer Pp };
}
  ? Pp
  : never;

// Short path = strip the /api prefix for callers
type ApiPath = keyof paths;

// Exact static match: '/workouts' -> '/api/workouts'
type FullPath<S extends string> = `/api${S}` extends ApiPath
  ? `/api${S}`
  : never;

// Strip query string from a path string type: '/foo?bar=1' -> '/foo'
type StripQuery<S extends string> = S extends `${infer Base}?${string}`
  ? Base
  : S;

// Dynamic match — handles up to 2 path params, and strips query strings:
// '/conversations/${id}/messages' -> '/api/ai/conversations/{id}/messages'
// '/workouts/history/by-exercise?exercise_id=...' -> '/api/workouts/history/by-exercise'
type MatchPath<S extends string> = {
  [P in ApiPath]: `/api${StripQuery<S>}` extends (
    P extends `${infer A}{${string}}${infer B}{${string}}${infer C}`
      ? `${A}${string}${B}${string}${C}`
      : P extends `${infer A}{${string}}${infer B}`
        ? `${A}${string}${B}`
        : P
  )
    ? P
    : never;
}[ApiPath];

// Resolve: exact first, then dynamic, then fall back to any
type ResolvedPath<S extends string> =
  FullPath<StripQuery<S>> extends ApiPath
    ? FullPath<StripQuery<S>>
    : MatchPath<S> extends ApiPath
      ? MatchPath<S>
      : never;

// When path doesn't resolve, default P to never which makes ResponseBody return any
type SafeResponseBody<P, M extends string> = [P] extends [never]
  ? any
  : P extends ApiPath
    ? M extends keyof paths[P]
      ? paths[P][M] extends {
          responses: { 200: { content: { "application/json": infer R } } };
        }
        ? R
        : any
      : any
    : any;

// Replace {param} tokens in a path string with actual values at runtime
function interpolatePath(path: string, params: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in params)) throw new Error(`Missing path param: ${key}`);
    return encodeURIComponent(params[key]);
  });
}

/* =========================================
   Typed API client
   ========================================= */

const api = {
  get<S extends string, P extends ApiPath = ResolvedPath<S>>(
    path: S,
    config?: AxiosRequestConfig & {
      params?: QueryParams<P, "get">;
      pathParams?: Record<string, string>;
    },
  ): Promise<AxiosResponse<SafeResponseBody<P, "get">>> {
    const url = config?.pathParams
      ? interpolatePath(path, config.pathParams)
      : path;
    return axiosInstance.get(url, config);
  },

  post<S extends string, P extends ApiPath = ResolvedPath<S>>(
    path: S,
    data?: RequestBody<P, "post">,
    config?: AxiosRequestConfig & { pathParams?: Record<string, string> },
  ): Promise<AxiosResponse<SafeResponseBody<P, "post">>> {
    const url = config?.pathParams
      ? interpolatePath(path, config.pathParams)
      : path;
    return axiosInstance.post(url, data, config);
  },

  put<S extends string, P extends ApiPath = ResolvedPath<S>>(
    path: S,
    data?: RequestBody<P, "put">,
    config?: AxiosRequestConfig & { pathParams?: Record<string, string> },
  ): Promise<AxiosResponse<SafeResponseBody<P, "put">>> {
    const url = config?.pathParams
      ? interpolatePath(path, config.pathParams)
      : path;
    return axiosInstance.put(url, data, config);
  },

  patch<S extends string, P extends ApiPath = ResolvedPath<S>>(
    path: S,
    data?: RequestBody<P, "patch">,
    config?: AxiosRequestConfig & { pathParams?: Record<string, string> },
  ): Promise<AxiosResponse<SafeResponseBody<P, "patch">>> {
    const url = config?.pathParams
      ? interpolatePath(path, config.pathParams)
      : path;
    return axiosInstance.patch(url, data, config);
  },

  delete<S extends string, P extends ApiPath = ResolvedPath<S>>(
    path: S,
    config?: AxiosRequestConfig & { pathParams?: Record<string, string> },
  ): Promise<AxiosResponse<SafeResponseBody<P, "delete">>> {
    const url = config?.pathParams
      ? interpolatePath(path, config.pathParams)
      : path;
    return axiosInstance.delete(url, config);
  },
};

export default api;
type WsHandlers = {
  onOpen?: () => void;
  onClose?: (e: { code?: number; reason?: string }) => void;
  onError?: (e: any) => void;
  onMessage?: (evt: any) => void; // you already parse and route inside handlers
};

type WsClient = {
  start: (path?: string) => void;
  stop: () => void;
  setHandlers: (h: WsHandlers) => void; // <-- keep this
  isConnected: () => boolean;
};

function httpToWs(base: string) {
  return base.replace(/^http/, "ws").replace(/\/$/, "");
}

async function getToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(storageKey("user"));
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as { token?: string };
    return u?.token ?? null;
  } catch {
    return null;
  }
}

export function createWsClient(
  baseHttpUrl: string = process.env.EXPO_PUBLIC_BACKEND_URL ||
    "http://localhost:8000",
): WsClient & { reconnect: () => void } {
  let ws: WebSocket | null = null;
  let handlers: WsHandlers = {};
  let started = false;
  let currentPath = "/ws";

  let retry = 0;
  let reconnectTimer: any = null;
  let connecting = false;

  function httpToWs(base: string) {
    return base.replace(/^http/, "ws").replace(/\/$/, "");
  }

  async function connect() {
    if (!started) return;
    if (connecting) return;

    connecting = true;

    const token = await getToken();
    if (!token) {
      connecting = false;
      return;
    }

    const wsUrl =
      `${httpToWs(baseHttpUrl)}${currentPath}` +
      `?token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.onopen = () => {
      retry = 0;
      connecting = false;
      handlers.onOpen?.();
    };

    socket.onclose = (e: any) => {
      handlers.onClose?.({ code: e?.code, reason: e?.reason });
      ws = null;
      connecting = false;

      if (!started) return;

      // 1008 = server rejected our token (auth failure). Reconnecting fast with the same
      // token is pointless and spams the server — back off hard until the token changes
      // (login / app restart calls reconnect(), which resets and retries immediately).
      scheduleReconnect(e?.code === 1008 ? 30000 : undefined);
    };

    socket.onerror = (e: any) => {
      handlers.onError?.(e);
    };

    socket.onmessage = (msg: any) => {
      try {
        const parsed = JSON.parse(msg.data);
        handlers.onMessage?.(parsed);
      } catch {
        // ignore malformed
      }
    };
  }

  function scheduleReconnect(fixedDelay?: number) {
    if (!started) return;
    if (reconnectTimer) return;

    const delay = fixedDelay ?? Math.min(8000, 500 * Math.pow(2, retry));
    retry++;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function cleanupTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  return {
    setHandlers(h) {
      handlers = h || {};
    },

    start(path: string = "/ws") {
      if (started) return;

      started = true;
      retry = 0;
      currentPath = path;

      cleanupTimer();
      connect();
    },

    stop() {
      started = false;
      retry = 0;
      cleanupTimer();

      if (ws) {
        try {
          ws.close();
        } catch {}
      }

      ws = null;
    },

    reconnect() {
      console.log("WebSocket manual reconnect triggered");
      if (!started) return;
      console.log("WebSocket reconnect: checking current state...");

      // If already open → do nothing
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("WebSocket already connected, no need to reconnect");
        return;
      }

      // If currently connecting → do nothing
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.log(
          "WebSocket currently connecting, waiting for it to finish...",
        );
        return;
      }

      cleanupTimer();

      console.log("WebSocket reconnect: Cleaned Up Timer...");
      retry = 0;

      if (ws) {
        try {
          console.log("WebSocket reconnect: Closing existing socket...");
          ws.close();
        } catch {
          console.log("WebSocket reconnect: Error closing socket, ignoring...");
        }
        ws = null;
      }

      console.log("WebSocket reconnect: Starting new connection...");
      connect();
      console.log("WebSocket reconnect: Connect called...");
    },

    isConnected() {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}
