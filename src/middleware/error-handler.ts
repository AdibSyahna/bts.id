import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

interface ErrorPayload {
  error: {
    message: string;
    details?: unknown;
    stack?: string;
  };
}

function hasStatus(value: unknown): value is { status: number; message?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "number"
  );
}

function hasErrorCode(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string"
  );
}

function statusFor(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status;
  }
  // express.json()/body-parser rejects malformed payloads with a status code.
  if (hasStatus(error)) {
    return error.status;
  }
  // Anything else raised by sqlite3 that reaches this point is a server-side problem,
  // except constraint violations, which are caused by the request payload.
  if (hasErrorCode(error) && error.code.startsWith("SQLITE_CONSTRAINT")) {
    return 409;
  }
  return 500;
}

export function notFoundHandler(req: Request, res: Response): void {
  const payload: ErrorPayload = {
    error: { message: `Route ${req.method} ${req.originalUrl} not found` },
  };
  res.status(404).json(payload);
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = statusFor(error);

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  const payload: ErrorPayload = { error: { message: "Internal server error" } };

  if (error instanceof HttpError) {
    payload.error.message = error.message;
    if (error.details !== undefined) {
      payload.error.details = error.details;
    }
  } else if (hasStatus(error) && status < 500) {
    payload.error.message = error.message ?? "Bad request";
  } else if (status === 409 && hasErrorCode(error)) {
    payload.error.message = "Request conflicts with the current state of the resource";
    payload.error.details = { code: error.code };
  }

  if (!env.isProduction && error instanceof Error && status >= 500) {
    payload.error.stack = error.stack;
  }

  res.status(status).json(payload);
}
