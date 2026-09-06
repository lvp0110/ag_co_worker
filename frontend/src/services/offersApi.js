import { request } from "./apiClient.js";
import {
  invalidateKpListCache,
  getKpDocument,
  removeKpDocument,
  upsertKpDocumentFromOnec,
} from "../stores/kpOnecDocumentsStore.js";
import { useCalculatorStore } from "../stores/calculatorStore.js";
import {
  buildOnecDocumentBody,
  mapOnecDetailToCalcState,
} from "../utils/onecDocumentMapper.js";
import { buildIsolationCalcRequestFromStored } from "../utils/isolationCalcV2.js";
import { calculateIsolationByConstruction } from "./constructionApi.js";
import { getCsrfToken, isCrossOriginAuth, session } from "./authApi.js";
import { ensurePriceDataLoaded, getPriceState } from "./priceApi.js";

/**
 * КП через 1C integration documents (auth :3005), без нашего backend:
 *   POST   /integration/onec/isolation/document           — создать
 *   PUT    /integration/onec/isolation/document           — обновить
 *   DELETE /integration/onec/isolation/documents/{id}     — удалить (если ещё не в 1С)
 *   GET    /integration/onec/isolation/documents          — список
 *   GET    /integration/onec/isolation/documents/{id}     — детали
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

/** Непустая строка или "". */
const nonEmpty = (value) => {
  const s = String(value ?? "").trim();
  return s || "";
};

/**
 * Ответ create → форма для навигации и стора.
 * data.id — локальный id (GET/DELETE /documents/{id});
 * data.document_id — id для PUT (GetByOneCDocumentID).
 */
const normalizeOnecCreateResponse = (onec) => {
  const data = onec?.data && typeof onec.data === "object" ? onec.data : {};
  const localId = nonEmpty(data.id);
  const onecDocumentId = nonEmpty(data.document_id);
  const id = localId || onecDocumentId;
  return {
    code: onec?.code,
    data: {
      id: id || undefined,
      document_id: onecDocumentId || id || undefined,
      onec_document_id: onecDocumentId || undefined,
      document_number: nonEmpty(data.document_number),
      status: nonEmpty(data.status),
      user_email: nonEmpty(data.user_email),
      user_name: nonEmpty(data.user_name),
    },
    error: onec?.error,
    id: id || undefined,
  };
};

/** OneCDocumentSummary → запись списка. */
export const mapOnecDocumentSummary = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const id = nonEmpty(raw.id);
  if (!id) return null;
  const onecDocumentId = nonEmpty(raw.onec_document_id);
  return {
    id,
    document_id: onecDocumentId || id,
    onec_document_id: onecDocumentId,
    document_number: nonEmpty(raw.onec_document_number),
    status: nonEmpty(raw.status),
    user_email: nonEmpty(raw.user_email),
    user_name: nonEmpty(raw.user_name),
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,
    synced_at: raw.synced_at ?? null,
    last_error_code: nonEmpty(raw.last_error_code),
    last_error_message: nonEmpty(raw.last_error_message),
  };
};

const normalizeOnecDocumentDetail = (onec) => {
  const data = onec?.data && typeof onec.data === "object" ? onec.data : null;
  if (!data) return null;
  const id = nonEmpty(data.id);
  if (!id) return null;
  const onecDocumentId = nonEmpty(data.onec_document_id);
  return {
    id,
    document_id: onecDocumentId || id,
    onec_document_id: onecDocumentId,
    document_number: nonEmpty(data.onec_document_number),
    status: nonEmpty(data.status),
    user_email: nonEmpty(data.user_email),
    user_name: nonEmpty(data.user_name),
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
    synced_at: data.synced_at ?? null,
    constructions: Array.isArray(data.constructions) ? data.constructions : [],
    materials: Array.isArray(data.materials) ? data.materials : [],
    request_payload_json: data.request_payload_json ?? null,
    response_payload_json: data.response_payload_json ?? null,
    last_error_code: nonEmpty(data.last_error_code),
    last_error_message: nonEmpty(data.last_error_message),
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

/**
 * GET /integration/onec/isolation/documents/{id}
 */
export const fetchKpDocumentDetail = async (documentId) => {
  const id = String(documentId || "").trim();
  if (!id) {
    const err = new Error("Не указан id документа КП");
    err.status = 400;
    throw err;
  }
  const path = `${ONEC_DOCUMENTS_PATH}/${encodeURIComponent(id)}`;
  let onec;
  try {
    onec = await request(path, { method: "GET" });
  } catch (err) {
    if (err?.status === 404 || err?.status === 401) {
      const e = new Error(
        err?.status === 404
          ? "Документ КП не найден"
          : "Нет сессии — войдите снова"
      );
      e.body = err?.body;
      e.status = err?.status;
      e.url = err?.url;
      throw e;
    }
    throw err;
  }
  logOnecResponse(`GET ${path}`, onec);
  const detail = normalizeOnecDocumentDetail(onec);
  if (!detail) {
    const err = new Error(onec?.error || "Пустой ответ detail КП");
    err.body = onec;
    throw err;
  }
  return detail;
};

/**
 * Загрузить конструкции КП в калькулятор + пересчитать материалы.
 * @param {string} documentId — локальный id из списка / create
 * @param {object} [prefetchedDetail] — уже загруженный GET detail
 */
export const loadKpDocumentIntoCalculator = async (
  documentId,
  prefetchedDetail
) => {
  const detail =
    prefetchedDetail?.id === String(documentId || "").trim()
      ? prefetchedDetail
      : await fetchKpDocumentDetail(documentId);
  const { constrToCalc, constrToCalcToSent } = mapOnecDetailToCalcState(detail);
  console.log(
    `[kp] load into calc → id=${detail.id} constr=${constrToCalc.length}`
  );

  const materialsByConstruction = [];
  await ensurePriceDataLoaded();
  const region =
    useCalculatorStore.getState().calcRegion ||
    getPriceState().selectedRegion ||
    "";
  for (let i = 0; i < constrToCalcToSent.length; i++) {
    const sent = constrToCalcToSent[i];
    const key_id = constrToCalc[i]?.key_id;
    try {
      const requestItem = buildIsolationCalcRequestFromStored(sent);
      const result = await calculateIsolationByConstruction(
        [requestItem],
        region
      );
      materialsByConstruction.push({
        key_id,
        data: result?.data ?? [],
      });
    } catch (err) {
      console.warn(`[kp] recalc materials failed for ${sent?.Code}:`, err);
      materialsByConstruction.push({ key_id, data: [] });
    }
  }

  useCalculatorStore.getState().loadKpEditState({
    constrToCalc,
    constrToCalcToSent,
    materialsByConstruction,
    tableConstrToCalc: constrToCalc.length ? {} : null,
    activeKpId: detail.id,
  });

  upsertKpDocumentFromOnec({ data: detail });
  return detail;
};

const putDocumentOnce = async (putDocumentId, constructions, localId) => {
  const requestBody = {
    ...buildOnecDocumentBody(constructions),
    document_id: putDocumentId,
  };
  console.log(
    `[kp] update → local=${localId} put_document_id=${putDocumentId} constr=${requestBody.constructions.length} → PUT ${ONEC_DOCUMENT_PATH}`
  );
  console.log("[kp] update body →", JSON.parse(JSON.stringify(requestBody)));
  const headers = await csrfHeaders();
  const onec = await request(ONEC_DOCUMENT_PATH, {
    method: "PUT",
    headers,
    body: requestBody,
  });
  logOnecResponse(`PUT ${ONEC_DOCUMENT_PATH}`, onec);
  if (
    onec?.error &&
    !nonEmpty(onec?.data?.document_id) &&
    !nonEmpty(onec?.data?.id)
  ) {
    const err = new Error(onec.error || "Ошибка обновления КП");
    err.body = onec;
    err.status = onec.code;
    throw err;
  }
  const body = normalizeOnecCreateResponse(onec);
  if (!body.id) body.id = localId;
  if (!body.data.id) body.data.id = localId;
  if (!body.data.onec_document_id) body.data.onec_document_id = putDocumentId;
  if (!body.data.document_id) body.data.document_id = putDocumentId;
  upsertKpDocumentFromOnec(body);
  invalidateKpListCache();
  return { ...body, id: body.id || localId, mode: "update" };
};

/** POST .../documents/{id}/retry — повторная синхронизация с 1С. */
export const retryKpDocumentSync = async (documentId) => {
  const id = nonEmpty(documentId);
  if (!id) {
    const err = new Error("Не указан id документа КП");
    err.status = 400;
    throw err;
  }
  const path = `${ONEC_DOCUMENTS_PATH}/${encodeURIComponent(id)}/retry`;
  console.log(`[kp] retry sync → POST ${path}`);
  await assertLiveSession();
  const headers = await csrfHeaders();
  const onec = await request(path, { method: "POST", headers });
  logOnecResponse(`POST ${path}`, onec);
  return onec;
};

const resolveOnecDocumentId = (detail, stored, localId) =>
  nonEmpty(detail?.onec_document_id) ||
  nonEmpty(stored?.onec_document_id) ||
  (nonEmpty(detail?.document_id) !== localId
    ? nonEmpty(detail?.document_id)
    : "") ||
  (nonEmpty(stored?.document_id) !== localId
    ? nonEmpty(stored?.document_id)
    : "");

/**
 * Обновить КП.
 * 1) PUT по onec_document_id (GetByOneCDocumentID), если он есть.
 * 2) Иначе retry sync → снова PUT.
 * 3) Иначе (sync_error / нет onec id): DELETE локального + POST новый
 *    (swagger: удалять можно документы, ещё не успешно сохранённые в 1С).
 *
 * @param {{ documentId: string, constructions: Array<{ calc_params: object }> }} args
 */
export const updateKpFromCalc = async ({ documentId, constructions }) => {
  const localId = nonEmpty(documentId);
  if (!localId) {
    const err = new Error("id документа обязателен для обновления КП");
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(constructions) || constructions.length === 0) {
    const err = new Error("Нет конструкций для сохранения");
    err.status = 400;
    throw err;
  }

  await assertLiveSession();

  const stored = getKpDocument(localId);
  let detail = null;
  try {
    detail = await fetchKpDocumentDetail(localId);
  } catch (err) {
    console.warn("[kp] update: detail prefetch failed, using store", err);
  }

  let putDocumentId = resolveOnecDocumentId(detail, stored, localId);

  // Нет onec id — пробуем дожать синхронизацию.
  if (!putDocumentId) {
    console.log(
      `[kp] update: no onec_document_id (status=${detail?.status || stored?.status || "?"}), trying retry`
    );
    try {
      await retryKpDocumentSync(localId);
      detail = await fetchKpDocumentDetail(localId);
      putDocumentId = resolveOnecDocumentId(detail, getKpDocument(localId), localId);
    } catch (err) {
      console.warn("[kp] update: retry failed", err);
    }
  }

  if (putDocumentId) {
    try {
      return await putDocumentOnce(putDocumentId, constructions, localId);
    } catch (err) {
      const apiError = nonEmpty(err?.body?.error);
      if (err?.status === 401) {
        const e = new Error("Нет сессии — войдите снова.");
        e.body = err?.body;
        e.status = 401;
        e.url = err?.url;
        throw e;
      }
      const canFallback =
        err?.status === 404 ||
        /GetByOneCDocumentID|not found/i.test(apiError);
      if (!canFallback) throw err;
      console.warn(
        "[kp] update: PUT failed, falling back to delete+create",
        err
      );
    }
  }

  // Fallback для sync_error / без onec_document_id: пересоздать документ.
  console.log(
    `[kp] update fallback → DELETE ${localId} + POST new (${constructions.length} constr)`
  );
  try {
    await deleteKpDocument(localId);
  } catch (err) {
    // Если удалить нельзя — всё равно пробуем создать новый.
    console.warn("[kp] update fallback: delete failed, still creating", err);
    removeKpDocument(localId);
    invalidateKpListCache();
  }

  const created = await createKpFromCalc({ constructions });
  return { ...created, id: created.id, mode: "recreate", replacedId: localId };
};

/**
 * Удалить КП: DELETE /integration/onec/isolation/documents/{id}
 * Swagger: только документы, ещё не успешно сохранённые в 1С.
 */
export const deleteKpDocument = async (documentId) => {
  const id = String(documentId || "").trim();
  if (!id) {
    const err = new Error("Не указан id документа КП");
    err.status = 400;
    throw err;
  }
  const path = `${ONEC_DOCUMENTS_PATH}/${encodeURIComponent(id)}`;
  console.log(`[kp] delete → DELETE ${path}`);
  await assertLiveSession();
  const headers = await csrfHeaders();
  let onec;
  try {
    onec = await request(path, { method: "DELETE", headers });
  } catch (err) {
    if (err?.status === 404) {
      const e = new Error(
        "Документ не найден или уже удалён / синхронизирован с 1С"
      );
      e.body = err?.body;
      e.status = 404;
      e.url = err?.url;
      throw e;
    }
    if (err?.status === 401) {
      const e = new Error("Нет сессии — войдите снова");
      e.body = err?.body;
      e.status = 401;
      e.url = err?.url;
      throw e;
    }
    throw err;
  }
  logOnecResponse(`DELETE ${path}`, onec);
  if (onec?.error) {
    const err = new Error(
      onec.error ||
        "Не удалось удалить КП (возможно, документ уже сохранён в 1С)"
    );
    err.body = onec;
    err.status = onec.code;
    throw err;
  }
  removeKpDocument(id);
  invalidateKpListCache();
  return onec;
};
