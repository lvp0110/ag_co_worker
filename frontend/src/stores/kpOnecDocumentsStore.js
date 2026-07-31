/**
 * Клиентское хранилище КП из ответов 1С (без локальной БД).
 * Ключ sessionStorage — на вкладку; список = только успешно созданные документы.
 * constructions — то, что ушло в POST /api/offers (для карточки КП).
 */

const STORAGE_KEY = "ag_kp_onec_docs_v2";

const isDoc = (v) =>
  v &&
  typeof v === "object" &&
  typeof v.document_id === "string" &&
  v.document_id.trim() !== "";

const normalizeConstructions = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      calc_params:
        c.calc_params && typeof c.calc_params === "object" ? c.calc_params : c,
    }));
};

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

/**
 * Добавляет/обновляет документ из ответа 1С.
 * @param {object} onec — тело ответа { code, data: { document_id, user_email } }
 * @param {{ constructions?: Array }} [extra]
 */
export const upsertKpDocumentFromOnec = (onec, extra = {}) => {
  const document_id = String(onec?.data?.document_id ?? onec?.id ?? "").trim();
  if (!document_id) return null;
  const user_email = String(onec?.data?.user_email ?? "").trim();
  const existing = readAll().find((d) => String(d.document_id) === document_id);
  const fromExtra = normalizeConstructions(extra.constructions);
  const constructions =
    fromExtra.length > 0
      ? fromExtra
      : Array.isArray(existing?.constructions)
        ? existing.constructions
        : [];
  const next = {
    document_id,
    user_email,
    constructions,
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
