/**
 * Prod-сервер фронта (systemd: ag-co-worker-frontend).
 *
 * TLS и маршрутизация по домену — на хостовом nginx → 127.0.0.1:PORT.
 * Этот процесс:
 *   1) отдаёт статику из DIST_DIR (vite build, rsync);
 *   2) проксирует /api/* и /health в backend (BACKEND_URL);
 *   3) проксирует /login, /auth/*, /integration/* во внешний auth (AUTH_SERVICE_URL);
 *   4) проксирует /admin/*, /commerce/*, /content/* и /api/v2/public/image туда же;
 *   5) проксирует остальной /api/* и /health в backend (BACKEND_URL);
 *   6) SPA-fallback на index.html.
 *
 * GitHub Pages (другой origin) бьёт сюда, не напрямую в :3005: cookie с github.io
 * не доходят. Для Origin github.io прокси ставит X-Client-Type: plugin — это уже
 * умеет живой auth, токены приходят в JSON, фронт шлёт Bearer. ConstrTodo не трогаем.
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
const PAGES_ORIGINS = new Set(
  String(process.env.PAGES_CORS_ORIGINS || "https://lvp0110.github.io")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

if (!fs.existsSync(INDEX_HTML)) {
  console.error(
    `[frontend] WARN: ${INDEX_HTML} not found. Did you rsync frontend/dist/?`
  );
}

const app = express();

// Трасту X-Forwarded-* только от loopback (host nginx приходит с 127.0.0.1).
app.set("trust proxy", "loopback");

const isPagesOrigin = (req) => PAGES_ORIGINS.has(String(req.headers.origin || ""));

const requestPath = (req) => String(req.url || req.path || "").split("?")[0];

const isAuthTokenPath = (req) => {
  const p = requestPath(req);
  return (
    p === "/login" ||
    p === "/auth/login" ||
    p === "/auth/refresh" ||
    p.endsWith("/auth/login") ||
    p.endsWith("/auth/refresh")
  );
};

const applyPagesCorsHeaders = (headers, origin) => {
  headers["access-control-allow-origin"] = origin;
  headers["access-control-allow-credentials"] = "true";
  headers["access-control-allow-headers"] =
    "Origin, Content-Type, Authorization, X-CSRF-Token, Accept";
  headers["access-control-allow-methods"] = "GET,POST,PUT,DELETE,PATCH,OPTIONS";
  headers.vary = "Origin";
};

// GitHub Pages → этот origin. Preflight закрываем сами, ConstrTodo не нужен.
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  if (PAGES_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Authorization, X-CSRF-Token, Accept"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,PATCH,OPTIONS"
    );
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
  }
  next();
});

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
  pathFilter: (pathname, req) => {
    if (
      pathname === "/login" ||
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/integration" ||
      pathname.startsWith("/integration/") ||
      pathname === "/commerce" ||
      pathname.startsWith("/commerce/") ||
      pathname === "/content" ||
      pathname.startsWith("/content/") ||
      // Admin-загруженные файлы в MinIO AUTH — не через backend :filename.
      pathname === "/api/v2/public/image" ||
      pathname.startsWith("/api/v2/public/image/")
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
    proxyReq(proxyReq, req) {
      // Браузер с github.io не может прислать X-Client-Type (CORS на :3005).
      // Node→auth CORS не касается: plugin уже есть на живом сервисе.
      if (isPagesOrigin(req) && isAuthTokenPath(req)) {
        proxyReq.setHeader("X-Client-Type", "plugin");
      }
    },
    proxyRes(proxyRes, req) {
      delete proxyRes.headers["access-control-allow-origin"];
      delete proxyRes.headers["access-control-allow-credentials"];
      delete proxyRes.headers["access-control-allow-headers"];
      delete proxyRes.headers["access-control-allow-methods"];
      if (isPagesOrigin(req)) {
        applyPagesCorsHeaders(proxyRes.headers, req.headers.origin);
      }
    },
  },
});
app.use(authProxy);

const backendProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  xfwd: true,
  pathFilter: (pathname) => {
    // public/image уже ушёл в authProxy.
    if (
      pathname === "/api/v2/public/image" ||
      pathname.startsWith("/api/v2/public/image/")
    ) {
      return false;
    }
    return (
      pathname === "/health" ||
      pathname === "/api" ||
      pathname.startsWith("/api/")
    );
  },
  on: {
    proxyRes(proxyRes, req) {
      delete proxyRes.headers["access-control-allow-origin"];
      delete proxyRes.headers["access-control-allow-credentials"];
      delete proxyRes.headers["access-control-allow-headers"];
      delete proxyRes.headers["access-control-allow-methods"];
      if (isPagesOrigin(req)) {
        applyPagesCorsHeaders(proxyRes.headers, req.headers.origin);
      }
    },
  },
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
