import "dotenv/config";
import path from "node:path";

const DEFAULT_PORT = 3000;
const DEFAULT_DB_FILE = "data/app.db";
const IN_MEMORY_DB_FILE = ":memory:";
const DEV_JWT_SECRET = "dev-only-insecure-jwt-secret";
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 3600;
const DEFAULT_JWT_REFRESH_EXPIRES_IN_SECONDS = 30 * 86400;

function readPort(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

/** Accepts "3600", "30m", "12h", "7d" and falls back to the default when unreadable. */
function readDurationInSeconds(rawValue: string | undefined, fallback: number): number {
  const value = (rawValue ?? "").trim().toLowerCase();
  if (value === "") {
    return fallback;
  }
  const match = /^(\d+)(s|m|h|d)?$/.exec(value);
  if (match === null) {
    return fallback;
  }
  const amount = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    return fallback;
  }
  const unit = match[2] ?? "s";
  const multiplier = unit === "d" ? 86400 : unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return amount * multiplier;
}

/**
 * Refresh lifetime in seconds. "0", "none" or "never" returns null, meaning the
 * refresh token carries no expiry claim and lives until the password changes.
 */
function readRefreshLifetime(rawValue: string | undefined): number | null {
  const value = (rawValue ?? "").trim().toLowerCase();
  if (value === "0" || value === "none" || value === "never") {
    return null;
  }
  return readDurationInSeconds(value, DEFAULT_JWT_REFRESH_EXPIRES_IN_SECONDS);
}

function resolveDbFile(rawValue: string | undefined): string {
  const value = (rawValue ?? "").trim();
  if (value === "" || value === DEFAULT_DB_FILE) {
    return path.resolve(process.cwd(), DEFAULT_DB_FILE);
  }
  if (value === IN_MEMORY_DB_FILE || path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(process.cwd(), value);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = (process.env.JWT_SECRET ?? "").trim() || DEV_JWT_SECRET;

export const env = {
  nodeEnv,
  isTest: nodeEnv === "test",
  isProduction: nodeEnv === "production",
  port: readPort(process.env.PORT),
  dbFile: resolveDbFile(process.env.DB_FILE),
  jwtSecret,
  jwtExpiresInSeconds: readDurationInSeconds(process.env.JWT_EXPIRES_IN, DEFAULT_JWT_EXPIRES_IN_SECONDS),
  jwtRefreshExpiresInSeconds: readRefreshLifetime(process.env.JWT_REFRESH_EXPIRES_IN),
  usesDevJwtSecret: jwtSecret === DEV_JWT_SECRET,
} as const;

export type Env = typeof env;

/**
 * Fails fast instead of deploying development credentials to production.
 */
export function assertSafeConfiguration(): void {
  if (env.isProduction && env.usesDevJwtSecret) {
    throw new Error("JWT_SECRET must be set to a strong, unique value when NODE_ENV=production");
  }
}
