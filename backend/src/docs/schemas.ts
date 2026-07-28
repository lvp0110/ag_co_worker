import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse");

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    full_name: z.string(),
    phone: z.string().nullable(),
    email: z.string().email(),
    office_address: z.string().nullable(),
    employee_number: z.number().int().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi("User");

export const AuthSuccessSchema = z
  .object({
    user: UserSchema,
  })
  .openapi("AuthSuccess");

export const LoginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .openapi("LoginRequest");

export const UpdateMeRequestSchema = z
  .object({
    full_name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    office_address: z.string().optional(),
  })
  .openapi("UpdateMeRequest");

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
 * свои override-поля (`KpPricePerM2`, `KpPricePerUnit`). Не навязываем форму —
 * backend только хранит и вычисляет свежие материалы через internal calcService.
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

export const ServiceSchema = z
  .object({
    name: z.string().optional().default(""),
    price: z.number().optional().default(0),
    count: z.number().optional().default(0),
    unit: z.string().optional().default(""),
  })
  .passthrough()
  .openapi("Service");

export const OfferFormSchema = z
  .object({
    title: z.string().nullish(),
    manager_name: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    office_address: z.string().nullish(),
    kp_date: z.string().nullish(),
    object_name: z.string().nullish(),
    region: z.string().nullish(),
    markup_percent: z.number().nullish(),
    discount_percent: z.number().nullish(),
  })
  .openapi("OfferForm");

export const OfferConstructionInputSchema = z
  .object({
    calc_params: CalcParamsSchema,
    materials: z.array(CalcMaterialSchema).nullish(),
    montage: z.array(ServiceSchema).nullish(),
  })
  .openapi("OfferConstructionInput");

/**
 * Дополнительные материалы — хранятся независимо от расчётов конструкций.
 * Пользователь добавляет произвольные позиции на KpPage. Backend не
 * пересчитывает и не валидирует их — просто хранит и возвращает.
 * Формат совпадает с Service (name/price/count/unit), но поле отдельное.
 */
export const AdditionalMaterialSchema = ServiceSchema.openapi("AdditionalMaterial");

/**
 * Настройки КП (KP_SETTINGS_FIELDS на фронте): ставки монтажа за м² для
 * типовых конструкций. Каждое поле опционально и может быть строкой ("" или
 * число строкой — фронт хранит как строку из <input type="number">) или числом.
 * `.passthrough()` оставляет место под будущие ключи без миграции схемы.
 */
export const KpSettingsSchema = z
  .object({
    floor: z.union([z.string(), z.number()]).nullish(),
    ceiling: z.union([z.string(), z.number()]).nullish(),
    cladding: z.union([z.string(), z.number()]).nullish(),
    partition: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough()
  .openapi("KpSettings");

export const OfferDraftSchema = z
  .object({
    // Пустой массив допустим — сценарий «создать пустое КП» (кнопка «Новое КП»
    // на /kp/list). Пользователь добавит конструкции позже через калькулятор.
    constructions: z.array(OfferConstructionInputSchema),
    services: z.array(ServiceSchema).optional(),
    additional_materials: z.array(AdditionalMaterialSchema).optional(),
    kp_settings: KpSettingsSchema.optional(),
  })
  .openapi("OfferDraft");

export const CreateOfferRequestSchema = z
  .object({
    form: OfferFormSchema.optional(),
    offerDraft: OfferDraftSchema,
  })
  .openapi("CreateOfferRequest");

export const UpdateOfferRequestSchema = z
  .object({
    form: OfferFormSchema.optional(),
    services: z.array(ServiceSchema).optional(),
    additional_materials: z.array(AdditionalMaterialSchema).optional(),
    kp_settings: KpSettingsSchema.nullish(),
    constructions: z.array(OfferConstructionInputSchema).optional(),
    total_cost: z.number().optional(),
  })
  .openapi("UpdateOfferRequest");

export const OfferConstructionSchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int(),
    calc_params: CalcParamsSchema,
    materials: z.array(CalcMaterialSchema),
    montage: z.array(ServiceSchema).nullable(),
  })
  .openapi("OfferConstruction");

export const OfferSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    object_name: z.string().nullable(),
    region: z.string().nullable(),
    kp_date: z.string().nullable(),
    kp_number: z.number().int(),
    kp_code: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi("OfferSummary");

export const CompanySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    country_code: z.string(),
    country: z.string().nullable(),
    ogrn: z.string().nullable(),
    ogrnip: z.string().nullable(),
    kpp: z.string().nullable(),
    inn: z.string().nullable(),
    logo_url: z.string().nullable(),
  })
  .openapi("Company");

export const CountrySchema = z
  .object({
    code: z.string(),
    name: z.string(),
  })
  .openapi("Country");

export const OfferSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    title: z.string().nullable(),
    manager_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    office_address: z.string().nullable(),
    kp_date: z.string().nullable(),
    kp_number: z.number().int(),
    kp_code: z.string(),
    object_name: z.string().nullable(),
    region: z.string().nullable(),
    markup_percent: z.number().nullable(),
    discount_percent: z.number().nullable(),
    company: CompanySchema.nullable(),
    services: z.array(ServiceSchema).nullable(),
    additional_materials: z.array(AdditionalMaterialSchema).nullable(),
    kp_settings: KpSettingsSchema.nullable(),
    constructions: z.array(OfferConstructionSchema),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi("Offer");

export const CloneOfferResponseSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("CloneOfferResponse");
