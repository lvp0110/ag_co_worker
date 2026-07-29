import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiSpec } from "./docs/swagger.js";
import calcRouter from "./routes/calc.js";
import offersRouter from "./routes/offers.js";

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

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/api/openapi.json", (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

app.use("/api/offers", offersRouter);
app.use(calcRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

const listenHost = process.env.HOST?.trim() || "";
const server = listenHost
  ? app.listen(env.port, listenHost, () => {
      console.log(`Backend API listening on ${listenHost}:${env.port}`);
    })
  : app.listen(env.port, () => {
      console.log(`Backend API listening on port ${env.port}`);
    });

const shutdown = (): void => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
