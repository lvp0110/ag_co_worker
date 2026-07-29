/**
 * Клиентское хранилище КП из ответов 1С (без локальной БД).
 * Ключ sessionStorage — на вкладку; список = только успешно созданные документы.
 */

const STORAGE_KEY = "ag_kp_onec_docs_v1";

const isDoc = (v) =>
  v &&
  typeof v === "object" &&
  typeof v.document_id === "string" &&
  v.document_id.trim() !== "";

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

export const listKpDocuments = () => readAll();

export const getKpDocument = (documentId) => {
  const id = String(documentId || "").trim();
  if (!id) return null;
  return readAll().find((d) => String(d.document_id) === id) ?? null;
};

/** Добавляет/обновляет документ из ответа 1С; возвращает нормализованную запись. */
export const upsertKpDocumentFromOnec = (onec) => {
  const document_id = String(onec?.data?.document_id ?? onec?.id ?? "").trim();
  if (!document_id) return null;
  const user_email = String(onec?.data?.user_email ?? "").trim();
  const existing = readAll().find((d) => String(d.document_id) === document_id);
  const next = {
    document_id,
    user_email,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  const rest = readAll().filter((d) => String(d.document_id) !== document_id);
  writeAll([next, ...rest]);
  return next;
};

export const removeKpDocument = (documentId) => {
  const id = String(documentId || "").trim();
  writeAll(readAll().filter((d) => String(d.document_id) !== id));
};
