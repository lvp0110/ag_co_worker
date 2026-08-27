/**
 * Единая точка HTTP-запросов.
 *
 * Always relative (BASE_URL = ""):
 *   /login, /auth/*  → auth (Vite / server.js proxy)
 *   /integration/*   → auth (1С documents: create / list)
 *   /admin/*         → auth/calc (:3005) admin materials/constructions
 *   /api/*           → backend (legacy) / calc (/api/v1|/api/v2 в dev)
 *
 * credentials: 'include' — cookie access_token / refresh_token / csrf_token.
 * На 401 сначала POST /auth/refresh (cookie refresh_token + X-CSRF-Token),
 * затем повтор исходного запроса. Если refresh не вышел — `auth:unauthorized`.
 * Не добавляйте Authorization header — только cookies.
 */

const DEFAULT_BASE_URL = "";
export const BASE_URL = (import.meta.env.VITE_API_URL ?? DEFAULT_BASE_URL).replace(
  /\/$/,
  ""
);

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

/** POST /auth/refresh. true, если auth выставил новые cookies. */
const refreshSession = async () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const csrf = readCookie("csrf_token");
    if (!csrf) return false;
    try {
      const response = await doFetch("/auth/refresh", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
      });
      return response.ok;
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

const buildHeaders = (init) => {
  const headers = new Headers(init.headers || {});
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
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
    headers: buildHeaders({ ...init, body }),
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
    if (!options.silent401) dispatchUnauthorized();
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
