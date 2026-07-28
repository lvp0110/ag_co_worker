import bcrypt from "bcrypt";
import { type Role, type User } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { nextEmployeeNumberForCompany } from "../utils/employeeNumber.js";

const SALT_ROUNDS = 10;
const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
/** Неиспользуемый пароль: вход только через внешний auth-сервис. */
const EXTERNAL_PASSWORD_PLACEHOLDER = "external-auth-no-local-password";

export type ExternalSessionUser = {
  user_id: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email: string;
  role_type?: string;
  is_active?: boolean;
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

const mapRole = (roleType: string | undefined): Role =>
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

const resolveCompanyId = async (): Promise<string> => {
  const configured = (process.env.DEFAULT_COMPANY_ID ?? "").trim();
  if (configured) {
    const company = await prisma.company.findUnique({ where: { id: configured } });
    if (company) return company.id;
  }
  const fallback =
    (await prisma.company.findUnique({ where: { id: DEFAULT_COMPANY_ID } })) ??
    (await prisma.company.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!fallback) {
    throw new Error("В БД нет компании для привязки внешнего пользователя");
  }
  return fallback.id;
};

/**
 * Находит или создаёт локального User по email из внешней сессии.
 * Обновляет ФИО / role / isBlocked с внешнего сервиса.
 */
export const upsertLocalUserFromExternal = async (
  external: ExternalSessionUser
): Promise<User> => {
  const email = String(external.email).trim().toLowerCase();
  const fullName = buildFullName(external);
  const role = mapRole(external.role_type);
  const isBlocked = external.is_active === false;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { fullName, role, isBlocked },
    });
  }

  const companyId = await resolveCompanyId();
  const passwordHash = await bcrypt.hash(EXTERNAL_PASSWORD_PLACEHOLDER, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const employeeNumber = await nextEmployeeNumberForCompany(tx, companyId);
    return tx.user.create({
      data: {
        email,
        fullName,
        role,
        isBlocked,
        passwordHash,
        companyId,
        employeeNumber,
      },
    });
  });
};
