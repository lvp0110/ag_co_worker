/**
 * Клиент внешнего auth-сервиса (same-origin через Vite/nginx proxy).
 *
 * Контракт:
 *   POST /login           { email, password } → { code, data: User, error }
 *   GET  /auth/session    → { code, data: User } | 404 без cookie
 *   POST /auth/logout     (нужен X-CSRF-Token = cookie csrf_token)
 *
 * Cookies (ставит auth):
 *   access_token  — httpOnly, сессия
 *   csrf_token    — читаемый, для мутаций
 *
 * В dev Vite проксирует /login и /auth → AUTH_PROXY_TARGET (по умолчанию :3005).
 * В prod то же делает frontend/server.js → AUTH_SERVICE_URL.
 * Не вызывайте auth по абсолютному URL с другого origin — cookies не сохранятся.
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

/** Внешний User → форма для AuthContext / хедера / профиля. */
export const mapExternalUser = (u) => {
  if (!u) return null;
  const fullName = [u.last_name, u.first_name, u.middle_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const roleType = String(u.role_type || "").toLowerCase();
  const phone = u.phone ?? u.cellphone ?? u.phone_number ?? null;
  const office = u.office_address ?? u.officeAddress ?? u.address ?? null;
  return {
    id: u.user_id,
    full_name: fullName || u.email || "",
    email: u.email ?? "",
    phone: phone != null && String(phone).trim() !== "" ? String(phone).trim() : null,
    office_address:
      office != null && String(office).trim() !== "" ? String(office).trim() : null,
    role: roleType === "admin" ? "ADMIN" : "USER",
    is_blocked: u.is_active === false,
    department_id: u.department_id ?? null,
  };
};

const unwrapUser = (body) => {
  const data = body?.data ?? body?.user ?? null;
  const user = mapExternalUser(data);
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
      { skipAuthRetry: true, silent401: true, allowNotFound: true }
    );
    if (!body?.data) return null;
    const user = mapExternalUser(body.data);
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
