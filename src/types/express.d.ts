import type { AuthUser } from "./user.js";

declare global {
  namespace Express {
    interface Request {
      /** Attached by the `requireAuth` middleware once a bearer token is verified. */
      user?: AuthUser;
    }
  }
}

export {};
