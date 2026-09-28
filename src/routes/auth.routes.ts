import { Router } from "express";
import * as userRepository from "../repositories/user.repository.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { HttpError } from "../utils/http-error.js";
import {
  equalizePasswordTiming,
  fingerprintMatches,
  hashPassword,
  verifyPassword,
} from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import type { AuthResult, User } from "../types/user.js";
import { toAuthUser, toUser } from "../types/user.js";
import { assertKnownFields, assertPlainObject, readRequiredString } from "../utils/validation.js";

const AUTH_FIELDS = ["username", "password"] as const;
const REGISTER_FIELDS = ["username", "password", "password_confirmation"] as const;
const REFRESH_FIELDS = ["refreshToken"] as const;
const PASSWORD_CHANGE_FIELDS = ["currentPassword", "newPassword"] as const;
const TOKEN_MAX_LENGTH = 4096;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export const authRouter = Router();

function readUsername(body: Record<string, unknown>): string {
  const username = readRequiredString(body, "username", {
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAX_LENGTH,
  });
  if (!USERNAME_PATTERN.test(username)) {
    throw HttpError.badRequest(
      'Field "username" may only contain letters, digits, dot, underscore and dash',
      { field: "username" },
    );
  }
  return username;
}

/**
 * Login/refresh/password-change payload: a short lived access token plus a
 * refresh token bound to the user's current password hash. The fingerprint
 * never exposes the password or its stored hash.
 */
function buildAuthResult(user: User, currentPasswordHash: string): AuthResult {
  const access = signAccessToken(toAuthUser(user));
  const refresh = signRefreshToken(toAuthUser(user), currentPasswordHash);

  return {
    authentication_token: access.token,
    refresh_token: refresh.token,
  };
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = assertPlainObject(req.body);
    assertKnownFields(body, REGISTER_FIELDS);

    const username = readUsername(body);
    const password = readRequiredString(body, "password", {
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    });

    if (await userRepository.usernameExists(username)) {
      throw HttpError.conflict(`Username "${username}" is already taken`, { field: "username" });
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({ username, passwordHash });

    res.status(201).json({ data: user });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = assertPlainObject(req.body);
    assertKnownFields(body, AUTH_FIELDS);

    const username = readRequiredString(body, "username", { maxLength: USERNAME_MAX_LENGTH });
    const password = readRequiredString(body, "password", { maxLength: PASSWORD_MAX_LENGTH });

    const row = await userRepository.findByUsername(username);
    if (row === null) {
      // Spend a comparable amount of CPU before answering so that existing
      // usernames cannot be discovered by response time.
      await equalizePasswordTiming(password);
      throw HttpError.unauthorized("Invalid username or password");
    }

    if (!(await verifyPassword(password, row.password))) {
      throw HttpError.unauthorized("Invalid username or password");
    }

    const user = toUser(row);
    res.json({ data: buildAuthResult(user, row.password) });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = assertPlainObject(req.body);
    assertKnownFields(body, REFRESH_FIELDS);
    const refreshToken = readRequiredString(body, "refreshToken", { maxLength: TOKEN_MAX_LENGTH });

    const verification = verifyRefreshToken(refreshToken);
    if (!verification.ok) {
      throw HttpError.unauthorized(
        verification.reason === "expired" ? "Refresh token has expired" : "Refresh token is invalid",
      );
    }

    const row = await userRepository.findByIdWithPassword(verification.userId);
    if (row === null) {
      throw HttpError.unauthorized("Refresh token is invalid");
    }

    // Valid only while it matches the current password hash, so a password
    // change invalidates every refresh token issued before it.
    if (!fingerprintMatches(verification.passwordFingerprint, row.password)) {
      throw HttpError.unauthorized("Refresh token was invalidated by a password change");
    }

    // Sliding session: a successful refresh starts a fresh refresh window.
    res.json({ data: buildAuthResult(toUser(row), row.password) });
  }),
);

authRouter.post(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authenticated = currentUser(req);
    const body = assertPlainObject(req.body);
    assertKnownFields(body, PASSWORD_CHANGE_FIELDS);

    const currentPassword = readRequiredString(body, "currentPassword", {
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    });
    const newPassword = readRequiredString(body, "newPassword", {
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    });

    const row = await userRepository.findByIdWithPassword(authenticated.id);
    if (row === null) {
      throw HttpError.unauthorized("This account no longer exists");
    }

    if (!(await verifyPassword(currentPassword, row.password))) {
      throw HttpError.unauthorized("Current password is incorrect");
    }
    if (await verifyPassword(newPassword, row.password)) {
      throw HttpError.badRequest("New password must be different from the current password", {
        field: "newPassword",
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(row.id, passwordHash);

    const user = await userRepository.findById(row.id);
    if (user === null) {
      throw new HttpError(500, "Password was updated but the account could not be read back");
    }

    // The caller keeps a working session; every other device holds refresh
    // tokens whose fingerprint no longer matches and therefore stops working.
    res.json({ data: buildAuthResult(user, passwordHash) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authenticated = currentUser(req);
    const user = await userRepository.findById(authenticated.id);
    if (user === null) {
      throw HttpError.unauthorized("This account no longer exists");
    }
    res.json({ data: user });
  }),
);
