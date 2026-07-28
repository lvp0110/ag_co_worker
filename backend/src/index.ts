import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiSpec } from "./docs/swagger.js";
import { prisma } from "./lib/prisma.js";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import calcRouter from "./routes/calc.js";
import offersRouter from "./routes/offers.js";
import uploadsRouter, { UPLOADS_DIR } from "./routes/uploads.js";
import usersRouter from "./routes/users.js";

const app = express();

// В проде за backend стоит цепочка: host nginx → frontend-container (express
// proxy) → этот backend. Нужно доверять X-Forwarded-* чтобы `req.ip` и
// `req.protocol` показывали реального клиента и корректно работали ratelimit'ы
// и логи. '1' = доверять одному прокси перед нами (frontend-container);
// upstream nginx тоже добавляет X-Forwarded-For, так что итоговая цепочка
// правильно сохраняется в заголовке.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/api/openapi.json", (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/offers", offersRouter);
app.use("/api/uploads", uploadsRouter);
// Статическая отдача загруженных файлов (логотипы и т.п.). Содержимое
// content-addressed (имя = sha256), поэтому кешируем агрессивно.
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "7d",
    index: false,
    fallthrough: false,
  })
);
app.use(calcRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(env.port, () => {
  console.log(`Backend API listening on port ${env.port}`);
});

const shutdown = async (): Promise<void> => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
