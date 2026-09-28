import jwt from "jsonwebtoken";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/user.js";
import { passwordFingerprint } from "./password.js";

const ISSUER = "bts.id";
/** Prevents one token kind from being accepted where the other is expected. */
const ACCESS_TOKEN_TYPE = "access";
const REFRESH_TOKEN_TYPE = "refresh";

export interface IssuedToken {
  token: string;
  expiresIn: number;
}

export interface IssuedRefreshToken {
  token: string;
  /** null when the token was issued without an expiry claim. */
  expiresIn: number | null;
  expiresAt: string | null;
}

export type TokenVerification =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "expired" | "invalid" };

export type RefreshTokenVerification =
  | { ok: true; userId: number; passwordFingerprint: string }
  | { ok: false; reason: "expired" | "invalid" };

/**
 * HS256 access token. `sub` carries the user id (JWT spec requires a string),
 * `username` is copied for convenience so /me can answer without a DB round trip.
 */
export function signAccessToken(user: AuthUser): IssuedToken {
  const token = jwt.sign({ username: user.username, typ: ACCESS_TOKEN_TYPE }, env.jwtSecret, {
    subject: String(user.id),
    issuer: ISSUER,
    expiresIn: env.jwtExpiresInSeconds,
  });

  return { token, expiresIn: env.jwtExpiresInSeconds };
}

/**
 * Stateless refresh token bound to the current password hash through `pwd`.
 * Changing the password therefore invalidates every previously issued refresh
 * token without any server-side storage.
 */
export function signRefreshToken(user: AuthUser, currentPasswordHash: string): IssuedRefreshToken {
  const expiresIn = env.jwtRefreshExpiresInSeconds;
  const options: SignOptions = { subject: String(user.id), issuer: ISSUER };
  if (expiresIn !== null) {
    options.expiresIn = expiresIn;
  }

  const token = jwt.sign(
    {
      typ: REFRESH_TOKEN_TYPE,
      pwd: passwordFingerprint(currentPasswordHash),
      // Makes every issued token unique (JWT claims are second-resolution, so
      // two issuances in the same second would otherwise be identical) and
      // gives a future revocation list something to key on.
      jti: randomUUID(),
    },
    env.jwtSecret,
    options,
  );

  const decoded = jwt.decode(token);
  const expiresAt =
    typeof decoded === "object" && decoded !== null && typeof decoded.exp === "number"
      ? new Date(decoded.exp * 1000).toISOString()
      : null;

  return { token, expiresIn, expiresAt };
}

export function verifyAccessToken(token: string): TokenVerification {
  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, env.jwtSecret, { issuer: ISSUER });
  } catch (error) {
    return { ok: false, reason: error instanceof jwt.TokenExpiredError ? "expired" : "invalid" };
  }

  if (typeof decoded === "string" || decoded.typ !== ACCESS_TOKEN_TYPE) {
    return { ok: false, reason: "invalid" };
  }

  const username = decoded.username;
  const subject = typeof decoded.sub === "string" ? decoded.sub : "";
  const id = Number.parseInt(subject, 10);

  if (typeof username !== "string" || username === "" || !Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, user: { id, username } };
}

/**
 * Checks signature, token type and expiry. The caller must still compare the
 * returned `passwordFingerprint` with the user's current password hash.
 */
export function verifyRefreshToken(token: string): RefreshTokenVerification {
  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, env.jwtSecret, { issuer: ISSUER });
  } catch (error) {
    return { ok: false, reason: error instanceof jwt.TokenExpiredError ? "expired" : "invalid" };
  }

  if (typeof decoded === "string" || decoded.typ !== REFRESH_TOKEN_TYPE) {
    return { ok: false, reason: "invalid" };
  }

  const subject = typeof decoded.sub === "string" ? decoded.sub : "";
  const userId = Number.parseInt(subject, 10);
  const fingerprint = decoded.pwd;

  if (!Number.isInteger(userId) || userId <= 0 || typeof fingerprint !== "string" || fingerprint === "") {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, userId, passwordFingerprint: fingerprint };
}
