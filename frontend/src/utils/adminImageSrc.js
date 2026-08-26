/** Session-only blob previews for admin image library (survive HMR, not reload). */
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
 * Public endpoint serves a single flat key (constr_preview_….jpg).
 * Nested upload URLs like constr/preview/x.jpg 404 — keep basename only.
 */
export const flattenAdminImageKey = (raw) => {
  const key = String(raw || "")
    .trim()
    .replace(/^\/+/, "");
  if (!key) return "";
  if (!key.includes("/")) return key;
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

/**
 * Достаёт ключ файла из ответа upload / GET /admin/images / images[].
 * Только admin public/image или сырой file_name — без legacy Img_constr.
 */
export const extractAdminImageKey = (image) => {
  if (image == null || image === "") return "";

  if (typeof image === "object") {
    const fromName = String(image.file_name || "").trim();
    if (fromName) return flattenAdminImageKey(fromName);
    return extractAdminImageKey(String(image.url || "").trim());
  }

  const s = String(image).trim();
  if (!s || s.startsWith("blob:") || s.startsWith("data:")) return "";

  const markerIdx = s.indexOf(PUBLIC_IMAGE_PATH_PREFIX);
  if (markerIdx >= 0) {
    let key = s.slice(markerIdx + PUBLIC_IMAGE_PATH_PREFIX.length).split("?")[0];
    try {
      key = decodeURIComponent(key);
    } catch {
      // keep raw slice
    }
    return flattenAdminImageKey(key);
  }

  // Чужой absolute URL (не public/image) — не admin-ключ.
  if (/^https?:\/\//i.test(s)) return "";

  // Относительный путь или сырой file_name.
  return flattenAdminImageKey(s.replace(/^\.\//, ""));
};

/**
 * Durable same-origin URL для картинки, загруженной/привязанной через админку.
 * Vite/server.js проксируют /api/v2/public/image → AUTH (:3005 MinIO).
 */
export const resolveAdminPublicImageUrl = (image) => {
  const key = extractAdminImageKey(image);
  if (!key) return "";
  // Пустой stub …/public/image/ без файла.
  if (!key || key === ".") return "";
  return `${PUBLIC_IMAGE_PATH_PREFIX}${encodeURIComponent(key)}`;
};

/**
 * src для превью в админ-потоке изображений.
 * 1) blob сразу после upload (мгновенно, до проверки public)
 * 2) durable /api/v2/public/image/<flat-key> из file_name / url
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
