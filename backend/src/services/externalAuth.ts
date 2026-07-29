import { env } from "../config/env.js";

export type AuthRole = "USER" | "ADMIN";

export type ExternalSessionUser = {
  user_id: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email: string;
  role_type?: string;
  is_active?: boolean;
  /** Отдел сотрудника — единственная «организационная» привязка, которую отдаёт auth. */
  department_id?: number;
};

/** Нормализованная сессия для `req.auth` — без локальной строки User. */
export type RequestAuth = {
  /** Внешний `user_id` из `/auth/session`. */
  externalUserId: string;
  /** Email владельца офферов (lowercase). */
  email: string;
  fullName: string;
  role: AuthRole;
};

type ExternalApiResponse<T> = {
  code?: number;
  data?: T;
  error?: string;
};

export const buildFullName = (u: ExternalSessionUser): string => {
  const name = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(" ").trim();
  return name || u.email;
};

export const mapRole = (roleType: string | undefined): AuthRole =>
  String(roleType || "").toLowerCase() === "admin" ? "ADMIN" : "USER";

export const normalizeOwnerEmail = (email: string): string =>
  String(email).trim().toLowerCase();

/**
 * GET {AUTH_SERVICE_URL}/auth/session с пробросом Cookie.
 * 404 / нет data → null (аноним).
 */
export const fetchExternalSession = async (
  cookieHeader: string | undefined
): Promise<ExternalSessionUser | null> => {
  if (!cookieHeader) return null;

  const url = `${env.authServiceUrl.replace(/\/$/, "")}/auth/session`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: cookieHeader,
      },
    });
  } catch {
    return null;
  }

  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) return null;

  let body: ExternalApiResponse<ExternalSessionUser>;
  try {
    body = (await response.json()) as ExternalApiResponse<ExternalSessionUser>;
  } catch {
    return null;
  }

  const data = body?.data;
  if (!data?.email) return null;
  return data;
};

/** Собирает `req.auth` из внешней сессии (без записи в локальную БД). */
export const toRequestAuth = (external: ExternalSessionUser): RequestAuth => ({
  externalUserId: String(external.user_id ?? "").trim(),
  email: normalizeOwnerEmail(external.email),
  fullName: buildFullName(external),
  role: mapRole(external.role_type),
});
