/**
 * Единая точка HTTP-запросов.
 *
 * Always relative (BASE_URL = ""):
 *   /login, /auth/*  → auth (Vite / server.js proxy)
 *   /api/*           → backend (offers) / calc (/api/v1|/api/v2 в dev)
 *
 * credentials: 'include' — cookie access_token / csrf_token.
 * На 401 → window event `auth:unauthorized` (AuthContext открывает LoginModal).
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

class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
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

const fetchWithAuth = async (path, init = {}, options = {}) => {
  const response = await doFetch(path, init);

  if (response.status === 404 && options.allowNotFound) {
    return response;
  }

  if (response.status === 401) {
    if (!options.silent401) dispatchUnauthorized();
    const body = await parseResponse(response);
    throw new ApiError(
      (body && typeof body === "object" && (body.error || body.message)) ||
        "Unauthorized",
      { status: 401, body }
    );
  }

  return response;
};

export const request = async (path, init = {}, options = {}) => {
  const response = await fetchWithAuth(path, init, options);

  if (response.status === 404 && options.allowNotFound) {
    return null;
  }

  if (!response.ok) {
    const body = await parseResponse(response);
    const message =
      (body && typeof body === "object" && (body.error || body.message)) ||
      `HTTP ${response.status} ${response.statusText}`;
    throw new ApiError(message, { status: response.status, body });
  }

  return parseResponse(response);
};

export { ApiError };
