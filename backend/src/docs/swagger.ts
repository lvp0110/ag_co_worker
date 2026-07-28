import { OpenApiGeneratorV3, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  AllIsolationConstrResponseSchema,
  AuthSuccessSchema,
  CalcByProductRequestSchema,
  CalcByProductResponseSchema,
  CloneOfferResponseSchema,
  ConstructionPropsResponseSchema,
  CreateOfferRequestSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  IsolationConstrMaterialsResponseSchema,
  LoginRequestSchema,
  OfferSchema,
  OfferSummarySchema,
  UpdateMeRequestSchema,
  UpdateOfferRequestSchema,
  UserSchema,
} from "./schemas.js";

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "accessToken",
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
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Login user",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successful login",
      content: { "application/json": { schema: AuthSuccessSchema } },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Invalid credentials",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/refresh",
  tags: ["Auth"],
  summary: "Refresh access token",
  responses: {
    200: {
      description: "New tokens issued",
      content: { "application/json": { schema: AuthSuccessSchema } },
    },
    401: {
      description: "Refresh token invalid or missing",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Auth"],
  summary: "Logout user",
  responses: {
    204: {
      description: "Logged out",
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/users/me",
  tags: ["Users"],
  summary: "Get current user",
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "Current user profile",
      content: { "application/json": { schema: UserSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "User not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/users/me",
  tags: ["Users"],
  summary: "Update current user",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: UpdateMeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated user profile",
      content: { "application/json": { schema: UserSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "User not found",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    409: {
      description: "Duplicate email",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/offers",
  tags: ["Offers"],
  summary: "Создать оффер (с первичным расчётом материалов)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": { schema: CreateOfferRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Созданный оффер c пересчитанными материалами",
      content: { "application/json": { schema: OfferSchema } },
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
      description: "Внешний calcService недоступен",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/offers",
  tags: ["Offers"],
  summary: "Список офферов текущего пользователя",
  security: [{ cookieAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().optional(),
      q: z
        .string()
        .optional()
        .openapi({ description: "Поиск по номеру КП или названию объекта" }),
      date: z
        .string()
        .optional()
        .openapi({
          description: "Фильтр по дате КП (YYYY-MM-DD или DD.MM.YYYY)",
        }),
    }),
  },
  responses: {
    200: {
      description: "Метаданные офферов (без конструкций)",
      content: { "application/json": { schema: z.array(OfferSummarySchema) } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/offers/{id}",
  tags: ["Offers"],
  summary: "Получить оффер (с серверным пересчётом + override)",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Оффер с пересчитанными материалами",
      content: { "application/json": { schema: OfferSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Оффер не найден или принадлежит другому пользователю",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    502: {
      description: "Внешний calcService недоступен",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/offers/{id}",
  tags: ["Offers"],
  summary: "Сохранить правки оффера",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": { schema: UpdateOfferRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Обновлённый оффер",
      content: { "application/json": { schema: OfferSchema } },
    },
    400: {
      description: "Ошибка валидации",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Оффер не найден",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/offers/{id}",
  tags: ["Offers"],
  summary: "Удалить оффер",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Удалён" },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Оффер не найден",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/offers/{id}/clone",
  tags: ["Offers"],
  summary: "Создать новый оффер на основе существующего",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    201: {
      description: "ID созданного оффера",
      content: { "application/json": { schema: CloneOfferResponseSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "Исходный оффер не найден",
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
    description: "API for authentication and offer management",
  },
  servers: [{ url: `http://localhost:${env.port}` }],
});
