import { HttpError } from "./http-error.js";

export function assertPlainObject(value: unknown, label = "request body"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw HttpError.badRequest(`Invalid ${label}: expected a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function parseId(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw HttpError.badRequest(`Invalid id "${rawValue ?? ""}": expected a positive integer`);
  }
  return parsed;
}

export function parseOrder(rawValue: string | undefined): "asc" | "desc" {
  if (rawValue === undefined) {
    return "desc";
  }
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }
  throw HttpError.badRequest(`Invalid order "${rawValue}": expected "asc" or "desc"`);
}

export function parseBoolean(value: string, label: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  throw HttpError.badRequest(`Invalid ${label} "${value}": expected "true" or "false"`);
}

export function readRequiredString(
  source: Record<string, unknown>,
  field: string,
  maxLength = 200,
): string {
  const value = source[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.badRequest(`Field "${field}" is required and must be a non-empty string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw HttpError.badRequest(`Field "${field}" must be at most ${maxLength} characters long`, { field });
  }
  return trimmed;
}

export function readOptionalString(
  source: Record<string, unknown>,
  field: string,
  maxLength = 2000,
): string | null | undefined {
  if (!(field in source)) {
    return undefined;
  }
  const value = source[field];
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw HttpError.badRequest(`Field "${field}" must be a string or null`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw HttpError.badRequest(`Field "${field}" must be at most ${maxLength} characters long`, { field });
  }
  return trimmed;
}

export function readOptionalBoolean(
  source: Record<string, unknown>,
  field: string,
): boolean | undefined {
  if (!(field in source)) {
    return undefined;
  }
  const value = source[field];
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "false") {
    return value === "true";
  }
  throw HttpError.badRequest(`Field "${field}" must be a boolean`, { field });
}

export function assertKnownFields(
  source: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const unknownFields = Object.keys(source).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw HttpError.badRequest(`Unknown field(s): ${unknownFields.join(", ")}`, {
      unknownFields,
    });
  }
}
