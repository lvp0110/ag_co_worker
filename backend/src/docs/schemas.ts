import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse");

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .openapi("HealthResponse");

export const CalcOpeningSchema = z
  .object({
    lenX: z.number(),
    lenZ: z.number(),
    Type: z.string(),
  })
  .openapi("CalcOpening");

export const CalcParamsSchema = z
  .object({
    Code: z.string(),
    LenX: z.number(),
    LenY: z.number(),
    LenZ: z.number(),
    AddCeilShift: z.number(),
    step: z.number(),
    dframe: z.boolean(),
    Area: z.number(),
    Perimeter: z.number(),
    Openings: z.array(CalcOpeningSchema),
  })
  .passthrough()
  .openapi("CalcParams");

/**
 * Материал — пробрасываем как есть: внешний сервис возвращает PascalCase ключи
 * (`Code`, `Name`, `Quantity`, `Units`, `Order`, `InfoPack`), фронт добавляет
 * свои override-поля (`KpPricePerM2`, `KpPricePerUnit`). Не навязываем форму.
 */
export const CalcMaterialSchema = z
  .object({})
  .passthrough()
  .openapi("CalcMaterial");

export const CalcByProductRequestSchema = z
  .array(CalcParamsSchema)
  .openapi("CalcByProductRequest");

export const CalcByProductResponseSchema = z
  .object({
    code: z.number().optional(),
    data: z.array(z.array(CalcMaterialSchema)).optional(),
  })
  .passthrough()
  .openapi("CalcByProductResponse");

export const IsolationConstructionSchema = z
  .object({
    Code: z.string(),
    Name: z.string().optional(),
    Description: z.string().optional(),
    Img: z.string().optional(),
  })
  .passthrough()
  .openapi("IsolationConstruction");

export const AllIsolationConstrResponseSchema = z
  .object({
    code: z.number().optional(),
    data: z.array(IsolationConstructionSchema).optional(),
  })
  .passthrough()
  .openapi("AllIsolationConstrResponse");

export const IsolationConstrMaterialsResponseSchema = z
  .object({
    code: z.number().optional(),
    data: z.unknown().optional(),
  })
  .passthrough()
  .openapi("IsolationConstrMaterialsResponse");

export const ConstructionPropsResponseSchema = z
  .object({
    code: z.number().optional(),
    data: z.unknown().optional(),
  })
  .passthrough()
  .openapi("ConstructionPropsResponse");

/**
 * Ответ выгрузки в 1С (`POST/PUT /integration/onec/isolation/document`).
 * `code: 0` — выгрузка не выполнялась, `code: 200` — успех (часто).
 */
/** POST /api/offers — конструкции → 1С, без локальной БД. */
export const CreateKpFromCalcRequestSchema = z
  .object({
    constructions: z
      .array(
        z.object({
          calc_params: CalcParamsSchema,
        })
      )
      .min(1),
  })
  .openapi("CreateKpFromCalcRequest");

export const CreateKpFromCalcResponseSchema = z
  .object({
    code: z.number().int(),
    data: z.object({
      document_id: z.string(),
      user_email: z.string(),
    }),
    error: z.string().optional(),
    id: z.string(),
  })
  .openapi("CreateKpFromCalcResponse");
