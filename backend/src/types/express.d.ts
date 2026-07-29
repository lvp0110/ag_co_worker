import "express";
import type { RequestAuth } from "../services/externalAuth.js";

declare global {
  namespace Express {
    interface Request {
      /** Сессия внешнего auth; владелец офферов = `auth.email`. */
      auth?: RequestAuth;
    }
  }
}

export {};
