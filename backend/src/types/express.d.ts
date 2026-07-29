import "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        /** Локальный UUID пользователя (к нему привязаны офферы). */
        userId: string;
        /** Роль из внешней сессии, а не из локальной БД. */
        role: "USER" | "ADMIN";
      };
    }
  }
}

export {};
