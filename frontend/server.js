/**
 * Prod-сервер фронта (systemd: ag-co-worker-frontend).
 *
 * TLS и маршрутизация по домену — на хостовом nginx → 127.0.0.1:PORT.
 * Этот процесс — весь серверный слой проекта:
 *   1) отдаёт статику из DIST_DIR (vite build);
 *   2) проксирует всё API в ConstrTodo (UPSTREAM_URL): /login, /auth/*,
 *      /api/*, /integration/*, /admin/* (API), /content/*, /commerce/*;
 *   3) отвечает на /health и /__front_health (живость самого процесса);
 *   4) SPA-fallback на index.html.
 *
 * Своего backend у проекта нет — auth, calc, админ-API и выгрузка КП живут в
 * ConstrTodo. Прокси нужен, чтобы фронт ходил по относительным путям и cookies
 * оставались first-party.
 */
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT) || 3004;
// AUTH_SERVICE_URL — историческое имя той же переменной: на сервере в .env.prod
// лежит именно оно, поэтому читаем оба и не требуем правки файла при деплое.
const UPSTREAM_URL =
  process.env.UPSTREAM_URL || process.env.AUTH_SERVICE_URL || "http://localhost:3005";
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

// Health самого процесса. Регистрируем ДО прокси, иначе `/health` попадёт под
// фильтр `/api`-соседей и уедет в upstream: мониторинг должен проверять нас,
// а не ConstrTodo. `/__front_health` — исторический алиас.
const health = (_req, res) => res.json({ ok: true });
app.get("/health", health);
app.get("/__front_health", health);

// Единый прокси в ConstrTodo. Не монтируем через app.use("/api", ...) — так
// express стрипает префикс и upstream получает `/v1/...` вместо `/api/v1/...`.
// Используем pathFilter — path сохраняется один-в-один.
const upstreamProxy = createProxyMiddleware({
  target: UPSTREAM_URL,
  changeOrigin: true,
  xfwd: true,
  pathFilter: (pathname, req) => {
    if (
      pathname === "/login" ||
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname === "/integration" ||
      pathname.startsWith("/integration/") ||
      pathname === "/commerce" ||
      pathname.startsWith("/commerce/") ||
      pathname === "/content" ||
      pathname.startsWith("/content/")
    ) {
      return true;
    }
    // `/admin` — SPA; `/admin/...` API, но HTML-навигация (карточка материала) — SPA.
    if (pathname.startsWith("/admin/")) {
      const accept = String(req?.headers?.accept || "");
      if (accept.includes("text/html")) return false;
      return true;
    }
    return false;
  },
  on: {
    proxyReq: (proxyReq) => {
      // Снимаем Origin перед отправкой в upstream.
      //
      // Браузер присылает Origin даже на same-origin POST. Этот хоп —
      // server-to-server, CORS к нему неприменим, но ConstrTodo всё равно
      // сверяет Origin со своим allowlist'ом (там dev'ый localhost) и на всё
      // остальное отвечает 403 с пустым телом. Запрос без Origin он
      // обрабатывает нормально.
      //
      // Защиту это не ослабляет: Origin-проверка отсекает только браузеры,
      // любой не-браузерный клиент заголовок просто не посылает. CSRF здесь
      // держится на csrf_token + X-CSRF-Token, а не на Origin.
      proxyReq.removeHeader("origin");
    },
  },
});
app.use(upstreamProxy);

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

// SPA fallback: любой GET, не попавший в прокси и не найденный в static → index.html.
app.get("*", (_req, res, next) => {
  if (!fs.existsSync(INDEX_HTML)) return next(new Error("index.html missing"));
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(INDEX_HTML);
});

const server = app.listen(PORT, () => {
  console.log(
    `[frontend] listening on :${PORT}, dist=${DIST_DIR}, upstream=${UPSTREAM_URL}`
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
