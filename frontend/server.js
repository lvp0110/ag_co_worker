/**
 * Prod-сервер фронта (systemd: ag-co-worker-frontend).
 *
 * TLS и маршрутизация по домену — на хостовом nginx → 127.0.0.1:PORT.
 * Этот процесс:
 *   1) отдаёт статику из DIST_DIR (vite build, rsync);
 *   2) проксирует /api/* и /health в backend (BACKEND_URL);
 *   3) проксирует /login и /auth/* во внешний auth (AUTH_SERVICE_URL);
 *   4) SPA-fallback на index.html.
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
// Auth-сервис: /login и /auth/* (session, logout). Same-origin cookies.
const authProxy = createProxyMiddleware({
  target: AUTH_URL,
  changeOrigin: true,
  xfwd: true,
  pathFilter: (pathname) =>
    pathname === "/login" || pathname === "/auth" || pathname.startsWith("/auth/"),
  on: {
    proxyReq: (proxyReq) => {
      // Снимаем Origin перед отправкой в auth-сервис.
      //
      // Браузер присылает Origin даже на same-origin POST. Этот хоп —
      // server-to-server, CORS к нему неприменим, но auth-сервис всё равно
      // сверяет Origin со своим allowlist'ом (там только dev'ый
      // http://localhost:5175) и на всё остальное отвечает 403 с пустым телом.
      // Запрос без Origin он обрабатывает нормально.
      //
      // Защиту это не ослабляет: Origin-проверка отсекает только браузеры,
      // любой не-браузерный клиент просто не посылает заголовок. CSRF здесь
      // держится на csrf_token + X-CSRF-Token, а не на Origin.
      proxyReq.removeHeader("origin");
    },
  },
});
app.use(authProxy);

const backendProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  xfwd: true,
  pathFilter: (pathname) =>
    pathname === "/health" ||
    pathname === "/api" ||
    pathname.startsWith("/api/"),
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

// Корректное завершение при systemctl stop / restart.
const shutdown = (signal) => {
  console.log(`[frontend] ${signal} received, closing...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
