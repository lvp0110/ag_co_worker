/**
 * Единая точка HTTP-запросов.
 *
 * Always relative (BASE_URL = ""):
 *   /login, /auth/*  → auth (Vite / server.js proxy)
 *   /integration/*   → auth (1С documents: create / list)
 *   /admin/*         → auth/calc (:3005) admin materials/constructions
 *   /api/*           → backend (legacy) / calc (/api/v1|/api/v2 в dev)
 *
 * Same-origin (dev / prod nginx): cookies access_token / refresh_token / csrf_token.
 * GitHub Pages (VITE_API_URL другой origin): cookies не доходят — берём
 * access_token из JSON логина (X-CSRF-Token: pages) и шлём Bearer.
 * На 401 сначала POST /auth/refresh, затем повтор. Если refresh не вышел —
 * `auth:unauthorized` (на Pages без сохранённого токена сессию не сбрасываем).
 */

const DEFAULT_BASE_URL = "";
export const BASE_URL = (import.meta.env.VITE_API_URL ?? DEFAULT_BASE_URL).replace(
  /\/$/,
  ""
);

const TOKEN_STORAGE_KEY = "ag_auth_bearer_v1";

let memoryAuthTokens = { access_token: "", refresh_token: "" };

/** true, если фронт ходит на другой origin (GitHub Pages → :3005). */
export const isCrossOriginAuth = () => {
  if (typeof window === "undefined" || !BASE_URL) return false;
  try {
    return new URL(BASE_URL, window.location.origin).origin !== window.location.origin;
  } catch {
    return false;
  }
};

const canUseSessionStorage = () => {
  try {
    return typeof sessionStorage !== "undefined";
  } catch {
    return false;
  }
};

export const extractAuthTokensFromBody = (body) => {
  const data =
    body && typeof body === "object" && body.data && typeof body.data === "object"
      ? body.data
      : body;
  if (!data || typeof data !== "object") {
    return { access_token: "", refresh_token: "" };
  }
  const access = String(
    data.access_token || data.accessToken || data.token || ""
  ).trim();
  const refresh = String(
    data.refresh_token || data.refreshToken || ""
  ).trim();
  return { access_token: access, refresh_token: refresh };
};

export const readStoredAuthTokens = () => {
  if (memoryAuthTokens.access_token || memoryAuthTokens.refresh_token) {
    return { ...memoryAuthTokens };
  }
  if (!canUseSessionStorage()) return { access_token: "", refresh_token: "" };
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return { access_token: "", refresh_token: "" };
    const parsed = JSON.parse(raw);
    const tokens = {
      access_token: String(parsed?.access_token || "").trim(),
      refresh_token: String(parsed?.refresh_token || "").trim(),
    };
    memoryAuthTokens = tokens;
    return tokens;
  } catch {
    return { access_token: "", refresh_token: "" };
  }
};

const writeStoredAuthTokens = (tokens) => {
  const access_token = String(tokens?.access_token || "").trim();
  const refresh_token = String(tokens?.refresh_token || "").trim();
  memoryAuthTokens = { access_token, refresh_token };
  if (!canUseSessionStorage()) return;
  if (!access_token && !refresh_token) {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(
    TOKEN_STORAGE_KEY,
    JSON.stringify({ access_token, refresh_token })
  );
};

export const persistAuthTokensFromBody = (body) => {
  const next = extractAuthTokensFromBody(body);
  if (!next.access_token && !next.refresh_token) return;
  const prev = readStoredAuthTokens();
  writeStoredAuthTokens({
    access_token: next.access_token || prev.access_token,
    refresh_token: next.refresh_token || prev.refresh_token,
  });
};

export const clearStoredAuthTokens = () => {
  writeStoredAuthTokens({ access_token: "", refresh_token: "" });
};

const dispatchUnauthorized = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }
};

const readCookie = (name) => {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  for (const part of document.cookie ? document.cookie.split("; ") : []) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return "";
};

let refreshInFlight = null;

/** POST /auth/refresh. true, если auth выставил новые cookies / токены. */
const refreshSession = async () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const csrf = readCookie("csrf_token");
    const stored = readStoredAuthTokens();
    if (!csrf && !stored.refresh_token) return false;
    try {
      const headers = {};
      if (csrf) headers["X-CSRF-Token"] = csrf;
      const init = { method: "POST", headers };
      if (stored.refresh_token && (isCrossOriginAuth() || !csrf)) {
        init.body = { refresh_token: stored.refresh_token };
      }
      const response = await doFetch("/auth/refresh", init);
      if (!response.ok) return false;
      persistAuthTokensFromBody(await parseResponse(response));
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
};

class ApiError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

const parseResponse = async (response) => {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
};

const buildHeaders = (init, path = "") => {
  const headers = new Headers(init.headers || {});
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }
  const isLogin =
    /\/login$/.test(String(path).split("?")[0]) ||
    String(path).includes("/auth/login");
  if (isCrossOriginAuth() && !isLogin && !headers.has("authorization")) {
    const access = readStoredAuthTokens().access_token;
    if (access) headers.set("authorization", `Bearer ${access}`);
  }
  return headers;
};

const doFetch = async (path, init) => {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const body =
    init.body !== undefined &&
    typeof init.body !== "string" &&
    !(init.body instanceof FormData)
      ? JSON.stringify(init.body)
      : init.body;

  return fetch(url, {
    ...init,
    body,
    credentials: "include",
    headers: buildHeaders({ ...init, body }, path),
  });
};

const resolveUrl = (path) =>
  path.startsWith("http") ? path : `${BASE_URL}${path}`;

const fetchWithAuth = async (path, init = {}, options = {}) => {
  const url = resolveUrl(path);
  const response = await doFetch(path, init);

  if (response.status === 404 && options.allowNotFound) {
    return response;
  }

  if (response.status === 401) {
    if (!options.skipAuthRetry && (await refreshSession())) {
      return fetchWithAuth(path, init, { ...options, skipAuthRetry: true });
    }
    if (!options.silent401) {
      // Pages без bearer: 401 админки не должен выкидывать только что вошедшего.
      const hasBearer = Boolean(readStoredAuthTokens().access_token);
      if (!isCrossOriginAuth() || hasBearer) dispatchUnauthorized();
    }
    const body = await parseResponse(response);
    console.error("[api] 401", init.method || "GET", url, body);
    throw new ApiError(
      (body && typeof body === "object" && (body.error || body.message)) ||
        "Unauthorized",
      { status: 401, body, url }
    );
  }

  return response;
};

/** Текст ошибки с URL, статусом и телом ответа — для модалки / копирования. */
export const formatRequestError = (err) => {
  const lines = [];
  if (err?.message) lines.push(String(err.message));
  if (err?.url) lines.push(`URL: ${err.url}`);
  if (err?.status != null) lines.push(`HTTP ${err.status}`);
  if (err?.body !== undefined && err?.body !== null) {
    lines.push(
      typeof err.body === "string"
        ? err.body
        : JSON.stringify(err.body, null, 2)
    );
  }
  return lines.filter(Boolean).join("\n") || "Неизвестная ошибка";
};

export const request = async (path, init = {}, options = {}) => {
  const url = resolveUrl(path);
  const response = await fetchWithAuth(path, init, options);

  if (response.status === 404 && options.allowNotFound) {
    return null;
  }

  if (!response.ok) {
    const body = await parseResponse(response);
    const message =
      (body && typeof body === "object" && (body.error || body.message)) ||
      `HTTP ${response.status} ${response.statusText}`;
    console.error("[api]", init.method || "GET", url, response.status, body);
    throw new ApiError(message, { status: response.status, body, url });
  }

  return parseResponse(response);
};

export { ApiError };
