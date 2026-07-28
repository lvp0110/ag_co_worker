import { env } from "../config/env.js";

/**
 * Абсолютный URL картинки конструкции на calc-сервисе (порт frontend getImageUrl).
 * Puppeteer в PDF грузит байты по этому URL напрямую, без прокси backend.
 */
export const resolveConstrImageFetchUrl = (imageRef: string | null | undefined): string | null => {
  if (!imageRef) return null;

  const s = String(imageRef).trim();
  if (!s) return null;

  const base = env.calcServiceUrl.replace(/\/$/, "");

  if (s.startsWith("/api/v2/public/image/")) {
    return `${base}${s}`;
  }

  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const parsed = new URL(s);
      if (parsed.pathname.startsWith("/api/v2/public/image/")) {
        return `${base}${parsed.pathname}${parsed.search}`;
      }
      return s;
    } catch {
      return null;
    }
  }

  let imageName = s;
  const zipsCeilingPrefix = "zips_ceiling/";
  if (imageName.includes(zipsCeilingPrefix)) {
    const fileName = imageName.split(zipsCeilingPrefix).pop();
    if (fileName) imageName = fileName;
  }

  let processedImageName = imageName;
  if (imageName.startsWith("/Img_constr/")) {
    const pathWithoutPrefix = imageName.replace("/Img_constr/", "");
    const parts = pathWithoutPrefix.split("/");
    if (parts.length >= 2) {
      const folder = parts[0];
      const fileName = parts[parts.length - 1];
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      processedImageName = `${folder}_${fileNameWithoutExt}.jpg`;
    }
  } else if (imageName.startsWith("/")) {
    processedImageName = imageName.slice(1);
  }

  const encoded = encodeURIComponent(processedImageName);
  return `${base}/api/v2/public/image/${encoded}`;
};
