import bcrypt from "bcrypt";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  ACCESS_COOKIE_NAME,
  getAccessCookieOptions,
  getRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import { toUserDto } from "../utils/userDto.js";

const router = Router();

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<Response | void>;
const asyncHandler = (handler: AsyncRouteHandler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const issueTokens = (userId: string) => {
  const payload = { userId };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
) => {
  res.cookie(ACCESS_COOKIE_NAME, tokens.accessToken, getAccessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, getRefreshCookieOptions());
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE_NAME, getAccessCookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
};
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { company: { include: { country: true } } },
    });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(String(password), user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: "Учётная запись заблокирована" });
    }

    const tokens = issueTokens(user.id);
    setAuthCookies(res, tokens);
    return res.json({ user: toUserDto(user) });
  })
);
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token is missing" });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { company: { include: { country: true } } },
      });
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (user.isBlocked) {
        clearAuthCookies(res);
        return res.status(403).json({ error: "Account is blocked" });
      }

      const tokens = issueTokens(user.id);
      setAuthCookies(res, tokens);
      return res.json({ user: toUserDto(user) });
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
  })
);
router.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  return res.status(204).send();
});

export default router;
