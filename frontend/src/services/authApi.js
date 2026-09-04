/**
 * Клиент внешнего auth-сервиса (same-origin через Vite/nginx proxy).
 *
 * Контракт:
 *   POST /login           { email, password } → { code, data: UserCredentials, error }
 *     UserCredentials.user = UserFullInfo (role_type, email, …)
 *   GET  /auth/session    → { code, data: UserFullInfo } | 404 без cookie
 *   POST /auth/refresh    cookie refresh_token + X-CSRF-Token → новые cookies
 *   POST /auth/logout     (нужен X-CSRF-Token = cookie csrf_token)
 *
 * Cookies (ставит auth):
 *   access_token  — httpOnly, короткий
 *   refresh_token — httpOnly, длинный; apiClient обновляет access при 401
 *   csrf_token    — читаемый, для мутаций и /auth/refresh
 *
 * В dev Vite проксирует /login, /auth и /admin/* → AUTH_PROXY_TARGET (по умолчанию :3005).
 * В prod то же делает frontend/server.js → AUTH_SERVICE_URL.
 * GitHub Pages ходит на VITE_API_URL напрямую: роль берём из JSON login
 * (`data.user.role_type`), не только из последующего GET /auth/session.
 */

import { ApiError, BASE_URL, request } from "./apiClient.js";

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

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const looksLikeUser = (obj) => {
  if (!isPlainObject(obj)) return false;
  return Boolean(
    obj.user_id ||
      obj.email ||
      obj.role_type ||
      obj.role ||
      obj.first_name ||
      obj.last_name
  );
};

/**
 * Login: `{ data: { user: UserFullInfo, expires_at } }`.
 * Session: `{ data: UserFullInfo }`.
 * Также принимает уже развёрнутый user / credentials.
 */
export const extractUserRecord = (payload) => {
  if (!isPlainObject(payload)) return null;
  const data = isPlainObject(payload.data) ? payload.data : payload;
  if (looksLikeUser(data.user)) return data.user;
  if (looksLikeUser(payload.user)) return payload.user;
  if (looksLikeUser(data)) return data;
  return null;
};

const pickRoleType = (u) => {
  const raw = u?.role_type ?? u?.role ?? u?.roleType ?? "";
  if (isPlainObject(raw)) {
    return String(raw.type ?? raw.name ?? raw.role_type ?? "")
      .toLowerCase()
      .trim();
  }
  return String(raw).toLowerCase().trim();
};

const isAdminRole = (roleType) =>
  roleType === "admin" || roleType === "administrator";

/** Внешний User → форма для AuthContext / хедера / профиля. */
export const mapExternalUser = (u) => {
  const record = extractUserRecord(u);
  if (!record) return null;
  const fullName = [record.last_name, record.first_name, record.middle_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const phone = record.phone ?? record.cellphone ?? record.phone_number ?? null;
  const office =
    record.office_address ?? record.officeAddress ?? record.address ?? null;
  return {
    id: record.user_id,
    full_name: fullName || record.email || "",
    email: record.email ?? "",
    phone:
      phone != null && String(phone).trim() !== "" ? String(phone).trim() : null,
    office_address:
      office != null && String(office).trim() !== ""
        ? String(office).trim()
        : null,
    role: isAdminRole(pickRoleType(record)) ? "ADMIN" : "USER",
    is_blocked: record.is_active === false,
    department_id: record.department_id ?? null,
  };
};

const unwrapUser = (body) => {
  const user = mapExternalUser(body);
  if (!user) {
    throw new ApiError(body?.error || "Некорректный ответ auth", {
      status: 500,
      body,
    });
  }
  return { user, raw: body };
};

/** Человекочитаемая ошибка логина (auth часто отдаёт сырой bcrypt-текст). */
export const formatAuthError = (err) => {
  const raw = String(err?.message || err?.body?.error || "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("bcrypt") ||
    lower.includes("invalid credential") ||
    lower.includes("hashedpassword") ||
    err?.status === 401
  ) {
    return "Неверный email или пароль.";
  }
  if (err?.status === 403 || lower.includes("blocked")) {
    return "Аккаунт заблокирован.";
  }
  return raw.trim() || "Не удалось войти";
};

/** POST /login */
export const login = async ({ email, password }) => {
  const body = await request(
    "/login",
    {
      method: "POST",
      body: { email: String(email || "").trim().toLowerCase(), password },
    },
    { skipAuthRetry: true }
  );
  return unwrapUser(body);
};

/**
 * GET /auth/session → { user } | null.
 * 404 без cookie — нормальный аноним.
 */
export const session = async () => {
  try {
    const body = await request(
      "/auth/session",
      { method: "GET" },
      { silent401: true, allowNotFound: true }
    );
    if (!body) return null;
    const user = mapExternalUser(body);
    return user ? { user, raw: body } : null;
  } catch (err) {
    if (err?.status === 404 || err?.status === 401) return null;
    throw err;
  }
};

/** CSRF из cookie (для мутаций auth и выгрузки в 1С). */
export const getCsrfToken = async () => readCookie("csrf_token");

/** true, если фронт ходит на другой origin (GitHub Pages → :3005). */
export const isCrossOriginAuth = () => {
  if (typeof window === "undefined" || !BASE_URL) return false;
  try {
    return new URL(BASE_URL, window.location.origin).origin !== window.location.origin;
  } catch {
    return false;
  }
};

/** POST /auth/logout */
export const logout = async () => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;
  try {
    await request(
      "/auth/logout",
      { method: "POST", headers },
      { skipAuthRetry: true, silent401: true }
    );
  } catch {
    // ignore
  }
};
