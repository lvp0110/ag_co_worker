import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/**
 * Директория, куда multer кладёт загруженные файлы.
 *
 * В Docker — это named volume `ag_co_worker_uploads`, смонтированный в /app/uploads
 * (см. docker-compose.prod.yml). При локальном запуске backend на хосте — обычная
 * папка `backend/uploads/` рядом с исходниками (gitignored).
 *
 * Источник правды — env-переменная UPLOADS_DIR; если не задана — используем
 * `<cwd>/uploads`, что соответствует обоим сценариям выше:
 *  - в Docker рабочая директория /app, значит `/app/uploads`
 *  - на хосте backend запускается из `backend/`, значит `backend/uploads`
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "uploads");

// Создаём директорию при старте, чтобы первый запрос не падал, если она ещё
// отсутствует (например, чистый volume или fresh dev-инсталл).
await fs.mkdir(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

const upload = multer({
  // В памяти держим файл целиком (≤ 1 MB), чтобы посчитать sha256 до того, как
  // решим, нужно ли вообще писать его на диск. Дешевле, чем сохранять в tmp
  // + читать обратно. Лимит размера multer применяет ещё на чтении.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_MIME, file.mimetype)) {
      // Внутри fileFilter throw/cb-error прилетят в общий error-handler ниже как MulterError.
      cb(new MulterMimeError(`Недопустимый формат: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

class MulterMimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MulterMimeError";
  }
}

router.use(requireAuth);

/**
 * POST /api/uploads/logo
 *
 * multipart/form-data, поле `file` (PNG/JPEG/WebP ≤ 1 MB).
 * Файл сохраняется по content-addressed схеме: имя = `logo-<sha256>.<ext>`.
 * Если такой файл уже есть — не перезаписываем, отдаём тот же URL (естественный
 * дедуп: десять КП с одинаковым логотипом → один файл на диске).
 *
 * Ответ: 200 `{ url: "/uploads/logo-<sha256>.<ext>" }`.
 */
router.post(
  "/logo",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "Файл не передан (multipart-поле должно называться 'file')" });
      }
      const ext = ALLOWED_MIME[req.file.mimetype];
      // Защита от пограничных случаев: fileFilter уже проверил mime, но если
      // multer прошёл с буфером без mime — лучше отдать понятный 400.
      if (!ext) {
        return res.status(400).json({ error: "Недопустимый формат изображения" });
      }
      const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
      const filename = `logo-${sha256}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      try {
        await fs.access(filepath);
        // Файл с таким содержимым уже лежит — пропускаем запись, отдаём URL.
      } catch {
        await fs.writeFile(filepath, req.file.buffer);
      }

      return res.json({ url: `/uploads/${filename}` });
    } catch (err) {
      return next(err);
    }
  }
);

// Локальный error-handler для распознавания multer-специфичных ошибок
// (лимит размера, неверный MIME через MulterMimeError). Всё остальное —
// в глобальный handler в index.ts.
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `Файл больше 1 MB` });
    }
    return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
  }
  if (err instanceof MulterMimeError) {
    return res
      .status(400)
      .json({ error: "Допускаются только PNG, JPEG, WebP" });
  }
  return next(err);
});

export default router;
