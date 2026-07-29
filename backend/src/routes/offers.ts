import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  exportOfferToOnec,
  readOnecDocumentId,
  type OnecExportResponse,
} from "../services/onecIntegration.js";

/**
 * КП без локальной БД: «Сделать КП» → POST в 1С → ответ { code, data, error }.
 * Список и карточка на фронте строятся только из этих ответов.
 */

const router = Router();

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

const CreateKpBodySchema = z.object({
  constructions: z
    .array(
      z
        .object({
          calc_params: z.object({}).passthrough(),
        })
        .passthrough()
    )
    .min(1),
});

const isOnecSuccess = (onec: OnecExportResponse): boolean =>
  Boolean(readOnecDocumentId(onec)) && !onec.error;

/**
 * POST /api/offers
 * Body: { constructions: [{ calc_params }] }
 * → прокси в POST /integration/onec/isolation/document
 * → { code, data: { document_id, user_email }, error?, id? }
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateKpBodySchema.parse(req.body ?? {});
    const calcParamsList = parsed.constructions.map((c) => c.calc_params);

    const onec = await exportOfferToOnec({
      mode: "create",
      calcParamsList,
      cookieHeader: req.headers.cookie,
      csrfToken: req.get("x-csrf-token"),
    });

    const documentId = readOnecDocumentId(onec);
    if (!documentId || !isOnecSuccess(onec)) {
      return res.status(502).json({
        error:
          onec.error ||
          "1С не вернула document_id — коммерческое предложение не создано",
        code: onec.code,
        data: onec.data,
      });
    }

    return res.status(201).json({
      code: onec.code,
      data: {
        document_id: documentId,
        user_email: onec.data?.user_email ?? req.auth?.email ?? "",
      },
      error: onec.error,
      /** Удобный алиас для навигации /kp/:id */
      id: documentId,
    });
  })
);

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });
  }
  return next(err);
});

export default router;
