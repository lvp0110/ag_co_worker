import { OpenApiGeneratorV3, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  AllIsolationConstrResponseSchema,
  CalcByProductRequestSchema,
  CalcByProductResponseSchema,
  ConstructionPropsResponseSchema,
  CreateKpFromCalcRequestSchema,
  CreateKpFromCalcResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  IsolationConstrMaterialsResponseSchema,
} from "./schemas.js";

const registry = new OpenAPIRegistry();

// Сессия выдаётся внешним auth-сервисом (POST /login), backend лишь валидирует
// её через GET /auth/session — своих токенов у нас нет.
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "access_token",
});

registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/offers",
  tags: ["Offers"],
  summary: "Создать КП в 1С (без локальной БД)",
  description:
    "Проксирует POST /integration/onec/isolation/document. Ответ — code/data/error от 1С; id = document_id.",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": { schema: CreateKpFromCalcRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Документ создан в 1С",
      content: { "application/json": { schema: CreateKpFromCalcResponseSchema } },
    },
    400: {
      description: "Ошибка валидации",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    502: {
      description: "1С не вернула document_id или сервис недоступен",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

const calcProxyDescription =
  "Прокси на внешний сервис расчёта. Backend форвардит запрос на CALC_SERVICE_URL без модификации тела. На сетевую ошибку/таймаут возвращает 502.";

registry.registerPath({
  method: "post",
  path: "/api/v1/calcIsolation/byProduct",
  tags: ["Calc (proxy)"],
  summary: "Расчёт материалов по конструкциям (прокси)",
  description: calcProxyDescription,
  request: {
    body: {
      content: {
        "application/json": {
          schema: CalcByProductRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Результат расчёта от внешнего сервиса",
      content: { "application/json": { schema: CalcByProductResponseSchema } },
    },
    502: {
      description: "Внешний сервис недоступен или таймаут",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/AllIsolationConstr",
  tags: ["Calc (proxy)"],
  summary: "Список всех конструкций (прокси)",
  description: calcProxyDescription,
  responses: {
    200: {
      description: "Список конструкций",
      content: { "application/json": { schema: AllIsolationConstrResponseSchema } },
    },
    502: {
      description: "Внешний сервис недоступен",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/IsolationConstrMaterials/{code}",
  tags: ["Calc (proxy)"],
  summary: "Материалы конструкции по шифру (прокси)",
  description: calcProxyDescription,
  request: {
    params: z.object({
      code: z.string().openapi({ example: "AG.W101" }),
    }),
  },
  responses: {
    200: {
      description: "Материалы конструкции",
      content: {
        "application/json": { schema: IsolationConstrMaterialsResponseSchema },
      },
    },
    404: {
      description: "Конструкция не найдена во внешнем сервисе",
    },
    502: {
      description: "Внешний сервис недоступен",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v2/isolationConstructions/props/{code}",
  tags: ["Calc (proxy)"],
  summary: "Свойства конструкции v2 (прокси)",
  description: calcProxyDescription,
  request: {
    params: z.object({
      code: z.string().openapi({ example: "AG.W101" }),
    }),
  },
  responses: {
    200: {
      description: "Свойства конструкции",
      content: {
        "application/json": { schema: ConstructionPropsResponseSchema },
      },
    },
    404: {
      description: "Свойства не найдены",
    },
    502: {
      description: "Внешний сервис недоступен",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);
export const openApiSpec = generator.generateDocument({
  openapi: "3.0.3",
  info: {
    title: "ag_co_worker Backend API",
    version: "1.0.0",
    description: "Backend API: proxy calc + создание КП в 1С (без локальной БД; auth — внешний сервис)",
  },
  servers: [{ url: `http://localhost:${env.port}` }],
});
