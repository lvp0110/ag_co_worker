import { request } from "./apiClient.js";
import { upsertKpDocumentFromOnec } from "../stores/kpOnecDocumentsStore.js";

/**
 * Ответ 1С: { code, data: { document_id, user_email }, error }.
 * Успех — есть data.document_id (обычно code === 200).
 */

const logOnecResponse = (label, onec) => {
  if (onec === undefined || onec === null) return;
  if (onec.error && !onec.data?.document_id) {
    console.error(`[onec] ${label} → ошибка (code=${onec.code}):`, onec);
    return;
  }
  console.log(`[onec] ${label} → code=${onec.code}:`, onec.data ?? onec);
};

/**
 * POST /api/offers — создать документ в 1С по конструкциям калькулятора.
 * Body: { constructions: [{ calc_params }] }
 * → { code, data: { document_id, user_email }, error, id }
 */
export const createKpFromCalc = async ({ constructions }) => {
  if (import.meta.env.DEV) {
    console.log(
      `[kp] POST /api/offers → ${constructions.length} constr → 1С:`,
      constructions.map((c) => c.calc_params),
    );
  }
  const body = await request("/api/offers", {
    method: "POST",
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
