import { ApiError, request } from "./apiClient.js";

/**
 * Auth через внешний сервис (:3005):
 *   POST /login
 *   GET  /auth/session
 *   POST /auth/logout
 *
 * Ответ: { code, data, error }. Токены — httpOnly cookie `access_token`
 * + читаемый `csrf_token` (нужен заголовок X-CSRF-Token на мутациях).
 * В dev Vite проксирует /login и /auth на AUTH_PROXY_TARGET.
 */

const readCookie = (name) => {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return "";
};

/** Маппинг внешнего User → форма, которую ждут AuthContext / хедер / профиль. */
export const mapExternalUser = (u) => {
  if (!u) return null;
  const fullName = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(" ").trim();
  const roleType = String(u.role_type || "").toLowerCase();
  const phone =
    u.phone ??
    u.cellphone ??
    u.phone_number ??
    null;
  const office =
    u.office_address ??
    u.officeAddress ??
    u.address ??
    null;
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
    throw new ApiError(body?.error || "Invalid auth response", { status: 500, body });
  }
  return { user, raw: body };
};

/** POST /login — { email, password } → { user } */
export const login = async ({ email, password }) => {
  const body = await request(
    "/login",
    { method: "POST", body: { email, password } },
    { skipAuthRetry: true }
  );
  return unwrapUser(body);
};

/**
 * GET /auth/session — текущий пользователь или null.
 * Без cookie бэк отвечает 404 — это нормальный «аноним», не ошибка.
 */
export const session = async () => {
  try {
    const body = await request(
      "/auth/session",
      { method: "GET" },
      { skipAuthRetry: true, silent401: true, allowNotFound: true }
    );
    if (!body) return null;
    const data = body?.data ?? null;
    if (!data) return null;
    return { user: mapExternalUser(data), raw: body };
  } catch (err) {
    if (err?.status === 404 || err?.status === 401) return null;
    throw err;
  }
};

/** POST /auth/logout — сбрасывает cookies (нужен CSRF). */
export const logout = async () => {
  const csrf = readCookie("csrf_token");
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
