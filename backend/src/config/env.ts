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
  corsOrigin: parseOrigins(process.env.CORS_ORIGIN, [
    "http://localhost:5175",
    "http://localhost:5176",
  ]),
  calcServiceUrl:
    process.env.CALC_SERVICE_URL ?? "http://localhost:3005",
  // AllIsolationConstr может отвечать 25–35s; 15s давало обрыв chunked-тела.
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
};
