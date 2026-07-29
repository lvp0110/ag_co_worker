import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

/**
 * Выгрузка документа расчёта звукоизоляции в 1С.
 *
 * POST /integration/onec/isolation/document — создать документ (без document_id:
 *   id выдаёт 1С в ответе `data.document_id`),
 * PUT  /integration/onec/isolation/document — обновить существующий.
 * Ручка не идемпотентна: повторный POST с тем же document_id создаёт документ
 * заново, поэтому правки КП уходят строго через PUT.
 *
 * В body только геометрия конструкций (`models.Construction`) + `document_id`
 * на обновлении. НЕ отправляем: форму КП, услуги, доп. материалы, kp_settings,
 * montage, materials / override цен (KpPrice*). Материалы 1С считает сама.
 *
 * Авторизация — session-cookie пользователя (та же, что у GET /auth/session),
 * поэтому Cookie входящего запроса пробрасывается насквозь; в ответе сервис
 * возвращает `user_email`, к которому привязал документ.
 */

const DOCUMENT_PATH = "/integration/onec/isolation/document";

/**
 * Дублируем вывод в logs/onec.log: stdout dev-сервера смешан с vite и легко
 * теряется, а файл можно читать через `tail -f` независимо от терминала.
 */
const LOG_FILE = path.resolve(process.cwd(), "logs/onec.log");

const logOnec = (line: string): void => {
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Файловый лог — необязательная диагностика, ошибки записи игнорируем.
  }
};

interface OnecOpening {
  Area: number;
  Type: string;
  lenX: number;
  lenZ: number;
}

/** Контракт `models.Construction` внешнего сервиса — camelCase и только int. */
interface OnecConstruction {
  addCeilShift: number;
  area: number;
  code: string;
  dframe: boolean;
  lenX: number;
  lenY: number;
  lenZ: number;
  openings: OnecOpening[];
  perimeter: number;
  step: number;
}

export interface OnecExportData {
  document_id?: string;
  user_email?: string;
}

/**
 * Ответ 1С в том же виде, что отдаёт внешний сервис (`swagger.OneCExportResponse`),
 * и который мы прокидываем на фронт в поле `onec` DTO оффера.
 * `code: 0` — выгрузка не выполнялась (отключена или нечего отправлять).
 */
export interface OnecExportResponse {
  code: number;
  data?: OnecExportData;
  error?: string;
}

/**
 * Мутации внешнего сервиса защищены double-submit CSRF: значение читаемой
 * cookie `csrf_token` должно прийти ещё и заголовком `X-CSRF-Token`
 * (см. logout в frontend/src/services/authApi.js). Браузер шлёт нашему backend
 * только cookie, поэтому заголовок восстанавливаем из неё сами.
 */
const readCsrfFromCookie = (cookieHeader: string): string => {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "csrf_token") return decodeURIComponent(rest.join("="));
  }
  return "";
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Наши calcParams — PascalCase, но читаем и camelCase: JSONB не валидируется. */
const pick = (source: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
};

const toInt = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const mapOpening = (raw: unknown): OnecOpening => {
  const opening = asRecord(raw);
  const lenX = toInt(pick(opening, "lenX", "LenX"));
  const lenZ = toInt(pick(opening, "lenZ", "LenZ"));
  const area = pick(opening, "Area", "area");
  return {
    // Площадь проёма нам не приходит из калькулятора — выводим из размеров.
    Area: area !== undefined ? toInt(area) : lenX * lenZ,
    Type: String(pick(opening, "Type", "type") ?? ""),
    lenX,
    lenZ,
  };
};

/**
 * calcParams (в БД — JSONB от калькулятора) → `models.Construction`.
 * Наши внутренние поля (SectionId, DisplayTitle, FloorSealant, CeilingMats)
 * отбрасываются: внешний контракт их не знает.
 */
export const mapCalcParamsToOnecConstruction = (
  calcParams: unknown
): OnecConstruction => {
  const params = asRecord(calcParams);
  const openings = pick(params, "Openings", "openings");
  return {
    addCeilShift: toInt(pick(params, "AddCeilShift", "addCeilShift")),
    area: toInt(pick(params, "Area", "area")),
    code: String(pick(params, "Code", "code") ?? ""),
    dframe: Boolean(pick(params, "dframe", "dFrame", "Dframe")),
    lenX: toInt(pick(params, "LenX", "lenX")),
    lenY: toInt(pick(params, "LenY", "lenY")),
    lenZ: toInt(pick(params, "LenZ", "lenZ")),
    openings: Array.isArray(openings) ? openings.map(mapOpening) : [],
    perimeter: toInt(pick(params, "Perimeter", "perimeter")),
    step: toInt(pick(params, "step", "Step")),
  };
};

const sendDocument = async (
  method: "POST" | "PUT",
  documentId: string | undefined,
  calcParamsList: unknown[],
  cookieHeader: string,
  csrfToken: string
): Promise<OnecExportResponse> => {
  const url = `${env.onecServiceUrl.replace(/\/$/, "")}${DOCUMENT_PATH}`;
  // На создании document_id не шлём — его выдаёт 1С; на обновлении обязателен.
  const body: {
    constructions: OnecConstruction[];
    document_id?: string;
  } = {
    constructions: calcParamsList.map(mapCalcParamsToOnecConstruction),
  };
  if (documentId) body.document_id = documentId;

  logOnec(
    `[onec] ${method} ${url} → ${body.constructions.length} constr` +
      (documentId ? ` doc=${documentId}` : " (без document_id)") +
      `:\n` +
      JSON.stringify(body, null, 2)
  );

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        cookie: cookieHeader,
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.onecTimeoutMs),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `1C export timeout after ${env.onecTimeoutMs}ms`
        : `1C export request failed: ${err instanceof Error ? err.message : String(err)}`;
    return { code: 502, error: message };
  }

  // Сервис отвечает HTTP 404 на ошибку авторизации, а реальный код кладёт
  // в тело (`{"code":401,"error":"...missing auth cookie"}`), поэтому
  // ориентируемся на `code` из body, а не на response.status.
  let payload: OnecExportResponse | null = null;
  try {
    payload = (await response.json()) as OnecExportResponse;
  } catch {
    payload = null;
  }

  const code = payload?.code ?? response.status;
  const responseDocumentId = payload?.data?.document_id?.trim();
  return {
    code,
    ...(payload?.data ? { data: payload.data } : {}),
    ...(payload?.error
      ? { error: payload.error }
      : !responseDocumentId && code !== 200
        ? { error: `1C export responded with ${code}` }
        : {}),
  };
};

/**
 * Выгружает документ и ВОЗВРАЩАЕТ ответ 1С — он уходит на фронт в поле `onec`,
 * чтобы КП сразу видело `document_id` / `user_email` либо текст ошибки.
 *
 * На `create` `documentId` не передаём: id выдаёт 1С (`data.document_id`),
 * и им же потом пишется локальный Offer. На `update` — обязателен (PUT).
 *
 * Никогда не бросает: ошибка приезжает как `{code, error}`.
 */
export const exportOfferToOnec = async (options: {
  mode: "create" | "update";
  /** Обязателен для update; для create обычно не передаётся. */
  documentId?: string;
  calcParamsList: unknown[];
  cookieHeader: string | undefined;
  /** `X-CSRF-Token` входящего запроса, если фронт его прислал. */
  csrfToken?: string;
}): Promise<OnecExportResponse> => {
  const { mode, documentId, calcParamsList, cookieHeader } = options;
  // Каждая причина пропуска логируется и возвращается с code: 0 — иначе
  // «ответа нет» невозможно отличить от невызванного экспорта.
  const skip = (reason: string): OnecExportResponse => {
    logOnec(`[onec] ${mode} ${documentId ?? "(new)"} skipped: ${reason}`);
    return { code: 0, error: reason };
  };
  if (!env.onecExportEnabled) return skip("ONEC_EXPORT_ENABLED=false");
  if (!cookieHeader) return skip("no auth cookie in request");
  if (mode === "update" && !documentId) {
    return skip("document_id обязателен для PUT");
  }
  // Пустой список на create всё равно шлём: 1С выдаёт document_id.
  // На update без конструкций выгрузка бессмысленна.
  if (mode === "update" && calcParamsList.length === 0) {
    return skip("конструкций в запросе нет");
  }

  const csrfToken = options.csrfToken || readCsrfFromCookie(cookieHeader);
  if (!csrfToken) return skip("нет csrf_token ни в заголовке, ни в cookie");

  const method = mode === "create" ? "POST" : "PUT";
  const startedAt = Date.now();
  const result = await sendDocument(
    method,
    mode === "create" ? undefined : documentId,
    calcParamsList,
    cookieHeader,
    csrfToken
  );
  const elapsed = Date.now() - startedAt;
  const resolvedId = result.data?.document_id ?? documentId ?? "(unknown)";

  logOnec(
    result.error
      ? `[onec] ${method} ${DOCUMENT_PATH} ${resolvedId} FAIL ${elapsed}ms code=${result.code}: ${result.error}`
      : `[onec] ${method} ${DOCUMENT_PATH} ${resolvedId} OK ${elapsed}ms` +
          (result.data?.user_email ? ` user=${result.data.user_email}` : "") +
          (result.data?.document_id ? ` doc=${result.data.document_id}` : "")
  );

  return result;
};

/**
 * Достаёт `document_id` из ответа 1С. Пустая строка → null.
 */
export const readOnecDocumentId = (
  onec: OnecExportResponse
): string | null => {
  const id = onec.data?.document_id?.trim();
  return id || null;
};
