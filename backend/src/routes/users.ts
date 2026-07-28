import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { toUserDto } from "../utils/userDto.js";

const router = Router();

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<Response | void>;
const asyncHandler = (handler: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(handler(req, res, next)).catch(next);
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { include: { country: true } } },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json(toUserDto(user));
  })
);
router.put(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { full_name, phone, email, office_address } = req.body ?? {};
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const duplicate = await prisma.user.findFirst({
        where: { email: normalizedEmail, id: { not: userId } },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({ error: "User with this email already exists" });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: full_name !== undefined ? String(full_name).trim() : undefined,
        phone: phone !== undefined ? String(phone).trim() : undefined,
        email: email !== undefined ? String(email).trim().toLowerCase() : undefined,
        officeAddress: office_address !== undefined ? String(office_address).trim() : undefined,
      },
      include: { company: { include: { country: true } } },
    });

    return res.json(toUserDto(updatedUser));
  })
);

export default router;
