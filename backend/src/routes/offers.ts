import type { Company, Offer, OfferConstruction, Prisma } from "@prisma/client";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import {
  CreateOfferRequestSchema,
  UpdateOfferRequestSchema,
} from "../docs/schemas.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { CalcServiceError, calculateByProduct } from "../services/calcService.js";
import { recalcConstructionsMaterials } from "../services/offerRecalc.js";
import { OfferPdfError, renderOfferPdf } from "../services/offerPdf.js";
import { formatKpCode } from "../utils/kpCode.js";
import { buildOffersListWhere } from "../utils/offerListSearch.js";
import { parsePagination, paginated } from "../utils/pagination.js";

const router = Router();

/** Следующий порядковый номер КП для пользователя (внутри транзакции). */
const nextKpNumberForUser = async (
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> => {
  const agg = await tx.offer.aggregate({
    where: { userId },
    _max: { kpNumber: true },
  });
  return (agg._max.kpNumber ?? 0) + 1;
};

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<Response | void>;
const asyncHandler =
  (handler: AsyncRouteHandler) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(handler(req, res, next)).catch(next);

router.use(requireAuth);

// ─── helpers ────────────────────────────────────────────────────────────────

const decimalToNumber = (v: Prisma.Decimal | null): number | null =>
  v === null || v === undefined ? null : Number(v.toString());

const toForm = (parsed: z.infer<typeof CreateOfferRequestSchema>["form"]) => {
  const form = parsed ?? {};
  return {
    title: form.title ?? null,
    managerName: form.manager_name ?? null,
    phone: form.phone ?? null,
    email: form.email ?? null,
    officeAddress: form.office_address ?? null,
    kpDate: form.kp_date ?? null,
    objectName: form.object_name ?? null,
    region: form.region ?? null,
    markupPercent: form.markup_percent ?? null,
    discountPercent: form.discount_percent ?? null,
  };
};

const todayIsoDate = (): string => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
};

/**
 * На создании — snapshot профиля пользователя во все незаполненные поля формы.
 * Плюс kp_date по умолчанию = сегодня. Это чтобы у пользователя сразу были
 * заполнены ФИО/Телефон/Email/Адрес/Дата в КП — без ручного заполнения.
 */
const applyProfileDefaults = (
  form: ReturnType<typeof toForm>,
  user: { fullName: string; phone: string | null; email: string; officeAddress: string | null }
) => ({
  ...form,
  managerName: form.managerName ?? user.fullName ?? null,
  phone: form.phone ?? user.phone ?? null,
  email: form.email ?? user.email ?? null,
  officeAddress: form.officeAddress ?? user.officeAddress ?? null,
  kpDate: form.kpDate ?? todayIsoDate(),
});

const toOfferSummary = (
  offer: Offer,
  ownerEmployeeNumber?: number | null
) => ({
  id: offer.id,
  title: offer.title,
  object_name: offer.objectName,
  region: offer.region,
  kp_date: offer.kpDate,
  kp_number: offer.kpNumber,
  kp_code: formatKpCode(offer.kpNumber, ownerEmployeeNumber),
  created_at: offer.createdAt.toISOString(),
  updated_at: offer.updatedAt.toISOString(),
});

interface ConstructionForDto {
  id: string;
  position: number;
  calcParams: unknown;
  materials: unknown;
  montage: unknown;
}

const toOfferDto = (
  offer: Offer,
  constructions: ConstructionForDto[],
  company?: Company | null,
  ownerEmployeeNumber?: number | null
) => ({
  id: offer.id,
  user_id: offer.userId,
  title: offer.title,
  manager_name: offer.managerName,
  phone: offer.phone,
  email: offer.email,
  office_address: offer.officeAddress,
  kp_date: offer.kpDate,
  kp_number: offer.kpNumber,
  kp_code: formatKpCode(offer.kpNumber, ownerEmployeeNumber),
  object_name: offer.objectName,
  region: offer.region,
  markup_percent: decimalToNumber(offer.markupPercent),
  discount_percent: decimalToNumber(offer.discountPercent),
  company: company
    ? {
        id: company.id,
        name: company.name,
        address: company.address,
        phone: company.phone,
        ogrn: company.ogrn,
        ogrnip: company.ogrnip,
        kpp: company.kpp,
        inn: company.inn,
        logo_url: company.logoUrl,
      }
    : null,
  services: offer.services ?? null,
  additional_materials: offer.additionalMaterials ?? null,
  kp_settings: offer.kpSettings ?? null,
  constructions: constructions
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      position: c.position,
      calc_params: c.calcParams,
      materials: c.materials ?? [],
      montage: c.montage ?? null,
    })),
  created_at: offer.createdAt.toISOString(),
  updated_at: offer.updatedAt.toISOString(),
});

// ─── routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/offers
 * Создаёт оффер + конструкции. Один раз вызывает внешний calc для инициализации materials.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = CreateOfferRequestSchema.parse(req.body ?? {});
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const form = applyProfileDefaults(toForm(parsed.form), user);
    const constructionInputs = parsed.offerDraft.constructions;

    // Свежий расчёт материалов по всем конструкциям.
    const calcParamsList = constructionInputs.map((c) => c.calc_params);
    const freshMaterials = await calculateByProduct(calcParamsList);

    const created = await prisma.$transaction(async (tx) => {
      const kpNumber = await nextKpNumberForUser(tx, userId);
      const offer = await tx.offer.create({
        data: {
          userId,
          kpNumber,
          ...form,
          services: (parsed.offerDraft.services ?? []) as unknown as Prisma.InputJsonValue,
          additionalMaterials:
            (parsed.offerDraft.additional_materials ?? []) as unknown as Prisma.InputJsonValue,
          ...(parsed.offerDraft.kp_settings !== undefined
            ? {
                kpSettings:
                  parsed.offerDraft.kp_settings as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      const constructions = await Promise.all(
        constructionInputs.map((c, index) =>
          tx.offerConstruction.create({
            data: {
              offerId: offer.id,
              position: index,
              calcParams: c.calc_params as unknown as Prisma.InputJsonValue,
              materials: (freshMaterials[index] ?? []) as unknown as Prisma.InputJsonValue,
              montage: (c.montage ?? []) as unknown as Prisma.InputJsonValue,
            },
          })
        )
      );

      return { offer, constructions };
    });

    return res
      .status(201)
      .json(
        toOfferDto(
          created.offer,
          created.constructions,
          user.company,
          user.employeeNumber
        )
      );
  })
);

/**
 * GET /api/offers — список офферов текущего пользователя (только метаданные).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { page, limit, skip, take } = parsePagination(req.query);
    const where = buildOffersListWhere(userId, {
      q: req.query.q,
      date: req.query.date,
    });
    const [user, offers, total] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: userId },
        select: { employeeNumber: true },
      }),
      prisma.offer.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      prisma.offer.count({ where }),
    ]);

    const ownerEmployeeNumber = user?.employeeNumber ?? null;
    return res.json(
      paginated(
        offers.map((o) => toOfferSummary(o, ownerEmployeeNumber)),
        total,
        page,
        limit
      )
    );
  })
);

/**
 * Загружает оффер пользователя, пересчитывает материалы и собирает DTO в том
 * виде, в котором его потребляет фронт. Общий код для GET /:id и /:id/pdf —
 * единый источник правды.
 */
const loadOfferDto = async (
  userId: string,
  offerId: string
): Promise<ReturnType<typeof toOfferDto> | null> => {
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, userId },
    include: { constructions: true, user: { include: { company: true } } },
  });
  if (!offer) return null;

  const recalc = await recalcConstructionsMaterials(
    offer.constructions.map((c) => ({
      id: c.id,
      position: c.position,
      calcParams: c.calcParams,
      materials: c.materials,
    }))
  );
  const materialsById = new Map(recalc.map((r) => [r.id, r.materials]));

  const constructionsWithFreshMaterials = offer.constructions.map((c) => ({
    ...c,
    materials: (materialsById.get(c.id) ?? c.materials ?? []) as unknown,
  }));

  return toOfferDto(
    offer,
    constructionsWithFreshMaterials,
    offer.user.company,
    offer.user.employeeNumber
  );
};

/**
 * GET /api/offers/:id — загрузить оффер, пересчитать материалы, наложить override.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const dto = await loadOfferDto(userId, req.params.id);
    if (!dto) return res.status(404).json({ error: "Offer not found" });
    return res.json(dto);
  })
);

/**
 * GET /api/offers/:id/pdf — PDF КП в формате «Шуманет Шоп» (Puppeteer).
 * Те же данные, что и /:id, рендерятся в шаблон и возвращаются как
 * application/pdf с attachment-загрузкой.
 */
router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const dto = await loadOfferDto(userId, req.params.id);
    if (!dto) return res.status(404).json({ error: "Offer not found" });

    // Транзитные параметры печати: в БД не хранятся, влияют только на текст PDF
    // (вступление + блок условий). Колонтитулы берут company_name из БД.
    const qStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
    const recipient = qStr(req.query.recipient);
    const payment_schedule = qStr(req.query.payment_schedule);
    const delivery_method = qStr(req.query.delivery_method);
    const warehouse = qStr(req.query.warehouse);
    const offer_validity = qStr(req.query.offer_validity);

    const pdf = await renderOfferPdf({
      id: dto.id,
      manager_name: dto.manager_name,
      phone: dto.phone,
      email: dto.email,
      kp_date: dto.kp_date,
      kp_code: dto.kp_code,
      object_name: dto.object_name,
      region: dto.region,
      logo_url: dto.company?.logo_url ?? null,
      company_name: dto.company?.name ?? null,
      company_address: dto.company?.address ?? null,
      company_phone: dto.company?.phone ?? null,
      ogrn: dto.company?.ogrn ?? null,
      ogrnip: dto.company?.ogrnip ?? null,
      kpp: dto.company?.kpp ?? null,
      inn: dto.company?.inn ?? null,
      recipient,
      payment_schedule,
      delivery_method,
      warehouse,
      offer_validity,
      services: (Array.isArray(dto.services) ? dto.services : null) as Array<
        Record<string, unknown>
      > | null,
      additional_materials: (Array.isArray(dto.additional_materials)
        ? dto.additional_materials
        : null) as Array<Record<string, unknown>> | null,
      constructions: dto.constructions.map((c) => ({
        id: c.id,
        position: c.position,
        calc_params: (c.calc_params as Record<string, unknown> | null) ?? null,
        materials: (c.materials as Array<Record<string, unknown>>) ?? [],
        montage: (c.montage as Array<Record<string, unknown>> | null) ?? null,
      })),
      kp_settings:
        dto.kp_settings && typeof dto.kp_settings === "object"
          ? (dto.kp_settings as Record<string, unknown>)
          : null,
    });

    // RFC 5987 для кириллицы в имени файла.
    const objectPart = (dto.object_name ?? "").trim() || dto.id;
    const filename = `КП ${objectPart}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="KP.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader("Content-Length", String(pdf.length));
    return res.send(pdf);
  })
);

/**
 * PATCH /api/offers/:id — сохранить правки формы, services, constructions.
 * Конструкции перезаписываются полностью (по плану: удалить старые и пересоздать).
 * total_cost принимается для совместимости и игнорируется (не хранится в БД).
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = UpdateOfferRequestSchema.parse(req.body ?? {});

    const existing = await prisma.offer.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Offer not found" });

    // Частичное обновление формы: в `data` попадают только те поля, которые
    // пользователь явно передал (отличие от create — там клобберим всё).
    // Благодаря этому редактирование одного поля не стирает остальные.
    const formData: Record<string, unknown> = {};
    if (parsed.form) {
      const f = parsed.form;
      if (f.title !== undefined) formData.title = f.title;
      if (f.manager_name !== undefined) formData.managerName = f.manager_name;
      if (f.phone !== undefined) formData.phone = f.phone;
      if (f.email !== undefined) formData.email = f.email;
      if (f.office_address !== undefined) formData.officeAddress = f.office_address;
      if (f.kp_date !== undefined) formData.kpDate = f.kp_date;
      if (f.object_name !== undefined) formData.objectName = f.object_name;
      if (f.region !== undefined) formData.region = f.region;
      if (f.markup_percent !== undefined) formData.markupPercent = f.markup_percent;
      if (f.discount_percent !== undefined) formData.discountPercent = f.discount_percent;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.update({
        where: { id: existing.id },
        data: {
          ...formData,
          ...(parsed.services !== undefined
            ? { services: parsed.services as unknown as Prisma.InputJsonValue }
            : {}),
          ...(parsed.additional_materials !== undefined
            ? {
                additionalMaterials:
                  parsed.additional_materials as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(parsed.kp_settings !== undefined
            ? {
                kpSettings:
                  (parsed.kp_settings ?? null) as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      let constructions: OfferConstruction[];
      if (parsed.constructions !== undefined) {
        const existingConstructions = await tx.offerConstruction.findMany({
          where: { offerId: offer.id },
          orderBy: { position: "asc" },
        });
        const minLength = Math.min(
          existingConstructions.length,
          parsed.constructions.length
        );

        // Обновляем существующие строки «на месте», чтобы не менять id конструкции:
        // additional_materials.construction_key_id продолжит ссылаться на корректный key_id.
        const updatedExisting = await Promise.all(
          parsed.constructions.slice(0, minLength).map((c, index) =>
            tx.offerConstruction.update({
              where: { id: existingConstructions[index].id },
              data: {
                position: index,
                calcParams: c.calc_params as unknown as Prisma.InputJsonValue,
                materials: (c.materials ?? []) as unknown as Prisma.InputJsonValue,
                montage: (c.montage ?? []) as unknown as Prisma.InputJsonValue,
              },
            })
          )
        );

        const createdExtra =
          parsed.constructions.length > existingConstructions.length
            ? await Promise.all(
                parsed.constructions
                  .slice(existingConstructions.length)
                  .map((c, extraIndex) =>
                    tx.offerConstruction.create({
                      data: {
                        offerId: offer.id,
                        position: existingConstructions.length + extraIndex,
                        calcParams: c.calc_params as unknown as Prisma.InputJsonValue,
                        materials: (c.materials ?? []) as unknown as Prisma.InputJsonValue,
                        montage: (c.montage ?? []) as unknown as Prisma.InputJsonValue,
                      },
                    })
                  )
              )
            : [];

        if (existingConstructions.length > parsed.constructions.length) {
          await tx.offerConstruction.deleteMany({
            where: {
              id: {
                in: existingConstructions
                  .slice(parsed.constructions.length)
                  .map((c) => c.id),
              },
            },
          });
        }

        constructions = [...updatedExisting, ...createdExtra].sort(
          (a, b) => a.position - b.position
        );
      } else {
        constructions = await tx.offerConstruction.findMany({
          where: { offerId: offer.id },
        });
      }

      return { offer, constructions };
    });

    const owner = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    return res.json(
      toOfferDto(
        updated.offer,
        updated.constructions,
        owner?.company,
        owner?.employeeNumber
      )
    );
  })
);

/**
 * DELETE /api/offers/:id — удаляет оффер пользователя. Конструкции удаляются
 * каскадно (FK `onDelete: Cascade`). Возвращает 204 без тела.
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const existing = await prisma.offer.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Offer not found" });

    await prisma.offer.delete({ where: { id: existing.id } });
    return res.status(204).send();
  })
);

/**
 * POST /api/offers/:id/clone — глубокое копирование, возвращает { id } нового оффера.
 */
router.post(
  "/:id/clone",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const source = await prisma.offer.findFirst({
      where: { id: req.params.id, userId },
      include: { constructions: true },
    });
    if (!source) return res.status(404).json({ error: "Offer not found" });

    const newOffer = await prisma.$transaction(async (tx) => {
      const kpNumber = await nextKpNumberForUser(tx, userId);
      const offer = await tx.offer.create({
        data: {
          userId,
          kpNumber,
          title: source.title,
          managerName: source.managerName,
          phone: source.phone,
          email: source.email,
          officeAddress: source.officeAddress,
          kpDate: source.kpDate,
          objectName: source.objectName,
          region: source.region,
          markupPercent: source.markupPercent,
          discountPercent: source.discountPercent,
          services: (source.services ?? []) as unknown as Prisma.InputJsonValue,
          additionalMaterials:
            (source.additionalMaterials ?? []) as unknown as Prisma.InputJsonValue,
          ...(source.kpSettings !== null
            ? {
                kpSettings: source.kpSettings as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      await Promise.all(
        source.constructions
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((c, index) =>
            tx.offerConstruction.create({
              data: {
                offerId: offer.id,
                position: index,
                calcParams: c.calcParams as unknown as Prisma.InputJsonValue,
                materials: (c.materials ?? []) as unknown as Prisma.InputJsonValue,
                montage: (c.montage ?? []) as unknown as Prisma.InputJsonValue,
              },
            })
          )
      );

      return offer;
    });

    return res.status(201).json({ id: newOffer.id });
  })
);

// ─── error handler (local to this router) ───────────────────────────────────

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      // issues с путями — в отличие от flatten(), сохраняет позицию ошибки
      // (например `constructions.0.calc_params.Code`) — это сильно помогает отладке.
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });
  }
  if (err instanceof CalcServiceError) {
    const status = err.status && err.status >= 500 ? 502 : 502;
    return res.status(status).json({ error: err.message });
  }
  if (err instanceof OfferPdfError) {
    return res.status(500).json({ error: err.message });
  }
  return next(err);
});

export default router;
