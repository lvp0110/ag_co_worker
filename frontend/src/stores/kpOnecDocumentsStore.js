/**
 * Клиентский кэш КП из ответов 1С (без локальной БД).
 * Источник правды для списка — GET /integration/onec/isolation/documents;
 * стор кеширует create/навигацию внутри вкладки.
 */

const STORAGE_KEY = "ag_kp_onec_docs_v1";
/** Флаг: список уже успешно загружали в этой вкладке (не дёргать GET при каждом remount). */
const FETCHED_KEY = "ag_kp_onec_list_fetched_v1";

const isDoc = (v) =>
  v &&
  typeof v === "object" &&
  ((typeof v.id === "string" && v.id.trim() !== "") ||
    (typeof v.document_id === "string" && v.document_id.trim() !== ""));

const readAll = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDoc) : [];
  } catch {
    return [];
  }
};

const writeAll = (items) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const docKey = (d) => String(d?.id || d?.document_id || "").trim();

export const listKpDocuments = () => readAll();

/** true, если в этой вкладке уже был успешный GET списка. */
export const wasKpListFetched = () => {
  try {
    return sessionStorage.getItem(FETCHED_KEY) === "1";
  } catch {
    return false;
  }
};

export const markKpListFetched = () => {
  try {
    sessionStorage.setItem(FETCHED_KEY, "1");
  } catch {
    // ignore
  }
};

/** Сбросить флаг — следующий заход на список снова сделает GET (после create). */
export const invalidateKpListCache = () => {
  try {
    sessionStorage.removeItem(FETCHED_KEY);
  } catch {
    // ignore
  }
};

export const getKpDocument = (documentId) => {
  const id = String(documentId || "").trim();
  if (!id) return null;
  return (
    readAll().find(
      (d) => String(d.id) === id || String(d.document_id) === id
    ) ?? null
  );
};

/** Добавляет/обновляет документ из ответа 1С. Не затирает onec_document_id пустым. */
export const upsertKpDocumentFromOnec = (onec) => {
  const data = onec?.data && typeof onec.data === "object" ? onec.data : {};
  const id = String(data.id ?? onec?.id ?? "").trim();
  const incomingOnec = String(
    data.onec_document_id ??
      (data.document_id && String(data.document_id).trim() !== id
        ? data.document_id
        : "") ??
      ""
  ).trim();
  const document_id = String(data.document_id ?? id).trim();
  if (!id && !document_id && !incomingOnec) return null;
  const key = id || document_id || incomingOnec;
  const existing =
    readAll().find((d) => docKey(d) === key) ||
    readAll().find(
      (d) =>
        (id && String(d.id) === id) ||
        (document_id && String(d.document_id) === document_id) ||
        (incomingOnec && String(d.onec_document_id) === incomingOnec)
    );
  const onec_document_id =
    incomingOnec || String(existing?.onec_document_id ?? "").trim();
  const next = {
    id: id || existing?.id || document_id || onec_document_id,
    document_id: onec_document_id || document_id || id,
    onec_document_id: onec_document_id || undefined,
    document_number: String(
      data.document_number ?? existing?.document_number ?? ""
    ).trim(),
    status: String(data.status ?? existing?.status ?? "").trim(),
    user_email: String(data.user_email ?? existing?.user_email ?? "").trim(),
    user_name: String(data.user_name ?? existing?.user_name ?? "").trim(),
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  const rest = readAll().filter(
    (d) =>
      docKey(d) !== docKey(next) &&
      String(d.id) !== String(next.id) &&
      !(next.onec_document_id && d.onec_document_id === next.onec_document_id)
  );
  writeAll([next, ...rest]);
  invalidateKpListCache();
  return next;
};

/** Заменяет кэш списком с сервера (GET documents). */
export const replaceKpDocumentsFromList = (items) => {
  const next = (Array.isArray(items) ? items : []).filter(isDoc);
  writeAll(next);
  markKpListFetched();
  return next;
};

export const removeKpDocument = (documentId) => {
  const id = String(documentId || "").trim();
  writeAll(
    readAll().filter(
      (d) => String(d.id) !== id && String(d.document_id) !== id
    )
  );
};
