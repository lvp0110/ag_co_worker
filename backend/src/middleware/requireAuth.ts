import { type NextFunction, type Request, type Response } from "express";
import { fetchExternalSession, toRequestAuth } from "../services/externalAuth.js";

/**
 * Auth через внешний сервис (`AUTH_SERVICE_URL`).
 * Браузер шлёт cookie `access_token`; мы пробрасываем Cookie в GET /auth/session.
 * Локального User больше нет — `req.auth.email` = ключ владельца офферов.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  const cookieHeader = req.headers.cookie;
  const external = await fetchExternalSession(cookieHeader);
  if (!external) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (external.is_active === false) {
    return res.status(403).json({ error: "Account is blocked" });
  }

  const auth = toRequestAuth(external);
  if (!auth.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.auth = auth;
  return next();
};
