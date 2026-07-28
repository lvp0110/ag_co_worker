import { env } from "../config/env.js";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const mimeFromUrl = (url: string): string => {
  try {
    const ext = new URL(url).pathname.replace(/.*\./, ".");
    return MIME_BY_EXT[ext.toLowerCase()] ?? "image/jpeg";
  } catch {
    return "image/jpeg";
  }
};

/**
 * Скачивает изображение и возвращает data: URI для вставки в HTML PDF.
 */
export const fetchImageAsDataUri = async (url: string): Promise<string | null> => {
  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { accept: "image/*,*/*" },
      signal: AbortSignal.timeout(env.calcServiceTimeoutMs),
    });
    if (!upstream.ok) return null;
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    const ct = upstream.headers.get("content-type")?.split(";")[0]?.trim();
    const mime =
      ct && ct.startsWith("image/") ? ct : mimeFromUrl(url);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
};
