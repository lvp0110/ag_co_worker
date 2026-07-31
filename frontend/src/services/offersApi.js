import { request } from "./apiClient.js";
import { upsertKpDocumentFromOnec } from "../stores/kpOnecDocumentsStore.js";
import { buildOnecDocumentBody } from "../utils/onecDocumentMapper.js";
import { getCsrfToken, isCrossOriginAuth, session } from "./authApi.js";

/**
 * КП этого проекта: документ изоляции в 1С.
 *
 * - Локально / prod за nginx: POST /api/offers → наш backend → 1С.
 * - GitHub Pages (VITE_ONEC_DOCUMENT_DIRECT): сразу
 *   POST /integration/onec/isolation/document на auth/1С (:3005).
 */

const ONEC_DOCUMENT_PATH = "/integration/onec/isolation/document";
const useOnecDirect =
  String(import.meta.env.VITE_ONEC_DOCUMENT_DIRECT || "").toLowerCase() ===
  "true";

const logOnecResponse = (label, onec) => {
  if (onec === undefined || onec === null) return;
  if (onec.error && !onec.data?.document_id) {
    console.error(`[onec] ${label} → ошибка (code=${onec.code}):`, onec);
    return;
  }
  console.log(`[onec] ${label} → code=${onec.code}:`, onec.data ?? onec);
};

const csrfHeaders = async () => {
  const token = await getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
};

/**
 * Нормализует ответ к форме /api/offers:
 * { code, data: { document_id, user_email }, error, id }
 */
const normalizeOnecCreateResponse = (onec) => {
  const document_id = String(onec?.data?.document_id ?? onec?.id ?? "").trim();
  return {
    code: onec?.code,
    data: {
      document_id,
      user_email: String(onec?.data?.user_email ?? "").trim(),
    },
    error: onec?.error,
    id: document_id || undefined,
  };
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

/** Создание КП напрямую в 1С (auth-сервис). */
const createKpViaOnecDocument = async ({ constructions }) => {
  await assertLiveSession();
  const headers = await csrfHeaders();
  let onec;
  try {
    onec = await request(ONEC_DOCUMENT_PATH, {
      method: "POST",
      headers,
      body: buildOnecDocumentBody(constructions),
    });
  } catch (err) {
    // Auth часто отвечает HTTP 404 при отсутствии session-cookie.
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
  if (!saved) {
    const err = new Error(body?.error || "1С не вернула document_id");
    err.body = body;
    throw err;
  }
  return { ...body, id: saved.document_id, document: saved };
};

/** Создание КП через наш backend POST /api/offers. */
const createKpViaBackendOffers = async ({ constructions }) => {
  const headers = await csrfHeaders();
  const body = await request("/api/offers", {
    method: "POST",
    headers,
    body: { constructions },
  });
  logOnecResponse("POST /api/offers", body);
  const saved = upsertKpDocumentFromOnec(body);
  if (!saved) {
    const err = new Error(body?.error || "1С не вернула document_id");
    err.body = body;
    throw err;
  }
  return { ...body, id: saved.document_id, document: saved };
};

/**
 * @param {{ constructions: Array<{ calc_params: object }> }} args
 */
export const createKpFromCalc = async ({ constructions }) => {
  console.log(
    `[kp] create → ${constructions.length} constr → ${
      useOnecDirect ? ONEC_DOCUMENT_PATH : "/api/offers"
    }`
  );
  if (useOnecDirect) {
    return createKpViaOnecDocument({ constructions });
  }
  return createKpViaBackendOffers({ constructions });
};
