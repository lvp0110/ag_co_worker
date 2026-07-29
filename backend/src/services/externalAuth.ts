import { type Role, type User } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

/** `department_id` отсутствует в сессии → отдел «не указан». */
const NO_DEPARTMENT = 0;

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

type ExternalApiResponse<T> = {
  code?: number;
  data?: T;
  error?: string;
};

const buildFullName = (u: ExternalSessionUser): string => {
  const name = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(" ").trim();
  return name || u.email;
};

export const mapRole = (roleType: string | undefined): Role =>
  String(roleType || "").toLowerCase() === "admin" ? "ADMIN" : "USER";

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

const readDepartmentId = (external: ExternalSessionUser): number => {
  const raw = Number(external.department_id);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : NO_DEPARTMENT;
};

/**
 * Находит или создаёт локального User по email из внешней сессии.
 * Обновляет ФИО / role / isBlocked / отдел с внешнего сервиса.
 * Локальная строка нужна только как FK-якорь для офферов.
 */
export const upsertLocalUserFromExternal = async (
  external: ExternalSessionUser
): Promise<User> => {
  const email = String(external.email).trim().toLowerCase();
  const fullName = buildFullName(external);
  const role = mapRole(external.role_type);
  const isBlocked = external.is_active === false;
  const departmentId = readDepartmentId(external);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { fullName, role, isBlocked, departmentId },
    });
  }

  return prisma.user.create({
    data: {
      email,
      fullName,
      role,
      isBlocked,
      departmentId,
    },
  });
};
