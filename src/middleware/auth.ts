import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../types/user.js";
import { HttpError } from "../utils/http-error.js";
import { verifyAccessToken } from "../utils/jwt.js";

const BEARER_PREFIX = "bearer ";

/**
 * Rejects the request with 401 unless a valid `Authorization: Bearer <jwt>`
 * header is present, then exposes the identity as `req.user`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");

  if (header === undefined || header.trim() === "") {
    next(HttpError.unauthorized("Missing Authorization header: expected 'Bearer <token>'"));
    return;
  }

  if (!header.toLowerCase().startsWith(BEARER_PREFIX)) {
    next(HttpError.unauthorized("Unsupported Authorization scheme: expected 'Bearer <token>'"));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (token === "") {
    next(HttpError.unauthorized("Missing bearer token"));
    return;
  }

  const verification = verifyAccessToken(token);
  if (!verification.ok) {
    next(
      HttpError.unauthorized(
        verification.reason === "expired" ? "Access token has expired" : "Access token is invalid",
      ),
    );
    return;
  }

  req.user = verification.user;
  next();
}

/**
 * Reads the identity added by requireAuth; throws when the route forgot the guard.
 */
export function currentUser(req: Request): AuthUser {
  const user = req.user;
  if (user === undefined) {
    throw new Error("currentUser() requires the requireAuth middleware on this route");
  }
  return user;
}
