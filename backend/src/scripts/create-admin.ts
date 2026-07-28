/**
 * Бутстрап рутового админа. Идемпотентный — повторный запуск безопасен.
 *
 * Запуск:
 *   prod:  docker compose -f docker-compose.prod.yml run --rm backend node dist/scripts/create-admin.js
 *   локально: npx tsx src/scripts/create-admin.ts
 *
 * Креды берутся из env (в проде — из .env.prod через env_file backend-сервиса):
 *   ADMIN_EMAIL       (обязателен)
 *   ADMIN_PASSWORD    (обязателен, >= 6 символов)
 *   ADMIN_NAME        (опц., по умолчанию "Администратор")
 *   ADMIN_COMPANY_ID  (опц.; по умолчанию дефолтная компания из миграции,
 *                      иначе — первая компания в БД)
 *
 * Поведение:
 *   - пользователь с таким email уже есть → выставляем role=ADMIN (пароль НЕ трогаем);
 *   - пользователя нет → создаём с хешированным паролем, role=ADMIN, привязкой к компании.
 */
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { nextEmployeeNumberForCompany } from "../utils/employeeNumber.js";

const SALT_ROUNDS = 10;
const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const fullName = (process.env.ADMIN_NAME ?? "Администратор").trim();
  const requestedCompanyId = (process.env.ADMIN_COMPANY_ID ?? "").trim();

  if (!email) throw new Error("ADMIN_EMAIL не задан");
  if (password.length < 6) throw new Error("ADMIN_PASSWORD обязателен (минимум 6 символов)");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "ADMIN") {
      console.log(`✓ Пользователь ${email} уже ADMIN — ничего не меняем.`);
      return;
    }
    await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
    console.log(`✓ Пользователь ${email} повышен до ADMIN.`);
    return;
  }

  // Резолвим компанию: запрошенная → дефолтная из миграции → первая в БД.
  let company = null;
  if (requestedCompanyId) {
    company = await prisma.company.findUnique({ where: { id: requestedCompanyId } });
    if (!company) throw new Error(`Компания ADMIN_COMPANY_ID=${requestedCompanyId} не найдена`);
  } else {
    company =
      (await prisma.company.findUnique({ where: { id: DEFAULT_COMPANY_ID } })) ??
      (await prisma.company.findFirst({ orderBy: { createdAt: "asc" } }));
  }
  if (!company) {
    throw new Error("В БД нет ни одной компании — сначала создайте компанию.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    const employeeNumber = await nextEmployeeNumberForCompany(tx, company.id);
    await tx.user.create({
      data: {
        fullName: fullName || "Администратор",
        email,
        passwordHash,
        role: "ADMIN",
        companyId: company.id,
        employeeNumber,
      },
    });
  });
  console.log(`✓ Создан админ ${email} (компания: ${company.name}).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    await prisma.$disconnect();
    process.exit(1);
  });
