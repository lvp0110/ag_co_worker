import { type NextFunction, type Request, type Response } from "express";
import {
  fetchExternalSession,
  mapRole,
  upsertLocalUserFromExternal,
} from "../services/externalAuth.js";

/**
 * Auth через внешний сервис (:3005 / AUTH_SERVICE_URL).
 * Браузер шлёт cookie `access_token` (same-origin через Vite/nginx proxy),
 * мы пробрасываем Cookie в GET /auth/session и маппим пользователя в локальную БД.
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

  let user;
  try {
    user = await upsertLocalUserFromExternal(external);
  } catch (err) {
    console.error("[requireAuth] upsert local user failed:", err);
    return res.status(503).json({ error: "Auth mapping unavailable" });
  }

  if (user.isBlocked) {
    return res.status(403).json({ error: "Account is blocked" });
  }

  req.auth = { userId: user.id, role: mapRole(external.role_type) };
  return next();
};
