/**
 * Prod-сервер фронта.
 *
 * TLS и маршрутизация по домену — на хостовом nginx. Этот процесс:
 *   1) отдаёт статику из /app/dist (собранная vite-бандла);
 *   2) проксирует /api/* в backend-контейнер (сохраняя httpOnly cookies);
 *   3) делает SPA-fallback на index.html для любых non-asset GET-маршрутов.
 *
 * Слушает только HTTP на PORT (дефолт 3004). В docker-compose.prod.yml
 * публикуется как "127.0.0.1:3004:3004" — снаружи недоступен, трафик приходит
 * только от host nginx.
 */
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT) || 3004;
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:3006";
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3005";
const DIST_DIR = process.env.DIST_DIR || "/app/dist";
const INDEX_HTML = path.join(DIST_DIR, "index.html");

if (!fs.existsSync(INDEX_HTML)) {
  console.error(
    `[frontend] WARN: ${INDEX_HTML} not found. Did you rsync frontend/dist/?`
  );
}

const app = express();

// Трасту X-Forwarded-* только от loopback (host nginx приходит с 127.0.0.1).
app.set("trust proxy", "loopback");

// Прокси на backend. Не монтируем через app.use("/api", ...) — так express
// стрипает префикс и backend получает `/openapi.json` вместо `/api/openapi.json`.
// Используем pathFilter — path сохраняется один-в-один.
// `/health` тоже проксируем: это backend-ручка, её используют nginx-healthcheck'и
// и мониторинг.
// `/uploads/*` — статика, которую отдаёт сам backend (логотипы и прочие
// пользовательские загрузки из named volume ag_co_worker_uploads). Без этой
// строки фронт перехватывает их SPA-фолбэком и возвращает index.html.
// Auth-сервис: /login и /auth/* (session, logout). Same-origin cookies.
const authProxy = createProxyMiddleware({
  target: AUTH_URL,
  changeOrigin: true,
  xfwd: true,
  pathFilter: (pathname) =>
    pathname === "/login" || pathname === "/auth" || pathname.startsWith("/auth/"),
});
app.use(authProxy);

const backendProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  xfwd: true,
  // Явная функция вместо glob-массива — однозначно отлавливает /api, /health
  // и /uploads на любой глубине, не полагается на поведение micromatch в разных версиях.
  pathFilter: (pathname) =>
    pathname === "/health" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads/"),
});
app.use(backendProxy);

// Локальный health самого фронт-процесса (не трогает backend) — полезно
// различать «фронт жив, но backend упал».
app.get("/__front_health", (_req, res) => res.json({ ok: true }));

// Статика: хешированные ассеты можно кешировать надолго, index.html — нет.
app.use(
  express.static(DIST_DIR, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// SPA fallback: любой GET, не попавший в /api и не найденный в static → index.html.
app.get("*", (_req, res, next) => {
  if (!fs.existsSync(INDEX_HTML)) return next(new Error("index.html missing"));
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(INDEX_HTML);
});

const server = app.listen(PORT, () => {
  console.log(
    `[frontend] listening on :${PORT}, dist=${DIST_DIR}, backend=${BACKEND_URL}, auth=${AUTH_URL}`
  );
});

// Корректное завершение при docker stop / compose restart.
const shutdown = (signal) => {
  console.log(`[frontend] ${signal} received, closing...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
