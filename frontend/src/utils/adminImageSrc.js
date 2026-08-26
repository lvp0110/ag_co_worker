/** Session-only blob previews after upload in construction card (survive HMR, not reload). */
const previewByFileName = new Map();

export const PUBLIC_IMAGE_PATH_PREFIX = "/api/v2/public/image/";

export const setAdminImageBlobPreview = (fileName, blobUrl) => {
  const key = String(fileName || "").trim();
  if (!key || !blobUrl) return;
  const prev = previewByFileName.get(key);
  if (prev && prev !== blobUrl) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      // ignore
    }
  }
  previewByFileName.set(key, blobUrl);
};

export const clearAdminImageBlobPreview = (fileName) => {
  const key = String(fileName || "").trim();
  const prev = previewByFileName.get(key);
  if (!prev) return;
  previewByFileName.delete(key);
  try {
    URL.revokeObjectURL(prev);
  } catch {
    // ignore
  }
};

export const getAdminImageBlobPreview = (fileName) => {
  const key = String(fileName || "").trim();
  return key ? previewByFileName.get(key) || "" : "";
};

/**
 * Нормализует storage-ключ файла.
 * Upload пишет nested ключи constr/preview/CODE_….jpg — basename резать нельзя.
 */
export const normalizeAdminImageKey = (raw) => {
  const key = String(raw || "")
    .trim()
    .replace(/^\/+/, "");
  if (!key || key === ".") return "";
  return key;
};

/** Полностью раскодирует path-сегмент (в т.ч. double-encoded %252F → /). */
const fullyDecodeURIComponent = (value) => {
  let current = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
};

/**
 * Достаёт storage-ключ из ответа upload / GET /admin/images / images[].
 * GET entity images отдаёт url, file_name в JSON скрыт (json:"-").
 */
export const extractAdminImageKey = (image) => {
  if (image == null || image === "") return "";

  if (typeof image === "object") {
    const fromName = normalizeAdminImageKey(image.file_name);
    if (fromName) return fromName;
    return extractAdminImageKey(String(image.url || "").trim());
  }

  const s = String(image).trim();
  if (!s || s.startsWith("blob:") || s.startsWith("data:")) return "";

  const markerIdx = s.indexOf(PUBLIC_IMAGE_PATH_PREFIX);
  if (markerIdx >= 0) {
    const raw = s.slice(markerIdx + PUBLIC_IMAGE_PATH_PREFIX.length).split("?")[0];
    return normalizeAdminImageKey(fullyDecodeURIComponent(raw));
  }

  // Чужой absolute URL (не public/image) — не admin-ключ.
  if (/^https?:\/\//i.test(s)) return "";

  return normalizeAdminImageKey(s.replace(/^\.\//, ""));
};

/**
 * Кодирует ключ в один path-параметр для gin `:img`.
 * Nested ключи нельзя кодировать один раз: браузер/прокси превращают %2F в `/`,
 * маршрут public/image/:img не матчится → «404 page not found».
 * Double-encode: constr%252Fpreview%252F….jpg → gin QueryUnescape → nested key.
 */
export const encodeAdminPublicImageParam = (key) => {
  const normalized = normalizeAdminImageKey(key);
  if (!normalized) return "";
  if (normalized.includes("/")) {
    return encodeURIComponent(encodeURIComponent(normalized));
  }
  return encodeURIComponent(normalized);
};

/**
 * Durable same-origin URL для админских картинок.
 */
export const resolveAdminPublicImageUrl = (image) => {
  const key = extractAdminImageKey(image);
  if (!key) return "";
  return `${PUBLIC_IMAGE_PATH_PREFIX}${encodeAdminPublicImageParam(key)}`;
};

/**
 * src для превью слота в карточке конструкции.
 * 1) blob сразу после upload
 * 2) durable public/image URL
 */
export const adminImageSrc = (image) => {
  if (image == null || image === "") return "";
  if (typeof image === "string") {
    const s = image.trim();
    if (!s) return "";
    if (s.startsWith("blob:") || s.startsWith("data:")) return s;
    return resolveAdminPublicImageUrl(s);
  }
  const fileName = String(image.file_name || "").trim();
  const blob = getAdminImageBlobPreview(fileName);
  if (blob) return blob;
  return resolveAdminPublicImageUrl(image);
};

/** @deprecated alias — раньше flatten ломал nested keys */
export const flattenAdminImageKey = normalizeAdminImageKey;
