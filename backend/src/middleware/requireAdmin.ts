import { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Должен идти ПОСЛЕ requireAuth: берёт userId из req.auth, грузит пользователя
 * и пускает дальше только при role === ADMIN. Иначе 403.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
};
