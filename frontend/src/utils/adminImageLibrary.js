import { useEffect, useState } from "react";

const STORAGE_KEY = "ag_admin_image_library_v1";
export const ADMIN_IMAGE_LIBRARY_EVENT = "ag-admin-image-library";

const asLibraryItem = (row) => {
  if (!row || typeof row !== "object") return null;
  const fileName = String(row.file_name || "").trim();
  if (!fileName) return null;
  return {
    file_name: fileName,
    url: String(row.url || "").trim(),
    mime_type: String(row.mime_type || "").trim(),
    file_size: Number(row.file_size) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    title: String(row.title || "").trim(),
    added_at: Number(row.added_at) || Date.now(),
  };
};

export const readAdminImageLibrary = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const items = [];
    for (const row of parsed) {
      const item = asLibraryItem(row);
      if (!item || seen.has(item.file_name)) continue;
      seen.add(item.file_name);
      items.push(item);
    }
    return items.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
  } catch {
    return [];
  }
};

const writeAdminImageLibrary = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 200)));
  window.dispatchEvent(new Event(ADMIN_IMAGE_LIBRARY_EVENT));
};

export const addToAdminImageLibrary = (row) => {
  const item = asLibraryItem(row);
  if (!item) return readAdminImageLibrary();
  const current = readAdminImageLibrary();
  const prev = current.find((x) => x.file_name === item.file_name);
  // Не затираем url из upload пустым ответом GET /admin/images.
  const merged = {
    ...(prev || {}),
    ...item,
    url: item.url || prev?.url || "",
    mime_type: item.mime_type || prev?.mime_type || "",
    title: item.title || prev?.title || "",
    added_at: item.added_at || prev?.added_at || Date.now(),
  };
  const next = [merged, ...current.filter((x) => x.file_name !== item.file_name)];
  writeAdminImageLibrary(next);
  return next;
};

export const removeFromAdminImageLibrary = (fileName) => {
  const name = String(fileName || "").trim();
  const next = readAdminImageLibrary().filter((item) => item.file_name !== name);
  writeAdminImageLibrary(next);
  return next;
};

/** Подставляет url из раздела «Изображения», если GET /admin/images его не отдал. */
export const overlayLibraryFields = (row, library = readAdminImageLibrary()) => {
  if (!row) return null;
  const fileName = String(row.file_name || "").trim();
  if (!fileName) return row;
  const lib = library.find((item) => item.file_name === fileName);
  if (!lib) return row;
  return {
    ...row,
    url: String(row.url || "").trim() || lib.url,
    mime_type: String(row.mime_type || "").trim() || lib.mime_type,
    title: String(row.title || "").trim() || lib.title,
  };
};

export const useAdminImageLibrary = () => {
  const [items, setItems] = useState(() => readAdminImageLibrary());
  useEffect(() => {
    const sync = () => setItems(readAdminImageLibrary());
    window.addEventListener(ADMIN_IMAGE_LIBRARY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ADMIN_IMAGE_LIBRARY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
};
