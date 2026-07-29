import dotenv from "dotenv";

dotenv.config();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * CORS_ORIGIN — строка или список через запятую (например: "http://localhost:5175,http://localhost:5176").
 * В dev у Vite порт 5173 по умолчанию, но он автоинкрементит на 5174+, если занят,
 * поэтому разрешаем сразу оба.
 */
const parseOrigins = (value: string | undefined, fallback: string[]): string[] => {
  const raw = value ?? "";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 3007),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5435/ag_co_worker?schema=public",
  corsOrigin: parseOrigins(process.env.CORS_ORIGIN, [
    "http://localhost:5175",
    "http://localhost:5176",
  ]),
  calcServiceUrl:
    process.env.CALC_SERVICE_URL ?? "https://dev3.constrtodo.ru:3005",
  // AllIsolationConstr на dev3 может отвечать 25–35s; 15s давало обрыв chunked-тела.
  calcServiceTimeoutMs: toInt(process.env.CALC_SERVICE_TIMEOUT_MS, 60000),
  /** Внешний auth (POST /login, GET /auth/session, POST /auth/logout). */
  authServiceUrl: process.env.AUTH_SERVICE_URL ?? "http://localhost:3005",
  /**
   * Выгрузка документов в 1С (POST/PUT /integration/onec/isolation/document).
   * Тот же сервис, что и auth: ручка авторизует по той же session-cookie,
   * поэтому по умолчанию наследуем AUTH_SERVICE_URL.
   */
  onecServiceUrl:
    process.env.ONEC_SERVICE_URL ??
    process.env.AUTH_SERVICE_URL ??
    "http://localhost:3005",
  // Ручка сама считает материалы по конструкциям, поэтому таймаут как у calc.
  onecTimeoutMs: toInt(process.env.ONEC_TIMEOUT_MS, 60000),
  onecExportEnabled: (process.env.ONEC_EXPORT_ENABLED ?? "true") !== "false",
  /**
   * Реквизиты организации для шапки и колонтитулов КП/PDF.
   *
   * Раньше лежали в таблице `companies` и правились в админке. Сотрудник теперь
   * привязан к отделу внешнего auth-сервиса (`department_id`), а реквизитов тот
   * не отдаёт вообще — только id и название отдела. Поэтому единственный
   * источник правды здесь; пустое значение просто не выводится в PDF.
   */
  kpCompany: {
    name: process.env.KP_COMPANY_NAME ?? "ООО «Шуманет Шоп»",
    address:
      process.env.KP_COMPANY_ADDRESS ??
      "115054, Москва г, Новокузнецкая ул, дом 33, строение 2",
    phone: process.env.KP_COMPANY_PHONE ?? "",
    ogrn: process.env.KP_COMPANY_OGRN ?? "1177746342157",
    ogrnip: process.env.KP_COMPANY_OGRNIP ?? "",
    kpp: process.env.KP_COMPANY_KPP ?? "770501001",
    inn: process.env.KP_COMPANY_INN ?? "9705093593",
    /**
     * Путь к файлу логотипа для шапки PDF (PNG/JPEG/WebP), абсолютный или
     * относительно cwd backend'а. Пусто → шапка без картинки.
     */
    logoFile: process.env.KP_COMPANY_LOGO_FILE ?? "",
  },
};

if (env.nodeEnv === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
