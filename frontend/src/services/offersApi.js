import { request } from "./apiClient.js";
import { upsertKpDocumentFromOnec } from "../stores/kpOnecDocumentsStore.js";
import { buildOnecDocumentBody } from "../utils/onecDocumentMapper.js";
import { getCsrfToken, isCrossOriginAuth, session } from "./authApi.js";

/**
 * КП через 1C integration documents (auth :3005), без нашего backend:
 *   POST /integration/onec/isolation/document  — создать
 *   GET  /integration/onec/isolation/documents — список «Мои КП»
 *
 * Same-origin: Vite / server.js проксируют /integration → AUTH.
 */

const ONEC_DOCUMENT_PATH = "/integration/onec/isolation/document";
const ONEC_DOCUMENTS_PATH = "/integration/onec/isolation/documents";

const logOnecResponse = (label, onec) => {
  if (onec === undefined || onec === null) return;
  if (onec.error && !onec.data?.document_id && !onec.data?.id) {
    console.error(`[onec] ${label} → ошибка (code=${onec.code}):`, onec);
    return;
  }
  console.log(`[onec] ${label} → code=${onec.code}:`, onec.data ?? onec);
};

const csrfHeaders = async () => {
  const token = await getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
};

/** Перед КП убеждаемся, что cookie-сессия жива (иначе auth отвечает 404). */
const assertLiveSession = async () => {
  const live = await session();
  if (live?.user) return live;
  const hint = isCrossOriginAuth()
    ? " На GitHub Pages нужны cookies SameSite=None; Secure у auth, либо работайте через make dev."
    : "";
  const err = new Error(`Нет активной сессии auth. Войдите снова.${hint}`);
  err.status = 401;
  throw err;
};

/**
 * Ответ create → форма для навигации и стора.
 * Prefer local `data.id` (для GET/DELETE), иначе document_id из 1С.
 */
const normalizeOnecCreateResponse = (onec) => {
  const data = onec?.data && typeof onec.data === "object" ? onec.data : {};
  const localId = String(data.id ?? "").trim();
  const document_id = String(data.document_id ?? localId).trim();
  const id = localId || document_id;
  return {
    code: onec?.code,
    data: {
      id: id || undefined,
      document_id,
      document_number: String(data.document_number ?? "").trim(),
      status: String(data.status ?? "").trim(),
      user_email: String(data.user_email ?? "").trim(),
      user_name: String(data.user_name ?? "").trim(),
    },
    error: onec?.error,
    id: id || undefined,
  };
};

/** OneCDocumentSummary → запись списка. */
export const mapOnecDocumentSummary = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const onecId = String(raw.onec_document_id ?? "").trim();
  return {
    id,
    document_id: onecId || id,
    document_number: String(raw.onec_document_number ?? "").trim(),
    status: String(raw.status ?? "").trim(),
    user_email: String(raw.user_email ?? "").trim(),
    user_name: String(raw.user_name ?? "").trim(),
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,
    synced_at: raw.synced_at ?? null,
    last_error_code: String(raw.last_error_code ?? "").trim(),
    last_error_message: String(raw.last_error_message ?? "").trim(),
  };
};

/**
 * Создание КП: POST /integration/onec/isolation/document
 * @param {{ constructions: Array<{ calc_params: object }> }} args
 */
export const createKpFromCalc = async ({ constructions }) => {
  const requestBody = buildOnecDocumentBody(constructions);
  console.log(
    `[kp] create → ${requestBody.constructions.length} constr → POST ${ONEC_DOCUMENT_PATH}`
  );
  console.log("[kp] create body →", JSON.parse(JSON.stringify(requestBody)));
  await assertLiveSession();
  const headers = await csrfHeaders();
  let onec;
  try {
    onec = await request(ONEC_DOCUMENT_PATH, {
      method: "POST",
      headers,
      body: requestBody,
    });
  } catch (err) {
    if (err?.status === 404 || err?.status === 401) {
      const e = new Error(
        "1С/auth вернули 404 — нет cookie сессии. Войдите снова." +
          (isCrossOriginAuth()
            ? " С github.io cookies не доходят без SameSite=None на auth."
            : "")
      );
      e.body = err?.body;
      e.status = err?.status;
      e.url = err?.url;
      throw e;
    }
    throw err;
  }
  logOnecResponse(`POST ${ONEC_DOCUMENT_PATH}`, onec);
  const body = normalizeOnecCreateResponse(onec);
  const saved = upsertKpDocumentFromOnec(body);
  if (!saved?.id && !saved?.document_id) {
    const err = new Error(body?.error || "1С не вернула id документа");
    err.body = body;
    throw err;
  }
  return { ...body, id: saved.id || saved.document_id, document: saved };
};

/**
 * Список «Мои КП»: GET /integration/onec/isolation/documents
 * Сессию не проверяем отдельно — cookie уйдёт с запросом; 401 обработает apiClient.
 * @returns {Promise<Array<ReturnType<typeof mapOnecDocumentSummary>>>}
 */
export const fetchMyKpDocuments = async () => {
  let onec;
  try {
    onec = await request(ONEC_DOCUMENTS_PATH, { method: "GET" });
  } catch (err) {
    if (err?.status === 404 || err?.status === 401) {
      const e = new Error(
        "Не удалось загрузить список КП — нет cookie сессии. Войдите снова."
      );
      e.body = err?.body;
      e.status = err?.status;
      e.url = err?.url;
      throw e;
    }
    throw err;
  }
  logOnecResponse(`GET ${ONEC_DOCUMENTS_PATH}`, onec);
  const rows = Array.isArray(onec?.data) ? onec.data : null;
  if (rows === null) {
    const err = new Error(onec?.error || "Не удалось загрузить список КП");
    err.body = onec;
    err.status = onec?.code;
    throw err;
  }
  return rows.map(mapOnecDocumentSummary).filter(Boolean);
};
