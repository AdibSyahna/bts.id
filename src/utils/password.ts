import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Password hashing on top of node's built-in scrypt: no extra native
 * dependency (bcrypt/argon2 would add another addon to build in Docker).
 *
 * Stored format: scrypt$N$r$p$<salt base64url>$<hash base64url>
 */
const ALGORITHM = "scrypt";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const MAX_ALLOWED_N = 1 << 17;
const MAX_ALLOWED_R = 16;
const MAX_ALLOWED_P = 4;
const FIXED_DUMMY_SALT = Buffer.alloc(SALT_LENGTH, 7);

const SCRYPT_COST: ScryptOptions = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEMORY };

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  cost: ScryptOptions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, cost, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function isAllowedCost(N: number, r: number, p: number): boolean {
  return (
    Number.isInteger(N) &&
    N >= 1024 &&
    N <= MAX_ALLOWED_N &&
    N % 2 === 0 &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= MAX_ALLOWED_R &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= MAX_ALLOWED_P
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, SCRYPT_COST);
  return [
    ALGORITHM,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return false;
  }

  const N = Number.parseInt(parts[1] ?? "", 10);
  const r = Number.parseInt(parts[2] ?? "", 10);
  const p = Number.parseInt(parts[3] ?? "", 10);
  if (!isAllowedCost(N, r, p)) {
    return false;
  }

  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const expected = Buffer.from(parts[5] ?? "", "base64url");
  if (salt.length !== SALT_LENGTH || expected.length === 0) {
    return false;
  }

  try {
    const derivedKey = await deriveKey(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
    return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}

/**
 * Spends roughly the same CPU time as a real verification so that unknown
 * usernames cannot be told apart from wrong passwords by response time.
 */
export async function equalizePasswordTiming(password: string): Promise<void> {
  try {
    await deriveKey(password, FIXED_DUMMY_SALT, KEY_LENGTH, SCRYPT_COST);
  } catch {
    // Timing equalization must never turn into a request failure.
  }
}

const FINGERPRINT_LENGTH = 32;

/**
 * One-way fingerprint of the stored password hash, keyed with the application
 * secret. It is embedded in refresh tokens so that every password change
 * invalidates them, without ever putting the password (or its stored hash) in a
 * token: the value is not reversible and cannot be recomputed from the database
 * alone without the secret.
 */
export function passwordFingerprint(storedHash: string): string {
  return createHmac("sha256", env.jwtSecret)
    .update(storedHash)
    .digest("base64url")
    .slice(0, FINGERPRINT_LENGTH);
}

/** Constant-time comparison of a token fingerprint against the current hash. */
export function fingerprintMatches(candidate: string, storedHash: string): boolean {
  const expected = Buffer.from(passwordFingerprint(storedHash), "utf8");
  const provided = Buffer.from(candidate, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
