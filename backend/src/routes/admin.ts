import bcrypt from "bcrypt";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { nextEmployeeNumberForCompany } from "../utils/employeeNumber.js";
import { toCompanyDto, toUserDto } from "../utils/userDto.js";
import { parsePagination, paginated } from "../utils/pagination.js";

const SALT_ROUNDS = 10;
const router = Router();

/** Код страны по умолчанию (см. справочник `countries`). */
const DEFAULT_COUNTRY_CODE = "RU";
/** Проверка кода страны по справочнику. */
const isValidCountryCode = async (code: string): Promise<boolean> =>
  (await prisma.country.count({ where: { code } })) > 0;

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<Response | void>;
const asyncHandler = (handler: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(handler(req, res, next)).catch(next);

router.use(requireAuth, requireAdmin);

const trimOrNull = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ─── Countries (справочник) ─────────────────────────────────────────────────

/** GET /api/admin/countries — справочник стран для выпадающих списков. */
router.get(
  "/countries",
  asyncHandler(async (_req, res) => {
    const countries = await prisma.country.findMany({ orderBy: { name: "asc" } });
    return res.json(countries.map((c) => ({ code: c.code, name: c.name })));
  })
);

// ─── Companies ────────────────────────────────────────────────────────────────

/** GET /api/admin/companies — список компаний с числом сотрудников (пагинация). */
router.get(
  "/companies",
  asyncHandler(async (req, res) => {
    const { page, limit, skip, take } = parsePagination(req.query);
    const [companies, total] = await prisma.$transaction([
      prisma.company.findMany({
        orderBy: { name: "asc" },
        include: { country: true, _count: { select: { users: true } } },
        skip,
        take,
      }),
      prisma.company.count(),
    ]);
    const items = companies.map((c) => ({
      ...toCompanyDto(c),
      users_count: c._count.users,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }));
    return res.json(paginated(items, total, page, limit));
  })
);

/** POST /api/admin/companies — создать компанию (name обязателен). */
router.post(
  "/companies",
  asyncHandler(async (req, res) => {
    const { name, address, phone, country_code, ogrn, ogrnip, kpp, inn, logo_url } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const resolvedCode =
      country_code !== undefined ? String(country_code) : DEFAULT_COUNTRY_CODE;
    if (!(await isValidCountryCode(resolvedCode))) {
      return res.status(400).json({ error: "Unknown country_code" });
    }
    const company = await prisma.company.create({
      data: {
        name: String(name).trim(),
        address: trimOrNull(address),
        phone: trimOrNull(phone),
        countryCode: resolvedCode,
        ogrn: trimOrNull(ogrn),
        ogrnip: trimOrNull(ogrnip),
        kpp: trimOrNull(kpp),
        inn: trimOrNull(inn),
        logoUrl: trimOrNull(logo_url),
      },
      include: { country: true },
    });
    return res.status(201).json(toCompanyDto(company));
  })
);

/** PATCH /api/admin/companies/:id — частичное обновление реквизитов. */
router.patch(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Company not found" });

    const { name, address, phone, country_code, ogrn, ogrnip, kpp, inn, logo_url } = req.body ?? {};
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    if (country_code !== undefined && !(await isValidCountryCode(String(country_code)))) {
      return res.status(400).json({ error: "Unknown country_code" });
    }
    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? String(name).trim() : undefined,
        address: address !== undefined ? trimOrNull(address) : undefined,
        phone: phone !== undefined ? trimOrNull(phone) : undefined,
        countryCode: country_code !== undefined ? String(country_code) : undefined,
        ogrn: ogrn !== undefined ? trimOrNull(ogrn) : undefined,
        ogrnip: ogrnip !== undefined ? trimOrNull(ogrnip) : undefined,
        kpp: kpp !== undefined ? trimOrNull(kpp) : undefined,
        inn: inn !== undefined ? trimOrNull(inn) : undefined,
        logoUrl: logo_url !== undefined ? trimOrNull(logo_url) : undefined,
      },
      include: { country: true },
    });
    return res.json(toCompanyDto(company));
  })
);

/** DELETE /api/admin/companies/:id — запрет при наличии привязанных сотрудников. */
router.delete(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Company not found" });
    if (existing._count.users > 0) {
      return res.status(409).json({ error: "Нельзя удалить компанию с привязанными сотрудниками" });
    }
    await prisma.company.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  })
);

// ─── Users ──────────────────────────────────────────────────────────────────

/** GET /api/admin/users — список пользователей с компанией и ролью (пагинация). */
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { page, limit, skip, take } = parsePagination(req.query);
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        include: { company: { include: { country: true } } },
        skip,
        take,
      }),
      prisma.user.count(),
    ]);
    return res.json(paginated(users.map(toUserDto), total, page, limit));
  })
);

/** POST /api/admin/users — создать пользователя (full_name, email, password, company_id обязательны). */
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const { full_name, email, password, phone, office_address, role, company_id } =
      req.body ?? {};

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: "full_name is required" });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }
    if (!company_id) {
      return res.status(400).json({ error: "company_id is required" });
    }
    if (role !== undefined && role !== "USER" && role !== "ADMIN") {
      return res.status(400).json({ error: "role must be USER or ADMIN" });
    }

    const company = await prisma.company.findUnique({ where: { id: String(company_id) } });
    if (!company) return res.status(400).json({ error: "Company not found" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
    const user = await prisma.$transaction(async (tx) => {
      const employeeNumber = await nextEmployeeNumberForCompany(tx, company.id);
      return tx.user.create({
        data: {
          fullName: String(full_name).trim(),
          email: normalizedEmail,
          phone: trimOrNull(phone),
          officeAddress: trimOrNull(office_address),
          role: role !== undefined ? (role as "USER" | "ADMIN") : "USER",
          companyId: company.id,
          employeeNumber,
          passwordHash,
        },
        include: { company: { include: { country: true } } },
      });
    });
    return res.status(201).json(toUserDto(user));
  })
);

/** PATCH /api/admin/users/:id — менять full_name/email/phone/office_address/role/company_id. */
router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const { full_name, email, phone, office_address, role, company_id } = req.body ?? {};

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const duplicate = await prisma.user.findFirst({
        where: { email: normalizedEmail, id: { not: req.params.id } },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({ error: "User with this email already exists" });
      }
    }

    if (role !== undefined && role !== "USER" && role !== "ADMIN") {
      return res.status(400).json({ error: "role must be USER or ADMIN" });
    }

    if (company_id !== undefined) {
      const company = await prisma.company.findUnique({ where: { id: String(company_id) } });
      if (!company) return res.status(400).json({ error: "Company not found" });
    }

    const nextCompanyId =
      company_id !== undefined ? String(company_id) : existing.companyId;
    const companyChanged = nextCompanyId !== existing.companyId;

    const updated = await prisma.$transaction(async (tx) => {
      const employeeNumber = companyChanged
        ? await nextEmployeeNumberForCompany(tx, nextCompanyId)
        : undefined;

      return tx.user.update({
        where: { id: req.params.id },
        data: {
          fullName: full_name !== undefined ? String(full_name).trim() : undefined,
          email: email !== undefined ? String(email).trim().toLowerCase() : undefined,
          phone: phone !== undefined ? trimOrNull(phone) : undefined,
          officeAddress: office_address !== undefined ? trimOrNull(office_address) : undefined,
          role: role !== undefined ? (role as "USER" | "ADMIN") : undefined,
          companyId: company_id !== undefined ? nextCompanyId : undefined,
          ...(employeeNumber !== undefined ? { employeeNumber } : {}),
        },
        include: { company: { include: { country: true } } },
      });
    });
    return res.json(toUserDto(updated));
  })
);

/** PATCH /api/admin/users/:id/password — задать новый пароль пользователю. */
router.patch(
  "/users/:id/password",
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const { password } = req.body ?? {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    return res.status(204).send();
  })
);

/** PATCH /api/admin/users/:id/block — заблокировать/разблокировать пользователя. */
router.patch(
  "/users/:id/block",
  asyncHandler(async (req, res) => {
    const { is_blocked } = req.body ?? {};
    if (typeof is_blocked !== "boolean") {
      return res.status(400).json({ error: "is_blocked must be a boolean" });
    }
    if (req.auth?.userId === req.params.id) {
      return res
        .status(400)
        .json({ error: "Нельзя заблокировать собственную учётную запись" });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBlocked: is_blocked },
      include: { company: { include: { country: true } } },
    });
    return res.json(toUserDto(updated));
  })
);

export default router;
