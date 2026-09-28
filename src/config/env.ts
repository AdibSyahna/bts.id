import "dotenv/config";
import path from "node:path";

const DEFAULT_PORT = 3000;
const DEFAULT_DB_FILE = "data/app.db";
const IN_MEMORY_DB_FILE = ":memory:";

function readPort(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
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

export const env = {
  nodeEnv,
  isTest: nodeEnv === "test",
  isProduction: nodeEnv === "production",
  port: readPort(process.env.PORT),
  dbFile: resolveDbFile(process.env.DB_FILE),
} as const;

export type Env = typeof env;
