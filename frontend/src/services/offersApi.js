import { request, requestRawResponse } from "./apiClient.js";

/**
 * POST /api/offers — { form, offerDraft } → полный Offer DTO c пересчитанными materials.
 * form          — метаданные КП (title, manager_name, region, ...)
 * offerDraft    — { constructions: [{ calc_params, materials?, montage? }], services?: [...] }
 */
export const createOffer = (payload) =>
  request("/api/offers", { method: "POST", body: payload });

/**
 * GET /api/offers — постраничный список офферов (метаданные, без конструкций).
 * Возвращает { items, total, page, limit, pages }.
 * `q` — поиск по номеру КП или названию объекта.
 * `date` — фильтр по дате КП (YYYY-MM-DD или DD.MM.YYYY).
 */
export const listOffers = ({ page = 1, limit = 20, q = "", date = "" } = {}) => {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  const query = typeof q === "string" ? q.trim() : "";
  if (query) qs.set("q", query);
  const dateFilter = typeof date === "string" ? date.trim() : "";
  if (dateFilter) qs.set("date", dateFilter);
  return request(`/api/offers?${qs}`, { method: "GET" });
};

/** GET /api/offers/:id — оффер с пересчитанными материалами и наложенными override. */
export const getOffer = (id) => request(`/api/offers/${encodeURIComponent(id)}`, { method: "GET" });

/** PATCH /api/offers/:id — частичное обновление (form?, services?, constructions?, total_cost?). */
export const updateOffer = (id, patch) =>
  request(`/api/offers/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });

/** POST /api/offers/:id/clone — дубликат, возвращает { id } нового оффера. */
export const cloneOffer = (id) =>
  request(`/api/offers/${encodeURIComponent(id)}/clone`, { method: "POST" });

/** DELETE /api/offers/:id — удалить оффер. 204 без тела. */
export const deleteOffer = (id) =>
  request(`/api/offers/${encodeURIComponent(id)}`, { method: "DELETE" });

/**
 * GET /api/offers/:id/pdf — генерирует PDF КП на бэке, возвращает { blob, filename }
 * без скачивания (для предпросмотра).
 *
 * `printParams` — транзитные параметры печати (в БД не сохраняются, уходят
 * query-строкой, влияют только на текст PDF). Имена ключей = имена query-
 * параметров бэка: recipient («кому адресовано», вступление), payment_schedule,
 * delivery_method, warehouse, offer_validity (блок условий). Пустые/пробельные
 * значения не отправляются — бэк подставит дефолт.
 *
 * Не идём через общий request()/parseResponse: тот ждёт JSON, а нам нужен
 * Blob. credentials: 'include' — httpOnly cookie уйдут как обычно. Имя файла
 * берём из Content-Disposition (RFC 5987 filename* для кириллицы); если бэк
 * не отдал — используем дефолт.
 */
export async function fetchOfferPdf(id, fallbackFilename = "КП.pdf", printParams = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(printParams)) {
    const trimmed = (value ?? "").trim();
    if (trimmed !== "") search.set(key, trimmed);
  }
  const query = search.toString() ? `?${search.toString()}` : "";
  const response = await requestRawResponse(
    `/api/offers/${encodeURIComponent(id)}/pdf${query}`,
    {
      method: "GET",
      headers: { accept: "application/pdf" },
    }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      text ? `PDF generation failed: ${text}` : `PDF generation failed (HTTP ${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const filename = parseFilenameFromContentDisposition(
    response.headers.get("content-disposition")
  ) || fallbackFilename;
  return { blob, filename };
}

/** Скачать уже полученный PDF-blob (после предпросмотра). */
export function savePdfBlob(blob, filename) {
  triggerBlobDownload(blob, filename);
}

/**
 * GET /api/offers/:id/pdf — генерирует PDF и сразу скачивает (без предпросмотра).
 */
export async function downloadOfferPdf(id, fallbackFilename = "КП.pdf", printParams = {}) {
  const { blob, filename } = await fetchOfferPdf(id, fallbackFilename, printParams);
  triggerBlobDownload(blob, filename);
}

function parseFilenameFromContentDisposition(header) {
  if (!header) return "";
  // RFC 5987: filename*=UTF-8''<url-encoded>
  const star = /filename\*=([^;]+)/i.exec(header);
  if (star) {
    const value = star[1].trim();
    const m = /^[Uu][Tt][Ff]-8''(.+)$/.exec(value);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : "";
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Освобождаем URL чуть позже — некоторые браузеры дёргают его асинхронно.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
