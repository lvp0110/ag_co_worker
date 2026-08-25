/** Session-only blob previews for admin image library (survive HMR, not reload). */
const previewByFileName = new Map();

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
 * src для превью в админ-потоке изображений.
 * 1) blob сразу после upload (не зависит от public/image 404)
 * 2) url из ответа upload / библиотеки
 */
export const adminImageSrc = (image) => {
  if (image == null || image === "") return "";
  if (typeof image === "string") {
    const s = image.trim();
    if (!s) return "";
    if (/\/api\/v2\/public\/image\/?$/i.test(s.split("?")[0])) return "";
    return s;
  }
  const fileName = String(image.file_name || "").trim();
  const blob = getAdminImageBlobPreview(fileName);
  if (blob) return blob;
  const url = String(image.url || "").trim();
  if (!url) return "";
  if (/\/api\/v2\/public\/image\/?$/i.test(url.split("?")[0])) return "";
  return url;
};
